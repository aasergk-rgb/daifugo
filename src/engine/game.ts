// 大富豪のゲーム進行（純粋なステートマシン）
// サーバー・P2Pホスト・オフライン対戦のすべてで同じコードを使う。

import { Card, Suit, fullDeck, isJoker, idxOf, sortCards } from './cards';
import { Combo, FieldCtx, analyze as analyzeCombos, checkPlay, effectCount, lockFrom, numberLockFrom, resolvePlay, specialBeat } from './combo';
import { createRng, shuffle } from './rng';
import { RuleConfig, normalizeConfig, pointsFor } from './rules';

export interface PlayRecord {
  player: number;
  combo: Combo;
  cards: Card[];
}

export type Pending =
  | { kind: 'sevenPass'; player: number; count: number }
  | { kind: 'tenDiscard'; player: number; count: number }
  | { kind: 'queenBomber'; player: number; count: number };

export interface ExchangeTask {
  from: number;
  to: number;
  count: number;
}

export type OutKind = 'win' | 'foul' | 'miyako' | null;

export type FlushReason =
  | 'allPass'
  | 'eightCut'
  | 'spade3'
  | 'sandstorm'
  | 'ambulance'
  | 'rokurokubi'
  | 'sixCard'
  | 'strongestSeq'
  | 'doubleJoker';

interface AfterPlay {
  player: number;
  foul: boolean;
  flush: FlushReason | null;
  skips: number;
}

export interface GameRecord {
  ranks: number[];
  points: number[];
  gekokujo: boolean;
}

export interface GameState {
  config: RuleConfig;
  n: number;
  names: string[];
  hands: Card[][];
  phase: 'exchange' | 'play' | 'roundEnd' | 'matchEnd';
  gameNo: number;
  gameInSet: number;
  blind: Card[];
  field: PlayRecord[];
  discardCount: number;
  lastPlayer: number | null;
  turn: number;
  direction: 1 | -1;
  revolution: boolean;
  elevenBack: boolean;
  lockSuits: Suit[] | null;
  numberLock: boolean;
  passed: number[];
  winners: number[];
  fouls: number[];
  miyako: number | null;
  out: OutKind[];
  pending: Pending[];
  afterPlay: AfterPlay | null;
  exchanges: ExchangeTask[];
  prevRanks: number[] | null;
  ranks: number[] | null;
  scores: number[];
  history: GameRecord[];
  rng: number;
  mustInclude: string | null;
  gekokujo: boolean;
  /** 公開されたカード（場に出た・捨てられた） */
  seen: string[];
  seq: number;
}

export type GameEvent =
  | { type: 'deal'; gameNo: number; gameInSet: number; handSizes: number[] }
  | { type: 'tenpen'; a: number; b: number }
  | { type: 'exchange'; from: number; to: number; count: number; cardIds?: string[]; auto: boolean }
  | { type: 'exchangeDone' }
  | { type: 'play'; player: number; cards: Card[]; combo: Combo; foulFinish: boolean }
  | { type: 'pass'; player: number }
  | { type: 'flush'; reason: FlushReason; leader: number }
  | { type: 'revolution'; on: boolean; player: number }
  | { type: 'elevenBack'; on: boolean }
  | { type: 'lock'; suits: Suit[] | null; number: boolean }
  | { type: 'reverse'; direction: 1 | -1 }
  | { type: 'skip'; player: number }
  | { type: 'special'; kind: FlushReason; player: number }
  | { type: 'pending'; pending: Pending }
  | { type: 'sevenPass'; from: number; to: number; count: number; cardIds?: string[] }
  | { type: 'tenDiscard'; player: number; cards: Card[] }
  | { type: 'bomber'; player: number; ranks: number[]; discarded: { player: number; cards: Card[] }[] }
  | { type: 'finish'; player: number; foul: boolean; order: number }
  | { type: 'miyakoOchi'; player: number }
  | { type: 'gekokujo'; player: number }
  | { type: 'turn'; player: number }
  | { type: 'roundEnd'; ranks: number[]; points: number[]; gekokujo: boolean }
  | { type: 'matchEnd'; scores: number[] };

export type Action =
  | { type: 'play'; cardIds: string[] }
  | { type: 'pass' }
  | { type: 'give'; cardIds: string[] }
  | { type: 'sevenPass'; cardIds: string[] }
  | { type: 'tenDiscard'; cardIds: string[] }
  | { type: 'bomber'; ranks: number[] };

export interface ActionResult {
  state: GameState;
  events: GameEvent[];
  error?: string;
}

// ───────────────────────── 生成 ─────────────────────────

export function newMatch(names: string[], config: RuleConfig, seed: number): ActionResult {
  const cfg = normalizeConfig(config);
  const n = names.length;
  const s: GameState = {
    config: cfg,
    n,
    names: [...names],
    hands: names.map(() => []),
    phase: 'play',
    gameNo: 0,
    gameInSet: 0,
    blind: [],
    field: [],
    discardCount: 0,
    lastPlayer: null,
    turn: 0,
    direction: 1,
    revolution: false,
    elevenBack: false,
    lockSuits: null,
    numberLock: false,
    passed: [],
    winners: [],
    fouls: [],
    miyako: null,
    out: names.map(() => null),
    pending: [],
    afterPlay: null,
    exchanges: [],
    prevRanks: null,
    ranks: null,
    scores: names.map(() => 0),
    history: [],
    rng: seed >>> 0,
    mustInclude: null,
    gekokujo: false,
    seen: [],
    seq: 0,
  };
  const events: GameEvent[] = [];
  startGame(s, events);
  return { state: s, events };
}

export function startNextGame(prev: GameState): ActionResult {
  if (prev.phase !== 'roundEnd') return { state: prev, events: [], error: 'まだゲーム中です' };
  const s = clone(prev);
  const events: GameEvent[] = [];
  startGame(s, events);
  return { state: s, events };
}

function startGame(s: GameState, events: GameEvent[]) {
  const cfg = s.config;
  const n = s.n;
  const rng = createRng(s.rng);
  s.gameNo += 1;
  s.gameInSet = cfg.setLength > 0 ? ((s.gameNo - 1) % cfg.setLength) + 1 : s.gameNo;
  const newSet = cfg.setLength > 0 ? s.gameInSet === 1 : s.gameNo === 1;
  s.prevRanks = newSet ? null : s.ranks;
  s.ranks = null;

  // ブラインド（セットごと。セットなしならゲームごと）
  if (newSet || cfg.setLength === 0) {
    const naturals = shuffle(fullDeck(0), rng);
    s.blind = naturals.slice(0, Math.min(cfg.blindCards, 40));
  }
  const blindIds = new Set(s.blind.map((c) => c.id));
  const deck = shuffle(fullDeck(cfg.jokers).filter((c) => !blindIds.has(c.id)), rng);

  // 親（最初に出す人）を決める
  let leader = 0;
  const hands: Card[][] = Array.from({ length: n }, () => []);
  const dealStart = s.prevRanks ? s.prevRanks.indexOf(n - 1) : rng.int(n);
  deck.forEach((c, i) => hands[(dealStart + i) % n].push(c));
  s.hands = hands.map((h) => sortCards(h));

  s.field = [];
  s.discardCount = 0;
  s.lastPlayer = null;
  s.direction = 1;
  s.revolution = false;
  s.elevenBack = false;
  s.lockSuits = null;
  s.numberLock = false;
  s.passed = [];
  s.winners = [];
  s.fouls = [];
  s.miyako = null;
  s.out = Array.from({ length: n }, () => null);
  s.pending = [];
  s.afterPlay = null;
  s.exchanges = [];
  s.gekokujo = false;
  s.mustInclude = null;
  s.seen = [];

  events.push({ type: 'deal', gameNo: s.gameNo, gameInSet: s.gameInSet, handSizes: s.hands.map((h) => h.length) });

  const holderOf = (suit: Suit) => {
    for (let r = 3; r <= 15; r++) {
      const id = `${suit}${r}`;
      const p = s.hands.findIndex((h) => h.some((c) => c.id === id));
      if (p >= 0) return { p, id };
    }
    return { p: 0, id: null as string | null };
  };

  let leadRule: 'd3' | 's3' | 'random' | 'daihinmin' | 'daifugo' = cfg.firstLead;
  if (s.prevRanks) leadRule = cfg.nextLead;
  if (leadRule === 'd3' || leadRule === 's3') {
    const h = holderOf(leadRule === 'd3' ? 'D' : 'S');
    leader = h.p;
    if (cfg.mustPlayD3 && leadRule === 'd3' && h.id) s.mustInclude = h.id;
  } else if (leadRule === 'random') {
    leader = rng.int(n);
  } else if (leadRule === 'daihinmin') {
    leader = s.prevRanks!.indexOf(n - 1);
  } else {
    leader = s.prevRanks!.indexOf(0);
  }
  s.turn = leader;
  s.rng = rng.state();

  // 天変地異
  if (cfg.tenpen && s.prevRanks && n >= 2) {
    const low = s.prevRanks.indexOf(n - 1);
    const top = s.prevRanks.indexOf(0);
    if (s.hands[low].every((c) => !isJoker(c) && c.rank <= 10)) {
      [s.hands[low], s.hands[top]] = [s.hands[top], s.hands[low]];
      events.push({ type: 'tenpen', a: low, b: top });
    }
  }

  // カード交換
  if (cfg.exchange && s.prevRanks) {
    const pairs: [number, number, number][] = [[0, n - 1, cfg.exchangeTop]];
    if (n >= 4) pairs.push([1, n - 2, cfg.exchangeSecond]);
    for (const [hi, lo, count] of pairs) {
      if (count <= 0) continue;
      const upper = s.prevRanks.indexOf(hi);
      const lower = s.prevRanks.indexOf(lo);
      const give = strongestCards(s.hands[lower], count);
      moveCards(s, lower, upper, give.map((c) => c.id));
      events.push({ type: 'exchange', from: lower, to: upper, count: give.length, cardIds: give.map((c) => c.id), auto: true });
      const back = Math.min(count, s.hands[upper].length);
      if (back > 0) s.exchanges.push({ from: upper, to: lower, count: back });
    }
  }

  s.phase = s.exchanges.length ? 'exchange' : 'play';
  if (s.phase === 'play') events.push({ type: 'turn', player: s.turn });
}

/** 通常の強さで最も強いカード（ジョーカー > 2 > A > K ...） */
export function strongestCards(hand: Card[], count: number): Card[] {
  const sorted = sortCards(hand).reverse();
  return sorted.slice(0, count);
}

function moveCards(s: GameState, from: number, to: number, ids: string[]) {
  const set = new Set(ids);
  const moving = s.hands[from].filter((c) => set.has(c.id));
  s.hands[from] = s.hands[from].filter((c) => !set.has(c.id));
  s.hands[to] = sortCards([...s.hands[to], ...moving]);
}

// ───────────────────────── 参照系 ─────────────────────────

export function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x));
}

export const isActive = (s: GameState, p: number) => s.out[p] === null;
export const effectiveRev = (s: GameState) => s.revolution !== s.elevenBack;

export function fieldTop(s: GameState): Combo | null {
  return s.field.length ? s.field[s.field.length - 1].combo : null;
}

export function fieldCtx(s: GameState): FieldCtx {
  return {
    top: fieldTop(s),
    rev: effectiveRev(s),
    lockSuits: s.lockSuits,
    numberLock: s.numberLock,
    config: s.config,
    mustInclude: s.mustInclude,
  };
}

/** 次に行動すべきプレイヤー */
export function actors(s: GameState): number[] {
  if (s.phase === 'exchange') return [...new Set(s.exchanges.map((e) => e.from))];
  if (s.phase !== 'play') return [];
  if (s.pending.length) return [s.pending[0].player];
  return [s.turn];
}

export function nextActive(s: GameState, from: number, dir = s.direction): number | null {
  for (let i = 1; i <= s.n; i++) {
    const p = (((from + dir * i) % s.n) + s.n) % s.n;
    if (isActive(s, p)) return p;
  }
  return null;
}

/** 出す前の状態で、この出しが反則上がりになるか */
export function isFoulFinish(s: GameState, combo: Combo, cards: Card[]): boolean {
  const cfg = s.config;
  if (!cfg.forbiddenFinish) return false;
  const rev = effectiveRev(s);
  if (cfg.forbidJoker && cards.some(isJoker)) return true;
  if (cfg.forbidStrongest && cards.some((c) => !isJoker(c) && c.rank === (rev ? 3 : 15))) return true;
  if (cfg.forbidEight && cfg.effects.eightCut.on && effectCount(combo, cfg.effects.eightCut.rank, cfg) > 0) return true;
  if (cfg.forbidSpade3 && combo.type === 'single' && combo.cardIds[0] === 'S3') return true;
  return false;
}

// ───────────────────────── 行動 ─────────────────────────

export function applyAction(prev: GameState, player: number, action: Action): ActionResult {
  const fail = (error: string): ActionResult => ({ state: prev, events: [], error });
  if (!actors(prev).includes(player)) return fail('あなたの番ではありません');
  const s = clone(prev);
  const events: GameEvent[] = [];
  s.seq++;

  switch (action.type) {
    case 'give': {
      if (s.phase !== 'exchange') return fail('交換フェーズではありません');
      const task = s.exchanges.find((e) => e.from === player);
      if (!task) return fail('交換するカードはありません');
      const ids = uniq(action.cardIds);
      if (ids.length !== task.count) return fail(`${task.count}枚選んでください`);
      if (!owns(s, player, ids)) return fail('持っていないカードです');
      moveCards(s, player, task.to, ids);
      s.exchanges = s.exchanges.filter((e) => e !== task);
      events.push({ type: 'exchange', from: player, to: task.to, count: ids.length, cardIds: ids, auto: false });
      if (!s.exchanges.length) {
        s.phase = 'play';
        events.push({ type: 'exchangeDone' }, { type: 'turn', player: s.turn });
      }
      return { state: s, events };
    }

    case 'play': {
      if (s.phase !== 'play' || s.pending.length) return fail('今は出せません');
      const ids = uniq(action.cardIds);
      if (!ids.length) return fail('カードを選んでください');
      if (!owns(s, player, ids)) return fail('持っていないカードです');
      const cards = s.hands[player].filter((c) => ids.includes(c.id));
      const ctx = fieldCtx(s);
      const { combo, error } = resolvePlay(cards, ctx);
      if (!combo) return fail(error || '出せません');
      doPlay(s, player, combo, cards, events);
      return { state: s, events };
    }

    case 'pass': {
      if (s.phase !== 'play' || s.pending.length) return fail('今はパスできません');
      if (!s.field.length) return fail('親はパスできません');
      if (!s.passed.includes(player)) s.passed.push(player);
      events.push({ type: 'pass', player });
      advanceTurn(s, player, 0, events);
      return { state: s, events };
    }

    case 'sevenPass':
    case 'tenDiscard': {
      const pd = s.pending[0];
      if (!pd || pd.kind !== action.type) return fail('今はその操作はできません');
      const ids = uniq(action.cardIds);
      const need = Math.min(pd.count, s.hands[player].length);
      if (ids.length !== need) return fail(`${need}枚選んでください`);
      if (!owns(s, player, ids)) return fail('持っていないカードです');
      s.pending.shift();
      if (action.type === 'sevenPass') {
        const to = nextActive(s, player);
        if (to !== null) {
          moveCards(s, player, to, ids);
          events.push({ type: 'sevenPass', from: player, to, count: ids.length, cardIds: ids });
        }
      } else {
        const cards = s.hands[player].filter((c) => ids.includes(c.id));
        s.hands[player] = s.hands[player].filter((c) => !ids.includes(c.id));
        s.discardCount += cards.length;
        s.seen.push(...ids);
        events.push({ type: 'tenDiscard', player, cards });
      }
      continueAfterPlay(s, events);
      return { state: s, events };
    }

    case 'bomber': {
      const pd = s.pending[0];
      if (!pd || pd.kind !== 'queenBomber') return fail('今はその操作はできません');
      const ranks = uniq(action.ranks.map(Number)).filter((r) => r >= 3 && r <= 15);
      if (ranks.length !== pd.count) return fail(`${pd.count}つの数字を選んでください`);
      s.pending.shift();
      const discarded: { player: number; cards: Card[] }[] = [];
      for (let p = 0; p < s.n; p++) {
        if (!isActive(s, p)) continue;
        const hit = s.hands[p].filter((c) => !isJoker(c) && ranks.includes(c.rank));
        if (!hit.length) continue;
        s.hands[p] = s.hands[p].filter((c) => !hit.includes(c));
        s.discardCount += hit.length;
        s.seen.push(...hit.map((c) => c.id));
        discarded.push({ player: p, cards: hit });
      }
      events.push({ type: 'bomber', player, ranks, discarded });
      continueAfterPlay(s, events);
      return { state: s, events };
    }
  }
  return fail('不明な操作です');
}

function uniq<T>(a: T[]): T[] {
  return [...new Set(a)];
}

function owns(s: GameState, p: number, ids: string[]): boolean {
  const set = new Set(s.hands[p].map((c) => c.id));
  return ids.every((id) => set.has(id));
}

function doPlay(s: GameState, player: number, combo: Combo, cards: Card[], events: GameEvent[]) {
  const cfg = s.config;
  const prevTop = fieldTop(s);
  const rev = effectiveRev(s);
  const finishing = s.hands[player].length === cards.length;
  const foul = finishing && isFoulFinish(s, combo, cards);

  const ids = new Set(combo.cardIds);
  s.hands[player] = s.hands[player].filter((c) => !ids.has(c.id));
  s.field.push({ player, combo, cards });
  s.seen.push(...combo.cardIds);
  s.lastPlayer = player;
  s.mustInclude = null;
  if (cfg.passRule === 'rejoin') s.passed = [];
  else s.passed = s.passed.filter((p) => p !== player);
  events.push({ type: 'play', player, cards, combo, foulFinish: foul });

  let flush: FlushReason | null = null;

  // スペ3返し
  if (cfg.spade3Return && prevTop && prevTop.type === 'single' && prevTop.jokerOnly && combo.cardIds[0] === 'S3') {
    flush = 'spade3';
  }

  // 縛り
  if (prevTop && !flush) {
    if (cfg.suitLock && !s.lockSuits) {
      const ls = lockFrom(prevTop, combo);
      if (ls) {
        s.lockSuits = ls;
        events.push({ type: 'lock', suits: ls, number: s.numberLock });
      }
    }
    if (cfg.numberLock && !s.numberLock && numberLockFrom(prevTop, combo, rev)) {
      s.numberLock = true;
      events.push({ type: 'lock', suits: s.lockSuits, number: true });
    }
  }

  // 革命
  if (cfg.revolution && combo.type === 'multi' && !combo.jokerOnly && combo.size >= cfg.revolutionCount) {
    s.revolution = !s.revolution;
    events.push({ type: 'revolution', on: s.revolution, player });
  } else if (cfg.seqRevolution && combo.type === 'seq' && combo.size >= cfg.seqRevolutionLength) {
    s.revolution = !s.revolution;
    events.push({ type: 'revolution', on: s.revolution, player });
  }

  const eff = cfg.effects;
  const count = (k: keyof typeof eff) => (eff[k].on ? effectCount(combo, eff[k].rank, cfg) : 0);

  // 11バック
  if (count('elevenBack') > 0) {
    s.elevenBack = !s.elevenBack;
    events.push({ type: 'elevenBack', on: s.elevenBack });
  }
  // 9リバース
  if (count('nineReverse') > 0 && s.n > 2) {
    s.direction = s.direction === 1 ? -1 : 1;
    events.push({ type: 'reverse', direction: s.direction });
  }

  // 場が流れる出し
  if (!flush) {
    if (count('eightCut') > 0) flush = 'eightCut';
    else if (specialBeat(combo, cfg)) flush = specialBeat(combo, cfg)!;
    else if (cfg.sixCardFlush && combo.type === 'multi' && combo.size >= 6) flush = 'sixCard';
    else if (cfg.strongestSeq && combo.type === 'seq' && combo.overTop) flush = 'strongestSeq';
    else if (cfg.doubleJokerFlush && combo.type === 'multi' && combo.jokerOnly && combo.size >= 2) flush = 'doubleJoker';
  }
  if (flush) events.push({ type: 'special', kind: flush, player });

  // 5飛び
  const five = count('fiveSkip');
  const skips = cfg.skipPerCard ? five : five > 0 ? 1 : 0;

  // 選択が必要な効果
  const bomb = count('queenBomber');
  if (bomb > 0) s.pending.push({ kind: 'queenBomber', player, count: Math.min(bomb, 13) });
  const seven = count('sevenPass');
  if (seven > 0) s.pending.push({ kind: 'sevenPass', player, count: seven });
  const ten = count('tenDiscard');
  if (ten > 0) s.pending.push({ kind: 'tenDiscard', player, count: ten });

  s.afterPlay = { player, foul, flush, skips };
  continueAfterPlay(s, events);
}

function continueAfterPlay(s: GameState, events: GameEvent[]) {
  // 実行できない保留効果は捨てる
  while (s.pending.length) {
    const pd = s.pending[0];
    if (pd.kind === 'queenBomber') break;
    const hand = s.hands[pd.player].length;
    if (hand === 0 || (pd.kind === 'sevenPass' && nextActive(s, pd.player) === null)) {
      s.pending.shift();
      continue;
    }
    break;
  }
  if (s.pending.length) {
    events.push({ type: 'pending', pending: s.pending[0] });
    return;
  }
  const ap = s.afterPlay!;
  s.afterPlay = null;

  // 上がり判定（出した本人 → 他の人の順）
  const order = [ap.player];
  for (let i = 1; i < s.n; i++) order.push((ap.player + s.direction * i + s.n * 2) % s.n);
  for (const p of order) {
    if (s.phase !== 'play') break;
    if (isActive(s, p) && s.hands[p].length === 0) finish(s, p, p === ap.player && ap.foul, events);
  }
  if (s.phase !== 'play') return;

  if (ap.flush) {
    doFlush(s, ap.flush, events);
  } else {
    advanceTurn(s, ap.player, ap.skips, events);
  }
}

function finish(s: GameState, p: number, foul: boolean, events: GameEvent[]) {
  const cfg = s.config;
  s.out[p] = foul ? 'foul' : 'win';
  if (foul) s.fouls.push(p);
  else s.winners.push(p);
  events.push({ type: 'finish', player: p, foul, order: foul ? -1 : s.winners.length - 1 });

  if (!foul && s.winners.length === 1 && s.prevRanks) {
    const prevTop = s.prevRanks.indexOf(0);
    const prevBottom = s.prevRanks.indexOf(s.n - 1);
    if (cfg.gekokujo && p === prevBottom && s.n >= 3) {
      s.gekokujo = true;
      events.push({ type: 'gekokujo', player: p });
      endRound(s, events);
      return;
    }
    if (cfg.miyakoOchi && prevTop !== p && isActive(s, prevTop)) {
      s.out[prevTop] = 'miyako';
      s.miyako = prevTop;
      s.discardCount += s.hands[prevTop].length;
      s.hands[prevTop] = [];
      s.passed = s.passed.filter((x) => x !== prevTop);
      events.push({ type: 'miyakoOchi', player: prevTop });
    }
  }

  const active = s.out.map((o, i) => (o === null ? i : -1)).filter((i) => i >= 0);
  if (active.length <= 1) {
    if (active.length === 1) {
      s.out[active[0]] = 'win';
      s.winners.push(active[0]);
      events.push({ type: 'finish', player: active[0], foul: false, order: s.winners.length - 1 });
    }
    endRound(s, events);
  }
}

function endRound(s: GameState, events: GameEvent[]) {
  const n = s.n;
  let ranks: number[];
  if (s.gekokujo && s.prevRanks) {
    ranks = s.prevRanks.map((r) => n - 1 - r);
  } else {
    const rest = s.out.map((o, i) => (o === null ? i : -1)).filter((i) => i >= 0);
    const order = [...s.winners, ...rest, ...(s.miyako !== null ? [s.miyako] : []), ...[...s.fouls].reverse()];
    ranks = Array(n).fill(0);
    order.forEach((p, pos) => (ranks[p] = pos));
  }
  const cfg = s.config;
  const setFinal = cfg.setLength > 0 && s.gameInSet === cfg.setLength;
  const points = ranks.map((r) => pointsFor(r, n, cfg, setFinal));
  points.forEach((pt, i) => (s.scores[i] += pt));
  s.ranks = ranks;
  s.history.push({ ranks, points, gekokujo: s.gekokujo });
  s.pending = [];
  s.afterPlay = null;
  s.phase = s.gameNo >= cfg.games ? 'matchEnd' : 'roundEnd';
  events.push({ type: 'roundEnd', ranks, points, gekokujo: s.gekokujo });
  if (s.phase === 'matchEnd') events.push({ type: 'matchEnd', scores: [...s.scores] });
}

function leaderAfterFlush(s: GameState): number {
  const lp = s.lastPlayer;
  if (lp !== null && isActive(s, lp)) return lp;
  const nx = nextActive(s, lp ?? s.turn);
  return nx ?? 0;
}

function doFlush(s: GameState, reason: FlushReason, events: GameEvent[]) {
  const leader = leaderAfterFlush(s);
  for (const pl of s.field) s.discardCount += pl.cards.length;
  s.field = [];
  s.lastPlayer = null;
  s.lockSuits = null;
  s.numberLock = false;
  s.passed = [];
  if (s.elevenBack) {
    s.elevenBack = false;
    events.push({ type: 'elevenBack', on: false });
  }
  s.turn = leader;
  events.push({ type: 'flush', reason, leader });
  events.push({ type: 'turn', player: leader });
}

function advanceTurn(s: GameState, from: number, skips: number, events: GameEvent[]) {
  const lp = s.lastPlayer;
  let pos = from;
  let remaining = skips;
  for (let guard = 0; guard < s.n * 4; guard++) {
    pos = (((pos + s.direction) % s.n) + s.n) % s.n;
    if (pos === lp) {
      doFlush(s, 'allPass', events);
      return;
    }
    if (!isActive(s, pos)) continue;
    if (s.config.passRule === 'untilFlush' && s.passed.includes(pos)) continue;
    if (remaining > 0) {
      remaining--;
      events.push({ type: 'skip', player: pos });
      continue;
    }
    s.turn = pos;
    events.push({ type: 'turn', player: pos });
    return;
  }
  doFlush(s, 'allPass', events);
}

// ───────────────────────── 合法手 ─────────────────────────

/** 手札から作れる全ての出し（重複なし） */
export function enumerateCombos(hand: Card[], rev: boolean, cfg: RuleConfig): { cards: Card[]; combo: Combo }[] {
  const out: { cards: Card[]; combo: Combo }[] = [];
  const seen = new Set<string>();
  const jokers = hand.filter(isJoker);
  const add = (cards: Card[]) => {
    const key = cards.map((c) => c.id).sort().join(',');
    if (seen.has(key)) return;
    seen.add(key);
    for (const combo of analyze2(cards, rev, cfg)) out.push({ cards, combo });
  };

  // シングル
  for (const c of hand) add([c]);

  // 複数枚
  const byRank = new Map<number, Card[]>();
  for (const c of hand) if (!isJoker(c)) byRank.set(c.rank, [...(byRank.get(c.rank) || []), c]);
  for (const group of byRank.values()) {
    const subsets = allSubsets(group);
    for (const sub of subsets) {
      if (!sub.length) continue;
      for (let j = 0; j <= jokers.length; j++) {
        if (sub.length + j < 2) continue;
        add([...sub, ...jokers.slice(0, j)]);
      }
    }
  }
  if (jokers.length >= 2) add(jokers.slice(0, 2));

  // 階段
  if (cfg.sequence) {
    const suits: Suit[] = ['S', 'H', 'D', 'C'];
    const lowB = cfg.strongestSeq && rev ? -1 : 0;
    const highB = cfg.strongestSeq && !rev ? 13 : 12;
    for (const suit of suits) {
      const byIdx = new Map<number, Card>();
      for (const c of hand) if (c.suit === suit) byIdx.set(idxOf(c.rank), c);
      if (!byIdx.size) continue;
      for (let lo = lowB; lo <= highB; lo++) {
        const cards: Card[] = [];
        let need = 0;
        for (let hi = lo; hi <= highB; hi++) {
          const c = byIdx.get(hi);
          if (c) cards.push(c);
          else need++;
          if (need > jokers.length) break;
          const len = hi - lo + 1;
          if (len >= cfg.seqMinLength && cards.length > 0) add([...cards, ...jokers.slice(0, need)]);
        }
      }
    }
  }
  return out;
}

function analyze2(cards: Card[], rev: boolean, cfg: RuleConfig): Combo[] {
  // 同じカード集合の解釈のうち、種類ごとに最強のものだけ
  const all = analyzeCombos(cards, rev, cfg);
  const best = new Map<string, Combo>();
  for (const c of all) if (!best.has(c.type)) best.set(c.type, c);
  return [...best.values()];
}


function allSubsets<T>(arr: T[]): T[][] {
  const res: T[][] = [];
  const n = arr.length;
  for (let m = 1; m < 1 << n; m++) {
    const sub: T[] = [];
    for (let i = 0; i < n; i++) if (m & (1 << i)) sub.push(arr[i]);
    res.push(sub);
  }
  return res;
}

/** 現在の状況で player が出せる全ての手 */
export function legalPlays(s: GameState, player: number): { cards: Card[]; combo: Combo }[] {
  if (s.phase !== 'play' || s.pending.length || s.turn !== player) return [];
  const ctx = fieldCtx(s);
  const all = enumerateCombos(s.hands[player], ctx.rev, s.config);
  return all.filter((m) => checkPlay(m.combo, ctx) === null);
}

/** 指定カードで出せるか（UI 用） */
export function validatePlay(s: GameState, player: number, ids: string[]): { combo: Combo | null; error: string | null } {
  const cards = s.hands[player].filter((c) => ids.includes(c.id));
  if (cards.length !== ids.length) return { combo: null, error: '持っていないカードです' };
  return resolvePlay(cards, fieldCtx(s));
}
