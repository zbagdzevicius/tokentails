/**
 * Kitchen Counter GP dressing (props only, no gameplay): a tiled counter top, a backsplash with cabinets around the
 * edge, giant mugs, fruit, shakers, a toaster by the hairpin, a cutting board under the raised section, and the sink
 * basin beside the splash zone. One merged toon mesh plus the start banner.
 */
import { DoubleSide, Group, Mesh } from 'three';
import type { BuiltTrack } from '../build';
import type { Theme } from '../themes';
import { GeoBuilder, hash01 } from '../../render/geo';
import { toonMaterial } from '../../render/toon';
import { scatter, startGantry } from './common';

const MUGS = [0xf25c3b, 0x3bb273, 0x3aa8ff, 0xffc93c, 0xfff3dc];

export function dressKitchen(t: BuiltTrack, theme: Theme): Group {
  const group = new Group();
  group.name = 'dressing-kitchen';
  const g = new GeoBuilder();

  // counter top: big tiles
  const tile = 16;
  for (let x = -256; x < 256; x += tile)
    for (let z = -256; z < 256; z += tile) {
      const odd = ((x + z) / tile) % 2 === 0;
      g.quad(tile - 0.3, tile - 0.3, odd ? theme.ground : theme.groundB, { x: x + tile / 2, y: -0.06, z: z + tile / 2 }, { vary: 0.01 });
    }

  // backsplash walls with tiles and cabinets on three sides, a window on the fourth
  const R = 175;
  for (const [x, z, ry] of [
    [0, -R, 0],
    [-R, 0, Math.PI / 2],
    [R, 0, Math.PI / 2],
  ] as const) {
    g.boxUp(2 * R, 40, 2, 0xfff4e4, { x, y: 0, z, ry });
    for (let k = -R + 8; k < R; k += 16) {
      const ox = ry ? 0 : k;
      const oz = ry ? k : 0;
      g.boxUp(14, 16, 6, 0xf7e8cf, { x: x + ox, y: 30, z: z + oz, ry });
      g.box(1.2, 4, 0.6, 0x8d6e63, { x: x + ox + (ry ? (x > 0 ? -3.2 : 3.2) : 0), y: 34, z: z + oz + (ry ? 0 : 3.2), ry });
    }
  }
  // window wall
  g.boxUp(2 * R, 10, 2, 0xfff4e4, { x: 0, y: 0, z: R });
  g.boxUp(2 * R, 8, 2, 0xfff4e4, { x: 0, y: 32, z: R });

  // cutting board under the raised section (track height > 1 m): wooden slabs along it
  for (let i = 0; i < t.n; i += 16) {
    if (t.py[i] < 1) continue;
    const ry = Math.atan2(t.tx[i], t.tz[i]);
    const w = (Math.max(t.wallL[i], t.wallR[i]) + 1.2) * 2;
    g.boxUp(w, t.py[i] - 0.15, 8.6, 0xc58a5c, { x: t.px[i], y: 0, z: t.pz[i], ry }, { vary: 0.05 });
  }

  // sink basin by the splash zone
  {
    let first = -1;
    for (let i = 0; i < t.n; i++) if (t.lowgrip[i]) {
      first = i;
      break;
    }
    if (first >= 0) {
      const i = first + 30;
      const side = 1;
      const off = t.wallR[i] + 9;
      const x = t.px[i] - t.tz[i] * off * side;
      const z = t.pz[i] + t.tx[i] * off * side;
      g.cylUp(7, 7, 0.8, 20, 0xd7dde3, { x, y: 0, z });
      g.cylUp(6, 6, 0.85, 20, 0x7fd3ff, { x, y: 0.01, z });
      g.cylUp(0.5, 0.5, 6, 8, 0xe5e9ee, { x: x + 7, y: 0, z });
      g.cyl(0.4, 0.4, 5, 8, 0xe5e9ee, { x: x + 4.6, y: 6, z, rz: Math.PI / 2 });
    }
  }

  // scattered giant props
  const spots = scatter(t, 11, 46, 7, 24, 150);
  spots.forEach((s, n) => {
    const kind = n % 6;
    const c = MUGS[n % MUGS.length];
    switch (kind) {
      case 0: // mug
        g.cylUp(3.2, 2.9, 6.5, 14, c, { x: s.x, y: 0, z: s.z });
        g.cylUp(2.7, 2.7, 0.2, 14, 0x6b3a2a, { x: s.x, y: 6.2, z: s.z });
        g.torus(1.8, 0.45, c, { x: s.x + Math.cos(s.r) * 3.4, y: 3.4, z: s.z + Math.sin(s.r) * 3.4, ry: -s.r }, undefined, 6, 12);
        break;
      case 1: // apple
        g.sphere(3, 0xe23b3b, { x: s.x, y: 2.7, z: s.z, sy: 0.92 }, undefined, 10, 8);
        g.cylUp(0.18, 0.22, 1.4, 5, 0x6b3a2a, { x: s.x, y: 5.3, z: s.z });
        g.sphere(0.8, 0x3bb273, { x: s.x + 0.7, y: 6, z: s.z, sx: 1.6, sy: 0.4 }, undefined, 6, 4);
        break;
      case 2: // orange
        g.sphere(2.6, 0xff9a3d, { x: s.x, y: 2.5, z: s.z }, undefined, 10, 8);
        break;
      case 3: // shakers
        g.cylUp(1.3, 1.5, 5, 10, 0xfffaf2, { x: s.x, y: 0, z: s.z });
        g.sphere(1.3, 0xc0c6cc, { x: s.x, y: 5, z: s.z, sy: 0.6 }, undefined, 10, 6);
        g.cylUp(1.3, 1.5, 5, 10, 0x4a4850, { x: s.x + 3.4, y: 0, z: s.z + 0.8 });
        g.sphere(1.3, 0xc0c6cc, { x: s.x + 3.4, y: 5, z: s.z + 0.8, sy: 0.6 }, undefined, 10, 6);
        break;
      case 4: // plate stack
        for (let k = 0; k < 4; k++) g.cylUp(4.6 - k * 0.05, 4.2, 0.35, 18, k % 2 ? 0xfffaf2 : 0xbfe3d6, { x: s.x, y: k * 0.36, z: s.z });
        break;
      default: // toaster
        g.boxUp(6, 4.5, 3.6, 0xe5e9ee, { x: s.x, y: 0, z: s.z, ry: s.r });
        g.box(4.2, 0.2, 0.6, 0x2a1a22, { x: s.x, y: 4.55, z: s.z, ry: s.r });
        g.box(0.6, 1.2, 0.6, 0x2a1a22, { x: s.x + Math.cos(s.r) * 3.2, y: 2.6, z: s.z - Math.sin(s.r) * 3.2, ry: s.r });
        break;
    }
    if (hash01(n * 97) > 0.7) g.sphere(1.2, 0xffc93c, { x: s.x + 4, y: 1.1, z: s.z - 3 }, undefined, 8, 6); // a lemon
  });

  startGantry(t, g, theme, group);
  const mesh = new Mesh(g.build(), toonMaterial({ vertexColors: true, side: DoubleSide }));
  mesh.name = 'kitchen-props';
  mesh.receiveShadow = true;
  group.add(mesh);
  return group;
}
