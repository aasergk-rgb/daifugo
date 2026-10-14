// ユーザー設定（このブラウザに保存）

import { useSyncExternalStore } from 'react';
import type { Difficulty } from '../engine/ai';
import { RuleConfig, normalizeConfig, presetConfig } from '../engine/rules';
import { configureSound } from './sound';

export type ThemeId = 'urushi' | 'casino' | 'sakura' | 'neon';
export type BackId = 'asanoha' | 'seigaiha' | 'kikko' | 'shippo';

export const THEMES: { id: ThemeId; name: string; desc: string }[] = [
  { id: 'urushi', name: '漆黒金箔', desc: '漆と金箔の重厚な卓' },
  { id: 'casino', name: '翠緑カジノ', desc: '王道のグリーンフェルト' },
  { id: 'sakura', name: '夜桜', desc: '桜舞う月夜の座敷' },
  { id: 'neon', name: 'ネオン東京', desc: '光る夜の裏カジノ' },
];

export const BACKS: { id: BackId; name: string }[] = [
  { id: 'asanoha', name: '麻の葉' },
  { id: 'seigaiha', name: '青海波' },
  { id: 'kikko', name: '亀甲' },
  { id: 'shippo', name: '七宝' },
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
  back: BackId;
  sfx: number;
  bgm: number;
  muted: boolean;
  speed: number; // CPU 速度倍率 (小さいほど速い)
  hints: boolean;
  reduceMotion: boolean;
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
  theme: 'urushi',
  back: 'asanoha',
  sfx: 0.7,
  bgm: 0.35,
  muted: false,
  speed: 1,
  hints: true,
  reduceMotion: false,
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
