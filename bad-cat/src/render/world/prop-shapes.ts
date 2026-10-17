/**
 * Prop meshes for every kind in PROP_KINDS (1..63): small merged primitives with vertex colours (one material),
 * origin at the bottom centre, toy-scaled so they read at phone size. Footprint and height stay under 0.45 m except
 * the Christmas tree (~1.6 m tall), the tablecloth (spans its w x d cells, `buildClothGeometry`) and the cardboard
 * box (~0.4 m). Stack kinds are built from their items (`stackLayout` + `buildStackPieceGeometry`) so the stack at
 * rest and the pieces that tumble apart line up exactly. Pure three.js maths: works in Node.
 */
import type { BufferGeometry } from 'three';
import { CELL_M, propKind } from '../../types';
import { GeoBuilder, hash01, type AddOpts, type Xf } from '../geo';
import { PAL, mixHex, shadeHex } from '../palette';

const AO: AddOpts = { aoFloor: 0, aoStrength: 0.18 };

// ---------------------------------------------------------------------------------------------
// Stacks
// ---------------------------------------------------------------------------------------------

export interface StackItem {
  x: number;
  y: number;
  z: number;
  ry: number;
  /** colour variant (tint index, `stackTint`) */
  v: number;
  /** uniform size of the item relative to the loose-piece geometry (gifts and boxes shrink up the stack) */
  k: number;
}

export interface StackLayout {
  items: StackItem[];
  /** loose-piece geometries per kind (always 1: colour and size are per instance) */
  variants: number;
  /** final tumble tilt of a loose piece: PI = lands flat (upside down), PI/2 = rolls onto its side */
  tilt: number;
}

const BOOK_COLS = [0x6b8fd6, 0xe8b04a, 0xd9574f, 0x7fbf8e, 0xb07fd8];

/** Item layout of a stack kind (null for other kinds). Item count = PropKindDef.stack.items. */
export function stackLayout(kind: number): StackLayout | null {
  const def = propKind(kind);
  const n = def?.stack?.items ?? 0;
  if (!n) return null;
  const items: StackItem[] = [];
  switch (kind) {
    case 3: // plates
      for (let i = 0; i < n; i++) items.push({ x: (i % 3) * 0.006 - 0.006, y: i * 0.024, z: ((i * 7) % 3) * 0.005 - 0.005, ry: 0, v: i % 2, k: 1 });
      return { items, variants: 1, tilt: Math.PI };
    case 15: // books
      for (let i = 0; i < n; i++) items.push({ x: (hash01(i + 3) - 0.5) * 0.02, y: i * 0.046, z: (hash01(i + 9) - 0.5) * 0.02, ry: [0.1, -0.15, 0.25, -0.05, 0.18][i % 5], v: i % 3, k: 1 });
      return { items, variants: 1, tilt: Math.PI };
    case 27: {
      // cups pyramid 3-2-1
      const rows = [3, 2, 1];
      let k = 0;
      for (let r = 0; r < rows.length && k < n; r++)
        for (let i = 0; i < rows[r] && k < n; i++, k++) items.push({ x: (i - (rows[r] - 1) / 2) * 0.115, y: r * 0.105, z: 0, ry: 0, v: 0, k: 1 });
      return { items, variants: 1, tilt: Math.PI / 2 };
    }
    case 30: {
      // gifts: big, medium, small
      let y = 0;
      for (let i = 0; i < n; i++) {
        const k = [1, 0.8, 0.64][i % 3];
        items.push({ x: (i % 2 ? 0.02 : -0.01), y, z: (i % 2 ? -0.015 : 0.01), ry: i * 0.35, v: i % 3, k });
        y += 0.13 * k;
      }
      return { items, variants: 1, tilt: Math.PI };
    }
    case 41: // snack tower: crisp tubes in four flavours
      for (let i = 0; i < n; i++) items.push({ x: 0, y: i * 0.1, z: 0, ry: i * 0.5, v: i % 4, k: 1 });
      return { items, variants: 1, tilt: Math.PI / 2 };
    case 46: // towels
      for (let i = 0; i < n; i++) items.push({ x: (i % 2) * 0.01, y: i * 0.07, z: 0, ry: (i % 2) * 0.12, v: i % 2, k: 1 });
      return { items, variants: 1, tilt: Math.PI };
    case 51: {
      let y = 0;
      for (let i = 0; i < n; i++) {
        const k = [1, 0.85, 0.7][i % 3];
        items.push({ x: (i % 2 ? -0.015 : 0.01), y, z: 0, ry: (i - 1) * 0.2, v: i % 3, k });
        y += 0.15 * k;
      }
      return { items, variants: 1, tilt: Math.PI };
    }
    case 64: // perfume tray: four bottles on a mirrored tray, two by two
      for (let i = 0; i < n; i++) items.push({ x: ((i % 2) - 0.5) * 0.09, y: 0, z: (Math.floor(i / 2) - 0.5) * 0.08, ry: i * 0.6, v: i % 4, k: 1 - (i % 2) * 0.15 });
      return { items, variants: 1, tilt: Math.PI / 2 };
    case 55: {
      // champagne coupes 3-2-1
      const rows = [3, 2, 1];
      let k = 0;
      for (let r = 0; r < rows.length && k < n; r++)
        for (let i = 0; i < rows[r] && k < n; i++, k++) items.push({ x: (i - (rows[r] - 1) / 2) * 0.125, y: r * 0.115, z: 0, ry: 0, v: 0, k: 1 });
      return { items, variants: 1, tilt: Math.PI / 2 };
    }
    default:
      for (let i = 0; i < n; i++) items.push({ x: 0, y: i * 0.06, z: 0, ry: 0, v: 0, k: 1 });
      return { items, variants: 1, tilt: Math.PI };
  }
}

/** Multiply two 0xRRGGBB colours (sRGB, per channel). */
function mulHex(a: number, b: number): number {
  const ch = (s: number) => Math.round((((a >> s) & 255) * ((b >> s) & 255)) / 255);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/**
 * Tint of stack item variant `v`: loose pieces are ONE neutral geometry per kind (white body, grey accents) drawn
 * with this per-instance colour, so a stack kind costs one draw call however many colours its items have. The
 * stack at rest is built from the same neutral parts multiplied by the same tint, so nothing changes colour when it
 * splits.
 */
export function stackTint(kind: number, v: number): number {
  const c = propKind(kind)?.color ?? 0xcccccc;
  switch (kind) {
    case 3:
      return v % 2 ? 0x9cc7e8 : c;
    case 15:
      return BOOK_COLS[v % BOOK_COLS.length];
    case 30:
      return [c, 0xff8fab, 0xffd166][v % 3];
    case 41:
      return [c, 0xe63946, 0x3d5a80, 0x8ac926][v % 4];
    case 46:
      return v % 2 ? 0xffffff : c;
    case 51:
      return mixHex(c, 0xffffff, (v % 3) * 0.1);
    case 64:
      return [c, 0xc77dff, 0x9fd3ff, 0xffd166][v % 4];
    default:
      return c;
  }
}

/** Add one stack item into `g` at transform t: neutral colours when `tint` is 0xffffff (loose piece). */
function addStackPiece(g: GeoBuilder, kind: number, tint: number, t: Xf, ao?: AddOpts, k = 1): void {
  const col = (hex: number) => mulHex(hex, tint);
  const at = (x: number, y: number, z: number, extra?: Xf): Xf => {
    const ry = t.ry ?? 0;
    const cs = Math.cos(ry);
    const sn = Math.sin(ry);
    return { ...extra, x: (t.x ?? 0) + x * cs + z * sn, y: (t.y ?? 0) + y, z: (t.z ?? 0) - x * sn + z * cs, ry: ry + (extra?.ry ?? 0) };
  };
  switch (kind) {
    case 3: {
      g.cylUp(0.135, 0.11, 0.02, 11, col(0xffffff), at(0, 0, 0), ao);
      g.cylUp(0.09, 0.09, 0.004, 11, col(0xf0f0f0), at(0, 0.02, 0));
      break;
    }
    case 15: {
      g.boxUp(0.21, 0.044, 0.16, col(0xffffff), at(0, 0, 0), ao);
      g.boxUp(0.2, 0.034, 0.004, col(0xf2ead8), at(0, 0.005, 0.081));
      g.boxUp(0.004, 0.034, 0.15, col(0xf2ead8), at(0.104, 0.005, 0));
      g.boxUp(0.03, 0.046, 0.163, col(0xc8c8c8), at(-0.09, -0.001, 0));
      break;
    }
    case 27: {
      g.cylUp(0.052, 0.038, 0.1, 9, col(0xffffff), at(0, 0, 0), ao);
      g.cylUp(0.054, 0.054, 0.012, 9, 0xffffff, at(0, 0.088, 0));
      g.cylUp(0.04, 0.04, 0.004, 9, col(0x999999), at(0, 0.0, 0));
      break;
    }
    case 30: {
      // k = item size (gifts shrink up the stack); the ribbon is a darker band of the paper colour
      const sz = 0.24 * k;
      const h = 0.13 * k;
      g.boxUp(sz, h, sz, col(0xffffff), at(0, 0, 0), ao);
      g.boxUp(sz + 0.004 * k, h + 0.004 * k, 0.025 * k, col(0x8a8a8a), at(0, -0.002 * k, 0));
      g.boxUp(0.025 * k, h + 0.004 * k, sz + 0.004 * k, col(0x8a8a8a), at(0, -0.002 * k, 0));
      g.torus(0.03 * k, 0.01 * k, col(0x8a8a8a), at(-0.02 * k, h + 0.012 * k, 0, { rx: 0.3, ry: 0.5 }), undefined, 4, 8);
      g.torus(0.03 * k, 0.01 * k, col(0x8a8a8a), at(0.02 * k, h + 0.012 * k, 0, { rx: 0.3, ry: -0.5 }), undefined, 4, 8);
      break;
    }
    case 41: {
      g.cylUp(0.05, 0.05, 0.095, 9, col(0xffffff), at(0, 0, 0), ao);
      g.cylUp(0.051, 0.051, 0.03, 9, col(0x8a8a8a), at(0, 0.035, 0));
      g.cylUp(0.052, 0.052, 0.008, 9, 0xd7dde3, at(0, 0.093, 0));
      break;
    }
    case 46: {
      g.boxUp(0.26, 0.065, 0.18, col(0xffffff), at(0, 0, 0), ao);
      g.cyl(0.033, 0.033, 0.18, 7, col(0xffffff), at(0.13, 0.033, 0, { rx: Math.PI / 2 }));
      g.boxUp(0.262, 0.014, 0.03, col(0xa8a8a8), at(0, 0.051, 0.04));
      break;
    }
    case 51: {
      const sz = 0.26 * k;
      const h = 0.15 * k;
      g.boxUp(sz, h, sz * 0.85, col(0xffffff), at(0, 0, 0), ao);
      g.boxUp(0.05 * k, 0.004 * k, sz * 0.85 + 0.004 * k, col(0xf2ead8), at(0, h, 0));
      g.boxUp(sz * 0.4, h * 0.3, 0.004 * k, 0xe63946, at(-sz * 0.15, h * 0.4, sz * 0.425 + 0.002 * k));
      g.cone(0.018 * k, 0.03 * k, 3, 0x3a2a2a, at(sz * 0.25, h * 0.6, sz * 0.425 + 0.003 * k, { rx: Math.PI / 2, sz: 0.2 }));
      break;
    }
    case 55: {
      const c = propKind(55)?.color ?? 0xf7e7b4;
      g.cylUp(0.035, 0.035, 0.006, 8, 0xf7f3ea, at(0, 0, 0), ao);
      g.cylUp(0.007, 0.007, 0.055, 5, 0xf7f3ea, at(0, 0.006, 0));
      g.cylUp(0.058, 0.02, 0.045, 10, 0xf2f6fa, at(0, 0.06, 0));
      g.cylUp(0.054, 0.054, 0.008, 10, c, at(0, 0.093, 0));
      g.sphere(0.006, 0xffffff, at(0.02, 0.1, 0.01), { vary: 0 }, 4, 3);
      break;
    }
    case 64: {
      // one faceted perfume bottle with a gold cap (k: a little smaller every other bottle)
      g.cylUp(0.032 * k, 0.036 * k, 0.085 * k, 6, col(0xffffff), at(0, 0, 0), ao);
      g.cylUp(0.028 * k, 0.028 * k, 0.05 * k, 6, col(0xf2f2f2), at(0, 0.012 * k, 0));
      g.cylUp(0.014 * k, 0.018 * k, 0.022 * k, 8, 0xe8b04a, at(0, 0.085 * k, 0));
      break;
    }
    default:
      g.boxUp(0.2, 0.06, 0.2, col(0xffffff), at(0, 0, 0), ao);
  }
}

/** One loose stack item (origin at its bottom centre) for the tumbling pieces. */
export function buildStackPieceGeometry(kind: number): BufferGeometry {
  const g = new GeoBuilder();
  addStackPiece(g, kind, 0xffffff, {}, AO, 1);
  return g.build();
}

// ---------------------------------------------------------------------------------------------
// Special shapes
// ---------------------------------------------------------------------------------------------

/** Checked tablecloth spanning w x d cells (origin at the centre of the first cell's top), aprons on every side. */
export function buildClothGeometry(w = 1, d = 1, color?: number): BufferGeometry {
  const c = color ?? propKind(14)?.color ?? 0xe25b5b;
  const g = new GeoBuilder();
  const W = Math.max(1, w) * CELL_M;
  const D = Math.max(1, d) * CELL_M;
  const ox = (Math.max(1, w) - 1) * CELL_M * 0.5;
  const oz = (Math.max(1, d) - 1) * CELL_M * 0.5;
  g.boxUp(W, 0.006, D, c, { x: ox, z: oz }, { vary: 0 });
  const n = 4;
  const nx = Math.max(1, w) * n;
  const nz = Math.max(1, d) * n;
  for (let i = 0; i < nx; i++)
    for (let k = 0; k < nz; k++) {
      if ((i + k) % 2) continue;
      g.boxUp(CELL_M / n, 0.002, CELL_M / n, 0xfff4ea, { x: ox - W / 2 + (i + 0.5) * (CELL_M / n), y: 0.006, z: oz - D / 2 + (k + 0.5) * (CELL_M / n) }, { vary: 0 });
    }
  // aprons hanging over the edges (only the front one for a single-cell cloth, like the M0 decoration)
  g.box(W, 0.06, 0.006, c, { x: ox, y: -0.026, z: oz + D / 2 }, { vary: 0 });
  if (w > 1 || d > 1) {
    g.box(W, 0.06, 0.006, c, { x: ox, y: -0.026, z: oz - D / 2 }, { vary: 0 });
    g.box(0.006, 0.06, D, c, { x: ox - W / 2, y: -0.026, z: oz }, { vary: 0 });
    g.box(0.006, 0.06, D, c, { x: ox + W / 2, y: -0.026, z: oz }, { vary: 0 });
    for (let i = 0; i < nx; i += 2) g.box(0.012, 0.012, 0.012, 0xfff4ea, { x: ox - W / 2 + (i + 0.5) * (CELL_M / n), y: -0.058, z: oz + D / 2 }, { vary: 0 });
  }
  return g.build();
}

/** Cardboard box (kind 54): flaps half up at rest, flung wide open when the cat sits in it. */
export function buildBoxGeometry(open: boolean): BufferGeometry {
  const c = propKind(54)?.color ?? 0xb08955;
  const g = new GeoBuilder();
  const s = 0.38;
  const h = 0.26;
  const t = 0.012;
  g.boxUp(s, 0.012, s, shadeHex(c, 0.7), {}, AO);
  for (const [x, z, w, d] of [
    [0, s / 2 - t / 2, s, t],
    [0, -s / 2 + t / 2, s, t],
    [s / 2 - t / 2, 0, t, s],
    [-s / 2 + t / 2, 0, t, s],
  ] as const)
    g.boxUp(w, h, d, c, { x, z }, AO);
  // inside shade
  g.boxUp(s - 0.03, 0.004, s - 0.03, shadeHex(c, 0.55), { y: 0.012 });
  // tape and a "THIS SIDE UP" arrow on the front
  g.boxUp(0.06, h * 0.5, 0.004, 0xe9d8b4, { y: h * 0.5, z: s / 2 + 0.002 });
  g.cone(0.03, 0.05, 3, 0x6b4a2e, { x: 0.1, y: h * 0.62, z: s / 2 + 0.004, rx: Math.PI / 2, sz: 0.15 });
  g.boxUp(0.012, 0.05, 0.004, 0x6b4a2e, { x: 0.1, y: h * 0.32, z: s / 2 + 0.004 });
  // flaps hinged on the top edges
  const a = open ? 2.2 : 0.18;
  const fl = s * 0.48;
  for (const side of [0, 1, 2, 3]) {
    const ry = (side * Math.PI) / 2;
    const cs = Math.cos(ry);
    const sn = Math.sin(ry);
    const hx = sn * (s / 2);
    const hz = cs * (s / 2);
    // flap centre: hinge + rotate out by a
    const ox = sn * Math.sin(a) * fl * 0.5;
    const oz = cs * Math.sin(a) * fl * 0.5;
    const oy = Math.cos(a) * fl * 0.5;
    g.box(s - 0.01, fl, 0.01, side % 2 ? shadeHex(c, 1.06) : c, { x: hx + ox, y: h + oy, z: hz + oz, ry, rx: a }, { vary: 0.02 });
  }
  return g.build();
}

/** Christmas tree (kind 17): ~1.62 m tall, ornaments, tinsel and a star. */
function tree(g: GeoBuilder, c: number): void {
  g.cylUp(0.16, 0.13, 0.14, 9, 0xb5533c, {}, AO);
  g.cylUp(0.17, 0.17, 0.03, 9, 0xe8b04a, { y: 0.12 });
  g.cylUp(0.045, 0.05, 0.25, 6, 0x6b4a2e, { y: 0.14 });
  const tiers = [
    [0.36, 0.5, 0.3],
    [0.3, 0.45, 0.62],
    [0.23, 0.4, 0.92],
    [0.15, 0.34, 1.18],
  ];
  for (let i = 0; i < tiers.length; i++) {
    const [r, h, y] = tiers[i];
    g.cone(r, h, 8, i % 2 ? c : shadeHex(c, 1.12), { y: y + h / 2, ry: i * 0.4 });
    // snowy tips
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + i * 0.4;
      g.sphere(0.022, 0xf7fbff, { x: Math.sin(a) * r * 0.92, y: y + 0.02, z: Math.cos(a) * r * 0.92 }, { vary: 0 }, 4, 3);
    }
  }
  // ornaments and a gold tinsel spiral
  const orn = [0xe63946, 0xffd166, 0x4dabff, 0xff8fab, 0xffffff];
  for (let i = 0; i < 14; i++) {
    const t = i / 14;
    const y = 0.36 + t * 1.0;
    const r = 0.33 - t * 0.2;
    const a = i * 2.4;
    g.sphere(0.035, orn[i % orn.length], { x: Math.sin(a) * r, y, z: Math.cos(a) * r }, { vary: 0 }, 6, 4);
  }
  for (let i = 0; i < 26; i++) {
    const t = i / 26;
    const y = 0.32 + t * 1.05;
    const r = 0.36 - t * 0.24;
    const a = t * Math.PI * 5;
    g.box(0.05, 0.016, 0.016, 0xffd166, { x: Math.sin(a) * r, y, z: Math.cos(a) * r, ry: a }, { vary: 0.05 });
  }
  // star
  g.cone(0.07, 0.05, 5, 0xffd166, { y: 1.57, rx: Math.PI / 2 }, { vary: 0 });
  g.cone(0.07, 0.05, 5, 0xffd166, { y: 1.57, rx: -Math.PI / 2 }, { vary: 0 });
}

// ---------------------------------------------------------------------------------------------
// The catalog
// ---------------------------------------------------------------------------------------------

/** Merged low-poly geometry for a prop kind (unknown kinds get a coloured crate). */
export function buildPropGeometry(kind: number): BufferGeometry {
  const def = propKind(kind);
  const c = def?.color ?? 0xcccccc;
  const g = new GeoBuilder();
  const stack = stackLayout(kind);
  if (stack) {
    for (let i = 0; i < stack.items.length; i++) {
      const it = stack.items[i];
      addStackPiece(g, kind, stackTint(kind, it.v), { x: it.x, y: it.y, z: it.z, ry: it.ry }, i === 0 ? AO : undefined, it.k);
    }
    if (kind === 55) {
      // a little champagne pour on top
      g.cone(0.012, 0.06, 5, 0xf7e7b4, { y: 0.4 }, { vary: 0 });
    }
    return g.build();
  }
  switch (kind) {
    case 1: {
      g.cylUp(0.075, 0.08, 0.014, 9, c, {}, AO);
      g.cylUp(0.013, 0.013, 0.13, 5, c, { y: 0.014 });
      g.cylUp(0.078, 0.032, 0.1, 9, c, { y: 0.14 });
      g.cylUp(0.074, 0.074, 0.012, 9, 0x9b1b3a, { y: 0.236 });
      g.torus(0.078, 0.008, shadeHex(c, 1.05), { y: 0.246, rx: Math.PI / 2 }, undefined, 3, 12);
      g.box(0.012, 0.06, 0.004, 0xffffff, { x: -0.045, y: 0.19, z: 0.06, rz: 0.15 }, { vary: 0 });
      break;
    }
    case 2: {
      g.cylUp(0.078, 0.072, 0.14, 9, c, {}, AO);
      g.cylUp(0.08, 0.08, 0.026, 9, 0xfff1e6, { y: 0.05 });
      g.cylUp(0.068, 0.068, 0.01, 9, 0x5a3424, { y: 0.134 });
      g.torus(0.042, 0.014, c, { x: 0.085, y: 0.075 }, undefined, 4, 8);
      break;
    }
    case 4: {
      g.cylUp(0.135, 0.07, 0.085, 9, c, {}, AO);
      g.cylUp(0.06, 0.07, 0.012, 9, shadeHex(c, 0.8));
      g.sphere(0.055, 0xff9a3c, { x: 0.045, y: 0.105, z: 0.02 });
      g.sphere(0.05, 0xe2453c, { x: -0.05, y: 0.105, z: -0.005 });
      g.cylUp(0.005, 0.005, 0.03, 4, 0x6b4a2e, { x: -0.05, y: 0.15, z: -0.005 });
      g.sphere(0.047, 0x9ccc5a, { x: -0.005, y: 0.12, z: -0.06 });
      for (let i = 0; i < 4; i++) g.box(0.05, 0.03, 0.035, 0xffd84a, { x: -0.06 + i * 0.04, y: 0.15 + Math.sin((i / 3) * Math.PI) * 0.03, z: 0.05, rz: 0.5 - i * 0.33 });
      break;
    }
    case 5: {
      g.boxUp(0.27, 0.055, 0.15, c, {}, AO);
      for (let i = 0; i < 6; i++) g.sphere(0.033, 0xfff6e4, { x: -0.085 + (i % 3) * 0.085, y: 0.065, z: i < 3 ? -0.037 : 0.037, sy: 1.25 });
      g.box(0.27, 0.014, 0.15, shadeHex(c, 1.05), { y: 0.11, z: -0.11, rx: -1.15 });
      break;
    }
    case 6: {
      g.cylUp(0.155, 0.155, 0.014, 12, 0xffffff, {}, AO);
      g.cylUp(0.125, 0.125, 0.09, 12, c, { y: 0.014 });
      g.cylUp(0.128, 0.128, 0.02, 12, 0xfffbf4, { y: 0.1 });
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        g.box(0.03, 0.035, 0.02, 0xfffbf4, { x: Math.sin(a) * 0.124, y: 0.085, z: Math.cos(a) * 0.124, ry: a });
      }
      g.cylUp(0.08, 0.08, 0.07, 10, shadeHex(c, 1.06), { y: 0.12 });
      g.cylUp(0.083, 0.083, 0.015, 10, 0xfffbf4, { y: 0.185 });
      g.sphere(0.022, 0xe0233f, { x: 0.035, y: 0.215, z: 0.02 });
      g.cylUp(0.009, 0.009, 0.06, 5, 0x8fd3ff, { x: -0.02, y: 0.2 });
      g.cone(0.012, 0.03, 5, 0xffc93c, { x: -0.02, y: 0.275 }, { vary: 0 });
      break;
    }
    case 7: {
      g.cylUp(0.055, 0.07, 0.12, 8, c, {}, AO);
      g.cylUp(0.04, 0.055, 0.06, 8, shadeHex(c, 1.08), { y: 0.12 });
      g.cylUp(0.045, 0.045, 0.012, 8, shadeHex(c, 0.85), { y: 0.18 });
      const heads = [0xff8fb1, 0xffd84a, 0xffffff, 0xff7a6b];
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.4;
        const hx = Math.sin(a) * 0.035;
        const hz = Math.cos(a) * 0.035;
        g.cylUp(0.005, 0.005, 0.15, 4, PAL.leafDark, { x: hx * 0.6, y: 0.18, z: hz * 0.6, rx: hz * 4, rz: -hx * 4 });
        g.ico(0.034, heads[i], { x: hx * 1.8, y: 0.33 + (i % 2) * 0.02, z: hz * 1.8 });
        g.ico(0.012, 0xffc93c, { x: hx * 1.8, y: 0.36 + (i % 2) * 0.02, z: hz * 1.8 });
      }
      g.cone(0.03, 0.07, 4, PAL.leaf, { x: 0.04, y: 0.23, rz: -0.6 });
      break;
    }
    case 8: {
      g.cylUp(0.1, 0.075, 0.12, 8, c, {}, AO);
      g.cylUp(0.108, 0.108, 0.028, 8, shadeHex(c, 1.1), { y: 0.11 });
      g.cylUp(0.092, 0.092, 0.01, 8, 0x5a3b2a, { y: 0.128 });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        g.cone(0.045, 0.2, 4, i % 2 ? PAL.leaf : PAL.leafDark, { x: Math.sin(a) * 0.04, y: 0.22, z: Math.cos(a) * 0.04, rx: Math.cos(a) * 0.45, rz: -Math.sin(a) * 0.45, sz: 0.35 });
      }
      g.cone(0.05, 0.24, 4, PAL.leaf, { y: 0.25, sz: 0.4 });
      break;
    }
    case 9: {
      // table lamp: round base, brass stem, a fat pleated shade, the cable stub at the back
      g.cylUp(0.09, 0.1, 0.03, 10, shadeHex(c, 0.7), {}, AO);
      g.cylUp(0.06, 0.07, 0.02, 10, c, { y: 0.03 });
      g.cylUp(0.012, 0.012, 0.2, 6, c, { y: 0.05 });
      g.sphere(0.04, 0xfff8e0, { y: 0.24 }, { vary: 0 }, 6, 4);
      g.cylUp(0.08, 0.15, 0.17, 10, 0xfff1c9, { y: 0.21 });
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        g.box(0.008, 0.17, 0.008, 0xf2dfae, { x: Math.sin(a) * 0.115, y: 0.295, z: Math.cos(a) * 0.115, ry: a, rx: Math.cos(a) * 0.38, rz: -Math.sin(a) * 0.38 }, { vary: 0 });
      }
      g.cylUp(0.082, 0.082, 0.01, 10, c, { y: 0.375 });
      g.box(0.03, 0.012, 0.04, 0x2b2d42, { y: 0.015, z: -0.1 });
      break;
    }
    case 10: {
      g.boxUp(0.085, 0.03, 0.23, c, {}, AO);
      g.boxUp(0.026, 0.008, 0.026, 0xe2453c, { y: 0.03, z: 0.08 });
      for (let i = 0; i < 6; i++) g.boxUp(0.018, 0.006, 0.018, 0x9aa0ae, { x: (i % 2) * 0.03 - 0.015, y: 0.03, z: 0.03 - Math.floor(i / 2) * 0.03 });
      g.boxUp(0.04, 0.006, 0.02, 0x7cc36a, { y: 0.03, z: -0.08 });
      break;
    }
    case 11: {
      g.boxUp(0.31, 0.022, 0.22, c, {}, AO);
      g.boxUp(0.27, 0.004, 0.12, 0x5d6170, { y: 0.022, z: -0.02 });
      g.boxUp(0.1, 0.003, 0.05, 0x9ea2ae, { y: 0.022, z: 0.07 });
      g.box(0.31, 0.2, 0.016, c, { y: 0.12, z: -0.13, rx: -0.28 });
      g.box(0.28, 0.17, 0.004, 0x6fb7e8, { y: 0.12, z: -0.12, rx: -0.28 }, { vary: 0 });
      g.box(0.05, 0.05, 0.004, 0xff8fb1, { x: 0.06, y: 0.15, z: -0.141, rx: -0.28 });
      break;
    }
    case 12: {
      // toilet roll with a tail of paper flopping over
      g.cylUp(0.06, 0.06, 0.11, 10, c, {}, AO);
      g.cylUp(0.022, 0.022, 0.112, 8, 0xc9a878, {});
      g.box(0.08, 0.004, 0.09, c, { x: 0.0, y: 0.06, z: 0.07, rx: 1.35 });
      g.box(0.08, 0.004, 0.05, shadeHex(c, 0.97), { y: 0.004, z: 0.12 });
      for (let i = 0; i < 3; i++) g.box(0.08, 0.002, 0.003, 0xe9e3d6, { y: 0.0065, z: 0.1 + i * 0.014 }, { vary: 0 });
      break;
    }
    case 13: {
      // faceted perfume bottle with a bulb atomiser
      g.cylUp(0.055, 0.06, 0.13, 6, c, {}, AO);
      g.cylUp(0.05, 0.05, 0.08, 6, mixHex(c, 0xffffff, 0.35), { y: 0.02 });
      g.cylUp(0.022, 0.03, 0.03, 8, 0xe8b04a, { y: 0.13 });
      g.cylUp(0.012, 0.012, 0.03, 6, 0xe8b04a, { y: 0.16 });
      g.cyl(0.006, 0.006, 0.07, 4, 0xe8b04a, { x: 0.035, y: 0.18, rz: Math.PI / 2 });
      g.sphere(0.03, 0xff4d8d, { x: 0.075, y: 0.17 }, undefined, 6, 5);
      g.box(0.01, 0.06, 0.004, 0xffffff, { x: -0.025, y: 0.07, z: 0.05 }, { vary: 0 });
      break;
    }
    case 14: {
      return buildClothGeometry(1, 1, c);
    }
    case 16: {
      // glass bauble with a gold cap and hook, on a little stand
      g.cylUp(0.05, 0.06, 0.02, 8, 0xe8b04a, {}, AO);
      g.sphere(0.075, c, { y: 0.095 }, undefined, 9, 7);
      g.torus(0.075, 0.008, 0xffffff, { y: 0.095, rx: Math.PI / 2 }, { vary: 0 }, 3, 14);
      g.torus(0.06, 0.006, 0xffd166, { y: 0.135, rx: Math.PI / 2 }, { vary: 0 }, 3, 12);
      g.cylUp(0.022, 0.022, 0.025, 8, 0xffd166, { y: 0.165 });
      g.torus(0.014, 0.004, 0xffd166, { y: 0.2 }, undefined, 3, 8);
      g.sphere(0.018, 0xffffff, { x: -0.03, y: 0.12, z: 0.05 }, { vary: 0 }, 5, 4);
      break;
    }
    case 17: {
      tree(g, c);
      break;
    }
    case 18: {
      g.boxUp(0.12, 0.024, 0.25, shadeHex(c, 0.82), {}, AO);
      g.boxUp(0.115, 0.05, 0.13, c, { y: 0.024, z: 0.05 });
      g.sphere(0.035, 0xffffff, { y: 0.085, z: 0.08 });
      g.sphere(0.012, 0x2b2d42, { x: -0.025, y: 0.09, z: 0.11 }, { vary: 0 }, 4, 3);
      g.sphere(0.012, 0x2b2d42, { x: 0.025, y: 0.09, z: 0.11 }, { vary: 0 }, 4, 3);
      break;
    }
    case 19: {
      g.boxUp(0.075, 0.04, 0.17, c, { z: -0.03 }, AO);
      g.boxUp(0.075, 0.04, 0.1, c, { x: 0.035, z: 0.08, ry: -0.7 });
      g.boxUp(0.078, 0.042, 0.025, 0xe2453c, { z: -0.08 });
      g.boxUp(0.078, 0.042, 0.025, 0xe2453c, { z: -0.03 });
      g.boxUp(0.078, 0.042, 0.03, 0x5fa8e8, { x: 0.055, z: 0.105, ry: -0.7 });
      break;
    }
    case 20: {
      g.cylUp(0.15, 0.155, 0.045, 14, c, {}, AO);
      g.cylUp(0.11, 0.11, 0.006, 14, 0x5c6170, { y: 0.045 });
      g.boxUp(0.05, 0.008, 0.012, 0x5cff7a, { y: 0.045, z: 0.12 }, { vary: 0 });
      g.cylUp(0.156, 0.156, 0.015, 14, 0x8a8f9c, { y: 0.012 });
      break;
    }
    case 21: {
      // tuna can with a ring pull and a fishy label
      g.cylUp(0.075, 0.075, 0.05, 12, c, {}, AO);
      g.cylUp(0.077, 0.077, 0.032, 12, 0x3d7dd8, { y: 0.009 });
      g.cylUp(0.068, 0.068, 0.004, 12, shadeHex(c, 1.12), { y: 0.05 });
      g.torus(0.018, 0.004, 0xd7dde3, { x: 0.03, y: 0.056, rx: Math.PI / 2 }, undefined, 3, 8);
      g.sphere(0.022, 0xff9a3c, { z: 0.068, y: 0.025, sx: 1.6, sz: 0.3 }, { vary: 0 }, 6, 4);
      g.cone(0.014, 0.02, 3, 0xff9a3c, { x: -0.04, y: 0.025, z: 0.068, rz: Math.PI / 2, sz: 0.3 }, { vary: 0 });
      break;
    }
    case 22: {
      // striped popcorn bowl, heaped
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        g.boxUp(0.06, 0.11, 0.012, i % 2 ? 0xe63946 : 0xffffff, { x: Math.sin(a) * 0.115, z: Math.cos(a) * 0.115, ry: a }, i === 0 ? AO : undefined);
      }
      g.cylUp(0.12, 0.09, 0.012, 12, 0xe63946, {});
      for (let i = 0; i < 22; i++) {
        const a = i * 2.39;
        const r = 0.1 * Math.sqrt((i + 0.5) / 22);
        g.ico(0.03, i % 4 ? c : 0xffe08a, { x: Math.cos(a) * r, y: 0.11 + (0.1 - r) * 0.7 + (i % 3) * 0.01, z: Math.sin(a) * r, ry: i });
      }
      break;
    }
    case 23: {
      // yarn ball with wraps, a loose strand and two needles
      g.sphere(0.085, c, { y: 0.085 }, AO, 9, 7);
      for (let i = 0; i < 3; i++) g.torus(0.086, 0.007, shadeHex(c, 0.82), { y: 0.085, rx: Math.PI / 2 + i * 0.6, ry: i * 1.1 }, { vary: 0 }, 3, 14);
      g.box(0.008, 0.008, 0.12, c, { x: 0.07, y: 0.006, z: 0.09, ry: 0.4 });
      g.cyl(0.006, 0.006, 0.26, 5, 0xe8b04a, { x: -0.02, y: 0.13, z: 0.01, rz: 1.2, ry: 0.3 });
      g.cyl(0.006, 0.006, 0.26, 5, 0xe8b04a, { x: 0.02, y: 0.13, z: -0.01, rz: -1.1, ry: -0.4 });
      break;
    }
    case 24: {
      // rubber duck
      g.sphere(0.08, c, { y: 0.07, sx: 1.25, sy: 0.85 }, AO, 9, 6);
      g.sphere(0.055, c, { x: 0.05, y: 0.15 }, undefined, 8, 6);
      g.cone(0.025, 0.05, 6, 0xff8c1a, { x: 0.11, y: 0.145, rz: -Math.PI / 2, sy: 1 });
      g.sphere(0.012, 0x1b1c26, { x: 0.085, y: 0.17, z: 0.03 }, { vary: 0 }, 4, 3);
      g.sphere(0.012, 0x1b1c26, { x: 0.085, y: 0.17, z: -0.03 }, { vary: 0 }, 4, 3);
      g.cone(0.04, 0.06, 4, shadeHex(c, 0.95), { x: -0.1, y: 0.1, rz: 1.1, sz: 0.5 });
      break;
    }
    case 25: {
      // toothbrush cup with two brushes
      g.cylUp(0.055, 0.048, 0.11, 9, c, {}, AO);
      g.cylUp(0.057, 0.057, 0.02, 9, shadeHex(c, 1.1), { y: 0.06 });
      for (const [x, col, rz] of [
        [-0.015, 0xff8fab, -0.2],
        [0.018, 0x5fa8e8, 0.25],
      ] as const) {
        g.boxUp(0.014, 0.2, 0.012, col, { x, y: 0.03, rz });
        g.boxUp(0.018, 0.03, 0.02, 0xffffff, { x: x - Math.sin(rz) * 0.2, y: 0.03 + Math.cos(rz) * 0.2 - 0.005, z: 0.008, rz });
      }
      break;
    }
    case 26: {
      // pen cup: pens, pencils and a ruler
      g.cylUp(0.05, 0.05, 0.1, 9, c, {}, AO);
      g.torus(0.05, 0.006, shadeHex(c, 1.25), { y: 0.1, rx: Math.PI / 2 }, undefined, 3, 10);
      const pens: [number, number, number, number][] = [
        [-0.02, -0.01, 0xffd23f, -0.15],
        [0.015, 0.015, 0xe63946, 0.12],
        [0.02, -0.02, 0x2b2d42, 0.2],
        [-0.015, 0.02, 0x8ac926, -0.08],
      ];
      for (const [x, z, col, rz] of pens) {
        g.cylUp(0.008, 0.008, 0.17, 6, col, { x, y: 0.02, z, rz });
        g.cone(0.008, 0.02, 6, 0xf2d0a4, { x: x - Math.sin(rz) * 0.18, y: 0.2, z, rz });
      }
      g.boxUp(0.025, 0.2, 0.004, 0xf2e3b3, { x: 0.0, y: 0.02, z: -0.03, rz: 0.08 });
      break;
    }
    case 28: {
      // balloon on a ribbon tied to a little gift weight
      g.boxUp(0.05, 0.04, 0.05, 0xff8fab, {}, AO);
      g.boxUp(0.012, 0.042, 0.052, 0xffffff, {});
      g.boxUp(0.004, 0.17, 0.004, 0xf6f6f6, { y: 0.04 }, { vary: 0 });
      g.sphere(0.105, c, { y: 0.31, sy: 1.15 }, undefined, 9, 7);
      g.cone(0.02, 0.025, 5, shadeHex(c, 0.85), { y: 0.2, rx: Math.PI });
      g.sphere(0.025, 0xffffff, { x: -0.04, y: 0.37, z: 0.075, sz: 0.4 }, { vary: 0 }, 5, 4);
      break;
    }
    case 29: {
      // curly ribbon bow
      g.torus(0.045, 0.012, c, { x: -0.04, y: 0.03, rx: Math.PI / 2 - 0.4, ry: 0.4 }, AO, 4, 10);
      g.torus(0.045, 0.012, c, { x: 0.04, y: 0.03, rx: Math.PI / 2 - 0.4, ry: -0.4 }, undefined, 4, 10);
      g.sphere(0.02, shadeHex(c, 0.9), { y: 0.025 }, undefined, 6, 4);
      for (let i = 0; i < 5; i++) g.box(0.02, 0.008, 0.03, c, { x: (i % 2 ? 0.015 : -0.015) + 0.02, y: 0.004, z: 0.035 + i * 0.025, ry: i % 2 ? 0.5 : -0.5 });
      break;
    }
    case 31: {
      // punch bowl on a stem with fruit slices and a ladle
      g.cylUp(0.07, 0.085, 0.02, 10, 0xe9f2f7, {}, AO);
      g.cylUp(0.025, 0.03, 0.06, 8, 0xe9f2f7, { y: 0.02 });
      g.cylUp(0.16, 0.07, 0.11, 12, 0xe0f0f7, { y: 0.08 });
      g.cylUp(0.15, 0.15, 0.01, 12, c, { y: 0.175 });
      for (let i = 0; i < 4; i++) {
        const a = i * 1.7;
        g.cyl(0.03, 0.03, 0.008, 8, i % 2 ? 0xffb347 : 0xfff275, { x: Math.cos(a) * 0.08, y: 0.188, z: Math.sin(a) * 0.08 }, { vary: 0 });
      }
      g.cyl(0.008, 0.008, 0.22, 5, PAL.chrome, { x: 0.07, y: 0.24, z: -0.02, rz: 0.6 });
      g.sphere(0.03, PAL.chrome, { x: 0.02, y: 0.17, z: -0.02 }, undefined, 6, 4);
      break;
    }
    case 32: {
      // birthday candle pack: candles with stripes and little flames, in a holder
      g.boxUp(0.16, 0.025, 0.07, 0xff8fab, {}, AO);
      for (let i = 0; i < 4; i++) {
        const x = -0.06 + i * 0.04;
        const col = [c, 0x8ac926, 0x4dabff, 0xff595e][i];
        g.cylUp(0.009, 0.009, 0.1, 6, col, { x, y: 0.025, rz: (i - 1.5) * 0.08 });
        g.cylUp(0.0095, 0.0095, 0.01, 6, 0xffffff, { x, y: 0.05 });
        g.cylUp(0.0095, 0.0095, 0.01, 6, 0xffffff, { x, y: 0.085 });
        g.cone(0.012, 0.03, 5, 0xffa726, { x: x - (i - 1.5) * 0.008, y: 0.14 }, { vary: 0 });
      }
      break;
    }
    case 33: {
      // wicker basket brimming with laundry
      g.cylUp(0.17, 0.14, 0.2, 10, c, {}, AO);
      for (let i = 0; i < 4; i++) g.torus(0.145 + i * 0.008, 0.008, shadeHex(c, 0.82), { y: 0.03 + i * 0.05, rx: Math.PI / 2 }, { vary: 0 }, 3, 12);
      g.torus(0.17, 0.016, shadeHex(c, 0.9), { y: 0.2, rx: Math.PI / 2 }, undefined, 4, 12);
      const cl = [0xef476f, 0x5fa8e8, 0xffffff, 0xffd23f, 0x8ecae6];
      for (let i = 0; i < 7; i++) {
        const a = i * 2.4;
        g.sphere(0.06, cl[i % cl.length], { x: Math.cos(a) * 0.08, y: 0.21 + (i % 3) * 0.02, z: Math.sin(a) * 0.08, sy: 0.55, ry: a }, undefined, 6, 4);
      }
      g.boxUp(0.04, 0.12, 0.02, 0xef476f, { x: 0.16, y: 0.1, z: 0.04, rz: -0.2 });
      for (const s of [-1, 1]) g.box(0.06, 0.02, 0.03, shadeHex(c, 0.8), { x: s * 0.175, y: 0.17 });
      break;
    }
    case 34: {
      // twin-bell alarm clock
      g.cyl(0.08, 0.08, 0.05, 12, c, { y: 0.1, rx: Math.PI / 2 }, AO);
      g.cyl(0.066, 0.066, 0.052, 12, 0xfffaf2, { y: 0.1, z: 0.001, rx: Math.PI / 2 }, { vary: 0 });
      g.box(0.006, 0.05, 0.004, 0x2b2d42, { y: 0.12, z: 0.028 }, { vary: 0 });
      g.box(0.04, 0.006, 0.004, 0x2b2d42, { x: 0.016, y: 0.1, z: 0.028 }, { vary: 0 });
      for (const s of [-1, 1]) {
        g.sphere(0.035, 0xe8b04a, { x: s * 0.05, y: 0.18, sy: 0.7 }, undefined, 7, 4);
        g.cylUp(0.008, 0.008, 0.04, 5, 0x2b2d42, { x: s * 0.055, y: 0, rz: s * 0.4 });
      }
      g.cylUp(0.005, 0.005, 0.04, 4, 0x2b2d42, { y: 0.175 });
      g.box(0.05, 0.008, 0.008, 0x2b2d42, { y: 0.215 });
      break;
    }
    case 35: {
      // jewellery dish with rings and a pearl necklace
      g.cylUp(0.12, 0.09, 0.03, 12, c, {}, AO);
      g.cylUp(0.105, 0.105, 0.004, 12, shadeHex(c, 0.9), { y: 0.026 });
      g.torus(0.022, 0.006, 0xffd166, { x: 0.04, y: 0.04, rx: 1.2 }, undefined, 4, 10);
      g.ico(0.012, 0x4dabff, { x: 0.04, y: 0.062 });
      g.torus(0.018, 0.005, 0xd7dde3, { x: -0.03, y: 0.036, z: 0.03, rx: Math.PI / 2 }, undefined, 4, 10);
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        g.sphere(0.009, 0xfff8f0, { x: -0.02 + Math.cos(a) * 0.055, y: 0.034, z: -0.02 + Math.sin(a) * 0.04 }, { vary: 0 }, 4, 3);
      }
      break;
    }
    case 36: {
      // cookie tray with choc chip cookies
      g.boxUp(0.32, 0.014, 0.24, c, {}, AO);
      g.boxUp(0.33, 0.02, 0.012, shadeHex(c, 0.9), { z: 0.12 });
      g.boxUp(0.33, 0.02, 0.012, shadeHex(c, 0.9), { z: -0.12 });
      for (let i = 0; i < 6; i++) {
        const x = -0.1 + (i % 3) * 0.1;
        const z = i < 3 ? -0.055 : 0.055;
        g.cylUp(0.038, 0.04, 0.016, 9, 0xd99a5b, { x, y: 0.014, z });
        for (let k = 0; k < 3; k++) g.box(0.012, 0.008, 0.012, 0x4a2c1d, { x: x + Math.cos(k * 2.1 + i) * 0.02, y: 0.032, z: z + Math.sin(k * 2.1 + i) * 0.02 }, { vary: 0 });
      }
      break;
    }
    case 37: {
      // paper flour sack with a folded top and a wheat stamp, a dusting on top
      g.boxUp(0.17, 0.2, 0.11, c, {}, AO);
      g.box(0.17, 0.04, 0.09, shadeHex(c, 0.95), { y: 0.215, rx: 0.25 });
      g.boxUp(0.1, 0.07, 0.004, 0x3d7dd8, { y: 0.07, z: 0.056 });
      for (let i = 0; i < 3; i++) g.box(0.01, 0.04, 0.004, 0xe8b04a, { x: -0.02 + i * 0.02, y: 0.105, z: 0.059, rz: (i - 1) * 0.3 }, { vary: 0 });
      g.sphere(0.04, 0xffffff, { x: 0.03, y: 0.23, z: 0.01, sy: 0.4 }, { vary: 0 }, 6, 4);
      break;
    }
    case 38: {
      // mixing bowl with batter and a whisk
      g.cylUp(0.15, 0.08, 0.12, 12, c, {}, AO);
      g.torus(0.15, 0.01, shadeHex(c, 1.05), { y: 0.12, rx: Math.PI / 2 }, undefined, 3, 14);
      g.cylUp(0.135, 0.135, 0.01, 12, 0xffe3a8, { y: 0.1 });
      g.cylUp(0.008, 0.008, 0.16, 5, PAL.chrome, { x: 0.03, y: 0.13, rz: -0.5 });
      for (let i = 0; i < 4; i++) g.torus(0.03, 0.003, PAL.chrome, { x: 0.0, y: 0.12, ry: (i * Math.PI) / 4, rz: -0.5 }, { vary: 0 }, 3, 8);
      break;
    }
    case 39: {
      // butter on a dish with a knife
      g.boxUp(0.18, 0.012, 0.11, 0xf7f3ee, {}, AO);
      g.boxUp(0.12, 0.05, 0.06, c, { y: 0.012 });
      g.box(0.04, 0.03, 0.06, shadeHex(c, 0.92), { x: 0.06, y: 0.03, rz: 0.4 });
      g.box(0.14, 0.004, 0.018, PAL.chrome, { x: 0.01, y: 0.066, z: 0.01, ry: 0.3 });
      break;
    }
    case 40: {
      // board game box with the board half out and pawns
      g.boxUp(0.3, 0.04, 0.22, c, {}, AO);
      g.boxUp(0.25, 0.005, 0.17, 0xfff1dc, { y: 0.04 });
      for (let i = 0; i < 16; i++) {
        if ((i + Math.floor(i / 4)) % 2) continue;
        g.boxUp(0.05, 0.002, 0.035, i % 3 ? 0x8ac926 : 0xe63946, { x: -0.09 + (i % 4) * 0.06, y: 0.045, z: -0.06 + Math.floor(i / 4) * 0.04 }, { vary: 0 });
      }
      for (const [x, z, col] of [
        [0.05, 0.03, 0xe63946],
        [-0.05, -0.02, 0x3d7dd8],
        [0.0, 0.05, 0xffd23f],
      ] as const) {
        g.cone(0.016, 0.05, 6, col, { x, y: 0.07, z });
        g.sphere(0.012, col, { x, y: 0.1, z }, undefined, 5, 4);
      }
      break;
    }
    case 42: {
      // game controller
      g.boxUp(0.16, 0.035, 0.08, c, {}, AO);
      for (const s of [-1, 1]) g.sphere(0.045, c, { x: s * 0.075, y: 0.02, z: 0.03, sy: 0.5, sz: 1.3 }, undefined, 7, 5);
      g.cylUp(0.014, 0.016, 0.02, 7, 0x5c6170, { x: -0.04, y: 0.035, z: 0.01 });
      g.cylUp(0.014, 0.016, 0.02, 7, 0x5c6170, { x: 0.02, y: 0.035, z: 0.025 });
      const bc = [0x5cff7a, 0xff4d4d, 0x4dabff, 0xffd23f];
      for (let i = 0; i < 4; i++) g.cylUp(0.008, 0.008, 0.01, 6, bc[i], { x: 0.06 + (i % 2 ? 0.015 : -0.015) * (i < 2 ? 1 : 0), y: 0.035, z: -0.01 + (i >= 2 ? (i === 2 ? -0.015 : 0.015) : 0) }, { vary: 0 });
      g.boxUp(0.02, 0.006, 0.006, 0x4dabff, { y: 0.035, z: -0.03 }, { vary: 0 });
      break;
    }
    case 43: {
      // a pair of dice
      for (const [x, z, ry] of [
        [-0.04, 0, 0.3],
        [0.045, 0.02, -0.5],
      ] as const) {
        g.boxUp(0.065, 0.065, 0.065, c, { x, z, ry }, AO);
        const cs = Math.cos(ry);
        const sn = Math.sin(ry);
        // pips on the top and the front faces
        for (const [px, pz] of [
          [-0.017, -0.017],
          [0, 0],
          [0.017, 0.017],
        ])
          g.box(0.012, 0.004, 0.012, 0x2b2d42, { x: x + px * cs + pz * sn, y: 0.066, z: z - px * sn + pz * cs, ry }, { vary: 0 });
        g.box(0.012, 0.012, 0.004, 0xe63946, { x: x + 0.0333 * sn, y: 0.033, z: z + 0.0333 * cs, ry }, { vary: 0 });
      }
      break;
    }
    case 44: {
      // scented candle in an amber jar
      g.cylUp(0.065, 0.065, 0.11, 10, c, {}, AO);
      g.cylUp(0.06, 0.06, 0.01, 10, 0xfff6e4, { y: 0.1 });
      g.cylUp(0.067, 0.067, 0.04, 10, 0xfff1dc, { y: 0.035 });
      g.box(0.025, 0.012, 0.004, PAL.leafDark, { y: 0.055, z: 0.068 }, { vary: 0 });
      g.cylUp(0.003, 0.003, 0.02, 4, 0x2b2d42, { y: 0.11 });
      g.cone(0.013, 0.04, 5, 0xffa726, { y: 0.15 }, { vary: 0 });
      g.cone(0.007, 0.022, 5, 0xfff275, { y: 0.145 }, { vary: 0 });
      break;
    }
    case 45: {
      // face-mask jar with a cucumber slice on the lid
      g.cylUp(0.07, 0.07, 0.09, 10, c, {}, AO);
      g.cylUp(0.074, 0.074, 0.03, 10, 0xffffff, { y: 0.085 });
      g.cylUp(0.071, 0.071, 0.035, 10, 0xffffff, { y: 0.025 });
      g.box(0.05, 0.012, 0.004, 0xff8fab, { y: 0.04, z: 0.072 }, { vary: 0 });
      g.cylUp(0.035, 0.035, 0.008, 9, 0x8ac926, { x: 0.01, y: 0.115, z: 0.01 });
      g.cylUp(0.028, 0.028, 0.009, 9, 0xd6f5b0, { x: 0.01, y: 0.115, z: 0.01 }, { vary: 0 });
      break;
    }
    case 47: {
      // gravy boat on a saucer
      g.cylUp(0.12, 0.11, 0.012, 12, 0xfffaf2, {}, AO);
      g.sphere(0.085, c, { y: 0.07, sx: 1.4, sy: 0.6 }, undefined, 9, 5);
      g.cylUp(0.11, 0.11, 0.006, 10, 0x7a4a24, { y: 0.075, sx: 1.05, sz: 0.72 });
      g.cone(0.03, 0.05, 6, c, { x: 0.12, y: 0.085, rz: -1.2, sz: 0.6 });
      g.torus(0.03, 0.008, c, { x: -0.115, y: 0.09 }, undefined, 4, 8);
      break;
    }
    case 48: {
      // lattice pie in a fluted dish
      g.cylUp(0.15, 0.12, 0.05, 14, 0xf2f2f2, {}, AO);
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        g.sphere(0.022, 0xd99a5b, { x: Math.sin(a) * 0.135, y: 0.055, z: Math.cos(a) * 0.135 }, undefined, 5, 4);
      }
      g.cylUp(0.13, 0.13, 0.012, 14, c, { y: 0.045 });
      for (let i = -2; i <= 2; i++) {
        const L = Math.sqrt(Math.max(0, 0.13 * 0.13 - (i * 0.045) ** 2)) * 2;
        g.boxUp(L, 0.01, 0.022, 0xe9b26f, { x: i * 0.045, y: 0.057, ry: Math.PI / 2 });
        g.boxUp(L, 0.01, 0.022, 0xe9b26f, { z: i * 0.045, y: 0.059 });
      }
      break;
    }
    case 49: {
      // roast turkey on an oval platter with garnish
      g.cylUp(0.2, 0.18, 0.016, 14, 0xf7f3ee, { sz: 0.75 }, AO);
      g.torus(0.19, 0.008, c, { y: 0.016, rx: Math.PI / 2, sy: 0.75 }, undefined, 3, 14);
      g.sphere(0.1, 0xc97c3d, { y: 0.09, sx: 1.25, sz: 0.95 }, undefined, 9, 6);
      for (const s of [-1, 1]) {
        g.sphere(0.04, 0xb8692e, { x: 0.08, y: 0.08, z: s * 0.07, sx: 1.4 }, undefined, 6, 4);
        g.cyl(0.01, 0.01, 0.05, 5, 0xfff6e4, { x: 0.14, y: 0.09, z: s * 0.07, rz: Math.PI / 2 });
        g.sphere(0.014, 0xfff6e4, { x: 0.165, y: 0.09, z: s * 0.07 }, undefined, 5, 4);
      }
      for (let i = 0; i < 5; i++) g.ico(0.025, i % 2 ? PAL.leaf : 0xe63946, { x: -0.14 + (i % 2) * 0.02, y: 0.03, z: -0.08 + i * 0.04 });
      break;
    }
    case 50: {
      // turkey drumstick
      g.sphere(0.06, c, { x: -0.03, y: 0.045, sx: 1.5, sy: 0.75 }, AO, 8, 6);
      g.cyl(0.014, 0.014, 0.09, 6, 0xfff6e4, { x: 0.07, y: 0.035, rz: Math.PI / 2 + 0.15 });
      g.sphere(0.018, 0xfff6e4, { x: 0.115, y: 0.04, z: 0.012 }, undefined, 5, 4);
      g.sphere(0.018, 0xfff6e4, { x: 0.115, y: 0.04, z: -0.012 }, undefined, 5, 4);
      g.sphere(0.03, shadeHex(c, 1.15), { x: -0.05, y: 0.075, z: 0.02, sy: 0.4 }, { vary: 0 }, 5, 4);
      break;
    }
    case 52: {
      // bubble wrap roll
      g.cyl(0.08, 0.08, 0.26, 10, c, { y: 0.08, rz: Math.PI / 2 }, AO);
      g.cyl(0.03, 0.03, 0.262, 8, 0xc89f6d, { y: 0.08, rz: Math.PI / 2 });
      for (let i = 0; i < 18; i++) {
        const a = (i % 6) * (Math.PI / 3) + (Math.floor(i / 6) % 2) * 0.5;
        const x = -0.1 + Math.floor(i / 6) * 0.1;
        g.sphere(0.016, 0xffffff, { x, y: 0.08 + Math.cos(a) * 0.08, z: Math.sin(a) * 0.08 }, { vary: 0 }, 4, 3);
      }
      g.boxUp(0.26, 0.004, 0.12, c, { y: 0.0, z: 0.12 });
      break;
    }
    case 53: {
      // a pile of receipts and one very long one
      for (let i = 0; i < 6; i++) g.box(0.09, 0.004, 0.13, i % 2 ? c : 0xffffff, { x: (hash01(i) - 0.5) * 0.06, y: 0.004 + i * 0.008, z: (hash01(i + 7) - 0.5) * 0.06, ry: (hash01(i + 3) - 0.5) * 1.2, rx: (hash01(i + 5) - 0.5) * 0.2 });
      for (let i = 0; i < 4; i++) g.box(0.07, 0.004, 0.06, c, { x: 0.06, y: 0.06 - i * 0.012, z: 0.07 + i * 0.05, rx: 0.4 - i * 0.25 });
      for (let i = 0; i < 4; i++) g.box(0.05, 0.002, 0.004, 0x9aa0ae, { y: 0.054, z: -0.03 + i * 0.015 }, { vary: 0 });
      break;
    }
    case 54: {
      return buildBoxGeometry(false);
    }
    case 56: {
      // wrapped bouquet standing in a ribbon
      g.cone(0.07, 0.24, 7, 0xfff1dc, { y: 0.12, rx: Math.PI }, AO);
      g.torus(0.04, 0.012, 0xffafcc, { y: 0.12, rx: Math.PI / 2 }, undefined, 4, 10);
      const fl = [c, 0xffffff, 0xff4d8d, 0xffd6e0, c, 0xffffff];
      for (let i = 0; i < 7; i++) {
        const a = i * 0.9;
        const r = i === 0 ? 0 : 0.055;
        g.ico(0.04, fl[i % fl.length], { x: Math.cos(a) * r, y: 0.27 + (i % 2) * 0.02, z: Math.sin(a) * r });
      }
      for (let i = 0; i < 4; i++) g.cone(0.025, 0.08, 4, PAL.leaf, { x: Math.cos(i * 1.6) * 0.07, y: 0.25, z: Math.sin(i * 1.6) * 0.07, rz: Math.cos(i * 1.6) * -0.6, rx: Math.sin(i * 1.6) * 0.6, sz: 0.4 });
      break;
    }
    case 57: {
      // phone lying on its back with a cat on the lock screen
      g.boxUp(0.09, 0.012, 0.17, c, {}, AO);
      g.boxUp(0.08, 0.002, 0.155, 0x6fb7e8, { y: 0.012 }, { vary: 0 });
      g.sphere(0.025, 0xff9a3c, { y: 0.016, z: 0.01, sy: 0.15 }, { vary: 0 }, 6, 4);
      g.cone(0.01, 0.02, 3, 0xff9a3c, { x: -0.016, y: 0.016, z: -0.02, rx: -Math.PI / 2, sz: 0.2 }, { vary: 0 });
      g.cone(0.01, 0.02, 3, 0xff9a3c, { x: 0.016, y: 0.016, z: -0.02, rx: -Math.PI / 2, sz: 0.2 }, { vary: 0 });
      g.boxUp(0.03, 0.002, 0.008, 0xffffff, { y: 0.0135, z: -0.06 }, { vary: 0 });
      break;
    }
    case 58: {
      // water glass with an ice cube and a lemon slice
      g.cylUp(0.05, 0.045, 0.13, 10, c, {}, AO);
      g.cylUp(0.046, 0.046, 0.006, 10, 0x9fd2f2, { y: 0.1 }, { vary: 0 });
      g.box(0.03, 0.03, 0.03, 0xffffff, { x: 0.01, y: 0.1, ry: 0.5, rz: 0.3 });
      g.cyl(0.03, 0.03, 0.006, 8, 0xfff275, { x: 0.045, y: 0.12, rx: Math.PI / 2, ry: 0.4 }, { vary: 0 });
      g.box(0.008, 0.05, 0.004, 0xffffff, { x: -0.03, y: 0.08, z: 0.042 }, { vary: 0 });
      break;
    }
    case 59: {
      // a folded fleece blanket with tassels
      g.boxUp(0.24, 0.05, 0.18, c, {}, AO);
      g.cyl(0.025, 0.025, 0.18, 7, c, { x: 0.12, y: 0.025, rx: Math.PI / 2 });
      g.boxUp(0.24, 0.025, 0.18, mixHex(c, 0xffffff, 0.4), { y: 0.05 });
      g.cyl(0.0125, 0.0125, 0.18, 6, mixHex(c, 0xffffff, 0.4), { x: -0.12, y: 0.0625, rx: Math.PI / 2 });
      for (let i = 0; i < 5; i++) g.box(0.012, 0.012, 0.03, 0xffffff, { x: 0.135, y: 0.01, z: -0.07 + i * 0.035, ry: 0 });
      break;
    }
    case 60: {
      // snow globe: a cottage and a pine inside, snow specks
      g.cylUp(0.085, 0.095, 0.05, 10, 0x8d5a3b, {}, AO);
      g.cylUp(0.088, 0.088, 0.01, 10, 0xe8b04a, { y: 0.04 });
      g.sphere(0.09, c, { y: 0.13 }, { vary: 0.01 }, 10, 7);
      g.boxUp(0.05, 0.04, 0.04, 0xe63946, { x: 0.02, y: 0.05 });
      g.cone(0.04, 0.03, 4, 0xffffff, { x: 0.02, y: 0.105, ry: Math.PI / 4 });
      g.cone(0.025, 0.07, 6, 0x2f8f4e, { x: -0.035, y: 0.085 });
      for (let i = 0; i < 9; i++) g.box(0.008, 0.008, 0.008, 0xffffff, { x: (hash01(i) - 0.5) * 0.12, y: 0.07 + hash01(i + 4) * 0.12, z: (hash01(i + 9) - 0.5) * 0.1 }, { vary: 0 });
      break;
    }
    case 61: {
      // gift wrap roll with a bit unrolled
      g.cyl(0.045, 0.045, 0.34, 10, c, { y: 0.045, rz: Math.PI / 2 }, AO);
      for (let i = 0; i < 6; i++) g.torus(0.046, 0.006, i % 2 ? 0xffffff : 0xffd166, { x: -0.14 + i * 0.056, y: 0.045, ry: Math.PI / 2 }, { vary: 0 }, 3, 10);
      g.boxUp(0.3, 0.003, 0.12, c, { y: 0, z: 0.1 });
      for (let i = 0; i < 5; i++) g.boxUp(0.03, 0.002, 0.03, 0xffffff, { x: -0.12 + i * 0.06, y: 0.003, z: 0.1, ry: Math.PI / 4 }, { vary: 0 });
      break;
    }
    case 62: {
      // champagne bottle, foil and cage, label
      g.cylUp(0.05, 0.055, 0.2, 10, c, {}, AO);
      g.cylUp(0.022, 0.05, 0.08, 10, c, { y: 0.2 });
      g.cylUp(0.024, 0.024, 0.07, 8, 0xffd166, { y: 0.26 });
      g.cylUp(0.02, 0.022, 0.025, 8, 0xe8c27a, { y: 0.33 });
      g.cylUp(0.056, 0.056, 0.07, 10, 0xfff6d8, { y: 0.07 });
      g.cylUp(0.057, 0.057, 0.012, 10, 0xffd166, { y: 0.12 });
      break;
    }
    case 63: {
      // sponsor product: a chunky branded box with a big front label panel (the label texture sits on it)
      g.boxUp(0.2, 0.26, 0.12, c, {}, AO);
      g.boxUp(0.205, 0.03, 0.125, shadeHex(c, 0.85), { y: 0.23 });
      g.boxUp(0.17, 0.15, 0.004, 0xffffff, { y: 0.05, z: 0.061 }, { vary: 0 });
      g.sphere(0.03, 0xffd166, { x: 0.07, y: 0.27, z: 0.04, sy: 0.6 }, undefined, 6, 4);
      break;
    }
    default:
      g.boxUp(0.2, 0.2, 0.2, c, {}, AO);
  }
  return g.build();
}

/** Where a sponsor label sits on kind 63 (bottom centre local frame): centre, size. */
export const SPONSOR_LABEL = { x: 0, y: 0.125, z: 0.0645, w: 0.165, h: 0.145 } as const;
