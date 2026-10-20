// トランプの絵柄（SVG）。グラデーションや和柄は CardDefs で一度だけ定義して共有する。

import { memo } from 'react';
import type { Card } from '../../engine/cards';
import type { BackId } from '../settings';

const W = 200;
const H = 280;

// ───────────── スート ─────────────

export const SUIT_PATH: Record<'S' | 'H' | 'D', string> = {
  H: 'M50 90 C 22 68 2 50 6 30 C 10 10 36 4 50 26 C 64 4 90 10 94 30 C 98 50 78 68 50 90 Z',
  D: 'M50 4 Q 66 30 88 50 Q 66 70 50 96 Q 34 70 12 50 Q 34 30 50 4 Z',
  S: 'M50 6 C 64 30 96 44 92 66 C 89 82 70 86 56 74 C 58 84 62 90 70 95 L 30 95 C 38 90 42 84 44 74 C 30 86 11 82 8 66 C 4 44 36 30 50 6 Z',
};

export function SuitShape({ suit, x, y, size, rot = 0, fill }: { suit: string; x: number; y: number; size: number; rot?: number; fill?: string }) {
  const s = size / 100;
  const f = fill ?? (suit === 'H' || suit === 'D' ? 'url(#g-red)' : 'url(#g-black)');
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

const L = 64;
const C = 100;
const R = 136;
const PIPS: Record<number, [number, number][]> = {
  2: [[C, 66], [C, 214]],
  3: [[C, 66], [C, 140], [C, 214]],
  4: [[L, 66], [R, 66], [L, 214], [R, 214]],
  5: [[L, 66], [R, 66], [C, 140], [L, 214], [R, 214]],
  6: [[L, 66], [R, 66], [L, 140], [R, 140], [L, 214], [R, 214]],
  7: [[L, 66], [R, 66], [C, 103], [L, 140], [R, 140], [L, 214], [R, 214]],
  8: [[L, 66], [R, 66], [C, 103], [L, 140], [R, 140], [C, 177], [L, 214], [R, 214]],
  9: [[L, 66], [R, 66], [L, 115], [R, 115], [C, 140], [L, 165], [R, 165], [L, 214], [R, 214]],
  10: [[L, 66], [R, 66], [C, 91], [L, 115], [R, 115], [L, 165], [R, 165], [C, 189], [L, 214], [R, 214]],
};

const RANK_TEXT: Record<number, string> = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A', 15: '2' };
const COURT: Record<number, { kanji: string; name: string }> = {
  11: { kanji: '侍', name: 'JACK' },
  12: { kanji: '妃', name: 'QUEEN' },
  13: { kanji: '王', name: 'KING' },
};

function rankText(rank: number) {
  return RANK_TEXT[rank] ?? String(rank);
}

function Corner({ card, color }: { card: Card; color: string }) {
  const t = rankText(card.rank);
  return (
    <g>
      <text x="25" y="45" textAnchor="middle" className="ci-rank" fill={color} fontSize={t.length > 1 ? 30 : 36} letterSpacing={t.length > 1 ? -3 : 0}>
        {t}
      </text>
      <SuitShape suit={card.suit} x={25} y={63} size={22} />
    </g>
  );
}

function Emblem({ rank, y, color }: { rank: number; y: number; color: string }) {
  // K = 王冠, Q = 花冠（桜）, J = 兜
  if (rank === 13)
    return (
      <g transform={`translate(100 ${y})`} fill={color}>
        <path d="M-34 14 L-38 -14 L-20 0 L0 -22 L20 0 L38 -14 L34 14 Z" />
        <rect x="-35" y="15" width="70" height="7" rx="2" />
        <circle cx="-38" cy="-16" r="4" />
        <circle cx="0" cy="-25" r="4.5" />
        <circle cx="38" cy="-16" r="4" />
      </g>
    );
  if (rank === 12)
    return (
      <g transform={`translate(100 ${y})`} fill={color}>
        {[0, 72, 144, 216, 288].map((a) => (
          <path key={a} transform={`rotate(${a})`} d="M0 -4 C -9 -10 -10 -22 -3 -27 L 0 -23 L 3 -27 C 10 -22 9 -10 0 -4 Z" />
        ))}
        <circle r="4.5" fill="var(--court-bg-in, #2a0c10)" />
      </g>
    );
  return (
    <g transform={`translate(100 ${y})`} fill={color}>
      <path d="M-30 10 C -30 -12 -16 -22 0 -22 C 16 -22 30 -12 30 10 Z" />
      <path d="M-38 12 L38 12 L30 20 L-30 20 Z" />
      <path d="M-6 -22 L-22 -44 L-10 -24 Z M6 -22 L22 -44 L10 -24 Z" />
      <circle cy="-8" r="5" fill="var(--court-bg-in, #2a0c10)" />
    </g>
  );
}

function Face({ card }: { card: Card }) {
  const red = card.suit === 'H' || card.suit === 'D';
  const color = red ? '#b5122b' : '#16182b';
  const r = card.rank;

  let center: JSX.Element;
  if (r >= 11 && r <= 13) {
    const ct = COURT[r];
    center = (
      <g>
        <rect x="44" y="40" width="112" height="200" rx="10" fill={red ? 'url(#g-court-red)' : 'url(#g-court-black)'} />
        <rect x="44" y="40" width="112" height="200" rx="10" fill="url(#p-seigaiha-face)" opacity="0.35" />
        <rect x="48" y="44" width="104" height="192" rx="8" fill="none" stroke="url(#g-gold)" strokeWidth="1.6" />
        <rect x="52" y="48" width="96" height="184" rx="6" fill="none" stroke="url(#g-gold)" strokeWidth="0.6" opacity="0.7" />
        <Emblem rank={r} y={84} color="url(#g-gold)" />
        <text x="100" y="178" textAnchor="middle" className="court-letter" fill="url(#g-gold)">
          {rankText(r)}
        </text>
        <line x1="66" y1="194" x2="134" y2="194" stroke="url(#g-gold)" strokeWidth="0.8" />
        <text x="100" y="222" textAnchor="middle" className="court-kanji" fill="url(#g-gold)">
          {ct.kanji}
        </text>
        <SuitShape suit={card.suit} x={66} y={213} size={15} fill="url(#g-gold)" />
        <SuitShape suit={card.suit} x={134} y={213} size={15} fill="url(#g-gold)" />
      </g>
    );
  } else if (r === 14) {
    const sp = card.suit === 'S';
    center = (
      <g>
        {sp && (
          <g>
            <circle cx="100" cy="140" r="64" fill="none" stroke="url(#g-gold)" strokeWidth="2" />
            <circle cx="100" cy="140" r="58" fill="none" stroke="url(#g-gold)" strokeWidth="0.6" strokeDasharray="2 3" />
            {Array.from({ length: 16 }, (_, i) => (
              <circle key={i} cx={100 + Math.cos((i / 16) * Math.PI * 2) * 64} cy={140 + Math.sin((i / 16) * Math.PI * 2) * 64} r="2.4" fill="url(#g-gold)" />
            ))}
          </g>
        )}
        <SuitShape suit={card.suit} x={100} y={140} size={sp ? 86 : 96} />
        {sp && (
          <text x="100" y="228" textAnchor="middle" className="ace-word" fill="url(#g-gold-dark)">
            DAIFUGO
          </text>
        )}
      </g>
    );
  } else {
    const pips = PIPS[r] ?? PIPS[2];
    const size = r === 10 || r === 9 ? 34 : 38;
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
      <rect x="1" y="1" width={W - 2} height={H - 2} rx="14" fill="url(#g-paper)" stroke="#bfa66a" strokeWidth="1.5" />
      <rect x="1" y="1" width={W - 2} height={H - 2} rx="14" fill="url(#p-paper)" opacity="0.5" />
      <rect x="8" y="8" width={W - 16} height={H - 16} rx="10" fill="none" stroke="url(#g-gold)" strokeWidth="1.2" opacity="0.8" />
      {center}
      <Corner card={card} color={color} />
      <g transform={`rotate(180 ${W / 2} ${H / 2})`}>
        <Corner card={card} color={color} />
      </g>
    </g>
  );
}

function Joker({ card }: { card: Card }) {
  const two = card.id === 'X2';
  return (
    <g>
      <rect x="1" y="1" width={W - 2} height={H - 2} rx="14" fill={two ? 'url(#g-joker2)' : 'url(#g-joker)'} stroke="#d4af37" strokeWidth="2" />
      <rect x="1" y="1" width={W - 2} height={H - 2} rx="14" fill="url(#p-stars)" opacity="0.8" />
      <rect x="8" y="8" width={W - 16} height={H - 16} rx="10" fill="none" stroke="url(#g-gold)" strokeWidth="1.4" />
      {/* 道化の帽子と仮面 */}
      <g transform="translate(100 134) scale(0.8)">
        <path d="M-46 -6 C -50 -40 -70 -60 -78 -58 C -60 -50 -40 -30 -26 -18 Z" fill="url(#g-gold)" />
        <path d="M46 -6 C 50 -40 70 -60 78 -58 C 60 -50 40 -30 26 -18 Z" fill="url(#g-gold)" />
        <path d="M-26 -18 C -18 -60 0 -78 8 -80 C 2 -60 4 -40 10 -20 Z" fill={two ? '#e94560' : '#7b2ff7'} stroke="url(#g-gold)" strokeWidth="1.4" />
        <circle cx="-78" cy="-58" r="6" fill="url(#g-gold)" />
        <circle cx="78" cy="-58" r="6" fill="url(#g-gold)" />
        <circle cx="8" cy="-80" r="6" fill="url(#g-gold)" />
        <path d="M-46 -8 C -46 40 -20 58 0 58 C 20 58 46 40 46 -8 C 30 -20 -30 -20 -46 -8 Z" fill="#f6efe0" stroke="url(#g-gold)" strokeWidth="2" />
        <path d="M-30 10 Q -20 0 -10 10 Q -20 16 -30 10 Z" fill="#1b1030" />
        <path d="M30 10 Q 20 0 10 10 Q 20 16 30 10 Z" fill="#1b1030" />
        <path d="M-20 30 Q 0 48 20 30" stroke="#b5122b" strokeWidth="4" fill="none" strokeLinecap="round" />
        <path d="M-30 -2 L-24 -12 M30 -2 L24 -12" stroke="#1b1030" strokeWidth="2" />
        <circle cx="-26" cy="26" r="5" fill="#e94560" opacity="0.4" />
        <circle cx="26" cy="26" r="5" fill="#e94560" opacity="0.4" />
        <path d="M-50 54 L-30 66 L-10 56 L0 70 L10 56 L30 66 L50 54 L40 76 L-40 76 Z" fill="url(#g-gold)" />
      </g>
      <text x="100" y="230" textAnchor="middle" className="joker-word" fill="url(#g-gold)">
        JOKER
      </text>
      <text x="22" y="42" textAnchor="middle" className="joker-corner" fill="url(#g-gold)">J</text>
      <text x="22" y="64" textAnchor="middle" className="joker-corner" fill="url(#g-gold)">K</text>
      <text x="22" y="92" textAnchor="middle" className="joker-kanji" fill="url(#g-gold)">道</text>
      <text x="22" y="114" textAnchor="middle" className="joker-kanji" fill="url(#g-gold)">化</text>
      <g transform={`rotate(180 ${W / 2} ${H / 2})`}>
        <text x="22" y="42" textAnchor="middle" className="joker-corner" fill="url(#g-gold)">J</text>
        <text x="22" y="64" textAnchor="middle" className="joker-corner" fill="url(#g-gold)">K</text>
      </g>
    </g>
  );
}

function Back({ back }: { back: BackId }) {
  return (
    <g>
      <rect x="1" y="1" width={W - 2} height={H - 2} rx="14" fill="url(#g-back)" stroke="#c9a649" strokeWidth="2" />
      <rect x="12" y="12" width={W - 24} height={H - 24} rx="8" fill={`url(#p-${back})`} />
      <rect x="12" y="12" width={W - 24} height={H - 24} rx="8" fill="url(#g-back-vignette)" />
      <rect x="8" y="8" width={W - 16} height={H - 16} rx="10" fill="none" stroke="url(#g-gold)" strokeWidth="2" />
      <rect x="14" y="14" width={W - 28} height={H - 28} rx="6" fill="none" stroke="url(#g-gold)" strokeWidth="0.8" />
      <g transform="translate(100 140)">
        <circle r="40" fill="var(--back-bg-2, #3b0a14)" stroke="url(#g-gold)" strokeWidth="2.5" />
        <circle r="34" fill="none" stroke="url(#g-gold)" strokeWidth="0.8" />
        {[0, 90, 180, 270].map((a) => (
          <g key={a} transform={`rotate(${a}) translate(0 -46)`}>
            <path d="M0 -8 L6 0 L0 8 L-6 0 Z" fill="url(#g-gold)" />
          </g>
        ))}
        <text y="14" textAnchor="middle" className="back-kanji" fill="url(#g-gold)">
          富
        </text>
      </g>
    </g>
  );
}

export const CardSvg = memo(function CardSvg({ card, back }: { card: Card | null; back: BackId }) {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="card-svg" aria-hidden>
      {card === null ? <Back back={back} /> : card.suit === 'X' ? <Joker card={card} /> : <Face card={card} />}
    </svg>
  );
},
// カードの中身は ID で決まるので、状態が届くたびに新しく作られるオブジェクトでも描き直さない
(a, b) => a.back === b.back && (a.card?.id ?? null) === (b.card?.id ?? null));

// ───────────── 共有定義（グラデーション・和柄） ─────────────

function asanohaPath(w: number): string {
  // 正三角形格子の辺 + 各三角形の頂点から重心への線
  const h = (w * Math.sqrt(3)) / 2;
  const seg: string[] = [];
  const P = (x: number, y: number) => `${x.toFixed(2)} ${y.toFixed(2)}`;
  for (let row = -1; row <= 2; row++) {
    for (let col = -1; col <= 2; col++) {
      const ox = col * w + (row % 2 !== 0 ? w / 2 : 0);
      const oy = row * h;
      const tris = [
        [[ox, oy + h], [ox + w / 2, oy], [ox + w, oy + h]],
        [[ox + w / 2, oy], [ox + w, oy + h], [ox + (3 * w) / 2, oy]],
      ];
      for (const t of tris) {
        const cx = (t[0][0] + t[1][0] + t[2][0]) / 3;
        const cy = (t[0][1] + t[1][1] + t[2][1]) / 3;
        seg.push(`M${P(t[0][0], t[0][1])}L${P(t[1][0], t[1][1])}L${P(t[2][0], t[2][1])}Z`);
        for (const v of t) seg.push(`M${P(v[0], v[1])}L${P(cx, cy)}`);
      }
    }
  }
  return seg.join('');
}

export function CardDefs() {
  const aw = 24;
  const ah = aw * Math.sqrt(3);
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
      <defs>
        <linearGradient id="g-paper" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fffdf6" />
          <stop offset="0.55" stopColor="#f8f1e0" />
          <stop offset="1" stopColor="#efe2c4" />
        </linearGradient>
        <pattern id="p-paper" width="6" height="6" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="0.5" fill="#c8b48a" opacity="0.35" />
          <circle cx="4" cy="4" r="0.4" fill="#c8b48a" opacity="0.25" />
        </pattern>
        <linearGradient id="g-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff1b8" />
          <stop offset="0.3" stopColor="#e2b552" />
          <stop offset="0.55" stopColor="#a8761e" />
          <stop offset="0.8" stopColor="#f3d27a" />
          <stop offset="1" stopColor="#b8862b" />
        </linearGradient>
        <linearGradient id="g-gold-dark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c99a3a" />
          <stop offset="1" stopColor="#7a5414" />
        </linearGradient>
        <linearGradient id="g-red" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e2334b" />
          <stop offset="1" stopColor="#9e0b20" />
        </linearGradient>
        <linearGradient id="g-black" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a3f5c" />
          <stop offset="1" stopColor="#0c0e1a" />
        </linearGradient>
        <radialGradient id="g-court-red" cx="0.5" cy="0.4" r="0.8">
          <stop offset="0" stopColor="#8f1a2a" />
          <stop offset="1" stopColor="#3d0710" />
        </radialGradient>
        <radialGradient id="g-court-black" cx="0.5" cy="0.4" r="0.8">
          <stop offset="0" stopColor="#2b3566" />
          <stop offset="1" stopColor="#0c1030" />
        </radialGradient>
        <radialGradient id="g-joker" cx="0.5" cy="0.45" r="0.8">
          <stop offset="0" stopColor="#3d1c6e" />
          <stop offset="0.6" stopColor="#1b0b33" />
          <stop offset="1" stopColor="#07030f" />
        </radialGradient>
        <radialGradient id="g-joker2" cx="0.5" cy="0.45" r="0.8">
          <stop offset="0" stopColor="#6e1c38" />
          <stop offset="0.6" stopColor="#330b1a" />
          <stop offset="1" stopColor="#0f0307" />
        </radialGradient>
        <pattern id="p-stars" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M8 6 l1.2 3 3 1.2 -3 1.2 -1.2 3 -1.2 -3 -3 -1.2 3 -1.2 z" fill="#f3d27a" opacity="0.5" />
          <circle cx="30" cy="26" r="1" fill="#f3d27a" opacity="0.6" />
          <circle cx="22" cy="8" r="0.6" fill="#fff" opacity="0.5" />
        </pattern>
        <linearGradient id="g-back" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--back-bg-1, #5a0f1f)' }} />
          <stop offset="1" style={{ stopColor: 'var(--back-bg-2, #24050c)' }} />
        </linearGradient>
        <radialGradient id="g-back-vignette" cx="0.5" cy="0.5" r="0.7">
          <stop offset="0.5" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.45" />
        </radialGradient>
        <pattern id="p-asanoha" width={aw} height={ah} patternUnits="userSpaceOnUse">
          <path d={asanohaPath(aw)} fill="none" style={{ stroke: 'var(--back-line, #d4af37)' }} strokeWidth="0.7" opacity="0.55" />
        </pattern>
        <pattern id="p-seigaiha" width="32" height="16" patternUnits="userSpaceOnUse">
          {[0, 16, 32].map((x) =>
            [14, 10, 6].map((r) => <circle key={`${x}-${r}`} cx={x} cy="16" r={r} fill="none" style={{ stroke: 'var(--back-line, #d4af37)' }} strokeWidth="0.8" opacity="0.6" />),
          )}
          {[14, 10, 6].map((r) => (
            <circle key={`m${r}`} cx="16" cy="8" r={r} fill="none" style={{ stroke: 'var(--back-line, #d4af37)' }} strokeWidth="0.8" opacity="0.6" />
          ))}
        </pattern>
        <pattern id="p-seigaiha-face" width="24" height="12" patternUnits="userSpaceOnUse">
          {[0, 24].map((x) => [10, 6.5, 3].map((r) => <circle key={`${x}-${r}`} cx={x} cy="12" r={r} fill="none" stroke="#f3d27a" strokeWidth="0.6" />))}
          {[10, 6.5, 3].map((r) => (
            <circle key={`m${r}`} cx="12" cy="6" r={r} fill="none" stroke="#f3d27a" strokeWidth="0.6" />
          ))}
        </pattern>
        <pattern id="p-kikko" width="30" height="52" patternUnits="userSpaceOnUse">
          <path
            d="M15 0 L30 8.66 L30 26 L15 34.64 L0 26 L0 8.66 Z M15 34.64 L15 52 M0 26 L0 8.66 M15 4 L26 10.4 L26 24 L15 30.4 L4 24 L4 10.4 Z"
            fill="none"
            style={{ stroke: 'var(--back-line, #d4af37)' }}
            strokeWidth="0.8"
            opacity="0.6"
          />
        </pattern>
        <pattern id="p-shippo" width="24" height="24" patternUnits="userSpaceOnUse">
          {[[12, 12], [0, 0], [24, 0], [0, 24], [24, 24]].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="12" fill="none" style={{ stroke: 'var(--back-line, #d4af37)' }} strokeWidth="0.8" opacity="0.6" />
          ))}
          <circle cx="12" cy="0" r="1.5" style={{ fill: 'var(--back-line, #d4af37)' }} opacity="0.6" />
          <circle cx="0" cy="12" r="1.5" style={{ fill: 'var(--back-line, #d4af37)' }} opacity="0.6" />
        </pattern>
      </defs>
    </svg>
  );
}
