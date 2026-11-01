/**
 * Ground telegraphs and aim indicators: cones, lines, dashes, circles and rings drawn by one small shader on a flat
 * quad, pooled. The player's hold-aim indicator, the max-range ring, the dashed basic attack range ring, and every visible wind-up (enemy red, ally
 * teal) use it. A wind-up fills from the caster outward over its wind-up time, so what you see is when it lands.
 * Render only.
 */
import * as THREE from 'three';
import type { AimShape } from '../input/abilities';
import { HEROES } from '../data/heroes';
import { RADIUS } from '../data/map';

/** A hero as the Striking Pose read needs it: position (mm), facing (1/4096 turn), team. */
export interface PoseHero {
  id: number;
  x: number;
  y: number;
  team: number;
  facing: number;
  kind: string;
  state: string;
}

const STEPS = 4096;
const steps = (dy: number, dx: number): number => (Math.atan2(dy, dx) * STEPS) / (Math.PI * 2);
/** Signed angle difference in steps, in [-2048, 2048). */
const diff = (a: number, b: number): number => ((((b - a) % STEPS) + STEPS * 1.5) % STEPS) - STEPS / 2;

/**
 * Bengas's Striking Pose telegraph (sim v9): during the wind-up, the heroes of the other team in the pose's cone that
 * face him (they get stunned; the rest of the cone only gets slowed). The wind-up marks them with a "!" eye glyph, so
 * "do not look at him" can be read on a phone. A float mirror of the sim's inCone + inFront (src/sim/effects); render
 * only, never a replay input. Writes the ids into `out` (cleared first).
 */
export function poseWatchers(src: PoseHero, aimX: number, aimY: number, heroes: Iterable<PoseHero>, out: Set<number>): Set<number> {
  out.clear();
  const w = HEROES.bengas.abilities.w;
  const dir = steps(aimY - src.y, aimX - src.x);
  const pr = RADIUS.hero;
  for (const e of heroes) {
    if (e.kind !== 'hero' || e.state === 'dead' || e.team === src.team || (e.team !== 0 && e.team !== 1)) continue;
    const dx = e.x - src.x;
    const dy = e.y - src.y;
    const d2 = dx * dx + dy * dy;
    const reach = (w.range ?? 0) + pr;
    if (d2 > reach * reach) continue;
    if (d2 > pr * pr && Math.abs(diff(dir, steps(dy, dx))) * 2 > (w.arc ?? 0)) continue;
    if (d2 > 0 && Math.abs(diff(e.facing, steps(-dy, -dx))) * 2 > (w.facingArc ?? 0)) continue;
    out.add(e.id);
  }
  return out;
}

const VERT = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const FRAG = /* glsl */ `
uniform float uShape;   // 0 radial (cone/circle/ring), 1 rect (line/dash)
uniform float uArc;     // full angle (rad) for radial
uniform float uFill;    // 0..1 wind-up progress, < 0 = none
uniform float uInner;   // radial: inner radius fraction (ring outline only)
uniform vec3 uColor;
uniform float uAlpha;
uniform float uTime;
uniform float uInk;     // 1: a dark ink band on the outer edge (the player's own indicator, drawn over the VFX)
uniform float uRimW;    // radial: rim width as a fraction of the radius (0.1 = the usual bold rim)
uniform float uDash;    // radial: > 0 = a dashed outline with this many dashes and no body (the attack range ring)
varying vec2 vUv;
void main(){
  float a = 0.0;
  float ink = 0.0;
  if (uShape < 0.5) {
    vec2 p = vUv * 2.0 - 1.0;
    float d = length(p);
    float ang = abs(atan(p.y, p.x));
    float hf = uArc * 0.5;
    float inside = step(d, 1.0) * step(ang, hf + 0.0001);
    float rim = smoothstep(1.0 - uRimW, 1.0 - uRimW * 0.35, d) * inside;
    if (uDash > 0.0) rim *= step(0.45, fract((atan(p.y, p.x) / 6.28318 + 0.5) * uDash));
    float side = 0.0;
    if (hf < 3.1) side = (1.0 - smoothstep(0.0, 0.035, (hf - ang) * max(d, 0.08))) * inside;
    float body = 0.16 + 0.06 * sin(d * 18.0 - uTime * 6.0);
    if (uInner > 0.0) body *= smoothstep(uInner - 0.05, uInner, d) * 0.5;
    if (uDash > 0.0) body = 0.0;
    float fill = uFill >= 0.0 ? step(d, uFill) * 0.32 + smoothstep(uFill - 0.06, uFill, d) * step(d, uFill) * 0.5 : 0.0;
    a = inside * (body + fill) + max(rim, side) * 0.95;
    ink = uInk * smoothstep(0.95, 0.972, d) * inside;
  } else {
    float along = vUv.x;
    float across = abs(vUv.y - 0.5) * 2.0;
    float rim = smoothstep(0.82, 0.96, across) + smoothstep(0.975, 0.995, along);
    float body = 0.16 + 0.05 * sin(along * 30.0 - uTime * 8.0);
    float fill = uFill >= 0.0 ? step(along, uFill) * 0.32 + smoothstep(uFill - 0.04, uFill, along) * step(along, uFill) * 0.5 : 0.0;
    float chevron = 0.18 * step(0.5, fract(along * 8.0 - across * 0.6 - uTime * 2.0));
    a = body + fill + chevron * 0.5 + min(1.0, rim) * 0.95;
    ink = uInk * max(smoothstep(0.93, 0.97, across), smoothstep(0.992, 0.998, along));
  }
  if (a < 0.01 && ink < 0.01) discard;
  gl_FragColor = vec4(mix(uColor, vec3(0.08, 0.04, 0.06), ink), max(a * uAlpha, ink * 0.9));
}`;

const radialGeo = (() => {
  const g = new THREE.PlaneGeometry(2, 2);
  g.rotateX(-Math.PI / 2);
  return g;
})();
const rectGeo = (() => {
  const g = new THREE.PlaneGeometry(1, 1);
  g.translate(0.5, 0, 0);
  g.rotateX(-Math.PI / 2);
  return g;
})();

export interface TelegraphSpec {
  shape: AimShape;
  /** Origin (m, three.js X/Z). */
  x: number;
  z: number;
  /** Direction (rad, sim convention: 0 = +x, counter-clockwise from above). */
  yaw: number;
  /** Length or radius (m). */
  length: number;
  width?: number;
  arc?: number;
  color: number;
  alpha?: number;
  /** Wind-up progress 0..1, or undefined for an aim indicator. */
  fill?: number;
  /** The player's own indicator: drawn after the VFX layers (renderOrder 10) with an ink edge. */
  top?: boolean;
  /** Wave C (C3): an enemy wind-up: drawn after every particle and shockwave layer (TELEGRAPH_OVER), no ink. */
  over?: boolean;
  /** Ring only: a thin dashed outline with no body (the basic attack range ring, subtler than a skill's range ring). */
  dashed?: boolean;
}

/** Dashed ring: the outline is about this wide (m) at any radius, with a dash every ~0.8 m of its circumference. */
const DASH_RIM_M = 0.12;
const DASH_EVERY_M = 0.8;

/** Render order of an enemy wind-up: above particles (6, 7) and shockwaves (4, 7), under the hover rings (9). */
export const TELEGRAPH_OVER = 8;

interface Item {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  used: boolean;
}

export class TelegraphPool {
  readonly group = new THREE.Group();
  private items: Item[] = [];
  private time = 0;

  constructor(size = 16) {
    this.group.name = 'telegraphs';
    for (let i = 0; i < size; i++) {
      const mat = new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        uniforms: {
          uShape: { value: 0 },
          uArc: { value: Math.PI * 2 },
          uFill: { value: -1 },
          uInner: { value: 0 },
          uColor: { value: new THREE.Color() },
          uAlpha: { value: 1 },
          uTime: { value: 0 },
          uInk: { value: 0 },
          uRimW: { value: 0.1 },
          uDash: { value: 0 },
        },
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -3,
        polygonOffsetUnits: -3,
      });
      const mesh = new THREE.Mesh(radialGeo, mat);
      mesh.renderOrder = 3;
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.items.push({ mesh, mat, used: false });
      this.group.add(mesh);
    }
  }

  /** Start a frame: every telegraph is hidden unless drawn again. */
  begin(dt: number): void {
    this.time += dt;
    for (const it of this.items) {
      it.used = false;
      it.mesh.visible = false;
    }
  }

  draw(s: TelegraphSpec): void {
    if (s.shape === 'none' || !(s.length > 0)) return;
    const it = this.items.find((x) => !x.used);
    if (!it) return;
    it.used = true;
    const u = it.mat.uniforms;
    const rect = s.shape === 'line' || s.shape === 'dash';
    it.mesh.geometry = rect ? rectGeo : radialGeo;
    u.uShape.value = rect ? 1 : 0;
    u.uArc.value = s.shape === 'cone' ? (s.arc ?? Math.PI / 2) : Math.PI * 2;
    u.uInner.value = s.shape === 'ring' && s.fill === undefined ? 0.9 : 0;
    u.uFill.value = s.fill ?? -1;
    (u.uColor.value as THREE.Color).setHex(s.color);
    u.uAlpha.value = s.alpha ?? 1;
    u.uTime.value = this.time;
    u.uInk.value = s.top ? 1 : 0;
    const dashed = s.dashed === true && s.shape === 'ring';
    u.uRimW.value = dashed ? Math.min(0.1, DASH_RIM_M / s.length) : 0.1;
    u.uDash.value = dashed ? Math.max(12, Math.round((Math.PI * 2 * s.length) / DASH_EVERY_M)) : 0;
    it.mesh.renderOrder = s.top ? 10 : s.over ? TELEGRAPH_OVER : 3;
    it.mesh.position.set(s.x, 0.06, s.z);
    it.mesh.rotation.set(0, s.yaw, 0);
    if (rect) it.mesh.scale.set(s.length, 1, s.width ?? 1);
    else it.mesh.scale.set(s.length, 1, s.length);
    it.mesh.visible = true;
  }

  dispose(): void {
    for (const it of this.items) it.mat.dispose();
  }
}
