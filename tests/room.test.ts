import { afterEach, describe, expect, it, vi } from 'vitest';
import { decide } from '../src/engine/ai';
import { stateFromView, GameView } from '../src/engine/view';
import { Room } from '../src/net/room';
import { ClientMsg, ServerMsg } from '../src/net/protocol';
import { presetConfig } from '../src/engine/rules';

afterEach(() => vi.useRealTimers());

describe('Room', () => {
  it('2人の人間 + CPU でマッチを最後まで進められ、手札は本人にしか見えない', async () => {
    vi.useFakeTimers();
    const inbox = new Map<string, ServerMsg[]>();
    const room = new Room({
      code: 'TEST',
      send: (id, msg) => inbox.get(id)!.push(JSON.parse(JSON.stringify(msg))),
      decide: async (s, p, d) => decide(s, p, d),
      speed: 0.2,
    });
    const clients = ['a', 'b'];
    for (const c of clients) {
      inbox.set(c, []);
      room.connect(c);
    }
    const send = (c: string, m: ClientMsg) => room.handle(c, m);
    send('a', { t: 'hello', name: 'Alice', avatar: 1 });
    send('b', { t: 'hello', name: 'Bob', avatar: 2 });
    send('b', { t: 'start' }); // ホスト以外は不可
    expect(room.state).toBeNull();
    send('a', { t: 'config', config: { ...presetConfig('chaos'), games: 2 } });
    send('a', { t: 'addCpu', difficulty: 'hard' });
    send('a', { t: 'start' });
    expect(room.state).not.toBeNull();
    expect(room.seats.length).toBe(4);

    let lastView: Record<string, GameView | null> = { a: null, b: null };
    let guard = 0;
    while (room.state && room.state.phase !== 'matchEnd' && guard++ < 5000) {
      for (const c of clients) {
        const msgs = inbox.get(c)!.splice(0);
        for (const m of msgs) {
          if (m.t === 'game') {
            // 他人の手札は見えない
            expect(JSON.stringify(m.view)).not.toContain('"hands"');
            const me = m.view.me!;
            if (m.view.seq === room.state!.seq && m.view.gameNo === room.state!.gameNo)
              expect(m.view.hand!.map((x) => x.id)).toEqual(room.state!.hands[me].map((x) => x.id));
            lastView[c] = m.view;
          }
        }
        const v = lastView[c];
        if (!v || v.seq !== room.state!.seq) continue;
        const me = v.me!;
        const acting =
          (v.phase === 'exchange' && v.myExchange) ||
          (v.phase === 'play' && (v.pending ? v.pending.player === me : v.turn === me && v.out[me] === null));
        if (acting) {
          send(c, { t: 'act', action: decide(stateFromView(v), me, 'normal') });
          lastView[c] = null;
        }
        if (v.phase === 'roundEnd') {
          send(c, { t: 'next' });
          lastView[c] = null;
        }
      }
      await vi.advanceTimersByTimeAsync(250);
    }
    expect(room.state!.phase).toBe('matchEnd');
    expect(room.state!.history.length).toBe(2);
    room.dispose();
  }, 60000);

  it('切断した人間の席は CPU が代わりに進め、再接続できる', async () => {
    vi.useFakeTimers();
    const inbox = new Map<string, ServerMsg[]>();
    const room = new Room({ code: 'T2', send: (id, m) => inbox.get(id)?.push(m), decide: async (s, p, d) => decide(s, p, d), speed: 0.2 });
    inbox.set('a', []);
    room.connect('a');
    room.handle('a', { t: 'hello', name: 'A', avatar: 0 });
    const welcome = inbox.get('a')!.find((m) => m.t === 'welcome') as Extract<ServerMsg, { t: 'welcome' }>;
    room.handle('a', { t: 'config', config: { ...presetConfig('basic'), games: 1 } });
    room.handle('a', { t: 'start' });
    room.disconnect('a');
    for (let i = 0; i < 400 && room.state!.phase === 'play'; i++) await vi.advanceTimersByTimeAsync(500);
    expect(['roundEnd', 'matchEnd']).toContain(room.state!.phase);
    inbox.set('a2', []);
    room.connect('a2');
    room.handle('a2', { t: 'hello', name: 'A', avatar: 0, token: welcome.token });
    const w2 = inbox.get('a2')!.find((m) => m.t === 'welcome') as Extract<ServerMsg, { t: 'welcome' }>;
    expect(w2.seatId).toBe(welcome.seatId);
    room.dispose();
  }, 60000);
});
