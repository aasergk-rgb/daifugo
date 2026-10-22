// 接続を受け持ち、サーバーからのイベントを演出（場の表示・エフェクト・ログ）に変換する

import { useSyncExternalStore } from 'react';
import { Card, SUIT_SYMBOL, cardLabel, rankLabel } from '../engine/cards';
import { comboName } from '../engine/combo';
import type { Action, GameEvent, PlayRecord } from '../engine/game';
import { effectDisplayName, rankTitles } from '../engine/rules';
import type { GameView } from '../engine/view';
import type { Conn } from '../net/connection';
import type { ClientMsg, RoomInfo, ServerMsg } from '../net/protocol';
import { sfx } from './sound';

export type Tone = 'gold' | 'red' | 'blue' | 'purple' | 'green' | 'ink';

export interface EffectItem {
  id: number;
  kind: string;
  title: string;
  sub?: string;
  tone: Tone;
  duration: number;
}

export interface SeatFx {
  key: number;
  kind: 'pass' | 'skip' | 'stamp' | 'give' | 'discard' | 'bomb';
  text: string;
}

export interface LogEntry {
  id: number;
  text: string;
  tone?: Tone;
}

export interface Toast {
  id: number;
  text: string;
  tone: Tone;
}

export interface ChatEntry {
  id: number;
  from: string;
  text: string;
}

export interface ClientSnapshot {
  connected: boolean;
  /** 接続が切れて再接続中 */
  reconnecting: boolean;
  closed: string | null;
  room: RoomInfo | null;
  seatId: string | null;
  view: GameView | null;
  seatIds: string[];
  deadline: number | null;
  field: PlayRecord[];
  flushing: boolean;
  effect: EffectItem | null;
  seatFx: Record<number, SeatFx | undefined>;
  log: LogEntry[];
  toasts: Toast[];
  chat: ChatEntry[];
  received: string[];
  dealKey: number;
  shake: number;
}

let uid = 1;

export class GameClient {
  private snap: ClientSnapshot = {
    connected: true,
    reconnecting: false,
    closed: null,
    room: null,
    seatId: null,
    view: null,
    seatIds: [],
    deadline: null,
    field: [],
    flushing: false,
    effect: null,
    seatFx: {},
    log: [],
    toasts: [],
    chat: [],
    received: [],
    dealKey: 0,
    shake: 0,
  };
  private listeners = new Set<() => void>();
  private queue: EffectItem[] = [];
  private effectTimer: ReturnType<typeof setTimeout> | null = null;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private skew = 0;
  token: string | null = null;

  constructor(public conn: Conn, private hello: { name: string; avatar: number; token?: string }) {
    conn.onMessage = (m) => this.onMessage(m);
    conn.onClose = (reason) => this.set({ connected: false, reconnecting: false, closed: reason });
    conn.onStatus = (st) => {
      if (st === 'reconnecting') {
        this.set({ reconnecting: true });
        return;
      }
      // 再接続できたら、同じ席に戻るために合言葉（token）つきで名乗り直す
      conn.send({ t: 'hello', ...this.hello, token: this.token ?? this.hello.token });
      this.set({ reconnecting: false });
      this.toast('再接続しました', 'gold');
    };
    conn.send({ t: 'hello', ...hello });
  }

  // ───── store ─────
  subscribe = (cb: () => void) => {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  };
  getSnapshot = () => this.snap;
  private set(p: Partial<ClientSnapshot>) {
    this.snap = { ...this.snap, ...p };
    this.listeners.forEach((l) => l());
  }

  get code() {
    return this.conn.code;
  }
  /** サーバー時計とのずれを補正した現在時刻 */
  now() {
    return Date.now() + this.skew;
  }

  // ───── 送信 ─────
  send(msg: ClientMsg) {
    this.conn.send(msg);
  }
  act(action: Action) {
    this.send({ t: 'act', action });
  }
  close() {
    this.conn.close();
    if (this.effectTimer) clearTimeout(this.effectTimer);
    if (this.flushTimer) clearTimeout(this.flushTimer);
  }

  // ───── 受信 ─────
  private onMessage(m: ServerMsg) {
    switch (m.t) {
      case 'welcome':
        this.token = m.token;
        this.set({ seatId: m.seatId });
        try {
          if (this.conn.code && this.conn.mode !== 'local') sessionStorage.setItem(`daifugo.token.${this.conn.code}`, m.token);
        } catch {
          /* ignore */
        }
        return;
      case 'room':
        this.set({ room: m.room });
        return;
      case 'game':
        this.skew = m.now - Date.now();
        this.onGame(m.view, m.events, m.seatIds, m.deadline);
        return;
      case 'stamp':
        this.seatFx(m.seat, 'stamp', String(m.id), 2600);
        sfx('stamp');
        return;
      case 'chat':
        this.set({ chat: [...this.snap.chat.slice(-60), { id: uid++, from: m.from, text: m.text }] });
        return;
      case 'error':
        this.toast(m.message, 'red');
        sfx('error');
        return;
      case 'closed':
        this.set({ closed: m.reason, connected: false });
        return;
    }
  }

  toast(text: string, tone: Tone = 'ink') {
    const t = { id: uid++, text, tone };
    this.set({ toasts: [...this.snap.toasts.slice(-3), t] });
    setTimeout(() => this.set({ toasts: this.snap.toasts.filter((x) => x.id !== t.id) }), 3200);
  }

  private seatFx(seat: number, kind: SeatFx['kind'], text: string, ms: number) {
    const key = uid++;
    this.set({ seatFx: { ...this.snap.seatFx, [seat]: { key, kind, text } } });
    setTimeout(() => {
      if (this.snap.seatFx[seat]?.key === key) this.set({ seatFx: { ...this.snap.seatFx, [seat]: undefined } });
    }, ms);
  }

  private pushEffect(e: Omit<EffectItem, 'id'>) {
    this.queue.push({ ...e, id: uid++ });
    if (!this.snap.effect) this.nextEffect();
  }

  private effectStart = 0;
  private nextEffect() {
    if (this.effectTimer) clearTimeout(this.effectTimer);
    const e = this.queue.shift() || null;
    this.set({ effect: e });
    if (!e) return;
    this.effectStart = Date.now();
    const dur = this.queue.length > 2 ? e.duration * 0.6 : e.duration;
    this.effectTimer = setTimeout(() => this.nextEffect(), dur);
  }

  /** 新しい出しが来たら、表示中の演出を早めに切り上げる（演出が場に遅れないように） */
  private hurryEffects() {
    for (const q of this.queue) q.duration = Math.min(q.duration, 700);
    if (this.snap.effect && Date.now() - this.effectStart > 450) this.nextEffect();
  }

  private log(text: string, tone?: Tone) {
    this.snap.log = [...this.snap.log.slice(-120), { id: uid++, text, tone }];
  }

  private flushNow() {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = null;
    this.snap = { ...this.snap, field: [], flushing: false };
  }

  private onGame(view: GameView, events: GameEvent[], seatIds: string[], deadline: number | null) {
    const name = (p: number) => view.names[p] ?? '?';
    const me = view.me;
    let received = this.snap.received;
    let dealKey = this.snap.dealKey;
    let shake = this.snap.shake;
    let field = this.snap.field;

    if (!events.length) {
      // 再同期
      this.flushNow();
      field = view.field;
    }

    for (const e of events) {
      switch (e.type) {
        case 'deal':
          this.flushNow();
          field = [];
          dealKey++;
          received = [];
          this.snap.log = [];
          this.log(`── 第${e.gameNo}戦 開始 ──`, 'gold');
          sfx('deal');
          setTimeout(() => sfx('deal'), 400);
          this.pushEffect({
            kind: 'deal',
            title: `第${e.gameNo}戦`,
            sub: view.config.setLength > 0 ? `セット ${Math.ceil(e.gameNo / view.config.setLength)} ・ 第${e.gameInSet}ゲーム` : `全${view.config.games}戦`,
            tone: 'gold',
            duration: 1400,
          });
          break;
        case 'tenpen':
          this.log(`天変地異！ ${name(e.a)} と ${name(e.b)} の手札が入れ替わった`, 'purple');
          this.pushEffect({ kind: 'tenpen', title: '天変地異', sub: `${name(e.a)} ⇄ ${name(e.b)} 手札総入れ替え`, tone: 'purple', duration: 2000 });
          shake++;
          sfx('revolution');
          break;
        case 'exchange': {
          const cards = e.cardIds?.map((id) => cardLabel(cardOf(id))).join(' ');
          if (e.to === me && e.cardIds) {
            received = [...e.cardIds];
            this.toast(`${name(e.from)} から ${cards} を受け取りました`, 'gold');
          }
          if (e.from === me && cards && !e.auto) this.toast(`${name(e.to)} に ${cards} を渡しました`, 'ink');
          if (e.from === me && cards && e.auto) this.toast(`${name(e.to)} に ${cards} を献上しました`, 'red');
          this.log(`${name(e.from)} → ${name(e.to)} カード${e.count}枚${me === e.from || me === e.to ? `（${cards}）` : ''}`);
          sfx('give');
          break;
        }
        case 'exchangeDone':
          this.log('カード交換完了');
          break;
        case 'play': {
          this.hurryEffects();
          if (this.snap.flushing) {
            this.flushNow();
            field = [];
          }
          const rec: PlayRecord = { player: e.player, cards: e.cards, combo: e.combo };
          field = [...field, rec];
          sfx('card');
          this.log(`${name(e.player)}：${e.cards.map(cardLabel).join(' ')}（${comboName(e.combo)}）`);
          break;
        }
        case 'pass':
          this.seatFx(e.player, 'pass', 'パス', 1300);
          this.log(`${name(e.player)}：パス`);
          sfx('pass');
          break;
        case 'flush': {
          const delay = e.reason === 'allPass' ? 650 : 1100;
          this.snap.flushing = true;
          if (this.flushTimer) clearTimeout(this.flushTimer);
          this.flushTimer = setTimeout(() => {
            this.flushTimer = null;
            this.set({ field: [], flushing: false });
            sfx('flush');
          }, delay);
          this.log(e.reason === 'allPass' ? `場が流れました（親：${name(e.leader)}）` : `場が流れました`);
          break;
        }
        case 'revolution':
          this.log(e.on ? `${name(e.player)} の革命！` : `${name(e.player)} の革命返し！`, 'red');
          this.pushEffect({
            kind: e.on ? 'revolution' : 'counter',
            title: e.on ? '革命' : '革命返し',
            sub: e.on ? 'REVOLUTION ― 強さが逆転！' : 'COUNTER REVOLUTION ― 強さが元に戻る',
            tone: e.on ? 'red' : 'blue',
            duration: 1700,
          });
          shake++;
          sfx('revolution');
          break;
        case 'elevenBack':
          if (e.on) {
            const nm = effectDisplayName('elevenBack', view.config.effects.elevenBack.rank);
            this.log(`${nm}！ 場が流れるまで強さが逆転`, 'purple');
            this.pushEffect({ kind: 'elevenBack', title: nm, sub: '場が流れるまで強さ逆転', tone: 'purple', duration: 1000 });
            sfx('back');
          }
          break;
        case 'lock': {
          const suits = e.suits?.map((s) => SUIT_SYMBOL[s]).join('') ?? '';
          const title = e.suits && e.number ? '激縛り' : e.number ? '数字縛り' : '縛り';
          this.log(`${title}！ ${suits}`, 'blue');
          this.pushEffect({ kind: 'lock', title, sub: e.number ? `${suits} 次は1つ上の数字のみ` : `${suits} のマークしか出せない`, tone: 'blue', duration: 900 });
          sfx('lock');
          break;
        }
        case 'reverse':
          this.log(`リバース！ 回る向きが逆に`, 'green');
          this.pushEffect({ kind: 'reverse', title: 'リバース', sub: e.direction === 1 ? '時計回り ⟳' : '反時計回り ⟲', tone: 'green', duration: 900 });
          sfx('reverse');
          break;
        case 'skip':
          this.seatFx(e.player, 'skip', 'スキップ', 1200);
          this.log(`${name(e.player)} はスキップ`);
          sfx('skip');
          break;
        case 'special': {
          const sp = SPECIAL[e.kind];
          if (!sp) break;
          const title = e.kind === 'eightCut' ? eightName(view) : sp.title;
          this.log(`${name(e.player)}：${title}！`, sp.tone);
          this.pushEffect({ kind: e.kind, title, sub: sp.sub, tone: sp.tone, duration: e.kind === 'eightCut' ? 1000 : 1200 });
          sfx(e.kind === 'eightCut' ? 'slash' : e.kind === 'spade3' ? 'spade' : 'flush');
          break;
        }
        case 'pending':
          if (e.pending.player === me) {
            const n = e.pending.count;
            const msg =
              e.pending.kind === 'sevenPass'
                ? `次の人に渡すカードを${n}枚選んでください`
                : e.pending.kind === 'tenDiscard'
                  ? `捨てるカードを${n}枚選んでください`
                  : `捨てさせる数字を${n}つ選んでください`;
            this.toast(msg, 'gold');
          }
          break;
        case 'sevenPass':
          this.seatFx(e.from, 'give', `${e.count}枚渡し`, 1300);
          if (e.to === me && e.cardIds) {
            received = [...e.cardIds];
            this.toast(`${name(e.from)} から ${e.cardIds.map((id) => cardLabel(cardOf(id))).join(' ')} を受け取りました`, 'gold');
          }
          this.log(`${name(e.from)} → ${name(e.to)} に${e.count}枚渡した`);
          sfx('give');
          break;
        case 'tenDiscard':
          this.seatFx(e.player, 'discard', `${e.cards.length}枚捨て`, 1300);
          this.log(`${name(e.player)} が ${e.cards.map(cardLabel).join(' ')} を捨てた`);
          sfx('flush');
          break;
        case 'bomber': {
          const rs = e.ranks.map(rankLabel).join('・');
          const total = e.discarded.reduce((a, d) => a + d.cards.length, 0);
          this.log(`${name(e.player)} のボンバー！ ${rs} を指定（計${total}枚が捨てられた）`, 'red');
          this.pushEffect({ kind: 'bomber', title: effectDisplayName('queenBomber', view.config.effects.queenBomber.rank), sub: `「${rs}」を全員が捨てる（${total}枚）`, tone: 'red', duration: 1400 });
          shake++;
          sfx('bomb');
          break;
        }
        case 'finish': {
          const titles = rankTitles(view.n);
          if (e.foul) {
            this.log(`${name(e.player)} 反則上がり！`, 'red');
            this.pushEffect({ kind: 'foul', title: '反則上がり', sub: `${name(e.player)} は最下位`, tone: 'red', duration: 1300 });
            sfx('lose');
          } else {
            const t = titles[e.order] ?? '';
            this.log(`${name(e.player)} があがり！（${e.order + 1}位）`, 'gold');
            if (e.order === 0 || e.player === me)
              this.pushEffect({
                kind: e.order === 0 ? 'daifugo' : 'finish',
                title: e.order === 0 ? '大富豪' : `${e.order + 1}位あがり`,
                sub: e.order === 0 ? `${name(e.player)} が一番乗り！` : `${name(e.player)}${t ? ` ― ${t}` : ''}`,
                tone: 'gold',
                duration: 1100,
              });
            sfx(e.order === 0 ? 'fanfare' : 'win');
          }
          break;
        }
        case 'miyakoOchi':
          this.log(`${name(e.player)} 都落ち！ 大貧民に転落`, 'red');
          this.pushEffect({ kind: 'miyako', title: '都落ち', sub: `${name(e.player)} が大貧民に転落`, tone: 'ink', duration: 1500 });
          sfx('miyako');
          break;
        case 'gekokujo':
          this.log(`下剋上！ ${name(e.player)} が一番であがり、身分が逆転`, 'red');
          this.pushEffect({ kind: 'gekokujo', title: '下剋上', sub: '身分がすべて逆転する！', tone: 'red', duration: 1800 });
          shake++;
          sfx('revolution');
          break;
        case 'turn':
          if (e.player === me && view.phase === 'play') setTimeout(() => sfx('turn'), 250);
          break;
        case 'roundEnd': {
          const titles = rankTitles(view.n);
          this.log(`── 第${view.gameNo}戦 終了 ──`, 'gold');
          e.ranks.forEach((r, p) => this.log(`${titles[r]}：${name(p)}（+${e.points[p]}）`));
          break;
        }
        case 'matchEnd':
          this.log('全ゲーム終了！', 'gold');
          break;
      }
    }

    // 演出に関係ない場の差異（再接続など）を補正
    if (!this.snap.flushing && events.length && !events.some((e) => e.type === 'play' || e.type === 'flush' || e.type === 'deal')) {
      if (field.length !== view.field.length) field = view.field;
    }

    this.set({
      view,
      seatIds,
      deadline: deadline !== null ? deadline - this.skew : null,
      field,
      received,
      dealKey,
      shake,
      log: this.snap.log,
      flushing: this.snap.flushing,
    });
  }
}

const SPECIAL: Record<string, { title: string; sub: string; tone: Tone }> = {
  eightCut: { title: '8切り', sub: '場が流れる！', tone: 'gold' },
  spade3: { title: 'スペ3返し', sub: 'ジョーカー撃破！', tone: 'blue' },
  sandstorm: { title: '砂嵐', sub: '3のスリーカードで場を流す', tone: 'gold' },
  ambulance: { title: '救急車', sub: '9のペアで場を流す', tone: 'red' },
  rokurokubi: { title: 'ろくろ首', sub: '6のペアで場を流す', tone: 'purple' },
  sixCard: { title: 'シックスカード', sub: '6枚出しで場が流れる', tone: 'gold' },
  strongestSeq: { title: '最強階段', sub: 'ジョーカーを頂点に', tone: 'gold' },
  doubleJoker: { title: 'ダブルジョーカー', sub: '最強のペア！', tone: 'purple' },
};

function eightName(v: GameView) {
  const r = v.config.effects.eightCut.rank;
  return r === 8 ? '8切り' : `${rankLabel(r)}切り`;
}

function cardOf(id: string): Card {
  const suit = id[0] as Card['suit'];
  return suit === 'X' ? { id, suit, rank: 0 } : { id, suit, rank: Number(id.slice(1)) };
}

export function useClient(c: GameClient): ClientSnapshot {
  return useSyncExternalStore(c.subscribe, c.getSnapshot);
}

