/**
 * Kart VFX (GDD 11): boost flames, drift wheel glow in the tier colour, neon light trails, paw-print skids (ring
 * buffer of 120), shockwave rings, and dizzy stars over hit karts. Every effect is ONE InstancedMesh for all 8 karts,
 * so the whole file costs 6 draw calls whatever happens on track. Render-only randomness; never writes the sim.
 */
import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  ConeGeometry,
  DoubleSide,
  DynamicDrawUsage,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  NormalBlending,
  Object3D,
  PlaneGeometry,
  RingGeometry,
  Shape,
  ShapeGeometry,
  ShaderMaterial,
  Vector3,
  type Scene,
} from 'three';
import { BoostSource, type KartState, type RaceEvent, type RaceState } from '../../types';
import { driftTierColors } from '../../ui/a11y';
import type { RaceView, KartSnap } from '../../core/render/race-view';
import type { Theme } from '../../core/track/themes';

const _o = new Object3D();
const _m = new Matrix4();
const _l = new Matrix4();
const _c = new Color();
const _v = new Vector3();
const _bu = new Vector3();
const _bf = new Vector3();
const _br = new Vector3();
const LOOP_TRAIL = [0xff3ea5, 0x2cf6f3];

const FLAMES_PER_KART = 2;
const SKIDS = 120;
const RINGS = 16;
const STARS_PER_KART = 4;

/** Boost colour per source (miniTurbo uses the tier colour). */
export function boostColor(source: number, tier: number, theme: Theme): number {
  switch (source) {
    case BoostSource.MiniTurbo:
      return driftTierColors()[Math.max(0, Math.min(2, tier - 1))];
    case BoostSource.Pad:
      return theme.pad;
    case BoostSource.Pounce:
      return 0xff3ea5;
    case BoostSource.Trick:
      return 0xffc93c;
    case BoostSource.Slipstream:
      return 0xbfefff;
    case BoostSource.Catnip:
      return 0x7dff6a;
    case BoostSource.Zoomies:
      return 0xff3ea5;
    case BoostSource.Stunt:
      // iteration 3: set pieces (loop exit, clean landing, wall lane) burn electric cyan
      return 0x2cf6f3;
    default:
      return 0xffb03a;
  }
}

function pawGeometry(): BufferGeometry {
  const s = new Shape();
  s.absellipse(0, 0, 0.22, 0.18, 0, Math.PI * 2, false, 0);
  const g = new ShapeGeometry(s, 8);
  const toes: BufferGeometry[] = [];
  for (const [x, y] of [
    [-0.2, 0.22],
    [-0.07, 0.31],
    [0.07, 0.31],
    [0.2, 0.22],
  ]) {
    const t = new Shape();
    t.absellipse(x, y, 0.065, 0.08, 0, Math.PI * 2, false, 0);
    toes.push(new ShapeGeometry(t, 6));
  }
  return mergeFlat([g, ...toes]);
}

function starGeometry(): BufferGeometry {
  const s = new Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 0.07 : 0.17;
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  return new ShapeGeometry(s);
}

/** Merge non-indexed copies of flat geometries (positions only). */
function mergeFlat(parts: BufferGeometry[]): BufferGeometry {
  const pos: number[] = [];
  for (const p of parts) {
    const g = p.index ? p.toNonIndexed() : p;
    const a = g.getAttribute('position');
    for (let i = 0; i < a.count; i++) pos.push(a.getX(i), a.getY(i), a.getZ(i));
  }
  const out = new BufferGeometry();
  out.setAttribute('position', new Float32BufferAttribute(pos, 3));
  return out;
}

function inst(geo: BufferGeometry, mat: ShaderMaterial | MeshBasicMaterial, n: number, order: number): InstancedMesh {
  const m = new InstancedMesh(geo, mat, n);
  m.instanceMatrix.setUsage(DynamicDrawUsage);
  m.frustumCulled = false;
  m.renderOrder = order;
  m.count = 0;
  const cols = new Float32Array(n * 3);
  m.instanceColor = new InstancedBufferAttribute(cols, 3).setUsage(DynamicDrawUsage) as InstancedBufferAttribute;
  return m;
}

const additive = { transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide } as const;

export interface KartFxOptions {
  /** 0.4 (low) … 1 (high): skid density, trail and star counts */
  density: number;
  skids: boolean;
}

export class KartFx {
  private readonly flames: InstancedMesh;
  private readonly glow: InstancedMesh;
  private readonly trails: InstancedMesh;
  private readonly skids: InstancedMesh;
  private readonly skidAge: Float32Array;
  private readonly skidAttr: InstancedBufferAttribute;
  private readonly rings: InstancedMesh;
  private readonly ringLife: Float32Array;
  private readonly ringSize: Float32Array;
  private readonly ringPos: Float32Array;
  private readonly ringAttr: InstancedBufferAttribute;
  private readonly stars: InstancedMesh;
  private readonly flameMat: ShaderMaterial;
  private readonly all: InstancedMesh[];
  private ringNext = 0;
  private skidNext = 0;
  private time = 0;
  private readonly boostSrc: number[];
  private readonly boostTier: number[];
  private readonly lastTier: number[];
  private readonly skidDist: number[];
  private readonly skidSide: number[];
  private readonly snap: KartSnap = { x: 0, y: 0, z: 0, heading: 0 };
  opts: KartFxOptions = { density: 1, skids: true };

  constructor(
    private readonly scene: Scene,
    private readonly view: RaceView,
    private readonly theme: Theme,
  ) {
    const n = view.karts.length;
    this.boostSrc = new Array(n).fill(0);
    this.boostTier = new Array(n).fill(1);
    this.lastTier = new Array(n).fill(0);
    this.skidDist = new Array(n).fill(0);
    this.skidSide = new Array(n).fill(1);

    // flames: a cone along -z whose colour runs white-hot core → boost colour → transparent tip, flickering
    const fg = new ConeGeometry(0.2, 1, 10, 4, true);
    fg.rotateX(-Math.PI / 2);
    fg.translate(0, 0, -0.5);
    this.flameMat = new ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: /* glsl */ `
        uniform float uTime; varying vec3 vC; varying float vT;
        void main(){
          vT = clamp(-position.z, 0.0, 1.0);
          vC = vec3(1.0);
          #ifdef USE_INSTANCING_COLOR
          vC = instanceColor;
          #endif
          float id = float(gl_InstanceID);
          vec3 p = position;
          float wob = sin(uTime * 55.0 + id * 2.1 + vT * 9.0) * 0.12 * vT;
          p.x += wob; p.y += cos(uTime * 47.0 + id) * 0.08 * vT;
          p.xy *= 1.0 + 0.25 * sin(uTime * 70.0 + id * 1.3);
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vC; varying float vT;
        void main(){
          vec3 col = mix(vec3(1.0, 0.97, 0.9), vC, smoothstep(0.0, 0.35, vT));
          float a = (1.0 - vT) * (1.0 - vT) * 1.2;
          gl_FragColor = vec4(col * 1.4, a);
        }`,
      ...additive,
    });
    this.flames = inst(fg, this.flameMat, n * FLAMES_PER_KART, 20);

    // drift glow: a soft radial disc on the ground behind each rear wheel
    const gg = new PlaneGeometry(1, 1);
    gg.rotateX(-Math.PI / 2);
    const glowMat = new ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: /* glsl */ `varying vec2 vUv; varying vec3 vC; void main(){ vUv = uv; vC = vec3(1.0);
        #ifdef USE_INSTANCING_COLOR
        vC = instanceColor;
        #endif
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `varying vec2 vUv; varying vec3 vC; void main(){ float d = length(vUv - 0.5) * 2.0; float a = smoothstep(1.0, 0.0, d); a *= a; gl_FragColor = vec4(vC * 1.6, a * 0.9); }`,
      ...additive,
    });
    this.glow = inst(gg, glowMat, n * 2, 3);

    // light trails: thin vertical ribbons stretched behind boosting / tier-2+ drifting karts
    const tg = new PlaneGeometry(0.16, 1);
    tg.translate(0, 0.5, 0);
    tg.rotateX(-Math.PI / 2); // (x, y, z) → (x, z, -y): the ribbon runs from the kart (z 0) back to z −1
    const trailMat = new ShaderMaterial({
      vertexShader: /* glsl */ `varying vec2 vUv; varying vec3 vC; void main(){ vUv = uv; vC = vec3(1.0);
        #ifdef USE_INSTANCING_COLOR
        vC = instanceColor;
        #endif
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `varying vec2 vUv; varying vec3 vC; void main(){ float a = (1.0 - vUv.y) * (1.0 - abs(vUv.x - 0.5) * 2.0); gl_FragColor = vec4(vC * 1.5, a * 0.85); }`,
      ...additive,
    });
    this.trails = inst(tg, trailMat, n * 2, 4);

    // paw-print skids
    const pg = pawGeometry();
    pg.rotateX(-Math.PI / 2);
    this.skidAge = new Float32Array(SKIDS).fill(99);
    this.skidAttr = new InstancedBufferAttribute(this.skidAge, 1).setUsage(DynamicDrawUsage) as InstancedBufferAttribute;
    pg.setAttribute('aAge', this.skidAttr);
    const night = theme.night;
    const skidMat = new ShaderMaterial({
      vertexShader: /* glsl */ `attribute float aAge; varying float vA; varying vec3 vC; void main(){ vA = aAge; vC = vec3(0.0);
        #ifdef USE_INSTANCING_COLOR
        vC = instanceColor;
        #endif
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
      fragmentShader: night
        ? /* glsl */ `varying float vA; varying vec3 vC; void main(){ float a = clamp(1.0 - vA / 4.0, 0.0, 1.0); if (a <= 0.0) discard; gl_FragColor = vec4(vC * 1.3, a * 0.7); }`
        : /* glsl */ `varying float vA; varying vec3 vC; void main(){ float a = clamp(1.0 - vA / 6.0, 0.0, 1.0); if (a <= 0.0) discard; gl_FragColor = vec4(mix(vec3(0.16, 0.1, 0.13), vC, 0.25), a * 0.32); }`,
      transparent: true,
      depthWrite: false,
      blending: night ? AdditiveBlending : NormalBlending,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.skids = inst(pg, skidMat, SKIDS, 2);
    this.skids.count = SKIDS;
    for (let i = 0; i < SKIDS; i++) {
      _o.position.set(0, -999, 0);
      _o.updateMatrix();
      this.skids.setMatrixAt(i, _o.matrix);
    }

    // shockwave rings (drift tier up, mini-turbo, landing, pickup)
    const rg = new RingGeometry(0.82, 1, 32);
    rg.rotateX(-Math.PI / 2);
    this.ringLife = new Float32Array(RINGS);
    this.ringSize = new Float32Array(RINGS);
    this.ringPos = new Float32Array(RINGS * 3);
    this.ringAttr = new InstancedBufferAttribute(this.ringLife, 1).setUsage(DynamicDrawUsage) as InstancedBufferAttribute;
    rg.setAttribute('aLife', this.ringAttr);
    const ringMat = new ShaderMaterial({
      vertexShader: /* glsl */ `attribute float aLife; varying float vL; varying vec3 vC; void main(){ vL = aLife; vC = vec3(1.0);
        #ifdef USE_INSTANCING_COLOR
        vC = instanceColor;
        #endif
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `varying float vL; varying vec3 vC; void main(){ if (vL <= 0.0) discard; gl_FragColor = vec4(vC * 1.5, vL * vL); }`,
      ...additive,
    });
    this.rings = inst(rg, ringMat, RINGS, 5);
    this.rings.count = RINGS;
    for (let i = 0; i < RINGS; i++) {
      _o.position.set(0, -999, 0);
      _o.updateMatrix();
      this.rings.setMatrixAt(i, _o.matrix);
    }

    // dizzy stars
    this.stars = inst(starGeometry(), new MeshBasicMaterial({ color: 0xffffff, side: DoubleSide, toneMapped: false }), n * STARS_PER_KART, 6);

    this.all = [this.flames, this.glow, this.trails, this.skids, this.rings, this.stars];
    for (const m of this.all) scene.add(m);
  }

  /** the camera kart (set every update) */
  private me = -1;

  /**
   * Spawn a ground shockwave ring at a kart. B60: the player's own rings are capped in size and drawn at half
   * strength (additive, so half the colour), so a pounce or a mini-turbo never washes over the whole screen.
   */
  ring(kart: number, color: number, size: number): void {
    const st = this.view.cur[kart];
    if (!st) return;
    const own = kart === this.me;
    const i = this.ringNext;
    this.ringNext = (i + 1) % RINGS;
    this.ringPos[i * 3] = st.x;
    this.ringPos[i * 3 + 1] = st.y + 0.08;
    this.ringPos[i * 3 + 2] = st.z;
    this.ringLife[i] = 1;
    this.ringSize[i] = own ? Math.min(size, 2.2) : size;
    _c.setHex(color);
    if (own) _c.multiplyScalar(0.5);
    this.rings.setColorAt(i, _c);
  }

  onEvent(e: RaceEvent): void {
    const k = e.kart;
    if (k < 0) return;
    switch (e.type) {
      case 'boost':
        this.boostSrc[k] = e.a ?? 0;
        break;
      case 'miniTurbo':
        this.boostTier[k] = e.a ?? 1;
        this.boostSrc[k] = BoostSource.MiniTurbo;
        this.ring(k, driftTierColors()[(e.a ?? 1) - 1], 2.4 + (e.a ?? 1) * 0.6);
        break;
      case 'driftTier':
        this.ring(k, driftTierColors()[(e.a ?? 1) - 1], 1.8);
        break;
      case 'land':
        if ((e.a ?? 0) > 20) this.ring(k, 0xfff3dc, 2.2 + Math.min(2, (e.a ?? 0) / 40));
        break;
      case 'pounce':
        this.ring(k, 0xff3ea5, 3.2);
        break;
      case 'itemPickup':
        this.ring(k, 0xffc93c, 1.6);
        break;
      case 'blocked':
        this.ring(k, 0xffffff, 2.4);
        break;
      case 'hit':
        this.ring(k, 0xff5a5a, 2.6);
        break;
    }
  }

  update(st: RaceState, alpha: number, dt: number, me: number): void {
    this.me = me;
    this.time += dt;
    this.flameMat.uniforms.uTime.value = this.time;
    const view = this.view;
    const meK = st.karts[me];
    const night = this.theme.night;
    const tiers = driftTierColors();
    let nf = 0;
    let ng = 0;
    let nt = 0;
    let ns = 0;
    for (let i = 0; i < view.karts.length; i++) {
      const k = st.karts[i];
      const kv = view.karts[i];
      // juice owns the boost flame: the core cone stays hidden
      kv.flame.visible = false;
      if (k.respawnTicks > 0 || !kv.root.visible || kv.fadedOut) continue;
      const s = view.lerpKart(i, alpha, this.snap);
      const speed = Math.hypot(k.vx, k.vz);
      const near = Math.hypot(k.x - meK.x, k.z - meK.z) < 60;

      // ---- boost flames from the two exhaust pipes, following the body (lean, pitch, squash)
      if (k.boostTicks > 0) {
        kv.body.updateWorldMatrix(true, false);
        const col = boostColor(this.boostSrc[i], this.boostTier[i], this.theme);
        const len = 1.1 + (k.boostLevel > 1.32 ? 0.7 : 0.3) + Math.min(0.6, k.boostTicks / 60);
        for (const side of [-1, 1]) {
          _l.makeScale(1, 1, len).setPosition(side * 0.35, 0.45, -1.32);
          _m.multiplyMatrices(kv.body.matrixWorld, _l);
          this.flames.setMatrixAt(nf, _m);
          this.flames.setColorAt(nf, _c.setHex(col));
          nf++;
        }
      }

      const sx = Math.sin(s.heading);
      const sz = Math.cos(s.heading);
      // ---- drift glow + skids
      if (k.driftDir !== 0 && !k.air && speed > 5) {
        const tier = k.driftTier;
        const col = tier > 0 ? tiers[tier - 1] : 0xfff3dc;
        const size = tier > 0 ? 1.1 + 0.25 * tier + 0.12 * Math.sin(this.time * 30 + i) : 0.7;
        for (const side of [-1, 1]) {
          const wx = s.x - sx * 0.75 - sz * 0.72 * side;
          const wz = s.z - sz * 0.75 + sx * 0.72 * side;
          _o.position.set(wx, s.y + 0.06, wz);
          _o.rotation.set(0, s.heading, 0);
          _o.scale.set(size, 1, size * 1.4);
          _o.updateMatrix();
          this.glow.setMatrixAt(ng, _o.matrix);
          this.glow.setColorAt(ng, _c.setHex(col).multiplyScalar(tier > 0 ? 1 : 0.35));
          ng++;
        }
        if (this.opts.skids && near) {
          this.skidDist[i] += speed * dt;
          const step = 1.25 / this.opts.density;
          if (this.skidDist[i] > step) {
            this.skidDist[i] = 0;
            this.skidSide[i] = -this.skidSide[i];
            const side = this.skidSide[i];
            const p = this.skidNext;
            this.skidNext = (p + 1) % SKIDS;
            _o.position.set(s.x - sx * 0.8 - sz * 0.72 * side, s.y + 0.03, s.z - sz * 0.8 + sx * 0.72 * side);
            // paw points along the travel direction
            _o.rotation.set(0, Math.atan2(k.vx, k.vz) + Math.PI, 0);
            _o.scale.setScalar(1.6);
            _o.updateMatrix();
            this.skids.setMatrixAt(p, _o.matrix);
            this.skids.setColorAt(p, _c.setHex(night ? col : 0xffffff));
            this.skidAge[p] = 0;
          }
        }
      }

      // ---- light trails: boosting always, tier 2+ drifts, and faint neon tail-lights at night
      // iteration 3: on a loop's rail the trail is always on, a pink and a cyan ribbon that follow the loop's surface
      const looping = k.rail > 0 && s.b === 1;
      const trailOn = looping || k.boostTicks > 0 || k.driftTier >= 2 || k.autoTicks > 0 || (night && speed > 12 && near);
      if (trailOn && near) {
        // Zoomies: a rainbow ribbon (the hue walks along the race clock)
        const col =
          k.autoTicks > 0
            ? _c.setHSL((this.time * 1.5 + i * 0.13) % 1, 1, 0.6).getHex()
            : k.boostTicks > 0
              ? boostColor(this.boostSrc[i], this.boostTier[i], this.theme)
              : k.driftTier >= 2
                ? tiers[k.driftTier - 1]
                : i % 2
                  ? this.theme.neonA || 0xff3ea5
                  : this.theme.neonB || 0x2cf6f3;
        const dim = looping || k.boostTicks > 0 || k.driftTier >= 2 ? 1 : 0.45;
        const len = Math.min(7, 1.5 + speed * 0.18) * (k.autoTicks > 0 ? 1.7 : k.boostTicks > 0 || looping ? 1.2 : 0.8);
        const vh = speed > 2 ? Math.atan2(k.vx, k.vz) : s.heading;
        if (s.b === 1) {
          // bent (a loop's ribbon or a curled wall lane): the ribbons stand on the surface, along the kart's forward
          _bu.set(s.ux!, s.uy!, s.uz!);
          _bf.set(s.fx!, s.fy!, s.fz!);
          _br.crossVectors(_bu, _bf);
          for (const side of [-1, 1]) {
            _v.set(s.x, s.y, s.z).addScaledVector(_bf, -1).addScaledVector(_br, -0.62 * side).addScaledVector(_bu, 0.42);
            _m.makeBasis(_br, _bu, _bf).setPosition(_v);
            _l.makeScale(1, 1, len);
            _m.multiply(_l);
            _l.makeRotationZ(Math.PI / 2);
            _m.multiply(_l);
            this.trails.setMatrixAt(nt, _m);
            this.trails.setColorAt(nt, _c.setHex(looping ? LOOP_TRAIL[side < 0 ? 0 : 1] : col).multiplyScalar(dim));
            nt++;
          }
        } else
        for (const side of [-1, 1]) {
          _o.position.set(s.x - sx * 1.0 - sz * 0.62 * side, s.y + 0.42, s.z - sz * 1.0 + sx * 0.62 * side);
          _o.rotation.set(0, vh, 0);
          _o.scale.set(1, 1, len);
          _o.updateMatrix();
          // the ribbon lies flat; tilt it upright so it reads from the chase camera
          _l.makeRotationZ(Math.PI / 2);
          _m.multiplyMatrices(_o.matrix, _l);
          this.trails.setMatrixAt(nt, _m);
          this.trails.setColorAt(nt, _c.setHex(col).multiplyScalar(dim));
          nt++;
        }
      }

      // ---- dizzy stars while a hit plays out
      const dazed = k.spinTicks > 0 || k.leapTicks > 0 || k.wobbleTicks > 0 || k.chaseTicks > 0;
      if (dazed) {
        const nStars = Math.max(2, Math.round(STARS_PER_KART * this.opts.density));
        for (let j = 0; j < nStars; j++) {
          const a = this.time * 6 + (j / nStars) * Math.PI * 2;
          _o.position.set(s.x + Math.cos(a) * 0.7, s.y + 2.25 + Math.sin(this.time * 9 + j) * 0.08, s.z + Math.sin(a) * 0.7);
          _o.rotation.set(0, -a, this.time * 4);
          _o.scale.setScalar(1.3);
          _o.updateMatrix();
          this.stars.setMatrixAt(ns, _o.matrix);
          this.stars.setColorAt(ns, _c.setHex(j % 2 ? 0xffe14d : 0xfff3dc));
          ns++;
        }
      }
      this.lastTier[i] = k.driftTier;
    }
    this.flames.count = nf;
    this.glow.count = ng;
    this.trails.count = nt;
    this.stars.count = ns;
    for (const m of [this.flames, this.glow, this.trails, this.stars]) {
      m.visible = m.count > 0;
      if (m.count > 0) {
        m.instanceMatrix.needsUpdate = true;
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
      }
    }

    // skids age
    for (let p = 0; p < SKIDS; p++) if (this.skidAge[p] < 99) this.skidAge[p] += dt;
    this.skidAttr.needsUpdate = true;
    this.skids.instanceMatrix.needsUpdate = true;
    if (this.skids.instanceColor) this.skids.instanceColor.needsUpdate = true;
    this.skids.visible = this.opts.skids;

    // rings expand and fade
    let anyRing = false;
    for (let r = 0; r < RINGS; r++) {
      if (this.ringLife[r] <= 0) continue;
      anyRing = true;
      this.ringLife[r] = Math.max(0, this.ringLife[r] - dt * 2.4);
      const grow = this.ringSize[r] * (1.25 - this.ringLife[r] * 0.85);
      _v.set(this.ringPos[r * 3], this.ringPos[r * 3 + 1], this.ringPos[r * 3 + 2]);
      _o.position.copy(_v);
      _o.rotation.set(0, 0, 0);
      _o.scale.set(grow, 1, grow);
      _o.updateMatrix();
      this.rings.setMatrixAt(r, _o.matrix);
    }
    this.rings.visible = anyRing;
    if (anyRing) {
      this.rings.instanceMatrix.needsUpdate = true;
      this.ringAttr.needsUpdate = true;
      if (this.rings.instanceColor) this.rings.instanceColor.needsUpdate = true;
    }
  }

  dispose(): void {
    for (const m of this.all) {
      this.scene.remove(m);
      m.geometry.dispose();
      (m.material as ShaderMaterial).dispose();
      m.dispose();
    }
  }
}

export type { KartState };
