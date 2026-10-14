// 画面全体のパーティクル（背景の金粉・桜吹雪・ネオン、演出の紙吹雪・火花）

import { useEffect, useRef } from 'react';
import type { ThemeId } from '../settings';

type Shape = 'spark' | 'confetti' | 'petal' | 'dust' | 'ring';

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
  ambient?: boolean;
}

const particles: P[] = [];

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

export function burst(o: BurstOpts) {
  const count = Math.round((o.count ?? 40) * (reduce ? 0.25 : 1));
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
    });
  }
  if (particles.length > 1400) particles.splice(0, particles.length - 1400);
}

export function confetti() {
  const w = window.innerWidth;
  for (let i = 0; i < 5; i++) {
    burst({
      x: (w * (i + 0.5)) / 5,
      y: -10,
      count: 40,
      angle: Math.PI / 2,
      spread: 1.2,
      speed: 5,
      gravity: 0.08,
      life: 180,
      shape: 'confetti',
      size: 7,
      colors: ['#f3d27a', '#e94560', '#4cc9f0', '#80ed99', '#ffffff', '#c77dff'],
    });
  }
}

const AMBIENT: Record<ThemeId, { shape: Shape; colors: string[]; rate: number }> = {
  urushi: { shape: 'dust', colors: ['#f3d27a', '#e2b552', '#fff1b8'], rate: 0.35 },
  casino: { shape: 'dust', colors: ['#fff6d6', '#f3d27a'], rate: 0.15 },
  sakura: { shape: 'petal', colors: ['#ffc0d6', '#ffd9e6', '#ff9fbf', '#fff0f5'], rate: 0.28 },
  neon: { shape: 'spark', colors: ['#00f5ff', '#ff2fd6', '#b8ff3c'], rate: 0.25 },
};

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
    let w = 0;
    let h = 0;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      cv.width = w * dpr;
      cv.height = h * dpr;
      cv.style.width = `${w}px`;
      cv.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const tick = () => {
      raf = requestAnimationFrame(tick);
      ctx.clearRect(0, 0, w, h);
      const amb = AMBIENT[themeRef.current];
      if (ambRef.current && !reduce && Math.random() < amb.rate) {
        const petal = amb.shape === 'petal';
        particles.push({
          x: Math.random() * w,
          y: petal ? -10 : h + 10,
          vx: petal ? 0.4 + Math.random() * 0.8 : (Math.random() - 0.5) * 0.3,
          vy: petal ? 0.6 + Math.random() * 0.9 : -(0.25 + Math.random() * 0.6),
          life: 0,
          max: petal ? 700 : 520,
          size: petal ? 5 + Math.random() * 4 : 1 + Math.random() * 2.2,
          color: amb.colors[Math.floor(Math.random() * amb.colors.length)],
          shape: amb.shape,
          rot: Math.random() * 6,
          vr: (Math.random() - 0.5) * 0.04,
          g: 0,
          ambient: true,
        });
      }
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life++;
        p.vy += p.g;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        if (p.shape === 'petal') p.vx += Math.sin((p.life + i) * 0.03) * 0.02;
        if (p.shape === 'confetti') {
          p.vx *= 0.99;
          p.vy = Math.min(p.vy, 3.2);
        }
        const t = p.life / p.max;
        if (t >= 1 || p.y > h + 40 || p.y < -60) {
          particles.splice(i, 1);
          continue;
        }
        const alpha = p.ambient ? Math.sin(Math.PI * t) * (p.shape === 'dust' ? 0.7 : 0.85) : 1 - t * t;
        ctx.globalAlpha = Math.max(0, alpha);
        ctx.fillStyle = p.color;
        switch (p.shape) {
          case 'spark': {
            ctx.shadowBlur = 8;
            ctx.shadowColor = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * (1 - t * 0.6), 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
            break;
          }
          case 'dust': {
            ctx.shadowBlur = 6;
            ctx.shadowColor = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
            break;
          }
          case 'confetti': {
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot);
            ctx.scale(1, Math.abs(Math.cos(p.life * 0.1 + i)));
            ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
            ctx.restore();
            break;
          }
          case 'petal': {
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot + Math.sin(p.life * 0.05) * 0.6);
            ctx.scale(1, 0.6 + 0.4 * Math.abs(Math.sin(p.life * 0.04 + i)));
            ctx.beginPath();
            const s = p.size;
            ctx.moveTo(0, -s);
            ctx.bezierCurveTo(s, -s, s, s * 0.6, 0, s);
            ctx.bezierCurveTo(-s, s * 0.6, -s, -s, 0, -s);
            ctx.fill();
            ctx.restore();
            break;
          }
          case 'ring': {
            if (t < 0) break;
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
    };
    tick();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas ref={ref} className="fx-canvas" />;
}

export function shockwave(x: number, y: number, color = '#f3d27a') {
  for (let i = 0; i < 3; i++) {
    particles.push({ x, y, vx: 0, vy: 0, life: -i * 8, max: 60, size: 10, color, shape: 'ring', rot: 0, vr: 0, g: 0 });
  }
}
