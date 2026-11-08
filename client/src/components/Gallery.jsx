import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import Icon from './Icon.jsx';
import { Photo, formatDuration, previewOf } from './Memories.jsx';

/**
 * The stage takes the shape of the file it shows — a phone video is tall (9:16), a landscape
 * photo is wide — so a portrait video is not shrunk into a thin strip inside a fixed 4:3 box.
 * Extreme shapes (panoramas, long screenshots) are clamped; object-fit: contain shows the rest.
 */
function shapeOf(file) {
  if (!file.width || !file.height) return 4 / 3;
  return Math.min(2.2, Math.max(0.5, file.width / file.height));
}

/**
 * The photos and videos of one memory: a large viewer (a taped print in the notebook,
 * a lit stage in the darkroom) with previous/next, keyboard arrows and a row of thumbnails.
 * Videos stream from the private /api/files route with HTTP Range requests.
 */
export default function Gallery({ memory }) {
  const { t } = useI18n();
  const [index, setIndex] = useState(0);
  const root = useRef(null);
  const swipe = useRef(null); // where a finger touched the stage
  const files = memory.files;
  const count = files.length;
  const current = files[Math.min(index, Math.max(0, count - 1))];

  // Keep the index valid when files change (after editing).
  useEffect(() => {
    if (index >= count) setIndex(Math.max(0, count - 1));
  }, [count, index]);

  const go = (step) => setIndex((i) => (i + step + count) % count);

  if (!count) {
    return (
      <section className="viewer" aria-label={memory.title}>
        <span className="tape" aria-hidden="true" />
        <div className={`viewer-stage scene${memory.scene}`} role="img" aria-label={t('album.noPhoto')}>
          <span className="print-blank" style={{ position: 'static' }}>
            {t('album.noPhoto')}
          </span>
        </div>
      </section>
    );
  }

  return (
    <section
      ref={root}
      className="viewer"
      aria-roledescription={t('gallery.label')}
      aria-label={memory.title}
      onKeyDown={(event) => {
        if (count < 2 || event.target.tagName === 'VIDEO') return;
        if (event.key === 'ArrowLeft') go(-1);
        if (event.key === 'ArrowRight') go(1);
      }}
    >
      <span className="tape" aria-hidden="true" />
      <div
        className="viewer-stage"
        key={current.id}
        style={{ '--ratio': shapeOf(current) }}
        // On phones: swipe left / right for the next / previous photo or video.
        onPointerDown={(event) => {
          swipe.current = event.pointerType === 'mouse' || count < 2 ? null : { x: event.clientX, y: event.clientY };
        }}
        onPointerUp={(event) => {
          const start = swipe.current;
          swipe.current = null;
          if (!start) return;
          const dx = event.clientX - start.x;
          const dy = event.clientY - start.y;
          if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
        }}
        onPointerCancel={() => {
          swipe.current = null;
        }}
      >
        {current.kind === 'video' ? (
          <video
            className="private"
            src={current.url}
            poster={current.posterUrl ?? undefined}
            controls
            preload="metadata"
            playsInline
            aria-label={t('gallery.videoOf', { title: memory.title })}
          />
        ) : (
          <Photo src={current.url} alt={memory.title} eager />
        )}
        {count > 1 && (
          <>
            <button type="button" className="viewer-nav prev" onClick={() => go(-1)} aria-label={t('gallery.previous')}>
              <Icon name="chevronLeft" size={20} />
            </button>
            <button type="button" className="viewer-nav next" onClick={() => go(1)} aria-label={t('gallery.next')}>
              <Icon name="chevronRight" size={20} />
            </button>
          </>
        )}
      </div>

      <div className="viewer-bar">
        <span className="viewer-count" aria-live="polite">
          {String(index + 1).padStart(2, '0')} / {String(count).padStart(2, '0')}
        </span>
        <span>
          {current.kind === 'video'
            ? [t('gallery.video'), formatDuration(current.duration)].filter(Boolean).join(' · ')
            : t('gallery.photo')}
        </span>
      </div>

      {count > 1 && (
        <div className="thumbs">
          {files.map((file, i) => {
            const thumb = previewOf(file);
            return (
              <button
                key={file.id}
                type="button"
                className={`thumb${i === index ? ' is-active' : ''}`}
                onClick={() => setIndex(i)}
                aria-label={t('gallery.show', { number: i + 1 })}
                aria-current={i === index ? 'true' : undefined}
              >
                {thumb && <img className="private" src={thumb} alt="" loading="lazy" />}
                {file.kind === 'video' && (
                  <span className="play-dot">
                    <Icon name="play" size={14} strokeWidth={2} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
