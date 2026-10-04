/**
 * @jest-environment jsdom
 */
/**
 * A treat sent on a picked network: the receipt names that chain, and so does the share card.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { SHELTER_CHAINS } from "@/components/shelter-payouts/chains";
import { PINK_PAW_WALLET } from "@/components/shelter-payouts/pinkPaw";

const downloadShareCard = jest.fn();
let chainId = "84532";

jest.mock("next/router", () => ({
  useRouter: () => ({ isReady: true, query: { chain: chainId, tx: `0x${"ab".repeat(32)}` } }),
}));
jest.mock("@/components/shelter-payouts/campaign", () => ({
  fetchCampaign: () =>
    Promise.resolve({
      name: "Autumn rescue",
      goalUsdc: "90",
      startDate: "",
      chainId: 5042,
      fromBlock: null,
      shelter: { name: "Pink Paw (Rožinė pėdutė)", wallet: PINK_PAW_WALLET, handover: "held-by-token-tails" },
    }),
}));
jest.mock("@/components/shelter-payouts/rpc", () => ({ fetchDeployments: () => Promise.resolve([]) }));
jest.mock("@/components/shelter-payouts/shareCard", () => ({
  downloadShareCard: (data: unknown) => downloadShareCard(data),
}));
jest.mock("@/components/shelter-payouts/receipt", () => ({
  TX_HASH: /^0x[0-9a-fA-F]{64}$/,
  ROUTER_PATH: { NATIVE: 0, SIGNED: 1, FLUSH: 2 },
  receiptChain: (id: number) => jest.requireActual("@/components/shelter-payouts/chains").SHELTER_CHAINS[id],
  isVerifiedMatch: () => false,
  fetchReceipt: () =>
    Promise.resolve({
      success: true,
      blockNumber: 7,
      txHash: `0x${"ab".repeat(32)}`,
      gifts: [],
      payouts: [
        {
          kind: "erc20",
          contract: "0x2222222222222222222222222222222222222222",
          shelter: PINK_PAW_WALLET,
          amount: BigInt(10000),
          memo: "tt:heist:0123abcd",
          txHash: `0x${"ab".repeat(32)}`,
          blockNumber: 7,
          logIndex: 0,
          listed: true,
        },
      ],
    }),
}));
jest.mock("@/components/shelter-payouts/PinkPawShowcase", () => ({ PinkPawStrip: () => null }));

import { ShelterReceipt } from "@/components/shelter-payouts/ShelterReceipt";

describe("ShelterReceipt names the chain of a picked-network treat", () => {
  it.each([
    ["84532", "Base Sepolia testnet", "USDC"],
    ["42431", "Tempo Testnet", "pathUSD"],
    ["46630", "Robinhood Chain Testnet", "mUSDC"],
  ])("chain %s: receipt and share card say %s", async (id, name, coin) => {
    chainId = id;
    downloadShareCard.mockClear();
    render(<ShelterReceipt />);
    const where = await screen.findByTestId("receipt-chain");
    expect(where.textContent).toMatch(new RegExp(`^${name} · block 7`));
    expect(screen.getByTestId("receipt-card").textContent).toMatch(new RegExp(`0\\.01 ${coin}`));
    fireEvent.click(screen.getByText("Download share card"));
    expect(downloadShareCard).toHaveBeenCalledWith(
      expect.objectContaining({ chainName: name, testnet: true, amount: `0.01 ${coin}`, variant: "treat" })
    );
    expect(SHELTER_CHAINS[Number(id)]).toBeTruthy();
  });
});
