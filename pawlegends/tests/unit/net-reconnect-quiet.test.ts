/**
 * Live-match deploys (docs/plans/moba/LIVE-MATCH-DEPLOYS.md §6): a relay move (close 1012, `room_gone`,
 * `server_moving`, `room_elsewhere`) reconnects after the relay's `retryMs` plus a little jitter, not after a backoff;
 * a lost socket in a match retries at least every 2 s; "Reconnecting…" shows only when the socket is not back within
 * 1.5 s, so a deploy is invisible apart from a short frozen frame.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BACKOFF_MAX_MATCH_MS,
  MOVE_JITTER_MS,
  MOVE_RETRIES,
  PartySocket,
  type SocketEnv,
  type SocketLike,
  type SocketListener,
} from '../../src/net/socket';
import { NetHost, QUIET_RECONNECT_MS, type NetNote } from '../../src/net/net-host';
import type { MatchMsg } from '../../src/net/proto';
import { initialParty, reduceParty, type PartyState } from '../../src/party/partyClient';
import { errorText } from '../../src/party/ui/copy';

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
    this.closeWith(1006);
  }
  closeWith(code: number): void {
    this.readyState = 3;
    this.onclose?.({ code });
  }
  open(): void {
    this.readyState = 1;
    this.onopen?.({});
  }
  json(m: object): void {
    this.onmessage?.({ data: JSON.stringify(m) });
  }
}

function setup() {
  let now = 0;
  const sockets: FakeWs[] = [];
  const timers: { at: number; fn: () => void; ms: number }[] = [];
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
    store: { get: () => null, set: () => undefined, del: () => undefined },
  };
  const s = new PartySocket('ws://x/pawlegends/ws', { sim: 11, simHash: '0123456789abcdef', build: 'test' }, env);
  /** The delay of the pending reconnect timer (the one that opens a new socket). */
  const reconnectDelay = () => timers[timers.length - 1]?.ms;
  const fire = () => {
    const t = timers.splice(timers.length - 1, 1)[0];
    now = t.at;
    t.fn();
  };
  return { s, sockets, timers, reconnectDelay, fire, last: () => sockets[sockets.length - 1] };
}

const welcome = (w: FakeWs) => w.json({ t: 'welcome', proto: 4, member: 'm1', resumeToken: 'tok', serverMs: 0 });

describe('relay moves reconnect fast and quietly (LIVE-MATCH-DEPLOYS.md §6)', () => {
  afterEach(() => vi.useRealTimers());

  it('room_gone retry 0 then close 1012: back within the jitter, not after a backoff', () => {
    const t = setup();
    t.s.connect();
    t.last().open();
    welcome(t.last());
    t.last().json({ t: 'error', code: 'room_gone', retryMs: 0 });
    t.last().closeWith(1012);
    expect(t.reconnectDelay()).toBeLessThanOrEqual(MOVE_JITTER_MS);
    t.fire();
    expect(t.sockets.length).toBe(2);
  });

  it('server_moving honours retryMs (250 ms + jitter); room_elsewhere + 4013 too; the backoff attempt stays at 0', () => {
    const t = setup();
    t.s.connect();
    t.last().open();
    welcome(t.last());
    t.last().json({ t: 'error', code: 'server_moving', retryMs: 250 });
    t.last().closeWith(1012);
    expect(t.reconnectDelay()).toBeGreaterThanOrEqual(250);
    expect(t.reconnectDelay()).toBeLessThanOrEqual(250 + MOVE_JITTER_MS);
    t.fire();
    t.last().open();
    t.last().json({ t: 'error', code: 'room_elsewhere', retryMs: 500 });
    t.last().closeWith(4013);
    expect(t.reconnectDelay()).toBeLessThanOrEqual(500 + MOVE_JITTER_MS);
    t.fire();
    // a plain network error afterwards starts the backoff from its first step
    t.last().open();
    welcome(t.last());
    t.last().close();
    const [lo, hi] = PartySocket.backoff(0);
    expect(t.reconnectDelay()).toBeGreaterThanOrEqual(lo);
    expect(t.reconnectDelay()).toBeLessThanOrEqual(hi);
  });

  it('a relay that keeps moving the socket gets the normal backoff after MOVE_RETRIES quick tries', () => {
    const t = setup();
    t.s.connect();
    for (let i = 0; i < MOVE_RETRIES; i++) {
      t.last().open();
      t.last().closeWith(1012);
      expect(t.reconnectDelay()).toBeLessThanOrEqual(MOVE_JITTER_MS);
      t.fire();
    }
    t.last().open();
    t.last().closeWith(1012);
    expect(t.reconnectDelay()).toBeGreaterThanOrEqual(PartySocket.backoff(0)[0]);
  });

  it('in a match the network backoff is capped at 2 s (5 s in the lobby)', () => {
    expect(PartySocket.backoff(10, true)[1]).toBe(BACKOFF_MAX_MATCH_MS);
    expect(PartySocket.backoff(10, false)[1]).toBe(5000);
  });

  it('"Reconnecting…" only when the socket is not back within 1.5 s', () => {
    vi.useFakeTimers();
    let listener: SocketListener = {};
    let open = true;
    const socket = {
      listen: (l: SocketListener) => (listener = l),
      sendCmd: () => undefined,
      sendJson: () => undefined,
      sendHash: () => undefined,
      beatNow: () => undefined,
      rttMs: 50,
      lastTurn: 0,
      get open() {
        return open;
      },
    };
    const match = { t: 'match', room: 'r', config: { seed: 5, picks: ['clem', 'sage', 'lambo', 'gabe', 'pixel', 'stilts'], tricks: ['pounce', 'pounce', 'pounce', 'pounce', 'pounce', 'pounce'], difficulty: 'easy', humans: [0, 1] }, cosmetics: { heroSkins: [] }, you: { slot: 1 }, names: ['A', 'B', null, null, null, null], turnTicks: 2, startTurn: 0, startInMs: 0, lastSeq: 0, simVersion: 11 } as unknown as MatchMsg;
    const notes: NetNote[] = [];
    const h = new NetHost(socket as never, match, { visibility: false, notify: (n) => notes.push(n), makeWorker: () => ({ post: () => undefined, close: () => undefined }) });
    const reconnecting = () => notes.filter((n) => n.title === 'Reconnecting…').length;

    // a deploy move: back in 400 ms, nothing shown
    open = false;
    listener.json?.({ t: 'error', code: 'room_gone', retryMs: 0 } as never);
    listener.state?.('reconnecting');
    vi.advanceTimersByTime(400);
    open = true;
    listener.state?.('open');
    vi.advanceTimersByTime(QUIET_RECONNECT_MS * 2);
    expect(reconnecting()).toBe(0);

    // a real outage: the note shows at 1.5 s
    open = false;
    listener.state?.('reconnecting');
    vi.advanceTimersByTime(QUIET_RECONNECT_MS - 100);
    expect(reconnecting()).toBe(0);
    vi.advanceTimersByTime(200);
    expect(reconnecting()).toBe(1);
    h.dispose();
  });
});

describe('party client on a relay move (LIVE-MATCH-DEPLOYS.md §6)', () => {
  const base = { ...initialParty('create'), inMatch: true } as PartyState;

  it('server_moving and room_elsewhere change nothing on screen (the socket comes back by itself)', () => {
    for (const code of ['server_moving', 'room_elsewhere'] as const) {
      const r = reduceParty(base, { e: 'server', m: { t: 'error', code, retryMs: 250 } as never });
      expect(r.state).toBe(base);
      expect(r.effects).toEqual([]);
    }
  });

  it('room_over leaves the match screen with its own message instead of waiting forever', () => {
    const r = reduceParty(base, { e: 'server', m: { t: 'error', code: 'room_over' } as never });
    expect(r.state.inMatch).toBe(false);
    expect(r.state.error).toEqual({ code: 'room_over' });
    expect(errorText('room_over')).toBe('The match ended while you were away');
    // outside a match it is ignored
    const idle = reduceParty(initialParty('create'), { e: 'server', m: { t: 'error', code: 'room_over' } as never });
    expect(idle.effects).toEqual([]);
  });
});
