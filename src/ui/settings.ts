// ユーザー設定（このブラウザに保存）

import { useSyncExternalStore } from 'react';
import type { Difficulty } from '../engine/ai';
import { RuleConfig, normalizeConfig, presetConfig } from '../engine/rules';
import type { GraphicsMode } from './perf';
import { configureSound } from './sound';

export type ThemeId = 'soda' | 'melon' | 'peach' | 'night';
export type BackId = 'dots' | 'stripes' | 'check' | 'wave';
export type DesignId = 'glass' | 'pop';
export type GlassLevel = 'clear' | 'regular' | 'dense' | 'opaque';

export const DESIGNS: { id: DesignId; name: string; desc: string }[] = [
  { id: 'glass', name: 'Liquid Glass', desc: '操作パーツが透き通ったガラスになる' },
  { id: 'pop', name: 'ポップ', desc: '太い輪郭のステッカー風' },
];

/** ガラスの濃さ。読みにくいと感じたら濃くする */
export const GLASS_LEVELS: { id: GlassLevel; name: string }[] = [
  { id: 'clear', name: 'クリア' },
  { id: 'regular', name: '標準' },
  { id: 'dense', name: '濃いめ' },
  { id: 'opaque', name: '不透明' },
];

export const THEMES: { id: ThemeId; name: string; desc: string }[] = [
  { id: 'soda', name: 'ソーダ', desc: '青いテーブルと明るい背景' },
  { id: 'melon', name: 'メロン', desc: 'さわやかなグリーン' },
  { id: 'peach', name: 'ピーチ', desc: 'やわらかいピンク' },
  { id: 'night', name: 'ナイト', desc: '目にやさしい暗めの配色' },
];

export const BACKS: { id: BackId; name: string }[] = [
  { id: 'dots', name: 'ドット' },
  { id: 'stripes', name: 'ストライプ' },
  { id: 'check', name: 'チェック' },
  { id: 'wave', name: 'ウェーブ' },
];

export interface CustomRule {
  id: string;
  name: string;
  config: RuleConfig;
}

export interface Settings {
  name: string;
  avatar: number;
  theme: ThemeId;
  design: DesignId;
  glass: GlassLevel;
  back: BackId;
  sfx: number;
  bgm: number;
  muted: boolean;
  speed: number; // CPU 速度倍率 (小さいほど速い)
  hints: boolean;
  reduceMotion: boolean;
  graphics: GraphicsMode;
  sortMode: 'strength' | 'suit';
  cpuCount: number;
  cpuDifficulties: Difficulty[];
  rules: RuleConfig;
  customRules: CustomRule[];
  onlineMode: 'auto' | 'server' | 'p2p';
}

const KEY = 'daifugo.settings.v1';

const defaults: Settings = {
  name: '',
  avatar: 0,
  theme: 'soda',
  design: 'glass',
  glass: 'regular',
  back: 'dots',
  sfx: 0.7,
  bgm: 0.35,
  muted: false,
  speed: 1,
  hints: true,
  reduceMotion: false,
  graphics: 'auto',
  sortMode: 'strength',
  cpuCount: 3,
  cpuDifficulties: ['normal', 'normal', 'hard', 'normal', 'normal'],
  rules: presetConfig('basic'),
  customRules: [],
  onlineMode: 'auto',
};

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...defaults };
    const s = { ...defaults, ...JSON.parse(raw) } as Settings;
    s.rules = normalizeConfig(s.rules);
    // 旧デザインのテーマ・裏面は新しいものに置き換える
    if (!THEMES.some((t) => t.id === s.theme)) s.theme = defaults.theme;
    if (!BACKS.some((b) => b.id === s.back)) s.back = defaults.back;
    if (!DESIGNS.some((d) => d.id === s.design)) s.design = defaults.design;
    if (!GLASS_LEVELS.some((g) => g.id === s.glass)) s.glass = defaults.glass;
    s.customRules = (s.customRules || []).map((r) => ({ ...r, config: normalizeConfig(r.config) }));
    return s;
  } catch {
    return { ...defaults };
  }
}

let current = load();
const listeners = new Set<() => void>();
configureSound({ sfx: current.sfx, bgm: current.bgm, muted: current.muted });

export function getSettings(): Settings {
  return current;
}

export function updateSettings(patch: Partial<Settings>) {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* 保存できなくても動作は続ける */
  }
  configureSound({ sfx: current.sfx, bgm: current.bgm, muted: current.muted });
  listeners.forEach((l) => l());
}

export function useSettings(): Settings {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
  );
}
