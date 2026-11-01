import { ErrorCode } from "@/shared-contracts/errors";

/**
 * What the "We couldn't load your account" card says, by why GET /user/profile failed. Pure, so it
 * is unit tested on its own.
 *
 * Before (player report, Nov 1) every failure said "Something went wrong on our side... Try again in a
 * moment", even a refusal that a retry can never clear, so a player saw it for days and asked
 * whether the project was over. Now the copy follows the cause, the transient ones retry by
 * themselves, and an account-level refusal leads with signing in again or support.
 */

export interface ProfileErrorInput {
  status: number | null;
  code: ErrorCode | null;
  /** The server's own message (a 4xx without a known code shows it). */
  message?: string | null;
  timeout?: boolean;
  /** `navigator.onLine === false`. */
  offline?: boolean;
}

export type ProfileErrorKind =
  | "timeout"
  | "offline"
  | "network"
  | "server"
  | "merging"
  | "signed-out"
  | "refused";

export interface ProfileErrorCopy {
  kind: ProfileErrorKind;
  heading: string;
  body: string;
  /** The main button: try again, or sign out and sign in again (the retry cannot help). */
  primary: "retry" | "sign-out";
  /** Retry by itself on the backoff schedule, and when the tab comes back or the network returns. */
  autoRetry: boolean;
}

const SAFE = "Your cat and your progress are safe.";

export function describeProfileError(input: ProfileErrorInput): ProfileErrorCopy {
  const { status, code } = input;
  if (input.timeout) {
    return {
      kind: "timeout",
      heading: "This is taking too long",
      body: "Your account didn't load in time. Check your connection, then try again.",
      primary: "retry",
      autoRetry: true,
    };
  }
  if (status === null) {
    return input.offline
      ? {
          kind: "offline",
          heading: "You're offline",
          body: `${SAFE} We'll load your account as soon as you're back online.`,
          primary: "retry",
          autoRetry: true,
        }
      : {
          kind: "network",
          heading: "Can't reach Token Tails",
          body: `Check your connection. ${SAFE} We'll keep trying.`,
          primary: "retry",
          autoRetry: true,
        };
  }
  if (code === ErrorCode.GUEST_MERGE_IN_PROGRESS) {
    return {
      kind: "merging",
      heading: "Saving your guest progress…",
      body: "Your guest progress is moving to your account. This takes a moment.",
      primary: "retry",
      autoRetry: true,
    };
  }
  if (status === 401 || code === ErrorCode.ACCOUNT_DELETED || code === ErrorCode.ACCOUNT_MISSING) {
    return {
      kind: "signed-out",
      heading: "Please sign in again",
      body:
        code === ErrorCode.ACCOUNT_DELETED
          ? "This account was deleted. Sign out, then sign in to start a new one."
          : "Your sign-in expired or this account no longer exists. Sign out, then sign in again.",
      primary: "sign-out",
      autoRetry: false,
    };
  }
  if (status === 429 || status >= 500) {
    return {
      kind: "server",
      heading: "We couldn't load your account",
      body: `Something went wrong on our side. ${SAFE} We'll keep trying.`,
      primary: "retry",
      autoRetry: true,
    };
  }
  const message = typeof input.message === "string" ? input.message.trim() : "";
  const lead = message ? `${/[.!?]$/.test(message) ? message : `${message}.`} ` : "";
  return {
    kind: "refused",
    heading: "We couldn't load your account",
    body: `${lead}${SAFE} Contact support and we'll sort it out.`,
    primary: "retry",
    autoRetry: false,
  };
}

/** Waits between automatic retries: 2 s, 5 s, 15 s, 30 s, then every 60 s. */
export const PROFILE_AUTO_RETRY_MS = [2_000, 5_000, 15_000, 30_000, 60_000] as const;

export function profileRetryDelayMs(attempt: number): number {
  const index = Math.max(0, Math.min(Math.floor(attempt), PROFILE_AUTO_RETRY_MS.length - 1));
  return PROFILE_AUTO_RETRY_MS[index];
}
