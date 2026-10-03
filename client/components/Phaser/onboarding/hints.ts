/**
 * First-run copy (plan G10, G12 decision #86: sentence case, Nunito `hint` role): start gates,
 * teach-at-hazard hints and death tips, per mode, hint and input kind. Control glyphs follow the
 * last input device (`lastInputKind`), so a keyboard player reads "Space" and a phone player
 * "Tap".
 *
 * Pure apart from the optional input tracker at the bottom, which only listens to window events.
 */
import type { MechanicKind } from "./first-hazard";

export type InputKind = "touch" | "keyboard" | "mouse";

/** Words for the jump control. */
export const JUMP_CONTROL: Readonly<Record<InputKind, string>> = Object.freeze({
  touch: "Tap",
  keyboard: "Space",
  mouse: "Click",
});

export interface GateCopy {
  title: string;
  goal: string;
  /** How to play, for the current input device. */
  controls: string;
  /** The pill and the full card's call to start. */
  start: string;
}

/** Purrsuit level key to its display name: `11` -> `1-1`, `101` -> `10-1`, `01` -> `Infinite`. */
export function purrsuitLevelName(level: string | null | undefined): string {
  if (!level) return "";
  if (level.startsWith("0")) return "Infinite";
  return level.length === 3 ? `${level.slice(0, 2)}-${level[2]}` : level.split("").join("-");
}

export function startLine(input: InputKind): string {
  if (input === "keyboard") return "Press Space to start";
  if (input === "mouse") return "Click to start";
  return "Tap to start";
}

export function purrsuitGate(level: string | null | undefined, input: InputKind): GateCopy {
  const infinite = !!level && level.startsWith("0");
  const jump = JUMP_CONTROL[input];
  return {
    title: infinite ? "Infinite run" : `Level ${purrsuitLevelName(level)}`,
    goal: infinite ? "Run as far as you can. Every sprig counts." : "Run to the flag and grab catnip on the way.",
    controls:
      input === "keyboard"
        ? "Space, W or the up arrow jumps. Jump again in the air for a double jump."
        : `${jump} anywhere to jump. ${jump} again in the air for a double jump.`,
    start: startLine(input),
  };
}

/** The freeze-and-prompt at the first spike run. */
export function firstSpikePrompt(input: InputKind): { title: string; line: string } {
  return { title: "JUMP!", line: `${JUMP_CONTROL[input]} to jump the spikes` };
}

/** One line per mechanic for the slow-motion teach. */
export function teachLine(kind: MechanicKind, input: InputKind): string {
  const jump = JUMP_CONTROL[input];
  switch (kind) {
    case "spike":
      return `Spikes ahead. ${jump} to jump them.`;
    case "trampoline":
      return "Bounce pads launch you up. Ride them.";
    case "gravity":
      return "Arrows flip gravity. Jumping still works.";
    case "flight":
      return `You can fly here. Hold ${input === "keyboard" ? "Space" : "the screen"} to rise, let go to dip.`;
    case "geometry":
      return `Hold ${input === "keyboard" ? "Space" : "the screen"} to climb, let go to drop.`;
    case "direction":
      return "The run turns around here.";
    case "midair":
      return `Sparkles let you ${jump.toLowerCase()} again in mid-air.`;
    case "portal":
      return "Portals carry you ahead. Keep running.";
    case "speed":
      return "A speed boost. Hold on!";
    case "platform":
      return "Moving platforms. Time your jump.";
    default:
      return "Something new ahead.";
  }
}

export type DeathCause = "spike" | "fall" | "enemy" | "timeout" | string;

/** The DeathCard's tip, chosen by what ended the run. */
export function deathTip(mode: string, cause: DeathCause | undefined, input: InputKind): string {
  const jump = JUMP_CONTROL[input];
  if (mode === "CATNIP_CHAOS") {
    if (cause === "spike") return `${jump} a moment earlier: jump when the spikes reach the cat's nose.`;
    return `Each Paw Guard brings you back to the last safe spot. ${jump} early, not late.`;
  }
  if (mode === "PIXEL_RESCUE") {
    if (cause === "timeout") return "Grab hearts on the way: each one adds time.";
    return "Jump on enemies from above, and keep your shield for the tricky parts.";
  }
  if (mode === "MATCH_3") {
    if (cause === "timeout") return "Long matches and combos add time. Look low on the board first.";
    return "Matches of four or five make special tiles. Save them for the goal.";
  }
  return "Take a breath and try again. Your cat is fine.";
}

/** The assist the DeathCard suggests after three hard deaths on a level. */
export const ASSIST_COPY = Object.freeze({
  extraGuards: {
    name: "Extra guards",
    line: "Three more Paw Guards on every attempt of a level you have not cleared.",
  },
  slowMo: {
    name: "Slow-mo on every hazard",
    line: "Time slows down before every spike run.",
  },
});

/** Hard deaths on one level after which the DeathCard suggests "Extra guards". */
export const ASSIST_SUGGEST_AFTER = 3;

// INPUT DEVICE TRACKER

let lastKind: InputKind | null = null;
let installed = false;
const kindListeners = new Set<(kind: InputKind) => void>();

const guessKind = (): InputKind => {
  try {
    if (typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches) return "touch";
  } catch {
    // No media queries (tests): fall through.
  }
  return "keyboard";
};

const setKind = (kind: InputKind) => {
  if (kind === lastKind) return;
  lastKind = kind;
  kindListeners.forEach((listener) => listener(kind));
};

/** Starts following the last input device. Idempotent; safe during SSR (does nothing). */
export function trackInputKind(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener(
    "pointerdown",
    (event) => setKind(event.pointerType === "mouse" ? "mouse" : "touch"),
    { capture: true, passive: true },
  );
  window.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Tab" || event.key === "Shift") return;
      setKind("keyboard");
    },
    { capture: true, passive: true },
  );
}

/** The last input device, or a guess from the primary pointer before any input. */
export function lastInputKind(): InputKind {
  return lastKind ?? guessKind();
}

export function subscribeInputKind(listener: (kind: InputKind) => void): () => void {
  trackInputKind();
  kindListeners.add(listener);
  return () => {
    kindListeners.delete(listener);
  };
}

/** Tests only. */
export function __resetInputKindForTests(kind: InputKind | null = null): void {
  lastKind = kind;
}
