/**
 * Everything drawn for one race: the world, 8 kart views, item boxes (instanced yarn cubes), blob shadows
 * (instanced), and drift sparks (one Points pool). Interpolates kart transforms between the last two sim ticks.
 */
import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  DynamicDrawUsage,
  InstancedMesh,
  MeshBasicMaterial,
  Object3D,
  Points,
  ShaderMaterial,
  type Scene,
} from 'three';
import type { KartState, RaceState } from '../../types';
import { DRIFT } from '../../tuning';
import type { BuiltTrack } from '../track/build';
import { KartView } from './kart-view';
import { buildWorldView, type WorldView } from './world-view';
import { toonMaterial } from './toon';
import type { RacerInfo } from '../../types';

export interface KartSnap {
  x: number;
  y: number;
  z: number;
  heading: number;
}

const MAX_SPARKS = 700;
const _o = new Object3D();
const _c = new Color();

export class RaceView {
  readonly world: WorldView;
  readonly karts: KartView[];
  private readonly boxes: InstancedMesh;
  private readonly shadows: InstancedMesh;
  private readonly sparks: Points;
  private readonly sparkPos: Float32Array;
  private readonly sparkCol: Float32Array;
  private readonly sparkVel: Float32Array;
  private readonly sparkLife: Float32Array;
  private sparkNext = 0;
  private time = 0;
  /** previous and current tick transforms, for interpolation */
  prev: KartSnap[] = [];
  cur: KartSnap[] = [];

  constructor(
    readonly scene: Scene,
    readonly track: BuiltTrack,
    racers: RacerInfo[],
  ) {
    this.world = buildWorldView(scene, track);
    this.karts = racers.map((r) => {
      const v = new KartView(r);
      scene.add(v.root);
      return v;
    });

    // item boxes: glowing yarn cubes
    const bg = new BoxGeometry(1.3, 1.3, 1.3);
    const cols: number[] = [];
    const pal = [0xff3ea5, 0xffc93c, 0x3aa8ff, 0x3bb273, 0xff8a3d, 0xb07fd8];
    const pos = bg.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      _c.setHex(pal[Math.floor(i / 4) % pal.length]);
      cols.push(_c.r, _c.g, _c.b);
    }
    bg.setAttribute('color', new BufferAttribute(new Float32Array(cols), 3));
    this.boxes = new InstancedMesh(bg, toonMaterial({ vertexColors: true, emissive: 0x442233 }), Math.max(1, track.boxes.length));
    this.boxes.instanceMatrix.setUsage(DynamicDrawUsage);
    this.boxes.frustumCulled = false;
    scene.add(this.boxes);

    // blob shadows
    const sg = new CircleGeometry(1.25, 16);
    sg.rotateX(-Math.PI / 2);
    this.shadows = new InstancedMesh(sg, new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false }), racers.length);
    this.shadows.instanceMatrix.setUsage(DynamicDrawUsage);
    this.shadows.frustumCulled = false;
    this.shadows.renderOrder = 1;
    scene.add(this.shadows);

    // sparks
    this.sparkPos = new Float32Array(MAX_SPARKS * 3);
    this.sparkCol = new Float32Array(MAX_SPARKS * 3);
    this.sparkVel = new Float32Array(MAX_SPARKS * 3);
    this.sparkLife = new Float32Array(MAX_SPARKS);
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(this.sparkPos, 3).setUsage(DynamicDrawUsage));
    g.setAttribute('color', new BufferAttribute(this.sparkCol, 3).setUsage(DynamicDrawUsage));
    g.setAttribute('life', new BufferAttribute(this.sparkLife, 1).setUsage(DynamicDrawUsage));
    this.sparks = new Points(
      g,
      new ShaderMaterial({
        uniforms: { uScale: { value: 300 } },
        vertexShader: /* glsl */ `attribute vec3 color; attribute float life; varying vec3 vC; varying float vL; uniform float uScale;
          void main(){ vC = color; vL = life; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = life > 0.0 ? uScale * (0.12 + 0.25 * life) / -mv.z : 0.0; gl_Position = projectionMatrix * mv; }`,
        fragmentShader: /* glsl */ `varying vec3 vC; varying float vL; void main(){ vec2 d = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.0, length(d)); if (vL <= 0.0 || a <= 0.0) discard; gl_FragColor = vec4(vC * (1.0 + vL), a * min(1.0, vL * 2.5)); }`,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    );
    this.sparks.frustumCulled = false;
    scene.add(this.sparks);
  }

  /** Copy the sim state into `cur` (call after every sim step; `prev` gets the old `cur`). */
  capture(st: RaceState): void {
    const tmp = this.prev;
    this.prev = this.cur;
    this.cur = tmp;
    for (let i = 0; i < st.karts.length; i++) {
      const k = st.karts[i];
      const s = this.cur[i] ?? (this.cur[i] = { x: 0, y: 0, z: 0, heading: 0 });
      s.x = k.x;
      s.y = k.y;
      s.z = k.z;
      s.heading = k.heading;
      if (!this.prev[i]) this.prev[i] = { ...s };
    }
  }

  /** Interpolated transform of kart i at alpha (0..1 between prev and cur). */
  lerpKart(i: number, alpha: number, out: KartSnap): KartSnap {
    const a = this.prev[i];
    const b = this.cur[i];
    let dh = b.heading - a.heading;
    if (dh > Math.PI) dh -= Math.PI * 2;
    else if (dh < -Math.PI) dh += Math.PI * 2;
    out.x = a.x + (b.x - a.x) * alpha;
    out.y = a.y + (b.y - a.y) * alpha;
    out.z = a.z + (b.z - a.z) * alpha;
    out.heading = a.heading + dh * alpha;
    return out;
  }

  private snap: KartSnap = { x: 0, y: 0, z: 0, heading: 0 };

  update(st: RaceState, alpha: number, dt: number, topSpeed: number): void {
    this.time += dt;
    const t = this.track;
    for (let i = 0; i < this.karts.length; i++) {
      const k = st.karts[i];
      const s = this.lerpKart(i, alpha, this.snap);
      const si = k.si;
      const j = (si + 4) % t.n;
      const pitch = -Math.atan2(t.py[j] - t.py[si], 4 * t.step);
      // roll from banking, projected on the kart's facing
      const fwd = Math.cos(s.heading) * t.tz[si] + Math.sin(s.heading) * t.tx[si];
      const roll = -Math.atan(t.bank[si]) * Math.sign(fwd || 1);
      const speed = Math.hypot(k.vx, k.vz);
      const v = this.karts[i];
      const hidden = k.respawnTicks > 0;
      v.root.visible = !hidden;
      v.update(k, s.x, s.y, s.z, s.heading, k.air ? 0 : pitch * Math.sign(fwd || 1), k.air ? 0 : roll, speed, dt, topSpeed);
      // shadow on the ground under the kart
      _o.position.set(s.x, (k.air ? Math.min(s.y, k.y) : s.y) + 0.04 - (k.air ? Math.min(3, k.airTicks * 0.05) : 0), s.z);
      const sh = k.air ? 0.7 : 1;
      _o.scale.set(hidden ? 0 : sh, 1, hidden ? 0 : sh * 1.3);
      _o.rotation.set(0, s.heading, 0);
      _o.updateMatrix();
      this.shadows.setMatrixAt(i, _o.matrix);
      // drift sparks from the rear wheels
      if (k.driftDir !== 0 && !k.air && speed > 6) {
        const tier = k.driftTier;
        const col = tier > 0 ? DRIFT.colors[tier - 1] : 0xfff3dc;
        const n = tier === 3 ? 3 : tier > 0 ? 2 : 1;
        const sx = Math.sin(s.heading);
        const sz = Math.cos(s.heading);
        for (const side of [-1, 1]) {
          const wx = s.x - sx * 0.9 + -sz * 0.85 * side;
          const wz = s.z - sz * 0.9 + sx * 0.85 * side;
          for (let e = 0; e < n; e++) this.emit(wx, s.y + 0.1, wz, -sx * 2 + (Math.random() - 0.5) * 4, 1.5 + Math.random() * 3, -sz * 2 + (Math.random() - 0.5) * 4, col);
        }
      }
    }
    this.shadows.instanceMatrix.needsUpdate = true;

    // item boxes: spin and bob; hidden while respawning, pop back in
    for (let b = 0; b < st.boxes.length; b++) {
      const box = st.boxes[b];
      const sc = box.respawn > 0 ? 0 : 1;
      _o.position.set(box.x, box.y + Math.sin(this.time * 2.4 + b) * 0.15, box.z);
      _o.rotation.set(this.time * 0.9 + b, this.time * 1.3 + b * 0.7, 0);
      _o.scale.setScalar(sc);
      _o.updateMatrix();
      this.boxes.setMatrixAt(b, _o.matrix);
    }
    this.boxes.instanceMatrix.needsUpdate = true;

    // sparks
    for (let p = 0; p < MAX_SPARKS; p++) {
      if (this.sparkLife[p] <= 0) continue;
      this.sparkLife[p] -= dt * 3;
      this.sparkVel[p * 3 + 1] -= 18 * dt;
      this.sparkPos[p * 3] += this.sparkVel[p * 3] * dt;
      this.sparkPos[p * 3 + 1] += this.sparkVel[p * 3 + 1] * dt;
      this.sparkPos[p * 3 + 2] += this.sparkVel[p * 3 + 2] * dt;
    }
    const g = this.sparks.geometry;
    g.getAttribute('position').needsUpdate = true;
    g.getAttribute('color').needsUpdate = true;
    g.getAttribute('life').needsUpdate = true;
  }

  /** Spawn one spark (render-only randomness is fine here). */
  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, color: number): void {
    const p = this.sparkNext;
    this.sparkNext = (p + 1) % MAX_SPARKS;
    this.sparkPos[p * 3] = x;
    this.sparkPos[p * 3 + 1] = y;
    this.sparkPos[p * 3 + 2] = z;
    this.sparkVel[p * 3] = vx;
    this.sparkVel[p * 3 + 1] = vy;
    this.sparkVel[p * 3 + 2] = vz;
    _c.setHex(color);
    this.sparkCol[p * 3] = _c.r;
    this.sparkCol[p * 3 + 1] = _c.g;
    this.sparkCol[p * 3 + 2] = _c.b;
    this.sparkLife[p] = 1;
  }

  /** A burst (wall hit, mini-turbo release, pickup). */
  burst(x: number, y: number, z: number, color: number, n: number, speed = 6): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const u = Math.random();
      this.emit(x, y, z, Math.cos(a) * speed * u, 2 + Math.random() * speed * 0.7, Math.sin(a) * speed * u, color);
    }
  }

  kartState(st: RaceState, i: number): KartState {
    return st.karts[i];
  }

  dispose(): void {
    this.world.dispose();
    for (const k of this.karts) {
      this.scene.remove(k.root);
      k.dispose();
    }
    for (const o of [this.boxes, this.shadows, this.sparks]) {
      this.scene.remove(o);
      o.geometry.dispose();
    }
  }
}
