// タイトル・CPU対戦設定・オンライン・設定・遊び方

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { DIFFICULTY_LABEL, Difficulty } from '../engine/ai';
import { Card, SUITS, cardFromId, fullDeck } from '../engine/cards';
import { PRESETS, matchPreset, normalizeConfig, ruleBadges } from '../engine/rules';
import { Conn, PeerConn, WsConn, createLocalGame, hostP2P, serverAvailable } from '../net/connection';
import { AVATARS, CPU_NAMES } from '../net/protocol';
import type { Screen } from './App';
import { GameClient, Tone } from './client';
import { EffectLayer } from './components/EffectLayer';
import { PlayingCard } from './components/PlayingCard';
import { RuleEditor } from './components/RuleEditor';
import { isLite } from './perf';
import { BACKS, BackId, THEMES, updateSettings, useSettings } from './settings';
import { CardSvg } from './components/CardArt';
import { sfx } from './sound';

const DIFFS: Difficulty[] = ['easy', 'normal', 'hard', 'oni'];
const DIFF_DESC: Record<Difficulty, string> = {
  easy: '気ままに出す初心者',
  normal: '手札を組み立てる中級者',
  hard: 'カードを数える上級者',
  oni: '先読みシミュレーションの達人',
};

function playerName(s: { name: string }) {
  return s.name.trim() || 'あなた';
}

// ───────────── タイトル ─────────────

/** 通信が使えない環境向けのビルド（CPU対戦のみ） */
export const OFFLINE_ONLY = (import.meta as any).env?.VITE_OFFLINE_ONLY === '1';

const FLOAT_CARDS = ['S14', 'X1', 'H13', 'D12', 'C11', 'H15', 'S3', 'D8'];

export function Title({ go }: { go: (s: Screen) => void }) {
  const settings = useSettings();
  const preset = matchPreset(settings.rules);
  const items: { s: Screen; label: string; sub: string; icon: string }[] = [
    { s: 'cpu', label: 'CPU対戦', sub: 'コンピューターと遊ぶ', icon: '🃏' },
    { s: 'online', label: 'オンライン対戦', sub: OFFLINE_ONLY ? 'ダウンロード版で遊べます' : '友だちと遊ぶ', icon: '🌐' },
    { s: 'howto', label: '遊び方・ルール', sub: 'はじめての人へ', icon: '📖' },
    { s: 'settings', label: '設定', sub: '名前・テーマ・音', icon: '⚙️' },
  ];
  return (
    <div className="screen title-screen">
      <div className="float-cards" aria-hidden>
        {FLOAT_CARDS.map((id, i) => (
          <div key={id} className={`float-card fc${i}`}>
            <PlayingCard card={cardFromId(id)} />
          </div>
        ))}
      </div>
      <div className="title-center">
        <div className="logo">
          <h1 className="logo-main" aria-label="大富豪">
            {['大', '富', '豪'].map((ch, i) => (
              <motion.span
                key={ch}
                className={`tile t${i}`}
                initial={{ y: -70, opacity: 0, rotate: 0 }}
                animate={{ y: 0, opacity: 1, rotate: [-8, 5, -4][i] }}
                transition={{ type: 'spring', stiffness: 380, damping: 13, delay: 0.1 + i * 0.12 }}
              >
                {ch}
              </motion.span>
            ))}
          </h1>
          <div className="logo-en">DAIFUGO</div>
          <div className="logo-sub">ルールは自由自在！ みんなで遊べる大富豪</div>
        </div>
        <nav className="title-menu">
          {items.map((it, i) => (
            <motion.button
              key={it.s}
              className={`menu-btn ${OFFLINE_ONLY && it.s === 'online' ? 'is-off' : ''}`}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 + i * 0.1 }}
              disabled={OFFLINE_ONLY && it.s === 'online'}
              onClick={() => {
                sfx('click');
                go(it.s);
              }}
            >
              <span className="mb-icon">{it.icon}</span>
              <span className="mb-text">
                <b>{it.label}</b>
                <small>{it.sub}</small>
              </span>
              <span className="mb-arrow">›</span>
            </motion.button>
          ))}
        </nav>
        <div className="title-foot">
          現在のルール：<b>{preset ? PRESETS.find((p) => p.id === preset)!.name : 'カスタム'}</b>
        </div>
      </div>
    </div>
  );
}

// ───────────── 共通: ルール選択 ─────────────

function RulePicker() {
  const settings = useSettings();
  const [editing, setEditing] = useState(false);
  const preset = matchPreset(settings.rules);
  return (
    <div className="rule-picker">
      <div className="rp-presets">
        {PRESETS.map((p) => (
          <button key={p.id} className={`preset-chip ${preset === p.id ? 'on' : ''}`} onClick={() => updateSettings({ rules: normalizeConfig(p.config) })}>
            <small>{p.sub}</small>
            {p.name}
          </button>
        ))}
        {settings.customRules.map((r) => (
          <button key={r.id} className={`preset-chip custom ${JSON.stringify(r.config) === JSON.stringify(settings.rules) ? 'on' : ''}`} onClick={() => updateSettings({ rules: normalizeConfig(r.config) })}>
            <small>CUSTOM</small>
            {r.name}
          </button>
        ))}
        <button className="preset-chip edit" onClick={() => setEditing(true)}>
          <small>EDIT</small>
          ✎ 詳しく設定
        </button>
      </div>
      <div className="badges">
        {ruleBadges(settings.rules).map((b) => (
          <span key={b} className="badge">
            {b}
          </span>
        ))}
        <span className="badge dim">全{settings.rules.games}戦</span>
        <span className="badge dim">JOKER×{settings.rules.jokers}</span>
      </div>
      <AnimatePresence>{editing && <RuleEditor value={settings.rules} onChange={(rules) => updateSettings({ rules })} onClose={() => setEditing(false)} />}</AnimatePresence>
    </div>
  );
}

// ───────────── CPU 対戦 ─────────────

export function CpuSetup({ onBack, onStart }: { onBack: () => void; onStart: (c: GameClient) => void }) {
  const settings = useSettings();
  const n = settings.cpuCount + 1;
  const diffs = settings.cpuDifficulties;
  const setDiff = (i: number, d: Difficulty) => {
    const nd = [...diffs];
    nd[i] = d;
    updateSettings({ cpuDifficulties: nd });
  };
  const start = () => {
    sfx('click');
    const conn = createLocalGame(settings.speed);
    const client = new GameClient(conn, { name: playerName(settings), avatar: settings.avatar });
    client.send({ t: 'config', config: settings.rules });
    client.send({ t: 'maxSeats', n });
    for (let i = 0; i < settings.cpuCount; i++) client.send({ t: 'addCpu', difficulty: diffs[i] ?? 'normal' });
    client.send({ t: 'start' });
    onStart(client);
  };
  return (
    <div className="screen setup">
      <header className="screen-head">
        <button className="btn ghost sm" onClick={onBack}>
          ← 戻る
        </button>
        <h2>CPU対戦</h2>
        <span />
      </header>
      <div className="setup-body">
        <section className="panel">
          <h3>人数</h3>
          <div className="seg big">
            {[3, 4, 5, 6].map((k) => (
              <button key={k} className={n === k ? 'on' : ''} onClick={() => updateSettings({ cpuCount: k - 1 })}>
                {k}人
              </button>
            ))}
          </div>
          <ul className="cpu-list">
            <li className="is-me">
              <span className="avatar-emoji">{AVATARS[settings.avatar]}</span>
              <span className="sl-name">{playerName(settings)}</span>
              <em className="me-badge">YOU</em>
            </li>
            {Array.from({ length: settings.cpuCount }, (_, i) => (
              <li key={i}>
                <span className="avatar-emoji">{AVATARS[(i + 1) % 12]}</span>
                <span className="sl-name">{CPU_NAMES[i]}</span>
                <div className="seg sm">
                  {DIFFS.map((d) => (
                    <button key={d} className={`${(diffs[i] ?? 'normal') === d ? 'on' : ''} d-${d}`} onClick={() => setDiff(i, d)} title={DIFF_DESC[d]}>
                      {DIFFICULTY_LABEL[d]}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
          <div className="seg-row">
            <span>全員の強さ</span>
            <div className="seg sm">
              {DIFFS.map((d) => (
                <button key={d} onClick={() => updateSettings({ cpuDifficulties: Array(5).fill(d) })}>
                  {DIFFICULTY_LABEL[d]}
                </button>
              ))}
            </div>
          </div>
        </section>
        <section className="panel">
          <h3>ルール</h3>
          <RulePicker />
        </section>
        <section className="panel">
          <h3>CPUの速さ</h3>
          <div className="seg">
            {[
              [1.6, 'ゆっくり'],
              [1, 'ふつう'],
              [0.5, 'はやい'],
            ].map(([v, l]) => (
              <button key={v} className={settings.speed === v ? 'on' : ''} onClick={() => updateSettings({ speed: v as number })}>
                {l}
              </button>
            ))}
          </div>
        </section>
      </div>
      <div className="setup-actions">
        <button className="btn primary big glow" onClick={start}>
          対戦開始
        </button>
      </div>
    </div>
  );
}

// ───────────── オンライン ─────────────

export function OnlineScreen({ onBack, onStart }: { onBack: () => void; onStart: (c: GameClient) => void }) {
  const settings = useSettings();
  const params = new URLSearchParams(location.search);
  const [code, setCode] = useState((params.get('room') || '').toUpperCase());
  const [server, setServer] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const urlMode = params.get('mode');
  const mode: 'server' | 'p2p' =
    urlMode === 'p2p' || urlMode === 'server' ? (urlMode as any) : settings.onlineMode === 'auto' ? (server ? 'server' : 'p2p') : settings.onlineMode;

  useEffect(() => {
    serverAvailable().then(setServer);
  }, []);

  const begin = (conn: Conn, host: boolean) => {
    let token: string | undefined;
    try {
      token = sessionStorage.getItem(`daifugo.token.${conn.code}`) ?? undefined;
    } catch {
      /* ignore */
    }
    const client = new GameClient(conn, { name: playerName(settings), avatar: settings.avatar, token });
    if (host) client.send({ t: 'config', config: settings.rules });
    const q = new URLSearchParams(location.search);
    q.set('room', conn.code || '');
    q.set('mode', conn.mode);
    history.replaceState(null, '', `?${q.toString()}`);
    onStart(client);
  };

  const create = async () => {
    setErr('');
    setBusy(true);
    try {
      if (mode === 'server') {
        const conn = new WsConn({ t: 'create' });
        await waitFor(() => !!conn.code, 6000);
        begin(conn, true);
      } else {
        const conn = await hostP2P(settings.speed);
        begin(conn, true);
      }
    } catch (e: any) {
      setErr(e?.message || '作成できませんでした');
    } finally {
      setBusy(false);
    }
  };

  const join = async () => {
    const c = code.trim().toUpperCase();
    if (c.length < 4) return setErr('ルームコードを入力してください');
    setErr('');
    setBusy(true);
    try {
      if (mode === 'server') {
        begin(new WsConn({ t: 'join', code: c }), false);
      } else {
        const conn = new PeerConn(c);
        await conn.connect();
        begin(conn, false);
      }
    } catch (e: any) {
      setErr(e?.message || '参加できませんでした');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen setup online">
      <header className="screen-head">
        <button className="btn ghost sm" onClick={onBack}>
          ← 戻る
        </button>
        <h2>オンライン対戦</h2>
        <span />
      </header>
      <div className="setup-body">
        <section className="panel">
          <h3>プレイヤー</h3>
          <ProfileEditor />
        </section>
        <section className="panel">
          <h3>接続方式</h3>
          <div className="seg">
            {(['auto', 'server', 'p2p'] as const).map((m) => (
              <button key={m} className={settings.onlineMode === m ? 'on' : ''} onClick={() => updateSettings({ onlineMode: m })} disabled={m === 'server' && server === false}>
                {m === 'auto' ? '自動' : m === 'server' ? 'サーバー' : 'P2P'}
              </button>
            ))}
          </div>
          <p className="muted small">
            {server === null ? 'サーバーを確認中…' : server ? '✅ 対戦サーバーが利用できます' : 'ℹ 対戦サーバーが見つからないため、P2P（ブラウザ同士の直接接続）を使います'}
            <br />
            現在：<b>{mode === 'server' ? 'サーバー接続' : 'P2P接続'}</b>
          </p>
        </section>
        <section className="panel online-actions">
          <div className="oa-col">
            <h3>ルームを作る</h3>
            <RulePicker />
            <button className="btn primary big" onClick={create} disabled={busy}>
              ルームを作成
            </button>
          </div>
          <div className="oa-sep">または</div>
          <div className="oa-col">
            <h3>ルームに入る</h3>
            <input className="code-input" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ルームコード" maxLength={6} />
            <button className="btn big" onClick={join} disabled={busy}>
              参加する
            </button>
          </div>
        </section>
        {err && <div className="error-box">{err}</div>}
        {busy && (
          <div className="loading">
            <span className="spinner" />
            接続中…
          </div>
        )}
      </div>
    </div>
  );
}

function waitFor(fn: () => boolean, ms: number) {
  return new Promise<void>((resolve, reject) => {
    const start = Date.now();
    const t = setInterval(() => {
      if (fn()) {
        clearInterval(t);
        resolve();
      } else if (Date.now() - start > ms) {
        clearInterval(t);
        reject(new Error('サーバーに接続できませんでした'));
      }
    }, 50);
  });
}

function ProfileEditor() {
  const settings = useSettings();
  return (
    <div className="profile">
      <input className="name-input" value={settings.name} onChange={(e) => updateSettings({ name: e.target.value.slice(0, 12) })} placeholder="名前（12文字まで）" />
      <div className="avatar-grid">
        {AVATARS.map((a, i) => (
          <button key={i} className={settings.avatar === i ? 'on' : ''} onClick={() => updateSettings({ avatar: i })}>
            {a}
          </button>
        ))}
      </div>
    </div>
  );
}

// ───────────── 設定 ─────────────

export function SettingsScreen({ onBack }: { onBack: () => void }) {
  const s = useSettings();
  return (
    <div className="screen setup">
      <header className="screen-head">
        <button className="btn ghost sm" onClick={onBack}>
          ← 戻る
        </button>
        <h2>設定</h2>
        <span />
      </header>
      <div className="setup-body">
        <section className="panel">
          <h3>プレイヤー</h3>
          <ProfileEditor />
        </section>
        <section className="panel">
          <h3>テーマ</h3>
          <div className="theme-grid">
            {THEMES.map((t) => (
              <button key={t.id} className={`theme-card th-${t.id} ${s.theme === t.id ? 'on' : ''}`} onClick={() => updateSettings({ theme: t.id })}>
                <span className="th-swatch" />
                <b>{t.name}</b>
                <small>{t.desc}</small>
              </button>
            ))}
          </div>
        </section>
        <section className="panel">
          <h3>カードの裏面</h3>
          <div className="back-grid">
            {BACKS.map((b) => (
              <button key={b.id} className={s.back === b.id ? 'on' : ''} onClick={() => updateSettings({ back: b.id })}>
                <BackPreview id={b.id} />
                <span>{b.name}</span>
              </button>
            ))}
          </div>
        </section>
        <section className="panel">
          <h3>サウンド</h3>
          <label className="slider">
            効果音
            <input type="range" min={0} max={1} step={0.05} value={s.sfx} onChange={(e) => updateSettings({ sfx: Number(e.target.value) })} />
          </label>
          <label className="slider">
            BGM
            <input type="range" min={0} max={1} step={0.05} value={s.bgm} onChange={(e) => updateSettings({ bgm: Number(e.target.value) })} />
          </label>
          <div className="seg-row">
            <span>ミュート</span>
            <button className={`switch ${s.muted ? 'on' : ''}`} onClick={() => updateSettings({ muted: !s.muted })}>
              <i />
            </button>
          </div>
        </section>
        <section className="panel">
          <h3>表示・操作</h3>
          <div className="seg-row">
            <span>グラフィック</span>
            <div className="seg sm">
              {(
                [
                  ['auto', '自動'],
                  ['high', '高画質'],
                  ['lite', '軽量'],
                ] as const
              ).map(([v, l]) => (
                <button key={v} className={s.graphics === v ? 'on' : ''} onClick={() => updateSettings({ graphics: v })}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <p className="muted small">
            軽量モードでは、ぼかし・影・背景の粒・常に動く装飾を止めて、カードの動きを短くします。「自動」は端末が重そうなときに自動で軽量モードにします。
            {s.graphics === 'auto' && <b>（現在：{isLite() ? '軽量' : '高画質'}）</b>}
          </p>
          <div className="seg-row">
            <span>出せるカードを光らせる</span>
            <button className={`switch ${s.hints ? 'on' : ''}`} onClick={() => updateSettings({ hints: !s.hints })}>
              <i />
            </button>
          </div>
          <div className="seg-row">
            <span>演出を控えめにする</span>
            <button className={`switch ${s.reduceMotion ? 'on' : ''}`} onClick={() => updateSettings({ reduceMotion: !s.reduceMotion })}>
              <i />
            </button>
          </div>
          <p className="muted small">キーボード：Enter 出す / Space パス / H ヒント / Esc 選択解除</p>
        </section>
      </div>
    </div>
  );
}

function BackPreview({ id }: { id: BackId }) {
  return (
    <div className="back-preview">
      <CardSvg card={null} back={id} />
    </div>
  );
}

// ───────────── 遊び方 ─────────────

function Cards({ ids, small }: { ids: string; small?: boolean }) {
  return (
    <div className={`demo-cards ${small ? 'sm' : ''}`}>
      {ids.split(' ').map((id) => (
        <PlayingCard key={id} card={cardFromId(id)} />
      ))}
    </div>
  );
}

export function HowTo({ onBack }: { onBack: () => void }) {
  return (
    <div className="screen setup howto">
      <header className="screen-head">
        <button className="btn ghost sm" onClick={onBack}>
          ← 戻る
        </button>
        <h2>遊び方・ルール</h2>
        <span />
      </header>
      <div className="setup-body prose">
        <section className="panel">
          <h3>目的</h3>
          <p>手札を誰よりも早くなくすゲームです。あがった順に「大富豪・富豪・平民・貧民・大貧民」の身分がつき、次のゲームではカード交換で上位が有利になります。</p>
        </section>
        <section className="panel">
          <h3>カードの強さ</h3>
          <p>3 が一番弱く、2 が一番強い。ジョーカーはさらに強く、どのカードの代わりにもなります。</p>
          <Cards ids="S3 H4 D5 C6 S7 H8 D9 C10 S11 H12 D13 C14 S15 X1" small />
        </section>
        <section className="panel">
          <h3>出し方</h3>
          <p>場に出ているカードと<b>同じ枚数・同じ形</b>で、より強いカードを出します。出せない・出したくないときはパス。全員がパスすると場が流れ、最後に出した人が好きなカードから出せます（親）。</p>
          <div className="demo-row">
            <div>
              <Cards ids="H9" small />
              <small>シングル</small>
            </div>
            <div>
              <Cards ids="S12 D12" small />
              <small>ペア</small>
            </div>
            <div>
              <Cards ids="C7 D7 H7" small />
              <small>スリーカード</small>
            </div>
            <div>
              <Cards ids="H5 H6 H7" small />
              <small>階段（同じマークの連番）</small>
            </div>
          </div>
        </section>
        <section className="panel">
          <h3>代表的なルール</h3>
          <dl className="glossary">
            <dt>革命</dt>
            <dd>同じ数字を4枚出すと強さが逆転。3が最強、2が最弱に。</dd>
            <dt>8切り</dt>
            <dd>8を出すとその場で場が流れ、出した人が親になる。</dd>
            <dt>縛り</dt>
            <dd>同じマークが続くと、流れるまでそのマークしか出せない。</dd>
            <dt>11バック</dt>
            <dd>Jを出すと場が流れるまで強さが逆転。</dd>
            <dt>スペ3返し</dt>
            <dd>ジョーカー1枚には♠3で勝てる。</dd>
            <dt>都落ち</dt>
            <dd>前回の大富豪が1位を取れないと、即座に大貧民へ。</dd>
            <dt>反則上がり</dt>
            <dd>ジョーカー・2・8・♠3で上がると反則で最下位。</dd>
            <dt>5飛び / 7渡し / 9リバース / 10捨て / Qボンバー</dt>
            <dd>出した数字に応じてスキップ・カード渡し・逆回り・捨て・指定数字の一斉廃棄。</dd>
            <dt>カード交換</dt>
            <dd>大貧民は最強の2枚を大富豪へ、大富豪は好きな2枚を返す（富豪⇔貧民は1枚）。</dd>
          </dl>
          <p className="muted">ルール設定画面では、これらに加えて激縛り・階段革命・砂嵐・救急車・ろくろ首・下剋上・天変地異など、40以上の項目を自由に組み合わせられます。効果を発動する数字も変更可能です。</p>
        </section>
        <section className="panel">
          <h3>日本大富豪連盟 公式ルール</h3>
          <p>
            「革命・8切り・都落ち・スート縛り・スペ3返し」の五大公式ルール＋反則上がり。ジョーカー2枚・ブラインド2枚の54枚から13枚ずつ配り、4ゲーム1セットで身分リセット、3セット12ゲームで競います。パスをすると場が流れるまで出せず、階段は最弱札で比較、ジョーカーを頂点に置いた最強階段やシックスカード、ジョーカー2枚のペアは場を流します。得点は大富豪6・富豪4・貧民2・大貧民0（各セット最終ゲームの大富豪は+2）。
          </p>
        </section>
        <section className="panel">
          <h3>操作</h3>
          <p>カードをタップで選び「出す」。光っているカードが今出せるカードです。💡ヒントでおすすめの手を選択できます。キーボードでは Enter で出す、Space でパス、H でヒント。</p>
        </section>
      </div>
    </div>
  );
}

// ───────────── 開発用: 全カード ─────────────

const FX_DEMO: Record<string, [string, string, Tone]> = {
  revolution: ['革命', 'REVOLUTION ― 強さが逆転！', 'red'],
  counter: ['革命返し', 'COUNTER REVOLUTION', 'blue'],
  eightCut: ['8切り', '場が流れる！', 'gold'],
  lock: ['激縛り', '♥ 次は1つ上の数字のみ', 'blue'],
  daifugo: ['大富豪', '小町 が一番乗り！', 'gold'],
  miyako: ['都落ち', '銀次 が大貧民に転落', 'ink'],
  gekokujo: ['下剋上', '身分がすべて逆転する！', 'red'],
  bomber: ['Qボンバー', '「4・7」を全員が捨てる', 'red'],
  spade3: ['スペ3返し', 'ジョーカー撃破！', 'blue'],
};

export function Gallery() {
  const deck: Card[] = fullDeck(2);
  const fx = new URLSearchParams(location.search).get('fx');
  const demo = fx && FX_DEMO[fx];
  if (demo) {
    return (
      <div className="screen gallery fx-demo">
        <EffectLayer effect={{ id: 1, kind: fx, title: demo[0], sub: demo[1], tone: demo[2], duration: 99999 }} />
      </div>
    );
  }
  return (
    <div className="screen gallery">
      {SUITS.map((s) => (
        <div key={s} className="gallery-row">
          {deck
            .filter((c) => c.suit === s)
            .map((c) => (
              <PlayingCard key={c.id} card={c} />
            ))}
        </div>
      ))}
      <div className="gallery-row">
        {deck
          .filter((c) => c.suit === 'X')
          .map((c) => (
            <PlayingCard key={c.id} card={c} />
          ))}
        <PlayingCard card={null} />
      </div>
    </div>
  );
}
