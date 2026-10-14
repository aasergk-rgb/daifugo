// ルール設定・プリセット・UI 用メタデータ

export type EffectKey =
  | 'eightCut'
  | 'fiveSkip'
  | 'sevenPass'
  | 'nineReverse'
  | 'tenDiscard'
  | 'elevenBack'
  | 'queenBomber';

export interface EffectRule {
  on: boolean;
  rank: number; // 3..15
}

export interface RuleConfig {
  // ── デッキ ──
  jokers: number; // 0..2
  blindCards: number; // ブラインド（抜き札）枚数

  // ── 出し方 ──
  sequence: boolean; // 階段
  seqMinLength: number; // 階段の最小枚数
  seqCompare: 'weakest' | 'noOverlap'; // 階段の強さ比較
  passRule: 'rejoin' | 'untilFlush'; // パス後に再び出せるか
  firstLead: 'd3' | 's3' | 'random'; // セット最初のゲームの親
  nextLead: 'daihinmin' | 'd3' | 'daifugo'; // 2ゲーム目以降の親
  mustPlayD3: boolean; // ダイヤ3スタート時に♦3を含めて出す

  // ── 革命 ──
  revolution: boolean;
  revolutionCount: number;
  seqRevolution: boolean; // 階段革命
  seqRevolutionLength: number;

  // ── 縛り ──
  suitLock: boolean; // マーク（スート）縛り
  numberLock: boolean; // 数字縛り（階段縛り）

  // ── 効果札 ──
  effects: Record<EffectKey, EffectRule>;
  effectsInSequence: boolean; // 階段に含まれる効果札も発動
  skipPerCard: boolean; // 5飛びを枚数分

  // ── 特殊 ──
  spade3Return: boolean; // スペ3返し
  sandstorm: boolean; // 砂嵐（3を3枚）
  ambulance: boolean; // 救急車（9を2枚）
  rokurokubi: boolean; // ろくろ首（6を2枚）
  sixCardFlush: boolean; // シックスカード（6枚出し）で流れる
  strongestSeq: boolean; // 最強階段（ジョーカーを最上段）で流れる
  doubleJokerFlush: boolean; // ジョーカー2枚ペアで流れる

  // ── 上がり ──
  forbiddenFinish: boolean; // 反則上がり
  forbidJoker: boolean;
  forbidStrongest: boolean; // 2（革命中は3）
  forbidEight: boolean; // 8切りの8
  forbidSpade3: boolean; // ♠3単体
  miyakoOchi: boolean; // 都落ち
  gekokujo: boolean; // 下剋上
  tenpen: boolean; // 天変地異

  // ── 交換 ──
  exchange: boolean;
  exchangeTop: number; // 大富豪⇔大貧民
  exchangeSecond: number; // 富豪⇔貧民

  // ── 進行・得点 ──
  games: number; // 総ゲーム数
  setLength: number; // 何ゲームごとに階級リセットするか（0 = リセットなし）
  scoring: 'federation' | 'simple';
  setFinalBonus: number; // セット最終ゲームの大富豪ボーナス
  turnSeconds: number; // 持ち時間（0 = 無制限）
}

export const EFFECT_INFO: Record<EffectKey, { name: string; short: string; desc: string; defaultRank: number }> = {
  eightCut: { name: '8切り', short: '切', desc: '出すと場が流れ、出した人が親になる。', defaultRank: 8 },
  fiveSkip: { name: '5飛び', short: '飛', desc: '次の人の番を飛ばす（設定で枚数分）。', defaultRank: 5 },
  sevenPass: { name: '7渡し', short: '渡', desc: '出した枚数分、次の人に手札を渡せる。', defaultRank: 7 },
  nineReverse: { name: '9リバース', short: '逆', desc: '手番の回る向きが逆になる。', defaultRank: 9 },
  tenDiscard: { name: '10捨て', short: '捨', desc: '出した枚数分、手札を捨てられる。', defaultRank: 10 },
  elevenBack: { name: '11バック', short: '戻', desc: '場が流れるまで強さが逆転する。', defaultRank: 11 },
  queenBomber: { name: 'Qボンバー', short: '爆', desc: '出した枚数分の数字を指定し、全員がその数字を捨てる。', defaultRank: 12 },
};

export const EFFECT_KEYS = Object.keys(EFFECT_INFO) as EffectKey[];

function effects(on: Partial<Record<EffectKey, boolean>>): Record<EffectKey, EffectRule> {
  const r = {} as Record<EffectKey, EffectRule>;
  for (const k of EFFECT_KEYS) r[k] = { on: !!on[k], rank: EFFECT_INFO[k].defaultRank };
  return r;
}

const BASE: RuleConfig = {
  jokers: 1,
  blindCards: 0,
  sequence: true,
  seqMinLength: 3,
  seqCompare: 'weakest',
  passRule: 'rejoin',
  firstLead: 'd3',
  nextLead: 'daihinmin',
  mustPlayD3: false,
  revolution: true,
  revolutionCount: 4,
  seqRevolution: false,
  seqRevolutionLength: 5,
  suitLock: false,
  numberLock: false,
  effects: effects({ eightCut: true }),
  effectsInSequence: false,
  skipPerCard: true,
  spade3Return: false,
  sandstorm: false,
  ambulance: false,
  rokurokubi: false,
  sixCardFlush: false,
  strongestSeq: false,
  doubleJokerFlush: false,
  forbiddenFinish: false,
  forbidJoker: true,
  forbidStrongest: true,
  forbidEight: true,
  forbidSpade3: true,
  miyakoOchi: false,
  gekokujo: false,
  tenpen: false,
  exchange: true,
  exchangeTop: 2,
  exchangeSecond: 1,
  games: 5,
  setLength: 0,
  scoring: 'simple',
  setFinalBonus: 0,
  turnSeconds: 0,
};

export type PresetId = 'basic' | 'federation' | 'popular' | 'chaos';

export interface Preset {
  id: PresetId;
  name: string;
  sub: string;
  desc: string;
  config: RuleConfig;
}

export const PRESETS: Preset[] = [
  {
    id: 'basic',
    name: '基本ルール',
    sub: 'STANDARD',
    desc: '階段・革命・8切り・カード交換。はじめての人にもおすすめの定番ルール。',
    config: { ...BASE },
  },
  {
    id: 'federation',
    name: '連盟公式ルール',
    sub: 'FEDERATION',
    desc: '日本大富豪連盟の公式5大ルール（革命・8切り・都落ち・スート縛り・スペ3返し）＋反則上がり。ジョーカー2枚・ブラインド2枚、4ゲーム×3セットの競技形式。',
    config: {
      ...BASE,
      jokers: 2,
      blindCards: 2,
      passRule: 'untilFlush',
      firstLead: 'random',
      suitLock: true,
      effects: effects({ eightCut: true }),
      spade3Return: true,
      sixCardFlush: true,
      strongestSeq: true,
      doubleJokerFlush: true,
      forbiddenFinish: true,
      miyakoOchi: true,
      games: 12,
      setLength: 4,
      scoring: 'federation',
      setFinalBonus: 2,
    },
  },
  {
    id: 'popular',
    name: '定番ローカル',
    sub: 'HOUSE RULES',
    desc: '11バック・縛り・5飛び・7渡し・10捨て・スペ3返し・都落ち・反則上がりなど、よく遊ばれるローカルルールを採用。',
    config: {
      ...BASE,
      jokers: 2,
      suitLock: true,
      effects: effects({ eightCut: true, elevenBack: true, fiveSkip: true, sevenPass: true, tenDiscard: true }),
      spade3Return: true,
      forbiddenFinish: true,
      miyakoOchi: true,
    },
  },
  {
    id: 'chaos',
    name: '全部盛り',
    sub: 'CHAOS',
    desc: '実装されているほぼ全てのルールを採用した大混戦モード。激縛り・Qボンバー・9リバース・救急車・砂嵐・下剋上・天変地異まで。',
    config: {
      ...BASE,
      jokers: 2,
      seqRevolution: true,
      seqRevolutionLength: 4,
      suitLock: true,
      numberLock: true,
      effects: effects({
        eightCut: true,
        fiveSkip: true,
        sevenPass: true,
        nineReverse: true,
        tenDiscard: true,
        elevenBack: true,
        queenBomber: true,
      }),
      spade3Return: true,
      sandstorm: true,
      ambulance: true,
      rokurokubi: true,
      sixCardFlush: true,
      strongestSeq: true,
      doubleJokerFlush: true,
      forbiddenFinish: true,
      miyakoOchi: true,
      gekokujo: true,
      tenpen: true,
    },
  },
];

export function presetConfig(id: PresetId): RuleConfig {
  return cloneConfig(PRESETS.find((p) => p.id === id)!.config);
}

export function cloneConfig(c: RuleConfig): RuleConfig {
  return JSON.parse(JSON.stringify(c));
}

export const DEFAULT_RULES = presetConfig('basic');

/** 不正・欠損値を補正（保存データや通信経由の値向け） */
export function normalizeConfig(input: Partial<RuleConfig> | undefined | null): RuleConfig {
  const c = { ...cloneConfig(BASE), ...(input || {}) } as RuleConfig;
  const eff = effects({});
  for (const k of EFFECT_KEYS) {
    const e = input?.effects?.[k];
    eff[k] = {
      on: !!e?.on,
      rank: clampInt(e?.rank ?? EFFECT_INFO[k].defaultRank, 3, 15),
    };
  }
  c.effects = eff;
  c.jokers = clampInt(c.jokers, 0, 2);
  c.blindCards = clampInt(c.blindCards, 0, 8);
  c.seqMinLength = clampInt(c.seqMinLength, 3, 5);
  c.revolutionCount = clampInt(c.revolutionCount, 3, 6);
  c.seqRevolutionLength = clampInt(c.seqRevolutionLength, 4, 8);
  c.exchangeTop = clampInt(c.exchangeTop, 0, 4);
  c.exchangeSecond = clampInt(c.exchangeSecond, 0, 3);
  c.games = clampInt(c.games, 1, 30);
  c.setLength = clampInt(c.setLength, 0, 30);
  c.setFinalBonus = clampInt(c.setFinalBonus, 0, 10);
  c.turnSeconds = clampInt(c.turnSeconds, 0, 120);
  if (!['weakest', 'noOverlap'].includes(c.seqCompare)) c.seqCompare = 'weakest';
  if (!['rejoin', 'untilFlush'].includes(c.passRule)) c.passRule = 'rejoin';
  if (!['d3', 's3', 'random'].includes(c.firstLead)) c.firstLead = 'd3';
  if (!['daihinmin', 'd3', 'daifugo'].includes(c.nextLead)) c.nextLead = 'daihinmin';
  if (!['federation', 'simple'].includes(c.scoring)) c.scoring = 'simple';
  return c;
}

function clampInt(v: unknown, min: number, max: number): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

/** 現在の設定がどのプリセットと一致するか */
export function matchPreset(c: RuleConfig): PresetId | null {
  const s = JSON.stringify(normalizeConfig(c));
  for (const p of PRESETS) if (JSON.stringify(normalizeConfig(p.config)) === s) return p.id;
  return null;
}

/** 採用ルールの短い一覧（ロビーやゲーム画面のバッジ用） */
export function ruleBadges(c: RuleConfig): string[] {
  const b: string[] = [];
  if (c.revolution) b.push('革命');
  if (c.seqRevolution) b.push('階段革命');
  for (const k of EFFECT_KEYS) if (c.effects[k].on) b.push(effectDisplayName(k, c.effects[k].rank));
  if (c.suitLock && c.numberLock) b.push('激縛り');
  else if (c.suitLock) b.push('縛り');
  else if (c.numberLock) b.push('数字縛り');
  if (c.spade3Return) b.push('スペ3返し');
  if (c.sandstorm) b.push('砂嵐');
  if (c.ambulance) b.push('救急車');
  if (c.rokurokubi) b.push('ろくろ首');
  if (c.forbiddenFinish) b.push('反則上がり');
  if (c.miyakoOchi) b.push('都落ち');
  if (c.gekokujo) b.push('下剋上');
  if (c.tenpen) b.push('天変地異');
  if (c.passRule === 'untilFlush') b.push('パス固定');
  return b;
}

const RANK_JP: Record<number, string> = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A', 15: '2' };

export function effectDisplayName(k: EffectKey, rank: number): string {
  const info = EFFECT_INFO[k];
  if (rank === info.defaultRank) return info.name;
  const r = RANK_JP[rank] ?? String(rank);
  const base = info.name.replace(/^(\d+|[JQKA])/, '');
  return `${r}${base}`;
}

/** 人数ごとの階級名 */
export function rankTitles(n: number): string[] {
  switch (n) {
    case 2: return ['大富豪', '大貧民'];
    case 3: return ['大富豪', '平民', '大貧民'];
    case 4: return ['大富豪', '富豪', '貧民', '大貧民'];
    case 5: return ['大富豪', '富豪', '平民', '貧民', '大貧民'];
    default: {
      const t = ['大富豪', '富豪'];
      for (let i = 0; i < n - 4; i++) t.push('平民');
      t.push('貧民', '大貧民');
      return t;
    }
  }
}

/** 順位ごとの得点 */
export function pointsFor(pos: number, n: number, c: RuleConfig, setFinal: boolean): number {
  let p: number;
  if (c.scoring === 'federation') {
    p = n === 3 ? [6, 3, 0][pos] : 2 * (n - 1 - pos);
  } else {
    p = n - 1 - pos;
  }
  if (setFinal && pos === 0) p += c.setFinalBonus;
  return p;
}
