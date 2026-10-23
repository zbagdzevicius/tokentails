// copy-lint: web-only the Formula Meow entry points never render in the app build (formulaMeowEntryEnabled)
import { isAppBuild } from "@/components/claims/build";

/**
 * Formula Meow's entry points in the client (formula-meow/, GDD docs/plans/formula-meow/GDD.md): the
 * "Choose your adventure" picker card. The game itself is a static build in `public/formula-meow-game/`,
 * served top level at `/meow-race` by the `next.config.js` rewrites (web builds only, no flag).
 *
 * Web only, no flag: the Capacitor export has no rewrites, so `/meow-race` does not resolve there.
 * The game saves no scores (no GameType, no write path): the card is a plain link.
 */
export const FORMULA_MEOW_PATH = "/meow-race";
export const FORMULA_MEOW_TITLE = "Formula Meow";

/** `from` says which entry point sent the player (the game ignores it, as the rave does). */
export type FormulaMeowFrom = "picker";
export const formulaMeowHref = (from: FormulaMeowFrom) => `${FORMULA_MEOW_PATH}?from=${from}`;

/** The picker card's line: what the game is, short enough for the phone column. */
export const FORMULA_MEOW_PICKER_DESCRIPTION = "Kart racing with cats: drift, boost and loop";

/**
 * The card art: one frame of a real race (Kitchen, the loop, SIM_VERSION 10 build, review/v3 set-piece
 * screenshot at 1440x900) with the HUD cropped out, saved for the picker's 312x218 box at 2x.
 */
export const FORMULA_MEOW_PREVIEW = Object.freeze({
  src: "/game-select/formula-meow-preview@2x.webp",
  width: 312,
  height: 218,
});

/** On in every web build; never in the app build (the export has no /meow-race rewrite). */
export function formulaMeowEntryEnabled(isApp: boolean = isAppBuild()): boolean {
  return !isApp;
}
