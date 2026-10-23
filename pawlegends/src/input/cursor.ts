/**
 * Desktop cursor over the match canvas. The OS arrow was lost in a 5-hero brawl (grass, river, VFX and fog), so the
 * game draws its own: a white halo, a dark ink outline and a bright fill read on light and dark ground alike. One
 * kind per state:
 *
 *   normal      cream arrow
 *   enemy       red arrow with a target badge (a click attacks the unit under it; the unit gets a red ring, and when a
 *               unit-target quick cast would hit a different enemy hero, that hero gets a thinner red ring)
 *   ally        mint arrow with a heart badge
 *   attackMove  red crosshair (A armed: the next click attack-moves)
 *   aim         gold reticle (an ability indicator is open)
 *
 * CSS cursors from inline SVG (32 px, or 48 px with Settings "Cursor size: Large"); a hotspot on the arrow tip or the
 * reticle centre; a stock cursor as the fallback. `cursorKind` and `cursorCss` are pure (unit-tested); DesktopInput
 * writes the value only when it changes.
 */
import type { CursorSize } from './presets';

export type CursorKind = 'normal' | 'enemy' | 'ally' | 'attackMove' | 'aim';
export const CURSOR_KINDS: readonly CursorKind[] = Object.freeze(['normal', 'enemy', 'ally', 'attackMove', 'aim']);

/** The cursor for this frame: aiming beats attack-move beats what is under the cursor. */
export function cursorKind(s: { aiming: boolean; attackArmed: boolean; hover: 'enemy' | 'ally' | null }): CursorKind {
  if (s.aiming) return 'aim';
  if (s.attackArmed) return 'attackMove';
  return s.hover ?? 'normal';
}

const INK = '#1d1018';
const HALO = '#ffffff';
export const CURSOR_FILL: Readonly<Record<CursorKind, string>> = Object.freeze({
  normal: '#fff3dc',
  enemy: '#ff3b4d',
  ally: '#5ff0a8',
  attackMove: '#ff3b4d',
  aim: '#ffd34d',
});

/** Arrow with its tip at (4, 3) in a 32 × 32 box. */
const ARROW = 'M4 3L4 24.5L9.3 19.4L13.2 28L17.4 26.1L13.6 17.6L21 17.6Z';
const arrow = (fill: string): string =>
  `<path d="${ARROW}" fill="none" stroke="${HALO}" stroke-width="5" stroke-linejoin="round" opacity=".9"/>` +
  `<path d="${ARROW}" fill="${fill}" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>`;
const target = (c: string): string =>
  `<circle cx="24.5" cy="24.5" r="6" fill="${INK}" stroke="${HALO}" stroke-width="1.4"/><circle cx="24.5" cy="24.5" r="3.9" fill="none" stroke="${c}" stroke-width="2"/><circle cx="24.5" cy="24.5" r="1.3" fill="${HALO}"/>`;
const heart = (c: string): string =>
  `<path d="M24.5 30c-4-2.7-6.4-5-6.4-7.6 0-1.9 1.4-3.2 3.1-3.2 1.4 0 2.6.8 3.3 2 .7-1.2 1.9-2 3.3-2 1.7 0 3.1 1.3 3.1 3.2 0 2.6-2.4 4.9-6.4 7.6z" fill="${c}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>`;
/** A ring reticle centred at (16, 16): halo, ink, colour; `ticks` adds four inward crosshair ticks. */
const reticle = (c: string, ticks: boolean): string => {
  const ring = (stroke: string, w: number): string => `<circle cx="16" cy="16" r="10" fill="none" stroke="${stroke}" stroke-width="${w}"/>`;
  const t = 'M16 1.5V9M16 23v7.5M1.5 16H9M23 16h7.5';
  const tk = ticks ? `<path d="${t}" stroke="${HALO}" stroke-width="5" stroke-linecap="round" opacity=".9"/><path d="${t}" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/><path d="${t}" stroke="${c}" stroke-width="1.6" stroke-linecap="round"/>` : '';
  return ring(HALO, 6.4) + ring(INK, 4.6) + ring(c, 2.4) + tk + `<circle cx="16" cy="16" r="2.4" fill="${c}" stroke="${INK}" stroke-width="1.4"/>`;
};

function art(kind: CursorKind): { svg: string; hx: number; hy: number; fallback: string } {
  const c = CURSOR_FILL[kind];
  switch (kind) {
    case 'enemy':
      return { svg: arrow(c) + target(c), hx: 4, hy: 3, fallback: 'crosshair' };
    case 'ally':
      return { svg: arrow(c) + heart(c), hx: 4, hy: 3, fallback: 'pointer' };
    case 'attackMove':
      return { svg: reticle(c, true), hx: 16, hy: 16, fallback: 'crosshair' };
    case 'aim':
      return { svg: reticle(c, false), hx: 16, hy: 16, fallback: 'crosshair' };
    default:
      return { svg: arrow(c), hx: 4, hy: 3, fallback: 'default' };
  }
}

/** Cursor size in CSS px. */
export const cursorPx = (size: CursorSize): number => (size === 'large' ? 48 : 32);

const cache = new Map<string, string>();

/** The CSS `cursor` value for a kind at a size (cached: one string per kind and size). */
export function cursorCss(kind: CursorKind, size: CursorSize = 'normal'): string {
  const key = `${kind}|${size}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const a = art(kind);
  const px = cursorPx(size);
  const k = px / 32;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 32 32">${a.svg}</svg>`;
  const v = `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${Math.round(a.hx * k)} ${Math.round(a.hy * k)}, ${a.fallback}`;
  cache.set(key, v);
  return v;
}
