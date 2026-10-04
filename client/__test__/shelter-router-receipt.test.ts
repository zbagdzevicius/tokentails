/**
 * Router gifts on the receipt page, the match pairing copy and the share card variants. The log
 * vectors are a real donateNative(memo, recipients) on an Arc testnet fork (anvil dev account #1).
 */
import { SHELTER_CHAINS } from "@/components/shelter-payouts/chains";
import { factByKey, factLine } from "@/components/shelter-payouts/factLine";
import {
  ROUTER_DONATION_TOPIC,
  decodeReceipt,
  decodeRouterDonationLog,
  isVerifiedMatch,
  matchMemoFor,
} from "@/components/shelter-payouts/receipt";
import { matchMeterCopy } from "@/components/shelter-payouts/ShelterPayouts";
import { giftAmountLabel } from "@/components/shelter-payouts/ShelterReceipt";
import { TESTNET_BAND, drawShareCard, shareCardHeadline } from "@/components/shelter-payouts/shareCard";
import { keccakUtf8 } from "@/components/shelter-payouts/keccak";
import type { PublicFact } from "@/lib/facts.generated";

jest.mock("next/router", () => ({ useRouter: () => ({ isReady: false, query: {} }) }));

const SPLIT = "0x457c89e10a6e66633eda5bf82fd086febb5db147";
const ROUTER = "0xd2e7b19b3e98aa73af70482cac5e9c6e5a962823";
const TX = "0xe8511ebd54f2de9d1a17765c39a39f3a846111a621f8b94a743132b2a15a4ea1";

const LOGS = [
  {
    address: SPLIT,
    topics: [
      "0xc859ef09d317f79211253b04e5d51bff252d80816db65d1aaa75cfdd3a22aeef",
      "0x000000000000000000000000e299299b846ba629f5a591dbf4f562bcc07a0f37",
    ],
    data: "0x000000000000000000000000000000000000000000000000016345785d8a00000000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000001274743a77616c6c65743a30613162326333640000000000000000000000000000",
    logIndex: "0x0",
  },
  {
    address: ROUTER,
    topics: [
      ROUTER_DONATION_TOPIC,
      "0x00000000000000000000000070997970c51812dc3a010c7d01b50e0d17dc79c8",
      "0x000000000000000000000000000000000000000000000000000000000000000a",
      "0x0000000000000000000000000000000000000000000000000000000000000000",
    ],
    data: "0x000000000000000000000000000000000000000000000000016345785d8a000000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000060000000000000000000000000000000000000000000000000000000000000001274743a77616c6c65743a30613162326333640000000000000000000000000000",
    logIndex: "0x2",
  },
].map((l) => ({ ...l, blockNumber: "0x10", transactionHash: TX }));

describe("RouterDonation", () => {
  it("has the topic of RouterDonation(address,uint256,uint256,uint8,string,bytes32)", () => {
    expect(ROUTER_DONATION_TOPIC).toBe(keccakUtf8("RouterDonation(address,uint256,uint256,uint8,string,bytes32)"));
  });

  it("decodes a native gift: amount, batch, path and memo, without the donor", () => {
    const g = decodeRouterDonationLog(LOGS[1]);
    expect(g).toEqual({
      router: ROUTER,
      amount: BigInt("100000000000000000"),
      batchId: BigInt(10),
      path: 1,
      memo: "tt:wallet:0a1b2c3d",
      logIndex: 2,
    });
    expect(JSON.stringify(g, (_k, v) => (typeof v === "bigint" ? v.toString() : v))).not.toMatch(/70997970/);
  });

  it("puts the gift next to the split payout and marks a listed router", () => {
    const r = decodeReceipt({ status: "0x1", blockNumber: "0x10", transactionHash: TX, logs: LOGS }, [SPLIT], [ROUTER.toUpperCase().replace("0X", "0x")]);
    expect(r.payouts).toHaveLength(1);
    expect(r.payouts[0]).toMatchObject({ kind: "native", listed: true, memo: "tt:wallet:0a1b2c3d" });
    expect(r.gifts).toHaveLength(1);
    expect(r.gifts[0].listed).toBe(true);
    expect(decodeReceipt({ status: "0x1", blockNumber: "0x10", transactionHash: TX, logs: LOGS }, [SPLIT]).gifts[0].listed).toBe(false);
  });

  it("ignores malformed router logs", () => {
    expect(decodeRouterDonationLog({ ...LOGS[1], data: "0x1234" })).toBeNull();
    expect(decodeRouterDonationLog({ ...LOGS[1], topics: LOGS[1].topics.slice(0, 2) })).toBeNull();
    expect(decodeRouterDonationLog(LOGS[0])).toBeNull();
  });

  it("labels native gifts in the native coin and signed gifts in 6-decimal USDC", () => {
    const arc = SHELTER_CHAINS[5042002];
    expect(giftAmountLabel({ amount: BigInt("100000000000000000"), path: 1 }, arc)).toBe("0.1 USDC");
    expect(giftAmountLabel({ amount: BigInt(500000), path: 0 }, arc)).toBe("0.5 USDC");
  });

  it("labels a signed gift in the router's own token, at the chain token's decimals", () => {
    const usdg = { ...SHELTER_CHAINS[5042002], symbol: "USDG", decimals: 6 };
    expect(giftAmountLabel({ amount: BigInt(500000), path: 0 }, usdg)).toBe("0.5 USDG");
    expect(giftAmountLabel({ amount: BigInt(500000), path: 0 }, SHELTER_CHAINS[5042002], { symbol: "EURC" })).toBe("0.5 EURC");
  });

  it("calls a gift matched only when the match transaction pays a listed split with this gift's memo", () => {
    const donorTx = TX;
    const memoHex = Buffer.from(matchMemoFor(donorTx)).toString("hex");
    const matchLog = {
      ...LOGS[0],
      data:
        "0x" +
        BigInt("100000000000000000").toString(16).padStart(64, "0") +
        (64).toString(16).padStart(64, "0") +
        (memoHex.length / 2).toString(16).padStart(64, "0") +
        memoHex.padEnd(64, "0"),
    };
    const match = (status: string, logs = [matchLog], listed = [SPLIT]) =>
      decodeReceipt({ status, blockNumber: "0x11", transactionHash: "0x" + "9".repeat(64), logs }, listed);
    expect(matchMemoFor(donorTx)).toBe("tt:match:e8511ebd");
    expect(isVerifiedMatch(match("0x1"), donorTx)).toBe(true);
    expect(isVerifiedMatch(match("0x0"), donorTx)).toBe(false);
    expect(isVerifiedMatch(match("0x1", [matchLog], []), donorTx)).toBe(false);
    expect(isVerifiedMatch(match("0x1", [LOGS[0]]), donorTx)).toBe(false);
    expect(isVerifiedMatch(match("0x1"), "0x" + "1".repeat(64))).toBe(false);
    expect(isVerifiedMatch(null, donorTx)).toBe(false);
  });
});

describe("match meter and share card", () => {
  const live = { state: "live" as const, chainId: 5042002, relay: true, perGift: "5", dailyLeft: "40", poolLeft: "200" };

  it("shows the match line only while live and only with the match_cap fact", () => {
    expect(matchMeterCopy(live, "Token Tails matches gifts 1:1")).toBe(
      "Token Tails matches gifts up to 5 USDC each; 40 USDC left today."
    );
    expect(matchMeterCopy(live, null)).toBeNull();
    expect(matchMeterCopy({ ...live, state: "exhausted" }, "x")).toBeNull();
    expect(matchMeterCopy(null, "x")).toBeNull();
  });

  it("draws a TESTNET band on a testnet card and none on a real one", () => {
    const texts: string[] = [];
    const ctx = new Proxy(
      {
        createLinearGradient: () => ({ addColorStop: () => undefined }),
        fillText: (t: string) => texts.push(t),
      } as Record<string, unknown>,
      { get: (t, k) => (k in t ? t[k as string] : () => undefined), set: () => true }
    );
    const canvas = { getContext: () => ctx } as unknown as HTMLCanvasElement;
    const card = { shelterName: "Pink Paw", amount: "0.5 USDC", chainName: "Arc Testnet", blockNumber: 1, txHash: TX, variant: "matched" as const };
    drawShareCard(canvas, { ...card, testnet: true });
    expect(texts).toContain(TESTNET_BAND);
    texts.length = 0;
    drawShareCard(canvas, card);
    expect(texts).not.toContain(TESTNET_BAND);
  });

  it("has a '1 became 2' card with no donor identity", () => {
    expect(shareCardHeadline({ shelterName: "Pink Paw (Rožinė pėdutė)", variant: "matched" })).toEqual([
      "1 became 2 for",
      "Pink Paw (Rožinė pėdutė)",
    ]);
    expect(shareCardHeadline({ shelterName: "Pink Paw", variant: "gift" })[0]).toBe("A wallet gift to");
    expect(shareCardHeadline({ shelterName: "Pink Paw" })[0]).toBe("I sent a rescue treat to");
  });
});

describe("factLine", () => {
  const fact = (key: string, status: string, display = "Shown {state}") =>
    ({ id: "X-1", key, status, display, appDisplay: null } as unknown as PublicFact);

  it("hides missing or unverified claims and fills live placeholders", () => {
    const facts = [fact("router_guard", "verified", "Router guard"), fact("match_cap", "company-reported"), fact("match_state", "live")];
    expect(factLine("router_guard", {}, facts)).toBe("Router guard");
    expect(factLine("match_cap", {}, facts)).toBeNull();
    expect(factLine("gasless_give", {}, facts)).toBeNull();
    expect(factLine("match_state", { state: "live" }, facts)).toBe("Shown live");
    expect(factLine("match_state", {}, facts)).toBeNull();
  });

  it("finds facts by key in the generated registry", () => {
    expect(factByKey("match_state")?.id).toBe("L-match");
    expect(factByKey("no_such_key")).toBeNull();
  });
});
