/**
 * Living pass (P2): ambient critters off the lanes. Crossing gets butterflies (pale lilac, mint, peach) and
 * pollen motes over the jungle meadows; Hearthwood gets fireflies (warm cream) and russet leaves drifting down from the
 * autumn canopy. Never a team colour or the bolt yellow that means "you".
 *
 * One InstancedBufferGeometry, one draw: every critter's flight (wander, wing flap, blink, fall, flutter) is computed in
 * the vertex shader from its seeded home and `uTime`, so a frame costs one uniform write. The homes are seeded (`lcg`,
 * same spots every match) on open ground at least `CRITTERS.laneClear` m (plus the critter's own wander radius) from
 * every lane's centre line, clear of the base plazas, the river, the camps, towers and objectives, so nothing flutters
 * over a lane fight. Low (ambient level 0) hides the layer (0 draws); Med and High draw `max × density` of them;
 * reduce motion is already in the ambient's density (× 0.4) and speed (× 0.5). renderOrder 1, no depth write: under
 * telegraphs, skillshots, units' overhead bars and the HUD. Render only.
 */
import * as THREE from 'three';
import type { MapInfo } from '../../sim/map/info';
import type { Ambient } from '../ambient';

export type CritterKind = 0 | 1 | 2 | 3;
/** 0 butterfly, 1 firefly, 2 leaf, 3 pollen mote. */
export const CRITTER = Object.freeze({ butterfly: 0, firefly: 1, leaf: 2, pollen: 3 } as const);

export const CRITTERS = Object.freeze({
  /** Most critters at density 1 (High desktop); Med and phones draw fewer. */
  max: 24,
  /** Clear distance (m) from every lane centre line, before the critter's own wander radius is added. */
  laneClear: 6,
  /** Clear distance (m) from fountains and cores (the base plazas), camps and towers, objectives (+ their radius). */
  plaza: 13,
  camp: 6,
  tower: 5,
  objective: 4,
  /** Clear band either side of the river (m). */
  river: 3,
  /** Spots keep this far apart (m), so they never cluster. */
  spacing: 3.2,
  /** From the map edge (m). */
  edge: 6,
  seed: 0x5eed17,
});

/** Pale, never a team colour or yellow. */
export const CRITTER_COLORS: Readonly<Record<CritterKind, readonly number[]>> = Object.freeze({
  0: Object.freeze([0xc6a6f4, 0x9fe6c2, 0xffdcc4, 0xe0c8ff]),
  1: Object.freeze([0xfff0cc]),
  2: Object.freeze([0xc0643a, 0xd08850, 0x9a5a34]),
  3: Object.freeze([0xfffbea]),
});

export interface CritterSpot {
  kind: CritterKind;
  /** Home (m, world x / z) and base height (m). */
  x: number;
  z: number;
  y: number;
  /** Wander radius (m), size (m), speed multiplier, phase seed 0..1, colour. */
  r: number;
  size: number;
  speed: number;
  seed: number;
  color: number;
}

/** A small deterministic LCG (render only). */
export function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Distance (mm) from (x, y) to the segment a-b. */
function segDist(x: number, y: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0;
  const px = ax + dx * t - x;
  const py = ay + dy * t - y;
  return Math.sqrt(px * px + py * py);
}

/** Distance (mm) from (x, y) to the nearest lane centre line (both teams' paths, core to core). */
export function laneDistance(info: Pick<MapInfo, 'lanes'>, x: number, y: number): number {
  let best = Infinity;
  for (const lane of info.lanes)
    for (const [xs, ys] of lane.path)
      for (let i = 0; i + 1 < xs.length; i++) best = Math.min(best, segDist(x, y, xs[i], ys[i], xs[i + 1], ys[i + 1]));
  return best;
}

/** The critter kind at instance index `i` (a prefix of any length keeps the map's mix). */
export function kindAt(map: 'crossing' | 'hearthwood', i: number): CritterKind {
  const k = i % 5;
  if (map === 'hearthwood') return k === 0 || k === 2 ? CRITTER.firefly : CRITTER.leaf;
  return k === 0 || k === 1 || k === 3 ? CRITTER.butterfly : CRITTER.pollen;
}

/** Is (x, y) mm a fine home for a critter with wander radius `r` m? */
export function critterSpotOk(info: MapInfo, x: number, y: number, r: number): boolean {
  const C = CRITTERS;
  const m = 1000;
  if (x < C.edge * m || y < C.edge * m || x > info.width - C.edge * m || y > info.height - C.edge * m) return false;
  const ix = Math.floor(x / info.navCell);
  const iy = Math.floor(y / info.navCell);
  if (info.playable[iy * info.nx + ix] !== 1) return false;
  const rv = info.river;
  if (rv.kind === 'band-x' ? x > rv.a - C.river * m && x < rv.b + C.river * m : Math.abs(x + y - rv.a) <= rv.b + C.river * m) return false;
  const near = (px: number, py: number, d: number): boolean => (px - x) ** 2 + (py - y) ** 2 < (d * m) ** 2;
  for (const f of info.fountains) if (near(f.x, f.y, C.plaza)) return false;
  for (const c of info.cores) if (near(c.x, c.y, C.plaza)) return false;
  for (const c of info.camps) if (near(c.x, c.y, C.camp)) return false;
  for (const t of info.towers) if (near(t.x, t.y, C.tower)) return false;
  for (const o of info.objectives) if (near(o.x, o.y, C.objective + o.radius / m)) return false;
  for (const b of info.bushes) if (Math.abs(b.x - x) < b.w / 2 + 2 * m && Math.abs(b.y - y) < b.h / 2 + 2 * m) return false;
  return laneDistance(info, x, y) >= (C.laneClear + r + 0.3) * m;
}

/** The seeded critter homes for a map (deterministic; the first `n` of them are drawn). */
export function critterSpots(info: MapInfo, n = CRITTERS.max, seed = CRITTERS.seed): CritterSpot[] {
  const map = info.id === 'hearthwood' ? 'hearthwood' : 'crossing';
  const rnd = lcg(seed ^ (map === 'hearthwood' ? 0x4ea7 : 0));
  const out: CritterSpot[] = [];
  for (let tries = 0; tries < 6000 && out.length < n; tries++) {
    const kind = kindAt(map, out.length);
    const r = kind === CRITTER.butterfly ? 1.2 + rnd() * 0.8 : kind === CRITTER.firefly ? 0.8 + rnd() * 0.6 : kind === CRITTER.leaf ? 1.2 : 0.8;
    const x = rnd() * info.width;
    const y = rnd() * info.height;
    if (!critterSpotOk(info, x, y, r)) continue;
    const wx = x / 1000;
    const wz = -y / 1000;
    if (out.some((o) => (o.x - wx) ** 2 + (o.z - wz) ** 2 < CRITTERS.spacing ** 2)) continue;
    const cols = CRITTER_COLORS[kind];
    out.push({
      kind,
      x: wx,
      z: wz,
      y: kind === CRITTER.butterfly ? 0.9 + rnd() * 0.7 : kind === CRITTER.firefly ? 0.6 + rnd() * 1.2 : kind === CRITTER.leaf ? 4.2 + rnd() * 1.2 : 0.3 + rnd() * 0.6,
      r,
      size: kind === CRITTER.butterfly ? 0.28 + rnd() * 0.06 : kind === CRITTER.firefly ? 0.22 : kind === CRITTER.leaf ? 0.22 + rnd() * 0.05 : 0.09,
      speed: 0.8 + rnd() * 0.4,
      seed: rnd(),
      color: cols[Math.floor(rnd() * cols.length) % cols.length],
    });
  }
  return out;
}

/** How many critters a tier draws (0 on Low). */
export function critterCount(a: Pick<Ambient, 'level' | 'density'>, built: number): number {
  if (a.level === 0) return 0;
  return Math.max(0, Math.min(built, Math.floor(CRITTERS.max * a.density)));
}

const VERT = /* glsl */ `
uniform float uTime;
attribute vec4 iHome;   // x, base y, z (m), seed
attribute vec4 iKind;   // kind, size, wander radius, speed
attribute vec3 iColor;
varying vec2 vUv;
varying vec3 vCol;
varying float vA;
varying float vKind;
void main(){
  float k = iKind.x;
  float size = iKind.y;
  float R = iKind.z;
  float t = uTime * iKind.w + iHome.w * 97.0;
  vec3 P;
  float yaw = 0.0;
  float flap = 0.0;
  float roll = 0.0;
  float a = 1.0;
  if (k < 0.5) {
    P = vec3(sin(t * 0.31) * R + sin(t * 0.83 + 1.7) * R * 0.35, iHome.y + sin(t * 1.1) * 0.25 + sin(t * 2.7) * 0.05, cos(t * 0.27) * R + cos(t * 0.71 + 0.4) * R * 0.35);
    vec2 vel = vec2(cos(t * 0.31) * 0.31 + cos(t * 0.83 + 1.7) * 0.29, -sin(t * 0.27) * 0.27 - sin(t * 0.71 + 0.4) * 0.25);
    yaw = atan(-vel.y, vel.x);
    flap = 0.05 + 0.85 * abs(sin(t * 9.0));
  } else if (k < 1.5) {
    P = vec3(sin(t * 0.21) * R + sin(t * 0.53) * 0.3, iHome.y + sin(t * 0.6) * 0.35, cos(t * 0.17) * R + cos(t * 0.47) * 0.3);
    a = 0.2 + 0.8 * smoothstep(0.45, 1.0, 0.5 + 0.5 * sin(t * 1.3));
  } else if (k < 2.5) {
    float cyc = fract(t * 0.06);
    P = vec3(sin(t * 0.9) * 0.5 + cyc * 1.6, iHome.y * (1.0 - cyc) + 0.05, cos(t * 0.7) * 0.4 + cyc * 0.6);
    yaw = t * 0.8;
    roll = sin(t * 2.2) * 1.1;
    a = smoothstep(0.0, 0.06, cyc) * (1.0 - smoothstep(0.86, 1.0, cyc));
  } else {
    float cyc = fract(t * 0.05);
    P = vec3(sin(t * 0.4) * R * 0.5, iHome.y + cyc * 2.0, cos(t * 0.33) * R * 0.5);
    a = sin(cyc * 3.14159) * 0.85;
  }
  vec3 W = vec3(iHome.x, 0.0, iHome.z) + P;
  vKind = k;
  vCol = iColor;
  vA = a;
  if ((k > 0.5 && k < 1.5) || k > 2.5) {
    // a dot facing the camera (fireflies, pollen)
    vec4 mv = modelViewMatrix * vec4(W, 1.0);
    vec2 c = vec2(position.x * 2.0, position.y);
    vUv = c * 0.5 + 0.5;
    mv.xy += c * size;
    gl_Position = projectionMatrix * mv;
    return;
  }
  vec3 lv;
  if (k < 0.5) {
    // two wings hinged on the body (local x), raised by the flap
    float w = abs(position.y);
    lv = vec3(position.x, w * sin(flap), sign(position.y) * w * cos(flap)) * size;
    vUv = vec2(position.x + 0.5, w);
  } else {
    // a leaf: one diamond, tumbling as it falls
    lv = vec3(position.x * 0.9, sin(roll) * position.y * 0.5, cos(roll) * position.y * 0.5) * size;
    vUv = vec2(position.x + 0.5, position.y * 0.5 + 0.5);
  }
  float cy = cos(yaw), sy = sin(yaw);
  vec3 r = vec3(cy * lv.x + sy * lv.z, lv.y, -sy * lv.x + cy * lv.z);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(W + r, 1.0);
}
`;

const FRAG = /* glsl */ `
varying vec2 vUv;
varying vec3 vCol;
varying float vA;
varying float vKind;
void main(){
  vec3 col = vCol;
  float a = vA;
  vec3 ink = vec3(0.09, 0.05, 0.08);
  if (vKind < 0.5) {
    float fore = length((vUv - vec2(0.62, 0.56)) * vec2(2.3, 2.1));
    float hind = length((vUv - vec2(0.3, 0.42)) * vec2(2.7, 2.5));
    float m = min(fore, hind);
    if (m > 1.0) discard;
    col = mix(col, ink, step(0.78, m) * 0.85);
    col = mix(col, ink, step(vUv.y, 0.07));
  } else if (vKind > 1.5 && vKind < 2.5) {
    vec2 q = vUv * 2.0 - 1.0;
    float m = abs(q.x) * 1.15 + abs(q.y) * 0.95;
    if (m > 1.0) discard;
    col *= 1.0 - 0.35 * step(0.8, m) - 0.25 * step(abs(q.y), 0.07);
  } else {
    float r = length(vUv * 2.0 - 1.0);
    if (r > 1.0) discard;
    a *= 1.0 - smoothstep(0.3, 1.0, r);
    col = mix(col, vec3(1.0), 1.0 - step(0.35, r));
  }
  if (a < 0.01) discard;
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const _c = new THREE.Color();

/** The critter layer: one instanced draw, motion in the shader. */
export class CritterLayer {
  readonly mesh: THREE.Mesh;
  readonly spots: CritterSpot[];
  private readonly geo: THREE.InstancedBufferGeometry;
  private readonly mat: THREE.ShaderMaterial;
  private speed = 1;
  private time = 0;

  constructor(info: MapInfo) {
    this.spots = critterSpots(info);
    const n = this.spots.length;
    const g = new THREE.InstancedBufferGeometry();
    // two quads hinged on the x axis: v < 0 one wing, v > 0 the other (a leaf / dot uses the pair as one quad)
    const pos = new Float32Array([-0.5, 0, 0, 0.5, 0, 0, -0.5, -1, 0, 0.5, -1, 0, -0.5, 0, 0, 0.5, 0, 0, -0.5, 1, 0, 0.5, 1, 0]);
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex([0, 2, 1, 1, 2, 3, 4, 5, 6, 5, 7, 6]);
    const home = new Float32Array(n * 4);
    const kind = new Float32Array(n * 4);
    const col = new Float32Array(n * 3);
    this.spots.forEach((s, i) => {
      home.set([s.x, s.y, s.z, s.seed], i * 4);
      kind.set([s.kind, s.size, s.r, s.speed], i * 4);
      _c.setHex(s.color);
      col.set([_c.r, _c.g, _c.b], i * 3);
    });
    g.setAttribute('iHome', new THREE.InstancedBufferAttribute(home, 4));
    g.setAttribute('iKind', new THREE.InstancedBufferAttribute(kind, 4));
    g.setAttribute('iColor', new THREE.InstancedBufferAttribute(col, 3));
    g.instanceCount = n;
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      name: 'living.critters',
      uniforms: { uTime: { value: 0 } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.name = 'living-critters';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.mesh.matrixAutoUpdate = false;
  }

  /** Ambient level: Low hides the layer (0 draws); Med / High draw `max × density`, at the ambient's speed. */
  setAmbient(a: Ambient): void {
    const n = critterCount(a, this.spots.length);
    this.geo.instanceCount = n;
    this.mesh.visible = n > 0;
    this.speed = a.speed;
  }

  /** Drawn critters now (tests). */
  get count(): number {
    return this.mesh.visible ? this.geo.instanceCount : 0;
  }

  update(dt: number): void {
    if (!this.mesh.visible) return;
    this.time += dt * this.speed;
    this.mat.uniforms.uTime.value = this.time;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.geo.dispose();
    this.mat.dispose();
  }
}
