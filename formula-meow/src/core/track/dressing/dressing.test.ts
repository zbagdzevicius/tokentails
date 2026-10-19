import { describe, expect, it } from 'vitest';
import type { Group, Mesh } from 'three';
import { TRACKS } from '../tracks';
import { buildTrack, cellKey, type BuiltTrack } from '../build';
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

/**
 * B14: prop vertices inside any part of the loop's wall band (wall + 0.5 m) between that road's surface and camera
 * height. Every sample near the vertex is checked, not only the nearest, so a slab under one part of a hairpin cannot
 * reach over the road of another part.
 */
function insideWalls(t: BuiltTrack, group: Group, names: string[]): string[] {
  const bad: string[] = [];
  for (const name of names) {
    const mesh = group.getObjectByName(name) as Mesh | undefined;
    if (!mesh) continue;
    const pos = mesh.geometry.getAttribute('position');
    for (let v = 0; v < pos.count; v++) {
      const x = pos.getX(v);
      const y = pos.getY(v);
      const z = pos.getZ(v);
      if (y < 0.3) continue;
      let found = false;
      for (let cx = -3; cx <= 3 && !found; cx++)
        for (let cz = -3; cz <= 3 && !found; cz++) {
          const list = t.cells.get(cellKey(x + cx * 8, z + cz * 8));
          if (!list) continue;
          for (const i of list) {
            const ox = x - t.px[i];
            const oz = z - t.pz[i];
            const along = ox * t.tx[i] + oz * t.tz[i];
            if (Math.abs(along) > t.step) continue;
            const d = ox * -t.tz[i] + oz * t.tx[i];
            const wall = (d > 0 ? t.wallR[i] : t.wallL[i]) + 0.5;
            if (Math.abs(d) > wall) continue;
            const road = t.py[i] + d * t.bank[i];
            if (y > road + 0.05 && y < road + 4) {
              bad.push(`${name} (${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)}) over sample ${i}`);
              found = true;
              break;
            }
          }
        }
      if (bad.length > 5) return bad;
    }
  }
  return bad;
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
    it(`${def.name}: every prop stays outside the walls (wall + 0.5 m) of every part of the loop (B14)`, () => {
      const t = buildTrack(def);
      expect(insideWalls(t, dress(t, themeOf(theme)), names)).toEqual([]);
    });
  }
});
