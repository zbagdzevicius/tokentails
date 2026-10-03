/**
 * Stripe.js loads lazily and never rejects (known issue: the unhandled `loadStripe()` rejection on
 * /game, fixed in the 7b integration pass). Importing the module must not start a load.
 */
const loadStripe = jest.fn();
jest.mock("@stripe/stripe-js", () => ({ loadStripe: (...args: unknown[]) => loadStripe(...args) }));
jest.mock("@/api/stripe-api", () => ({ STRIPE_API: {} }));

describe("getStripe", () => {
  beforeEach(() => {
    jest.resetModules();
    loadStripe.mockReset();
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  it("does not load Stripe.js at module load", async () => {
    await import("@/components/web3/StripePayment");
    expect(loadStripe).not.toHaveBeenCalled();
  });

  it("resolves null on a blocked load and retries on the next call", async () => {
    const mod = await import("@/components/web3/StripePayment");
    loadStripe.mockRejectedValueOnce(new Error("Failed to load Stripe.js"));
    await expect(mod.getStripe()).resolves.toBeNull();
    const stripe = { elements: jest.fn() };
    loadStripe.mockResolvedValueOnce(stripe);
    await expect(mod.getStripe()).resolves.toBe(stripe);
    // Memoized after a successful load.
    await mod.getStripe();
    expect(loadStripe).toHaveBeenCalledTimes(2);
  });
});
