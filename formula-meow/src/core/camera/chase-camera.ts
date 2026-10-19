/**
 * Race camera (GDD 11; feel lane, iteration 2). Chase rig: 5.6 m behind and 2.55 m up (higher and pitched down in
 * portrait) with a 0.12 s spring lag, looking 7 m ahead, rotating 8° into drifts with the look point easing to the
 * inside of the drift. FOV is specified as HORIZONTAL (75° base) and converted per aspect; boosts kick it 6°, strong
 * boosts (pink mini-turbo, pads, catnip, Zoomies) 10°, drifts 3°. Trauma shake (shake = trauma², decays 1.6/s).
 * Reduced motion: no FOV kick, a third of the shake. All render-only.
 *
 * Modes (`setMode`):
 *  - `chase` / `lookBack` (the rig above, or facing backwards)
 *  - `flyover`: follows `params.keys` (TrackDef.flyover, or `autoFlyover`) with Catmull-Rom easing, then blends into
 *    the chase rig behind the kart and calls `params.onDone`; `skip()` cuts it short (tap to skip)
 *  - `finishOrbit`: 180° round the kart over 3 s at 3 m, from behind to the front (the finish)
 *  - `podium`: a slow swing round `params` {x, y, z} at `params.radius` (default 7 m)
 *  - `attract`: a slow orbit round the followed kart (title screen)
 * B59: the camera never sits outside the track's walls (where the scenery is): it is pulled in toward the kart.
 */
import { PerspectiveCamera, Vector3 } from 'three';
import { Surface, type FlyoverKey, type KartState } from '../../types';
import type { BuiltTrack } from '../track/build';
import { queryTrack, type TrackHit } from '../track/query';

export type CameraMode = 'chase' | 'lookBack' | 'flyover' | 'finishOrbit' | 'podium' | 'attract';

export interface CameraModeParams {
  /** flyover: keys (default: none = chase), onDone; podium: x, y, z, radius; anything else a mode needs */
  [k: string]: unknown;
}

export interface CameraFeel {
  reducedMotion: boolean;
  /** extra horizontal FOV in landscape (GDD 2.1: +8°) */
  landscapeBonus: number;
}

/** What the camera may read besides the followed kart: the drawn kart position (respawn carry) and the track. */
export interface CameraSource {
  track: BuiltTrack;
  /** where kart `i` is drawn this frame */
  displayPos(i: number, out: { x: number; y: number; z: number; heading: number }): unknown;
  me: number;
}

const DEG = Math.PI / 180;
const BACK = 5.6;
const UP = 2.55;
const AHEAD = 7;
const LOOK_Y = 0.55;
const P_UP = 3.6;
const P_AHEAD = 9;
const P_LOOK_Y = 0;
const P_VFOV_MAX = 80;
/** FOV kicks (horizontal degrees) */
export const FOV_KICK = { boost: 6, strong: 10, drift: 3 } as const;
/** finish orbit: 180° over this many seconds at this radius / height */
export const ORBIT = { time: 3, radius: 3, height: 1.9, start: 0.7 } as const;
/** flyover: blend into the chase rig over this long at the end */
const FLY_BLEND = 0.6;

const hit: TrackHit = { i: 0, s: 0, d: 0, y: 0, surface: Surface.Road, wallL: 0, wallR: 0, branch: -1 };

export class ChaseCamera {
  readonly cam: PerspectiveCamera;
  private pos = new Vector3();
  private look = new Vector3();
  private readonly want = new Vector3();
  private readonly lookAt = new Vector3();
  private readonly tmpA = new Vector3();
  private readonly tmpB = new Vector3();
  private readonly carry = { x: 0, y: 0, z: 0, heading: 0 };
  private yaw = 0;
  private fovKick = 0;
  private trauma = 0;
  private time = 0;
  private init = false;
  /** look-ahead offset toward the inside of a drift (m, smoothed) */
  private drift = 0;
  /** 0 = landscape rig, 1 = portrait rig */
  private portrait = 0;
  lookBack = false;
  feel: CameraFeel = { reducedMotion: false, landscapeBonus: 0 };
  /** set by the feel lane on every race (respawn carry, wall check) */
  source: CameraSource | null = null;
  /** strong boost (10° kick) for the followed kart, set from the boost events */
  strongBoost = false;
  private modeNow: CameraMode = 'chase';
  private modeParams: CameraModeParams = {};
  private modeT = 0;
  private orbitFrom = 0;
  private flyEnd = 0;
  private flyDone = false;

  constructor(aspect: number) {
    this.cam = new PerspectiveCamera(60, aspect, 0.1, 1400);
    this.setAspect(aspect);
  }

  /** Switch the camera mode. */
  setMode(m: CameraMode, params: CameraModeParams = {}): void {
    this.modeNow = m;
    this.modeParams = params;
    this.modeT = 0;
    this.orbitFrom = this.yaw;
    this.flyDone = false;
    if (m === 'flyover') {
      const keys = params.keys as FlyoverKey[] | undefined;
      if (!keys || keys.length < 2) this.modeNow = 'chase';
      else this.flyEnd = keys[keys.length - 1].t;
    }
  }

  get mode(): CameraMode {
    return this.modeNow;
  }

  get params(): Readonly<CameraModeParams> {
    return this.modeParams;
  }

  /** Seconds into the current mode. */
  get modeTime(): number {
    return this.modeT;
  }

  /** Cut a flyover short (tap to skip): it blends into the chase rig. */
  skip(): void {
    if (this.modeNow !== 'flyover') return;
    this.modeT = Math.max(this.modeT, this.flyEnd);
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
    this.drift = 0;
    this.init = true;
  }

  update(k: KartState, x: number, y: number, z: number, heading: number, speed: number, topSpeed: number, dt: number): void {
    this.time += dt;
    this.modeT += dt;
    // the respawn hand carries the kart: follow what is drawn, not the frozen sim position
    if (k.respawnTicks > 0 && this.source) {
      const c = this.source.displayPos(this.source.me, this.carry) as typeof this.carry;
      x = c.x;
      y = c.y;
      z = c.z;
      heading = c.heading;
    }
    // the chase rig is always computed (the other modes blend from or into it)
    this.chase(k, x, y, z, heading, speed, topSpeed, dt);
    switch (this.modeNow) {
      case 'flyover':
        this.flyover();
        break;
      case 'finishOrbit':
        // from behind and to the side (clear of anything trailing behind the kart) round to its front
        this.orbit(x, y, z, Math.min(1, this.modeT / ORBIT.time), ORBIT.radius, ORBIT.height, this.orbitFrom + ORBIT.start, Math.PI);
        break;
      case 'attract':
        this.orbit(x, y, z, this.modeT, 7.5, 3.2 + Math.sin(this.modeT * 0.4) * 0.8, this.orbitFrom, 0.22);
        break;
      case 'podium': {
        const p = this.modeParams as { x?: number; y?: number; z?: number; radius?: number; yaw?: number };
        const r = p.radius ?? 7;
        const a = (p.yaw ?? 0) + Math.sin(this.modeT * 0.35) * 0.35;
        this.pos.set((p.x ?? x) + Math.sin(a) * r, (p.y ?? y) + r * 0.35, (p.z ?? z) + Math.cos(a) * r);
        this.look.set(p.x ?? x, (p.y ?? y) + 1.2, p.z ?? z);
        break;
      }
    }
    this.apply(k, speed, topSpeed, dt);
  }

  /** The chase rig (also lookBack). */
  private chase(k: KartState, x: number, y: number, z: number, heading: number, speed: number, topSpeed: number, dt: number): void {
    // follow the travel direction (not the drifting body), plus 8° into the drift
    const travel = speed > 2 && k.respawnTicks === 0 ? Math.atan2(k.vx, k.vz) : heading;
    let target = travel + (k.driftDir !== 0 ? -k.driftDir * 8 * DEG : 0);
    if (k.spinTicks > 0) target = this.yaw; // do not spin the camera with the kart
    if (this.lookBack || this.modeNow === 'lookBack') target += Math.PI;
    if (!this.init) this.snap(x, y, z, target);
    let dy = target - this.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    const lag = 1 - Math.exp(-dt / 0.12);
    this.yaw += dy * Math.min(1, lag * 1.4);
    const back = BACK + Math.min(1.2, speed / topSpeed) * 0.6;
    this.want.set(x - Math.sin(this.yaw) * back, y + this.up + (k.air ? 0.4 : 0), z - Math.cos(this.yaw) * back);
    this.wallClamp(this.want, x, z, k.si);
    const free = this.modeNow === 'chase' || this.modeNow === 'lookBack';
    if (free) {
      this.pos.lerp(this.want, Math.min(1, lag * 2.2));
      // never fall far below the kart (ramps, drops)
      if (this.pos.y < y + 1.6) this.pos.y = y + 1.6;
    }
    // smoothed look-ahead: the look point eases toward the inside of a drift
    const dTarget = k.driftDir !== 0 ? k.driftDir * 1.4 : 0;
    this.drift += (dTarget - this.drift) * Math.min(1, dt * 3);
    const rx = Math.cos(this.yaw);
    const rz = -Math.sin(this.yaw);
    this.lookAt.set(x + Math.sin(this.yaw) * this.ahead + rx * this.drift, y + this.lookY, z + Math.cos(this.yaw) * this.ahead + rz * this.drift);
    if (free) this.look.lerp(this.lookAt, Math.min(1, lag * 3));
  }

  /**
   * B59 (near-plane check, cheap): scenery sits outside the track walls, so the camera is kept inside them, pulled in
   * toward the kart along the rig's line. One track query per frame instead of a raycast against the scenery.
   */
  private wallClamp(p: Vector3, kx: number, kz: number, si: number): void {
    const s = this.source;
    if (!s || s.track.arena) return;
    const t = s.track;
    // the camera rides ~6 m behind the kart: the kart's sample is a good continuity hint
    queryTrack(t, p.x, p.z, si >= 0 && si < t.n ? si : 0, hit);
    const wall = (hit.d > 0 ? (hit.wallR ?? t.wallR[hit.i]) : (hit.wallL ?? t.wallL[hit.i])) - 0.6;
    const over = Math.abs(hit.d) - wall;
    if (over <= 0) return;
    // pull toward the kart by the overshoot (never closer than 2.5 m), and lift a little to look over the barrier
    const dx = kx - p.x;
    const dz = kz - p.z;
    const len = Math.sqrt(dx * dx + dz * dz) || 1;
    const pull = Math.min(over * 1.4, Math.max(0, len - 2.5));
    p.x += (dx / len) * pull;
    p.z += (dz / len) * pull;
    p.y += Math.min(1.2, over * 0.4);
  }

  private orbit(x: number, y: number, z: number, u: number, r: number, h: number, from: number, sweep: number): void {
    const e = this.modeNow === 'finishOrbit' ? u * u * (3 - 2 * u) : u;
    const a = from + Math.PI + e * sweep; // starts behind the kart
    this.tmpA.set(x + Math.sin(a) * r, y + h, z + Math.cos(a) * r);
    // the first half second eases out of the chase rig
    const blend = Math.min(1, this.modeT / 0.5);
    this.pos.lerp(this.tmpA, blend < 1 ? 0.12 + blend * 0.5 : 1);
    this.tmpB.set(x, y + 0.9, z);
    this.look.lerp(this.tmpB, blend < 1 ? 0.15 + blend * 0.5 : 1);
  }

  private flyover(): void {
    const keys = this.modeParams.keys as FlyoverKey[];
    const t = this.modeT;
    if (t < this.flyEnd) {
      catmull(keys, t, this.pos, this.look);
      return;
    }
    // blend from the last key into the live chase rig
    const u = Math.min(1, (t - this.flyEnd) / FLY_BLEND);
    const e = u * u * (3 - 2 * u);
    const last = keys[keys.length - 1];
    this.pos.set(last.x, last.y, last.z).lerp(this.want, e);
    this.look.set(last.lx, last.ly, last.lz).lerp(this.lookAt, e);
    if (u >= 1 && !this.flyDone) {
      this.flyDone = true;
      this.modeNow = 'chase';
      const done = this.modeParams.onDone as (() => void) | undefined;
      done?.();
    }
  }

  private apply(k: KartState, speed: number, topSpeed: number, dt: number): void {
    // FOV: horizontal spec → vertical
    const boosting = k.boostTicks > 0;
    const rm = this.feel.reducedMotion;
    const racing = this.modeNow === 'chase' || this.modeNow === 'lookBack';
    const kickTarget = rm || !racing ? 0 : boosting ? (this.strongBoost || k.autoTicks > 0 || k.boostLevel >= 1.34 ? FOV_KICK.strong : FOV_KICK.boost) : k.driftDir !== 0 ? FOV_KICK.drift : 0;
    const rate = kickTarget > this.fovKick ? dt / 0.12 : dt / 0.6;
    this.fovKick += (kickTarget - this.fovKick) * Math.min(1, rate * 3);
    const speedFov = rm || !racing ? 0 : Math.max(0, speed / topSpeed - 0.5) * 6;
    const hfov = (75 + this.feel.landscapeBonus + this.fovKick + speedFov) * DEG;
    const vfov = 2 * Math.atan(Math.tan(hfov / 2) / this.cam.aspect);
    const cap = 100 + (P_VFOV_MAX + this.fovKick * 0.6 - 100) * this.portrait;
    this.cam.fov = Math.min(cap, vfov / DEG);
    this.cam.updateProjectionMatrix();

    // trauma shake
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const sh = this.trauma * this.trauma * (rm ? 0.3 : 1) * (racing ? 1 : 0.3);
    const n = (o: number) => Math.sin(this.time * 47 + o) * 0.6 + Math.sin(this.time * 83 + o * 2.3) * 0.4;
    this.cam.position.set(this.pos.x + n(1) * 0.35 * sh, this.pos.y + n(2) * 0.35 * sh, this.pos.z + n(3) * 0.35 * sh);
    this.cam.lookAt(this.look);
    this.cam.rotateZ(n(4) * 2.5 * DEG * sh);
  }
}

/** Catmull-Rom through the keys' positions and look points at time t (clamped to the key range). */
function catmull(keys: readonly FlyoverKey[], t: number, pos: Vector3, look: Vector3): void {
  let i = 0;
  while (i < keys.length - 2 && t > keys[i + 1].t) i++;
  const k1 = keys[i];
  const k2 = keys[i + 1];
  const k0 = keys[Math.max(0, i - 1)];
  const k3 = keys[Math.min(keys.length - 1, i + 2)];
  const span = Math.max(1e-3, k2.t - k1.t);
  let u = Math.max(0, Math.min(1, (t - k1.t) / span));
  u = u * u * (3 - 2 * u) * 0.35 + u * 0.65; // gentle ease at each key
  const cr = (a: number, b: number, c: number, d: number) => {
    const u2 = u * u;
    const u3 = u2 * u;
    return 0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u2 + (-a + 3 * b - 3 * c + d) * u3);
  };
  pos.set(cr(k0.x, k1.x, k2.x, k3.x), cr(k0.y, k1.y, k2.y, k3.y), cr(k0.z, k1.z, k2.z, k3.z));
  look.set(cr(k0.lx, k1.lx, k2.lx, k3.lx), cr(k0.ly, k1.ly, k2.ly, k3.ly), cr(k0.lz, k1.lz, k2.lz, k3.lz));
}
