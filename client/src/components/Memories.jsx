import { useCallback, useRef } from 'react';
import { Link } from 'react-router';
import { useI18n } from '../i18n/index.jsx';
import { useComposer } from '../state.jsx';
import Icon from './Icon.jsx';
import { Avatar } from './People.jsx';

/** The small image to show for a file in grids: its preview (thumbnail / video still), else the photo. */
export function previewOf(file) {
  if (!file) return null;
  return file.posterUrl ?? (file.kind === 'image' ? file.url : null);
}

/** 75.4 → "1:15" */
export function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return '';
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = String(total % 60).padStart(2, '0');
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
}

const frameNumber = (index) => String(index + 1).padStart(2, '0');

/**
 * A private photo. It fades in once loaded (in the darkroom it "develops" from overexposed)
 * and is blurred by discreet mode until hovered.
 */
export function Photo({ src, alt = '', eager = false, className = '' }) {
  // A cached image may already be complete before React attaches onLoad.
  const ref = useCallback((img) => {
    if (img?.complete && img.naturalWidth) img.classList.add('is-loaded');
  }, []);
  return (
    <img
      ref={ref}
      className={`photo private ${className}`.trim()}
      src={src}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      onLoad={(event) => event.currentTarget.classList.add('is-loaded')}
    />
  );
}

/*
 * The darkroom loupe: a lens that follows the mouse over a frame and magnifies it 2.2×.
 * Works out where the cropped (object-fit: cover) picture really sits so the lens shows
 * exactly the spot under the pointer. Touch screens and the notebook theme skip it.
 */
const ZOOM = 2.2;
const LENS_RADIUS = 64;

function useLoupe() {
  const lens = useRef(null);
  const onPointerMove = useCallback((event) => {
    const el = lens.current;
    if (!el || event.pointerType !== 'mouse' || document.documentElement.dataset.theme !== 'darkroom') return;
    const box = event.currentTarget.getBoundingClientRect();
    const img = event.currentTarget.querySelector('img');
    if (!img?.naturalWidth) return;
    const x = event.clientX - box.left;
    const y = event.clientY - box.top;
    const scale = Math.max(box.width / img.naturalWidth, box.height / img.naturalHeight);
    const shownW = img.naturalWidth * scale;
    const shownH = img.naturalHeight * scale;
    const offsetX = (box.width - shownW) / 2;
    const offsetY = (box.height - shownH) / 2;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.backgroundSize = `${shownW * ZOOM}px ${shownH * ZOOM}px`;
    el.style.backgroundPosition = `${LENS_RADIUS - (x - offsetX) * ZOOM}px ${LENS_RADIUS - (y - offsetY) * ZOOM}px`;
    el.classList.add('is-ready');
  }, []);
  return { lens, onPointerMove };
}

/** A memory as a print: taped into the notebook, or a frame on a strip of film in the darkroom. */
export function MemoryCard({ memory, index = 0, showOwner = false }) {
  const { t, memoryDate } = useI18n();
  const { lens, onPointerMove } = useLoupe();
  const preview = previewOf(memory.cover);
  const video = memory.files.find((file) => file.kind === 'video');

  return (
    <Link to={`/album/${memory.id}`} className="print">
      <div className="print-film">
        <span className="tape" aria-hidden="true" />
        <span className="edge edge-top" aria-hidden="true">
          MEMORY LANE 400
        </span>
        <div className={`print-photo scene${memory.scene}`} onPointerMove={preview ? onPointerMove : undefined}>
          {preview ? (
            <>
              <Photo src={preview} />
              <span ref={lens} className="loupe" aria-hidden="true" style={{ backgroundImage: `url("${preview}")` }} />
            </>
          ) : (
            <span className="print-blank">{t('album.noPhoto')}</span>
          )}
          {(video || memory.files.length > 1) && (
            <span className="print-badges">
              {video && (
                <span className="print-badge" title={t('gallery.video')}>
                  <Icon name="play" size={10} strokeWidth={2.4} />
                  {formatDuration(video.duration)}
                </span>
              )}
              {memory.files.length > 1 && (
                <span className="print-badge" title={t('gallery.count', { count: memory.files.length })}>
                  <Icon name="image" size={10} strokeWidth={2} />
                  {memory.files.length}
                </span>
              )}
            </span>
          )}
        </div>
        <span className="edge edge-bottom" aria-hidden="true">
          {frameNumber(index)} ▸ {frameNumber(index)}A
        </span>
      </div>
      <div className="print-cap">
        <span className="print-date">{memoryDate(memory)}</span>
        <h3 className="print-title">{memory.title}</h3>
        {showOwner ? (
          <span className="print-owner">
            <Icon name="share" size={12} />
            {t('sharing.from', { name: memory.owner.name })}
          </span>
        ) : (
          (memory.place || memory.people.length > 0 || memory.shareCount > 0) && (
            <div className="print-meta">
              <span className="print-place">
                {memory.place && (
                  <>
                    <Icon name="pin" size={12} />
                    <span>{memory.place}</span>
                  </>
                )}
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                {memory.shareCount > 0 && (
                  <span title={t('share.sharedWith', { count: memory.shareCount })} style={{ display: 'inline-flex' }}>
                    <Icon name="users" size={13} />
                    <span className="visually-hidden">{t('share.sharedWith', { count: memory.shareCount })}</span>
                  </span>
                )}
                {memory.people.length > 0 && (
                  <span className="print-people" title={memory.people.map((p) => p.name).join(', ')}>
                    {memory.people.slice(0, 3).map((person) => (
                      <Avatar key={person.id} name={person.name} color={person.color} />
                    ))}
                  </span>
                )}
              </span>
            </div>
          )
        )}
      </div>
    </Link>
  );
}

export function MemoryGrid({ memories, compact = false, showOwner = false }) {
  return (
    <div className={`prints${compact ? ' prints--compact' : ''}`}>
      {memories.map((memory, index) => (
        <MemoryCard key={memory.id} memory={memory} index={index} showOwner={showOwner} />
      ))}
    </div>
  );
}

/** "On this day": prints scattered on the desk / one strip of film. Empty slots invite a new memory. */
export function Strip({ items, slots = 5 }) {
  const { t } = useI18n();
  const { openMemory } = useComposer();
  const empty = Math.max(0, slots - items.length);
  return (
    <div className="strip">
      <div className="strip-track">
        {items.map((memory, index) => (
          <MemoryCard key={memory.id} memory={memory} index={index} />
        ))}
        {Array.from({ length: empty }, (_, i) => (
          <button key={`empty-${i}`} type="button" className="strip-add" onClick={() => openMemory()}>
            <Icon name="plus" size={20} />
            <span>{t('today.film.addFrame')}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Hand-drawn loop around the chosen year (notebook theme; hidden in the darkroom). */
const PEN_CIRCLE = 'M9 28C8 11 47 4 71 5c30 1 45 11 41 25-4 14-42 17-68 15C18 43 4 36 10 22c4-9 19-13 31-14';

/**
 * Year scrubber. Shows "All", the 7 most recent years with memories,
 * and a "before …" bucket for anything older.
 *  - with onSelect: filters in place (album)
 *  - with linkTo:  each year is a link (Today → album)
 */
export function YearBar({ years, active = '', onSelect, linkTo }) {
  const { t } = useI18n();
  const shown = years.slice(0, 7);
  const options = [{ value: '', label: t('years.all') }].concat(
    shown.map((y) => ({ value: String(y.year), label: String(y.year), count: y.count })),
  );
  if (years.length > shown.length) {
    const oldest = shown[shown.length - 1].year;
    options.push({ value: `before-${oldest}`, label: t('years.before', { year: oldest }) });
  }

  return (
    <nav className="years" aria-label={t('years.label')}>
      {options.map((option) => {
        const isActive = option.value === active;
        const content = (
          <>
            {option.label}
            {isActive && (
              <svg className="year-circle" viewBox="0 0 120 50" preserveAspectRatio="none" aria-hidden="true">
                <path d={PEN_CIRCLE} pathLength="1" />
              </svg>
            )}
          </>
        );
        const className = `year${isActive ? ' is-active' : ''}`;
        if (linkTo) {
          const href = option.value ? `${linkTo}?year=${option.value}` : linkTo;
          return (
            <Link key={option.value || 'all'} to={href} className={className}>
              {content}
            </Link>
          );
        }
        return (
          <button
            key={option.value || 'all'}
            type="button"
            className={className}
            aria-pressed={isActive}
            onClick={() => onSelect(option.value)}
          >
            {content}
          </button>
        );
      })}
    </nav>
  );
}

/** Today's featured memory: a large print with a handwritten note, or an enlargement under the safelight. */
export function Featured({ memory }) {
  const { t, memoryDate } = useI18n();
  const { openMemory } = useComposer();
  if (!memory) {
    return (
      <button type="button" className="featured" onClick={() => openMemory()} style={{ width: '100%', border: 0, font: 'inherit' }}>
        <span className="tape" aria-hidden="true" />
        <div className="featured-photo scene1">
          <div className="featured-empty">
            <Icon name="image" size={28} />
            <span>{t('hero.emptySlide')}</span>
          </div>
        </div>
      </button>
    );
  }
  const cover = memory.cover;
  const src = cover ? (cover.kind === 'image' ? cover.url : cover.posterUrl) : null;
  return (
    <Link to={`/album/${memory.id}`} className="featured">
      <span className="tape" aria-hidden="true" />
      <span className="tape" aria-hidden="true" />
      <span className="featured-numeral" aria-hidden="true">
        {memory.year}
      </span>
      <div className={`featured-photo scene${memory.scene}`}>{src && <Photo src={src} alt={memory.title} eager />}</div>
      <div className="featured-cap">
        <span className="featured-title">{memory.title}</span>
        <span className="featured-when">{memoryDate(memory)}</span>
      </div>
      <span className="featured-note">
        <svg viewBox="0 0 60 50" aria-hidden="true">
          <path d="M5 8c13-3 28 2 36 13 5 7 7 14 7 21" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M39 35l9 9 6-11" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {t('today.featured')}
      </span>
    </Link>
  );
}

/** Four sample photos for the public pages: a taped collage / a proof sheet with a loupe. */
const SAMPLES = [
  { src: '/landing/dalat.jpg', year: 2019, key: 'frame1' },
  { src: '/landing/hoian.jpg', year: 2017, key: 'frame4' },
  { src: '/landing/lop12.jpg', year: 2016, key: 'frame2' },
  { src: '/landing/tet.jpg', year: 2014, key: 'frame5' },
];

export function Collage() {
  const { t } = useI18n();
  return (
    <div className="collage" aria-hidden="true">
      {SAMPLES.map((sample, index) => (
        <figure key={sample.src} className={`collage-item c${index + 1}`}>
          <span className="tape" />
          <div className="print-film">
            <span className="edge edge-top">MEMORY LANE 400</span>
            <img src={sample.src} alt="" loading={index < 2 ? 'eager' : 'lazy'} decoding="async" />
            <span className="edge edge-bottom">
              {frameNumber(index + 6)} ▸ {frameNumber(index + 6)}A
            </span>
          </div>
          <figcaption>
            <b style={{ fontWeight: 500 }}>{t(`landing.sample.${sample.key}`)}</b>
            <span>{sample.year}</span>
          </figcaption>
        </figure>
      ))}
      <span className="collage-lens" />
      <svg className="doodle doodle-star" viewBox="0 0 48 48">
        <path
          d="M24 4c2 9 6 15 16 18-10 3-14 9-16 20-2-11-6-17-16-20 10-3 14-9 16-18Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
