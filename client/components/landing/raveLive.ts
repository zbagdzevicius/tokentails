// copy-lint: web-only data helper; the Moon Rave callouts that render it never show in the app build
// The landing's live Moon Rave line (hero pill and RaveSection): the same numbers the rave counts,
// read from the same public source (cat-rave/README.md "The $1 = 1 cat rule").
//
//   GET {api}/shelter/payouts?network=mainnet  every ShelterSplit payout to Pink Paw (the shared
//                                              index reader of /shelter-payouts, loadPayoutIndex)
//   GET {api}/rave/status                      whether "add a cat" checkout takes cards and USDC on Arc
//
// Count rule (mirrors cat-rave/src/data/index.ts toUsdMicro): amount18 truncated to integer
// micro-USD; USDC, USDC.e, USDG, pathUSD at 1:1; EURC at a fixed 1.00 (undercounts, never inflates);
// gas coins, unknown tokens and chains outside the 7 mainnets are not counted; deduped by
// chainId:txHash:logIndex. Cats = floor(total USD). The rave also shows paid rave orders whose payout
// is not indexed yet; this line counts on-chain payouts only, so it never shows more than the rave.
// No number is ever shown that was not read: unread, unreachable or cut-short reads hide it.
// loadPayoutIndex's validEvent is stricter than the rave's normalizeEvent (lower-case hashes, every
// field typed): an event it drops makes the read count as cut short, so the line hides instead of
// showing a smaller number. The chain ids, coins and EURC rate below are a copy of
// cat-rave/src/config.ts (listed in docs/DEVELOPMENT.md); landing-rave-parity.test.ts pins them.
import { apiUrl } from "@/api/api";
import { loadPayoutIndex, type PayoutIndex } from "@/components/shelter-payouts/payoutIndex";
import { useEffect, useState } from "react";

/** The rave page. `from` says which landing callout sent the visitor (the rave ignores it). */
export const RAVE_PATH = "/rave";
export const raveHref = (from: "landing_hero" | "landing_rave") => `${RAVE_PATH}?from=${from}`;

/** The 7 mainnets of the Pink Paw splits, as cat-rave/src/config.ts CHAINS (Arc, Base, Arbitrum One, Avalanche, Tempo, Robinhood Chain, Monad). */
export const RAVE_MAINNET_CHAIN_IDS: readonly number[] = Object.freeze([5042, 8453, 42161, 43114, 4217, 4663, 143]);
/** Arc mainnet: the chain the rave's USDC checkout names. */
export const ARC_MAINNET_CHAIN_ID = 5042;
const USD_SYMBOLS: readonly string[] = Object.freeze(["USDC", "USDC.e", "USDG", "pathUSD"]);
/** Fixed EURC→USD rate, as the rave and the backend checkout (EUR trades above USD: undercounts). */
const EURC_USD = 1.0;
const MICRO = 1_000_000;

/** amount18 → integer micro-USD, or null for a coin the rave does not count. */
export function toUsdMicro(symbol: string, amount18: string): number | null {
  let v: bigint;
  try {
    v = BigInt(amount18);
  } catch {
    return null;
  }
  if (v < BigInt(0)) return null;
  const micro = v / BigInt("1000000000000"); // 18 → 6 decimals (÷ 10^12), truncating
  if (USD_SYMBOLS.includes(symbol)) return Number(micro);
  if (symbol === "EURC") return Math.floor(Number(micro) * EURC_USD);
  return null;
}

export interface RaveTotal {
  /** Integer micro-USD paid out to Pink Paw on-chain. */
  usdMicro: number;
  /** Dancing cats from on-chain payouts: floor(total USD). */
  cats: number;
}

/**
 * The on-chain total from the payout index, or null when it was not read or is cut short (fewer
 * events than the index says it holds: the total would undercount, so no number is shown).
 */
export function raveTotalFromIndex(index: PayoutIndex | null | undefined): RaveTotal | null {
  if (!index || !Array.isArray(index.events) || !Array.isArray(index.contracts)) return null;
  const held = index.contracts.reduce((n, c) => n + (Number.isSafeInteger(c.count) ? c.count : 0), 0);
  if (index.events.length < held) return null;
  const seen = new Set<string>();
  let usdMicro = 0;
  for (const e of index.events) {
    if (!RAVE_MAINNET_CHAIN_IDS.includes(e.chainId)) continue;
    const id = `${e.chainId}:${String(e.txHash).toLowerCase()}:${e.logIndex}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const micro = toUsdMicro(e.symbol, e.amount18);
    if (micro === null || micro <= 0) continue;
    usdMicro += micro;
  }
  return { usdMicro, cats: Math.floor(usdMicro / MICRO) };
}

/** micro-USD → "$25.75" (truncated to cents, never rounded up). */
export function formatRaveUsd(micro: number): string {
  const cents = Math.floor(micro / 10_000);
  return `$${Math.floor(cents / 100).toLocaleString("en-US")}.${String(cents % 100).padStart(2, "0")}`;
}

/** The ways the rave's own checkout takes a $1 cat right now (`GET /rave/status`). */
export interface RaveCheckout {
  card: boolean;
  usdcArc: boolean;
}

/**
 * `GET /rave/status` → what checkout takes, or null when it is off, unread, malformed or not live
 * (`livemode` false: a Stripe test key or a testnet chain, which takes no real money).
 */
export function raveCheckoutFromStatus(body: unknown): RaveCheckout | null {
  const s = body as {
    enabled?: unknown;
    livemode?: unknown;
    card?: unknown;
    usdc?: { enabled?: unknown; chains?: unknown };
  } | null;
  if (!s || s.enabled !== true || s.livemode !== true) return null;
  const card = s.card === true;
  const usdcArc =
    s.usdc?.enabled === true && Array.isArray(s.usdc.chains) && s.usdc.chains.includes(ARC_MAINNET_CHAIN_ID);
  return card || usdcArc ? { card, usdcArc } : null;
}

const STATUS_TIMEOUT_MS = 4_000;
let statusRead: Promise<RaveCheckout | null> | null = null;

/** One `GET /rave/status` per page view, shared by the hero pill and the section. */
export function loadRaveCheckout(
  base: string | undefined = apiUrl,
  fetchFn: typeof fetch = fetch
): Promise<RaveCheckout | null> {
  if (statusRead) return statusRead;
  const root = (base || "").trim().replace(/\/+$/, "");
  if (!root) return Promise.resolve(null);
  statusRead = (async () => {
    const ctl = typeof AbortController === "function" ? new AbortController() : null;
    const timer = setTimeout(() => ctl?.abort(), STATUS_TIMEOUT_MS);
    try {
      const res = await fetchFn(`${root}/rave/status`, { signal: ctl?.signal, credentials: "omit" } as RequestInit);
      if (!res.ok) return null;
      return raveCheckoutFromStatus(await res.json());
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  })();
  return statusRead;
}

/** Test hook. */
export function resetRaveLiveCache() {
  statusRead = null;
}

/** The longest the live read waits for an idle moment after mount. */
const IDLE_WAIT_MS = 1_500;

export type RaveLive =
  | { state: "loading"; total: null; checkout: null }
  | { state: "ready"; total: RaveTotal | null; checkout: RaveCheckout | null };

/**
 * The live total and checkout ways, read after mount (browser only, nothing in the server HTML).
 * `total` is null when the index could not be read in full: callers then show no number.
 */
export function useRaveLive(enabled: boolean, base: string | undefined = apiUrl): RaveLive {
  const [live, setLive] = useState<RaveLive>({ state: "loading", total: null, checkout: null });
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    // A loader that throws before its promise exists (no global fetch, say) reads as unread.
    const safely = <T,>(read: () => Promise<T | null>): Promise<T | null> => {
      try {
        return read().catch(() => null);
      } catch {
        return Promise.resolve(null);
      }
    };
    const read = () =>
      Promise.all([safely(() => loadPayoutIndex("mainnet", base)), safely(() => loadRaveCheckout(base))]).then(
        ([index, checkout]) => {
          if (!cancelled) setLive({ state: "ready", total: raveTotalFromIndex(index), checkout });
        }
      );
    // The full payout index is read on every landing visit: wait until the browser is idle (at most
    // IDLE_WAIT_MS), so it never competes with the hero's first paint. TODO: a totals-only endpoint.
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (typeof w.requestIdleCallback === "function") {
      const id = w.requestIdleCallback(read, { timeout: IDLE_WAIT_MS });
      return () => {
        cancelled = true;
        w.cancelIdleCallback?.(id);
      };
    }
    read();
    return () => {
      cancelled = true;
    };
  }, [enabled, base]);
  return live;
}
