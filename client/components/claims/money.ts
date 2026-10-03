import { formatUnits18, USD_PEGGED } from "@/api/impact-api";
import { formatFactDate } from "./facts";

export interface MoneyFormatOptions {
  isApp: boolean;
  /** The date the figure was read; app builds show it as the FX date. */
  asOf?: string | null;
}

/**
 * One amount in one currency (no mixed-currency sums, plan G4). Web: "12.40 USDC". App builds
 * (plan F7.2): a USD equivalent with its FX date, "$12.40 · FX 2026-09-30", for USD-pegged symbols
 * only; anything else returns null in the app, so it is left out rather than shown with its symbol.
 */
export function formatMoney(
  amount: string,
  symbol: string,
  { isApp, asOf }: MoneyFormatOptions
): string | null {
  const value = formatUnits18(amount);
  if (!isApp) return `${value} ${symbol}`;
  if (!USD_PEGGED.includes(symbol.toUpperCase())) return null;
  const day =
    asOf && !Number.isNaN(Date.parse(asOf))
      ? new Date(asOf).toISOString().slice(0, 10)
      : null;
  return day ? `$${value} · FX ${day}` : `$${value}`;
}

/** "as of 1 Oct 2026" for a snapshot date. */
export function asOfText(asOf: string | null | undefined): string | null {
  const d = formatFactDate(asOf ?? null);
  return d ? `as of ${d}` : null;
}
