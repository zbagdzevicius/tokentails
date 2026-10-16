// The Motored sponsor label and disclosure; the founder approved this wording (Oct 16, 2026).
// The "Motored fundraising for cats" event (Oct 2026). Motored, a sponsor linked to the Token Tails
// founder, gives to Pink Paw through many small event wallets; every gift carries the memo
// `motored:user-N`. All of it is ONE sponsor's money: it is labelled "Motored-sponsored" and never
// counted as people, outside wallets or public gifts. Backend twin: MOTORED_MEMO_PREFIX and the
// `motored` bucket in backend/src/impact/shelter-logs.ts. The event wallets' public addresses are in
// public/shelter-payouts/motored-event.json (generated from the funding repo, no keys).
import { Disbursement, displayMemo, payoutUnit, to18 } from "./logs";

export const MOTORED_MEMO_PREFIX = "motored:";
export const MOTORED_SPONSOR = "Motored";
export const MOTORED_LABEL = "Motored-sponsored";
export const MOTORED_EVENT = "Motored fundraising for cats";
export const MOTORED_DISCLOSURE = "Motored is linked to the Token Tails founder.";
/** The public list of event wallet addresses, served next to the payouts page. */
export const MOTORED_ADDRESSES_URL = "/shelter-payouts/motored-event.json";

/** Stablecoins whose total is shown as US dollars. Any other coin is never added to the line. */
const USD_SYMBOLS = new Set(["USDC", "USDC.E", "USDG"]);

/**
 * True for a Motored event gift. Anyone can write this memo; a stranger who copies it only makes
 * their own money look like sponsor money, which is the safe direction for an honest count.
 */
export function isMotoredMemo(memo: string | null | undefined): boolean {
  return displayMemo(String(memo || "")).trim().toLowerCase().startsWith(MOTORED_MEMO_PREFIX);
}

export const isMotoredGift = (d: Pick<Disbursement, "memo">) => isMotoredMemo(d.memo);

type ChainUnits = { decimals: number; symbol: string; nativeDecimals?: number; nativeSymbol?: string };

export interface MotoredTotal {
  /** US dollar stablecoins, 18 decimals. */
  usd18: bigint;
  /** Motored-sponsored payouts counted (sponsor gifts, not people). */
  count: number;
}

/** Sums the Motored-sponsored payouts among mainnet feed rows (USD stablecoins only). */
export function motoredTotal(items: { d: Disbursement; chain: ChainUnits | null }[]): MotoredTotal {
  let usd18 = BigInt(0);
  let count = 0;
  for (const { d, chain } of items) {
    if (!chain || !isMotoredGift(d)) continue;
    const unit = payoutUnit(d.kind, chain);
    if (!USD_SYMBOLS.has(unit.symbol.toUpperCase())) continue;
    usd18 += to18(d.amount, unit.decimals);
    count += 1;
  }
  return { usd18, count };
}

/** Rows that are not Motored sponsor money: what any people, outside-wallet or public-gift view may use. */
export const withoutMotored = <T extends { d: Pick<Disbursement, "memo"> }>(items: T[]): T[] =>
  items.filter((item) => !isMotoredGift(item.d));

/** "$12.34" from 18-decimal units, rounded down to the cent (never overstates). */
export function usdText(usd18: bigint): string {
  const cents = usd18 / BigInt("10000000000000000");
  const whole = cents / BigInt(100);
  const frac = (cents % BigInt(100)).toString().padStart(2, "0");
  return `$${whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${frac}`;
}

/** The live line. Null while no Motored gift exists, so nothing is shown before the event. */
export function motoredLine(total: MotoredTotal, shelterName = "Pink Paw"): string | null {
  if (total.count === 0) return null;
  return `${MOTORED_EVENT}: ${usdText(total.usd18)} given to ${shelterName} by ${MOTORED_SPONSOR} on behalf of its users.`;
}

/** Says what the money is and is not. Shown with the line, every time. */
export const motoredNote = (count: number) =>
  `${count} ${MOTORED_LABEL.toLowerCase()} gift${count === 1 ? "" : "s"}, counted as one sponsor's money, never as separate donors. ${MOTORED_DISCLOSURE}`;
