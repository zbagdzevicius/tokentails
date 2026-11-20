/**
 * LATENCY-PLAN M1 and C2 (docs/plans/moba/LATENCY-NEXT.md): the party socket's RTT percentiles from ECHO frames, and
 * the lobby connect that opens the WebSocket while the party ticket is still being fetched.
 */
import { describe, expect, it } from 'vitest';
import { HELLO_HOLD_MS, PartySocket, TICKET_FRESH_MS, TICKET_WAIT_MS, type SocketEnv, type SocketLike } from '../../src/net/socket';
import { encodeEcho } from '../../src/net/proto';

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
    this.onclose?.({ code: 1000 });
  }
  open(): void {
    this.readyState = 1;
    this.onopen?.({});
  }
  bin(b: Uint8Array): void {
    this.onmessage?.({ data: b.buffer.slice(b.byteOffset, b.byteOffset + b.length) });
  }
  hellos(): Record<string, unknown>[] {
    return this.sent.filter((x): x is string => typeof x === 'string').map((x) => JSON.parse(x)).filter((m) => m.t === 'hello');
  }
}

function setup() {
  let now = 0;
  const sockets: FakeWs[] = [];
  const timers = new Set<{ at: number; fn: () => void }>();
  const env: SocketEnv = {
    open: () => {
      const w = new FakeWs();
      sockets.push(w);
      return w;
    },
    now: () => now,
    setTimer: (fn, ms) => {
      const t = { at: now + ms, fn };
      timers.add(t);
      return t;
    },
    clearTimer: (h) => void timers.delete(h as never),
    random: () => 0.5,
  };
  const s = new PartySocket('ws://x/pawlegends/ws', { sim: 19, simHash: '0123456789abcdef', build: 'test', guestKey: 'g'.repeat(32) }, env);
  return {
    s,
    sockets,
    advance(ms: number) {
      now += ms;
      for (const t of [...timers]) if (t.at <= now) {
        timers.delete(t);
        t.fn();
      }
    },
    setNow(v: number) {
      now = v;
    },
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('PartySocket rttStats (M1)', () => {
  it('is empty before the first ECHO', () => {
    const { s } = setup();
    expect(s.rttStats()).toEqual({ p50: 0, p95: 0, jitterP95: 0, n: 0 });
  });

  it('reports p50 and p95 of the ECHO samples (not the EWMA twice) and a jitter p95', () => {
    const f = setup();
    f.s.connect();
    f.sockets[0].open();
    // 19 fast samples and one slow one: p95 sees the tail, p50 does not
    const rtts = [...Array.from({ length: 19 }, (_, i) => 40 + (i % 5)), 220];
    for (const r of rtts) {
      f.setNow(10_000);
      f.sockets[0].bin(encodeEcho({ clientMs: 10_000 - r, serverMs: 0 }));
    }
    const st = f.s.rttStats();
    expect(st.n).toBe(20);
    expect(st.p50).toBeGreaterThanOrEqual(40);
    expect(st.p50).toBeLessThanOrEqual(44);
    expect(st.p95).toBe(220);
    expect(st.p95).not.toBe(st.p50);
    expect(st.jitterP95).toBeGreaterThan(0);
  });

  it('keeps the last 64 samples only', () => {
    const f = setup();
    f.s.connect();
    f.sockets[0].open();
    f.setNow(5000);
    for (let i = 0; i < 100; i++) f.sockets[0].bin(encodeEcho({ clientMs: 5000 - (i < 36 ? 300 : 30), serverMs: 0 }));
    const st = f.s.rttStats();
    expect(st.n).toBe(64);
    expect(st.p95).toBe(30);
  });
});

describe('PartySocket connect with a pending ticket (C2)', () => {
  it('opens at once; a ticket that lands after onopen goes in the one hello', async () => {
    const f = setup();
    let give!: (t: string | null) => void;
    f.s.connect(new Promise((r) => (give = r)));
    expect(f.sockets).toHaveLength(1);
    f.sockets[0].open();
    await flush();
    expect(f.sockets[0].hellos()).toHaveLength(0);
    give('tkt-123');
    await flush();
    const h = f.sockets[0].hellos();
    expect(h).toHaveLength(1);
    expect(h[0].ticket).toBe('tkt-123');
  });

  it('a ticket that is already there when the socket opens goes in the hello', async () => {
    const f = setup();
    f.s.connect(Promise.resolve('early'));
    await flush();
    f.sockets[0].open();
    await flush();
    expect(f.sockets[0].hellos().map((h) => h.ticket)).toEqual(['early']);
  });

  it('a failed ticket sends one guest hello (guestKey, no ticket)', async () => {
    const f = setup();
    f.s.connect(Promise.reject(new Error('no ticket')));
    f.sockets[0].open();
    await flush();
    await flush();
    const h = f.sockets[0].hellos();
    expect(h).toHaveLength(1);
    expect(h[0].ticket).toBeUndefined();
    expect(h[0].guestKey).toBe('g'.repeat(32));
  });

  it('a ticket that never comes: the socket is swapped before the relay 5 s hello timeout, then a guest hello at TICKET_WAIT_MS; a later ticket is dropped', async () => {
    expect(HELLO_HOLD_MS).toBeLessThan(5000);
    expect(TICKET_WAIT_MS).toBeLessThan(2 * HELLO_HOLD_MS);
    const f = setup();
    const states: string[] = [];
    f.s.listen({ state: (st) => states.push(st) });
    let give!: (t: string | null) => void;
    f.s.connect(new Promise((r) => (give = r)));
    f.sockets[0].open();
    f.advance(HELLO_HOLD_MS);
    await flush();
    expect(f.sockets[0].hellos()).toHaveLength(0);
    expect(f.sockets[0].readyState).toBe(3);
    expect(f.sockets).toHaveLength(2);
    expect(states).not.toContain('reconnecting');
    f.sockets[1].open();
    f.advance(TICKET_WAIT_MS - HELLO_HOLD_MS - 1);
    await flush();
    expect(f.sockets[1].hellos()).toHaveLength(0);
    f.advance(1);
    await flush();
    expect(f.sockets[1].hellos()).toHaveLength(1);
    expect(f.sockets[1].hellos()[0].ticket).toBeUndefined();
    give('late');
    await flush();
    expect(f.sockets[1].hellos()).toHaveLength(1);
    expect(f.sockets).toHaveLength(2);
  });

  it('a slow ticket (5 s, after the socket swap) still signs the hello in', async () => {
    const f = setup();
    let give!: (t: string | null) => void;
    f.s.connect(new Promise((r) => (give = r)));
    f.sockets[0].open();
    f.advance(HELLO_HOLD_MS);
    await flush();
    f.sockets[1].open();
    f.advance(1000);
    give('slow');
    await flush();
    expect(f.sockets[0].hellos()).toHaveLength(0);
    expect(f.sockets[1].hellos().map((h) => h.ticket)).toEqual(['slow']);
  });

  it('a socket closed before the ticket settles sends nothing', async () => {
    const f = setup();
    let give!: (t: string | null) => void;
    f.s.connect(new Promise((r) => (give = r)));
    f.sockets[0].open();
    f.s.close();
    give('tkt');
    await flush();
    expect(f.sockets[0].hellos()).toHaveLength(0);
  });

  it('without a ticket promise the hello goes on open, as before', () => {
    const f = setup();
    f.s.connect();
    f.sockets[0].open();
    expect(f.sockets[0].hellos()).toHaveLength(1);
  });
});

describe('PartySocket reconnect with a fresh ticket (SOCIAL-INVITES.md: the account survives a reconnect)', () => {
  const welcome = (w: FakeWs) => w.onmessage?.({ data: JSON.stringify({ t: 'welcome', proto: 8, member: 'm1', resumeToken: 'r'.repeat(24), serverMs: 0 }) });

  it('a reconnect after the ticket aged asks the host again and signs the new hello in with the fresh ticket', async () => {
    const f = setup();
    let asked = 0;
    f.s.refreshTicketsWith(async () => `fresh-${++asked}`);
    f.s.connect(Promise.resolve('first'));
    await flush();
    f.sockets[0].open();
    await flush();
    welcome(f.sockets[0]);
    // the phone sleeps past the ticket's 60 s life, the socket drops and comes back
    f.advance(TICKET_FRESH_MS + 20_000);
    f.sockets[0].close();
    f.advance(10_000);
    expect(f.sockets).toHaveLength(2);
    f.sockets[1].open();
    await flush();
    expect(asked).toBe(1);
    expect(f.sockets[1].hellos().map((h) => h.ticket)).toEqual(['fresh-1']);
  });

  it('a quick reconnect keeps the young ticket (no host call); a guest never asks for one', async () => {
    const f = setup();
    let asked = 0;
    f.s.refreshTicketsWith(async () => `fresh-${++asked}`);
    f.s.connect(Promise.resolve('first'));
    await flush();
    f.sockets[0].open();
    await flush();
    welcome(f.sockets[0]);
    f.sockets[0].close();
    f.advance(10_000);
    f.sockets[1].open();
    await flush();
    expect(asked).toBe(0);
    expect(f.sockets[1].hellos().map((h) => h.ticket)).toEqual(['first']);

    const g = setup();
    let guestAsked = 0;
    g.s.refreshTicketsWith(async () => `t${++guestAsked}`);
    g.s.connect(Promise.resolve(null));
    await flush();
    g.sockets[0].open();
    await flush();
    welcome(g.sockets[0]);
    g.advance(TICKET_FRESH_MS + 1);
    g.sockets[0].close();
    g.advance(10_000);
    g.sockets[1].open();
    await flush();
    expect(guestAsked).toBe(0);
    expect(g.sockets[1].hellos()[0].ticket).toBeUndefined();
  });

  it('a host that has no fresh ticket keeps the old one in the hello (the relay may still know it by the resume token)', async () => {
    const f = setup();
    f.s.refreshTicketsWith(async () => null);
    f.s.connect(Promise.resolve('first'));
    await flush();
    f.sockets[0].open();
    await flush();
    welcome(f.sockets[0]);
    f.advance(TICKET_FRESH_MS + 1);
    f.sockets[0].close();
    f.advance(10_000);
    f.sockets[1].open();
    await flush();
    expect(f.sockets[1].hellos().map((h) => h.ticket)).toEqual(['first']);
  });
});

describe('PartySocket: a quick reconnect whose held ticket another relay spent (§15 fleet nonce) signs in again', () => {
  const welcome = (w: FakeWs) => w.onmessage?.({ data: JSON.stringify({ t: 'welcome', proto: 9, member: 'm1', resumeToken: 'r'.repeat(24), serverMs: 0 }) });
  const badTicket = (w: FakeWs) => w.onmessage?.({ data: JSON.stringify({ t: 'error', code: 'bad_ticket' }) });

  it('bad_ticket then welcome: the guest welcome is not taken, a fresh ticket opens a new socket; once a minute at most', async () => {
    const f = setup();
    let asked = 0;
    const seen: string[] = [];
    f.s.listen({ json: (m) => seen.push(String((m as { code?: string }).code ?? m.t)) });
    f.s.refreshTicketsWith(async () => `fresh-${++asked}`);
    f.s.connect(Promise.resolve('first'));
    await flush();
    f.sockets[0].open();
    await flush();
    welcome(f.sockets[0]);
    // a quick reconnect lands on another relay: the young ticket is reused and refused there
    f.sockets[0].close();
    f.advance(10_000);
    f.sockets[1].open();
    await flush();
    expect(f.sockets[1].hellos().map((h) => h.ticket)).toEqual(['first']);
    badTicket(f.sockets[1]);
    welcome(f.sockets[1]);
    expect(f.sockets).toHaveLength(3);
    f.sockets[2].open();
    await flush();
    expect(asked).toBe(1);
    expect(f.sockets[2].hellos().map((h) => h.ticket)).toEqual(['fresh-1']);
    expect(seen.filter((x) => x === 'bad_ticket')).toEqual([]);
    // the same within a minute: shown as before, no second retry
    badTicket(f.sockets[2]);
    welcome(f.sockets[2]);
    expect(f.sockets).toHaveLength(3);
    expect(seen.filter((x) => x === 'bad_ticket')).toEqual(['bad_ticket']);
  });
});

describe('PartySocket: a signed-in first hello without a ticket is retried once (founder, 2026-11-20)', () => {
  const welcome = (w: FakeWs) => w.onmessage?.({ data: JSON.stringify({ t: 'welcome', proto: 8, member: 'm1', resumeToken: 'r'.repeat(24), serverMs: 0 }) });

  it('the host answered too late: the guest welcome is not taken; a fresh ticket signs a new socket in', async () => {
    const f = setup();
    let asked = 0;
    f.s.refreshTicketsWith(async () => `fresh-${++asked}`, () => true);
    // the first ticket never comes in time (the app's sign-in still starting)
    f.s.connect(new Promise<string | null>(() => undefined));
    f.sockets[0].open();
    f.advance(TICKET_WAIT_MS);
    await flush();
    expect(f.sockets[0].hellos().map((h) => h.ticket)).toEqual([undefined]);
    // a join the client sent meanwhile waits for the signed-in welcome
    f.s.sendJson({ t: 'mm.join', queue: 'casual', side: 'any' } as never);
    welcome(f.sockets[0]);
    expect(f.s.open).toBe(false);
    expect(f.sockets).toHaveLength(2);
    f.sockets[1].open();
    await flush();
    expect(asked).toBe(1);
    expect(f.sockets[1].hellos().map((h) => h.ticket)).toEqual(['fresh-1']);
    expect(f.sockets[0].sent.some((x) => typeof x === 'string' && x.includes('mm.join'))).toBe(false);
    welcome(f.sockets[1]);
    expect(f.s.open).toBe(true);
    expect(f.sockets[1].sent.some((x) => typeof x === 'string' && x.includes('mm.join'))).toBe(true);
  });

  it('once only, never for a guest, never after the first welcome', async () => {
    // the retry also misses: the second welcome counts (a guest for now, as before)
    const f = setup();
    let asked = 0;
    f.s.refreshTicketsWith(async () => (++asked, null), () => true);
    f.s.connect(Promise.resolve(null));
    await flush();
    f.sockets[0].open();
    await flush();
    welcome(f.sockets[0]);
    f.sockets[1].open();
    await flush();
    welcome(f.sockets[1]);
    expect(f.s.open).toBe(true);
    expect(f.sockets).toHaveLength(2);
    expect(asked).toBe(1);
    // a guest (not signed in) keeps its first welcome
    const g = setup();
    g.s.refreshTicketsWith(async () => 'never', () => false);
    g.s.connect(Promise.resolve(null));
    await flush();
    g.sockets[0].open();
    await flush();
    welcome(g.sockets[0]);
    expect(g.s.open).toBe(true);
    expect(g.sockets).toHaveLength(1);
  });
});
