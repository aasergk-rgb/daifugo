// クライアント ⇔ ルーム（サーバー / P2P ホスト / ローカル）間のメッセージ

import type { Difficulty } from '../engine/ai';
import type { Action, GameEvent } from '../engine/game';
import type { RuleConfig } from '../engine/rules';
import type { GameView } from '../engine/view';

export interface SeatInfo {
  id: string;
  kind: 'human' | 'cpu';
  name: string;
  avatar: number;
  difficulty: Difficulty;
  connected: boolean;
  isHost: boolean;
}

export interface RoomInfo {
  code: string;
  seats: SeatInfo[];
  maxSeats: number;
  config: RuleConfig;
  status: 'lobby' | 'playing';
  spectators: number;
  /** 次のゲームへ進む準備ができた席 */
  ready: string[];
}

export type ClientMsg =
  | { t: 'hello'; name: string; avatar: number; token?: string }
  | { t: 'act'; action: Action }
  | { t: 'config'; config: RuleConfig }
  | { t: 'maxSeats'; n: number }
  | { t: 'addCpu'; difficulty: Difficulty }
  | { t: 'removeSeat'; seatId: string }
  | { t: 'setDifficulty'; seatId: string; difficulty: Difficulty }
  | { t: 'start' }
  | { t: 'next' }
  | { t: 'toLobby' }
  | { t: 'speed'; value: number }
  | { t: 'stamp'; id: number }
  | { t: 'chat'; text: string }
  | { t: 'ping' };

export type ServerMsg =
  | { t: 'welcome'; clientId: string; token: string; seatId: string | null }
  | { t: 'room'; room: RoomInfo }
  | { t: 'game'; view: GameView; events: GameEvent[]; seatIds: string[]; deadline: number | null; now: number }
  | { t: 'stamp'; seat: number; seatId: string; id: number }
  | { t: 'chat'; from: string; text: string; at: number }
  | { t: 'error'; message: string }
  | { t: 'closed'; reason: string }
  | { t: 'pong' };

/** WebSocket サーバーでルームに入る前のメッセージ */
export type LobbyMsg =
  | { t: 'create' }
  | { t: 'join'; code: string };

export const STAMPS = ['👍', '😂', '😱', '🔥', '🙏', '😎', '💢', '🎉', 'ナイス！', 'うそでしょ', 'まだまだ', 'おつかれ'];

export const AVATARS = ['🦊', '🐯', '🐼', '🐸', '🐙', '🦉', '🐲', '🦁', '🐰', '🐧', '👺', '🤖'];

export const CPU_NAMES = ['銀次', '小町', '鉄斎', '紅葉', '雷蔵', '千鶴', '玄馬', '桔梗', '弥七', '朱音'];

export function genCode(len = 5): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export function genId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}
