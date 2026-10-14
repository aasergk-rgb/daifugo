// ルーム（対戦の権威側）。WebSocket サーバー・P2P ホスト・オフライン対戦で共通。

import type { Difficulty } from '../engine/ai';
import { Action, GameEvent, GameState, actors, applyAction, newMatch, startNextGame } from '../engine/game';
import { randomSeed } from '../engine/rng';
import { DEFAULT_RULES, RuleConfig, normalizeConfig } from '../engine/rules';
import { projectEvents, projectView } from '../engine/view';
import { CPU_NAMES, ClientMsg, RoomInfo, SeatInfo, ServerMsg, genId } from './protocol';

export type DecideFn = (s: GameState, player: number, diff: Difficulty) => Promise<Action>;

interface Client {
  id: string;
  seatId: string | null;
  name: string;
  token: string;
}

interface Seat extends SeatInfo {
  token: string | null;
}

export interface RoomOptions {
  code: string;
  send: (clientId: string, msg: ServerMsg) => void;
  decide: DecideFn;
  /** CPU の待ち時間倍率（1 = 標準） */
  speed?: number;
  /** 人がいなくなったとき */
  onEmpty?: () => void;
  /** ラウンド終了後、自動で次へ進むまでの時間（ms）。0 なら手動のみ */
  autoNextMs?: number;
}

export class Room {
  readonly code: string;
  config: RuleConfig = normalizeConfig(DEFAULT_RULES);
  maxSeats = 4;
  seats: Seat[] = [];
  state: GameState | null = null;
  private clients = new Map<string, Client>();
  private timers: ReturnType<typeof setTimeout>[] = [];
  private deadline: number | null = null;
  private ready = new Set<string>();
  private opts: RoomOptions;
  private emptyTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  speed: number;

  constructor(opts: RoomOptions) {
    this.opts = opts;
    this.code = opts.code;
    this.speed = opts.speed ?? 1;
  }

  // ───────────── 接続 ─────────────

  connect(clientId: string) {
    this.clients.set(clientId, { id: clientId, seatId: null, name: '', token: '' });
    if (this.emptyTimer) {
      clearTimeout(this.emptyTimer);
      this.emptyTimer = null;
    }
  }

  disconnect(clientId: string) {
    const c = this.clients.get(clientId);
    this.clients.delete(clientId);
    if (!c) return;
    const seat = c.seatId ? this.seatById(c.seatId) : null;
    if (seat) {
      if (this.state) {
        seat.connected = false;
        this.reschedule();
      } else {
        this.seats = this.seats.filter((s) => s !== seat);
      }
      if (seat.isHost) this.transferHost();
    }
    this.broadcastRoom();
    if (this.connectedHumans() === 0 && this.clients.size === 0) {
      this.emptyTimer = setTimeout(() => this.opts.onEmpty?.(), 60_000);
    }
  }

  dispose() {
    this.disposed = true;
    this.clearTimers();
    if (this.emptyTimer) clearTimeout(this.emptyTimer);
  }

  handle(clientId: string, msg: ClientMsg) {
    const c = this.clients.get(clientId);
    if (!c || this.disposed) return;
    if (msg.t === 'hello') return this.hello(c, msg);
    if (msg.t === 'ping') return this.opts.send(clientId, { t: 'pong' });
    const seat = c.seatId ? this.seatById(c.seatId) : null;
    const isHost = !!seat?.isHost;
    const err = (m: string) => this.opts.send(clientId, { t: 'error', message: m });

    switch (msg.t) {
      case 'act': {
        if (!this.state || !seat) return;
        const p = this.seats.indexOf(seat);
        this.apply(p, msg.action, clientId);
        return;
      }
      case 'stamp': {
        if (!seat) return;
        const p = this.seats.indexOf(seat);
        this.broadcast({ t: 'stamp', seat: p, seatId: seat.id, id: Math.floor(Number(msg.id)) || 0 });
        return;
      }
      case 'chat': {
        const text = String(msg.text || '').slice(0, 120).trim();
        if (!text) return;
        this.broadcast({ t: 'chat', from: seat?.name || c.name || '観戦者', text, at: Date.now() });
        return;
      }
      case 'next': {
        if (!seat || !this.state || this.state.phase !== 'roundEnd') return;
        this.ready.add(seat.id);
        this.broadcastRoom();
        this.checkReady();
        return;
      }
    }

    if (!isHost) return err('ホストのみ操作できます');
    switch (msg.t) {
      case 'config':
        if (this.state) return err('対戦中は変更できません');
        this.config = normalizeConfig(msg.config);
        break;
      case 'maxSeats':
        if (this.state) return err('対戦中は変更できません');
        this.maxSeats = Math.max(3, Math.min(6, Math.floor(msg.n)));
        while (this.seats.length > this.maxSeats) {
          const i = this.seats.map((s) => s.kind).lastIndexOf('cpu');
          if (i < 0) break;
          this.seats.splice(i, 1);
        }
        break;
      case 'addCpu':
        if (this.state) return err('対戦中は変更できません');
        if (this.seats.length >= this.maxSeats) return err('席が埋まっています');
        this.addCpu(msg.difficulty);
        break;
      case 'removeSeat': {
        if (this.state) return err('対戦中は変更できません');
        const s = this.seatById(msg.seatId);
        if (!s || s.isHost) return;
        this.seats = this.seats.filter((x) => x !== s);
        for (const cl of this.clients.values()) if (cl.seatId === s.id) cl.seatId = null;
        break;
      }
      case 'setDifficulty': {
        const s = this.seatById(msg.seatId);
        if (s && s.kind === 'cpu') s.difficulty = msg.difficulty;
        break;
      }
      case 'start':
        if (this.state) return err('対戦中です');
        this.start();
        return;
      case 'toLobby':
        this.toLobby();
        return;
      case 'speed':
        this.speed = Math.max(0.2, Math.min(3, Number(msg.value) || 1));
        return;
    }
    this.broadcastRoom();
  }

  private hello(c: Client, msg: Extract<ClientMsg, { t: 'hello' }>) {
    c.name = String(msg.name || '名無し').slice(0, 12);
    const avatar = Math.max(0, Math.floor(Number(msg.avatar)) || 0);
    // 再接続
    let seat = msg.token ? this.seats.find((s) => s.token === msg.token) : undefined;
    if (seat) {
      for (const other of this.clients.values()) if (other !== c && other.seatId === seat.id) other.seatId = null;
      seat.connected = true;
      c.token = msg.token!;
    } else {
      c.token = genId() + genId();
      if (!this.state && this.seats.length < this.maxSeats) {
        seat = {
          id: genId(),
          kind: 'human',
          name: c.name,
          avatar,
          difficulty: 'normal',
          connected: true,
          isHost: !this.seats.some((s) => s.isHost && s.kind === 'human'),
          token: c.token,
        };
        this.seats.push(seat);
      }
    }
    c.seatId = seat?.id ?? null;
    if (seat && !this.seats.some((s) => s.isHost)) seat.isHost = true;
    this.opts.send(c.id, { t: 'welcome', clientId: c.id, token: c.token, seatId: c.seatId });
    this.broadcastRoom();
    if (this.state) {
      this.sendGame(c, []);
      this.reschedule();
    }
  }

  addCpu(difficulty: Difficulty) {
    const used = new Set(this.seats.map((s) => s.name));
    const name = CPU_NAMES.find((n) => !used.has(n)) ?? `CPU${this.seats.length + 1}`;
    this.seats.push({
      id: genId(),
      kind: 'cpu',
      name,
      avatar: (CPU_NAMES.indexOf(name) + 3) % 12,
      difficulty,
      connected: true,
      isHost: false,
      token: null,
    });
  }

  private transferHost() {
    for (const s of this.seats) s.isHost = false;
    const next = this.seats.find((s) => s.kind === 'human' && s.connected);
    if (next) next.isHost = true;
  }

  private seatById(id: string) {
    return this.seats.find((s) => s.id === id) ?? null;
  }

  private connectedHumans() {
    return this.seats.filter((s) => s.kind === 'human' && s.connected).length;
  }

  // ───────────── 進行 ─────────────

  start() {
    while (this.seats.length < this.maxSeats) this.addCpu('normal');
    this.ready.clear();
    const r = newMatch(
      this.seats.map((s) => s.name),
      this.config,
      randomSeed(),
    );
    this.state = r.state;
    this.broadcastRoom();
    this.commit(r.events);
  }

  private toLobby() {
    this.clearTimers();
    this.state = null;
    this.deadline = null;
    this.ready.clear();
    this.seats = this.seats.filter((s) => s.kind === 'cpu' || s.connected);
    if (!this.seats.some((s) => s.isHost)) this.transferHost();
    this.broadcastRoom();
  }

  private apply(p: number, action: Action, clientId?: string) {
    if (!this.state) return;
    const r = applyAction(this.state, p, action);
    if (r.error) {
      if (clientId) this.opts.send(clientId, { t: 'error', message: r.error });
      return;
    }
    this.state = r.state;
    this.commit(r.events);
  }

  private commit(events: GameEvent[]) {
    if (this.state?.phase === 'roundEnd' || this.state?.phase === 'matchEnd') this.ready.clear();
    this.schedule(events);
    for (const c of this.clients.values()) this.sendGame(c, events);
    if (this.state?.phase === 'roundEnd') this.broadcastRoom();
  }

  private sendGame(c: Client, events: GameEvent[]) {
    if (!this.state) return;
    const idx = c.seatId ? this.seats.findIndex((s) => s.id === c.seatId) : -1;
    const me = idx >= 0 ? idx : null;
    this.opts.send(c.id, {
      t: 'game',
      view: projectView(this.state, me),
      events: projectEvents(events, me),
      seatIds: this.seats.map((s) => s.id),
      deadline: this.deadline,
      now: Date.now(),
    });
  }

  /** イベント演出に必要な時間（ms） */
  private eventDelay(events: GameEvent[]): number {
    let d = 0;
    for (const e of events) {
      switch (e.type) {
        case 'deal': d += 1500; break;
        case 'tenpen': d += 2000; break;
        case 'exchange': d += 500; break;
        case 'revolution': d += 1700; break;
        case 'special': d += 900; break;
        case 'flush': d += 500; break;
        case 'elevenBack': if (e.on) d += 900; break;
        case 'reverse': d += 800; break;
        case 'skip': d += 450; break;
        case 'lock': d += 700; break;
        case 'finish': d += 900; break;
        case 'miyakoOchi': d += 1500; break;
        case 'gekokujo': d += 1800; break;
        case 'bomber': d += 1400; break;
        case 'sevenPass': case 'tenDiscard': d += 600; break;
      }
    }
    return d;
  }

  private clearTimers() {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }

  private reschedule() {
    this.schedule([]);
    for (const c of this.clients.values()) this.sendGame(c, []);
  }

  private schedule(events: GameEvent[]) {
    this.clearTimers();
    this.deadline = null;
    const s = this.state;
    if (!s || this.disposed) return;
    const anim = this.eventDelay(events);

    if (s.phase === 'roundEnd') {
      const auto = this.opts.autoNextMs ?? 0;
      if (this.connectedHumans() === 0) this.timers.push(setTimeout(() => this.nextGame(), 2500));
      else if (auto > 0) {
        this.deadline = Date.now() + auto;
        this.timers.push(setTimeout(() => this.nextGame(), auto));
      }
      return;
    }
    if (s.phase === 'matchEnd') return;

    const seq = s.seq;
    for (const p of actors(s)) {
      const seat = this.seats[p];
      const auto = seat.kind === 'cpu' || !seat.connected;
      if (auto) {
        const think = (seat.kind === 'cpu' ? 650 + Math.random() * 450 : 900) * this.speed;
        this.timers.push(setTimeout(() => this.runCpu(p, seq, seat.kind === 'cpu' ? seat.difficulty : 'normal'), anim + think));
      } else if (s.config.turnSeconds > 0) {
        const ms = anim + s.config.turnSeconds * 1000;
        this.deadline = Date.now() + ms;
        this.timers.push(setTimeout(() => this.timeout(p, seq), ms));
      }
    }
  }

  private async runCpu(p: number, seq: number, diff: Difficulty) {
    const s = this.state;
    if (!s || s.seq !== seq || !actors(s).includes(p)) return;
    let action: Action;
    try {
      action = await this.opts.decide(s, p, diff);
    } catch {
      action = { type: 'pass' };
    }
    if (!this.state || this.state.seq !== seq || !actors(this.state).includes(p)) return;
    const r = applyAction(this.state, p, action);
    if (r.error) {
      // 念のため: 不正手ならパス（親なら最弱の手）
      const fallback = await this.opts.decide(this.state, p, 'easy').catch(() => ({ type: 'pass' }) as Action);
      this.apply(p, fallback);
      return;
    }
    this.state = r.state;
    this.commit(r.events);
  }

  private async timeout(p: number, seq: number) {
    const s = this.state;
    if (!s || s.seq !== seq || !actors(s).includes(p)) return;
    if (s.phase === 'play' && !s.pending.length && s.field.length) {
      this.apply(p, { type: 'pass' });
    } else {
      await this.runCpu(p, seq, 'normal');
    }
  }

  private checkReady() {
    const humans = this.seats.filter((s) => s.kind === 'human' && s.connected);
    if (humans.every((h) => this.ready.has(h.id))) this.nextGame();
  }

  private nextGame() {
    if (!this.state || this.state.phase !== 'roundEnd') return;
    const r = startNextGame(this.state);
    if (r.error) return;
    this.state = r.state;
    this.ready.clear();
    this.broadcastRoom();
    this.commit(r.events);
  }

  // ───────────── 送信 ─────────────

  info(): RoomInfo {
    const humanSpectators = [...this.clients.values()].filter((c) => !c.seatId).length;
    return {
      code: this.code,
      seats: this.seats.map(({ token: _t, ...s }) => s),
      maxSeats: this.maxSeats,
      config: this.config,
      status: this.state ? 'playing' : 'lobby',
      spectators: humanSpectators,
      ready: [...this.ready],
    };
  }

  private broadcastRoom() {
    const room = this.info();
    for (const c of this.clients.values()) this.opts.send(c.id, { t: 'room', room });
  }

  private broadcast(msg: ServerMsg) {
    for (const c of this.clients.values()) this.opts.send(c.id, msg);
  }
}
