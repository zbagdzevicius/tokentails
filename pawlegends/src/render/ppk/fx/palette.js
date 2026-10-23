// Lifted from Pink Paw Knight (swordcat) at commit 7714dcb: src/fx/palette.js
// Licence: all rights reserved, pending founder decision (POC.md §17, GDD §12 decision #3). Not MIT.
// Changes: relative imports rewritten by tools/lift-ppk.mjs; any later hand edit is marked "pawlegends:".
// src/fx/palette.js  (owner: fx) — the warm fx palette (ART_WARM_SPEC §8.4 / §8.6, WARM_ADVENTURE_SPEC §2.7 / §3) and the
// colour maths the colour-language lint uses. One place for every fx colour that is not a gameplay-language colour
// (those live in config `TELEGRAPH.colors` / `CLASS_MARKS`): ink, blob, warm dust, sand debris, the confetti set.
// Rule (WA30): no colour with HSV V < 0.20 anywhere in fx source except the cocoa ink family `INK_ALLOW`.
// Pure; node-safe.
import { CLASS_MARKS, TELEGRAPH } from '../core/config.js';

/** WA §2.7 cocoa ink allowlist: the only dark (HSV V < 0.20) hex literals fx / ui source may contain. */
export const INK_ALLOW = Object.freeze(['#2A1E18', '#3A2A1F', '#4A2A1F', '#5A3B2E', '#3A2630', '#3A2346']);

/** Warm fx colours (hex). */
export const FX_COLORS = Object.freeze({
  ink: TELEGRAPH.ink?.color ?? '#4A2A1F',   // the "ink sandwich" edge under every ground mark (WA §3.2 rule 4)
  blob: '#5A4E7A',                          // ART TONE.blob: contact blobs, bolt shadows, the landing disc
  cream: '#FFF6E8', creamRim: '#FFF6E8',    // ART §8.4 telegraph cream rim
  sand: '#C49A6C', sandLight: '#F2DDBB', sandPale: '#EFD8B4', sandDust: '#D9B48A',   // WA §2.7 Shockwaves debris / dust
  dust: '#FFF4E0', dustWarm: '#E6C590',     // ART §8.4 poof dust (never grey)
  feather: '#6A5A8A',                       // WA §2.7 crow feathers
  horde: '#5A3E6A', hordeDust: '#F2DDBB',   // WA §2.7 CS-02 horde silhouettes + the cream dust band at their feet
  plum: TELEGRAPH.colors?.shadow ?? '#3A2346',
  pink: CLASS_MARKS.hero?.color ?? '#FF8FB1', heart: CLASS_MARKS.heroHearts?.full ?? '#FF6F9C',
  mint: CLASS_MARKS.interact?.color ?? '#9BE3C4', sky: CLASS_MARKS.companion?.color ?? '#8FD3FF',
  butter: '#FFD84A', star: '#FFE066', gold: '#FFD34D', goldCore: '#FFF6DA', lilac: '#C9A8FF', mistLilac: '#D8C8F4',
  twinkle: CLASS_MARKS.pickup?.twinkle ?? '#FFF1C4', twinkleGold: CLASS_MARKS.pickup?.gold ?? '#FFD57A',
  light: '#FFF4E0',                          // ART §8.1 ground light pools: warm cream (the multiplicative tint; never lime)
  stone: '#C9B8A8', warmGrey: '#D9C7B4',     // warm "grey" (never HSV sat < 0.08 cold greys)
  lantern: '#FFC46B',
});

/** ART §8.6 rescue / celebration confetti colours. */
export const CONFETTI_COLORS = Object.freeze(['#FF8FB1', '#FFD84A', '#8FD3FF', '#9BE3C4', '#FFFFFF', '#C9A8FF']);

/** '#RGB' | '#RGBA' | '#RRGGBB' | '#RRGGBBAA' → [r, g, b] in 0..1 (sRGB), or null. */
export function hexRgb(hex) {
  const m = /^#?([0-9a-f]{3,8})$/i.exec(String(hex).trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3 || h.length === 4) h = h.slice(0, 3).split('').map((c) => c + c).join('');
  else if (h.length === 6 || h.length === 8) h = h.slice(0, 6);
  else return null;
  const n = parseInt(h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** sRGB [r, g, b] (0..1) → { h (deg 0..360), s, v }. */
export function rgbHsv([r, g, b]) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d > 1e-9) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  return { h, s: max > 0 ? d / max : 0, v: max };
}

/** HSV of a hex colour (null when unparsable). */
export const hexHsv = (hex) => { const c = hexRgb(hex); return c ? rgbHsv(c) : null; };

/** WA30: is this hex a "dark literal" (HSV V < 0.20) that is not in the cocoa ink allowlist? */
export function isDarkLiteral(hex) {
  const c = hexRgb(hex);
  if (!c) return false;
  const up = '#' + String(hex).replace('#', '').slice(0, 6).toUpperCase();
  if (INK_ALLOW.includes(up)) return false;
  return rgbHsv(c).v < 0.2;
}

/** WA §3.2 rule 1: hero pink (hue 335–350°, a real chroma). */
export const isHeroPink = (hex) => { const c = hexHsv(hex); return !!c && c.h >= 335 && c.h <= 350 && c.s > 0.25; };
/** WA §3.2 rule 2: danger hue (0–30° with S > 0.6). */
export const isDangerHue = (hex) => { const c = hexHsv(hex); return !!c && (c.h <= 30 || c.h >= 359.5) && c.s > 0.6; };
