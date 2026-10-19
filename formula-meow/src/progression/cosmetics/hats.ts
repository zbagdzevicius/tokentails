/**
 * Procedural hats for the 8 hat ids (content/ids.ts HAT_IDS), one merged low-poly mesh each, worn on the cat's head
 * bone. Crown, beanie, chef and party hat are adapted from bad-cat/src/render/actors/cosmetics.ts at 4889ed41 (copy,
 * never import); bow, top hat, propeller cap and pirate hat are new. Coordinates are head-bone space (the head sphere
 * is ~0.1 m with its top near y 0.13; the ears reach ~0.2), scaled up a little so a hat reads from the chase camera.
 * Pure three.js (works in Node, tested).
 */
import { Mesh, type BufferGeometry, type Object3D } from 'three';
import { GeoBuilder } from '../../core/render/geo';
import { toonMaterial } from '../../core/render/toon';
import { HAT_IDS, type HatId } from '../../content/ids';
import { HAT_INFO } from '../../content/cosmetics';

const NOFUR = { fur: 0, vary: 0.02 };
const GOLD = 0xffc93c;
const WHITE = 0xfffaf2;
const INK = 0x2a1a22;
/** hats sit between the ears, a touch oversized for the chase camera */
export const HAT_SCALE = 1.35;
export const HAT_NAME = 'fm-hat';

type Builder = (g: GeoBuilder, c: number) => void;

const BUILDERS: Readonly<Record<Exclude<HatId, 'none'>, Builder>> = {
  // Tiny crown: gold band with five points and a red gem (bad-cat)
  crown: (g, c) => {
    const y = 0.13;
    g.cylUp(0.05, 0.052, 0.028, 10, c, { y, z: 0.01 }, NOFUR);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      g.cone(0.013, 0.034, 4, c, { x: Math.sin(a) * 0.046, y: y + 0.042, z: 0.01 + Math.cos(a) * 0.046 }, NOFUR);
      g.sphere(0.006, WHITE, { x: Math.sin(a) * 0.046, y: y + 0.06, z: 0.01 + Math.cos(a) * 0.046 }, NOFUR, 4, 3);
    }
    g.sphere(0.01, 0xe63946, { y: y + 0.014, z: 0.062 }, NOFUR, 5, 4);
  },
  // Beanie: a knit cap with a rolled brim and pompom (bad-cat)
  beanie: (g, c) => {
    const y = 0.11;
    g.sphere(0.088, c, { y, z: 0.015, sy: 0.78 }, NOFUR, 9, 5);
    g.torus(0.085, 0.016, 0xfff3dc, { y, z: 0.015, rx: Math.PI / 2 - 0.1 }, NOFUR, 4, 14);
    g.sphere(0.026, WHITE, { y: y + 0.075, z: 0.01 }, NOFUR, 6, 4);
  },
  // Bow: two loops and a knot, tilted on one ear
  bow: (g, c) => {
    const x = 0.05;
    const y = 0.14;
    g.cone(0.035, 0.06, 4, c, { x: x - 0.03, y, z: 0.02, rz: Math.PI / 2, sz: 0.5 }, NOFUR);
    g.cone(0.035, 0.06, 4, c, { x: x + 0.03, y, z: 0.02, rz: -Math.PI / 2, sz: 0.5 }, NOFUR);
    g.sphere(0.017, 0xffffff, { x, y, z: 0.025 }, NOFUR, 6, 4);
    g.sphere(0.012, c, { x, y, z: 0.034 }, NOFUR, 5, 3);
  },
  // Top hat: wide brim, tall crown, a ribbon band
  tophat: (g, c) => {
    const y = 0.13;
    g.cyl(0.085, 0.085, 0.01, 14, c, { y, z: 0.01 }, NOFUR);
    g.cylUp(0.05, 0.054, 0.11, 12, c, { y: y + 0.005, z: 0.01 }, NOFUR);
    g.cylUp(0.0555, 0.0555, 0.022, 12, 0xff3ea5, { y: y + 0.012, z: 0.01 }, NOFUR);
  },
  // Propeller cap: a two-tone dome, a little peak and a spinning-looking prop
  propeller: (g, c) => {
    const y = 0.12;
    g.sphere(0.08, c, { y, z: 0.012, sy: 0.6 }, NOFUR, 8, 4);
    g.box(0.11, 0.008, 0.05, 0x3aa8ff, { y: y - 0.01, z: 0.085, rx: 0.15 }, NOFUR);
    g.cyl(0.006, 0.006, 0.04, 5, INK, { y: y + 0.06, z: 0.012 }, NOFUR);
    g.box(0.14, 0.006, 0.022, GOLD, { y: y + 0.082, z: 0.012, ry: 0.5 }, NOFUR);
    g.box(0.022, 0.006, 0.14, 0x3bb273, { y: y + 0.082, z: 0.012, ry: 0.5 }, NOFUR);
  },
  // Chef hat: white band and a puffy top (bad-cat)
  chef: (g, c) => {
    const y = 0.13;
    g.cylUp(0.052, 0.054, 0.045, 10, c, { y, z: 0.01 }, NOFUR);
    g.sphere(0.043, c, { x: -0.027, y: y + 0.068, z: 0.01 }, NOFUR, 6, 4);
    g.sphere(0.048, c, { x: 0.022, y: y + 0.072, z: 0.015 }, NOFUR, 6, 4);
    g.sphere(0.041, c, { y: y + 0.08, z: -0.022 }, NOFUR, 6, 4);
  },
  // Party hat: a striped cone with a pompom, tilted (bad-cat)
  party: (g, c) => {
    const y = 0.18;
    g.cone(0.05, 0.115, 6, c, { y, z: 0.0, rz: 0.2 }, NOFUR);
    g.torus(0.035, 0.007, 0xff4d8d, { x: 0.006, y: y - 0.022, rx: Math.PI / 2, rz: 0.2 }, NOFUR, 4, 10);
    g.torus(0.022, 0.006, GOLD, { x: -0.004, y: y + 0.01, rx: Math.PI / 2, rz: 0.2 }, NOFUR, 4, 10);
    g.sphere(0.017, GOLD, { x: -0.023, y: y + 0.058 }, NOFUR, 5, 4);
  },
  // Pirate hat: a dark tricorn with a white skull dot and gold trim
  pirate: (g, c) => {
    const y = 0.135;
    g.cyl(0.09, 0.09, 0.012, 3, c, { y, z: 0.0, ry: Math.PI }, NOFUR);
    g.sphere(0.065, c, { y: y + 0.02, z: 0.0, sy: 0.75 }, NOFUR, 8, 4);
    g.cyl(0.092, 0.092, 0.006, 3, GOLD, { y: y + 0.007, z: 0.0, ry: Math.PI }, NOFUR);
    g.sphere(0.017, WHITE, { y: y + 0.035, z: 0.058, sz: 0.4 }, NOFUR, 6, 4);
    g.box(0.03, 0.005, 0.004, WHITE, { y: y + 0.016, z: 0.062, rz: 0.6 }, NOFUR);
    g.box(0.03, 0.005, 0.004, WHITE, { y: y + 0.016, z: 0.062, rz: -0.6 }, NOFUR);
  },
};

/** The hat's geometry, or null for "none" and unknown ids. */
export function hatGeometry(index: number): BufferGeometry | null {
  const id = HAT_IDS[index];
  if (!id || id === 'none') return null;
  const g = new GeoBuilder();
  BUILDERS[id](g, HAT_INFO[id].color);
  return g.build();
}

/**
 * Put hat `index` on a head (replacing any hat this module put there). Returns the mesh, or null for no hat. The
 * mesh's geometry and material belong to it: KartView.dispose frees them with the kart.
 */
export function wearHat(head: Object3D, index: number): Mesh | null {
  const old = head.getObjectByName(HAT_NAME);
  if (old) {
    old.removeFromParent();
    const m = old as Mesh;
    m.geometry?.dispose();
    (m.material as { dispose?: () => void } | undefined)?.dispose?.();
  }
  const geo = hatGeometry(index);
  if (!geo) return null;
  const mesh = new Mesh(geo, toonMaterial({ vertexColors: true }));
  mesh.name = HAT_NAME;
  mesh.scale.setScalar(HAT_SCALE);
  mesh.position.y = -0.045; // the scale grows upward from the head bone; sit the brim back on the head
  head.add(mesh);
  return mesh;
}
