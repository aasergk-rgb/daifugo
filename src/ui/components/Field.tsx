import { AnimatePresence, motion } from 'framer-motion';
import { comboName } from '../../engine/combo';
import type { PlayRecord } from '../../engine/game';
import { PlayingCard } from './PlayingCard';
import type { SeatPos } from './Seat';

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

interface Props {
  plays: PlayRecord[];
  me: number | null;
  seats: SeatPos[];
  w: number;
  h: number;
  cw: number;
  names: string[];
  flushing: boolean;
  reduceMotion: boolean;
}

export function Field({ plays, me, seats, w, h, cw, names, flushing, reduceMotion }: Props) {
  const cx = w / 2;
  const cy = h * 0.5;
  const shown = plays.slice(-3);
  const last = plays[plays.length - 1];
  return (
    <div className="field" style={{ left: cx, top: cy }}>
      <AnimatePresence>
        {shown.map((rec, gi) => {
          const depth = shown.length - 1 - gi;
          const n = rec.cards.length;
          const gap = Math.min(cw * 0.62, (w * 0.6) / Math.max(1, n));
          const seat = seats[rec.player];
          const from = rec.player === me ? { x: 0, y: h * 0.55 } : seat ? { x: seat.x - cx, y: seat.y - cy } : { x: 0, y: -h };
          const key = rec.combo.cardIds.join('-');
          return (
            <motion.div
              key={key}
              className="field-play"
              initial={false}
              animate={{ y: -depth * cw * 0.22, scale: 1 - depth * 0.1, opacity: depth ? 0.72 - depth * 0.15 : 1, filter: depth ? 'brightness(0.65)' : 'brightness(1)' }}
              exit={{ x: w * 0.38, y: -h * 0.1, scale: 0.4, opacity: 0, rotate: 40, transition: { duration: 0.5, ease: 'easeIn' } }}
              transition={{ duration: 0.35 }}
              style={{ zIndex: 10 - depth }}
            >
              {rec.cards.map((c, i) => {
                const r = ((hash(c.id) % 9) - 4) * 0.9;
                const x = (i - (n - 1) / 2) * gap;
                return (
                  <PlayingCard
                    key={c.id}
                    card={c}
                    className="field-card"
                    style={{ width: cw, marginLeft: -cw / 2, marginTop: -cw * 0.7 }}
                    initial={reduceMotion ? { x, y: 0, opacity: 0 } : { x: from.x, y: from.y, rotate: r * 8 - 30, scale: 0.45, opacity: 0 }}
                    animate={{ x, y: 0, rotate: r, scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 260, damping: 24, delay: i * 0.04 }}
                  />
                );
              })}
            </motion.div>
          );
        })}
      </AnimatePresence>
      <AnimatePresence>
        {last && !flushing && (
          <motion.div
            key={last.combo.cardIds.join('-')}
            className="field-label"
            style={{ top: cw * 0.82 }}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ delay: 0.2 }}
          >
            <span className="fl-name">{names[last.player]}</span>
            <span className="fl-combo">{comboName(last.combo)}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
