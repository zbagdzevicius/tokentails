/**
 * @jest-environment jsdom
 */
/**
 * /shelter-payouts/give network chips: the server-paid treat can be sent on any chain the backend
 * serves (GET /shelter/donate/status `chains`). Arc first, then Arbitrum, Base, Avalanche, Robinhood,
 * Tempo; each chip names its coin; chains the backend does not serve are greyed out with a reason;
 * `?chain=<id>` picks a chain on load; the receipt line names the chain.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { DonateStatus } from "@/api/shelter-api";

const getDonateStatus = jest.fn();
const donate = jest.fn();
const requireAccount = jest.fn();
let query: Record<string, string> = { from: "heist" };

jest.mock("@/api/shelter-api", () => ({
  SHELTER_API: {
    getDonateStatus: () => getDonateStatus(),
    donate: (...args: unknown[]) => donate(...args),
  },
}));
jest.mock("@/context/FirebaseAuthContext", () => ({
  useFirebaseAuth: () => ({ authStatus: "ready", requireAccount }),
}));
jest.mock("next/router", () => ({ useRouter: () => ({ query }) }));
jest.mock("@/components/shelter-payouts/campaign", () => ({
  fetchCampaign: () => Promise.reject(new Error("offline")),
}));
jest.mock("@/components/shelter-payouts/Celebration", () => ({ Celebration: () => null }));
jest.mock("@/components/shelter-payouts/PinkPawShowcase", () => ({ PinkPawLogo: () => null, PinkPawStrip: () => null }));

import { GiveTreat } from "@/components/shelter-payouts/GiveTreat";
import { initialTreatChain, parseChainParam, treatChips, treatsLeft } from "@/components/shelter-payouts/treatChains";

const CENT = "10000000000000000"; // 0.01 in 18 decimals
const chain = (chainId: number, coin: string, extra: Record<string, unknown> = {}) => ({
  chainId,
  main: false,
  testnet: true,
  enabled: true,
  railState: "live" as const,
  coin,
  amountWei: CENT,
  remainingTodayWei: "50000000000000000",
  splitAddress: "0x1111111111111111111111111111111111111111",
  explorer: null,
  ...extra,
});

/** Testnet backend: Arc testnet main, Base Sepolia and Tempo testnet served, Arbitrum Sepolia paused. */
const testnetStatus: DonateStatus = {
  enabled: true,
  chainId: 5042002,
  amountWei: CENT,
  remainingTodayWei: "50000000000000000",
  splitAddress: "0x1111111111111111111111111111111111111111",
  chains: [
    chain(5042002, "USDC", { main: true }),
    chain(84532, "USDC"),
    chain(42431, "pathUSD"),
    chain(421614, "USDC", { enabled: false, railState: "paused" }),
  ],
};

const mainnetStatus: DonateStatus = {
  enabled: true,
  chainId: 5042,
  amountWei: CENT,
  remainingTodayWei: "50000000000000000",
  splitAddress: "0x1111111111111111111111111111111111111111",
  chains: [
    chain(5042, "USDC", { main: true, testnet: false }),
    chain(4217, "USDC.e", { testnet: false }),
    chain(4663, "USDG", { testnet: false, enabled: false, railState: "paused" }),
    chain(8453, "USDC", { testnet: false, remainingTodayWei: "0", railState: "exhausted" }),
  ],
};

const chipIds = () =>
  screen.getAllByRole("radio").map((el) => Number(el.getAttribute("data-testid")!.replace("treat-chain-", "")));

describe("GiveTreat network chips", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    query = { from: "heist" };
  });

  it("lists Arc, Arbitrum, Base, Avalanche, Robinhood, Tempo, Monad; only served chains can be picked", async () => {
    getDonateStatus.mockResolvedValue(testnetStatus);
    render(<GiveTreat />);
    await screen.findByTestId("treat-networks");

    expect(chipIds()).toEqual([5042002, 421614, 84532, 43113, 46630, 42431, 10143]);
    const arc = screen.getByTestId("treat-chain-5042002") as HTMLButtonElement;
    expect(arc.getAttribute("aria-checked")).toBe("true");
    expect(arc.textContent).toMatch(/Arc Testnet/);
    expect((screen.getByTestId("treat-chain-84532") as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByTestId("treat-chain-42431").textContent).toMatch(/pathUSD/);

    // Not served, or paused: disabled, with a short reason.
    const fuji = screen.getByTestId("treat-chain-43113") as HTMLButtonElement;
    expect(fuji.disabled).toBe(true);
    expect(fuji.textContent).toMatch(/Not open yet/);
    const arb = screen.getByTestId("treat-chain-421614") as HTMLButtonElement;
    expect(arb.disabled).toBe(true);
    expect(arb.textContent).toMatch(/Paused/);
  });

  it("names the coin each mainnet chip pays in (USDC, USDC.e on Tempo, USDG on Robinhood)", async () => {
    getDonateStatus.mockResolvedValue(mainnetStatus);
    render(<GiveTreat />);
    await screen.findByTestId("treat-networks");

    expect(chipIds()).toEqual([5042, 42161, 8453, 43114, 4663, 4217, 143]);
    expect(screen.getByTestId("treat-chain-5042").textContent).toMatch(/USDC/);
    expect(screen.getByTestId("treat-chain-4217").textContent).toMatch(/USDC\.e/);
    expect(screen.getByTestId("treat-chain-4663").textContent).toMatch(/USDG/);
    expect(screen.getByTestId("treat-chain-143").textContent).toMatch(/USDC/);
    expect((screen.getByTestId("treat-chain-143") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId("treat-chain-4663") as HTMLButtonElement).disabled).toBe(true);
    // A spent budget on one chain closes that chip only.
    expect(screen.getByTestId("treat-chain-8453").textContent).toMatch(/Jar empty today/);
    expect((screen.getByTestId("treat-chain-4217") as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByTestId("treat-amount").textContent).toMatch(/0\.01 USDC on Arc/);
  });

  it("sends on the main chain exactly as before when Arc stays picked", async () => {
    getDonateStatus.mockResolvedValue(testnetStatus);
    donate.mockResolvedValue({
      status: "sent",
      receipt: { txHash: `0x${"ab".repeat(32)}`, chainId: 5042002, amountWei: CENT, explorerUrl: "" },
    });
    render(<GiveTreat />);
    await screen.findByTestId("treat-networks");
    await act(async () => {
      fireEvent.click(screen.getByTestId("send-treat"));
    });
    expect(donate).toHaveBeenCalledWith("heist", undefined);
  });

  it("switches the network on a tap and sends there; the sent line and receipt link name the chain", async () => {
    getDonateStatus.mockResolvedValue(testnetStatus);
    const tx = `0x${"cd".repeat(32)}`;
    donate.mockResolvedValue({
      status: "sent",
      receipt: { txHash: tx, chainId: 42431, amountWei: CENT, explorerUrl: "https://explore.testnet.tempo.xyz/tx/x", coin: "pathUSD" },
    });
    render(<GiveTreat />);
    await screen.findByTestId("treat-networks");

    fireEvent.click(screen.getByTestId("treat-chain-42431"));
    expect(screen.getByTestId("treat-chain-42431").getAttribute("aria-checked")).toBe("true");
    expect(screen.getByTestId("treat-amount").textContent).toMatch(/0\.01 pathUSD on Tempo Testnet/);

    await act(async () => {
      fireEvent.click(screen.getByTestId("send-treat"));
    });
    expect(donate).toHaveBeenCalledWith("heist", 42431);
    expect(screen.getByTestId("treat-sent-line").textContent).toBe(
      "0.01 pathUSD is on its way to Pink Paw (Rožinė pėdutė) on Tempo Testnet."
    );
    const link = screen.getByText("See your receipt").closest("a")!;
    expect(link.getAttribute("href")).toBe(`/shelter-payouts/receipt?chain=42431&tx=${tx}`);
    // The network is locked once the treat is on its way.
    expect((screen.getByTestId("treat-chain-84532") as HTMLButtonElement).disabled).toBe(true);
  });

  it("picks ?chain=<id> on load when that chain is open", async () => {
    query = { from: "heist", chain: "84532" };
    getDonateStatus.mockResolvedValue(testnetStatus);
    donate.mockResolvedValue({ status: "already-sent" });
    render(<GiveTreat />);
    await waitFor(() => expect(screen.getByTestId("treat-chain-84532").getAttribute("aria-checked")).toBe("true"));
    expect(screen.getByTestId("treat-amount").textContent).toMatch(/on Base Sepolia/);
    expect(screen.queryByTestId("treat-chain-fallback")).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByTestId("send-treat"));
    });
    expect(donate).toHaveBeenCalledWith("heist", 84532);
  });

  it("falls back to Arc, and says so, when ?chain= names a closed or unknown chain", async () => {
    for (const wanted of ["421614", "43113", "999", "abc"]) {
      query = { from: "heist", chain: wanted };
      getDonateStatus.mockResolvedValue(testnetStatus);
      const { unmount } = render(<GiveTreat />);
      await waitFor(() =>
        expect(screen.getByTestId("treat-chain-5042002").getAttribute("aria-checked")).toBe("true")
      );
      if (wanted === "abc") expect(screen.queryByTestId("treat-chain-fallback")).toBeNull();
      else expect((await screen.findByTestId("treat-chain-fallback")).textContent).toMatch(/Arc Testnet/);
      unmount();
    }
  });
});

describe("treatChips", () => {
  it("shows every chip closed while the backend is unreachable", () => {
    const chips = treatChips(null);
    expect(chips.map((c) => c.chainId)).toEqual([5042, 42161, 8453, 43114, 4663, 4217, 143]);
    expect(chips.every((c) => !c.enabled && c.reason === "Offline")).toBe(true);
  });

  it("reads an older backend without `chains` as the main chain only", () => {
    const chips = treatChips({ enabled: true, chainId: 5042, amountWei: CENT, remainingTodayWei: CENT, splitAddress: null });
    expect(chips.filter((c) => c.enabled).map((c) => c.chainId)).toEqual([5042]);
    expect(initialTreatChain(chips, 8453, 5042)).toBe(5042);
  });

  it("parses only positive whole chain ids", () => {
    expect(parseChainParam("84532")).toBe(84532);
    for (const bad of ["", "0", "-1", "1e3", "0x14a34", "84532abc", undefined]) expect(parseChainParam(bad)).toBeNull();
  });

  it("counts treats left with the backend's per-chain cap, not only the budget", () => {
    // Base: 0.99 left in the budget (99 treats) but a 10-a-day gift cap with 9 left.
    expect(treatsLeft({ amountWei: CENT, remainingTodayWei: "990000000000000000", treatsLeftToday: 9 })).toBe(BigInt(9));
    expect(treatsLeft({ amountWei: CENT, remainingTodayWei: "50000000000000000", treatsLeftToday: 9 })).toBe(BigInt(5));
    expect(treatsLeft({ amountWei: CENT, remainingTodayWei: "50000000000000000" })).toBe(BigInt(5));
  });
});
