/**
 * Which HOME is on screen: the Cat Yard (`yard`), the Phaser fallback (`phaser`), or none (`null`).
 * GameContext (mobile controls), the HOME HUD and the backdrop read it, so they follow the HOME
 * that is really showing, including after a fallback.
 */
import { useSyncExternalStore } from "react";
import { GameType } from "@/models/game";

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

/**
 * The mode as the HUD, the backdrop and the mobile controls should read it. Before HomeYard has
 * mounted and reported (its code is still loading), HOME is about to be the yard whenever the
 * kill switch allows it: answering `yard` here keeps the old centred HUD, `bg-2.webp` and the
 * snowfall from flashing for a moment. A fallback reports `phaser` and wins.
 */
export function resolveHomeYardMode(current: HomeYardMode, enabled: boolean = homeYardEnabled()): "yard" | "phaser" {
  return current ?? (enabled ? "yard" : "phaser");
}

const snapshot = () => resolveHomeYardMode(mode);

/** Consumers combine it with `gameType === GameType.HOME`; outside HOME the value is unused. */
export function useHomeYardMode(): "yard" | "phaser" {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/**
 * Height of the HOME HUD's feed panel (CSS px, 0 while hidden): the yard lifts its name card above
 * it, whatever the panel's real size on this screen.
 */
let feedPanelPx = 0;
const feedListeners = new Set<() => void>();

export function setHomeFeedPanelHeight(px: number): void {
  const next = Math.max(0, Math.round(px));
  if (next === feedPanelPx) return;
  feedPanelPx = next;
  feedListeners.forEach((l) => l());
}

export function getHomeFeedPanelHeight(): number {
  return feedPanelPx;
}

function subscribeFeed(listener: () => void) {
  feedListeners.add(listener);
  return () => feedListeners.delete(listener);
}

export function useHomeFeedPanelHeight(): number {
  return useSyncExternalStore(subscribeFeed, getHomeFeedPanelHeight, () => 0);
}

/**
 * The kill switch: `NEXT_PUBLIC_HOME_YARD` set to 0, false, off or no brings back the Phaser HOME.
 * On by default (unset or anything else).
 */
export function homeYardEnabled(raw: string | undefined = process.env.NEXT_PUBLIC_HOME_YARD): boolean {
  return !/^\s*(0|false|off|no)\s*$/i.test(raw ?? "");
}

/** HOME is showing as the Cat Yard: its HUD, its sky, no snowfall over it. */
export function isYardHome(gameType: GameType | null | undefined, mode: HomeYardMode): boolean {
  return gameType === GameType.HOME && mode === "yard";
}

/**
 * The mobile controls show in HOME only for the Phaser fallback once the cat is fed (feeding
 * unlocks steering there); the Cat Yard's cats wander on their own.
 */
export function phaserHomeControls(gameType: GameType | null | undefined, mode: HomeYardMode, eat: number | null | undefined): boolean {
  return gameType === GameType.HOME && mode === "phaser" && !!eat;
}
