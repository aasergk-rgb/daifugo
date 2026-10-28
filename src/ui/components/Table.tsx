// 対戦画面

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { decide, suggest } from '../../engine/ai';
import { SUIT_SYMBOL, rankLabel, sortCards } from '../../engine/cards';
import { isFoulFinish } from '../../engine/game';
import { EFFECT_INFO, effectDisplayName, rankTitles, ruleBadges } from '../../engine/rules';
import { isMyTurn, stateFromView, viewLegalPlays, viewRev, viewValidate } from '../../engine/view';
import { STAMPS } from '../../net/protocol';
import { Avatar } from './Avatar';
import { Icon } from './Icon';
import { GameClient, useClient } from '../client';
import { useDelayed, useNow, useSize } from '../hooks';
import { useLite } from '../perf';
import { updateSettings, useSettings } from '../settings';
import { sfx } from '../sound';
import { EffectLayer } from './EffectLayer';
import { Field } from './Field';
import { Hand } from './Hand';
import { Results } from './Results';
import { Seat, seatLayout } from './Seat';

/** Apple 風のばね：少し弾んで止まる */
const SPRING_POP = { type: 'spring', bounce: 0.35, duration: 0.5 } as const;
/** 形が変わるときのばね（弾みは控えめ） */
const SPRING_MORPH = { type: 'spring', bounce: 0.22, duration: 0.45 } as const;

export function Table({ client, onExit }: { client: GameClient; onExit: () => void }) {
  const snap = useClient(client);
  const settings = useSettings();
  const lite = useLite();
  const view = snap.view!;
  const room = snap.room;
  const me = view.me;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [panel, setPanel] = useState<null | 'log' | 'rules' | 'chat' | 'menu'>(null);
  const [stampOpen, setStampOpen] = useState(false);
  const [confirmFoul, setConfirmFoul] = useState(false);
  const [tableRef, tsize] = useSize<HTMLDivElement>();
  const [handRef, hsize] = useSize<HTMLDivElement>();
  const now = useNow(!!snap.deadline);
  const dealing = useDelayed(true, 0) && snap.dealKey > 0;
  const [dealT, setDealT] = useState(0);
  useEffect(() => setDealT(Date.now()), [snap.dealKey]);
  const isDealing = dealing && Date.now() - dealT < 2200;

  const hand = useMemo(
    () => (view.hand ? sortCards(view.hand, settings.sortMode === 'strength' ? viewRev(view) : false, settings.sortMode === 'suit') : []),
    [view.hand, settings.sortMode, view.revolution, view.elevenBack],
  );

  // 手札から消えたカードは選択解除
  useEffect(() => {
    const ids = new Set(hand.map((c) => c.id));
    setSelected((s) => {
      const n = new Set([...s].filter((id) => ids.has(id)));
      return n.size === s.size ? s : n;
    });
  }, [hand]);
  useEffect(() => setSelected(new Set()), [view.gameNo]);

  const myTurn = isMyTurn(view);
  const exchangeTask = view.phase === 'exchange' ? view.myExchange : null;
  const pending = view.pending && view.pending.player === me ? view.pending : null;
  const mode: 'play' | 'exchange' | 'sevenPass' | 'tenDiscard' | 'bomber' | 'wait' = exchangeTask
    ? 'exchange'
    : pending
      ? pending.kind === 'queenBomber'
        ? 'bomber'
        : pending.kind
      : myTurn
        ? 'play'
        : 'wait';

  const legal = useMemo(() => (mode === 'play' ? viewLegalPlays(view) : []), [view, mode]);
  const playable = useMemo(() => {
    if (!settings.hints || mode !== 'play') return null;
    const s = new Set<string>();
    for (const m of legal) for (const id of m.combo.cardIds) s.add(id);
    return s;
  }, [legal, settings.hints, mode]);
  const validation = useMemo(() => (mode === 'play' && selected.size ? viewValidate(view, [...selected]) : null), [view, selected, mode]);
  const foul = useMemo(() => {
    if (!validation?.combo || !view.hand || selected.size !== view.hand.length) return false;
    const st = stateFromView(view);
    return isFoulFinish(st, validation.combo, view.hand);
  }, [validation, view, selected]);

  const needCount = mode === 'exchange' ? exchangeTask!.count : mode === 'sevenPass' || mode === 'tenDiscard' ? Math.min(pending!.count, hand.length) : 0;

  const toggle = (id: string) => {
    sfx('select');
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else {
        if (needCount && n.size >= needCount) {
          const first = [...n][0];
          n.delete(first);
        }
        n.add(id);
      }
      return n;
    });
  };

  const doPlay = () => {
    if (!validation?.combo) return;
    if (foul && !confirmFoul) {
      setConfirmFoul(true);
      return;
    }
    setConfirmFoul(false);
    client.act({ type: 'play', cardIds: [...selected] });
    setSelected(new Set());
  };
  const doPass = () => {
    client.act({ type: 'pass' });
    setSelected(new Set());
  };
  const doSubmitChoice = () => {
    const ids = [...selected];
    if (mode === 'exchange') client.act({ type: 'give', cardIds: ids });
    if (mode === 'sevenPass') client.act({ type: 'sevenPass', cardIds: ids });
    if (mode === 'tenDiscard') client.act({ type: 'tenDiscard', cardIds: ids });
    setSelected(new Set());
  };
  const doHint = () => {
    if (me === null) return;
    const st = stateFromView(view);
    if (mode === 'play') {
      const a = suggest(st, me);
      if (a?.type === 'play') setSelected(new Set(a.cardIds));
      else client.toast('ここはパスがおすすめです', 'ink');
    } else if (mode === 'exchange' || mode === 'sevenPass' || mode === 'tenDiscard') {
      const a = decide(st, me, 'hard');
      if ('cardIds' in a) setSelected(new Set(a.cardIds));
    }
  };
  useEffect(() => setConfirmFoul(false), [selected]);

  // キーボード操作
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key === 'Enter') {
        if (mode === 'play') doPlay();
        else if (needCount && selected.size === needCount) doSubmitChoice();
      } else if ((e.key === ' ' || e.key === 'p') && mode === 'play' && view.field.length) {
        e.preventDefault();
        doPass();
      } else if (e.key === 'h') doHint();
      else if (e.key === 'Escape') setSelected(new Set());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // レイアウト
  const w = tsize.w;
  const h = tsize.h;
  const compact = w < 640;
  const seats = useMemo(() => seatLayout(view.n, me ?? 0, w, h), [view.n, me, w, h]);
  const cwField = Math.max(48, Math.min(112, Math.min(w / 8.5, h / 4.6)));
  const cwHand = Math.max(52, Math.min(108, Math.min((hsize.w || w) / 9.5, window.innerHeight / 6.2)));

  const actors = new Set(view.phase === 'exchange' ? view.exchangeWaiting : view.phase === 'play' ? [view.pending ? view.pending.player : view.turn] : []);
  const seatInfo = (p: number) => room?.seats[p];
  const rev = viewRev(view);
  const fresh = useMemo(() => new Set(snap.received), [snap.received]);
  const showResults = useDelayed((view.phase === 'roundEnd' || view.phase === 'matchEnd') && !snap.effect, 900);
  const remain = snap.deadline && actors.has(me ?? -1) ? Math.max(0, Math.ceil((snap.deadline - now) / 1000)) : null;
  const titles = rankTitles(view.n);

  const sendStamp = (i: number) => {
    client.send({ t: 'stamp', id: i });
    setStampOpen(false);
  };

  const status: string = (() => {
    if (view.phase === 'exchange') {
      if (exchangeTask) return `${view.names[exchangeTask.to]} に渡すカードを ${exchangeTask.count} 枚選んでください`;
      return 'カード交換中…';
    }
    if (mode === 'sevenPass') return `次の人に渡すカードを ${needCount} 枚選んでください`;
    if (mode === 'tenDiscard') return `捨てるカードを ${needCount} 枚選んでください`;
    if (mode === 'bomber') return `捨てさせる数字を ${pending!.count} つ選んでください`;
    if (myTurn) {
      if (validation?.error) return validation.error;
      if (validation?.combo) return foul ? '反則上がりになります！' : '出せます';
      if (!view.field.length) return 'あなたが親です。好きなカードを出してください';
      return legal.length ? 'カードを選んでください' : '出せるカードがありません（パス）';
    }
    if (me !== null && view.out[me]) return view.out[me] === 'win' ? 'あがり！ 他の人の対戦を観戦中' : '観戦中';
    if (view.phase === 'play') return `${view.names[view.pending ? view.pending.player : view.turn]} の番`;
    return '';
  })();

  return (
    <div className={`table-screen ${rev ? 'is-rev' : ''} ${view.revolution ? 'is-revolution' : ''} ${view.elevenBack ? 'is-eleven' : ''}`}>
      {/* ── 上部バー ── */}
      <header className="topbar">
        <div className="tb-left lg">
          <span className="tb-logo">大富豪</span>
          <span className="tb-game">
            第<b>{view.gameNo}</b>戦<small>/{view.config.games}</small>
          </span>
          {view.config.setLength > 0 && (
            <span className="tb-set">
              SET {Math.ceil(view.gameNo / view.config.setLength)}・{view.gameInSet}/{view.config.setLength}
            </span>
          )}
          {client.conn.mode !== 'local' && <span className="tb-room">ROOM {client.code}</span>}
        </div>
        <div className="tb-right lg">
          <button className="icon-btn" title="ルール" onClick={() => setPanel(panel === 'rules' ? null : 'rules')}>
            <Icon name="book" />
          </button>
          <button className="icon-btn" title="ログ" onClick={() => setPanel(panel === 'log' ? null : 'log')}>
            <Icon name="list" />
          </button>
          {client.conn.mode !== 'local' && (
            <button className="icon-btn" title="チャット" onClick={() => setPanel(panel === 'chat' ? null : 'chat')}>
              <Icon name="chat" />
            </button>
          )}
          <button className="icon-btn" title="サウンド" onClick={() => updateSettings({ muted: !settings.muted })}>
            <Icon name={settings.muted ? 'mute' : 'sound'} />
          </button>
          <button className="icon-btn" title="メニュー" onClick={() => setPanel(panel === 'menu' ? null : 'menu')}>
            <Icon name="dots" />
          </button>
        </div>
      </header>

      {/* ── 卓 ── */}
      <div className={`table-area ${snap.shake % 2 ? 'shake-a' : snap.shake ? 'shake-b' : ''}`} ref={tableRef}>
        <div className="felt">
          <div className="felt-pattern" />
        </div>

        {/* HUD */}
        <div className="hud">
          <div className={`strength lg ${rev ? 'rev' : ''}`}>
            <span className="st-label">{view.revolution && view.elevenBack ? '革命+11バック' : view.revolution ? '革命中' : view.elevenBack ? '11バック中' : '通常'}</span>
            <span className="st-scale">
              <span className="st-weak">{rev ? '2' : '3'}</span>
              <span className="st-arrow">
                <i />
              </span>
              <span className="st-strong">{rev ? '3' : '2'}</span>
            </span>
          </div>
          <div className="dir-chip lg" title="手番の回る向き">
            <span className={`dir-icon ${view.direction === 1 ? 'cw' : 'ccw'}`}>
              <Icon name="rotate" size={15} />
            </span>
            {view.direction === 1 ? '時計回り' : '反時計回り'}
          </div>
          {(view.lockSuits || view.numberLock) && (
            <motion.div className="lock-chip lg" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={SPRING_POP}>
              <Icon name="lock" size={15} />
              {view.lockSuits && view.numberLock ? '激縛り' : view.numberLock ? '数字縛り' : '縛り'}
              {view.lockSuits && (
                <span className="lock-suits">
                  {view.lockSuits.map((s) => (
                    <span key={s} className={`suit-${s}`}>
                      {SUIT_SYMBOL[s]}
                    </span>
                  ))}
                </span>
              )}
            </motion.div>
          )}
        </div>

        <div className="discard" style={w < h * 0.95 ? { left: w * 0.84, top: h * 0.8 } : { left: w * 0.5 + Math.min(w * 0.38, 330), top: h * 0.5 }}>
          <div className="discard-stack">
            {Array.from({ length: Math.min(5, Math.ceil(view.discardCount / 6)) }, (_, i) => (
              <span key={i} className="mini-back big" style={{ transform: `rotate(${i * 13 - 20}deg) translate(${i}px, ${-i}px)` }} />
            ))}
          </div>
          {view.discardCount > 0 && <span className="discard-count">{view.discardCount}</span>}
        </div>

        {w > 0 &&
          seats.map((pos, p) =>
            p === me ? null : (
              <Seat
                key={p}
                p={p}
                view={view}
                seat={seatInfo(p)}
                pos={pos}
                active={actors.has(p)}
                fx={snap.seatFx[p]}
                deadline={snap.deadline}
                now={now}
                turnSeconds={view.config.turnSeconds}
                compact={compact}
              />
            ),
          )}

        {w > 0 && (
          <Field
            plays={snap.field}
            me={me}
            seats={seats}
            w={w}
            h={h}
            cw={cwField}
            names={view.names}
            flushing={snap.flushing}
            reduceMotion={settings.reduceMotion}
          />
        )}

        <AnimatePresence>
          {myTurn && !snap.effect && (
            <motion.div
              className="your-turn lg"
              initial={{ opacity: 0, x: '-50%', y: 16, scale: 0.85 }}
              animate={{ opacity: 1, x: '-50%', y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.18 } }}
              transition={SPRING_POP}
            >
              あなたの番{remain !== null && <b className={remain <= 5 ? 'hurry' : ''}>{remain}</b>}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── 手札エリア ── */}
      <div className={`hand-area ${mode !== 'wait' ? 'is-acting' : ''}`} ref={handRef}>
        <div className="my-plate">
          {me !== null && (
            <>
              <Avatar id={room?.seats[me]?.avatar ?? 0} className="avatar-emoji sm" />
              <span className="my-name">{view.names[me]}</span>
              {view.prevRanks && <span className={`rank-chip r${view.prevRanks[me]}`}>{titles[view.prevRanks[me]]}</span>}
              <span className="score-chip">{view.scores[me]}pt</span>
              {view.out[me] && (
                <span className={`rank-chip ${view.out[me] === 'win' ? 'r0' : 'bad'}`}>
                  {view.out[me] === 'win' ? `${titles[view.winners.indexOf(me)]}確定` : view.out[me] === 'foul' ? '反則上がり' : '都落ち'}
                </span>
              )}
              <AnimatePresence>
                {snap.seatFx[me] && (
                  <motion.span key={snap.seatFx[me]!.key} className="bubble inline" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ opacity: 0 }}>
                    {snap.seatFx[me]!.kind === 'stamp' ? STAMPS[Number(snap.seatFx[me]!.text)] : snap.seatFx[me]!.text}
                  </motion.span>
                )}
              </AnimatePresence>
            </>
          )}
          <span className={`status-line ${foul ? 'warn' : validation?.error ? 'err' : ''}`}>{status}</span>
        </div>

        {me !== null && (
          <Hand
            cards={hand}
            width={hsize.w}
            cw={cwHand}
            selected={selected}
            playable={playable}
            fresh={fresh}
            onToggle={toggle}
            dealKey={snap.dealKey}
            dealing={isDealing}
            interactive={mode !== 'wait' && mode !== 'bomber'}
          />
        )}

        <div className="action-bar">
          <div className="ab-left lg">
            <button className="btn ghost sm" onClick={() => updateSettings({ sortMode: settings.sortMode === 'strength' ? 'suit' : 'strength' })} title="並べ替え">
              {settings.sortMode === 'strength' ? '強さ順' : 'マーク順'}
            </button>
            <button className="btn ghost sm" onClick={doHint} disabled={mode === 'wait' || mode === 'bomber'} title="ヒント (H)">
              <Icon name="bulb" size={16} />
              ヒント
            </button>
            <div className="stamp-wrap">
              <button className="btn ghost sm" onClick={() => setStampOpen(!stampOpen)} title="スタンプ">
                <Icon name="smile" size={18} />
              </button>
            </div>
          </div>
          {/* スタンプの一覧はガラスのカプセルの外に出す（ガラスを重ねない・手札の下に隠れない） */}
          <AnimatePresence>
            {stampOpen && (
              <motion.div
                className="stamp-palette lg"
                style={{ transformOrigin: '0% 100%' }}
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.15 } }}
                transition={SPRING_POP}
              >
                {STAMPS.map((s, i) => (
                  <button key={i} onClick={() => sendStamp(i)}>
                    {s}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
          <AnimatePresence initial={false}>
            {mode !== 'wait' && mode !== 'bomber' && (
              <motion.div
                key="dock"
                layout
                className="ab-right lg"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.85, transition: { duration: 0.16 } }}
                transition={SPRING_MORPH}
              >
                <AnimatePresence mode="popLayout" initial={false}>
                  {mode === 'play' ? (
                    <motion.div key="play" className="ab-group" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={SPRING_MORPH}>
                      <button className="btn pass" onClick={doPass} disabled={!view.field.length}>
                        パス
                      </button>
                      <button className={`btn primary play ${foul ? 'danger' : ''}`} onClick={doPlay} disabled={!validation?.combo}>
                        {confirmFoul ? '本当に出す？' : foul ? '反則上がり…' : '出す'}
                      </button>
                    </motion.div>
                  ) : (
                    <motion.div key={mode} className="ab-group" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={SPRING_MORPH}>
                      <button className="btn primary" onClick={doSubmitChoice} disabled={selected.size !== needCount}>
                        {mode === 'tenDiscard' ? '捨てる' : '渡す'} ({selected.size}/{needCount})
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── Qボンバー ── */}
      <AnimatePresence>
        {mode === 'bomber' && pending && <BomberPicker count={pending.count} onDone={(ranks) => client.act({ type: 'bomber', ranks })} title={effectDisplayName('queenBomber', view.config.effects.queenBomber.rank)} />}
      </AnimatePresence>

      <EffectLayer effect={snap.effect} />

      {/* ── サイドパネル ── */}
      <AnimatePresence>
        {panel && panel !== 'menu' && (
          <motion.aside
            className="side-panel lg"
            initial={{ x: 400, opacity: 0.6 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 400, opacity: 0.6 }}
            transition={{ type: 'spring', bounce: 0.18, duration: 0.5 }}
          >
            <button className="close" onClick={() => setPanel(null)}>
              ×
            </button>
            {panel === 'log' && (
              <>
                <h3>対戦ログ</h3>
                <ol className="log-list">
                  {[...snap.log].reverse().map((l) => (
                    <li key={l.id} className={l.tone ? `tone-${l.tone}` : ''}>
                      {l.text}
                    </li>
                  ))}
                </ol>
              </>
            )}
            {panel === 'rules' && <RulesSummary view={view} />}
            {panel === 'chat' && <Chat client={client} />}
          </motion.aside>
        )}
        {panel === 'menu' && (
          <motion.div
            className="menu-pop lg"
            style={{ transformOrigin: '100% 0%' }}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.7, transition: { duration: 0.16 } }}
            transition={SPRING_POP}
          >
            <button onClick={() => updateSettings({ hints: !settings.hints })}>ヒント表示：{settings.hints ? 'ON' : 'OFF'}</button>
            {client.conn.mode === 'local' && (
              <button
                onClick={() => {
                  const sp = settings.speed === 1 ? 0.5 : settings.speed === 0.5 ? 1.6 : 1;
                  updateSettings({ speed: sp });
                  client.send({ t: 'speed', value: sp });
                }}
              >
                CPUの速さ：{settings.speed === 1 ? 'ふつう' : settings.speed < 1 ? 'はやい' : 'ゆっくり'}
              </button>
            )}
            <button onClick={() => updateSettings({ bgm: settings.bgm > 0 ? 0 : 0.35 })}>BGM：{settings.bgm > 0 ? 'ON' : 'OFF'}</button>
            <button onClick={() => updateSettings({ graphics: lite ? 'high' : 'lite' })}>グラフィック：{lite ? '軽量' : '高画質'}</button>
            <button className="danger" onClick={onExit}>
              対戦をやめる
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="toasts">
        <AnimatePresence>
          {snap.toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              className={`toast lg tone-${t.tone}`}
              initial={{ opacity: 0, y: -16, scale: 0.85 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.18 } }}
              transition={SPRING_POP}
            >
              {t.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {snap.closed && (
        <div className="modal-back">
          <div className="modal lg">
            <h2>接続が切れました</h2>
            <p>{snap.closed}</p>
            <button className="btn primary" onClick={onExit}>
              タイトルへ
            </button>
          </div>
        </div>
      )}

      <AnimatePresence>{showResults && <Results client={client} view={view} room={room} onExit={onExit} />}</AnimatePresence>
    </div>
  );
}

function BomberPicker({ count, onDone, title }: { count: number; onDone: (r: number[]) => void; title: string }) {
  const [sel, setSel] = useState<number[]>([]);
  const ranks = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
  return (
    <motion.div className="modal-back" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="modal lg bomber" initial={{ scale: 0.86, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={SPRING_POP}>
        <h2>{title}</h2>
        <p>全員に捨てさせる数字を {count} つ選んでください（自分も捨てます）</p>
        <div className="rank-grid">
          {ranks.map((r) => (
            <button
              key={r}
              className={sel.includes(r) ? 'on' : ''}
              onClick={() => setSel((s) => (s.includes(r) ? s.filter((x) => x !== r) : s.length >= count ? [...s.slice(1), r] : [...s, r]))}
            >
              {rankLabel(r)}
            </button>
          ))}
        </div>
        <button className="btn primary" disabled={sel.length !== count} onClick={() => onDone(sel)}>
          爆破！
        </button>
      </motion.div>
    </motion.div>
  );
}

function RulesSummary({ view }: { view: import('../../engine/view').GameView }) {
  const c = view.config;
  const eff = (Object.keys(EFFECT_INFO) as (keyof typeof EFFECT_INFO)[]).filter((k) => c.effects[k].on);
  return (
    <div className="rules-summary">
      <h3>採用ルール</h3>
      <div className="badges">
        {ruleBadges(c).map((b) => (
          <span key={b} className="badge">
            {b}
          </span>
        ))}
      </div>
      <dl>
        <dt>ジョーカー</dt>
        <dd>{c.jokers}枚</dd>
        <dt>階段</dt>
        <dd>{c.sequence ? `${c.seqMinLength}枚以上（${c.seqCompare === 'weakest' ? '最弱札で比較' : '重複不可'}）` : 'なし'}</dd>
        <dt>革命</dt>
        <dd>{c.revolution ? `${c.revolutionCount}枚以上` : 'なし'}{c.seqRevolution ? ` / 階段${c.seqRevolutionLength}枚で革命` : ''}</dd>
        <dt>パス</dt>
        <dd>{c.passRule === 'untilFlush' ? '場が流れるまで出せない' : '次の番で再び出せる'}</dd>
        {eff.map((k) => (
          <div key={k} className="dl-row">
            <dt>{effectDisplayName(k, c.effects[k].rank)}</dt>
            <dd>{EFFECT_INFO[k].desc}</dd>
          </div>
        ))}
        {c.forbiddenFinish && (
          <>
            <dt>反則上がり</dt>
            <dd>
              {[c.forbidJoker && 'ジョーカー', c.forbidStrongest && '2（革命中は3）', c.forbidEight && '8切り', c.forbidSpade3 && '♠3単体'].filter(Boolean).join('・')}
            </dd>
          </>
        )}
        <dt>交換</dt>
        <dd>{c.exchange ? `大富豪⇔大貧民 ${c.exchangeTop}枚 / 富豪⇔貧民 ${c.exchangeSecond}枚` : 'なし'}</dd>
        <dt>試合</dt>
        <dd>
          全{c.games}戦{c.setLength ? `（${c.setLength}戦ごとに階級リセット）` : ''}
        </dd>
      </dl>
    </div>
  );
}

export function Chat({ client }: { client: GameClient }) {
  const snap = useClient(client);
  const [text, setText] = useState('');
  return (
    <div className="chat">
      <h3>チャット</h3>
      <ol className="chat-list">
        {snap.chat.map((c) => (
          <li key={c.id}>
            <b>{c.from}</b> {c.text}
          </li>
        ))}
      </ol>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          client.send({ t: 'chat', text });
          setText('');
        }}
      >
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="メッセージ" maxLength={120} />
        <button className="btn sm primary">送信</button>
      </form>
    </div>
  );
}
