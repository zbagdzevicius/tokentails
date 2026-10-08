import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  BAKED_RAIL,
  amountFromFacts,
  formatTreat,
  DEFAULT_API_BY_HOST,
  heistRuntimeConfig,
  isWebHost,
  loadRail,
  mergeRail,
  railCopy,
  railFromStatus,
  watchRail,
  weiToUsdc,
  type RailInfo,
} from '../rail';
import { FACTS, PUBLIC_FACTS_PATH } from '../../facts.generated';

const status = (over: Record<string, unknown> = {}) => ({
  enabled: true,
  railState: 'live',
  chainId: 5042,
  amountWei: '10000000000000000',
  treatsLeftToday: 40,
  resetsAt: '2026-10-02T00:00:00.000Z',
  ...over,
});

const okJson = (body: unknown) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) });

describe('rail copy (plan G11 three states)', () => {
  const live: RailInfo = { state: 'live', amountUsdc: '0.01', source: 'status' };

  it('pre-launch promises nothing live: future tense, an "Opens soon" chip, no give link', () => {
    const copy = railCopy(BAKED_RAIL, true);
    expect(copy.state).toBe('pre-launch');
    expect(copy.line).toBe('Real shelter treats open soon.');
    expect(copy.chip).toBe('Opens soon');
    expect(copy.showGive).toBe(false);
    expect(copy.foot).toMatch(/open soon/);
  });

  it('live names the per-gift amount and the chain on the web', () => {
    const copy = railCopy(live, true);
    expect(copy.line).toBe('Tap and Token Tails sends Pink Paw a 0.01 USDC treat on Arc.');
    expect(copy.showGive).toBe(true);
    expect(copy.chip).toBeNull();
  });

  it('live in the app leaves out chain and token words (claims rule R10)', () => {
    const copy = railCopy(live, false);
    expect(copy.line).toBe('Tap and Token Tails sends Pink Paw a $0.01 treat.');
    expect(copy.line).not.toMatch(/Arc|USDC|on-chain/);
  });

  it('exhausted says when treats come back and hides the link', () => {
    const copy = railCopy({ ...live, state: 'exhausted' }, true);
    expect(copy.line).toBe("Today's treats are gone, back at 00:00 UTC.");
    expect(copy.showGive).toBe(false);
    // No chip: it would only repeat the line.
    expect(copy.chip).toBeNull();
  });

  it('the configured amount drives the copy', () => {
    expect(railCopy({ ...live, amountUsdc: '0.05' }, true).line).toContain('0.05 USDC');
    expect(formatTreat('0.1', false)).toBe('$0.1');
  });
});

describe('rail state sources', () => {
  it('maps the backend states: not-deployed and paused read as pre-launch', () => {
    expect(railFromStatus(status(), '0.01')?.state).toBe('live');
    expect(railFromStatus(status({ railState: 'exhausted' }), '0.01')?.state).toBe('exhausted');
    expect(railFromStatus(status({ railState: 'not-deployed' }), '0.01')?.state).toBe('pre-launch');
    expect(railFromStatus(status({ railState: 'paused' }), '0.01')?.state).toBe('pre-launch');
    expect(railFromStatus(status({ treatsLeftToday: 0 }), '0.01')?.state).toBe('exhausted');
    expect(railFromStatus({ railState: 'banana' }, '0.01')).toBeNull();
    expect(railFromStatus(null, '0.01')).toBeNull();
  });

  it('reads the per-gift amount from amountWei (18-decimal USDC on Arc)', () => {
    expect(weiToUsdc('10000000000000000')).toBe('0.01');
    expect(weiToUsdc('1000000000000000000')).toBe('1');
    expect(weiToUsdc('0')).toBeNull();
    expect(weiToUsdc('-1')).toBeNull();
    expect(railFromStatus(status({ amountWei: '50000000000000000' }), '0.01')?.amountUsdc).toBe('0.05');
  });

  it('the baked fallback is pre-launch with the build-time C-004 amount', () => {
    expect(BAKED_RAIL.state).toBe('pre-launch');
    expect(BAKED_RAIL.amountUsdc).toBe(String(FACTS['C-004'].value));
  });

  it('reads C-004 from a public facts file', () => {
    expect(amountFromFacts({ facts: [{ id: 'C-004', value: '0.02' }] })).toBe('0.02');
    expect(amountFromFacts({ facts: [] })).toBeNull();
    expect(amountFromFacts('nope')).toBeNull();
  });

  it('loadRail: live status wins, then the facts amount, then the baked state', async () => {
    const f = vi.fn((url: string) =>
      url.endsWith('/shelter/donate/status') ? okJson(status({ railState: 'exhausted' })) : okJson({ facts: [{ id: 'C-004', value: '0.02' }] }),
    );
    expect(await loadRail({ apiUrl: 'https://api.example', factsUrl: '/facts/facts.json' }, f)).toEqual({ state: 'exhausted', amountUsdc: '0.01', source: 'status' });
    expect(await loadRail({ apiUrl: '', factsUrl: '/facts/facts.json' }, f)).toEqual({ state: 'pre-launch', amountUsdc: '0.02', source: 'facts' });
    const down = vi.fn(() => Promise.reject(new Error('offline')));
    expect(await loadRail({ apiUrl: 'https://api.example', factsUrl: '/facts/facts.json' }, down)).toEqual(BAKED_RAIL);
    const bad = vi.fn(() => Promise.resolve({ ok: false, json: () => Promise.resolve({}) }));
    expect(await loadRail({ apiUrl: 'https://api.example', factsUrl: '/facts/facts.json' }, bad)).toEqual(BAKED_RAIL);
  });

  it('loadRail gives up on a hung request after the timeout', async () => {
    vi.useFakeTimers();
    try {
      const hung = vi.fn((_url: string, init?: { signal?: AbortSignal }) =>
        new Promise<never>((_, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))),
      );
      const pending = loadRail({ apiUrl: 'https://api.example', factsUrl: '/facts/facts.json' }, hung, 3000);
      // Both requests run in parallel, so one timeout window (3 s), not two, ends the wait.
      await vi.advanceTimersByTimeAsync(3100);
      expect(await pending).toEqual(BAKED_RAIL);
    } finally {
      vi.useRealTimers();
    }
  });

  it('loadRail: a hung facts file costs one timeout, not two, before the live status shows', async () => {
    vi.useFakeTimers();
    try {
      const f = vi.fn((url: string, init?: { signal?: AbortSignal }) =>
        url.endsWith('/shelter/donate/status')
          ? okJson(status())
          : new Promise<never>((_, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))),
      );
      let settled: RailInfo | undefined;
      void loadRail({ apiUrl: 'https://api.example', factsUrl: '/facts/facts.json' }, f, 3000).then((r) => (settled = r));
      expect(f).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(3100);
      expect(settled).toEqual({ state: 'live', amountUsdc: '0.01', source: 'status' });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('watchRail (a slow status still lands)', () => {
  const cfg = { apiUrl: 'https://api.example', factsUrl: '/facts/facts.json' };
  const factsBody = { facts: [{ id: 'C-004', value: '0.01' }] };

  it('paints "Checking…" at 3 s, then flips to live when a late status answers (no abort at 3 s)', async () => {
    vi.useFakeTimers();
    try {
      let signal: AbortSignal | undefined;
      const f = vi.fn((url: string, init?: { signal?: AbortSignal }) => {
        if (!url.endsWith('/shelter/donate/status')) return okJson(factsBody);
        signal = init?.signal;
        // The answer takes 6 s (a slow phone while the game loads).
        return new Promise<{ ok: boolean; json(): Promise<unknown> }>((res) => setTimeout(() => res({ ok: true, json: () => Promise.resolve(status()) }), 6000));
      });
      const seen: RailInfo[] = [];
      let first: RailInfo | undefined;
      void watchRail(cfg, (i) => seen.push(i), f).then((r) => (first = r));
      await vi.advanceTimersByTimeAsync(3100);
      expect(first).toEqual({ state: 'pre-launch', amountUsdc: '0.01', source: 'facts', pending: true });
      expect(seen.map((i) => i.state)).toEqual(['pre-launch']);
      expect(railCopy(seen[0], true)).toMatchObject({ chip: 'Checking…', showGive: false });
      expect(railCopy(seen[0], true).line).not.toMatch(/open soon/i);
      expect(signal?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(3000);
      expect(seen.map((i) => i.state)).toEqual(['pre-launch', 'live']);
      expect(seen[1]).toMatchObject({ state: 'live', source: 'status' });
      expect(railCopy(seen[1], true).showGive).toBe(true);
      expect(f.mock.calls.filter(([u]) => u.endsWith('/status'))).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a status that never answers goes from "Checking…" to "Opens soon" at the late limit', async () => {
    vi.useFakeTimers();
    try {
      const f = vi.fn((url: string, init?: { signal?: AbortSignal }) => {
        if (!url.endsWith('/shelter/donate/status')) return okJson(factsBody);
        return new Promise<never>((_, rej) => init?.signal?.addEventListener('abort', () => rej(new Error('aborted'))));
      });
      const seen: RailInfo[] = [];
      void watchRail(cfg, (i) => seen.push(i), f);
      await vi.advanceTimersByTimeAsync(3100);
      expect(seen.map((i) => railCopy(i, true).chip)).toEqual(['Checking…']);
      await vi.advanceTimersByTimeAsync(20_000);
      expect(seen.map((i) => railCopy(i, true).chip)).toEqual(['Checking…', 'Opens soon']);
      expect(seen[1].pending).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a status within the budget paints once, live', async () => {
    const seen: RailInfo[] = [];
    const f = vi.fn((url: string) => (url.endsWith('/shelter/donate/status') ? okJson(status()) : okJson(factsBody)));
    expect(await watchRail(cfg, (i) => seen.push(i), f)).toMatchObject({ state: 'live', source: 'status' });
    expect(seen).toHaveLength(1);
  });

  it('retries once after a network error, and the second answer wins', async () => {
    vi.useFakeTimers();
    try {
      let calls = 0;
      const f = vi.fn((url: string) => {
        if (!url.endsWith('/shelter/donate/status')) return okJson(factsBody);
        calls++;
        return calls === 1 ? Promise.reject(new TypeError('Failed to fetch')) : okJson(status());
      });
      const seen: RailInfo[] = [];
      const pending = watchRail(cfg, (i) => seen.push(i), f, { retryDelayMs: 1000 });
      await vi.advanceTimersByTimeAsync(1100);
      // Retried within the first-paint budget: the first paint is already live.
      expect(await pending).toMatchObject({ state: 'live', source: 'status' });
      expect(calls).toBe(2);
      expect(seen.map((i) => i.state)).toEqual(['live']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a retry that answers after the budget still flips the rail; two failures stay pre-launch', async () => {
    vi.useFakeTimers();
    try {
      let calls = 0;
      const f = vi.fn((url: string) => {
        if (!url.endsWith('/shelter/donate/status')) return okJson(factsBody);
        calls++;
        return calls === 1
          ? new Promise<never>((_, rej) => setTimeout(() => rej(new TypeError('Failed to fetch')), 2500))
          : new Promise<{ ok: boolean; json(): Promise<unknown> }>((res) => setTimeout(() => res({ ok: true, json: () => Promise.resolve(status()) }), 2000));
      });
      const seen: RailInfo[] = [];
      void watchRail(cfg, (i) => seen.push(i), f, { retryDelayMs: 1000 });
      await vi.advanceTimersByTimeAsync(3100);
      expect(seen.map((i) => i.state)).toEqual(['pre-launch']);
      await vi.advanceTimersByTimeAsync(3000);
      expect(calls).toBe(2);
      expect(seen.map((i) => i.state)).toEqual(['pre-launch', 'live']);

      const down = vi.fn((url: string) => (url.endsWith('/shelter/donate/status') ? Promise.reject(new Error('offline')) : okJson(factsBody)));
      const seen2: RailInfo[] = [];
      void watchRail(cfg, (i) => seen2.push(i), down, { retryDelayMs: 1000 });
      await vi.advanceTimersByTimeAsync(25_000);
      expect(down.mock.calls.filter(([u]) => u.endsWith('/status'))).toHaveLength(2);
      expect(seen2.map((i) => i.state)).toEqual(['pre-launch']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('mergeRail never goes back to the pre-launch fallback once a live status was seen', () => {
    const live: RailInfo = { state: 'live', amountUsdc: '0.01', source: 'status' };
    const exhausted: RailInfo = { state: 'exhausted', amountUsdc: '0.01', source: 'status' };
    expect(mergeRail(live, BAKED_RAIL)).toBe(live);
    expect(mergeRail(live, { state: 'pre-launch', amountUsdc: '0.01', source: 'facts' })).toBe(live);
    expect(mergeRail(BAKED_RAIL, live)).toBe(live);
    expect(mergeRail(live, exhausted)).toBe(exhausted);
  });
});

describe('runtime config', () => {
  const doc = (meta: Record<string, string>) => ({
    querySelector: (sel: string) => {
      const name = /name="([^"]+)"/.exec(sel)?.[1] ?? '';
      return name in meta ? { getAttribute: () => meta[name] } : null;
    },
  });

  it('defaults to no API and the public facts path', () => {
    expect(heistRuntimeConfig({}, doc({}))).toEqual({ apiUrl: '', factsUrl: PUBLIC_FACTS_PATH });
  });
  it('reads the index.html meta tags', () => {
    expect(heistRuntimeConfig({}, doc({ 'heist:api-url': 'https://api.example/', 'heist:facts-url': '/f.json' }))).toEqual({
      apiUrl: 'https://api.example',
      factsUrl: '/f.json',
    });
  });
  it('a host page config wins, also from a same-origin parent frame', () => {
    expect(heistRuntimeConfig({ __TT_HEIST_CONFIG__: { apiUrl: 'https://a' } }, doc({ 'heist:api-url': 'https://b' })).apiUrl).toBe('https://a');
    expect(heistRuntimeConfig({ parent: { __TT_HEIST_CONFIG__: { factsUrl: '/x.json' } } }, doc({})).factsUrl).toBe('/x.json');
  });
  it('defaults the API from the page host, so the static build sees a live rail', () => {
    expect(heistRuntimeConfig({ location: { host: 'tokentails.com' } }, doc({})).apiUrl).toBe('https://api.tokentails.com');
    expect(heistRuntimeConfig({ location: { host: 'localhost:3001' } }, doc({})).apiUrl).toBe('http://localhost:3005');
    // Unknown hosts (Pages, previews) have no API: pre-launch copy, never a false live claim.
    expect(heistRuntimeConfig({ location: { host: 'example.github.io' } }, doc({})).apiUrl).toBe('');
    // Not in the backend's CORS list: the request would be blocked, so no default (review 3e #5).
    expect(heistRuntimeConfig({ location: { host: 'www.tokentails.com' } }, doc({})).apiUrl).toBe('');
    // Staging is in CORS but has no documented API; it must not default to production.
    expect(heistRuntimeConfig({ location: { host: 'test.tokentails.com' } }, doc({})).apiUrl).toBe('');
    expect(heistRuntimeConfig({ location: { host: 'cats.tokentails.com' } }, doc({})).apiUrl).toBe('');
    expect(heistRuntimeConfig({ location: { host: 'test.tokentails.com' } }, doc({ 'heist:api-url': 'https://staging-api' })).apiUrl).toBe('https://staging-api');
    // An explicit meta or host-page value wins over the host default.
    expect(heistRuntimeConfig({ location: { host: 'tokentails.com' } }, doc({ 'heist:api-url': 'https://b' })).apiUrl).toBe('https://b');
  });
  it('every host default is an origin the backend allows (backend/src/main.ts CORS list)', () => {
    const main = readFileSync(resolve(__dirname, '../../../../backend/src/main.ts'), 'utf8');
    const origins = new Set([...main.matchAll(/'(https?:\/\/[^']+)'/g)].map((m) => m[1]));
    for (const host of Object.keys(DEFAULT_API_BY_HOST)) {
      const origin = `${host.startsWith('localhost') ? 'http' : 'https'}://${host}`;
      expect(origins.has(origin), `${origin} missing from the backend CORS list`).toBe(true);
    }
  });
  it('ignores an unreplaced build placeholder', () => {
    expect(heistRuntimeConfig({ location: { host: 'tokentails.com' } }, doc({ 'heist:api-url': '%VITE_HEIST_API_URL%' })).apiUrl).toBe('https://api.tokentails.com');
  });
  it('a cross-origin parent does not throw', () => {
    const parent = new Proxy({}, { get: () => { throw new Error('SecurityError'); } });
    expect(heistRuntimeConfig({ parent }, doc({})).factsUrl).toBe(PUBLIC_FACTS_PATH);
  });
});

describe('isWebHost', () => {
  it('is false inside the Capacitor app', () => {
    expect(isWebHost({ Capacitor: { isNativePlatform: () => true }, location: { protocol: 'https:' } })).toBe(false);
    expect(isWebHost({ location: { protocol: 'capacitor:' } })).toBe(false);
  });
  it('is true on the web', () => {
    expect(isWebHost({ location: { protocol: 'https:' } })).toBe(true);
    expect(isWebHost({ Capacitor: { isNativePlatform: () => false }, location: { protocol: 'https:' } })).toBe(true);
  });
});

describe('ux-1: the best state across every network the backend serves', () => {
  const chain = (chainId: number, railState: string, extra: Record<string, unknown> = {}) => ({
    chainId, railState, enabled: railState === 'live' || railState === 'exhausted', amountWei: '10000000000000000', treatsLeftToday: 5, coin: 'USDC', ...extra,
  });

  it('a paused main chain does not hide a live one, and the live line names that chain and coin', async () => {
    const { railFromStatus, railCopy } = await import('../rail');
    const body = { railState: 'paused', enabled: false, amountWei: '10000000000000000', chains: [chain(5042, 'paused'), chain(4217, 'live', { coin: 'USDC.e' })] };
    const info = railFromStatus(body, '0.01')!;
    expect(info.state).toBe('live');
    expect(info.chainId).toBe(4217);
    expect(railCopy(info, true).line).toBe('Tap and Token Tails sends Pink Paw a 0.01 USDC.e treat on Tempo.');
    // the app never names a chain or a coin
    expect(railCopy(info, false).line).toBe('Tap and Token Tails sends Pink Paw a $0.01 treat.');
  });

  it('exhausted beats pre-launch; every chain paused stays pre-launch; no chains keeps the old top-level reading', async () => {
    const { railFromStatus } = await import('../rail');
    expect(railFromStatus({ railState: 'paused', chains: [chain(5042, 'paused'), chain(8453, 'exhausted', { treatsLeftToday: 0 })] }, '0.01')!.state).toBe('exhausted');
    expect(railFromStatus({ railState: 'paused', chains: [chain(5042, 'paused'), chain(8453, 'not-deployed')] }, '0.01')!.state).toBe('pre-launch');
    expect(railFromStatus({ railState: 'live', amountWei: '10000000000000000' }, '0.01')!.state).toBe('live');
  });
});
