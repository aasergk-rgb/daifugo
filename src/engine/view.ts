// 各プレイヤー向けに状態を投影する（他人の手札は枚数だけ）

import { Card } from './cards';
import { Combo, FieldCtx, checkPlay, resolvePlay } from './combo';
import { ExchangeTask, GameEvent, GameRecord, GameState, OutKind, Pending, PlayRecord, enumerateCombos } from './game';
import type { RuleConfig } from './rules';
import type { Suit } from './cards';

export interface GameView {
  me: number | null;
  n: number;
  names: string[];
  config: RuleConfig;
  phase: GameState['phase'];
  gameNo: number;
  gameInSet: number;
  hand: Card[] | null;
  handCounts: number[];
  field: PlayRecord[];
  discardCount: number;
  blindCount: number;
  lastPlayer: number | null;
  turn: number;
  direction: 1 | -1;
  revolution: boolean;
  elevenBack: boolean;
  lockSuits: Suit[] | null;
  numberLock: boolean;
  passed: number[];
  out: OutKind[];
  winners: number[];
  fouls: number[];
  miyako: number | null;
  pending: Pending | null;
  myExchange: ExchangeTask | null;
  exchangeWaiting: number[];
  prevRanks: number[] | null;
  ranks: number[] | null;
  scores: number[];
  history: GameRecord[];
  mustInclude: string | null;
  seen: string[];
  gekokujo: boolean;
  seq: number;
}

export function projectView(s: GameState, me: number | null): GameView {
  return {
    me,
    n: s.n,
    names: s.names,
    config: s.config,
    phase: s.phase,
    gameNo: s.gameNo,
    gameInSet: s.gameInSet,
    hand: me === null ? null : s.hands[me],
    handCounts: s.hands.map((h) => h.length),
    field: s.field,
    discardCount: s.discardCount,
    blindCount: s.blind.length,
    lastPlayer: s.lastPlayer,
    turn: s.turn,
    direction: s.direction,
    revolution: s.revolution,
    elevenBack: s.elevenBack,
    lockSuits: s.lockSuits,
    numberLock: s.numberLock,
    passed: s.passed,
    out: s.out,
    winners: s.winners,
    fouls: s.fouls,
    miyako: s.miyako,
    pending: s.pending[0] ?? null,
    myExchange: me === null ? null : s.exchanges.find((e) => e.from === me) ?? null,
    exchangeWaiting: [...new Set(s.exchanges.map((e) => e.from))],
    prevRanks: s.prevRanks,
    ranks: s.ranks,
    scores: s.scores,
    history: s.history,
    mustInclude: s.mustInclude,
    seen: s.seen,
    gekokujo: s.gekokujo,
    seq: s.seq,
  };
}

/** 他人に見せてはいけない情報をイベントから取り除く */
export function projectEvents(events: GameEvent[], me: number | null): GameEvent[] {
  return events.map((e) => {
    if ((e.type === 'exchange' || e.type === 'sevenPass') && me !== e.from && me !== e.to) {
      return { ...e, cardIds: undefined };
    }
    return e;
  });
}

// ── クライアント側での判定（ビューだけで計算できる） ──

export function viewRev(v: GameView): boolean {
  return v.revolution !== v.elevenBack;
}

export function viewCtx(v: GameView): FieldCtx {
  return {
    top: v.field.length ? v.field[v.field.length - 1].combo : null,
    rev: viewRev(v),
    lockSuits: v.lockSuits,
    numberLock: v.numberLock,
    config: v.config,
    mustInclude: v.mustInclude,
  };
}

export function isMyTurn(v: GameView): boolean {
  return v.me !== null && v.phase === 'play' && !v.pending && v.turn === v.me && v.out[v.me] === null;
}

export function viewValidate(v: GameView, ids: string[]): { combo: Combo | null; error: string | null } {
  if (!v.hand) return { combo: null, error: '観戦中です' };
  const cards = v.hand.filter((c) => ids.includes(c.id));
  if (!cards.length) return { combo: null, error: null };
  return resolvePlay(cards, viewCtx(v));
}

export function viewLegalPlays(v: GameView): { cards: Card[]; combo: Combo }[] {
  if (!v.hand || !isMyTurn(v)) return [];
  const ctx = viewCtx(v);
  return enumerateCombos(v.hand, ctx.rev, v.config).filter((m) => checkPlay(m.combo, ctx) === null);
}

/** ビューから AI 用の疑似状態を作る（他人の手札はダミー） */
export function stateFromView(v: GameView): GameState {
  const dummy = (n: number, p: number): Card[] => Array.from({ length: n }, (_, i) => ({ id: `?${p}-${i}`, suit: 'S', rank: 3 }));
  return {
    config: v.config,
    n: v.n,
    names: v.names,
    hands: v.handCounts.map((n, p) => (p === v.me && v.hand ? v.hand : dummy(n, p))),
    phase: v.phase,
    gameNo: v.gameNo,
    gameInSet: v.gameInSet,
    blind: Array.from({ length: v.blindCount }, (_, i) => ({ id: `?b${i}`, suit: 'S', rank: 3 })),
    field: v.field,
    discardCount: v.discardCount,
    lastPlayer: v.lastPlayer,
    turn: v.turn,
    direction: v.direction,
    revolution: v.revolution,
    elevenBack: v.elevenBack,
    lockSuits: v.lockSuits,
    numberLock: v.numberLock,
    passed: v.passed,
    winners: v.winners,
    fouls: v.fouls,
    miyako: v.miyako,
    out: v.out,
    pending: v.pending ? [v.pending] : [],
    afterPlay: null,
    exchanges: v.myExchange ? [v.myExchange] : [],
    prevRanks: v.prevRanks,
    ranks: v.ranks,
    scores: v.scores,
    history: v.history,
    rng: 1,
    mustInclude: v.mustInclude,
    gekokujo: v.gekokujo,
    seen: v.seen,
    seq: v.seq,
  };
}
