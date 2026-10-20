import { it } from 'vitest';
import type { Mesh } from 'three';
import { LAUNDRY as L2 } from '../core/track/tracks/laundry';
import { LAUNDRY_HEAD } from './laundry-head';
const LAUNDRY = process.env.HEAD ? LAUNDRY_HEAD : L2;
import { buildTrack } from '../core/track/build';
import { themeOf } from '../core/track/themes';
import { dressLaundry } from '../core/track/dressing/laundry';
import { queryTrack, type TrackHit } from '../core/track/query';
import { Surface } from '../types';

it('poke timing', { timeout: 200_000 }, () => {
  const t = buildTrack(LAUNDRY);
  let t0 = performance.now();
  const g = dressLaundry(t, themeOf(2));
  console.log('dress ms', (performance.now() - t0).toFixed(0));
  const mesh = g.getObjectByName('laundry-props') as Mesh;
  const pos = mesh.geometry.getAttribute('position');
  console.log('verts', pos.count);
  const hit: TrackHit = { i: 0, s: 0, d: 0, y: 0, surface: Surface.Road };
  t0 = performance.now();
  let slow = 0;
  const buckets = new Map<string, number>();
  for (let v = 0; v < pos.count; v += 7) {
    const a = performance.now();
    queryTrack(t, pos.getX(v), pos.getZ(v), -1, hit, pos.getY(v));
    const dt = performance.now() - a;
    if (dt > 0.5) {
      slow++;
      const key = `${Math.round(pos.getX(v) / 20) * 20},${Math.round(pos.getZ(v) / 20) * 20}`;
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
  }
  console.log('query ms (1/7)', (performance.now() - t0).toFixed(0), 'slow', slow, [...buckets.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10));
});
