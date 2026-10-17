/**
 * Ground telegraphs and aim indicators: cones, lines, dashes, circles and rings drawn by one small shader on a flat
 * quad, pooled. The player's hold-aim indicator, the max-range ring, and every visible wind-up (enemy red, ally
 * teal) use it. A wind-up fills from the caster outward over its wind-up time, so what you see is when it lands.
 * Render only.
 */
import * as THREE from 'three';
import type { AimShape } from '../input/abilities';

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
varying vec2 vUv;
void main(){
  float a = 0.0;
  if (uShape < 0.5) {
    vec2 p = vUv * 2.0 - 1.0;
    float d = length(p);
    float ang = abs(atan(p.y, p.x));
    float hf = uArc * 0.5;
    float inside = step(d, 1.0) * step(ang, hf + 0.0001);
    float rim = smoothstep(0.90, 0.965, d) * inside;
    float side = 0.0;
    if (hf < 3.1) side = (1.0 - smoothstep(0.0, 0.035, (hf - ang) * max(d, 0.08))) * inside;
    float body = 0.16 + 0.06 * sin(d * 18.0 - uTime * 6.0);
    if (uInner > 0.0) body *= smoothstep(uInner - 0.05, uInner, d) * 0.5;
    float fill = uFill >= 0.0 ? step(d, uFill) * 0.32 + smoothstep(uFill - 0.06, uFill, d) * step(d, uFill) * 0.5 : 0.0;
    a = inside * (body + fill) + max(rim, side) * 0.95;
  } else {
    float along = vUv.x;
    float across = abs(vUv.y - 0.5) * 2.0;
    float rim = smoothstep(0.82, 0.96, across) + smoothstep(0.975, 0.995, along);
    float body = 0.16 + 0.05 * sin(along * 30.0 - uTime * 8.0);
    float fill = uFill >= 0.0 ? step(along, uFill) * 0.32 + smoothstep(uFill - 0.04, uFill, along) * step(along, uFill) * 0.5 : 0.0;
    float chevron = 0.18 * step(0.5, fract(along * 8.0 - across * 0.6 - uTime * 2.0));
    a = body + fill + chevron * 0.5 + min(1.0, rim) * 0.95;
  }
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor, a * uAlpha);
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
}

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
