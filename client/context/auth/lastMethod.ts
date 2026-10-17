/**
 * The sign-in method last used on this device, so a returning player sees "Last time you used
 * Google" in the AuthSheet (founder ask, 2026-10-17: make signing back in obvious).
 *
 * Only the provider and a masked email hint (`z•••@motored.lt`) are kept: no token, no uid, no
 * full address. Storage can be blocked or cleared (private windows), so every access is guarded
 * and a missing value just means no hint. Kept across sign-outs on purpose: the hint exists for
 * the next time the player comes back.
 */

export type LastMethodProvider = "google" | "apple" | "email";

export interface LastMethod {
  provider: LastMethodProvider;
  /** `z•••@motored.lt`, or null when the account has no email. */
  emailHint: string | null;
}

export const LAST_METHOD_KEY = "tt.lastSignIn";

const PROVIDERS: readonly LastMethodProvider[] = ["google", "apple", "email"];

/** Firebase provider ids on a user, in the order a hint prefers them. */
const FIREBASE_IDS: Record<string, LastMethodProvider> = {
  "google.com": "google",
  "apple.com": "apple",
  password: "email",
};

export const LAST_METHOD_LABEL: Record<LastMethodProvider, string> = {
  google: "Google",
  apple: "Apple",
  email: "email",
};

/** `zygis@motored.lt` → `z•••@motored.lt`. Null for anything that is not an email. */
export function maskEmail(email: string | null | undefined): string | null {
  if (typeof email !== "string") return null;
  const trimmed = email.trim();
  const at = trimmed.lastIndexOf("@");
  if (at < 1 || at === trimmed.length - 1) return null;
  return `${trimmed[0]}•••${trimmed.slice(at)}`;
}

function storage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function readLastMethod(): LastMethod | null {
  try {
    const raw = storage()?.getItem(LAST_METHOD_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<LastMethod> | null;
    if (!value || !PROVIDERS.includes(value.provider as LastMethodProvider)) return null;
    const hint = typeof value.emailHint === "string" && value.emailHint.includes("•••") ? value.emailHint : null;
    return { provider: value.provider as LastMethodProvider, emailHint: hint };
  } catch {
    return null;
  }
}

/** Remembers a successful sign-in. The email is masked before it is stored. */
export function rememberLastMethod(provider: LastMethodProvider, email?: string | null): void {
  try {
    const value: LastMethod = { provider, emailHint: maskEmail(email) };
    storage()?.setItem(LAST_METHOD_KEY, JSON.stringify(value));
  } catch {
    // Storage blocked: no hint next time.
  }
}

/**
 * The method to remember for a signed-in account from its Firebase provider ids: the stored one
 * when the account still has it (a player with Google and email who used Google keeps "Google"),
 * otherwise the first known provider. Null for an account with none (anonymous).
 */
export function methodFromProviders(providers: readonly string[], current?: LastMethod | null): LastMethodProvider | null {
  const known = providers.map((id) => FIREBASE_IDS[id]).filter(Boolean) as LastMethodProvider[];
  if (!known.length) return null;
  if (current && known.includes(current.provider)) return current.provider;
  return known[0];
}

/** Forgets the hint: after the account was deleted, so the next player here is not pointed at it. */
export function clearLastMethod(): void {
  try {
    storage()?.removeItem(LAST_METHOD_KEY);
  } catch {
    // Storage blocked: nothing was stored.
  }
}
