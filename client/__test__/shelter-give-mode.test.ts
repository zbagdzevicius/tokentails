/**
 * The custody gate for wallet giving (giveMode.ts). Public money must never land in a wallet Token
 * Tails controls: before the handover the campaign slot shows a notice and no button.
 */
import type { Campaign } from "@/components/shelter-payouts/campaign";
import {
  NO_WALLET_PATH,
  TOKEN_TAILS_HELD_WALLETS,
  faucetFor,
  giftSymbol,
  giveAmounts,
  payeeLabel,
  tryItRouters,
  shortShelterName,
  tryChainId,
  walletGiveMode,
} from "@/components/shelter-payouts/giveMode";
import type { RouterEntry } from "@/components/shelter-payouts/routers";
import { parseRouters, routerFor } from "@/components/shelter-payouts/routers";

const campaign = (handover: Campaign["shelter"]["handover"], wallet: string | null = "0x" + "e2".repeat(20)): Campaign => ({
  name: "Pink Paw autumn rescue",
  goalUsdc: "90",
  startDate: "2026-10-02",
  endDate: "2027-09-30",
  chainId: 5042,
  fromBlock: null,
  sources: ["gifts", "match", "treats", "x402", "purchase-shares"],
  token: { address: "0x" + "36".repeat(20), decimals: 6 },
  startBalance: "0",
  shelter: { name: "Pink Paw (Rožinė pėdutė)", wallet, handover },
});

const MAINNET: RouterEntry = { chainId: 5042, router: "0x" + "aa".repeat(20), usdc: "0x" + "36".repeat(20), network: "mainnet" };
const TESTNET: RouterEntry = { chainId: 5042002, router: "0x" + "bb".repeat(20), usdc: "0x" + "36".repeat(20), network: "testnet" };
const ON = { walletDonate: "true" };

describe("walletGiveMode: campaign slot", () => {
  it("is mainnet only with the flag, the handover and a router on the campaign chain", () => {
    expect(walletGiveMode(campaign("handed-over"), [], [MAINNET], ON)).toBe("mainnet");
  });

  it("never offers a button while Token Tails holds the shelter's wallet, flag or not", () => {
    expect(walletGiveMode(campaign("held-by-token-tails"), [], [MAINNET], ON)).toBe("awaiting-handover");
    expect(walletGiveMode(campaign("held-by-token-tails"), [], [], {})).toBe("awaiting-handover");
  });

  it("is hidden after the handover when the flag is off or no mainnet router is listed", () => {
    expect(walletGiveMode(campaign("handed-over"), [], [MAINNET], {})).toBe("hidden");
    expect(walletGiveMode(campaign("handed-over"), [], [MAINNET], { walletDonate: "1" })).toBe("hidden");
    expect(walletGiveMode(campaign("handed-over"), [], [], ON)).toBe("hidden");
    expect(walletGiveMode(campaign("handed-over"), [], [TESTNET], ON)).toBe("hidden");
    // A router on the campaign chain id that is marked testnet never carries real money.
    expect(walletGiveMode(campaign("handed-over"), [], [{ ...MAINNET, network: "testnet" }], ON)).toBe("hidden");
  });

  it("is hidden without a campaign or a shelter wallet", () => {
    expect(walletGiveMode(null, [], [MAINNET], ON)).toBe("hidden");
    expect(walletGiveMode(campaign("handed-over", null), [], [MAINNET], ON)).toBe("hidden");
  });
});

describe("walletGiveMode: try-it slot", () => {
  it("is testnet when NEXT_PUBLIC_WALLET_DONATE_CHAIN names a chain with a testnet router", () => {
    expect(walletGiveMode(campaign("held-by-token-tails"), [], [TESTNET], { tryChain: "5042002" }, "try-it")).toBe("testnet");
    // Independent of the mainnet flag and the handover.
    expect(walletGiveMode(null, [], [TESTNET], { tryChain: "5042002" }, "try-it")).toBe("testnet");
  });

  it("is hidden when unset, malformed, unlisted, or pointed at a mainnet router", () => {
    expect(walletGiveMode(null, [], [TESTNET], {}, "try-it")).toBe("hidden");
    expect(walletGiveMode(null, [], [TESTNET], { tryChain: "arc" }, "try-it")).toBe("hidden");
    expect(walletGiveMode(null, [], [TESTNET], { tryChain: "84532" }, "try-it")).toBe("hidden");
    expect(walletGiveMode(null, [], [MAINNET], { tryChain: "5042" }, "try-it")).toBe("hidden");
  });

  it("parses the try chain id", () => {
    expect(tryChainId({ tryChain: "5042002" })).toBe(5042002);
    expect(tryChainId({ tryChain: "" })).toBeNull();
    expect(tryChainId({ tryChain: "-1" })).toBeNull();
    expect(tryChainId({ tryChain: "1.5" })).toBeNull();
  });
});

describe("presets and names", () => {
  it("uses whole USDC on mainnet and tenths on the testnet", () => {
    expect(giveAmounts("mainnet")).toEqual(["1", "5", "10"]);
    expect(giveAmounts("testnet")).toEqual(["0.1", "0.5", "1"]);
  });

  it("names the token the router pulls, never a hardcoded USDC", () => {
    expect(giftSymbol({ symbol: "USDG" }, { symbol: undefined })).toBe("USDG");
    expect(giftSymbol({ symbol: "USDC" }, { symbol: "EURC" })).toBe("EURC");
    expect(giftSymbol(null, null)).toBe("USDC");
  });

  it("names one shelter, several shelters, or nobody while the payout list is unknown", () => {
    expect(payeeLabel(1, "Pink Paw")).toBe("Pink Paw");
    expect(payeeLabel(3, "Pink Paw")).toBe("3 shelters");
    expect(payeeLabel(null, "Pink Paw")).toBeNull();
    expect(payeeLabel(0, "Pink Paw")).toBeNull();
  });

  it("lists Pink Paw's Token Tails-held wallet as held", () => {
    expect(TOKEN_TAILS_HELD_WALLETS).toContain("0xe299299b846ba629f5a591dbf4f562bcc07a0f37");
  });

  it("shortens the shelter name for buttons", () => {
    expect(shortShelterName("Pink Paw (Rožinė pėdutė)")).toBe("Pink Paw");
    expect(shortShelterName("Cat Haven")).toBe("Cat Haven");
  });
});

describe("routers.json", () => {
  it("keeps only well-formed entries", () => {
    const list = parseRouters([
      TESTNET,
      { ...MAINNET, label: "Arc" },
      { chainId: "5042", router: MAINNET.router, usdc: MAINNET.usdc, network: "mainnet" },
      { chainId: 1, router: "0x12", usdc: MAINNET.usdc, network: "mainnet" },
      { chainId: 1, router: MAINNET.router, usdc: MAINNET.usdc, network: "devnet" },
      null,
    ]);
    expect(list).toEqual([TESTNET, { ...MAINNET, label: "Arc" }]);
    expect(parseRouters({})).toEqual([]);
    // Off Arc, a router is kept only when its token is marked EIP-3009 (Tempo TIP-20 has none).
    const base = { chainId: 84532, router: MAINNET.router, usdc: MAINNET.usdc, network: "testnet" as const };
    expect(parseRouters([base])).toEqual([]);
    expect(parseRouters([{ ...base, eip3009: true }])).toEqual([{ ...base, eip3009: true }]);
    expect(routerFor(list, 5042002)).toEqual(TESTNET);
    expect(routerFor(list, 1)).toBeNull();
    expect(routerFor(list, null)).toBeNull();
  });
});

describe("chains without a wallet path", () => {
  const r = (chainId: number, network: "testnet" | "mainnet"): RouterEntry => ({
    chainId,
    router: "0x" + "cc".repeat(20),
    usdc: "0x" + "36".repeat(20),
    network,
  });

  it("never gives through a router on Tempo (TIP-20 has no EIP-3009); its split carries the gift instead", () => {
    // Multi-chain giving: the approve + ShelterSplit.disburse path covers Tempo and Robinhood, so no
    // chain is blocked any more (shelter-give-rails.test.ts covers the split path).
    expect(NO_WALLET_PATH.size).toBe(0);
    // A Tempo router alone (no split listed) opens nothing: the router is never used there.
    expect(walletGiveMode(null, [], [r(42431, "testnet")], { tryChain: "42431" }, "try-it")).toBe("hidden");
    const tempoCampaign = { ...campaign("handed-over"), chainId: 4217 };
    expect(walletGiveMode(tempoCampaign, [], [r(4217, "mainnet")], ON)).toBe("hidden");
    // With its ShelterSplit listed, Tempo testnet gives through the split.
    const tempoSplit = { chainId: 42431, network: "testnet", address: "0x" + "99".repeat(20), token: "pathUSD" };
    expect(walletGiveMode(null, [tempoSplit], [r(42431, "testnet")], { tryChain: "42431" }, "try-it")).toBe("testnet");
  });

  it("lists every testnet router with a wallet path, the env chain first", () => {
    const routers = [r(84532, "testnet"), TESTNET, r(42431, "testnet"), r(421614, "testnet"), MAINNET];
    expect(tryItRouters(routers, { tryChain: "5042002" }).map((x) => x.chainId)).toEqual([5042002, 84532, 421614]);
    expect(tryItRouters(routers, {})).toEqual([]);
    expect(tryItRouters(routers, { tryChain: "42431" })).toEqual([]);
  });

  it("links the Circle faucet only where it serves test USDC", () => {
    expect(faucetFor(5042002)).toBe("https://faucet.circle.com");
    expect(faucetFor(84532)).toBe("https://faucet.circle.com");
    expect(faucetFor(42431)).toBeNull();
    expect(faucetFor(46630)).toBeNull();
  });
});
