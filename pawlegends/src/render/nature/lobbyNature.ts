/**
 * Nature on the lobby turntable (render/nature/natureDefs.ts, the heavy version): the worn card's element as a
 * steady stream of motes around the hero (embers rising, frost and leaves falling, sparks with a rare arc flash,
 * ...), a soft element glow on the pedestal, and an equip burst. Loaded lazily by the Lobby (`setNature`), it reuses
 * the Lobby's own particle system and adds one draw call (the glow disc).
 *
 * Caps: LOBBY_MAX live motes (LOBBY_MAX_LOW on Low, rates × LOBBY_LOW_RATE); under reduced motion no motes and a still
 * glow (the equip burst becomes a short glow swell). Nothing is allocated per frame. Cosmetic only.
 */
import * as THREE from 'three';
import type { CatTier, Element } from '../../meta/roster';
import { reducedMotion } from '../fx/vfxPrefs';
import { LOBBY_MAX, LOBBY_MAX_LOW, NATURE, NSHAPE, lobbyRate, type NatureDef } from './natureDefs';

/** The particle API used (render/fx/Particles.js). */
export interface NatureParticles {
  burst(pos: THREE.Vector3, o: Record<string, unknown>): void;
  ring(pos: THREE.Vector3, o: Record<string, unknown>): void;
}

export interface LobbyNatureOpts {
  /** Low quality (fewer motes); a function is re-read every frame (the FPS governor can drop a tier). */
  low?: boolean | (() => boolean);
  /** Reduced motion: no motes, a still glow. */
  reduced?: boolean;
  /** Height of the pedestal top (m). */
  floorY?: number;
}

/** A soft radial alpha texture (a DataTexture, so it builds without a canvas). */
function glowTexture(): THREE.DataTexture {
  const n = 64;
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const dx = (x + 0.5) / n - 0.5;
      const dy = (y + 0.5) / n - 0.5;
      const r = Math.min(1, Math.sqrt(dx * dx + dy * dy) * 2);
      // a bright ring just inside the pedestal top's rim (r 1.5 m) over a soft fill
      const ring = Math.exp(-(((r - 0.86) / 0.08) ** 2));
      const fill = (1 - r) ** 1.6 * 0.55;
      const a = Math.min(1, ring * 0.9 + fill) * (r < 1 ? 1 : 0);
      const i = (y * n + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = Math.round(a * 255);
    }
  const t = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

export class LobbyNature {
  /** The pedestal glow (one additive disc). */
  readonly glow: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  element: Element | null = null;
  rung: CatTier = 'COMMON';
  low: boolean;
  reduced: boolean;
  private readonly lowFn: (() => boolean) | null;
  private rmAt = 0;
  /** Hero top (m): falling motes start above it. */
  top = 2.6;
  /** Motes emitted (tests). */
  emitted = 0;
  private t = 0;
  private acc = 0;
  private flashIn = 3;
  private swell = 0;
  private i = 0;
  private readonly expiry = new Float64Array(LOBBY_MAX).fill(-1);
  private readonly at = new THREE.Vector3();
  private readonly opts: Record<string, unknown> = { n: 1, exact: true, flat: true };
  private readonly flashOpts: Record<string, unknown> = { additive: true, n: 7, exact: true, shape: NSHAPE.SPARK, color: 0xffffff, alpha: 1, intensity: 2.2, size: [0.05, 0.08], life: [0.1, 0.18], speed: [3, 5.5], stretch: 4, up: 0 };
  private readonly ringOpts: Record<string, unknown> = { additive: true, n: 22, exact: true, shape: NSHAPE.STAR4, color: 0xffffff, alpha: 0.9, intensity: 1.6, size: [0.12, 0.2], life: [0.5, 0.8], speed: [2.2, 3.2], r0: 0.6, up: 0.4, sizeEnd: 0.4 };
  private readonly upOpts: Record<string, unknown> = { n: 18, exact: true, color: 0xffffff, alpha: 0.95, intensity: 1.4, life: [0.7, 1.1], speed: [0.4, 1.2], up: 2.6, jitter: 0.5, gravity: 1 };
  private readonly floorY: number;
  private readonly followRm: boolean;

  constructor(
    scene: THREE.Scene,
    private readonly particles: NatureParticles,
    o: LobbyNatureOpts = {},
  ) {
    this.lowFn = typeof o.low === 'function' ? o.low : null;
    this.low = this.lowFn ? this.lowFn() : !!o.low;
    this.reduced = o.reduced ?? reducedMotion();
    this.followRm = o.reduced === undefined;
    this.floorY = o.floorY ?? 0;
    const mat = new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    this.glow = new THREE.Mesh(new THREE.CircleGeometry(1.5, 40), mat);
    this.glow.rotation.x = -Math.PI / 2;
    this.glow.position.y = this.floorY + 0.012;
    this.glow.renderOrder = 4;
    this.glow.visible = false;
    this.glow.name = 'lobby-nature-glow';
    scene.add(this.glow);
  }

  /** Show an element at a rung (null = no card: nothing shows). */
  setElement(el: Element | null, rung: CatTier | null = 'COMMON'): void {
    this.element = el;
    this.rung = rung ?? 'COMMON';
    this.acc = 0;
    this.glow.visible = el !== null;
    if (el) this.glow.material.color.setHex(NATURE[el].primary);
  }

  /** Live motes now. */
  alive(): number {
    let n = 0;
    for (let i = 0; i < LOBBY_MAX; i++) if (this.expiry[i] > this.t) n++;
    return n;
  }

  private cap(): number {
    return this.low ? LOBBY_MAX_LOW : LOBBY_MAX;
  }

  private claim(life: number): boolean {
    const cap = this.cap();
    let free = -1;
    let n = 0;
    for (let i = 0; i < LOBBY_MAX; i++) {
      if (this.expiry[i] > this.t) n++;
      else if (free < 0) free = i;
    }
    if (n >= cap || free < 0) return false;
    this.expiry[free] = this.t + life;
    return true;
  }

  private mote(d: NatureDef): void {
    const life = d.life[1];
    if (!this.claim(life)) return;
    const o = this.opts;
    const k = this.i++;
    o.additive = d.additive;
    o.shape = d.shape2 >= 0 && k % 3 === 2 ? d.shape2 : d.shape;
    o.color = k % 2 === 1 ? d.secondary : d.primary;
    o.alpha = d.alpha;
    o.intensity = d.additive ? 1.8 : 1;
    o.size = d.size;
    o.sizeEnd = d.sizeEnd;
    o.life = d.life;
    o.speed = [d.drift * 0.4, d.drift];
    o.up = d.rise;
    o.gravity = d.gravity;
    o.spin = d.spin;
    o.stretch = d.stretch;
    o.fade = d.fade;
    // around the hero, not through its face: a ring 0.55–1.5 m out, a little more behind than in front
    const a = Math.random() * Math.PI * 2;
    const r = 0.55 + Math.random() * 0.95;
    const z = Math.sin(a) * r;
    const y = d.from === 'high' ? this.top + 0.2 + Math.random() * 0.7 : this.floorY + 0.1 + Math.random() * this.top * 0.75;
    this.at.set(Math.cos(a) * r, y, z > 0 ? z * 0.6 : z);
    this.particles.burst(this.at, o);
    this.emitted++;
  }

  /** The equip moment: a ring and a rising burst in the element colour (a glow swell under reduced motion). */
  burst(): void {
    const el = this.element;
    if (!el) return;
    this.swell = 1;
    if (this.reduced) return;
    const d = NATURE[el];
    this.at.set(0, this.floorY + 0.15, 0);
    this.ringOpts.color = d.primary;
    this.particles.ring(this.at, this.ringOpts);
    this.at.set(0, this.floorY + 0.6, 0);
    const u = this.upOpts;
    u.shape = d.shape;
    u.additive = d.additive;
    u.color = d.secondary;
    u.size = d.size;
    u.n = this.low ? 8 : 18;
    this.particles.burst(this.at, u);
  }

  update(dt: number): void {
    this.t += dt;
    if (this.lowFn) this.low = this.lowFn();
    // follow the OS reduced-motion setting (re-read once a second)
    if (this.followRm && this.t - this.rmAt >= 1) {
      this.rmAt = this.t;
      this.reduced = reducedMotion();
    }
    const el = this.element;
    if (!el) return;
    const d = NATURE[el];
    // the glow: a still 0.4 under reduced motion, else a slow breath (Fire flickers, Spark stutters)
    this.swell = Math.max(0, this.swell - dt * 1.6);
    let pulse = 0;
    if (!this.reduced) {
      if (el === 'FIRE') pulse = Math.sin(this.t * 11) * 0.05 + Math.sin(this.t * 2.3) * 0.06;
      else if (el === 'ELECTRIC') pulse = Math.sin(this.t * 31) > 0.85 ? 0.12 : Math.sin(this.t * 1.7) * 0.04;
      else pulse = Math.sin(this.t * 1.6) * 0.07;
    }
    const base = 0.16 + (this.rung === 'LEGENDARY' ? 0.1 : this.rung === 'EPIC' ? 0.05 : 0);
    this.glow.material.opacity = Math.max(0, base + pulse + this.swell * 0.4);
    if (!this.reduced) this.glow.rotation.z += dt * 0.15;
    const rate = lobbyRate(el, this.rung, this.low, this.reduced);
    if (rate <= 0) return;
    // a slow frame catches up (up to 8 motes), so a low frame rate does not thin the stream
    this.acc = Math.min(8, this.acc + rate * dt);
    while (this.acc >= 1) {
      this.acc -= 1;
      this.mote(d);
    }
    // a rare arc flash (Spark, Med / High)
    if (el === 'ELECTRIC' && !this.low) {
      this.flashIn -= dt;
      if (this.flashIn <= 0) {
        this.flashIn = 2.4 + Math.random() * 2.2;
        const a = Math.random() * Math.PI * 2;
        this.at.set(Math.cos(a) * 0.9, this.floorY + 0.6 + Math.random() * this.top * 0.6, Math.sin(a) * 0.5);
        this.flashOpts.color = Math.random() < 0.5 ? d.primary : d.secondary;
        this.particles.burst(this.at, this.flashOpts);
        this.swell = Math.max(this.swell, 0.35);
      }
    }
  }

  dispose(): void {
    this.glow.removeFromParent();
    this.glow.geometry.dispose();
    this.glow.material.map?.dispose();
    this.glow.material.dispose();
  }
}

/** The Lobby's entry point (render/lobby.ts `setNature`): Nature on its scene and particles, Low read every frame. */
export function createLobbyNature(scene: THREE.Scene, particles: NatureParticles, isLow: () => boolean = () => false): LobbyNature {
  return new LobbyNature(scene, particles, { low: isLow });
}

/** Attach Nature to a lobby scene and its particle system. */
export function attach(scene: THREE.Scene, particles: NatureParticles, o: LobbyNatureOpts = {}): LobbyNature {
  return new LobbyNature(scene, particles, o);
}
