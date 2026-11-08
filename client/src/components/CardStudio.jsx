import { useEffect, useMemo, useRef, useState } from 'react';
import { errorMessage } from '../api.js';
import { fieldMessage, useI18n } from '../i18n/index.jsx';
import { ARTIFACT_ICONS } from '../lib/artifacts.js';
import { CARD_KINDS, CARD_STYLES, cardFile, cardFileName, loadCardFonts, loadCardImage, renderCard } from '../lib/cards.js';
import { makePreview } from '../lib/image.js';
import { uploadTo } from '../lib/upload.js';
import { useTheme } from '../theme.jsx';
import { Segmented } from './Controls.jsx';
import Icon from './Icon.jsx';
import Modal from './Modal.jsx';
import { previewOf } from './Memories.jsx';
import { useToast } from './Toast.jsx';


/** "12.10.2019", "10.2019" or "2019" — for the postmark. */
function shortDate({ year, month, day }) {
  const two = (n) => String(n).padStart(2, '0');
  if (!month) return String(year);
  return day ? `${two(day)}.${two(month)}.${year}` : `${two(month)}.${year}`;
}

/**
 * "Make a keepsake card": turns one memory into a postcard, a stamp or a photo card to download,
 * print, or send to family through the phone's share sheet. The card is drawn on this device.
 * The owner of the memory can also keep it in the Artifacts tab (canKeep): only then is the image
 * uploaded — privately, like the memory's own photos. onKept(artifact) is called after that.
 */
export default function CardStudio({ memory, open, onClose, canKeep = false, onKept }) {
  const { t } = useI18n();
  return (
    <Modal open={open} onClose={onClose} title={t('cards.title')} kicker={t('cards.kicker')} wide>
      {open && <Studio memory={memory} onClose={onClose} canKeep={canKeep} onKept={onKept} />}
    </Modal>
  );
}

function Studio({ memory, onClose, canKeep, onKept }) {
  const { t, memoryDate } = useI18n();
  const { theme } = useTheme();
  const toast = useToast();
  // Photos, and the still frames of videos, are the pictures a card can use.
  const pictures = useMemo(
    () =>
      memory.files
        .map((file) => ({ id: file.id, src: file.kind === 'video' ? file.posterUrl : file.url, thumb: previewOf(file) }))
        .filter((choice) => choice.src),
    [memory.files],
  );
  const [kind, setKind] = useState('postcard');
  const [style, setStyle] = useState(theme === 'darkroom' ? 'darkroom' : 'paper');
  const [picture, setPicture] = useState(0);
  const [title, setTitle] = useState(memory.title);
  const [line, setLine] = useState([memory.place, memoryDate(memory)].filter(Boolean).join(' · '));
  const [message, setMessage] = useState('');
  const [to, setTo] = useState('');
  const [image, setImage] = useState(null);
  const [busy, setBusy] = useState(false); // true, or 'keep' while the card is being kept
  const [keptAs, setKeptAs] = useState(''); // the card as it was last kept: no double copies on a second click
  const canvas = useRef(null);
  const canShare = typeof navigator.canShare === 'function';

  // Load the chosen picture (same origin, so the canvas stays exportable).
  useEffect(() => {
    let cancelled = false;
    loadCardImage(pictures[picture]?.src)
      .then((loaded) => !cancelled && setImage(loaded))
      .catch(() => !cancelled && setImage(null));
    return () => {
      cancelled = true;
    };
  }, [pictures, picture]);

  // Redraw on every change, once the fonts (with their Vietnamese glyphs) are ready.
  useEffect(() => {
    let cancelled = false;
    const options = {
      kind,
      style,
      image,
      scene: memory.scene,
      title,
      line,
      place: memory.place,
      year: memory.year,
      shortDate: shortDate(memory),
      message,
      to,
      frame: `${String((memory.id % 36) + 1).padStart(2, '0')}A`,
      labels: { to: t('cards.canvas.to'), footer: t('cards.canvas.footer'), value: t('cards.canvas.value') },
    };
    loadCardFonts(`${title} ${line} ${message} ${to}`).then(() => {
      if (!cancelled && canvas.current) renderCard(canvas.current, options);
    });
    return () => {
      cancelled = true;
    };
  }, [kind, style, image, title, line, message, to, memory, t]);

  async function download() {
    setBusy(true);
    try {
      const file = await cardFile(canvas.current, cardFileName(title, kind));
      const url = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast(t('cards.saved'));
    } finally {
      setBusy(false);
    }
  }

  const onPostcard = kind === 'postcard'; // only a postcard shows a message and a recipient
  const design = JSON.stringify([kind, style, picture, title, line, onPostcard ? message : '', onPostcard ? to : '']);
  const kept = keptAs === design;

  /** Keep the card in the Artifacts tab: the image, a small preview, and what is written on it. */
  async function keep() {
    const keeping = design;
    setBusy('keep');
    try {
      const card = canvas.current;
      const file = await cardFile(card, cardFileName(title, kind));
      const preview = await makePreview(card, card.width, card.height);
      const { artifact } = await uploadTo(`/api/memories/${memory.id}/artifacts`, {
        file,
        preview,
        width: card.width,
        height: card.height,
        fields: { kind, style, title, line, message: onPostcard ? message : '', recipient: onPostcard ? to : '' },
      });
      setKeptAs(keeping);
      toast(t('cards.kept'));
      onKept?.(artifact);
    } catch (err) {
      const field = err.fields?.title ?? err.fields?.file;
      toast(field ? fieldMessage(t, field) : `${t('cards.keepFailed')} ${errorMessage(t, err)}`, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    setBusy(true);
    try {
      const file = await cardFile(canvas.current, cardFileName(title, kind));
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: memory.title, text: t('cards.shareText', { title: memory.title }) });
      } else {
        await download();
      }
    } catch {
      // the share sheet was closed
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="studio">
      <div className={`studio-preview kind-${kind}`}>
        <canvas ref={canvas} className="private" aria-label={t('cards.previewLabel', { title })} role="img" />
      </div>

      <div className="form studio-controls">
        <div className="field">
          <span className="field-label">{t('cards.kindLabel')}</span>
          <Segmented
            label={t('cards.kindLabel')}
            value={kind}
            onChange={setKind}
            options={CARD_KINDS.map((value) => ({ value, label: t(`cards.kind.${value}`), icon: ARTIFACT_ICONS[value] }))}
          />
        </div>

        {pictures.length > 1 && (
          <div className="field">
            <span className="field-label">{t('cards.photo')}</span>
            <div className="studio-pictures">
              {pictures.map((choice, index) => (
                <button
                  key={choice.id}
                  type="button"
                  className="thumb"
                  aria-pressed={picture === index}
                  aria-label={t('gallery.show', { number: index + 1 })}
                  onClick={() => setPicture(index)}
                >
                  <img className="private" src={choice.thumb ?? choice.src} alt="" />
                </button>
              ))}
            </div>
          </div>
        )}
        {pictures.length === 0 && <p className="field-hint">{t('cards.noPhoto')}</p>}

        <label className="field">
          <span className="field-label">{t('cards.caption')}</span>
          <input className="input" value={title} maxLength={80} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">{t('cards.line')}</span>
          <input className="input" value={line} maxLength={90} onChange={(event) => setLine(event.target.value)} />
        </label>
        {kind === 'postcard' && (
          <>
            <label className="field">
              <span className="field-label">{t('cards.message')}</span>
              <textarea
                className="textarea"
                rows={3}
                value={message}
                maxLength={260}
                placeholder={t('cards.messagePlaceholder')}
                onChange={(event) => setMessage(event.target.value)}
              />
            </label>
            <label className="field">
              <span className="field-label">{t('cards.to')}</span>
              <input
                className="input"
                value={to}
                maxLength={40}
                placeholder={t('cards.toPlaceholder')}
                onChange={(event) => setTo(event.target.value)}
              />
            </label>
          </>
        )}

        <div className="field">
          <span className="field-label">{t('cards.styleLabel')}</span>
          <Segmented
            label={t('cards.styleLabel')}
            value={style}
            onChange={setStyle}
            options={CARD_STYLES.map((value) => ({ value, label: t(`cards.style.${value}`) }))}
          />
        </div>

        <p className="field-hint" style={{ display: 'flex', gap: 6 }}>
          <Icon name="shield" size={14} />
          <span>{canKeep ? t('cards.privacyKeep') : t('cards.privacy')}</span>
        </p>

        <div className="form-actions">
          <button type="button" className="btn btn-quiet" onClick={onClose}>
            {t('common.close')}
          </button>
          {canShare && (
            <button type="button" className="btn btn-secondary" onClick={share} disabled={Boolean(busy)}>
              <Icon name="share" size={15} />
              {t('cards.share')}
            </button>
          )}
          <button type="button" className={canKeep ? 'btn btn-secondary' : 'btn btn-primary'} onClick={download} disabled={Boolean(busy)}>
            <Icon name="download" size={15} />
            {t('cards.download')}
          </button>
          {canKeep && (
            <button type="button" className="btn btn-primary btn-keep" onClick={keep} disabled={Boolean(busy) || kept}>
              {busy === 'keep' ? <span className="spinner" /> : <Icon name={kept ? 'check' : 'box'} size={15} />}
              {kept ? t('cards.keptButton') : t('cards.keep')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
