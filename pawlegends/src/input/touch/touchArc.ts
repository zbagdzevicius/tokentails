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

/** The smallest edge-to-edge gap (px at scale 1) between any two of the main buttons (feel pass B3: R–W). */
export const ARC_GAP = 14;

/**
 * The highest point (px above the cluster's bottom, at scale 1) any main button may reach. Feel pass B3: the right-edge
 * column (last-hit, tower, Nap) is exempt: it runs up the screen edge, under the top strip.
 */
export const ARC_TOP = 192;

/** The right-edge column stays this far (px) below the viewport top, measured from the cluster's bottom edge. */
export const ARC_COLUMN_CLEAR = 54;

/** The main buttons (ARC_TOP applies); the rest are the right-edge column. */
export const ARC_MAIN: readonly ArcButton[] = Object.freeze(['attack', 'q', 'w', 'e', 'r', 'trick'] as ArcButton[]);

const ATK = 92;
const ATK_R = ATK / 2;

/**
 * Feel pass B3 (docs/plans/moba/FEEL-PASS.md, MLBB-style): Q, W and E on a 116 px arc and R and the trick on a 196 px
 * arc around Attack's centre; the trick (flash, the panic button) bottom-left beside Q, bigger; the cluster is ~268 px
 * wide (was 312). The last-hit and tower buttons (shown only while they have a target) and Nap (a 300 ms hold) stand
 * in a column up the right edge, out of the arc. Any slot may move by up to 12 px after a thumb test.
 */
const BASE: Readonly<Record<ArcButton, ArcSpot>> = Object.freeze({
  attack: { rx: ATK_R, by: ATK_R, d: ATK },
  q: { rx: 161, by: 34, d: 64 },
  w: { rx: 141, by: 112, d: 64 },
  e: { rx: 74, by: 158, d: 64 },
  r: { rx: 219, by: 138, d: 72 },
  trick: { rx: 241, by: 32, d: 52 },
  lasthit: { rx: 26, by: 214, d: 44 },
  tower: { rx: 84, by: 250, d: 44 },
  nap: { rx: 26, by: 312, d: 44 },
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
  // the right-edge column never runs into the top strip (24 px plus a margin, above the cluster's 24 px bottom offset)
  const top = vh - ARC_COLUMN_CLEAR;
  for (const [id, s] of Object.entries(BASE) as [ArcButton, ArcSpot][]) {
    const d = Math.max(44, Math.round(s.d * k));
    const by = ARC_MAIN.includes(id) ? s.by * k : Math.min(s.by * k, top - d / 2);
    out[id] = { rx: s.rx * k, by, d };
  }
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
