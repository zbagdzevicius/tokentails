/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen } from "@testing-library/react";

/**
 * Task 4c review: the purchase gate ("Buying needs an account") is for guests and signed-out
 * visitors only. A registered player whose profile is loading waits; one whose profile refreshes
 * mid-checkout keeps the checkout mounted.
 */

jest.mock("@/models/app", () => ({ isApp: false, isProd: false }));
jest.mock("@/constants/utils", () => ({ cdnFile: (p: string) => `/${p}` }));
jest.mock("@/context/ToastContext", () => ({ useToast: () => jest.fn() }));
jest.mock("@/api/order-api", () => ({ ORDER_API: { validateDiscount: jest.fn() } }));
jest.mock("@/components/web3/StripePayment", () => ({ StripePayment: () => <div data-testid="stripe-checkout" /> }));
jest.mock("@/components/web3/transfer/Web3Transfer", () => ({ Web3Transfer: () => null }));
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
    expect(screen.getByTestId("stripe-checkout")).toBeTruthy();
    expect(screen.queryByTestId("purchase-account-gate")).toBeNull();
  });

  it("keeps the checkout mounted while an account's profile refreshes", () => {
    const { rerender } = render(renderPayment());
    const checkout = screen.getByTestId("stripe-checkout");
    mockAccount.authStatus = "loading-profile";
    rerender(renderPayment());
    expect(screen.getByTestId("stripe-checkout")).toBe(checkout);
    expect(screen.queryByTestId("purchase-account-gate")).toBeNull();
    expect(screen.queryByTestId("purchase-account-pending")).toBeNull();
  });

  it("keeps the old flow on pages without the auth runtime", () => {
    mockAccount.hasAuth = false;
    mockAccount.authStatus = "unknown";
    render(renderPayment());
    expect(screen.getByTestId("stripe-checkout")).toBeTruthy();
  });
});
