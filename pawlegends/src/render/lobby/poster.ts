/**
 * Home poster (docs/plans/moba/HOME-POSTER.md, founder pick #30 "Flat poster", Nov 18): the Home backdrop is drawn,
 * not painted. Two flat fields (rose cats left, sky dogs right) split by a halftone lightning bolt, the picked
 * champion big on its own side (the 3D model) and its rival as a flat dark silhouette on the other side. A cat
 * champion stands on the rose field with the bolt right of centre; a dog champion is the mirror image.
 *
 * This module is the pure part (no three.js, no DOM): which side, which rival, the bolt's mirror math, and where the
 * champion and the rival go on screen, clear of the Home HUD. The shader lives in backdrop.ts, the camera in lobby.ts.
 */
import type { HeroId, HeroRole, HeroSide } from '../../data/heroes/types';
import { HERO_IDS, HEROES } from '../../data/heroes';

/** The layout sign: +1 a cat champion (left, bolt right of centre), -1 a dog champion (right, bolt left of centre). */
export const posterFlip = (side: HeroSide): 1 | -1 => (side === 'dog' ? -1 : 1);

/** The champion's side of the poster for a hero. */
export const posterSide = (hero: HeroId): HeroSide => HEROES[hero]?.side ?? 'cat';

/**
 * The rival on the other field: the other species' hero of the same role and the same place in that role (HERO_IDS
 * order). Each side has the same roles in the same counts (2 tanks, 2 fighters, 2 assassins, 2 supports, 3 mages,
 * 3 marksmen), so every cat has one dog counterpart and back (Clem the first cat fighter meets Howler the first dog
 * fighter). Falls back to the first hero of the other side when a role is uneven.
 */
export function rivalFor(hero: HeroId): HeroId {
  const me = HEROES[hero];
  const other: HeroSide = me.side === 'cat' ? 'dog' : 'cat';
  const ofRole = (side: HeroSide, role: HeroRole): HeroId[] => HERO_IDS.filter((h) => HEROES[h].side === side && HEROES[h].role === role);
  const i = ofRole(me.side, me.role).indexOf(hero);
  const theirs = ofRole(other, me.role);
  if (theirs.length) return theirs[Math.max(0, i) % theirs.length];
  return HERO_IDS.find((h) => HEROES[h].side === other) ?? hero;
}

/**
 * The bolt's centre line, as (dx, y) points from top to bottom: dx in screen-height units from the screen centre,
 * y 0 (bottom) .. 1 (top). Drawn for a cat champion (flip +1): it leans from upper right to lower left with one jag.
 * The shader mirrors it with `boltPoints(flip)`; kept here so the mirror math is tested.
 */
export const BOLT: readonly (readonly [number, number])[] = Object.freeze([
  [0.2, 1.08],
  [-0.02, 0.6],
  [0.13, 0.53],
  [-0.12, -0.08],
] as const);

/** How far the bolt sits from the screen centre (screen-height units) for a cat champion (mirrored for a dog). */
export const BOLT_SHIFT = 0.05;

/** The bolt for a flip in -1..1 (the swap eases through 0, where it stands upright on the centre). */
export function boltPoints(flip: number): [number, number][] {
  return BOLT.map(([dx, y]) => [flip * (dx + BOLT_SHIFT), y]);
}

/** The bolt's x (screen-height units from the centre) at height y, for a flip. */
export function boltX(y: number, flip: number): number {
  const p = boltPoints(flip);
  if (y >= p[0][1]) return p[0][0];
  for (let i = 0; i < p.length - 1; i++) {
    const [x0, y0] = p[i];
    const [x1, y1] = p[i + 1];
    if (y <= y0 && y >= y1) return x0 + ((x1 - x0) * (y - y0)) / (y1 - y0 || 1);
  }
  return p[p.length - 1][0];
}

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Where the champion stands (CSS px): its centre x, the top of its head and its feet. */
export interface PosterBox {
  cx: number;
  top: number;
  bottom: number;
}

const MARGIN = 8;

const hits = (a: Rect, b: Rect): boolean => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

/**
 * The champion's box on a w × h screen, clear of the HUD rects: it starts large (~62% of the height, feet near the
 * bottom) on its own side near the bolt, then each HUD element it touches pushes it: one above lowers its head, one
 * below lifts its feet, one beside slides it sideways (toward the bolt). `aspect` is the hero's drawn width / height.
 * Never smaller than 40% of the height (a crowded tiny screen keeps a readable hero over a little HUD).
 */
export function posterBox(o: { w: number; h: number; side: HeroSide; aspect: number; hud: readonly Rect[] }): PosterBox {
  const { w, h } = o;
  const s = o.side === 'dog' ? 1 : -1;
  const aspect = Math.max(0.45, Math.min(1.3, o.aspect));
  let bottom = h * 0.93;
  let top = bottom - h * 0.62;
  // its side, toward the bolt: a fifth of the width from the centre, at most half a height on ultra-wide screens
  let cx = w / 2 + s * Math.min(w * 0.2, h * 0.52);
  const minH = h * 0.4;
  for (let pass = 0; pass < 10; pass++) {
    const hh = bottom - top;
    const half = (hh * aspect) / 2;
    const box: Rect = { left: cx - half, right: cx + half, top, bottom };
    const hit = o.hud.find((r) => r.right - r.left > 0 && r.bottom - r.top > 0 && hits(box, { left: r.left - MARGIN, right: r.right + MARGIN, top: r.top - MARGIN, bottom: r.bottom + MARGIN }));
    if (!hit) break;
    const upper = hit.bottom <= top + hh * 0.4;
    const lower = hit.top >= bottom - hh * 0.4;
    if (upper && hit.bottom + MARGIN < bottom - minH) top = hit.bottom + MARGIN;
    else if (lower && hit.top - MARGIN > top + minH) bottom = hit.top - MARGIN;
    else {
      const hc = (hit.left + hit.right) / 2;
      cx = hc < cx ? hit.right + MARGIN + half : hit.left - MARGIN - half;
      // never past the screen edge or across the middle
      cx = Math.max(half + 4, Math.min(w - half - 4, cx));
    }
  }
  return { cx, top, bottom };
}

/**
 * The rival silhouette's box in screen UV (0..1, y up, as the shader's gl_FragCoord / resolution): on the other
 * field, taller than the champion (88% of the height) and cut off by the screen's bottom edge, so it reads as a
 * looming shape behind the HUD. `imgAspect` is the silhouette image's width / height.
 */
export function rivalBox(o: { w: number; h: number; side: HeroSide; imgAspect: number }): [number, number, number, number] {
  const s = o.side === 'dog' ? 1 : -1; // the CHAMPION's side; the rival goes to the other one
  const hh = 0.88;
  const wUv = (hh * o.h * o.imgAspect) / o.w;
  const cx = 0.5 - s * Math.min(0.22, (0.55 * o.h) / o.w);
  const y0 = -0.06;
  return [cx - wUv / 2, y0, cx + wUv / 2, y0 + hh];
}

/** The rival silhouette file on pawlegends.app (pawlegends-web/public/pawlegends-art/silhouettes/, ≤ 14 KB each). */
export const silhouetteFile = (hero: HeroId): string => `silhouettes/${hero}-640.webp`;
