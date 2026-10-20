// クライアント側の接続（ローカル / WebSocket サーバー / P2P）

import type { DataConnection, Peer as PeerT } from 'peerjs';
import { ClientMsg, LobbyMsg, ServerMsg, genCode, genId } from './protocol';
import { Room } from './room';
import { browserDecide } from './decide';

export type ConnStatus = 'open' | 'reconnecting';

export interface Conn {
  send(msg: ClientMsg): void;
  close(): void;
  onMessage: (msg: ServerMsg) => void;
  onClose: (reason: string) => void;
  /** 接続が切れて再接続を試みている / 再接続できた */
  onStatus: (s: ConnStatus) => void;
  /** 接続先の表示名（ルームコードなど） */
  code: string;
  mode: 'local' | 'server' | 'p2p';
}

abstract class BaseConn implements Conn {
  onMessage: (msg: ServerMsg) => void = () => {};
  onClose: (reason: string) => void = () => {};
  onStatus: (s: ConnStatus) => void = () => {};
  abstract code: string;
  abstract mode: Conn['mode'];
  abstract send(msg: ClientMsg): void;
  abstract close(): void;
  /** onMessage が設定される前に届いたものをためておく */
  protected deliver(msg: ServerMsg) {
    this.onMessage(msg);
  }
}

// ───────────── ローカル（オフライン CPU 対戦 / P2P ホスト自身） ─────────────

export class LocalConn extends BaseConn {
  mode: Conn['mode'] = 'local';
  code: string;
  private clientId = genId();
  private closed = false;
  constructor(public room: Room, private hub: LocalHub) {
    super();
    this.code = room.code;
    hub.register(this.clientId, this);
    room.connect(this.clientId);
  }
  receive(msg: ServerMsg) {
    if (!this.closed) queueMicrotask(() => this.deliver(msg));
  }
  send(msg: ClientMsg) {
    if (this.closed) return;
    const copy = JSON.parse(JSON.stringify(msg));
    queueMicrotask(() => this.room.handle(this.clientId, copy));
  }
  close() {
    this.closed = true;
    this.room.disconnect(this.clientId);
    this.hub.onLocalClose?.();
  }
}

/** ルームからの送信先を振り分ける */
export class LocalHub {
  private locals = new Map<string, LocalConn>();
  remote = new Map<string, (msg: ServerMsg) => void>();
  onLocalClose?: () => void;
  register(id: string, c: LocalConn) {
    this.locals.set(id, c);
  }
  send = (clientId: string, msg: ServerMsg) => {
    const l = this.locals.get(clientId);
    if (l) return l.receive(msg);
    this.remote.get(clientId)?.(msg);
  };
}

/** オフライン（CPU 対戦）用のルームを作る */
export function createLocalGame(speed = 1): LocalConn {
  const hub = new LocalHub();
  const room = new Room({ code: 'LOCAL', send: hub.send, decide: browserDecide, speed });
  return new LocalConn(room, hub);
}

// ───────────── WebSocket サーバー ─────────────

const ENV: Record<string, string | undefined> = (import.meta as any).env || {};

/**
 * 対戦サーバーの場所。
 * 既定はこのページと同じ場所（npm start で配信している場合）。
 * Vercel などの静的ホスティングから別の場所のサーバーを使うときは、ビルド時に
 * VITE_SERVER_URL=https://xxxx.onrender.com のように指定する。
 */
export const SERVER_URL = (ENV.VITE_SERVER_URL || '').trim().replace(/\/+$/, '');

function serverBase(): string {
  if (SERVER_URL) return SERVER_URL + '/';
  return window.location.pathname.replace(/[^/]*$/, '');
}

export function wsUrl(): string {
  if (SERVER_URL) {
    const u = new URL(SERVER_URL);
    return `${u.protocol === 'https:' ? 'wss:' : 'ws:'}//${u.host}${u.pathname.replace(/\/+$/, '')}/ws`;
  }
  const loc = window.location;
  const proto = loc.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${loc.host}${serverBase()}ws`;
}

export async function serverAvailable(): Promise<boolean> {
  try {
    const ctl = new AbortController();
    // 無料プランのサーバーは起動に時間がかかることがあるので、外部サーバーは長めに待つ
    const t = setTimeout(() => ctl.abort(), SERVER_URL ? 15000 : 2500);
    const r = await fetch(`${serverBase()}healthz`, { signal: ctl.signal, cache: 'no-store' });
    clearTimeout(t);
    if (!r.ok) return false;
    const j = await r.json().catch(() => null);
    return !!j?.daifugo;
  } catch {
    return false;
  }
}

/** 再接続の待ち時間（ms）。これを使い切ったらあきらめる */
const RETRY_DELAYS = [800, 1500, 3000, 5000, 8000, 12000];

export class WsConn extends BaseConn {
  mode: Conn['mode'] = 'server';
  code = '';
  private ws: WebSocket | null = null;
  private pending: ClientMsg[] = [];
  private open = false;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private userClosed = false;
  private attempt = 0;
  private everOpened = false;

  constructor(first: LobbyMsg) {
    super();
    if (first.t === 'join') this.code = first.code;
    this.openSocket(first);
  }

  private openSocket(first: LobbyMsg) {
    const ws = new WebSocket(wsUrl());
    this.ws = ws;
    ws.onopen = () => {
      this.open = true;
      ws.send(JSON.stringify(first));
      if (this.everOpened) {
        // 再接続: 切断中にためた操作は古いので捨て、改めて名乗り直す
        this.pending = [];
        this.attempt = 0;
        this.onStatus('open');
      } else {
        for (const m of this.pending) ws.send(JSON.stringify(m));
        this.pending = [];
      }
      this.everOpened = true;
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.pingTimer = setInterval(() => this.send({ t: 'ping' }), 20_000);
    };
    ws.onmessage = (e) => {
      let msg: any;
      try {
        msg = JSON.parse(String(e.data));
      } catch {
        return;
      }
      if (msg.t === 'created') {
        this.code = msg.code;
        return;
      }
      if (msg.t === 'room') this.code = msg.room.code;
      if (msg.t === 'closed') this.userClosed = true; // ルームがもうない
      this.deliver(msg);
    };
    ws.onclose = () => {
      this.open = false;
      if (this.pingTimer) clearInterval(this.pingTimer);
      if (this.userClosed) return;
      if (this.everOpened && this.code && this.attempt < RETRY_DELAYS.length) {
        this.onStatus('reconnecting');
        const delay = RETRY_DELAYS[this.attempt++];
        setTimeout(() => !this.userClosed && this.openSocket({ t: 'join', code: this.code }), delay);
        return;
      }
      this.onClose(this.everOpened ? 'サーバーとの接続が切れました' : 'サーバーに接続できませんでした');
    };
    ws.onerror = () => {};
  }

  send(msg: ClientMsg) {
    if (!this.open || !this.ws) {
      if (msg.t !== 'ping') this.pending.push(msg);
    } else if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }
  close() {
    this.userClosed = true;
    this.onClose = () => {};
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.ws?.close();
  }
}

// ───────────── P2P (PeerJS / WebRTC) ─────────────

const PEER_PREFIX = 'daifugo-v1-';

export interface PeerSettings {
  host?: string;
  port?: number;
  path?: string;
  secure?: boolean;
}

/**
 * シグナリングサーバー（既定は PeerJS の公開サーバー）。
 * 自前の PeerServer を使う場合はビルド時の VITE_PEER_HOST / VITE_PEER_PORT / VITE_PEER_PATH / VITE_PEER_SECURE、
 * または URL の ?peerHost=&peerPort=&peerPath=&peerSecure= で指定できる。
 */
function initialPeerSettings(): PeerSettings {
  const s: PeerSettings = {};
  const env = (import.meta as any).env || {};
  let q: URLSearchParams | null = null;
  try {
    q = new URLSearchParams(window.location.search);
  } catch {
    /* ignore */
  }
  const host = q?.get('peerHost') || env.VITE_PEER_HOST;
  if (host) {
    s.host = host;
    const port = q?.get('peerPort') || env.VITE_PEER_PORT;
    if (port) s.port = Number(port);
    s.path = q?.get('peerPath') || env.VITE_PEER_PATH || '/';
    const sec = q?.get('peerSecure') ?? env.VITE_PEER_SECURE;
    s.secure = sec !== undefined ? sec === 'true' || sec === '1' : window.location.protocol === 'https:';
  }
  return s;
}

/**
 * WebRTC の接続補助サーバー（STUN/TURN）。厳しいネットワーク（会社・学校・一部の携帯回線）では
 * TURN サーバーが必要になることがある。VITE_ICE_SERVERS に JSON で指定する。
 *   例: [{"urls":"stun:stun.l.google.com:19302"},{"urls":"turn:turn.example.com:3478","username":"u","credential":"p"}]
 */
function iceConfig(): { iceServers: RTCIceServer[] } | undefined {
  const raw = ENV.VITE_ICE_SERVERS;
  if (!raw) return undefined;
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) && list.length ? { iceServers: list } : undefined;
  } catch {
    console.warn('VITE_ICE_SERVERS の形式が正しくありません');
    return undefined;
  }
}

let peerSettings: PeerSettings = initialPeerSettings();
export function setPeerSettings(s: PeerSettings) {
  peerSettings = s;
}

async function makePeer(id?: string): Promise<PeerT> {
  const { Peer } = await import('peerjs');
  const opts: any = { debug: 1, ...peerSettings };
  const ice = iceConfig();
  if (ice) opts.config = ice;
  return new Promise((resolve, reject) => {
    const peer = id ? new Peer(id, opts) : new Peer(opts);
    const t = setTimeout(() => reject(new Error('P2Pサーバーに接続できませんでした')), 12_000);
    peer.on('open', () => {
      clearTimeout(t);
      resolve(peer);
    });
    peer.on('error', (err: any) => {
      clearTimeout(t);
      reject(new Error(err?.type === 'unavailable-id' ? 'このルームコードは使用中です' : `P2Pエラー: ${err?.type || err}`));
    });
  });
}

/** P2P ホストになる。ルームはこのブラウザで動き、他の人は WebRTC で接続する */
export async function hostP2P(speed = 1): Promise<LocalConn> {
  let peer: PeerT | null = null;
  let code = '';
  for (let i = 0; i < 4 && !peer; i++) {
    code = genCode();
    try {
      peer = await makePeer(PEER_PREFIX + code);
    } catch (e) {
      if (i === 3) throw e;
    }
  }
  const hub = new LocalHub();
  const room = new Room({ code, send: hub.send, decide: browserDecide, speed, autoNextMs: 30_000 });
  peer!.on('connection', (dc: DataConnection) => {
    const id = genId();
    dc.on('open', () => {
      hub.remote.set(id, (msg) => {
        try {
          dc.send(msg);
        } catch {
          /* ignore */
        }
      });
      room.connect(id);
    });
    dc.on('data', (data: any) => {
      try {
        room.handle(id, typeof data === 'string' ? JSON.parse(data) : data);
      } catch {
        /* ignore malformed */
      }
    });
    dc.on('close', () => {
      hub.remote.delete(id);
      room.disconnect(id);
    });
  });
  peer!.on('disconnected', () => {
    try {
      peer!.reconnect();
    } catch {
      /* ignore */
    }
  });
  const conn = new LocalConn(room, hub);
  conn.mode = 'p2p';
  hub.onLocalClose = () => {
    room.dispose();
    peer!.destroy();
  };
  return conn;
}

export class PeerConn extends BaseConn {
  mode: Conn['mode'] = 'p2p';
  code: string;
  private dc: DataConnection | null = null;
  private peer: PeerT | null = null;
  private pending: ClientMsg[] = [];
  private closed = false;
  private lastError = '';

  constructor(code: string) {
    super();
    this.code = code.toUpperCase();
  }

  async connect(): Promise<void> {
    this.peer = await makePeer();
    this.peer.on('error', (err: any) => {
      this.lastError = err?.type === 'peer-unavailable' ? 'ルームが見つかりません（ホストがいません）' : `P2Pエラー: ${err?.type || err}`;
    });
    this.peer.on('disconnected', () => {
      // シグナリングサーバーとの接続だけが切れた場合は張り直す（対戦中のデータ通信は続く）
      if (!this.closed) {
        try {
          this.peer?.reconnect();
        } catch {
          /* ignore */
        }
      }
    });
    await this.openChannel(15_000);
  }

  /** ホストとのデータ通信路を開く */
  private openChannel(timeout: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const peer = this.peer!;
      this.lastError = '';
      const dc = peer.connect(PEER_PREFIX + this.code, { reliable: true, serialization: 'json' });
      let settled = false;
      const fail = (msg: string) => {
        if (settled) return;
        settled = true;
        clearInterval(watch);
        clearTimeout(t);
        reject(new Error(msg));
      };
      const t = setTimeout(() => fail(this.lastError || 'ホストに接続できませんでした'), timeout);
      const watch = setInterval(() => this.lastError && fail(this.lastError), 200);
      dc.on('open', () => {
        if (settled) return;
        settled = true;
        clearTimeout(t);
        clearInterval(watch);
        this.dc = dc;
        for (const m of this.pending) dc.send(m);
        this.pending = [];
        resolve();
      });
      dc.on('data', (data: any) => {
        if (this.dc === dc) this.deliver(typeof data === 'string' ? JSON.parse(data) : data);
      });
      dc.on('close', () => {
        if (this.dc === dc && !this.closed) {
          this.dc = null;
          this.reconnect();
        }
      });
    });
  }

  private async reconnect() {
    this.onStatus('reconnecting');
    for (const delay of RETRY_DELAYS) {
      await new Promise((r) => setTimeout(r, delay));
      if (this.closed) return;
      try {
        if (this.peer?.disconnected) this.peer.reconnect();
        this.pending = [];
        await this.openChannel(8000);
        this.onStatus('open');
        return;
      } catch {
        /* 次の試行へ */
      }
    }
    if (!this.closed) this.onClose('ホストとの接続が切れました（ホストがページを閉じた可能性があります）');
  }

  send(msg: ClientMsg) {
    if (this.dc?.open) this.dc.send(msg);
    else if (msg.t !== 'ping') this.pending.push(msg);
  }
  close() {
    this.closed = true;
    this.dc?.close();
    this.peer?.destroy();
  }
}
