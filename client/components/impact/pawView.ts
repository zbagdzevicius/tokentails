import type { ImpactMe } from "@/api/impact-api";
import type { ImpactViewer } from "./useImpactMe";

/*
 * Today's paw, as words (plan G4 "Paws", F7.5). A paw is in-game engagement: two scoring runs at
 * least 3 minutes apart in one UTC day, on a registered, verified account at least a day old. The
 * nightly settlement (00:30 UTC) turns the day's paws into one treat from Token Tails. Nothing here
 * ever says a paw was paid: that is the settlement's job, shown on /impact.
 */

export type PawState =
  | "loading"
  | "guest"
  | "unverified"
  | "unavailable"
  | "progress"
  | "blocked"
  | "earned";

export interface PawView {
  state: PawState;
  /** The line to show. */
  text: string;
  /** Runs done and needed today, for the dots; null when not counting. */
  runs: { done: number; needed: number } | null;
  /** When today's runs stop counting (end of the UTC day), for the countdown. */
  closesAt: Date | null;
  /** Lifetime paws, for the tile badge. */
  lifetime: number;
}

const DAY_MS = 86_400_000;

/** The end of the paw day `YYYY-MM-DD` (00:00 UTC the next day). */
export function pawDayEnd(day: string): Date | null {
  const t = Date.parse(`${day}T00:00:00Z`);
  return Number.isNaN(t) ? null : new Date(t + DAY_MS);
}

const SMALL_NUMBERS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];

/**
 * The paw rule in one sentence, from the server's `runsNeeded` (so the copy never disagrees with
 * it): "Two scoring runs, 3 minutes apart, earn today's paw." The one wording for every surface
 * (the end-of-run card, Impact's Today's paw, the ABOUT ME summary).
 */
export function pawRuleText(needed = 2): string {
  const n = Math.max(1, Math.floor(needed));
  const count = SMALL_NUMBERS[n] ?? String(n);
  return n === 1
    ? "One scoring run earns today's paw."
    : `${count} scoring runs, 3 minutes apart, earn today's paw.`;
}

export function runsLeftText(remaining: number): string {
  return `${remaining} more run${remaining === 1 ? "" : "s"} for today's paw`;
}

export function pawView(viewer: ImpactViewer, me: ImpactMe | null, loading = false): PawView {
  const none = { runs: null, closesAt: null, lifetime: 0 };
  if (viewer === "guest") {
    return { ...none, state: "guest", text: "Save your progress to earn daily paws." };
  }
  if (viewer === "unverified") {
    return { ...none, state: "unverified", text: "Verify your email to earn daily paws." };
  }
  if (viewer === "loading" || loading) {
    return { ...none, state: "loading", text: "Checking today's paw…" };
  }
  const paws = me?.paws;
  if (!paws) {
    return {
      ...none,
      state: "unavailable",
      text: "Two runs a day earn a paw. Your paw count shows here soon.",
    };
  }
  const { today, lifetime } = paws;
  const runs = { done: today.qualifyingRuns, needed: today.runsNeeded };
  const closesAt = pawDayEnd(today.day);
  if (today.remaining > 0) {
    return { state: "progress", text: runsLeftText(today.remaining), runs, closesAt, lifetime };
  }
  if (!today.eligibility.eligible) {
    const text =
      today.eligibility.reason === "email-unverified"
        ? "Verify your email to earn today's paw."
        : today.eligibility.reason === "account-too-new"
        ? "Paws start once your account is a day old."
        : today.message || "Today's paw is not available for this account.";
    return { state: "blocked", text, runs, closesAt: null, lifetime };
  }
  return { state: "earned", text: "Today's paw is earned.", runs, closesAt: null, lifetime };
}

/**
 * "3h 12m" or "12m" until `at`; null once it passed, or when it is more than a day away (a skewed
 * device clock or a stale paw day: no countdown beats a wrong one).
 */
export function timeLeft(at: Date | null, now: Date): string | null {
  if (!at) return null;
  const ms = at.getTime() - now.getTime();
  if (ms <= 0 || ms > DAY_MS) return null;
  const minutes = Math.ceil(ms / 60_000);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** The local clock time of `at` ("01:00" or "1:00 AM", per the viewer's locale). */
export function localClock(at: Date, locale?: string, timeZone?: string): string {
  return at.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", timeZone });
}
