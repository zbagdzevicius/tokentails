import { describe, expect, it } from 'vitest';
import { fillCheckpoints, MAX_CP_GAP, safeSpot } from './checkpoints';
import { PathBuilder } from './path';
import { Track } from './track';
import type { PieceSpec, SegmentKind } from './types';
import { meadow } from '../stages/meadow';
import { gorge } from '../stages/gorge';
import { sunset } from '../stages/sunset';
import { makeRng } from './rng';

describe('filler checkpoints', () => {
  const flat = (): SegmentKind => 'ground';
  it('fills long gaps and never lands on a hazard', () => {
    const specs: PieceSpec[] = [];
    for (let s = 40; s < 1000; s += 30) specs.push({ type: 'log', s });
    const cps = fillCheckpoints([0], specs, flat, 1000);
    for (let i = 1; i < cps.length; i++) expect(cps[i] - cps[i - 1]).toBeLessThanOrEqual(MAX_CP_GAP);
    for (const c of cps.slice(1)) expect(safeSpot(c, specs, flat)).toBe(true);
  });
  it('keeps off gaps and walls', () => {
    const kindAt = (s: number): SegmentKind => (s > 200 && s < 300 ? 'gap' : s >= 300 && s < 400 ? 'wall' : 'ground');
    const cps = fillCheckpoints([0], [], kindAt, 900);
    for (const c of cps) expect(c <= 176 || c >= 400).toBe(true);
  });
  for (const st of [meadow, gorge, sunset]) {
    it(`${st.id}: no stretch longer than ~${MAX_CP_GAP} u without a checkpoint`, () => {
      const t = new Track();
      const b = new PathBuilder(t, st.start);
      const specs = st.build!(b, makeRng(1)).slice().sort((a, b) => a.s - b.s);
      const finish = t.length;
      const flagged = [0, ...specs.filter((p) => ['cpflag', 'vault', 'cloud', 'wallrun', 'river', 'dog', 'yarnchase'].includes(p.type)).map((p) => Math.max(0, p.s - 12))];
      const cps = fillCheckpoints(flagged, specs, (s) => t.kindAt(s), finish - 40);
      let worst = 0;
      for (let i = 1; i < cps.length; i++) {
        // the cloud canyon (no ground to stand on) is the one stretch that can't have a checkpoint inside
        let over = false;
        for (let x = cps[i - 1]; x < cps[i]; x += 2) if (t.kindAt(x) === 'cloud') over = true;
        if (!over) worst = Math.max(worst, cps[i] - cps[i - 1]);
      }
      expect(worst).toBeLessThanOrEqual(MAX_CP_GAP + 40);
    });
  }
});
