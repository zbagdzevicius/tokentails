// public/shelter-payouts/campaign.json: the showcase shelter and its campaign goal, generated from
// fact C-001 (funding/framework/facts/facts.json; edit that, never the JSON). The goal counts the
// US dollar stablecoins that CAME IN to the campaign wallets (`wallets`, each inside its block range
// on the campaign chain; USDC, USDC.e and USDG on every other mainnet, never EURC or test coins), as
// the backend sums them from the chains' Transfer logs (GET /shelter/goal/C-001, shared/shelter-goal.ts):
// spending never lowers it, and a handover to the shelter's own wallet keeps counting. While the
// wallet is null the meter shows the goal but counts nothing.
import { GoalSource, GoalWallet, ShelterGoalView, sourcesFor } from "@/shared-contracts/shelter-goal";

export type { GoalSource, GoalWallet };

export const CAMPAIGN_URL = "/shelter-payouts/campaign.json";

/** The fact that generates campaign.json (only one entry may). */
export const GOAL_FACT_ID = "C-001";

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
  /** The goal's target date, `YYYY-MM-DD`, or "" when the file has none. */
  endDate: string;
  chainId: number;
  fromBlock: number | null;
  sources: GoalSource[];
  /** The USDC the meter reads the wallet's balance in (Arc: the ERC-20 view of native USDC). */
  token: { address: string; decimals: number } | null;
  /** The wallet's USDC balance just before `fromBlock`, a decimal string. */
  startBalance: string;
  /**
   * Every wallet the goal counts, each inside its block range; the open one is shelter.wallet.
   * parseCampaign always sets it ([] for an older campaign.json).
   */
  wallets?: GoalWallet[];
  shelter: ShowcaseShelter;
}

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const AMOUNT = /^\d+(\.\d{1,6})?$/;
const SOURCES: GoalSource[] = ["gifts", "match", "treats", "x402", "purchase-shares"];

export function parseCampaign(raw: unknown): Campaign {
  const c = raw as (Partial<Omit<Campaign, "token">> & { token?: unknown }) | null;
  if (!c || typeof c !== "object") throw new Error("campaign.json must be an object");
  if (typeof c.name !== "string" || !c.name) throw new Error("campaign.json: name is required");
  if (typeof c.goalUsdc !== "string" || !AMOUNT.test(c.goalUsdc)) {
    throw new Error("campaign.json: goalUsdc must be a decimal string such as \"500\"");
  }
  if (typeof c.chainId !== "number") throw new Error("campaign.json: chainId is required");
  const s = c.shelter as Partial<ShowcaseShelter> | undefined;
  if (!s || typeof s.name !== "string") throw new Error("campaign.json: shelter.name is required");
  const wallet = typeof s.wallet === "string" && ADDRESS.test(s.wallet) ? s.wallet.toLowerCase() : null;
  const t = c.token as { address?: unknown; decimals?: unknown } | null | undefined;
  const token =
    t && typeof t.address === "string" && ADDRESS.test(t.address) && Number.isInteger(t.decimals) &&
    (t.decimals as number) >= 0 && (t.decimals as number) <= 18
      ? { address: t.address.toLowerCase(), decimals: t.decimals as number }
      : null;
  return {
    name: c.name,
    goalUsdc: c.goalUsdc,
    startDate: typeof c.startDate === "string" ? c.startDate : "",
    endDate: typeof c.endDate === "string" && DAY.test(c.endDate) ? c.endDate : "",
    chainId: c.chainId,
    fromBlock: typeof c.fromBlock === "number" ? c.fromBlock : null,
    sources: Array.isArray(c.sources) ? SOURCES.filter((x) => (c.sources as unknown[]).includes(x)) : [],
    token,
    startBalance: typeof c.startBalance === "string" && AMOUNT.test(c.startBalance) ? c.startBalance : "0",
    wallets: parseWallets((c as { wallets?: unknown }).wallets),
    shelter: {
      name: s.name,
      wallet,
      handover: s.handover === "handed-over" ? "handed-over" : "held-by-token-tails",
    },
  };
}

const isBlock = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;

/** campaign.json `wallets`: well-formed entries only, addresses lowercased. */
function parseWallets(raw: unknown): GoalWallet[] {
  if (!Array.isArray(raw)) return [];
  const out: GoalWallet[] = [];
  for (const w of raw as Record<string, unknown>[]) {
    if (!w || typeof w.wallet !== "string" || !ADDRESS.test(w.wallet) || !isBlock(w.fromBlock)) continue;
    out.push({
      wallet: w.wallet.toLowerCase(),
      fromBlock: w.fromBlock,
      toBlock: isBlock(w.toBlock) ? w.toBlock : null,
      holder: w.holder === "shelter" ? "shelter" : "token-tails",
    });
  }
  return out;
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

/**
 * The shelter wallet as the balance fallback reads it, all in 18-decimal USDC: its balance now, its
 * balance just before the campaign's first block, and how many transactions it has sent (its nonce).
 */
export interface WalletReading {
  balance: bigint;
  start: bigint;
  nonce: number;
}

/** One chain's share of the count (the backend's per-chain breakdown). */
export interface GoalChainShare {
  chainId: number;
  /** 18-decimal USD that came in on this chain. */
  raised: bigint;
  /** The coins counted there: USDC, USDC.e (Tempo), USDG (Robinhood Chain). */
  symbols: string[];
  /** False until the backend has counted this chain's first window. */
  counted: boolean;
}

/** What came in, as the meter shows it. */
export interface GoalCount {
  /** 18-decimal USDC that came in since the start. */
  raised: bigint;
  /** False while the backend is still counting older blocks: the figure is then "at least". */
  exact: boolean;
  /** Per-chain breakdown from the backend, the campaign chain first; absent for the balance fallback. */
  chains?: GoalChainShare[];
  /** True for the balance fallback: only the campaign chain was read, so the figure is "at least". */
  partial?: boolean;
}

export interface CampaignProgress {
  counting: boolean; // false until the shelter wallet is configured
  raised: bigint; // 18-decimal USDC that came in since the start (at least, when !exact)
  goal: bigint; // 18-decimal USDC
  percent: number; // 0..100, two decimals
  /** False while the count does not reach the chain head yet ("at least"). */
  exact: boolean;
  /** What can reach the open wallet today: the only sources the copy may name as counting. */
  sources: GoalSource[];
  /** Per-chain breakdown ([] when only the campaign chain is known). */
  chains: GoalChainShare[];
  /** Only the campaign chain was read (the backend did not answer). */
  partial: boolean;
}

/** The backend's count (GET /shelter/goal/C-001); null before its first window (nothing is claimed). */
export function countFromView(view: ShelterGoalView | null): GoalCount | null {
  if (!view || view.scannedTo === null) return null;
  const chains = (view.chains ?? []).map((c) => ({
    chainId: c.chainId,
    raised: usdcTo18(c.raised),
    symbols: c.symbols,
    counted: c.scannedTo !== null,
  }));
  return { raised: usdcTo18(view.raised), exact: view.upToDate, ...(chains.length ? { chains } : {}) };
}

/**
 * The balance fallback, used only while it is exact: one campaign wallet that has never sent a
 * transaction, so its growth since the start is exactly what came in on the campaign chain. Anything
 * else (a second wallet after the handover, or a wallet that has spent) proves nothing: null, and the
 * meter says it cannot read the count rather than show a balance that can go down. The goal counts
 * the other chains too, which only the backend reads, so this figure is always "at least".
 */
export function countFromReading(campaign: Campaign, reading: WalletReading | null): GoalCount | null {
  if (!reading || reading.nonce !== 0 || (campaign.wallets ?? []).length > 1) return null;
  const grown = reading.balance - reading.start;
  return { raised: grown > BigInt(0) ? grown : BigInt(0), exact: false, partial: true };
}

/** The holder of the wallet money reaches today. */
export const openHolder = (campaign: Campaign) =>
  (campaign.wallets ?? []).find((w) => w.toBlock === null)?.holder ??
  (campaign.shelter.handover === "handed-over" ? "shelter" : "token-tails");

/** Live sources: the backend's list, else what the open wallet's holder allows (no shop shares). */
export function goalSources(campaign: Campaign, view: ShelterGoalView | null): GoalSource[] {
  return view ? view.liveSources : sourcesFor(openHolder(campaign));
}

/**
 * Goal progress from a count. Null count (not read yet, or unreadable): nothing is claimed.
 */
export function campaignProgress(
  campaign: Campaign,
  count: GoalCount | null,
  sources: GoalSource[] = sourcesFor(openHolder(campaign))
): CampaignProgress {
  const goal = usdcTo18(campaign.goalUsdc);
  const counting = !!campaign.shelter.wallet && !!campaign.token;
  const zero = BigInt(0);
  const raised = counting && count && count.raised > zero ? count.raised : zero;
  const basisPoints = goal > zero ? (raised * BigInt(10000)) / goal : zero;
  const percent = Math.min(100, Number(basisPoints) / 100);
  return {
    counting,
    raised,
    goal,
    percent,
    exact: !count || count.exact,
    sources,
    chains: count?.chains ?? [],
    partial: !!count?.partial,
  };
}

/** "0.02%", "<0.01%" for a sliver above zero, "0%" for nothing, "100%" at the goal. */
export function percentLabel(p: Pick<CampaignProgress, "raised" | "goal">): string {
  const zero = BigInt(0);
  if (p.raised <= zero || p.goal <= zero) return "0%";
  const bp = (p.raised * BigInt(10000)) / p.goal;
  if (bp >= BigInt(10000)) return "100%";
  if (bp === zero) return "<0.01%";
  const n = Number(bp) / 100;
  return `${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;
}

/** The handover line; app builds use the F7.2 holder labels (no wallet or key wording). */
export const handoverLabel = (s: HandoverStatus, isApp = false) =>
  isApp
    ? s === "handed-over"
      ? "Held by shelter"
      : "Held by Token Tails for the shelter until handover"
    : s === "handed-over"
    ? "Handed over: the shelter holds its own keys"
    : "Not handed over yet: Token Tails holds this wallet for the shelter";

/** "2 October 2026" for a `YYYY-MM-DD` date, or null when unset or not a date. */
export function claimsDateLabel(date: string | null | undefined): string | null {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const t = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(t)) return null;
  return new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}
