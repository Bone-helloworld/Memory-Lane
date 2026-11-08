import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { api } from '../api.js';
import CardStudio from '../components/CardStudio.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import { Segmented } from '../components/Controls.jsx';
import Icon from '../components/Icon.jsx';
import { previewOf } from '../components/Memories.jsx';
import Modal from '../components/Modal.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { EmptyState, ErrorState, Skeleton } from '../components/States.jsx';
import { useToast } from '../components/Toast.jsx';
import { useI18n } from '../i18n/index.jsx';
import { ARTIFACT_ICONS } from '../lib/artifacts.js';
import { CARD_KINDS, cardFileName } from '../lib/cards.js';
import { useData, useFetch, usePageTitle } from '../state.jsx';

const number = (n) => String(n).padStart(3, '0');

/**
 * "Kỷ vật" (Artifacts) — the keepsake cards made from your own memories (postcards, stamps, photo
 * cards) and kept here, catalogued like a small family museum: each one numbered in the order it was
 * kept ("No. 007"). A card is made in the card studio of a memory ("Tạo thẻ kỷ niệm" → "Lưu vào Kỷ
 * vật"), or from here: pick a memory, make the card.
 * ?open=ID opens one (links from a memory page, from search) · ?new=1 opens the memory picker.
 */
export default function Artifacts() {
  const { t } = useI18n();
  const { refresh } = useData();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const kind = CARD_KINDS.includes(params.get('kind')) ? params.get('kind') : '';
  // Always the whole list, filtered here, so the catalogue numbers never change with the filter.
  const { data, error, retry } = useFetch('/api/artifacts');
  const [viewing, setViewing] = useState(null); // { artifact, number }
  const [picking, setPicking] = useState(false); // choosing the memory a new card is made from
  const [studioFor, setStudioFor] = useState(null); // the memory whose card studio is open
  const [justKept, setJustKept] = useState(null); // id of the card just kept: opened once the list reloads
  const [deleting, setDeleting] = useState(null);
  usePageTitle(t('artifacts.title'));

  const all = data?.artifacts;
  const numbered = useMemo(() => all?.map((artifact, index) => ({ artifact, number: number(index + 1) })), [all]);
  const shown = numbered?.filter(({ artifact }) => !kind || artifact.kind === kind);

  useEffect(() => {
    if (params.get('new') === '1') {
      setPicking(true);
      setParams({}, { replace: true });
    }
    const open = Number(params.get('open'));
    if (open && numbered) {
      const found = numbered.find(({ artifact }) => artifact.id === open);
      if (found) setViewing(found);
      setParams(kind ? { kind } : {}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, numbered]);

  // A card was just kept from the studio: show it, with its catalogue number, as soon as the list has it.
  useEffect(() => {
    const found = justKept && numbered?.find(({ artifact }) => artifact.id === justKept);
    if (found) {
      setViewing(found);
      setJustKept(null);
    }
  }, [justKept, numbered]);

  function onKept(artifact) {
    setStudioFor(null);
    setJustKept(artifact.id);
    refresh();
  }

  async function remove() {
    await api.del(`/api/artifacts/${deleting.id}`);
    setDeleting(null);
    setViewing(null);
    toast(t('artifacts.deleted'));
    refresh();
  }

  const newCard = (
    <button type="button" className="btn btn-primary" onClick={() => setPicking(true)}>
      <Icon name="plus" size={15} />
      {t('artifacts.add')}
    </button>
  );

  return (
    <>
      <PageHeader
        kicker={t('artifacts.eyebrow')}
        title={t('artifacts.title')}
        subtitle={all ? t('artifacts.count', { count: all.length }) : ' '}
        actions={newCard}
      />

      <div className="toolbar">
        <p className="lede">{t('artifacts.lede')}</p>
        <Segmented
          label={t('artifacts.title')}
          value={kind}
          onChange={(value) => setParams(value ? { kind: value } : {})}
          options={[
            { value: '', label: t('artifacts.filter.all') },
            ...CARD_KINDS.map((value) => ({ value, label: t(`cards.kind.${value}`), icon: ARTIFACT_ICONS[value] })),
          ]}
        />
      </div>

      {error && <ErrorState error={error} onRetry={retry} />}
      {!all && !error && (
        <div className="artifacts">
          <Skeleton height={280} />
          <Skeleton height={280} />
          <Skeleton height={280} />
        </div>
      )}
      {all?.length === 0 && (
        <EmptyState
          art="print"
          title={t('artifacts.emptyTitle')}
          body={t('artifacts.emptyBody')}
          action={
            <button type="button" className="btn btn-primary" onClick={() => setPicking(true)}>
              {t('artifacts.emptyCta')}
            </button>
          }
        />
      )}
      {shown?.length > 0 && (
        <div className="artifacts">
          {shown.map((entry) => (
            <ArtifactCard key={entry.artifact.id} {...entry} onOpen={() => setViewing(entry)} />
          ))}
        </div>
      )}

      <Modal
        open={Boolean(viewing)}
        onClose={() => setViewing(null)}
        title={viewing?.artifact.title ?? ''}
        kicker={viewing ? t('artifacts.number', { n: viewing.number }) : ''}
        wide
      >
        {viewing && (
          <ArtifactView
            artifact={viewing.artifact}
            onDelete={() => setDeleting(viewing.artifact)}
            onClose={() => setViewing(null)}
          />
        )}
      </Modal>

      <Modal open={picking} onClose={() => setPicking(false)} title={t('artifacts.pick.title')} kicker={t('artifacts.pick.kicker')}>
        <MemoryPicker
          onPick={(memory) => {
            setPicking(false);
            setStudioFor(memory);
          }}
        />
      </Modal>

      {studioFor && <CardStudio memory={studioFor} open canKeep onKept={onKept} onClose={() => setStudioFor(null)} />}

      <ConfirmDialog
        open={Boolean(deleting)}
        title={t('artifacts.confirmTitle', { title: deleting?.title ?? '' })}
        body={t('artifacts.confirmBody')}
        onConfirm={remove}
        onClose={() => setDeleting(null)}
      />
    </>
  );
}

/** One catalogue card: the card itself (a print in the notebook, a dark frame in the darkroom) over a museum label. */
function ArtifactCard({ artifact, number: no, onOpen }) {
  const { t } = useI18n();
  return (
    <button type="button" className={`artifact-card kind-${artifact.kind}`} onClick={onOpen}>
      <span className="artifact-photo">
        <img className="private" src={artifact.previewUrl} alt="" loading="lazy" decoding="async" />
      </span>
      <span className="artifact-label">
        <span className="artifact-no">{t('artifacts.number', { n: no })}</span>
        <strong className="artifact-title">{artifact.title}</strong>
        <span className="artifact-meta">{[t(`cards.kind.${artifact.kind}`), artifact.memory.year].join(' · ')}</span>
        <span className="artifact-origin">{t('artifacts.fromMemory', { title: artifact.memory.title })}</span>
      </span>
    </button>
  );
}

/** The full entry: the card large, what it is, the memory it was made from; download, share, delete. */
function ArtifactView({ artifact, onDelete, onClose }) {
  const { t, memoryDate, timestamp } = useI18n();
  const canShare = typeof navigator.canShare === 'function';

  async function share() {
    try {
      const blob = await (await fetch(artifact.imageUrl)).blob();
      const file = new File([blob], cardFileName(artifact.title, artifact.kind), { type: blob.type });
      if (navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: artifact.title });
    } catch {
      // the share sheet was closed
    }
  }

  return (
    <div className="artifact-view">
      <div className="artifact-view-photo">
        <img className="private" src={artifact.imageUrl} alt={artifact.title} />
      </div>
      <div className="form">
        <dl className="facts">
          <div>
            <dt>{t('artifacts.view.kind')}</dt>
            <dd>
              {t(`cards.kind.${artifact.kind}`)} · {t(`cards.style.${artifact.style}`)}
            </dd>
          </div>
          <div>
            <dt>{t('artifacts.view.memory')}</dt>
            <dd>
              <Link to={`/album/${artifact.memory.id}`} className="chip" onClick={onClose}>
                <Icon name="image" size={14} />
                {artifact.memory.title} · {memoryDate(artifact.memory)}
              </Link>
            </dd>
          </div>
          {artifact.recipient && (
            <div>
              <dt>{t('artifacts.view.to')}</dt>
              <dd>{artifact.recipient}</dd>
            </div>
          )}
          <div>
            <dt>{t('artifacts.view.kept')}</dt>
            <dd>{timestamp(artifact.createdAt)}</dd>
          </div>
        </dl>
        {artifact.message && <div className="story private text">{artifact.message}</div>}
        <div className="form-actions">
          <button type="button" className="btn btn-danger-quiet" onClick={onDelete}>
            <Icon name="trash" size={15} />
            {t('common.delete')}
          </button>
          {canShare && (
            <button type="button" className="btn btn-secondary" onClick={share}>
              <Icon name="share" size={15} />
              {t('cards.share')}
            </button>
          )}
          <a className="btn btn-primary" href={artifact.imageUrl} download={cardFileName(artifact.title, artifact.kind)}>
            <Icon name="download" size={15} />
            {t('cards.download')}
          </a>
        </div>
      </div>
    </div>
  );
}

/** "Which memory is this card made from?" — your own memories, newest first, with a filter. */
function MemoryPicker({ onPick }) {
  const { t, memoryDate } = useI18n();
  const { data } = useFetch('/api/memories');
  const [query, setQuery] = useState('');
  const fold = (text) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();
  const memories = data?.memories.filter((memory) => fold(`${memory.title} ${memory.place}`).includes(fold(query.trim())));

  return (
    <div className="form">
      <input
        className="input"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t('artifacts.pick.filter')}
        aria-label={t('artifacts.pick.filter')}
        data-autofocus
      />
      {!data && <Skeleton height={160} />}
      {data?.memories.length === 0 && <p className="field-hint">{t('artifacts.pick.empty')}</p>}
      {data?.memories.length > 0 && memories.length === 0 && <p className="field-hint">{t('artifacts.pick.none')}</p>}
      {memories?.length > 0 && (
        <ul className="memory-picker">
          {memories.map((memory) => (
            <li key={memory.id}>
              <button type="button" onClick={() => onPick(memory)}>
                <span className={`memory-picker-thumb scene${memory.scene}`}>
                  {previewOf(memory.cover) && <img className="private" src={previewOf(memory.cover)} alt="" loading="lazy" />}
                </span>
                <span className="memory-picker-text">
                  <strong>{memory.title}</strong>
                  <span>{[memoryDate(memory), memory.place].filter(Boolean).join(' · ')}</span>
                </span>
                <Icon name="chevronRight" size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
