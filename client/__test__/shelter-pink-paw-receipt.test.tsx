/**
 * @jest-environment jsdom
 */
/**
 * The receipt shows Pink Paw's logo and cats only when one of its payouts went to Pink Paw's own
 * wallet (any letter case), never for another shelter's payout.
 */
import { render, screen, waitFor } from "@testing-library/react";
import { PINK_PAW_WALLET } from "@/components/shelter-payouts/pinkPaw";

const OTHER = "0x1111111111111111111111111111111111111111";
let payoutTo = PINK_PAW_WALLET;
let campaignWallet = PINK_PAW_WALLET;

jest.mock("next/router", () => ({
  useRouter: () => ({ isReady: true, query: { chain: "5042", tx: `0x${"ab".repeat(32)}` } }),
}));
jest.mock("@/components/shelter-payouts/campaign", () => ({
  fetchCampaign: () =>
    Promise.resolve({
      name: "Autumn rescue",
      goalUsdc: "90",
      startDate: "",
      chainId: 5042,
      fromBlock: null,
      shelter: { name: "Pink Paw (Rožinė pėdutė)", wallet: campaignWallet, handover: "held-by-token-tails" },
    }),
}));
jest.mock("@/components/shelter-payouts/rpc", () => ({ fetchDeployments: () => Promise.resolve([]) }));
jest.mock("@/components/shelter-payouts/receipt", () => ({
  TX_HASH: /^0x[0-9a-fA-F]{64}$/,
  receiptChain: () => ({ name: "Test chain", rpc: "", explorer: "https://explorer.test", decimals: 6, symbol: "USDC" }),
  fetchReceipt: () =>
    Promise.resolve({
      success: true,
      blockNumber: 7,
      txHash: `0x${"ab".repeat(32)}`,
      payouts: [
        {
          kind: "erc20",
          contract: "0x2222222222222222222222222222222222222222",
          shelter: payoutTo,
          amount: BigInt(10000),
          memo: "",
          txHash: `0x${"ab".repeat(32)}`,
          blockNumber: 7,
          logIndex: 0,
          listed: true,
        },
      ],
    }),
}));
// The strip reads the shared storefront query (a provider these tests do not mount).
jest.mock("@/components/shelter-payouts/PinkPawShowcase", () => ({
  PinkPawStrip: () => <div data-testid="pink-paw-strip" />,
}));

import { ShelterReceipt } from "@/components/shelter-payouts/ShelterReceipt";

// Mixed case, as a chain log or a hand-written campaign.json might carry it.
const mixedCase = (addr: string) =>
  `0x${addr.slice(2).split("").map((c, i) => (i % 2 ? c.toUpperCase() : c)).join("")}`;

describe("ShelterReceipt and Pink Paw", () => {
  it("shows the strip for a payout to Pink Paw's wallet, in any letter case", async () => {
    payoutTo = mixedCase(PINK_PAW_WALLET);
    campaignWallet = PINK_PAW_WALLET;
    render(<ShelterReceipt />);
    await screen.findByTestId("receipt-card");
    await waitFor(() => expect(screen.getByTestId("pink-paw-strip")).toBeTruthy());
  });

  it("does not show it for another shelter's wallet, even when that is the campaign wallet", async () => {
    payoutTo = OTHER;
    campaignWallet = OTHER;
    render(<ShelterReceipt />);
    await screen.findByTestId("receipt-card");
    // Let the campaign fetch settle before asserting the absence.
    await waitFor(() => expect(screen.getByText(/Pink Paw \(Rožinė pėdutė\)/)).toBeTruthy());
    expect(screen.queryByTestId("pink-paw-strip")).toBeNull();
  });
});
