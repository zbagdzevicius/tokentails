// copy-lint: web-only the Meow Run entry points never render in the app build (meowRunEntryEnabled)
import { isAppBuild } from "@/components/claims/build";

/**
 * Meow Run's entry points in the client (meow-run/, GDD meow-run/GDD.md): the "Choose your adventure"
 * picker card. The game itself is a static build in `public/meowrun-game/`, served top level at
 * `/meow-run` by the `next.config.js` rewrites (web builds only, no flag).
 *
 * Meow Run is the 3D story runner (Mochi races home through three stages with set pieces); Purrsuit is
 * the classic 2D runner. The picker line and the home hub blurb say so.
 *
 * Web only, no flag: the Capacitor export has no rewrites, so `/meow-run` does not resolve there.
 * The game saves no scores (no GameType, no write path): the card is a plain link.
 */
export const MEOW_RUN_PATH = "/meow-run";
export const MEOW_RUN_TITLE = "Meow Run";

/** `from` says which entry point sent the player (the game ignores it, as Ultra Cat does). */
export type MeowRunFrom = "picker";
export const meowRunHref = (from: MeowRunFrom) => `${MEOW_RUN_PATH}?from=${from}`;

/** The picker card's line: what the game is (and how it differs from Purrsuit), short enough for the phone column. */
export const MEOW_RUN_PICKER_DESCRIPTION = "Story run: race a kitten home, vault, wall-run";

/**
 * The card art: one frame of a real run with the HUD cropped out, saved for the picker's 312x218 box at 2x
 * (the trailer lane, meow-run/tools/trailer, writes it).
 */
export const MEOW_RUN_PREVIEW = Object.freeze({
  src: "/game-select/meowrun-preview@2x.webp",
  width: 312,
  height: 218,
  alt: "Mochi the kitten tail-vaults over a canyon path on a long striped tail and grabs a glowing golden bell",
});

/** On in every web build; never in the app build (the export has no /meow-run rewrite). */
export function meowRunEntryEnabled(isApp: boolean = isAppBuild()): boolean {
  return !isApp;
}
