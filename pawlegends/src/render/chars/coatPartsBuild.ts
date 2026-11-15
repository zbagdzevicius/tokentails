/**
 * Coat parts (gaps2 coats-models): every Epic and Legendary coat changes the model in a match, not only its colours.
 * Each one adds code-built pieces that follow its painted art in the skins library (brandbook v6 skins/img), on the
 * hero's own rig and gear: a sun halo, lightning crests, an eclipse orb, a knit cuff and frost bell, a crescent moon
 * and stars, a flower crown and leaf pauldrons. Same rules as the rest of render/chars:
 *
 * - one skinned mesh per hero: parts are vertex-coloured pieces on a bone, so a coat adds triangles, never a draw call;
 * - POC.md §10: ≤ 6k triangles at Med with a chroma on top (tests/unit/coat-parts.test.ts); a coat may drop a base
 *   piece it replaces (`drops`, Bloomtail's leaf pauldrons in place of the domes) to stay inside it;
 * - quality: Low (detail < 0.9) keeps the one or two pieces that carry the silhouette and skips the small trims;
 * - the team read stays: hoods, helmets, mantles, capes, hat crowns and box flaps keep the team colour, parts sit on
 *   top of them in the coat's own colours;
 * - sized for the iso camera: every signature piece is at least as big as Clem's bow (readable at gameplay distance).
 *
 * Render only: the sim, the replay and the hash never see a coat.
 *
 * gaps5: this module is its own chunk (out of the first-load JS); render/chars/coatParts.ts loads it and holds the
 * coat ids, heroes and dropped gear.
 */
import * as THREE from 'three';
import { S1_PLUS_COAT } from '../../money/catalog';
import { C, mat, type Assembly, type Col, type RGB } from './chibi';
import type { BoneName } from './skeleton';

import type { PartTeam } from './coatParts';

// ------------------------------------------------------------------------------------------------ shared shapes

/** Full detail (Med, High, the lobby): the small trims are on. Low (0.62) keeps the signature pieces only. */
const full = (A: Assembly): boolean => A.detail >= 0.9;

/** A flat shape extruded `depth` thick, centred on its own thickness. */
function slab(s: THREE.Shape, depth: number): THREE.BufferGeometry {
  return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 1 }).translate(0, 0, -depth / 2);
}

/** A lightning bolt `h` tall (pointing down), in the XY plane. */
function boltShape(h: number): THREE.Shape {
  const w = h * 0.42;
  const s = new THREE.Shape();
  const P: [number, number][] = [[0.15, 0.5], [-0.32, 0.02], [-0.02, 0.02], [-0.18, -0.5], [0.34, 0.08], [0.04, 0.08], [0.24, 0.5]];
  P.forEach(([x, y], i) => (i ? s.lineTo(x * w * 2, y * h) : s.moveTo(x * w * 2, y * h)));
  s.closePath();
  return s;
}

/** A five-point star of outer radius `r` in the XY plane. */
function starShape(r: number, inner = 0.45): THREE.Shape {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    const k = i % 2 === 0 ? r : r * inner;
    if (i === 0) s.moveTo(Math.cos(a) * k, Math.sin(a) * k);
    else s.lineTo(Math.cos(a) * k, Math.sin(a) * k);
  }
  s.closePath();
  return s;
}

const rgb = (c: number): RGB => C(c);

/** A five-petal flower outline of radius `r` in the XY plane (rounded lobes). */
function flowerShape(r: number): THREE.Shape {
  const s = new THREE.Shape();
  const n = 5;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2 + Math.PI / 2;
    const a1 = ((i + 1) / n) * Math.PI * 2 + Math.PI / 2;
    const am = (a0 + a1) / 2;
    const ri = r * 0.38;
    if (i === 0) s.moveTo(Math.cos(a0) * ri, Math.sin(a0) * ri);
    // each petal: out to the tip and back in, a rounded lobe (one quadratic each side)
    s.quadraticCurveTo(Math.cos(am - 0.55) * r * 1.15, Math.sin(am - 0.55) * r * 1.15, Math.cos(am) * r, Math.sin(am) * r);
    s.quadraticCurveTo(Math.cos(am + 0.55) * r * 1.15, Math.sin(am + 0.55) * r * 1.15, Math.cos(a1) * ri, Math.sin(a1) * ri);
  }
  return s;
}

/**
 * A five-petal flower, a solid slab readable from both sides: rounded petals (~84 triangles) when `round` and the
 * detail is full, else pointed ones (~44) in `petal`, and a domed heart in `centre`, facing +Z before `m`.
 */
function flower(A: Assembly, bone: BoneName, m: THREE.Matrix4, r: number, petal: number, centre: number, round = true): void {
  const g = new THREE.ExtrudeGeometry(flowerShape(r), { depth: r * 0.18, bevelEnabled: false, curveSegments: round && full(A) ? 2 : 1 }).translate(0, 0, -r * 0.09);
  A.add(bone, g, { m, color: petal });
  A.add(bone, new THREE.OctahedronGeometry(r * 0.32, 0).scale(1, 1, 0.6), { m: m.clone().multiply(mat([0, 0, r * 0.1])), color: centre });
}

/** A leaf (a flattened octahedron, 8 triangles) `len` long along +Z before `m`. */
function leaf(A: Assembly, bone: BoneName, m: THREE.Matrix4, len: number, color: Col): void {
  A.add(bone, new THREE.OctahedronGeometry(1, 0).scale(len * 0.38, len * 0.1, len * 0.5).translate(0, 0, len * 0.5), { m, color });
}

// ------------------------------------------------------------------------------------------------ the coats

const SUN_GOLD = 0xffc23a;
const SUN_CORE = 0xff7a2a;
const SUN_SKIRT = 0xe8508a;

/**
 * Sunforged (Clem, Legendary, pass tier 30): the sunrise behind her in the art becomes a gold sun halo on the back of
 * her head with flame rays, a big sun medallion on the breastplate, sun-ray flares on the pauldrons and the magenta
 * battle skirt under the plate.
 */
function sunforged(A: Assembly): void {
  const w = A.w;
  // the halo: an open ring behind the head (no disc: from behind it would hide her head), tilted back a little
  const halo = mat([0, 0.2, -0.15], [-0.25, 0, 0]);
  A.add('head', new THREE.TorusGeometry(0.17, 0.018, 3, A.seg(20, 12)), { m: halo, color: SUN_GOLD });
  const rays = full(A) ? 10 : 0;
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2;
    if (Math.sin(a) < -0.3) continue; // no rays down into the cape
    A.add('head', new THREE.ConeGeometry(0.026, 0.075, 3), { m: halo.clone().multiply(mat([Math.cos(a) * 0.21, Math.sin(a) * 0.21, 0], [0, 0, a - Math.PI / 2])), color: i % 2 ? SUN_GOLD : SUN_CORE });
  }
  // the sun medallion over the breastplate's coin
  const z = 0.14 * 1.05 * (0.85 + 0.15 * w) + 0.012;
  A.add('chest', new THREE.CylinderGeometry(0.058, 0.058, 0.014, A.seg(14, 8)).rotateX(Math.PI / 2), { m: mat([0, 0.05, z]), color: SUN_GOLD });
  A.add('chest', new THREE.CylinderGeometry(0.034, 0.034, 0.016, A.seg(10, 6)).rotateX(Math.PI / 2), { m: mat([0, 0.05, z + 0.004]), color: SUN_CORE });
  if (full(A)) for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    A.add('chest', new THREE.ConeGeometry(0.014, 0.03, 3), { m: mat([Math.cos(a) * 0.07, 0.05 + Math.sin(a) * 0.07, z], [0, 0, a - Math.PI / 2]), color: SUN_GOLD });
  }
  // the battle skirt: a magenta flare below the plate, gold hem
  const skirt = new THREE.CylinderGeometry(0.15 * w, 0.215 * w, 0.12, A.seg(12, 8), 1, true);
  const sk = rgb(SUN_SKIRT);
  const hem = rgb(SUN_GOLD);
  A.add('hips', skirt, { m: mat([0, -0.045, 0]), color: (_v, _n, lp) => (lp.y < -0.045 ? hem : sk) });
  // sun-ray flares on each pauldron
  if (full(A)) for (const s of [1, -1]) for (const k of [-1, 0, 1]) {
    A.add('chest', new THREE.ConeGeometry(0.02, 0.075, 3), { m: mat([s * (0.2 * w + 0.02), 0.2 + k * 0.035, k * 0.04], [0, 0, -s * (1.25 - k * 0.15)]), color: k === 0 ? SUN_CORE : SUN_GOLD });
  }
}

const VOLT = 0xffe24d;
const VOLT_DEEP = 0xf2a81a;

/**
 * Thunderpaw (Sir Brutus, Legendary): the lightning shield from the art (a gold bolt across the shield face), lightning
 * crests on the helmet sides, the Thunderpaw bolt on the back of his cape and one on the sword's blade.
 */
function thunderpaw(A: Assembly): void {
  // the shield bolt: on the shield face in his guard pose (gear.ts towerShield, Sir Brutus's placement in specs.ts)
  const face = A.posed('pawL', 'shieldGuard', mat([0.16, 0.38, 0.27], [Math.PI / 2, 0.35, 0]));
  A.add('pawL', slab(boltShape(0.36), 0.02), { m: face.clone().multiply(mat([0, 0.095, 0], [-Math.PI / 2, 0, 0.25])), color: VOLT });
  // helmet crests: a bolt fin on each side of the dome, swept back
  for (const s of [1, -1]) {
    A.add('head', slab(boltShape(0.21), 0.018), { m: mat([s * 0.19, 0.34, -0.02], [0, s * Math.PI / 2, -0.35]), color: s > 0 ? VOLT : VOLT_DEEP });
  }
  // the Thunderpaw emblem: a big bolt on the back of his cape (the iso camera sees his back as often as his front;
  // specs.ts Sir Brutus: cape len 0.34, top 0.15w, bot 0.26w, hung at chest y 0.19, z -0.03)
  const capeR = (0.15 + 0.26) * 0.5 * A.w;
  A.add('chest', slab(boltShape(0.2), 0.016), { m: mat([0, 0.02, -0.03 - capeR - 0.012], [0.33, Math.PI, 0.15]), color: VOLT });
  // a small bolt on the blade
  if (full(A)) A.add('weapon', slab(boltShape(0.14), 0.018), { m: mat([0, 0.25, 0.012], [0, 0, 0.1]), color: VOLT });
}

const ECLIPSE = 0x1a1420;
const CORONA = 0xffd34d;
const AMETHYST = 0xb07cff;
const ROSE = 0xff8fb1;

/**
 * Eclipse (Duchess, Epic, Legends Pass+): the eclipse from the art as a dark orb with a gold corona floating at her
 * shoulder, tall amethyst spikes on her tiara and a rose brooch on the mantle.
 */
function eclipse(A: Assembly): void {
  // the orb: rides the head (it bobs with her), up beside her right ear and tipped toward the sky so the iso camera
  // (which looks down on her) sees its face, clear of her own face
  const at = mat([-0.22, 0.36, -0.08], [-0.45, -0.5, 0]);
  A.add('head', new THREE.SphereGeometry(0.068, A.seg(9, 7), A.seg(6, 5)), { m: at, color: ECLIPSE });
  A.add('head', new THREE.TorusGeometry(0.084, 0.013, 3, A.seg(12, 9)), { m: at, color: CORONA });
  if (full(A)) for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    A.add('head', new THREE.OctahedronGeometry(0.016, 0).scale(1, 1.8, 1), { m: at.clone().multiply(mat([Math.cos(a) * 0.115, Math.sin(a) * 0.115, 0], [0, 0, a - Math.PI / 2])), color: CORONA });
  }
  // the amethyst crest over the tiara (duchess.ts tiara: band at y 0.255, gems at the front)
  for (const [x, h, z] of [[0, 0.11, 0.08], [0.06, 0.075, 0.07], [-0.06, 0.075, 0.07]] as const) {
    if (x !== 0 && !full(A)) continue;
    A.add('head', new THREE.OctahedronGeometry(1, 0).scale(0.024, h / 2, 0.02), { m: mat([x, 0.28 + h / 2, z], [-0.2, Math.PI / 4, 0]), color: AMETHYST });
  }
  // the rose brooch on the mantle front
  A.add('chest', new THREE.OctahedronGeometry(0.036, 0).scale(1, 1, 0.55), { m: mat([0, 0.13, 0.215]), color: ROSE });
  if (full(A)) A.add('chest', new THREE.TorusGeometry(0.038, 0.007, 3, 8), { m: mat([0, 0.13, 0.21]), color: CORONA });
}

const MUSTARD = 0xd99a2b;
const MUSTARD_DEEP = 0xb07a1e;
const FROST = 0xbfefff;
const BELL = 0xdfe8f0;

/**
 * Frostbell (Marshmallow, Epic): the mustard knit beanie from the art as a ribbed mustard cuff over her hat (the crown
 * keeps the team colour), a frost snowflake pinned to it, a silver bell on her scarf and an ice crystal on her tail.
 */
function frostbell(A: Assembly): void {
  // marshmallow.ts bobbleHat: the same frame, the cuff a little wider and taller than the white rim
  const at = mat([0, 0.2, -0.012], [-0.1, 0, 0], [1.17, 0.98, 1.1]);
  const rimY = Math.cos(Math.PI * 0.42) * 0.162;
  const rimR = Math.sin(Math.PI * 0.42) * 0.162;
  const mu = rgb(MUSTARD);
  const md = rgb(MUSTARD_DEEP);
  A.add('head', new THREE.CylinderGeometry(rimR * 1.07, rimR * 1.11, 0.062, A.seg(18, 10), 1, true), {
    m: at.clone().multiply(mat([0, rimY - 0.01, 0])),
    color: (_v, _n, lp) => (Math.floor(((Math.atan2(lp.x, lp.z) + Math.PI) / (Math.PI * 2)) * 18) % 2 ? md : mu),
  });
  // the snowflake: three crossed bars and a crystal heart on the cuff front
  const sf = at.clone().multiply(mat([0, rimY - 0.008, rimR * 1.11 + 0.012]));
  const bars = full(A) ? 3 : 2;
  for (let i = 0; i < bars; i++) A.add('head', new THREE.BoxGeometry(0.014, 0.12, 0.01), { m: sf.clone().multiply(mat([0, 0, 0], [0, 0, (i * Math.PI) / 3 + (bars === 2 ? Math.PI / 6 : 0)])), color: FROST });
  A.add('head', new THREE.OctahedronGeometry(0.022, 0), { m: sf, color: 0xffffff });
  // the bell on the scarf front (marshmallow.ts scarf: the band at chest y 0.2)
  A.add('chest', new THREE.SphereGeometry(0.05, A.seg(10, 6), A.seg(5, 3), 0, Math.PI * 2, 0, Math.PI * 0.62), { m: mat([-0.075, 0.16, 0.19]), color: BELL });
  if (full(A)) {
    A.add('chest', new THREE.TorusGeometry(0.045, 0.009, 3, A.seg(10, 6)), { m: mat([-0.075, 0.142, 0.19], [Math.PI / 2, 0, 0]), color: MUSTARD });
    A.add('chest', new THREE.SphereGeometry(0.016, 5, 3), { m: mat([-0.075, 0.125, 0.19]), color: MUSTARD_DEEP });
    // the ice crystal on her tail plume
    A.add('tail5', new THREE.OctahedronGeometry(1, 0).scale(0.035, 0.07, 0.035), { m: mat([0, 0.04, 0]), color: FROST });
  }
}

const MOON = 0xfff1a8;
const STAR = 0xffd34d;

/**
 * Moonwhisker (Pixel, Epic): the moon from the art as a glowing crescent round her antenna bead, gold stars on her box
 * (front and both sides) and a star on her tail tip.
 */
function moonwhisker(A: Assembly): void {
  // pixel.ts antenna: the bead at head (0.062, 0.37, -0.03); the crescent opens up and out
  A.add('head', new THREE.TorusGeometry(0.06, 0.017, 3, A.seg(12, 7), Math.PI * 1.3), { m: mat([0.07, 0.38, -0.03], [0, 0, -0.9]), color: MOON });
  // pixel.ts cardboardBox: front wall at z 0.21, sides at x ±0.23, the wall centre at y 0.0625 (hips space)
  A.add('hips', slab(starShape(0.095), 0.014), { m: mat([-0.11, 0.1, 0.218]), color: STAR });
  if (full(A)) {
    for (const s of [1, -1]) A.add('hips', slab(starShape(0.08), 0.014), { m: mat([s * 0.238, 0.06, 0.03], [0, s * Math.PI / 2, 0.3]), color: STAR });
    A.add('hips', slab(starShape(0.045), 0.012), { m: mat([0.14, -0.04, 0.218], [0, 0, 0.4]), color: MOON });
    A.add('tail5', slab(starShape(0.075), 0.018), { m: mat([0, 0.05, 0], [0, Math.PI / 2, 0]), color: STAR });
  }
}

const PETAL = 0xff7ab8;
const PETAL_2 = 0xffd34d;
const PETAL_3 = 0xc8a0ff;
const HEART = 0xfff1a8;
const LEAF = 0x5fae4a;
const LEAF_LIGHT = 0x9be07a;

/**
 * Bloomtail (Sage, Legendary): the flower meadow from the art as a flower crown on her hood, leaf pauldrons in place of
 * the plate domes (`drops`: Sage is the roster's busiest model, so the leaves pay for the flowers) and a big bloom on
 * her tail tip.
 */
function bloomtail(A: Assembly): void {
  const w = A.w;
  // the crown: flowers round the hood's brow (gear.ts hood: crown r 0.192 at head y 0.168), the ears poke out between
  // all round the hood, tipped up toward the sky: the iso camera sees her from behind as often as from the front
  const angles = full(A) ? [0, 1.0, -1.0, 2.35, -2.35] : [0, 2.35, -2.35];
  const colors = [PETAL, PETAL_2, PETAL_3, PETAL_2, PETAL_3];
  angles.forEach((a, i) => {
    const x = Math.sin(a) * 0.19 * 1.1;
    const z = Math.cos(a) * 0.19 * 1.06 - 0.012;
    flower(A, 'head', mat([x, 0.29 - Math.min(1, Math.abs(a)) * 0.02, z], [0, a, 0]).multiply(mat([0, 0, 0], [-0.85, 0, 0])), i === 0 ? 0.058 : 0.052, colors[i], HEART, i === 0 || i >= 3);
  });
  // leaf pauldrons: a fan of leaves on each shoulder (gear.ts pauldrons sit at chest x ±0.148w, y 0.165)
  const n = full(A) ? 3 : 2;
  for (const s of [1, -1]) {
    for (let k = 0; k < n; k++) {
      const spread = n === 3 ? (k - 1) * 0.55 : (k - 0.5) * 0.7;
      leaf(A, 'chest', mat([s * 0.13 * w, 0.215, -0.01], [0, s * (Math.PI / 2) + spread, 0]).multiply(mat([0, 0, 0], [0.45 - (k % 2) * 0.12, 0, 0])), 0.2, k % 2 ? LEAF_LIGHT : LEAF);
    }
  }
  // the bloom on the tail tip
  flower(A, 'tail5', mat([0, 0.05, 0], [0, Math.PI / 2, 0]), 0.06, PETAL, HEART, false);
}

const TOAST = 0xe0a85a;
const CRUST = 0x9a5a22;
const LETTUCE = 0x7ccf4a;
const LETTUCE_DEEP = 0x4e9a2e;
const TOMATO = 0xe8503a;
const CHEESE = 0xffcf3a;
const PICK = 0xe8d2a8;
const OLIVE = 0x5a7a2a;
const FLAG = 0xff6f91;

/** A triangle (one corner up +Y before the caller's turn) of side `a`, a club sandwich quarter seen from above. */
function wedgeShape(a: number): THREE.Shape {
  const s = new THREE.Shape();
  const h = a * 0.866;
  s.moveTo(0, (h * 2) / 3);
  s.lineTo(-a / 2, -h / 3);
  s.lineTo(a / 2, -h / 3);
  s.closePath();
  return s;
}

/**
 * Club Sandwich (Clem, Epic; gaps4 funny food concepts): a club sandwich quarter worn as a hat (toast, lettuce,
 * tomato, cheese, toast) held by a toothpick with a pink frill flag and an olive, a lettuce ruff over her mantle, toast
 * slices on her pauldrons and a pickle on her blade.
 */
function clubSandwich(A: Assembly): void {
  const w = A.w;
  // the hat: layers stacked up the head's crown (between the ears), the wedge's point toward the camera side
  const top = mat([0, 0.33, -0.01], [-0.12, 0.35, 0]);
  const layers: [number, number, number][] = full(A)
    ? [[TOAST, 0.2, 0.034], [LETTUCE, 0.235, 0.012], [TOMATO, 0.205, 0.016], [CHEESE, 0.22, 0.012], [TOAST, 0.2, 0.034]]
    : [[TOAST, 0.2, 0.04], [LETTUCE, 0.235, 0.016], [TOAST, 0.2, 0.04]];
  let y = 0;
  for (const [c, a, d] of layers) {
    // each layer flat (the shape's plane turned to the ground), the bread with a darker crust round its edge
    const g = slab(wedgeShape(a), d).rotateX(-Math.PI / 2);
    // the bread's sides are its crust (the side walls face out, the faces up and down are toast)
    const col: Col = c === TOAST ? (_v, n) => (Math.abs(n.y) < 0.5 ? rgb(CRUST) : rgb(TOAST)) : c;
    A.add('head', g.translate(0, y + d / 2, 0), { m: top, color: col });
    y += d;
  }
  // the toothpick through the stack, its frill flag and an olive
  A.add('head', new THREE.CylinderGeometry(0.006, 0.006, 0.17, 4).translate(0, 0.085 + y * 0.4, 0), { m: top, color: PICK });
  A.add('head', new THREE.SphereGeometry(0.024, A.seg(7, 5), A.seg(5, 4)).scale(1, 0.85, 1), { m: top.clone().multiply(mat([0, y + 0.03, 0])), color: OLIVE });
  if (full(A)) A.add('head', slab(starShape(0.032, 0.6), 0.008), { m: top.clone().multiply(mat([0, y * 0.4 + 0.165, 0])), color: FLAG });
  // the lettuce ruff: leaves fanned round the mantle, tipped up (gear.ts mantle: r 0.22 at chest y ~0.2)
  const n = full(A) ? 8 : 5;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    leaf(A, 'chest', mat([Math.sin(a) * 0.17 * w, 0.25, Math.cos(a) * 0.17 * w], [0, a, 0]).multiply(mat([0, 0, 0], [-0.55, 0, 0])), 0.13, i % 2 ? LETTUCE : LETTUCE_DEEP);
  }
  if (!full(A)) return;
  // toast slices on the pauldrons (gear.ts pauldrons at chest x ±0.148w, y 0.165), tilted out with the shoulder
  for (const s of [1, -1]) {
    const toast = new THREE.BoxGeometry(0.13, 0.024, 0.12);
    A.add('chest', toast, { m: mat([s * 0.16 * w, 0.235, 0], [0, 0, -s * 0.42]), color: (_v, _n, lp) => (Math.max(Math.abs(lp.x) / 0.065, Math.abs(lp.z) / 0.06) > 0.8 ? rgb(CRUST) : rgb(TOAST)) });
  }
  // a pickle along the blade
  A.add('weapon', new THREE.SphereGeometry(0.03, 6, 4).scale(0.8, 2.6, 0.8), { m: mat([0, 0.26, 0.02]), color: LETTUCE_DEEP });
}

const SKEWER = 0xd8b080;
const MEAT = 0x8a3a1a;
const MEAT_HI = 0xb85a2a;
const PEPPER = 0x5fbf3a;
const ONION = 0xf6ecd8;
const CROWN = 0xffd34d;
const CROWN_DEEP = 0xd99a2b;
const CHILI = 0xe8402a;

/** A skewer `len` long along +Y (before `m`) with `chunks` (colour list) threaded on it, centred. */
function skewer(A: Assembly, bone: BoneName, m: THREE.Matrix4, len: number, chunks: readonly number[], size: number): void {
  A.add(bone, new THREE.CylinderGeometry(0.007, 0.007, len, 4), { m, color: SKEWER });
  A.add(bone, new THREE.ConeGeometry(0.009, 0.03, 4), { m: m.clone().multiply(mat([0, len / 2 + 0.015, 0])), color: SKEWER });
  const step = (len * 0.72) / Math.max(1, chunks.length - 1);
  chunks.forEach((c, i) => {
    const y = -len * 0.36 + i * step;
    const g = c === MEAT || c === MEAT_HI ? new THREE.BoxGeometry(size, size * 0.9, size) : new THREE.CylinderGeometry(size * 0.55, size * 0.55, size * 0.5, 6);
    A.add(bone, g, { m: m.clone().multiply(mat([0, y, 0], [0, i * 0.7, 0])), color: c });
  });
}

/**
 * Kebab King (Frankie, Epic; gaps4 funny food concepts): a gold crown on his head with a little kebab skewer stuck
 * through it, a big kebab skewer along his back beside the team mustard (meat, pepper and onion), and a chili pepper on
 * his tail tip. The bun and the mustard (the team read) stay.
 */
function kebabKing(A: Assembly): void {
  const w = A.w;
  // the crown (frankie.ts head: a sphere r 0.142 at head y 0.175, so its top is ~0.31), tipped back a little
  const at = mat([0, 0.3, -0.02], [-0.25, 0, 0]);
  A.add('head', new THREE.CylinderGeometry(0.078, 0.07, 0.05, A.seg(12, 8), 1, true), { m: at, color: CROWN });
  const spikes = full(A) ? 6 : 4;
  for (let i = 0; i < spikes; i++) {
    const a = (i / spikes) * Math.PI * 2;
    A.add('head', new THREE.ConeGeometry(0.018, 0.05, 3), { m: at.clone().multiply(mat([Math.sin(a) * 0.074, 0.045, Math.cos(a) * 0.074])), color: i % 2 ? CROWN_DEEP : CROWN });
  }
  // a little skewer stuck through the crown at a jaunty angle
  skewer(A, 'head', at.clone().multiply(mat([0.02, 0.06, 0], [0, 0, -0.5])), 0.2, full(A) ? [MEAT, PEPPER, MEAT_HI] : [MEAT, PEPPER], 0.032);
  // the big skewer along his back, beside the mustard (frankie.ts mustard: down the back at z -0.162, x ±0.06w)
  skewer(A, 'chest', mat([0.13 * w, 0.0, -0.15], [0, 0, 0.12]), 0.42, full(A) ? [MEAT, PEPPER, MEAT_HI, ONION, MEAT] : [MEAT, PEPPER, MEAT], 0.055);
  if (!full(A)) return;
  // a chili pepper on his tail tip
  A.add('tail5', new THREE.SphereGeometry(0.028, 6, 4).scale(0.8, 2.2, 0.8), { m: mat([0, 0.05, 0], [0, 0, 0.3]), color: CHILI });
  A.add('tail5', new THREE.CylinderGeometry(0.006, 0.008, 0.03, 4), { m: mat([-0.015, 0.11, 0], [0, 0, 0.3]), color: PEPPER });
}

// ------------------------------------------------------------------------------------------------ gaps5 skins v2

const CHEF_WHITE = 0xfbf8f2;
const CHEF_SHADE = 0xe6e0d6;
const STEEL = 0xc8ced6;
const STEEL_DEEP = 0x8a929c;
const HANDLE = 0xa0622e;
const MOZZ = 0xffe08a;
const PEPPERONI = 0xc0352a;

/**
 * Pizzaiolo (Domino, Legendary; skins v2 "Lunch Rush"): his spots are pepperoni (the palette's dark), the beret becomes
 * a tall puffy chef hat with a team-colour band, the crayon becomes a giant pizza cutter in his paw, and strings of
 * melted mozzarella hang from his chin and paws.
 */
function pizzaiolo(A: Assembly, team: PartTeam): void {
  const f = full(A);
  // the chef hat: a team band round the crown, then the puffy white top (a cluster of soft lobes)
  const at = mat([0.01, 0.3, -0.02], [-0.12, 0, -0.08]);
  A.add('head', new THREE.CylinderGeometry(0.118, 0.128, 0.075, A.seg(14, 8), 1, true), { m: at, color: team.main });
  const puff = (_v: THREE.Vector3, n: THREE.Vector3): RGB => (n.y < -0.2 ? rgb(CHEF_SHADE) : rgb(CHEF_WHITE));
  if (f) {
    A.add('head', new THREE.SphereGeometry(0.1, 9, 6).scale(1.25, 0.95, 1.2), { m: at.clone().multiply(mat([0, 0.12, 0])), color: puff });
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.3;
      A.add('head', new THREE.SphereGeometry(0.07, 7, 4), { m: at.clone().multiply(mat([Math.cos(a) * 0.085, 0.15 + (i % 2) * 0.02, Math.sin(a) * 0.08])), color: puff });
    }
  } else A.add('head', new THREE.SphereGeometry(0.14, 8, 5).scale(1.05, 0.85, 1), { m: at.clone().multiply(mat([0, 0.13, 0])), color: puff });
  // the pizza cutter in his right paw: a steel wheel on a fork and a wooden handle, the wheel up by his head
  const grip = mat([0, -0.04, 0.03], [0.35, 0, 0]);
  A.add('pawR', new THREE.CylinderGeometry(0.018, 0.022, 0.16, A.seg(6, 5)), { m: grip.clone().multiply(mat([0, 0.06, 0])), color: HANDLE });
  A.add('pawR', new THREE.BoxGeometry(0.012, 0.09, 0.03), { m: grip.clone().multiply(mat([0, 0.18, 0])), color: STEEL_DEEP });
  // the wheel faces the camera side (its flat face toward +Z, the way he looks)
  A.add('pawR', new THREE.CylinderGeometry(0.105, 0.105, 0.012, A.seg(16, 10)).rotateX(Math.PI / 2), { m: grip.clone().multiply(mat([0, 0.24, 0.012])), color: (_v, n) => (Math.abs(n.z) > 0.5 ? rgb(STEEL) : rgb(STEEL_DEEP)) });
  if (f) A.add('pawR', new THREE.CylinderGeometry(0.022, 0.022, 0.03, 6).rotateX(Math.PI / 2), { m: grip.clone().multiply(mat([0, 0.24, 0.012])), color: STEEL_DEEP });
  if (!f) return;
  // mozzarella strings from his chin and one paw (thin drooping tubes)
  const cheese = (bone: BoneName, from: [number, number, number], len: number, sway: number): void => {
    const pts = [0, 0.33, 0.66, 1].map((k) => new THREE.Vector3(from[0] + Math.sin(k * Math.PI) * sway, from[1] - k * len, from[2] + Math.sin(k * 2) * 0.01));
    A.add(bone, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 6, 0.007, 4, false), { color: MOZZ });
    A.add(bone, new THREE.SphereGeometry(0.012, 4, 3), { m: mat([pts[3].x, pts[3].y, pts[3].z]), color: MOZZ });
  };
  cheese('head', [0.03, 0.07, 0.19], 0.11, 0.02);
  cheese('head', [-0.035, 0.075, 0.185], 0.08, -0.015);
  cheese('pawL', [0.02, -0.03, 0.03], 0.12, 0.02);
  // two more pepperoni slices on the hat's band side and his cheek (the gallery's "spots are pepperoni")
  A.add('head', new THREE.CylinderGeometry(0.026, 0.026, 0.008, 8).rotateX(Math.PI / 2), { m: at.clone().multiply(mat([0.06, 0, 0.1], [0, 0.5, 0])), color: PEPPERONI });
}

const VAC_WHITE = 0xf2f5fa;
const VAC_SIDE = 0xc6ccd6;
const VAC_PANEL = 0x7fc4f0;
const VAC_GLOW = 0x3fd8ff;
const GOGGLE = 0x8a5a34;
const LENS = 0xb8ecff;

/**
 * Robo-Vac (Nugget, Epic; skins v2 "Tin Can Titans"): the corgi rides a round robot vacuum (white shell, blue panel,
 * a glowing cyan bumper, a dock antenna and spinning side brushes), with aviator goggles pushed up on his forehead.
 * The vacuum rides on his body root, so it travels and bobs with him; the bandana and frisbee stay (the team read).
 */
function roboVac(A: Assembly): void {
  const f = full(A);
  const w = A.w;
  // the shell under him: the body bone stands at the ground in the rest pose and drops 0.05 (stand) to 0.12 (sit), so
  // the shell rides 0.1 up the bone: on the ground when he sits, skimming it when he runs
  const at = mat([0, 0.1, 0.01]);
  const R = 0.3 * w;
  A.add('body', new THREE.CylinderGeometry(R, R * 1.02, 0.07, A.seg(22, 12)), { m: at, color: (_v, n) => (n.y > 0.5 ? rgb(VAC_WHITE) : rgb(VAC_SIDE)) });
  // the glowing bumper round its rim
  A.add('body', new THREE.TorusGeometry(R * 1.03, 0.018, 3, A.seg(22, 12)), { m: at.clone().multiply(mat([0, -0.005, 0], [Math.PI / 2, 0, 0])), color: VAC_GLOW });
  // the blue panel across the top (half the lid) and the dock antenna at the back
  A.add('body', new THREE.CylinderGeometry(R * 0.82, R * 0.82, 0.012, A.seg(16, 8), 1, false, 0, Math.PI), { m: at.clone().multiply(mat([0, 0.037, 0], [0, Math.PI / 2, 0])), color: VAC_PANEL });
  A.add('body', new THREE.CylinderGeometry(0.008, 0.008, 0.12, 4), { m: at.clone().multiply(mat([R * 0.55, 0.09, -R * 0.55])), color: VAC_SIDE });
  A.add('body', new THREE.SphereGeometry(0.022, 6, 4), { m: at.clone().multiply(mat([R * 0.55, 0.155, -R * 0.55])), color: VAC_GLOW });
  if (!f) return;
  // side brushes poking out at the front
  for (const s of [1, -1]) for (let k = 0; k < 3; k++) {
    const a = s * 0.6 + (k - 1) * 0.5;
    A.add('body', new THREE.BoxGeometry(0.09, 0.006, 0.01), { m: at.clone().multiply(mat([s * R * 0.62, -0.03, R * 0.62], [0, a, 0])).multiply(mat([0.045, 0, 0])), color: VAC_SIDE });
  }
  // aviator goggles pushed up on his forehead: a strap round the skull, two lenses with brass rims
  const g = mat([0, 0.29, 0.06], [-0.55, 0, 0]);
  A.add('head', new THREE.TorusGeometry(0.165, 0.012, 3, A.seg(18, 10)), { m: g.clone().multiply(mat([0, 0, -0.04], [Math.PI / 2, 0, 0], [1.1, 1, 1])), color: GOGGLE });
  for (const s of [1, -1]) {
    A.add('head', new THREE.TorusGeometry(0.034, 0.012, 4, 10), { m: g.clone().multiply(mat([s * 0.05, 0, 0.115])), color: 0xd8a84a });
    A.add('head', new THREE.SphereGeometry(0.032, 8, 5).scale(1, 1, 0.45), { m: g.clone().multiply(mat([s * 0.05, 0, 0.115])), color: LENS });
  }
}

const BUN_GOLD = 0xe0a048;
const BUN_DEEP = 0xb8702a;
const BUN_PALE = 0xf6d8a0;
const SESAME_W = 0xfff4dc;
const PATTY = 0x6a3a1e;
const PATTY_HI = 0x8a4a26;
const TOMATO_R = 0xe8432e;
const CHEDDAR = 0xffc23a;
const PICKLE = 0x6aa83a;
const PICKLE_PALE = 0xc8e88a;
const PAPER_BAG = 0xc89a64;
const PAPER_FOLD = 0xa87a48;

/**
 * Drive-Thru Deluxe (Meatball, Legendary; skins v2 "Lunch Rush", claymation): a full burger remodel. A sesame bun hat
 * with his ears poking out, then round his belly ball a patty, tomato slices, melting cheddar with drips, a lettuce frill
 * and the bottom bun; pickle slices on his shoulders and a paper takeout bag at his hip (in place of the fish lunchbox).
 * The bandana, knot and short cape stay team-coloured.
 */
function driveThru(A: Assembly): void {
  const f = full(A);
  const w = A.w;
  const ws = A.seg(12, 8);
  const hs = A.seg(6, 4);
  // the top bun: a dome over his crown, toasted gold on top, pale where it meets his head
  const top = mat([0, 0.25, -0.01], [-0.08, 0, 0]);
  A.add('head', new THREE.SphereGeometry(0.17, ws, hs, 0, Math.PI * 2, 0, Math.PI * 0.55).scale(1.32, 0.78, 1.22), { m: top, color: (_v, n) => (n.y > 0.25 ? rgb(BUN_GOLD) : rgb(BUN_PALE)) });
  if (f) for (let i = 0; i < 9; i++) {
    const a = i * 2.39996;
    const k = 0.13 * Math.sqrt((i + 0.5) / 9);
    const x = Math.cos(a) * k * 1.3;
    const z = Math.sin(a) * k * 1.2;
    const y = 0.13 * Math.sqrt(Math.max(0, 1 - (x * x) / (0.22 * 0.22) - (z * z) / (0.2 * 0.2)));
    A.add('head', new THREE.SphereGeometry(0.011, 4, 3).scale(1, 0.5, 1.7), { m: top.clone().multiply(mat([x, y + 0.002, z], [0, a, 0])), color: SESAME_W });
  }
  // the belly layers (meatball.ts belly: an ellipsoid 0.27 × (1.42w, 0.92, 1.08) at hips y 0.08)
  const rx = 0.27 * 1.42 * w;
  const rz = 0.27 * 1.08;
  const disc = (y: number, k: number, h: number, color: Col): void => A.add('hips', new THREE.SphereGeometry(1, ws, 4).scale(rx * k, h, rz * k), { m: mat([0, y, 0]), color });
  // the patty sits on top, over the team bandana (its mantle reads as the ketchup between patty and tomato)
  A.add('chest', new THREE.SphereGeometry(1, ws, 4).scale(0.34 * w, 0.05, 0.27), { m: mat([0, 0.25, 0.01]), color: (_v, n) => (Math.abs(n.y) > 0.6 ? rgb(PATTY_HI) : rgb(PATTY)) });
  disc(0.17, 0.95, 0.022, TOMATO_R);
  disc(0.14, 0.98, 0.016, CHEDDAR);
  disc(-0.05, 0.97, 0.1, (_v, n) => (n.y > 0.3 ? rgb(BUN_GOLD) : rgb(BUN_DEEP)));
  if (!f) return;
  // cheddar drips over the edge, front and sides
  for (const a of [-0.9, -0.3, 0.35, 1.0, 2.6]) {
    A.add('hips', new THREE.ConeGeometry(0.022, 0.08, 5).rotateX(Math.PI), { m: mat([Math.sin(a) * rx * 0.98, 0.1, Math.cos(a) * rz * 0.98]), color: CHEDDAR });
  }
  // the lettuce frill under the cheese
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    leaf(A, 'hips', mat([Math.sin(a) * rx * 0.86, 0.115, Math.cos(a) * rz * 0.86], [0, a, 0]).multiply(mat([0, 0, 0], [0.5, 0, 0])), 0.1, i % 2 ? LETTUCE : LETTUCE_DEEP);
  }
  // pickle slices on his shoulders
  for (const s of [1, -1]) {
    A.add('chest', new THREE.CylinderGeometry(0.06, 0.06, 0.016, 10), { m: mat([s * 0.2 * w, 0.2, 0.02], [0, 0, -s * 0.5]), color: (_v, n) => (Math.abs(n.y) > 0.5 ? rgb(PICKLE_PALE) : rgb(PICKLE)) });
  }
  // the paper takeout bag at his hip, its top folded over
  const bag = mat([0.42 * w, -0.06, 0.12], [0, -0.5, 0.05]);
  A.add('hips', new THREE.BoxGeometry(0.11, 0.15, 0.07), { m: bag, color: PAPER_BAG });
  A.add('hips', new THREE.BoxGeometry(0.115, 0.025, 0.075), { m: bag.clone().multiply(mat([0, 0.075, 0.01], [0.35, 0, 0])), color: PAPER_FOLD });
}

const LANTERN = 0xe8302a;
const LANTERN_DEEP = 0xa81a1a;
const FEST_GOLD = 0xf4c23a;
const MANE = 0xfbf6ee;

/**
 * Paper Parade Dragon (Frankie, Mythic; skins v2 "Floating World", ukiyo-e): a red and gold paper dragon mask over his
 * brow with gold antlers, a white paper mane behind, long gold whiskers, and two paper lanterns at his shoulders. The
 * parade body (the lantern segments that follow him and grow as he levels and scores takedowns) is drawn by
 * render/skins/coatTrail.ts, not in this mesh. The bun and the team mustard stay.
 */
function paperParade(A: Assembly, team: PartTeam): void {
  const f = full(A);
  // the mask: a red cap over the top and front of his skull (frankie.ts head: a sphere r 0.142 at y 0.175)
  const mask = mat([0, 0.19, 0.012], [-0.2, 0, 0]);
  A.add('head', new THREE.SphereGeometry(0.158, A.seg(14, 9), A.seg(7, 4), 0, Math.PI * 2, 0, Math.PI * 0.4).scale(1.08, 1, 1.08), { m: mask, color: (_v, _n, lp) => (lp.y < 0.11 ? rgb(FEST_GOLD) : rgb(LANTERN)) });
  // gold antlers, each with a branch
  for (const s of [1, -1]) {
    const ant = mat([s * 0.07, 0.32, -0.02], [-0.25, 0, -s * 0.35]);
    A.add('head', new THREE.ConeGeometry(0.02, 0.15, 5), { m: ant.clone().multiply(mat([0, 0.075, 0])), color: FEST_GOLD });
    A.add('head', new THREE.ConeGeometry(0.013, 0.07, 4), { m: ant.clone().multiply(mat([s * 0.02, 0.08, 0], [0, 0, -s * 0.8])).multiply(mat([0, 0.035, 0])), color: FEST_GOLD });
  }
  // the white paper mane behind the mask
  const tufts = f ? 6 : 3;
  for (let i = 0; i < tufts; i++) {
    const a = ((i / (tufts - 1)) - 0.5) * 2.2;
    A.add('head', (f ? new THREE.SphereGeometry(0.06, 6, 4) : new THREE.OctahedronGeometry(0.06, 0)).scale(1, 1.5, 0.75), { m: mat([Math.sin(a) * 0.14, 0.24 + Math.cos(a) * 0.06, -0.1], [0.5, a * 0.4, -a * 0.4]), color: MANE });
  }
  // two paper lanterns hanging at his shoulders (a team tassel under each)
  for (const s of [1, -1]) {
    const lt = mat([s * 0.25 * A.w, 0.05, 0.12]);
    A.add('chest', new THREE.SphereGeometry(0.075, A.seg(10, 6), A.seg(7, 3)).scale(1, 1.25, 1), { m: lt, color: (_v, _n, lp) => (Math.abs(Math.sin(Math.atan2(lp.z, lp.x) * 4)) > 0.92 ? rgb(LANTERN_DEEP) : rgb(LANTERN)) });
    if (f) {
      A.add('chest', new THREE.CylinderGeometry(0.04, 0.04, 0.02, 8), { m: lt.clone().multiply(mat([0, 0.095, 0])), color: FEST_GOLD });
      A.add('chest', new THREE.CylinderGeometry(0.035, 0.035, 0.018, 8), { m: lt.clone().multiply(mat([0, -0.095, 0])), color: FEST_GOLD });
      A.add('chest', new THREE.ConeGeometry(0.018, 0.06, 5).rotateX(Math.PI), { m: lt.clone().multiply(mat([0, -0.13, 0])), color: team.main });
    }
  }
  if (!f) return;
  // gold brow scrolls on the mask and long gold whiskers from the muzzle
  for (const s of [1, -1]) {
    A.add('head', new THREE.TorusGeometry(0.03, 0.008, 3, 8, Math.PI * 1.4), { m: mat([s * 0.065, 0.26, 0.12], [-0.4, 0, s > 0 ? 0.3 : Math.PI - 0.3]), color: FEST_GOLD });
    const pts = [0, 0.33, 0.66, 1].map((k) => new THREE.Vector3(s * (0.04 + k * 0.17), 0.11 - k * 0.02 + Math.sin(k * Math.PI) * 0.04, 0.2 - k * 0.06));
    A.add('head', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 6, 0.005, 3, false), { color: FEST_GOLD });
  }
}

const SOFT = 0xfff4e2;
const SOFT_SHADE = 0xecdcc0;
const WAFFLE = 0xe0a454;
const WAFFLE_DEEP = 0xa86a2a;
const CHERRY = 0xd81e3a;
const SPRINKLES = [0xff6f91, 0x8fd8ff, 0xffd34d, 0x9be07a, 0xb07cff, 0xff9a3a];

/**
 * Soft Serve (Marshmallow, Epic; skins v2 "Lunch Rush"): a swirl of vanilla soft serve in place of her bobble hat
 * (three stacked coils and a curl, rainbow sprinkles, a cherry on top), and a waffle cone collar round her neck with a
 * team-colour ribbon at its rim (her team read while the hat is off; the scarf stays under it).
 */
function softServe(A: Assembly, team: PartTeam): void {
  const f = full(A);
  const at = mat([0, 0.27, -0.01], [-0.12, 0, 0]);
  const cream = (_v: THREE.Vector3, n: THREE.Vector3): RGB => (n.y < -0.3 ? rgb(SOFT_SHADE) : rgb(SOFT));
  const coils: [number, number, number][] = [[0.15, 0.045, 0.02], [0.11, 0.04, 0.085], [0.068, 0.034, 0.14]];
  for (const [r, t, y] of coils) A.add('head', new THREE.TorusGeometry(r, t, A.seg(6, 4), A.seg(16, 9)).rotateX(Math.PI / 2), { m: at.clone().multiply(mat([0, y, 0])), color: cream });
  // the curl on top, tipped over to one side
  A.add('head', new THREE.ConeGeometry(0.05, 0.11, A.seg(8, 5)), { m: at.clone().multiply(mat([0.015, 0.21, 0], [0, 0, -0.5])), color: cream });
  // the cherry
  A.add('head', new THREE.SphereGeometry(0.032, A.seg(8, 5), A.seg(6, 4)), { m: at.clone().multiply(mat([-0.04, 0.215, 0.02])), color: CHERRY });
  // the waffle cone collar: an open cone round the neck, a crossed waffle grid
  const waffle = (_v: THREE.Vector3, _n: THREE.Vector3, lp: THREE.Vector3): RGB => {
    const a = Math.atan2(lp.z, lp.x) * 6;
    const g1 = Math.abs(Math.sin(a + lp.y * 40));
    const g2 = Math.abs(Math.sin(a - lp.y * 40));
    return Math.min(g1, g2) < 0.18 ? rgb(WAFFLE_DEEP) : rgb(WAFFLE);
  };
  A.add('chest', new THREE.CylinderGeometry(0.21 * A.w, 0.15 * A.w, 0.13, A.seg(16, 9), 1, true), { m: mat([0, 0.17, 0.01], [0.15, 0, 0]), color: waffle });
  A.add('chest', new THREE.TorusGeometry(0.21 * A.w, 0.016, 3, A.seg(16, 9)), { m: mat([0, 0.235, 0.0], [Math.PI / 2 + 0.15, 0, 0]), color: team.main });
  if (!f) return;
  // rainbow sprinkles over the swirl (golden-angle spread, tipped every way)
  for (let i = 0; i < 16; i++) {
    const c = coils[i % 3];
    const a = i * 2.39996;
    A.add('head', new THREE.BoxGeometry(0.008, 0.008, 0.03), { m: at.clone().multiply(mat([Math.cos(a) * c[0], c[2] + c[1] * 0.8, Math.sin(a) * c[0]], [a, a * 1.7, 0])), color: SPRINKLES[i % SPRINKLES.length] });
  }
  A.add('head', new THREE.CylinderGeometry(0.004, 0.004, 0.05, 3), { m: at.clone().multiply(mat([-0.035, 0.26, 0.02], [0, 0, 0.4])), color: 0x5a7a2a });
}

const BOARD_GOLD = 0xf4c23a;
const BOARD_GOLD_DEEP = 0xc8902a;
const TIE_RED = 0xd8283e;
const TIE_DEEP = 0x8a1424;
const PEN_BLACK = 0x26222e;

/**
 * Chairman of the Board (Sir Brutus, Mythic; skins v2 "Nine-to-Five", the ladder's last step): the grey helmet and the
 * pink plume STAY (the ladder's identity: the gallery's Head of HR step lost them, CARD-SKINS.md round 6), a gold band
 * and a gold crest ridge on the helmet, a red power tie down his breastplate, a gold fountain pen clipped on it and gold
 * cufflinks. The evolving pieces (the stock-chart arrow, then the gold office-chair mech) are drawn by
 * render/skins/coatTrail.ts, not in this mesh.
 */
function chairman(A: Assembly): void {
  const f = full(A);
  // the helmet band (specs.ts Sir Brutus: G.helmet at head y 0.245, r 0.165): a gold ring round its brim, a crest ridge
  A.add('head', new THREE.TorusGeometry(0.168, 0.016, 4, A.seg(18, 10)), { m: mat([0, 0.2, 0], [Math.PI / 2 - 0.08, 0, 0]), color: BOARD_GOLD });
  A.add('head', new THREE.BoxGeometry(0.03, 0.05, 0.3), { m: mat([0, 0.4, -0.01], [-0.15, 0, 0]), color: BOARD_GOLD_DEEP });
  // the power tie: a knot under the chin, then the blade down the breastplate (front of the chest, z ~0.2)
  A.add('chest', new THREE.ConeGeometry(0.035, 0.05, 4).rotateX(Math.PI), { m: mat([0, 0.21, 0.205], [-0.2, Math.PI / 4, 0]), color: TIE_DEEP });
  const blade = new THREE.Shape();
  blade.moveTo(-0.028, 0);
  blade.lineTo(0.028, 0);
  blade.lineTo(0.045, -0.2);
  blade.lineTo(0, -0.25);
  blade.lineTo(-0.045, -0.2);
  blade.closePath();
  A.add('chest', slab(blade, 0.012), { m: mat([0, 0.19, 0.225], [-0.22, 0, 0]), color: (_v, _n, lp) => (Math.abs(Math.sin(lp.y * 60 + lp.x * 40)) > 0.85 ? rgb(TIE_DEEP) : rgb(TIE_RED)) });
  if (!f) return;
  // a gold fountain pen clipped at the breastplate's left, gold cufflinks
  A.add('chest', new THREE.CylinderGeometry(0.012, 0.012, 0.14, 6), { m: mat([-0.13, 0.12, 0.2], [0.2, 0, 0.1]), color: PEN_BLACK });
  A.add('chest', new THREE.ConeGeometry(0.012, 0.035, 6).rotateX(Math.PI), { m: mat([-0.123, 0.035, 0.212], [0.2, 0, 0.1]), color: BOARD_GOLD });
  A.add('chest', new THREE.BoxGeometry(0.008, 0.07, 0.01), { m: mat([-0.13, 0.15, 0.215], [0.2, 0, 0.1]), color: BOARD_GOLD });
  for (const b of ['pawL', 'pawR'] as const) A.add(b, new THREE.BoxGeometry(0.03, 0.03, 0.03), { m: mat([0, 0.06, 0.05], [0.6, 0.6, 0]), color: BOARD_GOLD });
}

const KETCHUP = 0xd8202a;
const MUSTARD_Y = 0xf2c21a;
const SLICE = 0xffc23a;

/**
 * Double Stack (Meatball, Epic; skins v2 "Lunch Rush"): bun-shell armour. A sesame bun helmet with his ears poking out
 * (in place of the sweatband), a cheese slice draped over his shoulders as a collar, a lettuce-leaf cape, the bottom
 * bun shell round his belly and a ketchup bottle in his paw. The ketchup trail behind him is render/skins/coatTrail.ts.
 */
function doubleStack(A: Assembly): void {
  const f = full(A);
  const w = A.w;
  const ws = A.seg(12, 8);
  // the bun helmet: a dome over his crown, toasted gold, pale at its rim (bigger than Drive-Thru's hat: it is armour)
  const top = mat([0, 0.265, -0.02], [0.02, 0, 0]);
  A.add('head', new THREE.SphereGeometry(0.16, ws, A.seg(7, 4), 0, Math.PI * 2, 0, Math.PI * 0.5).scale(1.3, 0.72, 1.18), { m: top, color: (_v, n) => (n.y > 0.2 ? rgb(BUN_GOLD) : rgb(BUN_PALE)) });
  A.add('head', new THREE.TorusGeometry(0.16 * 1.24, 0.016, 3, ws), { m: top.clone().multiply(mat([0, 0, 0], [Math.PI / 2, 0, 0], [1, 0.95, 1])), color: BUN_DEEP });
  if (f) for (let i = 0; i < 10; i++) {
    const a = i * 2.39996;
    const k = 0.13 * Math.sqrt((i + 0.5) / 10);
    A.add('head', new THREE.SphereGeometry(0.011, 4, 3).scale(1, 0.5, 1.7), { m: top.clone().multiply(mat([Math.cos(a) * k * 1.25, 0.115 * Math.sqrt(Math.max(0, 1 - (k / 0.17) ** 2)) + 0.003, Math.sin(a) * k * 1.15], [0, a, 0])), color: SESAME_W });
  }
  // the cheese-slice collar: a square slice over his shoulders, one corner hanging down his chest
  A.add('chest', new THREE.BoxGeometry(0.4 * w, 0.014, 0.4).rotateY(Math.PI / 4), { m: mat([0, 0.3, 0.03], [0.12, 0, 0]), color: SLICE });
  A.add('chest', new THREE.ConeGeometry(0.09, 0.14, 4).rotateX(Math.PI).scale(1, 1, 0.25), { m: mat([0, 0.23, 0.23], [-0.4, Math.PI / 4, 0]), color: SLICE });
  // the bottom bun shell: a half shell round the lower belly (meatball.ts belly: r 0.27 × (1.42w, 0.92, 1.08) at y 0.08)
  A.add('hips', new THREE.SphereGeometry(0.29, ws, A.seg(7, 4), 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.42).scale(1.42 * w, 0.95, 1.1), { m: mat([0, 0.06, 0]), color: (_v, n) => (n.y < -0.4 ? rgb(BUN_DEEP) : rgb(BUN_GOLD)) });
  // the ketchup bottle in his left paw
  A.add('pawL', new THREE.CylinderGeometry(0.035, 0.04, 0.12, A.seg(8, 5)), { m: mat([0, 0.02, 0.05]), color: KETCHUP });
  A.add('pawL', new THREE.ConeGeometry(0.02, 0.05, 6), { m: mat([0, 0.1, 0.05]), color: KETCHUP });
  if (!f) return;
  // the lettuce cape: frilly leaves down his back
  for (let i = 0; i < 6; i++) {
    const a = Math.PI + (i - 2.5) * 0.32;
    leaf(A, 'chest', mat([Math.sin(a) * 0.22 * w, 0.16 - (i % 2) * 0.03, Math.cos(a) * 0.2], [0, a, 0]).multiply(mat([0, 0, 0], [0.9, 0, 0])), 0.16, i % 2 ? LETTUCE : LETTUCE_DEEP);
  }
  // a mustard drip on the bun shell and the bottle's cap
  A.add('hips', new THREE.ConeGeometry(0.02, 0.07, 5).rotateX(Math.PI), { m: mat([0.12 * w, 0.06, 0.28]), color: MUSTARD_Y });
  A.add('pawL', new THREE.CylinderGeometry(0.022, 0.022, 0.02, 6), { m: mat([0, 0.135, 0.05]), color: 0xfbf6ee });
}

/**
 * Mega Meal (Meatball, Mythic; skins v2 "Lunch Rush", the ladder's last step): a slider bun hat with a little patty and a
 * toothpick flag in place of the sweatband, and a gold napkin bib. The evolving form (the slider ring, then the double,
 * then the tower of five patties on a golden tray) is drawn by render/skins/coatTrail.ts round his body, not here.
 */
function megaMeal(A: Assembly, team: PartTeam): void {
  const f = full(A);
  const ws = A.seg(10, 7);
  const top = mat([0, 0.29, 0], [-0.1, 0, 0]);
  A.add('head', new THREE.CylinderGeometry(0.095, 0.1, 0.03, ws), { m: top, color: PATTY });
  A.add('head', new THREE.SphereGeometry(0.105, ws, A.seg(6, 4), 0, Math.PI * 2, 0, Math.PI * 0.5).scale(1, 0.7, 1), { m: top.clone().multiply(mat([0, 0.015, 0])), color: (_v, n) => (n.y > 0.3 ? rgb(BUN_GOLD) : rgb(BUN_PALE)) });
  A.add('head', new THREE.CylinderGeometry(0.11, 0.11, 0.008, ws), { m: top.clone().multiply(mat([0, -0.002, 0])), color: CHEDDAR });
  // the toothpick flag in the team colour
  A.add('head', new THREE.CylinderGeometry(0.005, 0.005, 0.16, 3), { m: top.clone().multiply(mat([0.02, 0.1, 0])), color: PICK });
  A.add('head', new THREE.BoxGeometry(0.06, 0.035, 0.004), { m: top.clone().multiply(mat([0.05, 0.16, 0])), color: team.main });
  if (!f) return;
  // a gold napkin bib under his chin
  A.add('chest', new THREE.ConeGeometry(0.09, 0.1, 3).rotateX(Math.PI).scale(1.4, 1, 0.3), { m: mat([0, 0.17, 0.2], [-0.3, 0, 0]), color: BOARD_GOLD });
}

/** The builders by coat id (render/chars/coatParts.ts COAT_PARTS holds the hero and the dropped gear). */
export const COAT_BUILDERS: Readonly<Record<string, (A: Assembly, team: PartTeam) => void>> = Object.freeze({
  'coat.clem.s1_sunforged': sunforged,
  'coat.brutus.store_thunderpaw': thunderpaw,
  [S1_PLUS_COAT]: eclipse,
  'coat.marshmallow.store_frostbell': frostbell,
  'coat.pixel.store_moonwhisker': moonwhisker,
  'coat.sage.store_bloomtail': bloomtail,
  'coat.clem.store_club_sandwich': clubSandwich,
  'coat.frankie.store_kebab_king': kebabKing,
  'coat.domino.store_pizzaiolo': pizzaiolo,
  'coat.nugget.store_robo_vac': roboVac,
  'coat.meatball.store_drive_thru': driveThru,
  'coat.frankie.store_paper_parade': paperParade,
  'coat.marshmallow.store_soft_serve': softServe,
  'coat.brutus.store_chairman': chairman,
  'coat.meatball.store_double_stack': doubleStack,
  'coat.meatball.store_mega_meal': megaMeal,
});
