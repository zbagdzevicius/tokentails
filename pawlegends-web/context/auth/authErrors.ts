/**
 * Firebase errors to player copy (plan G9). The copy is neutral: it never says whether an account
 * exists for an email (that is what email-enumeration protection is for), so "wrong password" and
 * "no such user" read the same.
 */

export type AuthErrorField = "email" | "password" | null;

export interface AuthErrorCopy {
  message: string;
  /** The input the message belongs to, for `aria-describedby` and focus. */
  field: AuthErrorField;
}

export const AUTH_COPY = {
  credentials:
    "That email and password don't match an account we can sign in. Check them, or tap \"Forgot password?\" to choose a new one.",
  otherMethod: "This email already signs in another way. Use the Google, Apple or email sign-in you used before.",
  createFailed:
    "We couldn't create an account with that email. If it's already yours, sign in instead.",
  invalidEmail: "Enter a valid email address.",
  weakPassword: "Use at least 6 characters for your password.",
  tooMany: "Too many tries. Wait a minute, then try again.",
  network: "We couldn't reach the sign-in service. Check your connection and try again.",
  popupBlocked: "Your browser blocked the sign-in window. Allow pop-ups for this site, then try again.",
  inAppBrowser:
    "This sign-in option doesn't work in this app's browser. Use email, or copy the link and open it in Safari or Chrome.",
  disabled: "This sign-in option isn't available right now. Try another one.",
  expired: "For your security, please sign in again.",
  appleUnavailable:
    "Sign in with Apple isn't available on this device right now. Check that you're signed in to iCloud in Settings, then try again, or use email.",
  unknown: "Something went wrong while signing in. Please try again.",
} as const;

const CODE_COPY: Record<string, AuthErrorCopy> = {
  "auth/invalid-credential": { message: AUTH_COPY.credentials, field: "password" },
  "auth/invalid-login-credentials": { message: AUTH_COPY.credentials, field: "password" },
  "auth/wrong-password": { message: AUTH_COPY.credentials, field: "password" },
  "auth/user-not-found": { message: AUTH_COPY.credentials, field: "password" },
  "auth/user-disabled": { message: AUTH_COPY.credentials, field: "password" },
  "auth/email-already-in-use": { message: AUTH_COPY.createFailed, field: "email" },
  "auth/account-exists-with-different-credential": { message: AUTH_COPY.otherMethod, field: null },
  "auth/credential-already-in-use": { message: AUTH_COPY.createFailed, field: "email" },
  "auth/invalid-email": { message: AUTH_COPY.invalidEmail, field: "email" },
  "auth/missing-email": { message: AUTH_COPY.invalidEmail, field: "email" },
  "auth/weak-password": { message: AUTH_COPY.weakPassword, field: "password" },
  "auth/missing-password": { message: AUTH_COPY.weakPassword, field: "password" },
  "auth/password-does-not-meet-requirements": { message: AUTH_COPY.weakPassword, field: "password" },
  "auth/too-many-requests": { message: AUTH_COPY.tooMany, field: null },
  "auth/network-request-failed": { message: AUTH_COPY.network, field: null },
  "auth/timeout": { message: AUTH_COPY.network, field: null },
  "auth/popup-blocked": { message: AUTH_COPY.popupBlocked, field: null },
  "auth/operation-not-supported-in-this-environment": { message: AUTH_COPY.inAppBrowser, field: null },
  "auth/web-storage-unsupported": { message: AUTH_COPY.inAppBrowser, field: null },
  "auth/operation-not-allowed": { message: AUTH_COPY.disabled, field: null },
  "auth/admin-restricted-operation": { message: AUTH_COPY.disabled, field: null },
  "auth/unauthorized-domain": { message: AUTH_COPY.disabled, field: null },
  "auth/requires-recent-login": { message: AUTH_COPY.expired, field: null },
  "auth/user-token-expired": { message: AUTH_COPY.expired, field: null },
};

/** Codes that mean the player closed the window or cancelled; they get no message at all. */
const CANCEL_CODES = new Set([
  "auth/popup-closed-by-user",
  "auth/cancelled-popup-request",
  "auth/user-cancelled",
  "auth/redirect-cancelled-by-user",
]);

export function authErrorCode(error: unknown): string {
  if (error && typeof error === "object" && typeof (error as { code?: unknown }).code === "string") {
    return (error as { code: string }).code;
  }
  return "";
}

/** True when the player cancelled a popup (web) and nothing should be shown. */
export function isAuthCancel(error: unknown): boolean {
  return CANCEL_CODES.has(authErrorCode(error));
}

/**
 * The generic copy with a short reference the player can quote to support ("... Please try again. (auth/internal-error)"),
 * so a report of "something went wrong" names the cause. Only an error code or an Apple status number, never a
 * message that could carry personal data.
 */
export function unknownCopy(ref: string): AuthErrorCopy {
  const safe = ref.replace(/[^\w/.:-]/g, "").slice(0, 60);
  return { message: safe ? `${AUTH_COPY.unknown} (${safe})` : AUTH_COPY.unknown, field: null };
}

/** Web SDK error to copy. Returns null for a cancel (show nothing). */
export function mapAuthError(error: unknown): AuthErrorCopy | null {
  if (isAuthCancel(error)) return null;
  const code = authErrorCode(error);
  return CODE_COPY[code] ?? unknownCopy(code);
}

/**
 * A support reference for a native error: its code, else Apple's `AuthorizationError error <n>` as `apple-<n>`, else a
 * fixed name for the Android Google errors that come without a code. Never the message itself (it can name an account).
 */
export function nativeRef(code: string, text: string): string {
  if (code) return code;
  const apple = /authorizationerror error (\d+)/.exec(text);
  if (apple) return `apple-${apple[1]}`;
  if (/28444|developer console is not set up|developer_error|(^|\s)10:/.test(text)) return "google-config";
  if (/no ?credential/.test(text)) return "google-no-credential";
  return "";
}

/**
 * Capacitor Firebase (native Google and Apple) error to copy. A cancel is silent: Android Google
 * reports status 12501 or "canceled", Apple reports ASAuthorizationError 1001 or "canceled".
 */
export function mapNativeAuthError(error: unknown): AuthErrorCopy | null {
  const code = authErrorCode(error);
  if (code.startsWith("auth/")) return mapAuthError(error);
  const text = `${code} ${
    error && typeof error === "object" ? String((error as { message?: unknown }).message ?? "") : String(error ?? "")
  }`.toLowerCase();
  if (/cancel|12501|1001|sign_in_cancelled|user denied/.test(text)) return null;
  if (/network|offline|(^|\s)7:/.test(text)) return { message: AUTH_COPY.network, field: null };
  const ref = nativeRef(code, text);
  // ASAuthorizationError.unknown (1000): no iCloud account, no two-factor, or this build lacks the capability.
  if (ref === "apple-1000") return { message: `${AUTH_COPY.appleUnavailable} (${ref})`, field: null };
  return unknownCopy(ref);
}

/** Codes that mean "this email and password did not work": a returning player may have used another way. */
const CREDENTIAL_CODES = new Set([
  "auth/invalid-credential",
  "auth/invalid-login-credentials",
  "auth/wrong-password",
  "auth/user-not-found",
  "auth/account-exists-with-different-credential",
]);

/**
 * The copy for a returning player: when an email sign-in failed and this device last signed in
 * with Google or Apple, say so ("Last time on this device you used Google"). It names only the
 * method stored on this device, never whether an account exists for the email.
 */
export function withLastMethodHint(
  copy: AuthErrorCopy | null,
  error: unknown,
  last: { provider: "google" | "apple" | "email" } | null | undefined
): AuthErrorCopy | null {
  if (!copy || !last || last.provider === "email") return copy;
  if (!CREDENTIAL_CODES.has(authErrorCode(error))) return copy;
  const name = last.provider === "google" ? "Google" : "Apple";
  return {
    ...copy,
    message: `${copy.message} Last time on this device you used ${name}: try "Continue with ${name}".`,
  };
}
