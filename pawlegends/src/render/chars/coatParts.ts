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
 */
import * as THREE from 'three';
import type { HeroId } from '../../sim/api';
import { S1_PLUS_COAT } from '../../money/catalog';
import { C, mat, type Assembly, type Col, type RGB } from './chibi';
import type { BoneName } from './skeleton';

/** A base gear piece a coat may replace with its own. */
export type GearSlot = 'pauldrons';

export interface CoatPartsDef {
  hero: HeroId;
  /** Base gear the hero's gear() skips while this coat is worn (replaced by a part). */
  drops?: readonly GearSlot[];
  build(A: Assembly): void;
}

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

/**
 * Every Epic and Legendary coat (render/cosmetics.ts PAID_COATS rung ≥ EPIC) and its parts (named in
 * render/skins/coatVfx.ts for the store). The test
 * (tests/unit/coat-parts.test.ts) fails when an Epic+ coat is added without an entry here.
 */
export const COAT_PARTS: Readonly<Record<string, CoatPartsDef>> = Object.freeze({
  'coat.clem.s1_sunforged': { hero: 'clem', build: sunforged },
  'coat.brutus.store_thunderpaw': { hero: 'brutus', build: thunderpaw },
  [S1_PLUS_COAT]: { hero: 'duchess', build: eclipse },
  'coat.marshmallow.store_frostbell': { hero: 'marshmallow', build: frostbell },
  'coat.pixel.store_moonwhisker': { hero: 'pixel', build: moonwhisker },
  'coat.sage.store_bloomtail': { hero: 'sage', drops: ['pauldrons'], build: bloomtail },
});

/** The parts a hero wears with `coatId` (null: no parts, or another hero's coat). */
export function coatParts(coatId: string | null | undefined, hero: HeroId): CoatPartsDef | null {
  if (!coatId) return null;
  const p = COAT_PARTS[coatId];
  return p && p.hero === hero ? p : null;
}
