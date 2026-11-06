/** Party play N5/N7 (MULTIPLAYER.md §2.4 B3, §4.5): the party socket against a fake WebSocket. */
import { describe, expect, it } from 'vitest';
import { PartySocket, BACKOFF_MAX_MS, type SocketEnv, type SocketLike } from '../../src/net/socket';
import { decodeClientBinary, encodeTurn, Frame } from '../../src/net/proto';

class FakeWs implements SocketLike {
  readyState = 0;
  binaryType = '';
  sent: (string | Uint8Array)[] = [];
  onopen: ((e: unknown) => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  send(d: string | ArrayBufferLike | Uint8Array): void {
    this.sent.push(typeof d === 'string' ? d : new Uint8Array(d as ArrayBuffer));
  }
  close(): void {
    this.readyState = 3;
    this.onclose?.({ code: 1006 });
  }
  open(): void {
    this.readyState = 1;
    this.onopen?.({});
  }
  json(m: object): void {
    this.onmessage?.({ data: JSON.stringify(m) });
  }
  bin(b: Uint8Array): void {
    this.onmessage?.({ data: b.buffer.slice(b.byteOffset, b.byteOffset + b.length) });
  }
  cmds(): number[] {
    return this.sent.filter((x): x is Uint8Array => typeof x !== 'string' && x[0] === Frame.CMD).map((x) => {
      const f = decodeClientBinary(x);
      return f.type === Frame.CMD ? f.f.seq : -1;
    });
  }
}

function setup() {
  let now = 0;
  const sockets: FakeWs[] = [];
  const timers: { at: number; fn: () => void; ms: number }[] = [];
  const store = new Map<string, string>();
  const env: SocketEnv = {
    open: () => {
      const w = new FakeWs();
      sockets.push(w);
      return w;
    },
    now: () => now,
    setTimer: (fn, ms) => {
      const t = { at: now + ms, fn, ms };
      timers.push(t);
      return t;
    },
    clearTimer: (h) => {
      const i = timers.indexOf(h as never);
      if (i >= 0) timers.splice(i, 1);
    },
    random: () => 0.5,
    store: { get: (k) => store.get(k) ?? null, set: (k, v) => void store.set(k, v), del: (k) => void store.delete(k) },
  };
  const s = new PartySocket('ws://x/pawlegends/ws', { sim: 11, simHash: '0123456789abcdef', build: 'test' }, env);
  return {
    s,
    sockets,
    timers,
    store,
    tick(ms: number) {
      now += ms;
      for (const t of timers.splice(0).filter((x) => x.at <= now)) t.fn();
    },
    set now(v: number) {
      now = v;
    },
    get now() {
      return now;
    },
  };
}

const welcome = (w: FakeWs, extra: object = {}) => w.json({ t: 'welcome', proto: 1, member: 'm1', resumeToken: 'tok' + Math.random().toString(36).slice(2), serverMs: 0, ...extra });

describe('PartySocket', () => {
  it('hello with the resume token; the token rotates on every welcome and is stored', () => {
    const t = setup();
    t.s.connect();
    t.sockets[0].open();
    expect(JSON.parse(t.sockets[0].sent[0] as string)).toMatchObject({ t: 'hello', proto: 1, sim: 11 });
    welcome(t.sockets[0]);
    const first = t.store.get('pl.party.resume');
    expect(first).toBeTruthy();
    t.sockets[0].close();
    t.tick(10_000);
    t.sockets[1].open();
    expect(JSON.parse(t.sockets[1].sent[0] as string).resume).toEqual({ token: first });
    welcome(t.sockets[1]);
    expect(t.store.get('pl.party.resume')).not.toBe(first);
  });

  it('reconnects with exponential backoff (250 ms to 5 s, jitter)', () => {
    expect(PartySocket.backoff(0)).toEqual([125, 250]);
    expect(PartySocket.backoff(10)[1]).toBe(BACKOFF_MAX_MS);
    const t = setup();
    t.s.connect();
    for (let i = 0; i < 6; i++) {
      t.sockets[t.sockets.length - 1].close();
      const timer = t.timers[t.timers.length - 1];
      expect(timer.ms).toBeLessThanOrEqual(BACKOFF_MAX_MS);
      t.tick(timer.ms);
    }
    expect(t.sockets.length).toBe(7);
  });

  it('seq continues from lastSeq; after a reconnect only unacked commands younger than 500 ms are re-sent', () => {
    const t = setup();
    t.s.connect();
    t.sockets[0].open();
    welcome(t.sockets[0]);
    t.sockets[0].json({ t: 'match', room: 'r', config: { seed: 1, picks: [], tricks: [], difficulty: 'easy', humans: [0, 1] }, cosmetics: { heroSkins: [] }, you: { slot: 1 }, names: [], turnTicks: 2, startTurn: 0, startInMs: 0, lastSeq: 40, simVersion: 11 });
    t.s.sendCmd(new Uint8Array([6]));
    expect(t.sockets[0].cmds()).toEqual([41]);
    t.now = 1000;
    t.s.sendCmd(new Uint8Array([6])); // 42, old by the time we reconnect
    t.now = 1700;
    t.s.sendCmd(new Uint8Array([6])); // 43, young
    t.sockets[0].bin(encodeTurn({ turn: 1, modeMask: 0, acks: [undefined, 41, undefined], entries: [] }));
    expect(t.s.unacked.map((u) => u.seq)).toEqual([42, 43]);
    t.sockets[0].close();
    t.tick(400);
    const w = t.sockets[1];
    w.open();
    welcome(w, { lastSeq: 41 });
    expect(w.cmds()).toEqual([44]);
    t.s.sendCmd(new Uint8Array([6]));
    expect(w.cmds()).toEqual([44, 45]);
  });

  it('re-sends nothing after the slot was piloted in between', () => {
    const t = setup();
    t.s.connect();
    t.sockets[0].open();
    welcome(t.sockets[0]);
    t.sockets[0].json({ t: 'match', room: 'r', config: { seed: 1, picks: [], tricks: [], difficulty: 'easy', humans: [0, 1] }, cosmetics: { heroSkins: [] }, you: { slot: 1 }, names: [], turnTicks: 2, startTurn: 0, startInMs: 0, lastSeq: 0, simVersion: 11 });
    t.s.sendCmd(new Uint8Array([6]));
    t.sockets[0].bin(encodeTurn({ turn: 1, modeMask: 0b10, acks: [], entries: [] }));
    t.sockets[0].close();
    t.tick(300);
    t.sockets[1].open();
    welcome(t.sockets[1], { lastSeq: 0 });
    expect(t.sockets[1].cmds()).toEqual([]);
  });

  it('seat_elsewhere: the tab that lost the seat never retries', () => {
    const t = setup();
    t.s.connect();
    t.sockets[0].open();
    welcome(t.sockets[0]);
    t.sockets[0].json({ t: 'error', code: 'seat_elsewhere' });
    t.sockets[0].close();
    t.tick(10_000);
    expect(t.sockets.length).toBe(1);
    expect(t.s.elsewhere).toBe(true);
  });
});
