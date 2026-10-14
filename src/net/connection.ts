// クライアント側の接続（ローカル / WebSocket サーバー / P2P）

import type { DataConnection, Peer as PeerT } from 'peerjs';
import { ClientMsg, LobbyMsg, ServerMsg, genCode, genId } from './protocol';
import { Room } from './room';
import { browserDecide } from './decide';

export interface Conn {
  send(msg: ClientMsg): void;
  close(): void;
  onMessage: (msg: ServerMsg) => void;
  onClose: (reason: string) => void;
  /** 接続先の表示名（ルームコードなど） */
  code: string;
  mode: 'local' | 'server' | 'p2p';
}

abstract class BaseConn implements Conn {
  onMessage: (msg: ServerMsg) => void = () => {};
  onClose: (reason: string) => void = () => {};
  protected queue: ServerMsg[] = [];
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

export function wsUrl(): string {
  const loc = window.location;
  const proto = loc.protocol === 'https:' ? 'wss:' : 'ws:';
  const base = loc.pathname.replace(/[^/]*$/, '');
  return `${proto}//${loc.host}${base}ws`;
}

export async function serverAvailable(): Promise<boolean> {
  try {
    const base = window.location.pathname.replace(/[^/]*$/, '');
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 2500);
    const r = await fetch(`${base}healthz`, { signal: ctl.signal, cache: 'no-store' });
    clearTimeout(t);
    if (!r.ok) return false;
    const j = await r.json().catch(() => null);
    return !!j?.daifugo;
  } catch {
    return false;
  }
}

export class WsConn extends BaseConn {
  mode: Conn['mode'] = 'server';
  code = '';
  private ws: WebSocket;
  private pending: ClientMsg[] = [];
  private open = false;
  private pingTimer: ReturnType<typeof setInterval> | null = null;

  constructor(first: LobbyMsg) {
    super();
    if (first.t === 'join') this.code = first.code;
    this.ws = new WebSocket(wsUrl());
    this.ws.onopen = () => {
      this.open = true;
      this.ws.send(JSON.stringify(first));
      for (const m of this.pending) this.ws.send(JSON.stringify(m));
      this.pending = [];
      this.pingTimer = setInterval(() => this.send({ t: 'ping' }), 20_000);
    };
    this.ws.onmessage = (e) => {
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
      this.deliver(msg);
    };
    this.ws.onclose = () => {
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.onClose('サーバーとの接続が切れました');
    };
    this.ws.onerror = () => {};
  }
  send(msg: ClientMsg) {
    if (!this.open) this.pending.push(msg);
    else if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }
  close() {
    this.onClose = () => {};
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.ws.close();
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

let peerSettings: PeerSettings = initialPeerSettings();
export function setPeerSettings(s: PeerSettings) {
  peerSettings = s;
}

async function makePeer(id?: string): Promise<PeerT> {
  const { Peer } = await import('peerjs');
  const opts: any = { debug: 1, ...peerSettings };
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

  constructor(code: string) {
    super();
    this.code = code.toUpperCase();
  }

  async connect(): Promise<void> {
    this.peer = await makePeer();
    await new Promise<void>((resolve, reject) => {
      const dc = this.peer!.connect(PEER_PREFIX + this.code, { reliable: true, serialization: 'json' });
      const t = setTimeout(() => reject(new Error('ルームが見つかりません（ホストに接続できませんでした）')), 15_000);
      this.peer!.on('error', (err: any) => {
        clearTimeout(t);
        reject(new Error(err?.type === 'peer-unavailable' ? 'ルームが見つかりません' : `P2Pエラー: ${err?.type || err}`));
      });
      dc.on('open', () => {
        clearTimeout(t);
        this.dc = dc;
        for (const m of this.pending) dc.send(m);
        this.pending = [];
        resolve();
      });
      dc.on('data', (data: any) => this.deliver(typeof data === 'string' ? JSON.parse(data) : data));
      dc.on('close', () => {
        if (!this.closed) this.onClose('ホストとの接続が切れました');
      });
    });
  }

  send(msg: ClientMsg) {
    if (this.dc?.open) this.dc.send(msg);
    else this.pending.push(msg);
  }
  close() {
    this.closed = true;
    this.dc?.close();
    this.peer?.destroy();
  }
}
