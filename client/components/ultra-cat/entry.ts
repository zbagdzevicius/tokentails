// copy-lint: web-only the Ultra Cat entry points never render in the app build (ultraCatEntryEnabled)
import { isAppBuild } from "@/components/claims/build";

/**
 * Ultra Cat's entry points in the client (ultra-cat/, GDD ultra-cat/GDD.md): the "Choose your adventure"
 * picker card. The game itself is a static build in `public/ultracat-game/`, served top level at
 * `/ultra-cat` by the `next.config.js` rewrites (web builds only, no flag).
 *
 * Web only, no flag: the Capacitor export has no rewrites, so `/ultra-cat` does not resolve there.
 * The game saves no scores (no GameType, no write path): the card is a plain link.
 */
export const ULTRA_CAT_PATH = "/ultra-cat";
export const ULTRA_CAT_TITLE = "Ultra Cat";

/** `from` says which entry point sent the player (the game ignores it, as Formula Meow does). */
export type UltraCatFrom = "picker";
export const ultraCatHref = (from: UltraCatFrom) => `${ULTRA_CAT_PATH}?from=${from}`;

/** The picker card's line: what the game is, short enough for the phone column. */
export const ULTRA_CAT_PICKER_DESCRIPTION = "Be a giant cat. Wreck the whole city.";

/**
 * The card art: one frame of a real rampage with the HUD cropped out, saved for the picker's 312x218
 * box at 2x (the trailer lane, ultra-cat/tools/trailer, writes it).
 */
export const ULTRA_CAT_PREVIEW = Object.freeze({
  src: "/game-select/ultracat-preview@2x.webp",
  width: 312,
  height: 218,
});

/** On in every web build; never in the app build (the export has no /ultra-cat rewrite). */
export function ultraCatEntryEnabled(isApp: boolean = isAppBuild()): boolean {
  return !isApp;
}
