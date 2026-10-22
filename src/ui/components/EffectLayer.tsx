// 革命・8切りなどの演出（ポップなステッカー風）

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect } from 'react';
import type { EffectItem } from '../client';
import { useLite } from '../perf';
import { SuitShape } from './CardArt';
import { burst, confetti } from './FxCanvas';

const POP = ['#FFC93C', '#FF4F7B', '#4DA3FF', '#14B079', '#8B6CFF', '#FF961F'];
const TONE: Record<string, string> = {
  gold: '#FFC93C',
  red: '#FF4F7B',
  blue: '#4DA3FF',
  purple: '#8B6CFF',
  green: '#14B079',
  ink: '#8A89AE',
};
const INK = '#2B2A55';

const BIG = new Set(['revolution', 'counter', 'gekokujo', 'tenpen', 'daifugo']);

/**
 * 背景の飾り。SVG 自体は動かさず、包んだ要素の transform / opacity だけを動かす
 * （SVG 内部を毎フレーム変えると全体を描き直すことになり重い）
 */
function Deco({ kind, color }: { kind: string; color: string }) {
  const wrap = (className: string, svg: JSX.Element, anim: { initial: any; animate: any; transition: any }) => (
    <div className={`fx-deco ${className}`}>
      <motion.div className="fx-deco-inner" initial={anim.initial} animate={anim.animate} transition={anim.transition}>
        {svg}
      </motion.div>
    </div>
  );
  if (BIG.has(kind)) {
    // 放射状のサンバースト
    return wrap(
      'fx-burst',
      <svg viewBox="-100 -100 200 200">
        {Array.from({ length: 16 }, (_, i) => (
          <path key={i} transform={`rotate(${i * 22.5})`} d="M0 0 L-9 -100 L9 -100 Z" fill={color} opacity="0.22" />
        ))}
      </svg>,
      { initial: { scale: 0.4, rotate: -20, opacity: 0 }, animate: { scale: 1, rotate: 10, opacity: 1 }, transition: { duration: 1.2, ease: 'easeOut' } },
    );
  }
  switch (kind) {
    case 'eightCut':
    case 'bomber':
    case 'sandstorm':
    case 'ambulance':
    case 'rokurokubi':
    case 'sixCard':
    case 'strongestSeq':
    case 'doubleJoker':
      // 「ドカン！」の星形
      return wrap(
        'fx-pow',
        <svg viewBox="-100 -100 200 200">
          <path
            d="M0 -92 L20 -42 L74 -66 L44 -18 L96 6 L42 24 L64 78 L14 44 L0 96 L-14 44 L-64 78 L-42 24 L-96 6 L-44 -18 L-74 -66 L-20 -42 Z"
            fill={color}
            stroke={INK}
            strokeWidth="6"
            strokeLinejoin="round"
          />
        </svg>,
        { initial: { scale: 0.2, rotate: -25 }, animate: { scale: 1, rotate: 0 }, transition: { type: 'spring', stiffness: 320, damping: 12 } },
      );
    case 'spade3':
      return wrap(
        'fx-pow',
        <svg viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="46" fill="#fff" stroke={INK} strokeWidth="4" />
          <SuitShape suit="S" x={50} y={52} size={62} />
        </svg>,
        { initial: { scale: 0.2, rotate: -30 }, animate: { scale: 1, rotate: 0 }, transition: { type: 'spring', stiffness: 320, damping: 14 } },
      );
    case 'lock':
      return wrap(
        'fx-icon',
        <svg viewBox="-60 -60 120 120">
          <path d="M-22 -6 L-22 -22 C -22 -44 22 -44 22 -22 L22 -6" fill="none" stroke={INK} strokeWidth="10" strokeLinecap="round" />
          <rect x="-34" y="-8" width="68" height="54" rx="12" fill={color} stroke={INK} strokeWidth="6" />
          <circle cy="14" r="7" fill={INK} />
          <rect x="-3.5" y="16" width="7" height="14" rx="3" fill={INK} />
        </svg>,
        { initial: { y: -50, opacity: 0 }, animate: { y: 0, opacity: 1 }, transition: { type: 'spring', stiffness: 420, damping: 14 } },
      );
    case 'reverse':
    case 'elevenBack':
      return wrap(
        'fx-icon',
        <svg viewBox="-60 -60 120 120">
          <path d="M-38 0 A38 38 0 0 1 30 -22" fill="none" stroke={color} strokeWidth="12" strokeLinecap="round" />
          <path d="M38 0 A38 38 0 0 1 -30 22" fill="none" stroke={color} strokeWidth="12" strokeLinecap="round" />
          <path d="M22 -40 L46 -26 L22 -10 Z" fill={color} />
          <path d="M-22 40 L-46 26 L-22 10 Z" fill={color} />
        </svg>,
        { initial: { rotate: 0, opacity: 0 }, animate: { rotate: kind === 'reverse' ? -360 : 360, opacity: 1 }, transition: { duration: 0.8, ease: 'easeInOut' } },
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
    const tone = TONE[effect.tone] ?? TONE.gold;
    if (effect.kind === 'deal') return;
    if (BIG.has(effect.kind)) {
      confetti();
      burst({ x, y, count: 50, colors: [tone, ...POP], speed: 11, gravity: 0.12, life: 90, size: 7, shape: 'confetti' });
    } else {
      burst({ x, y, count: 26, colors: [tone, '#ffffff', INK], speed: 8, gravity: 0.1, life: 60, size: 6, shape: 'confetti' });
    }
  }, [effect?.id]);

  const color = effect ? TONE[effect.tone] ?? TONE.gold : TONE.gold;
  return (
    <div className="fx-layer" aria-live="polite">
      <AnimatePresence>
        {effect && (
          <motion.div
            key={effect.id}
            className={`fx fx-${effect.kind} tone-${effect.tone} ${BIG.has(effect.kind) ? 'is-big' : ''}`}
            style={{ ['--fx' as string]: color }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.2 } }}
          >
            <div className="fx-backdrop" />
            {!lite && <Deco kind={effect.kind} color={color} />}
            <motion.div
              className="fx-title"
              initial={lite ? { opacity: 0, scale: 1.1 } : effect.kind === 'deal' ? { y: 24, opacity: 0 } : { scale: 0.3, opacity: 0, rotate: -12 }}
              animate={lite ? { opacity: 1, scale: 1 } : effect.kind === 'deal' ? { y: 0, opacity: 1 } : { scale: 1, opacity: 1, rotate: -4 }}
              transition={lite ? { duration: 0.18 } : effect.kind === 'deal' ? { duration: 0.35, ease: 'easeOut' } : { type: 'spring', stiffness: 460, damping: 14 }}
            >
              {effect.title}
            </motion.div>
            {effect.sub && (
              <motion.div className="fx-sub" initial={{ y: 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: lite ? 0 : 0.15 }}>
                {effect.sub}
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
