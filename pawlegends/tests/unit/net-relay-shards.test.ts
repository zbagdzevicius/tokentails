/**
 * Relay shards (PROTO 9, docs/plans/moba/LIVE-MATCH-DEPLOYS.md §15): `relay_redirect {shard}` makes the socket dial
 * `…/pawlegends/ws/<shard>` at once (no backoff, no banner), with a fresh ticket when the old one was spent, and keeps
 * the shard for the tab. Redirects are bounded; a shard path that keeps failing gives way to the front door, and a
 * front door that keeps failing to the shards the API lists. A join that is redirected joins again after the welcome.
 */
import { describe, expect, it } from 'vitest';
import {
  MOVE_JITTER_MS,
  PartySocket,
  REDIRECT_MAX,
  SHARD_FAILS_MAX,
  type SocketEnv,
  type SocketLike,
} from '../../src/net/socket';
import { PROTO, PROTO_REDIRECT, WS_PATH, relayPath, shardOfPath, type ServerJson } from '../../src/net/proto';
import { initialParty, reduceParty, JOIN_RETRIES, type PartyState } from '../../src/party/partyClient';

class FakeWs implements SocketLike {
  readyState = 0;
  binaryType = '';
  sent: string[] = [];
  onopen: ((e: unknown) => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  constructor(readonly url: string) {}
  send(d: string | ArrayBufferLike | Uint8Array): void {
    if (typeof d === 'string') this.sent.push(d);
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

function setup(stored: Record<string, string> = {}) {
  let now = 0;
  const sockets: FakeWs[] = [];
  const timers: { at: number; fn: () => void; ms: number }[] = [];
  const kv = new Map(Object.entries(stored));
  const env: SocketEnv = {
    open: (url) => {
      const w = new FakeWs(url);
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
    store: { get: (k) => kv.get(k) ?? null, set: (k, v) => void kv.set(k, v), del: (k) => void kv.delete(k) },
  };
  const s = new PartySocket('wss://api.example/pawlegends/ws', { sim: 11, simHash: '0123456789abcdef', build: 'test' }, env);
  const fire = () => {
    const t = timers.splice(timers.length - 1, 1)[0];
    now = t.at;
    t.fn();
  };
  const flush = () => new Promise((r) => setTimeout(r, 0));
  return { s, sockets, timers, kv, fire, flush, last: () => sockets[sockets.length - 1], advance: (ms: number) => (now += ms) };
}

const welcome = (w: FakeWs) => w.json({ t: 'welcome', proto: PROTO, member: 'm1', resumeToken: 'tok', serverMs: 0 });
const redirect = (w: FakeWs, shard: string) => w.json({ t: 'error', code: 'relay_redirect', retryMs: 0, shard });

describe('relay shards: paths (PROTO 9)', () => {
  it('PROTO 9 names the redirect; a shard path and the front door', () => {
    expect(PROTO).toBeGreaterThanOrEqual(PROTO_REDIRECT);
    expect(relayPath('b')).toBe(`${WS_PATH}/b`);
    expect(relayPath(null)).toBe(WS_PATH);
    expect(relayPath('B/../x')).toBe(WS_PATH);
    expect(shardOfPath(WS_PATH)).toBe('');
    expect(shardOfPath(`${WS_PATH}/eu-2`)).toBe('eu-2');
    expect(shardOfPath(`${WS_PATH}/Bad`)).toBeNull();
    expect(shardOfPath('/pawlegends/wsx')).toBeNull();
    expect(shardOfPath('/other')).toBeNull();
  });
});

describe('relay shards: the socket follows a redirect (LIVE-MATCH-DEPLOYS.md §15)', () => {
  it('relay_redirect: hang up now, dial the shard path within the jitter, remember it for the tab', () => {
    const t = setup();
    t.s.connect();
    expect(t.last().url).toBe('wss://api.example/pawlegends/ws');
    t.last().open();
    redirect(t.last(), 'b');
    // the socket hangs up by itself (no wait for the relay's close)
    expect(t.sockets[0].readyState).toBe(3);
    const delay = t.timers[t.timers.length - 1].ms;
    expect(delay).toBeLessThanOrEqual(MOVE_JITTER_MS);
    t.fire();
    expect(t.last().url).toBe('wss://api.example/pawlegends/ws/b');
    expect(t.kv.get('pl.party.relay')).toBe('b');
  });

  it('a reload dials the remembered shard; a bad stored name is ignored', () => {
    const good = setup({ 'pl.party.relay': 'b' });
    good.s.connect();
    expect(good.last().url).toBe('wss://api.example/pawlegends/ws/b');
    const bad = setup({ 'pl.party.relay': '../evil' });
    bad.s.connect();
    expect(bad.last().url).toBe('wss://api.example/pawlegends/ws');
  });

  it('a redirect after a welcome fetches a fresh ticket (the old one is spent on every relay)', async () => {
    const t = setup();
    let asked = 0;
    t.s.refreshTicketsWith(async () => {
      asked++;
      return `fresh-${asked}`;
    });
    t.s.connect(Promise.resolve('first'));
    await t.flush();
    t.last().open();
    await t.flush();
    expect(JSON.parse(t.last().sent[0]).ticket).toBe('first');
    welcome(t.last());
    redirect(t.last(), 'b');
    t.fire();
    t.last().open();
    await t.flush();
    await t.flush();
    expect(asked).toBe(1);
    expect(JSON.parse(t.last().sent[0]).ticket).toBe('fresh-1');
  });

  it('a redirect before any welcome keeps the unspent ticket', async () => {
    const t = setup();
    let asked = 0;
    t.s.refreshTicketsWith(async () => {
      asked++;
      return 'fresh';
    });
    t.s.connect(Promise.resolve('first'));
    await t.flush();
    t.last().open();
    await t.flush();
    redirect(t.last(), 'b');
    t.fire();
    t.last().open();
    await t.flush();
    expect(asked).toBe(0);
    expect(JSON.parse(t.last().sent[0]).ticket).toBe('first');
  });

  it(`more than ${REDIRECT_MAX} redirects within 30 s: back to the front door (two relays never ping-pong a player)`, () => {
    const t = setup();
    t.s.connect();
    for (let i = 0; i < REDIRECT_MAX; i++) {
      t.last().open();
      redirect(t.last(), i % 2 ? 'a' : 'b');
      t.fire();
      expect(t.last().url).toMatch(/\/pawlegends\/ws\/[ab]$/);
    }
    t.last().open();
    redirect(t.last(), 'b');
    t.fire();
    expect(t.last().url).toBe('wss://api.example/pawlegends/ws');
  });

  it(`a shard path that fails ${SHARD_FAILS_MAX} times before a welcome: the front door; then the shards the API lists`, async () => {
    const t = setup({ 'pl.party.relay': 'b' });
    let asked = 0;
    t.s.discoverWith(async () => {
      asked++;
      return ['c', 'Bad!'];
    });
    t.s.connect();
    for (let i = 0; i < SHARD_FAILS_MAX; i++) {
      expect(t.last().url).toBe('wss://api.example/pawlegends/ws/b');
      t.last().closeWith(1006);
      t.fire();
    }
    expect(t.last().url).toBe('wss://api.example/pawlegends/ws');
    expect(asked).toBe(1);
    await t.flush();
    for (let i = 0; i < SHARD_FAILS_MAX; i++) {
      expect(t.last().url).toBe('wss://api.example/pawlegends/ws');
      t.last().closeWith(1006);
      t.fire();
    }
    // the front door's relay is down: the listed shard (an invalid name is dropped)
    expect(t.last().url).toBe('wss://api.example/pawlegends/ws/c');
    t.last().open();
    welcome(t.last());
    expect(t.kv.get('pl.party.relay')).toBe('c');
  });

  it('a planned move on a shard path (1012, 4013) never counts as a failed path', () => {
    const t = setup({ 'pl.party.relay': 'b' });
    t.s.connect();
    for (let i = 0; i < 4; i++) {
      t.last().closeWith(i % 2 ? 4013 : 1012);
      t.fire();
    }
    expect(t.last().url).toBe('wss://api.example/pawlegends/ws/b');
  });

  it('close(forget) forgets the shard with the resume token', () => {
    const t = setup({ 'pl.party.relay': 'b' });
    t.s.connect();
    t.s.close(true);
    expect(t.kv.has('pl.party.relay')).toBe(false);
  });
});

describe('relay shards: the party client keeps its request across a redirect', () => {
  const server = (s: PartyState, m: object) => reduceParty(s, { e: 'server', m: m as ServerJson });

  it('a join redirected to the shard holding the party joins again after the new welcome, bounded', () => {
    let s = initialParty('join', 'K7QX2M', 'any', 'coop');
    s = server(s, { t: 'welcome', proto: PROTO, member: 'a', resumeToken: 't', serverMs: 0 }).state;
    let r = reduceParty(s, { e: 'decide' });
    expect(r.effects).toContainEqual({ t: 'send', msg: { t: 'party.join', code: 'K7QX2M' } });
    s = r.state;
    r = server(s, { t: 'error', code: 'relay_redirect', retryMs: 0, shard: 'b' });
    // no error on the code screen, the join is still in flight
    expect(r.state.error).toBeNull();
    expect(r.state.joining).toBe('K7QX2M');
    s = server(r.state, { t: 'welcome', proto: PROTO, member: 'a2', resumeToken: 't2', serverMs: 0 }).state;
    r = reduceParty(s, { e: 'decide' });
    expect(r.effects).toContainEqual({ t: 'send', msg: { t: 'party.join', code: 'K7QX2M' } });
    // bounded like party_elsewhere
    s = r.state;
    for (let i = 0; i < JOIN_RETRIES; i++) s = server(s, { t: 'error', code: 'relay_redirect', retryMs: 0, shard: 'b' }).state;
    s = server(s, { t: 'error', code: 'relay_redirect', retryMs: 0, shard: 'b' }).state;
    expect(s.error?.code).toBe('party_unreachable');
  });

  it('a queued search redirected to the lease holder searches again after the new welcome', () => {
    let s = initialParty('queue', null, 'any', 'coop');
    s = server(s, { t: 'welcome', proto: PROTO, member: 'a', resumeToken: 't', serverMs: 0 }).state;
    const r = server(s, { t: 'error', code: 'relay_redirect', retryMs: 0, shard: 'b' });
    expect(r.effects).toEqual([]);
    const again = server(r.state, { t: 'welcome', proto: PROTO, member: 'a2', resumeToken: 't2', serverMs: 0 });
    expect(again.effects.some((f) => f.t === 'send' && f.msg.t === 'mm.join')).toBe(true);
  });
});
