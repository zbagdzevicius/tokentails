import type { GameType } from "@/models/game";

/*
 * The "Tails are rescue points" explainer (plan G5 "Explainer"). It is queued, not shown at once:
 * it opens only on a menu (the lobby or a level picker) or a game-over screen, never over a
 * running scene. It shows once per device; dismissing it marks it seen.
 *
 * The queue lives in memory (a request made on one screen waits for the next safe one) and the
 * "seen" flag in localStorage, read and written in try/catch: private windows, blocked storage or
 * thumbnails simply show it again later, which is harmless.
 */

export const TAILS_EXPLAINER_SEEN_KEY = "tt.tailsExplainer.v1";

export interface SceneState {
  gameType: GameType | null;
  isStarted?: boolean;
  /** Set while an end-of-run panel shows. */
  gameStop?: unknown;
}

/**
 * Whether the explainer may open now. A menu: no mode open, or a mode whose level picker is up
 * (`isStarted` false). A game-over screen: `gameStop` is set. Anything else is a running scene.
 */
export function explainerAllowed(scene: SceneState | null): boolean {
  if (!scene) return true;
  if (!scene.gameType) return true;
  if (!scene.isStarted) return true;
  return !!scene.gameStop;
}

interface Store {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const defaultStore = (): Store | null => {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
};

export function createTailsExplainer(store: () => Store | null = defaultStore) {
  let queued = false;
  let seenInMemory = false;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());

  const seen = (): boolean => {
    if (seenInMemory) return true;
    try {
      return store()?.getItem(TAILS_EXPLAINER_SEEN_KEY) === "1";
    } catch {
      return false;
    }
  };

  return {
    /** Asks for the explainer at the next safe screen. A no-op once it was seen. */
    request(): boolean {
      if (seen() || queued) return false;
      queued = true;
      emit();
      return true;
    },
    /** True while a request waits. */
    pending: (): boolean => queued && !seen(),
    /** Whether it should be on screen for this scene. */
    shouldShow(scene: SceneState | null): boolean {
      return queued && !seen() && explainerAllowed(scene);
    },
    /** The player closed it: never again on this device. */
    dismiss(): void {
      queued = false;
      seenInMemory = true;
      try {
        store()?.setItem(TAILS_EXPLAINER_SEEN_KEY, "1");
      } catch {
        // The in-memory flag still holds for this page.
      }
      emit();
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    seen,
  };
}

export type TailsExplainerQueue = ReturnType<typeof createTailsExplainer>;

/** The app-wide queue. */
export const tailsExplainer = createTailsExplainer();
