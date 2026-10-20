// 革命・八切りなどの大きな演出

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect } from 'react';
import type { EffectItem } from '../client';
import { useLite } from '../perf';
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

/**
 * 演出の飾り。SVG 自体は動かさず、包んだ要素の transform / opacity だけを動かす
 * （SVG 内部を毎フレーム変えると、そのたびに全体を描き直すことになり重い）
 */
function Deco({ kind }: { kind: string }) {
  const pop = (className: string, svg: JSX.Element, anim: Record<string, any> = {}) => (
    <div className={`fx-deco ${className}`}>
      <motion.div
        className="fx-deco-inner"
        initial={anim.initial ?? { scale: 0.6, opacity: 0 }}
        animate={anim.animate ?? { scale: 1, opacity: 1 }}
        transition={anim.transition ?? { duration: 0.3, ease: 'easeOut' }}
      >
        {svg}
      </motion.div>
    </div>
  );
  switch (kind) {
    case 'revolution':
    case 'counter':
    case 'gekokujo':
    case 'tenpen':
      return pop(
        'fx-cracks',
        <svg viewBox="-200 -120 400 240">
          {Array.from({ length: 14 }, (_, i) => {
            const a = (i / 14) * Math.PI * 2 + (i % 2) * 0.2;
            const r1 = 40 + (i % 3) * 10;
            const r2 = 160 + (i % 4) * 30;
            const mx = Math.cos(a + 0.12) * ((r1 + r2) / 2);
            const my = Math.sin(a + 0.12) * ((r1 + r2) / 2) * 0.6;
            const d = `M${Math.cos(a) * r1} ${Math.sin(a) * r1 * 0.6} L${mx} ${my} L${Math.cos(a) * r2} ${Math.sin(a) * r2 * 0.6}`;
            return (
              <g key={i}>
                <path className="glow" d={d} />
                <path d={d} />
              </g>
            );
          })}
        </svg>,
        { initial: { scale: 0.3, opacity: 0 }, animate: { scale: 1, opacity: 1 }, transition: { duration: 0.28, ease: 'easeOut', delay: 0.1 } },
      );
    case 'eightCut':
      return pop(
        'fx-slash',
        <svg viewBox="0 0 400 240" preserveAspectRatio="none">
          <line x1="-20" y1="230" x2="420" y2="10" />
          <line x1="-20" y1="236" x2="420" y2="16" className="thin" />
        </svg>,
        { initial: { scaleX: 0, opacity: 1 }, animate: { scaleX: 1, opacity: 1 }, transition: { duration: 0.22, ease: 'easeIn' } },
      );
    case 'lock':
      return pop(
        'fx-lock',
        <svg viewBox="-60 -60 120 120">
          <path d="M-22 -6 L-22 -22 C -22 -44 22 -44 22 -22 L22 -6" fill="none" strokeWidth="9" />
          <rect x="-32" y="-8" width="64" height="50" rx="8" />
          <circle cy="14" r="7" className="hole" />
          <rect x="-3" y="16" width="6" height="14" className="hole" />
        </svg>,
        { initial: { y: -60, opacity: 0 }, animate: { y: 0, opacity: 1 }, transition: { type: 'spring', stiffness: 400, damping: 14 } },
      );
    case 'reverse':
    case 'elevenBack':
      return pop(
        'fx-arrows',
        <svg viewBox="-60 -60 120 120">
          <path d="M-40 0 A40 40 0 0 1 34 -20" fill="none" strokeWidth="6" />
          <path d="M40 0 A40 40 0 0 1 -34 20" fill="none" strokeWidth="6" />
          <path d="M34 -20 L40 -42 L18 -30 Z" className="tip" />
          <path d="M-34 20 L-40 42 L-18 30 Z" className="tip" />
        </svg>,
        { initial: { rotate: 0, opacity: 0 }, animate: { rotate: kind === 'reverse' ? -360 : 360, opacity: 1 }, transition: { duration: 0.9, ease: 'easeInOut' } },
      );
    case 'daifugo':
      return pop(
        'fx-rays',
        <svg viewBox="-100 -100 200 200">
          {Array.from({ length: 18 }, (_, i) => (
            <path key={i} transform={`rotate(${i * 20})`} d="M-5 -14 L0 -100 L5 -14 Z" />
          ))}
        </svg>,
        { initial: { rotate: 0, opacity: 0 }, animate: { rotate: 30, opacity: 1 }, transition: { duration: 1.2 } },
      );
    case 'spade3':
      return pop(
        'fx-spade',
        <svg viewBox="0 0 100 100">
          <SuitShape suit="S" x={50} y={50} size={90} fill="url(#g-gold)" />
        </svg>,
        { initial: { scale: 0.2, rotate: -30, opacity: 0.9 }, animate: { scale: 1, rotate: 0, opacity: 1 }, transition: { duration: 0.6, ease: 'easeOut' } },
      );
    case 'bomber':
      return pop(
        'fx-boom',
        <svg viewBox="-100 -100 200 200">
          <path d="M0 -90 L18 -40 L70 -60 L40 -15 L95 5 L40 22 L62 72 L14 42 L0 95 L-14 42 L-62 72 L-40 22 L-95 5 L-40 -15 L-70 -60 L-18 -40 Z" />
        </svg>,
        { initial: { scale: 0.1 }, animate: { scale: 1 }, transition: { type: 'spring', stiffness: 300, damping: 10 } },
      );
    default:
      return null;
  }
}

export function EffectLayer({ effect }: { effect: EffectItem | null }) {
  const lite = useLite();
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
        burst({ x, y, count: 70, colors, speed: 13, gravity: 0.05, life: 90, size: 4 });
        break;
      case 'daifugo':
        confetti();
        burst({ x, y, count: 50, colors, speed: 10, gravity: 0.1, size: 4 });
        break;
      case 'eightCut':
        burst({ x, y, count: 40, colors, speed: 12, spread: 0.5, angle: -0.46, gravity: 0.02, life: 50, size: 3 });
        burst({ x, y, count: 40, colors, speed: 12, spread: 0.5, angle: Math.PI - 0.46, gravity: 0.02, life: 50, size: 3 });
        break;
      case 'bomber':
        shockwave(x, y, '#ff4d5e');
        burst({ x, y, count: 80, colors: ['#ff4d5e', '#ffb703', '#fb8500', '#fff'], speed: 14, gravity: 0.15, life: 80, size: 5 });
        break;
      case 'deal':
        break;
      default:
        burst({ x, y, count: 30, colors, speed: 8, gravity: 0.08, size: 3.5 });
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
            {!lite && <Deco kind={effect.kind} />}
            <motion.div
              className="fx-title"
              initial={lite ? { opacity: 0, scale: 1.15 } : effect.kind === 'deal' ? { y: 20, opacity: 0, scale: 1.08 } : { scale: 2.6, opacity: 0, rotate: -6 }}
              animate={lite ? { opacity: 1, scale: 1 } : effect.kind === 'deal' ? { y: 0, opacity: 1, scale: 1 } : { scale: 1, opacity: 1, rotate: 0 }}
              transition={lite ? { duration: 0.2 } : effect.kind === 'deal' ? { duration: 0.6 } : { type: 'spring', stiffness: 520, damping: 18 }}
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
