// One consistent icon set (24×24 grid, 1.6px stroke) drawn inline — no icon font, no emoji.
// In the notebook theme an SVG filter makes the lines slightly wobbly, as if drawn by hand.
const PATHS = {
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  arrowLeft: <path d="M19 12H5M11 6l-6 6 6 6" />,
  arrowRight: <path d="M5 12h14M13 6l6 6-6 6" />,
  arrowUp: <path d="M12 19V5M6 11l6-6 6 6" />,
  arrowDown: <path d="M12 5v14M6 13l6 6 6-6" />,
  arrowUpRight: <path d="M7 17 17 7M8 7h9v9" />,
  chevronLeft: <path d="M15 5l-7 7 7 7" />,
  chevronRight: <path d="M9 5l7 7-7 7" />,
  chevronDown: <path d="M6 9l6 6 6-6" />,
  pencil: <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4ZM13.5 6.5l4 4" />,
  trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  pin: (
    <>
      <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" />
      <circle cx="12" cy="10" r="2.3" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
  download: <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />,
  upload: <path d="M12 16V5M7 10l5-5 5 5M5 19h14" />,
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </>
  ),
  shield: <path d="M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6l-7-3ZM9 12l2 2 4-4" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.8" />
    </>
  ),
  eyeOff: (
    <path d="M3 3l18 18M10.6 5.6A9.7 9.7 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3 3.8M6.6 6.6C3.9 8.3 2.5 12 2.5 12S6 18.5 12 18.5c1.8 0 3.3-.5 4.6-1.2M9.9 9.9a3 3 0 0 0 4.2 4.2" />
  ),
  logout: <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 8l-4 4 4 4M6 12h10" />,
  menu: <path d="M4 7h16M4 12h16M4 17h10" />,
  image: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <circle cx="9" cy="10" r="1.8" />
      <path d="m20.5 16-5-5-8.5 8.5" />
    </>
  ),
  film: (
    <>
      <rect x="3.5" y="4" width="17" height="16" rx="2" />
      <path d="M7.5 4v16M16.5 4v16M3.5 8h4M3.5 12h4M3.5 16h4M16.5 8h4M16.5 12h4M16.5 16h4" />
    </>
  ),
  music: (
    <>
      <path d="M9 18V6l11-2v12" />
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="17.5" cy="16" r="2.5" />
    </>
  ),
  video: (
    <>
      <rect x="3" y="6" width="13" height="12" rx="2" />
      <path d="m16 10.5 5-3v9l-5-3" />
    </>
  ),
  play: <path d="M8 5.5v13l10.5-6.5L8 5.5Z" />,
  message: <path d="M5 18.5V6.5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H9l-4 3Z" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  devices: (
    <>
      <rect x="3" y="5" width="13" height="10" rx="1.5" />
      <path d="M7 19h5M9.5 15v4" />
      <rect x="17" y="9" width="4" height="10" rx="1" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.5 2.6 3.7 5.4 3.7 8.5s-1.2 5.9-3.7 8.5c-2.5-2.6-3.7-5.4-3.7-8.5S9.5 6.1 12 3.5Z" />
    </>
  ),
  share: <path d="M4.5 12.5v6a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-6M12 3.5v12M8 7.5l4-4 4 4" />,
  link: (
    <path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" />
  ),
  copy: (
    <>
      <rect x="8.5" y="8.5" width="11" height="11" rx="2" />
      <path d="M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8.5" r="3.2" />
      <path d="M3.5 19.5c.6-3 2.8-5 5.5-5s4.9 2 5.5 5M15.5 5.6a3.2 3.2 0 0 1 0 6.1M17.5 14.8c1.5.7 2.6 2.4 3 4.7" />
    </>
  ),
  userPlus: (
    <>
      <circle cx="10" cy="8.5" r="3.4" />
      <path d="M3.5 19.5c.7-3.2 3.3-5.2 6.5-5.2 1.6 0 3 .5 4.1 1.3M18 13v6M15 16h6" />
    </>
  ),
  userMinus: (
    <>
      <circle cx="10" cy="8.5" r="3.4" />
      <path d="M3.5 19.5c.7-3.2 3.3-5.2 6.5-5.2 1.6 0 3 .5 4.1 1.3M15 16h6" />
    </>
  ),
  send: <path d="M20.5 3.5 10 14M20.5 3.5 14 20.5l-4-6.5-6.5-4 17-6.5Z" />,
  star: <path d="m12 3.8 2.5 5.2 5.6.7-4.1 3.9 1 5.6-5-2.8-5 2.8 1-5.6-4.1-3.9 5.6-.7L12 3.8Z" />,
  inbox: (
    <>
      <path d="M3.5 13.5 6 5h12l2.5 8.5V19a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1v-5.5Z" />
      <path d="M3.5 13.5H8a4 4 0 0 0 8 0h4.5" />
    </>
  ),
  book: (
    <>
      <path d="M5 4.5h11a2 2 0 0 1 2 2v13H7a2 2 0 0 1-2-2v-13Z" />
      <path d="M5 17.5a2 2 0 0 1 2-2h11M9 8.5h5" />
    </>
  ),
  aperture: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M14.6 3.9 9.4 12.9M20.3 10.4l-10.4.1M17.9 18 12.6 9M9.4 20.1l5.2-9M3.7 13.6l10.4-.1M6.1 6l5.3 9" />
    </>
  ),
  sparkle: <path d="M12 3.5c.7 4.4 2.9 6.9 7.5 8.5-4.6 1.6-6.8 4.1-7.5 8.5-.7-4.4-2.9-6.9-7.5-8.5 4.6-1.6 6.8-4.1 7.5-8.5Z" />,
  // Artifacts: an object (a keepsake box), a letter, an old document.
  box: (
    <>
      <path d="M4 8.5 12 4l8 4.5v9L12 22l-8-4.5v-9Z" />
      <path d="M4 8.5 12 13l8-4.5M12 13v9" />
    </>
  ),
  mail: (
    <>
      <rect x="3.5" y="5.5" width="17" height="13" rx="1.5" />
      <path d="m4 6.5 8 6.5 8-6.5" />
    </>
  ),
  fileText: (
    <>
      <path d="M6 3.5h8.5L19 8v12.5H6v-17Z" />
      <path d="M14.5 3.5V8H19M9 12.5h7M9 16h7M9 9h3" />
    </>
  ),
  postcard: (
    <>
      <rect x="3" y="5.5" width="18" height="13" rx="1.5" />
      <path d="M12 8v8M14.5 9h3.5v3h-3.5zM5.5 10h4M5.5 13h4M14.5 15h4" />
    </>
  ),
};

export default function Icon({ name, size = 16, className = '', strokeWidth = 1.6 }) {
  return (
    <svg
      className={`icon ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}

/** The SVG filter behind the notebook theme's hand-drawn lines. Rendered once at the root. */
export function SketchFilter() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
      <filter id="hn-sketch" x="-10%" y="-10%" width="120%" height="120%">
        <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed="7" result="noise" />
        <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.4" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>
  );
}
