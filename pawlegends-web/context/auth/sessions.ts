/**
 * Module-level single-flight promises (plan F5.7): one anonymous sign-in per page and one
 * `POST /user/guest/session` per anonymous uid, however many callers ask at once.
 */

let anonymous: Promise<unknown> | null = null;

/**
 * Runs `signIn` once; concurrent and later callers share the promise. A failure clears it so a
 * retry (the fallback sheet's "Try again", or a fresh guest after sign-out) can run again.
 */
export function ensureAnonymousOnce<T>(signIn: () => Promise<T>): Promise<T> {
  if (!anonymous) {
    anonymous = signIn().catch((error) => {
      anonymous = null;
      throw error;
    });
  }
  return anonymous as Promise<T>;
}

/** After a sign-out the next guest is a fresh one. */
export function resetAnonymous(): void {
  anonymous = null;
}

const guestSessions = new Map<string, Promise<boolean>>();

/**
 * Creates the guest document for `uid` once. Resolves true when it exists. A failure is forgotten,
 * so the next write tries again instead of failing forever.
 */
export function ensureGuestSessionOnce(uid: string, create: () => Promise<unknown>): Promise<boolean> {
  const existing = guestSessions.get(uid);
  if (existing) return existing;
  const run = create()
    .then(() => true)
    .catch(() => {
      guestSessions.delete(uid);
      return false;
    });
  guestSessions.set(uid, run);
  return run;
}

/** Marks a uid whose guest document is known to exist (a persisted guest profile was loaded). */
export function markGuestSession(uid: string): void {
  if (!guestSessions.has(uid)) guestSessions.set(uid, Promise.resolve(true));
}

/** Test-only reset. */
export function __resetSessionsForTests(): void {
  anonymous = null;
  guestSessions.clear();
}
