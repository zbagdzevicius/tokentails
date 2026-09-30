import { MatchSaveThrottledError } from "@/api/user-api";

export const SAVE_THROTTLED_MESSAGE =
  "Too many saves right now, so this run was not saved.";
export const SAVE_FAILED_MESSAGE = "Could not save your score, try again";

/**
 * Toast text for a failed `POST /user/catbassadors/live` save.
 *
 * `saveMatch` throws `MatchSaveThrottledError` after a second 429 and returns
 * `null` for any other non-2xx response (400 validation, 401, 5xx). It can
 * also reject on a network error. The endpoint has no lives check, so no
 * failure means the player is out of lives and none is reported as such.
 */
export function saveFailureMessage(error: unknown): string {
  return error instanceof MatchSaveThrottledError
    ? SAVE_THROTTLED_MESSAGE
    : SAVE_FAILED_MESSAGE;
}
