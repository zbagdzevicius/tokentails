import {
  campaignProgress,
  countFromReading,
  countFromView,
  goalSources,
  parseCampaign,
  percentLabel,
  usdcTo18,
  type GoalCount,
  type WalletReading,
} from "@/components/shelter-payouts/campaign";
import { balanceOfData, fetchGoalView, readCampaignWallet, readGoalCount } from "@/components/shelter-payouts/goal";
import type { ShelterGoalView } from "@/shared-contracts/shelter-goal";
import campaignJson from "@/public/shelter-payouts/campaign.json";
import factsJson from "@/public/facts/facts.json";

const PINK = "0x" + "aa".repeat(20);
const E18 = BigInt("1000000000000000000");
const usdc = (n: number | string) => usdcTo18(String(n));
const base = parseCampaign({ ...campaignJson, shelter: { ...campaignJson.shelter, wallet: PINK } });
const reading = (over: Partial<WalletReading> = {}): WalletReading => ({ balance: BigInt(0), start: BigInt(0), nonce: 0, ...over });
const counted = (raised: bigint, exact = true): GoalCount => ({ raised, exact });
const view = (over: Partial<ShelterGoalView> = {}): ShelterGoalView => ({
  id: "C-001",
  chainId: 5042,
  goalUsdc: "50000",
  raised: "12.5",
  scannedTo: 1000,
  head: 1000,
  upToDate: true,
  transfers: 2,
  wallets: [],
  liveSources: ["treats"],
  updatedAt: null,
  ...over,
});

describe("campaign.json (generated from C-001)", () => {
  it("ships the Pink Paw goal: 50,000 USDC to the held wallet, counting everything that reaches it", () => {
    const c = parseCampaign(campaignJson);
    expect(c.name).toBe("Pink Paw rescue fund");
    expect(c.goalUsdc).toBe("50000");
    expect(c.startDate).toBe("2026-10-02");
    expect(c.endDate).toBe("2027-09-30");
    expect(c.shelter.name).toBe("Pink Paw (Rožinė pėdutė)");
    expect(c.shelter.wallet).toBe("0xe299299b846ba629f5a591dbf4f562bcc07a0f37");
    expect(c.shelter.handover).toBe("held-by-token-tails");
    expect(c.chainId).toBe(5042);
    // First Arc block at or after the campaign startDate, so money from before the goal never counts.
    expect(c.fromBlock).toBe(23790973);
    expect(c.sources).toEqual(["gifts", "match", "treats", "x402", "purchase-shares"]);
    expect(c.token).toEqual({ address: "0x3600000000000000000000000000000000000000", decimals: 6 });
    expect(c.startBalance).toBe("0");
    // The goal counts what comes in to these wallets, each inside its block range.
    expect(c.wallets).toEqual([{ wallet: "0xe299299b846ba629f5a591dbf4f562bcc07a0f37", fromBlock: 23790973, toBlock: null, holder: "token-tails" }]);
  });

  it("agrees with the public facts copy of C-001", () => {
    const fact = (factsJson as { facts: { id: string; value: unknown; goal?: { endDate: string }; campaign?: { wallet: string } }[] }).facts.find(
      (f) => f.id === "C-001"
    );
    expect(fact?.value).toBe(campaignJson.goalUsdc);
    expect(fact?.goal?.endDate).toBe(campaignJson.endDate);
    expect(fact?.campaign?.wallet).toBe(campaignJson.shelter.wallet);
  });

  it("rejects a bad goal and drops a malformed token or date", () => {
    expect(() => parseCampaign({ ...campaignJson, goalUsdc: 500 })).toThrow(/goalUsdc/);
    const c = parseCampaign({ ...campaignJson, token: { address: "0x12", decimals: 6 }, endDate: "soon", sources: ["gifts", "airdrop"] });
    expect(c.token).toBeNull();
    expect(c.endDate).toBe("");
    expect(c.sources).toEqual(["gifts"]);
  });
});

describe("campaignProgress (what came in, never what is left)", () => {
  it("counts nothing while the wallet is null", () => {
    const c = parseCampaign({ ...campaignJson, shelter: { ...campaignJson.shelter, wallet: null } });
    expect(campaignProgress(c, counted(usdc(5)))).toMatchObject({ counting: false, raised: BigInt(0), percent: 0 });
  });

  it("is the backend's count against 50,000, exact only when it reaches the chain head", () => {
    const p = campaignProgress(base, countFromView(view({ raised: "10.5" })));
    expect(p.raised).toBe(usdc("10.5"));
    expect(p.goal).toBe(usdc(50000));
    expect(p.percent).toBe(0.02);
    expect(p.exact).toBe(true);
    expect(percentLabel(p)).toBe("0.02%");
    expect(campaignProgress(base, countFromView(view({ upToDate: false }))).exact).toBe(false);
  });

  it("claims nothing before the backend has counted its first window", () => {
    expect(countFromView(view({ scannedTo: null }))).toBeNull();
    expect(countFromView(null)).toBeNull();
  });

  it("caps at 100%", () => {
    expect(campaignProgress(base, counted(usdc(60000))).percent).toBe(100);
  });

  it("uses the balance only while it is exact: one wallet that never sent a transaction", () => {
    expect(countFromReading(base, reading({ balance: usdc("12.5"), start: usdc(2) }))).toEqual(counted(usdc("10.5")));
    expect(countFromReading(base, reading({ balance: usdc(1), start: usdc(3) }))).toEqual(counted(BigInt(0)));
    // A wallet that has spent: its balance can go down, so it proves nothing.
    expect(countFromReading(base, reading({ balance: usdc(100), nonce: 2 }))).toBeNull();
    // After a handover, one wallet's balance is not the campaign's count.
    const rotated = { ...base, wallets: [...(base.wallets ?? []), { wallet: PINK, fromBlock: 1, toBlock: null, holder: "shelter" as const }] };
    expect(countFromReading(rotated, reading({ balance: usdc(5) }))).toBeNull();
  });

  it("names only the sources that can reach the open wallet today", () => {
    expect(campaignProgress(base, null).sources).toEqual(["treats"]);
    expect(goalSources(base, view({ liveSources: ["treats", "purchase-shares"] }))).toEqual(["treats", "purchase-shares"]);
    const handed = parseCampaign({
      ...campaignJson,
      wallets: [{ wallet: PINK, fromBlock: 1, toBlock: null, holder: "shelter" }],
      shelter: { ...campaignJson.shelter, wallet: PINK, handover: "handed-over" },
    });
    expect(goalSources(handed, null)).toEqual(["gifts", "match", "treats", "x402"]);
  });

  it("labels tiny and empty shares honestly", () => {
    expect(percentLabel({ raised: BigInt(0), goal: usdc(50000) })).toBe("0%");
    expect(percentLabel({ raised: usdc("0.01"), goal: usdc(50000) })).toBe("<0.01%");
    expect(percentLabel({ raised: usdc(25000), goal: usdc(50000) })).toBe("50%");
    expect(percentLabel({ raised: usdc(50000), goal: usdc(50000) })).toBe("100%");
  });
});

describe("readGoalCount (the backend first, the balance only while exact)", () => {
  it("uses the backend's count and never reads the wallet then", async () => {
    const wallet = jest.fn();
    const r = await readGoalCount(base, { view: async () => view({ raised: "3" }), wallet });
    expect(r.count).toEqual(counted(usdc(3)));
    expect(wallet).not.toHaveBeenCalled();
  });

  it("falls back to an exact balance when the backend cannot answer", async () => {
    const r = await readGoalCount(base, { view: async () => null, wallet: async () => reading({ balance: usdc(2) }) });
    expect(r).toEqual({ count: counted(usdc(2)), view: null });
  });

  it("refuses a balance that cannot prove what came in", async () => {
    await expect(readGoalCount(base, { view: async () => null, wallet: async () => reading({ balance: usdc(2), nonce: 1 }) })).rejects.toThrow();
    const rotated = { ...base, wallets: [{ wallet: PINK, fromBlock: 1, toBlock: 5, holder: "token-tails" as const }, { wallet: "0x" + "bb".repeat(20), fromBlock: 6, toBlock: null, holder: "shelter" as const }] };
    const wallet = jest.fn();
    await expect(readGoalCount(rotated, { view: async () => null, wallet })).rejects.toThrow(/several wallets/);
    expect(wallet).not.toHaveBeenCalled();
  });

  it("fetches GET /shelter/goal/C-001 and checks the body", async () => {
    const f = jest.fn(async () => ({ ok: true, json: async () => view() }));
    expect(await fetchGoalView("C-001", "https://api.test/", f as never)).toMatchObject({ raised: "12.5" });
    expect((f.mock.calls[0] as unknown[])[0]).toBe("https://api.test/shelter/goal/C-001");
    expect(await fetchGoalView("C-001", "https://api.test", (async () => ({ ok: false })) as never)).toBeNull();
    expect(await fetchGoalView("C-001", "https://api.test", (async () => ({ ok: true, json: async () => ({ raised: 1 }) })) as never)).toBeNull();
    expect(await fetchGoalView("C-001", undefined, f as never)).toBeNull();
  });
});

describe("readCampaignWallet", () => {
  const calls: { method: string; params: unknown[] }[] = [];
  const fake =
    (answers: Record<string, string | Error>) =>
    async <T,>(_url: string, method: string, params: unknown[]): Promise<T> => {
      calls.push({ method, params });
      const tag = method === "eth_call" ? (params[1] as string) : method;
      const a = answers[tag];
      if (a instanceof Error) throw a;
      return a as unknown as T;
    };
  beforeEach(() => (calls.length = 0));

  it("reads the USDC balance now and just before fromBlock, and the nonce, on the campaign chain", async () => {
    const r = await readCampaignWallet(
      base,
      fake({ latest: "0x" + (12_500_000).toString(16), [`0x${(23790972).toString(16)}`]: "0x0", eth_getTransactionCount: "0x0" }) as never
    );
    expect(r).toEqual({ balance: usdc("12.5"), start: BigInt(0), nonce: 0 });
    expect(calls[0].params[0]).toEqual({ to: "0x3600000000000000000000000000000000000000", data: balanceOfData(PINK) });
    expect(balanceOfData(PINK)).toBe("0x70a08231" + "0".repeat(24) + "aa".repeat(20));
  });

  it("falls back to the recorded start balance when the RPC keeps no history", async () => {
    const c = { ...base, startBalance: "1.5" };
    const r = await readCampaignWallet(
      c,
      fake({ latest: "0x" + (2_000_000).toString(16), [`0x${(23790972).toString(16)}`]: new Error("missing trie node"), eth_getTransactionCount: "0x3" }) as never
    );
    expect(r.start).toBe(usdc("1.5"));
    expect(r.nonce).toBe(3);
    expect(r.balance - r.start).toBe(usdc("0.5"));
  });

  it("refuses a campaign with no wallet, and lets an RPC failure reach the caller", async () => {
    await expect(readCampaignWallet({ ...base, shelter: { ...base.shelter, wallet: null } })).rejects.toThrow(/no wallet/);
    await expect(readCampaignWallet(base, fake({ latest: new Error("down") }) as never)).rejects.toThrow(/down/);
  });

  it("uses whole USDC math (no float drift)", () => {
    expect(campaignProgress(base, counted(E18 * BigInt(49999))).percent).toBe(99.99);
  });
});
