// 出し札の解析（シングル / 複数枚 / 階段）と、場に出せるかの判定

import { Card, Suit, idxOf, isJoker, SUITS } from './cards';
import type { RuleConfig } from './rules';

export type ComboType = 'single' | 'multi' | 'seq';

export interface Combo {
  type: ComboType;
  cardIds: string[];
  size: number;
  /** single/multi: 自然札のランク (ジョーカーのみなら 0) */
  rank: number;
  jokerOnly: boolean;
  jokers: number;
  naturalSuits: Suit[];
  /** 階段のスート */
  suit?: Suit;
  /** 強さインデックスの範囲（階段: 窓の両端 / single・multi: 同値） */
  lo: number;
  hi: number;
  /** 最強階段（ジョーカーを最上段に置いた階段） */
  overTop: boolean;
  /** 階段の各位置の実効ランク（最上段ジョーカーは -1） */
  seqRanks: number[];
}

export interface FieldCtx {
  top: Combo | null;
  /** 実効的な強さ逆転（革命 XOR 11バック） */
  rev: boolean;
  lockSuits: Suit[] | null;
  numberLock: boolean;
  config: RuleConfig;
  /** ♦3 を含めて出す必要がある（ダイヤ3スタート） */
  mustInclude?: string | null;
}

export const JOKER_VALUE = 1000;

/** 組の強さ値（大きいほど強い） */
export function comboValue(c: Combo, rev: boolean): number {
  if (c.type === 'seq') return rev ? -c.hi : c.lo;
  if (c.jokerOnly) return JOKER_VALUE;
  const i = idxOf(c.rank);
  return rev ? -i : i;
}

/** 与えられたカード群の、ありうる全ての解釈（強い順） */
export function analyze(cards: Card[], rev: boolean, config: RuleConfig): Combo[] {
  const n = cards.length;
  if (n === 0) return [];
  const ids = cards.map((c) => c.id);
  const jokers = cards.filter(isJoker).length;
  const naturals = cards.filter((c) => !isJoker(c));
  const naturalSuits = naturals.map((c) => c.suit as Suit);
  const out: Combo[] = [];

  if (n === 1) {
    const c = cards[0];
    const jo = isJoker(c);
    const i = jo ? JOKER_VALUE : idxOf(c.rank);
    out.push({
      type: 'single', cardIds: ids, size: 1, rank: c.rank, jokerOnly: jo, jokers,
      naturalSuits, lo: i, hi: i, overTop: false, seqRanks: [],
    });
    return out;
  }

  // 複数枚（同じ数字 + ジョーカー）
  const ranks = new Set(naturals.map((c) => c.rank));
  if (ranks.size <= 1) {
    const rank = naturals.length ? naturals[0].rank : 0;
    const i = rank ? idxOf(rank) : JOKER_VALUE;
    out.push({
      type: 'multi', cardIds: ids, size: n, rank, jokerOnly: naturals.length === 0, jokers,
      naturalSuits, lo: i, hi: i, overTop: false, seqRanks: [],
    });
  }

  // 階段
  if (config.sequence && n >= config.seqMinLength && naturals.length > 0) {
    const suits = new Set(naturalSuits);
    if (suits.size === 1 && ranks.size === naturals.length) {
      const suit = naturalSuits[0];
      const idxs = naturals.map((c) => idxOf(c.rank));
      const minI = Math.min(...idxs);
      const maxI = Math.max(...idxs);
      const lowBound = config.strongestSeq && rev ? -1 : 0;
      const highBound = config.strongestSeq && !rev ? 13 : 12;
      const seqs: Combo[] = [];
      for (let s = maxI - n + 1; s <= minI; s++) {
        const e = s + n - 1;
        if (s < lowBound || e > highBound) continue;
        const seqRanks: number[] = [];
        for (let k = s; k <= e; k++) seqRanks.push(k < 0 || k > 12 ? -1 : k + 3);
        seqs.push({
          type: 'seq', cardIds: ids, size: n, rank: 0, jokerOnly: false, jokers,
          naturalSuits, suit, lo: s, hi: e,
          overTop: (s === -1 && rev) || (e === 13 && !rev),
          seqRanks,
        });
      }
      seqs.sort((a, b) => comboValue(b, rev) - comboValue(a, rev));
      out.push(...seqs);
    }
  }
  return out;
}

/** 組 c を場に出せるか。出せないなら理由を返す */
export function checkPlay(c: Combo, f: FieldCtx): string | null {
  const cfg = f.config;
  if (f.mustInclude && !c.cardIds.includes(f.mustInclude)) return '最初は♦3を含めて出してください';
  const top = f.top;
  if (top) {
    if (top.type !== c.type || top.size !== c.size) {
      return top.type === 'seq' ? `${top.size}枚の階段が必要です` : `${top.size}枚出しが必要です`;
    }
    const spade3 = cfg.spade3Return && c.type === 'single' && c.cardIds[0] === 'S3' && top.jokerOnly && top.type === 'single';
    if (!spade3) {
      if (!lockOk(c, f)) return '縛りのマークに合っていません';
      if (!numberLockOk(c, f)) return '数字縛り中です（次の数字のみ）';
      if (!stronger(c, top, f)) return '場のカードより強くありません';
    }
  }
  return null;
}

function lockOk(c: Combo, f: FieldCtx): boolean {
  if (!f.lockSuits) return true;
  if (c.jokerOnly) return true;
  const allowed = new Set(f.lockSuits);
  return c.naturalSuits.every((s) => allowed.has(s));
}

function numberLockOk(c: Combo, f: FieldCtx): boolean {
  if (!f.numberLock || !f.top || c.type === 'seq') return true;
  if (c.jokerOnly) return true;
  if (f.top.jokerOnly) return false;
  const d = f.rev ? -1 : 1;
  return idxOf(c.rank) === idxOf(f.top.rank) + d;
}

/** 特殊な「どんな組にも勝てる」出し */
export function specialBeat(c: Combo, cfg: RuleConfig): 'sandstorm' | 'ambulance' | 'rokurokubi' | null {
  if (c.type !== 'multi' || c.jokerOnly) return null;
  if (cfg.sandstorm && c.size === 3 && c.rank === 3) return 'sandstorm';
  if (cfg.ambulance && c.size === 2 && c.rank === 9) return 'ambulance';
  if (cfg.rokurokubi && c.size === 2 && c.rank === 6) return 'rokurokubi';
  return null;
}

function stronger(c: Combo, top: Combo, f: FieldCtx): boolean {
  const cfg = f.config;
  if (c.type === 'seq') {
    if (cfg.seqCompare === 'noOverlap') {
      return f.rev ? c.hi < top.lo : c.lo > top.hi;
    }
    return comboValue(c, f.rev) > comboValue(top, f.rev);
  }
  // ジョーカー単体・ジョーカーのみの組は誰にも負けない
  if (top.jokerOnly) return false;
  if (c.jokerOnly) return true;
  if (specialBeat(c, cfg)) return true;
  return comboValue(c, f.rev) > comboValue(top, f.rev);
}

/** カード群から、場に出せる最も有利な解釈を選ぶ */
export function resolvePlay(cards: Card[], f: FieldCtx): { combo: Combo | null; error: string | null } {
  const interps = analyze(cards, f.rev, f.config);
  if (interps.length === 0) return { combo: null, error: '出せない組み合わせです' };
  // 場と同じ種類を優先、場が空なら複数枚出しを優先
  const ordered = [...interps].sort((a, b) => pref(b, f) - pref(a, f));
  let firstErr: string | null = null;
  for (const c of ordered) {
    const err = checkPlay(c, f);
    if (!err) return { combo: c, error: null };
    firstErr ??= err;
  }
  return { combo: null, error: firstErr };
}

function pref(c: Combo, f: FieldCtx): number {
  if (f.top) return c.type === f.top.type ? 1 : 0;
  return c.type === 'seq' ? 0 : 1;
}

/** 効果札の発動枚数 */
export function effectCount(c: Combo, rank: number, cfg: RuleConfig): number {
  if (c.type === 'seq') return cfg.effectsInSequence && c.seqRanks.includes(rank) ? 1 : 0;
  if (c.jokerOnly) return 0;
  return c.rank === rank ? c.size : 0;
}

/** 2つの連続した出しで縛りが成立するか。成立するならそのマーク */
export function lockFrom(prev: Combo, cur: Combo): Suit[] | null {
  if (prev.type !== cur.type || prev.size !== cur.size) return null;
  if (!prev.naturalSuits.length || !cur.naturalSuits.length) return null;
  if (cur.type === 'seq') return prev.suit === cur.suit ? [cur.suit!] : null;
  const union = new Set<Suit>([...prev.naturalSuits, ...cur.naturalSuits]);
  if (union.size !== cur.size) return null;
  return SUITS.filter((s) => union.has(s));
}

/** 数字縛りが成立するか */
export function numberLockFrom(prev: Combo, cur: Combo, rev: boolean): boolean {
  if (prev.type === 'seq' || cur.type === 'seq') return false;
  if (prev.jokerOnly || cur.jokerOnly) return false;
  const d = rev ? -1 : 1;
  return idxOf(cur.rank) === idxOf(prev.rank) + d;
}

export function comboName(c: Combo): string {
  if (c.type === 'single') return c.jokerOnly ? 'ジョーカー' : 'シングル';
  if (c.type === 'seq') return `${c.size}枚階段`;
  return ['', '', 'ペア', 'スリーカード', 'フォーカード', 'ファイブカード', 'シックスカード'][c.size] ?? `${c.size}枚出し`;
}
