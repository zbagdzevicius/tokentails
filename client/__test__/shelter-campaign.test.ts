import { campaignProgress, parseCampaign, usdcTo18 } from "@/components/shelter-payouts/campaign";
import { Disbursement } from "@/components/shelter-payouts/logs";
import campaignJson from "@/public/shelter-payouts/campaign.json";

const PINK = "0x" + "aa".repeat(20);
const OTHER = "0x" + "bb".repeat(20);
const E18 = BigInt("1000000000000000000");

function d(over: Partial<Disbursement>): Disbursement {
  return {
    kind: "native",
    contract: "0x" + "cc".repeat(20),
    shelter: PINK,
    amount: E18,
    memo: "tt:page:abc",
    txHash: "0x" + "11".repeat(32),
    blockNumber: 100,
    logIndex: 0,
    ...over,
  };
}

const base = parseCampaign({ ...campaignJson, shelter: { ...campaignJson.shelter, wallet: PINK } });

describe("campaign.json", () => {
  it("ships the Pink Paw campaign with no wallet until the deploy", () => {
    const c = parseCampaign(campaignJson);
    expect(c.name).toBe("Pink Paw autumn rescue");
    expect(c.shelter.name).toBe("Pink Paw (Rožinė pėdutė)");
    expect(c.shelter.wallet).toBeNull();
    expect(c.shelter.handover).toBe("held-by-token-tails");
    expect(c.chainId).toBe(5042);
  });

  it("rejects a bad goal", () => {
    expect(() => parseCampaign({ ...campaignJson, goalUsdc: 500 })).toThrow(/goalUsdc/);
  });
});

describe("campaignProgress", () => {
  it("counts nothing while the wallet is null", () => {
    const p = campaignProgress(parseCampaign(campaignJson), [{ chainId: 5042, items: [d({})] }]);
    expect(p).toMatchObject({ counting: false, raised: BigInt(0), percent: 0, count: 0 });
  });

  it("sums native (18) and ERC-20 (6) USDC to the shelter on the campaign chain", () => {
    const p = campaignProgress({ ...base, goalUsdc: "10" }, [
      {
        chainId: 5042,
        items: [
          d({ amount: E18 }), // 1 native USDC
          d({ kind: "token", amount: BigInt(1500000) }), // 1.5 ERC-20 USDC
          d({ shelter: OTHER, amount: E18 * BigInt(100) }), // another shelter
        ],
      },
      { chainId: 8453, items: [d({ amount: E18 * BigInt(50) })] }, // another chain
    ]);
    expect(p.raised).toBe(usdcTo18("2.5"));
    expect(p.goal).toBe(usdcTo18("10"));
    expect(p.percent).toBe(25);
    expect(p.count).toBe(2);
  });

  it("skips payouts before fromBlock and caps at 100%", () => {
    const p = campaignProgress({ ...base, goalUsdc: "1", fromBlock: 50 }, [
      { chainId: 5042, items: [d({ blockNumber: 10, amount: E18 * BigInt(9) }), d({ amount: E18 * BigInt(3) })] },
    ]);
    expect(p.raised).toBe(E18 * BigInt(3));
    expect(p.count).toBe(1);
    expect(p.percent).toBe(100);
  });

  it("matches the wallet case-insensitively", () => {
    const p = campaignProgress(base, [{ chainId: 5042, items: [d({ shelter: PINK.toUpperCase().replace("0X", "0x") })] }]);
    expect(p.count).toBe(1);
  });
});
