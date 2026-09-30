import { apiUrl, getAuthHeaders } from "./api";

// Client for the backend's shelter donation endpoints (backend/src/shelter). The server pays for the
// treat from its own small hot wallet, so the player never needs a wallet or gas.

export type DonateSource = "heist" | "page";

export interface DonateStatus {
  enabled: boolean;
  chainId: number;
  amountWei: string;
  remainingTodayWei: string;
  splitAddress: string | null;
}

export interface DonateReceipt {
  txHash: string;
  chainId: number;
  amountWei: string;
  explorerUrl: string;
}

export type DonateResult =
  | { status: "sent"; receipt: DonateReceipt }
  | { status: "signed-out" }
  | { status: "already-sent" }
  | { status: "disabled"; message?: string }
  | { status: "error"; message: string };

async function messageOf(response: Response): Promise<string | undefined> {
  try {
    const body = await response.json();
    const m = body?.message;
    return Array.isArray(m) ? m.join(", ") : typeof m === "string" ? m : undefined;
  } catch {
    return undefined;
  }
}

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

async function donate(source: DonateSource): Promise<DonateResult> {
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
      body: JSON.stringify({ source }),
    });
  } catch {
    return { status: "error", message: "Could not reach Token Tails. Check your connection." };
  }

  if (response.ok) return { status: "sent", receipt: await response.json() };
  if (response.status === 401 || response.status === 403) return { status: "signed-out" };
  if (response.status === 429) {
    // The backend's once-a-day rule says "already"; the per-IP rate limiter is also a 429.
    const message = await messageOf(response);
    return /already/i.test(message || "")
      ? { status: "already-sent" }
      : { status: "error", message: "Too many tries. Wait a minute and try again." };
  }
  if (response.status === 503) return { status: "disabled", message: await messageOf(response) };
  return {
    status: "error",
    message: (await messageOf(response)) || `Something went wrong (HTTP ${response.status}).`,
  };
}

export const SHELTER_API = {
  getDonateStatus,
  donate,
};
