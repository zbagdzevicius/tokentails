/**
 * Treat rail state for the Heist copy (plan G11 "Heist rail state", F7; fact ids C-004, L-rail).
 *
 * Three states drive every rail line the Heist shows:
 *   - pre-launch: "Real shelter treats open soon", an "Opens soon" chip instead of the give link;
 *   - live:       "Tap and Token Tails sends Pink Paw a {perGift} treat on Arc", with the link;
 *   - exhausted:  "Today's treats are gone, back at 00:00 UTC", no link.
 *
 * Sources, best first, each optional and each failing quietly to the next:
 *   1. GET {apiUrl}/shelter/donate/status (the backend's live `railState` and `amountWei`);
 *   2. the public facts at {factsUrl} (C-004, the configured treat amount);
 *   3. the facts baked into this build (src/facts.generated.ts), so the Heist never shows a live
 *      claim it cannot back and still works offline.
 * Without a live status the state is pre-launch: the copy only promises what is true.
 *
 * Runtime config, read once at boot (no rebuild needed): `window.__TT_HEIST_CONFIG__ = { apiUrl,
 * factsUrl }` from a host page, else `<meta name="heist:api-url">` and `<meta
 * name="heist:facts-url">` in index.html, else the API known for
 * the page's host (DEFAULT_API_BY_HOST: production on tokentails.com, the local backend on the
 * local client) and PUBLIC_FACTS_PATH. Any other host has no API and stays pre-launch.
 */
import { FACTS, PUBLIC_FACTS_PATH, type PublicFact } from '../facts.generated';
import { PAYOUT_CHAIN_META } from './shelter-payouts-chains';

export type RailState = 'pre-launch' | 'live' | 'exhausted';

/** The backend's states (shelter-donate.service.ts RailState). */
type BackendRailState = 'not-deployed' | 'paused' | 'live' | 'exhausted';

export interface RailInfo {
  state: RailState;
  /** The treat amount as a number of USDC ("0.01"), from the live status or C-004. */
  amountUsdc: string;
  /** Where the state came from: the live status, or the facts (fetched or baked). */
  source: 'status' | 'facts' | 'baked';
  /** The network the live treat goes out on, when the status names one (web copy only). */
  chainId?: number;
  /** What that treat is paid in there (USDC, USDC.e, USDG). */
  coin?: string;
}

export interface RailCopy {
  state: RailState;
  /** The win-screen line under "You rescued {name}!". */
  line: string;
  /** Shown instead of the give link when there is none ("Opens soon"); null when live. */
  chip: string | null;
  /** Whether the give link may show. */
  showGive: boolean;
  /** The title screen's footer. */
  foot: string;
}

export interface HeistRuntimeConfig {
  apiUrl: string;
  factsUrl: string;
}

/** The baked fallback: pre-launch, the C-004 amount from this build. */
export const BAKED_RAIL: RailInfo = Object.freeze({ state: 'pre-launch', amountUsdc: String(FACTS['C-004'].value ?? '0.01'), source: 'baked' });

/**
 * A web page (not the Capacitor app): chain and money words ("on Arc", "USDC") are web-only
 * (claims rule R10; the app uses the facts' `appDisplay`).
 */
export function isWebHost(win: { Capacitor?: { isNativePlatform?: () => boolean }; location?: { protocol?: string } } | undefined = globalThis as never): boolean {
  try {
    if (!win) return true;
    if (win.Capacitor?.isNativePlatform?.()) return false;
    const protocol = win.location?.protocol ?? '';
    return protocol !== 'capacitor:' && protocol !== 'ionic:';
  } catch {
    return true;
  }
}

/** A treat amount in USDC for the copy: "0.01 USDC" on the web, "$0.01" in the app. */
export function formatTreat(amountUsdc: string, web: boolean, coin = 'USDC'): string {
  const n = Number(amountUsdc);
  const shown = Number.isFinite(n) && n > 0 ? String(Math.round(n * 100) / 100) : '0.01';
  return web ? `${shown} ${coin}` : `$${shown}`;
}

/** 18-decimal native USDC (Arc) wei to a decimal string ("10000000000000000" -> "0.01"). */
export function weiToUsdc(amountWei: string): string | null {
  if (!/^\d{1,40}$/.test(amountWei)) return null;
  const wei = BigInt(amountWei);
  if (wei <= 0n) return null;
  const cents = (wei + 5n * 10n ** 15n) / 10n ** 16n;
  if (cents <= 0n) return null;
  const whole = cents / 100n;
  const frac = (cents % 100n).toString().padStart(2, '0').replace(/0+$/, '');
  return `${whole}${frac ? '.' + frac : ''}`;
}

const RANK: Record<RailState, number> = { live: 2, exhausted: 1, 'pre-launch': 0 };

/** One chain entry (or the top-level main-chain fields) to a rail state, or null when it is not one. */
function chainRail(b: { railState?: unknown; enabled?: unknown; treatsLeftToday?: unknown }): RailState | null {
  const backend = b.railState as BackendRailState | undefined;
  if (backend !== 'not-deployed' && backend !== 'paused' && backend !== 'live' && backend !== 'exhausted') return null;
  let state: RailState = backend === 'live' ? 'live' : backend === 'exhausted' ? 'exhausted' : 'pre-launch';
  if (state === 'live' && (b.enabled === false || (typeof b.treatsLeftToday === 'number' && b.treatsLeftToday <= 0))) {
    state = b.enabled === false ? 'pre-launch' : 'exhausted';
  }
  return state;
}

/**
 * Maps the backend status body to the Heist's three states, or null when it is not a status. With a
 * per-chain list (`chains`), the best state across every network wins (live, then exhausted, then
 * pre-launch), so a paused main chain never hides a live one the give page would pick.
 */
export function railFromStatus(body: unknown, fallbackAmount: string): RailInfo | null {
  if (!body || typeof body !== 'object') return null;
  const list = (body as { chains?: unknown }).chains;
  if (Array.isArray(list) && list.length) {
    let best: { state: RailState; c: { chainId?: unknown; amountWei?: unknown; coin?: unknown } } | null = null;
    for (const c of list) {
      if (!c || typeof c !== 'object') continue;
      const state = chainRail(c as never);
      if (state && (!best || RANK[state] > RANK[best.state])) best = { state, c: c as never };
    }
    if (best) {
      const amount = (typeof best.c.amountWei === 'string' && weiToUsdc(best.c.amountWei)) || fallbackAmount;
      return {
        state: best.state,
        amountUsdc: amount,
        source: 'status',
        ...(typeof best.c.chainId === 'number' ? { chainId: best.c.chainId } : {}),
        ...(typeof best.c.coin === 'string' && /^[A-Za-z0-9.]{1,12}$/.test(best.c.coin) ? { coin: best.c.coin } : {}),
      };
    }
  }
  const b = body as { railState?: unknown; amountWei?: unknown; treatsLeftToday?: unknown };
  const backend = b.railState as BackendRailState | undefined;
  if (backend !== 'not-deployed' && backend !== 'paused' && backend !== 'live' && backend !== 'exhausted') return null;
  const amount = (typeof b.amountWei === 'string' && weiToUsdc(b.amountWei)) || fallbackAmount;
  // A paused rail is shown like pre-launch: nothing is sent, so nothing is promised.
  let state: RailState = backend === 'live' ? 'live' : backend === 'exhausted' ? 'exhausted' : 'pre-launch';
  if (state === 'live' && typeof b.treatsLeftToday === 'number' && b.treatsLeftToday <= 0) state = 'exhausted';
  return { state, amountUsdc: amount, source: 'status' };
}

/** The C-004 amount from a public facts file (`{ facts: PublicFact[] }`), or null. */
export function amountFromFacts(body: unknown): string | null {
  const list = (body as { facts?: unknown } | null)?.facts;
  if (!Array.isArray(list)) return null;
  const entry = list.find((f): f is PublicFact => !!f && typeof f === 'object' && (f as PublicFact).id === 'C-004');
  const value = entry?.value;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? String(value) : null;
}

/** The copy for a rail state. `name` is the rescued cat (in-game fiction). */
export function railCopy(info: RailInfo, isWeb: boolean): RailCopy {
  const treat = formatTreat(info.amountUsdc, isWeb, info.coin);
  // The network the live treat goes out on (web only, claims rule R10): Arc unless the status names another.
  const chainName = (info.chainId !== undefined && PAYOUT_CHAIN_META[info.chainId]?.name) || 'Arc';
  if (info.state === 'live') {
    return {
      state: 'live',
      // claim: C-004, L-rail (the treat amount and the live rail state)
      line: isWeb ? `Tap and Token Tails sends Pink Paw a ${treat} treat on ${chainName}.` : `Tap and Token Tails sends Pink Paw a ${treat} treat.`,
      chip: null,
      showGive: true,
      // claim: C-004, L-rail
      foot: 'Free the shelter cat, then tap to send Pink Paw a real treat.',
    };
  }
  if (info.state === 'exhausted') {
    return {
      state: 'exhausted',
      // claim: L-rail (today's budget is used; it resets at 00:00 UTC)
      line: "Today's treats are gone, back at 00:00 UTC.",
      chip: null, // the line already says when treats are back
      showGive: false,
      // claim: L-rail
      foot: "Today's treats are gone, back at 00:00 UTC.",
    };
  }
  return {
    state: 'pre-launch',
    // claim: C-004, L-rail (future tense: the rail is not live yet)
    line: 'Real shelter treats open soon.',
    chip: 'Opens soon',
    showGive: false,
    // claim: C-004, L-rail
    foot: 'Play to save: real shelter treats open soon.',
  };
}

type Fetch = (input: string, init?: { signal?: AbortSignal; cache?: 'no-store'; credentials?: 'omit' }) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

interface ConfigWindow {
  __TT_HEIST_CONFIG__?: Partial<HeistRuntimeConfig>;
  parent?: unknown;
  location?: { host?: string };
}

/**
 * The backend for each host that serves the Heist build (client/public/heist-game). Production is
 * docs/DEPLOYMENT.md's API; the local pair matches the backend's CORS list (backend/src/main.ts).
 * Without this, the static build (no host page sets a config) would never see a live rail.
 *
 * Only origins in the backend's CORS list belong here, or the status request is blocked and the
 * footer silently stays pre-launch. `www.tokentails.com` is not in that list (nor in
 * docs/DEPLOYMENT.md), so it is left out until the backend adds it. The staging hosts
 * (`test.tokentails.com`, `cats.tokentails.com`) are in CORS but no staging API is documented;
 * pointing them at production would let a test page show (and give on) the production rail, so
 * staging sets `<meta name="heist:api-url">` or `window.__TT_HEIST_CONFIG__` instead.
 */
export const DEFAULT_API_BY_HOST: Readonly<Record<string, string>> = Object.freeze({
  'tokentails.com': 'https://api.tokentails.com',
  'localhost:3000': 'http://localhost:3005',
  'localhost:3001': 'http://localhost:3005',
});

/** The runtime config (see the module comment). Never throws. */
export function heistRuntimeConfig(win?: ConfigWindow, doc?: { querySelector(sel: string): { getAttribute(n: string): string | null } | null }): HeistRuntimeConfig {
  const read = (source: unknown) => {
    try {
      return (source as ConfigWindow | undefined)?.__TT_HEIST_CONFIG__;
    } catch {
      return undefined; // a cross-origin parent
    }
  };
  const own = read(win) ?? read(win?.parent);
  const meta = (name: string) => {
    try {
      return doc?.querySelector(`meta[name="${name}"]`)?.getAttribute('content')?.trim() ?? '';
    } catch {
      return '';
    }
  };
  // An unreplaced Vite placeholder ("%VITE_X%", the env var was unset) counts as no value.
  const clean = (url: unknown) => (typeof url === 'string' && !/^%[A-Z0-9_]+%$/.test(url.trim()) ? url.trim() : '');
  const hostApi = () => {
    try {
      return DEFAULT_API_BY_HOST[String(win?.location?.host ?? '').toLowerCase()] ?? '';
    } catch {
      return '';
    }
  };
  return {
    apiUrl: (clean(own?.apiUrl) || clean(meta('heist:api-url')) || hostApi()).replace(/\/+$/, ''),
    factsUrl: clean(own?.factsUrl) || clean(meta('heist:facts-url')) || PUBLIC_FACTS_PATH,
  };
}

async function getJson(f: Fetch, url: string, timeoutMs: number): Promise<unknown> {
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = setTimeout(() => ctl?.abort(), timeoutMs);
  try {
    const res = await f(url, { signal: ctl?.signal, cache: 'no-store', credentials: 'omit' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resolves the rail state from the live status, then the facts, then the baked fallback. Never
 * rejects; each request gives up after `timeoutMs` (3 s).
 */
export async function loadRail(config: HeistRuntimeConfig, f: Fetch | undefined = globalThis.fetch as unknown as Fetch, timeoutMs = 3000): Promise<RailInfo> {
  if (!f) return BAKED_RAIL;
  // Both requests run in parallel, so a slow facts file never holds back the live status
  // (each still has its own timeout); the fallback order is unchanged.
  const [facts, status] = await Promise.all([
    config.factsUrl ? getJson(f, config.factsUrl, timeoutMs) : Promise.resolve(undefined),
    config.apiUrl ? getJson(f, `${config.apiUrl}/shelter/donate/status`, timeoutMs) : Promise.resolve(undefined),
  ]);
  const fromFacts = config.factsUrl ? amountFromFacts(facts) : undefined;
  const amount = fromFacts || BAKED_RAIL.amountUsdc;
  const source: RailInfo['source'] = fromFacts ? 'facts' : 'baked';
  if (config.apiUrl) {
    const live = railFromStatus(status, amount);
    if (live) return live;
  }
  return { state: 'pre-launch', amountUsdc: amount, source };
}

/** One request's outcome: the body, a failed request (network error or HTTP error), or a timeout. */
type Attempt = { body: unknown } | { failed: 'error' | 'timeout' };

async function attempt(f: Fetch, url: string, timeoutMs: number): Promise<Attempt> {
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctl?.abort();
  }, timeoutMs);
  try {
    const res = await f(url, { signal: ctl?.signal, cache: 'no-store', credentials: 'omit' });
    if (!res.ok) return { failed: 'error' };
    return { body: await res.json() };
  } catch {
    return { failed: timedOut ? 'timeout' : 'error' };
  } finally {
    clearTimeout(timer);
  }
}

export interface WatchRailOptions {
  /** How long the first paint waits for the live status (3 s): after that the fallback paints. */
  firstPaintMs?: number;
  /** How long the status request may take in all before it is dropped (20 s; slow phones). */
  lateMs?: number;
  /** The pause before the one retry after a failed (not timed-out) status request. */
  retryDelayMs?: number;
}

/**
 * The rail for the page, delivered in up to two steps through `onRail`:
 *   1. the first paint, after at most `firstPaintMs` (3 s): the live status if it is in by then,
 *      else the facts amount or the baked state (pre-launch);
 *   2. a late live status: the status request is not cut off at the first-paint budget, it keeps
 *      going for up to `lateMs` (20 s), and a status that arrives after the first paint is
 *      delivered again, so a slow phone still flips from "opens soon" to the give link.
 * A failed status request (network error, HTTP error) is retried once after `retryDelayMs`.
 * Resolves with the first paint. Never rejects; `onRail` errors are the caller's.
 */
export async function watchRail(
  config: HeistRuntimeConfig,
  onRail: (info: RailInfo) => void,
  f: Fetch | undefined = globalThis.fetch as unknown as Fetch,
  opts: WatchRailOptions = {},
): Promise<RailInfo> {
  const firstPaintMs = opts.firstPaintMs ?? 3000;
  const lateMs = Math.max(opts.lateMs ?? 20000, firstPaintMs);
  const retryDelayMs = opts.retryDelayMs ?? 1000;
  if (!f) {
    // Never synchronously: the caller may still be setting up what `onRail` paints.
    await Promise.resolve();
    onRail(BAKED_RAIL);
    return BAKED_RAIL;
  }
  const started = Date.now();
  const factsP = config.factsUrl ? getJson(f, config.factsUrl, firstPaintMs) : Promise.resolve(undefined);
  const statusP: Promise<unknown> = config.apiUrl
    ? (async () => {
        const url = `${config.apiUrl}/shelter/donate/status`;
        const first = await attempt(f, url, lateMs);
        if ('body' in first) return first.body;
        if (first.failed === 'timeout') return null;
        await new Promise((r) => setTimeout(r, retryDelayMs));
        const left = lateMs - (Date.now() - started);
        if (left <= 0) return null;
        const second = await attempt(f, url, left);
        return 'body' in second ? second.body : null;
      })()
    : Promise.resolve(null);
  const PENDING = Symbol('pending');
  let budget: ReturnType<typeof setTimeout> | undefined;
  const early = await Promise.race([
    statusP,
    new Promise<typeof PENDING>((r) => {
      budget = setTimeout(() => r(PENDING), firstPaintMs);
    }),
  ]);
  clearTimeout(budget);
  const facts = await factsP;
  const fromFacts = config.factsUrl ? amountFromFacts(facts) : null;
  const amount = fromFacts || BAKED_RAIL.amountUsdc;
  const fallback: RailInfo = fromFacts ? { state: 'pre-launch', amountUsdc: amount, source: 'facts' } : BAKED_RAIL;
  const now = early !== PENDING && config.apiUrl ? railFromStatus(early, amount) : null;
  const firstPaint = now ?? fallback;
  onRail(firstPaint);
  if (early === PENDING) {
    void statusP.then((body) => {
      const late = railFromStatus(body, amount);
      if (late) onRail(late);
    });
  }
  return firstPaint;
}

/**
 * The rail to show after `next` arrives, given the one on screen. A live status seen in this page
 * load is never replaced by a fallback (facts or baked, always pre-launch), so "opens soon" never
 * returns once the rail was seen live; any newer live status (live or exhausted) still wins.
 */
export function mergeRail(prev: RailInfo, next: RailInfo): RailInfo {
  if (prev.source === 'status' && next.source !== 'status') return prev;
  return next;
}
