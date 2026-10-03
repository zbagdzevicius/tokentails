/**
 * The start gate of a run (plan G10). Pure: the scene and RunGate.tsx both drive it.
 *
 * A run is frozen from the moment the scene is ready until the player's first input. That input
 * begins the run and is consumed: the cat does not jump on it. On a first visit to a level the
 * gate is the full card (title, goal, controls, Paw Guards); after that it is a small pill.
 *
 *   loading --ready()--> ready --input()--> running --pause()--> paused --resume()--> running
 *                                              \--end()--> ended --restart()--> loading
 */

export type GateVariant = "full" | "pill";

/** Full card on the first visit to this mode and level; a pill for returning players. */
export function gateVariant(input: { seenBefore: boolean }): GateVariant {
  return input.seenBefore ? "pill" : "full";
}

export type RunPhase = "loading" | "ready" | "running" | "paused" | "ended";

/** What began the run, so the scene can swallow exactly that input. */
export type BeginInput = "pointer" | "key";

export interface RunGateMachine {
  readonly phase: RunPhase;
  /** The scene is built and the cat is on the map, frozen. Returns true on the transition. */
  ready(): boolean;
  /**
   * An input arrived. Returns `begin` when it began the run (consume it, push RUN_BEGIN),
   * `consumed` while the input that began the run is still held, or `pass` when gameplay should
   * see it.
   */
  input(kind: BeginInput): "begin" | "consumed" | "pass";
  /** The input that began the run was released: from now on inputs reach the cat. */
  release(): void;
  /** Whether the begin input is still held. */
  readonly awaitingRelease: boolean;
  pause(): void;
  resume(): void;
  end(): boolean;
  /** PLAY AGAIN: back to loading; `isRestart` is reported with the next ready and begin. */
  restart(): void;
  readonly isRestart: boolean;
  /** How many runs began on this machine (one per attempt). */
  readonly begins: number;
}

export function createRunGate(options: { isRestart?: boolean } = {}): RunGateMachine {
  let phase: RunPhase = "loading";
  let isRestart = !!options.isRestart;
  let awaitingRelease = false;
  let begins = 0;

  return {
    get phase() {
      return phase;
    },
    get isRestart() {
      return isRestart;
    },
    get awaitingRelease() {
      return awaitingRelease;
    },
    get begins() {
      return begins;
    },
    ready() {
      if (phase !== "loading") return false;
      phase = "ready";
      return true;
    },
    input() {
      if (phase === "ready") {
        phase = "running";
        awaitingRelease = true;
        begins += 1;
        return "begin";
      }
      if (awaitingRelease) return "consumed";
      return phase === "running" ? "pass" : "consumed";
    },
    release() {
      awaitingRelease = false;
    },
    pause() {
      if (phase === "running") phase = "paused";
    },
    resume() {
      if (phase === "paused") phase = "running";
    },
    end() {
      if (phase === "ended" || phase === "loading") return false;
      phase = "ended";
      awaitingRelease = false;
      return true;
    },
    restart() {
      phase = "loading";
      isRestart = true;
      awaitingRelease = false;
    },
  };
}

/** Keys that begin a run (and jump in the platformers). Enter and Tab never do: they reach Back. */
/** Matched against `code` first, then `key`. */
export const GATE_BEGIN_KEYS: readonly string[] = ["Space", "ArrowUp", "KeyW", " ", "w", "W"];

export function isBeginKey(event: { code?: string; key?: string }): boolean {
  return GATE_BEGIN_KEYS.includes(event.code ?? "") || GATE_BEGIN_KEYS.includes(event.key ?? "");
}

/** Keys that leave the gate for the level map (Esc; Android back arrives as its own event). */
export const isExitKey = (event: { key?: string; code?: string }): boolean =>
  event.key === "Escape" || event.code === "Escape";

/**
 * A pointer or key event the gate must not treat as gameplay input: anything on a control (the
 * gate's Back, the close button, a modal) or in a form field.
 */
export function isControlTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).closest !== "function") return false;
  const element = target as Element;
  return !!element.closest(
    'button, a, input, textarea, select, label, summary, [role="button"], [role="link"], [role="dialog"], [role="alertdialog"], [contenteditable=""], [contenteditable="true"], [data-run-ignore]',
  );
}

/** The surfaces a screen tap may jump from: the game's container and the Purrsuit overlay layer. */
export const RUN_SURFACE_SELECTOR = '#game-container, [data-run-surface]';

/**
 * Whether a document tap should count as a jump (MobileControls tap-to-jump, 5a review #5): only
 * on the run's own surface, never on a control, and not on the canvas (the scene's pointer
 * handlers already take those). A toast, a modal backdrop (Radix puts it outside the dialog) or
 * anything else on the page is left alone, and not `preventDefault`ed.
 */
export function isRunSurfaceTap(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).closest !== "function") return false;
  const element = target as Element;
  if (typeof HTMLCanvasElement !== "undefined" && element instanceof HTMLCanvasElement) return false;
  if (isControlTarget(element)) return false;
  return !!element.closest(RUN_SURFACE_SELECTOR);
}
