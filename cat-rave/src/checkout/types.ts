/**
 * F-CHECKOUT: wire types for the Moon Rave checkout (CHECKOUT-SPEC.md section 4). Kept in this lane
 * (not src/types.ts). Money is integer cents; the server computes every amount it charges.
 */

export type RaveMethod = 'card' | 'usdc';

/** GET /rave/status. `enabled: false` → the page keeps today's Add-a-cat sheet. */
export interface RaveStatusOff {
  enabled: false;
  reason?: 'off' | 'stripe' | 'keeper' | 'mode' | 'cap' | 'unreachable' | string;
}
export interface RaveStatusOn {
  enabled: true;
  livemode: boolean;
  publishableKey: string;
  card: boolean;
  usdc: { enabled: boolean; chains: number[] };
  prices: { fixed: number[]; customMin: number; max: number };
  fee: { percentBps: number; fixedCents: number };
  payoutsDelayed: boolean;
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
