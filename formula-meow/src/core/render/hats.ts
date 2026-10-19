/**
 * Hats (feel lane, content/ids.ts HAT_IDS): eight procedural low-poly hats that sit on the cat's head bone, so they
 * follow every head turn, flinch and celebration. Coordinates are cat space (metres before the rig's toy scale): the
 * head bone sits at the neck, the top of the skull is ~0.13 above it and the ears stand at x ±0.066.
 *
 * One merged geometry per hat (one draw call); the propeller's blades are a separate child so they can spin
 * (`spinHat`). The garage (progression lane) shows them on the same rig through `KartView`.
 */
import { Group, Mesh, type Material, type Object3D } from 'three';
import { HAT_IDS } from '../../content/ids';
import { GeoBuilder } from './geo';
import { toonMaterial } from './toon';

const PI = Math.PI;
const GOLD = 0xffc93c;
const PINK = 0xff5fa8;
const INK = 0x241a2a;
const CREAM = 0xfff3dc;

let shared: Material | null = null;
function hatMaterial(): Material {
  if (!shared) {
    shared = toonMaterial({ vertexColors: true });
    shared.userData.shared = true; // one material for every hat in every race (never disposed with a race)
  }
  return shared;
}

function crown(g: GeoBuilder): void {
  g.cyl(0.062, 0.058, 0.045, 10, GOLD, { y: 0.135 });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * PI * 2;
    g.cone(0.016, 0.045, 4, GOLD, { x: Math.sin(a) * 0.052, y: 0.18, z: Math.cos(a) * 0.052 });
    g.sphere(0.009, i % 2 ? 0xff3ea5 : 0x3aa8ff, { x: Math.sin(a) * 0.06, y: 0.138, z: Math.cos(a) * 0.06 }, { vary: 0 }, 5, 3);
  }
}

function beanie(g: GeoBuilder): void {
  g.sphere(0.092, 0x3bb273, { y: 0.1, z: 0.015, sy: 0.75 }, undefined, 10, 6);
  g.cyl(0.094, 0.094, 0.03, 12, CREAM, { y: 0.085, z: 0.015 });
  g.sphere(0.03, CREAM, { y: 0.175, z: 0.015 }, undefined, 6, 4);
}

function bow(g: GeoBuilder): void {
  // a big bow on the left ear
  g.cone(0.035, 0.06, 4, PINK, { x: 0.035 - 0.07, y: 0.16, z: 0.03, rz: PI / 2 });
  g.cone(0.035, 0.06, 4, PINK, { x: -0.035 - 0.07, y: 0.16, z: 0.03, rz: -PI / 2 });
  g.sphere(0.017, 0xff3ea5, { x: -0.07, y: 0.16, z: 0.03 }, undefined, 6, 4);
}

function topHat(g: GeoBuilder): void {
  g.cyl(0.1, 0.1, 0.012, 14, INK, { y: 0.128 });
  g.cyl(0.058, 0.062, 0.11, 12, INK, { y: 0.19 });
  g.cyl(0.0625, 0.0625, 0.022, 12, 0xff5a5f, { y: 0.147 });
}

function propeller(g: GeoBuilder): void {
  // quartered cap, a stick; the blades are a separate spinning child
  const cols = [0xff5a5f, 0xffc93c, 0x3aa8ff, 0x3bb273];
  for (let i = 0; i < 4; i++) g.sphere(0.09, cols[i], { y: 0.1, z: 0.01, sy: 0.7, ry: (i * PI) / 2 }, undefined, 3, 5);
  g.cyl(0.005, 0.005, 0.06, 4, INK, { y: 0.19, z: 0.01 });
}

function propellerBlades(g: GeoBuilder): void {
  g.box(0.16, 0.006, 0.026, 0xffc93c, { rx: 0.25 });
  g.box(0.026, 0.006, 0.16, 0xff5a5f, { rz: 0.25 });
  g.sphere(0.012, INK, {}, undefined, 5, 3);
}

function chef(g: GeoBuilder): void {
  g.cyl(0.07, 0.065, 0.07, 12, 0xffffff, { y: 0.15 });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * PI * 2;
    g.sphere(0.045, 0xffffff, { x: Math.sin(a) * 0.04, y: 0.205, z: Math.cos(a) * 0.04 }, undefined, 7, 5);
  }
  g.sphere(0.05, 0xffffff, { y: 0.225 }, undefined, 7, 5);
}

function party(g: GeoBuilder): void {
  g.cone(0.055, 0.15, 10, 0xb07fd8, { y: 0.2, rz: 0.12 });
  g.torus(0.04, 0.008, GOLD, { x: -0.006, y: 0.18, rx: PI / 2 }, { vary: 0 }, 4, 10);
  g.torus(0.026, 0.008, 0x2cf6f3, { x: -0.012, y: 0.22, rx: PI / 2 }, { vary: 0 }, 4, 10);
  g.sphere(0.02, 0xff3ea5, { x: -0.018, y: 0.275 }, undefined, 6, 4);
}

function pirate(g: GeoBuilder): void {
  g.cyl(0.07, 0.075, 0.05, 10, INK, { y: 0.15 });
  for (let i = 0; i < 3; i++) g.box(0.13, 0.05, 0.02, INK, { y: 0.16, ry: (i * PI * 2) / 3, z: 0, x: 0, sz: 1 }, undefined);
  g.box(0.2, 0.012, 0.18, INK, { y: 0.13 });
  g.sphere(0.016, CREAM, { y: 0.155, z: 0.076 }, { vary: 0 }, 6, 4);
}

const HATS: Readonly<Record<string, (g: GeoBuilder) => void>> = { crown, beanie, bow, tophat: topHat, propeller, chef, party, pirate };

/** Build hat `id` (index into HAT_IDS; 0 = none → null) to add under the cat's head bone. */
export function buildHat(id: number | undefined): Object3D | null {
  const key = HAT_IDS[id ?? 0];
  if (!key || key === 'none') return null;
  const make = HATS[key];
  if (!make) return null;
  const g = new GeoBuilder();
  make(g);
  const root = new Group();
  root.name = `hat-${key}`;
  root.add(new Mesh(g.build(), hatMaterial()));
  if (key === 'propeller') {
    const b = new GeoBuilder();
    propellerBlades(b);
    const blades = new Mesh(b.build(), hatMaterial());
    blades.name = 'hat-blades';
    blades.position.set(0, 0.225, 0.01);
    root.add(blades);
    root.userData.blades = blades;
  }
  return root;
}

/** Animate a hat (the propeller spins with speed). */
export function spinHat(hat: Object3D | null, speed: number, dt: number): void {
  const b = hat?.userData.blades as Object3D | undefined;
  if (b) b.rotation.y += dt * (6 + speed * 1.4);
}

/** Free a hat's geometry (the material is shared). */
export function disposeHat(hat: Object3D | null): void {
  hat?.traverse((o) => {
    const m = o as Mesh;
    if (m.isMesh) m.geometry.dispose();
  });
}
