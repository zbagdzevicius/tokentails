/**
 * Forced-crash hooks for the resilience tests (G13 acceptance). They are
 * live only in builds made with NEXT_PUBLIC_E2E=1. Next inlines a set
 * NEXT_PUBLIC_ variable; in every other build the variable is unset, the
 * check is false and each probe renders nothing.
 *
 * `?__crash=scene` (or root, page, modal, section) makes the probe inside
 * that boundary throw on render until the boundary is reset, so TRY AGAIN
 * recovers. `?__crash=listener` makes the next GameEvents listener throw once.
 */

export const e2eCrashHooks = (): boolean => process.env.NEXT_PUBLIC_E2E === "1";

export type CrashTarget = "root" | "page" | "scene" | "modal" | "section" | "listener";

const recovered = new Set<CrashTarget>();

export function isCrashForced(target: CrashTarget): boolean {
  if (!e2eCrashHooks() || typeof window === "undefined") return false;
  if (recovered.has(target)) return false;
  try {
    const wanted = new URLSearchParams(window.location.search).get("__crash");
    return !!wanted && wanted.split(",").includes(target);
  } catch {
    return false;
  }
}

/** Called by a boundary reset: the next render of that target succeeds. */
export function markCrashRecovered(target: CrashTarget): void {
  if (e2eCrashHooks()) recovered.add(target);
}

/** Test-only: forget recoveries between cases. */
export function resetCrashProbes(): void {
  recovered.clear();
}

export const CrashProbe = ({ target }: { target: CrashTarget }) => {
  // Inline env check: Next inlines it, so production bundles carry no forced-crash code (F1 guard).
  if (process.env.NEXT_PUBLIC_E2E === "1" && isCrashForced(target)) {
    throw new Error(`Forced ${target} crash (E2E)`);
  }
  return null;
};
