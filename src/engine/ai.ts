// CPU 思考ルーチン
//  easy   : 弱い手から雑に出す。たまにミスをする
//  normal : 手札の組み立てを評価して出す
//  hard   : normal + カウンティング（見えていないカードから「返されない手」を判断）
//  oni    : hard の候補をモンテカルロ・シミュレーションで比較

import { Card, fullDeck, idxOf, isJoker, sortCards } from './cards';
import { Combo, checkPlay, effectCount, lockFrom } from './combo';
import {
  Action,
  GameState,
  actors,
  applyAction,
  effectiveRev,
  enumerateCombos,
  fieldCtx,
  fieldTop,
  isFoulFinish,
  isActive,
  legalPlays,
} from './game';
import { createRng, Rng, shuffle } from './rng';
import type { RuleConfig } from './rules';

export type Difficulty = 'easy' | 'normal' | 'hard' | 'oni';

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: 'よわい',
  normal: 'ふつう',
  hard: 'つよい',
  oni: '鬼',
};

type Move = { cards: Card[]; combo: Combo };

// ───────────────────────── 手札評価 ─────────────────────────

/** 手札の「上がりにくさ」（小さいほど良い） */
export function handCost(hand: Card[], rev: boolean, cfg: RuleConfig, top?: TopInfo): number {
  if (hand.length === 0) return -5;
  const jokers = hand.filter(isJoker).length;
  const nat = hand.filter((c) => !isJoker(c));
  let best = groupsCost(groupMultis(nat), rev, cfg, top);
  if (cfg.sequence) {
    const { seqs, rest } = extractSeqs(nat, cfg.seqMinLength);
    if (seqs.length) {
      const c = groupsCost(groupMultis(rest), rev, cfg, top) + seqs.reduce((a, s) => a + seqCost(s, rev), 0);
      best = Math.min(best, c);
    }
  }
  let cost = best - jokers * 0.85;
  // 反則上がり: 残りが禁止札だけだと上がれない
  if (cfg.forbiddenFinish) {
    const safe = nat.filter((c) => !forbiddenCard(c, rev, cfg));
    if (safe.length === 0) cost += 1.6;
  }
  return cost;
}

function forbiddenCard(c: Card, rev: boolean, cfg: RuleConfig): boolean {
  if (isJoker(c)) return cfg.forbidJoker;
  if (cfg.forbidStrongest && c.rank === (rev ? 3 : 15)) return true;
  if (cfg.forbidEight && cfg.effects.eightCut.on && c.rank === cfg.effects.eightCut.rank) return true;
  if (cfg.forbidSpade3 && c.id === 'S3') return true;
  return false;
}

function groupMultis(cards: Card[]): Card[][] {
  const m = new Map<number, Card[]>();
  for (const c of cards) m.set(c.rank, [...(m.get(c.rank) || []), c]);
  return [...m.values()];
}

function extractSeqs(cards: Card[], minLen: number): { seqs: Card[][]; rest: Card[] } {
  const seqs: Card[][] = [];
  const used = new Set<string>();
  for (const suit of ['S', 'H', 'D', 'C']) {
    const s = sortCards(cards.filter((c) => c.suit === suit));
    let run: Card[] = [];
    const flush = () => {
      if (run.length >= minLen) {
        seqs.push(run);
        run.forEach((c) => used.add(c.id));
      }
      run = [];
    };
    for (const c of s) {
      if (run.length && c.rank === run[run.length - 1].rank + 1) run.push(c);
      else {
        flush();
        run = [c];
      }
    }
    flush();
  }
  return { seqs, rest: cards.filter((c) => !used.has(c.id)) };
}

function strengthOf(rank: number, rev: boolean): number {
  const i = idxOf(rank);
  return rev ? 12 - i : i;
}

/** 見えていないカードで作れる、枚数ごとの最強の強さ（カウンティング） */
export interface TopInfo {
  rev: boolean;
  maxStr: number[]; // index = 枚数
}

function topInfo(unseen: Card[], rev: boolean): TopInfo {
  const cnt = new Map<number, number>();
  let jk = 0;
  for (const c of unseen) {
    if (isJoker(c)) jk++;
    else cnt.set(c.rank, (cnt.get(c.rank) || 0) + 1);
  }
  const maxStr: number[] = [];
  for (let k = 1; k <= 8; k++) {
    let m = -1;
    if (jk >= k) m = 99;
    else for (const [r, n] of cnt) if (n + jk >= k) m = Math.max(m, strengthOf(r, rev));
    maxStr[k] = m;
  }
  return { rev, maxStr };
}

function groupsCost(groups: Card[][], rev: boolean, cfg: RuleConfig, top?: TopInfo): number {
  let cost = 0;
  for (const g of groups) {
    const r = g[0].rank;
    const s = strengthOf(r, rev);
    const weak = (12 - s) / 12;
    let c = 0.3 + weak * 0.95;
    if (top && top.rev === rev) {
      if (s > (top.maxStr[g.length] ?? -1)) c = -0.25; // 誰にも返されない
    } else if (s >= 11) c -= 0.35;
    if (cfg.effects.eightCut.on && r === cfg.effects.eightCut.rank) c = 0.15;
    if (g.length >= 2) c *= 0.82;
    if (cfg.revolution && g.length >= cfg.revolutionCount) c = 0.2;
    cost += c;
  }
  return cost;
}

function seqCost(seq: Card[], rev: boolean): number {
  const lo = strengthOf(rev ? seq[seq.length - 1].rank : seq[0].rank, rev);
  return 0.35 + ((12 - lo) / 12) * 0.35;
}

/** 実験用の調整値 */
export const TUNING = { winLine: 0.6, strongPenalty: 0.8, mcBudget: 200 };

/** 手札を組に分ける（組数が少ない方） */
function decompose(hand: Card[], cfg: RuleConfig): Card[][] {
  const nat = hand.filter((c) => !isJoker(c));
  let best = groupMultis(nat);
  if (cfg.sequence) {
    const { seqs, rest } = extractSeqs(nat, cfg.seqMinLength);
    const alt = [...seqs, ...groupMultis(rest)];
    if (seqs.length && alt.length <= best.length) best = alt;
  }
  return best;
}

/** 返されない組の数で、残りの弱い組を出し切れるか */
function winningLine(rest: Card[], rev: boolean, cfg: RuleConfig, top: TopInfo, haveLead: boolean): boolean {
  const groups = decompose(rest, cfg);
  let control = rest.filter(isJoker).length;
  let weak = 0;
  for (const g of groups) {
    const isSeq = g.length >= cfg.seqMinLength && g[0].rank !== g[g.length - 1].rank;
    const st = strengthOf(g[0].rank, rev);
    if (isSeq) weak++;
    else if (st > (top.maxStr[g.length] ?? -1) || (cfg.effects.eightCut.on && g[0].rank === cfg.effects.eightCut.rank)) control++;
    else weak++;
  }
  return weak <= control + (haveLead ? 1 : 0);
}

// ───────────────────────── カウンティング ─────────────────────────

function unseenCards(s: GameState, player: number): Card[] {
  const known = new Set<string>([...s.seen, ...s.hands[player].map((c) => c.id)]);
  return fullDeck(s.config.jokers).filter((c) => !known.has(c.id));
}

/** 見えていないカードの中に、この手を返せる組があるか */
function beatable(s: GameState, player: number, move: Move, unseen: Card[]): boolean {
  const ctxBefore = fieldCtx(s);
  const top = ctxBefore.top;
  let lock = ctxBefore.lockSuits;
  if (!lock && s.config.suitLock && top) lock = lockFrom(top, move.combo);
  let rev = ctxBefore.rev;
  const cfg = s.config;
  if (cfg.revolution && move.combo.type === 'multi' && !move.combo.jokerOnly && move.combo.size >= cfg.revolutionCount) rev = !rev;
  if (cfg.effects.elevenBack.on && effectCount(move.combo, cfg.effects.elevenBack.rank, cfg) > 0) rev = !rev;
  const maxOpp = Math.max(0, ...s.hands.map((h, i) => (i !== player && isActive(s, i) ? h.length : 0)));
  if (move.combo.size > maxOpp) return false;
  const ctx = { ...ctxBefore, top: move.combo, rev, lockSuits: lock, mustInclude: null };
  for (const m of enumerateCombos(unseen, rev, cfg)) {
    if (m.combo.size !== move.combo.size || m.combo.type !== move.combo.type) continue;
    if (checkPlay(m.combo, ctx) === null) return true;
  }
  return false;
}

// ───────────────────────── 手の評価 ─────────────────────────

interface Scored {
  action: Action;
  score: number;
}

function flushesField(s: GameState, m: Move): boolean {
  const cfg = s.config;
  const top = fieldTop(s);
  if (cfg.effects.eightCut.on && effectCount(m.combo, cfg.effects.eightCut.rank, cfg) > 0) return true;
  if (cfg.spade3Return && top?.jokerOnly && top.type === 'single' && m.combo.cardIds[0] === 'S3') return true;
  if (m.combo.type === 'multi' && m.combo.jokerOnly && cfg.doubleJokerFlush) return true;
  if (m.combo.type === 'seq' && m.combo.overTop && cfg.strongestSeq) return true;
  if (m.combo.type === 'multi' && m.combo.size >= 6 && cfg.sixCardFlush) return true;
  if (m.combo.type === 'multi' && !m.combo.jokerOnly) {
    if (cfg.sandstorm && m.combo.size === 3 && m.combo.rank === 3) return true;
    if (cfg.ambulance && m.combo.size === 2 && m.combo.rank === 9) return true;
    if (cfg.rokurokubi && m.combo.size === 2 && m.combo.rank === 6) return true;
  }
  return false;
}

function scoreMoves(s: GameState, player: number, diff: Difficulty, rng: Rng): Scored[] {
  const cfg = s.config;
  const hand = s.hands[player];
  const rev = effectiveRev(s);
  const moves = legalPlays(s, player);
  const leading = s.field.length === 0;
  const opps = s.hands.map((h, i) => (i !== player && isActive(s, i) ? h.length : 99));
  const minOpp = Math.min(...opps);
  const unseen = diff === 'hard' || diff === 'oni' ? unseenCards(s, player) : null;
  const tops = unseen ? [topInfo(unseen, false), topInfo(unseen, true)] : null;
  const topFor = (r: boolean) => (tops ? tops[r ? 1 : 0] : undefined);
  const baseCost = handCost(hand, s.revolution, cfg, topFor(s.revolution));
  const out: Scored[] = [];

  for (const m of moves) {
    const ids = new Set(m.combo.cardIds);
    const rest = hand.filter((c) => !ids.has(c.id));
    let newRev = rev;
    const isRevo =
      (cfg.revolution && m.combo.type === 'multi' && !m.combo.jokerOnly && m.combo.size >= cfg.revolutionCount) ||
      (cfg.seqRevolution && m.combo.type === 'seq' && m.combo.size >= cfg.seqRevolutionLength);
    if (isRevo) newRev = !newRev;
    // 11バックは一時的なので評価は場の流れまで
    const longRev = isRevo ? s.revolution !== true : s.revolution;

    if (rest.length === 0) {
      const foul = isFoulFinish(s, m.combo, m.cards);
      out.push({ action: { type: 'play', cardIds: m.combo.cardIds }, score: foul ? -50 : 100 });
      continue;
    }

    let restCost = handCost(rest, longRev, cfg, topFor(longRev));
    // 7渡し / 10捨て はさらに手札を減らせる
    const giveN =
      (cfg.effects.sevenPass.on ? effectCount(m.combo, cfg.effects.sevenPass.rank, cfg) : 0) +
      (cfg.effects.tenDiscard.on ? effectCount(m.combo, cfg.effects.tenDiscard.rank, cfg) : 0);
    if (giveN > 0) {
      const after = bestRemoval(rest, Math.min(giveN, rest.length), longRev, cfg);
      restCost = handCost(after, longRev, cfg, topFor(longRev));
    }
    let score = baseCost - restCost; // 手札がどれだけ良くなったか

    // 親を取れるか
    const flush = flushesField(s, m);
    let control = flush;
    if (!control && unseen) control = !beatable(s, player, m, unseen);
    else if (!control) {
      const st = m.combo.type === 'seq' ? 9 : m.combo.jokerOnly ? 13 : strengthOf(m.combo.rank, rev);
      control = st >= 12 || (m.combo.size >= 3 && st >= 8);
    }
    if (control) score += rest.length <= 3 ? 1.2 : 0.7;
    // 勝ち筋（返されない組で親を取り続けて上がれる）
    if (tops && TUNING.winLine && winningLine(rest, longRev, cfg, topFor(longRev)!, control || leading)) score += TUNING.winLine;

    // 相手が上がりそうなら止めにいく
    if (!leading && minOpp <= 2) score += 0.8;
    if (!leading && minOpp <= 1 && m.combo.size === 1) score += 0.6;

    // 強い札の無駄遣いを控える（序盤）
    const strongUsed = m.cards.filter((c) => isJoker(c) || strengthOf(c.rank, rev) >= 11).length;
    if (!leading && hand.length > 6 && minOpp > 3) score -= strongUsed * (tops ? TUNING.strongPenalty : 0.35);

    // 複数枚を残すために、グループを崩す出しは減点
    if (m.combo.type !== 'seq' && !m.combo.jokerOnly) {
      const sameRank = hand.filter((c) => !isJoker(c) && c.rank === m.combo.rank).length;
      const natUsed = m.cards.filter((c) => !isJoker(c)).length;
      if (sameRank > natUsed) score -= 0.4 * (sameRank - natUsed) * (leading ? 1 : 0.6);
    }
    if (m.combo.jokers > 0 && m.combo.type !== 'single' && hand.length > 4) score -= 0.5 * m.combo.jokers;

    // 5飛び・Qボンバーは少し得
    if (cfg.effects.fiveSkip.on && effectCount(m.combo, cfg.effects.fiveSkip.rank, cfg) > 0) score += 0.15;
    if (cfg.effects.queenBomber.on && effectCount(m.combo, cfg.effects.queenBomber.rank, cfg) > 0) score += 0.25;

    // 親のときは多く出せるほど良い
    if (leading) score += (m.combo.size - 1) * 0.12;

    if (diff === 'easy') score += (rng.next() - 0.5) * 1.4;
    out.push({ action: { type: 'play', cardIds: m.combo.cardIds }, score });
  }

  if (!leading) {
    // パスの価値: 何もしない＝0 を基準に、相手が近いほどパスは悪い
    let passScore = 0.05;
    if (minOpp <= 2) passScore -= 0.6;
    if (diff === 'easy') passScore += (rng.next() - 0.5) * 0.8;
    out.push({ action: { type: 'pass' }, score: passScore });
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}

/** 手札から count 枚取り除いて最も良くなる残り */
function bestRemoval(hand: Card[], count: number, rev: boolean, cfg: RuleConfig): Card[] {
  if (count <= 0) return hand;
  if (count >= hand.length) return [];
  // 弱い順 10 枚までを候補に組み合わせ探索
  const order = sortCards(hand, rev).filter((c) => !isJoker(c));
  const cand = order.slice(0, Math.min(order.length, 10));
  let best: Card[] = hand.slice(count);
  let bestCost = Infinity;
  const pick: Card[] = [];
  const rec = (start: number) => {
    if (pick.length === count) {
      const ids = new Set(pick.map((c) => c.id));
      const rest = hand.filter((c) => !ids.has(c.id));
      const cost = handCost(rest, rev, cfg);
      if (cost < bestCost) {
        bestCost = cost;
        best = rest;
      }
      return;
    }
    for (let i = start; i < cand.length; i++) {
      pick.push(cand[i]);
      rec(i + 1);
      pick.pop();
    }
  };
  rec(0);
  return best;
}

function chooseRemovalIds(hand: Card[], count: number, rev: boolean, cfg: RuleConfig): string[] {
  const rest = bestRemoval(hand, count, rev, cfg);
  const keep = new Set(rest.map((c) => c.id));
  const ids = hand.filter((c) => !keep.has(c.id)).map((c) => c.id);
  return ids.slice(0, count);
}

function chooseBomberRanks(s: GameState, player: number, count: number): number[] {
  const cfg = s.config;
  const rev = s.revolution;
  const hand = s.hands[player];
  const unseen = unseenCards(s, player);
  const base = handCost(hand, rev, cfg);
  const scored: { r: number; v: number }[] = [];
  for (let r = 3; r <= 15; r++) {
    const rest = hand.filter((c) => isJoker(c) || c.rank !== r);
    let v = base - handCost(rest, rev, cfg);
    const opp = unseen.filter((c) => c.rank === r).length;
    v += opp * 0.2 * (0.5 + strengthOf(r, rev) / 12);
    scored.push({ r, v });
  }
  scored.sort((a, b) => b.v - a.v);
  return scored.slice(0, count).map((x) => x.r);
}

// ───────────────────────── モンテカルロ（鬼） ─────────────────────────

function determinize(s: GameState, player: number, rng: Rng): GameState {
  const g: GameState = JSON.parse(JSON.stringify(s));
  const pool = shuffle(unseenCards(s, player), rng);
  let k = 0;
  for (let p = 0; p < g.n; p++) {
    if (p === player) continue;
    const need = g.hands[p].length;
    g.hands[p] = sortCards(pool.slice(k, k + need));
    k += need;
  }
  return g;
}

/** 軽量方針（シミュレーション用） */
function fastPolicy(s: GameState, p: number, rng: Rng): Action {
  const pd = s.pending[0];
  if (s.phase === 'exchange') {
    const t = s.exchanges.find((e) => e.from === p)!;
    return { type: 'give', cardIds: sortCards(s.hands[p]).slice(0, t.count).map((c) => c.id) };
  }
  if (pd) {
    if (pd.kind === 'queenBomber') {
      const own = new Set(s.hands[p].map((c) => c.rank));
      const rs: number[] = [];
      for (let r = 3; r <= 15 && rs.length < pd.count; r++) if (!own.has(r)) rs.push(r);
      for (let r = 3; rs.length < pd.count; r++) if (!rs.includes(r)) rs.push(r);
      return { type: 'bomber', ranks: rs };
    }
    const n = Math.min(pd.count, s.hands[p].length);
    return { type: pd.kind, cardIds: sortCards(s.hands[p], effectiveRev(s)).slice(0, n).map((c) => c.id) };
  }
  const moves = legalPlays(s, p);
  if (!moves.length) return { type: 'pass' };
  const rev = effectiveRev(s);
  const val = (m: Move) =>
    (m.combo.jokerOnly ? 20 : m.combo.type === 'seq' ? (rev ? 12 - m.combo.hi : m.combo.lo) : strengthOf(m.combo.rank, rev)) -
    m.combo.size * 0.8;
  moves.sort((a, b) => val(a) - val(b));
  if (s.field.length && s.hands[p].length > 5 && rng.next() < 0.25) return { type: 'pass' };
  return { type: 'play', cardIds: moves[0].combo.cardIds };
}

function rollout(g: GameState, player: number, rng: Rng): number {
  let s = g;
  for (let step = 0; step < 400; step++) {
    if (s.phase !== 'play' && s.phase !== 'exchange') break;
    if (s.out[player] !== null) break;
    const a = actors(s)[0];
    if (a === undefined) break;
    const act = a === player || rng.next() < 0.5 ? decide(s, a, 'normal', rng.int(1e9)) : fastPolicy(s, a, rng);
    let r = applyAction(s, a, act);
    if (r.error) r = applyAction(s, a, { type: 'pass' });
    if (r.error) break;
    s = r.state;
  }
  // 早く上がるほど高得点
  if (s.out[player] === 'win') return s.n - s.winners.indexOf(player);
  if (s.out[player] === 'foul' || s.out[player] === 'miyako') return 0;
  return 0.5 + (s.winners.length ? 0 : 0.5) - s.hands[player].length * 0.05;
}

function monteCarlo(s: GameState, player: number, cands: Scored[], rng: Rng, budgetMs: number): Scored {
  const start = Date.now();
  const totals = cands.map(() => 0);
  const counts = cands.map(() => 0);
  let iter = 0;
  while (Date.now() - start < budgetMs && iter < 400) {
    const g = determinize(s, player, rng);
    for (let i = 0; i < cands.length; i++) {
      const r = applyAction(g, player, cands[i].action);
      if (r.error) continue;
      totals[i] += rollout(r.state, player, rng);
      counts[i]++;
    }
    iter++;
  }
  let bestI = 0;
  let bestV = -Infinity;
  cands.forEach((c, i) => {
    const v = counts[i] ? totals[i] / counts[i] + c.score * 0.05 : -Infinity;
    if (v > bestV) {
      bestV = v;
      bestI = i;
    }
  });
  return cands[bestI];
}

// ───────────────────────── 入口 ─────────────────────────

export function decide(s: GameState, player: number, diff: Difficulty, seed = Date.now()): Action {
  const rng = createRng(seed ^ (player * 7919));
  const cfg = s.config;
  const hand = s.hands[player];

  if (s.phase === 'exchange') {
    const task = s.exchanges.find((e) => e.from === player);
    if (task) {
      const ids =
        diff === 'easy'
          ? sortCards(hand).slice(0, task.count).map((c) => c.id)
          : chooseRemovalIds(hand, task.count, false, cfg);
      return { type: 'give', cardIds: ids };
    }
  }

  const pd = s.pending[0];
  if (pd && pd.player === player) {
    if (pd.kind === 'queenBomber') return { type: 'bomber', ranks: chooseBomberRanks(s, player, pd.count) };
    const n = Math.min(pd.count, hand.length);
    return { type: pd.kind, cardIds: chooseRemovalIds(hand, n, s.revolution, cfg) };
  }

  const scored = scoreMoves(s, player, diff, rng);
  if (!scored.length) return { type: 'pass' };
  if (diff === 'easy' && rng.next() < 0.15 && scored.length > 1) return scored[1].action;
  if (diff === 'oni' && scored.length > 1 && scored[0].score < 50) {
    const cands = scored.slice(0, 5);
    return monteCarlo(s, player, cands, rng, TUNING.mcBudget).action;
  }
  return scored[0].action;
}

/** おすすめ手（ヒント機能） */
export function suggest(s: GameState, player: number): Action | null {
  if (!actors(s).includes(player)) return null;
  return decide(s, player, 'hard', 12345);
}

