import { describe, expect, it } from 'vitest';
import { ovalTrack } from '../../test/fixtures';
import { buildTrack } from '../track/build';
import { edgeLook, type EdgeLook } from './edge-look';

describe('edge look-ahead (iteration 4, F2: MuxContext.edgeL / edgeR)', () => {
  const t = buildTrack(ovalTrack());
  const out: EdgeLook = { edgeL: 0, edgeR: 0, edgeHeading: 0 };
  // a straight stretch: the sample with the least curvature
  let i = 0;
  for (let j = 0; j < t.n; j++) if (Math.abs(t.curv[j]) < Math.abs(t.curv[i])) i = j;
  const hw = t.halfW[i];
  const at = (d: number, v: number, turn = 0) => {
    const tx = t.tx[i];
    const tz = t.tz[i];
    const h = Math.atan2(tx, tz) + turn;
    return { x: t.px[i] - tz * d, z: t.pz[i] + tx * d, vx: Math.sin(h) * v, vz: Math.cos(h) * v, si: i };
  };

  it('on the centre line going straight: both edges about half the road away', () => {
    edgeLook(t, at(0, 10), 0, 0.5, out);
    expect(out.edgeL).toBeCloseTo(hw, 0);
    expect(out.edgeR).toBeCloseTo(hw, 0);
    expect(Math.abs(out.edgeHeading)).toBeLessThan(0.1);
  });

  it('off to the right (d + = right): the right edge is close, the left far', () => {
    edgeLook(t, at(hw - 1, 10), 0, 0.5, out);
    expect(out.edgeR).toBeCloseTo(1, 0);
    expect(out.edgeL).toBeCloseTo(2 * hw - 1, 0);
  });

  it('heading off the road to the right at speed: the projected point is past the right edge (negative)', () => {
    // heading grows to the left, so a negative turn points right
    edgeLook(t, at(0, 30, -0.8), 0, 0.5, out);
    expect(out.edgeR).toBeLessThan(0);
    expect(out.edgeL).toBeGreaterThan(hw);
    // the road heads left of the travel direction there
    expect(out.edgeHeading).toBeGreaterThan(0.3);
  });

  it('a turn rate curves the projection: turning left brings the left edge closer', () => {
    edgeLook(t, at(0, 20), 0, 0.5, out);
    const straight = out.edgeL;
    edgeLook(t, at(0, 20), 1.2, 0.5, out);
    expect(out.edgeL).toBeLessThan(straight - 1);
  });
});
