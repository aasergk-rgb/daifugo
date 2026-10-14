import { describe, expect, it } from 'vitest';
import { cardFromId, fullDeck } from '../src/engine/cards';
import { analyze } from '../src/engine/combo';
import { Action, GameState, actors, applyAction, legalPlays, newMatch, startNextGame } from '../src/engine/game';
import { decide, Difficulty } from '../src/engine/ai';
import { PRESETS, RuleConfig, presetConfig, normalizeConfig } from '../src/engine/rules';

const ids = (s: string) => s.split(' ').filter(Boolean);
const cards = (s: string) => ids(s).map(cardFromId);

/** 手札を指定した 4 人戦の状態を作る */
function setup(hands: string[], patch: Partial<RuleConfig> = {}, base = presetConfig('basic')): GameState {
  const cfg = normalizeConfig({ ...base, ...patch, exchange: false });
  const s = newMatch(hands.map((_, i) => `P${i}`), cfg, 1).state;
  s.hands = hands.map(cards);
  s.turn = 0;
  s.phase = 'play';
  s.mustInclude = null;
  return s;
}

function act(s: GameState, p: number, a: Action) {
  const r = applyAction(s, p, a);
  if (r.error) throw new Error(`P${p} ${JSON.stringify(a)}: ${r.error}`);
  return r;
}
const play = (s: GameState, p: number, c: string) => act(s, p, { type: 'play', cardIds: ids(c) });
const pass = (s: GameState, p: number) => act(s, p, { type: 'pass' });

describe('combo analysis', () => {
  const cfg = presetConfig('basic');
  it('recognizes pairs with jokers', () => {
    const c = analyze(cards('H5 X1'), false, cfg);
    expect(c[0].type).toBe('multi');
    expect(c[0].rank).toBe(5);
  });
  it('recognizes sequences with joker gaps and picks the strongest', () => {
    const c = analyze(cards('S5 S6 X1'), false, cfg).filter((x) => x.type === 'seq');
    expect(c[0].lo).toBe(idx(5)); // 5-6-7 が最強解釈
    expect(c.length).toBe(2);
  });
  it('rejects mixed suit sequences', () => {
    expect(analyze(cards('S5 H6 S7'), false, cfg).length).toBe(0);
  });
  it('strongest sequence (joker above 2) only with rule', () => {
    const fed = presetConfig('federation');
    const c = analyze(cards('S14 S15 X1'), false, fed).filter((x) => x.type === 'seq');
    expect(c[0].overTop).toBe(true);
    const c2 = analyze(cards('S14 S15 X1'), false, cfg).filter((x) => x.type === 'seq');
    expect(c2.every((x) => !x.overTop)).toBe(true);
  });
});

function idx(r: number) {
  return r - 3;
}

describe('basic play', () => {
  it('requires stronger cards of the same count', () => {
    const s = setup(['H5 H9', 'S4 S6', 'C7 D7', 'D10 C10']);
    const r = play(s, 0, 'H5');
    expect(applyAction(r.state, 1, { type: 'play', cardIds: ['S4'] }).error).toBeTruthy();
    const r2 = play(r.state, 1, 'S6');
    expect(applyAction(r2.state, 2, { type: 'play', cardIds: ['C7', 'D7'] }).error).toBeTruthy();
  });

  it('flushes when everyone passes and the last player leads', () => {
    const s = setup(['H5 H9', 'S4 S6', 'C3 D4', 'D10 C10']);
    let r = play(s, 0, 'H9');
    r = pass(r.state, 1);
    r = pass(r.state, 2);
    r = pass(r.state, 3);
    expect(r.state.field.length).toBe(0);
    expect(r.state.turn).toBe(0);
    expect(r.events.some((e) => e.type === 'flush')).toBe(true);
  });

  it('starter cannot pass', () => {
    const s = setup(['H5', 'S4', 'C3', 'D10']);
    expect(applyAction(s, 0, { type: 'pass' }).error).toBeTruthy();
  });

  it('joker beats any single but loses to spade 3 with spade3Return', () => {
    const s = setup(['H15 H4', 'X1 S9', 'S3 C5', 'D10 C10'], { spade3Return: true });
    let r = play(s, 0, 'H15');
    r = play(r.state, 1, 'X1');
    r = play(r.state, 2, 'S3');
    expect(r.state.field.length).toBe(0); // 流れる
    expect(r.state.turn).toBe(2);
  });

  it('8 cut flushes and gives the lead back', () => {
    const s = setup(['H5 H6', 'S8 S9', 'C3 C4', 'D10 C10']);
    let r = play(s, 0, 'H5');
    r = play(r.state, 1, 'S8');
    expect(r.state.field.length).toBe(0);
    expect(r.state.turn).toBe(1);
  });

  it('untilFlush: passed players are skipped until the field clears', () => {
    const s = setup(['H5 H12', 'S6 S13', 'C7 C14', 'D3 D4'], { passRule: 'untilFlush', effects: presetConfig('basic').effects });
    let r = play(s, 0, 'H5');
    r = pass(r.state, 1);
    r = play(r.state, 2, 'C7');
    r = pass(r.state, 3);
    r = play(r.state, 0, 'H12');
    // P1 はパス済みなので飛ばされ P2 の番
    expect(r.state.turn).toBe(2);
  });

  it('rejoin: passed player can play again', () => {
    const s = setup(['H5 H12', 'S6 S13', 'C7 C14', 'D3 D4']);
    let r = play(s, 0, 'H5');
    r = pass(r.state, 1);
    r = play(r.state, 2, 'C7');
    r = pass(r.state, 3);
    r = play(r.state, 0, 'H12');
    expect(r.state.turn).toBe(1);
  });
});

describe('revolution & reversals', () => {
  it('four of a kind starts a revolution and reverses strength', () => {
    const s = setup(['H5 S5 D5 C5 H9', 'S4 S6', 'C3 D3', 'D10 C10 H10']);
    let r = play(s, 0, 'H5 S5 D5 C5');
    expect(r.state.revolution).toBe(true);
    r = pass(r.state, 1);
    r = pass(r.state, 2);
    r = pass(r.state, 3);
    r = play(r.state, 0, 'H9');
    expect(applyAction(r.state, 1, { type: 'play', cardIds: ['S6'] }).error).toBeFalsy();
    expect(applyAction(r.state, 1, { type: 'play', cardIds: ['S6'] }).state.turn).toBe(2);
  });

  it('11 back reverses until flush', () => {
    const s = setup(['H11 H4', 'S10 S6', 'C3 C14', 'D10 C10'], {
      effects: { ...presetConfig('basic').effects, elevenBack: { on: true, rank: 11 } },
    });
    let r = play(s, 0, 'H11');
    expect(r.state.elevenBack).toBe(true);
    // 11バック中は 10 が出せる、A は出せない
    expect(applyAction(r.state, 1, { type: 'play', cardIds: ['S10'] }).error).toBeFalsy();
    r = pass(r.state, 1);
    r = play(r.state, 2, 'C3');
    r = pass(r.state, 3);
    r = pass(r.state, 0);
    r = pass(r.state, 1);
    expect(r.state.elevenBack).toBe(false);
  });
});

describe('locks', () => {
  it('suit lock forms after two same-suit plays', () => {
    const s = setup(['H5 S9', 'H7 S8', 'H10 S13', 'D10 C11'], { suitLock: true });
    let r = play(s, 0, 'H5');
    r = play(r.state, 1, 'H7');
    expect(r.state.lockSuits).toEqual(['H']);
    expect(applyAction(r.state, 2, { type: 'play', cardIds: ['S13'] }).error).toBeTruthy();
    expect(applyAction(r.state, 2, { type: 'play', cardIds: ['H10'] }).error).toBeFalsy();
  });

  it('joker can follow a lock, pair lock with joker is computed by union', () => {
    const s = setup(['H4 S4 C9', 'H5 X1 S8', 'H6 S6', 'D6 C6'], { suitLock: true });
    let r = play(s, 0, 'H4 S4');
    const r1 = play(r.state, 1, 'H5 X1');
    expect(r1.state.lockSuits).toEqual(['S', 'H']); // ジョーカーが♠を補う
    const s2 = setup(['H4 S4 C9', 'D5 X1 S8', 'H6 S6', 'D6 C6'], { suitLock: true });
    r = play(s2, 0, 'H4 S4');
    r = play(r.state, 1, 'D5 X1');
    expect(r.state.lockSuits).toBeNull(); // {H,S,D} は 2 枚に収まらない
  });

  it('number lock requires the next rank', () => {
    const s = setup(['H5 S9', 'D6 S8', 'C7 S13', 'D10 C11'], { numberLock: true });
    let r = play(s, 0, 'H5');
    r = play(r.state, 1, 'D6');
    expect(r.state.numberLock).toBe(true);
    expect(applyAction(r.state, 2, { type: 'play', cardIds: ['S13'] }).error).toBeTruthy();
    expect(applyAction(r.state, 2, { type: 'play', cardIds: ['C7'] }).error).toBeFalsy();
  });
});

describe('effects', () => {
  const eff = (k: string) => ({ ...presetConfig('basic').effects, [k]: { on: true, rank: ({ fiveSkip: 5, sevenPass: 7, tenDiscard: 10, nineReverse: 9, queenBomber: 12 } as any)[k] } });

  it('5 skip skips the next player', () => {
    const s = setup(['H5 S9', 'D6 S8', 'C7 S13', 'D10 C11'], { effects: eff('fiveSkip') });
    const r = play(s, 0, 'H5');
    expect(r.state.turn).toBe(2);
  });

  it('7 pass gives cards to the next player', () => {
    const s = setup(['H7 S3 S4', 'D6 S8', 'C9 S13', 'D10 C11'], { effects: eff('sevenPass') });
    let r = play(s, 0, 'H7');
    expect(actors(r.state)).toEqual([0]);
    r = act(r.state, 0, { type: 'sevenPass', cardIds: ['S3'] });
    expect(r.state.hands[1].map((c) => c.id)).toContain('S3');
    expect(r.state.turn).toBe(1);
  });

  it('10 discard removes cards', () => {
    const s = setup(['H10 S3 S4', 'D6 S8', 'C9 S13', 'D11 C11'], { effects: eff('tenDiscard') });
    let r = play(s, 0, 'H10');
    r = act(r.state, 0, { type: 'tenDiscard', cardIds: ['S3'] });
    expect(r.state.hands[0].map((c) => c.id)).toEqual(['S4']);
  });

  it('9 reverse flips direction', () => {
    const s = setup(['H9 S3', 'D6 S8', 'C3 S13', 'D11 C11'], { effects: eff('nineReverse') });
    const r = play(s, 0, 'H9');
    expect(r.state.direction).toBe(-1);
    expect(r.state.turn).toBe(3);
  });

  it('Q bomber makes everyone discard the called rank', () => {
    const s = setup(['H12 S3 S4', 'D4 S8', 'C4 S13', 'H4 C11'], { effects: eff('queenBomber') });
    let r = play(s, 0, 'H12');
    r = act(r.state, 0, { type: 'bomber', ranks: [4] });
    expect(r.state.hands.flat().some((c) => c.rank === 4)).toBe(false);
  });
});

describe('finishing', () => {
  it('forbidden finish (2) places the player last', () => {
    const s = setup(['H15', 'D6 S8', 'C3 S13', 'H4 C11'], { forbiddenFinish: true });
    const r = play(s, 0, 'H15');
    expect(r.state.out[0]).toBe('foul');
    expect(r.state.fouls).toEqual([0]);
  });

  it('miyako ochi drops the previous daifugo', () => {
    const s = setup(['H5 H6', 'D3', 'C3 S13', 'H4 C11'], { miyakoOchi: true });
    s.prevRanks = [0, 1, 2, 3];
    let r = play(s, 0, 'H5');
    r = pass(r.state, 1);
    r = pass(r.state, 2);
    r = pass(r.state, 3);
    r = play(r.state, 0, 'H6'); // 大富豪自身は上がるので都落ちしない
    expect(r.state.out[0]).toBe('win');
    const s2 = setup(['H5 H6', 'D3', 'C3 S13', 'H4 C11'], { miyakoOchi: true });
    s2.prevRanks = [0, 1, 2, 3];
    s2.turn = 1;
    const r2 = play(s2, 1, 'D3');
    expect(r2.state.out[0]).toBe('miyako');
  });

  it('a full round produces ranks and points', () => {
    const s = setup(['H5', 'D6', 'C7', 'H8 H9'], {});
    let r = play(s, 0, 'H5');
    r = play(r.state, 1, 'D6');
    r = play(r.state, 2, 'C7');
    expect(r.state.phase).toBe('roundEnd');
    expect(r.state.ranks).toEqual([0, 1, 2, 3]);
  });
});

// ───────── ランダム対戦シミュレーション ─────────

function simulate(cfg: RuleConfig, n: number, diffs: Difficulty[], seed: number) {
  let s = newMatch(Array.from({ length: n }, (_, i) => `CPU${i}`), cfg, seed).state;
  const total = s.hands.flat().length;
  let steps = 0;
  while (s.phase !== 'matchEnd') {
    if (s.phase === 'roundEnd') {
      s = startNextGame(s).state;
      continue;
    }
    const a = actors(s)[0];
    const action = decide(s, a, diffs[a % diffs.length], seed + steps);
    const r = applyAction(s, a, action);
    if (r.error) throw new Error(`AI illegal move: ${r.error} ${JSON.stringify(action)} phase=${s.phase}`);
    s = r.state;
    steps++;
    if (s.phase === 'play' || s.phase === 'exchange') {
      const inHands = s.hands.flat().length;
      const onField = s.field.reduce((a, p) => a + p.cards.length, 0);
      expect(inHands + onField + s.discardCount).toBe(total);
    }
    if (s.phase === 'play' && !s.pending.length) {
      expect(s.out[s.turn]).toBeNull();
    }
    if (steps > 5000) throw new Error('match did not terminate');
  }
  const deck = fullDeck(cfg.jokers).length - cfg.blindCards;
  expect(total).toBe(deck);
  return s;
}

describe('simulation', () => {
  for (const p of PRESETS) {
    for (const n of [3, 4, 5, 6]) {
      it(`${p.name} ${n}人 で最後まで遊べる`, () => {
        const cfg = { ...p.config, games: 4 };
        for (let seed = 1; seed <= 3; seed++) {
          const s = simulate(cfg, n, ['easy', 'normal', 'hard'], seed * 101 + n);
          expect(s.history.length).toBe(4);
          for (const h of s.history) expect([...h.ranks].sort()).toEqual([...Array(n).keys()]);
        }
      });
    }
  }

  it('鬼 CPU も合法手のみ', () => {
    simulate({ ...presetConfig('chaos'), games: 2 }, 4, ['oni', 'normal'], 7);
  }, 60000);

  it('legalPlays は全て applyAction で受理される', () => {
    const cfg = presetConfig('chaos');
    let s = newMatch(['a', 'b', 'c', 'd'], cfg, 99).state;
    for (let i = 0; i < 300 && s.phase !== 'matchEnd'; i++) {
      if (s.phase === 'roundEnd') {
        s = startNextGame(s).state;
        continue;
      }
      const a = actors(s)[0];
      if (s.phase === 'play' && !s.pending.length) {
        for (const m of legalPlays(s, a)) {
          const r = applyAction(s, a, { type: 'play', cardIds: m.combo.cardIds });
          expect(r.error).toBeUndefined();
        }
      }
      s = applyAction(s, a, decide(s, a, 'normal', i)).state;
    }
  });
});

describe('AI strength', () => {
  it('hard beats easy on average', () => {
    const cfg = { ...presetConfig('basic'), games: 10, exchange: false };
    let hardScore = 0;
    let easyScore = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const s = simulate(cfg, 4, ['hard', 'easy'], seed * 31);
      hardScore += s.scores[0] + s.scores[2];
      easyScore += s.scores[1] + s.scores[3];
    }
    expect(hardScore).toBeGreaterThan(easyScore);
  }, 60000);
});
