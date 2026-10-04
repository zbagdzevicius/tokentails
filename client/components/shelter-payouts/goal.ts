import { apiUrl } from "@/api/api";
import { ShelterGoalView, parseShelterGoalView, shelterGoalPath } from "@/shared-contracts/shelter-goal";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Campaign,
  CampaignProgress,
  GOAL_FACT_ID,
  GoalCount,
  WalletReading,
  campaignProgress,
  countFromReading,
  countFromView,
  fetchCampaign,
  goalSources,
  usdcTo18,
} from "./campaign";
import { SHELTER_CHAINS } from "./chains";
import { to18 } from "./logs";
import { rpcCall } from "./rpc";

// The campaign goal's live count (fact C-001). First choice: the backend's count of the USDC that
// came in to the campaign wallets (GET /shelter/goal/C-001, summed from the chain's Transfer logs, so
// spending never lowers it and a handover keeps counting). Fallback while the backend cannot answer
// or has not counted its first window: the wallet's balance growth, only while that is exact (one
// wallet that has never sent a transaction). Otherwise the meter says it cannot read the count.

/** The backend's count, or null when it cannot be had (no API, an error, a malformed body). */
export async function fetchGoalView(
  id: string = GOAL_FACT_ID,
  base: string | undefined = apiUrl,
  f: typeof fetch | undefined = typeof fetch === "function" ? fetch : undefined
): Promise<ShelterGoalView | null> {
  if (!base || !f) return null;
  try {
    const res = await f(`${base.replace(/\/+$/, "")}${shelterGoalPath(id)}`, { cache: "no-store", credentials: "omit" });
    if (!res.ok) return null;
    return parseShelterGoalView(await res.json());
  } catch {
    return null;
  }
}

/** The count for the meter, and the backend view it came from (null for the balance fallback). */
export async function readGoalCount(
  campaign: Campaign,
  deps: { view?: () => Promise<ShelterGoalView | null>; wallet?: (c: Campaign) => Promise<WalletReading> } = {}
): Promise<{ count: GoalCount; view: ShelterGoalView | null }> {
  const view = await (deps.view ?? (() => fetchGoalView()))();
  const fromView = countFromView(view);
  if (fromView) return { count: fromView, view };
  // After a handover the balance of one wallet says nothing about the whole campaign.
  if ((campaign.wallets ?? []).length > 1) throw new Error("the campaign has several wallets: only the backend can count it");
  const reading = await (deps.wallet ?? ((c: Campaign) => readCampaignWallet(c)))(campaign);
  const fromWallet = countFromReading(campaign, reading);
  if (!fromWallet) throw new Error("the balance cannot prove what came in");
  return { count: fromWallet, view };
}

/** balanceOf(address) calldata. */
export const balanceOfData = (wallet: string) => "0x70a08231" + wallet.slice(2).toLowerCase().padStart(64, "0");

const hex = (n: number) => "0x" + n.toString(16);

/** Reads the campaign wallet (the balance fallback). Throws when the campaign has no wallet, token or known chain, or the RPC fails. */
export async function readCampaignWallet(campaign: Campaign, call: typeof rpcCall = rpcCall): Promise<WalletReading> {
  const wallet = campaign.shelter.wallet;
  const token = campaign.token;
  const chain = SHELTER_CHAINS[campaign.chainId];
  if (!wallet || !token) throw new Error("the campaign has no wallet yet");
  if (!chain) throw new Error(`no public RPC known for chain ${campaign.chainId}`);
  const data = balanceOfData(wallet);
  const balanceAt = async (tag: string) =>
    to18(BigInt((await call<string>(chain.rpc, "eth_call", [{ to: token.address, data }, tag])) || "0x0"), token.decimals);
  const balance = await balanceAt("latest");
  // The balance just before the campaign's first block, read from the chain; when the RPC keeps no
  // history that far back, the value recorded with the fact (campaign.json startBalance).
  let start = usdcTo18(campaign.startBalance);
  if (campaign.fromBlock !== null && campaign.fromBlock > 0) {
    try {
      start = await balanceAt(hex(campaign.fromBlock - 1));
    } catch {
      /* no archive state: keep the recorded start balance */
    }
  }
  const nonce = parseInt(await call<string>(chain.rpc, "eth_getTransactionCount", [wallet, "latest"]), 16);
  return { balance, start, nonce: Number.isFinite(nonce) ? nonce : 1 };
}

/** Fired after a gift is sent from this page, so every meter on it reads the wallet again. */
export const GOAL_REFRESH_EVENT = "tt:goal-refresh";

export type GoalReadState = "loading" | "ok" | "error" | "idle";

export interface CampaignGoal {
  campaign: Campaign | null;
  /** Progress, with the sources that can reach the open wallet today (`progress.sources`). */
  progress: CampaignProgress | null;
  /** `idle`: the campaign has no wallet, so nothing is read. */
  state: GoalReadState;
  refresh: () => void;
}

/** How often an open page reads the wallet again. */
export const GOAL_POLL_MS = 60_000;

/**
 * The campaign and its live progress, for the meter on /shelter-payouts, /give and /impact. Reads
 * the count on mount, every minute while the tab is visible, when the tab comes back, and when a
 * gift on the page fires GOAL_REFRESH_EVENT. A failed read keeps the last good figure; with none,
 * the meter says it cannot read the count (never "0").
 */
export function useCampaignGoal({ pollMs = GOAL_POLL_MS }: { pollMs?: number } = {}): CampaignGoal {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [count, setCount] = useState<GoalCount | null>(null);
  const [view, setView] = useState<ShelterGoalView | null>(null);
  const [state, setState] = useState<GoalReadState>("loading");
  const alive = useRef(true);
  const seq = useRef(0);

  const read = useCallback((c: Campaign) => {
    if (!c.shelter.wallet || !c.token) {
      setState("idle");
      return;
    }
    const mine = ++seq.current;
    readGoalCount(c)
      .then((r) => {
        if (!alive.current || mine !== seq.current) return;
        setCount(r.count);
        setView(r.view);
        setState("ok");
      })
      .catch(() => {
        if (!alive.current || mine !== seq.current) return;
        // Keep the last good figure on screen; only say "can't read" when there is none.
        setState((prev) => (prev === "ok" ? "ok" : "error"));
      });
  }, []);

  useEffect(() => {
    alive.current = true;
    fetchCampaign()
      .then((c) => {
        if (!alive.current) return;
        setCampaign(c);
        read(c);
      })
      .catch(() => alive.current && setState("error"));
    return () => {
      alive.current = false;
    };
  }, [read]);

  useEffect(() => {
    if (!campaign) return;
    const again = () => {
      if (typeof document === "undefined" || document.visibilityState !== "hidden") read(campaign);
    };
    const timer = pollMs > 0 ? setInterval(again, pollMs) : null;
    window.addEventListener(GOAL_REFRESH_EVENT, again);
    document.addEventListener("visibilitychange", again);
    return () => {
      if (timer) clearInterval(timer);
      window.removeEventListener(GOAL_REFRESH_EVENT, again);
      document.removeEventListener("visibilitychange", again);
    };
  }, [campaign, pollMs, read]);

  const refresh = useCallback(() => {
    if (campaign) read(campaign);
  }, [campaign, read]);

  return {
    campaign,
    progress: campaign ? campaignProgress(campaign, count, goalSources(campaign, view)) : null,
    state,
    refresh,
  };
}
