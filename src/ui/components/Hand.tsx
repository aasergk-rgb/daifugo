import { AnimatePresence } from 'framer-motion';
import type { Card } from '../../engine/cards';
import { useLite } from '../perf';
import { PlayingCard } from './PlayingCard';

interface Props {
  cards: Card[];
  width: number;
  cw: number;
  selected: Set<string>;
  playable: Set<string> | null;
  fresh: Set<string>;
  onToggle: (id: string) => void;
  dealKey: number;
  dealing: boolean;
  interactive: boolean;
}

export function Hand({ cards, width, cw, selected, playable, fresh, onToggle, dealKey, dealing, interactive }: Props) {
  const lite = useLite();
  const k = cards.length;
  const spread = Math.min(2.6, 34 / Math.max(k, 1));
  // 扇形に傾けた端のカードがはみ出さないよう、回転ぶんの余白を確保する
  const tilt = Math.sin((((k - 1) / 2) * spread * Math.PI) / 180) * cw * 1.4 * 1.3;
  const avail = Math.max(cw, width - 24 - tilt * 2);
  const gap = k > 1 ? Math.min(cw * 0.7, (avail - cw) / (k - 1)) : 0;
  const total = cw + gap * (k - 1);
  return (
    <div className="hand" style={{ height: cw * 1.4 + 40 }}>
      <AnimatePresence>
        {cards.map((c, i) => {
          const mid = (k - 1) / 2;
          const off = i - mid;
          const x = -total / 2 + i * gap;
          const sel = selected.has(c.id);
          const y = Math.abs(off) ** 2 * (spread * 0.12) + (sel ? -cw * 0.3 : 0);
          return (
            <PlayingCard
              key={`${dealKey}:${c.id}`}
              card={c}
              className="hand-card"
              style={{ width: cw, zIndex: i + 1 }}
              selected={sel}
              playable={!!playable?.has(c.id)}
              dim={!!playable && !playable.has(c.id) && !sel}
              fresh={fresh.has(c.id)}
              onClick={interactive ? () => onToggle(c.id) : undefined}
              initial={{ x: 0, y: -260, rotate: 0, opacity: 0, scale: 0.6 }}
              animate={{ x, y, rotate: off * spread, opacity: 1, scale: 1 }}
              exit={{ y: -200, opacity: 0, scale: 0.7, transition: { duration: 0.25 } }}
              transition={
                lite
                  ? { duration: 0.18, ease: 'easeOut', delay: dealing ? 0.2 + i * 0.03 : 0 }
                  : { type: 'spring', stiffness: 380, damping: 30, delay: dealing ? 0.3 + i * 0.05 : 0 }
              }
              whileHover={interactive && !lite ? { y: y - cw * 0.12 } : undefined}
              layout={false}
            />
          );
        })}
      </AnimatePresence>
    </div>
  );
}
