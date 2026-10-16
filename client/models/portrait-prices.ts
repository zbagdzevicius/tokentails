/**
 * Portrait prices as shown to buyers. Server: backend/src/payments/price-table.ts, which decides what
 * Stripe charges; these copies only display it (docs/DEVELOPMENT.md lists every copy, and
 * client/__test__/portrait-prices.test.tsx fails if they differ).
 *
 * - Card checkout (Stripe Checkout Session on /portrait and /portraits): euros,
 *   `PORTRAIT_CHECKOUT_PRICES_CENTS`.
 * - The codex Immortalize flow (a USD PaymentIntent) sells the digital portrait only, at
 *   `PORTRAIT_PRICES_CENTS.digital`.
 *
 * Displayed equals charged: no strike-through, no "was" price, no timer (yourcat-v2.md section 6.4).
 */
export type PortraitProductType = "digital" | "print" | "canvas";

export const PORTRAIT_CHECKOUT_CURRENCY = "EUR" as const;

/** Card checkout prices in euros. */
export const PORTRAIT_CHECKOUT_PRICES: Readonly<Record<PortraitProductType, number>> = {
  digital: 14,
  print: 49,
  canvas: 69,
};

/** The digital portrait in the codex flow, charged in US dollars. */
export const CODEX_DIGITAL_PORTRAIT_USD = 16;

/**
 * "€14", "€49", "$16": whole amounts without decimals, other amounts with two. The currency is an ISO
 * code ("EUR", "USD").
 */
export function formatPortraitPrice(amount: number, currency: "EUR" | "USD" = PORTRAIT_CHECKOUT_CURRENCY): string {
  const symbol = currency === "EUR" ? "€" : "$";
  const value = Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
  return `${symbol}${value}`;
}
