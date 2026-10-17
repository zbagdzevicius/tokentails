import { describe, expect, it, vi } from 'vitest';
import { NO_INPUT, SIM_VERSION, type OnlineSession, type RunResult, type Store, type TickInput } from '../types';
import { createOnline, KEY_RANK_QUEUE, LIVE_ROUTE, NO_FEATURES } from './index';
import { authOriginFor, parseSession, type AuthBridge } from './auth';
import { accessToken, sanitizeBase } from './http';
import { importFromYourcat } from './yourcat';
import { urlBase64ToBytes } from './push';

const TOKEN = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ4In0.c2ln';
const API = 'https://api.tokentails.com';
const ALL_ON = {
  enabled: true,
  accounts: true,
  scores: true,
  boards: true,
  shortLinks: true,
  feed: true,
  meter: true,
  push: true,
  streakEmail: true,
  creatorDashboard: true,
};

function memStore(): Store & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>();
  return {
    data,
    persistent: true,
    get: <T>(k: string, fb: T) => (data.has(k) ? (data.get(k) as T) : fb),
    set: <T>(k: string, v: T) => (data.set(k, v), true),
  };
}

function fakeBridge(token: string | null = TOKEN): AuthBridge & { signedInAs: OnlineSession | null } {
  return {
    signedInAs: { signedIn: !!token, guest: false, verified: true },
    session() {
      return this.signedInAs;
    },
    onSession: () => () => undefined,
    token: async () => token,
    signIn: vi.fn(),
    signOut: vi.fn(async () => undefined),
    dispose: () => undefined,
  };
}

type Route = (init: RequestInit & { headers?: Record<string, string> }) => { status: number; body?: unknown };

function fakeFetch(routes: Record<string, Route>) {
  const calls: { url: string; init: RequestInit & { headers?: Record<string, string> } }[] = [];
  const f = vi.fn(async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init: init as never });
    const path = url.replace(API, '');
    const key = `${init.method ?? 'GET'} ${path.split('?')[0]}`;
    const route = routes[key];
    const res = route ? route(init as never) : { status: 404, body: { code: 'BADCAT_NOT_FOUND' } };
    return new Response(res.body === undefined ? '' : JSON.stringify(res.body), { status: res.status });
  });
  return { f, calls };
}

const run = (over: Partial<RunResult> = {}): RunResult =>
  ({
    roomId: 'daily-005',
    dayNo: 5,
    mode: 'ranked',
    simVersion: SIM_VERSION,
    score: 1234,
    stamp: 'clean',
    rank: 'Menace',
    maxCombo: 3,
    seenCount: 0,
    targets: 2,
    framed: 0,
    ticks: 40,
    timeline: '',
    inputs: [...Array.from({ length: 30 }, (): TickInput => ({ dir: 1, speed: 2, buttons: 0 })), ...Array.from({ length: 10 }, () => NO_INPUT)],
    events: [],
    finalHash: 0xdeadbeef,
    ...over,
  }) as RunResult;

const LOC = { origin: 'https://tokentails.com', hostname: 'tokentails.com', href: 'https://tokentails.com/badcat' };

function online(routes: Record<string, Route>, opts: { raw?: Record<string, string>; bridge?: AuthBridge | null; store?: Store } = {}) {
  const { f, calls } = fakeFetch({ 'GET /badcat/status': () => ({ status: 200, body: ALL_ON }), ...routes });
  const store = opts.store ?? memStore();
  const api = createOnline({
    env: { apiUrl: API, dev: false },
    store,
    raw: opts.raw ?? {},
    fetch: f as never,
    bridge: opts.bridge === undefined ? fakeBridge() : opts.bridge,
    location: LOC,
    now: () => 1_800_000_000_000,
  });
  return { api, calls, store };
}

describe('online services without an API origin', () => {
  it('makes zero requests without a (valid) API url', async () => {
    const f = vi.fn();
    for (const deps of [
      { env: { apiUrl: null, dev: false }, raw: {} },
      { env: { apiUrl: 'http://evil.example', dev: false }, raw: {} },
    ]) {
      const api = createOnline({ ...deps, store: memStore(), fetch: f as never, location: LOC });
      expect(api.enabled).toBe(false);
      expect(await api.features()).toEqual(NO_FEATURES);
      expect(await api.submitRanked(run(), {})).toEqual({ status: 'off' });
      expect(await api.board(5)).toBeNull();
      expect(await api.shorten('https://tokentails.com/badcat/d/5?g=x', { kind: 'dare' })).toBe('https://tokentails.com/badcat/d/5?g=x');
      expect(await api.meter()).toBeNull();
      expect(await api.push.subscribe(9)).toBe(false);
    }
    expect(f).not.toHaveBeenCalled();
  });

  it('is on with just an API url (no game-side switch)', () => {
    const api = createOnline({ env: { apiUrl: API, dev: false }, raw: {}, store: memStore(), fetch: vi.fn() as never, location: LOC });
    expect(api.enabled).toBe(true);
  });

  it('keeps every server feature off when the server says so', async () => {
    const { api, calls } = online({ 'GET /badcat/status': () => ({ status: 200, body: { enabled: true } }) });
    expect(await api.features()).toEqual({ ...NO_FEATURES, livePinkPaw: true });
    expect(await api.submitRanked(run(), {})).toEqual({ status: 'off' });
    expect(await api.feed('new')).toBeNull();
    expect(calls.map((c) => c.url)).toEqual([`${API}/badcat/status`]);
  });
});

describe('ranked saves (the one score route)', () => {
  it('posts the input log with the fb accesstoken and reads the rank', async () => {
    let body: Record<string, unknown> | null = null;
    const { api, calls } = online({
      [`POST ${LIVE_ROUTE}`]: (init) => {
        body = JSON.parse(String(init.body));
        return { status: 201, body: { dayNo: 5, score: 1234, stamp: 'clean', rank: 'Menace', ticks: 40, finalHash: 1, level: 'd5' } };
      },
      'GET /badcat/board/5/me': () => ({ status: 200, body: { dayNo: 5, saved: true, guest: false, rank: 7 } }),
    });
    const out = await api.submitRanked(run(), { catCode: 'AbCdEfGhIjKlMnOpQr', name: 'Mochi' });
    expect(out).toMatchObject({ status: 'saved', rank: 7 });
    expect(body).toEqual({
      type: 'BAD_CAT',
      platform: 'web',
      badcat: { dayNo: 5, simVersion: SIM_VERSION, runs: [[1, 2, 0, 30], [0, 0, 0, 10]], finalHash: 0xdeadbeef, score: 1234, catCode: 'AbCdEfGhIjKlMnOpQr', name: 'Mochi' },
    });
    const live = calls.find((c) => c.url.endsWith(LIVE_ROUTE))!;
    expect(live.init.headers?.accesstoken).toBe(`fb${TOKEN}`);
    expect(live.init.credentials).toBe('omit');
  });

  it('queues a run while signed out or offline and flushes it later', async () => {
    const store = memStore();
    let up = false;
    const bridge = fakeBridge(null);
    const { api } = online(
      { [`POST ${LIVE_ROUTE}`]: () => (up ? { status: 201, body: { dayNo: 5, score: 1, stamp: 'clean', rank: 'x', ticks: 1, finalHash: 1, level: 'd5' } } : { status: 503 }) },
      { bridge, store },
    );
    expect(await api.submitRanked(run(), {})).toEqual({ status: 'signed_out' });
    expect((store.data.get(KEY_RANK_QUEUE) as unknown[]).length).toBe(1);
    (bridge as { token: () => Promise<string | null> }).token = async () => TOKEN;
    expect(await api.flushRanked()).toBe(0);
    expect((store.data.get(KEY_RANK_QUEUE) as unknown[]).length).toBe(1);
    up = true;
    expect(await api.flushRanked()).toBe(1);
    expect(store.data.get(KEY_RANK_QUEUE)).toEqual([]);
  });

  it('maps the server codes', async () => {
    const answers: Record<string, { status: number; body?: unknown }> = {
      duplicate: { status: 409, body: { code: 'BADCAT_DUPLICATE' } },
      already: { status: 409, body: { code: 'BADCAT_ALREADY_RANKED' } },
      stale_sim: { status: 400, body: { code: 'BADCAT_SIM_VERSION' } },
      closed: { status: 400, body: { code: 'BADCAT_DAY_CLOSED' } },
      rejected: { status: 400, body: { code: 'BADCAT_TRAILING_INPUT' } },
      signed_out: { status: 428 },
    };
    for (const [status, answer] of Object.entries(answers)) {
      const store = memStore();
      const { api } = online({ [`POST ${LIVE_ROUTE}`]: () => answer }, { store });
      expect(await api.submitRanked(run(), {})).toEqual({ status });
      const queued = ((store.data.get(KEY_RANK_QUEUE) as unknown[]) ?? []).length;
      expect({ status, queued }).toEqual({ status, queued: status === 'stale_sim' || status === 'signed_out' ? 1 : 0 });
    }
  });

  it('never saves practice, FTUE or zero-score runs', async () => {
    const { api, calls } = online({});
    expect(await api.submitRanked(run({ mode: 'practice' }), {})).toEqual({ status: 'off' });
    expect(await api.submitRanked(run({ score: 0 }), {})).toEqual({ status: 'rejected' });
    expect(calls.some((c) => c.url.endsWith(LIVE_ROUTE))).toBe(false);
  });
});

describe('boards, links, feed, meter, Pink Paw, /yourcat', () => {
  it('reads the board and shortens only /badcat links', async () => {
    const { api } = online({
      'GET /badcat/board/5': () => ({ status: 200, body: { dayNo: 5, label: 'Kitchen #5', rows: [], updatedAt: 'x' } }),
      'POST /badcat/link': () => ({ status: 200, body: { id: 'Ab3dEf7h', url: 'https://api.tokentails.com/badcat/s/Ab3dEf7h' } }),
    });
    expect((await api.board(5))?.label).toBe('Kitchen #5');
    expect(await api.shorten('https://tokentails.com/badcat/d/5?g=x', { kind: 'dare', score: 9 })).toBe('https://api.tokentails.com/badcat/s/Ab3dEf7h');
    expect(await api.shorten('https://tokentails.com/badcat-game/index.html#d=5', { kind: 'dare' })).toBe('https://tokentails.com/badcat-game/index.html#d=5');
  });

  it('publishes a room with its clear run and lists the feed', async () => {
    let sent: unknown = null;
    const { api } = online({
      'POST /badcat/room': (init) => ((sent = JSON.parse(String(init.body))), { status: 200, body: { id: 'Ab3dEf7h', url: 'u', status: 'pending', feed: true } }),
      'GET /badcat/feed': () => ({ status: 200, body: { rooms: [] } }),
      'POST /badcat/room/Ab3dEf7h/report': () => ({ status: 200, body: { ok: true } }),
    });
    expect((await api.publishRoom('CODE', [[1, 2, 0, 5]], true))?.status).toBe('pending');
    expect(sent).toEqual({ code: 'CODE', clear: [[1, 2, 0, 5]], feed: true });
    expect(await api.feed('top')).toEqual({ rooms: [] });
    expect(await api.reportRoom('Ab3dEf7h')).toBe(true);
    expect(await api.reportRoom('../../x')).toBe(false);
  });

  it('parses the live meter and Pink Paw statuses', async () => {
    const { api } = online(
      {
        'GET /badcat/meter': () => ({ status: 200, body: { month: '2026-11', cents: 500, currency: 'usd', collars: 1, updated: '2026-11-20' } }),
        'GET /shelter/rozine-pedute/gallery': () => ({
          status: 200,
          body: { atShelter: [{ id: '6992227d890a12f52a317e22', status: 'WAITING' }], adopted: [{ id: '69a5341d3ee4d7b657941bb8', status: 'ADOPTED' }, { id: 'bad' }] },
        }),
      },
    );
    expect(await api.meter()).toEqual({ month: '2026-11', cents: 500, currency: 'usd', collars: 1, updated: '2026-11-20' });
    expect(await api.pinkPaw()).toEqual({ '6992227d890a12f52a317e22': 'WAITING', '69a5341d3ee4d7b657941bb8': 'ADOPTED' });
    const off = online({});
    expect(await off.api.pinkPaw()).toBeNull();
  });

  it('imports a /yourcat family as a toon coat', async () => {
    const { api } = online(
      {
        'GET /yourcat/me': () => ({
          status: 200,
          body: { item: { family: 'YELLOW', familyLabel: 'Ginger', named: true, name: 'Mochi', avatar: { status: 'ready', url: 'https://cdn.example/a.png' } } },
        }),
      },
    );
    const imp = await api.yourcat();
    expect(imp).toMatchObject({ spec: { pattern: 'tabby' }, name: 'Mochi', familyLabel: 'Ginger', avatarUrl: 'https://cdn.example/a.png' });
    expect(importFromYourcat({ family: 'NOPE' })).toBeNull();
  });
});

describe('helpers', () => {
  it('picks the auth origin', () => {
    expect(authOriginFor(undefined, LOC, false)).toBe('https://tokentails.com');
    expect(authOriginFor(undefined, { origin: 'http://localhost:5174', hostname: 'localhost' }, true)).toBeNull();
    expect(authOriginFor('http://localhost:3000', { origin: 'http://localhost:5174', hostname: 'localhost' }, true)).toBe('http://localhost:3000');
    expect(authOriginFor('http://evil.example', LOC, true)).toBeNull();
  });

  it('checks bases, tokens and session messages', () => {
    expect(sanitizeBase('https://api.tokentails.com/')).toBe('https://api.tokentails.com');
    expect(sanitizeBase('http://localhost:3005', false)).toBeNull();
    expect(sanitizeBase('http://localhost:3005', true)).toBe('http://localhost:3005');
    expect(accessToken(TOKEN)).toBe(`fb${TOKEN}`);
    expect(accessToken('not a jwt')).toBeNull();
    expect(parseSession({ channel: 'tt-badcat-auth', type: 'session', signedIn: true, guest: false, verified: true })).toEqual({ signedIn: true, guest: false, verified: true });
    expect(parseSession({ channel: 'other', type: 'session' })).toBeNull();
    expect(Array.from(urlBase64ToBytes('AQID'))).toEqual([1, 2, 3]);
  });
});
