/** Test helpers for src/money (no network, no browser). */
import type { AnalyticsEvent, AnalyticsProps, EnvInfo, Entitlements, Store } from '../types';
import type { MoneyDeps } from './core';

export function memStore(): Store & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>();
  return {
    data,
    persistent: true,
    get<T>(k: string, fb: T): T {
      return data.has(k) ? (JSON.parse(JSON.stringify(data.get(k))) as T) : fb;
    },
    set<T>(k: string, v: T): boolean {
      data.set(k, JSON.parse(JSON.stringify(v)));
      return true;
    },
  };
}

export function fakeEnv(over: Partial<EnvInfo> = {}): EnvInfo {
  return {
    isIOS: false,
    isAndroid: false,
    isTouch: false,
    inApp: 'none',
    dev: false,
    qa: false,
    presaleUrl: null,
    shortUrl: 'tokentails.com/badcat',
    canShareFiles: false,
    webcodecs: false,
    audioEncoder: false,
    apiUrl: 'https://api.test',
    clubUi: true,
    ...over,
  };
}

export interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
  credentials?: string;
}

export type Responder = (url: string, body: unknown, method: string) => { status?: number; json?: unknown } | undefined;

export const ALL_ON = { enabled: true, checkout: true, cameos: true, gifts: true, restoreEmail: true, faceUploads: true, creatorCodes: true, brand: true, testMode: true, foundingLeft: 37 };

export function fakeFetch(respond: Responder): { fetch: (u: string, i?: RequestInit) => Promise<Response>; calls: Call[] } {
  const calls: Call[] = [];
  const f = async (url: string, init: RequestInit = {}): Promise<Response> => {
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries((init.headers ?? {}) as Record<string, string>)) headers[k.toLowerCase()] = v;
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
    const method = init.method ?? 'GET';
    calls.push({ url, method, headers, body, credentials: init.credentials as string | undefined });
    const path = url.replace(/^https:\/\/api\.test/, '');
    let r = respond(path, body, method);
    if (!r && path.startsWith('/badcat/status')) r = { json: ALL_ON };
    const status = r?.status ?? (r ? 200 : 404);
    return new Response(r?.json === undefined ? '' : JSON.stringify(r.json), { status, headers: { 'content-type': 'application/json' } });
  };
  return { fetch: f, calls };
}

export function makeToken(e: Partial<Entitlements>): string {
  const payload = { club: false, skus: [], cosmetics: [], maxCats: 1, freezesPerWeek: 1, archiveDays: 14, seasonTiers: 15, expiresAt: 0, source: 'server', ...e };
  const b64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64}.c2lnbmF0dXJl`;
}

export interface Harness {
  deps: MoneyDeps;
  store: ReturnType<typeof memStore>;
  events: { e: AnalyticsEvent; p?: AnalyticsProps }[];
  assigned: string[];
  clock: { t: number };
}

export function harness(over: Partial<MoneyDeps> = {}, env: Partial<EnvInfo> = {}): Harness {
  const store = memStore();
  const events: { e: AnalyticsEvent; p?: AnalyticsProps }[] = [];
  const assigned: string[] = [];
  const clock = { t: 1_800_000_000_000 };
  const deps: MoneyDeps = {
    env: fakeEnv(env),
    store,
    track: (e, p) => events.push({ e, p }),
    sessionId: () => 'sess-1',
    abArm: () => 'A',
    now: () => clock.t,
    sleep: async (ms) => {
      clock.t += ms;
    },
    location: () => ({ origin: 'https://tokentails.com', pathname: '/badcat/play', assign: (u) => assigned.push(u) }),
    sessionIndex: () => 3,
    ...over,
  };
  return { deps, store, events, assigned, clock };
}
