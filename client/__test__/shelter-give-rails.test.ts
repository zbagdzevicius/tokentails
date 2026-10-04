/**
 * Multi-chain wallet giving (decision "B"): the six-chain picker, the split path (approve +
 * ShelterSplit.disburse, disburseWithMemo on Tempo, donate on Arc) and the add-chain params. A mocked
 * EIP-1193 provider: nothing is signed or sent for real.
 */
import { keccak_256 } from "@noble/hashes/sha3";
import { readFileSync } from "fs";
import { join } from "path";
import type { Campaign } from "@/components/shelter-payouts/campaign";
import {
  ALLOWANCE_SELECTOR,
  APPROVE_SELECTOR,
  BALANCE_OF_SELECTOR,
  DECIMALS_SELECTOR,
  DISBURSE_SELECTOR,
  DISBURSE_WITH_MEMO_SELECTOR,
  DONATE_SELECTOR,
  PAUSED_SELECTOR,
  PREVIEW_SELECTOR,
  TOKEN_SELECTOR,
  decodeBool,
  decodeUint,
  encodeAllowanceCall,
  encodeApproveCalldata,
  encodeDisburseCalldata,
  encodeDisburseWithMemoCalldata,
  encodeDonateCalldata,
  memoToBytes32,
} from "@/components/shelter-payouts/calldata";
import { SHELTER_CHAINS } from "@/components/shelter-payouts/chains";
import { NO_WALLET_PATH, mainnetRails, tryItRails, walletGiveMode } from "@/components/shelter-payouts/giveMode";
import {
  WALLET_CHAIN_IDS,
  campaignRails,
  feeCoin,
  parseChainList,
  railCoinLine,
  railFeeLine,
  railFor,
  railStepsLine,
  railSummary,
  extraCoinRails,
  isExtraCoinRail,
  railKey,
  splitDeploymentFor,
  walletRails,
} from "@/components/shelter-payouts/giveRails";
import type { RouterEntry } from "@/components/shelter-payouts/routers";
import type { ShelterDeployment } from "@/components/shelter-payouts/rpc";
import {
  CustodyError,
  Eip1193,
  GiftError,
  NO_NATIVE_COIN_NAME,
  WALLET_MEMO_RE,
  addChainParams,
  giveNativeToSplit,
  giveToSplit,
} from "@/components/shelter-payouts/wallet";

const sig = (s: string) => "0x" + Buffer.from(keccak_256(new TextEncoder().encode(s))).toString("hex").slice(0, 8);

// The public testnet list the page reads (client/public/shelter-payouts/testnet-deployments.json).
const TESTNET_DEPLOYMENTS: ShelterDeployment[] = JSON.parse(
  readFileSync(join(__dirname, "../public/shelter-payouts/testnet-deployments.json"), "utf8")
);
const R = (chainId: number, network: "testnet" | "mainnet", extra: Partial<RouterEntry> = {}): RouterEntry => ({
  chainId,
  router: "0x" + "cc".repeat(20),
  usdc: "0x" + "36".repeat(20),
  network,
  eip3009: true,
  ...extra,
});
const MAINNET_SPLITS: ShelterDeployment[] = WALLET_CHAIN_IDS.mainnet.map((chainId, i) => ({
  contract: "ShelterSplit",
  network: "mainnet",
  chainId,
  address: "0x" + (i + 1).toString(16).padStart(2, "0").repeat(20),
}));

describe("calldata for the split path", () => {
  it("pins every selector to its signature", () => {
    expect(APPROVE_SELECTOR).toBe(sig("approve(address,uint256)"));
    expect(ALLOWANCE_SELECTOR).toBe(sig("allowance(address,address)"));
    expect(TOKEN_SELECTOR).toBe(sig("token()"));
    expect(PAUSED_SELECTOR).toBe(sig("paused()"));
    expect(DISBURSE_SELECTOR).toBe(sig("disburse(uint256,string)"));
    expect(DISBURSE_WITH_MEMO_SELECTOR).toBe(sig("disburseWithMemo(uint256,bytes32)"));
    expect(DONATE_SELECTOR).toBe(sig("donate(string)"));
  });

  it("encodes approve, allowance, disburse, disburseWithMemo and donate", () => {
    const split = "0x" + "ab".repeat(20);
    const owner = "0x" + "cd".repeat(20);
    expect(encodeApproveCalldata(split, BigInt(100000))).toBe(
      APPROVE_SELECTOR + "0".repeat(24) + "ab".repeat(20) + (100000).toString(16).padStart(64, "0")
    );
    expect(encodeAllowanceCall(owner, split)).toBe(ALLOWANCE_SELECTOR + "0".repeat(24) + "cd".repeat(20) + "0".repeat(24) + "ab".repeat(20));
    const memo = "tt:wallet:0a1b2c3d";
    const memoHex = Buffer.from(memo).toString("hex");
    // disburse(uint256,string): amount, offset 0x40, length, bytes padded to 32.
    expect(encodeDisburseCalldata(BigInt(100000), memo)).toBe(
      DISBURSE_SELECTOR +
        (100000).toString(16).padStart(64, "0") +
        (64).toString(16).padStart(64, "0") +
        memo.length.toString(16).padStart(64, "0") +
        memoHex.padEnd(64, "0")
    );
    // disburseWithMemo(uint256,bytes32): two static words.
    const m32 = memoToBytes32(memo);
    expect(m32).toBe("0x" + memoHex.padEnd(64, "0"));
    expect(encodeDisburseWithMemoCalldata(BigInt(100000), m32)).toBe(
      DISBURSE_WITH_MEMO_SELECTOR + (100000).toString(16).padStart(64, "0") + memoHex.padEnd(64, "0")
    );
    expect(encodeDonateCalldata(memo).startsWith(DONATE_SELECTOR + (32).toString(16).padStart(64, "0"))).toBe(true);
    expect(() => memoToBytes32("x".repeat(33))).toThrow(/32 bytes/);
    expect(() => encodeApproveCalldata("0x12", BigInt(1))).toThrow();
    expect(decodeUint("0x" + (7).toString(16).padStart(64, "0"))).toBe(BigInt(7));
    expect(decodeBool("0x" + "1".padStart(64, "0"))).toBe(true);
    expect(decodeBool("0x" + "0".repeat(64))).toBe(false);
  });
});

describe("add-chain params for all six chains", () => {
  it.each([...WALLET_CHAIN_IDS.mainnet, ...WALLET_CHAIN_IDS.testnet])("chain %i", (id) => {
    const chain = SHELTER_CHAINS[id];
    const p = addChainParams(id, chain);
    expect(p.chainId).toBe("0x" + id.toString(16));
    expect(p.chainName).toBe(chain.name);
    expect(p.rpcUrls).toEqual([chain.rpc]);
    expect(p.blockExplorerUrls).toEqual([chain.explorer]);
    expect(p.rpcUrls[0]).toMatch(/^https:\/\//);
    expect(p.nativeCurrency.decimals).toBe(18);
    const tempo = id === 4217 || id === 42431;
    // Tempo has no native coin: the wallet is told so in the currency name.
    expect(p.nativeCurrency).toEqual(
      tempo
        ? { name: NO_NATIVE_COIN_NAME, symbol: "USD", decimals: 18 }
        : { name: chain.nativeSymbol, symbol: chain.nativeSymbol, decimals: 18 }
    );
    expect(p.nativeCurrency.symbol.length).toBeGreaterThanOrEqual(2);
    expect(p.nativeCurrency.symbol.length).toBeLessThanOrEqual(6);
  });

  it("names the fee coin of each chain", () => {
    expect(WALLET_CHAIN_IDS.testnet.map((id) => feeCoin(SHELTER_CHAINS[id]))).toEqual(["USDC", "USD", "ETH", "AVAX", "ETH", "ETH"]);
  });
});

describe("the chain picker's rails", () => {
  it("offers all six testnets from the public list: a router where listed, else the split", () => {
    const routers = [R(5042002, "testnet"), R(84532, "testnet"), R(5042002, "testnet", { router: "0x" + "ee".repeat(20), symbol: "EURC" })];
    const rails = walletRails("testnet", routers, TESTNET_DEPLOYMENTS);
    expect(rails.map((r) => [r.chainId, r.path])).toEqual([
      [5042002, "router"],
      [42431, "split"],
      [421614, "split"],
      [43113, "split"],
      [84532, "router"],
      [46630, "split"],
    ]);
    // The EURC router is never the default for Arc.
    expect(rails[0].router?.router).toBe("0x" + "cc".repeat(20));
    expect(rails.map((r) => r.symbol)).toEqual(["USDC", "pathUSD", "USDC", "USDC", "USDC", "mUSDC"]);
    expect(rails.find((r) => r.chainId === 42431)).toMatchObject({ memo32: true, native: false, split: "0x9978e60da2352a8de02852788d34bd95849a598d" });
    expect(rails.find((r) => r.chainId === 46630)).toMatchObject({ memo32: false, native: false });
    expect(rails[0].native).toBe(true);
  });

  it("offers a second coin's router (EURC) as its own option after the chain's default, never native", () => {
    const eurc = R(5042002, "testnet", { router: "0x" + "ee".repeat(20), symbol: "EURC" });
    const fujiEurc = R(43113, "testnet", { router: "0x" + "ef".repeat(20), symbol: "EURC" });
    const routers = [R(5042002, "testnet"), eurc, fujiEurc, R(84532, "testnet")];
    // Off by default: the plain list stays one option per chain.
    expect(walletRails("testnet", routers, TESTNET_DEPLOYMENTS).map(railKey)).toEqual(["5042002", "42431", "421614", "43113", "84532", "46630"]);
    const rails = walletRails("testnet", routers, TESTNET_DEPLOYMENTS, true);
    expect(rails.map(railKey)).toEqual(["5042002", "5042002-EURC", "42431", "421614", "43113", "43113-EURC", "84532", "46630"]);
    const arcEurc = rails[1];
    expect(arcEurc).toMatchObject({ chainId: 5042002, path: "router", symbol: "EURC", native: false, memo32: false, split: null });
    expect(arcEurc.router?.router).toBe("0x" + "ee".repeat(20));
    expect(isExtraCoinRail(arcEurc)).toBe(true);
    expect(isExtraCoinRail(rails[0])).toBe(false);
    // Fuji has no USDC router here: the default stays the split, the EURC router is the extra option.
    expect(rails[4]).toMatchObject({ chainId: 43113, path: "split", symbol: "USDC" });
    expect(rails[5]).toMatchObject({ chainId: 43113, path: "router", symbol: "EURC" });
    // Arc's EURC gift pays its fee in USDC, which is not "the same coin".
    expect(railFeeLine(arcEurc)).toBe("Fee in USDC from your wallet");
    expect(railFeeLine(arcEurc, false)).not.toMatch(/same coin/);
    expect(railSummary(arcEurc)).toMatch(/spends the EURC you give plus a small fee in USDC, so it needs a little USDC too/);
    // An entry without the EIP-3009 flag, a duplicate coin, a mainnet router or Tempo never adds an option.
    const noFlag = { ...eurc, router: "0x" + "ab".repeat(20) } as RouterEntry;
    delete (noFlag as { eip3009?: boolean }).eip3009;
    expect(extraCoinRails(5042002, [noFlag], TESTNET_DEPLOYMENTS)).toEqual([]);
    expect(extraCoinRails(5042002, [eurc, { ...eurc, router: "0x" + "ac".repeat(20) }], TESTNET_DEPLOYMENTS)).toHaveLength(1);
    expect(extraCoinRails(5042002, [R(5042002, "mainnet", { symbol: "EURC" })], TESTNET_DEPLOYMENTS)).toEqual([]);
    expect(extraCoinRails(42431, [R(42431, "testnet", { symbol: "USDC.e" })], TESTNET_DEPLOYMENTS)).toEqual([]);
  });

  it("the try-it block lists the extra-coin routers; the real-money campaign rails never do", () => {
    const routers = [R(5042002, "testnet"), R(5042002, "testnet", { router: "0x" + "ee".repeat(20), symbol: "EURC" })];
    expect(tryItRails(routers, TESTNET_DEPLOYMENTS, { tryChain: "5042002" }).map(railKey)).toContain("5042002-EURC");
    const mainnet = [R(5042, "mainnet"), R(5042, "mainnet", { router: "0x" + "ee".repeat(20), symbol: "EURC" })];
    expect(campaignRails(5042, mainnet, MAINNET_SPLITS, "5042").map(railKey)).toEqual(["5042"]);
  });

  it("picks the newest split of the chain's own coin, never a EURC one", () => {
    expect(splitDeploymentFor(84532, TESTNET_DEPLOYMENTS)?.address).toBe("0x8bf026d3816cb2344d14aa6301fccde3b289878c");
    expect(splitDeploymentFor(5042002, TESTNET_DEPLOYMENTS)?.address).toBe("0x457c89e10a6e66633eda5bf82fd086febb5db147");
    expect(splitDeploymentFor(43113, TESTNET_DEPLOYMENTS)?.address).toBe("0x8bf026d3816cb2344d14aa6301fccde3b289878c");
    // A testnet split never serves a mainnet chain id, and an unknown chain has no rail.
    expect(splitDeploymentFor(5042, TESTNET_DEPLOYMENTS)).toBeNull();
    expect(railFor(1, [], TESTNET_DEPLOYMENTS)).toBeNull();
  });

  it("never uses a router on Tempo (TIP-20 has no EIP-3009): the split carries the gift", () => {
    const rail = railFor(42431, [R(42431, "testnet")], TESTNET_DEPLOYMENTS);
    expect(rail).toMatchObject({ path: "split", router: null, memo32: true });
    expect(NO_WALLET_PATH.size).toBe(0);
  });

  it("keeps production as it is: one campaign chain, only with a mainnet router, unless the chain list says more", () => {
    // Unset NEXT_PUBLIC_WALLET_DONATE_CHAINS: the campaign chain with a router, nothing else.
    expect(campaignRails(5042, [], MAINNET_SPLITS, undefined)).toEqual([]);
    expect(campaignRails(5042, [R(5042, "mainnet")], MAINNET_SPLITS, undefined).map((r) => r.chainId)).toEqual([5042]);
    expect(campaignRails(5042, [R(5042, "testnet")], MAINNET_SPLITS, undefined)).toEqual([]);
    // Set: those mainnet chains, the campaign chain first; testnet ids and junk are ignored.
    const listed = campaignRails(5042, [R(5042, "mainnet")], MAINNET_SPLITS, "8453, 4217,5042, 84532, junk");
    expect(listed.map((r) => [r.chainId, r.path])).toEqual([
      [5042, "router"],
      [4217, "split"],
      [8453, "split"],
    ]);
    expect(listed.every((r) => r.network === "mainnet")).toBe(true);
    expect(parseChainList("")).toBeNull();
    expect(parseChainList(" 1, x ,2")).toEqual([1, 2]);
  });

  it("shows the try-it block for any of the six testnets once the try chain is set, with no router at all", () => {
    for (const id of WALLET_CHAIN_IDS.testnet) {
      expect(walletGiveMode(null, TESTNET_DEPLOYMENTS, [], { tryChain: String(id) }, "try-it")).toBe("testnet");
    }
    expect(walletGiveMode(null, TESTNET_DEPLOYMENTS, [], {}, "try-it")).toBe("hidden");
    // A mainnet id in the try chain never opens the testnet block.
    expect(walletGiveMode(null, [...TESTNET_DEPLOYMENTS, ...MAINNET_SPLITS], [], { tryChain: "5042" }, "try-it")).toBe("hidden");
    expect(tryItRails([], TESTNET_DEPLOYMENTS, { tryChain: "5042002" }).map((r) => r.chainId)).toEqual(WALLET_CHAIN_IDS.testnet);
    expect(tryItRails([], TESTNET_DEPLOYMENTS, {})).toEqual([]);
  });

  it("opens the campaign slot on mainnet only with the flag, the handover and an enabled chain", () => {
    const campaign = (handover: Campaign["shelter"]["handover"]): Campaign => ({
      name: "c",
      goalUsdc: "90",
      startDate: "2026-10-02",
      endDate: "2027-09-30",
      chainId: 5042,
      fromBlock: null,
      sources: ["gifts"],
      token: { address: "0x" + "36".repeat(20), decimals: 6 },
      startBalance: "0",
      shelter: { name: "Pink Paw", wallet: "0x" + "e2".repeat(20), handover },
    });
    const on = { walletDonate: "true", chains: "5042,8453" };
    expect(walletGiveMode(campaign("handed-over"), MAINNET_SPLITS, [], on)).toBe("mainnet");
    expect(mainnetRails(campaign("handed-over"), [], MAINNET_SPLITS, on).map((r) => r.chainId)).toEqual([5042, 8453]);
    expect(walletGiveMode(campaign("held-by-token-tails"), MAINNET_SPLITS, [], on)).toBe("awaiting-handover");
    expect(walletGiveMode(campaign("handed-over"), MAINNET_SPLITS, [], { chains: "5042,8453" })).toBe("hidden");
    // Flag on, no chain list, no router: today's rule, hidden.
    expect(walletGiveMode(campaign("handed-over"), MAINNET_SPLITS, [], { walletDonate: "true" })).toBe("hidden");
  });
});

describe("the picker's copy", () => {
  const rails = walletRails("testnet", [R(84532, "testnet")], TESTNET_DEPLOYMENTS);
  const byId = (id: number) => rails.find((r) => r.chainId === id)!;

  it("names the coin and how the fee is covered on each chain", () => {
    expect(rails.map((r) => railCoinLine(r))).toEqual(["Gives USDC", "Gives pathUSD", "Gives USDC", "Gives USDC", "Gives USDC", "Gives mUSDC"]);
    expect(railFeeLine(byId(5042002))).toBe("Fee in USDC, the same coin");
    expect(railFeeLine(byId(42431))).toMatch(/No gas coin/);
    expect(railFeeLine(byId(421614))).toBe("Fee in ETH from your wallet");
    expect(railFeeLine(byId(43113))).toBe("Fee in AVAX from your wallet");
    expect(railFeeLine(byId(46630))).toBe("Fee in ETH from your wallet");
    // The relay covers the fee only on the router path.
    expect(railFeeLine(byId(84532), true)).toMatch(/Token Tails covers it/);
    expect(railFeeLine(byId(421614), true)).toBe("Fee in ETH from your wallet");
  });

  it("says what each chain is for and what the giver spends, Tempo with no native coin", () => {
    for (const r of rails) {
      const line = railSummary(r);
      expect(line.length).toBeGreaterThan(20);
      expect(line).toContain(r.symbol);
    }
    expect(railSummary(byId(42431))).toMatch(/no native coin/i);
    expect(railSummary(byId(421614))).toMatch(/needs a little ETH/);
    expect(railSummary(byId(84532), true)).toMatch(/only the USDC you give/);
    expect(railStepsLine(byId(46630), "split")).toBe("Two steps in your wallet: allow mUSDC for this gift, then give.");
    expect(railStepsLine(byId(84532), "sign")).toBe("Sign once in your wallet.");
    expect(railStepsLine(byId(5042002), "native")).toBe("One transaction from your wallet.");
  });
});

// ---------------------------------------------------------------- the split path's wallet flow

const FROM = "0x" + "33".repeat(20);
const SPLIT = "0x" + "66".repeat(20);
const TOKEN = "0x" + "70".repeat(20);
const SHELTER = "0x" + "77".repeat(20);
const HELD = "0x" + "e2".repeat(20);
const word = (n: bigint | number) => BigInt(n).toString(16).padStart(64, "0");

function splitProvider(
  opts: {
    chainId?: string;
    allowance?: bigint;
    balance?: bigint;
    toTreasury?: bigint;
    paused?: boolean;
    payees?: string[];
    /** Allowance reads that still show 0 after the approval (a lagging RPC node). */
    lagReads?: number;
    approveReverts?: boolean;
  } = {}
) {
  let allowance = opts.allowance ?? BigInt(0);
  let lag = opts.lagReads ?? 0;
  const sent: { to: string; data: string; value?: string; chainId?: string }[] = [];
  const eth: Eip1193 = {
    request: jest.fn(async (args: { method: string; params?: unknown[] }) => {
      switch (args.method) {
        case "eth_requestAccounts":
          return [FROM];
        case "eth_chainId":
          return opts.chainId || "0x4cef52";
        case "eth_getCode":
          return String(args.params?.[0]).toLowerCase() === SPLIT ? "0x6080" : "0x";
        case "eth_call": {
          const tx = args.params?.[0] as { to: string; data: string; from?: string };
          const sel = tx.data.slice(0, 10);
          if (tx.from) return "0x"; // the preflight of the gift itself
          if (sel === TOKEN_SELECTOR) return "0x" + word(BigInt(TOKEN));
          if (sel === DECIMALS_SELECTOR) return "0x" + word(6);
          if (sel === PAUSED_SELECTOR) return "0x" + word(opts.paused ? 1 : 0);
          if (sel === BALANCE_OF_SELECTOR) return "0x" + word(opts.balance ?? BigInt(10_000_000));
          if (sel === ALLOWANCE_SELECTOR) {
            if (lag > 0 && sent.length > 0) {
              lag--;
              return "0x" + word(0);
            }
            return "0x" + word(allowance);
          }
          if (sel === PREVIEW_SELECTOR) {
            const ws = opts.payees || [SHELTER];
            const amount = BigInt("0x" + tx.data.slice(10, 74));
            const t = opts.toTreasury ?? BigInt(0);
            const each = (amount - t) / BigInt(ws.length);
            return (
              "0x" + word(96) + word(128 + ws.length * 32) + word(t) +
              word(ws.length) + ws.map((w) => word(BigInt(w))).join("") +
              word(ws.length) + ws.map(() => word(each)).join("")
            );
          }
          throw new Error("unexpected eth_call " + sel);
        }
        case "eth_sendTransaction": {
          const tx = args.params?.[0] as { to: string; data: string; value?: string; chainId?: string };
          sent.push(tx);
          if (tx.data.startsWith(APPROVE_SELECTOR)) allowance = BigInt("0x" + tx.data.slice(74, 138));
          return "0x" + String(sent.length).padStart(64, "0");
        }
        case "eth_getTransactionReceipt": {
          const approve = sent[Number(BigInt(String(args.params?.[0]))) - 1]?.data.startsWith(APPROVE_SELECTOR);
          return { status: approve && opts.approveReverts ? "0x0" : "0x1", blockNumber: "0x10" };
        }
        default:
          throw new Error("unexpected " + args.method);
      }
    }),
  };
  return { eth, sent };
}

const noSleep = async () => undefined;
const fixedRand = (n: number) => new Uint8Array(n).fill(0xab);

describe("giveToSplit (approve + disburse)", () => {
  const base = { chainId: 421614, chain: SHELTER_CHAINS[421614], split: SPLIT, amount: "0.1", symbol: "USDC", rand: fixedRand, sleep: noSleep };

  it("approves exactly the amount, waits for it, then calls disburse on the split", async () => {
    const { eth, sent } = splitProvider({ chainId: "0x66eee" });
    const steps: string[] = [];
    const res = await giveToSplit({ ...base, provider: eth, onStep: (s) => steps.push(s) });
    expect(sent.map((t) => t.to)).toEqual([TOKEN, SPLIT]);
    expect(sent[0].data).toBe(encodeApproveCalldata(SPLIT, BigInt(100000)));
    expect(sent[1].data).toBe(encodeDisburseCalldata(BigInt(100000), res.memo));
    expect(sent.every((t) => t.chainId === "0x66eee")).toBe(true);
    expect(res).toMatchObject({ from: FROM, relayed: false, txHash: "0x" + "2".padStart(64, "0") });
    expect(res.memo).toMatch(WALLET_MEMO_RE);
    expect(steps).toEqual(["check", "approve", "give"]);
  });

  it("skips the approval when the allowance already covers the gift", async () => {
    const { eth, sent } = splitProvider({ chainId: "0x66eee", allowance: BigInt(5_000_000) });
    await giveToSplit({ ...base, provider: eth });
    expect(sent.map((t) => t.data.slice(0, 10))).toEqual([DISBURSE_SELECTOR]);
  });

  it("waits until a lagging node shows the approval before the gift", async () => {
    const { eth, sent } = splitProvider({ chainId: "0x66eee", lagReads: 2 });
    const sleep = jest.fn(async () => undefined);
    await giveToSplit({ ...base, provider: eth, sleep });
    expect(sent).toHaveLength(2);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("uses disburseWithMemo with a bytes32 memo on Tempo", async () => {
    const { eth, sent } = splitProvider({ chainId: "0xa5bf" });
    const res = await giveToSplit({ ...base, chainId: 42431, chain: SHELTER_CHAINS[42431], symbol: "pathUSD", memo32: true, provider: eth });
    expect(sent[1].data).toBe(encodeDisburseWithMemoCalldata(BigInt(100000), memoToBytes32(res.memo)));
  });

  it.each([
    ["a part would reach the treasury", { toTreasury: BigInt(1) }, /part of it would not reach the shelter/],
    ["the split is paused", { paused: true }, /paused/],
    ["the wallet holds too little", { balance: BigInt(50_000) }, /holds 0\.05 USDC on Arbitrum Sepolia, less than this gift/],
  ])("refuses before the wallet opens when %s", async (_n, o, msg) => {
    const { eth, sent } = splitProvider({ chainId: "0x66eee", ...o });
    await expect(giveToSplit({ ...base, provider: eth })).rejects.toThrow(msg);
    expect(sent).toHaveLength(0);
  });

  it("says so when the approval reverts, and never sends the gift", async () => {
    const { eth, sent } = splitProvider({ chainId: "0x66eee", approveReverts: true });
    await expect(giveToSplit({ ...base, provider: eth })).rejects.toThrow(/refused the USDC approval/);
    expect(sent).toHaveLength(1);
  });

  it("needs a shelter-claimed payout list on a real-money chain", async () => {
    const mainnet = { ...base, chainId: 42161, chain: SHELTER_CHAINS[42161] };
    const guard = { shelterWallets: [SHELTER], heldWallets: [HELD] };
    await expect(giveToSplit({ ...mainnet, provider: splitProvider({ chainId: "0xa4b1" }).eth, custody: null })).rejects.toBeInstanceOf(CustodyError);
    await expect(
      giveToSplit({ ...mainnet, provider: splitProvider({ chainId: "0xa4b1", payees: [HELD] }).eth, custody: guard })
    ).rejects.toBeInstanceOf(CustodyError);
    const ok = splitProvider({ chainId: "0xa4b1" });
    await expect(giveToSplit({ ...mainnet, provider: ok.eth, custody: guard })).resolves.toMatchObject({ relayed: false });
    expect(ok.sent).toHaveLength(2);
  });
});

describe("giveNativeToSplit (Arc: native USDC into ShelterSplit.donate)", () => {
  it("sends one transaction with the amount as 18-decimal value", async () => {
    const { eth, sent } = splitProvider();
    const res = await giveNativeToSplit({ provider: eth, chainId: 5042002, chain: SHELTER_CHAINS[5042002], split: SPLIT, amount: "0.5", rand: fixedRand });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: SPLIT, value: "0x" + BigInt("500000000000000000").toString(16), data: encodeDonateCalldata(res.memo) });
  });

  it("refuses where the native coin is not USDC, and when part would reach the treasury", async () => {
    await expect(
      giveNativeToSplit({ provider: splitProvider().eth, chainId: 84532, chain: SHELTER_CHAINS[84532], split: SPLIT, amount: "1" })
    ).rejects.toBeInstanceOf(GiftError);
    const { eth, sent } = splitProvider({ toTreasury: BigInt(1) });
    await expect(
      giveNativeToSplit({ provider: eth, chainId: 5042002, chain: SHELTER_CHAINS[5042002], split: SPLIT, amount: "1" })
    ).rejects.toThrow(/would not reach the shelter/);
    expect(sent).toHaveLength(0);
  });
});
