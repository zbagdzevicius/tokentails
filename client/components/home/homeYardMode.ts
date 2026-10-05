/**
 * Which HOME is on screen: the Cat Yard (`yard`), the Phaser fallback (`phaser`), or none (`null`).
 * GameContext (mobile controls), the HOME HUD and the backdrop read it, so they follow the HOME
 * that is really showing, including after a fallback.
 */
import { useSyncExternalStore } from "react";

export type HomeYardMode = "yard" | "phaser" | null;

let mode: HomeYardMode = null;
const listeners = new Set<() => void>();

export function getHomeYardMode(): HomeYardMode {
  return mode;
}

export function setHomeYardMode(next: HomeYardMode): void {
  if (next === mode) return;
  mode = next;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useHomeYardMode(): HomeYardMode {
  return useSyncExternalStore(subscribe, getHomeYardMode, () => null);
}

/**
 * The kill switch: `NEXT_PUBLIC_HOME_YARD` set to 0, false, off or no brings back the Phaser HOME.
 * On by default (unset or anything else).
 */
export function homeYardEnabled(raw: string | undefined = process.env.NEXT_PUBLIC_HOME_YARD): boolean {
  return !/^\s*(0|false|off|no)\s*$/i.test(raw ?? "");
}
