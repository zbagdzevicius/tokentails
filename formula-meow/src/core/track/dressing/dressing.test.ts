import { describe, expect, it } from 'vitest';
import type { Group, Mesh } from 'three';
import { ALL_TRACKS } from '../tracks';
import { buildTrack, cellKey, outerWall, type BuiltTrack } from '../build';
import { queryTrack, type TrackHit } from '../query';
import { Surface } from '../../../types';
import { PHYS } from '../../../tuning';
import { themeOf, type Theme } from '../themes';
import { dressKitchen } from './kitchen';
import { dressRooftops } from './rooftops';
import { dressLaundry } from './laundry';
import { dressYarn } from './yarn';
import { dressCafe } from './cafe';
import { dressShelter } from './shelter';
import { dressRug } from './rug';
import { branchFoot, type Foot } from '../branch';

const foot: Foot = { j: 0, along: 0, d: 0 };

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
      const x = pos.getX(v);
      const z = pos.getZ(v);
      queryTrack(t, x, z, -1, hit, y);
      // the drivable band of the road the point is on (a branch has its own width)
      const b = hit.branch != null && hit.branch >= 0 ? t.branches.find((o) => o.id === hit.branch) : undefined;
      const half = b && branchFoot(b, x, z, foot) ? b.halfW[foot.j] : t.halfW[hit.i];
      if (Math.abs(hit.d) > half + PHYS.curbWidth) continue;
      // the arena's cover is solid by design (BuiltTrack.blocks): props inside a block are the block
      if (t.blocks.some((k) => Math.hypot(x - k.x, z - k.z) <= k.r + 0.6)) continue;
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
            const wall = Math.min(d > 0 ? t.wallR[i] : t.wallL[i], outerWall(t, i)) + 0.5;
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
  [2, dressLaundry, ['laundry-props', 'laundry-lit']],
  [3, dressYarn, ['yarn-props']],
  [4, dressCafe, ['cafe-props', 'cafe-lit']],
  [5, dressShelter, ['shelter-props']],
  [6, dressRug, ['rug-props']],
];

describe('track dressing', () => {
  for (const [theme, dress, names] of CASES) {
    const def = ALL_TRACKS.find((d) => d.theme === theme);
    if (!def) continue;
    it(`${def.name}: no prop pokes through the road (the banked hairpin once hid the kart behind a slab)`, { timeout: 60_000 }, () => {
      const t = buildTrack(def);
      expect(poking(t, dress(t, themeOf(theme)), names)).toBe(0);
    });
    if (def.kind === 'arena') continue; // the arena's floor is all road; its cover is checked by the test above
    it(`${def.name}: every prop stays outside the walls (wall + 0.5 m) of every part of the loop (B14)`, { timeout: 60_000 }, () => {
      const t = buildTrack(def);
      expect(insideWalls(t, dress(t, themeOf(theme)), names)).toEqual([]);
    });
  }

  it('every theme stays within the draw-call budget: at most 8 meshes per dressing (≤ 40 per track with the road)', { timeout: 60_000 }, () => {
    for (const [theme, dress] of CASES) {
      const def = ALL_TRACKS.find((d) => d.theme === theme)!;
      const t = buildTrack(def);
      let meshes = 0;
      let tris = 0;
      dress(t, themeOf(theme)).traverse((o) => {
        const m = o as Mesh;
        if (!m.isMesh) return;
        meshes++;
        tris += m.geometry.getAttribute('position').count / 3;
      });
      expect(meshes, def.id).toBeLessThanOrEqual(8);
      expect(tris, def.id).toBeLessThan(110_000);
    }
  });
});
