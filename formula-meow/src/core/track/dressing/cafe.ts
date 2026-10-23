/**
 * Cat Café Chaos dressing (props only, a lazy chunk): a cat café after closing time. Plank floor; tables and chairs
 * (round the table slalom and everywhere off the road); fairy-light strings over the road (glowing bulbs); the
 * counter with its espresso machine beside the kitchen pass; bookshelves, cat trees,
 * cushions and pendant lamps; a big window wall with the night city outside; the neon café sign. One merged toon mesh,
 * one glow mesh and a few canvas signs. The set pieces' looks (koi pond, cat tree, coffee cup, mug) are skins in
 * src/tracks/skins/b.ts.
 */
import { DoubleSide, Group, Mesh, MeshBasicMaterial } from 'three';
import type { BuiltTrack } from '../build';
import { inWindow } from '../branch';
import type { Theme } from '../themes';
import { GeoBuilder, hash01 } from '../../render/geo';
import { toonMaterial } from '../../render/toon';
import { TriBuilder } from '../mesh';
import { t as tr } from '../../../ui/i18n';
import { branchSigns, clearance, glowQuad, scatter, sign, startGantry } from './common';

const WOOD = [0x8a5a3c, 0x7a4e34, 0x956448];
const BULBS = [0xffc93c, 0xff8fb1, 0x9ff5ff, 0xfff3dc];
const ROOM = 160;

export function dressCafe(t: BuiltTrack, theme: Theme): Group {
  const group = new Group();
  group.name = 'dressing-cafe';
  const g = new GeoBuilder();
  const glow = new TriBuilder();

  // plank floor
  for (let x = -ROOM; x < ROOM; x += 6) g.quad(5.85, 2 * ROOM, WOOD[(x / 6 + 100) % 3 | 0], { x: x + 3, y: -0.05, z: 0 }, { vary: 0.01 });

  // walls: three plain, one a big window onto the night city
  g.boxUp(2 * ROOM, 36, 2, 0x4d3660, { x: 0, y: 0, z: -ROOM });
  g.boxUp(2, 36, 2 * ROOM, 0x4d3660, { x: -ROOM, y: 0, z: 0 });
  g.boxUp(2, 36, 2 * ROOM, 0x4d3660, { x: ROOM, y: 0, z: 0 });
  g.boxUp(2 * ROOM, 6, 2, 0x3b2a4a, { x: 0, y: 0, z: ROOM });
  g.boxUp(2 * ROOM, 4, 2, 0x3b2a4a, { x: 0, y: 32, z: ROOM });
  for (let x = -ROOM; x <= ROOM; x += 20) g.boxUp(1.2, 26, 1.2, 0x3b2a4a, { x, y: 6, z: ROOM });
  // the city outside: lit windows on dark towers
  for (let k = 0; k < 24; k++) {
    const x = -ROOM + 10 + k * 13.5;
    const h = 30 + hash01(k * 5) * 50;
    g.boxUp(11, h, 10, 0x1a1238, { x, y: -20, z: ROOM + 40 + hash01(k) * 30 });
    for (let y = -14; y < h - 24; y += 5) if (hash01(k * 31 + y) > 0.45) glowQuad(glow, x, y, ROOM + 34.9 + hash01(k) * 30, Math.PI, 2, 1.6, BULBS[(k + y) & 3]);
  }

  // café tables and chairs wherever there is room, closer to the road than anything else
  const spots = scatter(t, 83, 80, 6.5, 8, 150);
  spots.forEach((s, n) => {
    if (n % 6 === 5) {
      // a cat tree
      g.cylUp(0.6, 0.6, 9, 8, 0xd9b48a, { x: s.x, y: 0, z: s.z });
      for (let k = 0; k < 3; k++) g.cylUp(2.2 - k * 0.3, 2.2 - k * 0.3, 0.4, 10, 0xff8fb1, { x: s.x + (k - 1) * 0.6, y: 2.6 + k * 3, z: s.z });
      g.sphere(1.4, 0xfff3dc, { x: s.x, y: 10, z: s.z, sy: 0.7 }, undefined, 8, 5);
      return;
    }
    if (n % 6 === 4) {
      // a floor cushion
      g.cylUp(2.4, 2.6, 1, 10, [0xff8fb1, 0xffc93c, 0x9fd3ff][n % 3], { x: s.x, y: 0, z: s.z });
      g.sphere(0.7, 0xfff3dc, { x: s.x + 0.6, y: 1.3, z: s.z }, undefined, 6, 4);
      return;
    }
    // table: pedestal, round top, a cup, two chairs
    g.cylUp(0.4, 0.9, 3.4, 8, 0x2a1a22, { x: s.x, y: 0, z: s.z });
    g.cylUp(2.6, 2.6, 0.3, 14, WOOD[n % 3], { x: s.x, y: 3.4, z: s.z });
    g.cylUp(0.45, 0.35, 0.8, 8, 0xfff3dc, { x: s.x + 0.8, y: 3.7, z: s.z + 0.4 });
    for (const a of [s.r, s.r + Math.PI]) {
      const cx = s.x + Math.cos(a) * 3.6;
      const cz = s.z + Math.sin(a) * 3.6;
      g.boxUp(2, 0.3, 2, 0xffc93c, { x: cx, y: 2.2, z: cz, ry: -a });
      for (const [dx, dz] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) g.cylUp(0.12, 0.12, 2.2, 4, 0x2a1a22, { x: cx + dx, y: 0, z: cz + dz });
      g.boxUp(2, 2.4, 0.3, 0xffc93c, { x: cx + Math.cos(a) * 0.9, y: 2.5, z: cz + Math.sin(a) * 0.9, ry: -a + Math.PI / 2 });
    }
  });

  // the counter and the espresso machine beside the kitchen pass
  for (const b of t.branches) {
    const j = b.m >> 1;
    const rx = -b.tz[j];
    const rz = b.tx[j];
    // on the side away from the main road
    const side = (b.px[j] - t.px[b.mapI[j]]) * rx + (b.pz[j] - t.pz[b.mapI[j]]) * rz > 0 ? 1 : -1;
    const off = b.ownR[j] + 4;
    const x = b.px[j] + rx * off * side;
    const z = b.pz[j] + rz * off * side;
    const ry = Math.atan2(b.tx[j], b.tz[j]);
    // the counter runs 34 m along the pass: every part of it must be clear of both roads
    let clear = true;
    for (const u of [-17, -8, 0, 8, 17]) if (clearance(t, x + b.tx[j] * u, z + b.tz[j] * u) < 2.5) clear = false;
    if (clear) {
      g.boxUp(4, 5, 34, 0x6b4430, { x, y: 0, z, ry });
      g.boxUp(4.6, 0.4, 35, 0xfff3dc, { x, y: 5, z, ry });
      g.boxUp(2.6, 3, 3, 0xc0c6cc, { x, y: 5.4, z, ry });
      g.cylUp(0.5, 0.5, 1, 8, 0x2a1a22, { x: x + b.tx[j] * 1.2, y: 8.4, z: z + b.tz[j] * 1.2 });
    }
  }

  // fairy-light strings across the road every ~45 m: glowing bulbs on a sagging wire
  for (let i = 40; i < t.n; i += Math.round(45 / t.step)) {
    if (t.junction[i] || t.branches.some((b) => inWindow(t, b, i))) continue;
    const hw = Math.min(Math.max(t.wallL[i], t.wallR[i]), t.halfW[i] + 2) + 1;
    const rx = -t.tz[i];
    const rz = t.tx[i];
    const y = t.py[i] + 7;
    // both posts must stand clear of every road (another part of the loop, a branch)
    if (clearance(t, t.px[i] + rx * hw, t.pz[i] + rz * hw) < 0.3 || clearance(t, t.px[i] - rx * hw, t.pz[i] - rz * hw) < 0.3) continue;
    for (const s of [-1, 1]) g.cylUp(0.15, 0.15, 7.2, 5, 0x2a1a22, { x: t.px[i] + rx * hw * s, y: t.py[i], z: t.pz[i] + rz * hw * s });
    const bulbs = 12;
    for (let k = 0; k <= bulbs; k++) {
      const u = k / bulbs;
      const d = -hw + 2 * hw * u;
      const sag = Math.sin(u * Math.PI) * 1.2;
      glowQuad(glow, t.px[i] + rx * d, y - sag, t.pz[i] + rz * d, Math.atan2(t.tx[i], t.tz[i]), 0.35, 0.35, BULBS[k % BULBS.length]);
    }
  }

  // pendant lamps and bookshelves along the walls
  for (let k = -ROOM + 12; k < ROOM; k += 24) {
    g.boxUp(16, 22, 3, 0x6b4430, { x: k, y: 0, z: -ROOM + 2.6 });
    for (let s = 0; s < 4; s++) for (let b = 0; b < 6; b++) g.boxUp(1.6, 3.4 + hash01(k + s * 7 + b) * 1.4, 2, [0xff8fb1, 0x9fd3ff, 0xffc93c, 0x3bb273][(b + s) & 3], { x: k - 6 + b * 2.4, y: 1 + s * 5.2, z: -ROOM + 3 });
  }

  const big = sign([tr('sign.cafe')], 40, 7, 0, 25, -ROOM + 4.5, 0, { bg: '#150d2a', fg: '#ffc93c', glow: '#ff8fb1' });
  if (big) group.add(big);
  const menu = sign([tr('sign.cafeMenu')], 30, 3.4, -ROOM + 3, 18, 0, Math.PI / 2, { bg: '#2a1a22', fg: '#fff3dc' });
  if (menu) group.add(menu);
  branchSigns(t, g, theme, group, (b) => tr(b.label));
  startGantry(t, g, theme, group);

  const mesh = new Mesh(g.build(), toonMaterial({ vertexColors: true, side: DoubleSide }));
  mesh.name = 'cafe-props';
  mesh.receiveShadow = true;
  group.add(mesh);
  const lit = new Mesh(glow.build(), new MeshBasicMaterial({ vertexColors: true, side: DoubleSide, toneMapped: false }));
  lit.name = 'cafe-lit';
  group.add(lit);
  return group;
}
