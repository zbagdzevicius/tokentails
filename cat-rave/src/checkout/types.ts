/**
 * F-CHECKOUT: wire types for the Moon Rave checkout (CHECKOUT-SPEC.md section 4). Kept in this lane
 * (not src/types.ts). Money is integer cents; the server computes every amount it charges.
 */

export type RaveMethod = 'card' | 'usdc';

/** GET /rave/status. `enabled: false` → the page keeps today's Add-a-cat sheet. */
export interface RaveStatusOff {
  enabled: false;
  reason?: 'stripe' | 'keeper' | 'mode' | 'cap' | 'unreachable' | 'unknown' | string;
}
/**
 * `enabled: true` when card or crypto is open. Card needs a Stripe publishable key; crypto is USDC on
 * Arc only (the client drops every other chain the server might list).
 */
export interface RaveStatusOn {
  enabled: true;
  livemode: boolean;
  /** Null when card is closed (the server may omit the key then). */
  publishableKey: string | null;
  card: boolean;
  usdc: { enabled: boolean; chains: number[] };
  /** Why a method is closed (`reasons.card` / `reasons.usdc` from the server, or a client reason). */
  reasons: { card: string | null; usdc: string | null };
  prices: { fixed: number[]; customMin: number; max: number };
  fee: { percentBps: number; fixedCents: number };
  /**
   * The buyer's country from the request IP, when the backend puts it here (null = not detected: the
   * sheet shows the country picker). Absent = the page asks `GET /rave/geo` instead.
   */
  country?: string | null;
}
export type RaveStatus = RaveStatusOff | RaveStatusOn;

/** POST /rave/checkout body. */
export interface CheckoutRequest {
  cats: number;
  method: RaveMethod;
  coverFee: boolean;
  names: string[];
  restName: string;
  x: string;
  clientKey: string;
  /** ISO 3166-1 alpha-2 (IP country when detected, else the buyer's pick), or "none" (Show my flag off). Left out when unknown. */
  country?: string;
}

/** POST /rave/checkout answer (card: clientSecret; usdc: memo + usdc). */
export interface CheckoutAnswer {
  orderId: string;
  clientSecret: string | null;
  amountCents: number;
  donationCents: number;
  feeCents: number;
  cats: number;
  names: string[];
  restName?: string | null;
  x?: string | null;
  memo?: string;
  usdc?: { chains: number[]; amountUnits6: string };
}

export type RaveOrderStatus = 'created' | 'pending' | 'paid' | 'review' | 'onchain' | 'canceled' | 'refunded' | 'disputed' | 'expired';

/** One row of GET /rave/cats (and GET /rave/orders/:id, which adds the money fields). */
export interface RaveOrderRow {
  orderId: string;
  cats: number;
  names: string[];
  restName?: string | null;
  x?: string | null;
  status: RaveOrderStatus;
  chainId?: number | null;
  payoutTx?: string | null;
  method?: RaveMethod;
  createdAt?: string;
  amountCents?: number;
  feeCents?: number;
}

/** What the sheet hands the page after a successful payment (starts the arrival animation). */
export interface PaidOrder {
  orderId: string;
  cats: number;
  /** Every cat's name, expanded ("Disco 11", "Disco 12", …), at most `cats` long. */
  names: string[];
  x: string | null;
  method: RaveMethod;
  /** `pending` (card processing, or a USDC tx not verified yet) or `paid`. */
  status: RaveOrderStatus;
  /** USDC: the wallet tx; card: null until the keeper pays. */
  txHash: string | null;
  chainId: number | null;
  /** The raw checkout answer (pass to the data lane's `orders.track(answer, status)`). */
  answer: CheckoutAnswer;
}

/** Backend error body (Nest: `{ statusCode, code, message, fields? }`). */
export interface RaveFieldError {
  index: number | 'rest';
  code: string;
}
