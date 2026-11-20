/**
 * Party connect (Nov 20 fix, "Invite friend → Connecting… + Reconnecting… forever"): production runs two relay
 * instances and the older one drains for good, so ~45% of connects get `server_moving` before `welcome`. The socket
 * hangs up at once and comes back after `retryMs` (no 1 s wait for the balancer's close), says "connecting" (never
 * "reconnecting") until its first welcome, and the party screen gives up after CONNECT_GIVE_UP_MS with Try again.
 */
import { describe, expect, it } from 'vitest';
import { PartySocket, type SocketEnv, type SocketLike } from '../../src/net/socket';
import { CONNECT_GIVE_UP_MS, JOIN_GIVE_UP_MS, initialParty, reduceParty, screenOf, type PartyState } from '../../src/party/partyClient';
import type { PartyView, ServerJson } from '../../src/net/proto';

class FakeWs implements SocketLike {
  readyState = 0;
  binaryType = '';
  sent: string[] = [];
  closedBy: number | null = null;
  onopen: ((e: unknown) => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  send(d: string | ArrayBufferLike | Uint8Array): void {
    if (typeof d === 'string') this.sent.push(d);
  }
  close(code = 1000): void {
    this.closedBy = code;
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
  };
  const s = new PartySocket('ws://x/pawlegends/ws', { sim: 11, simHash: '0123456789abcdef', build: 'test' }, env);
  const states: string[] = [];
  s.tap({ state: (st) => states.push(st) });
  return {
    s,
    sockets,
    timers,
    states,
    tick(ms: number) {
      now += ms;
      for (const t of timers.splice(0).filter((x) => x.at <= now)) t.fn();
    },
  };
}

const moving = { t: 'error', code: 'server_moving', retryMs: 250 };
const welcome = { t: 'welcome', proto: 8, member: 'm1', resumeToken: 'tok', serverMs: 0 };

describe('party socket: a bounce off a draining relay', () => {
  it('hangs up at once on server_moving and reconnects after retryMs, without waiting for the server close', () => {
    const t = setup();
    t.s.connect();
    t.sockets[0].open();
    t.sockets[0].json(moving);
    // closed by the client itself, before any close from the relay
    expect(t.sockets[0].closedBy).toBe(4000);
    expect(t.timers).toHaveLength(1);
    expect(t.timers[0].ms).toBeGreaterThanOrEqual(250);
    expect(t.timers[0].ms).toBeLessThan(400);
    t.tick(t.timers[0].ms);
    expect(t.sockets).toHaveLength(2);
    // the late close of the old socket (the balancer's, ~1 s later) changes nothing
    t.sockets[0].onclose?.({ code: 1012 });
    expect(t.timers).toHaveLength(0);
    expect(t.sockets).toHaveLength(2);
  });

  it('says "connecting" (never "reconnecting") until the first welcome; a later drop is "reconnecting"', () => {
    const t = setup();
    t.s.connect();
    for (let i = 0; i < 3; i++) {
      t.sockets[i].open();
      t.sockets[i].json(moving);
      t.tick(1000);
    }
    expect(t.states).not.toContain('reconnecting');
    expect(t.states.every((x) => x === 'connecting')).toBe(true);
    t.sockets[3].open();
    t.sockets[3].json(welcome);
    expect(t.states.at(-1)).toBe('open');
    t.sockets[3].close(1006);
    expect(t.states.at(-1)).toBe('reconnecting');
  });

  it('three bounces reach the serving relay in about a second (each ~0.3 s, not ~1.6 s)', () => {
    const t = setup();
    t.s.connect();
    let waited = 0;
    for (let i = 0; i < 3; i++) {
      t.sockets[i].open();
      t.sockets[i].json(moving);
      const ms = t.timers[0].ms;
      waited += ms;
      t.tick(ms);
    }
    expect(t.sockets).toHaveLength(4);
    expect(waited).toBeLessThan(1200);
  });

  it('room_gone still waits for the relay close (the room handoff is written first)', () => {
    const t = setup();
    t.s.connect();
    t.sockets[0].open();
    t.sockets[0].json(welcome);
    t.sockets[0].json({ t: 'error', code: 'room_gone', retryMs: 0 });
    expect(t.sockets[0].closedBy).toBeNull();
    expect(t.timers.filter((x) => x.ms < 1000)).toHaveLength(0);
  });
});

const view = (over: Partial<PartyView> = {}): PartyView => ({
  t: 'party',
  code: 'K7QX2M',
  phase: 'lobby',
  leader: 'a',
  difficulty: 'easy',
  openSeats: false,
  locked: false,
  members: [{ id: 'a', name: 'Sunny Tabby', guest: false, conn: 'on' }],
  you: 'a',
  ...over,
});

describe('party screen: never an endless "Connecting…"', () => {
  it('a budget of 15 s for a new party and 30 s for a join', () => {
    expect(CONNECT_GIVE_UP_MS).toBe(15_000);
    expect(JOIN_GIVE_UP_MS).toBe(30_000);
  });

  it('timeout while connecting → "No connection" (the ended screen, with Try again)', () => {
    const s0 = initialParty('create');
    expect(screenOf(s0)).toBe('connecting');
    const { state } = reduceParty(s0, { e: 'timeout' });
    expect(state.error?.code).toBe('party_unreachable');
    expect(screenOf(state)).toBe('ended');
    // a welcome that arrives later does not create behind the error screen
    const w = reduceParty(state, { e: 'server', m: { t: 'welcome', proto: 8, member: 'a', resumeToken: 't', serverMs: 0 } as ServerJson });
    const d = reduceParty(w.state, { e: 'decide' });
    expect(d.effects).toHaveLength(0);
    expect(screenOf(d.state)).toBe('ended');
  });

  it('a join that never found its party stops "Joining …" too', () => {
    const s0: PartyState = { ...initialParty('join', 'K7QX2M'), joining: 'K7QX2M', asked: true };
    expect(screenOf(s0)).toBe('connecting');
    const { state } = reduceParty(s0, { e: 'timeout' });
    expect(state.joining).toBeNull();
    expect(state.error?.code).toBe('party_unreachable');
    expect(screenOf(state)).toBe('ended');
  });

  it('timeout is a no-op once the lobby is up', () => {
    const s0: PartyState = { ...initialParty('create'), welcomed: true, asked: true, view: view() };
    const { state } = reduceParty(s0, { e: 'timeout' });
    expect(state).toBe(s0);
    expect(screenOf(state)).toBe('lobby');
  });

  it('a late lobby still replaces the error (the party was created after all)', () => {
    const s0 = reduceParty(initialParty('create'), { e: 'timeout' }).state;
    const { state } = reduceParty(s0, { e: 'server', m: view() as unknown as ServerJson });
    expect(screenOf(state)).toBe('lobby');
  });
});
