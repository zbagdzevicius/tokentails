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
  credentials: "That email and password don't match an account we can sign in. Check them and try again.",
  createFailed:
    "We couldn't create an account with that email. If it's already yours, sign in instead.",
  invalidEmail: "Enter a valid email address.",
  weakPassword: "Use at least 6 characters for your password.",
  tooMany: "Too many tries. Wait a minute, then try again.",
  network: "We couldn't reach the sign-in service. Check your connection and try again.",
  popupBlocked: "Your browser blocked the sign-in window. Allow pop-ups for this site, then try again.",
  inAppBrowser: "This sign-in option doesn't work in this app's browser. Use email, or open the page in your browser.",
  disabled: "This sign-in option isn't available right now. Try another one.",
  expired: "For your security, please sign in again.",
  unknown: "Something went wrong while signing in. Please try again.",
} as const;

const CODE_COPY: Record<string, AuthErrorCopy> = {
  "auth/invalid-credential": { message: AUTH_COPY.credentials, field: "password" },
  "auth/invalid-login-credentials": { message: AUTH_COPY.credentials, field: "password" },
  "auth/wrong-password": { message: AUTH_COPY.credentials, field: "password" },
  "auth/user-not-found": { message: AUTH_COPY.credentials, field: "password" },
  "auth/user-disabled": { message: AUTH_COPY.credentials, field: "password" },
  "auth/email-already-in-use": { message: AUTH_COPY.createFailed, field: "email" },
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

/** Web SDK error to copy. Returns null for a cancel (show nothing). */
export function mapAuthError(error: unknown): AuthErrorCopy | null {
  if (isAuthCancel(error)) return null;
  return CODE_COPY[authErrorCode(error)] ?? { message: AUTH_COPY.unknown, field: null };
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
  if (/network|offline|7:/.test(text)) return { message: AUTH_COPY.network, field: null };
  return { message: AUTH_COPY.unknown, field: null };
}
