/**
 * Analytics consent. Default is "unset", which behaves like "denied": nothing
 * is sent until the player accepts. The choice lives in this browser only.
 */

export type ConsentState = "granted" | "denied" | "unset";

export const CONSENT_STORAGE_KEY = "tt-analytics-consent";
export const CONSENT_CHANGE_EVENT = "tt-analytics-consent-change";
/** Dispatched to reopen the consent banner from a settings button or link. */
export const CONSENT_OPEN_EVENT = "tt-analytics-consent-open";

export function readConsent(): ConsentState {
  try {
    const value = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    return value === "granted" || value === "denied" ? value : "unset";
  } catch {
    return "unset";
  }
}

export function writeConsent(state: Exclude<ConsentState, "unset">): void {
  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, state);
  } catch {
    // Storage blocked: the choice holds for this page view only.
  }
  try {
    window.dispatchEvent(
      new CustomEvent<ConsentState>(CONSENT_CHANGE_EVENT, { detail: state }),
    );
  } catch {
    // No window (SSR or tests without a DOM).
  }
}

export function openConsentSettings(): void {
  try {
    window.dispatchEvent(new CustomEvent(CONSENT_OPEN_EVENT));
  } catch {
    // No window.
  }
}
