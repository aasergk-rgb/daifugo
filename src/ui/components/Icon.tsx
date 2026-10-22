// 線で描くシンプルなアイコン（24×24、色は currentColor）

import type { CSSProperties } from 'react';

const PATHS: Record<string, JSX.Element> = {
  book: (
    <>
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5z" />
      <path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z" />
    </>
  ),
  list: (
    <>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <circle cx="4.5" cy="6" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="12" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="18" r="1.3" fill="currentColor" stroke="none" />
    </>
  ),
  chat: <path d="M5 4.5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8l-5 4v-4H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2z" />,
  sound: (
    <>
      <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z" fill="currentColor" />
      <path d="M15.5 9a4.5 4.5 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11" />
    </>
  ),
  mute: (
    <>
      <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z" fill="currentColor" />
      <path d="M16 9.5l5 5M21 9.5l-5 5" />
    </>
  ),
  dots: (
    <>
      <circle cx="5" cy="12" r="1.9" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.9" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.9" fill="currentColor" stroke="none" />
    </>
  ),
  bulb: (
    <>
      <path d="M9.5 18h5M10.5 21h3" />
      <path d="M12 3a6 6 0 0 0-3.6 10.8c.7.5 1.1 1.3 1.1 2.2h5c0-.9.4-1.7 1.1-2.2A6 6 0 0 0 12 3z" />
    </>
  ),
  smile: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 14.5a4.5 4.5 0 0 0 7 0" />
      <circle cx="9" cy="10" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="10" r="1.1" fill="currentColor" stroke="none" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2.5" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  rotate: (
    <>
      <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
      <path d="M20 4v4.5h-4.5" />
    </>
  ),
  cards: (
    <>
      <rect x="7" y="3.5" width="12" height="16" rx="2.2" />
      <path d="M5 7.5v11a2 2 0 0 0 2 2h8" />
      <path d="M13 9.4c-.9-1.3-3-.8-3 .8 0 1.4 1.5 2.4 3 3.6 1.5-1.2 3-2.2 3-3.6 0-1.6-2.1-2.1-3-.8z" fill="currentColor" stroke="none" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.6 3.7 5.6 3.7 9s-1.2 6.4-3.7 9c-2.5-2.6-3.7-5.6-3.7-9S9.5 5.6 12 3z" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1" />
      <circle cx="15" cy="6" r="2" />
      <circle cx="9" cy="12" r="2" />
      <circle cx="17" cy="18" r="2" />
    </>
  ),
  link: (
    <>
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
    </>
  ),
  pencil: <path d="M4 20h4L19.5 8.5l-4-4L4 16z" />,
  star: <path d="M12 3.5l2.5 5.3 5.8.7-4.3 4 1.1 5.8L12 16.5l-5.1 2.8 1.1-5.8-4.3-4 5.8-.7z" />,
  zap: <path d="M13 2.5L4.5 13.5h6.5l-1 8 8.5-11h-6.5z" />,
  crown: <path d="M3.5 18L2.5 7.5l5.5 4L12 4.5l4 7 5.5-4-1 10.5z" />,
  swap: (
    <>
      <path d="M5 8h14l-3.5-3.5" />
      <path d="M19 16H5l3.5 3.5" />
    </>
  ),
  trophy: (
    <>
      <path d="M8 4h8v5a4 4 0 0 1-8 0z" />
      <path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8" />
    </>
  ),
  layers: (
    <>
      <path d="M12 3.5l9 4.8-9 4.8-9-4.8z" />
      <path d="M3 13l9 4.8 9-4.8" />
    </>
  ),
  bomb: (
    <>
      <circle cx="11" cy="14" r="7" />
      <path d="M16 9l2.5-2.5M19 4.5l.6-1.5M21 6.5l1.5-.5" />
    </>
  ),
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6" />
      <circle cx="12" cy="7.5" r="1.2" fill="currentColor" stroke="none" />
    </>
  ),
  back: <path d="M15 5l-7 7 7 7" />,
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20, className = '', style }: { name: IconName | string; size?: number; className?: string; style?: CSSProperties }) {
  return (
    <svg
      className={`icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={style}
    >
      {PATHS[name] ?? null}
    </svg>
  );
}

/** 大富豪の王冠（黄色・紺の縁） */
export function Crown({ size = 18 }: { size?: number }) {
  return (
    <svg className="icon crown" width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path d="M3.5 18L2.5 7.5l5.5 4L12 4.5l4 7 5.5-4-1 10.5z" fill="#FFC93C" stroke="#2B2A55" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}
