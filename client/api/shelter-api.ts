import type { DonateSource } from "@/shared-contracts/enums";
import { ErrorCode, errorCodeOf } from "@/shared-contracts/errors";
import { apiUrl, getAuthHeaders } from "./api";

// Client for the backend's shelter donation endpoints (backend/src/shelter). The server pays for the
// treat from its own small hot wallet, so the player never needs a wallet or gas.

// Shared with the backend through the generated copy of shared/enums.ts (plan F2). The donation status
// is exported as a type only; CONFIRMED and FAILED are not written by the backend yet (plan F7.4).
export type {
  DonateSource,
  ShelterDonationStatus,
} from "@/shared-contracts/enums";

export type TreatRailState = "not-deployed" | "paused" | "live" | "exhausted";

/** One network a treat can be sent on (GET /shelter/donate/status `chains`). Amounts are 18 decimals. */
export interface TreatChainStatus {
  chainId: number;
  /** The backend's main chain: the default when no chain is named. */
  main: boolean;
  testnet?: boolean;
  enabled: boolean;
  railState: TreatRailState;
  /** What the treat is paid in there (USDC, USDC.e, USDG; test coins on testnets). */
  coin: string;
  amountWei: string;
  remainingTodayWei: string;
  dailyBudgetWei?: string;
  giftsPerDayCap?: number;
  treatsLeftToday?: number;
  splitAddress: string | null;
  explorer: string | null;
  /** Why the chain is not enabled (the backend's treat health or config), e.g. "the RPC is not answering". */
  reason?: string;
}

export interface DonateStatus {
  enabled: boolean;
  chainId: number;
  amountWei: string;
  remainingTodayWei: string;
  splitAddress: string | null;
  railState?: TreatRailState;
  /** Every network a treat can be sent on, the main chain first. Older backends leave it out. */
  chains?: TreatChainStatus[];
}

export interface DonateReceipt {
  txHash: string;
  chainId: number;
  /** 18 decimals on every chain. */
  amountWei: string;
  explorerUrl: string;
  /** The coin a token treat was paid in; absent on the main chain's native treat. */
  coin?: string;
}

/**
 * Why a signed-in account cannot send a treat yet (backend F7.5 instant-treat policy). Mirrors the
 * backend `EligibilityReason` values the donate route can refuse with.
 */
export type DonateIneligibleReason = "email-unverified" | "account-too-new" | "no-saved-game";

export type DonateResult =
  | { status: "sent"; receipt: DonateReceipt }
  | { status: "signed-out" }
  | { status: "not-eligible"; reason: DonateIneligibleReason; eligibleAt: string | null; message?: string }
  | { status: "already-sent" }
  | { status: "disabled"; message?: string }
  | { status: "error"; message: string };

async function bodyOf(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const body = await response.json();
    return body && typeof body === "object" ? body : null;
  } catch {
    return null;
  }
}

function messageOf(body: Record<string, unknown> | null): string | undefined {
  const m = body?.message;
  return Array.isArray(m) ? m.join(", ") : typeof m === "string" ? m : undefined;
}

const INELIGIBLE_REASONS: DonateIneligibleReason[] = ["account-too-new", "no-saved-game"];

async function getDonateStatus(): Promise<DonateStatus | null> {
  try {
    const response = await fetch(`${apiUrl}/shelter/donate/status`, {
      headers: { Accept: "application/json" },
    });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

/** `chainId`: the picked network. Left out (or the main chain's id omitted by the caller): the main chain. */
async function donate(source: DonateSource, chainId?: number): Promise<DonateResult> {
  const headers = getAuthHeaders();
  if (!headers.accesstoken) return { status: "signed-out" };

  let response: Response;
  try {
    response = await fetch(`${apiUrl}/shelter/donate`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...headers,
      } as HeadersInit,
      body: JSON.stringify(chainId === undefined ? { source } : { source, chainId }),
    });
  } catch {
    return { status: "error", message: "Could not reach Token Tails. Check your connection." };
  }

  if (response.ok) return { status: "sent", receipt: await response.json() };
  const body = await bodyOf(response);
  const code = errorCodeOf(body);
  if (response.status === 401) return { status: "signed-out" };
  if (response.status === 403) {
    // Only a guest refusal (or a 403 with no code, from an older backend) means "sign in". A
    // signed-in account refused by the treat policy is told why instead of being asked again.
    if (code === ErrorCode.EMAIL_UNVERIFIED) {
      return { status: "not-eligible", reason: "email-unverified", eligibleAt: null, message: messageOf(body) };
    }
    if (code === ErrorCode.DONATE_NOT_ELIGIBLE) {
      const reason = INELIGIBLE_REASONS.find((r) => r === body?.reason) || "no-saved-game";
      const eligibleAt = typeof body?.eligibleAt === "string" ? body.eligibleAt : null;
      return { status: "not-eligible", reason, eligibleAt, message: messageOf(body) };
    }
    return { status: "signed-out" };
  }
  if (response.status === 429) {
    // The once-a-day rule carries DONATE_ALREADY_TODAY; the per-IP rate limiter is a bare 429.
    return code === ErrorCode.DONATE_ALREADY_TODAY
      ? { status: "already-sent" }
      : { status: "error", message: "Too many tries. Wait a minute and try again." };
  }
  // 409: the treat rail is paused or today's budget is spent (older backends answered 503).
  // 424: the transaction could not be sent; the message says to try again later.
  if (response.status === 409 || response.status === 503) return { status: "disabled", message: messageOf(body) };
  return {
    status: "error",
    message: messageOf(body) || `Something went wrong (HTTP ${response.status}).`,
  };
}

export const SHELTER_API = {
  getDonateStatus,
  donate,
};
