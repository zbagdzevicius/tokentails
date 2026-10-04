import { apiFetch, apiUrl, currentAccessToken } from "@/api/api";
import { type DonateRail } from "@/api/impact-api";
import type { ImpactViewer } from "@/components/impact/useImpactMe";
import { ErrorCode, errorCodeOf } from "@/shared-contracts/errors";

/*
 * The treat card on the IMPACT tab (plan G5 "Treats", F7.4, F7.5).
 *
 * A treat is a small gift Token Tails pays to the partner shelter from its own funds, once per
 * account per UTC day. The player pays nothing and spends no Tails, and no Tails are given for it
 * (a cosmetic Treat Giver badge marks five confirmed treats in a season). In-game treats use the
 * `page` source: the `game` source was dropped (plan 2.13 row 28).
 *
 * The card has seven states, each driven by a DONATE_* code from `POST /shelter/donate`, the
 * caller's `GET /shelter/donate/me` row for today, or the public `GET /shelter/donate/status`:
 *
 * | state         | from                                                          |
 * |---------------|---------------------------------------------------------------|
 * | ready         | rail live with treats left, account eligible, none sent today |
 * | on-its-way    | 200 from donate, or today's row PENDING / SENT                |
 * | sent-today    | DONATE_ALREADY_TODAY, or today's row CONFIRMED                |
 * | not-eligible  | DONATE_NOT_ELIGIBLE / EMAIL_UNVERIFIED, a guest, policy reads |
 * | paused        | DONATE_PAUSED, or the rail is not deployed / paused / unknown |
 * | budget-spent  | DONATE_BUDGET_SPENT, or the rail is exhausted for today       |
 * | failed        | DONATE_SEND_FAILED, or today's row FAILED (the day is given back) |
 *
 * `loading` is shown before the reads come back; it is not one of the seven.
 */

export const TREAT_STATES = [
  "ready",
  "on-its-way",
  "sent-today",
  "not-eligible",
  "paused",
  "budget-spent",
  "failed",
] as const;
export type TreatStateKind = (typeof TREAT_STATES)[number];

export type TreatIneligible = "guest" | "email-unverified" | "account-too-new" | "no-saved-game";

export type TreatState =
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "on-its-way" }
  | { kind: "sent-today"; nextAt: string | null }
  | { kind: "not-eligible"; reason: TreatIneligible; eligibleAt: string | null }
  | { kind: "paused" }
  | { kind: "budget-spent"; nextAt: string | null }
  | { kind: "failed"; retry: boolean };

export type DonationDayStatus = "PENDING" | "SENT" | "CONFIRMED" | "FAILED";

/** The caller's treats (`GET /shelter/donate/me`), as the card reads them. */
export interface DonateMe {
  resetsAt: string | null;
  today: { status: DonationDayStatus } | null;
  confirmedCount: number;
  onTheirWayCount: number;
  eligibility: { eligible: boolean; reason: TreatIneligible | null; eligibleAt: string | null };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Obj = Record<string, any>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const count = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0);
const dated = (v: unknown) => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? v : null);
const DAY_STATUSES: DonationDayStatus[] = ["PENDING", "SENT", "CONFIRMED", "FAILED"];
const REASONS: TreatIneligible[] = ["guest", "email-unverified", "account-too-new", "no-saved-game"];

export function normalizeDonateMe(raw: unknown): DonateMe | null {
  if (!isObj(raw)) return null;
  const today = isObj(raw.today) && DAY_STATUSES.includes(raw.today.status) ? { status: raw.today.status } : null;
  const e = isObj(raw.eligibility) ? raw.eligibility : {};
  return {
    resetsAt: dated(raw.resetsAt),
    today,
    confirmedCount: count(raw.confirmedCount),
    onTheirWayCount: count(raw.onTheirWayCount),
    eligibility: {
      eligible: e.eligible === true,
      reason: REASONS.includes(e.reason) ? e.reason : null,
      eligibleAt: dated(e.eligibleAt),
    },
  };
}

const root = () => {
  const url = apiUrl || process.env.NEXT_PUBLIC_BE_URL;
  return url ? String(url).replace(/\/+$/, "") : null;
};

/** `GET /shelter/donate/me` (registered accounts). Null on any failure. */
export async function fetchDonateMe({
  token = currentAccessToken(),
  fetchImpl = typeof fetch === "function" ? fetch : undefined,
  signal,
}: { token?: string; fetchImpl?: typeof fetch; signal?: AbortSignal } = {}): Promise<DonateMe | null> {
  const base = root();
  if (!fetchImpl || !base || !token) return null;
  try {
    const res = await fetchImpl(`${base}/shelter/donate/me`, {
      signal,
      headers: { accept: "application/json", accesstoken: token },
    });
    if (!res.ok) return null;
    return normalizeDonateMe(await res.json());
  } catch {
    return null;
  }
}

/** What one send answered. */
export type TreatSend =
  | { kind: "sent" }
  | { kind: "already-today" }
  | { kind: "not-eligible"; reason: TreatIneligible; eligibleAt: string | null }
  | { kind: "paused" }
  | { kind: "budget-spent" }
  | { kind: "failed" }
  | { kind: "signed-out" }
  /** The per-IP limiter (a bare 429) or no connection: nothing happened, try again. */
  | { kind: "retry" };

/**
 * `POST /shelter/donate {source: 'page'}` once, mapped to the card's states by DONATE_* code.
 * Never throws. The card asks for an account before calling it, so the sheet is never opened here.
 */
export async function sendTreat({
  fetchImpl,
  chainId,
}: {
  fetchImpl?: (input: string, init: RequestInit) => Promise<Response>;
  /** Another network than the main chain (DonateRail.chainId), when only that one is open. */
  chainId?: number;
} = {}): Promise<TreatSend> {
  const base = root();
  const token = currentAccessToken();
  if (!token) return { kind: "signed-out" };
  if (!base) return { kind: "retry" };
  const send =
    fetchImpl ??
    ((input: string, init: RequestInit) => apiFetch(input, init, { guestSession: false, requireAccount: false }));
  let res: Response;
  try {
    res = await send(`${base}/shelter/donate`, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json", accesstoken: token },
      body: JSON.stringify(chainId ? { source: "page", chainId } : { source: "page" }),
    });
  } catch {
    return { kind: "retry" };
  }
  if (res.ok) return { kind: "sent" };
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  const code = errorCodeOf(body);
  switch (code) {
    case ErrorCode.DONATE_ALREADY_TODAY:
      return { kind: "already-today" };
    case ErrorCode.DONATE_PAUSED:
      return { kind: "paused" };
    case ErrorCode.DONATE_BUDGET_SPENT:
      return { kind: "budget-spent" };
    case ErrorCode.DONATE_SEND_FAILED:
      return { kind: "failed" };
    case ErrorCode.EMAIL_UNVERIFIED:
      return { kind: "not-eligible", reason: "email-unverified", eligibleAt: null };
    case ErrorCode.DONATE_NOT_ELIGIBLE: {
      const record = isObj(body) ? body : {};
      const reason = REASONS.includes(record.reason) ? (record.reason as TreatIneligible) : "no-saved-game";
      return { kind: "not-eligible", reason, eligibleAt: dated(record.eligibleAt) };
    }
    case ErrorCode.GUEST_FORBIDDEN:
      return { kind: "signed-out" };
    default:
      break;
  }
  if (res.status === 401 || res.status === 403) return { kind: "signed-out" };
  // Older backends answered 503 for a closed jar.
  if (res.status === 503 || res.status === 409) return { kind: "paused" };
  if (res.status === 424) return { kind: "failed" };
  return { kind: "retry" };
}

/** Telemetry status of a send (`treat_sent {status}`). */
export function treatSentStatus(send: TreatSend): "ok" | "error" | "rejected" | "guest" | "offline" {
  switch (send.kind) {
    case "sent":
      return "ok";
    case "signed-out":
      return "guest";
    case "retry":
      return "offline";
    case "failed":
      return "error";
    default:
      return "rejected";
  }
}

export interface TreatInputs {
  viewer: ImpactViewer;
  /** Public rail; null when unknown (not read yet, or the read failed). */
  rail: DonateRail | null;
  railLoaded: boolean;
  me: DonateMe | null;
  meLoaded: boolean;
  /**
   * The last send from this card, if any. It wins over the reads, except that a read saying
   * today's treat is CONFIRMED moves a successful send on to sent-today.
   */
  send: TreatSend | null;
}

const nextOf = (rail: DonateRail | null, me: DonateMe | null) => me?.resetsAt ?? rail?.resetsAt ?? null;

/** The card's state from what the backend said. Pure, so every state is unit tested. */
export function treatState({ viewer, rail, railLoaded, me, meLoaded, send }: TreatInputs): TreatState {
  if (viewer === "guest") return { kind: "not-eligible", reason: "guest", eligibleAt: null };
  if (viewer === "unverified") return { kind: "not-eligible", reason: "email-unverified", eligibleAt: null };
  if (viewer === "loading" || !railLoaded || !meLoaded) return { kind: "loading" };

  const nextAt = nextOf(rail, me);
  // A send only says the treat left; a later read can say it arrived.
  if (send?.kind === "sent" && me?.today?.status === "CONFIRMED") return { kind: "sent-today", nextAt };
  if (send) {
    switch (send.kind) {
      case "sent":
        return { kind: "on-its-way" };
      case "already-today":
        return { kind: "sent-today", nextAt };
      case "not-eligible":
        return { kind: "not-eligible", reason: send.reason, eligibleAt: send.eligibleAt };
      case "paused":
        return { kind: "paused" };
      case "budget-spent":
        return { kind: "budget-spent", nextAt };
      case "failed":
        return { kind: "failed", retry: true };
      default:
        // signed-out and retry fall through to the reads.
        break;
    }
  }

  switch (me?.today?.status) {
    case "PENDING":
    case "SENT":
      return { kind: "on-its-way" };
    case "CONFIRMED":
      return { kind: "sent-today", nextAt };
    default:
      break;
  }

  if (!rail || !rail.enabled || rail.state === "not-deployed" || rail.state === "paused") return { kind: "paused" };
  if (rail.state === "exhausted" || rail.treatsLeftToday <= 0) return { kind: "budget-spent", nextAt };
  if (me && !me.eligibility.eligible) {
    return {
      kind: "not-eligible",
      reason: me.eligibility.reason ?? "no-saved-game",
      eligibleAt: me.eligibility.eligibleAt,
    };
  }
  // A FAILED row today gives the day back: the player may send again.
  if (me?.today?.status === "FAILED") return { kind: "failed", retry: true };
  return { kind: "ready" };
}
