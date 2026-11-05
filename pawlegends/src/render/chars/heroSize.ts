/**
 * Per-hero visual build (RENDER ONLY): how tall and how wide each champion's mesh is drawn, so the twelve read as
 * different bodies on the same screen (a tiny kid in a box next to a big pug tank). Nothing here touches the sim:
 * hitboxes, ranges and radii stay the sim's; only the drawn mesh and the render things that hang off it (overhead
 * plate height, relation ring, shadow, hit-spark heights, hero-select framing) follow.
 *
 * `h` multiplies the authored height (specs.ts / heroes/<id>.ts HEIGHT and TOP), `w` scales the body's width and
 * depth only (0.85–1.25: wider and the inverted-hull outline thickens unevenly). `ring` is the relation ring (m),
 * kept within +12% of the old ring for the big bodies (the ring reads as the footprint; the sim radius is unchanged).
 *
 * Heights stay within 0.93–1.08 (readability QA, 844×390 Low): taller tanks hid the units and plates behind them and
 * a shorter Pixel fell under the ~45 px a hero needs to read on a phone; the difference lives mostly in the width, the
 * ring and the silhouette.
 *
 * Pure data, no imports beyond the type: specs.ts, models.ts and visualSize.ts all read it without a cycle.
 */
import type { HeroId } from '../../sim/api';

export interface HeroBuild {
  /** Height multiplier on the authored height. */
  readonly h: number;
  /** Girth multiplier (mesh X/Z only). */
  readonly w: number;
  /** Relation ring diameter-ish size (m), as views/models.ts HERO_RING. */
  readonly ring: number;
}

export const HERO_BUILD: Readonly<Record<HeroId, HeroBuild>> = Object.freeze({
  // tiny kid in a box
  pixel: { h: 0.93, w: 0.95, ring: 1.75 },
  // dainty support
  gabe: { h: 0.95, w: 0.95, ring: 1.9 },
  // lean striker
  aviete: { h: 0.98, w: 0.9, ring: 1.95 },
  // slender archer
  sage: { h: 1.0, w: 0.93, ring: 1.94 },
  // the baseline little knight
  clem: { h: 1.0, w: 1.0, ring: 2.03 },
  // showy mage
  bengas: { h: 1.02, w: 1.0, ring: 2.0 },
  // regal, floats high on her cushion
  duchess: { h: 1.06, w: 1.08, ring: 2.3 },
  // chonky and wide, short
  meatball: { h: 0.96, w: 1.25, ring: 2.5 },
  // lanky hyena
  cacklejaw: { h: 1.08, w: 0.88, ring: 2.09 },
  // tallest, leggy
  stilts: { h: 1.08, w: 0.9, ring: 1.95 },
  // big soft Maine tank
  lambo: { h: 1.08, w: 1.16, ring: 2.45 },
  // big pug tank
  brutus: { h: 1.08, w: 1.14, ring: 2.45 },
});
