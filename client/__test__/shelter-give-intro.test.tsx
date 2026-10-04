/**
 * @jest-environment jsdom
 */
/**
 * The give page intro (claim C-004) names the coin of the picked network: USDC, USDC.e on Tempo,
 * USDG on Robinhood Chain. Before the status arrives it names the default network's coin (Arc, USDC).
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { DonateStatus } from "@/api/shelter-api";

const getDonateStatus = jest.fn();
jest.mock("@/api/shelter-api", () => ({
  SHELTER_API: { getDonateStatus: () => getDonateStatus(), donate: jest.fn() },
}));
jest.mock("@/context/FirebaseAuthContext", () => ({
  useFirebaseAuth: () => ({ authStatus: "ready", requireAccount: jest.fn() }),
}));
jest.mock("next/router", () => ({ useRouter: () => ({ query: {} }) }));
jest.mock("@/components/shelter-payouts/campaign", () => ({
  fetchCampaign: () => Promise.reject(new Error("offline")),
}));
jest.mock("@/components/shelter-payouts/Celebration", () => ({ Celebration: () => null }));
jest.mock("@/components/shelter-payouts/PinkPawShowcase", () => ({ PinkPawLogo: () => null, PinkPawStrip: () => null }));

import { GiveTreat } from "@/components/shelter-payouts/GiveTreat";

const CENT = "10000000000000000";
const chain = (chainId: number, coin: string, extra: Record<string, unknown> = {}) => ({
  chainId,
  main: false,
  testnet: false,
  enabled: true,
  railState: "live" as const,
  coin,
  amountWei: CENT,
  remainingTodayWei: "50000000000000000",
  splitAddress: "0x1111111111111111111111111111111111111111",
  explorer: null,
  ...extra,
});
const status: DonateStatus = {
  enabled: true,
  chainId: 5042,
  amountWei: CENT,
  remainingTodayWei: "50000000000000000",
  splitAddress: "0x1111111111111111111111111111111111111111",
  chains: [chain(5042, "USDC", { main: true }), chain(4217, "USDC.e"), chain(4663, "USDG")],
};

const intro = () => screen.getByText(/One tap and Token Tails sends a small/).textContent!;

describe("GiveTreat intro (C-004)", () => {
  it("names the default network's coin first, then follows the picked network's coin", async () => {
    let resolve!: (s: DonateStatus) => void;
    getDonateStatus.mockReturnValue(new Promise<DonateStatus>((r) => (resolve = r)));
    render(<GiveTreat />);
    expect(intro()).toMatch(/a small USDC treat to the shelter/);
    await act(async () => resolve(status));
    await screen.findByTestId("treat-networks");
    expect(intro()).toMatch(/a small USDC treat to the shelter/);
    await act(async () => {
      fireEvent.click(screen.getByTestId("treat-chain-4217"));
    });
    expect(intro()).toMatch(/a small USDC\.e treat/);
    await act(async () => {
      fireEvent.click(screen.getByTestId("treat-chain-4663"));
    });
    expect(intro()).toMatch(/a small USDG treat/);
  });
});
