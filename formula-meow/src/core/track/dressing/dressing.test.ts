import { describe, expect, it } from 'vitest';
import type { Group, Mesh } from 'three';
import { TRACKS } from '../tracks';
import { buildTrack, type BuiltTrack } from '../build';
import { queryTrack, type TrackHit } from '../query';
import { Surface } from '../../../types';
import { PHYS } from '../../../tuning';
import { themeOf, type Theme } from '../themes';
import { dressKitchen } from './kitchen';
import { dressRooftops } from './rooftops';

/** Prop vertices over the drivable band (road and curbs) between the surface and camera height: walls in the road. */
function poking(t: BuiltTrack, group: Group, names: string[]): number {
  const hit: TrackHit = { i: 0, s: 0, d: 0, y: 0, surface: Surface.Road };
  let n = 0;
  for (const name of names) {
    const mesh = group.getObjectByName(name) as Mesh | undefined;
    if (!mesh) continue;
    const pos = mesh.geometry.getAttribute('position');
    for (let v = 0; v < pos.count; v++) {
      const y = pos.getY(v);
      if (y < 0.3) continue;
      queryTrack(t, pos.getX(v), pos.getZ(v), -1, hit, y);
      if (Math.abs(hit.d) > t.halfW[hit.i] + PHYS.curbWidth) continue;
      if (y > hit.y + 0.05 && y < hit.y + 4) n++;
    }
  }
  return n;
}

const CASES: Array<[number, (t: BuiltTrack, th: Theme) => Group, string[]]> = [
  [0, dressKitchen, ['kitchen-props']],
  [1, dressRooftops, ['rooftops-props', 'rooftops-lit']],
];

describe('track dressing', () => {
  for (const [theme, dress, names] of CASES) {
    const def = TRACKS.find((d) => d.theme === theme);
    if (!def) continue;
    it(`${def.name}: no prop pokes through the road (the banked hairpin once hid the kart behind a slab)`, () => {
      const t = buildTrack(def);
      expect(poking(t, dress(t, themeOf(theme)), names)).toBe(0);
    });
  }
});
