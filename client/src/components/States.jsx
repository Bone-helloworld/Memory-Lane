import { errorMessage } from '../api.js';
import { useI18n } from '../i18n/index.jsx';

/** Friendly "nothing here yet" panel with a small line drawing (hand-drawn in the notebook theme). */
export function EmptyState({ art = 'print', title, body, action, compact = false }) {
  return (
    <div className={`empty${compact ? ' compact' : ''}`}>
      {!compact && <EmptyArt kind={art} />}
      <h3 className="empty-title">{title}</h3>
      {body && <p className="empty-body">{body}</p>}
      {action}
    </div>
  );
}

const ARTS = {
  // Two prints, one with a sun over hills
  print: (
    <>
      <rect x="22" y="16" width="56" height="66" rx="2" transform="rotate(-7 50 49)" />
      <rect x="66" y="12" width="58" height="68" rx="2" transform="rotate(6 95 46)" />
      <path d="M74 64l14-16 10 11 8-8 12 14" transform="rotate(6 95 46)" />
      <circle cx="108" cy="30" r="5" transform="rotate(6 95 46)" />
      <path d="M30 90c18 4 52 5 92-2" />
    </>
  ),
  // Two people side by side
  people: (
    <>
      <circle cx="56" cy="34" r="12" />
      <path d="M32 80c3-16 12-25 24-25s21 9 24 25" />
      <circle cx="96" cy="38" r="10" />
      <path d="M78 80c2-12 9-19 18-19s17 7 19 19" />
      <path d="M118 22l4-6M124 30l7-2M120 40l6 3" />
    </>
  ),
  // A cassette / record
  disc: (
    <>
      <rect x="30" y="22" width="90" height="58" rx="6" />
      <circle cx="56" cy="54" r="9" />
      <circle cx="94" cy="54" r="9" />
      <path d="M65 54h20M42 32h66" />
      <path d="M44 80l6-10h50l6 10" />
    </>
  ),
  // Two prints joined by a link
  share: (
    <>
      <rect x="18" y="26" width="46" height="52" rx="2" transform="rotate(-6 41 52)" />
      <rect x="88" y="22" width="46" height="52" rx="2" transform="rotate(6 111 48)" />
      <path d="M66 50c6-6 14-6 20 0M66 58c6 6 14 6 20 0" />
    </>
  ),
  // A magnifier over a print
  search: (
    <>
      <rect x="30" y="18" width="62" height="70" rx="2" transform="rotate(-5 61 53)" />
      <circle cx="96" cy="50" r="18" />
      <path d="M109 63l15 15" />
    </>
  ),
};

function EmptyArt({ kind }) {
  return (
    <svg
      className="empty-art icon"
      viewBox="0 0 150 104"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ARTS[kind] ?? ARTS.print}
    </svg>
  );
}

/** Placeholder blocks shown while data loads (shapes match the real content). */
export function Skeleton({ height = 120, count = 1, radius }) {
  return (
    <div className="skeleton-stack" aria-busy="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="skeleton" style={{ height, borderRadius: radius }} />
      ))}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  const { t } = useI18n();
  return (
    <div className="error-state" role="alert">
      <span>
        {t('state.error')} {errorMessage(t, error)}
      </span>
      {onRetry && (
        <button type="button" className="btn btn-danger-quiet btn-sm" onClick={onRetry}>
          {t('common.retry')}
        </button>
      )}
    </div>
  );
}

export function FullPageLoading() {
  return <div className="full-loading" aria-busy="true" />;
}
