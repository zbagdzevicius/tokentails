import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

const media = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(QUERY)
    : null;

const subscribe = (notify: () => void) => {
  const mql = media();
  mql?.addEventListener?.("change", notify);
  return () => mql?.removeEventListener?.("change", notify);
};

/** Whether the viewer asked for reduced motion. False on the server and in the hydrating render. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => !!media()?.matches,
    () => false
  );
}
