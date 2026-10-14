// 革命・八切りなどの大きな演出

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect } from 'react';
import type { EffectItem } from '../client';
import { burst, confetti, shockwave } from './FxCanvas';
import { SuitShape } from './CardArt';

const TONE_COLORS: Record<string, string[]> = {
  gold: ['#fff1b8', '#f3d27a', '#e2b552', '#ffffff'],
  red: ['#ff4d5e', '#ff9a8b', '#f3d27a', '#ffffff'],
  blue: ['#4cc9f0', '#a0e7ff', '#ffffff'],
  purple: ['#c77dff', '#e0aaff', '#f3d27a'],
  green: ['#80ed99', '#c7f9cc', '#ffffff'],
  ink: ['#9aa0b5', '#ffffff', '#5c6070'],
};

function Deco({ kind }: { kind: string }) {
  switch (kind) {
    case 'revolution':
    case 'counter':
    case 'gekokujo':
    case 'tenpen':
      return (
        <svg className="fx-deco fx-cracks" viewBox="-200 -120 400 240">
          {Array.from({ length: 14 }, (_, i) => {
            const a = (i / 14) * Math.PI * 2 + (i % 2) * 0.2;
            const r1 = 40 + (i % 3) * 10;
            const r2 = 160 + (i % 4) * 30;
            const mx = Math.cos(a + 0.12) * ((r1 + r2) / 2);
            const my = Math.sin(a + 0.12) * ((r1 + r2) / 2) * 0.6;
            return (
              <motion.path
                key={i}
                d={`M${Math.cos(a) * r1} ${Math.sin(a) * r1 * 0.6} L${mx} ${my} L${Math.cos(a) * r2} ${Math.sin(a) * r2 * 0.6}`}
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.35, delay: 0.12 + i * 0.015 }}
              />
            );
          })}
        </svg>
      );
    case 'eightCut':
      return (
        <svg className="fx-deco fx-slash" viewBox="0 0 400 240" preserveAspectRatio="none">
          <motion.line x1="-20" y1="230" x2="420" y2="10" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.22, ease: 'easeIn' }} />
          <motion.line x1="-20" y1="236" x2="420" y2="16" className="thin" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.22, delay: 0.05 }} />
        </svg>
      );
    case 'lock':
      return (
        <svg className="fx-deco fx-lock" viewBox="-60 -60 120 120">
          <motion.g initial={{ y: -60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 14 }}>
            <path d="M-22 -6 L-22 -22 C -22 -44 22 -44 22 -22 L22 -6" fill="none" strokeWidth="9" />
            <rect x="-32" y="-8" width="64" height="50" rx="8" />
            <circle cy="14" r="7" className="hole" />
            <rect x="-3" y="16" width="6" height="14" className="hole" />
          </motion.g>
        </svg>
      );
    case 'reverse':
    case 'elevenBack':
      return (
        <motion.svg
          className="fx-deco fx-arrows"
          viewBox="-60 -60 120 120"
          initial={{ rotate: 0 }}
          animate={{ rotate: kind === 'reverse' ? -360 : 360 }}
          transition={{ duration: 0.9, ease: 'easeInOut' }}
        >
          <path d="M-40 0 A40 40 0 0 1 34 -20" fill="none" strokeWidth="6" />
          <path d="M40 0 A40 40 0 0 1 -34 20" fill="none" strokeWidth="6" />
          <path d="M34 -20 L40 -42 L18 -30 Z" className="tip" />
          <path d="M-34 20 L-40 42 L-18 30 Z" className="tip" />
        </motion.svg>
      );
    case 'daifugo':
      return (
        <motion.svg className="fx-deco fx-rays" viewBox="-100 -100 200 200" animate={{ rotate: 30 }} transition={{ duration: 1.2 }}>
          {Array.from({ length: 18 }, (_, i) => (
            <path key={i} transform={`rotate(${i * 20})`} d="M-5 -14 L0 -100 L5 -14 Z" />
          ))}
        </motion.svg>
      );
    case 'spade3':
      return (
        <svg className="fx-deco fx-spade" viewBox="0 0 100 100">
          <SuitShape suit="S" x={50} y={50} size={90} fill="url(#g-gold)" />
        </svg>
      );
    case 'bomber':
      return (
        <svg className="fx-deco fx-boom" viewBox="-100 -100 200 200">
          <motion.path
            d="M0 -90 L18 -40 L70 -60 L40 -15 L95 5 L40 22 L62 72 L14 42 L0 95 L-14 42 L-62 72 L-40 22 L-95 5 L-40 -15 L-70 -60 L-18 -40 Z"
            initial={{ scale: 0.1 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 10 }}
          />
        </svg>
      );
    default:
      return null;
  }
}

export function EffectLayer({ effect }: { effect: EffectItem | null }) {
  useEffect(() => {
    if (!effect) return;
    const x = window.innerWidth / 2;
    const y = window.innerHeight * 0.45;
    const colors = TONE_COLORS[effect.tone] ?? TONE_COLORS.gold;
    switch (effect.kind) {
      case 'revolution':
      case 'counter':
      case 'gekokujo':
      case 'tenpen':
        shockwave(x, y, colors[0]);
        burst({ x, y, count: 120, colors, speed: 13, gravity: 0.05, life: 90, size: 4 });
        break;
      case 'daifugo':
        confetti();
        burst({ x, y, count: 80, colors, speed: 10, gravity: 0.1, size: 4 });
        break;
      case 'eightCut':
        burst({ x, y, count: 70, colors, speed: 12, spread: 0.5, angle: -0.46, gravity: 0.02, life: 50, size: 3 });
        burst({ x, y, count: 70, colors, speed: 12, spread: 0.5, angle: Math.PI - 0.46, gravity: 0.02, life: 50, size: 3 });
        break;
      case 'bomber':
        shockwave(x, y, '#ff4d5e');
        burst({ x, y, count: 140, colors: ['#ff4d5e', '#ffb703', '#fb8500', '#fff'], speed: 14, gravity: 0.15, life: 80, size: 5 });
        break;
      case 'deal':
        break;
      default:
        burst({ x, y, count: 50, colors, speed: 8, gravity: 0.08, size: 3.5 });
    }
  }, [effect?.id]);

  return (
    <div className="fx-layer" aria-live="polite">
      <AnimatePresence>
        {effect && (
          <motion.div
            key={effect.id}
            className={`fx fx-${effect.kind} tone-${effect.tone}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.25 } }}
          >
            <div className="fx-backdrop" />
            <Deco kind={effect.kind} />
            <motion.div
              className="fx-title"
              initial={effect.kind === 'deal' ? { y: 20, opacity: 0, letterSpacing: '0.6em' } : { scale: 2.6, opacity: 0, rotate: -6 }}
              animate={effect.kind === 'deal' ? { y: 0, opacity: 1, letterSpacing: '0.2em' } : { scale: 1, opacity: 1, rotate: 0 }}
              transition={effect.kind === 'deal' ? { duration: 0.6 } : { type: 'spring', stiffness: 520, damping: 18 }}
            >
              {effect.title}
            </motion.div>
            {effect.sub && (
              <motion.div className="fx-sub" initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.18 }}>
                {effect.sub}
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
