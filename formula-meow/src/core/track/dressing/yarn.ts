/**
 * Yarn Canyon dressing (props only, a lazy chunk): red-orange mesas under a sunset, striped in rock layers and wound
 * with giant yarn; the knitting-needle bridge (two needles under the deck, piers to the canyon floor, no walls); a
 * yarn ball stuck in the shortcut's gap; cacti, boulders, strands of yarn strung between the mesa tops. One merged
 * toon mesh and a couple of signs.
 */
import { DoubleSide, Group, Mesh } from 'three';
import type { BuiltTrack } from '../build';
import type { Theme } from '../themes';
import { GeoBuilder, hash01 } from '../../render/geo';
import { toonMaterial } from '../../render/toon';
import { t as tr } from '../../../ui/i18n';
import { branchSigns, clearance, raisedDeck, scatter, sign, startGantry } from './common';

const ROCK = [0xc96a48, 0xd98258, 0xb85a3e, 0xe0956a];
const YARN = [0xff3ea5, 0x7b2cbf, 0xffc93c, 0x3aa8ff, 0xff8a3d];

export function dressYarn(t: BuiltTrack, theme: Theme): Group {
  const group = new Group();
  group.name = 'dressing-yarn';
  const g = new GeoBuilder();

  // the canyon floor: a few big rock plates in two tones under the default ground
  for (let k = 0; k < 40; k++) {
    const a = hash01(k * 17) * Math.PI * 2;
    const r = 30 + hash01(k * 29) * 220;
    g.cylUp(10 + hash01(k * 3) * 16, 12 + hash01(k * 3) * 16, 0.12, 7, k % 2 ? theme.ground : theme.groundB, { x: Math.cos(a) * r, y: -0.06, z: Math.sin(a) * r, ry: k });
  }

  // the raised road sits on mesa tops; the bridge is the exception (below)
  // (SIM_VERSION 8: and the strand jump on the bridge, from its run-up to its landing, so no slab fills the gap)
  const open = Uint8Array.from(t.voidMask);
  for (const pc of t.pieces)
    if (pc.kind === 'jump' && pc.gap > 0) {
      const from = (pc.i0 - Math.round(10 / t.step) + t.n) % t.n;
      const len = (pc.land1 - from + t.n) % t.n;
      for (let k = 0; k <= len; k++) open[(from + k) % t.n] = 1;
    }
  raisedDeck({ ...t, voidMask: open }, g, { minY: 1.4, color: ROCK[1], inset: 2.2, vary: 0.06 });

  // the knitting-needle bridge: two long needles under the deck, piers down to the floor. SIM_VERSION 8: the bridge
  // runs on past its open stretch through the strand jump (a jump piece starting just after it), broken at the gap
  let first = -1;
  let last = -1;
  for (let i = 0; i < t.n; i++)
    if (t.voidMask[i]) {
      if (first < 0) first = i;
      last = i;
    }
  const strand = first >= 0 ? t.pieces.find((p) => p.kind === 'jump' && p.gap > 0 && p.i0 >= last && p.i0 - last < 40 / t.step) : undefined;
  if (strand) last = strand.land1;
  if (first >= 0) {
    const run = last - first;
    for (const s of [-1, 1]) {
      for (let k = 0; k < run; k += 4) {
        const i = first + k;
        const j = Math.min(last, i + 4);
        if (t.gapMask[i] || t.gapMask[j]) continue;
        const d = s * (t.halfW[i] - 1.2);
        const ax = t.px[i] - t.tz[i] * d;
        const az = t.pz[i] + t.tx[i] * d;
        const bx = t.px[j] - t.tz[j] * d;
        const bz = t.pz[j] + t.tx[j] * d;
        const len = Math.hypot(bx - ax, bz - az);
        g.cyl(0.55, 0.55, len + 0.1, 8, s > 0 ? 0xd9dde3 : 0xc0c6cc, { x: (ax + bx) / 2, y: (t.py[i] + t.py[j]) / 2 - 0.9, z: (az + bz) / 2, rx: Math.PI / 2, ry: Math.atan2(bx - ax, bz - az) }, { vary: 0 });
      }
    }
    // the needles' knobs and points stick out at both ends
    for (const [i, dir] of [
      [first, -1],
      [last, 1],
    ] as const) {
      for (const s of [-1, 1]) {
        const d = s * (t.halfW[i] - 1.2);
        const x = t.px[i] - t.tz[i] * d + t.tx[i] * dir * 2.5;
        const z = t.pz[i] + t.tx[i] * d + t.tz[i] * dir * 2.5;
        if (dir < 0) g.sphere(1, YARN[s > 0 ? 0 : 3], { x, y: t.py[i] - 1.5, z }, { vary: 0 }, 10, 8);
        else g.cone(0.55, 3, 8, 0xd9dde3, { x, y: t.py[i] - 1.2, z, rx: Math.PI / 2, ry: Math.atan2(t.tx[i], t.tz[i]) }, { vary: 0 });
      }
    }
    // the broken ends of the needles at the strand gap: points sticking out over the drop
    if (strand) {
      for (const [i, dir] of [
        [strand.i0, 1],
        [strand.i1, -1],
      ] as const) {
        for (const s of [-1, 1]) {
          const d = s * (t.halfW[i] - 1.2);
          const x = t.px[i] - t.tz[i] * d + t.tx[i] * dir * 1.2;
          const z = t.pz[i] + t.tx[i] * d + t.tz[i] * dir * 1.2;
          g.cone(0.55, 2.4, 8, 0xd9dde3, { x, y: t.py[i] - 0.9, z, rx: (dir * Math.PI) / 2, ry: Math.atan2(t.tx[i], t.tz[i]) }, { vary: 0 });
        }
      }
    }
    for (let k = 10; k < run - 6; k += Math.round(14 / t.step)) {
      const i = first + k;
      if (t.gapMask[i] || t.gapMask[Math.min(last, i + 3)]) continue;
      g.boxUp(2.4, t.py[i] - 1.5, 2.4, ROCK[2], { x: t.px[i], y: 0, z: t.pz[i], ry: Math.atan2(t.tx[i], t.tz[i]) }, { vary: 0.05 });
    }
  }

  // the yarn ball wedged in the shortcut's gap (it does not hold you up), and the yarn hammock under the gap that
  // catches a kart that comes up short (SIM_VERSION 8: set down past the far lip, src/tracks/hazards/rules.ts)
  for (const b of t.branches) {
    if (!b.gap) continue;
    const j = (b.gap.j0 + b.gap.j1) >> 1;
    g.sphere(3.2, YARN[0], { x: b.px[j], y: b.py[j] - 6.5, z: b.pz[j] }, { vary: 0.02 }, 12, 9);
    for (let k = 0; k < 4; k++) g.torus(3.25, 0.18, 0xffb3d6, { x: b.px[j], y: b.py[j] - 6.5, z: b.pz[j], rx: k * 0.8, ry: k * 0.5 }, { vary: 0 }, 4, 18);
    const j0 = Math.max(0, b.gap.j0 - 1);
    const j1 = Math.min(b.m - 1, b.gap.j1 + 1);
    const yTop = Math.min(b.py[j0], b.py[j1]) - 0.4;
    const steps = 8;
    const at = (q: number, u: number) => {
      const ji = Math.min(b.m - 1, Math.round(j0 + (j1 - j0) * u));
      const w = (q / 3) * (b.halfW[ji] - 0.4);
      return { x: b.px[ji] - b.tz[ji] * w, y: yTop - 2.2 * Math.sin(u * Math.PI) * (1 - (q * q) / 16), z: b.pz[ji] + b.tx[ji] * w };
    };
    for (let q = -3; q <= 3; q++) {
      // strands along the gap, sagging into a hammock
      for (let k = 0; k < steps; k++) {
        const a = at(q, k / steps);
        const c = at(q, (k + 1) / steps);
        const flat = Math.hypot(c.x - a.x, c.z - a.z);
        const len = Math.hypot(flat, c.y - a.y);
        g.cyl(0.11, 0.11, len + 0.05, 4, YARN[(q + 3) % YARN.length], { x: (a.x + c.x) / 2, y: (a.y + c.y) / 2, z: (a.z + c.z) / 2, ry: Math.atan2(c.x - a.x, c.z - a.z), rx: Math.PI / 2 - Math.atan2(c.y - a.y, flat) }, { vary: 0 });
      }
    }
  }

  // mesas round the canyon, striped in rock layers, some wound with yarn
  const mesas = scatter(t, 61, 26, 14, 40, 210);
  mesas.forEach((m, n) => {
    const r = 9 + m.k * 14;
    const h = 10 + hash01(n * 7) * 26;
    const layers = 3 + (n % 3);
    for (let k = 0; k < layers; k++) g.cylUp(r * (1 - k * 0.05), r * (1 - k * 0.04), h / layers + 0.05, 9, ROCK[(n + k) % ROCK.length], { x: m.x, y: (h / layers) * k, z: m.z, ry: m.r }, { vary: 0.03 });
    if (n % 3 === 0) for (let k = 0; k < 3; k++) g.torus(r * 1.01, 0.6, YARN[(n + k) % YARN.length], { x: m.x, y: h * (0.3 + k * 0.2), z: m.z, rx: Math.PI / 2 + (k - 1) * 0.12 }, { vary: 0 }, 4, 18);
    if (n % 4 === 1) {
      // a giant ball of yarn on top
      g.sphere(5, YARN[n % YARN.length], { x: m.x, y: h + 4.6, z: m.z }, undefined, 10, 8);
      for (let k = 0; k < 3; k++) g.torus(5.05, 0.25, 0xffffff, { x: m.x, y: h + 4.6, z: m.z, rx: k * 1.05, ry: k * 0.6 }, { vary: 0 }, 4, 18);
    }
  });

  // cacti and boulders close to the road
  const near = scatter(t, 67, 60, 4, 10, 150);
  near.forEach((s, n) => {
    if (clearance(t, s.x, s.z) > 30) return;
    if (n % 3 === 0) {
      g.cylUp(0.9, 1.1, 6 + s.k * 4, 8, 0x3f9a5a, { x: s.x, y: 0, z: s.z });
      g.cylUp(0.55, 0.6, 2.6, 6, 0x3f9a5a, { x: s.x + 1.4, y: 2.4, z: s.z });
      g.cyl(0.55, 0.55, 1.6, 6, 0x3f9a5a, { x: s.x + 0.8, y: 2.4, z: s.z, rz: Math.PI / 2 });
      g.sphere(0.5, 0xff8fb1, { x: s.x, y: 6.4 + s.k * 4, z: s.z }, { vary: 0 }, 6, 4);
    } else g.ico(1.6 + s.k * 2.4, ROCK[n % ROCK.length], { x: s.x, y: 0.8, z: s.z, ry: s.r, sy: 0.7 }, undefined, 0);
  });

  const title = sign([tr('sign.yarn')], 30, 5, 0, 30, -205, 0, { bg: '#7b2cbf', fg: '#ffe0a0', glow: '#ff8a3d' });
  if (title) group.add(title);
  branchSigns(t, g, theme, group, (b) => tr(b.label));
  startGantry(t, g, theme, group);

  const mesh = new Mesh(g.build(), toonMaterial({ vertexColors: true, side: DoubleSide }));
  mesh.name = 'yarn-props';
  mesh.receiveShadow = true;
  group.add(mesh);
  return group;
}
