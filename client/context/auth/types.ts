import type { IProfile } from "@/models/profile";
import type { ErrorCode } from "@/shared-contracts/errors";

/**
 * How a page uses Firebase (plan F5.7).
 * - `guest`: `/game`. Signs in anonymously and silently, so the game plays at once.
 * - `optional`: Heist, articles, feed, cats, box and shelter payouts. Reuses an existing Firebase
 *   session (anonymous included) but never creates one, and never opens the sheet by itself.
 */
export type AuthMode = "guest" | "optional";

/** Derived from the Firebase user and the profile request (F5.7). */
export type AuthStatus =
  | "unknown"
  | "guest"
  | "signed-out"
  | "needs-verification"
  | "loading-profile"
  | "ready"
  | "profile-error";

/**
 * Why the AuthSheet opened. Picks the title (decision #64) and the line under it.
 * `save-progress` is the guest pill, the save nudges and the end of a guest run.
 */
export type AccountReason =
  | "save-progress"
  | "claim-rewards"
  | "purchase"
  | "adopt"
  | "give-treat"
  | "share"
  | "support"
  | "sign-in";

export type AccountResult = "signed-in" | "dismissed";

/** What the provider tracks about the Firebase user. A plain snapshot, so React sees changes. */
export interface AuthUserSnapshot {
  uid: string;
  isAnonymous: boolean;
  email: string | null;
  emailVerified: boolean;
  /** Sign-in providers on the user (`google.com`, `apple.com`, `password`). */
  providers: string[];
}

/** Fields the identity backend (task 2a) adds to `GET /user/profile`. */
export interface SessionProfileFields {
  isGuest?: boolean;
  /** An anonymous user without a guest document yet: the template profile (F5.5). */
  transient?: boolean;
  /** Set once, on the first profile read after a guest was promoted (F5.2 step 1e). */
  promotedNow?: boolean;
  pendingTails?: number;
  email?: string;
  onboarding?: {
    state: "pending" | "done";
    version?: number;
    starterChosenAt?: string;
    skipped?: boolean;
  };
}

export type SessionProfile = IProfile & SessionProfileFields;

export type FirebasePhase =
  /** `onIdTokenChanged` has not reported yet. */
  | { phase: "pending" }
  /** No Firebase user. `anonymousFailed`: guest mode tried to sign in anonymously and failed. */
  | { phase: "none"; anonymousFailed?: boolean }
  | { phase: "user"; user: AuthUserSnapshot };

export type ProfilePhase =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "ready"; profile: SessionProfile; seq: number }
  | { phase: "error"; status: number | null; code: ErrorCode | null; timeout?: boolean };
