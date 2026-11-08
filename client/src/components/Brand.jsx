import { Link } from 'react-router';

/**
 * The mark: a tilted print of a little lane winding back towards the hills, under a sun —
 * "Memory Lane". Drawn in the theme's ink (blue) or safelight (red). Same drawing as public/favicon.svg.
 */
export function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <g transform="rotate(-8 16 16)" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <rect x="6.5" y="4.5" width="19" height="23" rx="1.6" strokeWidth="1.9" />
        <path d="M7.8 16.4c2.6-2.2 5.2-2.5 8-1 2.7-1.4 5.6-1.3 8.4.7" strokeWidth="1.3" />
        <path d="M9.6 27.5c3.3-2.5 8.4-3.9 7.1-7.4-.6-1.6.2-2.9 1.4-3.8" strokeWidth="1.5" />
        <path d="M15.4 27.5c2.3-1.8 5.2-3 4.4-6.3-.4-1.7.1-3.4.9-4.7" strokeWidth="1.5" />
        <circle cx="20.4" cy="9.4" r="1.7" fill="currentColor" stroke="none" />
      </g>
    </svg>
  );
}

export default function Brand({ to = '/' }) {
  return (
    <Link to={to} className="brand" aria-label="Memory Lane">
      <BrandMark />
      <span className="brand-name">Memory Lane</span>
    </Link>
  );
}
