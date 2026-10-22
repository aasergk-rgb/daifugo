import { AnimatePresence, motion } from 'framer-motion';
import { DIFFICULTY_LABEL } from '../../engine/ai';
import { rankTitles } from '../../engine/rules';
import type { GameView } from '../../engine/view';
import { STAMPS, SeatInfo } from '../../net/protocol';
import { Avatar } from './Avatar';
import { Crown } from './Icon';
import type { SeatFx } from '../client';

export interface SeatPos {
  x: number;
  y: number;
  side: 'left' | 'right' | 'top' | 'bottom';
}

/** 卓上の席の位置（自分は下、他は時計回りに左→上→右） */
export function seatLayout(n: number, me: number, w: number, h: number): SeatPos[] {
  const out: SeatPos[] = [];
  const portrait = w < h * 0.95;
  const cx = w / 2;
  const cy = h * 0.5;
  for (let p = 0; p < n; p++) {
    const k = (p - me + n) % n;
    if (k === 0) {
      out[p] = { x: cx, y: h - 8, side: 'bottom' };
      continue;
    }
    const m = n - 1;
    let a: number;
    if (portrait) {
      const lo = m <= 2 ? 205 : 192;
      const hi = 540 - lo;
      a = m === 1 ? 270 : lo + ((k - 1) * (hi - lo)) / (m - 1);
    } else if (m === 1) a = 270;
    else if (m === 2) a = 215 + (k - 1) * 110;
    else a = 180 + ((k - 1) * 180) / (m - 1);
    const rad = (a * Math.PI) / 180;
    const rx = portrait ? w * 0.4 : w * 0.43;
    const ry = portrait ? h * 0.4 : h * 0.4;
    const x = cx + Math.cos(rad) * rx;
    const y = cy + Math.sin(rad) * ry;
    out[p] = { x, y, side: a < 200 ? 'left' : a > 340 ? 'right' : 'top' };
  }
  return out;
}

interface Props {
  p: number;
  view: GameView;
  seat: SeatInfo | undefined;
  pos: SeatPos;
  active: boolean;
  fx?: SeatFx;
  deadline: number | null;
  now: number;
  turnSeconds: number;
  compact: boolean;
}

export function Seat({ p, view, seat, pos, active, fx, deadline, now, turnSeconds, compact }: Props) {
  const titles = rankTitles(view.n);
  const prev = view.prevRanks ? titles[view.prevRanks[p]] : null;
  const out = view.out[p];
  const passed = view.passed.includes(p) && view.field.length > 0;
  const count = view.handCounts[p];
  let stamp: string | null = null;
  if (out === 'win') stamp = titles[view.winners.indexOf(p)] ?? 'あがり';
  if (out === 'foul') stamp = '反則';
  if (out === 'miyako') stamp = '都落ち';
  if (view.ranks && (view.phase === 'roundEnd' || view.phase === 'matchEnd')) stamp = titles[view.ranks[p]];
  const remain = active && deadline ? Math.max(0, deadline - now) : 0;
  const ratio = turnSeconds > 0 && remain ? Math.min(1, remain / (turnSeconds * 1000)) : 0;
  const fan = Math.min(count, compact ? 6 : 10);

  return (
    <div
      className={`seat side-${pos.side} ${active ? 'is-active' : ''} ${out ? 'is-out' : ''} ${compact ? 'is-compact' : ''}`}
      style={{ left: pos.x, top: pos.y }}
      data-seat={p}
    >
      <div className="seat-cards" aria-label={`${count}枚`}>
        {Array.from({ length: fan }, (_, i) => (
          <span key={i} className="mini-back" style={{ transform: `rotate(${(i - (fan - 1) / 2) * 7}deg) translateY(${Math.abs(i - (fan - 1) / 2) * 1.5}px)` }} />
        ))}
        <span className="seat-count">{count}</span>
      </div>
      <div className="seat-avatar">
        {active && <span className="turn-ring" />}
        {ratio > 0 && (
          <svg className="timer-ring" viewBox="0 0 40 40">
            <circle cx="20" cy="20" r="18" pathLength="1" strokeDasharray={`${ratio} 1`} />
          </svg>
        )}
        <Avatar id={seat?.avatar ?? p} />
        {seat && !seat.connected && <span className="seat-offline" title="切断中（CPUが代行）">切断中</span>}
      </div>
      <div className="seat-plate">
        <div className="seat-name">
          {seat?.isHost && <span className="host-mark">◆</span>}
          {view.names[p]}
        </div>
        <div className="seat-sub">
          {prev && <span className={`rank-chip r${view.prevRanks![p]}`}>{prev}</span>}
          {seat?.kind === 'cpu' && <span className="cpu-chip">CPU {DIFFICULTY_LABEL[seat.difficulty]}</span>}
          <span className="score-chip">{view.scores[p]}pt</span>
        </div>
      </div>
      {passed && !out && <div className="pass-tag">PASS</div>}
      <AnimatePresence>
        {stamp && (
          <motion.div
            key={stamp}
            className={`rank-stamp ${out === 'foul' || out === 'miyako' ? 'is-bad' : ''} ${stamp === '大富豪' ? 'is-top' : ''}`}
            initial={{ scale: 0.2, opacity: 0, rotate: -20 }}
            animate={{ scale: 1, opacity: 1, rotate: -6 }}
            transition={{ type: 'spring', stiffness: 500, damping: 16 }}
          >
            {stamp === '大富豪' && <Crown size={16} />}
            {stamp}
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {fx && (
          <motion.div
            key={fx.key}
            className={`bubble bubble-${fx.kind}`}
            initial={{ scale: 0.4, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ type: 'spring', stiffness: 500, damping: 20 }}
          >
            {fx.kind === 'stamp' ? STAMPS[Number(fx.text)] ?? '' : fx.text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
