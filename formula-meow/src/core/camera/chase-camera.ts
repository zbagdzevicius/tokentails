/**
 * Chase camera (GDD 11): 4.8 m behind and 1.9 m up with a 0.12 s spring lag, looking 6 m ahead and rotating into
 * drifts by 8°. FOV is specified as HORIZONTAL (75° base, +12° at boost over 120 ms easing back over 600 ms,
 * +3° in a drift) and converted per aspect, so portrait phones do not feel cramped; vertical FOV ≤ 100°.
 * Trauma shake (shake = trauma², decays 1.6/s, max 0.35 m / 2.5° roll). All render-only.
 */
import { PerspectiveCamera, Vector3 } from 'three';
import type { KartState } from '../../types';

export interface CameraFeel {
  reducedMotion: boolean;
  /** extra horizontal FOV in landscape (GDD 2.1: +8°) */
  landscapeBonus: number;
}

const DEG = Math.PI / 180;
/** Chase rig (GDD 11 lists 4.8 m / 1.9 m; tuned up for the 2 m toy karts so the road ahead reads in portrait). */
const BACK = 5.6;
const UP = 2.55;
const AHEAD = 7;
const LOOK_Y = 0.55;
/**
 * Portrait rig (phones, the clip): higher and pitched down, vertical FOV capped, so the horizon sits about a third
 * down, the kart about two thirds down and the road ahead fills the middle (more sense of speed, less sky).
 */
const P_UP = 3.6;
const P_AHEAD = 9;
const P_LOOK_Y = 0;
const P_VFOV_MAX = 80;

export class ChaseCamera {
  readonly cam: PerspectiveCamera;
  private pos = new Vector3();
  private look = new Vector3();
  private yaw = 0;
  private fovKick = 0;
  private trauma = 0;
  private time = 0;
  private init = false;
  /** 0 = landscape rig, 1 = portrait rig */
  private portrait = 0;
  lookBack = false;
  feel: CameraFeel = { reducedMotion: false, landscapeBonus: 0 };

  constructor(aspect: number) {
    this.cam = new PerspectiveCamera(60, aspect, 0.1, 1400);
    this.setAspect(aspect);
  }

  private get up(): number {
    return UP + (P_UP - UP) * this.portrait;
  }

  private get ahead(): number {
    return AHEAD + (P_AHEAD - AHEAD) * this.portrait;
  }

  private get lookY(): number {
    return LOOK_Y + (P_LOOK_Y - LOOK_Y) * this.portrait;
  }

  addTrauma(v: number): void {
    this.trauma = Math.min(1, this.trauma + v);
  }

  setAspect(aspect: number): void {
    this.cam.aspect = aspect;
    this.feel.landscapeBonus = aspect > 1 ? 8 : 0;
    this.portrait = aspect >= 1 ? 0 : Math.min(1, (1 - aspect) / 0.35);
  }

  /** Snap behind a kart (race start, respawn). */
  snap(x: number, y: number, z: number, heading: number): void {
    this.yaw = heading;
    this.pos.set(x - Math.sin(heading) * BACK, y + this.up, z - Math.cos(heading) * BACK);
    this.look.set(x + Math.sin(heading) * this.ahead, y + this.lookY, z + Math.cos(heading) * this.ahead);
    this.init = true;
  }

  update(k: KartState, x: number, y: number, z: number, heading: number, speed: number, topSpeed: number, dt: number): void {
    this.time += dt;
    // follow the travel direction (not the drifting body), plus 8° into the drift
    const travel = speed > 2 ? Math.atan2(k.vx, k.vz) : heading;
    let target = travel + (k.driftDir !== 0 ? -k.driftDir * 8 * DEG : 0);
    if (k.spinTicks > 0) target = this.yaw; // do not spin the camera with the kart
    if (this.lookBack) target += Math.PI;
    if (!this.init) this.snap(x, y, z, target);
    let dy = target - this.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    const lag = 1 - Math.exp(-dt / 0.12);
    this.yaw += dy * Math.min(1, lag * 1.4);
    const back = BACK + Math.min(1.2, speed / topSpeed) * 0.6;
    const want = new Vector3(x - Math.sin(this.yaw) * back, y + this.up + (k.air ? 0.4 : 0), z - Math.cos(this.yaw) * back);
    this.pos.lerp(want, Math.min(1, lag * 2.2));
    // never fall far below the kart (ramps, drops)
    if (this.pos.y < y + 1.6) this.pos.y = y + 1.6;
    const lookAt = new Vector3(x + Math.sin(this.yaw) * this.ahead, y + this.lookY, z + Math.cos(this.yaw) * this.ahead);
    this.look.lerp(lookAt, Math.min(1, lag * 3));

    // FOV: horizontal spec → vertical
    const boosting = k.boostTicks > 0;
    const rm = this.feel.reducedMotion;
    const kickTarget = rm ? 0 : boosting ? 12 : k.driftDir !== 0 ? 3 : 0;
    const rate = kickTarget > this.fovKick ? dt / 0.12 : dt / 0.6;
    this.fovKick += (kickTarget - this.fovKick) * Math.min(1, rate * 3);
    const speedFov = rm ? 0 : Math.max(0, speed / topSpeed - 0.5) * 6;
    const hfov = (75 + this.feel.landscapeBonus + this.fovKick + speedFov) * DEG;
    const vfov = 2 * Math.atan(Math.tan(hfov / 2) / this.cam.aspect);
    // portrait: cap the vertical view (the boost kick still widens it a little)
    const cap = 100 + (P_VFOV_MAX + this.fovKick * 0.6 - 100) * this.portrait;
    this.cam.fov = Math.min(cap, vfov / DEG);
    this.cam.updateProjectionMatrix();

    // trauma shake
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const sh = this.trauma * this.trauma * (rm ? 0.3 : 1);
    const n = (o: number) => Math.sin(this.time * 47 + o) * 0.6 + Math.sin(this.time * 83 + o * 2.3) * 0.4;
    this.cam.position.set(this.pos.x + n(1) * 0.35 * sh, this.pos.y + n(2) * 0.35 * sh, this.pos.z + n(3) * 0.35 * sh);
    this.cam.lookAt(this.look);
    this.cam.rotateZ(n(4) * 2.5 * DEG * sh);
  }
}
