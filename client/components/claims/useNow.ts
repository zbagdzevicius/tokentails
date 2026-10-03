import { useSyncExternalStore } from "react";

/** How often a long-lived page (a Capacitor app left open for days) re-reads the clock. */
export const NOW_REFRESH_MS = 60 * 60 * 1000;

let clientNow: Date | null = null;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

/** Takes a fresh reading and tells every subscriber. Exported for tests. */
export function refreshNow(): void {
  clientNow = new Date();
  listeners.forEach((notify) => notify());
}

const onVisibility = () => {
  if (document.visibilityState === "visible") refreshNow();
};

// One shared clock for every claim: re-read hourly and when the page becomes visible again
// (review 3f #6), so STALE chips appear in an app that stays open. The snapshot stays stable
// between readings, which useSyncExternalStore requires.
const subscribe = (notify: () => void) => {
  listeners.add(notify);
  if (listeners.size === 1) {
    timer = setInterval(refreshNow, NOW_REFRESH_MS);
    document.addEventListener("visibilitychange", onVisibility);
  }
  return () => {
    listeners.delete(notify);
    if (listeners.size === 0) {
      if (timer) clearInterval(timer);
      timer = null;
      document.removeEventListener("visibilitychange", onVisibility);
    }
  };
};
const getClientNow = () => (clientNow ??= new Date());
const getServerNow = () => null;

/**
 * The current time, but only on the client after hydration: null during server rendering, a static
 * export and the hydrating render. Time-dependent chips (STALE, an old baseline) read it, so HTML
 * built at one time and opened days later hydrates with the same markup and then updates, with no
 * hydration mismatch.
 */
export function useNow(): Date | null {
  return useSyncExternalStore(subscribe, getClientNow, getServerNow);
}
