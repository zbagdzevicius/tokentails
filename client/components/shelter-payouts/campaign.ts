import { SHELTER_CHAINS } from "./chains";
import { Disbursement, payoutUnit, to18 } from "./logs";

// public/shelter-payouts/campaign.json: the showcase shelter and its campaign goal. The goal,
// start date and fromBlock are placeholders the team edits. The wallet stays null until the
// ShelterSplit deploy; while it is null the meter shows the goal but counts nothing.
export const CAMPAIGN_URL = "/shelter-payouts/campaign.json";

export type HandoverStatus = "held-by-token-tails" | "handed-over";

export interface ShowcaseShelter {
  name: string;
  wallet: string | null;
  handover: HandoverStatus;
}

export interface Campaign {
  name: string;
  goalUsdc: string;
  startDate: string;
  chainId: number;
  fromBlock: number | null;
  shelter: ShowcaseShelter;
}

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export function parseCampaign(raw: unknown): Campaign {
  const c = raw as Partial<Campaign> | null;
  if (!c || typeof c !== "object") throw new Error("campaign.json must be an object");
  if (typeof c.name !== "string" || !c.name) throw new Error("campaign.json: name is required");
  if (typeof c.goalUsdc !== "string" || !/^\d+(\.\d{1,6})?$/.test(c.goalUsdc)) {
    throw new Error("campaign.json: goalUsdc must be a decimal string such as \"500\"");
  }
  if (typeof c.chainId !== "number") throw new Error("campaign.json: chainId is required");
  const s = c.shelter as Partial<ShowcaseShelter> | undefined;
  if (!s || typeof s.name !== "string") throw new Error("campaign.json: shelter.name is required");
  const wallet = typeof s.wallet === "string" && ADDRESS.test(s.wallet) ? s.wallet.toLowerCase() : null;
  return {
    name: c.name,
    goalUsdc: c.goalUsdc,
    startDate: typeof c.startDate === "string" ? c.startDate : "",
    chainId: c.chainId,
    fromBlock: typeof c.fromBlock === "number" ? c.fromBlock : null,
    shelter: {
      name: s.name,
      wallet,
      handover: s.handover === "handed-over" ? "handed-over" : "held-by-token-tails",
    },
  };
}

export async function fetchCampaign(): Promise<Campaign> {
  const res = await fetch(CAMPAIGN_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`campaign.json: HTTP ${res.status}`);
  return parseCampaign(await res.json());
}

// "500" or "12.5" USDC -> 18-decimal units, the scale the page sums in.
export function usdcTo18(amount: string): bigint {
  const [whole, frac = ""] = amount.split(".");
  return BigInt(whole + frac.padEnd(18, "0").slice(0, 18));
}

export interface CampaignProgress {
  counting: boolean; // false until the shelter wallet is configured
  raised: bigint; // 18-decimal USDC
  goal: bigint; // 18-decimal USDC
  percent: number; // 0..100, two decimals
  count: number;
}

// Sums the on-chain USDC payouts to the campaign's shelter on the campaign's chain, from
// fromBlock on. Native USDC (18 decimals on Arc) and ERC-20 USDC (6) both count.
export function campaignProgress(
  campaign: Campaign,
  perChain: { chainId: number; items: Disbursement[] }[]
): CampaignProgress {
  const goal = usdcTo18(campaign.goalUsdc);
  const wallet = campaign.shelter.wallet;
  const chain = SHELTER_CHAINS[campaign.chainId];
  let raised = BigInt(0);
  let count = 0;
  if (wallet && chain) {
    for (const entry of perChain) {
      if (entry.chainId !== campaign.chainId) continue;
      for (const d of entry.items) {
        if (d.shelter.toLowerCase() !== wallet) continue;
        if (campaign.fromBlock !== null && d.blockNumber < campaign.fromBlock) continue;
        const unit = payoutUnit(d.kind, chain);
        if (unit.symbol !== "USDC") continue;
        raised += to18(d.amount, unit.decimals);
        count += 1;
      }
    }
  }
  const basisPoints = goal > BigInt(0) ? (raised * BigInt(10000)) / goal : BigInt(0);
  const percent = Math.min(100, Number(basisPoints) / 100);
  return { counting: !!wallet, raised, goal, percent, count };
}

export const handoverLabel = (s: HandoverStatus) =>
  s === "handed-over"
    ? "Handed over: the shelter holds its own keys"
    : "Not handed over yet: Token Tails holds this wallet for the shelter";
