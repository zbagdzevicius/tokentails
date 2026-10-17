/**
 * The cutaway dollhouse diorama (GDD 11.1): floor on a wooden plinth, the back (north) and left (west) walls (the
 * front and right walls are removed), a window with a theme sky and a light patch, furniture drawn from
 * ShellDef.furniture (world/furniture.ts: a builder per FurnitureType), static theme decorations
 * (world/themes.ts) and a filler block for any raised cell no piece covers, so the picture always matches the
 * heightmap the sim uses. All opaque parts share ONE material and are merged into ONE mesh (vertex colours, baked
 * AO); the sky is one unlit mesh and the window light one additive mesh: three draw calls for the whole room,
 * whatever the shell or theme. Everything that moves (TV picture, fire, string lights, snow, Roomba...) lives in
 * world-dynamics.ts.
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  Material,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
} from 'three';
import { CELL_M, type PlayableRoom } from '../types';
import { GeoBuilder, hash01 } from './geo';
import { PAL, THEME_SKY, mixHex, shadeHex, type ShellStyle } from './palette';
import { cellX, cellZ, levelY } from './space';
import { FLAT_TYPES, addFurniture } from './world/furniture';
import { WALL_H, WALL_T, WIN_Y0, WIN_Y1, doorSpan, windowSpan } from './world/layout';
import { shellKey, shellStyle } from './world/shell-style';
import { addThemeDecor, roomTheme } from './world/themes';

export { WALL_H, WALL_T };
const AO = { aoFloor: 0, aoStrength: 0.28 };

export interface RoomView {
  group: Group;
  solid: Mesh;
  sky: Mesh;
  light: Mesh;
  /** world bounds (for the camera fit) */
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number; top: number };
  dispose(): void;
}

interface Opening {
  a: number;
  b: number;
  y0: number;
  y1: number;
}

/** Wall along an axis from a to b at fixed c, with openings (a, b along the axis). */
function wall(g: GeoBuilder, axis: 'x' | 'z', a: number, b: number, c: number, color: number, openings: Opening[], dado: number): void {
  const ops = openings.slice().sort((p, q) => p.a - q.a);
  let cur = a;
  const seg = (s: number, e: number, y0: number, y1: number) => {
    if (e - s < 0.001 || y1 - y0 < 0.001) return;
    const mid = (s + e) / 2;
    const split = dado && y0 < 0.9 && y1 > 0.9;
    const parts: [number, number, number][] = split
      ? [
          [y0, 0.9, dado],
          [0.9, y1, color],
        ]
      : [[y0, y1, dado && y1 <= 0.9 ? dado : color]];
    for (const [p0, p1, col] of parts) {
      if (axis === 'x') g.boxUp(e - s, p1 - p0, WALL_T, col, { x: mid, y: p0, z: c }, { vary: 0.015 });
      else g.boxUp(WALL_T, p1 - p0, e - s, col, { x: c, y: p0, z: mid }, { vary: 0.015 });
    }
  };
  for (const o of ops) {
    seg(cur, o.a, 0, WALL_H);
    seg(o.a, o.b, 0, o.y0);
    seg(o.a, o.b, o.y1, WALL_H);
    cur = o.b;
  }
  seg(cur, b, 0, WALL_H);
}

/** Floor: a slab plus per-cell tiles, planks, parquet or carpet tops (2 triangles per tile). */
function floor(g: GeoBuilder, W: number, D: number, st: ShellStyle, kitchenMix: boolean): void {
  g.boxUp(W * CELL_M, 0.02, D * CELL_M, shadeHex(st.floorB, 0.85), { x: 0, y: -0.026, z: 0 }, { vary: 0 });
  const A = st.floorA;
  const B = kitchenMix ? mixHex(A, PAL.floorB, 0.85) : st.floorB;
  const y = 0.0;
  for (let z = 0; z < D; z++)
    for (let x = 0; x < W; x++) {
      const near = Math.min(x, z);
      const k = near === 0 ? 0.9 : near === 1 ? 0.96 : 1;
      const cx = cellX(x, W);
      const cz = cellZ(z, D);
      const o = { vary: 0.02 };
      switch (st.floor) {
        case 'tiles':
          g.quad(CELL_M - 0.006, CELL_M - 0.006, shadeHex((x + z) % 2 ? B : A, k), { x: cx, y, z: cz }, o);
          break;
        case 'small-tiles':
          for (let i = 0; i < 4; i++) {
            const ox = (i % 2 ? 0.5 : -0.5) * (CELL_M / 2);
            const oz = (i < 2 ? -0.5 : 0.5) * (CELL_M / 2);
            g.quad(CELL_M / 2 - 0.008, CELL_M / 2 - 0.008, shadeHex((x * 2 + (i % 2) + z * 2 + (i >> 1)) % 2 ? B : A, k), { x: cx + ox, y, z: cz + oz }, o);
          }
          break;
        case 'planks':
        case 'boards': {
          const n = st.floor === 'planks' ? 2 : 1;
          for (let i = 0; i < n; i++) {
            const h = hash01(z * 131 + i * 17 + (x >> 1) * 7);
            g.quad(CELL_M - 0.004, CELL_M / n - 0.008, shadeHex(mixHex(A, B, h), k * (0.96 + h * 0.06)), { x: cx, y, z: cz + (i - (n - 1) / 2) * (CELL_M / n) }, o);
          }
          break;
        }
        case 'parquet': {
          const rot = (x + z) % 2;
          for (let i = 0; i < 3; i++) {
            const off = (i - 1) * (CELL_M / 3);
            const col = shadeHex(i % 2 ? B : A, k);
            if (rot) g.quad(CELL_M - 0.01, CELL_M / 3 - 0.008, col, { x: cx, y, z: cz + off }, o);
            else g.quad(CELL_M / 3 - 0.008, CELL_M - 0.01, col, { x: cx + off, y, z: cz }, o);
          }
          break;
        }
        case 'carpet':
          g.quad(CELL_M, CELL_M, shadeHex(mixHex(A, B, hash01(x * 7 + z * 13) * 0.18), k), { x: cx, y, z: cz }, { vary: 0.05 });
          break;
      }
    }
}

export function buildRoom(play: PlayableRoom, mat: Material): RoomView {
  const sh = play.shell;
  const W = sh.width;
  const D = sh.depth;
  const halfW = (W * CELL_M) / 2;
  const halfD = (D * CELL_M) / 2;
  const st = shellStyle(sh);
  const key = shellKey(sh);
  const theme = roomTheme(play);
  const sky0 = THEME_SKY[theme] ?? THEME_SKY.default;
  const g = new GeoBuilder();

  // round 3 (QA): the tabletop the diorama stands on, reaching toward the camera, so the band under the room on a
  // phone (where the thumbs go) reads as a table, not an empty void
  g.boxUp(W * CELL_M + 6, 0.02, D * CELL_M + 7, shadeHex(PAL.plinth, 0.5), { x: 0, y: -0.235, z: 2.6 }, { vary: 0 });
  // plinth (the diorama base)
  g.boxUp(W * CELL_M + 0.3, 0.16, D * CELL_M + 0.3, PAL.plinth, { x: -0.05, y: -0.17, z: 0.05 });
  g.boxUp(W * CELL_M + 0.34, 0.025, D * CELL_M + 0.34, PAL.plinthEdge, { x: -0.05, y: -0.195, z: 0.05 });
  floor(g, W, D, st, key === 'kitchen' && sh.floorColor !== undefined);

  // window and door openings
  const win = windowSpan(sh);
  const wa = win.a;
  const wb = win.b;
  const door = doorSpan(sh);
  const doorIsPiece = sh.furniture.some((f) => f.type === 'door' && (f.z === 0 || f.x === 0));
  const northOps: Opening[] = [{ a: wa, b: wb, y0: WIN_Y0, y1: WIN_Y1 }];
  const westOps: Opening[] = [];
  if (door && !doorIsPiece) {
    if (door.axis === 'x') northOps.push({ a: door.a, b: door.b, y0: 0, y1: 2.05 });
    else westOps.push({ a: door.a, b: door.b, y0: 0, y1: 2.05 });
  }
  wall(g, 'x', -halfW - WALL_T, halfW, -halfD - WALL_T / 2, st.wallBack, northOps, st.dado);
  wall(g, 'z', -halfD, halfD, -halfW - WALL_T / 2, st.wallSide, westOps, st.dado ? shadeHex(st.dado, 0.96) : 0);
  // wallpaper stripes (skip the openings)
  if (st.stripe) {
    const free = (v: number, ops: Opening[]) => ops.every((o) => v < o.a - 0.04 || v > o.b + 0.04);
    for (let x = -halfW + 0.2; x < halfW - 0.1; x += 0.2) {
      if (!free(x, northOps)) continue;
      g.boxUp(0.05, WALL_H - (st.dado ? 0.9 : 0.08) - 0.05, 0.004, st.stripe, { x, y: st.dado ? 0.9 : 0.08, z: -halfD + 0.002 }, { vary: 0 });
    }
    for (let z = -halfD + 0.2; z < halfD - 0.1; z += 0.2) {
      if (!free(z, westOps)) continue;
      g.boxUp(0.004, WALL_H - (st.dado ? 0.9 : 0.08) - 0.05, 0.05, shadeHex(st.stripe, 0.97), { x: -halfW + 0.002, y: st.dado ? 0.9 : 0.08, z }, { vary: 0 });
    }
  }
  if (st.dado) {
    g.boxUp(W * CELL_M, 0.04, 0.03, shadeHex(st.dado, 0.85), { x: 0, y: 0.88, z: -halfD + 0.015 });
    g.boxUp(0.03, 0.04, D * CELL_M, shadeHex(st.dado, 0.85), { x: -halfW + 0.015, y: 0.88, z: 0 });
  }
  // baseboards
  g.boxUp(W * CELL_M, 0.08, 0.02, st.baseboard, { x: 0, y: 0, z: -halfD + 0.01 });
  g.boxUp(0.02, 0.08, D * CELL_M, st.baseboard, { x: -halfW + 0.01, y: 0, z: 0 });
  // wall top trims (reads as a cut dollhouse wall)
  g.boxUp(W * CELL_M + WALL_T, 0.03, WALL_T + 0.02, shadeHex(st.wallBack, 0.85), { x: -WALL_T / 2, y: WALL_H, z: -halfD - WALL_T / 2 });
  g.boxUp(WALL_T + 0.02, 0.03, D * CELL_M, shadeHex(st.wallSide, 0.85), { x: -halfW - WALL_T / 2, y: WALL_H, z: 0 });

  // window frame, sill, curtains
  const wmid = win.mid;
  const ww = win.w;
  const zf = -halfD + 0.005;
  g.boxUp(ww + 0.1, 0.05, 0.08, PAL.windowFrame, { x: wmid, y: WIN_Y0 - 0.05, z: zf + 0.02 });
  g.boxUp(ww + 0.1, 0.05, 0.03, PAL.windowFrame, { x: wmid, y: WIN_Y1, z: zf });
  g.boxUp(0.05, WIN_Y1 - WIN_Y0, 0.03, PAL.windowFrame, { x: wa - 0.025, y: WIN_Y0, z: zf });
  g.boxUp(0.05, WIN_Y1 - WIN_Y0, 0.03, PAL.windowFrame, { x: wb + 0.025, y: WIN_Y0, z: zf });
  g.boxUp(0.03, WIN_Y1 - WIN_Y0, 0.02, PAL.windowFrame, { x: wmid, y: WIN_Y0, z: zf - 0.04 });
  g.boxUp(ww, 0.03, 0.02, PAL.windowFrame, { x: wmid, y: (WIN_Y0 + WIN_Y1) / 2, z: zf - 0.04 });
  const curtain = key === 'bathroom' ? [0xbfe3d6, 0xe0f4ee] : key === 'bedroom' ? [0xc9a7e3, 0xe3d1f2] : key === 'office' ? [0x9fb4d6, 0xc5d3ea] : [0xf7a6a0, 0xfbc4b8];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++)
      g.boxUp(0.07, WIN_Y1 - WIN_Y0 + 0.25, 0.04, curtain[i % 2], { x: (side < 0 ? wa - 0.12 : wb + 0.12) + side * i * 0.05, y: WIN_Y0 - 0.2, z: zf + 0.04 });
  }
  g.boxUp(ww + 0.5, 0.04, 0.04, PAL.woodDark, { x: wmid, y: WIN_Y1 + 0.1, z: zf + 0.04 });

  // door frame (an opening the human walks out through; a 'door' piece draws its own)
  if (door && !doorIsPiece) {
    const fc = PAL.windowFrame;
    if (door.axis === 'x') {
      g.boxUp(0.06, 2.08, 0.13, fc, { x: door.a - 0.03, y: 0, z: -halfD - WALL_T / 2 });
      g.boxUp(0.06, 2.08, 0.13, fc, { x: door.b + 0.03, y: 0, z: -halfD - WALL_T / 2 });
      g.boxUp(door.b - door.a + 0.12, 0.06, 0.13, fc, { x: (door.a + door.b) / 2, y: 2.05, z: -halfD - WALL_T / 2 });
    } else {
      g.boxUp(0.13, 2.08, 0.06, fc, { x: -halfW - WALL_T / 2, y: 0, z: door.a - 0.03 });
      g.boxUp(0.13, 2.08, 0.06, fc, { x: -halfW - WALL_T / 2, y: 0, z: door.b + 0.03 });
      g.boxUp(0.13, 0.06, door.b - door.a + 0.12, fc, { x: -halfW - WALL_T / 2, y: 2.05, z: (door.a + door.b) / 2 });
    }
  }

  // backsplash tiles + upper cabinets above back counters (not over the window or the door)
  const backPieces = sh.furniture.filter((f) => f.z === 0 && (f.type === 'counter' || f.type === 'sink' || f.type === 'stove' || f.type === 'cabinet' || f.type === 'vanity'));
  for (const f of backPieces) {
    const x0 = (f.x - W / 2) * CELL_M;
    const tileA = f.type === 'vanity' ? 0xffffff : PAL.backsplashA;
    const tileB = f.type === 'vanity' ? 0x9be7d8 : PAL.backsplashB;
    for (let i = 0; i < f.w * 4; i++) {
      const tx = x0 + (i + 0.5) * 0.1;
      if (tx > wa - 0.05 && tx < wb + 0.05) continue;
      if (door && door.axis === 'x' && tx > door.a - 0.05 && tx < door.b + 0.05) continue;
      for (let r = 0; r < 4; r++) g.boxUp(0.092, 0.092, 0.012, (i + r) % 2 ? tileB : tileA, { x: tx, y: levelY(f.level) + 0.02 + r * 0.1, z: -halfD + 0.006 }, { vary: 0.02 });
    }
    if (f.type === 'vanity') continue;
    const cabB = x0 + f.w * CELL_M;
    const doorOk = (a: number, b: number) => !door || door.axis !== 'x' || b < door.a - 0.05 || a > door.b + 0.05;
    for (let i = 0; i < f.w; i++) {
      const a = x0 + i * CELL_M;
      const b = a + CELL_M;
      if (b > wa - 0.15 && a < wb + 0.15) continue;
      if (!doorOk(a, b) || b > cabB + 0.001) continue;
      g.boxUp(CELL_M - 0.01, 0.42, 0.3, PAL.cabinet, { x: (a + b) / 2, y: 1.9, z: -halfD + 0.15 });
      g.boxUp(CELL_M - 0.05, 0.38, 0.012, PAL.cabinetDoor, { x: (a + b) / 2, y: 1.92, z: -halfD + 0.305 });
      g.boxUp(0.06, 0.018, 0.02, PAL.handle, { x: (a + b) / 2, y: 1.96, z: -halfD + 0.315 });
    }
  }

  // wall clock above the window and a framed cat drawing on the west wall
  {
    const cy = 2.25;
    g.cyl(0.1, 0.1, 0.03, 12, 0xfffaf2, { x: wmid, y: cy, z: -halfD + 0.02, rx: Math.PI / 2 });
    g.torus(0.1, 0.016, PAL.woodDark, { x: wmid, y: cy, z: -halfD + 0.03 }, undefined, 4, 14);
    g.box(0.012, 0.065, 0.01, 0x2a1f2b, { x: wmid, y: cy + 0.025, z: -halfD + 0.04 }, { vary: 0 });
    g.box(0.05, 0.012, 0.01, 0x2a1f2b, { x: wmid + 0.02, y: cy, z: -halfD + 0.04 }, { vary: 0 });
  }
  const westBusy = sh.furniture.some((f) => f.x === 0 && (f.type === 'mirror' || f.type === 'door' || levelY(f.level) > 1.2));
  if (theme !== 'xmas' && theme !== 'valentine' && !westBusy) {
    const pz = door && door.axis === 'z' ? (door.b + 0.6 < halfD ? door.b + 0.5 : door.a - 0.5) : -0.2;
    const px = -halfW + 0.012;
    g.boxUp(0.025, 0.46, 0.38, PAL.woodDark, { x: px, y: 1.25, z: pz });
    g.boxUp(0.03, 0.38, 0.3, 0xfff1dc, { x: px, y: 1.29, z: pz });
    g.sphere(0.07, 0xff9a3c, { x: px + 0.02, y: 1.42, z: pz, sx: 0.3 }, undefined, 6, 4);
    g.cone(0.03, 0.05, 4, 0xff9a3c, { x: px + 0.02, y: 1.5, z: pz - 0.04, sx: 0.4 });
    g.cone(0.03, 0.05, 4, 0xff9a3c, { x: px + 0.02, y: 1.5, z: pz + 0.04, sx: 0.4 });
    g.sphere(0.09, 0xff9a3c, { x: px + 0.02, y: 1.33, z: pz + 0.02, sx: 0.3, sy: 0.8 }, undefined, 6, 4);
  }

  // furniture, then a filler block for raised cells no piece covers
  const covered = new Uint8Array(W * D);
  for (const f of sh.furniture) {
    addFurniture(g, f, play);
    if (FLAT_TYPES.has(f.type)) continue;
    for (let z = f.z; z < f.z + f.d; z++) for (let x = f.x; x < f.x + f.w; x++) if (x >= 0 && z >= 0 && x < W && z < D) covered[z * W + x] = 1;
  }
  for (let z = 0; z < D; z++)
    for (let x = 0; x < W; x++) {
      const lv = sh.levels[z * W + x] ?? 0;
      if (lv > 0 && !covered[z * W + x]) {
        g.boxUp(CELL_M - 0.02, levelY(lv) - 0.04, CELL_M - 0.02, PAL.cabinet, { x: cellX(x, W), y: 0, z: cellZ(z, D) }, AO);
        g.boxUp(CELL_M, 0.04, CELL_M, PAL.countertop, { x: cellX(x, W), y: levelY(lv) - 0.04, z: cellZ(z, D) });
      }
    }

  addThemeDecor(g, play);

  const solidGeo = g.build();
  const solid = new Mesh(solidGeo, mat);
  solid.name = 'room';
  solid.receiveShadow = true;
  solid.castShadow = true;

  // sky behind the window (and the hallway behind the door): unlit vertex-colour gradient per theme
  const skyH = WIN_Y1 - WIN_Y0 + 0.2;
  const skyGeo = new PlaneGeometry(ww + 0.2, skyH, 1, 4);
  const sp = skyGeo.getAttribute('position');
  const cols = new Float32Array(sp.count * 3);
  const col = new Color();
  for (let i = 0; i < sp.count; i++) {
    const v = (sp.getY(i) + skyH / 2) / skyH;
    col.setHex(v > 0.6 ? mixHex(sky0.mid, sky0.top, (v - 0.6) / 0.4) : mixHex(sky0.low, sky0.mid, v / 0.6));
    cols[i * 3] = col.r;
    cols[i * 3 + 1] = col.g;
    cols[i * 3 + 2] = col.b;
  }
  skyGeo.setAttribute('color', new BufferAttribute(cols, 3));
  skyGeo.translate(wmid, (WIN_Y0 + WIN_Y1) / 2, -halfD - WALL_T - 0.01);
  const skyParts: BufferGeometry[] = [skyGeo];
  const sun = new GeoBuilder();
  const zs = -halfD - WALL_T - 0.005;
  if (sky0.night) {
    // moon with a bite and a scatter of stars
    sun.cyl(0.1, 0.1, 0.01, 12, sky0.orb, { x: wmid + ww * 0.22, y: WIN_Y1 - 0.25, z: zs, rx: Math.PI / 2 }, { vary: 0 });
    sun.cyl(0.085, 0.085, 0.01, 12, sky0.top, { x: wmid + ww * 0.22 + 0.06, y: WIN_Y1 - 0.22, z: zs + 0.002, rx: Math.PI / 2 }, { vary: 0 });
    for (let i = 0; i < 14; i++) sun.box(0.018, 0.018, 0.005, 0xffffff, { x: wa + hash01(i * 5 + 1) * ww, y: WIN_Y0 + 0.25 + hash01(i * 5 + 2) * (WIN_Y1 - WIN_Y0 - 0.3), z: zs + 0.001, rz: 0.78 }, { vary: 0 });
    if (theme === 'xmas') {
      // snowy roofs across the street
      for (let i = 0; i < 3; i++) {
        const x = wa + (i + 0.5) * (ww / 3);
        sun.box(ww / 3 - 0.05, 0.22, 0.005, 0x2a3566, { x, y: WIN_Y0 + 0.02, z: zs + 0.0015 }, { vary: 0 });
        sun.box(ww / 3 - 0.03, 0.05, 0.005, 0xffffff, { x, y: WIN_Y0 + 0.15, z: zs + 0.002 }, { vary: 0 });
        sun.box(0.04, 0.05, 0.005, 0xffd166, { x: x - 0.05, y: WIN_Y0 + 0.07, z: zs + 0.0025 }, { vary: 0 });
      }
    }
  } else {
    sun.cyl(0.12, 0.12, 0.01, 12, sky0.orb, { x: wmid + ww * 0.22, y: WIN_Y0 + 0.3, z: zs, rx: Math.PI / 2 }, { vary: 0 });
    sun.box(ww * 0.5, 0.06, 0.01, 0xffffff, { x: wmid - ww * 0.15, y: WIN_Y1 - 0.18, z: zs - 0.001 }, { vary: 0 });
    sun.box(ww * 0.3, 0.05, 0.01, 0xffffff, { x: wmid - ww * 0.05, y: WIN_Y1 - 0.24, z: zs - 0.001 }, { vary: 0 });
    if (theme === 'spring' || theme === 'thanksgiving') {
      // a tree top outside
      const tc = theme === 'spring' ? [0x8bd17c, 0xffc2d6] : [0xe76f51, 0xf4a261];
      for (let i = 0; i < 4; i++) sun.cyl(0.09, 0.09, 0.005, 9, tc[i % 2], { x: wa + 0.12 + i * 0.09, y: WIN_Y0 + 0.12 + (i % 2) * 0.07, z: zs + 0.002, rx: Math.PI / 2 }, { vary: 0 });
    }
  }
  if (door && !doorIsPiece) {
    if (door.axis === 'x') sun.box(door.b - door.a, 2.05, 0.01, 0x8a6a7e, { x: (door.a + door.b) / 2, y: 1.025, z: -halfD - WALL_T - 0.02 }, { vary: 0 });
    else sun.box(0.01, 2.05, door.b - door.a, 0x8a6a7e, { x: -halfW - WALL_T - 0.02, y: 1.025, z: (door.a + door.b) / 2 }, { vary: 0 });
  }
  skyParts.push(sun.build());
  const sky = new Mesh(mergeSimple(skyParts), new MeshBasicMaterial({ vertexColors: true }));
  sky.name = 'sky';

  // window light: an additive patch on the floor fading into the room (cool and dim at night)
  const lg = new GeoBuilder();
  const lightZ0 = -halfD + 0.7;
  const steps = 6;
  const lightCol = sky0.night ? 0x8fa8ff : PAL.windowLight;
  const lightK = sky0.night ? 0.12 : 0.22;
  for (let i = 0; i < steps; i++) {
    const k = 1 - i / steps;
    lg.quad(ww + 0.25 + i * 0.05, 0.28, shadeHex(lightCol, lightK * k), { x: wmid + 0.2 + i * 0.07, y: 0.003, z: lightZ0 + i * 0.28 + 0.14 }, { vary: 0 });
  }
  const light = new Mesh(lg.build(), new MeshBasicMaterial({ vertexColors: true, blending: AdditiveBlending, transparent: true, depthWrite: false, side: DoubleSide }));
  light.name = 'window-light';
  light.renderOrder = 1;

  const group = new Group();
  group.name = 'room';
  group.add(solid, sky, light);

  return {
    group,
    solid,
    sky,
    light,
    // includes the plinth (it overhangs the floor by 0.15–0.2 m on the open sides)
    bounds: { minX: -halfW - 0.22, maxX: halfW + 0.12, minZ: -halfD - WALL_T, maxZ: halfD + 0.22, top: WALL_H },
    dispose() {
      solid.geometry.dispose();
      sky.geometry.dispose();
      (sky.material as Material).dispose();
      light.geometry.dispose();
      (light.material as Material).dispose();
    },
  };
}

/** Concatenate non-indexed position/color geometries (normals recomputed). */
function mergeSimple(parts: BufferGeometry[]): BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  for (const p0 of parts) {
    const p = p0.index ? p0.toNonIndexed() : p0;
    const a = p.getAttribute('position');
    const c = p.getAttribute('color');
    for (let i = 0; i < a.count; i++) {
      pos.push(a.getX(i), a.getY(i), a.getZ(i));
      if (c) col.push(c.getX(i), c.getY(i), c.getZ(i));
      else col.push(1, 1, 1);
    }
    if (p !== p0) p.dispose();
    p0.dispose();
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
  g.computeVertexNormals();
  return g;
}
