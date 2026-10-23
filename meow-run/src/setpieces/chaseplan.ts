// Pure chase tuning (node-importable). SETPIECES lane.

/** dog chase tuning (u, s). The dog rig is assumed ~5 u long with its feet at the origin, facing +z. */
export const DOG = {
  /** how far outside the path edge the dog bounds */
  edgeOut: 0.4,
  /** u ahead of the kitten while bounding alongside (so it reads in portrait too) */
  lead: 4,
  enterT: 0.9,
  firstBark: 2.2,
  /** telegraph: bark + red strip before the snap */
  barkT: 0.8,
  lungeT: 0.5,
  backT: 0.7,
  tumbleT: 1.3,
  /** how far inward the snap sweeps from the bounding line */
  reach: 2.4,
  headFwd: 2.2,
  headIn: 0.9,
  headR: 1.0,
  /** a dodge closer than this is a near miss */
  nearMiss: 1.4,
  /** no new bark this close to the end of the chase */
  minRoomToBark: 50,
};

/**
 * Deterministic rhythm for the chases. dog: seconds until the next bark after bark i (2.4..3.4 s).
 * yarn: 0..1 where > 0.5 means the ball takes Mochi's current side (she must move), else the other side.
 */
export function chasePlan(i: number, kind: 'dog' | 'yarn'): number {
  if (kind === 'dog') return 2.4 + ((i * 7) % 5) * 0.25;
  return [1, 0, 1, 1, 0, 1][i % 6];
}
