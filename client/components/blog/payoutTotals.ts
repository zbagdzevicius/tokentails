// copy-lint: web-only data helper for the blog's live payout widget; PayoutsLive renders nothing in app builds
// The figures of the blog's `<!-- payouts-live -->` widget, read live from the same public index as
// /shelter-payouts (GET /shelter/payouts, components/shelter-payouts/payoutIndex.ts). Per coin, never
// summed across coins; Motored sponsor money is counted apart and always disclosed (motored.ts).
import type { PayoutIndex } from "@/components/shelter-payouts/payoutIndex";
import { isMotoredMemo } from "@/components/shelter-payouts/motored";

export interface CoinTotal {
  symbol: string;
  /** "92.11": truncated to cents, never rounded up. */
  amount: string;
  count: number;
}

export interface PayoutTotals {
  coins: CoinTotal[];
  count: number;
  /** Unix seconds of the newest payout. */
  latest: number | null;
  /** Motored-sponsored payouts in US dollar stablecoins (one sponsor's money, linked to the founder). */
  motored: { count: number; usd: string } | null;
}

const ORDER = ["USDC", "USDC.e", "USDG", "EURC"];
const USD = new Set(["USDC", "USDC.E", "USDG"]);
const E16 = BigInt("10000000000000000");

/** 18-decimal units -> "1,234.56" (rounded down to the cent). */
export function centsText(amount18: bigint): string {
  const cents = amount18 / E16;
  const whole = (cents / BigInt(100)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${whole}.${(cents % BigInt(100)).toString().padStart(2, "0")}`;
}

/**
 * Totals from the payout index, or null when it was not read or is cut short (fewer events than
 * the index says it holds: a partial total would undercount, so nothing is shown).
 */
export function payoutTotals(index: PayoutIndex | null | undefined): PayoutTotals | null {
  if (!index || !Array.isArray(index.events) || !Array.isArray(index.contracts)) return null;
  const held = index.contracts.reduce((n, c) => n + (Number.isSafeInteger(c.count) ? c.count : 0), 0);
  if (index.events.length < held) return null;
  const seen = new Set<string>();
  const bySymbol = new Map<string, { sum: bigint; count: number }>();
  let count = 0;
  let latest: number | null = null;
  let motoredSum = BigInt(0);
  let motoredCount = 0;
  for (const e of index.events) {
    const id = `${e.chainId}:${String(e.txHash).toLowerCase()}:${e.logIndex}`;
    if (seen.has(id)) continue;
    seen.add(id);
    let v: bigint;
    try {
      v = BigInt(e.amount18);
    } catch {
      continue;
    }
    if (v <= BigInt(0)) continue;
    const row = bySymbol.get(e.symbol) ?? { sum: BigInt(0), count: 0 };
    row.sum += v;
    row.count += 1;
    bySymbol.set(e.symbol, row);
    count += 1;
    if (latest === null || e.timestamp > latest) latest = e.timestamp;
    if (isMotoredMemo(e.memo) && USD.has(e.symbol.toUpperCase())) {
      motoredSum += v;
      motoredCount += 1;
    }
  }
  if (!count) return null;
  const rank = (s: string) => (ORDER.indexOf(s) === -1 ? ORDER.length : ORDER.indexOf(s));
  const coins = Array.from(bySymbol.entries())
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([symbol, { sum, count: n }]) => ({ symbol, amount: centsText(sum), count: n }));
  return {
    coins,
    count,
    latest,
    motored: motoredCount ? { count: motoredCount, usd: `$${centsText(motoredSum)}` } : null,
  };
}
