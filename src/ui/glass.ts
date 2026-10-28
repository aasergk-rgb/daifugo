// Liquid Glass の動き
//  - 光：ポインターの位置を光源に見立て、ガラスのハイライトをそちらへ寄せる
//  - 押した点から光る：押した位置を CSS 変数で渡す
//  - スクロールの端：スクロールした画面に印を付け、上のバーの下でコンテンツを溶かす

import { isLite } from './perf';

let started = false;

export function startGlass() {
  if (started) return;
  started = true;
  const root = document.documentElement;

  // 光の位置（画面に対する割合）。毎フレーム1回だけ書き込む
  let lx = 30;
  let ly = 0;
  let queued = false;
  const flush = () => {
    queued = false;
    root.style.setProperty('--lg-x', `${lx.toFixed(1)}%`);
    root.style.setProperty('--lg-y', `${ly.toFixed(1)}%`);
  };
  window.addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType !== 'mouse' || isLite() || root.classList.contains('reduce-motion')) return;
      const nx = (e.clientX / window.innerWidth) * 100;
      const ny = (e.clientY / window.innerHeight) * 100;
      if (Math.abs(nx - lx) < 1.5 && Math.abs(ny - ly) < 1.5) return;
      lx = nx;
      ly = ny;
      if (!queued) {
        queued = true;
        requestAnimationFrame(flush);
      }
    },
    { passive: true },
  );

  // 押した点から内側に光が広がる
  window.addEventListener(
    'pointerdown',
    (e) => {
      const el = (e.target as Element | null)?.closest?.('.lg, .btn, .icon-btn, .menu-btn, .re-nav button') as HTMLElement | null;
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty('--px', `${e.clientX - r.left}px`);
      el.style.setProperty('--py', `${e.clientY - r.top}px`);
    },
    { passive: true, capture: true },
  );

  // スクロールした画面に .is-scrolled を付ける（scroll は泡立たないので capture で拾う）
  document.addEventListener(
    'scroll',
    (e) => {
      const t = e.target;
      if (!(t instanceof HTMLElement)) return;
      const on = t.scrollTop > 2;
      if (t.classList.contains('is-scrolled') !== on) t.classList.toggle('is-scrolled', on);
    },
    { passive: true, capture: true },
  );
}
