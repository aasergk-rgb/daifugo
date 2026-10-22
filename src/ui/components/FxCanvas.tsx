// 画面全体のパーティクル（メニュー背景のふわふわ水玉、演出の紙吹雪）
//
// 軽量化のポイント
//  - 光る粒は shadowBlur を使わず、色ごとに一度だけ描いた光のスプライトを drawImage する
//  - 動きは経過時間ベース（フレームが落ちても演出の長さは変わらない）
//  - 描くものがない・タブが裏にあるときは描画ループを止める
//  - 軽量モードでは背景の粒を出さず、演出の粒も減らし、解像度を 1 倍にする

import { useEffect, useRef } from 'react';
import { isLite } from '../perf';
import type { ThemeId } from '../settings';

type Shape = 'spark' | 'confetti' | 'petal' | 'dust' | 'ring' | 'dot';

interface P {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  shape: Shape;
  rot: number;
  vr: number;
  g: number;
  seed: number;
  ambient?: boolean;
}

const particles: P[] = [];
const MAX_PARTICLES = 900;

export interface BurstOpts {
  x: number;
  y: number;
  count?: number;
  colors?: string[];
  speed?: number;
  shape?: Shape;
  gravity?: number;
  life?: number;
  size?: number;
  spread?: number;
  angle?: number;
}

let reduce = false;
export function setReduceMotion(v: boolean) {
  reduce = v;
}

let wake: (() => void) | null = null;

function scale() {
  if (reduce) return 0.25;
  return isLite() ? 0.3 : 1;
}

export function burst(o: BurstOpts) {
  const count = Math.round((o.count ?? 40) * scale());
  const colors = o.colors ?? ['#f3d27a', '#fff1b8', '#e2b552'];
  for (let i = 0; i < count; i++) {
    const spread = o.spread ?? Math.PI * 2;
    const a = (o.angle ?? -Math.PI / 2) + (Math.random() - 0.5) * spread;
    const sp = (o.speed ?? 6) * (0.35 + Math.random() * 0.9);
    const max = (o.life ?? 70) * (0.6 + Math.random() * 0.6);
    particles.push({
      x: o.x,
      y: o.y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: 0,
      max,
      size: (o.size ?? 4) * (0.6 + Math.random() * 0.8),
      color: colors[Math.floor(Math.random() * colors.length)],
      shape: o.shape ?? 'spark',
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.3,
      g: o.gravity ?? 0.12,
      seed: Math.random() * 100,
    });
  }
  if (particles.length > MAX_PARTICLES) particles.splice(0, particles.length - MAX_PARTICLES);
  wake?.();
}

export function confetti() {
  const w = window.innerWidth;
  for (let i = 0; i < 5; i++) {
    burst({
      x: (w * (i + 0.5)) / 5,
      y: -10,
      count: 26,
      angle: Math.PI / 2,
      spread: 1.2,
      speed: 5,
      gravity: 0.08,
      life: 180,
      shape: 'confetti',
      size: 7,
      colors: ['#FFC93C', '#FF4F7B', '#4DA3FF', '#14B079', '#8B6CFF', '#FF961F'],
    });
  }
}

export function shockwave(x: number, y: number, color = '#f3d27a') {
  for (let i = 0; i < 3; i++) {
    particles.push({ x, y, vx: 0, vy: 0, life: -i * 8, max: 60, size: 10, color, shape: 'ring', rot: 0, vr: 0, g: 0, seed: 0 });
  }
  wake?.();
}

const AMBIENT: Record<ThemeId, { shape: Shape; colors: string[]; rate: number }> = {
  soda: { shape: 'dot', colors: ['#FFC93C', '#FF4F7B', '#4DA3FF', '#14B079'], rate: 0.06 },
  melon: { shape: 'dot', colors: ['#FFC93C', '#14B079', '#4DA3FF', '#FF961F'], rate: 0.06 },
  peach: { shape: 'dot', colors: ['#FF4F7B', '#FFC93C', '#8B6CFF', '#4DA3FF'], rate: 0.06 },
  night: { shape: 'dot', colors: ['#FFC93C', '#FF4F7B', '#4DA3FF', '#8B6CFF'], rate: 0.05 },
};

/** 色ごとの「光る粒」スプライト（中心が明るく外側へ減衰） */
const sprites = new Map<string, HTMLCanvasElement>();
const SPRITE = 32;
function hex6(color: string): string {
  return /^#[0-9a-f]{3}$/i.test(color) ? '#' + [...color.slice(1)].map((ch) => ch + ch).join('') : color;
}
function glowSprite(input: string): HTMLCanvasElement {
  const color = hex6(input);
  let c = sprites.get(color);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = SPRITE;
  const g = c.getContext('2d')!;
  const r = SPRITE / 2;
  const grad = g.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.18, color);
  grad.addColorStop(0.42, color + '66');
  grad.addColorStop(1, color + '00');
  g.fillStyle = grad;
  g.fillRect(0, 0, SPRITE, SPRITE);
  sprites.set(color, c);
  return c;
}

export function FxCanvas({ theme, ambient = true }: { theme: ThemeId; ambient?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const themeRef = useRef(theme);
  const ambRef = useRef(ambient);
  themeRef.current = theme;
  ambRef.current = ambient;

  useEffect(() => {
    const cv = ref.current!;
    const ctx = cv.getContext('2d')!;
    let raf = 0;
    let running = false;
    let w = 0;
    let h = 0;
    let dpr = 1;
    let last = 0;
    let drewLastFrame = false;

    const resize = () => {
      dpr = isLite() ? 1 : Math.min(1.5, window.devicePixelRatio || 1);
      w = window.innerWidth;
      h = window.innerHeight;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      cv.style.width = `${w}px`;
      cv.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const ambientOn = () => ambRef.current && !reduce && !isLite();

    const tick = (now: number) => {
      if (document.visibilityState !== 'visible') {
        running = false;
        return;
      }
      // 60fps を 1 として経過時間で進める（最大 3 フレーム分）
      const step = last ? Math.min(3, (now - last) / 16.67) : 1;
      last = now;

      const amb = AMBIENT[themeRef.current];
      if (ambientOn() && Math.random() < amb.rate * step) {
        const petal = amb.shape === 'petal';
        const dot = amb.shape === 'dot';
        particles.push({
          x: Math.random() * w,
          y: petal ? -10 : h + 10,
          vx: petal ? 0.4 + Math.random() * 0.8 : (Math.random() - 0.5) * 0.3,
          vy: petal ? 0.6 + Math.random() * 0.9 : -(0.25 + Math.random() * (dot ? 0.35 : 0.6)),
          life: 0,
          max: petal ? 700 : dot ? 900 : 520,
          size: petal ? 5 + Math.random() * 4 : dot ? 4 + Math.random() * 7 : 1 + Math.random() * 2.2,
          color: amb.colors[Math.floor(Math.random() * amb.colors.length)],
          shape: amb.shape,
          rot: Math.random() * 6,
          vr: (Math.random() - 0.5) * 0.04,
          g: 0,
          seed: Math.random() * 100,
          ambient: true,
        });
      }

      if (!particles.length) {
        if (drewLastFrame) ctx.clearRect(0, 0, w, h);
        drewLastFrame = false;
        if (!ambientOn()) {
          // 描くものがなければループを止める（次の burst で再開）
          running = false;
          last = 0;
          return;
        }
        raf = requestAnimationFrame(tick);
        return;
      }

      ctx.clearRect(0, 0, w, h);
      drewLastFrame = true;
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life += step;
        p.vy += p.g * step;
        p.x += p.vx * step;
        p.y += p.vy * step;
        p.rot += p.vr * step;
        if (p.shape === 'petal') p.vx += Math.sin((p.life + p.seed) * 0.03) * 0.02 * step;
        if (p.shape === 'confetti') {
          p.vx *= Math.pow(0.99, step);
          p.vy = Math.min(p.vy, 3.2);
        }
        const t = p.life / p.max;
        if (t >= 1 || p.y > h + 40 || p.y < -60) {
          particles.splice(i, 1);
          continue;
        }
        if (t < 0) continue;
        const alpha = p.ambient ? Math.sin(Math.PI * t) * (p.shape === 'dot' ? 0.35 : p.shape === 'dust' ? 0.7 : 0.85) : 1 - t * t;
        ctx.globalAlpha = Math.max(0, alpha);
        switch (p.shape) {
          case 'spark':
          case 'dust': {
            const r = (p.shape === 'spark' ? p.size * (1 - t * 0.6) : p.size) * 3;
            ctx.drawImage(glowSprite(p.color), p.x - r, p.y - r, r * 2, r * 2);
            break;
          }
          case 'dot': {
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
            break;
          }
          case 'confetti': {
            const c = Math.cos(p.rot);
            const s = Math.sin(p.rot);
            const sy = Math.abs(Math.cos(p.life * 0.1 + p.seed));
            ctx.setTransform(c * dpr, s * dpr, -s * sy * dpr, c * sy * dpr, p.x * dpr, p.y * dpr);
            ctx.fillStyle = p.color;
            ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            break;
          }
          case 'petal': {
            const a = p.rot + Math.sin(p.life * 0.05) * 0.6;
            const c = Math.cos(a);
            const s = Math.sin(a);
            const sy = 0.6 + 0.4 * Math.abs(Math.sin(p.life * 0.04 + p.seed));
            ctx.setTransform(c * dpr, s * dpr, -s * sy * dpr, c * sy * dpr, p.x * dpr, p.y * dpr);
            ctx.fillStyle = p.color;
            ctx.beginPath();
            const z = p.size;
            ctx.moveTo(0, -z);
            ctx.bezierCurveTo(z, -z, z, z * 0.6, 0, z);
            ctx.bezierCurveTo(-z, z * 0.6, -z, -z, 0, -z);
            ctx.fill();
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            break;
          }
          case 'ring': {
            ctx.strokeStyle = p.color;
            ctx.lineWidth = 3 * (1 - t);
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size + t * 260, 0, Math.PI * 2);
            ctx.stroke();
            break;
          }
        }
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(tick);
    };

    const start = () => {
      if (running || document.visibilityState !== 'visible') return;
      running = true;
      last = 0;
      raf = requestAnimationFrame(tick);
    };
    wake = start;
    const onVis = () => {
      if (document.visibilityState === 'visible') start();
    };
    document.addEventListener('visibilitychange', onVis);
    // 軽量モードの切り替えや背景の粒の有無が変わったときに再開できるよう、ときどき起こす
    const poke = setInterval(() => {
      if (!running && ambientOn()) {
        resize();
        start();
      }
    }, 1000);
    start();
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(poke);
      wake = null;
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  return <canvas ref={ref} className="fx-canvas" />;
}
