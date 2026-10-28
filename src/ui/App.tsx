import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { GameClient, useClient } from './client';
import { CardDefs } from './components/CardArt';
import { FxCanvas, setReduceMotion } from './components/FxCanvas';
import { Lobby } from './components/Lobby';
import { Table } from './components/Table';
import { CpuSetup, Gallery, HowTo, OnlineScreen, SettingsScreen, Title } from './screens';
import { startGlass } from './glass';
import { onAutoDowngrade, setGraphicsMode, startFpsMonitor, useLite } from './perf';
import { useSettings } from './settings';
import { setBgm, unlockAudio } from './sound';

export type Screen = 'title' | 'cpu' | 'online' | 'settings' | 'howto' | 'gallery' | 'play';

export function App() {
  const settings = useSettings();
  const params = new URLSearchParams(location.search);
  const [screen, setScreen] = useState<Screen>(params.has('gallery') ? 'gallery' : params.get('room') ? 'online' : 'title');
  const [client, setClient] = useState<GameClient | null>(null);
  const lite = useLite();
  const [liteNotice, setLiteNotice] = useState(false);

  useEffect(() => setGraphicsMode(settings.graphics), [settings.graphics]);
  useEffect(() => {
    onAutoDowngrade(() => {
      setLiteNotice(true);
      setTimeout(() => setLiteNotice(false), 4500);
    });
    startFpsMonitor();
    startGlass();
  }, []);

  useEffect(() => {
    document.documentElement.dataset.skin = settings.theme;
    document.documentElement.dataset.ui = settings.design;
    document.documentElement.dataset.glass = settings.glass;
    setReduceMotion(settings.reduceMotion);
    document.documentElement.classList.toggle('reduce-motion', settings.reduceMotion);
  }, [settings.theme, settings.design, settings.glass, settings.reduceMotion]);

  // 最初の操作で音を有効化
  useEffect(() => {
    const on = () => {
      unlockAudio();
      setBgm(getBgmEnabled());
    };
    window.addEventListener('pointerdown', on, { once: true });
    window.addEventListener('keydown', on, { once: true });
    return () => {
      window.removeEventListener('pointerdown', on);
      window.removeEventListener('keydown', on);
    };
  }, []);
  useEffect(() => setBgm(settings.bgm > 0 && !settings.muted), [settings.bgm, settings.muted]);

  const start = (c: GameClient) => {
    setClient(c);
    setScreen('play');
  };
  const exit = () => {
    client?.close();
    setClient(null);
    setScreen('title');
    if (location.search) history.replaceState(null, '', location.pathname);
  };

  return (
    <div className="app">
      <CardDefs />
      <div className="bg-layer" />
      {/* 対戦中は背景の粒を止める（演出の粒は出る） */}
      <FxCanvas key={lite ? 'lite' : 'full'} theme={settings.theme} ambient={screen !== 'play'} />
      <AnimatePresence mode="wait">
        <motion.div
          key={screen}
          className="screen-wrap"
          initial={{ opacity: 0, scale: 0.985 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.01 }}
          transition={{ type: 'spring', bounce: 0, duration: 0.38 }}
        >
          {screen === 'title' && <Title go={setScreen} />}
          {screen === 'cpu' && <CpuSetup onBack={() => setScreen('title')} onStart={start} />}
          {screen === 'online' && <OnlineScreen onBack={() => setScreen('title')} onStart={start} />}
          {screen === 'settings' && <SettingsScreen onBack={() => setScreen('title')} />}
          {screen === 'howto' && <HowTo onBack={() => setScreen('title')} />}
          {screen === 'gallery' && <Gallery />}
          {screen === 'play' && client && <PlayScreen client={client} onExit={exit} />}
        </motion.div>
      </AnimatePresence>
      <AnimatePresence>
        {liteNotice && (
          <motion.div className="lite-notice lg" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            動作が重いため、軽量モードに切り替えました（設定で変更できます）
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function getBgmEnabled() {
  try {
    const s = JSON.parse(localStorage.getItem('daifugo.settings.v1') || '{}');
    return (s.bgm ?? 0.35) > 0 && !s.muted;
  } catch {
    return true;
  }
}

function PlayScreen({ client, onExit }: { client: GameClient; onExit: () => void }) {
  const snap = useClient(client);
  const [confirm, setConfirm] = useState(false);
  const inGame = snap.room?.status === 'playing' && snap.view;
  const local = client.conn.mode === 'local';
  return (
    <>
      {snap.reconnecting && !snap.closed && (
        <div className="reconnect-banner lg" role="status">
          <span className="spinner" />
          接続が切れました。再接続しています…（その間はCPUが代わりに打ちます）
        </div>
      )}
      {inGame ? <Table client={client} onExit={() => (snap.view?.phase === 'matchEnd' ? onExit() : setConfirm(true))} /> : local ? <div className="screen center"><div className="loading"><span className="spinner" />準備中…</div></div> : <Lobby client={client} onExit={onExit} />}
      <AnimatePresence>
        {confirm && (
          <motion.div className="modal-back" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="modal lg" initial={{ scale: 0.86, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', bounce: 0.3, duration: 0.45 }}>
              <h2>対戦をやめますか？</h2>
              <p>{local ? '現在の対戦は破棄されます。' : client.conn.mode === 'p2p' && snap.room?.seats.find((s) => s.id === snap.seatId)?.isHost ? 'あなたはホストです。退出するとルームが解散します。' : '退出すると、あなたの席はCPUが代わりに打ちます。'}</p>
              <div className="modal-actions">
                <button className="btn ghost" onClick={() => setConfirm(false)}>
                  続ける
                </button>
                <button className="btn danger" onClick={onExit}>
                  やめる
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
