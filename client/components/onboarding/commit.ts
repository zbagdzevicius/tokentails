import { STARTER_API, type IStarterCommit, type StarterCommitResult } from "@/api/starter-api";
import { clearDraft, saveDraft } from "./draft";

/**
 * Commits the starter (plan G3 "Starter commit") and keeps the offline fallback in step:
 *
 * - committed or 409 STARTER_LOCKED: done; any local draft is dropped.
 * - no answer (offline), a server error, or a guest session that could not start yet (428): the
 *   choice is kept as a draft for this uid, so the player is not sent through the ceremony again
 *   and the commit is retried on the next visit.
 * - any other failure (401, 403, a non-NAME 400) or no uid: nothing is kept; `wasKept` says false.
 * - a NAME_* refusal: returned as is; the name step shows the message. Nothing is stored.
 *
 * Guests commit through the same route after their guest session exists; the API wrapper turns
 * the first 428 GUEST_SESSION_REQUIRED into `POST /user/guest/session` and one retry.
 */
export async function commitStarterChoice(
  choice: IStarterCommit,
  uid: string | null | undefined,
): Promise<StarterCommitResult> {
  const result = await STARTER_API.commitStarter(choice);
  if (result.status === "committed" || result.status === "locked") {
    clearDraft();
  } else if (uid && wasKept(result, uid)) {
    saveDraft({ uid, breed: choice.breed, name: choice.name, skipped: choice.skipped });
  }
  return result;
}

/**
 * A failed commit whose choice was kept as a draft for the next visit (offline, 5xx, ...). Any
 * other failure (401, 403, a non-NAME 400, or no uid to key the draft) kept nothing: the caller
 * must not treat the starter as saved (review 4a #6).
 */
export function wasKept(result: StarterCommitResult, uid: string | null | undefined): boolean {
  return result.status === "failed" && !!uid && isRetryable(result);
}

/** Worth a retry on the next visit: offline, 5xx, a timeout or a guest session that is not there. */
export function isRetryable(result: Extract<StarterCommitResult, { status: "failed" }>): boolean {
  if (result.offline || result.httpStatus === null) return true;
  return result.httpStatus >= 500 || result.httpStatus === 408 || result.httpStatus === 428 || result.httpStatus === 429;
}
