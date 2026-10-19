/**
 * Authored-track extras that the frozen `TrackDef` format has no field for (tracks lane), keyed by track id so they
 * stay out of UGC share codes and ghost headers (both carry authored tracks by id). All positions are lap fractions
 * (0..1 along a branch, 0..255 on the main loop like features) or world metres before the Mirror flip:
 * - `voids`: main-loop ranges of open bridge with no walls; off the deck is a fall, and the respawn hand puts the
 *   kart back on the bridge (src/tracks/hazards/rules.ts).
 * - `gaps`: a missing stretch of a branch's deck (`len` m starting at fraction `at`); the far side sits `drop` m lower,
 *   so only a fast kart clears it. A kart that cannot make it is lifted back to before the gap.
 * - `branchPads`: boost pads on a branch at fraction `at`.
 * - `blocks`: solid round props (sofa legs, table, cat tree) karts bounce off, for the battle arena.
 */
export interface TrackExtras {
  voids?: ReadonlyArray<readonly [number, number]>;
  gaps?: ReadonlyArray<{ branch: number; at: number; len: number; drop: number }>;
  branchPads?: ReadonlyArray<{ branch: number; at: number }>;
  blocks?: ReadonlyArray<{ x: number; z: number; r: number }>;
}

/** Static (not registered at import time), so a track built anywhere gets its extras. */
const EXTRAS: Record<string, TrackExtras> = {
  // Kitchen Counter: the boost pad at the end of the crumb cut
  kitchen: { branchPads: [{ branch: 0, at: 0.84 }] },
  // Laundry Spin: the dryer-vent pad on the soap slide
  laundry: { branchPads: [{ branch: 0, at: 0.55 }] },
  // Yarn Canyon: the knitting-needle bridge, and the yarn-ball gap with the pad that makes it
  yarn: { voids: [[50, 66]], gaps: [{ branch: 0, at: 0.42, len: 10, drop: 1.6 }], branchPads: [{ branch: 0, at: 0.27 }] },
  // Cat Café Chaos: the pad in the kitchen pass
  cafe: { branchPads: [{ branch: 0, at: 0.5 }] },
  // Living Room Rug: cover (coffee table, sofa, armchair, cat tree, plant pot)
  rug: {
    blocks: [
      { x: 0, z: 0, r: 3.6 },
      { x: -6, z: 31, r: 2.6 },
      { x: 0, z: 32, r: 2.6 },
      { x: 6, z: 31, r: 2.6 },
      { x: -30, z: -12, r: 3 },
      { x: 27, z: -16, r: 2 },
      { x: -22, z: 24, r: 1.6 },
    ],
  },
};

export function extrasOf(id: string): TrackExtras {
  return EXTRAS[id] ?? {};
}
