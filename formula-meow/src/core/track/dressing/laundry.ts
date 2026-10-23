/**
 * Laundry Spin dressing (props only, a lazy chunk): a pastel laundromat. Checker floor tiles; walls of front-loading
 * washers and stacked dryers round the room; the folding table under the high road; sorting baskets, detergent
 * bottles and sock mounds on the floor; a big neon sign over the dryers. One merged toon mesh, one glow mesh (machine
 * displays, the sign's tube) and a few canvas signs.
 */
import { DoubleSide, Group, Mesh, MeshBasicMaterial } from 'three';
import type { BuiltTrack } from '../build';
import type { Theme } from '../themes';
import { GeoBuilder, hash01 } from '../../render/geo';
import { toonMaterial } from '../../render/toon';
import { TriBuilder } from '../mesh';
import { t as tr } from '../../../ui/i18n';
import { branchSigns, glowQuad, scatter, sign, startGantry } from './common';
import { outerWall } from '../build';
import { inWindow } from '../branch';

const PASTEL = [0xff8fb1, 0x9fd3ff, 0xbfe8c8, 0xffe08a, 0xc9b6ff];
const BASKET = [0x9fd3ff, 0xff8fb1, 0xffe08a];
const ROOM = 160;

export function dressLaundry(t: BuiltTrack, theme: Theme): Group {
  const group = new Group();
  group.name = 'dressing-laundry';
  const g = new GeoBuilder();
  const glow = new TriBuilder();

  // floor: big pastel checker tiles
  const tile = 16;
  for (let x = -ROOM; x < ROOM; x += tile)
    for (let z = -ROOM; z < ROOM; z += tile) {
      const odd = ((x + z) / tile) % 2 === 0;
      g.quad(tile - 0.25, tile - 0.25, odd ? theme.ground : theme.groundB, { x: x + tile / 2, y: -0.05, z: z + tile / 2 }, { vary: 0.008 });
    }

  // the room: walls with a row of washers along the bottom and dryers stacked above them
  for (const [x, z, ry] of [
    [0, -ROOM, 0],
    [0, ROOM, Math.PI],
    [-ROOM, 0, Math.PI / 2],
    [ROOM, 0, -Math.PI / 2],
  ] as const) {
    g.boxUp(2 * ROOM, 34, 2, 0xf3eefb, { x, y: 0, z, ry });
    g.boxUp(2 * ROOM, 3, 2.4, 0xc7cfe0, { x, y: 0, z, ry });
    const fx = Math.sin(ry);
    const fz = Math.cos(ry);
    const ax = Math.cos(ry);
    const az = -Math.sin(ry);
    for (let k = -ROOM + 9; k < ROOM - 6; k += 10) {
      for (let level = 0; level < 2; level++) {
        const y = 3 + level * 10;
        const cx = x + ax * k + fx * 5;
        const cz = z + az * k + fz * 5;
        g.boxUp(9, 9.4, 8, level ? 0xfafbff : 0xe9eef7, { x: cx, y, z: cz, ry }, { vary: 0.01 });
        // round door: chrome ring and a tinted glass disc, facing the room
        const dx = cx + fx * 4.05;
        const dz = cz + fz * 4.05;
        g.torus(2.7, 0.35, 0xb7c0d4, { x: dx, y: y + 4.6, z: dz, ry }, { vary: 0 }, 6, 18);
        g.cyl(2.4, 2.4, 0.2, 16, level ? 0x6b7fa8 : 0x8fb7d8, { x: dx, y: y + 4.6, z: dz, rx: Math.PI / 2, ry }, { vary: 0 });
        // a sock tumbling behind the glass now and then
        if (hash01(k * 7 + level) > 0.6) g.sphere(0.7, PASTEL[(k + level) % PASTEL.length], { x: dx + fx * 0.15, y: y + 3.6, z: dz + fz * 0.15 }, { vary: 0 }, 6, 4);
        // the little display
        const px = dx + ax * 2.6 - fx * 0.0;
        const pz = dz + az * 2.6;
        glowQuad(glow, px + fx * 0.06, y + 8.2, pz + fz * 0.06, ry, 1.6, 0.6, (k / 10 + level) % 3 ? 0x7dffb5 : 0xff8fb1);
      }
    }
  }

  // the folding table under the high road; it ends at the folding-table jump (the gap is open down to the floor)
  tableDeck(t, g, 1.2, 0xe3c79f, 1.6);

  // floor clutter: baskets, detergent bottles, sock mounds, folded towel stacks
  const spots = scatter(t, 41, 70, 5, 12, 150);
  spots.forEach((s, n) => {
    const c = PASTEL[n % PASTEL.length];
    switch (n % 5) {
      case 0: // laundry basket with a heap of washing
        g.cylUp(3.4, 2.8, 3, 12, BASKET[n % BASKET.length], { x: s.x, y: 0, z: s.z });
        g.torus(3.4, 0.25, 0xffffff, { x: s.x, y: 3, z: s.z, rx: Math.PI / 2 }, { vary: 0 }, 4, 14);
        g.sphere(2.9, c, { x: s.x, y: 3, z: s.z, sy: 0.45 }, undefined, 9, 5);
        break;
      case 1: // detergent bottle
        g.boxUp(2.6, 5.4, 1.6, c, { x: s.x, y: 0, z: s.z, ry: s.r });
        g.cylUp(0.6, 0.6, 1, 8, 0xffffff, { x: s.x, y: 5.4, z: s.z });
        g.box(2.7, 1.6, 1.7, 0xffffff, { x: s.x, y: 2.6, z: s.z, ry: s.r }, { vary: 0 });
        break;
      case 2: // sock mound
        for (let k = 0; k < 6; k++) g.sphere(0.9 + hash01(n + k) * 0.6, PASTEL[(n + k) % PASTEL.length], { x: s.x + Math.cos(k * 1.1) * 1.4, y: 0.4 + (k % 2) * 0.6, z: s.z + Math.sin(k * 1.1) * 1.4, sx: 1.8, sy: 0.6 }, undefined, 7, 4);
        break;
      case 3: // folded towels
        for (let k = 0; k < 5; k++) g.boxUp(3.6, 0.7, 2.4, PASTEL[(n + k) % PASTEL.length], { x: s.x, y: k * 0.72, z: s.z, ry: s.r + k * 0.05 }, { vary: 0.02 });
        break;
      default: // a giant clothes peg
        g.boxUp(0.9, 6, 0.9, 0xf2d6b0, { x: s.x, y: 0, z: s.z, ry: s.r, rz: 0.12 });
        g.boxUp(0.9, 6, 0.9, 0xf2d6b0, { x: s.x + 0.8, y: 0, z: s.z, ry: s.r, rz: -0.12 });
        g.torus(0.6, 0.15, 0xb7c0d4, { x: s.x + 0.4, y: 2.4, z: s.z, ry: s.r }, { vary: 0 }, 4, 8);
        break;
    }
  });

  // the big sign over the far wall
  const sx = 0;
  const sz = -ROOM + 3;
  g.box(60, 9, 1, 0x2a2a44, { x: sx, y: 27, z: sz }, { vary: 0 });
  glowQuad(glow, sx, 31.8, sz + 0.6, 0, 58, 0.5, theme.pad);
  glowQuad(glow, sx, 22.2, sz + 0.6, 0, 58, 0.5, theme.pad);
  const big = sign([tr('sign.laundry')], 56, 6.4, sx, 27, sz + 0.6, 0, { bg: '#2a2a44', fg: '#ffd6e6', glow: '#ff8fb1' });
  if (big) group.add(big);
  const small = sign([tr('sign.laundryOpen')], 24, 3, 0, 19, ROOM - 3, Math.PI, { bg: '#fff3dc', fg: '#6b7fa8' });
  if (small) group.add(small);

  branchSigns(t, g, theme, group, (b) => tr(b.label));
  startGantry(t, g, theme, group);

  const mesh = new Mesh(g.build(), toonMaterial({ vertexColors: true, side: DoubleSide }));
  mesh.name = 'laundry-props';
  mesh.receiveShadow = true;
  group.add(mesh);
  if (!glow.empty) {
    const lit = new Mesh(glow.build(), new MeshBasicMaterial({ vertexColors: true, side: DoubleSide, toneMapped: false }));
    lit.name = 'laundry-lit';
    group.add(lit);
  }
  return group;
}

/**
 * The folding table under the high road (common.ts raisedDeck, plus the set pieces): no slab over a jump gap or its
 * lips, and each slab's top is the lowest road within its whole footprint (the run-up of a jump is flat, so a slab on
 * the tight bend before it would otherwise reach up through the inside of the bend).
 */
function tableDeck(t: BuiltTrack, g: GeoBuilder, minY: number, color: number, inset: number): void {
  const slab = 8.6;
  const reach = Math.ceil(slab / 2 / t.step);
  const stride = Math.round(slab / t.step);
  for (let i = 0; i < t.n; i += stride) {
    if (t.branches.some((b) => inWindow(t, b, i)) || t.voidMask[i]) continue;
    const w = (outerWall(t, i) + inset) * 2;
    let low = Infinity;
    let gap = false;
    const wide = reach + Math.ceil(w / 2 / t.step);
    for (let k = -wide; k <= wide; k++) {
      const j = (i + k + t.n) % t.n;
      if (Math.abs(k) <= reach + 2 && t.gapMask[j]) gap = true;
      low = Math.min(low, t.py[j] - (w / 2) * Math.abs(t.bank[j]));
    }
    if (gap || low < minY) continue;
    g.boxUp(w, low - 0.15, slab + 0.2, color, { x: t.px[i], y: 0, z: t.pz[i], ry: Math.atan2(t.tx[i], t.tz[i]) }, { vary: 0.03 });
  }
}
