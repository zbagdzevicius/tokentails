/**
 * @jest-environment jsdom
 */
import type { DonateStatus, TreatChainStatus } from "@/api/shelter-api";
import { chainRole } from "@/components/shelter-payouts/chains";
import { HOW_IT_WORKS } from "@/components/shelter-payouts/payoutSections";
import { custodyDisclosure } from "@/components/shelter-payouts/ShelterProfile";
import { disclosureFor, DISCLOSURE } from "@/components/shelter-payouts/ShelterPayouts";
import { shortReason, treatChips, treatJarOpen } from "@/components/shelter-payouts/treatChains";
import { GiveLabel } from "@/components/shelter-payouts/WalletDonate";
import { render } from "@testing-library/react";

const chain = (chainId: number, extra: Partial<TreatChainStatus> = {}): TreatChainStatus => ({
  chainId,
  main: chainId === 5042,
  enabled: true,
  railState: "live",
  coin: "USDC",
  amountWei: "10000000000000000",
  remainingTodayWei: "50000000000000000",
  splitAddress: "0x" + "11".repeat(20),
  explorer: null,
  ...extra,
});

describe("ux-1: the treat jar is open when any served network can take a treat", () => {
  const paused = chain(5042, { enabled: false, railState: "paused", remainingTodayWei: "0", reason: "the hot wallet is low on gas" });
  it("a paused main chain with a live Tempo keeps the jar open; all closed keeps it closed", () => {
    const status: DonateStatus = { enabled: false, chainId: 5042, amountWei: "10000000000000000", remainingTodayWei: "0", splitAddress: null, railState: "paused", chains: [paused, chain(4217, { coin: "USDC.e" })] };
    expect(treatJarOpen(status)).toBe(true);
    expect(treatJarOpen({ ...status, chains: [paused] })).toBe(false);
    expect(treatJarOpen(null)).toBe(false);
  });

  it("ux-6: a closed chip says why in short, with the backend's full reason as its tooltip", () => {
    expect(shortReason("the hot wallet holds less than one treat of USDC")).toBe("Opens soon");
    expect(shortReason("the RPC is not answering")).toBe("Network busy");
    expect(shortReason("the split is paused")).toBe("Paused");
    const chips = treatChips({ enabled: false, chainId: 5042, amountWei: "1", remainingTodayWei: "0", splitAddress: null, chains: [paused] });
    const arc = chips.find((c) => c.chainId === 5042)!;
    expect(arc.reason).toBe("Opens soon");
    expect(arc.detail).toBe("the hot wallet is low on gas");
  });
});

describe("ux-3: coin symbols keep their case inside upper-case buttons", () => {
  it("GiveLabel wraps the symbol in a normal-case span", () => {
    const { container } = render(<GiveLabel amount="1" to="Pink Paw" symbol="USDC.e" />);
    const sym = container.querySelector("span.normal-case");
    expect(sym?.textContent).toBe("USDC.e");
    expect(container.textContent).toBe("Give 1 USDC.e to Pink Paw");
  });
});

describe("ux-4: custody lines follow the handover", () => {
  it("after handover no line says Token Tails holds the wallet", () => {
    for (const isApp of [true, false]) {
      expect(custodyDisclosure(isApp, "handed-over")).not.toMatch(/Token Tails (created|holds)/);
      expect(custodyDisclosure(isApp)).toMatch(/Token Tails/);
    }
    expect(custodyDisclosure(true, "handed-over")).not.toMatch(/wallet|on-chain/i);
    expect(disclosureFor("handed-over")).not.toMatch(/held by Token Tails/i);
    expect(disclosureFor("held-by-token-tails")).toBe(DISCLOSURE);
    expect(disclosureFor(undefined)).toBe(DISCLOSURE);
  });
});

describe("ux-7: mainnet copy never mentions a testnet coin or USDC only", () => {
  it("Robinhood mainnet's role line has no mUSDC; the testnet keeps it", () => {
    expect(chainRole(4663)).not.toMatch(/mUSDC|testnet/i);
    expect(chainRole(46630)).toMatch(/mUSDC/);
    expect(HOW_IT_WORKS[1]).toMatch(/stablecoin/);
  });
});
