import { useEffect, useRef, useState } from 'react';
import { LIMITS } from '@shared/limits.js';
import { ApiError, api, errorMessage } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { useI18n } from '../../i18n/index.jsx';
import { UnreadableImageError, preparePhoto } from '../../lib/image.js';
import { uploadFile } from '../../lib/upload.js';
import { readVideo } from '../../lib/video.js';
import { useFetch } from '../../state.jsx';
import { SubmitButton } from '../Controls.jsx';
import Field from '../Field.jsx';
import Icon from '../Icon.jsx';
import { formatDuration, previewOf } from '../Memories.jsx';
import { Avatar } from '../People.jsx';
import { useToast } from '../Toast.jsx';
import ShareFields from './ShareFields.jsx';

const MB = 1024 * 1024;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];
// Not in ACCEPT on purpose: then the iPhone photo picker converts HEIC photos to JPEG for us.
// A HEIC file can still arrive (Files app, drag & drop on a Mac): Safari decodes it and
// preparePhoto() re-encodes it as JPEG; browsers that cannot decode it show a clear error.
const HEIC_TYPES = ['image/heic', 'image/heif'];
const ACCEPT = [...IMAGE_TYPES, ...VIDEO_TYPES, '.mov', '.mp4', '.m4v', '.webm'].join(',');

/** What the browser says the file is — the server checks the actual bytes again. */
function kindOf(file) {
  if (IMAGE_TYPES.includes(file.type) || HEIC_TYPES.includes(file.type) || /\.(heic|heif)$/i.test(file.name)) return 'image';
  if (VIDEO_TYPES.includes(file.type) || /\.(mp4|m4v|mov|webm)$/i.test(file.name)) return 'video';
  return null;
}

function formatSize(bytes) {
  if (bytes < MB) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / MB).toFixed(bytes < 10 * MB ? 1 : 0)} MB`;
}

const daysIn = (year, month) => new Date(Date.UTC(Number(year) || 2000, Number(month), 0)).getUTCDate();
let nextKey = 1;

/**
 * Create or edit a memory: text fields + any number of photos and videos (up to 20) + who may see it.
 * Saving happens in steps the user can watch: the memory itself (JSON), who it is shared with,
 * removed files, then each new file with its own progress bar, then the chosen order (first = cover).
 */
export default function MemoryForm({ memory, onSaved, onCancel, onBusyChange }) {
  const { t, monthName } = useI18n();
  const { limits } = useAuth();
  const toast = useToast();
  const thisYear = new Date().getFullYear();
  const people = useFetch('/api/people').data?.people ?? [];
  // Your circle (+ who already sees this memory, when editing) for the "share this memory" section.
  const shareData = useFetch(memory ? `/api/memories/${memory.id}/shares` : '/api/sharing/circle').data;

  const [values, setValues] = useState(() => ({
    title: memory?.title ?? '',
    place: memory?.place ?? '',
    story: memory?.story ?? '',
    year: String(memory?.year ?? thisYear),
    month: memory?.month ? String(memory.month) : '',
    day: memory?.day ? String(memory.day) : '',
    peopleIds: memory?.people.map((person) => person.id) ?? [],
  }));
  const [items, setItems] = useState(() =>
    (memory?.files ?? []).map((file) => ({
      key: `f${file.id}`,
      id: file.id,
      kind: file.kind,
      name: file.kind === 'video' ? t('gallery.video') : t('gallery.photo'),
      size: null,
      duration: file.duration,
      thumb: previewOf(file),
      status: 'done',
      progress: 1,
    })),
  );
  const [removedIds, setRemovedIds] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState(null);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState(null); // after a partial failure: { memory, failed }
  const [shareIds, setShareIds] = useState(null); // ticked people (null until the circle has loaded)
  const [invites, setInvites] = useState([]); // invite links created in this form

  const fileInput = useRef(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const objectUrls = useRef([]);
  const prepareQueue = useRef(Promise.resolve());
  const savedId = useRef(memory?.id ?? null);
  const abort = useRef(null);
  const sharedBefore = useRef([]); // who could see the memory when the form opened (or at the last save)
  const invitesRef = useRef(invites);
  invitesRef.current = invites;

  useEffect(() => {
    if (!shareData || shareIds !== null) return;
    sharedBefore.current = (shareData.recipients ?? []).map((person) => person.id);
    setShareIds(sharedBefore.current);
  }, [shareData, shareIds]);

  // Free every temporary preview URL when the form closes.
  useEffect(() => () => objectUrls.current.forEach((url) => URL.revokeObjectURL(url)), []);
  useEffect(() => onBusyChange?.(saving), [saving, onBusyChange]);

  const objectUrl = (blob) => {
    const url = URL.createObjectURL(blob);
    objectUrls.current.push(url);
    return url;
  };
  const patch = (key, changes) => setItems((list) => list.map((item) => (item.key === key ? { ...item, ...changes } : item)));
  const update = (name, value) => setValues((current) => ({ ...current, [name]: value }));

  function changeDate(name, value) {
    setValues((current) => {
      const next = { ...current, [name]: value };
      if (!next.month) next.day = '';
      else if (next.day && Number(next.day) > daysIn(next.year, next.month)) next.day = '';
      return next;
    });
  }

  function togglePerson(id) {
    setValues((current) => ({
      ...current,
      peopleIds: current.peopleIds.includes(id) ? current.peopleIds.filter((x) => x !== id) : [...current.peopleIds, id],
    }));
  }

  function toggleShare(id) {
    setShareIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  // ---------- choosing files ----------

  async function prepare(key, file, kind) {
    try {
      if (kind === 'image') {
        const prepared = await preparePhoto(file);
        if (prepared.file.size > limits.maxImageMb * MB) {
          patch(key, { status: 'error', error: t('upload.errors.imageTooLarge', { max: limits.maxImageMb }) });
          return;
        }
        patch(key, { status: 'ready', prepared, size: prepared.file.size, thumb: objectUrl(prepared.preview) });
      } else {
        const info = await readVideo(file);
        patch(key, {
          status: 'ready',
          prepared: { file, preview: info.poster, width: info.width, height: info.height, duration: info.duration },
          duration: info.duration,
          thumb: info.poster ? objectUrl(info.poster) : null,
        });
      }
    } catch (err) {
      patch(key, { status: 'error', error: err instanceof UnreadableImageError ? t('memory.unreadable') : t('upload.errors.read') });
    }
  }

  function addFiles(fileList) {
    setNotice(null);
    const files = [...(fileList ?? [])];
    const room = LIMITS.maxFilesPerMemory - itemsRef.current.length;
    if (files.length > room) setNotice(t('upload.errors.tooMany', { max: LIMITS.maxFilesPerMemory }));
    const added = [];
    for (const file of files.slice(0, Math.max(0, room))) {
      const kind = kindOf(file);
      const key = `n${nextKey++}`;
      const item = { key, kind: kind ?? 'image', name: file.name, size: file.size, status: 'preparing', progress: 0 };
      if (!kind) {
        added.push({ ...item, status: 'error', error: t('upload.errors.type') });
      } else if (kind === 'video' && file.size > limits.maxVideoMb * MB) {
        added.push({ ...item, status: 'error', error: t('upload.errors.videoTooLarge', { max: limits.maxVideoMb }) });
      } else {
        added.push(item);
        // One at a time: decoding several 48-megapixel photos at once can exhaust a phone's memory.
        prepareQueue.current = prepareQueue.current.then(() => prepare(key, file, kind));
      }
    }
    setItems((list) => [...list, ...added]);
    if (fileInput.current) fileInput.current.value = '';
  }

  function removeItem(item) {
    if (item.id) setRemovedIds((ids) => [...ids, item.id]);
    setItems((list) => list.filter((x) => x.key !== item.key));
  }

  function move(index, to) {
    setItems((list) => {
      const next = [...list];
      const [item] = next.splice(index, 1);
      next.splice(to, 0, item);
      return next;
    });
  }

  // ---------- saving ----------

  function uploadMessage(err, kind) {
    const field = err instanceof ApiError ? err.fields?.file : null;
    if (field?.code === 'FILE_TYPE') return t('upload.errors.type');
    if (field?.code === 'FILE_TOO_LARGE') {
      return t(kind === 'video' ? 'upload.errors.videoTooLarge' : 'upload.errors.imageTooLarge', { max: field.max });
    }
    if (field?.code === 'TOO_MANY_FILES') return t('upload.errors.tooMany', { max: field.max });
    if (field?.code === 'STORAGE_FULL') return t('upload.errors.storageFull');
    return errorMessage(t, err);
  }

  /**
   * Who may see the memory: the ticked people (only if that changed) and the invite links created
   * in this form, which get the memory attached now that it exists. A failure here does not undo
   * the save — the owner can fix sharing from the memory page.
   */
  async function applySharing(memoryId) {
    let failed = false;
    const ids = shareIds ?? [];
    const before = sharedBefore.current;
    if (ids.length !== before.length || ids.some((id) => !before.includes(id))) {
      try {
        await api.put(`/api/memories/${memoryId}/shares`, { userIds: ids });
        sharedBefore.current = ids;
      } catch {
        failed = true;
      }
    }
    const attached = [];
    for (const invite of invitesRef.current.filter((x) => !x.attached)) {
      try {
        await api.put(`/api/invites/${invite.id}/memory`, { memoryId });
        attached.push(invite.id);
      } catch {
        failed = true;
      }
    }
    if (attached.length) {
      const mark = (list) => list.map((x) => (attached.includes(x.id) ? { ...x, attached: true } : x));
      invitesRef.current = mark(invitesRef.current);
      setInvites(mark);
    }
    if (failed) toast(t('memoryShare.failed'), 'error');
  }

  /** Uploads every file still waiting → { memory, failed }. */
  async function uploadWaiting(memoryId, latest) {
    abort.current = new AbortController();
    let failed = 0;
    for (const item of itemsRef.current) {
      if (abort.current.signal.aborted) break;
      if (item.id || !item.prepared) continue;
      patch(item.key, { status: 'uploading', progress: 0, error: null });
      try {
        const data = await uploadFile(memoryId, item.prepared, {
          signal: abort.current.signal,
          onProgress: (progress) => patch(item.key, { progress }),
        });
        const known = new Set(itemsRef.current.map((x) => x.id).filter(Boolean));
        const added = data.memory.files.find((file) => !known.has(file.id));
        patch(item.key, { status: 'done', progress: 1, id: added?.id });
        itemsRef.current = itemsRef.current.map((x) => (x.key === item.key ? { ...x, id: added?.id } : x));
        latest = data.memory;
      } catch (err) {
        if (err.name === 'AbortError') {
          patch(item.key, { status: 'ready', progress: 0 });
          break;
        }
        failed += 1;
        patch(item.key, { status: 'error', error: uploadMessage(err, item.kind) });
      }
    }
    return { memory: latest, failed };
  }

  /** Makes the server order match the list (the first file is the cover). */
  async function applyOrder(memoryId, latest) {
    const ids = itemsRef.current.map((item) => item.id).filter(Boolean);
    const current = latest.files.map((file) => file.id);
    if (ids.length < 2 || ids.join() === current.join()) return latest;
    return (await api.put(`/api/memories/${memoryId}/files/order`, { ids })).memory;
  }

  async function finishFiles(memoryId, latest) {
    const result = await uploadWaiting(memoryId, latest);
    let final = result.memory;
    try {
      final = await applyOrder(memoryId, final);
    } catch {
      // the order is cosmetic; the files are saved
    }
    if (result.failed || itemsRef.current.some((item) => !item.id && item.prepared)) {
      setPending({ memory: final, failed: result.failed });
      return;
    }
    onSaved(final);
  }

  async function submit(event) {
    event.preventDefault();
    if (items.some((item) => item.status === 'preparing')) return;
    setSaving(true);
    setErrors({});
    setFormError(null);
    setPending(null);

    let saved;
    try {
      const body = { ...values, peopleIds: values.peopleIds };
      saved = savedId.current
        ? (await api.put(`/api/memories/${savedId.current}`, body)).memory
        : (await api.post('/api/memories', body)).memory;
      savedId.current = saved.id;
    } catch (err) {
      if (err instanceof ApiError && err.code === 'VALIDATION') setErrors(err.fields);
      else setFormError(errorMessage(t, err));
      setSaving(false);
      return;
    }

    await applySharing(saved.id);

    for (const id of removedIds) {
      try {
        saved = (await api.del(`/api/memories/${saved.id}/files/${id}`)).memory;
      } catch {
        // already gone
      }
    }
    setRemovedIds([]);

    try {
      await finishFiles(saved.id, saved);
    } finally {
      setSaving(false);
    }
  }

  async function retryUploads() {
    setSaving(true);
    setPending(null);
    setItems((list) => list.map((item) => (item.status === 'error' && item.prepared ? { ...item, status: 'ready' } : item)));
    itemsRef.current = itemsRef.current.map((item) => (item.status === 'error' && item.prepared ? { ...item, status: 'ready' } : item));
    try {
      await finishFiles(savedId.current, pending.memory);
    } finally {
      setSaving(false);
    }
  }

  const preparing = items.some((item) => item.status === 'preparing');
  const uploading = items.filter((item) => item.status === 'uploading' || (saving && !item.id && item.prepared));
  const doneCount = items.filter((item) => item.id).length;
  const maxDay = values.month ? daysIn(values.year, values.month) : 31;

  return (
    <form className="form" onSubmit={submit} noValidate>
      {formError && (
        <div className="form-error" role="alert">
          {formError}
        </div>
      )}

      <div className="memory-form">
        {/* ---- Photos & videos ---- */}
        <div>
          <span className="field-label" style={{ marginBottom: 8 }}>
            <span>{t('upload.label')}</span>
            <span className="optional">{t('common.optional')}</span>
          </span>
          <div
            className={`dropzone${dragging ? ' dragging' : ''}`}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              if (!saving) addFiles(event.dataTransfer.files);
            }}
          >
            <span style={{ display: 'flex', gap: 10 }}>
              <Icon name="image" size={26} />
              <Icon name="video" size={26} />
            </span>
            <span>{t('upload.drop')}</span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => fileInput.current?.click()} disabled={saving}>
              <Icon name="upload" size={14} />
              {t('upload.choose')}
            </button>
            <span className="dropzone-hint">
              {t('upload.hint', { image: limits.maxImageMb, video: limits.maxVideoMb, max: LIMITS.maxFilesPerMemory })}
            </span>
          </div>
          <input ref={fileInput} type="file" accept={ACCEPT} multiple hidden onChange={(event) => addFiles(event.target.files)} />
          {notice && (
            <p className="field-error" role="alert" style={{ marginTop: 8 }}>
              {notice}
            </p>
          )}

          {items.length > 0 && (
            <ol className="media-items" aria-label={t('upload.label')}>
              {items.map((item, index) => (
                <li key={item.key} className={`media-item${item.status === 'error' ? ' is-error' : ''}`}>
                  <div className="media-thumb">
                    {item.thumb && <img src={item.thumb} alt="" />}
                    <span className="kind">
                      <Icon name={item.kind === 'video' ? 'play' : 'image'} size={10} strokeWidth={2} />
                    </span>
                  </div>
                  <div className="media-info">
                    <span className="media-name">{item.name}</span>
                    <span className="media-sub">
                      {index === 0 && item.status !== 'error' && <span className="cover-flag">{t('upload.cover')}</span>}
                      {item.size ? <span>{formatSize(item.size)}</span> : null}
                      {item.duration ? <span>{formatDuration(item.duration)}</span> : null}
                      {item.status === 'preparing' && <span>{t('upload.preparing')}</span>}
                      {item.status === 'uploading' && <span>{Math.round(item.progress * 100)}%</span>}
                      {item.status === 'error' && <span className="err">{item.error}</span>}
                      {item.status === 'ready' && <span>{t('upload.waiting')}</span>}
                    </span>
                    {(item.status === 'uploading' || item.status === 'preparing') && (
                      <div className="progress" aria-hidden="true">
                        <span style={{ width: `${item.status === 'preparing' ? 12 : Math.max(4, item.progress * 100)}%` }} />
                      </div>
                    )}
                  </div>
                  <div className="media-actions">
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => move(index, 0)}
                      disabled={index === 0 || saving}
                      title={t('upload.makeCover')}
                      aria-label={t('upload.makeCover')}
                    >
                      <Icon name="star" size={15} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => move(index, index - 1)}
                      disabled={index === 0 || saving}
                      title={t('upload.moveUp')}
                      aria-label={t('upload.moveUp')}
                    >
                      <Icon name="arrowUp" size={15} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => removeItem(item)}
                      disabled={saving}
                      title={t('upload.remove')}
                      aria-label={t('upload.remove')}
                    >
                      <Icon name="close" size={15} />
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          )}
          <p className="field-hint" style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            <Icon name="shield" size={14} />
            <span>{t('upload.privacy')}</span>
          </p>
        </div>

        {/* ---- Words ---- */}
        <div className="form">
          <Field label={t('memory.title')} error={errors.title}>
            {(props) => (
              <input
                {...props}
                className="input"
                value={values.title}
                onChange={(event) => update('title', event.target.value)}
                placeholder={t('memory.titlePlaceholder')}
                maxLength={LIMITS.memoryTitle}
                data-autofocus
                required
              />
            )}
          </Field>

          <div className="field">
            <span className="field-label">
              <span>{t('memory.when')}</span>
            </span>
            <div className="form-row">
              <Field label={t('memory.year')} error={errors.year}>
                {(props) => (
                  <input
                    {...props}
                    className="input"
                    type="number"
                    inputMode="numeric"
                    min={LIMITS.yearMin}
                    max={thisYear}
                    value={values.year}
                    onChange={(event) => changeDate('year', event.target.value)}
                    required
                  />
                )}
              </Field>
              <Field label={t('memory.month')} error={errors.month}>
                {(props) => (
                  <select {...props} className="select" value={values.month} onChange={(event) => changeDate('month', event.target.value)}>
                    <option value="">{t('memory.unknown')}</option>
                    {Array.from({ length: 12 }, (_, i) => (
                      <option key={i + 1} value={i + 1}>
                        {monthName(i + 1)}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              <Field label={t('memory.day')} error={errors.day}>
                {(props) => (
                  <select
                    {...props}
                    className="select"
                    value={values.day}
                    disabled={!values.month}
                    onChange={(event) => changeDate('day', event.target.value)}
                  >
                    <option value="">{t('memory.unknown')}</option>
                    {Array.from({ length: maxDay }, (_, i) => (
                      <option key={i + 1} value={i + 1}>
                        {i + 1}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
            </div>
            <span className="field-hint">{t('memory.whenHint')}</span>
          </div>

          <Field label={t('memory.place')} error={errors.place} optional>
            {(props) => (
              <input
                {...props}
                className="input"
                value={values.place}
                onChange={(event) => update('place', event.target.value)}
                placeholder={t('memory.placePlaceholder')}
                maxLength={LIMITS.memoryPlace}
              />
            )}
          </Field>

          <Field label={t('memory.story')} error={errors.story} optional>
            {(props) => (
              <textarea
                {...props}
                className="textarea"
                rows={5}
                value={values.story}
                onChange={(event) => update('story', event.target.value)}
                placeholder={t('memory.storyPlaceholder')}
                maxLength={LIMITS.memoryStory}
              />
            )}
          </Field>

          <div className="field">
            <span className="field-label">
              <span>{t('memory.people')}</span>
              <span className="optional">{t('common.optional')}</span>
            </span>
            {people.length > 0 ? (
              <div className="chips">
                {people.map((person) => (
                  <button
                    key={person.id}
                    type="button"
                    className="chip"
                    aria-pressed={values.peopleIds.includes(person.id)}
                    onClick={() => togglePerson(person.id)}
                  >
                    <Avatar name={person.name} color={person.color} />
                    {person.name}
                  </button>
                ))}
              </div>
            ) : (
              <span className="field-hint">{t('memory.peopleEmpty')}</span>
            )}
          </div>
        </div>
      </div>

      {/* ---- Who may see it ---- */}
      <ShareFields
        circle={shareData ? shareData.circle : null}
        selected={shareIds ?? []}
        onToggle={toggleShare}
        invites={invites}
        onInvite={(invite) => setInvites((list) => [...list, invite])}
        memoryId={savedId.current}
        disabled={saving || shareIds === null}
      />

      {pending && (
        <div className="form-error" role="alert" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <span style={{ flex: 1 }}>{t('upload.someFailed', { count: pending.failed || 1 })}</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={retryUploads}>
            {t('common.retry')}
          </button>
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => onSaved(pending.memory)}>
            {t('upload.finishAnyway')}
          </button>
        </div>
      )}

      <div className="form-actions" style={{ alignItems: 'center' }}>
        {saving && uploading.length > 0 && (
          <span className="upload-summary" style={{ marginRight: 'auto' }}>
            <span className="spinner" />
            {t('upload.progress', { done: doneCount, total: items.filter((item) => item.id || item.prepared).length })}
          </span>
        )}
        {saving && uploading.length > 0 ? (
          <button type="button" className="btn btn-quiet" onClick={() => abort.current?.abort()}>
            {t('upload.stop')}
          </button>
        ) : (
          <button type="button" className="btn btn-quiet" onClick={onCancel} disabled={saving}>
            {t('common.cancel')}
          </button>
        )}
        <SubmitButton busy={saving} disabled={preparing || Boolean(pending)} busyLabel={t('common.saving')}>
          {preparing ? t('upload.preparing') : t('memory.save')}
        </SubmitButton>
      </div>
    </form>
  );
}
