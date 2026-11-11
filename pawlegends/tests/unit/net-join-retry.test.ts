/**
 * LIVE-MATCH-DEPLOYS.md §14: a party code that lives on another relay (two backend instances, or a deploy overlap) is
 * never a dead-end "No party with that code". `party_elsewhere` reconnects and joins again (bounded), `party_not_found`
 * tries a fresh connection a couple of times, a seat the relay forgot mid-match asks for itself back by the party code,
 * and a match whose relay never comes back leaves the frozen screen after MATCH_LOST_MS with a clear message.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MOVE_JITTER_MS, PartySocket, type SocketEnv, type SocketLike, type SocketListener } from '../../src/net/socket';
import { MATCH_LOST_MS, NetHost, QUIET_RECONNECT_MS, RECONNECT_NOTE_EVERY_MS, type NetNote } from '../../src/net/net-host';
import type { MatchMsg, PartyView, ServerJson } from '../../src/net/proto';
import {
  JOIN_NOT_FOUND_RETRIES,
  JOIN_RETRIES,
  initialParty,
  reduceParty,
  screenOf,
  type PartyEffect,
  type PartyEvent,
  type PartyState,
} from '../../src/party/partyClient';
import { errorText } from '../../src/party/ui/copy';

const view = (over: Partial<PartyView> = {}): PartyView => ({
  t: 'party',
  code: 'K7QX2M',
  phase: 'match',
  leader: 'a',
  difficulty: 'easy',
  openSeats: false,
  locked: false,
  members: [
    { id: 'a', name: 'Sunny Tabby', guest: false, conn: 'on' },
    { id: 'b', name: 'Brave Sage', guest: true, conn: 'on' },
  ],
  you: 'a',
  ...over,
});
const welcome = (member = 'a', proto = 4): ServerJson => ({ t: 'welcome', proto, member, resumeToken: `tok-${member}`, serverMs: 0 });
const err = (code: string, retryMs?: number) => ({ t: 'error', code, ...(retryMs !== undefined ? { retryMs } : {}) }) as unknown as ServerJson;

function run(s: PartyState, ...evs: (ServerJson | PartyEvent)[]): { s: PartyState; fx: PartyEffect[] } {
  const fx: PartyEffect[] = [];
  for (const e of evs) {
    const r = reduceParty(s, 'e' in e ? e : { e: 'server', m: e });
    s = r.state;
    fx.push(...r.effects);
  }
  return { s, fx };
}
const sends = (fx: PartyEffect[]) => fx.filter((f) => f.t === 'send').map((f) => (f as { msg: Record<string, unknown> }).msg);
const decide: PartyEvent = { e: 'decide' };

describe('a join whose party is on another relay (§14)', () => {
  it('party_elsewhere: stays on "Joining", the reconnect sends the same join again', () => {
    let { s, fx } = run(initialParty('code'), welcome(), decide, { e: 'join', code: 'ABCDEF' });
    expect(sends(fx)).toEqual([{ t: 'party.join', code: 'ABCDEF' }]);
    ({ s, fx } = run(s, err('party_elsewhere', 1000)));
    expect(fx).toEqual([]); // the socket reconnects by itself (a planned move)
    expect(screenOf(s)).toBe('connecting');
    expect(s.joinTries).toBe(1);
    ({ s, fx } = run(s, welcome('c'), decide));
    expect(sends(fx)).toEqual([{ t: 'party.join', code: 'ABCDEF' }]);
    ({ s } = run(s, view({ phase: 'lobby', you: 'c' })));
    expect(screenOf(s)).toBe('lobby');
    expect(s.joining).toBeNull();
    expect(s.joinTries).toBe(0);
  });

  it('party_elsewhere is bounded: after JOIN_RETRIES the code screen says the party could not be reached', () => {
    let { s } = run(initialParty('code'), welcome(), decide, { e: 'join', code: 'ABCDEF' });
    for (let i = 0; i < JOIN_RETRIES; i++) {
      s = run(s, err('party_elsewhere', 1000)).s;
      expect(screenOf(s)).toBe('connecting');
      s = run(s, welcome(`m${i}`), decide).s;
    }
    s = run(s, err('party_elsewhere', 1000)).s;
    expect(s.error?.code).toBe('party_unreachable');
    expect(s.joining).toBeNull();
    expect(screenOf(s)).toBe('joincode');
    expect(errorText('party_unreachable')).toMatch(/Could not reach that party/);
    // no more joins after the give-up, whatever reconnects later
    expect(sends(run(s, welcome('late'), decide).fx)).toEqual([]);
  });

  it('a link join gives up on the ended screen, not a spinner', () => {
    let { s } = run(initialParty('join', 'K7QX2M'), welcome(), decide);
    expect(s.joining).toBe('K7QX2M');
    for (let i = 0; i <= JOIN_RETRIES; i++) s = run(s, err('party_elsewhere', 1000), welcome(`m${i}`), decide).s;
    expect(screenOf(s)).toBe('ended');
    expect(s.error?.code).toBe('party_unreachable');
  });

  it('party_not_found: JOIN_NOT_FOUND_RETRIES fresh connections, then "No party with that code"', () => {
    let { s } = run(initialParty('join', 'K7QX2M'), welcome(), decide);
    for (let i = 0; i < JOIN_NOT_FOUND_RETRIES; i++) {
      const r = run(s, err('party_not_found'));
      expect(r.fx.map((f) => f.t)).toEqual(['reconnect']);
      expect(screenOf(r.s)).toBe('connecting');
      s = run(r.s, welcome(`m${i}`), decide).s;
    }
    const r = run(s, err('party_not_found'));
    expect(r.fx).toEqual([]);
    expect(screenOf(r.s)).toBe('ended');
    expect(errorText('party_not_found')).toMatch(/^No party with that code/);
  });

  it('party_ended is final at once (no retries for a code that ended everywhere)', () => {
    const { s, fx } = run(initialParty('join', 'K7QX2M'), welcome(), decide, err('party_ended'));
    expect(fx.some((f) => f.t === 'reconnect')).toBe(false);
    expect(screenOf(s)).toBe('ended');
  });
});

describe('a seat the relay forgot mid-match (§14)', () => {
  const inMatch = (): PartyState => ({ ...run(initialParty('join', 'K7QX2M'), welcome(), decide, view({ phase: 'match' })).s, inMatch: true });

  it('a welcome as someone new asks for the seat back by the party code; the adopt welcome binds it again', () => {
    let { s, fx } = run(inMatch(), welcome('stranger-id'));
    expect(s.inMatch).toBe(true);
    expect(s.rejoin).toBe(true);
    expect(fx).toEqual([{ t: 'decide-later' }]);
    ({ s, fx } = run(s, decide));
    expect(sends(fx)).toEqual([{ t: 'party.join', code: 'K7QX2M' }]);
    // the relay's adopt: a welcome for our own member, then the party and the match frame
    ({ s, fx } = run(s, welcome('a'), view({ phase: 'match' })));
    expect(s.inMatch).toBe(true);
    expect(s.rejoin).toBe(false);
    expect(s.joining).toBeNull();
    expect(fx.some((f) => f.t === 'seat-taken')).toBe(false);
  });

  it('the party is on another relay: party_elsewhere keeps the match screen while it retries', () => {
    let { s } = run(inMatch(), welcome('x1'), decide);
    ({ s } = run(s, err('party_elsewhere', 1000)));
    expect(s.inMatch).toBe(true);
    ({ s } = run(s, welcome('x2')));
    expect(s.joinTries).toBe(1); // the count carries over the reconnect
    expect(sends(run(s, decide).fx)).toEqual([{ t: 'party.join', code: 'K7QX2M' }]);
  });

  it('a party that ended meanwhile leaves the match with "The match ended while you were away"', () => {
    const { s, fx } = run(inMatch(), welcome('x1'), decide, err('party_ended'));
    expect(s.inMatch).toBe(false);
    expect(fx).toContainEqual({ t: 'seat-taken' });
    expect(screenOf(s)).toBe('ended');
    expect(s.error?.code).toBe('room_over');
  });

  it('seat_taken right after the new welcome: no join goes out (the seat was given away on purpose)', () => {
    const { s, fx } = run(inMatch(), welcome('x1'), err('seat_taken'), decide);
    expect(sends(fx)).toEqual([]);
    expect(s.error?.code).toBe('seat_taken');
  });

  it('a Quick Play stranger (no code) asks with mm.back', () => {
    const base = inMatch();
    const s0 = { ...base, view: view({ code: '', mm: { side: 'cat' } as never }) };
    const { fx } = run(s0, welcome('x1'), decide);
    expect(sends(fx)).toEqual([{ t: 'mm.back' }]);
  });

  it('`lost` (the watchdog gave up) leaves the match with its own message; nothing joins by itself afterwards', () => {
    const { s, fx } = run(inMatch(), { e: 'lost' }, welcome('late'), decide);
    expect(fx).toContainEqual({ t: 'seat-taken' });
    expect(screenOf(s)).toBe('ended');
    expect(s.error?.code).toBe('match_lost');
    expect(errorText('match_lost')).toBe('Lost the connection to the match');
    expect(sends(fx)).toEqual([]);
  });
});

class FakeWs implements SocketLike {
  readyState = 0;
  binaryType = '';
  sent: string[] = [];
  onopen: ((e: unknown) => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  send(d: string | ArrayBufferLike | Uint8Array): void {
    if (typeof d === 'string') this.sent.push(d);
  }
  close(code = 1006): void {
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

function socketSetup() {
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
  const fire = () => {
    const t = timers.splice(timers.length - 1, 1)[0];
    now = t.at;
    t.fn();
  };
  return { s, sockets, timers, fire, last: () => sockets[sockets.length - 1], delay: () => timers[timers.length - 1]?.ms };
}

describe('the socket on a join retry (§14)', () => {
  it('party_elsewhere + close 4013: back after retryMs plus jitter, on a new connection with the same resume token', () => {
    const t = socketSetup();
    t.s.connect();
    t.last().open();
    t.last().json({ t: 'welcome', proto: 4, member: 'm1', resumeToken: 'tok-1', serverMs: 0 });
    t.last().json({ t: 'error', code: 'party_elsewhere', retryMs: 1000 });
    t.last().close(4013);
    expect(t.delay()).toBeGreaterThanOrEqual(1000);
    expect(t.delay()).toBeLessThanOrEqual(1000 + MOVE_JITTER_MS);
    t.fire();
    expect(t.sockets.length).toBe(2);
    t.last().open();
    const hello = JSON.parse(t.last().sent[0]);
    expect(hello.resume).toEqual({ token: 'tok-1' });
  });

  it('bounce(): a fresh connection after the given delay (the party client asks for it on party_not_found)', () => {
    const t = socketSetup();
    t.s.connect();
    t.last().open();
    t.last().json({ t: 'welcome', proto: 4, member: 'm1', resumeToken: 'tok-1', serverMs: 0 });
    t.s.bounce(800);
    expect(t.delay()).toBeGreaterThanOrEqual(800);
    expect(t.delay()).toBeLessThanOrEqual(800 + MOVE_JITTER_MS);
    t.fire();
    expect(t.sockets.length).toBe(2);
  });
});

describe('a match whose relay does not come back (§14)', () => {
  afterEach(() => vi.useRealTimers());

  function host() {
    vi.useFakeTimers();
    let listener: SocketListener = {};
    let open = false;
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
    let lost = 0;
    const h = new NetHost(socket as never, match, {
      visibility: false,
      now: () => Date.now(),
      notify: (n) => notes.push(n),
      lost: () => lost++,
      makeWorker: () => ({ post: () => undefined, close: () => undefined }),
    });
    return {
      h,
      notes,
      lost: () => lost,
      drop: () => {
        open = false;
        listener.state?.('reconnecting');
      },
      reopen: () => {
        open = true;
        listener.state?.('open');
      },
      bind: () => listener.json?.(match as unknown as ServerJson),
      reconnecting: () => notes.filter((n) => n.title === 'Reconnecting…').length,
    };
  }

  it('keeps "Reconnecting…" on screen while the socket is down, then gives up once after MATCH_LOST_MS', () => {
    const t = host();
    t.drop();
    vi.advanceTimersByTime(QUIET_RECONNECT_MS + 100);
    expect(t.reconnecting()).toBe(1);
    vi.advanceTimersByTime(RECONNECT_NOTE_EVERY_MS * 3);
    expect(t.reconnecting()).toBeGreaterThanOrEqual(3);
    expect(t.lost()).toBe(0);
    vi.advanceTimersByTime(MATCH_LOST_MS);
    expect(t.lost()).toBe(1);
    vi.advanceTimersByTime(MATCH_LOST_MS);
    expect(t.lost()).toBe(1);
    t.h.dispose();
  });

  it('an open socket that never gets its seat back (a relay that forgot it) also ends in the give-up', () => {
    const t = host();
    t.drop();
    vi.advanceTimersByTime(500);
    t.reopen(); // welcomed, but no `match` for this room and no turns
    vi.advanceTimersByTime(MATCH_LOST_MS + 2000);
    expect(t.lost()).toBe(1);
    t.h.dispose();
  });

  it('a seat bound again (its `match` frame) resets the clock: no give-up for drops that each recover', () => {
    const t = host();
    for (let i = 0; i < 4; i++) {
      t.drop();
      vi.advanceTimersByTime(MATCH_LOST_MS / 2);
      t.reopen();
      t.bind();
      vi.advanceTimersByTime(1000);
    }
    expect(t.lost()).toBe(0);
    t.h.dispose();
  });
});
