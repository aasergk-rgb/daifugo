// カード定義と基本ユーティリティ

export type Suit = 'S' | 'H' | 'D' | 'C';
export type CardSuit = Suit | 'X';

/**
 * rank: 3..15 (11=J, 12=Q, 13=K, 14=A, 15=2) / ジョーカーは 0
 * 強さインデックス (idx) は rank - 3 で 0..12 (3 が最弱、2 が最強)。
 */
export interface Card {
  id: string;
  suit: CardSuit;
  rank: number;
}

export const SUITS: Suit[] = ['S', 'H', 'D', 'C'];
export const RANKS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
export const JOKER = 0;

export const SUIT_SYMBOL: Record<CardSuit, string> = { S: '♠', H: '♥', D: '♦', C: '♣', X: '★' };
export const SUIT_NAME: Record<CardSuit, string> = { S: 'スペード', H: 'ハート', D: 'ダイヤ', C: 'クラブ', X: 'ジョーカー' };

export function rankLabel(rank: number): string {
  switch (rank) {
    case 0: return 'JK';
    case 11: return 'J';
    case 12: return 'Q';
    case 13: return 'K';
    case 14: return 'A';
    case 15: return '2';
    default: return String(rank);
  }
}

export function cardLabel(c: Card): string {
  if (c.suit === 'X') return 'JOKER';
  return SUIT_SYMBOL[c.suit] + rankLabel(c.rank);
}

export const isJoker = (c: Card) => c.suit === 'X';
export const isRed = (s: CardSuit) => s === 'H' || s === 'D';

export function makeCard(suit: CardSuit, rank: number, n = 1): Card {
  if (suit === 'X') return { id: `X${n}`, suit, rank: 0 };
  return { id: `${suit}${rank}`, suit, rank };
}

export function cardFromId(id: string): Card {
  const suit = id[0] as CardSuit;
  if (suit === 'X') return { id, suit, rank: 0 };
  return { id, suit, rank: Number(id.slice(1)) };
}

export function fullDeck(jokers: number): Card[] {
  const deck: Card[] = [];
  for (const s of SUITS) for (const r of RANKS) deck.push(makeCard(s, r));
  for (let i = 1; i <= jokers; i++) deck.push(makeCard('X', 0, i));
  return deck;
}

/** 強さインデックス (自然札のみ) */
export const idxOf = (rank: number) => rank - 3;
export const rankOfIdx = (idx: number) => idx + 3;

const SUIT_ORDER: Record<CardSuit, number> = { S: 0, H: 1, D: 2, C: 3, X: 4 };

/** 手札の並べ替え。rev=true なら革命中の強さ順 */
export function sortCards(cards: Card[], rev = false, bySuit = false): Card[] {
  return [...cards].sort((a, b) => {
    if (a.suit === 'X' || b.suit === 'X') {
      if (a.suit === b.suit) return a.id.localeCompare(b.id);
      return a.suit === 'X' ? 1 : -1;
    }
    if (bySuit && a.suit !== b.suit) return SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit];
    const d = rev ? b.rank - a.rank : a.rank - b.rank;
    if (d !== 0) return d;
    return SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit];
  });
}
