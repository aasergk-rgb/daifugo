// 大富豪 オンライン対戦サーバー
//  - dist/ の静的ファイルを配信
//  - /ws で WebSocket によるルーム管理（サーバー権威）
//  - /healthz でヘルスチェック
//
//   PORT=8787 node dist-server/server.js

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { decide, TUNING } from '../src/engine/ai';
import { Room } from '../src/net/room';
import { ClientMsg, LobbyMsg, ServerMsg, genCode, genId } from '../src/net/protocol';

const PORT = Number(process.env.PORT || 8787);
const here = fileURLToPath(new URL('.', import.meta.url));
const STATIC = resolve(process.env.STATIC_DIR || join(here, '..', 'dist'));
const MAX_ROOMS = Number(process.env.MAX_ROOMS || 500);
// 鬼 CPU の思考時間（サーバーのイベントループを止める時間）
TUNING.mcBudget = Number(process.env.ONI_BUDGET_MS || 120);

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
};

const rooms = new Map<string, Room>();
const sockets = new Map<string, WebSocket>();

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://x');
  if (url.pathname.endsWith('/healthz')) {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ daifugo: true, rooms: rooms.size }));
    return;
  }
  let path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  if (path.endsWith('/')) path += 'index.html';
  const file = join(STATIC, path);
  if (!file.startsWith(STATIC)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const st = await stat(file);
    if (!st.isFile()) throw new Error('not file');
    const body = await readFile(file);
    const ext = extname(file);
    res.writeHead(200, {
      'content-type': MIME[ext] || 'application/octet-stream',
      'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
    });
    res.end(body);
  } catch {
    // SPA フォールバック
    try {
      const body = await readFile(join(STATIC, 'index.html'));
      res.writeHead(200, { 'content-type': MIME['.html'] });
      res.end(body);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('dist/ が見つかりません。先に npm run build を実行してください。');
    }
  }
});

const wss = new WebSocketServer({ server, path: undefined, maxPayload: 64 * 1024 });

function send(clientId: string, msg: ServerMsg | { t: 'created'; code: string }) {
  const ws = sockets.get(clientId);
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function createRoom(): Room {
  let code = genCode();
  while (rooms.has(code)) code = genCode();
  const room = new Room({
    code,
    send,
    // サーバーではイベントループを長く止めないよう同期で実行（鬼は時間制限つき）
    decide: async (s, p, d) => decide(s, p, d),
    autoNextMs: 30_000,
    onEmpty: () => {
      room.dispose();
      rooms.delete(code);
    },
  });
  rooms.set(code, room);
  return room;
}

wss.on('connection', (ws, req) => {
  if (!(req.url || '').split('?')[0].endsWith('/ws')) {
    ws.close();
    return;
  }
  const id = genId();
  sockets.set(id, ws);
  let room: Room | null = null;
  let alive = true;
  ws.on('pong', () => (alive = true));
  const hb = setInterval(() => {
    if (!alive) return ws.terminate();
    alive = false;
    ws.ping();
  }, 30_000);

  ws.on('message', (raw) => {
    let msg: ClientMsg | LobbyMsg;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (!room) {
      if (msg.t === 'create') {
        if (rooms.size >= MAX_ROOMS) return send(id, { t: 'error', message: 'サーバーが混雑しています' });
        room = createRoom();
        send(id, { t: 'created', code: room.code });
        room.connect(id);
      } else if (msg.t === 'join') {
        const r = rooms.get(String(msg.code || '').toUpperCase());
        if (!r) {
          send(id, { t: 'error', message: 'ルームが見つかりません' });
          send(id, { t: 'closed', reason: 'ルームが見つかりません' });
          return;
        }
        room = r;
        room.connect(id);
      }
      return;
    }
    try {
      room.handle(id, msg as ClientMsg);
    } catch (e) {
      console.error('room error', e);
    }
  });

  ws.on('close', () => {
    clearInterval(hb);
    sockets.delete(id);
    room?.disconnect(id);
  });
});

server.listen(PORT, () => {
  console.log(`大富豪サーバー起動: http://localhost:${PORT}  (static: ${STATIC})`);
});
