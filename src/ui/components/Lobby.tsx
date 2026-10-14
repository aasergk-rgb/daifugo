// オンライン対戦のロビー（ルームコード・席・ルール・チャット）

import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { DIFFICULTY_LABEL, Difficulty } from '../../engine/ai';
import { PRESETS, matchPreset, ruleBadges } from '../../engine/rules';
import { AVATARS } from '../../net/protocol';
import { GameClient, useClient } from '../client';
import { Chat } from './Table';
import { RuleEditor } from './RuleEditor';

const DIFFS: Difficulty[] = ['easy', 'normal', 'hard', 'oni'];

export function Lobby({ client, onExit }: { client: GameClient; onExit: () => void }) {
  const snap = useClient(client);
  const room = snap.room;
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  if (!room) {
    return (
      <div className="screen center">
        <div className="loading">
          <span className="spinner" />
          {snap.closed ?? 'ルームに接続中…'}
        </div>
        {snap.closed && (
          <button className="btn" onClick={onExit}>
            戻る
          </button>
        )}
      </div>
    );
  }
  const mine = room.seats.find((s) => s.id === snap.seatId);
  const isHost = !!mine?.isHost;
  const preset = matchPreset(room.config);
  const keep = new URLSearchParams(location.search);
  const extra = ['peerHost', 'peerPort', 'peerPath', 'peerSecure'].filter((k) => keep.get(k)).map((k) => `&${k}=${encodeURIComponent(keep.get(k)!)}`).join('');
  const url = `${location.origin}${location.pathname}?room=${room.code}&mode=${client.conn.mode === 'server' ? 'server' : 'p2p'}${extra}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      prompt('このURLを共有してください', url);
    }
  };

  return (
    <div className="screen lobby">
      <header className="screen-head">
        <button className="btn ghost sm" onClick={onExit}>
          ← 退出
        </button>
        <h2>ロビー</h2>
        <span className="conn-mode">{client.conn.mode === 'server' ? 'サーバー接続' : 'P2P接続'}</span>
      </header>

      <div className="lobby-grid">
        <div className="panel room-code-panel">
          <small>ルームコード</small>
          <div className="room-code">
            {room.code.split('').map((ch, i) => (
              <motion.span key={i} initial={{ rotateX: 90 }} animate={{ rotateX: 0 }} transition={{ delay: i * 0.08 }}>
                {ch}
              </motion.span>
            ))}
          </div>
          <button className="btn" onClick={copy}>
            {copied ? 'コピーしました！' : '🔗 招待リンクをコピー'}
          </button>
          <p className="muted">友だちにコードかリンクを送ってください。{client.conn.mode === 'p2p' && 'P2P接続中はこのページを閉じないでください（あなたがホストです）。'}</p>
        </div>

        <div className="panel seats-panel">
          <div className="panel-head">
            <h3>
              プレイヤー <small>{room.seats.length}/{room.maxSeats}</small>
            </h3>
            {isHost && (
              <div className="seg sm">
                {[3, 4, 5, 6].map((n) => (
                  <button key={n} className={room.maxSeats === n ? 'on' : ''} onClick={() => client.send({ t: 'maxSeats', n })}>
                    {n}人
                  </button>
                ))}
              </div>
            )}
          </div>
          <ul className="seat-list">
            <AnimatePresence>
              {room.seats.map((s) => (
                <motion.li key={s.id} className={`${s.kind} ${s.id === snap.seatId ? 'is-me' : ''}`} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
                  <span className="avatar-emoji">{AVATARS[s.avatar] ?? '🙂'}</span>
                  <span className="sl-name">
                    {s.name}
                    {s.isHost && <em className="host-badge">HOST</em>}
                    {s.id === snap.seatId && <em className="me-badge">YOU</em>}
                  </span>
                  {s.kind === 'cpu' ? (
                    isHost ? (
                      <select value={s.difficulty} onChange={(e) => client.send({ t: 'setDifficulty', seatId: s.id, difficulty: e.target.value as Difficulty })}>
                        {DIFFS.map((d) => (
                          <option key={d} value={d}>
                            CPU {DIFFICULTY_LABEL[d]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="cpu-chip">CPU {DIFFICULTY_LABEL[s.difficulty]}</span>
                    )
                  ) : (
                    <span className={`conn-dot ${s.connected ? 'on' : ''}`} />
                  )}
                  {isHost && !s.isHost && (
                    <button className="icon-btn sm" title="外す" onClick={() => client.send({ t: 'removeSeat', seatId: s.id })}>
                      ×
                    </button>
                  )}
                </motion.li>
              ))}
            </AnimatePresence>
            {Array.from({ length: room.maxSeats - room.seats.length }, (_, i) => (
              <li key={`empty${i}`} className="empty">
                <span className="avatar-emoji">？</span>
                <span className="sl-name muted">参加待ち…（開始時はCPUが入ります）</span>
                {isHost && (
                  <button className="btn sm ghost" onClick={() => client.send({ t: 'addCpu', difficulty: 'normal' })}>
                    ＋CPU
                  </button>
                )}
              </li>
            ))}
          </ul>
          {room.spectators > 0 && <p className="muted">観戦者 {room.spectators}人</p>}
        </div>

        <div className="panel rules-panel">
          <div className="panel-head">
            <h3>ルール：{preset ? PRESETS.find((p) => p.id === preset)!.name : 'カスタム'}</h3>
            <button className="btn sm" onClick={() => setEditing(true)}>
              {isHost ? '変更' : '詳細'}
            </button>
          </div>
          <div className="badges">
            {ruleBadges(room.config).map((b) => (
              <span key={b} className="badge">
                {b}
              </span>
            ))}
          </div>
          <p className="muted">
            全{room.config.games}戦・ジョーカー{room.config.jokers}枚{room.config.turnSeconds ? `・持ち時間${room.config.turnSeconds}秒` : ''}
          </p>
        </div>

        <div className="panel chat-panel">
          <Chat client={client} />
        </div>
      </div>

      <div className="lobby-actions">
        {isHost ? (
          <button className="btn primary big" onClick={() => client.send({ t: 'start' })}>
            対戦開始
          </button>
        ) : (
          <p className="muted">ホストが開始するのを待っています…</p>
        )}
      </div>

      <AnimatePresence>
        {editing && (
          <RuleEditor
            value={room.config}
            readOnly={!isHost}
            title={isHost ? 'ルーム設定' : 'ルーム設定（閲覧のみ）'}
            onChange={(config) => client.send({ t: 'config', config })}
            onClose={() => setEditing(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
