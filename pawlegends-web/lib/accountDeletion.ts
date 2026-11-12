/**
 * Account deletion and the "signed in with" label for the Paw Legends account page (components/pawlegends/
 * PawlegendsAccount.tsx). Extracted from client's components/shared/ProfileModal.tsx (same behaviour).
 */
import { ApiError } from "@/api/api";
import { clearLastMethod } from "@/context/auth/lastMethod";


export type AccountDeletionResult =
  | { status: "deleted" }
  | { status: "cancelled" }
  | { status: "error"; message: string };

export interface AccountDeletionDeps {
  /** iOS native with a Sign in with Apple provider on the account. */
  needsAppleCode: boolean;
  /** A fresh Sign in with Apple authorization code (the backend revokes the Apple token with it). */
  getAppleCode: () => Promise<string | undefined>;
  deleteMe: (appleAuthorizationCode?: string) => Promise<unknown>;
  signOut: () => Promise<void>;
}

export const DELETE_ACCOUNT_ERROR =
  "We couldn't delete your account just now. Try again, or contact support.";

/**
 * `DELETE /user/me`, then sign out. On iOS with
 * Sign in with Apple a fresh authorization code is fetched first; cancelling that prompt cancels
 * the deletion, so nothing irreversible happens without the player's last confirmation.
 */
export async function requestAccountDeletion(deps: AccountDeletionDeps): Promise<AccountDeletionResult> {
  let appleCode: string | undefined;
  if (deps.needsAppleCode) {
    try {
      appleCode = await deps.getAppleCode();
    } catch {
      return { status: "cancelled" };
    }
    if (!appleCode) return { status: "cancelled" };
  }
  try {
    await deps.deleteMe(appleCode);
  } catch (error) {
    const message =
      error instanceof ApiError && error.status === 429
        ? "Too many tries. Wait a minute, then try again."
        : DELETE_ACCOUNT_ERROR;
    return { status: "error", message };
  }
  // The account is gone: "Last time on this device you used Google" would point at nothing.
  clearLastMethod();
  try {
    await deps.signOut();
  } catch {
    // The account is gone either way; the next token refresh fails and signs out.
  }
  return { status: "deleted" };
}

const PROVIDER_NAMES: Record<string, string> = {
  "google.com": "Google",
  "apple.com": "Apple",
  password: "email",
};

/** "With Google", "With Apple and email"; null when the providers are unknown. */
export const signedInWith = (providers?: string[]): string | null => {
  const names = Array.from(new Set((providers ?? []).map((id) => PROVIDER_NAMES[id]).filter(Boolean)));
  return names.length ? `With ${names.join(" and ")}` : null;
};
