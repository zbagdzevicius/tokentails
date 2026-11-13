/**
 * Hearthwood Divide (sim v19, docs/plans/moba/MAP-5V5.md §8.3): the 5v5 Classic map, drawn from `mapInfo('hearthwood')`
 * (never from data/map.ts directly). An autumn wood at dusk, original art: a painted ground (copper and amber leaf
 * litter, three dirt lanes, the Yarn Road's red thread, the Gutterway's stone channel, sand banks, stone plazas, camp
 * clearings and the two river pits), an animated milky-blue river with lily pads across the diagonal, plank bridges
 * where the lanes cross it, lantern posts along Yarn Road, autumn bushes, rock outcrops crowned with trees where the
 * nav grid blocks, Captain Grizzlechop's sunken rat-pirate wreck and the Great Pudding's mossy jelly-mould hollow,
 * base banners, and an instanced autumn forest round the map. Static scenery only (units and structures have their
 * own views). Render only.
 *
 * Sim v22 (docs/plans/moba/MAP-5V5-STANDARD.md §11, §12): the carved jungle. A dark forest floor under every blocked
 * cell, warm dirt paths along the corridors, clearings and the pits' moats painted into the ground texture (no extra
 * draws); edge trees on the forest's silhouette in the far forest's instanced chunks (Low keeps half); canopy blobs
 * over the deep forest (one instanced draw); and the landmarks: the Glow Log (Beetle Log), the Apple Den (Prickle
 * Hollow), the Lantern Oak (Crow Roost) and the Reed Steps where a jungle path meets the river.
 */
import * as THREE from 'three';
import type { MapInfo } from '../../sim/map/info';
import type { ViewFrame } from '../interp';
import { toX, toZ } from '../coords';
import { TEAM } from '../palette';
import { clearedBushes } from '../bushClear';
import { ModelBuilder } from './rig';
import type { MapView } from './mapView';
import { CANOPY_CUT, BUSH_CUT } from './mapView';

/** Seeded LCG so the scenery is the same every load (render only). */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Ground texture resolution (px per metre). 128 m × 16 = 2048 px. */
export const HW_PX_PER_M = 16;
/** How far past the map edge the autumn forest is dressed (m). */
export const HW_DRESS = 44;

/** The Hearthwood palette: dusk-lit autumn (all render only). */
export const HW = Object.freeze({
  grass: '#a9a65c',
  grassHi: 'rgba(214,196,110,0.22)',
  grassLo: 'rgba(120,120,58,0.20)',
  litter: ['rgba(214,122,52,0.55)', 'rgba(186,78,44,0.5)', 'rgba(230,176,72,0.55)', 'rgba(150,92,48,0.45)'],
  lane: '#d6b07a',
  laneEdge: 'rgba(122,84,48,0.55)',
  sand: '#e2cf9c',
  plaza0: '#efe2c9',
  plaza1: '#dcc39a',
  clearing: 'rgba(196,154,98,0.65)',
  thread: 'rgba(214,60,88,0.75)',
  gutter: 'rgba(120,132,150,0.75)',
  wreck: '#6b5440',
  moss: '#6f9a4e',
  outer: 0x8f8a4c,
  trunk: 0x6e4a2e,
  leaves: [0xd2702e, 0xb8482c, 0xe0a73c, 0xc98a2e, 0x9c5a2a],
  bush: [0xb3562c, 0xc9742e, 0x9b4426],
  berry: 0xb98cff,
  rock: [0x9d958a, 0xaaa294, 0x8c857b, 0xb3ab9c],
  /** Sim v22: the carved forest floor, the jungle paths, the pit moats, the canopy, landmark lights. */
  forest: '#5d5a2c',
  forestLo: '#535026',
  path: 'rgba(206,166,108,0.7)',
  moat: 'rgba(143,184,200,0.55)',
  canopy: [0x9c5a2a, 0xb8482c, 0xc98a2e, 0x7f6a2c],
  crowLamp: 0x7fc4ff,
  beetle: 0x8dff7a,
  apple: 0xd8342c,
});

type Pt = readonly [number, number];

/** Lane centre polylines (m), team 0's minion path for each lane (core to core). */
export function hwLanes(info: MapInfo): { id: string; pts: Pt[] }[] {
  return info.lanes.map((l) => {
    const [xs, ys] = l.path[0];
    const pts: Pt[] = [];
    for (let i = 0; i < xs.length; i++) pts.push([xs[i] / 1000, ys[i] / 1000]);
    return { id: l.id, pts };
  });
}

/** True when the nav cell under (x, y) m is walkable static ground. */
export function hwWalkable(info: MapInfo, x: number, y: number): boolean {
  const i = Math.floor((x * 1000) / info.navCell);
  const j = Math.floor((y * 1000) / info.navCell);
  if (i < 0 || j < 0 || i >= info.nx || j >= info.ny) return false;
  return info.playable[j * info.nx + i] === 1;
}

/** The two river pits (m): centre and the kind. */
function pits(info: MapInfo): { kind: 'grizzlechop' | 'pudding'; x: number; y: number }[] {
  return info.objectives.map((o) => ({ kind: o.kind, x: o.x / 1000, y: o.y / 1000 }));
}

/** Which pit a wall rect (m) belongs to, or null for a jungle rock. */
export function wallPit(info: MapInfo, r: readonly [number, number, number, number]): 'grizzlechop' | 'pudding' | null {
  const cx = (r[0] + r[2]) / 2000;
  const cy = (r[1] + r[3]) / 2000;
  for (const p of pits(info)) if (Math.hypot(cx - p.x, cy - p.y) < 11) return p.kind;
  return null;
}

/** Lantern posts along Yarn Road (m): both shoulders, every 9 m, clear of towers, the river and the plazas. */
export function hwLanterns(info: MapInfo): { x: number; y: number }[] {
  const yarn = hwLanes(info).find((l) => l.id === 'yarn');
  if (!yarn) return [];
  const out: { x: number; y: number }[] = [];
  const [a, b] = [yarn.pts[0], yarn.pts[yarn.pts.length - 1]];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const ux = (b[0] - a[0]) / len;
  const uy = (b[1] - a[1]) / len;
  // sim v22: 5 m (the shoulder; past it the carved forest starts)
  const off = 5.0;
  const W = info.width / 1000;
  for (let t = 18; t < len - 18; t += 9) {
    const cx = a[0] + ux * t;
    const cy = a[1] + uy * t;
    if (Math.abs(cx + cy - W) < 10) continue;
    if (info.towers.some((tw) => Math.hypot(tw.x / 1000 - cx, tw.y / 1000 - cy) < 5)) continue;
    for (const s of [-1, 1]) {
      const x = cx - uy * off * s;
      const y = cy + ux * off * s;
      if (hwWalkable(info, x, y)) out.push({ x, y });
    }
  }
  return out;
}

function paintGround(info: MapInfo, swap: boolean): THREE.Texture {
  const W = info.width / 1000;
  const H = info.height / 1000;
  const S = HW_PX_PER_M;
  const c = document.createElement('canvas');
  c.width = Math.round(W * S);
  c.height = Math.round(H * S);
  const g = c.getContext('2d')!;
  const px = (x: number): number => x * S;
  const py = (y: number): number => (H - y) * S;
  const rnd = lcg(71);
  g.fillStyle = HW.grass;
  g.fillRect(0, 0, c.width, c.height);
  // soft light and shade blobs
  for (let i = 0; i < 420; i++) {
    g.fillStyle = rnd() < 0.5 ? HW.grassHi : HW.grassLo;
    g.beginPath();
    g.ellipse(rnd() * c.width, rnd() * c.height, (1 + rnd() * 5) * S, (1 + rnd() * 3) * S, rnd() * 3, 0, Math.PI * 2);
    g.fill();
  }
  // leaf litter: denser in the jungle, away from the lanes
  const lanes = hwLanes(info);
  const laneD = (x: number, y: number): number => {
    let best = Infinity;
    for (const l of lanes) {
      const all = [...l.pts];
      for (let i = 0; i + 1 < all.length; i++) {
        const [ax, ay] = all[i];
        const [bx, by] = all[i + 1];
        const dx = bx - ax;
        const dy = by - ay;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
        best = Math.min(best, Math.hypot(x - (ax + dx * t), y - (ay + dy * t)));
      }
    }
    return best;
  };
  for (let i = 0; i < 9000; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    if (laneD(x, y) < 4.6 && rnd() < 0.85) continue;
    g.fillStyle = HW.litter[(rnd() * HW.litter.length) | 0];
    g.save();
    g.translate(px(x), py(y));
    g.rotate(rnd() * Math.PI * 2);
    const l = (0.18 + rnd() * 0.22) * S;
    g.beginPath();
    g.ellipse(0, 0, l, l * 0.45, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  // the river's sand banks (the water is its own mesh)
  const sum = (x: number, y: number): number => x + y - W;
  g.save();
  g.fillStyle = HW.sand;
  g.beginPath();
  const bank = 7.071 + 1.6;
  g.moveTo(px(0), py(W - bank));
  g.lineTo(px(W - bank), py(0));
  g.lineTo(px(W + bank), py(0));
  g.lineTo(px(0), py(W + bank));
  g.closePath();
  g.fill();
  g.restore();
  void sum;
  // lanes: an edged dirt band, then each lane's own mark
  const laneW = 8;
  const stroke = (pts: Pt[], w: number, style: string, dash?: number[]): void => {
    g.save();
    g.strokeStyle = style;
    g.lineWidth = w * S;
    g.lineJoin = 'round';
    g.lineCap = 'round';
    if (dash) g.setLineDash(dash.map((d) => d * S));
    g.beginPath();
    pts.forEach(([x, y], i) => (i === 0 ? g.moveTo(px(x), py(y)) : g.lineTo(px(x), py(y))));
    g.stroke();
    g.restore();
  };
  for (const l of lanes) stroke(l.pts, laneW + 0.8, HW.laneEdge);
  for (const l of lanes) stroke(l.pts, laneW, HW.lane);
  // wheel ruts and pebbles on the dirt
  for (const l of lanes) {
    stroke(l.pts, 0.35, 'rgba(150,108,66,0.35)', [2.2, 1.4]);
    for (let i = 0; i + 1 < l.pts.length; i++) {
      const [ax, ay] = l.pts[i];
      const [bx, by] = l.pts[i + 1];
      const n = Math.round(Math.hypot(bx - ax, by - ay) * 1.4);
      for (let k = 0; k < n; k++) {
        const t = rnd();
        const ox = (rnd() - 0.5) * laneW * 0.9;
        const oy = (rnd() - 0.5) * laneW * 0.9;
        g.fillStyle = rnd() < 0.5 ? 'rgba(168,134,92,0.6)' : 'rgba(236,212,170,0.6)';
        g.beginPath();
        g.arc(px(ax + (bx - ax) * t + ox), py(ay + (by - ay) * t + oy), (0.08 + rnd() * 0.1) * S, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  for (const l of lanes) {
    if (l.id === 'yarn') stroke(l.pts, 0.22, HW.thread, [1.6, 0.9]);
    if (l.id === 'gutter' || l.id === 'fence') {
      // Gutterway's stone channel, Fenceline's picket shadow line (both on the outer shoulder)
      const style = l.id === 'gutter' ? HW.gutter : 'rgba(110,74,46,0.55)';
      stroke(l.pts, 0.45, style, l.id === 'gutter' ? undefined : [0.25, 0.6]);
    }
  }
  // Sim v22: the carved forest's floor (dark moss under the trees), the jungle paths and the clearings
  if (hwCarved(info)) {
    const n = info.nx;
    for (let j = 0; j < info.ny; j++) {
      for (let i = 0; i < n; i++) {
        if (info.playable[j * n + i] === 1) continue;
        g.fillStyle = (i * 7 + j * 13) % 5 === 0 ? HW.forestLo : HW.forest;
        g.fillRect(px(i) - 0.5, py(j + 1) - 0.5, S + 1, S + 1);
      }
    }
    for (const c of info.corridors) stroke([[c.ax / 1000, c.ay / 1000], [c.bx / 1000, c.by / 1000]], Math.max(1.6, (c.half / 1000) * 0.9), HW.path);
    for (const c of info.clearings) {
      g.fillStyle = HW.clearing;
      g.beginPath();
      g.arc(px(c.x / 1000), py(c.y / 1000), (c.r / 1000 - 0.6) * S, 0, Math.PI * 2);
      g.fill();
    }
    // the pits' moats: a shallow ring of water round each island
    for (const p of info.pits) {
      g.strokeStyle = HW.moat;
      g.lineWidth = 2.2 * S;
      g.beginPath();
      g.arc(px(p.x / 1000), py(p.y / 1000), (p.r / 1000 - 2) * S, 0, Math.PI * 2);
      g.stroke();
    }
  }
  // base plazas (fountain and core) and camp clearings
  const plaza = (team: 0 | 1): string => ((swap ? 1 - team : team) === 0 ? HW.plaza0 : HW.plaza1);
  for (const f of info.fountains) {
    g.fillStyle = plaza(f.team);
    g.beginPath();
    g.arc(px(f.x / 1000), py(f.y / 1000), (f.radius / 1000 + 3.4) * S, 0, Math.PI * 2);
    g.fill();
  }
  for (const k of info.cores) {
    g.fillStyle = plaza(k.team);
    g.beginPath();
    g.arc(px(k.x / 1000), py(k.y / 1000), 6.4 * S, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(120,96,64,0.45)';
    g.lineWidth = 0.25 * S;
    g.stroke();
  }
  for (const cp of hwCarved(info) ? [] : info.camps) {
    g.fillStyle = HW.clearing;
    g.beginPath();
    g.ellipse(px(cp.x / 1000), py(cp.y / 1000), 4.2 * S, 3.6 * S, 0.6, 0, Math.PI * 2);
    g.fill();
  }
  // the pits: wet planks for the wreck, moss for the jelly-mould hollow
  for (const p of pits(info)) {
    const grd = g.createRadialGradient(px(p.x), py(p.y), 0, px(p.x), py(p.y), 8.5 * S);
    if (p.kind === 'grizzlechop') {
      grd.addColorStop(0, '#5a4636');
      grd.addColorStop(0.7, HW.wreck);
      grd.addColorStop(1, 'rgba(107,84,64,0)');
    } else {
      grd.addColorStop(0, '#89b25e');
      grd.addColorStop(0.7, HW.moss);
      grd.addColorStop(1, 'rgba(111,154,78,0)');
    }
    g.fillStyle = grd;
    g.beginPath();
    g.arc(px(p.x), py(p.y), 8.5 * S, 0, Math.PI * 2);
    g.fill();
    if (p.kind === 'grizzlechop') {
      g.strokeStyle = 'rgba(60,44,32,0.6)';
      g.lineWidth = 0.08 * S;
      for (let k = -6; k <= 6; k += 1.1) {
        g.beginPath();
        g.moveTo(px(p.x - 6), py(p.y + k));
        g.lineTo(px(p.x + 6), py(p.y + k));
        g.stroke();
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

const RIVER_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vW;
void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
// milky blue at dusk, with an amber glint (the river runs along the diagonal: uv.x across, uv.y along)
const RIVER_FRAG = /* glsl */ `
uniform float uTime;
uniform float uLen;
varying vec2 vUv;
varying vec3 vW;
void main(){
  float edge = min(vUv.x, 1.0 - vUv.x);
  float along = vUv.y * uLen;
  float w1 = sin(along * 0.8 + uTime * 1.4 + sin(vUv.x * 9.0) * 1.2);
  float w2 = sin(along * 2.1 - uTime * 2.0 + vUv.x * 4.0);
  vec3 deep = vec3(0.47, 0.64, 0.78);
  vec3 lite = vec3(0.74, 0.86, 0.93);
  vec3 col = mix(deep, lite, smoothstep(0.1, 0.5, edge) * 0.25 + 0.35 + 0.16 * w1 + 0.07 * w2);
  float glint = smoothstep(0.94, 1.0, sin(along * 2.7 + uTime * 2.6) * sin(vUv.x * 21.0 - uTime * 1.1));
  col += glint * vec3(0.45, 0.32, 0.12);
  float foam = smoothstep(0.08, 0.0, edge);
  col = mix(col, vec3(0.98, 0.96, 0.9), foam * 0.8);
  float fade = smoothstep(0.0, 0.06, vUv.y) * smoothstep(1.0, 0.94, vUv.y);
  gl_FragColor = vec4(col, smoothstep(0.0, 0.03, edge) * fade);
}`;

/** The canopy cut (render only): canopies between the lens and a hero are dithered away, as on Crossing. */
function cutMaterial(u: { uLens: { value: THREE.Vector3 }; uSee: { value: THREE.Vector4[] } }, minY: number, key: string): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
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
}

/** The far forest round the map (m): a jittered 3.4 m grid, thinning with the distance; `low` = the Low tier's half. */
export function hwOuterTrees(info: MapInfo): { x: number; y: number; s: number; low: boolean }[] {
  const W = info.width / 1000;
  const H = info.height / 1000;
  const rnd = lcg(91);
  const out: { x: number; y: number; s: number; low: boolean }[] = [];
  for (let x = -HW_DRESS; x <= W + HW_DRESS; x += 3.4) {
    for (let y = -HW_DRESS; y <= H + HW_DRESS; y += 3.4) {
      const px = x + (rnd() - 0.5) * 2.4;
      const py = y + (rnd() - 0.5) * 2.4;
      const keep = rnd();
      const s = 0.85 + rnd() * 0.8;
      const low = rnd() < 0.5;
      const d = Math.hypot(Math.max(-px, px - W, 0), Math.max(-py, py - H, 0));
      if (d < 1.2) continue;
      // the river runs out under the trees at the two far corners
      if (Math.abs(px + py - W) < 9 && d < 14) continue;
      if (keep > Math.max(0.4, 1 - d / 60)) continue;
      out.push({ x: px, y: py, s, low });
    }
  }
  return out;
}

/** Sim v22: is the map carved (a forest with clearings and corridors, MAP-5V5-STANDARD.md §5)? */
export const hwCarved = (info: MapInfo): boolean => info.clearings.length > 0;

/** Sim v22: the nav cell (i, j) is forest: blocked, inside the map, and not one of the pit rings' rocks. */
function forestCell(info: MapInfo, i: number, j: number): boolean {
  if (i < 0 || j < 0 || i >= info.nx || j >= info.ny || info.playable[j * info.nx + i] === 1) return false;
  const x = i + 0.5;
  const y = j + 0.5;
  return !info.objectives.some((o) => Math.hypot(x - o.x / 1000, y - o.y / 1000) < 10.5);
}

/**
 * Sim v22 (MAP-5V5-STANDARD.md §12): the carved forest's trees (m), edge cells only (forest cells touching walkable
 * ground: the silhouette), spaced about 1.9 m; `low` marks the half the Low tier keeps. Deterministic.
 */
export function hwForestTrees(info: MapInfo): { x: number; y: number; s: number; low: boolean }[] {
  if (!hwCarved(info)) return [];
  const rnd = lcg(57);
  const out: { x: number; y: number; s: number; low: boolean }[] = [];
  const taken = new Uint8Array(info.nx * info.ny);
  for (let j = 0; j < info.ny; j++) {
    for (let i = 0; i < info.nx; i++) {
      if (!forestCell(info, i, j)) continue;
      let edge = false;
      for (let dj = -1; dj <= 1 && !edge; dj++) for (let di = -1; di <= 1; di++) if (hwWalkable(info, i + di + 0.5, j + dj + 0.5)) edge = true;
      if (!edge) continue;
      let near = false;
      for (let dj = -1; dj <= 1 && !near; dj++) for (let di = -1; di <= 1; di++) if (taken[(j + dj) * info.nx + i + di] === 1) near = true;
      if (near) continue;
      taken[j * info.nx + i] = 1;
      out.push({ x: i + 0.3 + rnd() * 0.4, y: j + 0.3 + rnd() * 0.4, s: 0.8 + rnd() * 0.45, low: rnd() < 0.5 });
    }
  }
  return out;
}

/** Sim v22: canopy blobs (m) over the deep forest, one per 4 m block that is all forest. */
export function hwCanopy(info: MapInfo): { x: number; y: number; s: number }[] {
  if (!hwCarved(info)) return [];
  const rnd = lcg(61);
  const out: { x: number; y: number; s: number }[] = [];
  for (let j = 0; j + 4 <= info.ny; j += 4) {
    for (let i = 0; i + 4 <= info.nx; i += 4) {
      let all = true;
      for (let b = 0; b < 4 && all; b++) for (let a = 0; a < 4; a++) if (!forestCell(info, i + a, j + b)) all = false;
      if (all) out.push({ x: i + 1.6 + rnd() * 0.8, y: j + 1.6 + rnd() * 0.8, s: 0.9 + rnd() * 0.3 });
    }
  }
  return out;
}

/** Sim v22: where a jungle corridor meets the river band (the Reed Steps), each once (m). */
export function hwReedSteps(info: MapInfo): { x: number; y: number }[] {
  const W = info.width / 1000;
  const b = info.river.b / 1000 / Math.SQRT2 + 1.5;
  const out: { x: number; y: number }[] = [];
  for (const c of info.corridors) {
    for (const [x, y] of [
      [c.ax / 1000, c.ay / 1000],
      [c.bx / 1000, c.by / 1000],
    ] as const) {
      if (Math.abs(x + y - W) > b * 2.2) continue;
      if (out.some((p) => Math.hypot(p.x - x, p.y - y) < 3)) continue;
      out.push({ x, y });
    }
  }
  return out;
}

export function createHearthwoodView(info: MapInfo): MapView {
  const W = info.width / 1000;
  const H = info.height / 1000;
  const group = new THREE.Group();
  group.name = 'map';
  group.userData.map = info.id;
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T): T => {
    disposables.push(x);
    return x;
  };
  const shadowCasters: THREE.Object3D[] = [];
  const rnd = lcg(13);
  const sceneryMat = keep(new THREE.MeshLambertMaterial({ vertexColors: true }));
  const addMerged = (b: ModelBuilder, name: string, cast = true, mat: THREE.Material = sceneryMat): THREE.Mesh => {
    // sim v22's standard Hearthwood has no pits (and may have no tree outcrop): an empty builder is an empty, hidden
    // mesh, not a merge of nothing (that threw in mergeGeometries and the Classic match never started)
    if (b.empty) {
      const none = new THREE.Mesh(keep(new THREE.BufferGeometry()), mat);
      none.name = name;
      none.visible = false;
      return none;
    }
    const m = new THREE.Mesh(keep(b.build()), mat);
    m.name = name;
    m.castShadow = cast;
    m.receiveShadow = true;
    if (cast) shadowCasters.push(m);
    group.add(m);
    return m;
  };

  // the ground past the map: dusk grass under the forest
  const outerGeo = keep(new THREE.PlaneGeometry(W + 2 * HW_DRESS + 40, H + 2 * HW_DRESS + 40));
  outerGeo.rotateX(-Math.PI / 2);
  const outer = new THREE.Mesh(outerGeo, keep(new THREE.MeshLambertMaterial({ color: HW.outer })));
  outer.position.set(W / 2, -0.02, -H / 2);
  outer.receiveShadow = true;
  group.add(outer);

  // the painted playfield
  let tex = typeof document !== 'undefined' ? paintGround(info, false) : null;
  let texSwap = false;
  const groundGeo = keep(new THREE.PlaneGeometry(W, H));
  groundGeo.rotateX(-Math.PI / 2);
  const groundMat = keep(new THREE.MeshLambertMaterial({ color: tex ? 0xffffff : 0xa9a65c, map: tex }));
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.position.set(W / 2, 0, -H / 2);
  ground.receiveShadow = true;
  ground.name = 'ground';
  group.add(ground);

  // the river: one strip along the diagonal x + y = W (10 m wide), past both far corners
  const half = (info.river.b / 1000) / Math.SQRT2;
  const len = Math.hypot(W, H) + 24;
  const riverU = { uTime: { value: 0 }, uLen: { value: len } };
  const riverGeo = keep(new THREE.PlaneGeometry(half * 2, len, 1, 1));
  riverGeo.rotateX(-Math.PI / 2);
  const river = new THREE.Mesh(riverGeo, keep(new THREE.ShaderMaterial({ uniforms: riverU, vertexShader: RIVER_VERT, fragmentShader: RIVER_FRAG, transparent: true, depthWrite: false })));
  // local +Z (the strip's length) runs along the river: map direction (1, −1), three.js (1, 0, 1)
  river.rotation.y = Math.PI / 4;
  river.position.set(W / 2, 0.02, -H / 2);
  river.renderOrder = 1;
  river.name = 'river';
  group.add(river);

  const props = new ModelBuilder();
  // lily pads and reeds on the river (off the lanes' bridges)
  const lanes = hwLanes(info);
  const crossings: { x: number; y: number }[] = [];
  for (const l of lanes) {
    for (let i = 0; i + 1 < l.pts.length; i++) {
      const [ax, ay] = l.pts[i];
      const [bx, by] = l.pts[i + 1];
      const sa = ax + ay - W;
      const sb = bx + by - W;
      if (sa === 0) crossings.push({ x: ax, y: ay });
      else if (sa * sb < 0) {
        const t = sa / (sa - sb);
        crossings.push({ x: ax + (bx - ax) * t, y: ay + (by - ay) * t });
      }
    }
    const [ex, ey] = l.pts[l.pts.length - 1];
    if (ex + ey === W) crossings.push({ x: ex, y: ey });
  }
  const nearBridge = (x: number, y: number): boolean => crossings.some((c) => Math.hypot(c.x - x, c.y - y) < 7.5);
  for (let i = 0; i < 70; i++) {
    const t = rnd();
    const x = t * W;
    const y = W - x + (rnd() - 0.5) * half * 1.4;
    if (nearBridge(x, y) || x < 4 || y < 4 || x > W - 4 || y > H - 4) continue;
    const r = 0.35 + rnd() * 0.35;
    props.cyl(r, r, 0.02, rnd() < 0.5 ? 0x6f9a4e : 0x86ad5a, { at: [x, 0.04, -y] }, 10);
    if (rnd() < 0.3) props.sphere(0.12, rnd() < 0.5 ? 0xffb3cd : 0xfff3e3, { at: [x + 0.1, 0.1, -y] }, 6);
  }
  // plank bridges where the lanes cross the river (decks flush with the water)
  const deck = new ModelBuilder();
  for (const c of crossings) {
    const planks = 14;
    const span = half * 2 + 2.4;
    for (let i = 0; i < planks; i++) {
      const u = -span / 2 + (i + 0.5) * (span / planks);
      // along the river's normal (1, 1)/√2 in map space; the deck is 9 m wide along the river
      const x = c.x + u / Math.SQRT2;
      const y = c.y + u / Math.SQRT2;
      deck.box((span / planks) * 0.92, 0.01, 9.4, i % 2 ? 0xa06a40 : 0xb27a4c, { at: [x, 0.03, -y], rot: [0, Math.PI / 4, 0] });
    }
    for (const s of [-1, 1]) {
      for (const e of [-1, 1]) {
        const u = (e * span) / 2;
        const v = s * 4.9;
        const x = c.x + u / Math.SQRT2 + v / Math.SQRT2;
        const y = c.y + u / Math.SQRT2 - v / Math.SQRT2;
        props.cyl(0.14, 0.17, 0.8, 0x7a5133, { at: [x, 0.4, -y] }, 6);
        props.sphere(0.2, 0xffc76b, { at: [x, 0.86, -y] }, 8);
      }
    }
  }
  const deckMat = keep(new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }));
  const deckMesh = new THREE.Mesh(keep(deck.build()), deckMat);
  deckMesh.name = 'bridge-decks';
  deckMesh.renderOrder = 2;
  deckMesh.receiveShadow = true;
  group.add(deckMesh);

  // lantern posts along Yarn Road (the warm globes glow at dusk)
  const lamps = new ModelBuilder();
  for (const p of hwLanterns(info)) {
    props.cyl(0.08, 0.11, 1.9, 0x4e3524, { at: [p.x, 0.95, -p.y] }, 6);
    props.box(0.5, 0.06, 0.06, 0x4e3524, { at: [p.x, 1.85, -p.y] });
    lamps.sphere(0.22, 0xffc76b, { at: [p.x + 0.22, 1.6, -p.y] }, 8);
  }
  // camp dressing: a few stones round each clearing (outside it, low)
  for (const cp of info.camps) {
    const cx = cp.x / 1000;
    const cy = cp.y / 1000;
    for (let k = 0; k < 7; k++) {
      const a = rnd() * Math.PI * 2;
      const d = 4.4 + rnd() * 0.8;
      const r = 0.12 + rnd() * 0.12;
      props.add(new THREE.DodecahedronGeometry(r, 0), 0xb9b2a6, { at: [cx + Math.cos(a) * d, r * 0.4, -(cy + Math.sin(a) * d)], rot: [a, k, 0], scale: [1, 0.6, 1] });
    }
    if (cp.kind === 'crow') {
      // the roost: a dead branch perch
      props.cyl(0.12, 0.18, 2.6, 0x5a4030, { at: [cx - 2.6, 1.3, -(cy + 2.6)], rot: [0.2, 0, -0.15] }, 6);
      props.cyl(0.07, 0.09, 1.4, 0x5a4030, { at: [cx - 2.2, 2.3, -(cy + 2.6)], rot: [0, 0, -1.0] }, 5);
    } else if (cp.kind === 'prickle') {
      // the hollow: a ring of fallen chestnut husks
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + 0.3;
        props.sphere(0.22, 0x8a5a2a, { at: [cx + Math.cos(a) * 3.6, 0.15, -(cy + Math.sin(a) * 3.6)], scale: [1, 0.7, 1] }, 6);
      }
    } else if (cp.kind === 'toad') {
      props.cyl(1.6, 1.6, 0.02, 0x8fb8c8, { at: [cx + 2.8, 0.03, -(cy - 1.6)] }, 16);
    } else if (cp.kind === 'beetle') {
      // the Glow Log (sim v22): a mossy hollow log with glowing green beetles
      props.cyl(0.55, 0.65, 3.2, 0x6e4a2e, { at: [cx + 2.2, 0.5, -(cy + 1.4)], rot: [0, 0.5, Math.PI / 2] }, 8);
      props.sphere(0.5, 0x5d7f3e, { at: [cx + 2.2, 1.0, -(cy + 1.4)], scale: [1.6, 0.35, 1] }, 6);
      for (let k = 0; k < 5; k++) lamps.sphere(0.09, HW.beetle, { at: [cx + 1.2 + k * 0.5, 0.95 + (k % 2) * 0.12, -(cy + 1.2 + (k % 3) * 0.2)] }, 6);
    }
    if (hwCarved(info) && cp.kind === 'prickle') {
      // the Apple Den (sim v22): a fallen log full of apples
      props.cyl(0.5, 0.6, 3.6, 0x7a5133, { at: [cx - 2.6, 0.45, -(cy - 2.2)], rot: [0, -0.4, Math.PI / 2] }, 8);
      for (let k = 0; k < 6; k++) props.sphere(0.2, HW.apple, { at: [cx - 3.6 + k * 0.4, 0.95, -(cy - 2.2 + (k % 2) * 0.25)] }, 6);
    } else if (hwCarved(info) && cp.kind === 'crow') {
      // the Lantern Oak (sim v22): blue lanterns and trinkets on the roost
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + 0.4;
        props.cyl(0.02, 0.02, 0.5, 0x3a2a20, { at: [cx - 2.6 + Math.cos(a) * 0.9, 2.55, -(cy + 2.6 + Math.sin(a) * 0.9)] }, 4);
        lamps.sphere(0.16, HW.crowLamp, { at: [cx - 2.6 + Math.cos(a) * 0.9, 2.25, -(cy + 2.6 + Math.sin(a) * 0.9)] }, 8);
      }
    }
  }
  // the Reed Steps (sim v22): stepping stones and reeds where a jungle path meets the river
  for (const r of hwReedSteps(info)) {
    for (let k = 0; k < 4; k++) {
      const a = rnd() * Math.PI * 2;
      const d = 0.8 + rnd() * 1.4;
      props.cyl(0.35, 0.4, 0.08, 0xb9b2a6, { at: [r.x + Math.cos(a) * d, 0.05, -(r.y + Math.sin(a) * d)] }, 8);
    }
    for (let k = 0; k < 9; k++) {
      const a = rnd() * Math.PI * 2;
      const d = 2.2 + rnd() * 1.2;
      const h = 0.9 + rnd() * 0.6;
      props.cyl(0.03, 0.04, h, 0x7d8f3e, { at: [r.x + Math.cos(a) * d, h / 2, -(r.y + Math.sin(a) * d)], rot: [(rnd() - 0.5) * 0.3, 0, (rnd() - 0.5) * 0.3] }, 4);
    }
  }

  // the warm lanterns, the Lantern Oaks' blue lights and the Glow Logs' beetles: one unlit mesh
  const lampMat = keep(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
  const lampMesh = new THREE.Mesh(keep(lamps.build()), lampMat);
  lampMesh.name = 'lanterns';
  group.add(lampMesh);

  // the pits: Grizzlechop's sunken rat-pirate wreck, the Great Pudding's jelly-mould hollow (on their pit walls)
  const wreck = new ModelBuilder();
  for (const p of pits(info)) {
    if (p.kind === 'grizzlechop') {
      // a broken mast and a torn sail lean over the back of the pit (the back wall faces away from the river axis)
      const bx = p.x + 5.5;
      const by = p.y - 5.5;
      wreck.cyl(0.25, 0.32, 7.5, 0x5a3e2a, { at: [bx, 3.2, -by], rot: [0.35, 0, 0.35] }, 8);
      wreck.box(3.2, 2.4, 0.05, 0xe8dcc0, { at: [bx - 0.6, 4.4, -by + 0.5], rot: [0.35, 0.6, 0.35] });
      wreck.box(1.2, 0.8, 0.06, 0x1f1a22, { at: [bx - 0.4, 6.1, -by + 0.9], rot: [0.35, 0.6, 0.35] });
      wreck.sphere(0.22, 0xfff3dc, { at: [bx - 0.4, 6.15, -by + 0.95] }, 8);
      // barrels and a treasure chest of cheese
      for (const [dx, dy] of [
        [-3.4, -1.2],
        [-2.8, 1.8],
        [2.2, 3.6],
      ] as const)
        wreck.cyl(0.42, 0.42, 0.9, 0x8a5a3a, { at: [p.x + dx, 0.45, -(p.y + dy)] }, 10);
      wreck.box(1.1, 0.6, 0.7, 0x6e4a2e, { at: [p.x + 3.2, 0.3, -(p.y - 2.2)], rot: [0, 0.7, 0] });
      wreck.box(0.8, 0.3, 0.5, 0xffd34d, { at: [p.x + 3.2, 0.7, -(p.y - 2.2)], rot: [0, 0.7, 0] });
    } else {
      // the jelly mould: a fluted copper rim half sunk round the hollow, and moss-capped stones
      for (let k = 0; k < 18; k++) {
        const a = (k / 18) * Math.PI * 2;
        const x = p.x + Math.cos(a) * 9.4;
        const y = p.y + Math.sin(a) * 9.4;
        if (hwWalkable(info, x, y) && Math.abs(x + y - W) < 6) continue;
        wreck.cyl(0.6, 0.75, 0.45, k % 2 ? 0xc77a3a : 0xd98c48, { at: [x, 0.2, -y] }, 8);
        if (k % 3 === 0) wreck.sphere(0.3, 0x5d7f3e, { at: [x, 0.48, -y], scale: [1, 0.35, 1] }, 6);
      }
      wreck.sphere(0.3, 0xe5484d, { at: [p.x - 4, 0.25, -(p.y + 3)] }, 8);
      wreck.sphere(0.3, 0xe5484d, { at: [p.x + 3.5, 0.25, -(p.y - 3.6)] }, 8);
    }
  }

  const forestU = { uLens: { value: new THREE.Vector3(0, 1e4, 0) }, uSee: { value: Array.from({ length: CANOPY_CUT.slots }, () => new THREE.Vector4()) } };

  // the rock walls the nav grid blocks: rocks filled to their edges, the big ones crowned with an autumn tree; the pit
  // walls are planks and hull ribs (Grizzlechop) or copper mould and moss (Pudding)
  const wallB = new ModelBuilder();
  const crown = new ModelBuilder();
  const wr = lcg(29);
  for (const r of info.walls) {
    const x0 = r[0] / 1000;
    const y0 = r[1] / 1000;
    const x1 = r[2] / 1000;
    const y1 = r[3] / 1000;
    const pit = wallPit(info, r);
    const step = 1.15;
    for (let x = x0 + 0.55; x < x1; x += step) {
      for (let y = y0 + 0.55; y < y1; y += step) {
        const jx = Math.min(x1 - 0.4, x + (wr() - 0.5) * 0.4);
        const jy = Math.min(y1 - 0.4, y + (wr() - 0.5) * 0.4);
        if (pit === 'grizzlechop') {
          wallB.box(1.2, 1.1 + wr() * 0.8, 1.2, wr() < 0.5 ? 0x6e4a2e : 0x5a3e2a, { at: [jx, 0.6, -jy], rot: [0, wr() * 0.6, (wr() - 0.5) * 0.25] });
        } else if (pit === 'pudding') {
          wallB.add(new THREE.DodecahedronGeometry(0.75, 0), HW.rock[(wr() * HW.rock.length) | 0], { at: [jx, 0.55, -jy], rot: [wr() * 3, wr() * 3, 0], scale: [1, 1.2, 1] });
          if (wr() < 0.35) wallB.sphere(0.45, 0x5d7f3e, { at: [jx, 1.15, -jy], scale: [1, 0.3, 1] }, 6);
        } else {
          const rr = 0.7 + wr() * 0.3;
          wallB.add(new THREE.DodecahedronGeometry(rr, 0), HW.rock[(wr() * HW.rock.length) | 0], { at: [jx, rr * 0.6, -jy], rot: [wr() * 3, wr() * 3, wr() * 3], scale: [1, 1.1 + wr() * 0.5, 1] });
        }
      }
    }
    if (pit === 'grizzlechop') {
      // hull ribs along the long side
      const long = x1 - x0 >= y1 - y0;
      const n = Math.max(2, Math.round((long ? x1 - x0 : y1 - y0) / 1.4));
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const x = long ? x0 + (x1 - x0) * t : (x0 + x1) / 2;
        const y = long ? (y0 + y1) / 2 : y0 + (y1 - y0) * t;
        wallB.torus(1.1, 0.12, 0x4e3524, { at: [x, 0.9, -y], rot: [0, long ? 0 : Math.PI / 2, 0] }, Math.PI);
      }
    } else if (!pit && (x1 - x0) * (y1 - y0) >= 16) {
      // an autumn tree on the outcrop
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      wallB.cyl(0.3, 0.42, 2.4, HW.trunk, { at: [cx, 1.6, -cy] }, 6);
      crown.add(new THREE.IcosahedronGeometry(1.9, 0), HW.leaves[(wr() * HW.leaves.length) | 0], { at: [cx, 3.6, -cy] });
      crown.add(new THREE.IcosahedronGeometry(1.3, 0), HW.leaves[(wr() * HW.leaves.length) | 0], { at: [cx + 0.3, 4.6, -cy - 0.2] });
    }
  }
  addMerged(wallB, 'walls', true, keep(cutMaterial(forestU, 0.6, 'pl-hw-wall-cut-v1')));
  addMerged(crown, 'wall-crowns', true, keep(cutMaterial(forestU, 1.2, 'pl-hw-crown-cut-v1')));
  addMerged(wreck, 'pits', true);

  // autumn Catnip Bushes (sim bush order, both sides) with the cleared tint of MAP-GAPS A20
  const bushes = info.bushes;
  const N = Math.max(1, bushes.length);
  const bushU = {
    uBushRect: { value: bushes.map((b) => new THREE.Vector4(b.x / 1000, -b.y / 1000, b.w / 2000 + 1.1, b.h / 2000 + 1.1)) },
    uBushOn: { value: new Array(N).fill(0) as number[] },
  };
  const bush = new ModelBuilder();
  for (const b of bushes) {
    const cxm = b.x / 1000;
    const cym = b.y / 1000;
    const hw = b.w / 2000;
    const hh = b.h / 2000;
    const leaves: [number, number, number, number][] = [];
    const n = Math.max(6, Math.round(hw * hh * 3.6));
    for (let i = 0; i < n; i++) {
      const x = cxm + (rnd() * 2 - 1) * hw * 0.85;
      const y = cym + (rnd() * 2 - 1) * hh * 0.88;
      const r = 0.7 + rnd() * 0.45;
      const h = 0.45 + rnd() * 0.25;
      leaves.push([x, h, y, r]);
      bush.sphere(r, HW.bush[(rnd() * HW.bush.length) | 0], { at: [x, h, -y], scale: [1, 0.85, 1] }, 9);
    }
    for (let i = 0; i < Math.round(n * 0.7); i++) {
      const [lx, lh, ly, lr] = leaves[(rnd() * leaves.length) | 0];
      const a = rnd() * Math.PI * 2;
      const el = 0.5 + rnd() * 0.6;
      const k = lr * 0.98;
      bush.sphere(0.12, HW.berry, { at: [lx + Math.cos(a) * Math.cos(el) * k, lh + Math.sin(el) * k * 0.85, -(ly + Math.sin(a) * Math.cos(el) * k)] }, 6);
    }
  }
  const bushMat = keep(new THREE.MeshLambertMaterial({ vertexColors: true }));
  bushMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, forestU, bushU);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vFW;\nuniform vec4 uSee[${CANOPY_CUT.slots}];\nuniform vec4 uBushRect[${N}];\nuniform float uBushOn[${N}];`)
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
      )
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
  float lit = 0.0;
  for (int i = 0; i < ${N}; i++) {
    vec2 q = abs(vFW.xz - uBushRect[i].xy) - uBushRect[i].zw;
    if (max(q.x, q.y) < 0.0) lit = max(lit, uBushOn[i]);
  }
  gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.rgb * 1.25 + vec3(0.08, 0.06, 0.02), lit * 0.55);`,
      );
  };
  bushMat.customProgramCacheKey = () => `pl-hw-bush-v1-${N}`;
  addMerged(bush, 'bushes', false, bushMat);

  // base banners: one mesh per style (round 2 swaps them when team 0 is the dogs)
  const bannerMesh = (swap: boolean): THREE.Mesh => {
    const b = new ModelBuilder();
    for (const core of info.cores) {
      const t = TEAM[(swap ? 1 - core.team : core.team) as 0 | 1];
      const cx = core.x / 1000;
      const cy = core.y / 1000;
      const s = core.team === 0 ? 1 : -1;
      for (const [dx, dy] of [
        [-7.5, 2.5],
        [2.5, -7.5],
        [-5.5, -5.5],
      ] as const) {
        const x = cx + dx * s;
        const z = -(cy + dy * s);
        b.cyl(0.09, 0.11, 4.2, 0xfff3e3, { at: [x, 2.1, z] }, 6);
        b.box(1.2, 1.7, 0.06, t.main, { at: [x + 0.6, 3.3, z] });
        b.box(1.2, 0.25, 0.07, t.second, { at: [x + 0.6, 2.4, z] });
        b.sphere(0.16, t.second, { at: [x, 4.3, z] }, 8);
      }
    }
    return addMerged(b, swap ? 'banners-swapped' : 'banners');
  };
  const banners = bannerMesh(false);
  const bannersSwapped = bannerMesh(true);
  bannersSwapped.visible = false;

  addMerged(props, 'props');

  // the autumn forest round the map: one instanced tree, in culled chunks (Low keeps half)
  const farB = new ModelBuilder();
  farB.cyl(0.25, 0.35, 1.6, HW.trunk, { at: [0, 0.8, 0] }, 6);
  farB.add(new THREE.IcosahedronGeometry(1.5, 0), 0xffffff, { at: [0, 2.3, 0] });
  farB.add(new THREE.IcosahedronGeometry(1.05, 0), 0xf2f2f2, { at: [0.2, 3.2, -0.1] });
  const farGeo = keep(farB.build());
  const farMat = keep(cutMaterial(forestU, CANOPY_CUT.minY, 'pl-hw-forest-cut-v1'));
  const CHUNK = 24;
  // Sim v22: the carved jungle's edge trees join the same instanced chunks (one draw a chunk)
  const far = [...hwOuterTrees(info), ...hwForestTrees(info)].map((t, i) => ({ ...t, i }));
  const chunks = new Map<string, typeof far>();
  for (const t of far) {
    const k = `${Math.floor(t.x / CHUNK)},${Math.floor(t.y / CHUNK)}`;
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
  const farMeshes: { mesh: THREE.InstancedMesh; all: number; low: number }[] = [];
  for (const list of chunks.values()) {
    list.sort((a, b) => Number(b.low) - Number(a.low) || a.i - b.i);
    const mesh = new THREE.InstancedMesh(farGeo, farMat, list.length);
    mesh.name = 'far-forest';
    list.forEach((t, j) => {
      fq.setFromAxisAngle(up, (t.x * 7.1 + t.y * 3.3) % (Math.PI * 2));
      fm.compose(fv.set(t.x, 0, -t.y), fq, fs.set(t.s, t.s * (0.9 + ((t.i * 37) % 10) / 40), t.s));
      mesh.setMatrixAt(j, fm);
      // the trunk keeps its brown through the tint (vertex colour × instance colour); leaves take the autumn colour
      mesh.setColorAt(j, tc.setHex(HW.leaves[(t.i * 7) % HW.leaves.length]).multiplyScalar(1.15));
    });
    mesh.computeBoundingSphere();
    mesh.receiveShadow = true;
    group.add(mesh);
    farMeshes.push({ mesh, all: list.length, low: list.filter((t) => t.low).length });
  }

  // Sim v22: canopy blobs over the deep forest (one instanced draw; kept on Low, MAP-5V5-STANDARD.md §12)
  const canopyList = hwCanopy(info);
  if (canopyList.length > 0) {
    const cb = new ModelBuilder();
    cb.add(new THREE.IcosahedronGeometry(2.6, 0), 0xffffff, { at: [0, 3.0, 0], scale: [1, 0.55, 1] });
    cb.add(new THREE.IcosahedronGeometry(1.8, 0), 0xf0f0f0, { at: [0.6, 3.7, -0.4], scale: [1, 0.6, 1] });
    const canopy = new THREE.InstancedMesh(keep(cb.build()), farMat, canopyList.length);
    canopy.name = 'canopy';
    canopyList.forEach((t, j) => {
      fq.setFromAxisAngle(up, (t.x * 5.3 + t.y * 2.9) % (Math.PI * 2));
      fm.compose(fv.set(t.x, 0, -t.y), fq, fs.set(t.s, t.s, t.s));
      canopy.setMatrixAt(j, fm);
      canopy.setColorAt(j, tc.setHex(HW.canopy[j % HW.canopy.length]));
    });
    canopy.computeBoundingSphere();
    canopy.receiveShadow = true;
    group.add(canopy);
  }

  let myTeam = 0;
  const cleared: boolean[] = [];
  let time = 0;
  return {
    group,
    gateStrip: true,
    update(frame: ViewFrame | null, dt: number, lens?: THREE.Vector3) {
      time += dt;
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
      if (frame) clearedBushes(frame.entities, myTeam, cleared);
      const on = bushU.uBushOn.value;
      for (let i = 0; i < on.length; i++) on[i] += ((cleared[i] ? 1 : 0) - on[i]) * Math.min(1, dt * 6);
      riverU.uTime.value = time;
      lampMat.color.setScalar(0.92 + Math.sin(time * 2.3) * 0.08);
    },
    setShadows(on) {
      for (const m of shadowCasters) m.castShadow = on;
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
      banners.visible = !on;
      bannersSwapped.visible = on;
      if (on === texSwap || !tex) return;
      texSwap = on;
      tex.dispose();
      tex = paintGround(info, on);
      groundMat.map = tex;
      groundMat.needsUpdate = true;
    },
    dispose() {
      tex?.dispose();
      for (const d of disposables) d.dispose();
    },
  };
}
