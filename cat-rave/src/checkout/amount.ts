/**
 * F-CHECKOUT: amount rules and the cover-the-fee quote (CHECKOUT-SPEC.md sections 4 and 8).
 * $1 = 1 cat. Fixed options $1 and $5; custom is whole dollars, `customMin` ≤ N ≤ `max`.
 * The server recomputes everything; this module only drives labels and inline messages.
 */

export interface PriceRules {
  fixed: readonly number[];
  customMin: number;
  max: number;
}
export interface FeeRules {
  percentBps: number;
  fixedCents: number;
}

export const DEFAULT_PRICES: PriceRules = Object.freeze({ fixed: Object.freeze([1, 5]), customMin: 10, max: 500 });
export const DEFAULT_FEE: FeeRules = Object.freeze({ percentBps: 290, fixedCents: 30 });

/** Integer ceil(a / b) for non-negative a and positive b. */
function ceilDiv(a: number, b: number): number {
  return Math.floor((a + b - 1) / b);
}

/** True when `cats` is a valid order: a fixed option or a custom amount in range, never above `max`. */
export function isValidCats(cats: number, rules: PriceRules = DEFAULT_PRICES): boolean {
  if (!Number.isInteger(cats) || cats < 1 || cats > rules.max) return false;
  return rules.fixed.includes(cats) || cats >= rules.customMin;
}

export type CustomParse = { ok: true; cats: number } | { ok: false; message: string };

/**
 * Parses the custom amount field: whole dollars only ("$25", "25", " 25 "), min `customMin`,
 * max `max`. "10.50", "1e3", "-5" and empty are refused with a short message.
 */
export function parseCustom(raw: string, rules: PriceRules = DEFAULT_PRICES): CustomParse {
  const s = String(raw ?? '').trim().replace(/^\$\s*/, '').replace(/,/g, '');
  if (!s) return { ok: false, message: `Enter a whole dollar amount, $${rules.customMin} or more.` };
  if (!/^\d+$/.test(s)) return { ok: false, message: 'Whole dollars only (1 dollar = 1 cat).' };
  const cats = Number(s);
  if (!Number.isSafeInteger(cats)) return { ok: false, message: `At most $${rules.max} at a time.` };
  if (cats < rules.customMin) return { ok: false, message: `Custom starts at $${rules.customMin}.` };
  if (cats > rules.max) return { ok: false, message: `At most $${rules.max} at a time.` };
  return { ok: true, cats };
}

/** Clamps a stepper value into the custom range. */
export function clampCustom(cats: number, rules: PriceRules = DEFAULT_PRICES): number {
  if (!Number.isFinite(cats)) return rules.customMin;
  return Math.min(rules.max, Math.max(rules.customMin, Math.round(cats)));
}

export interface Quote {
  donationCents: number;
  feeCents: number;
  amountCents: number;
}

/**
 * The card quote. With `coverFee` the payment is grossed up so that payment − Stripe fee ≥ the
 * donation: amount = ceil((donation + F) × 10000 / (10000 − bps)). USDC never carries a fee.
 */
export function quote(cats: number, coverFee: boolean, fee: FeeRules = DEFAULT_FEE, method: 'card' | 'usdc' = 'card'): Quote {
  const donationCents = Math.max(0, Math.round(cats)) * 100;
  if (!coverFee || method === 'usdc' || donationCents === 0) return { donationCents, feeCents: 0, amountCents: donationCents };
  const bps = Math.min(9999, Math.max(0, Math.round(fee.percentBps)));
  const fixed = Math.max(0, Math.round(fee.fixedCents));
  const amountCents = ceilDiv((donationCents + fixed) * 10000, 10000 - bps);
  return { donationCents, feeCents: amountCents - donationCents, amountCents };
}

/** "$5", "$5.46", "$0.46", "$1,234.50". */
export function formatCents(cents: number): string {
  const c = Math.max(0, Math.round(cents));
  const dollars = Math.floor(c / 100);
  const rest = c % 100;
  const d = dollars.toLocaleString('en-US');
  return rest ? `$${d}.${String(rest).padStart(2, '0')}` : `$${d}`;
}

/** "1 cat", "5 cats", "1,000 cats". */
export function catsLabel(n: number): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? 'cat' : 'cats'}`;
}
