// copy-lint: web-only used only by WalletDonate, ShelterReceipt and the onboarding page (web builds)
// Client for the public wallet-gift endpoints of the backend (feature F2): the gas relay, the Token
// Tails match and the shelter wallet claim. None of them needs an account. The relay only pays the
// gas: the USDC moves from the donor's wallet through the router to the shelter in one transaction.
import { apiUrl } from "@/api/api";

export interface RelayBody {
  chainId: number;
  from: string;
  value: string;
  validAfter: string;
  validBefore: string;
  salt: string;
  memo: string;
  /** router.recipientsHash(value) the donor signed over. */
  recipients: string;
  signature: string;
}

export type RelayResult =
  | { ok: true; txHash: string; status: string }
  | { ok: false; code: string | null; message: string; httpStatus: number | null };

/**
 * Refusals where the donor can still give by sending the same signed gift from their own wallet
 * (paying the network fee): the relay is off, on another network, or out of budget.
 */
export const SELF_SUBMIT_CODES = new Set([
  "RELAY_OFF",
  "RELAY_WRONG_CHAIN",
  "RELAY_DAILY_CAP",
  "RELAY_SIGNER_CAP",
  "RELAY_SEND_FAILED",
]);

async function json(res: Response): Promise<Record<string, unknown> | null> {
  try {
    const body = await res.json();
    return body && typeof body === "object" ? body : null;
  } catch {
    return null;
  }
}

export async function postRelay(body: RelayBody, fetchFn: typeof fetch = fetch): Promise<RelayResult> {
  let res: Response;
  try {
    res = await fetchFn(`${apiUrl}/shelter/relay`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, code: null, message: "Could not reach Token Tails to pay the network fee.", httpStatus: null };
  }
  const b = await json(res);
  if (res.ok && typeof b?.txHash === "string") {
    return { ok: true, txHash: b.txHash, status: typeof b.status === "string" ? b.status : "submitted" };
  }
  const m = b?.message;
  return {
    ok: false,
    code: typeof b?.code === "string" ? b.code : null,
    message: Array.isArray(m) ? m.join(", ") : typeof m === "string" ? m : `The relay answered HTTP ${res.status}.`,
    httpStatus: res.status,
  };
}

/** GET /shelter/relay/:txHash: a relayed gift's state. `settledTxHash`: another tx paid it first. */
export interface RelayStatus {
  status: string;
  settledTxHash: string | null;
}

export async function getRelayStatus(txHash: string, fetchFn: typeof fetch = fetch): Promise<RelayStatus | null> {
  try {
    const res = await fetchFn(`${apiUrl}/shelter/relay/${encodeURIComponent(txHash)}`, { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const b = await json(res);
    if (!b || typeof b.status !== "string") return null;
    const settled = typeof b.settledTxHash === "string" && /^0x[0-9a-fA-F]{64}$/.test(b.settledTxHash) ? b.settledTxHash : null;
    return { status: b.status, settledTxHash: settled };
  } catch {
    return null;
  }
}

export type MatchState = "off" | "live" | "exhausted" | "awaiting-handover";

export interface MatchStatus {
  state: MatchState;
  /**
   * The chain the backend's relay and match serve for this status. Null from an older backend: then
   * the page treats the relay as unknown and never shows the match next to a block on another chain.
   */
  chainId: number | null;
  /** The gas relay takes gifts on `chainId` right now. */
  relay: boolean;
  /** Decimal USDC strings. */
  perGift: string;
  dailyLeft: string;
  poolLeft: string;
}

/** The match and relay status for `chainId` (the backend's main chain when omitted). */
export async function getMatchStatus(chainId?: number | null, fetchFn: typeof fetch = fetch): Promise<MatchStatus | null> {
  try {
    const q = chainId ? `?chainId=${encodeURIComponent(String(chainId))}` : "";
    const res = await fetchFn(`${apiUrl}/shelter/match/status${q}`, { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const b = await json(res);
    if (!b || typeof b.state !== "string") return null;
    return {
      state: b.state as MatchState,
      chainId: typeof b.chainId === "number" && Number.isInteger(b.chainId) && b.chainId > 0 ? b.chainId : null,
      relay: b.relay === true,
      perGift: String(b.perGift ?? "0"),
      dailyLeft: String(b.dailyLeft ?? "0"),
      poolLeft: String(b.poolLeft ?? "0"),
    };
  } catch {
    return null;
  }
}

export type MatchPairStatus =
  | "none"
  | "pending"
  | "sent"
  | "confirmed"
  | "skipped-cap"
  | "skipped-small"
  | "failed";

export interface MatchPair {
  status: MatchPairStatus;
  matchTxHash: string | null;
}

/** Statuses after which polling stops: the match landed, or it will not come. */
export const MATCH_FINAL = new Set<MatchPairStatus>(["confirmed", "skipped-cap", "skipped-small", "failed"]);

export async function getMatchByDonor(txHash: string, fetchFn: typeof fetch = fetch): Promise<MatchPair | null> {
  try {
    const res = await fetchFn(`${apiUrl}/shelter/match/by-donor/${encodeURIComponent(txHash)}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const b = await json(res);
    if (!b || typeof b.status !== "string") return null;
    return {
      status: b.status as MatchPairStatus,
      matchTxHash: typeof b.matchTxHash === "string" && /^0x[0-9a-fA-F]{64}$/.test(b.matchTxHash) ? b.matchTxHash : null,
    };
  } catch {
    return null;
  }
}

export type ClaimStatus = "pending-rotation" | "approved" | "rotated" | "rejected";

export interface ClaimView {
  wallet: string;
  chainId: number;
  status: ClaimStatus;
}

/** v1 names one chain (`chainId`); v2 names `chains` or `allChains: true` (claimMessageV2). */
export type ClaimBody =
  | { chainId: number; wallet: string; signature: string }
  | { chains: number[]; wallet: string; signature: string }
  | { allChains: true; wallet: string; signature: string };

export async function postClaim(
  body: ClaimBody,
  fetchFn: typeof fetch = fetch
): Promise<{ ok: true; status: string } | { ok: false; message: string }> {
  try {
    const res = await fetchFn(`${apiUrl}/shelter/claim`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const b = await json(res);
    if (res.ok) return { ok: true, status: typeof b?.status === "string" ? b.status : "pending-rotation" };
    const m = b?.message;
    return {
      ok: false,
      message: Array.isArray(m) ? m.join(", ") : typeof m === "string" ? m : `Token Tails answered HTTP ${res.status}.`,
    };
  } catch {
    return { ok: false, message: "Could not reach Token Tails. Check your connection and try again." };
  }
}

export async function getClaim(fetchFn: typeof fetch = fetch): Promise<ClaimView | null | undefined> {
  try {
    const res = await fetchFn(`${apiUrl}/shelter/claim`, { headers: { Accept: "application/json" } });
    if (!res.ok) return undefined;
    const b = await json(res);
    if (!b) return null;
    if (typeof b.wallet !== "string" || typeof b.status !== "string") return null;
    return { wallet: b.wallet, chainId: Number(b.chainId), status: b.status as ClaimStatus };
  } catch {
    return undefined;
  }
}

/** One chain a claim can cover, with its latest public claim (approved or rotated) or null. */
export interface ChainClaim {
  chainId: number;
  testnet: boolean;
  main: boolean;
  claim: ClaimView | null;
}

/** GET /shelter/claim/chains; undefined when unreachable or not served (an older backend). */
export async function getClaimChains(fetchFn: typeof fetch = fetch): Promise<ChainClaim[] | undefined> {
  try {
    const res = await fetchFn(`${apiUrl}/shelter/claim/chains`, { headers: { Accept: "application/json" } });
    if (!res.ok) return undefined;
    const b = await json(res);
    if (!Array.isArray(b)) return undefined;
    return b
      .filter((r) => r && Number.isSafeInteger(Number(r.chainId)))
      .map((r) => ({
        chainId: Number(r.chainId),
        testnet: !!r.testnet,
        main: !!r.main,
        claim:
          r.claim && typeof r.claim.wallet === "string" && typeof r.claim.status === "string"
            ? { wallet: r.claim.wallet, chainId: Number(r.claim.chainId), status: r.claim.status as ClaimStatus }
            : null,
      }));
  } catch {
    return undefined;
  }
}
