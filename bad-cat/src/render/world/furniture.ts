/**
 * Furniture builders, one per FurnitureType (types.ts). Every builder draws a chunky toy-like piece into the room's
 * single merged GeoBuilder, in the piece's LOCAL frame: lx runs along the front face (centred), lz points out of the
 * front (toward the room), y is up. The local frame is yawed onto the wall the piece stands against, so one builder
 * works on the back wall, the west wall and as an island. The top surface stays at levelY(piece.level), which is
 * what the sim's heightmap says the cat stands on; decoration above it (a headboard, a TV, curtains) sits at the
 * back edge so it never hides a prop.
 *
 * Animated parts (TV picture, fire, REC light) are NOT drawn here: `furnitureAnchors` tells dynamics.ts where they
 * go, so the room stays one static mesh.
 */
import type { FurniturePiece, FurnitureType, PlayableRoom, ShellDef } from '../../types';
import { GeoBuilder, type AddOpts, type Xf } from '../geo';
import { PAL, mixHex, shadeHex } from '../palette';
import { pieceFrame, type PieceFrame } from './layout';

const AO: AddOpts = { aoFloor: 0, aoStrength: 0.28 };

export interface FurnCtx {
  g: GeoBuilder;
  p: FurniturePiece;
  f: PieceFrame;
  play: PlayableRoom;
  /** yaw of the local frame */
  ry: number;
  /** local -> transform */
  at(lx: number, y: number, lz: number, extra?: Xf): Xf;
  box(lx: number, y: number, lz: number, w: number, h: number, d: number, color: number, o?: AddOpts, extra?: Xf): void;
  cyl(lx: number, y: number, lz: number, rTop: number, rBot: number, h: number, seg: number, color: number, o?: AddOpts, extra?: Xf): void;
  sph(lx: number, y: number, lz: number, r: number, color: number, extra?: Xf, o?: AddOpts): void;
}

export type FurnitureBuilder = (c: FurnCtx) => void;

/** Builder context for one piece (exported for tests). */
export function makeCtx(g: GeoBuilder, p: FurniturePiece, play: PlayableRoom): FurnCtx {
  const f = pieceFrame(p, play.shell.width, play.shell.depth);
  const ry = f.fz ? 0 : f.fx > 0 ? Math.PI / 2 : -Math.PI / 2;
  const toWorld = (lx: number, lz: number): [number, number] => (f.fz ? [f.cx + lx, f.cz + lz] : [f.cx + lz * f.fx, f.cz - lx * f.fx]);
  const at = (lx: number, y: number, lz: number, extra?: Xf): Xf => {
    const [x, z] = toWorld(lx, lz);
    return { ...extra, x, y, z, ry: ry + (extra?.ry ?? 0) };
  };
  return {
    g,
    p,
    f,
    play,
    ry,
    at,
    box: (lx, y, lz, w, h, d, color, o, extra) => void g.boxUp(w, h, d, color, at(lx, y, lz, extra), o),
    cyl: (lx, y, lz, rt, rb, h, seg, color, o, extra) => void g.cylUp(rt, rb, h, seg, color, at(lx, y, lz, extra), o),
    sph: (lx, y, lz, r, color, extra, o) => void g.sphere(r, color, at(lx, y, lz, extra), o, 7, 5),
  };
}

// ---------------------------------------------------------------------------------------------
// Small shared parts
// ---------------------------------------------------------------------------------------------

/** Cabinet doors across the front face between `bottom` and `top`. */
function doors(c: FurnCtx, color: number, top: number, bottom: number, inset = 0): void {
  const A = c.f.along - inset * 2;
  const n = Math.max(1, Math.round(A / 0.4));
  const dw = A / n;
  const fz = c.f.depth / 2;
  for (let i = 0; i < n; i++) {
    const u = -A / 2 + dw * (i + 0.5);
    c.box(u, bottom, fz + 0.006, dw - 0.035, top - bottom, 0.012, color);
    c.box(u + (i % 2 ? -1 : 1) * (dw / 2 - 0.06), top - 0.12, fz + 0.02, 0.018, 0.07, 0.03, PAL.handle);
  }
}

/** Rows of drawers with round knobs. */
function drawers(c: FurnCtx, color: number, rows: number, top: number, bottom: number, cols = 1): void {
  const fz = c.f.depth / 2;
  const A = c.f.along - 0.06;
  const rh = (top - bottom) / rows;
  const cw = A / cols;
  for (let r = 0; r < rows; r++)
    for (let k = 0; k < cols; k++) {
      const u = -A / 2 + cw * (k + 0.5);
      const y = bottom + r * rh;
      c.box(u, y + 0.015, fz + 0.006, cw - 0.03, rh - 0.03, 0.014, color);
      c.sph(u, y + rh / 2, fz + 0.022, 0.018, PAL.handle);
    }
}

/** Four legs at the corners of a w x d footprint. */
function legs(c: FurnCtx, w: number, d: number, h: number, t: number, color: number, inset = 0.05, round = false): void {
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const lx = sx * (w / 2 - inset);
      const lz = sz * (d / 2 - inset);
      if (round) c.cyl(lx, 0, lz, t * 0.5, t * 0.4, h, 6, color, AO);
      else c.box(lx, 0, lz, t, h, t, color, AO);
    }
}

/** Little leafy ball (plants, bouquets on the arch). */
function bush(c: FurnCtx, lx: number, y: number, lz: number, r: number, flowers = 0, flowerColor = 0xff8fb1): void {
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    c.g.ico(r * 0.62, i % 2 ? PAL.leaf : PAL.leafDark, c.at(lx + Math.cos(a) * r * 0.45, y + (i % 2) * r * 0.25, lz + Math.sin(a) * r * 0.45));
  }
  c.g.ico(r * 0.7, PAL.leaf, c.at(lx, y + r * 0.45, lz));
  for (let i = 0; i < flowers; i++) {
    const a = (i / flowers) * Math.PI * 2 + 0.3;
    c.g.ico(r * 0.24, i % 3 === 2 ? 0xffffff : flowerColor, c.at(lx + Math.cos(a) * r * 0.7, y + r * (0.5 + (i % 2) * 0.3), lz + Math.sin(a) * r * 0.7));
  }
}

// ---------------------------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------------------------

const counter: FurnitureBuilder = (c) => {
  const { f, p } = c;
  const col = p.color ?? PAL.cabinet;
  c.box(0, 0, 0, f.along - 0.02, f.H - 0.05, f.depth - 0.03, col, AO);
  c.box(0, 0, f.depth / 2, f.along - 0.02, 0.07, 0.008, shadeHex(col, 0.6));
  doors(c, PAL.cabinetDoor, f.H - 0.09, 0.1);
  c.box(0, f.H - 0.05, 0.015, f.along, 0.05, f.depth, PAL.countertop);
};

const sink: FurnitureBuilder = (c) => {
  const { f } = c;
  counter(c);
  const m = Math.min(f.along, f.depth);
  c.box(0, f.H, 0, m * 0.7, 0.006, m * 0.55, PAL.sinkBasin, { vary: 0 });
  c.box(0, f.H, m * 0.285, m * 0.76, 0.012, 0.02, PAL.sink);
  const bz = -f.depth / 2 + 0.05;
  c.cyl(0, f.H, bz, 0.018, 0.02, 0.2, 6, PAL.chrome);
  c.g.cyl(0.014, 0.014, 0.14, 6, PAL.chrome, c.at(0, f.H + 0.2, bz + 0.06, { rx: Math.PI / 2 }));
  c.cyl(0, f.H + 0.15, bz + 0.12, 0.012, 0.012, 0.05, 6, PAL.chrome);
};

const stove: FurnitureBuilder = (c) => {
  const { f, p } = c;
  const col = p.color ?? PAL.stove;
  const fz = f.depth / 2;
  c.box(0, 0, 0, f.along - 0.02, f.H - 0.04, f.depth - 0.03, col, AO);
  c.box(0, f.H - 0.04, 0, f.along, 0.04, f.depth, PAL.stoveTop);
  c.box(0, 0.12, fz + 0.006, f.along * 0.8, f.H * 0.55, 0.012, shadeHex(col, 1.15));
  c.box(0, 0.22, fz + 0.009, f.along * 0.6, f.H * 0.3, 0.018, 0x241f2a);
  c.box(0, f.H * 0.55 + 0.17, fz + 0.025, f.along * 0.65, 0.025, 0.05, PAL.chrome);
  const knobs = Math.max(2, Math.round(f.along / 0.12));
  for (let i = 0; i < knobs; i++) c.box(-f.along / 2 + (f.along / knobs) * (i + 0.5), f.H - 0.11, fz + 0.015, 0.035, 0.035, 0.03, PAL.chrome);
  for (let i = 0; i < 4; i++) {
    const ox = (i % 2 ? 0.5 : -0.5) * (f.along / 2);
    const oz = (i < 2 ? -0.5 : 0.5) * (f.depth / 2);
    c.cyl(ox, f.H, oz, 0.075, 0.075, 0.012, 9, PAL.burner);
    c.cyl(ox, f.H, oz, 0.045, 0.045, 0.014, 9, i === 3 ? 0xff6a3c : 0x3a3540, { vary: 0 });
  }
};

const fridge: FurnitureBuilder = (c) => {
  const { f, p } = c;
  const col = p.color ?? PAL.fridge;
  const fz = f.depth / 2;
  c.box(0, 0.02, 0, f.along - 0.03, f.H - 0.02, f.depth - 0.04, col, AO);
  c.box(0, f.H - 0.02, 0, f.along - 0.01, 0.02, f.depth - 0.02, PAL.fridgeTrim);
  c.box(0, 0.03, fz - 0.015, f.along - 0.04, f.H * 0.62, 0.01, shadeHex(col, 1.04));
  c.box(0, f.H * 0.65 + 0.03, fz - 0.015, f.along - 0.04, f.H * 0.33, 0.01, shadeHex(col, 1.04));
  c.box(f.along / 2 - 0.07, f.H * 0.32, fz + 0.005, 0.03, 0.28, 0.045, PAL.chrome);
  c.box(f.along / 2 - 0.07, f.H * 0.7, fz + 0.005, 0.03, 0.18, 0.045, PAL.chrome);
  c.box(-0.06, f.H * 0.45, fz - 0.005, 0.14, 0.11, 0.016, 0xffffff);
  c.box(-0.1, f.H * 0.45 + 0.08, fz, 0.03, 0.03, 0.022, 0xe2453c);
  c.box(0.05, f.H * 0.28, fz, 0.035, 0.035, 0.022, 0xffc93c);
  c.box(-0.03, f.H * 0.2, fz, 0.035, 0.035, 0.022, 0x5fa8e8);
};

const BOOK_COLS = [0xd9574f, 0x6b8fd6, 0xe8b04a, 0x7fbf8e, 0xb07fd8, 0xf2a6a0, 0x3d5a80];

/** Open shelf / bookcase; its top is the L3 perch. Books (spines facing the room) on every shelf but the top. */
function shelfLike(c: FurnCtx, col: number, shelves: number, spines: boolean): void {
  const { f } = c;
  const A = f.along;
  const Dp = f.depth;
  const H = f.H;
  const sideW = 0.035;
  c.box(-A / 2 + sideW / 2, 0, 0, sideW, H, Dp, col, AO);
  c.box(A / 2 - sideW / 2, 0, 0, sideW, H, Dp, col, AO);
  c.box(0, 0, -Dp / 2 + 0.01, A, H, 0.02, shadeHex(col, 0.75));
  for (let k = 0; k < shelves; k++) {
    const y = k === 0 ? 0.04 : (H / shelves) * k;
    c.box(0, y, 0, A - 0.01, 0.03, Dp - 0.01, col);
    if (k >= shelves - 1 && H > 1) continue;
    const n = Math.floor((A - 0.08) / 0.065);
    let u = -A / 2 + 0.06;
    for (let i = 0; i < n; i++) {
      const hsh = (i * 7 + k * 3) % 9;
      if (hsh === 0) {
        // a little jar or a lying book now and then
        c.cyl(u + 0.02, y + 0.03, 0, 0.03, 0.03, 0.08, 7, k % 2 ? 0xbfe3d6 : 0xfff1dc);
        u += 0.075;
        continue;
      }
      const bh = Math.min(H / shelves - 0.08, 0.15 + ((i * 13 + k * 5) % 4) * 0.025);
      const bw = 0.045 + ((i + k) % 3) * 0.008;
      const bc = BOOK_COLS[(i * 3 + k) % BOOK_COLS.length];
      const lean = hsh === 4 ? 0.18 : 0;
      c.box(u, y + 0.03, 0, bw, bh, Dp * 0.62, bc, undefined, { rz: lean });
      if (spines) {
        c.box(u, y + 0.03 + bh * 0.7, Dp * 0.31 + 0.002, bw * 0.8, 0.015, 0.004, 0xfff4d0, { vary: 0 });
        c.box(u, y + 0.03 + bh * 0.25, Dp * 0.31 + 0.002, bw * 0.8, 0.01, 0.004, shadeHex(bc, 0.7), { vary: 0 });
      }
      u += bw + 0.012;
      if (u > A / 2 - 0.06) break;
    }
  }
  c.box(0, H - 0.035, 0, A + 0.02, 0.035, Dp + 0.02, shadeHex(col, 1.1));
}

const shelf: FurnitureBuilder = (c) => shelfLike(c, c.p.color ?? PAL.shelf, 4, false);
const bookcase: FurnitureBuilder = (c) => shelfLike(c, c.p.color ?? 0x8d5a3b, Math.max(3, Math.round(c.f.H / 0.42)), true);

const table: FurnitureBuilder = (c) => {
  const { f } = c;
  const col = c.p.color ?? PAL.tableTop;
  c.box(0, f.H - 0.05, 0, f.along - 0.02, 0.05, f.depth - 0.02, col);
  c.box(0, f.H - 0.11, 0, f.along - 0.1, 0.06, f.depth - 0.1, shadeHex(col, 0.8));
  legs(c, f.along, f.depth, f.H - 0.05, 0.05, shadeHex(col, 0.75), 0.06);
};

const chair: FurnitureBuilder = (c) => {
  const { f, p, play } = c;
  const g = c.g;
  const col = p.color ?? PAL.chair;
  const cx = f.cx;
  const cz = f.cz;
  const sw = f.sw;
  const sd = f.sd;
  const H = f.H;
  // backrest on the side away from the nearest table / desk
  let bx = 0;
  let bz = -1;
  let best = Infinity;
  for (const t of play.shell.furniture) {
    if (t.type !== 'table' && t.type !== 'desk' && t.type !== 'party-table') continue;
    const dx = t.x + t.w / 2 - (p.x + p.w / 2);
    const dz = t.z + t.d / 2 - (p.z + p.d / 2);
    const dist = Math.hypot(dx, dz);
    if (dist < best) {
      best = dist;
      if (Math.abs(dx) > Math.abs(dz)) {
        bx = -Math.sign(dx);
        bz = 0;
      } else {
        bx = 0;
        bz = -Math.sign(dz);
      }
    }
  }
  g.boxUp(sw - 0.08, 0.05, sd - 0.08, col, { x: cx, y: H - 0.05, z: cz });
  g.boxUp(sw - 0.12, 0.02, sd - 0.12, 0xfff1dc, { x: cx, y: H, z: cz });
  for (const [ox, oz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ])
    g.boxUp(0.035, H - 0.05, 0.035, shadeHex(col, 0.75), { x: cx + ox * (sw / 2 - 0.06), y: 0, z: cz + oz * (sd / 2 - 0.06) }, AO);
  const bw = bx ? 0.035 : sw - 0.08;
  const bd = bz ? 0.035 : sd - 0.08;
  g.boxUp(bw, 0.42, bd, col, { x: cx + bx * (sw / 2 - 0.05), y: H, z: cz + bz * (sd / 2 - 0.05) });
  g.boxUp(bx ? 0.04 : sw - 0.12, 0.06, bz ? 0.04 : sd - 0.12, shadeHex(col, 1.12), { x: cx + bx * (sw / 2 - 0.05), y: H + 0.36, z: cz + bz * (sd / 2 - 0.05) });
};

const sofa: FurnitureBuilder = (c) => {
  const { f } = c;
  const col = c.p.color ?? PAL.sofa;
  const A = f.along;
  const Dp = f.depth;
  c.box(0, 0.06, 0, A - 0.02, f.H - 0.14, Dp - 0.02, shadeHex(col, 0.85), AO);
  // seat cushions (the walkable L1 top)
  const n = Math.max(1, Math.round(A / 0.5));
  for (let i = 0; i < n; i++) c.box(-A / 2 + (A / n) * (i + 0.5), f.H - 0.1, 0.02, A / n - 0.03, 0.1, Dp - 0.08, col, undefined);
  // low backrest and rolled arms (only on pieces deep enough to read as a sofa)
  if (Dp >= 0.7 && A >= 0.7) {
    c.box(0, f.H - 0.1, -Dp / 2 + 0.05, A - 0.04, 0.2, 0.1, shadeHex(col, 0.92));
    for (const s of [-1, 1]) c.g.cyl(0.045, 0.045, Dp - 0.06, 7, shadeHex(col, 0.95), c.at(s * (A / 2 - 0.045), f.H + 0.02, 0, { rx: Math.PI / 2 }));
  }
  legs(c, A, Dp, 0.06, 0.04, PAL.woodDark, 0.06, true);
};

const catBed: FurnitureBuilder = (c) => {
  const { f } = c;
  const r = Math.min(f.sw, f.sd) * 0.45;
  c.g.torus(r * 0.78, r * 0.26, c.p.color ?? PAL.catBed, { x: f.cx, y: r * 0.26, z: f.cz, rx: Math.PI / 2 }, AO, 5, 14);
  c.g.cylUp(r * 0.72, r * 0.72, 0.05, 12, PAL.catBedInner, { x: f.cx, y: 0, z: f.cz });
  c.g.sphere(0.04, 0xffffff, { x: f.cx + r * 0.3, y: 0.06, z: f.cz - r * 0.2 }, undefined, 6, 4);
};

const rug: FurnitureBuilder = (c) => {
  const { f } = c;
  const col = c.p.color ?? PAL.rug;
  c.g.boxUp(f.sw, 0.012, f.sd, col, { x: f.cx, y: 0, z: f.cz }, { vary: 0.01 });
  c.g.boxUp(f.sw - 0.12, 0.016, f.sd - 0.12, mixHex(col, 0xffffff, 0.35), { x: f.cx, y: 0, z: f.cz }, { vary: 0.01 });
  c.g.boxUp(f.sw - 0.24, 0.018, f.sd - 0.24, col, { x: f.cx, y: 0, z: f.cz }, { vary: 0.01 });
};

const cabinet: FurnitureBuilder = counter;

// ----- bathroom -----

const bathtub: FurnitureBuilder = (c) => {
  const { f } = c;
  const col = c.p.color ?? 0xfdfdfb;
  const A = f.along;
  const Dp = f.depth;
  const H = f.H;
  // body on little gold claw feet
  c.box(0, 0.06, 0, A - 0.04, H - 0.1, Dp - 0.06, col, AO);
  c.box(0, H - 0.05, 0, A, 0.05, Dp - 0.02, shadeHex(col, 1.02));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) c.sph(sx * (A / 2 - 0.08), 0.03, sz * (Dp / 2 - 0.08), 0.04, 0xe8b04a);
  // the water and the foam (recessed so the rim reads)
  c.box(0, H - 0.035, 0, A - 0.14, 0.012, Dp - 0.16, 0x8fd0ea, { vary: 0 });
  for (let i = 0; i < 9; i++) c.sph(-A / 2 + 0.14 + ((i * 0.37) % 1) * (A - 0.28), H - 0.02, (((i * 0.61) % 1) - 0.5) * (Dp - 0.24), 0.035 + (i % 3) * 0.01, 0xffffff, { sy: 0.6 });
  // tap at the wall end
  c.cyl(-A / 2 + 0.06, H, -Dp / 4, 0.016, 0.016, 0.16, 6, PAL.chrome);
  c.g.cyl(0.012, 0.012, 0.1, 6, PAL.chrome, c.at(-A / 2 + 0.11, H + 0.15, -Dp / 4, { rz: Math.PI / 2 }));
};

const toilet: FurnitureBuilder = (c) => {
  const { f } = c;
  const H = f.H;
  const col = c.p.color ?? 0xffffff;
  const back = -f.depth / 2;
  c.cyl(0, 0, 0.02, 0.09, 0.11, H * 0.6, 9, col, AO);
  c.cyl(0, H * 0.55, 0.03, 0.15, 0.1, H * 0.45 - 0.03, 10, col);
  c.g.torus(0.12, 0.025, 0xf2f2f2, c.at(0, H - 0.015, 0.03, { rx: Math.PI / 2 }), undefined, 4, 12);
  c.cyl(0, H - 0.03, 0.03, 0.1, 0.1, 0.01, 10, 0x9fd3e8, { vary: 0 });
  // tank and lid up against the wall
  c.box(0, H - 0.05, back + 0.08, Math.min(0.32, f.along - 0.04), 0.36, 0.14, col);
  c.box(0, H + 0.31, back + 0.08, Math.min(0.34, f.along - 0.02), 0.03, 0.16, shadeHex(col, 0.97));
  c.cyl(0.06, H + 0.34, back + 0.08, 0.018, 0.018, 0.012, 8, PAL.chrome);
  c.g.cyl(0.13, 0.13, 0.02, 10, 0xf6f6f6, c.at(0, H + 0.12, back + 0.165, { rx: Math.PI / 2 - 0.12 }));
};

/** Pale reflective glass: a gradient of pale blues with two white diagonal glints. */
function mirrorGlass(c: FurnCtx, lx: number, y0: number, lz: number, w: number, h: number): void {
  const bands = 5;
  for (let i = 0; i < bands; i++) c.box(lx, y0 + (h / bands) * i, lz, w, h / bands, 0.008, mixHex(0xf2fbff, 0xb9dbe8, i / (bands - 1)), { vary: 0 });
  c.box(lx - w * 0.18, y0 + h * 0.35, lz + 0.006, w * 0.08, h * 0.55, 0.004, 0xffffff, { vary: 0 }, { rz: -0.55 });
  c.box(lx - w * 0.02, y0 + h * 0.3, lz + 0.006, w * 0.035, h * 0.4, 0.004, 0xffffff, { vary: 0 }, { rz: -0.55 });
}

const mirror: FurnitureBuilder = (c) => {
  const { f, p } = c;
  const frame = p.color ?? 0xe8b04a;
  const onWall = p.z === 0 || p.x === 0;
  const w = Math.min(f.along - 0.06, 0.9);
  if (onWall) {
    const lz = -f.depth / 2 + 0.03;
    const y0 = Math.max(f.H + 0.25, 1.0);
    const h = Math.min(0.85, 2.15 - y0);
    c.box(0, y0 - 0.04, lz - 0.01, w + 0.08, h + 0.08, 0.025, frame);
    mirrorGlass(c, 0, y0, lz + 0.006, w, h);
    c.g.ico(0.03, 0xffffff, c.at(w / 2 - 0.02, y0 + h + 0.02, lz + 0.02)); // a cheeky sparkle bead on the frame
  } else {
    // cheval mirror on a stand
    c.box(-w / 2 - 0.02, 0, 0, 0.04, 1.65, 0.04, frame, AO);
    c.box(w / 2 + 0.02, 0, 0, 0.04, 1.65, 0.04, frame, AO);
    c.box(0, 0, 0, w + 0.2, 0.04, 0.3, shadeHex(frame, 0.85), AO);
    c.box(0, 0.3, 0, w + 0.02, 1.25, 0.03, frame, undefined, { rx: -0.06 });
    mirrorGlass(c, 0, 0.34, 0.03, w - 0.04, 1.15);
  }
};

const vanity: FurnitureBuilder = (c) => {
  const { f, p } = c;
  const col = p.color ?? 0x9be7d8;
  c.box(0, 0.08, 0, f.along - 0.03, f.H - 0.13, f.depth - 0.05, col, AO);
  drawers(c, shadeHex(col, 1.08), 2, f.H - 0.08, 0.1, Math.max(1, Math.round(f.along / 0.4)));
  c.box(0, f.H - 0.05, 0.015, f.along, 0.05, f.depth, 0xf7f3ee);
  legs(c, f.along, f.depth, 0.08, 0.04, shadeHex(col, 0.7), 0.06, true);
  const m = Math.min(f.along, f.depth);
  c.cyl(0, f.H, 0, m * 0.26, m * 0.2, 0.01, 12, 0xd7dde3, { vary: 0 });
  const bz = -f.depth / 2 + 0.05;
  c.cyl(0, f.H, bz, 0.016, 0.018, 0.16, 6, PAL.chrome);
  c.g.cyl(0.012, 0.012, 0.1, 6, PAL.chrome, c.at(0, f.H + 0.16, bz + 0.045, { rx: Math.PI / 2 }));
};

// ----- living room / office -----

/** Where a TV's picture goes (shared with dynamics.ts). Local frame: centre lx 0, bottom y, lz just in front. */
function tvGeom(f: PieceFrame): { w: number; h: number; y: number; lz: number; wall: boolean } {
  const wall = f.H < 0.05;
  const w = Math.max(0.36, Math.min(1.1, f.along * 0.86));
  const h = w * 0.58;
  const y = wall ? 1.0 : f.H + 0.07;
  const lz = -f.depth / 2 + (wall ? 0.05 : 0.08);
  return { w, h, y, lz, wall };
}

const tv: FurnitureBuilder = (c) => {
  const { f, p } = c;
  const t = tvGeom(f);
  const body = p.color ?? 0x2b2d42;
  if (!t.wall) {
    // a built-in console (its top is the walkable surface) unless the TV stands on another piece (a tv-stand)
    if (!onAnotherPiece(c)) {
      c.box(0, 0, 0, f.along - 0.03, f.H - 0.03, f.depth - 0.04, 0x8d5a3b, AO);
      c.box(0, f.H - 0.03, 0, f.along, 0.03, f.depth - 0.02, 0xa8714a);
    }
    c.box(0, f.H, t.lz - 0.02, 0.18, 0.02, 0.1, 0x3a3a46);
    c.box(0, f.H, t.lz - 0.02, 0.04, 0.08, 0.03, 0x3a3a46);
  }
  c.box(0, t.y - 0.03, t.lz - 0.025, t.w + 0.06, t.h + 0.06, 0.045, body);
  c.box(0, t.y, t.lz, t.w, t.h, 0.006, 0x1a1c26, { vary: 0 });
  c.box(t.w / 2 - 0.02, t.y - 0.025, t.lz + 0.002, 0.012, 0.012, 0.004, 0xff4d4d, { vary: 0 });
};

/** True when another solid piece covers any of this piece's cells (decor sitting on a base piece). */
function onAnotherPiece(c: FurnCtx): boolean {
  const p = c.p;
  return c.play.shell.furniture.some(
    (o) => o !== p && !FLAT_TYPES.has(o.type) && o.type !== p.type && o.x < p.x + p.w && o.x + o.w > p.x && o.z < p.z + p.d && o.z + o.d > p.z,
  );
}

const tvStand: FurnitureBuilder = (c) => {
  const { f, p } = c;
  const col = p.color ?? 0xa8714a;
  c.box(0, 0.05, 0, f.along - 0.03, f.H - 0.08, f.depth - 0.04, col, AO);
  c.box(0, f.H - 0.04, 0, f.along, 0.04, f.depth - 0.02, shadeHex(col, 1.12));
  const fz = f.depth / 2;
  // open middle cubby with a games console, doors either side
  const n = Math.max(2, Math.round(f.along / 0.4));
  const dw = (f.along - 0.04) / n;
  for (let i = 0; i < n; i++) {
    const u = -f.along / 2 + 0.02 + dw * (i + 0.5);
    if (i === Math.floor(n / 2)) {
      c.box(u, 0.08, fz - 0.01, dw - 0.03, f.H - 0.16, 0.01, shadeHex(col, 0.55));
      c.box(u, 0.1, fz - 0.06, dw * 0.6, 0.05, 0.12, 0xf2f2f2);
      c.box(u - dw * 0.15, 0.13, fz - 0.003, 0.02, 0.006, 0.004, 0x5cff7a, { vary: 0 });
    } else {
      c.box(u, 0.08, fz + 0.006, dw - 0.03, f.H - 0.16, 0.012, shadeHex(col, 1.06));
      c.sph(u + (i < n / 2 ? 1 : -1) * (dw / 2 - 0.05), f.H * 0.5, fz + 0.02, 0.016, PAL.handle);
    }
  }
  legs(c, f.along, f.depth, 0.05, 0.035, PAL.woodDark, 0.05, true);
};

const coffeeTable: FurnitureBuilder = (c) => {
  const { f, p } = c;
  const col = p.color ?? 0xc58a5c;
  c.box(0, f.H - 0.05, 0, f.along - 0.04, 0.05, f.depth - 0.04, col);
  c.box(0, f.H - 0.055, 0, f.along - 0.1, 0.012, f.depth - 0.1, shadeHex(col, 0.8));
  legs(c, f.along - 0.04, f.depth - 0.04, f.H - 0.05, 0.05, shadeHex(col, 0.72), 0.06, true);
  // lower shelf with a magazine fan
  if (f.H > 0.3) {
    c.box(0, 0.09, 0, f.along - 0.14, 0.025, f.depth - 0.14, shadeHex(col, 0.9));
    for (let i = 0; i < 3; i++) c.box(-0.06 + i * 0.05, 0.115 + i * 0.006, 0, 0.16, 0.006, 0.12, [0xef476f, 0x5fa8e8, 0xffd23f][i], undefined, { ry: -0.3 + i * 0.25 });
  }
};

const desk: FurnitureBuilder = (c) => {
  const { f, p } = c;
  const col = p.color ?? 0xd9b88f;
  const A = f.along;
  const Dp = f.depth;
  c.box(0, f.H - 0.045, 0, A, 0.045, Dp - 0.02, col);
  // drawer pedestal on the right, two legs on the left, a modesty panel at the back
  const pw = Math.min(0.38, A * 0.35);
  c.box(A / 2 - pw / 2 - 0.02, 0, 0, pw, f.H - 0.045, Dp - 0.08, shadeHex(col, 0.9), AO);
  for (let r = 0; r < 3; r++) {
    const y = 0.05 + r * ((f.H - 0.12) / 3);
    c.box(A / 2 - pw / 2 - 0.02, y, Dp / 2 - 0.035, pw - 0.04, (f.H - 0.12) / 3 - 0.03, 0.012, shadeHex(col, 1.05));
    c.box(A / 2 - pw / 2 - 0.02, y + (f.H - 0.12) / 6, Dp / 2 - 0.022, 0.08, 0.014, 0.014, PAL.handle);
  }
  for (const sz of [-1, 1]) c.box(-A / 2 + 0.05, 0, sz * (Dp / 2 - 0.06), 0.04, f.H - 0.045, 0.04, shadeHex(col, 0.7), AO);
  c.box(-0.05, f.H * 0.35, -Dp / 2 + 0.03, A - pw - 0.12, f.H * 0.5, 0.015, shadeHex(col, 0.85));
};

const officeChair: FurnitureBuilder = (c) => {
  const { f, p } = c;
  const col = p.color ?? 0x3d5a80;
  const H = f.H;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    c.g.boxUp(0.03, 0.025, 0.17, 0x2b2d42, c.at(Math.sin(a) * 0.08, 0.03, Math.cos(a) * 0.08, { ry: a }));
    c.sph(Math.sin(a) * 0.16, 0.015, Math.cos(a) * 0.16, 0.022, 0x1b1c26);
  }
  c.cyl(0, 0.04, 0, 0.022, 0.022, H - 0.12, 7, PAL.chrome);
  c.box(0, H - 0.09, 0, 0.34, 0.09, 0.34, col);
  c.box(0, H - 0.02, 0.01, 0.3, 0.02, 0.3, shadeHex(col, 1.15));
  c.box(0, H, -0.16, 0.3, 0.42, 0.06, col, undefined, { rx: -0.08 });
  c.box(0, H + 0.36, -0.17, 0.26, 0.05, 0.065, shadeHex(col, 1.1));
  for (const s of [-1, 1]) {
    c.box(s * 0.16, H - 0.02, -0.02, 0.025, 0.14, 0.025, 0x2b2d42);
    c.box(s * 0.16, H + 0.12, 0, 0.05, 0.025, 0.2, 0x2b2d42);
  }
};

// ----- bedroom -----

const bed: FurnitureBuilder = (c) => {
  const { f, p } = c;
  const quilt = p.color ?? 0x8ecae6;
  const A = f.along;
  const Dp = f.depth;
  const H = f.H;
  // headboard against the wall (at the back of the local frame); a free-standing bed puts it at -lz too
  c.box(0, 0.05, 0, A - 0.02, H - 0.2, Dp - 0.02, 0xb07a52, AO);
  c.box(0, H - 0.2, 0, A - 0.06, 0.14, Dp - 0.06, 0xfffaf2);
  // quilt over the front two thirds, with a patchwork of squares and a folded-back edge
  const qd = Dp * 0.68;
  c.box(0, H - 0.07, Dp / 2 - qd / 2 - 0.02, A - 0.02, 0.07, qd, quilt);
  const sq = 0.16;
  const nx = Math.max(1, Math.floor((A - 0.1) / sq));
  const nz = Math.max(1, Math.floor((qd - 0.1) / sq));
  for (let i = 0; i < nx; i++)
    for (let k = 0; k < nz; k++) {
      if ((i + k) % 2) continue;
      c.box(-((nx - 1) * sq) / 2 + i * sq, H, Dp / 2 - qd + 0.05 + sq / 2 + k * sq, sq - 0.02, 0.004, sq - 0.02, mixHex(quilt, 0xffffff, 0.45), { vary: 0 });
    }
  c.box(0, H - 0.07, Dp / 2 - qd - 0.03, A - 0.02, 0.09, 0.08, mixHex(quilt, 0xffffff, 0.6));
  c.box(0, 0.06, Dp / 2 - 0.005, A - 0.02, H - 0.14, 0.02, shadeHex(quilt, 0.88)); // quilt hanging down the front
  // pillows
  const np = A > 0.9 ? 2 : 1;
  for (let i = 0; i < np; i++) c.box(np === 2 ? (i ? 1 : -1) * A * 0.24 : 0, H - 0.08, -Dp / 2 + 0.18, np === 2 ? A * 0.4 : A * 0.7, 0.11, 0.22, 0xffffff, undefined, { rx: -0.15 });
  c.box(0, 0, -Dp / 2 - 0.0, A + 0.04, H + 0.42, 0.06, 0x8d5a3b, AO);
  c.box(0, H + 0.42, -Dp / 2, A + 0.08, 0.05, 0.08, 0xa8714a);
  // tiny heart cushion
  c.sph(A * 0.05, H + 0.02, -Dp / 2 + 0.34, 0.06, 0xff8fab, { sz: 0.45 });
};

const nightstand: FurnitureBuilder = (c) => {
  const { f, p } = c;
  const col = p.color ?? 0xf3d2b3;
  c.box(0, 0.06, 0, f.along - 0.08, f.H - 0.1, f.depth - 0.08, col, AO);
  c.box(0, f.H - 0.04, 0, f.along - 0.04, 0.04, f.depth - 0.04, shadeHex(col, 1.08));
  drawers(c, shadeHex(col, 1.05), 2, f.H - 0.06, 0.08);
  legs(c, f.along - 0.08, f.depth - 0.08, 0.06, 0.03, PAL.woodDark, 0.03, true);
};

const wardrobe: FurnitureBuilder = (c) => {
  const { f, p } = c;
  const col = p.color ?? 0xd8b89a;
  const fz = f.depth / 2;
  c.box(0, 0.06, 0, f.along - 0.02, f.H - 0.1, f.depth - 0.03, col, AO);
  const n = Math.max(2, Math.round(f.along / 0.4));
  const dw = (f.along - 0.04) / n;
  for (let i = 0; i < n; i++) {
    const u = -f.along / 2 + 0.02 + dw * (i + 0.5);
    c.box(u, 0.1, fz + 0.004, dw - 0.025, f.H - 0.22, 0.012, shadeHex(col, 1.06));
    c.box(u, 0.25, fz + 0.01, dw - 0.09, f.H * 0.3, 0.008, shadeHex(col, 0.95));
    c.box(u, f.H * 0.55, fz + 0.01, dw - 0.09, f.H * 0.3, 0.008, shadeHex(col, 0.95));
    c.box(u + (i % 2 ? -1 : 1) * (dw / 2 - 0.04), f.H * 0.48, fz + 0.025, 0.018, 0.16, 0.025, PAL.handle);
  }
  c.box(0, f.H - 0.04, 0.005, f.along + 0.04, 0.04, f.depth + 0.02, shadeHex(col, 0.9));
  legs(c, f.along - 0.02, f.depth - 0.03, 0.06, 0.04, PAL.woodDark, 0.05, true);
};

const dresser: FurnitureBuilder = (c) => {
  const { f, p } = c;
  const col = p.color ?? 0xb5838d;
  c.box(0, 0.06, 0, f.along - 0.03, f.H - 0.1, f.depth - 0.04, col, AO);
  c.box(0, f.H - 0.04, 0.005, f.along, 0.04, f.depth - 0.02, shadeHex(col, 1.1));
  drawers(c, shadeHex(col, 1.07), 3, f.H - 0.06, 0.08, Math.max(1, Math.round(f.along / 0.45)));
  legs(c, f.along - 0.03, f.depth - 0.04, 0.06, 0.035, PAL.woodDark, 0.05, true);
};

const washingMachine: FurnitureBuilder = (c) => {
  const { f, p } = c;
  const col = p.color ?? 0xf6f7f9;
  const fz = f.depth / 2;
  c.box(0, 0.02, 0, f.along - 0.04, f.H - 0.02, f.depth - 0.04, col, AO);
  c.box(0, f.H - 0.12, fz - 0.01, f.along - 0.06, 0.1, 0.012, 0xe2e6ea);
  c.cyl(-f.along * 0.25, f.H - 0.09, fz, 0.025, 0.025, 0.02, 8, 0x9aa0ae, undefined, { rx: Math.PI / 2 });
  c.box(f.along * 0.15, f.H - 0.1, fz + 0.002, 0.08, 0.04, 0.006, 0x5cff7a, { vary: 0 });
  const r = Math.min(f.along, f.H) * 0.26;
  const dy = f.H * 0.45;
  c.g.torus(r, 0.025, 0xc5cbd3, c.at(0, dy, fz - 0.01), undefined, 5, 16);
  c.g.cyl(r - 0.01, r - 0.01, 0.01, 14, 0x5c7a99, c.at(0, dy, fz - 0.012, { rx: Math.PI / 2 }), { vary: 0 });
  // laundry tumbling inside: a red sock and a yellow shirt peeking
  c.sph(-r * 0.3, dy - r * 0.35, fz - 0.03, r * 0.35, 0xef476f, { sz: 0.4 });
  c.sph(r * 0.3, dy - r * 0.4, fz - 0.03, r * 0.38, 0xffd23f, { sz: 0.4 });
  c.box(r * 0.55, dy + r * 0.45, fz - 0.005, r * 0.18, r * 0.3, 0.004, 0xffffff, { vary: 0 }, { rz: -0.6 });
};

// ----- party / wedding / boss -----

const partyTable: FurnitureBuilder = (c) => {
  const { f, p } = c;
  const cloth = p.color ?? 0xffc8dd;
  const A = f.along;
  const Dp = f.depth;
  // a skirted table: the cloth falls to the floor, with a scalloped trim
  c.box(0, 0.03, 0, A - 0.04, f.H - 0.06, Dp - 0.04, cloth, AO);
  c.box(0, f.H - 0.04, 0, A, 0.04, Dp, mixHex(cloth, 0xffffff, 0.35));
  const n = Math.max(3, Math.round(A / 0.12));
  for (let i = 0; i < n; i++) {
    const u = -A / 2 + (A / n) * (i + 0.5);
    c.sph(u, f.H - 0.07, Dp / 2 + 0.002, A / n / 2, i % 2 ? 0xffffff : 0xff8fab, { sz: 0.35, sy: 0.7 });
  }
  c.box(0, 0, 0, A + 0.02, 0.03, Dp + 0.02, shadeHex(cloth, 0.85));
};

const buffet: FurnitureBuilder = (c) => {
  const { f, p } = c;
  const cloth = p.color ?? 0xfffaf2;
  const A = f.along;
  const Dp = f.depth;
  c.box(0, 0.02, 0, A - 0.02, f.H - 0.06, Dp - 0.02, cloth, AO);
  c.box(0, f.H - 0.04, 0, A + 0.04, 0.04, Dp + 0.04, 0xffffff);
  c.box(0, f.H - 0.14, Dp / 2 + 0.012, A + 0.03, 0.03, 0.01, 0xe8b04a);
  // pleats
  const n = Math.max(3, Math.round(A / 0.16));
  for (let i = 0; i < n; i++) c.box(-A / 2 + (A / n) * (i + 0.5), 0.02, Dp / 2 + 0.004, 0.012, f.H - 0.18, 0.006, shadeHex(cloth, 0.92), { vary: 0 });
};

/** Fireplace firebox in the local frame (shared with dynamics.ts). */
function fireGeom(f: PieceFrame): { w: number; h: number; y: number; lz: number } {
  const w = Math.min(f.along * 0.55, 0.8);
  const h = Math.min(f.H * 0.62, 0.6);
  return { w, h, y: 0.08, lz: f.depth / 2 - 0.02 };
}

const fireplace: FurnitureBuilder = (c) => {
  const { f, p, play } = c;
  const brick = p.color ?? 0xc0614a;
  const A = f.along;
  const Dp = f.depth;
  const fb = fireGeom(f);
  // brick body with a dark firebox, a stone hearth and a wooden mantel (the walkable top)
  const sideW = (A - fb.w) / 2;
  c.box(-A / 2 + sideW / 2, 0, 0, sideW, f.H - 0.06, Dp - 0.02, brick, AO);
  c.box(A / 2 - sideW / 2, 0, 0, sideW, f.H - 0.06, Dp - 0.02, brick, AO);
  c.box(0, fb.y + fb.h, 0, fb.w + 0.01, f.H - 0.06 - fb.y - fb.h, Dp - 0.02, brick);
  c.box(0, fb.y, -0.04, fb.w, fb.h, Dp - 0.1, 0x2a1d22);
  // bricks pattern on the front
  for (let r = 0; r < 4; r++)
    for (let i = 0; i < 3; i++) {
      const y = 0.06 + r * ((f.H - 0.12) / 4);
      for (const s of [-1, 1]) c.box(s * (A / 2 - sideW / 2) + ((r % 2) - 0.5) * 0.03, y, Dp / 2 - 0.005, sideW * 0.28, 0.035, 0.012, shadeHex(brick, 0.82 + (i % 2) * 0.1), { vary: 0.03 });
    }
  c.box(0, 0, Dp / 2 + 0.08, A + 0.1, 0.05, 0.18, 0x9aa0ae, AO);
  c.box(0, f.H - 0.06, 0.02, A + 0.12, 0.06, Dp + 0.06, 0x8d5a3b);
  // logs
  for (let i = 0; i < 3; i++) c.g.cyl(0.035, 0.035, fb.w * 0.7, 6, i === 1 ? 0x6b4a2e : 0x8d5a3b, c.at(0, fb.y + 0.03 + (i === 1 ? 0.05 : 0), -0.02 + (i - 1) * 0.06, { rz: Math.PI / 2, ry: (i - 1) * 0.25 }));
  // chimney breast up the wall
  c.box(0, f.H, -Dp / 2 + 0.1, A * 0.7, 2.4 - f.H, 0.2, shadeHex(brick, 0.92));
  // xmas: stockings on the mantel
  if ((play.room.theme ?? 'default') === 'xmas') {
    for (let i = 0; i < 3; i++) {
      const u = -A * 0.3 + i * A * 0.3;
      c.box(u, f.H - 0.32, Dp / 2 + 0.05, 0.08, 0.24, 0.03, i === 1 ? 0x2f8f4e : 0xe63946);
      c.box(u + 0.04, f.H - 0.32, Dp / 2 + 0.05, 0.1, 0.07, 0.03, i === 1 ? 0x2f8f4e : 0xe63946);
      c.box(u, f.H - 0.1, Dp / 2 + 0.052, 0.09, 0.05, 0.034, 0xffffff);
    }
  }
};

const arch: FurnitureBuilder = (c) => {
  const { f, p } = c;
  const wood = p.color ?? 0xfdfaf3;
  const A = Math.max(0.8, f.along);
  const r = A / 2 - 0.05;
  const top = 1.55;
  for (const s of [-1, 1]) {
    c.box(s * r, 0, 0, 0.06, top, 0.06, wood, AO);
    c.cyl(s * r, 0, 0, 0.1, 0.12, 0.16, 8, 0xe8d5b5, AO);
    bush(c, s * r, 0.18, 0, 0.1, 3, 0xffafcc);
  }
  const seg = 12;
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI;
    const x = Math.cos(a) * r;
    const y = top + Math.sin(a) * r * 0.75;
    c.g.boxUp(0.06, 0.12, 0.06, wood, c.at(x, y - 0.06, 0, { rz: a - Math.PI / 2 }));
    c.g.ico(0.055, i % 3 === 0 ? 0xffffff : i % 3 === 1 ? 0xffafcc : 0xffd6e0, c.at(x, y + 0.05, 0.03));
    if (i % 2 === 0) c.g.ico(0.04, PAL.leaf, c.at(x * 0.95, y - 0.03, -0.02));
  }
  // ribbon tails
  for (const s of [-1, 1]) c.box(s * (r - 0.02), top - 0.5, 0.05, 0.03, 0.5, 0.005, 0xffd6e0, { vary: 0 }, { rz: s * 0.08 });
};

/** Webcam position in the local frame (shared with dynamics.ts). */
function camGeom(f: PieceFrame): { y: number; lz: number } {
  return f.H < 0.05 ? { y: 1.12, lz: 0 } : { y: f.H + 0.08, lz: -f.depth / 2 + 0.1 };
}

const webcam: FurnitureBuilder = (c) => {
  const { f, p } = c;
  const col = p.color ?? 0x2b2d42;
  const g = camGeom(f);
  if (f.H < 0.05) {
    // tripod
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      c.g.cyl(0.012, 0.012, 1.1, 5, 0x3a3a46, c.at(Math.sin(a) * 0.12, 0.54, Math.cos(a) * 0.12, { rx: Math.cos(a) * 0.2, rz: -Math.sin(a) * 0.2 }));
    }
  } else c.cyl(0, f.H, g.lz, 0.04, 0.05, 0.03, 8, 0x3a3a46);
  c.box(0, g.y - 0.05, g.lz, 0.16, 0.1, 0.09, col);
  c.cyl(0, g.y, g.lz + 0.045, 0.035, 0.04, 0.03, 10, 0x1a1c26, undefined, { rx: Math.PI / 2 });
  c.cyl(0, g.y, g.lz + 0.062, 0.02, 0.02, 0.01, 10, 0x5c7a99, { vary: 0 }, { rx: Math.PI / 2 });
};

const door: FurnitureBuilder = (c) => {
  const { f, p } = c;
  const col = p.color ?? 0xd9a066;
  const w = Math.min(0.9, f.along - 0.06);
  const lz = -f.depth / 2 + 0.03;
  c.box(0, 0, lz, w, 2.0, 0.04, col);
  for (const y of [0.15, 1.05]) c.box(0, y, lz + 0.022, w - 0.16, 0.75, 0.01, shadeHex(col, 1.08));
  c.sph(w / 2 - 0.08, 0.98, lz + 0.05, 0.03, 0xe8b04a);
  c.box(-w / 2 - 0.04, 0, lz, 0.06, 2.06, 0.08, 0xfffaf2);
  c.box(w / 2 + 0.04, 0, lz, 0.06, 2.06, 0.08, 0xfffaf2);
  c.box(0, 2.0, lz, w + 0.14, 0.06, 0.08, 0xfffaf2);
  // a cat flap, naturally
  c.box(0, 0.06, lz + 0.022, 0.2, 0.2, 0.012, 0x6b4a2e);
  c.box(0, 0.08, lz + 0.03, 0.16, 0.16, 0.006, 0x3a2a2a);
};

const armchair: FurnitureBuilder = (c) => {
  const { f, p } = c;
  const col = p.color ?? 0xe07a5f;
  const A = f.along;
  const Dp = f.depth;
  c.box(0, 0.07, 0, A - 0.04, f.H - 0.17, Dp - 0.04, shadeHex(col, 0.88), AO);
  c.box(0, f.H - 0.1, 0.02, A - 0.16, 0.1, Dp - 0.12, col);
  c.box(0, f.H - 0.1, -Dp / 2 + 0.06, A - 0.04, 0.38, 0.1, shadeHex(col, 0.95));
  for (const s of [-1, 1]) {
    c.box(s * (A / 2 - 0.05), f.H - 0.12, 0, 0.09, 0.2, Dp - 0.06, shadeHex(col, 0.95));
    c.g.cyl(0.05, 0.05, Dp - 0.06, 7, col, c.at(s * (A / 2 - 0.05), f.H + 0.08, 0, { rx: Math.PI / 2 }));
  }
  legs(c, A - 0.04, Dp - 0.04, 0.07, 0.035, PAL.woodDark, 0.05, true);
  c.box(0.05, f.H, 0.02, 0.16, 0.12, 0.05, 0xfff1dc, undefined, { rx: -0.3, ry: 0.4 }); // cushion
};

const plantStand: FurnitureBuilder = (c) => {
  const { f, p } = c;
  const col = p.color ?? 0x8d5a3b;
  const r = Math.min(f.along, f.depth) * 0.36;
  c.cyl(0, f.H - 0.04, 0, r, r, 0.04, 10, col);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    c.g.cylUp(0.015, 0.018, f.H - 0.04, 5, shadeHex(col, 0.8), c.at(Math.sin(a) * r * 0.8, 0, Math.cos(a) * r * 0.8), AO);
  }
  c.cyl(0, f.H * 0.35, 0, r * 0.8, r * 0.8, 0.02, 10, shadeHex(col, 0.9));
  // trailing ivy over the front edge (the top stays free for props)
  for (let i = 0; i < 6; i++) {
    const u = (i / 5 - 0.5) * r * 1.6;
    const len = 0.12 + (i % 3) * 0.08;
    for (let k = 0; k < 3; k++) c.g.ico(0.03, k % 2 ? PAL.leaf : PAL.leafDark, c.at(u, f.H - 0.05 - (k * len) / 3, r + 0.01));
  }
};

const stage: FurnitureBuilder = (c) => {
  const { f, p } = c;
  const col = p.color ?? 0x7b2d3b;
  const A = f.along;
  const Dp = f.depth;
  c.box(0, 0, 0, A, f.H - 0.04, Dp, 0x8d5a3b, AO);
  c.box(0, f.H - 0.04, 0, A + 0.02, 0.04, Dp + 0.02, 0xa8714a);
  c.box(0, 0.02, Dp / 2 + 0.004, A, f.H - 0.08, 0.01, col);
  c.box(0, f.H - 0.1, Dp / 2 + 0.012, A, 0.03, 0.01, 0xe8b04a);
  // velvet curtains at the back, tied open
  for (const s of [-1, 1]) {
    for (let i = 0; i < 3; i++) c.box(s * (A / 2 - 0.08 - i * 0.07), f.H, -Dp / 2 + 0.05, 0.07, 2.25 - f.H, 0.06, shadeHex(col, 0.9 + (i % 2) * 0.12));
    c.box(s * (A / 2 - 0.15), f.H + 0.8, -Dp / 2 + 0.1, 0.24, 0.04, 0.04, 0xe8b04a);
  }
  c.box(0, 2.15, -Dp / 2 + 0.05, A, 0.12, 0.08, shadeHex(col, 1.1));
  // a mic stand at the front
  c.cyl(A * 0.3, f.H, Dp / 2 - 0.12, 0.05, 0.06, 0.02, 8, 0x2b2d42);
  c.cyl(A * 0.3, f.H, Dp / 2 - 0.12, 0.008, 0.008, 0.5, 5, PAL.chrome);
  c.sph(A * 0.3, f.H + 0.52, Dp / 2 - 0.12, 0.035, 0x2b2d42);
};

const none: FurnitureBuilder = () => {
  /* drawn with the walls */
};

/** Every FurnitureType has exactly one builder (a test pins it). */
export const FURNITURE_BUILDERS: Readonly<Record<FurnitureType, FurnitureBuilder>> = {
  counter,
  table,
  chair,
  shelf,
  fridge,
  stove,
  sink,
  sofa,
  'cat-bed': catBed,
  rug,
  window: none,
  cabinet,
  bathtub,
  toilet,
  mirror,
  vanity,
  tv,
  'tv-stand': tvStand,
  'coffee-table': coffeeTable,
  desk,
  'office-chair': officeChair,
  bookcase,
  bed,
  nightstand,
  wardrobe,
  dresser,
  'party-table': partyTable,
  buffet,
  fireplace,
  'washing-machine': washingMachine,
  arch,
  webcam,
  door,
  armchair,
  'plant-stand': plantStand,
  stage,
};

/** Draw one piece (unknown types get a plain block so the picture still matches the heightmap). */
export function addFurniture(g: GeoBuilder, p: FurniturePiece, play: PlayableRoom): void {
  const b = (FURNITURE_BUILDERS as Record<string, FurnitureBuilder | undefined>)[p.type];
  const c = makeCtx(g, p, play);
  if (b) b(c);
  else c.box(0, 0, 0, c.f.along - 0.02, c.f.H, c.f.depth - 0.02, p.color ?? PAL.cabinet, AO);
}

/** Types whose footprint does not raise the floor visually (no filler block under them). */
export const FLAT_TYPES: ReadonlySet<FurnitureType> = new Set<FurnitureType>(['rug', 'window', 'cat-bed', 'mirror', 'arch', 'door', 'webcam']);

// ---------------------------------------------------------------------------------------------
// Anchors for animated parts (dynamics.ts)
// ---------------------------------------------------------------------------------------------

export interface FurnitureAnchor {
  kind: 'tv' | 'fire' | 'rec';
  /** world centre of the quad / light */
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  /** yaw of the piece's local frame (the quad faces local +z) */
  ry: number;
}

export function furnitureAnchors(shell: ShellDef): FurnitureAnchor[] {
  const out: FurnitureAnchor[] = [];
  for (const p of shell.furniture) {
    if (p.type !== 'tv' && p.type !== 'fireplace' && p.type !== 'webcam') continue;
    const f = pieceFrame(p, shell.width, shell.depth);
    const ry = f.fz ? 0 : f.fx > 0 ? Math.PI / 2 : -Math.PI / 2;
    const w2 = (lx: number, lz: number): [number, number] => (f.fz ? [f.cx + lx, f.cz + lz] : [f.cx + lz * f.fx, f.cz - lx * f.fx]);
    if (p.type === 'tv') {
      const t = tvGeom(f);
      const [x, z] = w2(0, t.lz + 0.006);
      out.push({ kind: 'tv', x, y: t.y + t.h / 2, z, w: t.w - 0.02, h: t.h - 0.02, ry });
    } else if (p.type === 'fireplace') {
      const fb = fireGeom(f);
      const [x, z] = w2(0, f.depth / 2 - 0.12);
      out.push({ kind: 'fire', x, y: fb.y + 0.04, z, w: fb.w * 0.8, h: fb.h * 0.75, ry });
    } else {
      const cg = camGeom(f);
      const [x, z] = w2(0.055, cg.lz + 0.047);
      out.push({ kind: 'rec', x, y: cg.y + 0.03, z, w: 0.018, h: 0.018, ry });
    }
  }
  return out;
}
