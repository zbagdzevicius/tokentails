import { ErrorCode } from "@/shared-contracts/errors";
import type {
  AuthMode,
  AuthStatus,
  FirebasePhase,
  ProfilePhase,
  SessionProfile,
} from "./types";

/**
 * A profile that belongs to a real account. `isGuest` is written explicitly by the identity
 * backend; a document from before the backfill has no field and counts as registered.
 */
export function isRegisteredProfile(profile: SessionProfile | null | undefined): boolean {
  return !!profile && profile.isGuest !== true && profile.transient !== true;
}

/**
 * The one status every surface reads (plan F5.7). Pure, so it is unit tested on its own.
 *
 * - `unknown`: Firebase has not reported yet, or guest mode is still signing in anonymously.
 * - `signed-out`: no Firebase user (optional pages), or the anonymous sign-in failed on `/game`.
 * - `needs-verification`: the backend refused the token with 403 `EMAIL_UNVERIFIED`.
 * - `loading-profile`: a user exists and `GET /user/profile` has not answered yet.
 * - `profile-error`: the profile request failed (any other error, or the 20 s timeout).
 * - `guest`: an anonymous user, or a guest document (transient or persisted).
 * - `ready`: a registered account with its profile.
 */
export function deriveAuthStatus(
  mode: AuthMode,
  firebase: FirebasePhase,
  profile: ProfilePhase
): AuthStatus {
  if (firebase.phase === "pending") return "unknown";
  if (firebase.phase === "none") {
    return mode === "guest" && !firebase.anonymousFailed ? "unknown" : "signed-out";
  }
  if (profile.phase === "error") {
    return profile.code === ErrorCode.EMAIL_UNVERIFIED ? "needs-verification" : "profile-error";
  }
  if (profile.phase !== "ready") return "loading-profile";
  if (firebase.user.isAnonymous || !isRegisteredProfile(profile.profile)) return "guest";
  return "ready";
}

/**
 * The intro curtain (G14) lifts when a player can act: a guest or account with its profile.
 *
 * On `/game` (guest mode) two degraded states count as ready too, because the game keeps playing
 * on the transient template underneath the sheet: the anonymous sign-in failed (`signed-out`,
 * the `fallback` sheet; the Anonymous provider is still off in production), and an anonymous
 * guest whose profile request failed (`profile-error`, a backend outage). Without the context a
 * caller only learns the strict answer.
 */
export function isAuthReady(
  status: AuthStatus,
  context?: { mode: AuthMode; firebase: FirebasePhase }
): boolean {
  if (status === "guest" || status === "ready") return true;
  if (!context || context.mode !== "guest") return false;
  const { firebase } = context;
  if (status === "signed-out") return firebase.phase === "none" && !!firebase.anonymousFailed;
  if (status === "profile-error") return firebase.phase === "user" && firebase.user.isAnonymous;
  return false;
}

/** Nothing is still loading: the page can decide what to show. */
export function isAuthSettled(status: AuthStatus): boolean {
  return status !== "unknown" && status !== "loading-profile";
}
