import {
  impactAsOf,
  isZeroAmount,
  PublicImpact,
} from "@/api/impact-api";
import { moneyTierFor } from "@/components/claims/evidence";
import { formatMoney } from "@/components/claims/money";
import type { MoneyTier } from "@/components/claims/tiers";
import type { FactId } from "@/lib/facts.generated";

/*
 * The live impact figures the game surfaces show (lobby strip, /stats), read from the one public
 * snapshot (plan F7.3; "stats single source of truth"). Each is a registry id plus the values that
 * fill its template, so it renders through <Claim>. Money is per currency, never summed, and in app
 * builds a USD equivalent with its FX date (F7.2).
 */

export interface LiveFigure {
  id: FactId;
  values: { n?: number; amount?: string };
  asOf: string;
  /** Money evidence tier, for money figures. */
  tier?: MoneyTier;
}

const SYMBOL_ORDER = ["USDC", "EURC", "USDT", "USD"];

function moneyText(bySymbol: Record<string, string>, isApp: boolean, asOf: string): string | null {
  const rank = (s: string) => {
    const i = SYMBOL_ORDER.indexOf(s);
    return i === -1 ? SYMBOL_ORDER.length : i;
  };
  const parts = Object.entries(bySymbol)
    .filter(([, wei]) => !isZeroAmount(wei))
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([symbol, wei]) => formatMoney(wei, symbol, { isApp, asOf }))
    .filter((a): a is string => !!a);
  return parts.length ? parts.join(" · ") : null;
}

/** Treats Token Tails has sent (CONFIRMED only), or null while there are none. */
export function treatsFigure(impact: PublicImpact | null, isApp: boolean): LiveFigure | null {
  if (!impact || isZeroAmount(impact.treats.totalConfirmedWei)) return null;
  const asOf = impactAsOf(impact, "mongo");
  const amount = formatMoney(impact.treats.totalConfirmedWei, "USDC", { isApp, asOf });
  if (!amount) return null;
  return { id: "L-treats", values: { amount }, asOf, tier: moneyTierFor(impact.money.custody) };
}

/** Everything the indexer saw paid to shelters, per currency, or null while nothing was. */
export function disbursedFigure(impact: PublicImpact | null, isApp: boolean): LiveFigure | null {
  if (!impact || impact.sources.chain === "not-deployed" || impact.money.eventCount === 0) return null;
  const asOf = impactAsOf(impact, "chain");
  const amount = moneyText(impact.money.bySymbol, isApp, asOf);
  if (!amount) return null;
  return { id: "L-disbursed", values: { amount }, asOf, tier: moneyTierFor(impact.money.custody) };
}

/** Partner countries; null while the country list is empty (not measured yet, not zero). */
export function countriesFigure(impact: PublicImpact | null): LiveFigure | null {
  if (!impact || impact.shelters.countries.length === 0) return null;
  return {
    id: "L-countries",
    values: { n: impact.shelters.countries.length },
    asOf: impactAsOf(impact, "mongo"),
  };
}

/** Registered players, all time (guests excluded by the snapshot); null when not measured. */
export function playersFigure(impact: PublicImpact | null): LiveFigure | null {
  if (!impact || impact.players.registeredAllTime === null) return null;
  return {
    id: "L-players",
    values: { n: impact.players.registeredAllTime },
    asOf: impactAsOf(impact, "mongo"),
  };
}

/** Verified heists; null until the snapshot measures them. */
export function heistsFigure(impact: PublicImpact | null): LiveFigure | null {
  if (!impact || impact.heists.verified === null) return null;
  return { id: "L-heists", values: { n: impact.heists.verified }, asOf: impactAsOf(impact, "mongo") };
}

/** The partner shelter's name from the snapshot, for "a treat to {name}" lines. */
export function partnerShelterName(impact: PublicImpact | null): string | null {
  const items = impact?.shelters.items ?? [];
  return (
    items.find((s) => s.role === "partner" && s.partnerStatus === "active")?.name ??
    items.find((s) => s.role === "partner")?.name ??
    null
  );
}

/** The money figures the strip shows, in order (treats first: they are the in-game rail). */
export function stripFigures(impact: PublicImpact | null, isApp: boolean): LiveFigure[] {
  return [treatsFigure(impact, isApp), disbursedFigure(impact, isApp)].filter(
    (f): f is LiveFigure => !!f
  );
}
