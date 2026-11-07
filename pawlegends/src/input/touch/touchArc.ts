/**
 * Audit CF-04: the touch button arc as data. No two buttons touch (before, E and the trick overlapped by 5 px and
 * five pairs sat 13-18 px apart), and the whole arc scales with the screen height (667x375 gets a slightly smaller
 * arc than 932x430 instead of the same fixed px).
 *
 * Coordinates are px from the cluster's bottom-right corner (`.pl-tcluster`): `rx` leftwards, `by` upwards, to the
 * button's centre; `d` is its diameter. TouchControls writes them as inline right/bottom/width/height.
 */
export type ArcButton = 'attack' | 'q' | 'w' | 'e' | 'r' | 'trick' | 'nap' | 'lasthit' | 'tower';

export interface ArcSpot {
  rx: number;
  by: number;
  d: number;
}

/** The smallest edge-to-edge gap (px at scale 1) between any two of the main buttons. */
export const ARC_GAP = 16;

/**
 * The highest point (px above the cluster's bottom, at scale 1) any main button may reach: the phone kill feed and
 * the enemy portraits under the minimap end there (hud-compact.spec.ts), as the old E button did.
 */
export const ARC_TOP = 176;

const ATK = 96;
const ATK_R = ATK / 2;

/**
 * The familiar places (Q left of Attack, W up-left, E above, R further up-left, the trick up-right, Nap bottom-left),
 * each moved at most 20 px from the old CSS spot to the layout with the widest smallest gap (17 px at scale 1) under
 * ARC_TOP; the optional last-hit and tower buttons sit above, as before.
 */
const BASE: Readonly<Record<ArcButton, ArcSpot>> = Object.freeze({
  attack: { rx: ATK_R, by: ATK_R, d: ATK },
  q: { rx: 160, by: 30, d: 60 },
  w: { rx: 140, by: 105, d: 60 },
  e: { rx: 75, by: 146, d: 60 },
  r: { rx: 214, by: 140, d: 70 },
  trick: { rx: 6, by: 127, d: 48 },
  nap: { rx: 229, by: 47, d: 46 },
  // the last-hit (minion) and tower buttons (Settings; on by default since UX pass 2, Wild Rift shows both): left of R
  // and Nap, under ARC_TOP like the rest (above it they sat on the phone kill feed, hud-compact.spec.ts)
  lasthit: { rx: 275, by: 95, d: 44 },
  tower: { rx: 290, by: 30, d: 44 },
});

/** UX pass 2: Settings "Button size: Large" scales the whole arc up by this much (gaps and all). */
export const ARC_LARGE = 1.12;

/** The arc's scale for a viewport: 1 at 390 px of height, a little smaller on short phones, a little larger on tall ones. */
export function arcScale(_vw: number, vh: number): number {
  return Math.max(0.92, Math.min(1.12, vh / 390));
}

/** Every button's spot for a viewport (px); no button is under the 44 px touch minimum. `large`: Settings' big buttons. */
export function arcLayout(vw: number, vh: number, large = false): Record<ArcButton, ArcSpot> {
  const k = arcScale(vw, vh) * (large ? ARC_LARGE : 1);
  const out = {} as Record<ArcButton, ArcSpot>;
  for (const [id, s] of Object.entries(BASE) as [ArcButton, ArcSpot][]) out[id] = { rx: s.rx * k, by: s.by * k, d: Math.max(44, Math.round(s.d * k)) };
  return out;
}

/**
 * The inline style of one button: its box inside the cluster. `mirror` (UX pass 2, left-handed): the same arc measured
 * from the cluster's bottom-LEFT corner, so Attack sits in the left corner and the skills fan out to the right.
 */
export function arcStyle(s: ArcSpot, mirror = false): { left: string; right: string; bottom: string; width: string; height: string } {
  const side = `${Math.round(s.rx - s.d / 2)}px`;
  return { left: mirror ? side : '', right: mirror ? '' : side, bottom: `${Math.round(s.by - s.d / 2)}px`, width: `${s.d}px`, height: `${s.d}px` };
}

/** The smallest edge-to-edge gap between two buttons of a layout (px; negative = overlap). */
export function minGap(l: Record<ArcButton, ArcSpot>, ids: readonly ArcButton[] = Object.keys(l) as ArcButton[]): { gap: number; a: ArcButton; b: ArcButton } {
  let best = { gap: Infinity, a: ids[0], b: ids[0] };
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++) {
      const p = l[ids[i]];
      const q = l[ids[j]];
      const gap = Math.hypot(p.rx - q.rx, p.by - q.by) - p.d / 2 - q.d / 2;
      if (gap < best.gap) best = { gap, a: ids[i], b: ids[j] };
    }
  return best;
}
