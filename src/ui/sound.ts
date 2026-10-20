// 効果音と BGM（すべて Web Audio で合成。音源ファイルなし）
// 和の雰囲気を出すため、琴は Karplus-Strong、太鼓はピッチの下がるサイン波で作る。

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let sfxGain: GainNode | null = null;
let bgmGain: GainNode | null = null;
let reverb: ConvolverNode | null = null;
let settings = { sfx: 0.7, bgm: 0.35, muted: false };
let bgmTimer: ReturnType<typeof setTimeout> | null = null;
let bgmOn = false;

// 都節音階 (D, Eb, G, A, Bb)
const MIYAKO = [0, 1, 5, 7, 8];
const BASE_FREQ = 293.66; // D4

function note(step: number): number {
  const oct = Math.floor(step / 5);
  const deg = ((step % 5) + 5) % 5;
  return BASE_FREQ * Math.pow(2, oct + MIYAKO[deg] / 12);
}

function ensure(): AudioContext | null {
  if (ctx) return ctx;
  try {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.connect(ctx.destination);
    sfxGain = ctx.createGain();
    bgmGain = ctx.createGain();
    reverb = ctx.createConvolver();
    // 残響の生成は重いので、手が空いたときに行う
    const c0 = ctx;
    const rv = reverb;
    idle(() => (rv.buffer = impulse(c0, 1.8)));
    const wet = ctx.createGain();
    wet.gain.value = 0.35;
    reverb.connect(wet).connect(master);
    sfxGain.connect(master);
    bgmGain.connect(master);
    bgmGain.connect(reverb);
    sfxGain.connect(reverb);
    apply();
  } catch {
    ctx = null;
  }
  return ctx;
}

function impulse(c: AudioContext, sec: number): AudioBuffer {
  const len = Math.floor(c.sampleRate * sec);
  const buf = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  }
  return buf;
}

function apply() {
  if (!master || !sfxGain || !bgmGain) return;
  master.gain.value = settings.muted ? 0 : 1;
  sfxGain.gain.value = settings.sfx;
  bgmGain.gain.value = settings.bgm * 0.5;
}

export function configureSound(s: Partial<typeof settings>) {
  settings = { ...settings, ...s };
  apply();
}

/** ユーザー操作の後に呼ぶ（自動再生制限の解除） */
let warmed = false;
export function unlockAudio() {
  const c = ensure();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
  if (c && !warmed) {
    warmed = true;
    prewarm();
  }
}

function idle(fn: () => void) {
  const ric = (window as any).requestIdleCallback as ((cb: () => void, o?: { timeout: number }) => void) | undefined;
  if (ric) ric(fn, { timeout: 2000 });
  else setTimeout(fn, 200);
}

// ノイズは 2 秒分を一度だけ作り、毎回ランダムな位置から切り出して使う
let sharedNoise: AudioBuffer | null = null;
const NOISE_SEC = 2;
function noiseBuffer(c: AudioContext): AudioBuffer {
  if (sharedNoise) return sharedNoise;
  const len = Math.floor(c.sampleRate * NOISE_SEC);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  sharedNoise = buf;
  return buf;
}

function out(dest?: AudioNode | null) {
  return dest ?? sfxGain!;
}

function noise(t: number, dur: number, freq: number, q: number, vol: number, type: BiquadFilterType = 'bandpass', dest?: AudioNode) {
  const c = ctx!;
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c);
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(out(dest));
  src.start(t, Math.random() * Math.max(0, NOISE_SEC - dur - 0.05));
  src.stop(t + dur);
  return f;
}

function tone(t: number, freq: number, dur: number, vol: number, type: OscillatorType = 'sine', dest?: AudioNode, endFreq?: number) {
  const c = ctx!;
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out(dest));
  o.start(t);
  o.stop(t + dur + 0.02);
}

// 琴の音（Karplus-Strong）。音の高さごとに一度だけ合成してキャッシュする
const KOTO_SEC = 2.2;
const kotoCache = new Map<number, AudioBuffer>();
function kotoBuffer(c: AudioContext, freq: number): AudioBuffer {
  const key = Math.round(freq * 10);
  const hit = kotoCache.get(key);
  if (hit) return hit;
  const sr = c.sampleRate;
  const len = Math.floor(sr * KOTO_SEC);
  const buf = c.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  const period = Math.max(2, Math.floor(sr / freq));
  const ring = new Float32Array(period);
  for (let i = 0; i < period; i++) ring[i] = Math.random() * 2 - 1;
  let idx = 0;
  for (let i = 0; i < len; i++) {
    const nx = idx + 1 === period ? 0 : idx + 1;
    const v = (ring[idx] + ring[nx]) * 0.498;
    d[i] = ring[idx];
    ring[idx] = v;
    idx = nx;
  }
  kotoCache.set(key, buf);
  return buf;
}

/** よく使う音を空き時間に 1 つずつ作っておく */
function prewarm() {
  const c = ctx;
  if (!c) return;
  const steps: number[] = [];
  for (let s = -5; s <= 17; s++) steps.push(s);
  const next = () => {
    const s = steps.shift();
    if (s === undefined) return;
    kotoBuffer(c, note(s));
    idle(next);
  };
  idle(() => {
    noiseBuffer(c);
    next();
  });
}

function koto(t: number, freq: number, vol = 0.4, dest?: AudioNode) {
  const c = ctx!;
  const dur = KOTO_SEC;
  const src = c.createBufferSource();
  src.buffer = kotoBuffer(c, freq);
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 4200;
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(out(dest));
  src.start(t);
}

function taiko(t: number, vol = 0.9) {
  tone(t, 140, 0.55, vol, 'sine', undefined, 45);
  noise(t, 0.12, 300, 0.7, vol * 0.5, 'lowpass');
}

type SfxName =
  | 'card' | 'deal' | 'pass' | 'turn' | 'select' | 'error' | 'flush' | 'revolution' | 'slash'
  | 'lock' | 'back' | 'skip' | 'reverse' | 'bomb' | 'win' | 'lose' | 'stamp' | 'fanfare' | 'give' | 'spade' | 'click' | 'miyako';

export function sfx(name: SfxName) {
  const c = ensure();
  if (!c || settings.muted || c.state !== 'running') return;
  const t = c.currentTime + 0.01;
  switch (name) {
    case 'card':
      noise(t, 0.07, 2600, 0.9, 0.55);
      tone(t, 180, 0.06, 0.25, 'triangle');
      break;
    case 'deal':
      for (let i = 0; i < 6; i++) noise(t + i * 0.055, 0.05, 3200, 1.2, 0.3);
      break;
    case 'select':
      tone(t, 1250, 0.05, 0.08, 'triangle');
      break;
    case 'click':
      tone(t, 900, 0.04, 0.1, 'triangle');
      break;
    case 'pass':
      tone(t, 620, 0.12, 0.18, 'sine');
      tone(t + 0.07, 470, 0.14, 0.14, 'sine');
      break;
    case 'turn':
      koto(t, note(7), 0.25);
      koto(t + 0.09, note(9), 0.22);
      break;
    case 'error':
      tone(t, 160, 0.18, 0.2, 'square');
      break;
    case 'flush':
      noise(t, 0.45, 1200, 0.4, 0.35, 'bandpass').frequency.exponentialRampToValueAtTime(5000, t + 0.4);
      break;
    case 'revolution':
      taiko(t, 1);
      taiko(t + 0.28, 1);
      taiko(t + 0.5, 1.1);
      [0, 2, 4, 5, 7, 9, 10].forEach((s, i) => koto(t + 0.55 + i * 0.07, note(s + 2), 0.35));
      tone(t + 0.5, 70, 1.6, 0.5, 'sawtooth', undefined, 35);
      break;
    case 'slash':
      noise(t, 0.35, 900, 2, 0.6, 'highpass').frequency.exponentialRampToValueAtTime(7000, t + 0.3);
      tone(t + 0.05, 2200, 0.25, 0.12, 'sawtooth', undefined, 400);
      taiko(t + 0.18, 0.7);
      break;
    case 'lock':
      tone(t, 300, 0.08, 0.3, 'square');
      tone(t + 0.09, 220, 0.2, 0.3, 'square');
      noise(t + 0.09, 0.15, 4000, 3, 0.3);
      break;
    case 'back':
      [9, 7, 5, 2].forEach((s, i) => koto(t + i * 0.08, note(s), 0.3));
      break;
    case 'skip':
      tone(t, 500, 0.08, 0.2, 'triangle', undefined, 1200);
      break;
    case 'reverse':
      tone(t, 900, 0.3, 0.2, 'triangle', undefined, 300);
      tone(t + 0.15, 300, 0.3, 0.15, 'triangle', undefined, 900);
      break;
    case 'bomb':
      tone(t, 90, 1.2, 0.9, 'sine', undefined, 30);
      noise(t, 1.0, 400, 0.5, 0.8, 'lowpass');
      break;
    case 'give':
      noise(t, 0.12, 2000, 0.8, 0.3);
      tone(t, 700, 0.15, 0.1, 'sine', undefined, 1100);
      break;
    case 'spade':
      koto(t, note(12), 0.4);
      noise(t, 0.3, 6000, 1, 0.25, 'highpass');
      break;
    case 'win':
      [0, 2, 4, 5, 7].forEach((s, i) => koto(t + i * 0.09, note(s + 5), 0.35));
      break;
    case 'fanfare':
      taiko(t, 0.8);
      [0, 2, 4, 5, 7, 10, 12].forEach((s, i) => koto(t + 0.1 + i * 0.1, note(s + 3), 0.35));
      tone(t + 0.8, note(8) / 2, 1.5, 0.15, 'triangle');
      break;
    case 'lose':
      [7, 5, 2, 0].forEach((s, i) => koto(t + i * 0.16, note(s), 0.3));
      break;
    case 'miyako':
      taiko(t, 0.8);
      [10, 8, 5, 3, 0].forEach((s, i) => koto(t + 0.1 + i * 0.12, note(s), 0.32));
      break;
    case 'stamp':
      tone(t, 520, 0.08, 0.15, 'sine', undefined, 880);
      break;
  }
}

// ───────────── BGM（ゆるやかな琴のジェネラティブ演奏） ─────────────

export function setBgm(on: boolean) {
  bgmOn = on;
  if (bgmTimer) clearTimeout(bgmTimer);
  bgmTimer = null;
  if (on) loop();
}

let phrase = 0;
function loop() {
  if (!bgmOn) return;
  const c = ensure();
  if (c && c.state === 'running' && !settings.muted && settings.bgm > 0) {
    const t = c.currentTime + 0.05;
    phrase++;
    const root = [0, -2, 3, 1][phrase % 4];
    // 低音
    koto(t, note(root - 5) , 0.3, bgmGain!);
    // 旋律
    const steps = 3 + Math.floor(Math.random() * 3);
    let cur = root + 5 + Math.floor(Math.random() * 4);
    for (let i = 0; i < steps; i++) {
      cur += Math.floor(Math.random() * 5) - 2;
      cur = Math.max(root + 2, Math.min(root + 12, cur));
      koto(t + 0.6 + i * (0.45 + Math.random() * 0.4), note(cur), 0.18 + Math.random() * 0.08, bgmGain!);
    }
  }
  bgmTimer = setTimeout(loop, 3600 + Math.random() * 1600);
}
