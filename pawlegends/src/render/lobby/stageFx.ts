/**
 * Lobby stage motion: pointer parallax (up to ±2°, fine pointers only, off with reduced motion), the Play dolly
 * (`playOut`, ~400 ms toward the hero) and the equip burst (a ground ring and a star burst in the element colour).
 *
 * Render only.
 */
import * as THREE from 'three';
import { SHAPE, type Particles } from '../fx/Particles.js';

/** A media query, created once (each frame only reads `.matches`). */
function query(q: string): () => boolean {
  let mql: MediaQueryList | null | undefined;
  return () => {
    try {
      if (mql === undefined) mql = typeof matchMedia === 'function' ? matchMedia(q) : null;
      return !!mql?.matches;
    } catch {
      return false;
    }
  };
}

/** Reduced motion, read live (the OS setting can change while the game runs). */
export const reducedMotion = query('(prefers-reduced-motion: reduce)');

const finePointer = query('(hover: hover) and (pointer: fine)');

/** Max parallax angle (rad): 2°. */
const PARALLAX = THREE.MathUtils.degToRad(2);
/** Dolly length (s). */
export const DOLLY_S = 0.4;

const ease = (x: number): number => 1 - Math.pow(1 - x, 3);

export class StageFx {
  /** Smoothed pointer offset, -1..1 each axis. */
  private px = 0;
  private py = 0;
  private tx = 0;
  private ty = 0;
  private dolly = -1;
  private dollyDone: (() => void) | null = null;
  private ring: THREE.Mesh;
  private ringMat: THREE.MeshBasicMaterial;
  private ringT = 1;
  private readonly onMove = (e: PointerEvent): void => {
    if (e.pointerType !== 'mouse') return;
    const w = window.innerWidth || 1;
    const h = window.innerHeight || 1;
    this.tx = Math.max(-1, Math.min(1, (e.clientX / w) * 2 - 1));
    this.ty = Math.max(-1, Math.min(1, (e.clientY / h) * 2 - 1));
  };
  private listening = false;

  constructor(
    scene: THREE.Scene,
    private readonly particles: Particles,
  ) {
    this.ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48), this.ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.02;
    this.ring.visible = false;
    this.ring.name = 'lobby-equip-ring';
    scene.add(this.ring);
  }

  /** Start or stop listening to the pointer (the lobby is on screen). */
  listen(on: boolean): void {
    if (typeof window === 'undefined' || on === this.listening) return;
    this.listening = on;
    if (on) window.addEventListener('pointermove', this.onMove, { passive: true });
    else {
      window.removeEventListener('pointermove', this.onMove);
      this.tx = this.ty = 0;
    }
  }

  /** The dolly toward the hero; resolves at once with reduced motion. */
  playOut(): Promise<void> {
    if (reducedMotion()) return Promise.resolve();
    this.dollyDone?.();
    this.dolly = 0;
    return new Promise((res) => {
      this.dollyDone = res;
      // never hang a Play on a hidden tab (no frames): resolve on a timer too
      setTimeout(() => this.finishDolly(), DOLLY_S * 1000 + 250);
    });
  }

  private finishDolly(): void {
    const d = this.dollyDone;
    this.dollyDone = null;
    d?.();
  }

  /** Reset after the lobby is entered again (no leftover dolly). */
  reset(): void {
    this.dolly = -1;
    this.finishDolly();
  }

  equipBurst(color: number, low: boolean): void {
    this.ringT = 0;
    this.ringMat.color.setHex(color);
    this.ring.visible = true;
    if (reducedMotion()) return;
    this.particles.burst(new THREE.Vector3(0, 0.9, 0), {
      additive: true,
      n: low ? 10 : 26,
      shape: SHAPE.STAR4,
      color,
      intensity: 1.8,
      size: [0.08, 0.18],
      life: [0.45, 0.8],
      speed: [2, 3.6],
      up: 1.8,
    });
  }

  update(dt: number): void {
    const k = Math.min(1, dt * 4);
    this.px += (this.tx - this.px) * k;
    this.py += (this.ty - this.py) * k;
    if (this.dolly >= 0) {
      this.dolly += dt / DOLLY_S;
      if (this.dolly >= 1) {
        this.dolly = 1;
        this.finishDolly();
      }
    }
    if (this.ring.visible) {
      this.ringT = Math.min(1, this.ringT + dt * 1.8);
      const s = 1.2 + ease(this.ringT) * 1.4;
      this.ring.scale.setScalar(s);
      this.ringMat.opacity = (1 - this.ringT) * 0.9;
      if (this.ringT >= 1) this.ring.visible = false;
    }
  }

  /**
   * Move a placed camera: orbit by the pointer parallax around `look`, then push in by the dolly. Only fine pointers
   * (desktop) get parallax; reduced motion gets none.
   */
  apply(cam: THREE.PerspectiveCamera, look: THREE.Vector3): void {
    const still = reducedMotion() || !finePointer();
    if (!still && (this.px !== 0 || this.py !== 0)) {
      const off = OFF.copy(cam.position).sub(look);
      off.applyAxisAngle(Y, -this.px * PARALLAX);
      const side = SIDE.crossVectors(off, Y).normalize();
      off.applyAxisAngle(side, this.py * PARALLAX);
      cam.position.copy(look).add(off);
    }
    if (this.dolly > 0) {
      const d = ease(Math.min(1, this.dolly));
      // toward the hero's chest (1.2 m up), 45% of the way
      TMP.set(look.x * (1 - d), 1.2 * d + look.y * (1 - d), look.z);
      cam.position.lerp(TMP2.set(0, 1.4, 0), d * 0.45);
      cam.lookAt(TMP);
      return;
    }
    cam.lookAt(look);
  }

  dispose(): void {
    this.listen(false);
    this.ring.removeFromParent();
    this.ring.geometry.dispose();
    this.ringMat.dispose();
    this.finishDolly();
  }
}

const Y = new THREE.Vector3(0, 1, 0);
const TMP = new THREE.Vector3();
const TMP2 = new THREE.Vector3();
const OFF = new THREE.Vector3();
const SIDE = new THREE.Vector3();
