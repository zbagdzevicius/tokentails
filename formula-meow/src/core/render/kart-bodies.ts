/**
 * Kart body meshes (GDD 7, feel lane): one procedural low-poly shape per body id (content/ids.ts BODY_IDS), all
 * merged into one vertex-coloured geometry so a kart body is a single draw call. Coordinates are kart space:
 * +z forward, the wheels' axles at z +0.95 / −0.85, the seat around y 0.75. Looks only: the body's stats live in
 * content/karts.ts and apply in the sim.
 *
 * Every body also gets the shared parts (bumper, side pods, steering wheel, two exhaust pipes at x ±0.35,
 * y 0.45, z −1.15 where the boost flames come out), so items, flames and the cat sit the same on all of them.
 */
import type { BodyId, KartLook } from '../../types';
import { GeoBuilder } from './geo';
import { shadeHex } from './palette';

const DARK = 0x2a1a22;
const PI = Math.PI;

/** Seat height per body (the cat sits on it). */
export const SEAT_Y: Readonly<Record<BodyId, number>> = { 0: 0.45, 1: 0.45, 2: 0.42, 3: 0.5, 4: 0.36, 5: 0.52 };

function tunaCan(g: GeoBuilder, p0: number, p1: number, p2: number): void {
  // a squat round can with a ring pull spoiler
  g.cyl(0.78, 0.82, 0.62, 12, p0, { y: 0.48, rx: PI / 2, sy: 1.6, sz: 0.62 });
  g.cyl(0.8, 0.8, 0.12, 12, p1, { y: 0.48, z: 0.96, rx: PI / 2, sz: 0.62 });
  g.cyl(0.8, 0.8, 0.12, 12, p1, { y: 0.48, z: -0.96, rx: PI / 2, sz: 0.62 });
  // a fish on the label
  g.cone(0.14, 0.34, 3, p2, { x: 0.83, y: 0.5, z: 0.05, rz: -PI / 2, ry: PI / 2, sz: 0.3 });
  g.cone(0.14, 0.34, 3, p2, { x: -0.83, y: 0.5, z: 0.05, rz: PI / 2, ry: PI / 2, sz: 0.3 });
  g.box(1.2, 0.08, 0.5, p2, { y: 0.95, z: -0.95 });
  g.torus(0.22, 0.05, p1, { y: 1.08, z: -0.95, rx: PI / 2 }, undefined, 4, 10);
  g.box(0.9, 0.12, 0.6, DARK, { y: 0.78, z: 0.15 });
}

function shoebox(g: GeoBuilder, p0: number, p1: number, p2: number): void {
  // a cardboard box kart with flaps and a sneaker logo swoosh
  g.boxUp(1.5, 0.55, 2.1, p0, { y: 0.2 });
  g.box(1.52, 0.1, 0.5, p1, { y: 0.78, z: 0.8, rx: -0.5 });
  g.box(0.5, 0.06, 1.2, p1, { x: 0.95, y: 0.72, z: -0.2, rz: -0.6 });
  g.box(0.5, 0.06, 1.2, p1, { x: -0.95, y: 0.72, z: -0.2, rz: 0.6 });
  g.box(0.04, 0.12, 0.7, p2, { x: 0.76, y: 0.45, z: 0.1, rx: 0.25 });
  g.box(0.04, 0.12, 0.7, p2, { x: -0.76, y: 0.45, z: 0.1, rx: 0.25 });
  g.box(1.0, 0.12, 0.7, DARK, { y: 0.77, z: 0.0 });
}

function sardine(g: GeoBuilder, p0: number, p1: number, p2: number): void {
  // long fish nose, front and rear wings, a tail fin
  g.box(0.8, 0.42, 2.3, p0, { y: 0.45, z: 0.1 });
  g.cone(0.36, 1.0, 6, p0, { y: 0.42, z: 1.7, rx: PI / 2, sx: 1.1, sz: 0.7 });
  g.box(1.7, 0.08, 0.45, p1, { y: 0.3, z: 1.95 });
  g.box(1.5, 0.1, 0.5, p2, { y: 1.05, z: -1.05 });
  g.box(0.08, 0.5, 0.4, p2, { x: 0.65, y: 0.8, z: -1.05 });
  g.box(0.08, 0.5, 0.4, p2, { x: -0.65, y: 0.8, z: -1.05 });
  g.cone(0.4, 0.6, 3, p1, { y: 0.7, z: -1.45, rx: -PI / 2, sx: 0.25 });
  // the fish's eye on the nose
  g.sphere(0.09, 0xfff3dc, { x: 0.3, y: 0.52, z: 1.55 }, undefined, 6, 4);
  g.sphere(0.09, 0xfff3dc, { x: -0.3, y: 0.52, z: 1.55 }, undefined, 6, 4);
  g.box(0.9, 0.12, 0.6, DARK, { y: 0.7, z: -0.1 });
}

function laundryBasket(g: GeoBuilder, p0: number, p1: number, p2: number): void {
  // a woven oval basket: alternating bands, two handles, a folded towel over the back as the spoiler
  const band = shadeHex(p0, 0.78);
  for (let i = 0; i < 4; i++) {
    const y = 0.22 + i * 0.15;
    const r = 0.84 + i * 0.03;
    g.cyl(r + 0.015, r, 0.15, 14, i % 2 ? band : p0, { y, sx: 1, sz: 1.35 });
  }
  g.torus(0.9, 0.06, p1, { y: 0.82, rx: PI / 2, sy: 1.35 }, undefined, 4, 18);
  for (const s of [-1, 1]) g.torus(0.2, 0.05, p1, { x: s * 0.93, y: 0.72, ry: PI / 2 }, undefined, 4, 8);
  g.box(1.3, 0.16, 0.55, p2, { y: 0.95, z: -1.0, rx: 0.15 });
  g.box(1.3, 0.3, 0.12, p2, { y: 0.8, z: -1.26 });
  g.box(0.95, 0.12, 0.65, DARK, { y: 0.8, z: 0.1 });
}

function roomba(g: GeoBuilder, p0: number, p1: number, p2: number): void {
  // a robot vacuum disc: dark rim, bumper arc up front, a glowing button, a side brush
  g.cyl(1.05, 1.08, 0.34, 18, p0, { y: 0.36 });
  g.cyl(1.0, 1.0, 0.04, 18, shadeHex(p0, 1.15), { y: 0.55 });
  g.torus(1.06, 0.07, p2, { y: 0.32, rx: PI / 2, rz: 0 }, undefined, 4, 18);
  g.cyl(0.18, 0.18, 0.06, 10, p1, { y: 0.58, z: 0.55 });
  g.torus(0.18, 0.025, 0x2cf6f3, { y: 0.6, z: 0.55, rx: PI / 2 }, { vary: 0 }, 4, 12);
  // side brush
  for (let i = 0; i < 3; i++) g.box(0.05, 0.02, 0.4, p2, { x: 0.8, y: 0.2, z: 0.75, ry: (i * PI * 2) / 3 });
  g.box(0.9, 0.12, 0.6, DARK, { y: 0.62, z: -0.15 });
}

function teacup(g: GeoBuilder, p0: number, p1: number, p2: number): void {
  // a teacup on its saucer: a coloured band, the handle on the right, a tea bag tag as the flag
  g.cyl(1.2, 1.1, 0.1, 18, p1, { y: 0.2 });
  g.cyl(0.98, 0.68, 0.72, 16, p1, { y: 0.6 });
  g.cyl(0.95, 0.92, 0.14, 16, p0, { y: 0.82 });
  g.torus(0.97, 0.05, shadeHex(p1, 0.9), { y: 0.96, rx: PI / 2 }, undefined, 4, 18);
  g.torus(0.26, 0.07, p1, { x: 1.0, y: 0.62, rz: 0.2 }, undefined, 5, 10);
  // tea bag string and tag
  g.cyl(0.012, 0.012, 0.7, 3, 0xfff3dc, { x: -0.6, y: 1.2, z: -0.7, rz: 0.4 });
  g.box(0.24, 0.3, 0.03, p2, { x: -0.78, y: 1.5, z: -0.72 });
  g.box(0.95, 0.12, 0.65, DARK, { y: 0.84, z: 0.1 });
}

const BUILDERS: Readonly<Record<BodyId, (g: GeoBuilder, p0: number, p1: number, p2: number) => void>> = {
  0: tunaCan,
  1: shoebox,
  2: sardine,
  3: laundryBasket,
  4: roomba,
  5: teacup,
};

export function bodyIdOf(look: KartLook): BodyId {
  const b = Math.floor(look.body ?? 0);
  return (b >= 0 && b <= 5 ? b : 0) as BodyId;
}

/** The merged body geometry for a kart look (body shape + shared parts). */
export function bodyGeo(look: KartLook): GeoBuilder {
  const [p0, p1, p2] = look.paint;
  const g = new GeoBuilder();
  BUILDERS[bodyIdOf(look)](g, p0, p1, p2);
  // shared look language: bumper, side pods, steering wheel, exhaust pipes
  g.box(1.8, 0.16, 0.3, shadeHex(p0, 0.7), { y: 0.25, z: 1.25 });
  g.box(0.25, 0.25, 1.2, shadeHex(p0, 0.8), { x: 0.85, y: 0.32, z: 0.0 });
  g.box(0.25, 0.25, 1.2, shadeHex(p0, 0.8), { x: -0.85, y: 0.32, z: 0.0 });
  g.torus(0.16, 0.035, DARK, { y: 0.98, z: 0.55, rx: -0.9 }, undefined, 4, 10);
  g.cyl(0.03, 0.03, 0.3, 4, DARK, { y: 0.88, z: 0.5, rx: -0.9 });
  g.cyl(0.08, 0.1, 0.4, 6, 0x9a92b8, { x: 0.35, y: 0.45, z: -1.15, rx: PI / 2 });
  g.cyl(0.08, 0.1, 0.4, 6, 0x9a92b8, { x: -0.35, y: 0.45, z: -1.15, rx: PI / 2 });
  return g;
}
