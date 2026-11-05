/**
 * The start gate (render only): a pet-gate fence with a paw-print forcefield across each base exit, standing while the
 * sim holds every hero behind its x = 8 m barrier (TIMELINE.barrierDrop), then dissolving on that exact tick. The
 * barrier itself is the sim's (src/sim/units/hero.ts); this only draws it. Two draws for both bases (posts, field),
 * built once; the open animation runs from the render tick, so a replay opens it on the same frame.
 *
 * The fence is drawn on the walkable part of the barrier line, minus the core's footprint (the core sits on the line at
 * x = 10 m): two short gates north and south of the core, the base's real exits.
 */
import * as THREE from 'three';
import { CORE, MAP, mirrorX } from '../../data/map';
import { TICK_HZ, TIMELINE } from '../../data/timeline';
import { gateSpans } from '../views/mapView';

/** Ticks the open animation takes after the barrier drops (0.9 s). */
export const GATE_OPEN_TICKS = 27;
/** Half the gap (m) the fence leaves around the core on the barrier line. */
export const CORE_GAP_M = 3.6;
/** Fence post spacing (m), post height (m), forcefield tube radius (m). */
const POST_STEP = 1.35;
const POST_H = 1.5;
const TUBE_R = 0.8;

export interface GateState {
  /** The fence stands (fully or while opening). */
  up: boolean;
  /** Open animation 0 (closed) .. 1 (gone). */
  open: number;
  /** Whole seconds left before the barrier drops (0 once it has). */
  secs: number;
}

/**
 * Gate state at render tick `tick` (fractional); `null` = no snapshot yet (the loading frames): closed. Pass `out` to
 * fill a reused object (the per-frame caller: no allocation per frame).
 */
export function gateState(tick: number | null, out: GateState = { up: true, open: 0, secs: 0 }): GateState {
  if (tick === null) return set(out, true, 0, Math.ceil(TIMELINE.barrierDrop / TICK_HZ));
  const left = TIMELINE.barrierDrop - tick;
  if (left > 0) return set(out, true, 0, Math.ceil(left / TICK_HZ));
  const open = Math.min(1, Math.max(0, (tick - TIMELINE.barrierDrop) / GATE_OPEN_TICKS));
  return set(out, open < 1, open, 0);
}
function set(o: GateState, up: boolean, open: number, secs: number): GateState {
  o.up = up;
  o.open = open;
  o.secs = secs;
  return o;
}

/** Fence segments (m, map y) on one barrier line: the walkable spans minus the core gap. */
export function gateSegments(xM: number): [number, number][] {
  const cy = CORE.y / 1000;
  const out: [number, number][] = [];
  for (const [y0, y1] of gateSpans(xM)) {
    if (y1 <= cy - CORE_GAP_M || y0 >= cy + CORE_GAP_M) out.push([y0, y1]);
    else {
      if (cy - CORE_GAP_M - y0 > 1) out.push([y0, cy - CORE_GAP_M]);
      if (y1 - (cy + CORE_GAP_M) > 1) out.push([cy + CORE_GAP_M, y1]);
    }
  }
  return out;
}

/** Both barrier lines (m): team 0's and team 1's. */
export const GATE_X: readonly [number, number] = [MAP.barrierX / 1000, mirrorX(MAP.barrierX) / 1000];

const FIELD_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorld;
varying float vFres;
uniform float uOpen;
void main() {
  vUv = uv;
  vec4 w = modelMatrix * vec4(position, 1.0);
  // the tube sinks a little as it dissolves
  w.y -= uOpen * 0.35;
  vWorld = w.xyz;
  vec4 mv = viewMatrix * w;
  vec3 n = normalize(normalMatrix * normal);
  vFres = 1.0 - abs(dot(normalize(-mv.xyz), n));
  gl_Position = projectionMatrix * mv;
}`;

const FIELD_FRAG = /* glsl */ `
uniform float uTime;
uniform float uOpen;
uniform vec3 uColA;
uniform vec3 uColB;
uniform float uMid;
varying vec2 vUv;
varying vec3 vWorld;
varying float vFres;
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n21(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float blob(vec2 p, vec2 c, vec2 r) { vec2 d = (p - c) / r; return 1.0 - smoothstep(0.75, 1.0, dot(d, d)); }
void main() {
  vec3 col = vWorld.x < uMid ? uColA : uColB;
  // paw prints marching along the tube
  vec2 q = vec2(vUv.x * 2.2, vWorld.z * 0.8 + uTime * 0.45);
  vec2 c = fract(q) - 0.5;
  float paw = blob(c, vec2(0.0, -0.1), vec2(0.17, 0.14));
  paw = max(paw, blob(c, vec2(-0.17, 0.07), vec2(0.065, 0.08)));
  paw = max(paw, blob(c, vec2(-0.06, 0.17), vec2(0.065, 0.08)));
  paw = max(paw, blob(c, vec2(0.06, 0.17), vec2(0.065, 0.08)));
  paw = max(paw, blob(c, vec2(0.17, 0.07), vec2(0.065, 0.08)));
  float scan = 0.5 + 0.5 * sin(vWorld.z * 5.0 - uTime * 4.0);
  // pet-gate bars across the field, so it reads as a wall and not a light streak
  float bars = 1.0 - smoothstep(0.08, 0.16, abs(fract(vWorld.z * 1.6) - 0.5));
  float a = 0.3 + 0.55 * pow(vFres, 1.4) + paw * 0.45 + bars * 0.22 + scan * 0.08;
  // dissolve from the top down as the gate opens, with a bright burning edge
  float nz = n21(vec2(vWorld.z * 2.3, vUv.x * 5.0)) * 0.7 + (1.0 - vUv.y) * 0.0 + abs(vUv.x - 0.5) * 0.6;
  float cut = uOpen * 1.45;
  if (nz < cut - 0.02) discard;
  float burn = 1.0 - smoothstep(0.0, 0.12, nz - cut);
  vec3 rgb = mix(col * 1.15, vec3(1.0), 0.3 * pow(vFres, 3.0) + paw * 0.45 + bars * 0.2);
  rgb = mix(rgb, vec3(1.0, 0.95, 0.7), burn * step(0.001, uOpen));
  gl_FragColor = vec4(rgb, clamp(a + burn * 0.6 * step(0.001, uOpen), 0.0, 0.95));
}`;

const POST_VERT = /* glsl */ `
attribute float aCap;
uniform float uSink;
uniform float uTime;
varying float vCap;
varying float vLight;
varying float vSide;
uniform float uMid;
void main() {
  vCap = aCap;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vSide = w.x < uMid ? 0.0 : 1.0;
  // caps bob a little while the gate stands; everything sinks into the ground as it opens
  w.y += aCap * 0.05 * sin(uTime * 3.0 + w.z * 1.7) * (1.0 - uSink);
  w.y -= uSink * ${(POST_H + 0.6).toFixed(2)};
  vec3 n = normalize(mat3(modelMatrix) * normal);
  vLight = 0.62 + 0.38 * max(0.0, dot(n, normalize(vec3(0.35, 1.0, 0.45))));
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const POST_FRAG = /* glsl */ `
uniform vec3 uColA;
uniform vec3 uColB;
varying float vCap;
varying float vLight;
varying float vSide;
void main() {
  vec3 side = vSide < 0.5 ? uColA : uColB;
  vec3 body = vec3(1.0, 0.95, 0.86);
  vec3 c = mix(body, side, vCap) * vLight;
  gl_FragColor = vec4(c, 1.0);
}`;

const toVec = (hex: number, v: THREE.Vector3): void => {
  v.set(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255);
};

/** Merge non-indexed copies of `parts` with a per-part float attribute. */
function merge(parts: { geo: THREE.BufferGeometry; tag: number }[]): THREE.BufferGeometry {
  let n = 0;
  const flat = parts.map((p) => {
    const g = p.geo.index ? p.geo.toNonIndexed() : p.geo;
    if (g !== p.geo) p.geo.dispose();
    n += g.getAttribute('position').count;
    return { g, tag: p.tag };
  });
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  const uv = new Float32Array(n * 2);
  const tag = new Float32Array(n);
  let o = 0;
  for (const { g, tag: t } of flat) {
    const p = g.getAttribute('position');
    const nn = g.getAttribute('normal');
    const u = g.getAttribute('uv');
    pos.set(p.array as Float32Array, o * 3);
    nor.set(nn.array as Float32Array, o * 3);
    if (u) uv.set(u.array as Float32Array, o * 2);
    tag.fill(t, o, o + p.count);
    o += p.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setAttribute('aCap', new THREE.BufferAttribute(tag, 1));
  out.computeBoundingSphere();
  return out;
}

export interface GateSign {
  /** Sign anchor (m, three.js coordinates). */
  x: number;
  z: number;
  /** Barrier side 0 (team 0's line) or 1. */
  side: 0 | 1;
  /** Segment length (m), for the open burst. */
  len: number;
  /**
   * Where the padlock sign stands on the segment (m, three.js z): toward the core end, so the far gate's sign is not
   * hidden under the bottom HUD (feel QA: the bottom gate's padlock sat behind the desktop ability bar).
   */
  sz: number;
}

export class StartGate {
  readonly group = new THREE.Group();
  readonly signs: GateSign[] = [];
  private readonly field: THREE.Mesh;
  private readonly posts: THREE.Mesh;
  private readonly fieldMat: THREE.ShaderMaterial;
  private readonly postMat: THREE.ShaderMaterial;
  private readonly colA = new THREE.Vector3(1, 0.5, 0.6);
  private readonly colB = new THREE.Vector3(0.4, 0.5, 1);

  constructor() {
    this.group.name = 'start-gate';
    const fields: { geo: THREE.BufferGeometry; tag: number }[] = [];
    const posts: { geo: THREE.BufferGeometry; tag: number }[] = [];
    GATE_X.forEach((x, side) => {
      for (const [y0, y1] of gateSegments(x)) {
        const len = y1 - y0;
        const mid = (y0 + y1) / 2;
        const cy = CORE.y / 1000;
        const inset = Math.min(2.5, len * 0.3);
        const signY = mid < cy ? y1 - inset : y0 + inset;
        this.signs.push({ x, z: -mid, side: side as 0 | 1, len, sz: -signY });
        // the forcefield: an upper half-tube lying along the line (reads as a solid glowing wall from the steep camera,
        // where an upright plane was seen edge-on)
        const tube = new THREE.CylinderGeometry(TUBE_R, TUBE_R, len, 14, 1, true, Math.PI / 2, Math.PI);
        tube.rotateX(Math.PI / 2);
        tube.scale(1, 1.75, 1);
        tube.translate(x, 0, -mid);
        fields.push({ geo: tube, tag: 0 });
        // posts with yarn-ball caps, and two rails
        const n = Math.max(2, Math.round(len / POST_STEP) + 1);
        for (let i = 0; i < n; i++) {
          const z = -(y0 + (len * i) / (n - 1));
          const post = new THREE.CylinderGeometry(0.09, 0.12, POST_H, 6, 1);
          post.translate(x, POST_H / 2, z);
          posts.push({ geo: post, tag: 0 });
          const cap = new THREE.IcosahedronGeometry(i === 0 || i === n - 1 ? 0.3 : 0.2, 0);
          cap.translate(x, POST_H + 0.12, z);
          posts.push({ geo: cap, tag: 1 });
        }
        for (const [h, r] of [
          [0.55, 0.05],
          [1.2, 0.06],
        ] as const) {
          const rail = new THREE.CylinderGeometry(r, r, len, 5, 1);
          rail.rotateX(Math.PI / 2);
          rail.translate(x, h, -mid);
          posts.push({ geo: rail, tag: 1 });
        }
      }
    });
    const mid = { value: MAP.width / 2000 };
    this.fieldMat = new THREE.ShaderMaterial({
      vertexShader: FIELD_VERT,
      fragmentShader: FIELD_FRAG,
      uniforms: { uTime: { value: 0 }, uOpen: { value: 0 }, uColA: { value: this.colA }, uColB: { value: this.colB }, uMid: mid },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.postMat = new THREE.ShaderMaterial({
      vertexShader: POST_VERT,
      fragmentShader: POST_FRAG,
      uniforms: { uSink: { value: 0 }, uTime: { value: 0 }, uColA: { value: this.colA }, uColB: { value: this.colB }, uMid: mid },
    });
    this.field = new THREE.Mesh(merge(fields), this.fieldMat);
    this.field.name = 'gate-field';
    this.field.renderOrder = 3;
    this.field.frustumCulled = false;
    this.posts = new THREE.Mesh(merge(posts), this.postMat);
    this.posts.name = 'gate-posts';
    this.posts.frustumCulled = false;
    this.group.add(this.posts, this.field);
  }

  /** Side colours (team 0's line, team 1's line). */
  setColors(a: number, b: number): void {
    toVec(a, this.colA);
    toVec(b, this.colB);
  }

  /** Draw state for this frame. */
  update(s: GateState, time: number, reduced: boolean): void {
    this.group.visible = s.up;
    if (!s.up) return;
    const t = reduced ? 0 : time;
    this.fieldMat.uniforms.uTime.value = t;
    this.postMat.uniforms.uTime.value = t;
    this.fieldMat.uniforms.uOpen.value = s.open;
    // the posts wait a beat (the field bursts first), then drop with an ease-in
    const k = Math.max(0, (s.open - 0.15) / 0.85);
    this.postMat.uniforms.uSink.value = k * k;
  }

  dispose(): void {
    this.field.geometry.dispose();
    this.posts.geometry.dispose();
    this.fieldMat.dispose();
    this.postMat.dispose();
  }
}
