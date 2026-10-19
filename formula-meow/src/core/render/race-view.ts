/**
 * Everything drawn for one race (feel lane): the world, 8 kart views, item boxes (instanced yarn cubes that shatter
 * into shards when a kart breaks one), blob shadows (instanced), and the pooled particles: drift sparks (one Points
 * pool, in the drift tier colours from `driftTierColors()`), puffs (exhaust on gas, dust off-road, splashes on low
 * grip, landing puffs, catnip clouds, hairball fluff), shards, and glyph billboards (cosmetic trails, catnip spiral
 * eyes, the Laser Dot's dot on a windscreen). The respawn hand carries karts back (respawn-hand.ts).
 * Interpolates kart transforms between the last two sim ticks. Never writes the sim.
 *
 * Draw calls: karts (body, axles, fur, face, outlines, hat), plus 1 each for boxes, shadows, sparks, puffs, shards and
 * glyphs, plus a respawn hand while one is on screen.
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
  Vector3,
  type Scene,
} from 'three';
import { Surface, type KartState, type RaceEvent, type RaceState } from '../../types';
import type { BuiltTrack } from '../track/build';
import { KartView } from './kart-view';
import { buildWorldView, type WorldView } from './world-view';
import { toonMaterial } from './toon';
import { disposeMaterial } from '../track/mesh';
import type { RacerInfo } from '../../types';
import { driftTierColors, reducedMotion } from '../../ui/a11y';
import { ParticlePool, puffPool, shardPool } from './particles';
import { Glyph, Glyphs, TRAIL_GLYPH } from './glyphs';
import { buildHand, carryPose, type CarryPose } from './respawn-hand';
import { ProjKind, itemsOf } from '../../items-ai/items/state';

export interface KartSnap {
  x: number;
  y: number;
  z: number;
  heading: number;
}

const MAX_SPARKS = 700;
const _o = new Object3D();
const _c = new Color();
const _v = new Vector3();
const BOX_PAL = [0xff3ea5, 0xffc93c, 0x3aa8ff, 0x3bb273, 0xff8a3d, 0xb07fd8];
const RAINBOW = [0xff3b5c, 0xff9f1c, 0xffe14d, 0x3bd16f, 0x3aa8ff, 0x9b5de5];
/** particles only within this distance of the camera kart (m) */
const NEAR = 45;

/** Per-kart render memory for the particle emitters. */
interface Emit {
  exhaust: number;
  dust: number;
  trail: number;
  trailN: number;
  catnip: number;
  /** respawn: the spot the kart was lifted from, the hand rising after the drop (s) */
  from: KartSnap | null;
  handUp: number;
}

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
  readonly puffs: ParticlePool;
  readonly shards: ParticlePool;
  readonly glyphs: Glyphs;
  private readonly emitters: Emit[];
  private readonly boxWas: Uint8Array;
  private readonly hands = new Map<number, Object3D>();
  private readonly carry: CarryPose = { x: 0, y: 0, z: 0, heading: 0, hx: 0, hy: 0, hz: 0, hVisible: false };
  private sparkNext = 0;
  private time = 0;
  /** the camera kart (particles are spent near it) */
  me = 0;
  /** previous and current tick transforms, for interpolation */
  prev: KartSnap[] = [];
  cur: KartSnap[] = [];
  /** what was drawn this frame per kart (the camera follows it during the respawn carry) */
  readonly shown: KartSnap[];

  constructor(
    readonly scene: Scene,
    readonly track: BuiltTrack,
    readonly racers: RacerInfo[],
  ) {
    this.world = buildWorldView(scene, track);
    this.karts = racers.map((r) => {
      const v = new KartView(r);
      scene.add(v.root);
      return v;
    });
    this.emitters = racers.map(() => ({ exhaust: 0, dust: 0, trail: 0, trailN: 0, catnip: 0, from: null, handUp: 0 }));
    this.shown = racers.map(() => ({ x: 0, y: 0, z: 0, heading: 0 }));

    // item boxes: glowing yarn cubes
    const bg = new BoxGeometry(1.3, 1.3, 1.3);
    const cols: number[] = [];
    const pos = bg.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      _c.setHex(BOX_PAL[Math.floor(i / 4) % BOX_PAL.length]);
      cols.push(_c.r, _c.g, _c.b);
    }
    bg.setAttribute('color', new BufferAttribute(new Float32Array(cols), 3));
    this.boxes = new InstancedMesh(bg, toonMaterial({ vertexColors: true, emissive: 0x442233 }), Math.max(1, track.boxes.length));
    this.boxes.instanceMatrix.setUsage(DynamicDrawUsage);
    this.boxes.frustumCulled = false;
    scene.add(this.boxes);
    this.boxWas = new Uint8Array(Math.max(1, track.boxes.length));

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

    this.puffs = puffPool(scene);
    this.shards = shardPool(scene);
    this.glyphs = new Glyphs(scene);
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

  /** Where kart i was drawn this frame (the respawn carry moves it away from its sim position). */
  displayPos(i: number, out: KartSnap): KartSnap {
    const s = this.shown[i];
    out.x = s.x;
    out.y = s.y;
    out.z = s.z;
    out.heading = s.heading;
    return out;
  }

  private snap: KartSnap = { x: 0, y: 0, z: 0, heading: 0 };

  /** Race events that start a render effect (routed from the JuiceBus by the feel lane). */
  onEvent(e: RaceEvent, st: RaceState): void {
    const i = e.kart;
    if (i < 0 || i >= this.karts.length) return;
    this.karts[i].onEvent(e);
    const k = st.karts[i];
    const near = this.nearMe(st, i);
    switch (e.type) {
      case 'land':
        if ((e.a ?? 0) > 24 && near) this.puffs.ring(k.x, k.y + 0.15, k.z, (e.a ?? 0) > 45 ? 10 : 6, 3.5, 0xfff3dc, 0.35, 0.55, 0.5);
        break;
      case 'hit':
        if (near && (e.a === 0 || e.a === 1)) {
          // fluff and debris
          this.puffs.ring(k.x, k.y + 0.7, k.z, 7, 3, e.a === 1 ? 0xc8f0a8 : 0xf1dcc0, 0.2, 0.55, 1.2);
          for (let s = 0; s < 4; s++) this.shards.spawn(k.x, k.y + 0.8, k.z, (Math.random() - 0.5) * 7, 4 + Math.random() * 3, (Math.random() - 0.5) * 7, e.a === 1 ? 0x3f9a3a : 0x8a5a3c, 0.16, 0.8);
        }
        break;
      case 'itemUse':
        if (e.item === 'catnip') {
          this.emitters[i].catnip = 1.0;
          if (near) for (let c = 0; c < 3; c++) this.puffs.spawn(k.x + (c - 1) * 0.9, k.y + 1.2 + c * 0.2, k.z, (c - 1) * 0.8, 1.1, 0, 0x7dff6a, 0.45, 0.9);
        }
        break;
      case 'blocked':
        if (near && k.shieldTicks > 0) for (let s = 0; s < 6; s++) this.shards.spawn(k.x, k.y + 1.0, k.z, (Math.random() - 0.5) * 8, 3 + Math.random() * 4, (Math.random() - 0.5) * 8, 0xc89a5b, 0.22, 0.7);
        break;
      case 'trick':
        if (near) for (let s = 0; s < 5; s++) this.glyphs.spawn(k.x, k.y + 1.6, k.z, (Math.random() - 0.5) * 5, 2 + Math.random() * 2, (Math.random() - 0.5) * 5, Glyph.Sparkle, s % 2 ? 0xffe14d : 0xffffff, 0.5, 0.6, 3);
        break;
      case 'respawnStart':
        this.emitters[i].from = { x: k.x, y: k.y, z: k.z, heading: k.heading };
        break;
      case 'overtake':
        if (i === this.me) this.glyphs.spawn(k.x, k.y + 2.6, k.z, 0, 1.6, 0, Glyph.Bang, 0xffe14d, 0.7, 0.6);
        break;
      case 'grudge':
        // the rival you just hit is coming for you: an angry "!" over its head
        this.glyphs.spawn(k.x, k.y + 2.7, k.z, 0, 0.8, 0, Glyph.Bang, 0xff3b5c, 0.9, 1.4);
        break;
      case 'coin':
        // a gold glint on the kart (the coin's own shard burst is the tracks lane's coin view)
        if (near) this.burst(k.x, k.y + 0.8, k.z, 0xffd23f, 6, 4);
        break;
    }
  }

  private nearMe(st: RaceState, i: number): boolean {
    const m = st.karts[this.me];
    const k = st.karts[i];
    if (!m || !k) return true;
    const dx = k.x - m.x;
    const dz = k.z - m.z;
    return dx * dx + dz * dz < NEAR * NEAR;
  }

  update(st: RaceState, alpha: number, dt: number, topSpeed: number): void {
    this.time += dt;
    const t = this.track;
    const tiers = driftTierColors();
    const calm = reducedMotion();
    const laser = this.laserOf(st);
    for (let i = 0; i < this.karts.length; i++) {
      const k = st.karts[i];
      const em = this.emitters[i];
      let s = this.lerpKart(i, alpha, this.snap);
      const si = k.si;
      const j = (si + 4) % t.n;
      let pitch = -Math.atan2(t.py[j] - t.py[si], 4 * t.step);
      // roll from banking, projected on the kart's facing
      const fwd = Math.cos(s.heading) * t.tz[si] + Math.sin(s.heading) * t.tx[si];
      let roll = -Math.atan(t.bank[si]) * Math.sign(fwd || 1);
      const speed = Math.hypot(k.vx, k.vz);
      const v = this.karts[i];
      // respawn: the big hand carries the kart to its new spot
      let carried = false;
      if (k.respawnTicks > 0) {
        const from = em.from ?? (em.from = { x: k.x, y: k.y, z: k.z, heading: k.heading });
        carryPose(t, si, from, k.respawnTicks - alpha, this.carry);
        s = this.snap;
        s.x = this.carry.x;
        s.y = this.carry.y;
        s.z = this.carry.z;
        s.heading = this.carry.heading;
        pitch = 0;
        roll = Math.sin(this.time * 7) * 0.12;
        carried = true;
        this.placeHand(i, this.carry.hx, this.carry.hy, this.carry.hz, s.heading, true);
      } else if (em.from) {
        em.from = null;
        em.handUp = 0.35;
      }
      if (em.handUp > 0) {
        em.handUp = Math.max(0, em.handUp - dt);
        const h = this.hands.get(i);
        if (h) {
          h.position.y += dt * 14;
          h.visible = em.handUp > 0;
        }
      } else if (!carried) this.hideHand(i);
      v.root.visible = true;
      v.lookAtDot(k.chaseTicks > 0 && laser ? laser.x : null, laser ? laser.z : 0);
      v.update(k, s.x, s.y, s.z, s.heading, k.air || carried ? 0 : pitch * Math.sign(fwd || 1), k.air ? 0 : roll, carried ? 0 : speed, dt, topSpeed);
      const shown = this.shown[i];
      shown.x = s.x;
      shown.y = s.y;
      shown.z = s.z;
      shown.heading = s.heading;
      // shadow on the ground under the kart
      const ground = carried ? Math.min(s.y, k.y) : k.air ? Math.min(s.y, k.y) : s.y;
      _o.position.set(s.x, ground + 0.04 - (k.air ? Math.min(3, k.airTicks * 0.05) : 0), s.z);
      const lift = carried ? Math.max(0.3, 1 - (s.y - ground) / 5) : k.air ? 0.7 : 1;
      _o.scale.set(lift, 1, lift * 1.3);
      _o.rotation.set(0, s.heading, 0);
      _o.updateMatrix();
      this.shadows.setMatrixAt(i, _o.matrix);
      if (carried || dt <= 0) continue;

      // a kart faded out next to the lens (B59) leaves no puffs or trail in front of it either
      const near = this.nearMe(st, i) && !v.fadedOut;
      const sx = Math.sin(s.heading);
      const sz = Math.cos(s.heading);
      // drift sparks from the rear wheels, in the (colour-blind aware) tier colours
      if (k.driftDir !== 0 && !k.air && speed > 6 && !v.fadedOut) {
        const tier = k.driftTier;
        const col = tier > 0 ? tiers[tier - 1] : 0xfff3dc;
        const n = tier === 3 ? 3 : tier > 0 ? 2 : 1;
        for (let side = -1; side <= 1; side += 2) {
          const wx = s.x - sx * 0.9 + -sz * 0.85 * side;
          const wz = s.z - sz * 0.9 + sx * 0.85 * side;
          for (let e = 0; e < n; e++) this.emit(wx, s.y + 0.1, wz, -sx * 2 + (Math.random() - 0.5) * 4, 1.5 + Math.random() * 3, -sz * 2 + (Math.random() - 0.5) * 4, col);
        }
      }
      if (!near) continue;
      // exhaust puffs while the gas is down and the kart is still picking up speed (or boosting)
      em.exhaust -= dt;
      if (em.exhaust <= 0 && !k.air && ((k.pGas && speed < topSpeed * 0.8) || k.boostTicks > 0)) {
        em.exhaust = k.boostTicks > 0 ? 0.06 : 0.11;
        for (let side = -1; side <= 1; side += 2) {
          const px = s.x - sx * 1.25 - sz * 0.3 * side;
          const pz = s.z - sz * 1.25 + sx * 0.3 * side;
          this.puffs.spawn(px, s.y + 0.4, pz, -sx * 1.5 + (Math.random() - 0.5), 0.6 + Math.random() * 0.5, -sz * 1.5 + (Math.random() - 0.5), k.boostTicks > 0 ? 0xfff0d0 : 0xd9d2e6, 0.1, 0.4);
        }
      }
      // dust off-road, splashes on low grip
      em.dust -= dt;
      if (em.dust <= 0 && !k.air && speed > 5) {
        if (k.surface === Surface.Offroad) {
          em.dust = 0.05;
          for (let side = -1; side <= 1; side += 2)
            this.puffs.spawn(s.x - sx * 0.9 - sz * 0.8 * side, s.y + 0.2, s.z - sz * 0.9 + sx * 0.8 * side, -sx * 2 + (Math.random() - 0.5) * 2, 1 + Math.random(), -sz * 2 + (Math.random() - 0.5) * 2, this.world.theme.shoulder, 0.2, 0.55);
        } else if (k.surface === Surface.LowGrip) {
          em.dust = 0.06;
          for (let side = -1; side <= 1; side += 2) {
            this.puffs.spawn(s.x - sx * 0.7 - sz * 0.85 * side, s.y + 0.15, s.z - sz * 0.7 + sx * 0.85 * side, -sz * side * 2.5, 1.8 + Math.random(), sx * side * 2.5, 0xe8f6ff, 0.22, 0.4);
            this.emit(s.x - sz * 0.9 * side, s.y + 0.2, s.z + sx * 0.9 * side, -sz * side * 3, 2 + Math.random() * 2, sx * side * 3, 0x9fd8ff);
          }
        }
      }
      // cosmetic trail (RacerInfo.trail): glyphs dropped behind the kart at speed
      const trail = this.racers[i]?.trail ?? 0;
      if (trail > 0 && speed > 8 && !calm) {
        em.trail += speed * dt;
        if (em.trail > 1.7) {
          em.trail = 0;
          em.trailN++;
          const cell = TRAIL_GLYPH[trail] ?? Glyph.Sparkle;
          const col = trail === 3 ? 0xff5fa8 : trail === 1 ? (em.trailN % 2 ? 0xffe14d : 0xffffff) : trail === 5 ? 0xffffff : 0xfff3dc;
          const side = em.trailN % 2 ? 0.35 : -0.35;
          this.glyphs.spawn(s.x - sx * 1.6 - sz * side, s.y + 0.6 + (trail === 5 ? 0.3 : 0), s.z - sz * 1.6 + sx * side, 0, 0.5, 0, cell, col, trail === 5 ? 0.7 : 0.42, 0.9, trail === 1 ? 2 : 0);
        }
      }
      // Zoomies: a rainbow of sparks streaming off the kart
      if (k.autoTicks > 0) {
        const c = RAINBOW[Math.floor(this.time * 20 + i) % RAINBOW.length];
        this.emit(s.x - sx * 1.3, s.y + 0.6 + Math.random() * 0.5, s.z - sz * 1.3, -sx * 3, 1, -sz * 3, c);
      }
      // catnip: dizzy green spirals orbit the cat's head for the length of the boost (seen from any side)
      if (em.catnip > 0) {
        em.catnip = Math.max(0, em.catnip - dt);
        this.halo(v, Glyph.Spiral, 0x9dff8a, 3, this.time * 5);
      }
      // the Laser Dot: a red dot on the windscreen of every kart it is chasing
      if (k.chaseTicks > 0) {
        _v.set(0, 1.15, 0.75);
        v.body.localToWorld(_v);
        this.glyphs.stick(_v.x, _v.y, _v.z, Glyph.Dot, 0xff1a3a, 0.55 + 0.1 * Math.sin(this.time * 30), 1);
      }
    }
    this.shadows.instanceMatrix.needsUpdate = true;

    // item boxes: spin and bob; a kart breaking one shatters it into shards
    for (let b = 0; b < st.boxes.length; b++) {
      const box = st.boxes[b];
      const gone = box.respawn > 0 ? 1 : 0;
      if (gone && !this.boxWas[b] && dt > 0) this.shatter(box.x, box.y, box.z);
      this.boxWas[b] = gone;
      // pop back in with a little overshoot
      const back = gone ? 0 : 1;
      _o.position.set(box.x, box.y + Math.sin(this.time * 2.4 + b) * 0.15, box.z);
      _o.rotation.set(this.time * 0.9 + b, this.time * 1.3 + b * 0.7, 0);
      _o.scale.setScalar(back);
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
    this.puffs.update(dt);
    this.shards.update(dt);
    this.glyphs.update(dt);
  }

  /** The live Laser Dot, if any. */
  private laserOf(st: RaceState): { x: number; z: number } | null {
    const s = itemsOf(st);
    for (const p of s.proj) if (p.kind === ProjKind.Laser) return p;
    return null;
  }

  /** `n` glyphs circling over a cat's head (catnip spirals). */
  private halo(v: KartView, cell: number, color: number, n: number, a: number): void {
    _v.set(0, 0.2, 0);
    v.cat.head.localToWorld(_v);
    for (let j = 0; j < n; j++) {
      const t = a + (j / n) * Math.PI * 2;
      this.glyphs.stick(_v.x + Math.cos(t) * 0.6, _v.y + 0.25 + Math.sin(a * 2 + j) * 0.1, _v.z + Math.sin(t) * 0.6, cell, color, 0.32, 1, a * 3);
    }
  }

  /** An item box bursts into 8 tumbling shards and a puff. */
  shatter(x: number, y: number, z: number): void {
    for (let s = 0; s < 8; s++) {
      const a = (s / 8) * Math.PI * 2;
      this.shards.spawn(x, y, z, Math.cos(a) * 5, 3 + Math.random() * 4, Math.sin(a) * 5, BOX_PAL[s % BOX_PAL.length], 0.2, 0.9);
    }
    this.puffs.spawn(x, y, z, 0, 0.5, 0, 0xfff3dc, 0.6, 0.35);
  }

  private placeHand(i: number, x: number, y: number, z: number, heading: number, on: boolean): void {
    let h = this.hands.get(i);
    if (!h) {
      h = buildHand();
      h.scale.setScalar(0.95);
      this.scene.add(h);
      this.hands.set(i, h);
    }
    h.visible = on;
    h.position.set(x, y, z);
    h.rotation.set(0, heading, 0);
  }

  private hideHand(i: number): void {
    const h = this.hands.get(i);
    if (h) h.visible = false;
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
    for (const h of this.hands.values()) {
      this.scene.remove(h);
      h.traverse((o) => (o as unknown as { geometry?: BufferGeometry }).geometry?.dispose());
    }
    this.hands.clear();
    // B57: materials and the instanced buffers too, not only the geometry
    for (const o of [this.boxes, this.shadows, this.sparks]) {
      this.scene.remove(o);
      o.geometry.dispose();
      disposeMaterial(o.material as Parameters<typeof disposeMaterial>[0]);
    }
    this.boxes.dispose();
    this.shadows.dispose();
    this.puffs.dispose();
    this.shards.dispose();
    this.glyphs.dispose();
  }
}
