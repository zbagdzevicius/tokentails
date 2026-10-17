// Lifted from Pink Paw Knight (swordcat) at commit 7714dcb: src/core/brand.js
// Licence: all rights reserved, pending founder decision (POC.md §17, GDD §12 decision #3). Not MIT.
// Changes: relative imports rewritten by tools/lift-ppk.mjs; any later hand edit is marked "pawlegends:".
// src/core/brand.js  (owner: G3 brand) — the ONE place the game's name and its Token Tails / Pink Paw names live
// (docs/TOKENTAILS-PLAN.md §10.4, §10.5). Everything that shows the title reads it from here: story/strings.js
// (`game.title`, `game.subtitle`), ui/icons.js (logoHtml default), story/Overlay.js (fallback wordmark), core/recovery.js
// (recovery panels) and index.html (`%GAME_TITLE%` / `%GAME_SUBTITLE%` placeholders, filled by vite.config.js through
// scripts/social-meta.mjs `brandHtml`). Pink Paw has not approved its name as the game title yet: flipping
// `usePinkPawName` to false switches the title AND the Rescue House name to the fallbacks in one edit.
// Pure data; node-safe; no imports.

const PINK_PAW_TITLE = 'Pink Paw Knight';
/** The title used when `usePinkPawName` is false (founder supplies a final one; until then the same title). */
const FALLBACK_TITLE = PINK_PAW_TITLE;
const USE_PINK_PAW_NAME = true;

const title = USE_PINK_PAW_NAME ? PINK_PAW_TITLE : FALLBACK_TITLE;

/**
 * @typedef {object} Brand
 * @property {string} title          display title ("Pink Paw Knight")
 * @property {string} titleCaps      the wordmark form ("PINK PAW KNIGHT"), derived
 * @property {string} subtitle       "A Token Tails Adventure"
 * @property {string} tagline        the one-line pitch under the title logo
 * @property {boolean} usePinkPawName  one switch for the title and the Rescue House name
 * @property {string} fallbackTitle  title when usePinkPawName is false
 * @property {string} shelterName    "Pink Paw" (credits only; never next to help / save / feed / support / fund)
 * @property {string} shelterLocal   "Rožinė pėdutė" (Nunito only: Passion One has no ė)
 * @property {string} rescueHouse    the in-game (fictional) Rescue House name in use
 * @property {string} fallbackRescueHouse
 * @property {Readonly<Record<string, string>>} pinkPawKittens  kitten id → licensed Pink Paw cat name (delete an entry to revert it)
 * @property {string} site           "tokentails.com"
 */

/** @type {Readonly<Brand>} */
export const BRAND = Object.freeze({
  title,
  titleCaps: title.toUpperCase(),
  subtitle: 'A Token Tails Adventure',
  tagline: 'One tiny knight. Twelve lost kittens. One warm Rescue House.',
  usePinkPawName: USE_PINK_PAW_NAME,
  fallbackTitle: FALLBACK_TITLE,
  shelterName: 'Pink Paw',
  shelterLocal: 'Rožinė pėdutė',
  rescueHouse: USE_PINK_PAW_NAME ? 'Pink Paw Rescue House' : 'Pawsbury Rescue House',
  fallbackRescueHouse: 'Pawsbury Rescue House',
  // TOKENTAILS-PLAN §2.5 / §10.5: licensed names of real Pink Paw cats; the adventures are made up (credits say so)
  pinkPawKittens: Object.freeze({ pickles: 'Judas', pebble: 'Simas', muffin: 'Raudvis', socks: 'Zare' }),
  site: 'tokentails.com',
});

/** The names the four kittens had before the Pink Paw nod (a missing `pinkPawKittens` entry falls back to these). */
export const KITTEN_FALLBACK_NAMES = Object.freeze({ pickles: 'Pickles', pebble: 'Pebble', muffin: 'Muffin', socks: 'Socks' });

/** Display name for a kitten id that may carry a Pink Paw name (null for other ids). Pure. */
export function brandKittenName(id, brand = BRAND) {
  if (!(id in KITTEN_FALLBACK_NAMES)) return null;
  return brand.pinkPawKittens?.[id] ?? KITTEN_FALLBACK_NAMES[id];
}

/** `<title>` / share-card title: "Pink Paw Knight · Token Tails". */
export const PAGE_TITLE = `${BRAND.title} · Token Tails`;
