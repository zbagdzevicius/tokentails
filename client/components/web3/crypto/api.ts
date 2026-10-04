// copy-lint: web-only the crypto checkout renders only in WebPayment, which app builds replace with AppCheckoutNotice
/*
 * Client for the crypto checkout API (docs/API.md "Crypto checkout"). Plain fetch with the lowercase
 * `accesstoken` header, like the Stripe client. Every failure becomes a CryptoPayApiError carrying
 * the server's `CRYPTO_PAY_*` code (or null when the server could not be reached).
 */
import { apiUrl } from "@/api/api";
import {
  CRYPTO_PAY_ERROR_CODES,
  CryptoPayConfig,
  CryptoPayConfirmResult,
  CryptoPayErrorCode,
  CryptoPayOrder,
  CryptoPaySku,
} from "@/models/crypto-pay";

export class CryptoPayApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: CryptoPayErrorCode | null,
    message?: string
  ) {
    super(message || `Request failed with status ${status}`);
    this.name = "CryptoPayApiError";
    // Keeps `instanceof` working when TypeScript compiles classes to ES5.
    Object.setPrototypeOf(this, CryptoPayApiError.prototype);
  }
}

const KNOWN = new Set<string>(CRYPTO_PAY_ERROR_CODES as readonly string[]);

const token = () => {
  try {
    return sessionStorage.getItem("accesstoken") || "";
  } catch {
    return "";
  }
};

type FetchFn = typeof fetch;

async function call<T>(
  path: string,
  init: { method?: string; body?: unknown; auth?: boolean } = {},
  fetchFn: FetchFn = fetch
): Promise<{ status: number; body: T }> {
  let response: Response;
  try {
    response = await fetchFn(`${apiUrl}${path}`, {
      method: init.method || "GET",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(init.auth ? { accesstoken: token() } : {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new CryptoPayApiError(0, null, "Could not reach Token Tails. Check your connection and try again.");
  }
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok) {
    const raw = (body as { code?: unknown; message?: unknown } | null) || {};
    const code = typeof raw.code === "string" && KNOWN.has(raw.code) ? (raw.code as CryptoPayErrorCode) : null;
    const message = typeof raw.message === "string" ? raw.message : undefined;
    throw new CryptoPayApiError(response.status, code, message);
  }
  return { status: response.status, body: body as T };
}

export const CRYPTO_PAY_API = {
  config: async (fetchFn?: FetchFn): Promise<CryptoPayConfig> =>
    (await call<CryptoPayConfig>("/payments/crypto/config", {}, fetchFn)).body,

  createOrder: async (sku: CryptoPaySku, discount?: string, fetchFn?: FetchFn): Promise<CryptoPayOrder> =>
    (
      await call<CryptoPayOrder>(
        "/payments/crypto/orders",
        { method: "POST", auth: true, body: discount ? { sku, discount } : { sku } },
        fetchFn
      )
    ).body,

  getOrder: async (orderId: string, fetchFn?: FetchFn): Promise<CryptoPayOrder> =>
    (await call<CryptoPayOrder>(`/payments/crypto/orders/${encodeURIComponent(orderId)}`, { auth: true }, fetchFn)).body,

  /** 200 (`COMPLETE`, `FAILED_GRANT`) or 202 (`CONFIRMING`); every other answer throws. */
  confirm: async (
    orderId: string,
    chainId: number,
    txHash: string,
    fetchFn?: FetchFn
  ): Promise<CryptoPayConfirmResult> =>
    (
      await call<CryptoPayConfirmResult>(
        `/payments/crypto/orders/${encodeURIComponent(orderId)}/confirm`,
        { method: "POST", auth: true, body: { chainId, txHash } },
        fetchFn
      )
    ).body,
};
