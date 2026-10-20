// 描画負荷の管理（軽量モード）
//  - 設定が「自動」のときは、端末の性能と実際のフレームレートを見て軽量モードに切り替える
//  - 軽量モードでは、ぼかし・影・常時アニメーション・背景パーティクルを止める

import { useSyncExternalStore } from 'react';

export type GraphicsMode = 'auto' | 'high' | 'lite';

let lite = false;
let mode: GraphicsMode = 'auto';
let autoDowngraded = false;
const listeners = new Set<() => void>();
let onAutoLite: (() => void) | null = null;

function emit() {
  document.documentElement.classList.toggle('lite', lite);
  listeners.forEach((l) => l());
}

/** 起動時の推定（コア数・メモリが少ない端末は最初から軽量） */
function lowSpecGuess(): boolean {
  const cores = navigator.hardwareConcurrency || 8;
  const mem = (navigator as any).deviceMemory as number | undefined;
  return cores <= 2 || (mem !== undefined && mem <= 2);
}

export function setGraphicsMode(m: GraphicsMode) {
  mode = m;
  if (m === 'high') lite = false;
  else if (m === 'lite') lite = true;
  else lite = autoDowngraded || lowSpecGuess();
  emit();
}

export function isLite() {
  return lite;
}

export function useLite(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => lite,
  );
}

/** 自動で軽量モードに切り替えたときの通知先 */
export function onAutoDowngrade(cb: () => void) {
  onAutoLite = cb;
}

// ── フレームレート監視（自動モードのときだけ） ──
// 2秒ごとの平均が 40fps を下回る区間が 2 回続いたら軽量モードにする。
// タブが裏にあるときや、起動直後の読み込み中は数えない。
let slowWindows = 0;
export function startFpsMonitor() {
  let frames = 0;
  let start = performance.now();
  const startedAt = start;
  const tick = (t: number) => {
    frames++;
    const elapsed = t - start;
    if (elapsed >= 2000) {
      const fps = (frames * 1000) / elapsed;
      frames = 0;
      start = t;
      const warm = t - startedAt > 3000;
      if (warm && document.visibilityState === 'visible' && mode === 'auto' && !lite) {
        slowWindows = fps < 40 ? slowWindows + 1 : 0;
        if (slowWindows >= 2) {
          autoDowngraded = true;
          lite = true;
          emit();
          onAutoLite?.();
        }
      }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  document.addEventListener('visibilitychange', () => {
    frames = 0;
    start = performance.now();
    slowWindows = 0;
  });
}
