/**
 * Kaunas Neon Rooftops dressing (props only): the road runs over a chain of buildings (alleys between them), a
 * skyline ring with lit windows, chimneys, antennas and water tanks, laundry-line bunting, a neon billboard at the
 * corner cut, stars, and the Pink Paw garage with its neon sign on the bottom straight (GDD 6.1, 13). Text only:
 * the sign reads "PINK PAW · Rožinė pėdutė" (no logo asset needed).
 */
import { DoubleSide, Group, Mesh, MeshBasicMaterial } from 'three';
import type { BuiltTrack } from '../build';
import type { Theme } from '../themes';
import { GeoBuilder, hash01 } from '../../render/geo';
import { toonMaterial } from '../../render/toon';
import { TriBuilder } from '../mesh';
import { clearance, scatter, sign, startGantry, stars } from './common';

const BUILDING = [0x2c2350, 0x352a5e, 0x3d2f66, 0x2a2048, 0x40336e];
const WINDOW = [0xffd27a, 0xff9fd0, 0x9ff5ff, 0xfff3dc];
export const ROOF_GROUND = -38;

export function dressRooftops(t: BuiltTrack, theme: Theme): Group {
  const group = new Group();
  group.name = 'dressing-rooftops';
  const g = new GeoBuilder();
  const lit = new TriBuilder();

  // buildings under the road: one block per ~22 m, alleys between them
  const block = Math.round(22 / t.step);
  const gap = Math.round(2.5 / t.step);
  for (let i0 = 0; i0 < t.n; i0 += block + gap) {
    const mid = (i0 + Math.floor(block / 2)) % t.n;
    // the box is straight while the road bends: take the lowest road over a wider stretch, so no corner of the roof
    // pokes up through a lower part of the bend (B14)
    let minY = Infinity;
    for (let k = -block; k < 2 * block; k++) minY = Math.min(minY, t.py[(i0 + k + t.n) % t.n] - 1.2);
    const ry = Math.atan2(t.tx[mid], t.tz[mid]);
    const w = (Math.max(t.wallL[mid], t.wallR[mid]) + 2.4) * 2;
    const len = block * t.step + 1.5;
    const h = minY - ROOF_GROUND;
    const col = BUILDING[(i0 / block) % BUILDING.length | 0];
    g.boxUp(w, h, len, col, { x: t.px[mid], y: ROOF_GROUND, z: t.pz[mid], ry }, { vary: 0.02 });
    windows(lit, t.px[mid], t.pz[mid], ry, w, len, ROOF_GROUND + 4, minY - 2, i0);
  }

  // skyline ring
  for (let n = 0; n < 90; n++) {
    const a = (n / 90) * Math.PI * 2 + hash01(n) * 0.05;
    const r = 175 + hash01(n * 3) * 110;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const w = 14 + hash01(n * 5) * 18;
    const d = 14 + hash01(n * 7) * 18;
    const top = 4 + hash01(n * 11) * 46;
    const ry = -a;
    g.boxUp(w, top - ROOF_GROUND, d, BUILDING[n % BUILDING.length], { x, y: ROOF_GROUND, z, ry });
    windows(lit, x, z, ry, w, d, ROOF_GROUND + 6, top - 2, n + 1000);
    if (hash01(n * 13) > 0.6) g.cylUp(0.25, 0.25, 9, 5, 0x6b5f8a, { x, y: top, z }); // antenna
    if (hash01(n * 17) > 0.85) neonBar(lit, x, top + 0.5, z, ry, w * 0.8, n % 2 ? theme.neonA : theme.neonB);
  }

  // rooftop clutter beside the road
  const spots = scatter(t, 23, 40, 5, 10, 130);
  spots.forEach((s, n) => {
    const i = nearestY(t, s.x, s.z);
    if (clearance(t, s.x, s.z) > 14) return; // only on the rooftops next to the road
    const y = i;
    switch (n % 4) {
      case 0: // chimney
        g.boxUp(2.2, 4.5, 2.2, 0x8a4a5a, { x: s.x, y: y - 1, z: s.z, ry: s.r });
        g.boxUp(2.8, 0.5, 2.8, 0x5a3a4a, { x: s.x, y: y + 3.5, z: s.z, ry: s.r });
        break;
      case 1: // water tank
        g.cylUp(2.4, 2.4, 4, 10, 0x6b5f8a, { x: s.x, y: y + 2, z: s.z });
        g.cone(2.7, 1.6, 10, 0x4a3f6b, { x: s.x, y: y + 6.8, z: s.z });
        for (const [dx, dz] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) g.cylUp(0.15, 0.15, 3, 4, 0x2a2240, { x: s.x + dx, y: y - 1, z: s.z + dz });
        break;
      case 2: // AC units
        g.boxUp(3, 1.6, 2, 0xbfb8d6, { x: s.x, y: y - 1, z: s.z, ry: s.r });
        g.cyl(0.7, 0.7, 0.2, 10, 0x2a2240, { x: s.x, y: y + 0, z: s.z, rx: Math.PI / 2, ry: s.r });
        break;
      default: // antenna mast with a blinking-red tip (static red)
        g.cylUp(0.18, 0.25, 10, 5, 0x9a92b8, { x: s.x, y: y - 1, z: s.z });
        g.sphere(0.45, 0xff3e5a, { x: s.x, y: y + 9.2, z: s.z }, { vary: 0 }, 6, 4);
        break;
    }
  });

  // laundry-line bunting across the road every ~90 m
  for (let i = 30; i < t.n; i += Math.round(90 / t.step)) {
    const hw = Math.max(t.wallL[i], t.wallR[i]) + 0.8;
    const rx = -t.tz[i];
    const rz = t.tx[i];
    const y = t.py[i] + 6.5;
    for (const s of [-1, 1]) g.cylUp(0.12, 0.12, 6.6, 5, 0x9a92b8, { x: t.px[i] + rx * hw * s, y: t.py[i], z: t.pz[i] + rz * hw * s });
    const flags = 9;
    for (let f = 0; f < flags; f++) {
      const u = (f + 0.5) / flags;
      const d = -hw + 2 * hw * u;
      const sag = Math.sin(u * Math.PI) * 0.9;
      const col = [theme.neonA, theme.neonB, 0xffd27a][f % 3];
      lit.tri(
        t.px[i] + rx * (d - 0.4), y - sag, t.pz[i] + rz * (d - 0.4),
        t.px[i] + rx * (d + 0.4), y - sag, t.pz[i] + rz * (d + 0.4),
        t.px[i] + rx * d, y - sag - 0.9, t.pz[i] + rz * d,
        col,
      );
    }
  }

  // billboard at the off-road corner cut
  const cut = t.features.find((f) => f.kind === 'offroad' || f.kind === 'shortcut');
  if (cut) {
    const i = (cut.i + Math.round(23 / t.step)) % t.n;
    const side = cut.side === 0 ? -1 : cut.side;
    // clear of the widest wall nearby (the off-road cut pushes the wall out; B14: props stay outside every wall)
    let wmax = 0;
    for (let k = -80; k <= 80; k++) {
      const j = (i + k + t.n) % t.n;
      wmax = Math.max(wmax, side > 0 ? t.wallR[j] : t.wallL[j]);
    }
    const off = wmax + 6; // the poles stand 5 m either side along a bend
    const x = t.px[i] - t.tz[i] * off * side;
    const z = t.pz[i] + t.tx[i] * off * side;
    const ry = Math.atan2(t.tx[i], t.tz[i]) + Math.PI / 2;
    for (const k of [-1, 1]) g.cylUp(0.3, 0.3, 9, 6, 0x6b5f8a, { x: x + Math.cos(ry) * 5 * k, y: t.py[i], z: z - Math.sin(ry) * 5 * k });
    const s = sign(['MEOW', 'FASTER'], 12, 5, x, t.py[i] + 11.5, z, ry, { bg: '#1a1238', fg: '#2cf6f3', glow: '#2cf6f3' });
    if (s) group.add(s);
    neonBar(lit, x, t.py[i] + 14.2, z, ry, 12.4, theme.neonA);
    neonBar(lit, x, t.py[i] + 8.8, z, ry, 12.4, theme.neonA);
  }

  pinkPawGarage(t, g, lit, group);
  startGantry(t, g, theme, group);

  const mesh = new Mesh(g.build(), toonMaterial({ vertexColors: true, side: DoubleSide }));
  mesh.name = 'rooftops-props';
  group.add(mesh);
  const litMesh = new Mesh(lit.build(), new MeshBasicMaterial({ vertexColors: true, side: DoubleSide, toneMapped: false }));
  litMesh.name = 'rooftops-lit';
  group.add(litMesh);
  group.add(stars(500, 77));
  return group;
}

/** Surface height near (x, z) (the nearest sample's centre height). */
function nearestY(t: BuiltTrack, x: number, z: number): number {
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < t.n; i += 4) {
    const d = (t.px[i] - x) ** 2 + (t.pz[i] - z) ** 2;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return t.py[best];
}

/** Lit windows on the four faces of a box (centre x/z, yaw ry, width w along local x, depth d along local z). */
function windows(b: TriBuilder, x: number, z: number, ry: number, w: number, d: number, y0: number, y1: number, seed: number): void {
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  const faces: Array<[number, number, number, number, number]> = [
    // local centre (lx, lz), face normal (nx, nz), face width
    [0, d / 2 + 0.05, 0, 1, w],
    [0, -d / 2 - 0.05, 0, -1, w],
    [w / 2 + 0.05, 0, 1, 0, d],
    [-w / 2 - 0.05, 0, -1, 0, d],
  ];
  let n = 0;
  for (const [lx, lz, nx, nz, fw] of faces) {
    const tx = -nz; // along-face direction in local space
    const tz = nx;
    for (let y = y0; y < y1 - 1.5; y += 3.2)
      for (let u = -fw / 2 + 1.6; u < fw / 2 - 1.2; u += 2.6) {
        n++;
        if (hash01(seed * 131 + n) > 0.42) continue;
        const col = WINDOW[(seed + n) % WINDOW.length];
        const p = (du: number, dy: number): [number, number, number] => {
          const px = lx + tx * (u + du);
          const pz = lz + tz * (u + du);
          return [x + px * c + pz * s, y + dy, z - px * s + pz * c];
        };
        b.quad(p(-0.6, 0), p(0.6, 0), p(0.6, 1.4), p(-0.6, 1.4), col);
      }
  }
}

function neonBar(b: TriBuilder, x: number, y: number, z: number, ry: number, w: number, col: number): void {
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  const p = (u: number, dy: number): [number, number, number] => [x + u * c, y + dy, z - u * s];
  b.quad(p(-w / 2, -0.18), p(w / 2, -0.18), p(w / 2, 0.18), p(-w / 2, 0.18), col);
}

/** The Pink Paw garage beside the bottom straight: a small building, a roll door and the neon text sign. */
function pinkPawGarage(t: BuiltTrack, g: GeoBuilder, lit: TriBuilder, group: Group): void {
  // the straightest sample in the second half of the lap
  let best = Math.floor(t.n * 0.75);
  let bestC = Infinity;
  for (let i = Math.floor(t.n * 0.55); i < Math.floor(t.n * 0.95); i++) {
    let c = 0;
    for (let k = -20; k <= 20; k += 5) c += Math.abs(t.curv[(i + k + t.n) % t.n]);
    if (c < bestC) {
      bestC = c;
      best = i;
    }
  }
  const i = best;
  // outside of the loop: the side whose normal points away from the origin
  const rx = -t.tz[i];
  const rz = t.tx[i];
  const side = rx * t.px[i] + rz * t.pz[i] > 0 ? 1 : -1;
  const off = (side > 0 ? t.wallR[i] : t.wallL[i]) + 7;
  const x = t.px[i] + rx * off * side;
  const z = t.pz[i] + rz * off * side;
  const y = t.py[i] - 0.1;
  const ry = Math.atan2(t.tx[i], t.tz[i]);
  const face = ry + (side > 0 ? -Math.PI / 2 : Math.PI / 2);
  g.boxUp(16, 7, 10, 0x3b2c5e, { x, y, z, ry });
  g.boxUp(17, 0.6, 11, 0x2a2048, { x, y: y + 7, z, ry });
  // roll door facing the road
  const fx = Math.sin(face);
  const fz = Math.cos(face);
  g.box(7, 5, 0.3, 0x9a92b8, { x: x + fx * 5.1, y: y + 2.5, z: z + fz * 5.1, ry: face });
  for (let k = 0; k < 6; k++) g.box(7, 0.08, 0.35, 0x6b5f8a, { x: x + fx * 5.2, y: y + 0.6 + k * 0.8, z: z + fz * 5.2, ry: face });
  // neon outline above the door
  const c = Math.cos(face);
  const s = Math.sin(face);
  const p = (u: number, dy: number): [number, number, number] => [x + fx * 5.3 + u * c, y + dy, z + fz * 5.3 - u * s];
  lit.quad(p(-7.6, 6.1), p(7.6, 6.1), p(7.6, 6.35), p(-7.6, 6.35), 0xff3ea5);
  const signMesh = sign(['PINK PAW', 'Rožinė pėdutė'], 12, 3.2, x + fx * 5.6, y + 9.3, z + fz * 5.6, face, { bg: '#1a1238', fg: '#ff8fcf', glow: '#ff3ea5' });
  if (signMesh) group.add(signMesh);
  g.boxUp(13, 3.6, 0.4, 0x1a1238, { x: x + fx * 5.4, y: y + 7.4, z: z + fz * 5.4, ry: face });
}
