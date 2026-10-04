/**
 * @jest-environment jsdom
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";

/**
 * Task 4c review: the purchase gate ("Buying needs an account") is for guests and signed-out
 * visitors only. A registered player whose profile is loading waits; one whose profile refreshes
 * mid-checkout keeps the checkout mounted.
 */

jest.mock("@/models/app", () => ({ isApp: false, isProd: false }));
jest.mock("@/constants/utils", () => ({ cdnFile: (p: string) => `/${p}` }));
jest.mock("@/context/ToastContext", () => ({ useToast: () => jest.fn() }));
jest.mock("@/components/audio/uiSounds", () => ({ playUiSound: jest.fn() }));
jest.mock("@/api/order-api", () => ({ ORDER_API: { validateDiscount: jest.fn() } }));
jest.mock("@/components/web3/StripePayment", () => ({ StripePayment: () => <div data-testid="stripe-checkout" /> }));
jest.mock("@/components/web3/transfer/Web3Transfer", () => ({ Web3Transfer: () => null }));
jest.mock("@/components/web3/crypto/CryptoCheckout", () => ({
  CryptoCheckout: ({ sku, discount }: { sku: unknown; discount?: string }) => (
    <div data-testid="crypto-checkout" data-sku={JSON.stringify(sku)} data-discount={discount ?? ""} />
  ),
}));
const mockCryptoConfig: { value: unknown } = { value: undefined };
jest.mock("@/components/web3/crypto/useCryptoPayConfig", () => {
  const actual = jest.requireActual("@/components/web3/crypto/useCryptoPayConfig");
  return { ...actual, useCryptoPayConfig: () => mockCryptoConfig.value };
});
const openConfig = (packs: Record<string, number> = { STARTER: 5, INFLUENCER: 25, LEGENDARY: 350 }) => ({
  enabled: true,
  network: "testnet",
  orderTtlSeconds: 1800,
  prices: { packs, shelterCat: 5, lootBox: 5 },
  chains: [{ chainId: 84532, name: "Base Sepolia", testnet: true, tokens: [] }],
});
jest.mock("@/components/web3/Web3Providers", () => ({
  Web3Providers: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const mockAccount: { hasAuth: boolean; authStatus: string } = { hasAuth: true, authStatus: "ready" };
jest.mock("@/hooks/useAccountAction", () => ({
  useAccountAction: () => ({
    hasAuth: mockAccount.hasAuth,
    authStatus: mockAccount.authStatus,
    isRegistered: mockAccount.authStatus === "ready",
    isGuest: mockAccount.authStatus === "guest",
    runWithAccount: jest.fn(),
  }),
}));

import { Payment } from "@/components/web3/Payment";
import { EntityType } from "@/models/save";

const renderPayment = () => <Payment price={5} entityType={EntityType.PACK} id="STARTER" productName="Starter" />;

beforeEach(() => {
  mockCryptoConfig.value = openConfig();
  mockAccount.hasAuth = true;
  mockAccount.authStatus = "ready";
});

describe("Payment account gate", () => {
  it.each(["guest", "signed-out"])("asks a %s visitor to sign in", (status) => {
    mockAccount.authStatus = status;
    render(renderPayment());
    expect(screen.getByTestId("purchase-account-gate")).toBeTruthy();
    expect(screen.queryByTestId("stripe-checkout")).toBeNull();
  });

  it.each(["unknown", "loading-profile"])("shows a wait, not the gate, while the account is %s", (status) => {
    mockAccount.authStatus = status;
    render(renderPayment());
    expect(screen.queryByTestId("purchase-account-gate")).toBeNull();
    expect(screen.getByTestId("purchase-account-pending")).toBeTruthy();
  });

  it("shows the checkout to an account", () => {
    render(renderPayment());
    expect(screen.getByTestId("crypto-checkout")).toBeTruthy();
    expect(screen.queryByTestId("purchase-account-gate")).toBeNull();
  });

  it("keeps the checkout mounted while an account's profile refreshes", () => {
    const { rerender } = render(renderPayment());
    const checkout = screen.getByTestId("crypto-checkout");
    mockAccount.authStatus = "loading-profile";
    rerender(renderPayment());
    expect(screen.getByTestId("crypto-checkout")).toBe(checkout);
    expect(screen.queryByTestId("purchase-account-gate")).toBeNull();
    expect(screen.queryByTestId("purchase-account-pending")).toBeNull();
  });

  it("keeps the old flow on pages without the auth runtime", () => {
    mockAccount.hasAuth = false;
    mockAccount.authStatus = "unknown";
    render(renderPayment());
    expect(screen.getByTestId("crypto-checkout")).toBeTruthy();
  });
});

describe("Payment methods", () => {
  it("opens on crypto by default when it is offered, and card is one tap away", () => {
    render(renderPayment());
    expect(screen.getByTestId("crypto-checkout")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /pay with card/i }));
    expect(screen.getByTestId("stripe-checkout")).toBeTruthy();
    expect(screen.queryByTestId("crypto-checkout")).toBeNull();
  });

  it("offers card and crypto (USDC / EURC) for a pack; Stellar is gone", () => {
    render(renderPayment());
    expect(screen.getByRole("button", { name: /pay with card/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /pay with crypto \(usdc \/ eurc\)/i }));
    expect(screen.getByTestId("crypto-checkout").getAttribute("data-sku")).toBe(JSON.stringify({ kind: "PACK", packType: "STARTER" }));
    expect(screen.queryByTestId("stripe-checkout")).toBeNull();
    expect(document.body.textContent).not.toMatch(/Stellar/);
  });

  it("sells a shelter cat by card or crypto, never with a discount code", () => {
    const catId = "67b48fafd6c26c6cd40bfec6";
    render(<Payment price={5} entityType={EntityType.CAT} id={catId} productName="Mochi · Basic tier" />);
    expect(screen.queryByRole("button", { name: /discount code/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /pay with crypto/i }));
    expect(screen.getByTestId("crypto-checkout").getAttribute("data-sku")).toBe(JSON.stringify({ kind: "CAT", catId }));
  });

  it.each([
    ["closed", { ...openConfig(), enabled: false, chains: [] }],
    ["unreadable", null],
    ["still loading", undefined],
  ])("hides Pay with crypto while the config is %s", (_label, cfg) => {
    mockCryptoConfig.value = cfg;
    render(renderPayment());
    expect(screen.queryByRole("button", { name: /pay with crypto/i })).toBeNull();
    expect(screen.getByTestId("stripe-checkout")).toBeTruthy();
  });

  it("shows the price the server charges, not the caller's copy (Legendary $400 vs $350)", () => {
    render(<Payment price={400} entityType={EntityType.PACK} id="LEGENDARY" productName="Legendary" />);
    expect(document.body.textContent).toContain("$350.00");
    expect(document.body.textContent).not.toContain("$400.00");
  });

  it("keeps the caller's price when the config is unreadable", () => {
    mockCryptoConfig.value = null;
    render(<Payment price={400} entityType={EntityType.PACK} id="LEGENDARY" productName="Legendary" />);
    expect(document.body.textContent).toContain("$400.00");
  });

  it("offers only the card where crypto does not sell the item", () => {
    render(<Payment price={5} entityType={EntityType.IMAGE} id="x" />);
    expect(screen.queryByRole("button", { name: /pay with crypto/i })).toBeNull();
    expect(screen.getByTestId("stripe-checkout")).toBeTruthy();
  });
});
