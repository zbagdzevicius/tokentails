// copy-lint: web-only the Bad Cat entry points never render in the app build (badcatEntryEnabled)
import { isAppBuild } from "@/components/claims/build";

/**
 * Bad Cat Daily's entry points in the client (bad-cat/, GDD docs/plans/viral-game/GDD.md): the PLAY
 * picker card and the landing section. The game itself is a static build in `public/badcat-game/`,
 * served top level at `/badcat` by the `next.config.js` rewrites (always on in web builds, no flag).
 *
 * Web only, no flag: the Capacitor export has no rewrites (so `/badcat` does not resolve there), and
 * the game sells its Chaos Club and cameos through Stripe, which an app-store build may not offer.
 */
export const BADCAT_PATH = "/badcat";
export const BADCAT_TITLE = "Bad Cat Daily";

/**
 * `from` says which entry point sent the player (same pattern as the Heist). The game itself reads
 * only `utm_source` and `via` (`linkAttribution` in bad-cat/src/platform/analytics.ts), so each link
 * also carries a `utm_source` the game's analytics can attribute.
 */
const BADCAT_UTM = Object.freeze({ picker: "tt_picker", landing_badcat: "tt_landing" });
export const badcatHref = (from: "picker" | "landing_badcat") =>
  `${BADCAT_PATH}?from=${from}&utm_source=${BADCAT_UTM[from]}`;

/** The game's own one-liner (its `<meta name="description">`, GDD section 0). */
export const BADCAT_LINE =
  "Be the cat. Knock things off the counter before the human turns around. A new room every day, free, no download.";

/**
 * Art from the game itself: one frame of the first heist (the Kitchen, the house cat at the table, Chef Dad
 * at the stove), captured from the built game in `public/badcat-game/` on 17 Oct 2026. The card art is a
 * 2x crop for the picker's 312x218 box, the poster a 1280x800 crop for the landing section.
 */
export const BADCAT_PREVIEW = Object.freeze({
  src: "/game-select/badcat-preview@2x.webp",
  width: 312,
  height: 218,
});
export const BADCAT_POSTER = Object.freeze({
  src: "/landing/badcat/badcat-poster-v1.webp",
  width: 1280,
  height: 800,
});

/** On in every web build; never in the app build (no rewrites there, and Stripe checkout). */
export function badcatEntryEnabled(isApp: boolean = isAppBuild()): boolean {
  return !isApp;
}
