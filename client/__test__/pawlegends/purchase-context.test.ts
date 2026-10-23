/**
 * @jest-environment jsdom
 */
/**
 * `purchaseContext` reaches both Token Tails checkouts (card: `POST /web3/create-payment`, crypto:
 * `POST /payments/crypto/orders`) as four named fields, and nothing is added for other callers.
 */
import { STRIPE_API, purchaseContextFields } from "@/api/stripe-api";
import { CRYPTO_PAY_API } from "@/components/web3/crypto/api";
import { EntityType } from "@/models/save";

const CONTEXT = { context: "pawlegends", ageBand: "18+", deviceId: "d0123456789abcdef", consentVersion: "2026-10-23" } as const;

const okFetch = (body: unknown) =>
  jest.fn(async () => ({ ok: true, status: 201, json: async () => body }) as unknown as Response);

describe("purchase context", () => {
  it("is copied by name, and empty without one", () => {
    expect(purchaseContextFields({ ...CONTEXT, extra: 1 } as never)).toEqual(CONTEXT);
    expect(purchaseContextFields(undefined)).toEqual({});
  });

  it("goes with the card checkout's create-payment", async () => {
    const fetchMock = okFetch({ clientSecret: "pi_secret" });
    (globalThis as { fetch?: unknown }).fetch = fetchMock;
    await STRIPE_API.createPaymentIntent(5, "65a1b2c3d4e5f6a7b8c9d0e1", undefined, {
      entityType: EntityType.CAT,
      purchaseContext: CONTEXT,
    });
    const body = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body).toMatchObject({ id: "65a1b2c3d4e5f6a7b8c9d0e1", entityType: EntityType.CAT, ...CONTEXT });
    await STRIPE_API.createPaymentIntent(5, "65a1b2c3d4e5f6a7b8c9d0e1", undefined, { entityType: EntityType.CAT });
    const plain = JSON.parse(String((fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].body));
    expect(plain).not.toHaveProperty("context");
  });

  it("goes with the crypto order", async () => {
    const fetchMock = okFetch({ orderId: "co_1", accepted: [] });
    await CRYPTO_PAY_API.createOrder({ kind: "CAT", catId: "65a1b2c3d4e5f6a7b8c9d0e1" } as never, undefined, fetchMock as never, CONTEXT);
    const body = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body).toEqual({ sku: { kind: "CAT", catId: "65a1b2c3d4e5f6a7b8c9d0e1" }, ...CONTEXT });
  });
});
