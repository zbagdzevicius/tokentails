import { PLEDGE_DAILY_CAP } from "@/shared-contracts/caps";
import { RescueGoalStatus } from "@/shared-contracts/enums";
import { apiFetch, apiUrl, currentAccessToken } from "./api";

/*
 * Rescue Goals (plan G5 "Rescue Goals"; backend `backend/src/rescue-goal/`, task 5f).
 *
 * A goal is a shelter purchase whose money Token Tails has already set aside. Players give Tails
 * (rescue points, no cash value) to choose which goals get delivered first. Giving moves Tails out
 * of the balance but never out of `tailsEarned`, so it never lowers a rank.
 *
 * Client copy of the backend shapes `PublicGoal`, `MyGives` and `PledgeResult`. Every read is
 * normalised field by field; anything malformed is dropped, never rendered half-filled.
 *
 * Idempotency: every give carries a client UUID (`pledgeId`). The give sheet makes one when it
 * opens and re-sends the SAME id on a retry, a timeout or a 503 PLEDGE_INTERRUPTED, so a give is
 * debited at most once however often the request goes out.
 */

export { RescueGoalStatus };

/** Smallest and largest give the backend accepts (`PLEDGE_MIN`, `PLEDGE_MAX`). */
export const PLEDGE_MIN = 10;
export const PLEDGE_MAX = PLEDGE_DAILY_CAP;
/** The give chips on the goal card (plan G5: 100 / 1,000 / MAX). */
export const PLEDGE_CHIPS = [100, 1000] as const;

export const RESCUE_GOALS_TIMEOUT_MS = 6000;
export const GOALS_QUERY_KEY = "rescue-goals";
export const MY_GIVES_QUERY_KEY = "rescue-goals-me";

export type GoalSurface = "web" | "app";

export interface GoalShelter {
  name: string;
  slug: string | null;
  image: string | null;
  country: string | null;
  countryCode: string | null;
}

export interface GoalDelivery {
  photoUrl: string;
  /** SHA-256 of the private receipt (64 hex characters). Web only on screen. */
  receiptSha256: string;
  note: string | null;
  deliveredAt: string;
  /** Web surface only; the app surface never receives it. */
  txHash: string | null;
}

export interface RescueGoal {
  id: string;
  title: string;
  description: string | null;
  deliverable: string;
  image: string | null;
  shelter: GoalShelter | null;
  status: RescueGoalStatus;
  /** OPEN but past `endsAt`: takes no gives. */
  expired: boolean;
  targetTails: number;
  raisedTails: number;
  remainingTails: number;
  pledgeCount: number;
  endsAt: string | null;
  filledAt: string | null;
  delivery: GoalDelivery | null;
}

export type PledgeStatus = "PENDING" | "CONFIRMED" | "REFUNDED" | "REJECTED";

export interface MyPledge {
  id: string;
  pledgeId: string;
  goal: string;
  goalTitle: string | null;
  amount: number;
  status: PledgeStatus;
  createdAt: string | null;
}

export interface DailyGive {
  cap: number;
  used: number;
  left: number;
  resetsAt: string | null;
}

export interface TreatGiverBadge {
  earned: boolean;
  confirmedTreats: number;
  needed: number;
}

export interface MyGives {
  pledges: MyPledge[];
  daily: DailyGive;
  balance: { tails: number };
  totals: { tailsGiven: number; goalsHelped: number; monthTailsGiven: number; monthGoalsHelped: number };
  eligibility: { eligible: boolean; reason: string | null; eligibleAt: string | null; open: boolean };
  limits: { min: number; max: number };
  treatGiver: TreatGiverBadge | null;
}

// ------------------------------------------------------------------------------------------------
// Normalisers
// ------------------------------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Obj = Record<string, any>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const count = (v: unknown): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0;
const dated = (v: unknown): string | null =>
  typeof v === "string" && !Number.isNaN(Date.parse(v)) ? v : null;
const https = (v: unknown): string | null => (typeof v === "string" && /^https:\/\/\S+$/i.test(v) ? v : null);
const SHA256 = /^[0-9a-f]{64}$/i;
const TX = /^(0x)?[0-9a-f]{64}$/i;
const STATUSES = Object.values(RescueGoalStatus) as string[];
const PLEDGE_STATUSES: PledgeStatus[] = ["PENDING", "CONFIRMED", "REFUNDED", "REJECTED"];

function shelterOf(v: unknown): GoalShelter | null {
  if (!isObj(v) || !str(v.name)) return null;
  return {
    name: String(v.name),
    slug: str(v.slug),
    image: https(v.image),
    country: str(v.country),
    countryCode: str(v.countryCode),
  };
}

function deliveryOf(v: unknown, surface: GoalSurface): GoalDelivery | null {
  if (!isObj(v)) return null;
  const photoUrl = https(v.photoUrl);
  const deliveredAt = dated(v.deliveredAt);
  const receiptSha256 = typeof v.receiptSha256 === "string" && SHA256.test(v.receiptSha256) ? v.receiptSha256 : null;
  if (!photoUrl || !deliveredAt || !receiptSha256) return null;
  return {
    photoUrl,
    receiptSha256: receiptSha256.toLowerCase(),
    note: str(v.note),
    deliveredAt,
    // Belt and braces: even if a web answer reached an app build, the hash never renders there.
    txHash: surface === "web" && typeof v.txHash === "string" && TX.test(v.txHash) ? v.txHash : null,
  };
}

export function normalizeGoal(v: unknown, surface: GoalSurface = "web"): RescueGoal | null {
  if (!isObj(v)) return null;
  const id = str(v.id);
  const title = str(v.title);
  const status = STATUSES.includes(v.status) ? (v.status as RescueGoalStatus) : null;
  const targetTails = count(v.targetTails);
  if (!id || !title || !status || targetTails <= 0) return null;
  const raisedTails = Math.min(targetTails, count(v.raisedTails));
  const delivery = deliveryOf(v.delivery, surface);
  return {
    id,
    title,
    description: str(v.description),
    deliverable: str(v.deliverable) || title,
    image: https(v.image),
    shelter: shelterOf(v.shelter),
    status,
    expired: v.expired === true,
    targetTails,
    raisedTails,
    remainingTails: Math.max(0, targetTails - raisedTails),
    pledgeCount: count(v.pledgeCount),
    endsAt: dated(v.endsAt),
    filledAt: dated(v.filledAt),
    // A DELIVERED goal without a complete delivery is shown as filled, never as delivered.
    delivery: status === RescueGoalStatus.DELIVERED ? delivery : null,
  };
}

export function normalizeGoals(raw: unknown, surface: GoalSurface = "web"): RescueGoal[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((g) => normalizeGoal(g, surface)).filter((g): g is RescueGoal => !!g);
}

export function normalizeMyGives(raw: unknown): MyGives | null {
  if (!isObj(raw)) return null;
  const daily = isObj(raw.daily) ? raw.daily : {};
  const totals = isObj(raw.totals) ? raw.totals : {};
  const eligibility = isObj(raw.eligibility) ? raw.eligibility : {};
  const limits = isObj(raw.limits) ? raw.limits : {};
  const cap = count(daily.cap) || PLEDGE_DAILY_CAP;
  const used = Math.min(cap, count(daily.used));
  const badge = Array.isArray(raw.badges) ? raw.badges.find((b: unknown) => isObj(b) && b.id === "TREAT_GIVER") : null;
  return {
    pledges: (Array.isArray(raw.pledges) ? raw.pledges : [])
      .map((p: unknown): MyPledge | null => {
        if (!isObj(p) || !str(p.id) || !PLEDGE_STATUSES.includes(p.status)) return null;
        return {
          id: String(p.id),
          pledgeId: String(p.pledgeId || ""),
          goal: String(p.goal || ""),
          goalTitle: str(p.goalTitle),
          amount: count(p.amount),
          status: p.status,
          createdAt: dated(p.createdAt),
        };
      })
      .filter((p: MyPledge | null): p is MyPledge => !!p),
    daily: {
      cap,
      used,
      left: Math.max(0, Math.min(cap - used, typeof daily.left === "number" ? count(daily.left) : cap - used)),
      resetsAt: dated(daily.resetsAt),
    },
    balance: { tails: count(isObj(raw.balance) ? raw.balance.tails : 0) },
    totals: {
      tailsGiven: count(totals.tailsGiven),
      goalsHelped: count(totals.goalsHelped),
      monthTailsGiven: count(totals.monthTailsGiven),
      monthGoalsHelped: count(totals.monthGoalsHelped),
    },
    eligibility: {
      eligible: eligibility.eligible === true,
      reason: str(eligibility.reason),
      eligibleAt: dated(eligibility.eligibleAt),
      open: eligibility.open === true,
    },
    limits: { min: count(limits.min) || PLEDGE_MIN, max: count(limits.max) || PLEDGE_MAX },
    treatGiver: isObj(badge)
      ? { earned: badge.earned === true, confirmedTreats: count(badge.confirmedTreats), needed: count(badge.needed) || 5 }
      : null,
  };
}

/** The goal the IMPACT tab gives to: the first OPEN goal still taking gives, or null. */
export function currentGoal(goals: RescueGoal[]): RescueGoal | null {
  return goals.find((g) => g.status === RescueGoalStatus.OPEN && !g.expired && g.remainingTails > 0) ?? null;
}

/** Delivered goals with their photo and receipt, newest first. */
export function deliveredGoals(goals: RescueGoal[]): RescueGoal[] {
  return goals
    .filter((g) => g.status === RescueGoalStatus.DELIVERED && !!g.delivery)
    .sort((a, b) => Date.parse(b.delivery!.deliveredAt) - Date.parse(a.delivery!.deliveredAt));
}

/**
 * The MAX chip: the most this player can give right now. The balance, today's room under the
 * daily cap, what the goal still needs and the per-give limit, whichever is smallest. 0 when the
 * player cannot reach the minimum give.
 */
export function maxGive(
  goal: Pick<RescueGoal, "remainingTails">,
  gives: Pick<MyGives, "balance" | "daily" | "limits"> | null
): number {
  if (!gives) return 0;
  const max = Math.min(gives.balance.tails, gives.daily.left, goal.remainingTails, gives.limits.max);
  return max >= gives.limits.min ? Math.floor(max) : 0;
}

// ------------------------------------------------------------------------------------------------
// Requests
// ------------------------------------------------------------------------------------------------

const base = (): string | null => {
  const url = apiUrl || process.env.NEXT_PUBLIC_BE_URL;
  return url ? String(url).replace(/\/+$/, "") : null;
};

async function withTimeout<T>(
  signal: AbortSignal | undefined,
  timeoutMs: number,
  run: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

export interface GoalsRequest {
  status?: "current" | "open" | "delivered";
  surface?: GoalSurface;
  limit?: number;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  timeoutMs?: number;
}

/** `GET /rescue-goals` (public). Null on any failure, so the card shows its offline line. */
export async function fetchGoals({
  status = "current",
  surface = "web",
  limit = 20,
  fetchImpl = typeof fetch === "function" ? fetch : undefined,
  signal,
  timeoutMs = RESCUE_GOALS_TIMEOUT_MS,
}: GoalsRequest = {}): Promise<RescueGoal[] | null> {
  const root = base();
  if (!fetchImpl || !root) return null;
  const query = new URLSearchParams({ status, limit: String(limit) });
  if (surface === "app") query.set("surface", "app");
  try {
    return await withTimeout(signal, timeoutMs, async (s) => {
      const res = await fetchImpl(`${root}/rescue-goals?${query.toString()}`, {
        signal: s,
        headers: { accept: "application/json" },
      });
      if (!res.ok) return null;
      return normalizeGoals(await res.json(), surface);
    });
  } catch {
    return null;
  }
}

/** `GET /rescue-goals/pledges/me` for a registered account. Null on any failure (and for guests). */
export async function fetchMyGives({
  token = currentAccessToken(),
  fetchImpl = typeof fetch === "function" ? fetch : undefined,
  signal,
  timeoutMs = RESCUE_GOALS_TIMEOUT_MS,
}: { token?: string; fetchImpl?: typeof fetch; signal?: AbortSignal; timeoutMs?: number } = {}): Promise<MyGives | null> {
  const root = base();
  if (!fetchImpl || !root || !token) return null;
  try {
    return await withTimeout(signal, timeoutMs, async (s) => {
      const res = await fetchImpl(`${root}/rescue-goals/pledges/me`, {
        signal: s,
        headers: { accept: "application/json", accesstoken: token },
      });
      if (!res.ok) return null;
      return normalizeMyGives(await res.json());
    });
  } catch {
    return null;
  }
}

/** A fresh RFC 4122 v4 UUID: the idempotency key of one give. */
export function newPledgeId(random: () => number = Math.random): string {
  const c = typeof globalThis !== "undefined" ? (globalThis.crypto as Crypto | undefined) : undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === "function") c.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Error codes a give can be refused with (backend `RESCUE_GOAL_ERROR`; not in F5.6 yet). */
export type PledgeRefusal =
  | "PLEDGES_PAUSED"
  | "PLEDGE_NOT_ELIGIBLE"
  | "PLEDGE_BALANCE"
  | "PLEDGE_DAILY_CAP"
  | "PLEDGE_ID_REUSED"
  | "GOAL_NOT_FOUND"
  | "GOAL_NOT_OPEN"
  | "GOAL_OVERFLOW"
  | "INVALID";

const REFUSALS: PledgeRefusal[] = [
  "PLEDGES_PAUSED",
  "PLEDGE_NOT_ELIGIBLE",
  "PLEDGE_BALANCE",
  "PLEDGE_DAILY_CAP",
  "PLEDGE_ID_REUSED",
  "GOAL_NOT_FOUND",
  "GOAL_NOT_OPEN",
  "GOAL_OVERFLOW",
];

export interface PledgeReceipt {
  pledgeId: string;
  amount: number;
  status: PledgeStatus;
  replayed: boolean;
  goal: { id: string; status: RescueGoalStatus; raisedTails: number; targetTails: number; remainingTails: number };
  balance: number;
  daily: DailyGive;
}

export type PledgeOutcome =
  /** The give counted (CONFIRMED), or is counted and still settling (PENDING, "on its way"). */
  | { kind: "given"; receipt: PledgeReceipt }
  /** The goal filled first, or the give was refused mid-way: nothing was taken. */
  | { kind: "returned"; receipt: PledgeReceipt }
  /** No answer, a timeout or 503 PLEDGE_INTERRUPTED: re-send with the SAME pledge id. */
  | { kind: "interrupted"; pledgeId: string }
  | { kind: "refused"; code: PledgeRefusal; message: string | null }
  /** 401, or a guest refused (403 GUEST_FORBIDDEN): ask for an account. */
  | { kind: "signed-out" };

function receiptOf(raw: unknown): PledgeReceipt | null {
  if (!isObj(raw) || !isObj(raw.pledge) || !isObj(raw.goal)) return null;
  const status = PLEDGE_STATUSES.includes(raw.pledge.status) ? (raw.pledge.status as PledgeStatus) : null;
  const goalStatus = STATUSES.includes(raw.goal.status) ? (raw.goal.status as RescueGoalStatus) : null;
  if (!status || !goalStatus) return null;
  const daily = isObj(raw.daily) ? raw.daily : {};
  const cap = count(daily.cap) || PLEDGE_DAILY_CAP;
  return {
    pledgeId: String(raw.pledge.pledgeId || ""),
    amount: count(raw.pledge.amount),
    status,
    replayed: raw.replayed === true,
    goal: {
      id: String(raw.goal.id || ""),
      status: goalStatus,
      raisedTails: count(raw.goal.raisedTails),
      targetTails: count(raw.goal.targetTails),
      remainingTails: count(raw.goal.remainingTails),
    },
    balance: count(isObj(raw.balance) ? raw.balance.tails : 0),
    daily: { cap, used: count(daily.used), left: count(daily.left), resetsAt: dated(daily.resetsAt) },
  };
}

const codeOf = (body: unknown): string | null => {
  if (!isObj(body)) return null;
  if (typeof body.code === "string") return body.code;
  if (isObj(body.message) && typeof body.message.code === "string") return body.message.code;
  return null;
};

const messageOf = (body: unknown): string | null => {
  if (!isObj(body)) return null;
  return typeof body.message === "string" ? body.message : null;
};

export interface PledgeRequest {
  goalId: string;
  amount: number;
  /** The give's UUID. Re-use it for every retry of the same give. */
  pledgeId: string;
  fetchImpl?: (input: string, init: RequestInit) => Promise<Response>;
  timeoutMs?: number;
}

/** `POST /rescue-goals/:id/pledge` once. Never throws. */
export async function sendPledge({
  goalId,
  amount,
  pledgeId,
  fetchImpl,
  timeoutMs = RESCUE_GOALS_TIMEOUT_MS,
}: PledgeRequest): Promise<PledgeOutcome> {
  const root = base();
  const token = currentAccessToken();
  if (!token) return { kind: "signed-out" };
  if (!root) return { kind: "interrupted", pledgeId };
  // apiFetch without its guest handling: the card asks for an account itself, before sending.
  const send =
    fetchImpl ??
    ((input: string, init: RequestInit) => apiFetch(input, init, { guestSession: false, requireAccount: false }));
  let res: Response;
  try {
    res = await withTimeout(undefined, timeoutMs, (signal) =>
      send(`${root}/rescue-goals/${encodeURIComponent(goalId)}/pledge`, {
        method: "POST",
        signal,
        headers: { accept: "application/json", "content-type": "application/json", accesstoken: token },
        body: JSON.stringify({ amount, pledgeId }),
      })
    );
  } catch {
    return { kind: "interrupted", pledgeId };
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (res.ok) {
    const receipt = receiptOf(body);
    if (!receipt) return { kind: "interrupted", pledgeId };
    return receipt.status === "CONFIRMED" || receipt.status === "PENDING"
      ? { kind: "given", receipt }
      : { kind: "returned", receipt };
  }
  const code = codeOf(body);
  if (res.status === 401 || (res.status === 403 && (code === "GUEST_FORBIDDEN" || !code))) return { kind: "signed-out" };
  if (res.status === 503 && code === "PLEDGE_INTERRUPTED") return { kind: "interrupted", pledgeId };
  const known = REFUSALS.find((r) => r === code);
  if (known) return { kind: "refused", code: known, message: messageOf(body) };
  if (res.status >= 500 || res.status === 429) return { kind: "interrupted", pledgeId };
  return { kind: "refused", code: "INVALID", message: messageOf(body) };
}

/**
 * Sends one give and re-sends it with the same `pledgeId` while it is interrupted, up to
 * `attempts` times in total. The backend replays a known id, so the debit happens at most once.
 */
export async function pledgeWithRetry(
  request: PledgeRequest,
  { attempts = 3, delayMs = 1500, wait = (ms: number) => new Promise((r) => setTimeout(r, ms)) } = {}
): Promise<PledgeOutcome> {
  let outcome: PledgeOutcome = { kind: "interrupted", pledgeId: request.pledgeId };
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await wait(delayMs * i);
    outcome = await sendPledge(request);
    if (outcome.kind !== "interrupted") return outcome;
  }
  return outcome;
}
