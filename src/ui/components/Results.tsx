import { motion } from 'framer-motion';
import { useEffect } from 'react';
import { rankTitles } from '../../engine/rules';
import type { GameView } from '../../engine/view';
import { RoomInfo } from '../../net/protocol';
import { Avatar } from './Avatar';
import { Crown } from './Icon';
import type { GameClient } from '../client';
import { confetti } from './FxCanvas';
import { sfx } from '../sound';

export function Results({ client, view, room, onExit }: { client: GameClient; view: GameView; room: RoomInfo | null; onExit: () => void }) {
  const final = view.phase === 'matchEnd';
  const titles = rankTitles(view.n);
  const last = view.history[view.history.length - 1];
  const me = view.me;
  const mySeat = me !== null ? room?.seats[me] : undefined;
  const isHost = !!mySeat?.isHost;
  const readyIds = new Set(room?.ready ?? []);
  const humans = room?.seats.filter((s) => s.kind === 'human' && s.connected) ?? [];
  const iAmReady = mySeat ? readyIds.has(mySeat.id) : false;

  const order = [...Array(view.n).keys()].sort((a, b) => (final ? view.scores[b] - view.scores[a] || last.ranks[a] - last.ranks[b] : last.ranks[a] - last.ranks[b]));

  useEffect(() => {
    if (final) {
      confetti();
      sfx('fanfare');
      setTimeout(confetti, 900);
    } else if (me !== null && last?.ranks[me] === 0) confetti();
  }, []);

  return (
    <motion.div className="modal-back results-back" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className={`modal results ${final ? 'final' : ''}`} initial={{ y: 40, scale: 0.9 }} animate={{ y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 22 }}>
        <div className="scroll-top" />
        <h2 className="res-title">{final ? '最終結果' : `第${view.gameNo}戦 結果`}</h2>
        {last?.gekokujo && <div className="res-banner">下剋上！ 身分がすべて逆転</div>}

        {final && (
          <div className="podium">
            {[1, 0, 2].map((rank) => {
              const p = order[rank];
              if (p === undefined) return <div key={rank} />;
              return (
                <motion.div
                  key={rank}
                  className={`pod pod-${rank}`}
                  initial={{ y: 80, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.3 + (2 - rank) * 0.25, type: 'spring' }}
                >
                  {rank === 0 && <Crown size={30} />}
                  <Avatar id={room?.seats[p]?.avatar ?? p} className="pod-avatar" />
                  <span className="pod-name">{view.names[p]}</span>
                  <span className="pod-score">{view.scores[p]}pt</span>
                  <div className="pod-block">{rank + 1}</div>
                </motion.div>
              );
            })}
          </div>
        )}

        <table className="res-table">
          <thead>
            <tr>
              <th>{final ? '順位' : '階級'}</th>
              <th>プレイヤー</th>
              <th>今回</th>
              <th>合計</th>
            </tr>
          </thead>
          <tbody>
            {order.map((p, i) => (
              <motion.tr key={p} className={p === me ? 'is-me' : ''} initial={{ x: -30, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.15 + i * 0.08 }}>
                <td>
                  {final ? (
                    <span className="res-rank">{i + 1}位</span>
                  ) : (
                    <motion.span className={`rank-stamp sm r${last.ranks[p]}`} initial={{ scale: 0.2, rotate: -20, opacity: 0 }} animate={{ scale: 1, rotate: -4, opacity: 1 }} transition={{ delay: 0.3 + i * 0.12, type: 'spring', stiffness: 500, damping: 15 }}>
                      {titles[last.ranks[p]]}
                    </motion.span>
                  )}
                </td>
                <td className="res-name">
                  <Avatar id={room?.seats[p]?.avatar ?? p} className="avatar-emoji sm" />
                  {view.names[p]}
                  {final && <small className="res-last">（最終戦 {titles[last.ranks[p]]}）</small>}
                </td>
                <td className="res-pt">+{last.points[p]}</td>
                <td className="res-total">{view.scores[p]}</td>
              </motion.tr>
            ))}
          </tbody>
        </table>

        {final && view.history.length > 1 && (
          <div className="res-history">
            {view.history.map((hh, gi) => (
              <div key={gi} className="rh-col" title={`第${gi + 1}戦`}>
                <span className="rh-no">{gi + 1}</span>
                {[...Array(view.n).keys()].map((p) => (
                  <span key={p} className={`rh-dot r${hh.ranks[p]} ${p === me ? 'me' : ''}`} title={`${view.names[p]}: ${titles[hh.ranks[p]]}`} />
                ))}
              </div>
            ))}
          </div>
        )}

        <div className="res-actions">
          {!final && me !== null && (
            <button className="btn primary big" disabled={iAmReady} onClick={() => client.send({ t: 'next' })}>
              {iAmReady ? `待機中… (${readyIds.size}/${humans.length})` : '次のゲームへ'}
            </button>
          )}
          {final && isHost && (
            <button
              className="btn primary big"
              onClick={() => {
                client.send({ t: 'toLobby' });
                if (client.conn.mode === 'local') client.send({ t: 'start' });
              }}
            >
              {client.conn.mode === 'local' ? 'もう一度遊ぶ' : 'ロビーに戻る'}
            </button>
          )}
          {final && !isHost && <p className="muted">ホストの操作を待っています…</p>}
          <button className="btn ghost" onClick={onExit}>
            タイトルへ
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
