/**
 * Static warehouse art for a level: floors (room tints, wear, hazard stripes by doors), brick walls
 * with top trims, pillars, baseboards, vents, posters and wall lamps, box-tile props (crate stacks,
 * cardboard, barrels, catnip sacks, shelving racks, a conveyor), security cameras and the diorama
 * plinth the level floats on.
 *
 * Everything static is merged by ArtBuilder: floor (1 draw call), solids (1), emissive glass (1),
 * light pools (1 instanced), plus small animated extras (conveyor belt + parcels, camera heads).
 * Purely cosmetic: blocking and sight still come from the sim's tiles.
 */
import * as THREE from 'three';
import { PALETTE, type LevelDef, type Vec2i } from '../types';
import { ALL, ArtBuilder, CELLS, F, levelAtlas, NO_BOTTOM } from './art';
import { hdr } from './post';

export const WALL_H = 0.8;
const CAP_H = 0.1;
const PLINTH_DEPTH = 2.2;

export function hash2(x: number, y: number, s = 0): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Room floor tints (sRGB), picked per connected room. */
const ROOM_TINTS = ['#8a74b8', '#7f71b2', '#9179b4', '#7a76b8', '#8c70a8', '#8480ba'];

export interface TerrainOptions {
  /** Real-time shadows are on (props cast). */
  shadows: boolean;
}

export interface LampInfo {
  x: number;
  z: number;
  /** Direction the lamp faces (unit, on the ground plane). */
  nx: number;
  nz: number;
}

export class Terrain {
  readonly group = new THREE.Group();
  readonly lamps: LampInfo[] = [];
  triangles = 0;
  private readonly disposables: { dispose(): void }[] = [];
  private beltTex: THREE.CanvasTexture | null = null;
  private parcels: THREE.InstancedMesh | null = null;
  private readonly conveyors: { x0: number; z0: number; x1: number; z1: number; axis: 'x' | 'z'; len: number; n: number; first: number }[] = [];
  private camHeads: THREE.InstancedMesh | null = null;
  private camLeds: THREE.InstancedMesh | null = null;
  private readonly cams: { x: number; y: number; z: number; base: number; phase: number }[] = [];
  private readonly m4 = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3(1, 1, 1);
  private readonly up = new THREE.Vector3(0, 1, 0);

  private readonly w: number;
  private readonly h: number;
  private readonly lv: LevelDef;
  private readonly doorTiles = new Set<number>();
  private readonly room: Int32Array;

  constructor(level: LevelDef, opts: TerrainOptions) {
    this.lv = level;
    this.h = level.tiles.length;
    this.w = Math.max(...level.tiles.map((r) => r.length));
    for (const d of level.doors) this.doorTiles.add(d.tile.y * this.w + d.tile.x);
    this.room = this.floodRooms();
    this.group.name = 'terrain';

    const atlas = levelAtlas();
    const floorMat = new THREE.MeshLambertMaterial({ map: atlas, vertexColors: true });
    const solidMat = new THREE.MeshLambertMaterial({ map: atlas, vertexColors: true });
    solidMat.shadowSide = THREE.DoubleSide;
    const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: hdr(0xffffff, 2.6) });
    this.disposables.push(floorMat, solidMat, glowMat);

    const floor = new ArtBuilder();
    const solid = new ArtBuilder();
    const glow = new ArtBuilder();
    this.buildFloor(floor);
    this.buildPlinth(floor);
    this.buildWalls(solid, glow);
    this.buildProps(solid, glow);
    this.buildCameras(solid, glow);

    const add = (b: ArtBuilder, mat: THREE.Material, name: string, cast: boolean, receive: boolean) => {
      if (b.empty) return;
      const geo = b.build();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = name;
      mesh.castShadow = cast && opts.shadows;
      mesh.receiveShadow = receive;
      mesh.matrixAutoUpdate = false;
      this.group.add(mesh);
      this.disposables.push(geo);
      this.triangles += b.triangles;
    };
    add(floor, floorMat, 'floor', false, true);
    add(solid, solidMat, 'walls', true, true);
    add(glow, glowMat, 'lamp-glass', false, false);
    this.buildConveyorParts(solidMat, opts);
    this.buildCameraHeads(solidMat);
  }

  // -------------------------------------------------------------------------------------------
  // Tile queries
  // -------------------------------------------------------------------------------------------

  private ch(x: number, y: number): string {
    if (y < 0 || y >= this.h || x < 0 || x >= this.w) return ' ';
    return this.lv.tiles[y][x] ?? ' ';
  }
  private isWall(x: number, y: number): boolean {
    return this.ch(x, y) === '#';
  }
  private isVoid(x: number, y: number): boolean {
    return this.ch(x, y) === ' ';
  }
  private isFloorish(x: number, y: number): boolean {
    const c = this.ch(x, y);
    return c === '.' || c === 'r' || c === 'b';
  }

  private floodRooms(): Int32Array {
    const room = new Int32Array(this.w * this.h).fill(-1);
    let id = 0;
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        const i = y * this.w + x;
        if (room[i] >= 0 || !this.isFloorish(x, y) || this.doorTiles.has(i)) continue;
        const stack = [i];
        room[i] = id;
        while (stack.length) {
          const j = stack.pop()!;
          const jx = j % this.w, jy = (j / this.w) | 0;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = jx + dx, ny = jy + dy;
            const k = ny * this.w + nx;
            if (nx < 0 || ny < 0 || nx >= this.w || ny >= this.h || room[k] >= 0 || !this.isFloorish(nx, ny) || this.doorTiles.has(k)) continue;
            room[k] = id;
            stack.push(k);
          }
        }
        id++;
      }
    return room;
  }

  // -------------------------------------------------------------------------------------------
  // Floor + plinth
  // -------------------------------------------------------------------------------------------

  private buildFloor(b: ArtBuilder): void {
    const lv = this.lv;
    const hazard = new Set<number>();
    for (const d of lv.doors) {
      const axis = d.axis ?? (this.isWall(d.tile.x - 1, d.tile.y) && this.isWall(d.tile.x + 1, d.tile.y) ? 'h' : 'v');
      const n = axis === 'v' ? [[1, 0], [-1, 0]] : [[0, 1], [0, -1]];
      for (const [dx, dy] of n) hazard.add((d.tile.y + dy) * this.w + d.tile.x + dx);
    }
    const tint = new THREE.Color();
    const c = new THREE.Color();
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        const ch = this.ch(x, y);
        if (ch !== '.' && ch !== 'r' && ch !== 'b' && !this.doorTiles.has(y * this.w + x)) continue;
        const i = y * this.w + x;
        const r = this.room[i];
        tint.set(ROOM_TINTS[(r < 0 ? 0 : r) % ROOM_TINTS.length]);
        const hv = hash2(x, y, 3);
        const checker = (x + y) & 1 ? 1 : 0.93;
        c.copy(tint).multiplyScalar(checker * (0.95 + hv * 0.08));
        const rot = Math.floor(hash2(x, y, 9) * 4);
        if (this.doorTiles.has(i)) {
          b.flat(x, y, x + 1, y + 1, 0, CELLS.steel, 0xd8d0e8);
        } else if (hazard.has(i)) {
          b.flat(x, y, x + 1, y + 1, 0, CELLS.hazard, 0xf2e8ff, (x + y) & 1);
        } else if (ch === 'r') {
          b.flat(x, y, x + 1, y + 1, 0.004, CELLS.rug, 0xffffff, this.isFloorishRug(x - 1, y) || this.isFloorishRug(x + 1, y) ? 0 : 1);
        } else {
          const cell =
            hv < 0.6 ? CELLS.floorA : hv < 0.8 ? CELLS.floorB : hv < 0.9 ? CELLS.floorWorn : hv < 0.95 ? CELLS.floorCrack : hv < 0.975 ? CELLS.floorOil : CELLS.floorGrate;
          b.flat(x, y, x + 1, y + 1, 0, cell, c, rot);
        }
      }
    // Painted safety line along walls of the big rooms: a thin coin-yellow strip on floor tiles
    // bordering a visible wall face would be noisy; instead line the tiles next to the exit.
    for (const t of lv.exit.tiles) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = t.x + dx, ny = t.y + dy;
        if (lv.exit.tiles.some((e) => e.x === nx && e.y === ny) || !this.isFloorish(nx, ny) || this.ch(nx, ny) === 'b') continue;
        // Edge strip on the side facing the portal.
        const x0 = dx === 1 ? nx : dx === -1 ? nx + 0.88 : nx;
        const x1 = dx === 1 ? nx + 0.12 : dx === -1 ? nx + 1 : nx + 1;
        const z0 = dy === 1 ? ny : dy === -1 ? ny + 0.88 : ny;
        const z1 = dy === 1 ? ny + 0.12 : dy === -1 ? ny + 1 : ny + 1;
        b.flat(x0, z0, x1, z1, 0.006, CELLS.stripeTrim, 0xffffff);
      }
    }
  }

  private isFloorishRug(x: number, y: number): boolean {
    return this.ch(x, y) === 'r';
  }

  /** The level floats on a stone plinth; only camera-facing sides (+x, +z) are built. */
  private buildPlinth(b: ArtBuilder): void {
    const solidAt = (x: number, y: number) => !this.isVoid(x, y);
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (!solidAt(x, y)) continue;
        if (!solidAt(x + 1, y)) b.box(x + 1, -PLINTH_DEPTH, y, x + 1, 0, y + 1, CELLS.plinth, { faces: F.PX, color: 0xb8a8d8, ao: 0.18, uv: 'world' });
        if (!solidAt(x, y + 1)) b.box(x, -PLINTH_DEPTH, y + 1, x + 1, 0, y + 1, CELLS.plinth, { faces: F.PZ, color: 0x9a8cc0, ao: 0.16, uv: 'world' });
        // Lit lip along the plinth's top edge.
        if (!solidAt(x + 1, y) && !this.isWall(x, y)) b.box(x + 0.94, -0.06, y, x + 1.02, 0.015, y + 1, CELLS.white, { faces: F.PX | F.PY, color: 0x8f6fc0 });
        if (!solidAt(x, y + 1) && !this.isWall(x, y)) b.box(x, -0.06, y + 0.94, x + 1, 0.015, y + 1.02, CELLS.white, { faces: F.PZ | F.PY, color: 0x7d62ad });
      }
  }

  // -------------------------------------------------------------------------------------------
  // Walls
  // -------------------------------------------------------------------------------------------

  private buildWalls(b: ArtBuilder, glow: ArtBuilder): void {
    const bodyH = WALL_H - CAP_H;
    const lampEvery = 5;
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (!this.isWall(x, y)) continue;
        const hv = hash2(x, y, 11);
        const wx = this.isWall(x - 1, y) || this.isWall(x + 1, y);
        const wz = this.isWall(x, y - 1) || this.isWall(x, y + 1);
        const nWalls = +this.isWall(x - 1, y) + +this.isWall(x + 1, y) + +this.isWall(x, y - 1) + +this.isWall(x, y + 1);
        const corner = (wx && wz) || nWalls <= 1;
        const rhythm = !corner && ((wx && x % 6 === 0) || (wz && y % 6 === 0));
        // Faces: only where the neighbour is not a wall.
        let faces = F.PY;
        if (!this.isWall(x + 1, y)) faces |= F.PX;
        if (!this.isWall(x - 1, y)) faces |= F.NX;
        if (!this.isWall(x, y + 1)) faces |= F.PZ;
        if (!this.isWall(x, y - 1)) faces |= F.NZ;
        const inPX = this.isFloorish(x + 1, y) || this.doorTiles.has(y * this.w + x + 1);
        const inPZ = this.isFloorish(x, y + 1) || this.doorTiles.has((y + 1) * this.w + x);
        const pick = (inside: boolean, s: number) => {
          if (!inside) return CELLS.brickDark;
          const k = hash2(x, y, s);
          return k < 0.07 ? CELLS.brickVent : k < 0.11 ? CELLS.brickPoster : k < 0.14 ? CELLS.poster2 : k < 0.2 ? CELLS.metalPanel : CELLS.brick;
        };
        const tint = 0.92 + hv * 0.16;
        const col = new THREE.Color(tint, tint, tint);
        b.box(x, 0, y, x + 1, bodyH, y + 1, { px: pick(inPX, 1), pz: pick(inPZ, 2), nx: CELLS.brickDark, nz: CELLS.brickDark, top: CELLS.wallTop }, { faces: faces & ~F.PY, color: col, ao: 0.62 });
        // Cap: dark top with a lavender lip on faces that look into a room.
        const o = 0.035;
        b.box(x - (faces & F.NX ? o : 0), bodyH, y - (faces & F.NZ ? o : 0), x + 1 + (faces & F.PX ? o : 0), WALL_H, y + 1 + (faces & F.PZ ? o : 0), { top: CELLS.wallTop, side: CELLS.pillar }, { faces: faces | F.PY | F.NY, color: 0xd0c4e8, top: 0xffffff });
        if (inPX) b.box(x + 1 - 0.02, WALL_H, y, x + 1 + o, WALL_H + 0.018, y + 1, CELLS.white, { faces: F.PY | F.PX, color: 0xc9a8f0 });
        if (inPZ) b.box(x, WALL_H, y + 1 - 0.02, x + 1, WALL_H + 0.018, y + 1 + o, CELLS.white, { faces: F.PY | F.PZ, color: 0xb896e6 });
        // Toe-kick baseboard on room-facing faces.
        if (inPX) b.box(x + 1, 0, y, x + 1.03, 0.09, y + 1, CELLS.baseboard, { faces: F.PX | F.PY, color: 0xffffff });
        if (inPZ) b.box(x, 0, y + 1, x + 1, 0.09, y + 1.03, CELLS.baseboard, { faces: F.PZ | F.PY, color: 0xffffff });
        // Pillars at corners, junctions, wall ends and every few tiles along straight runs.
        if (corner || rhythm) {
          const ph = WALL_H + 0.12;
          b.box(x - 0.06, 0, y - 0.06, x + 1.06, ph - 0.06, y + 1.06, CELLS.pillar, { faces: NO_BOTTOM, color: 0xe6dcf5, ao: 0.55 });
          b.box(x - 0.1, ph - 0.06, y - 0.1, x + 1.1, ph, y + 1.1, { top: CELLS.wallTop, side: CELLS.steel }, { faces: ALL, color: 0xcfc4e6, top: 0xe8dcff });
        }
        // Wall lamps on room-facing faces, evenly spaced along the run.
        const lampX = inPX && !corner && y % lampEvery === 2;
        const lampZ = inPZ && !corner && x % lampEvery === 2;
        if (lampX) this.lamp(b, glow, x + 1, y + 0.5, 1, 0);
        if (lampZ) this.lamp(b, glow, x + 0.5, y + 1, 0, 1);
      }
  }

  /** A caged bulkhead lamp on a wall face at (fx, fz) facing (nx, nz). */
  private lamp(b: ArtBuilder, glow: ArtBuilder, fx: number, fz: number, nx: number, nz: number): void {
    const y = WALL_H - 0.3;
    const ax = nz !== 0 ? 0.16 : 0.035, az = nx !== 0 ? 0.16 : 0.035;
    const ox = nx * 0.035, oz = nz * 0.035;
    b.block(fx + ox, y - 0.03, fz + oz, ax + 0.03, 0.24, az + 0.03 * Math.abs(nz || nx), CELLS.darkMetal, { faces: ALL, color: 0xffffff });
    const gx = fx + nx * 0.09, gz = fz + nz * 0.09;
    glow.block(gx, y, gz, nz !== 0 ? 0.12 : 0.05, 0.16, nx !== 0 ? 0.12 : 0.05, CELLS.white, { faces: ALL, color: 0xffd28a });
    // Cage bars.
    for (const k of [-0.06, 0.06]) b.block(gx + (nz !== 0 ? k : nx * 0.03), y - 0.01, gz + (nx !== 0 ? k : nz * 0.03), 0.012, 0.18, 0.012, CELLS.darkMetal, { faces: ALL });
    this.lamps.push({ x: fx + nx * 0.8, z: fz + nz * 0.8, nx, nz });
  }

  // -------------------------------------------------------------------------------------------
  // Props on box tiles
  // -------------------------------------------------------------------------------------------

  private buildProps(b: ArtBuilder, glow: ArtBuilder): void {
    const seen = new Uint8Array(this.w * this.h);
    const clusters: Vec2i[][] = [];
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (this.ch(x, y) !== 'b' || seen[y * this.w + x]) continue;
        const list: Vec2i[] = [];
        const st = [{ x, y }];
        seen[y * this.w + x] = 1;
        while (st.length) {
          const t = st.pop()!;
          list.push(t);
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = t.x + dx, ny = t.y + dy;
            if (this.ch(nx, ny) !== 'b' || seen[ny * this.w + nx]) continue;
            seen[ny * this.w + nx] = 1;
            st.push({ x: nx, y: ny });
          }
        }
        clusters.push(list);
      }
    for (const cl of clusters) {
      const xs = cl.map((t) => t.x), ys = cl.map((t) => t.y);
      const x0 = Math.min(...xs), x1 = Math.max(...xs) + 1, y0 = Math.min(...ys), y1 = Math.max(...ys) + 1;
      const bw = x1 - x0, bh = y1 - y0;
      const full = bw * bh === cl.length;
      if (full && (bw >= 4 || bh >= 4) && Math.min(bw, bh) === 1) this.conveyor(b, glow, x0, y0, x1, y1);
      else if (full && bw >= 2 && bh >= 2) this.shelf(b, x0, y0, x1, y1);
      else for (const t of cl) this.propTile(b, t.x, t.y);
    }
  }

  private pallet(b: ArtBuilder, x: number, z: number): void {
    b.box(x + 0.06, 0, z + 0.06, x + 0.94, 0.08, z + 0.94, { top: CELLS.palletTop, side: CELLS.crateSide }, { faces: NO_BOTTOM, color: 0xb89a80, ao: 0.6 });
  }

  private propTile(b: ArtBuilder, x: number, z: number): void {
    const k = hash2(x, z, 21);
    const k2 = hash2(x, z, 22);
    const cx = x + 0.5, cz = z + 0.5;
    this.pallet(b, x, z);
    const y = 0.08;
    if (k < 0.45) {
      // Wooden crate + a smaller one on top.
      const rot = (k2 - 0.5) * 0.16;
      b.block(cx, y, cz, 0.41, 0.66, 0.41, { top: CELLS.crateTop, side: CELLS.crateSide }, { rotY: rot, color: new THREE.Color().setScalar(0.9 + k2 * 0.18), ao: 0.7 });
      if (k2 > 0.4) b.block(cx + (k2 - 0.6) * 0.2, y + 0.66, cz + (k - 0.2) * 0.2, 0.27, 0.36, 0.27, { top: CELLS.crateTop, side: CELLS.crateSide }, { rotY: (k2 - 0.5) * 1.1, color: 0xf0e0d0, ao: 0.8 });
    } else if (k < 0.65) {
      // Cardboard pile.
      b.block(cx - 0.18, y, cz - 0.16, 0.24, 0.42, 0.22, { top: CELLS.cardTop, side: CELLS.cardSide }, { rotY: 0.1, ao: 0.7 });
      b.block(cx + 0.2, y, cz + 0.14, 0.2, 0.34, 0.24, { top: CELLS.cardTop, side: CELLS.cardSide }, { rotY: -0.2, ao: 0.7 });
      b.block(cx + 0.18, y, cz - 0.22, 0.17, 0.5, 0.15, { top: CELLS.cardTop, side: CELLS.cardSide }, { rotY: 0.3, color: 0xe8d8c8, ao: 0.7 });
      b.block(cx - 0.12, y + 0.42, cz - 0.1, 0.2, 0.3, 0.18, { top: CELLS.cardTop, side: CELLS.cardSide }, { rotY: -0.35, color: 0xf6ead8 });
      b.block(cx - 0.18, y, cz + 0.26, 0.16, 0.26, 0.12, { top: CELLS.cardTop, side: CELLS.cardSide }, { rotY: 0.5 });
    } else if (k < 0.82) {
      // Kibble Corp drums.
      const red = k2 > 0.5;
      const col = red ? 0xff8a7a : 0xffffff;
      for (const [dx, dz] of [[-0.21, -0.21], [0.21, -0.19], [-0.19, 0.21], [0.2, 0.21]]) {
        if (hash2(x + dx * 10, z + dz * 10, 5) < 0.18) continue;
        b.barrel(cx + dx, y, cz + dz, 0.19, 0.62, { top: CELLS.barrelTop, side: CELLS.barrelSide }, { color: col, ao: 0.6 });
      }
    } else {
      // Catnip sacks and a Kibble sack.
      b.block(cx - 0.16, y, cz - 0.12, 0.25, 0.3, 0.2, { top: CELLS.sackTop, side: CELLS.sackSide }, { rotY: 0.25, ao: 0.65 });
      b.block(cx + 0.18, y, cz + 0.12, 0.24, 0.28, 0.2, { top: CELLS.sackTop, side: CELLS.sackSide }, { rotY: -0.3, ao: 0.65 });
      b.block(cx, y + 0.28, cz, 0.24, 0.26, 0.19, { top: CELLS.sackTop, side: CELLS.kibbleSack }, { rotY: 0.6 });
      b.block(cx + 0.2, y, cz - 0.26, 0.18, 0.22, 0.12, { top: CELLS.sackTop, side: CELLS.sackSide }, { rotY: 1.2 });
    }
  }

  /** Orange pallet racking over a filled rectangle of box tiles. */
  private shelf(b: ArtBuilder, x0: number, z0: number, x1: number, z1: number): void {
    const H = 1.02;
    const levels = [0.08, 0.52];
    const inset = 0.08;
    const X0 = x0 + inset, X1 = x1 - inset, Z0 = z0 + inset, Z1 = z1 - inset;
    // Uprights.
    for (let x = x0; x <= x1; x++)
      for (const z of [Z0, Z1]) {
        const px = Math.min(X1 - 0.05, Math.max(X0 + 0.05, x));
        b.block(px, 0, z, 0.045, H, 0.045, CELLS.shelfMetal, { faces: ALL, color: 0xffffff, ao: 0.7 });
      }
    for (const lv of levels) {
      b.box(X0, lv, Z0, X1, lv + 0.05, Z1, { top: CELLS.palletTop, side: CELLS.shelfMetal }, { faces: ALL, color: 0xd8c8b8 });
    }
    // Open top frame (beams along the long edges and the ends).
    b.box(X0, H - 0.06, Z0, X1, H, Z0 + 0.07, CELLS.shelfMetal, { faces: ALL });
    b.box(X0, H - 0.06, Z1 - 0.07, X1, H, Z1, CELLS.shelfMetal, { faces: ALL });
    b.box(X0, H - 0.06, Z0, X0 + 0.07, H, Z1, CELLS.shelfMetal, { faces: ALL });
    b.box(X1 - 0.07, H - 0.06, Z0, X1, H, Z1, CELLS.shelfMetal, { faces: ALL });
    // Goods on each level, per tile.
    for (let x = x0; x < x1; x++)
      for (let z = z0; z < z1; z++) {
        levels.forEach((lv, li) => {
          const k = hash2(x, z, 40 + li);
          const cx = x + 0.5, cz = z + 0.5, y = lv + 0.05;
          const maxH = li === 0 ? 0.36 : 0.44;
          if (k < 0.35) b.block(cx, y, cz, 0.3, maxH * 0.9, 0.3, { top: CELLS.cardTop, side: CELLS.cardSide }, { rotY: (k - 0.2) * 0.4, ao: 0.75 });
          else if (k < 0.6) {
            b.block(cx - 0.17, y, cz, 0.16, maxH * 0.62, 0.26, { top: CELLS.sackTop, side: CELLS.sackSide }, { rotY: 0.1, ao: 0.7 });
            b.block(cx + 0.17, y, cz, 0.16, maxH * 0.7, 0.26, { top: CELLS.sackTop, side: CELLS.kibbleSack }, { rotY: -0.1, ao: 0.7 });
          } else if (k < 0.8) {
            b.barrel(cx - 0.16, y, cz - 0.1, 0.14, maxH * 0.85, { top: CELLS.barrelTop, side: CELLS.barrelSide }, { ao: 0.7 });
            b.barrel(cx + 0.16, y, cz + 0.12, 0.14, maxH * 0.85, { top: CELLS.barrelTop, side: CELLS.barrelSide }, { ao: 0.7, color: 0xff9a8a });
          } else b.block(cx, y, cz, 0.34, maxH * 0.8, 0.3, { top: CELLS.crateTop, side: CELLS.crateSide }, { ao: 0.75 });
        });
      }
  }

  /** A conveyor over a 1-wide straight run of box tiles; parcels ride it (animated). */
  private conveyor(b: ArtBuilder, glow: ArtBuilder, x0: number, z0: number, x1: number, z1: number): void {
    const axis: 'x' | 'z' = x1 - x0 > z1 - z0 ? 'x' : 'z';
    const H = 0.42;
    const pad = 0.1;
    const X0 = x0 + (axis === 'z' ? pad : 0.04), X1 = x1 - (axis === 'z' ? pad : 0.04);
    const Z0 = z0 + (axis === 'x' ? pad : 0.04), Z1 = z1 - (axis === 'x' ? pad : 0.04);
    b.box(X0, 0.08, Z0, X1, H - 0.02, Z1, { side: CELLS.conveyorSide, top: CELLS.darkMetal }, { faces: NO_BOTTOM, color: 0xffffff, uv: 'world', ao: 0.7 });
    // Legs.
    const len = axis === 'x' ? x1 - x0 : z1 - z0;
    for (let i = 0; i <= len; i++) {
      const t = Math.min(len - 0.1, Math.max(0.1, i));
      for (const s of [0, 1]) {
        const lx = axis === 'x' ? X0 + t : s ? X1 - 0.06 : X0 + 0.06;
        const lz = axis === 'z' ? Z0 + t : s ? Z1 - 0.06 : Z0 + 0.06;
        b.block(lx, 0, lz, 0.05, 0.1, 0.05, CELLS.darkMetal, { faces: ALL });
      }
    }
    // End rollers with hazard caps and a status light.
    for (const e of [0, 1]) {
      const ex = axis === 'x' ? (e ? X1 : X0) : (X0 + X1) / 2;
      const ez = axis === 'z' ? (e ? Z1 : Z0) : (Z0 + Z1) / 2;
      b.block(ex, 0.08, ez, axis === 'x' ? 0.06 : (X1 - X0) / 2 + 0.03, H - 0.02, axis === 'z' ? 0.06 : (Z1 - Z0) / 2 + 0.03, CELLS.stripeTrim, { faces: ALL });
      glow.block(ex, H + 0.02, ez, 0.05, 0.08, 0.05, CELLS.white, { faces: ALL, color: e ? 0x7cff9a : 0xffc93c });
    }
    const n = Math.max(2, Math.round(len * 0.9));
    this.conveyors.push({ x0: X0, z0: Z0, x1: X1, z1: Z1, axis, len, n, first: 0 });
  }

  private buildConveyorParts(mat: THREE.Material, opts: TerrainOptions): void {
    if (!this.conveyors.length) return;
    // Belt: its own small scrolling texture.
    const c = document.createElement('canvas');
    c.width = 8;
    c.height = 16;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#1e1a26';
    ctx.fillRect(0, 0, 8, 16);
    ctx.fillStyle = '#3a3448';
    for (let y = 0; y < 16; y += 4) ctx.fillRect(0, y, 8, 1);
    ctx.fillStyle = '#4a4260';
    for (let y = 2; y < 16; y += 4) ctx.fillRect(1, y, 6, 1);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    this.beltTex = tex;
    const beltMat = new THREE.MeshLambertMaterial({ map: tex });
    const geos: THREE.BufferGeometry[] = [];
    let total = 0;
    for (const cv of this.conveyors) {
      const g = new THREE.PlaneGeometry(cv.axis === 'x' ? cv.x1 - cv.x0 - 0.1 : cv.x1 - cv.x0 - 0.06, cv.axis === 'z' ? cv.z1 - cv.z0 - 0.1 : cv.z1 - cv.z0 - 0.06);
      g.rotateX(-Math.PI / 2);
      if (cv.axis === 'x') {
        // Belt direction along x: rotate UVs so V runs along x.
        const uv = g.attributes.uv as THREE.BufferAttribute;
        for (let i = 0; i < uv.count; i++) {
          const u = uv.getX(i), v = uv.getY(i);
          uv.setXY(i, v, u * cv.len);
        }
      } else {
        const uv = g.attributes.uv as THREE.BufferAttribute;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i), uv.getY(i) * cv.len);
      }
      g.translate((cv.x0 + cv.x1) / 2, 0.42, (cv.z0 + cv.z1) / 2);
      geos.push(g);
      cv.first = total;
      total += cv.n;
    }
    const merged = geos.length === 1 ? geos[0] : mergeSimple(geos);
    const belt = new THREE.Mesh(merged, beltMat);
    belt.name = 'conveyor-belt';
    belt.receiveShadow = true;
    belt.matrixAutoUpdate = false;
    this.group.add(belt);
    this.disposables.push(tex, beltMat, merged);
    // Parcels.
    const pb = new ArtBuilder();
    pb.block(0, 0, 0, 0.2, 0.26, 0.2, { top: CELLS.cardTop, side: CELLS.cardSide }, { faces: ALL, ao: 0.8 });
    const pg = pb.build();
    this.parcels = new THREE.InstancedMesh(pg, mat, total);
    this.parcels.castShadow = opts.shadows;
    this.parcels.receiveShadow = true;
    this.parcels.frustumCulled = false;
    this.parcels.name = 'parcels';
    this.parcels.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.parcels);
    this.disposables.push(pg, this.parcels);
    this.update(0);
  }

  // -------------------------------------------------------------------------------------------
  // Security cameras
  // -------------------------------------------------------------------------------------------

  private buildCameras(b: ArtBuilder, _glow: ArtBuilder): void {
    // Convex room corners: a wall tile whose +x and +z neighbours... pick inner corners of rooms
    // (wall with floor diagonally at +x+z and walls at +x/+z sides is a back corner).
    const picks: { x: number; z: number; base: number }[] = [];
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (!this.isWall(x, y)) continue;
        // Back-left corner of a room: walls to the +x and +z, floor diagonally.
        if (this.isWall(x + 1, y) && this.isWall(x, y + 1) && this.isFloorish(x + 1, y + 1) && hash2(x, y, 77) < 0.75) {
          picks.push({ x: x + 1, z: y + 1, base: Math.PI / 4 });
        }
      }
    for (const p of picks.slice(0, 6)) {
      b.block(p.x - 0.02, WALL_H, p.z - 0.02, 0.05, 0.16, 0.05, CELLS.darkMetal, { faces: ALL });
      this.cams.push({ x: p.x + 0.02, y: WALL_H + 0.2, z: p.z + 0.02, base: p.base, phase: hash2(p.x, p.z, 3) * 6 });
    }
  }

  private buildCameraHeads(mat: THREE.Material): void {
    if (!this.cams.length) return;
    const hb = new ArtBuilder();
    // Body pointing +x, lens at the front.
    hb.box(-0.08, -0.06, -0.07, 0.18, 0.07, 0.07, { side: CELLS.steel, top: CELLS.steel }, { faces: ALL, color: 0xf0ecf8 });
    hb.box(0.18, -0.045, -0.05, 0.22, 0.055, 0.05, CELLS.darkMetal, { faces: ALL });
    hb.box(-0.02, 0.07, -0.08, 0.2, 0.09, 0.08, CELLS.darkMetal, { faces: ALL });
    const g = hb.build();
    this.camHeads = new THREE.InstancedMesh(g, mat, this.cams.length);
    this.camHeads.castShadow = false;
    this.camHeads.frustumCulled = false;
    this.camHeads.name = 'security-cams';
    this.camHeads.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const lg = new THREE.BoxGeometry(0.035, 0.035, 0.035);
    const lm = new THREE.MeshBasicMaterial({ color: hdr(PALETTE.ember, 4) });
    this.camLeds = new THREE.InstancedMesh(lg, lm, this.cams.length);
    this.camLeds.frustumCulled = false;
    this.camLeds.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.camHeads, this.camLeds);
    this.disposables.push(g, this.camHeads, lg, lm, this.camLeds);
  }

  // -------------------------------------------------------------------------------------------
  // Per frame
  // -------------------------------------------------------------------------------------------

  update(time: number): void {
    if (this.beltTex) this.beltTex.offset.y = -time * 0.6;
    if (this.parcels) {
      for (const cv of this.conveyors) {
        for (let i = 0; i < cv.n; i++) {
          const t = (((i / cv.n + time * 0.6 / cv.len) % 1) + 1) % 1;
          const along = 0.2 + t * (cv.len - 0.4);
          const x = cv.axis === 'x' ? cv.x0 + along : (cv.x0 + cv.x1) / 2;
          const z = cv.axis === 'z' ? cv.z0 + along : (cv.z0 + cv.z1) / 2;
          // Pop in/out at the ends.
          const sc = Math.min(1, t * 8, (1 - t) * 8);
          this.q.setFromAxisAngle(this.up, hash2(i, cv.first, 1) * 0.6 - 0.3);
          this.m4.compose(this.v.set(x, 0.42, z), this.q, this.s.set(sc, sc * (0.8 + hash2(i, 2) * 0.5), sc));
          this.parcels.setMatrixAt(cv.first + i, this.m4);
        }
      }
      this.parcels.instanceMatrix.needsUpdate = true;
    }
    if (this.camHeads && this.camLeds) {
      this.cams.forEach((c, i) => {
        const a = c.base + Math.sin(time * 0.5 + c.phase) * 0.7;
        this.q.setFromAxisAngle(this.up, -a);
        // Tilt down a little.
        const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -0.35);
        this.q.multiply(tilt);
        this.m4.compose(this.v.set(c.x, c.y, c.z), this.q, this.s.set(1, 1, 1));
        this.camHeads!.setMatrixAt(i, this.m4);
        const on = Math.sin(time * 4 + c.phase * 3) > 0.2 ? 1 : 0.001;
        const led = new THREE.Vector3(0.12, 0.1, 0).applyQuaternion(this.q);
        this.m4.compose(this.v.set(c.x + led.x, c.y + led.y, c.z + led.z), this.q, this.s.set(on, on, on));
        this.camLeds!.setMatrixAt(i, this.m4);
      });
      this.camHeads.instanceMatrix.needsUpdate = true;
      this.camLeds.instanceMatrix.needsUpdate = true;
    }
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.disposables.length = 0;
    this.group.removeFromParent();
  }
}

/** Merge non-indexed-compatible simple geometries (same attributes) without the addon. */
function mergeSimple(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  let base = 0;
  for (const g of geos) {
    const p = g.attributes.position as THREE.BufferAttribute;
    const n = g.attributes.normal as THREE.BufferAttribute;
    const u = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      nor.push(n.getX(i), n.getY(i), n.getZ(i));
      uv.push(u.getX(i), u.getY(i));
    }
    const ix = g.index!;
    for (let i = 0; i < ix.count; i++) idx.push(ix.getX(i) + base);
    base += p.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.setIndex(idx);
  return out;
}
