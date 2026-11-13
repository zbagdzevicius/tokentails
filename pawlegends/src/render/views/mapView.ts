/**
 * Purrhaven Crossing (POC.md §5), drawn from src/data/map.ts at load: a painted ground texture (grass, lanes, base
 * plazas, the rat camp clearing, river banks), an animated river, bridges, Catnip Bushes, a forest ring outside the
 * playfield, base banners and the gate barrier. Static scenery only; units and structures have their own views.
 * About 12 draw calls in all. Render only.
 */
import * as THREE from 'three';
import { BUSHES, CORE, FOUNTAIN, LANE_WAYPOINTS, MAP, PLAYFIELD, PUDDING_SPOT, RAT_CAMP, mirrorX } from '../../data/map';
import type { ViewFrame } from '../interp';
import { toX, toZ } from '../coords';
import { TEAM } from '../palette';
import { BUSH_COUNT, clearedBushes } from '../bushClear';
import { ModelBuilder } from './rig';
import { isPhone } from '../perf/device';
import { orthoFrustum } from '../chars';
import { NX, NY, createGrid, onPlayfield } from '../../sim/map/grid';

const W = MAP.width / 1000;
const H = MAP.height / 1000;

/** Seeded LCG so the scenery looks the same every load (render only). */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

type Pt = readonly [number, number];

function lanePolylines(): Pt[][] {
  const out: Pt[][] = [];
  for (const lane of ['sunny', 'puddle'] as const) {
    const pts = LANE_WAYPOINTS[lane].map(([x, y]) => [x / 1000, y / 1000] as const);
    const mirrored = pts.map(([x, y]) => [W - x, y] as const).reverse();
    out.push([...pts, ...mirrored.slice(1)]);
  }
  return out;
}

function distToPolyline(x: number, y: number, pl: readonly Pt[]): number {
  let best = Infinity;
  for (let i = 0; i + 1 < pl.length; i++) {
    const [ax, ay] = pl[i];
    const [bx, by] = pl[i + 1];
    const dx = bx - ax;
    const dy = by - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
    best = Math.min(best, Math.hypot(x - (ax + dx * t), y - (ay + dy * t)));
  }
  return best;
}

/**
 * MAP-GAPS A1: the jungle walls as the nav grid blocks them: `createGrid().walls` minus the off-playfield (forest)
 * cells, split into 4-connected clusters (the 4 WALLS rects and their mirrors). Bounds are cell edges in metres
 * (whole metres: the grid's cell-centre rule), so the rocks always match what blocks a hero. Render only.
 */
export interface WallCluster {
  cells: number[];
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
let clusterCache: WallCluster[] | null = null;
export function wallClusters(): WallCluster[] {
  if (clusterCache) return clusterCache;
  const walls = createGrid().walls;
  const cellM = MAP.navCell / 1000;
  const isWall = (c: number): boolean => walls[c] === 1 && onPlayfield((c % NX) * MAP.navCell + MAP.navCell / 2, Math.floor(c / NX) * MAP.navCell + MAP.navCell / 2);
  const seen = new Uint8Array(NX * NY);
  const out: WallCluster[] = [];
  for (let c0 = 0; c0 < NX * NY; c0++) {
    if (seen[c0] || !isWall(c0)) continue;
    const cells: number[] = [];
    const stack = [c0];
    seen[c0] = 1;
    while (stack.length) {
      const c = stack.pop()!;
      cells.push(c);
      const i = c % NX;
      const j = Math.floor(c / NX);
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const ni = i + di;
        const nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= NX || nj >= NY) continue;
        const k = nj * NX + ni;
        if (!seen[k] && isWall(k)) {
          seen[k] = 1;
          stack.push(k);
        }
      }
    }
    cells.sort((a, b) => a - b);
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const c of cells) {
      const i = c % NX;
      const j = Math.floor(c / NX);
      x0 = Math.min(x0, i * cellM);
      x1 = Math.max(x1, (i + 1) * cellM);
      y0 = Math.min(y0, j * cellM);
      y1 = Math.max(y1, (j + 1) * cellM);
    }
    out.push({ cells, x0, y0, x1, y1 });
  }
  clusterCache = out;
  return out;
}

/** One rock of a wall cluster (m): ground centre, footprint radius, height. */
export interface WallRock {
  x: number;
  y: number;
  r: number;
  h: number;
}
/**
 * MAP-GAPS A1: the boulders of every wall cluster, a jittered 0.9 m grid filled to the cluster's edges (each cell
 * centre lies inside at least one footprint), 0.8 to 1.6 m tall. Seeded, the same every load.
 */
export function wallRocks(): WallRock[] {
  const rnd = lcg(23);
  const out: WallRock[] = [];
  for (const cl of wallClusters()) {
    const step = 0.9;
    const nx = Math.max(1, Math.round((cl.x1 - cl.x0) / step));
    const ny = Math.max(1, Math.round((cl.y1 - cl.y0) / step));
    const sx = (cl.x1 - cl.x0) / nx;
    const sy = (cl.y1 - cl.y0) / ny;
    for (let a = 0; a < nx; a++) {
      for (let b = 0; b < ny; b++) {
        const x = cl.x0 + (a + 0.5) * sx + (rnd() - 0.5) * 0.12;
        const y = cl.y0 + (b + 0.5) * sy + (rnd() - 0.5) * 0.12;
        // only on the cluster's own cells (a cluster that is not a full rectangle stays exact)
        if (!cl.cells.includes(Math.floor(y) * NX + Math.floor(x))) continue;
        const edge = Math.min(x - cl.x0, cl.x1 - x, y - cl.y0, cl.y1 - y) < 0.7;
        out.push({ x, y, r: 0.7 + rnd() * 0.22, h: edge ? 0.8 + rnd() * 0.35 : 1.1 + rnd() * 0.5 });
      }
    }
  }
  return out;
}

/**
 * MAP-GAPS A1: the jungle footpaths (m): core → rat camp → river edge, both sides, bent round the x 16–18 and
 * x 35–37 walls along y 34.5 (the A* detour) so no painted path runs under a rock.
 */
export function footpaths(): Pt[][] {
  const cx = CORE.x / 1000;
  const cy = CORE.y / 1000;
  const rx = RAT_CAMP.x / 1000;
  const ry = RAT_CAMP.y / 1000;
  const out: Pt[][] = [];
  for (const flip of [false, true]) {
    const f = (x: number): number => (flip ? W - x : x);
    out.push([
      [f(cx), cy],
      [f(14.2), 34.5],
      [f(19.8), 34.5],
      [f(rx), ry],
      [f(33.4), 34.5],
      [f(38.8), 34.5],
      [f(44), 30],
    ]);
  }
  return out;
}

/** The pebbles round the rat camps (m): low (< 0.25 m), outside the 5.5 m clearing, off the footpaths and walls. */
export function campPebbles(): WallRock[] {
  const rnd = lcg(31);
  const paths = footpaths();
  const walls = createGrid().walls;
  const out: WallRock[] = [];
  for (let i = 0; i < 400 && out.length < 28; i++) {
    const flip = out.length % 2 === 1;
    const a = rnd() * Math.PI * 2;
    const d = 5.7 + rnd() * 2.6;
    const x0 = RAT_CAMP.x / 1000 + Math.cos(a) * d;
    const y = RAT_CAMP.y / 1000 + Math.sin(a) * d;
    const x = flip ? W - x0 : x0;
    const r = 0.12 + rnd() * 0.16;
    if (Math.min(...paths.map((pl) => distToPolyline(x, y, pl))) < 1.9 + r) continue;
    if (walls[Math.floor(y) * NX + Math.floor(x)]) continue;
    out.push({ x, y, r, h: 0.1 + rnd() * 0.13 });
  }
  return out;
}

/** `swap`: team 0 is the dogs (round 2): each plaza's stone and paw print take its species' colours. */
function paintGround(swap = false): THREE.Texture {
  const PX = 20;
  const c = document.createElement('canvas');
  c.width = W * PX;
  c.height = H * PX;
  const g = c.getContext('2d')!;
  const X = (x: number): number => x * PX;
  const Y = (y: number): number => (H - y) * PX;
  const rnd = lcg(7);
  // grass
  const grd = g.createLinearGradient(0, 0, c.width, 0);
  grd.addColorStop(0, '#a7d98a');
  grd.addColorStop(0.5, '#9fd383');
  grd.addColorStop(1, '#a3d488');
  g.fillStyle = grd;
  g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 900; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    const r = 0.6 + rnd() * 3.2;
    g.fillStyle = rnd() < 0.5 ? 'rgba(120,180,95,0.16)' : 'rgba(190,230,150,0.16)';
    g.beginPath();
    g.ellipse(X(x), Y(y), r * PX, r * PX * (0.6 + rnd() * 0.4), rnd() * 3, 0, Math.PI * 2);
    g.fill();
  }
  // grass tufts
  g.strokeStyle = 'rgba(95,150,80,0.45)';
  g.lineWidth = 2;
  for (let i = 0; i < 1600; i++) {
    const x = X(rnd() * W);
    const y = Y(rnd() * H);
    g.beginPath();
    g.moveTo(x - 3, y + 3);
    g.lineTo(x - 1, y - 3);
    g.moveTo(x + 1, y + 3);
    g.lineTo(x + 3, y - 2);
    g.stroke();
  }
  const stroke = (pl: readonly Pt[], width: number, color: string): void => {
    g.strokeStyle = color;
    g.lineWidth = width * PX;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.beginPath();
    pl.forEach(([x, y], i) => (i === 0 ? g.moveTo(X(x), Y(y)) : g.lineTo(X(x), Y(y))));
    g.stroke();
  };
  const disc = (x: number, y: number, r: number, color: string): void => {
    g.fillStyle = color;
    g.beginPath();
    g.arc(X(x), Y(y), r * PX, 0, Math.PI * 2);
    g.fill();
  };
  // jungle footpaths: core → rat camp → river (both sides), bent round the walls (MAP-GAPS A1)
  const cx = CORE.x / 1000;
  const cy = CORE.y / 1000;
  const rx = RAT_CAMP.x / 1000;
  for (const path of footpaths()) {
    stroke(path, 3.4, '#c9b27c');
    stroke(path, 2.4, '#dcc792');
  }
  for (const flip of [false, true]) {
    const f = (x: number): number => (flip ? W - x : x);
    disc(f(rx), RAT_CAMP.y / 1000, 5.5, '#cdb784');
    disc(f(rx), RAT_CAMP.y / 1000, 4.6, '#d9c595');
  }
  // MAP-GAPS A1: a trodden dirt footprint under each jungle wall (its rocks stand on it)
  for (const cl of wallClusters()) {
    for (const [pad, color] of [
      [0.7, 'rgba(120,92,58,0.35)'],
      [0.3, 'rgba(104,80,50,0.55)'],
    ] as const) {
      g.fillStyle = color;
      const x = X(cl.x0 - pad);
      const y = Y(cl.y1 + pad);
      const w = (cl.x1 - cl.x0 + 2 * pad) * PX;
      const h = (cl.y1 - cl.y0 + 2 * pad) * PX;
      const r = pad * PX * 1.4;
      g.beginPath();
      g.moveTo(x + r, y);
      g.arcTo(x + w, y, x + w, y + h, r);
      g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r);
      g.arcTo(x, y, x + w, y, r);
      g.closePath();
      g.fill();
    }
  }
  // lanes
  const lanes = lanePolylines();
  const lw = MAP.laneWidth / 1000;
  for (const pl of lanes) stroke(pl, lw, '#c8a96e');
  for (const pl of lanes) stroke(pl, lw - 1.2, '#e6cf98');
  for (const pl of lanes) stroke(pl, lw * 0.35, 'rgba(240,222,170,0.8)');
  // pebbles on the lanes
  for (let i = 0; i < 700; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    if (Math.min(...lanes.map((pl) => distToPolyline(x, y, pl))) > lw / 2 - 0.6) continue;
    disc(x, y, 0.08 + rnd() * 0.12, rnd() < 0.5 ? 'rgba(170,140,95,0.6)' : 'rgba(255,245,215,0.7)');
  }
  // base plazas
  for (const team of [0, 1] as const) {
    const bx = team === 0 ? cx : W - cx;
    const fx = team === 0 ? FOUNTAIN.x / 1000 : W - FOUNTAIN.x / 1000;
    const style = swap ? 1 - team : team;
    // audit GFX-01: the Woof plaza is sandstone and ochre, not blue-grey (blue is the ally colour only)
    const stone = style === 0 ? '#efe2c9' : '#dcc39a';
    const edge = style === 0 ? '#d9c3a0' : '#b38f5e';
    disc(bx, cy, 10.5, edge);
    disc(bx, cy, 9.7, stone);
    g.strokeStyle = edge;
    g.lineWidth = 3;
    for (let r = 4; r < 9.5; r += 2.2) {
      g.beginPath();
      g.arc(X(bx), Y(cy), r * PX, 0, Math.PI * 2);
      g.stroke();
    }
    for (let a = 0; a < 16; a++) {
      const t = (a / 16) * Math.PI * 2;
      g.beginPath();
      g.moveTo(X(bx + Math.cos(t) * 4), Y(cy + Math.sin(t) * 4));
      g.lineTo(X(bx + Math.cos(t) * 9.6), Y(cy + Math.sin(t) * 9.6));
      g.stroke();
    }
    disc(fx, FOUNTAIN.y / 1000, FOUNTAIN.radius / 1000 + 1.6, edge);
    disc(fx, FOUNTAIN.y / 1000, FOUNTAIN.radius / 1000 + 1.0, stone);
    // team-coloured paw print in the plaza
    g.fillStyle = style === 0 ? 'rgba(255,61,127,0.32)' : 'rgba(150,92,30,0.38)';
    const px = bx + (team === 0 ? 5.5 : -5.5);
    disc(px, cy - 5.5, 1.2, g.fillStyle as string);
    for (let k = 0; k < 4; k++) disc(px - 1.2 + k * 0.8, cy - 5.5 + 1.5 + (k === 0 || k === 3 ? -0.3 : 0), 0.45, g.fillStyle as string);
  }
  // river banks
  const r0 = MAP.riverX[0] / 1000;
  const r1 = MAP.riverX[1] / 1000;
  g.fillStyle = '#e8d6a0';
  g.fillRect(X(r0 - 1.1), 0, (r1 - r0 + 2.2) * PX, c.height);
  g.fillStyle = '#d7c189';
  g.fillRect(X(r0 - 0.4), 0, (r1 - r0 + 0.8) * PX, c.height);
  // bush footprints
  for (const b of BUSHES) {
    for (const x of [b.x, mirrorX(b.x)]) {
      g.fillStyle = 'rgba(70,120,70,0.45)';
      g.beginPath();
      g.ellipse(X(x / 1000), Y(b.y / 1000), (b.w / 1000 / 2 + 0.6) * PX, (b.h / 1000 / 2 + 0.6) * PX, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
  // flowers
  const petals = ['#ffffff', '#ffe14a', '#ffb3cd', '#7cc6ff'];
  for (let i = 0; i < 520; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    if (Math.min(...lanes.map((pl) => distToPolyline(x, y, pl))) < lw / 2 + 0.5) continue;
    if (x > r0 - 2 && x < r1 + 2) continue;
    disc(x, y, 0.14 + rnd() * 0.1, petals[(rnd() * petals.length) | 0]);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  return t;
}

/** MAP-GAPS A22: the outer grass tile (m across): 256 px at the playfield's 20 px/m is 12.8 m. */
export const GRASS_TILE_M = 12.8;

/** A tileable grass canvas in the painted playfield's colours (noise blobs and tufts wrap across the edges). */
function grassTile(): THREE.Texture {
  const N = 256;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d')!;
  const rnd = lcg(53);
  g.fillStyle = '#9fd383';
  g.fillRect(0, 0, N, N);
  const wrap = (f: (dx: number, dy: number) => void): void => {
    for (const dx of [-N, 0, N]) for (const dy of [-N, 0, N]) f(dx, dy);
  };
  for (let i = 0; i < 70; i++) {
    const x = rnd() * N;
    const y = rnd() * N;
    const r = (0.6 + rnd() * 3.2) * 20;
    const col = rnd() < 0.5 ? 'rgba(120,180,95,0.16)' : 'rgba(190,230,150,0.16)';
    const k = 0.6 + rnd() * 0.4;
    const a = rnd() * 3;
    wrap((dx, dy) => {
      g.fillStyle = col;
      g.beginPath();
      g.ellipse(x + dx, y + dy, r, r * k, a, 0, Math.PI * 2);
      g.fill();
    });
  }
  g.strokeStyle = 'rgba(95,150,80,0.45)';
  g.lineWidth = 2;
  for (let i = 0; i < 110; i++) {
    const x = rnd() * (N - 8) + 4;
    const y = rnd() * (N - 8) + 4;
    g.beginPath();
    g.moveTo(x - 3, y + 3);
    g.lineTo(x - 1, y - 3);
    g.moveTo(x + 1, y + 3);
    g.lineTo(x + 3, y - 2);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

const RIVER_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vW;
void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const RIVER_FRAG = /* glsl */ `
uniform float uTime;
uniform float uH;
uniform float uFade;
varying vec2 vUv;
varying vec3 vW;
void main(){
  float edge = min(vUv.x, 1.0 - vUv.x);
  float w1 = sin(vW.z * 0.9 + uTime * 1.6 + sin(vW.x * 1.7) * 1.2);
  float w2 = sin(vW.z * 2.3 - uTime * 2.2 + vW.x * 0.6);
  vec3 deep = vec3(0.30, 0.62, 0.86);
  vec3 lite = vec3(0.56, 0.84, 0.98);
  vec3 col = mix(deep, lite, smoothstep(0.1, 0.5, edge) * 0.25 + 0.35 + 0.18 * w1 + 0.08 * w2);
  float sparkle = smoothstep(0.93, 1.0, sin(vW.z * 3.1 + uTime * 3.0) * sin(vW.x * 4.3 - uTime * 1.3));
  col += sparkle * 0.35;
  float foam = smoothstep(0.09, 0.0, edge);
  col = mix(col, vec3(0.97, 0.99, 1.0), foam * 0.85);
  // MAP-GAPS A15: past the map's north and south edges the river fades out under the closing forest
  float out_ = max(-vW.z - uH, vW.z);
  float fade = 1.0 - smoothstep(uFade * 0.35, uFade, out_);
  gl_FragColor = vec4(col, smoothstep(0.0, 0.03, edge) * fade);
}`;

/** True when a rock of radius r at (x, y) m stands only on ground nobody can walk (render only). */
export function rockClear(x: number, y: number, r: number): boolean {
  for (const [dx, dy] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]] as const) if (onPlayfield(Math.round((x + dx) * 1000), Math.round((y + dy) * 1000))) return false;
  return true;
}

/** Canopy cut (render only): hero slots, the lowest height cut (m), the full / no-cut radius round the sight line (m). */
export const CANOPY_CUT = Object.freeze({ slots: 6, minY: 1.2, inner: 1.8, outer: 2.8, strength: 0.92 });

/**
 * Bush cut round a hero inside it (render only): full / no-cut radius (m), the share dithered away. v3.7 (trailer
 * review: a hero in a bush showed her legs and ring through a 60 % stipple of leaves, which read as clipping): the
 * leaves are cleared whole round the body (strength 1 out to `inner`, past a hero's drawn radius), with a short
 * dithered edge, so the hero reads as standing in an opening of the bush.
 */
export const BUSH_CUT = Object.freeze({ inner: 1.0, outer: 1.35, strength: 1.0 });

/** The share of bush leaves cut `d` m from a hero in it (the shader's own formula). */
export function bushCutAt(d: number): number {
  const t = Math.max(0, Math.min(1, (d - BUSH_CUT.inner) / (BUSH_CUT.outer - BUSH_CUT.inner)));
  return BUSH_CUT.strength * (1 - t * t * (3 - 2 * t));
}

/** The walkable spans (m, along y) of the line x = `x` m: where the gate barrier is drawn. */
export function gateSpans(x: number): [number, number][] {
  const out: [number, number][] = [];
  const step = 0.25;
  let start = -1;
  for (let y = 0; y <= H + 1e-6; y += step) {
    const on = onPlayfield(Math.round(x * 1000), Math.round(y * 1000));
    if (on && start < 0) start = y;
    if (!on && start >= 0) {
      out.push([start, y - step]);
      start = -1;
    }
  }
  if (start >= 0) out.push([start, H]);
  return out.filter(([a, b]) => b - a > 0.5);
}

/**
 * MAP-GAPS A12: how far (m) past each map edge the ground is dressed with trees: past the camera's real reach plus a
 * margin. Feel pass B1/B2: the fixed camera never clamps at the map edge and turns diagonally (either seat looks
 * across any edge), so every side reaches at least 40 m and the first trees stand 8 m out on every side.
 */
export const OUTER_DRESS = Object.freeze({ west: 46, east: 46, north: 40, south: 40, near: 8, nearSouth: 10 });

/** Distance (m) of (x, y) outside the map rectangle (0 inside). */
export const outsideBy = (x: number, y: number): number => Math.hypot(Math.max(0 - x, x - W, 0), Math.max(0 - y, y - H, 0));

/**
 * MAP-GAPS A12: the far forest (m): a jittered 3.2 m grid from OUTER_DRESS.near (nearSouth below the map) out to the dressed edge, all four
 * sides and the corner squares, thinning with distance (never under 35%). `low` marks the half a Low tier keeps.
 */
export function outerTrees(): { x: number; y: number; s: number; low: boolean }[] {
  const rnd = lcg(37);
  const out: { x: number; y: number; s: number; low: boolean }[] = [];
  const r0 = MAP.riverX[0] / 1000;
  const r1 = MAP.riverX[1] / 1000;
  for (let x = -OUTER_DRESS.west; x <= W + OUTER_DRESS.east; x += 3.2) {
    for (let y = -OUTER_DRESS.south; y <= H + OUTER_DRESS.north; y += 3.2) {
      const px = x + (rnd() - 0.5) * 2.2;
      const py = y + (rnd() - 0.5) * 2.2;
      const keep = rnd();
      const s = 0.85 + rnd() * 0.75;
      const lowPick = rnd() < 0.5;
      const d = outsideBy(px, py);
      // south of the map the trees stand between the camera and the units: they start further out
      if (d < (py < 0 ? OUTER_DRESS.nearSouth : OUTER_DRESS.near)) continue;
      // the river runs on under the canopy only near the map (MAP-GAPS A15 closes the forest over it further out)
      if (px > r0 - 2 && px < r1 + 2 && d < RIVER_RUN * 0.75) continue;
      if (keep > Math.max(0.35, 1 - (d - OUTER_DRESS.near) / 70)) continue;
      out.push({ x: px, y: py, s, low: lowPick });
    }
  }
  return out;
}

/** The Catnip Bushes, both sides, in sim/map/brush.ts bushAt order (m: centre and half sizes). */
export function bushRects(): { x: number; y: number; hw: number; hh: number }[] {
  const out: { x: number; y: number; hw: number; hh: number }[] = [];
  for (const side of [0, 1]) for (const b of BUSHES) out.push({ x: (side === 0 ? b.x : mirrorX(b.x)) / 1000, y: b.y / 1000, hw: b.w / 2000, hh: b.h / 2000 });
  return out;
}

/** MAP-GAPS A16: the walkable lane band's half width (m) a bridge deck covers. */
export const BRIDGE_HALF = 5.7;

/**
 * MAP-GAPS A16: each bridge (m): where it crosses (y at x = 50 m), its deck width and top, its plank count and its low
 * end posts on the banks (outside the river: nothing stands in the walkable band).
 */
export function bridgeParts(): { y: number; deckY: number; width: number; top: number; planks: number; posts: { x: number; y: number }[] }[] {
  const r0 = MAP.riverX[0] / 1000;
  const r1 = MAP.riverX[1] / 1000;
  const rim = PLAYFIELD.rim / 1000;
  return lanePolylines().map((lane) => {
    const mid = lane.find(([x]) => Math.abs(x - W / 2) < 0.01) ?? lane[Math.floor(lane.length / 2)];
    const y = mid[1];
    const posts: { x: number; y: number }[] = [];
    for (const x of [r0 - 1.3, r1 + 1.3]) for (const s of [-1, 1]) posts.push({ x, y: y + s * BRIDGE_HALF });
    // the deck stops at the playfield rim (the log jam of A15 lies just past it), so an edge lane's deck is trimmed
    const lo = Math.max(y - BRIDGE_HALF - 0.2, rim);
    const hi = Math.min(y + BRIDGE_HALF + 0.2, H - rim);
    return { y, deckY: (lo + hi) / 2, width: hi - lo, top: 0.015, planks: 12, posts };
  });
}

/** MAP-GAPS A15: how far (m) the river runs on past the map edge before it has faded out under the forest. */
export const RIVER_RUN = 16;

/** MAP-GAPS A15: the boundary markers across the river: where the playfield rim stops units (m), and `out` (±1). */
export function riverMarkers(): { y: number; out: 1 | -1 }[] {
  return [
    { y: PLAYFIELD.rim / 1000, out: -1 },
    { y: H - PLAYFIELD.rim / 1000, out: 1 },
  ];
}

/** MAP-GAPS A13: the fountain basin's outer rim (m, the rim torus of models.ts fountainGeometry) plus a gap. */
/** The fountain plaza ring's inner radius (m): under the basin rim torus (4.0 m, tube 0.28 m), outside the water. */
export const PLAZA_HOLE = FOUNTAIN.radius / 1000 - 0.25;
export const FOUNTAIN_CLEAR = FOUNTAIN.radius / 1000 + 0.28 + 0.3;

/**
 * The hedge along the map edge (m, sphere centre and its widest radius), skipping the river and, MAP-GAPS A13, a
 * clear arc round each fountain (the hedge cut through the basin rim).
 */
export function hedgeSpots(): { x: number; y: number; r: number; color: number; kind: 'bush' | 'rock' | 'flower' }[] {
  const rnd = lcg(41);
  const r0 = MAP.riverX[0] / 1000;
  const r1 = MAP.riverX[1] / 1000;
  const fountains = [FOUNTAIN.x / 1000, W - FOUNTAIN.x / 1000].map((x) => [x, FOUNTAIN.y / 1000] as const);
  const out: { x: number; y: number; r: number; color: number; kind: 'bush' | 'rock' | 'flower' }[] = [];
  const petals = [0xffffff, 0xffe14a, 0xffb3cd, 0x7cc6ff];
  // MAP-GAPS A22: a natural hedge: jittered ±0.5 m, varied sizes, ~15% gaps, a rock or a flowering bush now and then
  const at = (x0: number, y0: number, nx: number, ny: number): void => {
    const gap = rnd() < 0.15;
    const along = (rnd() - 0.5) * 1.0;
    const across = (rnd() - 0.5) * 1.0;
    const x = x0 + ny * along + nx * across;
    const y = y0 + nx * along + ny * across;
    const pick = rnd();
    const kind = pick < 0.1 ? 'rock' : pick < 0.25 ? 'flower' : 'bush';
    const r = kind === 'rock' ? 0.45 + rnd() * 0.35 : (0.6 + rnd() * 0.5) * 1.2;
    const color = kind === 'rock' ? (rnd() < 0.5 ? 0xb9b2a6 : 0xa59d90) : rnd() < 0.5 ? 0x5fa860 : 0x6db86a;
    if (gap) return;
    if (x > r0 - 1.5 && x < r1 + 1.5) return;
    if (fountains.some(([fx, fy]) => Math.hypot(x - fx, y - fy) - r < FOUNTAIN_CLEAR + 0.6)) return;
    out.push({ x, y, r, color, kind });
    if (kind === 'flower') for (let i = 0; i < 3; i++) out.push({ x: x + (rnd() - 0.5) * r, y: y + (rnd() - 0.5) * r, r: 0.12, color: petals[(rnd() * petals.length) | 0], kind: 'flower' });
  };
  for (let x = 0; x <= W; x += 1.6) {
    at(x, -0.8, 0, 1);
    at(x, H + 0.8, 0, 1);
  }
  for (let y = 0; y <= H; y += 1.6) {
    at(-0.8, y, 1, 0);
    at(W + 0.8, y, 1, 0);
  }
  return out;
}

/** MAP-GAPS A13: the stones of the low wall behind each fountain (m): an arc 1.2 m outside the rim, map-edge side. */
export function fountainWall(): { x: number; y: number; r: number; color: number }[] {
  const rnd = lcg(43);
  const out: { x: number; y: number; r: number; color: number }[] = [];
  for (const side of [0, 1] as const) {
    const fx = side === 0 ? FOUNTAIN.x / 1000 : W - FOUNTAIN.x / 1000;
    const fy = FOUNTAIN.y / 1000;
    const R = FOUNTAIN_CLEAR + 1.2;
    for (let a = -1.25; a <= 1.25; a += 0.16) {
      const ang = (side === 0 ? Math.PI : 0) + a;
      const r = 0.35 + rnd() * 0.2;
      out.push({ x: fx + Math.cos(ang) * R, y: fy + Math.sin(ang) * R, r, color: rnd() < 0.5 ? 0xd8cdb8 : 0xc4b79e });
    }
  }
  return out;
}

export interface MapView {
  group: THREE.Group;
  /** MAP-GAPS A12: the Low tier draws half the far forest. */
  setDetail?(low: boolean): void;
  /** MAP-GAPS A20: our team (an ally in a bush clears it). */
  setTeam?(team: number): void;
  /** MAP-GAPS A20: each bush's cleared tint now, 0..1 (tests). */
  clearedTint?(): number[];
  /** `lens`: the camera position (m), for the canopy cut over heroes near the tree line. */
  update(frame: ViewFrame | null, dt: number, lens?: THREE.Vector3): void;
  setShadows(on: boolean): void;
  /** Round 2: team 0 is the dogs: the plazas and base banners wear each side's species colours. */
  setStyleSwap(on: boolean): void;
  /** lifecycle: false once the start-gate fence (render/fx/lifecycleGate.ts) draws the gates; the ground strip hides. */
  gateStrip: boolean;
  dispose(): void;
}

/** A scenery shadow stand-in: an ellipsoid at (x, y, z) m with radii rx, ry, rz. */
export interface CasterBlob {
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  rz: number;
}

/** PERF-IOS §8 Track A: stand-in tiles (m): the shadow camera culls a whole tile it does not reach. */
export const CASTER_TILE = 24;

/**
 * PERF-IOS §8 Track A (phones): the forest and the jungle walls cast through low-poly blobs (an octahedron of 8
 * triangles per canopy or rock instead of ~64 per tree), merged per CASTER_TILE square so the shadow camera culls the
 * tiles it does not reach. They never draw on screen (culled out of the match camera's pass, like the heroes'
 * stand-ins in render/chars). Pure geometry; exported for the unit test.
 */
export function casterChunks(blobs: readonly CasterBlob[], keep: <T extends { dispose(): void }>(x: T) => T = (x) => x): THREE.Mesh[] {
  const tiles = new Map<string, CasterBlob[]>();
  for (const b of blobs) {
    const k = `${Math.floor(b.x / CASTER_TILE)},${Math.floor(b.z / CASTER_TILE)}`;
    const t = tiles.get(k);
    if (t) t.push(b);
    else tiles.set(k, [b]);
  }
  const unit = new THREE.OctahedronGeometry(1, 0);
  const up = unit.getAttribute('position');
  const mat = keep(new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
  const out: THREE.Mesh[] = [];
  for (const list of tiles.values()) {
    const pos = new Float32Array(list.length * up.count * 3);
    let o = 0;
    for (const b of list)
      for (let i = 0; i < up.count; i++) {
        pos[o++] = b.x + up.getX(i) * b.rx;
        pos[o++] = b.y + up.getY(i) * b.ry;
        pos[o++] = b.z + up.getZ(i) * b.rz;
      }
    const g = keep(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat);
    m.name = 'scenery-shadow';
    m.matrixAutoUpdate = false;
    m.intersectsFrustum = (f: THREE.Frustum): boolean => orthoFrustum(f) && f.intersectsObject(m);
    out.push(m);
  }
  unit.dispose();
  return out;
}

export function createMapView(): MapView {
  const group = new THREE.Group();
  group.name = 'map';
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T): T => {
    disposables.push(x);
    return x;
  };
  const shadowCasters: THREE.Object3D[] = [];
  const phoneScenery = isPhone();
  /** PERF-IOS §8 Track A: the scenery's shadow stand-ins on a phone (canopies and rocks as low-poly blobs). */
  const standIns: CasterBlob[] = [];
  const proxyCasters: THREE.Object3D[] = [];
  const rnd = lcg(11);

  // outside grass. MAP-GAPS A22: a tileable grass texture at the playfield's 20 px/m in its colours (the flat green
  // left a seam at the map edge), darkening with the distance from the map
  const outerGeo = keep(new THREE.PlaneGeometry(W + 160, H + 140));
  outerGeo.rotateX(-Math.PI / 2);
  const grassTex = typeof document !== 'undefined' ? keep(grassTile()) : null;
  if (grassTex) grassTex.repeat.set((W + 160) / GRASS_TILE_M, (H + 140) / GRASS_TILE_M);
  const outerMat = keep(new THREE.MeshLambertMaterial({ color: grassTex ? 0xffffff : 0x9fd383, map: grassTex }));
  outerMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vOW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvOW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vOW;').replace(
      '#include <dithering_fragment>',
      `#include <dithering_fragment>
  vec2 o = max(vec2(-vOW.x - 0.0, vOW.x - ${W.toFixed(1)}), 0.0);
  vec2 p = max(vec2(vOW.z, -vOW.z - ${H.toFixed(1)}), 0.0);
  float d = length(vec2(max(o.x, o.y), max(p.x, p.y)));
  gl_FragColor.rgb *= 1.0 - 0.22 * smoothstep(4.0, 40.0, d);`,
    );
  };
  outerMat.customProgramCacheKey = () => 'pl-outer-grass-v1';
  const outer = new THREE.Mesh(outerGeo, outerMat);
  outer.position.set(W / 2, -0.02, -H / 2);
  outer.receiveShadow = true;
  group.add(outer);

  // playfield
  let tex = typeof document !== 'undefined' ? paintGround() : null;
  let texSwap = false;
  const groundGeo = keep(new THREE.PlaneGeometry(W, H));
  groundGeo.rotateX(-Math.PI / 2);
  const groundMat = keep(new THREE.MeshLambertMaterial({ color: 0xffffff, map: tex }));
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.position.set(W / 2, 0, -H / 2);
  ground.receiveShadow = true;
  ground.name = 'ground';
  group.add(ground);

  // MAP-GAPS A13: each fountain plaza as a mesh disc, so it runs on past x = 0 / x = W (the painted one stops there)
  const plazaMats = [0, 1].map(() => ({ edge: keep(new THREE.MeshLambertMaterial({ polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })), stone: keep(new THREE.MeshLambertMaterial({ polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })) }));
  const plazaStyle = (swap: boolean): void => {
    for (const team of [0, 1] as const) {
      const style = swap ? 1 - team : team;
      plazaMats[team].edge.color.set(style === 0 ? '#d9c3a0' : '#b38f5e');
      plazaMats[team].stone.color.set(style === 0 ? '#efe2c9' : '#dcc39a');
    }
  };
  plazaStyle(false);
  for (const team of [0, 1] as const) {
    const fx = team === 0 ? FOUNTAIN.x / 1000 : W - FOUNTAIN.x / 1000;
    for (const [r, mat, y] of [
      [FOUNTAIN.radius / 1000 + 1.6, plazaMats[team].edge, 0.004],
      [FOUNTAIN.radius / 1000 + 1.0, plazaMats[team].stone, 0.006],
    ] as const) {
      // a ring, not a disc: its hole sits under the basin rim torus (inner edge 3.72 m), so the pulled-forward plaza
      // never covers the basin water (0.05 m), which it did at grazing zooms (>= 1.03) with a full disc
      const geo = keep(new THREE.RingGeometry(PLAZA_HOLE, r, 40, 1));
      geo.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(geo, mat);
      m.position.set(fx, y, -FOUNTAIN.y / 1000);
      m.receiveShadow = true;
      m.name = 'fountain-plaza';
      group.add(m);
    }
  }

  // river
  const riverU = { uTime: { value: 0 }, uH: { value: H }, uFade: { value: RIVER_RUN } };
  const r0 = MAP.riverX[0] / 1000;
  const r1 = MAP.riverX[1] / 1000;
  const riverGeo = keep(new THREE.PlaneGeometry(r1 - r0, H + 2 * RIVER_RUN, 1, 1));
  riverGeo.rotateX(-Math.PI / 2);
  const river = new THREE.Mesh(
    riverGeo,
    keep(new THREE.ShaderMaterial({ uniforms: riverU, vertexShader: RIVER_VERT, fragmentShader: RIVER_FRAG, transparent: true, depthWrite: false })),
  );
  river.position.set((r0 + r1) / 2, 0.02, -H / 2);
  river.renderOrder = 1;
  group.add(river);
  // MAP-GAPS A15: the sand banks run on with the river past the map edge (strips under the painted ground inside it)
  const bankMat = keep(new THREE.MeshLambertMaterial({ color: 0xe8d6a0 }));
  for (const [x0, x1] of [
    [r0 - 1.1, r0 + 0.05],
    [r1 - 0.05, r1 + 1.1],
  ] as const) {
    const geo = keep(new THREE.PlaneGeometry(x1 - x0, H + 2 * RIVER_RUN));
    geo.rotateX(-Math.PI / 2);
    const bank = new THREE.Mesh(geo, bankMat);
    bank.position.set((x0 + x1) / 2, -0.008, -H / 2);
    bank.receiveShadow = true;
    bank.name = 'river-bank';
    group.add(bank);
  }

  // scenery built into a few merged meshes (vertex colours, toon lit)
  const sceneryMat = keep(new THREE.MeshLambertMaterial({ vertexColors: true }));
  const addMerged = (b: ModelBuilder, name: string, cast = true, mat: THREE.Material = sceneryMat): void => {
    const g = keep(b.build());
    const m = new THREE.Mesh(g, mat);
    m.name = name;
    m.castShadow = cast;
    m.receiveShadow = true;
    if (cast) shadowCasters.push(m);
    group.add(m);
  };

  // pudding island, bridges
  const props = new ModelBuilder();
  props.cyl(6.2, 6.6, 0.08, 0xe8d6a0, { at: [toX(PUDDING_SPOT.x), 0.0, toZ(PUDDING_SPOT.y)] }, 28);
  props.cyl(5.6, 5.6, 0.1, 0xd7c189, { at: [toX(PUDDING_SPOT.x), 0.0, toZ(PUDDING_SPOT.y)] }, 28);
  // MAP-GAPS A16: the bridge decks cover the whole walkable lane band (±5.7 m), flush with the water (drawn over the
  // river, not above it), with low end posts on the banks only: rails across the river stood inside the walkable band
  const deck = new ModelBuilder();
  for (const b of bridgeParts()) {
    for (let i = 0; i < b.planks; i++) {
      const x = r0 - 1 + (i + 0.5) * ((r1 - r0 + 2) / b.planks);
      deck.box(((r1 - r0 + 2) / b.planks) * 0.92, 0.01, b.width, i % 2 ? 0xb07a4a : 0xc08a56, { at: [x, b.top - 0.005, -b.deckY] });
    }
    for (const p of b.posts) {
      props.cyl(0.14, 0.17, 0.75, 0x8a5a3a, { at: [p.x, 0.37, -p.y] }, 6);
      props.sphere(0.17, 0x7a5133, { at: [p.x, 0.78, -p.y] }, 6);
    }
  }
  const deckMat = keep(new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }));
  const deckMesh = new THREE.Mesh(keep(deck.build()), deckMat);
  deckMesh.name = 'bridge-decks';
  deckMesh.renderOrder = 2;
  deckMesh.receiveShadow = true;
  group.add(deckMesh);
  // MAP-GAPS A15: where the playfield rim stops units in the river (y = 2 m and y = 58 m), a log jam with rocks and
  // reeds marks the boundary across the water
  const jr = lcg(47);
  for (const m of riverMarkers()) {
    // all of it past the rim (m.out side): logs or reeds inside it stood on the bridge deck, in the walkable band
    for (let i = 0; i < 3; i++) {
      const y = m.y + (0.25 + i * 0.42) * m.out;
      props.cyl(0.2, 0.24, r1 - r0 + 1.6 - i * 0.6, i % 2 ? 0x7a5133 : 0x8a5a3a, { at: [(r0 + r1) / 2 + (jr() - 0.5) * 0.8, 0.18 + (i === 1 ? 0.14 : 0), -y], rot: [0, (jr() - 0.5) * 0.25, Math.PI / 2] }, 7);
    }
    for (const bx of [r0 - 0.4, r1 + 0.4, (r0 + r1) / 2 - 2.2, (r0 + r1) / 2 + 2.4]) props.add(new THREE.DodecahedronGeometry(0.45 + jr() * 0.3, 0), 0xa9a194, { at: [bx, 0.2, -(m.y + m.out * 0.9)], rot: [jr() * 3, jr() * 3, 0], scale: [1, 0.7, 1] });
    for (let k = 0; k < 9; k++) {
      const rx = r0 + 0.3 + jr() * (r1 - r0 - 0.6);
      props.cyl(0.03, 0.05, 0.9 + jr() * 0.5, 0x6a9a4a, { at: [rx, 0.5, -(m.y + m.out * (1.2 + jr() * 0.6))], rot: [(jr() - 0.5) * 0.3, 0, (jr() - 0.5) * 0.3] }, 4);
    }
  }
  addMerged(props, 'props');

  // base banners: one mesh per style (round 2 swaps them when team 0 is the dogs)
  const bannerMesh = (swap: boolean): THREE.Mesh => {
  const props = new ModelBuilder();
  for (const team of [0, 1] as const) {
    const t = TEAM[(swap ? 1 - team : team) as 0 | 1];
    const bx = team === 0 ? CORE.x / 1000 : W - CORE.x / 1000;
    for (const [dx, dy] of [
      [-3, 9.5],
      [3, 9.5],
      [-3, -9.5],
      [3, -9.5],
    ] as const) {
      const x = bx + dx;
      const z = -(CORE.y / 1000 + dy);
      props.cyl(0.09, 0.11, 4.2, 0xfff3e3, { at: [x, 2.1, z] }, 6);
      props.box(1.2, 1.7, 0.06, t.main, { at: [x + 0.6, 3.3, z] });
      props.box(1.2, 0.25, 0.07, t.second, { at: [x + 0.6, 2.4, z] });
      props.sphere(0.16, t.second, { at: [x, 4.3, z] }, 8);
    }
  }
  addMerged(props, swap ? 'banners-swapped' : 'banners');
  return group.children[group.children.length - 1] as THREE.Mesh;
  };
  const banners = bannerMesh(false);
  const bannersSwapped = bannerMesh(true);
  bannersSwapped.visible = false;

  const forestU = { uLens: { value: new THREE.Vector3(0, 1e4, 0) }, uSee: { value: Array.from({ length: CANOPY_CUT.slots }, () => new THREE.Vector4()) } };
  // MAP-GAPS A20: the bush rects (render x/z centre, half sizes + a leaf margin) and their cleared fade (0..1)
  const bushU = {
    uBushRect: { value: bushRects().map((r) => new THREE.Vector4(r.x, -r.y, r.hw + 1.1, r.hh + 1.1)) },
    uBushOn: { value: new Array(BUSH_COUNT).fill(0) as number[] },
  };
  let myTeam = 0;
  const cleared: boolean[] = [];
  // Catnip Bushes
  const bush = new ModelBuilder();
  for (const b of BUSHES) {
    for (const bx of [b.x, mirrorX(b.x)]) {
      const cxm = bx / 1000;
      const cym = b.y / 1000;
      const hw = b.w / 2000;
      const hh = b.h / 2000;
      const leaves: [number, number, number, number][] = [];
      for (let i = 0; i < 16; i++) {
        const x = cxm + (rnd() * 2 - 1) * hw * 0.85;
        const y = cym + (rnd() * 2 - 1) * hh * 0.88;
        const r = 0.7 + rnd() * 0.45;
        const h = 0.45 + rnd() * 0.25;
        leaves.push([x, h, y, r]);
        bush.sphere(r, i % 3 ? 0x4f9a5a : 0x5fb06a, { at: [x, h, -y], scale: [1, 0.85, 1] }, 9);
      }
      // berries sit on the leaves (trailer review: placed anywhere in the box, some hovered in the air)
      for (let i = 0; i < 12; i++) {
        const [lx, lh, ly, lr] = leaves[(rnd() * leaves.length) | 0];
        const a = rnd() * Math.PI * 2;
        const el = 0.5 + rnd() * 0.6;
        const k = lr * 0.98;
        bush.sphere(0.12, 0xb98cff, { at: [lx + Math.cos(a) * Math.cos(el) * k, lh + Math.sin(el) * k * 0.85, -(ly + Math.sin(a) * Math.cos(el) * k)] }, 6);
      }
    }
  }
  // a hero in a bush: the leaves round it are dithered half away (they poked through the body, trailer review)
  const bushMat = keep(new THREE.MeshLambertMaterial({ vertexColors: true }));
  bushMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, forestU, bushU);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vFW;\nuniform vec4 uSee[${CANOPY_CUT.slots}];`)
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
  float cut = 0.0;
  for (int i = 0; i < ${CANOPY_CUT.slots}; i++) {
    if (uSee[i].w < 0.5) continue;
    cut = max(cut, 1.0 - smoothstep(${BUSH_CUT.inner.toFixed(2)}, ${BUSH_CUT.outer.toFixed(2)}, length(vFW.xz - uSee[i].xz)));
  }
  float th = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  if (cut * ${BUSH_CUT.strength.toFixed(2)} > th) discard;`,
      );
  };
  // MAP-GAPS A20: a cleared bush (an ally in it) is drawn lighter
  bushMat.onBeforeCompile = ((prev) => (sh: Parameters<NonNullable<typeof bushMat.onBeforeCompile>>[0], r: Parameters<NonNullable<typeof bushMat.onBeforeCompile>>[1]) => {
    prev(sh, r);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform vec4 uBushRect[${BUSH_COUNT}];\nuniform float uBushOn[${BUSH_COUNT}];`)
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
  float lit = 0.0;
  for (int i = 0; i < ${BUSH_COUNT}; i++) {
    vec2 q = abs(vFW.xz - uBushRect[i].xy) - uBushRect[i].zw;
    if (max(q.x, q.y) < 0.0) lit = max(lit, uBushOn[i]);
  }
  gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.rgb * 1.25 + vec3(0.06, 0.08, 0.02), lit * 0.55);`,
      );
  })(bushMat.onBeforeCompile);
  bushMat.customProgramCacheKey = () => 'pl-bush-cut-v2';
  addMerged(bush, 'bushes', false, bushMat);

  // forest ring outside the playfield, plus a hedge on the edge
  const trees = new ModelBuilder();
  const tree = (x: number, z: number, s: number): void => {
    trees.cyl(0.25 * s, 0.35 * s, 1.6 * s, 0x8a5a3a, { at: [x, 0.8 * s, z] }, 6);
    const green = [0x5aa35a, 0x4f9a4a, 0x6bb565][(rnd() * 3) | 0];
    trees.add(new THREE.IcosahedronGeometry(1.5 * s, 0), green, { at: [x, 2.3 * s, z] });
    trees.add(new THREE.IcosahedronGeometry(1.05 * s, 0), 0x7cc46e, { at: [x + 0.2 * s, 3.2 * s, z - 0.1 * s] });
    // the shadow stand-in: the canopy (both crowns) as one tall blob down to the trunk's top
    standIns.push({ x: x + 0.05 * s, y: 2.35 * s, z: z - 0.03 * s, rx: 1.45 * s, ry: 1.95 * s, rz: 1.45 * s });
  };
  for (let i = 0; i < 260; i++) {
    const side = i % 4;
    let x = 0;
    let y = 0;
    const m = 2.5 + rnd() * 16;
    if (side === 0) {
      x = -m;
      y = rnd() * (H + 30) - 15;
    } else if (side === 1) {
      x = W + m;
      y = rnd() * (H + 30) - 15;
    } else if (side === 2) {
      x = rnd() * (W + 30) - 15;
      y = -m;
    } else {
      x = rnd() * (W + 30) - 15;
      y = H + m;
    }
    if (x > r0 - 2 && x < r1 + 2) continue;
    tree(x, -y, 0.9 + rnd() * 0.7);
  }
  // sim v5: the forest also fills every corner of the map outside the playfield (the same cells the nav grid
  // blocks), so where a hero cannot walk there are trees, and where there are no trees it can.
  const clear = (xm: number, ym: number): boolean => !onPlayfield(Math.round(xm * 1000), Math.round(ym * 1000));
  for (let gx = 1.2; gx < W; gx += 2.6) {
    for (let gy = 1.2; gy < H; gy += 2.6) {
      const x = gx + (rnd() - 0.5) * 1.4;
      const y = gy + (rnd() - 0.5) * 1.4;
      if (!clear(x, y) || !clear(x + 1.3, y) || !clear(x - 1.3, y) || !clear(x, y + 1.3) || !clear(x, y - 1.3)) continue;
      if (x > r0 - 1 && x < r1 + 1) continue;
      tree(x, -y, 0.75 + rnd() * 0.6);
    }
  }
  // trailer review: canopies between the lens and a hero (any hero, not only the player) are cut away with a dither,
  // so a fight by the tree line is never hidden under the leaves (trunks below 1.2 m stay)
  const canopyMat = (minY: number, key: string): THREE.MeshLambertMaterial => {
    const mat = keep(new THREE.MeshLambertMaterial({ vertexColors: true }));
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, forestU);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vFW;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>\nvarying vec3 vFW;\nuniform vec3 uLens;\nuniform vec4 uSee[${CANOPY_CUT.slots}];`)
        .replace(
          '#include <clipping_planes_fragment>',
          `#include <clipping_planes_fragment>
  if (vFW.y > ${minY.toFixed(2)}) {
    float cut = 0.0;
    for (int i = 0; i < ${CANOPY_CUT.slots}; i++) {
      if (uSee[i].w < 0.5) continue;
      vec3 ab = uSee[i].xyz - uLens;
      float t = clamp(dot(vFW - uLens, ab) / max(dot(ab, ab), 1e-4), 0.0, 1.0);
      float d = length(vFW - (uLens + ab * t));
      if (t < 0.98) cut = max(cut, 1.0 - smoothstep(${CANOPY_CUT.inner.toFixed(2)}, ${CANOPY_CUT.outer.toFixed(2)}, d));
    }
    float th = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    if (cut * ${CANOPY_CUT.strength.toFixed(2)} > th) discard;
  }`,
        );
    };
    mat.customProgramCacheKey = () => key;
    return mat;
  };
  const forestMat = canopyMat(CANOPY_CUT.minY, 'pl-forest-cut-v1');
  addMerged(trees, 'forest', true, forestMat);

  // MAP-GAPS A1: the 8 jungle walls the nav grid blocks, as rock-and-root clusters filled to their edges (they were
  // invisible: heroes stopped against bare grass). Cut like the canopy (from 0.6 m up), so a hero behind a tall rock
  // stays visible.
  const wallB = new ModelBuilder();
  const wr = lcg(29);
  const rockTones = [0x9d958a, 0xaaa294, 0x8c857b, 0xb3ab9c];
  for (const k of wallRocks()) {
    wallB.add(new THREE.DodecahedronGeometry(k.r, 0), rockTones[(wr() * rockTones.length) | 0], {
      at: [k.x, k.h * 0.42, -k.y],
      rot: [wr() * 3, wr() * 3, wr() * 3],
      scale: [1, k.h / (2 * k.r) + 0.1, 1],
    });
    standIns.push({ x: k.x, y: k.h * 0.42, z: -k.y, rx: k.r, ry: k.r * (k.h / (2 * k.r) + 0.1), rz: k.r });
  }
  for (const cl of wallClusters()) {
    const long = cl.x1 - cl.x0 >= cl.y1 - cl.y0;
    const len = (long ? cl.x1 - cl.x0 : cl.y1 - cl.y0) * 0.55;
    const mx = (cl.x0 + cl.x1) / 2;
    const my = (cl.y0 + cl.y1) / 2;
    // one fallen log along the cluster's long side
    const at: [number, number, number] = long ? [mx + (wr() - 0.5) * 0.6, 1.25, -my] : [mx, 1.25, -(my + (wr() - 0.5) * 0.6)];
    wallB.cyl(0.24, 0.28, len, 0x7a5133, { at, rot: long ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0] }, 7);
    // a root stump and a moss cap at one end
    const sx = long ? cl.x0 + 0.7 : mx;
    const sy = long ? my : cl.y1 - 0.7;
    wallB.cyl(0.38, 0.5, 1.5, 0x6e4a2e, { at: [sx, 0.75, -sy] }, 7);
    wallB.sphere(0.5, 0x5f9a52, { at: [sx, 1.55, -sy], scale: [1, 0.45, 1] }, 7);
  }
  addMerged(wallB, 'walls', true, canopyMat(0.6, 'pl-wall-cut-v1'));
  if (phoneScenery) {
    for (const m of casterChunks(standIns, keep)) {
      m.castShadow = true;
      proxyCasters.push(m);
      group.add(m);
    }
  }

  // MAP-GAPS A12: the far forest out to the camera's reach at max zoom, one instanced tree (Low keeps half)
  const farB = new ModelBuilder();
  farB.cyl(0.25, 0.35, 1.6, 0x8a5a3a, { at: [0, 0.8, 0] }, 6);
  farB.add(new THREE.IcosahedronGeometry(1.5, 0), 0x55a055, { at: [0, 2.3, 0] });
  farB.add(new THREE.IcosahedronGeometry(1.05, 0), 0x7cc46e, { at: [0.2, 3.2, -0.1] });
  const farGeo = keep(farB.build());
  // PERF-IOS P2-1: the 1,231 trees in FAR_CHUNK m square chunks, one InstancedMesh each with its own bounding sphere,
  // so three.js frustum-culls the chunks the fixed camera cannot see (one mesh over the whole map was never culled:
  // 78.8k triangles, a quarter of the frame). Each chunk lists its Low trees first, so `setDetail` keeps half.
  const FAR_CHUNK = 24;
  const far = outerTrees().map((t, i) => ({ ...t, i }));
  const chunks = new Map<string, typeof far>();
  for (const t of far) {
    const k = `${Math.floor(t.x / FAR_CHUNK)},${Math.floor(t.y / FAR_CHUNK)}`;
    let c = chunks.get(k);
    if (!c) chunks.set(k, (c = []));
    c.push(t);
  }
  const fm = new THREE.Matrix4();
  const fq = new THREE.Quaternion();
  const fv = new THREE.Vector3();
  const fs = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const tc = new THREE.Color();
  // PERF-IOS §8 Track B: an own material for the instanced far forest, so it does not flip `sceneryMat`'s program
  // variant (instancing on / off) against the merged meshes twice a frame.
  const farMat = keep(sceneryMat.clone());
  const farMeshes: { mesh: THREE.InstancedMesh; all: number; low: number }[] = [];
  for (const list of chunks.values()) {
    list.sort((a, b) => Number(b.low) - Number(a.low) || a.i - b.i);
    const mesh = new THREE.InstancedMesh(farGeo, farMat, list.length);
    mesh.name = 'far-forest';
    list.forEach((t, j) => {
      const i = t.i;
      fq.setFromAxisAngle(up, (t.x * 7.1 + t.y * 3.3) % (Math.PI * 2));
      fm.compose(fv.set(t.x, 0, -t.y), fq, fs.set(t.s, t.s * (0.9 + ((i * 37) % 10) / 40), t.s));
      mesh.setMatrixAt(j, fm);
      const tint = 0.82 + ((i * 53) % 17) / 90;
      mesh.setColorAt(j, tc.setRGB(tint, tint, tint));
    });
    mesh.computeBoundingSphere();
    mesh.receiveShadow = true;
    group.add(mesh);
    farMeshes.push({ mesh, all: list.length, low: list.filter((t) => t.low).length });
  }

  const hedge = new ModelBuilder();
  for (const h of hedgeSpots()) {
    if (h.kind === 'rock') hedge.add(new THREE.DodecahedronGeometry(h.r, 0), h.color, { at: [h.x, h.r * 0.45, -h.y], rot: [h.x, h.y, h.r * 7], scale: [1, 0.7, 1] });
    else if (h.r < 0.2) hedge.sphere(h.r, h.color, { at: [h.x, 0.95, -h.y] }, 5);
    else hedge.sphere(h.r / 1.2, h.color, { at: [h.x, 0.4, -h.y], scale: [1.2, 0.8, 1.2] }, 8);
  }
  // MAP-GAPS A13: a low stone wall arcs behind each fountain basin where the hedge stops
  for (const st of fountainWall()) hedge.add(new THREE.DodecahedronGeometry(st.r, 0), st.color, { at: [st.x, st.r * 0.55, -st.y], rot: [st.x, st.y, st.r * 5], scale: [1, 0.75, 1] });
  // MAP-GAPS A1: low pebbles round the rat camps (under 0.25 m, outside the clearing, off the footpaths): the old
  // loop asked for rocks on unwalkable ground only, of which there is none there, and placed 0 of 400
  for (const k of campPebbles()) hedge.add(new THREE.DodecahedronGeometry(k.r, 0), 0xb9b2a6, { at: [k.x, 0, -k.y], rot: [k.x, k.y, k.r * 9], scale: [1, k.h / k.r, 1] });
  addMerged(hedge, 'hedge', false);

  // gate barriers (up until the gates open): a glowing line on the ground across the walkable part of each base
  // exit. Trailer review: a full-height vertical plane spanning the whole map read as a thin yellow light stripe
  // running top to bottom through the plaza (the gameplay camera sees it edge-on).
  const gateMat = keep(new THREE.MeshBasicMaterial({ color: 0xffe14a, transparent: true, opacity: 0.35, depthWrite: false, toneMapped: false }));
  const gates: THREE.Mesh[] = [];
  for (const x of [MAP.barrierX / 1000, W - MAP.barrierX / 1000]) {
    for (const [y0, y1] of gateSpans(x)) {
      const geo = keep(new THREE.PlaneGeometry(0.7, y1 - y0));
      geo.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(geo, gateMat);
      m.name = 'gate-barrier';
      m.position.set(x, 0.05, -(y0 + y1) / 2);
      m.renderOrder = 2;
      gates.push(m);
      group.add(m);
    }
  }

  let time = 0;
  return {
    group,
    gateStrip: true,
    update(frame, dt, lens) {
      time += dt;
      // the canopy cut: every live hero (up to CANOPY_CUT.slots) seen from the lens
      const see = forestU.uSee.value;
      let n = 0;
      if (frame && lens) {
        forestU.uLens.value.copy(lens);
        for (const e of frame.entities) {
          if (n >= see.length) break;
          if (e.kind !== 'hero' || e.state === 'dead') continue;
          see[n++].set(toX(e.fx), 1.0, toZ(e.fy), 1);
        }
      }
      for (let i = n; i < see.length; i++) see[i].w = 0;
      // MAP-GAPS A20: ease each bush's cleared tint toward whether an ally stands in it
      if (frame) clearedBushes(frame.entities, myTeam, cleared);
      const on = bushU.uBushOn.value;
      for (let i = 0; i < BUSH_COUNT; i++) on[i] += ((cleared[i] ? 1 : 0) - on[i]) * Math.min(1, dt * 6);
      riverU.uTime.value = time;
      const up = !frame || frame.latest.clock.phase === 'gate';
      gateMat.opacity = up ? 0.5 + Math.sin(time * 4) * 0.12 : Math.max(0, gateMat.opacity - dt * 2);
      for (const g of gates) g.visible = this.gateStrip && gateMat.opacity > 0.01;
    },
    setShadows(on) {
      // PERF-IOS §8 Track A: on a phone the scenery (forest, walls, props, banners: ~39k triangles, merged meshes
      // the shadow camera cannot cull) does not cast; units and structures still do, into a 512² map
      const cast = on && !phoneScenery;
      for (const m of shadowCasters) m.castShadow = cast;
      for (const m of proxyCasters) m.castShadow = on;
    },
    setTeam(team) {
      myTeam = team;
    },
    clearedTint() {
      return bushU.uBushOn.value.slice();
    },
    setDetail(low) {
      for (const f of farMeshes) f.mesh.count = low ? f.low : f.all;
    },
    setStyleSwap(on) {
      plazaStyle(on);
      banners.visible = !on;
      bannersSwapped.visible = on;
      if (on === texSwap || !tex) return;
      texSwap = on;
      tex.dispose();
      tex = paintGround(on);
      groundMat.map = tex;
      groundMat.needsUpdate = true;
    },
    dispose() {
      tex?.dispose();
      for (const d of disposables) d.dispose();
    },
  };
}
