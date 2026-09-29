/**
 * Isometric-style orthographic camera rig: fixed yaw 45 deg / pitch 35 deg, a stiff exponential
 * follow (no rubber-band lag) with a small look-ahead in the direction of travel, a slower glide
 * when the followed target jumps (cat swap), trauma-based screen shake and a zoom punch.
 */
import * as THREE from 'three';

export const CAMERA_YAW = THREE.MathUtils.degToRad(45);
export const CAMERA_PITCH = THREE.MathUtils.degToRad(35);

/** Unit vector (world x, world z) pointing to screen-right on the ground plane. */
export const SCREEN_RIGHT = { x: Math.cos(CAMERA_YAW), z: -Math.sin(CAMERA_YAW) };

export class IsoCamera {
  readonly camera: THREE.OrthographicCamera;
  /** Ground point the camera looks at (smoothed). */
  readonly target = new THREE.Vector3();
  private readonly goal = new THREE.Vector3();
  private aspect = 16 / 9;
  /** World units visible vertically at zoom 1 (landscape). */
  baseViewHeight = 11.5;
  /** Minimum world units visible horizontally (keeps portrait phones playable). */
  minViewWidth = 8.5;
  private zoom = 1;
  private zoomGoal = 1;
  readonly minZoom = 0.75;
  readonly maxZoom = 1.5;
  /** Follow stiffness (1/s). */
  followRate = 11;
  /** Seconds of look-ahead along the target's velocity, and its cap in tiles. */
  leadTime = 0.3;
  leadMax = 1.1;
  private readonly lead = new THREE.Vector3();
  private readonly leadGoal = new THREE.Vector3();
  private glideT = 0;
  private punch = 0;
  private snapped = false;
  private readonly dist = 40;

  constructor() {
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
    this.applyProjection();
  }

  setAspect(aspect: number): void {
    this.aspect = Math.max(0.2, aspect);
    this.applyProjection();
  }

  /**
   * Size the view from the canvas size in CSS pixels: short screens (phones in landscape) see fewer
   * tiles so figures stay big enough to read (about 48+ px per tile).
   */
  setViewport(widthPx: number, heightPx: number): void {
    this.baseViewHeight = Math.max(7, Math.min(11.5, heightPx / 58));
    this.minViewWidth = Math.max(7, Math.min(8.5, widthPx / 46));
    this.setAspect(widthPx / Math.max(1, heightPx));
  }

  /** Zoom factor: >1 zooms in. Clamped to [minZoom, maxZoom]. */
  setZoom(z: number, immediate = false): void {
    this.zoomGoal = THREE.MathUtils.clamp(z, this.minZoom, this.maxZoom);
    if (immediate) {
      this.zoom = this.zoomGoal;
      this.applyProjection();
    }
  }

  getZoom(): number {
    return this.zoomGoal;
  }

  /** Visible world height (for shadow frustum sizing). */
  viewHeight(): number {
    const h = Math.max(this.baseViewHeight, this.minViewWidth / this.aspect);
    return h / (this.zoom * (1 + this.punch));
  }

  /**
   * Follow a ground point. `vx`, `vz` (tiles/s) feed the look-ahead. `snap` jumps there at once.
   */
  follow(x: number, z: number, snap = false, vx = 0, vz = 0): void {
    this.goal.set(x, 0, z);
    const sp = Math.hypot(vx, vz);
    const k = sp > 1e-3 ? Math.min(this.leadMax, sp * this.leadTime) / sp : 0;
    this.leadGoal.set(vx * k, 0, vz * k);
    if (snap || !this.snapped) {
      this.target.copy(this.goal);
      this.lead.set(0, 0, 0);
      this.snapped = true;
    }
  }

  /** Slower, eased travel for the next `seconds` (e.g. gliding to the other cat on a swap). */
  glide(seconds = 0.45): void {
    this.glideT = Math.max(this.glideT, seconds);
  }

  /** Brief zoom-in kick (e.g. 0.06 on a pickup), decays on its own. */
  zoomPunch(amount: number): void {
    this.punch = Math.max(this.punch, amount);
  }

  private shakeT = 0;
  private shakeDur = 1;
  private shakeAmp = 0;
  private shakeTime = 0;
  /** Scales every shake (0 under prefers-reduced-motion). */
  shakeScale = 1;

  /** Brief screen shake (e.g. when a cat is spotted). Smooth noise, eased out. */
  shake(amplitude = 0.12, seconds = 0.35): void {
    if (amplitude * this.shakeScale <= 0) return;
    this.shakeAmp = Math.max(this.shakeAmp * (this.shakeT / this.shakeDur), amplitude * this.shakeScale);
    this.shakeT = this.shakeDur = Math.max(this.shakeT, seconds);
  }

  update(dt: number): void {
    const rate = this.glideT > 0 ? Math.min(this.followRate, 6) : this.followRate;
    this.glideT = Math.max(0, this.glideT - dt);
    const k = 1 - Math.exp(-rate * dt);
    this.lead.lerp(this.leadGoal, 1 - Math.exp(-4 * dt));
    this.target.x += (this.goal.x + this.lead.x - this.target.x) * k;
    this.target.z += (this.goal.z + this.lead.z - this.target.z) * k;
    let ox = 0, oz = 0;
    this.shakeTime += dt;
    if (this.shakeT > 0) {
      this.shakeT = Math.max(0, this.shakeT - dt);
      const e = this.shakeT / this.shakeDur;
      const a = this.shakeAmp * e * e;
      const t = this.shakeTime * 38;
      ox = (Math.sin(t) * 0.6 + Math.sin(t * 2.3 + 1.7) * 0.4) * a;
      oz = (Math.sin(t * 1.3 + 0.6) * 0.6 + Math.sin(t * 2.9 + 4.1) * 0.4) * a;
      if (this.shakeT === 0) this.shakeAmp = 0;
    }
    if (this.punch > 1e-4) {
      this.punch *= Math.exp(-9 * dt);
      this.applyProjection();
    }
    if (Math.abs(this.zoom - this.zoomGoal) > 1e-4) {
      this.zoom += (this.zoomGoal - this.zoom) * (1 - Math.exp(-8 * dt));
      this.applyProjection();
    }
    const c = this.camera;
    const cp = Math.cos(CAMERA_PITCH);
    const tx = this.target.x + ox;
    const tz = this.target.z + oz;
    c.position.set(
      tx + this.dist * cp * Math.sin(CAMERA_YAW),
      this.target.y + this.dist * Math.sin(CAMERA_PITCH),
      tz + this.dist * cp * Math.cos(CAMERA_YAW),
    );
    c.lookAt(tx, this.target.y, tz);
    c.updateMatrixWorld();
  }

  private applyProjection(): void {
    const h = this.viewHeight();
    const w = h * this.aspect;
    const c = this.camera;
    c.left = -w / 2;
    c.right = w / 2;
    c.top = h / 2;
    c.bottom = -h / 2;
    c.updateProjectionMatrix();
  }
}

/** Screen-space horizontal sign of a ground-plane direction (world dx, dz): +1 right, -1 left, 0 unclear. */
export function screenSign(dx: number, dz: number): 1 | -1 | 0 {
  const s = dx * SCREEN_RIGHT.x + dz * SCREEN_RIGHT.z;
  if (s > 1e-3) return 1;
  if (s < -1e-3) return -1;
  return 0;
}
