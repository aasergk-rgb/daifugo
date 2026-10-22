// トランプの絵柄（SVG）。フラットでポップなデザイン。
// 4 色スート（♠ 紺 / ♥ ピンク / ♦ オレンジ / ♣ グリーン）で見分けやすくしている。

import { memo } from 'react';
import type { Card } from '../../engine/cards';
import type { BackId } from '../settings';

const W = 200;
const H = 280;
const INK = '#2B2A55';

export const SUIT_COLOR: Record<string, string> = { S: INK, H: '#FF4F7B', D: '#FF961F', C: '#14B079', X: '#8B6CFF' };
const SUIT_TINT: Record<string, string> = { S: '#ECEBFB', H: '#FFE6EE', D: '#FFF1DE', C: '#DEF6ED' };

// ───────────── スート ─────────────

export const SUIT_PATH: Record<'S' | 'H' | 'D', string> = {
  H: 'M50 90 C 22 68 2 50 6 30 C 10 10 36 4 50 26 C 64 4 90 10 94 30 C 98 50 78 68 50 90 Z',
  D: 'M50 4 Q 66 30 88 50 Q 66 70 50 96 Q 34 70 12 50 Q 34 30 50 4 Z',
  S: 'M50 6 C 64 30 96 44 92 66 C 89 82 70 86 56 74 C 58 84 62 90 70 95 L 30 95 C 38 90 42 84 44 74 C 30 86 11 82 8 66 C 4 44 36 30 50 6 Z',
};

export function SuitShape({ suit, x, y, size, rot = 0, fill }: { suit: string; x: number; y: number; size: number; rot?: number; fill?: string }) {
  const s = size / 100;
  const f = fill ?? SUIT_COLOR[suit] ?? INK;
  const tf = `translate(${x - size / 2} ${y - size / 2}) rotate(${rot} ${size / 2} ${size / 2}) scale(${s})`;
  if (suit === 'C') {
    return (
      <g transform={tf} fill={f}>
        <circle cx="50" cy="28" r="21" />
        <circle cx="27" cy="58" r="21" />
        <circle cx="73" cy="58" r="21" />
        <path d="M44 50 L56 50 C 57 74 62 86 72 95 L 28 95 C 38 86 43 74 44 50 Z" />
      </g>
    );
  }
  return <path transform={tf} d={SUIT_PATH[suit as 'S']} fill={f} />;
}

// ───────────── 札の配置 ─────────────

const L = 66;
const C = 100;
const R = 134;
const PIPS: Record<number, [number, number][]> = {
  2: [[C, 70], [C, 210]],
  3: [[C, 70], [C, 140], [C, 210]],
  4: [[L, 70], [R, 70], [L, 210], [R, 210]],
  5: [[L, 70], [R, 70], [C, 140], [L, 210], [R, 210]],
  6: [[L, 70], [R, 70], [L, 140], [R, 140], [L, 210], [R, 210]],
  7: [[L, 70], [R, 70], [C, 105], [L, 140], [R, 140], [L, 210], [R, 210]],
  8: [[L, 70], [R, 70], [C, 105], [L, 140], [R, 140], [C, 175], [L, 210], [R, 210]],
  9: [[L, 70], [R, 70], [L, 117], [R, 117], [C, 140], [L, 163], [R, 163], [L, 210], [R, 210]],
  10: [[L, 70], [R, 70], [C, 94], [L, 117], [R, 117], [L, 163], [R, 163], [C, 186], [L, 210], [R, 210]],
};

const RANK_TEXT: Record<number, string> = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A', 15: '2' };
const rankText = (rank: number) => RANK_TEXT[rank] ?? String(rank);

function Corner({ card }: { card: Card }) {
  const t = rankText(card.rank);
  const color = SUIT_COLOR[card.suit];
  return (
    <g>
      <text x="29" y="50" textAnchor="middle" className="cf" fill={color} fontSize={t.length > 1 ? 34 : 42} letterSpacing={t.length > 1 ? -2 : 0}>
        {t}
      </text>
      <SuitShape suit={card.suit} x={29} y={70} size={22} />
    </g>
  );
}

/** 絵札の小さなアイコン（K=王冠 / Q=ハートのティアラ / J=星） */
function Badge({ rank, y }: { rank: number; y: number }) {
  const common = { fill: '#FFC93C', stroke: INK, strokeWidth: 4, strokeLinejoin: 'round' as const };
  if (rank === 13)
    return (
      <g transform={`translate(100 ${y})`}>
        <path {...common} d="M-30 14 L-34 -14 L-16 0 L0 -20 L16 0 L34 -14 L30 14 Z" />
      </g>
    );
  if (rank === 12)
    return (
      <g transform={`translate(100 ${y})`}>
        <path {...common} d="M-28 12 L-30 -8 L-14 2 L0 -12 L14 2 L30 -8 L28 12 Z" />
        <path d="M0 -14 C -6 -24 -18 -18 -12 -10 L0 0 L12 -10 C 18 -18 6 -24 0 -14 Z" fill="#FF4F7B" stroke={INK} strokeWidth="3" strokeLinejoin="round" transform="translate(0 -12) scale(0.8)" />
      </g>
    );
  return (
    <g transform={`translate(100 ${y})`}>
      <path {...common} d="M0 -22 L6 -7 L22 -7 L9 3 L14 19 L0 9 L-14 19 L-9 3 L-22 -7 L-6 -7 Z" />
    </g>
  );
}

function Face({ card }: { card: Card }) {
  const r = card.rank;
  const color = SUIT_COLOR[card.suit];
  const tint = SUIT_TINT[card.suit];

  let center: JSX.Element;
  if (r >= 11 && r <= 13) {
    center = (
      <g>
        <rect x="50" y="42" width="100" height="196" rx="18" fill={tint} />
        <Badge rank={r} y={84} />
        <text x="100" y="186" textAnchor="middle" className="cf" fontSize="86" fill={color}>
          {rankText(r)}
        </text>
        <SuitShape suit={card.suit} x={100} y={214} size={24} />
      </g>
    );
  } else if (r === 14) {
    center = (
      <g>
        <circle cx="100" cy="140" r="60" fill={tint} />
        <SuitShape suit={card.suit} x={100} y={140} size={card.suit === 'S' ? 82 : 78} />
      </g>
    );
  } else {
    const pips = PIPS[r] ?? PIPS[2];
    const size = r >= 9 ? 32 : 36;
    center = (
      <g>
        {pips.map(([x, y], i) => (
          <SuitShape key={i} suit={card.suit} x={x} y={y} size={size} rot={y > 145 ? 180 : 0} />
        ))}
      </g>
    );
  }

  return (
    <g>
      <rect x="3" y="3" width={W - 6} height={H - 6} rx="20" fill="#fff" stroke={INK} strokeWidth="5" />
      {center}
      <Corner card={card} />
      <g transform={`rotate(180 ${W / 2} ${H / 2})`}>
        <Corner card={card} />
      </g>
    </g>
  );
}

function Joker({ card }: { card: Card }) {
  const two = card.id === 'X2';
  const tint = two ? '#FFE6EE' : '#EFE9FF';
  const accent = two ? '#FF4F7B' : '#8B6CFF';
  return (
    <g>
      <rect x="3" y="3" width={W - 6} height={H - 6} rx="20" fill="#fff" stroke={INK} strokeWidth="5" />
      <rect x="18" y="18" width={W - 36} height={H - 36} rx="14" fill={tint} />
      {/* 星のキャラクター */}
      <g transform="translate(100 128)">
        <path
          d="M0 -62 L17 -20 L62 -20 L26 8 L39 52 L0 26 L-39 52 L-26 8 L-62 -20 L-17 -20 Z"
          fill="#FFC93C"
          stroke={INK}
          strokeWidth="5"
          strokeLinejoin="round"
        />
        <circle cx="-11" cy="-2" r="5" fill={INK} />
        <circle cx="11" cy="-2" r="5" fill={INK} />
        <path d="M-12 12 Q 0 24 12 12" fill="none" stroke={INK} strokeWidth="4.5" strokeLinecap="round" />
        <circle cx="-22" cy="10" r="5" fill={accent} opacity="0.5" />
        <circle cx="22" cy="10" r="5" fill={accent} opacity="0.5" />
      </g>
      <text x="100" y="236" textAnchor="middle" className="cf" fontSize="30" fill={accent} letterSpacing="2">
        JOKER
      </text>
      <path transform="translate(34 42)" d="M0 -12 L3.5 -4 L12 -3.5 L5.5 2 L7.5 10.5 L0 6 L-7.5 10.5 L-5.5 2 L-12 -3.5 L-3.5 -4 Z" fill={accent} />
      <path transform="translate(166 238) rotate(180)" d="M0 -12 L3.5 -4 L12 -3.5 L5.5 2 L7.5 10.5 L0 6 L-7.5 10.5 L-5.5 2 L-12 -3.5 L-3.5 -4 Z" fill={accent} />
    </g>
  );
}

function Back({ back }: { back: BackId }) {
  return (
    <g>
      <rect x="3" y="3" width={W - 6} height={H - 6} rx="20" style={{ fill: 'var(--back-1, #4DA3FF)' }} stroke={INK} strokeWidth="5" />
      <rect x="16" y="16" width={W - 32} height={H - 32} rx="12" fill={`url(#p-${back})`} />
      <rect x="16" y="16" width={W - 32} height={H - 32} rx="12" fill="none" stroke="#fff" strokeWidth="4" opacity="0.85" />
      <g transform="translate(100 140)">
        <circle r="36" fill="#fff" stroke={INK} strokeWidth="4" />
        <SuitShape suit="S" x={-11} y={-11} size={20} />
        <SuitShape suit="H" x={11} y={-11} size={20} />
        <SuitShape suit="D" x={-11} y={11} size={20} />
        <SuitShape suit="C" x={11} y={11} size={20} />
      </g>
    </g>
  );
}

export const CardSvg = memo(
  function CardSvg({ card, back }: { card: Card | null; back: BackId }) {
    return (
      <svg viewBox={`0 0 ${W} ${H}`} className="card-svg" aria-hidden>
        {card === null ? <Back back={back} /> : card.suit === 'X' ? <Joker card={card} /> : <Face card={card} />}
      </svg>
    );
  },
  // カードの中身は ID で決まるので、状態が届くたびに新しく作られるオブジェクトでも描き直さない
  (a, b) => a.back === b.back && (a.card?.id ?? null) === (b.card?.id ?? null),
);

/** 裏面の柄（白い模様を背景色の上に重ねる） */
export function CardDefs() {
  const white = { fill: '#fff' };
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
      <defs>
        <pattern id="p-dots" width="22" height="22" patternUnits="userSpaceOnUse">
          <circle cx="5.5" cy="5.5" r="3.6" style={white} opacity="0.4" />
          <circle cx="16.5" cy="16.5" r="3.6" style={white} opacity="0.4" />
        </pattern>
        <pattern id="p-stripes" width="20" height="20" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="9" height="20" style={white} opacity="0.3" />
        </pattern>
        <pattern id="p-check" width="28" height="28" patternUnits="userSpaceOnUse">
          <rect width="14" height="14" style={white} opacity="0.28" />
          <rect x="14" y="14" width="14" height="14" style={white} opacity="0.28" />
        </pattern>
        <pattern id="p-wave" width="36" height="18" patternUnits="userSpaceOnUse">
          <path d="M0 9 Q 9 0 18 9 T 36 9" fill="none" stroke="#fff" strokeWidth="3.5" opacity="0.45" />
        </pattern>
      </defs>
    </svg>
  );
}
