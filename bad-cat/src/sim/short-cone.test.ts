/**
 * Integrator (wave 1): a mirror or webcam sitting on furniture sees over furniture up to its own level (the Home
 * office webcam on the desk used to be blocked by the desk cell next to it and saw a single cell).
 */
import { describe, expect, it } from 'vitest';
import type { GridState, Level } from '../types';
import { lineOfSight, lineOfSightOver } from './grid';

function grid(rows: string[]): GridState {
  const d = rows.length;
  const w = rows[0].length;
  const level = new Uint8Array(w * d);
  const occludes = new Uint8Array(w * d);
  rows.forEach((r, z) =>
    [...r].forEach((c, x) => {
      const l = (c === '.' ? 0 : Number(c)) as Level;
      level[z * w + x] = l;
      occludes[z * w + x] = l >= 2 ? 1 : 0;
    }),
  );
  return { w, d, level, occludes, propAt: new Int16Array(w * d).fill(-1) };
}

describe('lineOfSightOver (v5 short cones)', () => {
  const g = grid(['22222', '22222', '.....', '..3..', '.....']);
  it('a raised origin sees over furniture at its own level', () => {
    expect(lineOfSight(g, 2, 0, 2, 2)).toBe(false); // the desk cell (2,1) blocks the plain walk
    expect(lineOfSightOver(g, 2, 0, 2, 2, 2)).toBe(true);
  });
  it('taller furniture still blocks', () => {
    expect(lineOfSightOver(g, 2, 0, 2, 4, 2)).toBe(false); // the L3 cell (2,3)
  });
  it('over 0..1 is the plain line of sight', () => {
    for (let x = 0; x < 5; x++)
      for (let z = 0; z < 5; z++) expect(lineOfSightOver(g, 0, 4, x, z, 1)).toBe(lineOfSight(g, 0, 4, x, z));
  });
});
