// CPU の思考を別スレッドで実行（鬼のシミュレーションで画面が固まらないように）
import { decide, Difficulty } from '../engine/ai';
import type { GameState } from '../engine/game';

self.onmessage = (e: MessageEvent<{ id: number; state: GameState; player: number; diff: Difficulty }>) => {
  const { id, state, player, diff } = e.data;
  try {
    const action = decide(state, player, diff);
    (self as unknown as Worker).postMessage({ id, action });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: String(err) });
  }
};
