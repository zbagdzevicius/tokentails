// copy-lint: web-only the Moon Rave entry points never render in the app build (raveEntryEnabled)
import { isAppBuild } from "@/components/claims/build";

/**
 * The Moon Rave's entry points in the client (cat-rave/, CHECKOUT-SPEC.md section 10): the landing
 * section (RaveSection) and the "Choose your adventure" picker card. The rave itself is a static build
 * in `public/rave/`, served at `/rave` by the `next.config.js` rewrite (web builds only, no flag).
 */
export const RAVE_PATH = "/rave";
export const RAVE_TITLE = "Moon Rave";

/** `from` says which entry point sent the visitor (the rave ignores it, as the Heist's landing links). */
export type RaveFrom = "landing_rave" | "picker";
export const raveHref = (from: RaveFrom) => `${RAVE_PATH}?from=${from}`;

/**
 * The picker card's line.
 * claim: the rave rule "every $1 paid out to Pink Paw on-chain = one dancing cat", whoever pays it
 *   (cat-rave/README.md "The $1 = 1 cat rule"; RaveSection's claim comments). Token Tails pays out the
 *   free treats, the card cats and the 50% Pink Paw share of each $5 shelter cat; givers pay out their
 *   wallet gifts, sponsor matches and USDC cats.
 */
export const RAVE_PICKER_DESCRIPTION = "Every $1 you give Pink Paw adds a dancing cat";

/**
 * The card art: the reel's opening frame (the DJ cat at the Arc booth under the green moon, the crowd
 * dancing), from `public/landing/rave/rave-promo-v3-16x9.mp4` at 0 s, before any caption, cropped below
 * the Token Tails logo to the picker's 312x218 box at 2x.
 */
export const RAVE_PREVIEW = Object.freeze({
  src: "/game-select/rave-preview@2x.webp",
  width: 312,
  height: 218,
});

/** On in every web build; never in the app build (the export has no /rave rewrite, and its checkout takes cards and USDC). */
export function raveEntryEnabled(isApp: boolean = isAppBuild()): boolean {
  return !isApp;
}
