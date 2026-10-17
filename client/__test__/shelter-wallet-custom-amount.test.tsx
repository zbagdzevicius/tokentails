/**
 * @jest-environment jsdom
 */
/**
 * The real-money "Give from your wallet" block with the public mainnet lists: Arc preselected, a
 * network picker across every mainnet chain (Arc's EURC as its own option), and a typed amount that
 * reaches the give call unchanged on each rail. The wallet module is mocked: nothing is signed or sent.
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
const SHELTER = "0x3c833562e682db66c2415b34961595df135f4771";
const RESULT = { txHash: "0x" + "ab".repeat(32), from: "0x" + "33".repeat(20), memo: "tt:wallet:abcdef12", relayed: false };
jest.mock("@/components/shelter-payouts/wallet", () => ({
  ...jest.requireActual("@/components/shelter-payouts/wallet"),
  getInjectedProvider: jest.fn(() => ({ request: jest.fn() })),
  readPayoutWallets: jest.fn(async () => [SHELTER]),
  readSplitPayoutWallets: jest.fn(async () => [SHELTER]),
  giveNative: jest.fn(async () => RESULT),
  giveNativeToSplit: jest.fn(async () => RESULT),
  giveToSplit: jest.fn(async () => RESULT),
  signAndGive: jest.fn(async () => RESULT),
  waitForReceipt: jest.fn(async () => ({ blockNumber: "0x10", status: "0x1" })),
}));

import { campaignRails } from "@/components/shelter-payouts/giveRails";
import type { RouterEntry } from "@/components/shelter-payouts/routers";
import type { ShelterDeployment } from "@/components/shelter-payouts/rpc";
import * as wallet from "@/components/shelter-payouts/wallet";
import { WalletDonate } from "@/components/shelter-payouts/WalletDonate";

const read = (f: string) => JSON.parse(readFileSync(join(__dirname, "../public/shelter-payouts", f), "utf8"));
const ROUTERS: RouterEntry[] = read("routers.json");
const DEPLOYMENTS: ShelterDeployment[] = read("deployments.json");

const renderMainnet = () => {
  const rails = campaignRails(5042, ROUTERS, DEPLOYMENTS, undefined);
  render(
    <WalletDonate
      mode="mainnet"
      chainId={5042}
      chain={rails[0].chain}
      router={rails[0].router}
      shelterName="Pink Paw (Rožinė pėdutė)"
      shelterWallet={SHELTER}
      choices={rails}
    />
  );
  return rails;
};
const pick = (key: string) => fireEvent.click(within(screen.getByTestId(`wallet-network-${key}`)).getByRole("radio"));
const typeAmount = (raw: string) => {
  if (!screen.queryByTestId("wallet-amount-input")) fireEvent.click(screen.getByTestId("wallet-amount-other"));
  fireEvent.change(screen.getByTestId("wallet-amount-input"), { target: { value: raw } });
};
const give = async () => {
  await act(async () => {
    fireEvent.click(screen.getByTestId("wallet-give"));
  });
  await waitFor(() => expect(screen.getByTestId("wallet-give-sent")).toBeTruthy());
};

beforeEach(() => jest.clearAllMocks());

describe("Give from your wallet on mainnet", () => {
  it("shows a network picker with every mainnet chain, Arc's USDC preselected and Arc's EURC beside it", async () => {
    renderMainnet();
    const radios = within(screen.getByTestId("wallet-network")).getAllByRole("radio") as HTMLInputElement[];
    expect(radios.length).toBeGreaterThanOrEqual(7);
    expect((within(screen.getByTestId("wallet-network-5042")).getByRole("radio") as HTMLInputElement).checked).toBe(true);
    expect(radios.filter((r) => r.checked)).toHaveLength(1);
    expect(screen.getByTestId("wallet-network-5042-EURC").textContent).toContain("Gives EURC");
    for (const id of [4217, 42161, 43114, 8453, 4663, 143]) expect(screen.getByTestId(`wallet-network-${id}`)).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId("wallet-give").textContent).toBe("Give 5 USDC to Pink Paw"));
  });

  it("switching the network changes the rail and the coin, and keeps the amount", async () => {
    renderMainnet();
    pick("4663");
    await waitFor(() => expect(screen.getByTestId("wallet-give").textContent).toBe("Give 5 USDG to Pink Paw"));
    expect(screen.getByTestId("wallet-give-how").textContent).toBe("Two steps in your wallet: allow USDG for this gift, then give.");
    typeAmount("12,25");
    pick("5042-EURC");
    expect((screen.getByTestId("wallet-amount-input") as HTMLInputElement).value).toBe("12,25");
    expect(screen.getByLabelText(/Your amount in EURC/)).toBe(screen.getByTestId("wallet-amount-input"));
    await waitFor(() => expect(screen.getByTestId("wallet-give").textContent).toBe("Give 12.25 EURC to Pink Paw"));
    expect(screen.getByTestId("wallet-give-how").textContent).toBe("Sign once in your wallet.");
  });

  it("gives a typed amount on Arc in one native transaction and shows it once sent", async () => {
    renderMainnet();
    typeAmount("7,5");
    await waitFor(() => expect(screen.getByTestId("wallet-give").textContent).toBe("Give 7.5 USDC to Pink Paw"));
    await give();
    expect(wallet.giveNative).toHaveBeenCalledWith(expect.objectContaining({ chainId: 5042, amount: "7.5" }));
    expect(screen.getByTestId("wallet-give-sent").textContent).toContain("7.5 USDC reached Pink Paw");
  });

  it("gives a typed amount on Base with one signature", async () => {
    renderMainnet();
    pick("8453");
    typeAmount("0.25");
    await give();
    expect(wallet.signAndGive).toHaveBeenCalledWith(expect.objectContaining({ chainId: 8453, amount: "0.25" }));
  });

  it("gives a typed amount through the split in the chain's own coin (Robinhood Chain, USDG)", async () => {
    renderMainnet();
    pick("4663");
    typeAmount("2,5");
    await give();
    expect(wallet.giveToSplit).toHaveBeenCalledWith(expect.objectContaining({ chainId: 4663, amount: "2.5", symbol: "USDG" }));
    expect(screen.getByTestId("wallet-give-sent").textContent).toContain("2.5 USDG");
  });

  it("keeps the button off with an inline error while the amount is invalid", () => {
    renderMainnet();
    typeAmount("20000");
    const input = screen.getByTestId("wallet-amount-input");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toBe(screen.getByTestId("wallet-amount-error").id);
    expect(screen.getByTestId("wallet-amount-error").textContent).toBe("Up to 10,000 USDC per gift from this page.");
    expect((screen.getByTestId("wallet-give") as HTMLButtonElement).disabled).toBe(true);
    typeAmount("");
    expect(screen.getByTestId("wallet-give").textContent).toBe("Type an amount");
    expect(screen.queryByTestId("wallet-amount-error")).toBeNull();
  });
});
