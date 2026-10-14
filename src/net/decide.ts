// ブラウザ用の CPU 思考関数（Web Worker が使えなければ同期実行）
import { decide } from '../engine/ai';
import type { DecideFn } from './room';

let worker: Worker | null = null;
let seq = 0;
const waiting = new Map<number, { resolve: (a: any) => void; reject: (e: any) => void }>();

function getWorker(): Worker | null {
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./aiWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const w = waiting.get(e.data.id);
      if (!w) return;
      waiting.delete(e.data.id);
      if (e.data.error) w.reject(new Error(e.data.error));
      else w.resolve(e.data.action);
    };
    worker.onerror = () => {
      for (const w of waiting.values()) w.reject(new Error('worker error'));
      waiting.clear();
      worker = null;
    };
    return worker;
  } catch {
    return null;
  }
}

export const browserDecide: DecideFn = (state, player, diff) => {
  const w = getWorker();
  if (!w) return Promise.resolve(decide(state, player, diff));
  const id = ++seq;
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    w.postMessage({ id, state, player, diff });
  }).catch(() => decide(state, player, diff)) as any;
};
