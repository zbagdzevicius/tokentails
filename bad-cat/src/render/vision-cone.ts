/**
 * Vision cone on the floor (GDD 4.3, 11.1): the human's current cone cells after occlusion (the sim's
 * `coneCells`), drawn as one dynamic mesh with one shader. TELEGRAPH = a solid butter (#FFD166) edge band
 * (0.06 m, full opacity, brightness pulsing at 6 Hz) over a faint amber fill, with the rest of the room
 * dimmed 15 %; LOOK = red fill with a diagonal hatch (colour-blind safe) and a solid outline. Each cell quad
 * sits on its own surface level. Rebuilt only when the cell set changes.
 */
import {
  AddEquation,
  BufferAttribute,
  BufferGeometry,
  Color,
  CustomBlending,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  SrcColorFactor,
  ZeroFactor,
} from 'three';
import { DIR_DX, DIR_DZ, HumanSt, type SimState } from '../types';
import { coneCells } from '../sim';
import { PAL } from './palette';
import { cellX, cellZ, levelY } from './space';

const VS = /* glsl */ `
attribute vec2 aUv;
attribute vec4 aEdge;
attribute float aFade;
varying vec2 vUv;
varying vec4 vEdge;
varying float vFade;
varying vec3 vWorld;
void main() {
  vUv = aUv; vEdge = aEdge; vFade = aFade;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const FS = /* glsl */ `
uniform vec3 uColor;
uniform float uMode;
uniform float uTime;
uniform float uOpacity;
uniform float uStyle;
varying vec2 vUv;
varying vec4 vEdge;
varying float vFade;
varying vec3 vWorld;
void main() {
  float d = 1.0;
  if (vEdge.x > 0.5) d = min(d, vUv.y);
  if (vEdge.y > 0.5) d = min(d, 1.0 - vUv.x);
  if (vEdge.z > 0.5) d = min(d, 1.0 - vUv.y);
  if (vEdge.w > 0.5) d = min(d, vUv.x);
  float look = step(1.5, uMode);
  // LOOK: soft solid outline
  float soft = 1.0 - smoothstep(0.12, 0.25, d);
  // TELEGRAPH (round 3): a solid 0.06 m butter (#FFD166) band at full opacity, pulsing at 6 Hz (uTime is in
  // ticks: 2*pi*6/30 = 1.2566 rad per tick). White dashes vanished on the warm floor.
  float band = 1.0 - step(0.15, d);
  float tEdge = band;
  float pulse = 0.82 + 0.18 * sin(uTime * 1.2566);
  float hatch = step(0.5, fract((vWorld.x + vWorld.z) * 6.0));
  float fill = mix(0.14, 0.55 + 0.2 * hatch, look);
  float edgeA = mix(tEdge, soft, look);
  float a = max(fill, edgeA);
  a *= (1.0 - vFade * 0.5 * look) * uOpacity;
  vec3 butter = vec3(1.0, 0.637, 0.133); // #FFD166 in linear space (colorspace_fragment converts it back)
  vec3 tCol = mix(uColor, butter * (0.85 + 0.15 * pulse), tEdge);
  vec3 lCol = mix(uColor, vec3(1.0, 0.95, 0.9), soft * 0.35);
  vec4 outC = vec4(mix(tCol, lCol, look), min(1.0, a));
  if (uStyle > 0.5 && uStyle < 1.5) {
    // mirror: silvery fill with a slow diagonal glint, a thin bright edge
    float glint = smoothstep(0.92, 1.0, sin((vWorld.x - vWorld.z) * 9.0 - uTime * 0.25));
    float edge = 1.0 - smoothstep(0.08, 0.16, d);
    outC = vec4(mix(uColor, vec3(1.0), 0.35 * glint + 0.4 * edge), (0.3 + 0.25 * glint + 0.5 * edge) * (1.0 - vFade * 0.4) * uOpacity);
  } else if (uStyle > 1.5) {
    // webcam: a faint blue wedge with scanlines
    float scan = 0.5 + 0.5 * sin(vWorld.z * 60.0 + uTime * 0.4);
    float edge = 1.0 - smoothstep(0.06, 0.14, d);
    outC = vec4(mix(uColor, vec3(0.75, 0.9, 1.0), 0.25 * edge), (0.2 + 0.06 * scan + 0.35 * edge) * (1.0 - vFade * 0.6) * uOpacity);
  }
  gl_FragColor = outC;
  #include <colorspace_fragment>
}`;

/** Fallback cone (render-only floats) when the sim's coneCells is unavailable. */
export function fallbackCone(s: SimState, humanIdx: number): Int16Array {
  const h = s.humans[humanIdx];
  if (!h) return new Int16Array(0);
  const f = h.state === HumanSt.LOOK ? h.facing : h.state === HumanSt.TELEGRAPH ? h.lookFacing : 0;
  if (!f) return new Int16Array(0);
  const { w, d } = s.grid;
  if (h.x < 0 || h.z < 0 || h.x >= w || h.z >= d) return new Int16Array(0);
  const fx = DIR_DX[f];
  const fz = DIR_DZ[f];
  const out: number[] = [];
  for (let z = 0; z < d; z++)
    for (let x = 0; x < w; x++) {
      const dx = x - h.x;
      const dz = z - h.z;
      if (dx * dx + dz * dz > 100) continue;
      const dot = dx * fx + dz * fz;
      if (dot <= 0) continue;
      if (10 * Math.abs(dz * fx - dx * fz) > 7 * dot) continue;
      // grid walk for occlusion
      let blocked = false;
      const n = Math.max(Math.abs(dx), Math.abs(dz));
      for (let i = 1; i < n; i++) {
        const cx = Math.round(h.x + (dx * i) / n);
        const cz = Math.round(h.z + (dz * i) / n);
        if (s.grid.occludes[cz * w + cx]) {
          blocked = true;
          break;
        }
      }
      if (!blocked) out.push(z * w + x);
    }
  return Int16Array.from(out);
}

/**
 * Render-only cone from any origin (mirror, webcam): `range` cells long, 70° wide, grid-walk occlusion. Used when
 * the sim has no helper for it; the sim's own cells win when present.
 */
export function coneFrom(s: SimState, ox: number, oz: number, facing: number, range: number): Int16Array {
  const { w, d } = s.grid;
  const fx = DIR_DX[facing] ?? 0;
  const fz = DIR_DZ[facing] ?? 0;
  if (!fx && !fz) return new Int16Array(0);
  const out: number[] = [];
  for (let z = 0; z < d; z++)
    for (let x = 0; x < w; x++) {
      const dx = x - ox;
      const dz = z - oz;
      if (dx * dx + dz * dz > range * range) continue;
      const dot = dx * fx + dz * fz;
      if (dot <= 0) continue;
      if (10 * Math.abs(dz * fx - dx * fz) > 7 * dot) continue;
      let blocked = false;
      const n = Math.max(Math.abs(dx), Math.abs(dz));
      for (let i = 1; i < n; i++) {
        const cx = Math.round(ox + (dx * i) / n);
        const cz = Math.round(oz + (dz * i) / n);
        if (cx >= 0 && cz >= 0 && cx < w && cz < d && s.grid.occludes[cz * w + cx]) {
          blocked = true;
          break;
        }
      }
      if (!blocked) out.push(z * w + x);
    }
  return Int16Array.from(out);
}

function cellsFor(s: SimState, i: number): Int16Array {
  try {
    return coneCells(s, i);
  } catch {
    return fallbackCone(s, i);
  }
}

/** LOOK: everything outside the cone is dimmed by this much (full-screen multiply drawn under the cone). */
export const LOOK_DIM = 0.18;
/** TELEGRAPH: the room dims 15 % (eased in over ~4 ticks) so the white warning edge pops. */
export const TELEGRAPH_DIM = 0.15;

const DIM_VS = /* glsl */ `
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const DIM_FS = /* glsl */ `
uniform float uAmt;
void main() { gl_FragColor = vec4(vec3(1.0 - uAmt), 1.0); }`;

/** Cone looks: the human's (telegraph/look), the mirror's (silver) and the webcam's (faint blue). */
export type ConeStyle = 'human' | 'mirror' | 'cam';

export class VisionCone {
  readonly mesh: Mesh;
  readonly style: ConeStyle;
  /** Full-screen multiply quad (LOOK dim). Add it to the scene next to `mesh`. */
  readonly dim: Mesh;
  private dimMat: ShaderMaterial;
  private dimAmt = 0;
  private geo: BufferGeometry;
  private mat: ShaderMaterial;
  private cap: number;
  private key = '';
  private opacity = 0;

  constructor(maxCells: number, style: ConeStyle = 'human') {
    this.cap = maxCells;
    this.style = style;
    this.geo = new BufferGeometry();
    this.geo.setAttribute('position', new BufferAttribute(new Float32Array(maxCells * 12), 3));
    this.geo.setAttribute('aUv', new BufferAttribute(new Float32Array(maxCells * 8), 2));
    this.geo.setAttribute('aEdge', new BufferAttribute(new Float32Array(maxCells * 16), 4));
    this.geo.setAttribute('aFade', new BufferAttribute(new Float32Array(maxCells * 4), 1));
    const idx = new Uint16Array(maxCells * 6);
    for (let c = 0; c < maxCells; c++) {
      idx.set([c * 4, c * 4 + 2, c * 4 + 1, c * 4 + 1, c * 4 + 2, c * 4 + 3], c * 6);
    }
    this.geo.setIndex(new BufferAttribute(idx, 1));
    this.geo.setDrawRange(0, 0);
    this.mat = new ShaderMaterial({
      vertexShader: VS,
      fragmentShader: FS,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
      uniforms: {
        uColor: { value: new Color(PAL.coneTelegraph) },
        uMode: { value: 1 },
        uTime: { value: 0 },
        uOpacity: { value: 0 },
        uStyle: { value: style === 'mirror' ? 1 : style === 'cam' ? 2 : 0 },
      },
    });
    if (style === 'mirror') (this.mat.uniforms.uColor.value as Color).setHex(0xcfd8e6);
    if (style === 'cam') (this.mat.uniforms.uColor.value as Color).setHex(0x2f8cff);
    this.mesh = new Mesh(this.geo, this.mat);
    this.mesh.name = style === 'human' ? 'vision-cone' : `vision-cone-${style}`;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.dimMat = new ShaderMaterial({
      vertexShader: DIM_VS,
      fragmentShader: DIM_FS,
      uniforms: { uAmt: { value: 0 } },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: CustomBlending,
      blendEquation: AddEquation,
      blendSrc: ZeroFactor,
      blendDst: SrcColorFactor,
    });
    this.dim = new Mesh(new PlaneGeometry(2, 2), this.dimMat);
    this.dim.name = 'look-dim';
    this.dim.frustumCulled = false;
    this.dim.renderOrder = 2;
    this.dim.visible = false;
  }

  /** LOOK dim amount follows the cone (0 outside LOOK or when `on` is false, e.g. the clip pass). */
  private updateDim(mode: number, dtTicks: number, on: boolean): void {
    const want = !on ? 0 : mode === 2 ? LOOK_DIM : mode === 1 ? TELEGRAPH_DIM : 0;
    this.dimAmt += (want - this.dimAmt) * Math.min(1, dtTicks * (mode === 1 ? 0.25 : 0.3));
    if (want === 0 && this.dimAmt < 0.004) this.dimAmt = 0;
    this.dim.visible = this.dimAmt > 0;
    this.dimMat.uniforms.uAmt.value = this.dimAmt;
  }

  /** Briefing warm-up: show the mesh and the dim quad so their programs compile before the run. */
  prewarm(on: boolean): void {
    this.mesh.visible = on;
    this.dim.visible = on;
  }

  reset(): void {
    this.key = '';
    this.opacity = 0;
    this.dimAmt = 0;
    this.dim.visible = false;
    this.geo.setDrawRange(0, 0);
  }

  update(s: SimState, T: number, dtTicks: number, visible: boolean, dimOn = true): void {
    // M0: one human; boss rooms draw the union of all cones.
    let mode = 0;
    let cells: number[] = [];
    for (let i = 0; i < s.humans.length; i++) {
      const h = s.humans[i];
      if (h.state !== HumanSt.LOOK && h.state !== HumanSt.TELEGRAPH) continue;
      mode = Math.max(mode, h.state === HumanSt.LOOK ? 2 : 1);
      const c = cellsFor(s, i);
      for (let k = 0; k < c.length; k++) cells.push(c[k]);
    }
    if (!visible) mode = 0;
    this.updateDim(mode, dtTicks, dimOn);
    if (cells.length > this.cap) cells = cells.slice(0, this.cap);
    const target = mode ? 1 : 0;
    // hidden on purpose (the cuddle): a linear fade to 0 over 6 ticks
    if (!visible) this.opacity = Math.max(0, this.opacity - dtTicks / 6);
    else this.opacity += (target - this.opacity) * Math.min(1, dtTicks * (mode ? 0.35 : 0.2));
    if (!mode && this.opacity < 0.02) {
      this.geo.setDrawRange(0, 0);
      this.key = '';
      this.mesh.visible = false;
      return;
    }
    this.mesh.visible = true;
    const u = this.mat.uniforms;
    u.uTime.value = T;
    u.uOpacity.value = this.opacity;
    if (mode) {
      u.uMode.value = mode;
      (u.uColor.value as Color).setHex(mode === 2 ? PAL.coneLook : PAL.coneTelegraph);
    }
    if (!mode) return; // fading out: keep the last cells
    const key = mode + ':' + cells.join(',');
    if (key === this.key) return;
    this.key = key;
    this.rebuild(s, cells);
  }

  /**
   * Mirror / webcam cones: draw `cells` (from `origin`, for the distance fade) while `on`, fading in and out.
   * No room dim. Rebuilt only when the cell set changes.
   */
  updateCells(s: SimState, cells: ArrayLike<number>, on: boolean, T: number, dtTicks: number, origin: { x: number; z: number }): void {
    this.opacity += ((on ? 1 : 0) - this.opacity) * Math.min(1, dtTicks * 0.25);
    if (!on && this.opacity < 0.02) {
      this.geo.setDrawRange(0, 0);
      this.key = '';
      this.mesh.visible = false;
      return;
    }
    this.mesh.visible = true;
    const u = this.mat.uniforms;
    u.uTime.value = T;
    u.uOpacity.value = this.opacity;
    u.uMode.value = 2;
    if (!on) return;
    const list = Array.from(cells).slice(0, this.cap);
    const key = `${origin.x},${origin.z}:` + list.join(',');
    if (key === this.key) return;
    this.key = key;
    this.rebuild(s, list, origin);
  }

  private rebuild(s: SimState, cells: number[], origin?: { x: number; z: number }): void {
    const { w, d } = s.grid;
    const set = new Set(cells);
    const pos = this.geo.getAttribute('position') as BufferAttribute;
    const uv = this.geo.getAttribute('aUv') as BufferAttribute;
    const edge = this.geo.getAttribute('aEdge') as BufferAttribute;
    const fade = this.geo.getAttribute('aFade') as BufferAttribute;
    const h = origin ?? s.humans[0];
    const range = origin ? 5 : 10;
    const half = 0.2;
    let n = 0;
    for (const c of set) {
      if (n >= this.cap) break;
      const x = c % w;
      const z = (c / w) | 0;
      const lv = s.grid.level[c] ?? 0;
      const y = levelY(lv) + 0.012;
      const cx = cellX(x, w);
      const cz = cellZ(z, d);
      const eN = set.has(c - w) && z > 0 && s.grid.level[c - w] === lv ? 0 : 1;
      const eS = set.has(c + w) && z < d - 1 && s.grid.level[c + w] === lv ? 0 : 1;
      const eW = set.has(c - 1) && x > 0 && s.grid.level[c - 1] === lv ? 0 : 1;
      const eE = set.has(c + 1) && x < w - 1 && s.grid.level[c + 1] === lv ? 0 : 1;
      const dist = h ? Math.min(1, Math.hypot(x - h.x, z - h.z) / range) : 0;
      const corners: [number, number, number, number][] = [
        [-half, -half, 0, 0],
        [half, -half, 1, 0],
        [-half, half, 0, 1],
        [half, half, 1, 1],
      ];
      for (let k = 0; k < 4; k++) {
        const vi = n * 4 + k;
        pos.setXYZ(vi, cx + corners[k][0], y, cz + corners[k][1]);
        uv.setXY(vi, corners[k][2], corners[k][3]);
        edge.setXYZW(vi, eN, eE, eS, eW);
        fade.setX(vi, dist);
      }
      n++;
    }
    pos.needsUpdate = true;
    uv.needsUpdate = true;
    edge.needsUpdate = true;
    fade.needsUpdate = true;
    this.geo.setDrawRange(0, n * 6);
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
    this.dim.geometry.dispose();
    this.dimMat.dispose();
  }
}
