/**
 * Paw TAP! rings (iteration 4, F3 view; juice lane). Every ramp lip, set-piece kicker and jump-gap lip gets a ring
 * decal laid flat on the run-up, ending at the lip: a paw at the far end, "TAP!" in the middle, stretched along the
 * road so the chase camera's low angle reads it round. It wakes up as the player's kart comes within 60 m (brighter,
 * a slow pulse), flashes and throbs inside the trick window (from just before the lip until the kart is past it),
 * then dims. The kart drives over it. (It first stood upright across the lip; the playtest found the hoop covering
 * the kart and the road ahead at every launch, so it lies on the ramp now.)
 *
 * One InstancedMesh for the whole track (1 draw call), a canvas texture made once per race, static instance
 * matrices; only a per-instance `aPulse` changes per frame. The low tier keeps the rings but drops the pulse;
 * reduced motion keeps the brightness change, never the size throb. Render-only: nothing here touches the sim.
 */
import {
  CanvasTexture,
  DoubleSide,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  Vector3,
  type Scene,
} from 'three';
import type { BuiltTrack } from '../../core/track/build';
import type { KartState } from '../../types';
import { BOOST } from '../../tuning';

export interface Lip {
  /** main-loop sample of the lip */
  i: number;
  x: number;
  y: number;
  z: number;
  /** lateral offset of the ramp's centre (m) and its half width */
  d: number;
  halfW: number;
  /** ring diameter (m) */
  size: number;
  /** the run-up's rise per metre just before the lip (the decal lies on it) and how many metres of it there are */
  slope: number;
  run: number;
}

/** Every lip on the main loop: ramps (`t.ramps`, plain ramps and kickers) and jump gaps (`kind 'jump'`, gap > 0). */
export function lipsOf(t: BuiltTrack): Lip[] {
  const out: Lip[] = [];
  const wrap = (i: number) => ((i % t.n) + t.n) % t.n;
  const at = (i: number, d: number, y: number, halfW: number, slope: number, run: number) => {
    const j = wrap(i);
    const sl = Number.isFinite(slope) ? Math.max(0, Math.min(0.7, slope)) : 0;
    out.push({ i: j, x: t.px[j] - t.tz[j] * d, y, z: t.pz[j] + t.tx[j] * d, d, halfW, size: Math.max(2.2, Math.min(3.4, halfW * 1.1)), slope: sl, run: Math.max(1.5, run) });
  };
  for (const r of t.ramps) {
    const j = wrap(r.i);
    const run = Math.max(1, r.len) * t.step;
    at(j, r.d, t.py[j] + r.d * (t.bank?.[j] ?? 0) + r.height, r.halfW, r.height / run + (t.py[j] - t.py[wrap(j - r.len)]) / run, run);
  }
  for (const pc of t.pieces ?? []) {
    if (pc.kind !== 'jump' || pc.gap <= 0) continue;
    const j = wrap(pc.i0);
    const y = Number.isFinite(pc.lipY) ? pc.lipY : t.py[j];
    const back = Math.max(1, Math.round(4 / t.step));
    at(j, 0, y, t.halfW[j], (y - t.py[wrap(j - back)]) / (back * t.step), 6);
  }
  return out;
}

/** Metres from the kart to the lip along the main loop (negative once past, wraps at half a lap). */
export function aheadOf(t: Pick<BuiltTrack, 'step' | 'length'>, lipI: number, s: number): number {
  let d = lipI * t.step - s;
  if (d < -t.length / 2) d += t.length;
  if (d > t.length / 2) d -= t.length;
  return d;
}

/**
 * The ring's glow for a kart `ahead` metres before the lip at `speed` m/s: 0.2 asleep, rising to 0.7 from 60 m, 1 in
 * the trick window (0.12 s of travel before the lip, plus a little lead so the flash lands before the tap, through
 * 0.45 s after it), 0.25 once past. Pure.
 */
export function lipPulse(ahead: number, speed: number): number {
  const pre = Math.max(2, speed * (BOOST.trick.pre + 0.18));
  const post = Math.max(1, speed * BOOST.trick.window);
  if (ahead <= pre && ahead >= -post) return 1;
  if (ahead < -post) return 0.25;
  if (ahead > 60) return 0.2;
  return 0.2 + 0.5 * (1 - (ahead - pre) / Math.max(1, 60 - pre));
}

function ringTexture(label: string): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  if (!g) return null;
  const cx = 128;
  // the hoop: ink outline, pink band, cream inner line
  g.lineWidth = 30;
  g.strokeStyle = '#2a1a22';
  g.beginPath();
  g.arc(cx, cx, 100, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 18;
  g.strokeStyle = '#ff3ea5';
  g.stroke();
  g.lineWidth = 4;
  g.strokeStyle = '#fff3dc';
  g.beginPath();
  g.arc(cx, cx, 100, 0, Math.PI * 2);
  g.stroke();
  // a paw on top of the hoop
  const paw = (x: number, y: number, s: number) => {
    g.fillStyle = '#2a1a22';
    g.beginPath();
    g.ellipse(x, y + 6 * s, 17 * s, 14 * s, 0, 0, Math.PI * 2);
    for (const [tx, ty] of [
      [-16, -10],
      [-6, -19],
      [6, -19],
      [16, -10],
    ])
      g.ellipse(x + tx * s, y + ty * s, 7 * s, 8 * s, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ffd23f';
    g.beginPath();
    g.ellipse(x, y + 6 * s, 13 * s, 10 * s, 0, 0, Math.PI * 2);
    g.fill();
    for (const [tx, ty] of [
      [-16, -10],
      [-6, -19],
      [6, -19],
      [16, -10],
    ]) {
      g.beginPath();
      g.ellipse(x + tx * s, y + ty * s, 4.5 * s, 5.5 * s, 0, 0, Math.PI * 2);
      g.fill();
    }
  };
  paw(cx, 28, 1.05);
  // TAP! across the middle, in the HUD's chunky outlined style
  g.font = '900 54px system-ui, -apple-system, "Segoe UI", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = 12;
  g.strokeStyle = '#2a1a22';
  g.strokeText(label, cx, cx + 6);
  g.fillStyle = '#fff3dc';
  g.fillText(label, cx, cx + 6);
  const tex = new CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}

const _m = new Matrix4();
const _q = new Quaternion();
const _p = new Vector3();
const _s = new Vector3();
const _f = new Vector3();
const _up = new Vector3(0, 1, 0);
const _r = new Vector3();
const _u = new Vector3();
const _basis = new Matrix4();

/**
 * The decal's pose for a lip (pure): flat on the run-up (its normal is the ramp's), its far edge at the lip, about
 * 1.7 ring diameters long (never longer than the run-up) and one diameter wide. Writes `out` and returns it.
 */
export function lipMatrix(l: Lip, fx: number, fz: number, out: Matrix4): Matrix4 {
  _f.set(fx, 0, fz).normalize();
  _r.crossVectors(_f, _up).normalize();
  // forward along the slope, the normal = right × forward (up-ish)
  _f.y = l.slope;
  _f.normalize();
  _u.crossVectors(_r, _f).normalize();
  _basis.makeBasis(_r, _f, _u);
  _q.setFromRotationMatrix(_basis);
  const len = Math.min(l.size * 1.7, l.run * 0.95);
  const wid = Math.min(l.size, Math.max(1.6, l.halfW * 1.8));
  // centre half a length back down the slope from the lip, lifted off the surface
  _p.set(l.x, l.y, l.z).addScaledVector(_f, -len / 2).addScaledVector(_u, 0.06);
  _s.set(wid, len, 1);
  return out.compose(_p, _q, _s);
}

export class PawRings {
  readonly lips: Lip[];
  readonly mesh: InstancedMesh | null = null;
  private readonly pulse: Float32Array;
  private readonly attr: InstancedBufferAttribute | null = null;
  private readonly mat: ShaderMaterial | null = null;
  private readonly tex: CanvasTexture | null = null;
  private time = 0;
  /** the low tier: no pulse */
  animate = true;

  constructor(
    private readonly scene: Scene,
    private readonly track: BuiltTrack,
    label: string,
  ) {
    this.lips = lipsOf(track);
    this.pulse = new Float32Array(Math.max(1, this.lips.length));
    if (!this.lips.length) return;
    this.tex = ringTexture(label);
    if (!this.tex) return;
    this.mat = new ShaderMaterial({
      uniforms: { uMap: { value: this.tex }, uTime: { value: 0 }, uThrob: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute float aPulse; uniform float uTime; uniform float uThrob; varying vec2 vUv; varying float vP; varying float vZ;
        void main(){
          vUv = uv; vP = aPulse;
          float hot = step(0.99, aPulse);
          float s = 1.0 + uThrob * (hot * 0.14 * (0.5 + 0.5 * sin(uTime * 22.0)) + (1.0 - hot) * aPulse * 0.05 * sin(uTime * 5.0));
          vec4 mv = modelViewMatrix * instanceMatrix * vec4(position * s, 1.0);
          vZ = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap; varying vec2 vUv; varying float vP; varying float vZ;
        void main(){
          vec4 c = texture2D(uMap, vUv);
          float hot = step(0.99, vP);
          // hot: a little brighter, never washed out (the pink band and the ink outline keep TAP! readable)
          vec3 col = c.rgb * (0.78 + 0.3 * vP) + hot * 0.06;
          // right at the lens (the kart is about to jump through it) the hoop fades so it never fills the screen
          float a = c.a * (0.4 + 0.6 * vP) * smoothstep(2.5, 7.0, vZ);
          if (a < 0.02) discard;
          gl_FragColor = vec4(min(col, vec3(1.0)), a);
        }`,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      toneMapped: false,
      // a decal on the ramp: drawn just in front of the surface it lies on
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const geo = new PlaneGeometry(1, 1);
    this.attr = new InstancedBufferAttribute(this.pulse, 1).setUsage(DynamicDrawUsage) as InstancedBufferAttribute;
    geo.setAttribute('aPulse', this.attr);
    const mesh = new InstancedMesh(geo, this.mat, this.lips.length);
    mesh.name = 'paw-rings';
    mesh.frustumCulled = false;
    mesh.renderOrder = 15;
    this.lips.forEach((l, n) => {
      lipMatrix(l, track.tx[l.i], track.tz[l.i], _m);
      mesh.setMatrixAt(n, _m);
      this.pulse[n] = 0.2;
    });
    mesh.instanceMatrix.needsUpdate = true;
    this.mesh = mesh;
    scene.add(mesh);
  }

  /** Every frame: wake the rings ahead of the player's kart (main loop only). */
  update(k: KartState, dt: number, reducedMotion: boolean): void {
    if (!this.mesh || !this.attr || !this.mat) return;
    this.time += dt;
    this.mat.uniforms.uTime.value = this.time;
    this.mat.uniforms.uThrob.value = this.animate && !reducedMotion ? 1 : 0;
    const speed = Math.hypot(k.vx, k.vz);
    for (let n = 0; n < this.lips.length; n++) {
      const l = this.lips[n];
      let p = 0.2;
      if (k.branch < 0 && !k.finished) {
        const ahead = aheadOf(this.track, l.i, k.s);
        // a side ramp wakes only for a kart lined up with it
        const lined = Math.abs(k.d - l.d) <= l.halfW + 1.5;
        p = lined ? lipPulse(ahead, speed) : Math.min(0.45, lipPulse(ahead, speed));
        if (!this.animate) p = Math.min(0.7, p);
      }
      this.pulse[n] = p;
    }
    this.attr.needsUpdate = true;
  }

  /** The ring glow values (QA, e2e). */
  get levels(): readonly number[] {
    return Array.from(this.pulse.subarray(0, this.lips.length));
  }

  detach(): void {
    this.mesh?.removeFromParent();
  }

  dispose(): void {
    this.detach();
    this.mesh?.geometry.dispose();
    this.mat?.dispose();
    this.tex?.dispose();
    void this.scene;
  }
}
