/**
 * Soft "Save your cat" nudges for guests (plan G1, decision #10): after the first clear, after the
 * first codex entry, and after 10 minutes of play. At most one nudge per browser session, and only
 * while the player is a guest. A nudge never opens the sheet by itself; the guest pill shows a
 * dismissible bubble and the player decides.
 *
 * Wired now: the timer (Game.tsx). Exported for later tasks: `firstClear()` (5a, the win card) and
 * `firstCodexEntry()` (6a, the codex).
 */

export type SaveNudgeTrigger = "first-clear" | "first-codex-entry" | "timer";

export const SAVE_NUDGE_TIMER_MS = 10 * 60 * 1000;
export const SAVE_NUDGE_SESSION_KEY = "tt.saveNudge.v1";

type Listener = (trigger: SaveNudgeTrigger) => void;

interface SessionStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface SaveNudgeOptions {
  timerMs?: number;
  store?: () => SessionStore | null;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

const defaultStore = (): SessionStore | null => {
  try {
    return typeof window !== "undefined" ? window.sessionStorage : null;
  } catch {
    return null;
  }
};

export interface SaveNudgeController {
  /** Arms the nudges for a guest; starts the 10-minute timer. Idempotent. */
  start(): void;
  /** The player is no longer a guest, or left the game: disarm and stop the timer. */
  stop(): void;
  firstClear(): boolean;
  firstCodexEntry(): boolean;
  /** Listens for the one nudge of the session. Returns an unsubscribe function. */
  subscribe(listener: Listener): () => void;
  /** Whether this session already showed its nudge. */
  shown(): boolean;
}

export function createSaveNudge(options: SaveNudgeOptions = {}): SaveNudgeController {
  const timerMs = options.timerMs ?? SAVE_NUDGE_TIMER_MS;
  const getStore = options.store ?? defaultStore;
  const setTimer = options.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearTimer = options.clearTimer ?? ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>));

  const listeners = new Set<Listener>();
  let armed = false;
  let timer: unknown = null;
  let shownInMemory = false;

  const shown = (): boolean => {
    if (shownInMemory) return true;
    try {
      return getStore()?.getItem(SAVE_NUDGE_SESSION_KEY) === "1";
    } catch {
      return false;
    }
  };

  const markShown = () => {
    shownInMemory = true;
    try {
      getStore()?.setItem(SAVE_NUDGE_SESSION_KEY, "1");
    } catch {
      // The in-memory flag still holds for this page.
    }
  };

  const stopTimer = () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
  };

  const fire = (trigger: SaveNudgeTrigger): boolean => {
    if (!armed || shown()) return false;
    markShown();
    stopTimer();
    listeners.forEach((listener) => listener(trigger));
    return true;
  };

  return {
    start() {
      if (armed) return;
      armed = true;
      if (!shown() && timer === null) {
        timer = setTimer(() => {
          timer = null;
          fire("timer");
        }, timerMs);
      }
    },
    stop() {
      armed = false;
      stopTimer();
    },
    firstClear: () => fire("first-clear"),
    firstCodexEntry: () => fire("first-codex-entry"),
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    shown,
  };
}

/** The app-wide controller. */
export const saveNudge = createSaveNudge();

/** Call when a guest clears a level for the first time (task 5a). Returns whether it nudged. */
export const firstClear = (): boolean => saveNudge.firstClear();

/** Call when a guest makes their first codex entry (task 6a). Returns whether it nudged. */
export const firstCodexEntry = (): boolean => saveNudge.firstCodexEntry();
