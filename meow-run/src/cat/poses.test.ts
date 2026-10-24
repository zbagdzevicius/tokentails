import { describe, expect, it } from 'vitest';
import { POSES } from '../ugc/contract';
import { CH, poseTargets, restPose } from './poses';

describe('held photo poses', () => {
  it('every contract pose fills every channel with finite numbers', () => {
    const out = restPose();
    for (const id of POSES)
      for (const t of [0, 0.37, 5.2]) {
        poseTargets(id, t, out);
        for (const c of CH) expect(Number.isFinite(out[c]), `${id} ${c}`).toBe(true);
      }
  });
  it('poses differ from each other and from rest', () => {
    const rest = JSON.stringify(restPose());
    const seen = new Set<string>();
    for (const id of POSES) {
      const s = JSON.stringify(poseTargets(id, 0, restPose()));
      expect(s).not.toBe(rest);
      expect(seen.has(s)).toBe(false);
      seen.add(s);
    }
  });
  it('a pose fully overrides earlier targets (no leftovers from gameplay)', () => {
    const a = poseTargets('sit', 1, restPose());
    const dirty = restPose();
    for (const c of CH) dirty[c] = 99;
    expect(poseTargets('sit', 1, dirty)).toEqual(a);
  });
  it('the leap floats, the loaf sits low, the wave moves its paw', () => {
    expect(poseTargets('leap', 0, restPose()).hipY).toBeGreaterThan(0.8);
    expect(poseTargets('loaf', 0, restPose()).hipY).toBeLessThan(0.25);
    expect(poseTargets('wave', 0, restPose()).fr).not.toBe(poseTargets('wave', 0.15, restPose()).fr);
  });
});
