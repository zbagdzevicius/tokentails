/**
 * Pink Paw Shelter Sprint dressing (props only, a lazy chunk): a cosy, generic cat shelter. Soft floor; cat trees and
 * scratching posts down the hallway; food bowls and water fountains in the feeding corner; beds and blankets in the
 * nap room; balls, a tunnel and feather wands in the play room (the branch); an "Adopt, don't shop"
 * banner and the Pink Paw sign. No numbers and no claims anywhere (ITERATION-2.md rules).
 */
import { DoubleSide, Group, Mesh } from 'three';
import type { BuiltTrack } from '../build';
import type { Theme } from '../themes';
import { GeoBuilder, hash01 } from '../../render/geo';
import { toonMaterial } from '../../render/toon';
import { t as tr } from '../../../ui/i18n';
import { branchSigns, clearance, scatter, sign, startGantry } from './common';

const SOFT = [0xff8fb1, 0xffc93c, 0x9fd3ff, 0xbfe8c8, 0xc9b6ff];
const ROOM = 160;

export function dressShelter(t: BuiltTrack, theme: Theme): Group {
  const group = new Group();
  group.name = 'dressing-shelter';
  const g = new GeoBuilder();

  // soft floor: big pastel squares
  const tile = 20;
  for (let x = -ROOM; x < ROOM; x += tile)
    for (let z = -ROOM; z < ROOM; z += tile) g.quad(tile - 0.3, tile - 0.3, ((x + z) / tile) % 2 === 0 ? theme.ground : theme.groundB, { x: x + tile / 2, y: -0.05, z: z + tile / 2 }, { vary: 0.008 });

  // walls with a skirting band and paw-print rows
  for (const [x, z, ry] of [
    [0, -ROOM, 0],
    [0, ROOM, Math.PI],
    [-ROOM, 0, Math.PI / 2],
    [ROOM, 0, -Math.PI / 2],
  ] as const) {
    g.boxUp(2 * ROOM, 30, 2, 0xfff4f8, { x, y: 0, z, ry });
    g.boxUp(2 * ROOM, 2.5, 2.4, 0xff8fb1, { x, y: 0, z, ry });
    const fx = Math.sin(ry);
    const fz = Math.cos(ry);
    const ax = Math.cos(ry);
    const az = -Math.sin(ry);
    for (let k = -ROOM + 10; k < ROOM; k += 14) {
      const px = x + ax * k + fx * 1.2;
      const pz = z + az * k + fz * 1.2;
      const y = 14 + (Math.round(k / 14) % 2) * 3;
      g.cyl(1.2, 1.2, 0.2, 10, 0xffc0d6, { x: px, y, z: pz, rx: Math.PI / 2, ry }, { vary: 0 });
      for (let p = 0; p < 4; p++) g.cyl(0.45, 0.45, 0.2, 8, 0xffc0d6, { x: px + ax * (p - 1.5) * 0.9, y: y + 1.6 + (p === 0 || p === 3 ? -0.3 : 0), z: pz + az * (p - 1.5) * 0.9, rx: Math.PI / 2, ry }, { vary: 0 });
    }
  }

  // shelter furniture all round
  const spots = scatter(t, 97, 75, 4.5, 8, 150);
  spots.forEach((s, n) => {
    const c = SOFT[n % SOFT.length];
    switch (n % 6) {
      case 0: // cat tree: posts wound with rope, platforms, a hidey box
        g.cylUp(0.7, 0.7, 10, 8, 0xd9b48a, { x: s.x, y: 0, z: s.z });
        g.cylUp(0.7, 0.7, 6, 8, 0xd9b48a, { x: s.x + 3, y: 0, z: s.z + 1 });
        for (let k = 0; k < 6; k++) g.torus(0.75, 0.12, 0xb8935f, { x: s.x, y: 1 + k * 1.3, z: s.z, rx: Math.PI / 2 }, { vary: 0 }, 4, 8);
        g.boxUp(4.6, 0.5, 4.6, c, { x: s.x + 1.5, y: 6, z: s.z + 0.5, ry: s.r });
        g.boxUp(3, 2.6, 3, c, { x: s.x, y: 10, z: s.z, ry: s.r });
        g.cyl(0.9, 0.9, 0.2, 10, 0x2a1a22, { x: s.x + Math.cos(s.r) * 1.52, y: 11.2, z: s.z - Math.sin(s.r) * 1.52, rx: Math.PI / 2, ry: s.r + Math.PI / 2 }, { vary: 0 });
        break;
      case 1: // food bowls, a water fountain
        g.cylUp(1.6, 1.1, 0.8, 12, c, { x: s.x, y: 0, z: s.z });
        g.cylUp(1.3, 1.3, 0.82, 12, 0x8a5a3c, { x: s.x, y: 0.01, z: s.z });
        g.cylUp(1.6, 1.1, 0.8, 12, 0x9fd3ff, { x: s.x + 3.6, y: 0, z: s.z + 0.6 });
        g.cylUp(1.3, 1.3, 0.82, 12, 0x7fd3ff, { x: s.x + 3.6, y: 0.01, z: s.z + 0.6 });
        break;
      case 2: // a round bed with a blanket
        g.cylUp(3, 3.2, 1.3, 14, c, { x: s.x, y: 0, z: s.z });
        g.cylUp(2.4, 2.4, 1.35, 14, 0xfff3dc, { x: s.x, y: 0.01, z: s.z });
        g.torus(2.8, 0.55, c, { x: s.x, y: 1.3, z: s.z, rx: Math.PI / 2 }, { vary: 0 }, 5, 14);
        break;
      case 3: // scratching post
        g.boxUp(3, 0.4, 3, 0xd9b48a, { x: s.x, y: 0, z: s.z, ry: s.r });
        g.cylUp(0.6, 0.6, 6, 8, 0xc9a06a, { x: s.x, y: 0.4, z: s.z });
        g.sphere(0.6, c, { x: s.x + 0.9, y: 5, z: s.z }, { vary: 0 }, 6, 4);
        break;
      case 4: // toy balls
        for (let k = 0; k < 3; k++) g.sphere(0.8 + hash01(n + k) * 0.6, SOFT[(n + k) % SOFT.length], { x: s.x + Math.cos(k * 2.1) * 2, y: 0.9, z: s.z + Math.sin(k * 2.1) * 2 }, undefined, 8, 6);
        break;
      default: // a stack of blankets
        for (let k = 0; k < 4; k++) g.boxUp(4, 0.6, 3, SOFT[(n + k) % SOFT.length], { x: s.x, y: k * 0.62, z: s.z, ry: s.r + k * 0.07 });
        break;
    }
  });

  // the play room: toys strewn beside the branch (a tunnel, balls, a feather wand)
  for (const b of t.branches) {
    for (let j = Math.round(b.m * 0.2); j < b.m * 0.8; j += Math.round(10 / b.step)) {
      for (const side of [-1, 1]) {
        const off = (side > 0 ? b.ownR[j] : b.ownL[j]) + 4;
        const x = b.px[j] - b.tz[j] * off * side;
        const z = b.pz[j] + b.tx[j] * off * side;
        if (clearance(t, x, z) < 1) continue;
        const k = (j + side) & 3;
        if (k === 0) g.torus(1.6, 0.9, 0xc9b6ff, { x, y: 1.6, z, ry: Math.atan2(b.tx[j], b.tz[j]) }, undefined, 6, 12);
        else if (k === 1) g.sphere(1.1, SOFT[j % SOFT.length], { x, y: 1.1, z }, undefined, 8, 6);
        else if (k === 2) {
          g.cyl(0.08, 0.08, 6, 4, 0x8a5a3c, { x, y: 3, z, rz: 0.5 });
          g.sphere(0.6, 0xff8fb1, { x: x + 1.4, y: 5.6, z, sx: 0.5, sy: 1.6 }, { vary: 0 }, 6, 4);
        } else g.boxUp(2.4, 2.4, 2.4, 0xd9b48a, { x, y: 0, z, ry: j });
      }
    }
  }

  // the banners
  const banner = sign([tr('sign.adopt')], 46, 6, 0, 22, -ROOM + 1.5, 0, { bg: '#ff8fb1', fg: '#ffffff' });
  if (banner) group.add(banner);
  const pp = sign([tr('sign.shelter')], 30, 6, ROOM - 1.5, 22, 0, -Math.PI / 2, { bg: '#ffffff', fg: '#ff3ea5' });
  if (pp) group.add(pp);
  branchSigns(t, g, theme, group, (b) => tr(b.label));
  startGantry(t, g, theme, group);

  const mesh = new Mesh(g.build(), toonMaterial({ vertexColors: true, side: DoubleSide }));
  mesh.name = 'shelter-props';
  mesh.receiveShadow = true;
  group.add(mesh);
  return group;
}
