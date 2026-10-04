/**
 * @jest-environment jsdom
 */
/**
 * The wallet block's network picker (multi-chain giving): seven chains, each with its name, coin and fee
 * line; the default is the campaign chain; picking another chain changes the plain-words summary and
 * the steps line. Nothing reads a chain: the RPC and the backend are mocked offline.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { readFileSync } from "fs";
import { join } from "path";

jest.mock("@/components/shelter-payouts/relayApi", () => ({
  ...jest.requireActual("@/components/shelter-payouts/relayApi"),
  getMatchStatus: jest.fn(async () => null),
  getClaim: jest.fn(async () => null),
  getRelayStatus: jest.fn(async () => null),
}));
jest.mock("@/components/shelter-payouts/rpc", () => ({
  ...jest.requireActual("@/components/shelter-payouts/rpc"),
  rpcCall: jest.fn(async () => {
    throw new Error("offline");
  }),
}));

import { walletRails } from "@/components/shelter-payouts/giveRails";
import type { RouterEntry } from "@/components/shelter-payouts/routers";
import type { ShelterDeployment } from "@/components/shelter-payouts/rpc";
import { WalletDonate } from "@/components/shelter-payouts/WalletDonate";

const DEPLOYMENTS: ShelterDeployment[] = JSON.parse(
  readFileSync(join(__dirname, "../public/shelter-payouts/testnet-deployments.json"), "utf8")
);
const ROUTERS: RouterEntry[] = [
  { chainId: 5042002, router: "0x" + "cc".repeat(20), usdc: "0x3600000000000000000000000000000000000000", network: "testnet", eip3009: true },
];

const renderBlock = () => {
  const rails = walletRails("testnet", ROUTERS, DEPLOYMENTS);
  render(
    <WalletDonate mode="testnet" chainId={5042002} chain={rails[0].chain} router={rails[0].router} shelterName="Pink Paw (Rožinė pėdutė)" choices={rails} />
  );
  return rails;
};

describe("WalletDonate chain picker", () => {
  it("lists the seven testnets with name, coin and fee, the campaign chain picked", () => {
    renderBlock();
    const picker = screen.getByTestId("wallet-network");
    const radios = within(picker).getAllByRole("radio");
    expect(radios).toHaveLength(7);
    expect((radios[0] as HTMLInputElement).checked).toBe(true);
    const tempo = screen.getByTestId("wallet-network-42431");
    expect(tempo.textContent).toContain("Tempo Testnet");
    expect(tempo.textContent).toContain("Gives pathUSD");
    expect(tempo.textContent).toContain("No gas coin");
    expect(screen.getByTestId("wallet-network-46630").textContent).toContain("Gives mUSDC");
    expect(screen.getByTestId("wallet-network-43113").textContent).toContain("Fee in AVAX from your wallet");
    expect(screen.getByTestId("wallet-network-10143").textContent).toContain("Monad Testnet");
    expect(screen.getByTestId("wallet-network-10143").textContent).toContain("Fee in MON from your wallet");
    // Arc with a router and no relay: the one-transaction native gift is the main button.
    expect(screen.getByTestId("wallet-give-how").textContent).toBe("One transaction from your wallet.");
    expect(screen.getByTestId("wallet-chain-summary").textContent).toMatch(/Circle's chain/);
    expect(screen.getByTestId("wallet-give").textContent).toMatch(/Give 0\.5 USDC/);
  });

  it("switches the coin, the summary and the steps when another chain is picked", () => {
    renderBlock();
    fireEvent.click(within(screen.getByTestId("wallet-network-42431")).getByRole("radio"));
    expect(screen.getByTestId("wallet-chain-summary").textContent).toMatch(/no native coin/i);
    expect(screen.getByTestId("wallet-give-how").textContent).toBe(
      "Two steps in your wallet: allow pathUSD for this gift, then give."
    );
    expect(screen.getByTestId("wallet-give").textContent).toMatch(/Give 0\.5 pathUSD/);
    fireEvent.click(within(screen.getByTestId("wallet-network-421614")).getByRole("radio"));
    expect(screen.getByTestId("wallet-chain-summary").textContent).toMatch(/needs a little ETH/);
    expect(screen.getByTestId("wallet-give").textContent).toMatch(/Give 0\.5 USDC/);
  });

  it("offers Arc's EURC router as its own option: one signature, fee in USDC, never the native gift", () => {
    const routers: RouterEntry[] = [
      ...ROUTERS,
      { chainId: 5042002, router: "0x" + "ee".repeat(20), usdc: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a", network: "testnet", symbol: "EURC", eip3009: true },
    ];
    const rails = walletRails("testnet", routers, DEPLOYMENTS, true);
    render(
      <WalletDonate mode="testnet" chainId={5042002} chain={rails[0].chain} router={rails[0].router} shelterName="Pink Paw (Rožinė pėdutė)" choices={rails} />
    );
    const radios = within(screen.getByTestId("wallet-network")).getAllByRole("radio");
    expect(radios).toHaveLength(8);
    // The chain's own coin stays the default.
    expect((within(screen.getByTestId("wallet-network-5042002")).getByRole("radio") as HTMLInputElement).checked).toBe(true);
    const eurc = screen.getByTestId("wallet-network-5042002-EURC");
    expect(eurc.textContent).toContain("Gives EURC");
    expect(eurc.textContent).toContain("Fee in USDC from your wallet");
    fireEvent.click(within(eurc).getByRole("radio"));
    expect((within(eurc).getByRole("radio") as HTMLInputElement).checked).toBe(true);
    expect((within(screen.getByTestId("wallet-network-5042002")).getByRole("radio") as HTMLInputElement).checked).toBe(false);
    expect(screen.getByTestId("wallet-give-how").textContent).toBe("Sign once in your wallet.");
    expect(screen.getByTestId("wallet-give").textContent).toMatch(/Give 0\.5 EURC/);
    expect(screen.queryByTestId("wallet-give-native")).toBeNull();
    expect(screen.getByTestId("testnet-label").textContent).toMatch(/Test EURC/);
    // Back to USDC: the native one-transaction gift again.
    fireEvent.click(within(screen.getByTestId("wallet-network-5042002")).getByRole("radio"));
    expect(screen.getByTestId("wallet-give-how").textContent).toBe("One transaction from your wallet.");
  });

  it("shows no picker for a single chain", () => {
    const rails = walletRails("testnet", ROUTERS, DEPLOYMENTS).slice(0, 1);
    render(<WalletDonate mode="testnet" chainId={5042002} chain={rails[0].chain} router={rails[0].router} shelterName="Pink Paw" choices={rails} />);
    expect(screen.queryByTestId("wallet-network")).toBeNull();
    expect(screen.getByTestId("wallet-chain-summary")).toBeTruthy();
  });
});
