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
 *
 * Set pieces (SIM_VERSION 8, SETPIECES.md section 8; the juice lane tunes the feel on top): on a loop's rail the rig
 * rides behind and above the kart in the ribbon's frame and the camera's up follows the surface (eased over 0.15 s,
 * never faster than `STUNT_CAM.upRate`°/s, so a loop is a comfortable pitch, not a snap); on a wall lane the camera
 * rolls half the curl, at most `STUNT_CAM.wallRoll`°; in a tunnel it stays under the ceiling. Reduced motion: world up
 * always, and a loop is watched from a fixed "TV" camera beside it (hard cuts in and out).
 */
import { PerspectiveCamera, Vector3 } from 'three';
import { Surface, type FlyoverKey, type KartState } from '../../types';
import type { BuiltTrack } from '../track/build';
import { queryTrack, type TrackHit } from '../track/query';
import { LOOP_SHAPE } from '../track/stunt';
import { STUNT } from '../../tuning';
import { ribbonPose, type StuntPose } from '../render/stunt-pose';
import { TV_CANDIDATES, tvSpotAt } from './tv-spot';

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
  /**
   * SIM_VERSION 8: the drawn up / forward of kart `i` this frame when it is on a bent set piece (loop, wall lane);
   * false on the normal road. Optional (older sources: world up).
   */
  displayBasis?(i: number, out: { ux: number; uy: number; uz: number; fx: number; fy: number; fz: number }): boolean;
  /**
   * Reduced motion: the still TV camera's spot beside loop piece `pi` (the race view picks the spot its own meshes
   * block least); false or missing: the default spot (TV_CANDIDATES[0]).
   */
  tvSpot?(pi: number, out: { x: number; y: number; z: number }): boolean;
}

/** Set-piece camera comfort limits (SETPIECES.md section 8). */
export const STUNT_CAM = {
  /** the camera's up turns at most this fast, °/s, easing with a 0.15 s time constant (off a loop) */
  upRate: 240,
  /**
   * on a loop's rail (and `railFastTail` s after it) the cap follows the pitch rate instead: speed / radius × this
   * margin, at least `upRate` (playtest: 240°/s lagged the loop, the camera was still upside down after the exit and
   * the kart sat at the screen edge over the top)
   */
  railUpMargin: 1.5,
  railFastTail: 0.6,
  /** the up ease's time constant on the rail (0.15 s trails a 4 rad/s pitch by ~35°) */
  railUpTau: 0.06,
  upTau: 0.15,
  /** loop rig: behind and above the kart in the ribbon's frame (m) */
  loopBack: 7.5,
  loopUp: 2.6,
  /** wall lane: roll half the curl, at most this much (°) */
  wallRoll: 35,
  /** wall lane: the rig sits this far back along the road and this far toward the road from the kart (m) */
  laneBack: 6.5,
  laneIn: 3.2,
  /** wall lane: the rig rides this much higher than the chase rig (looks over the lane's top barrier) */
  laneUp: 0.7,
  /** juice: roll about the view axis inside a loop is capped here (°): the loop itself is a pitch, the comfortable axis */
  loopRoll: 10,
  /** juice: FOV (horizontal °) on a loop's rail, in a jump gap's flight, in a tunnel (negative = tighter) */
  loopFov: 6,
  airFov: 4,
  tunnelFov: -5,
  /** jump gap flight: the rig rises this much (m) and the look point blends this share toward the landing ring */
  airUp: 1,
  airLook: 0.4,
  /** tunnel: the rig closes in by this much (m back, m down), blended over `tunnelBlend` s at the portals */
  tunnelBack: 0.5,
  tunnelDown: 0.3,
  tunnelBlend: 0.25,
} as const;

const DEG = Math.PI / 180;
const BACK = 5.6;
const UP = 2.55;
const AHEAD = 7;
const LOOK_Y = 0.55;
/** portrait (phones): further back, higher and looking further ahead, so bends ahead are on screen */
// playtest round 2: 10 % closer (the phone player was ~70 px wide, and the far camera made 50cc feel slow)
const P_BACK = 6.3;
const P_UP = 3.6;
const P_AHEAD = 12;
const P_LOOK_Y = 0;
const P_VFOV_MAX = 90;
/** FOV kicks (horizontal degrees) */
export const FOV_KICK = { boost: 6, strong: 10, drift: 3 } as const;
/** finish orbit: 180° over this many seconds at this radius / height */
export const ORBIT = { time: 3, radius: 3, height: 1.9, start: 0.7 } as const;
/** an orbit pulled in off a wall comes no closer to the kart than this (m) */
const ORBIT_MIN = 1.2;
/** flyover: blend into the chase rig over this long at the end */
const FLY_BLEND = 0.6;

const hit: TrackHit = { i: 0, s: 0, d: 0, y: 0, surface: Surface.Road, wallL: 0, wallR: 0, branch: -1 };
const camPose: StuntPose = { x: 0, y: 0, z: 0, ux: 0, uy: 1, uz: 0, fx: 0, fy: 0, fz: 1 };

export class ChaseCamera {
  readonly cam: PerspectiveCamera;
  private pos = new Vector3();
  private look = new Vector3();
  private readonly want = new Vector3();
  private readonly lookAt = new Vector3();
  private readonly tmpA = new Vector3();
  private readonly tmpB = new Vector3();
  private readonly carry = { x: 0, y: 0, z: 0, heading: 0 };
  /** SIM_VERSION 8: the set-piece basis of the followed kart, the camera's smoothed up, its target */
  private readonly basis = { ux: 0, uy: 1, uz: 0, fx: 0, fy: 0, fz: 1 };
  private readonly camUp = new Vector3(0, 1, 0);
  private readonly upWant = new Vector3(0, 1, 0);
  private readonly tmpC = new Vector3();
  private readonly tv = new Vector3();
  /** -1 none, else the loop piece the TV camera is watching (reduced motion) */
  private tvLoop = -1;
  /** on a loop's rail: the up vector's turn cap (rad/s) and how long it still applies after the rail */
  private railUpRate = 0;
  private railTail = 0;
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
  /** juice: 0..1 blends for the tunnel rig and the jump-gap air cam, and the set-piece FOV term (smoothed, °) */
  private tunnelK = 0;
  private airK = 0;
  private stuntFov = 0;
  private readonly ring = new Vector3();
  private readonly side = new Vector3();

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
    this.blends(k, dt);
    // the chase rig is always computed (the other modes blend from or into it)
    this.chase(k, x, y, z, heading, speed, topSpeed, dt);
    if (this.modeNow === 'chase' || this.modeNow === 'lookBack') this.stunt(k, x, y, z, dt);
    else {
      this.upWant.set(0, 1, 0);
      this.easeUp(dt);
    }
    switch (this.modeNow) {
      case 'flyover':
        this.flyover();
        break;
      case 'finishOrbit':
        // from behind and to the side (clear of anything trailing behind the kart) round to its front
        // (portrait pulls out to 5 m: at 3 m the narrow screen showed only the kart's side, a blur of colour)
        this.orbit(k, x, y, z, Math.min(1, this.modeT / ORBIT.time), ORBIT.radius + 2 * this.portrait, ORBIT.height + 0.6 * this.portrait, this.orbitFrom + ORBIT.start, Math.PI);
        break;
      case 'attract':
        this.orbit(k, x, y, z, this.modeT, 7.5, 3.2 + Math.sin(this.modeT * 0.4) * 0.8, this.orbitFrom, 0.22);
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
    // a slow drift slides sideways: never let the rig swing more than 25° off the kart's nose (it cut the kart off)
    if (k.spinTicks === 0 && k.respawnTicks === 0) {
      let off = target - heading;
      while (off > Math.PI) off -= Math.PI * 2;
      while (off < -Math.PI) off += Math.PI * 2;
      const lim = 25 * DEG;
      if (off > lim) target = heading + lim;
      else if (off < -lim) target = heading - lim;
    }
    if (k.spinTicks > 0) target = this.yaw; // do not spin the camera with the kart
    if (this.lookBack || this.modeNow === 'lookBack') target += Math.PI;
    if (!this.init) this.snap(x, y, z, target);
    let dy = target - this.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    const lag = 1 - Math.exp(-dt / 0.12);
    this.yaw += dy * Math.min(1, lag * 1.4);
    const back = BACK + (P_BACK - BACK) * this.portrait + Math.min(1.2, speed / topSpeed) * 0.6 - STUNT_CAM.tunnelBack * this.tunnelK;
    const lift = this.up + (k.air ? 0.4 : 0) + STUNT_CAM.airUp * this.airK - STUNT_CAM.tunnelDown * this.tunnelK;
    this.want.set(x - Math.sin(this.yaw) * back, y + lift, z - Math.cos(this.yaw) * back);
    // SIM_VERSION 8: on a loop's rail the rig is the set-piece one (stunt()): no wall or floor clamp
    const railed = k.rail > 0 && !!this.source?.displayBasis;
    if (!railed) this.wallClamp(this.want, x, z, k.si);
    const racing = this.modeNow === 'chase' || this.modeNow === 'lookBack';
    // juice: the catch net holds the camera where it is and only turns it to watch the kart bounce
    const netted = k.netTicks > 0 && racing;
    const free = racing && !railed && !netted;
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
    // juice: in a jump gap's flight the look point leans toward the glowing landing ring (the "where am I landing" cam)
    if (this.airK > 0 && this.ringTarget(k)) this.lookAt.lerp(this.ring, STUNT_CAM.airLook * this.airK);
    if (free) this.look.lerp(this.lookAt, Math.min(1, lag * 3));
    else if (netted) {
      this.tmpA.set(x, y + 0.6, z);
      this.look.lerp(this.tmpA, Math.min(1, lag * 3));
    }
  }

  /** The landing ring of the jump the kart launched from (world), into `this.ring`; false when none. */
  private ringTarget(k: KartState): boolean {
    const t = this.source?.track;
    const pc = t && k.gapLaunch > 0 ? t.pieces[k.gapLaunch - 1] : null;
    if (!pc || !t) return false;
    const i = pc.aimI;
    this.ring.set(t.px[i], pc.landY + 0.3, t.pz[i]);
    return true;
  }

  /**
   * Juice (set pieces): ease the tunnel rig (in over `tunnelBlend` s at the portals) and the jump-gap air cam, and
   * the set-piece FOV term. Reduced motion: no FOV change (the rig moves still apply: they are gentle and slow).
   */
  private blends(k: KartState, dt: number): void {
    const t = this.source?.track;
    const racing = this.modeNow === 'chase' || this.modeNow === 'lookBack';
    const inTunnel = !!t && racing && k.rail === 0 && k.branch === -1 && k.si >= 0 && k.si < t.n && t.tunnelMask[k.si] === 1;
    const rate = dt / STUNT_CAM.tunnelBlend;
    this.tunnelK = Math.max(0, Math.min(1, this.tunnelK + (inTunnel ? rate : -rate)));
    const flying = racing && k.gapLaunch > 0;
    this.airK += ((flying ? 1 : 0) - this.airK) * Math.min(1, dt / (flying ? 0.2 : 0.35));
    if (this.airK < 1e-3) this.airK = 0;
    const want = this.feel.reducedMotion || !racing ? 0 : (k.rail > 0 ? STUNT_CAM.loopFov : 0) + STUNT_CAM.airFov * this.airK + STUNT_CAM.tunnelFov * this.tunnelK;
    this.stuntFov += (want - this.stuntFov) * Math.min(1, dt / 0.2);
  }

  /** Juice state (tests, QA): the tunnel and air blends and the set-piece FOV term (°). */
  get stuntFeel(): { tunnel: number; air: number; fov: number } {
    return { tunnel: this.tunnelK, air: this.airK, fov: this.stuntFov };
  }

  /**
   * B59 (near-plane check, cheap): scenery sits outside the track walls, so the camera is kept inside them, pulled in
   * toward the kart along the rig's line. One track query per frame instead of a raycast against the scenery.
   */
  private wallClamp(p: Vector3, kx: number, kz: number, si: number, minLen = 2.5): void {
    // twice: one pull can land past the wall of the next bend sample (the portrait rig sits 7 m back)
    this.wallClampOnce(p, kx, kz, si, minLen);
    this.wallClampOnce(p, kx, kz, si, minLen);
    this.blockClamp(p, kx, kz);
  }

  /**
   * Playtest round 2 (battle B3: the sofa filled the phone screen for a whole frame at 96 km/h): solid props (the
   * arena's `BuiltTrack.blocks`) between the kart and the camera pull the camera in front of them, a little higher.
   */
  private blockClamp(p: Vector3, kx: number, kz: number): void {
    const blocks = this.source?.track.blocks;
    if (!blocks?.length) return;
    const dx = p.x - kx;
    const dz = p.z - kz;
    const a = dx * dx + dz * dz;
    if (a < 1e-6) return;
    const len = Math.sqrt(a);
    let tMin = 1;
    for (const b of blocks) {
      const R = b.r + 0.7;
      const fx = kx - b.x;
      const fz = kz - b.z;
      const c = fx * fx + fz * fz - R * R;
      if (c <= 0) continue; // the kart is (nearly) touching it: nothing sits between
      const bb = 2 * (fx * dx + fz * dz);
      const disc = bb * bb - 4 * a * c;
      if (disc <= 0) continue;
      const t1 = (-bb - Math.sqrt(disc)) / (2 * a);
      if (t1 > 0 && t1 < tMin) tMin = t1;
    }
    if (tMin >= 1) return;
    const keep = Math.max(2.5, tMin * len - 0.4) / len;
    p.x = kx + dx * keep;
    p.z = kz + dz * keep;
    p.y += 1.6 * (1 - keep);
  }

  private wallClampOnce(p: Vector3, kx: number, kz: number, si: number, minLen: number): void {
    const s = this.source;
    if (!s) return;
    const t = s.track;
    // an arena's inner wall is past the ring's centre: only its outer wall (the room's edge) can come between
    // the camera rides ~6 m behind the kart: the kart's sample is a good continuity hint
    queryTrack(t, p.x, p.z, si >= 0 && si < t.n ? si : 0, hit);
    const wall = (hit.d > 0 ? (hit.wallR ?? t.wallR[hit.i]) : (hit.wallL ?? t.wallL[hit.i])) - 0.6;
    const over = Math.abs(hit.d) - wall;
    if (over <= 0) return;
    // pull toward the kart by the overshoot (never closer than `minLen`), and lift a little to look over the barrier
    const dx = kx - p.x;
    const dz = kz - p.z;
    const len = Math.sqrt(dx * dx + dz * dz) || 1;
    const pull = Math.min(over * 1.4, Math.max(0, len - minLen));
    p.x += (dx / len) * pull;
    p.z += (dz / len) * pull;
    p.y += Math.min(1.2, over * 0.4);
  }

  private orbit(k: KartState, x: number, y: number, z: number, u: number, r: number, h: number, from: number, sweep: number): void {
    const e = this.modeNow === 'finishOrbit' ? u * u * (3 - 2 * u) : u;
    const a = from + Math.PI + e * sweep; // starts behind the kart
    this.tmpA.set(x + Math.sin(a) * r, y + h, z + Math.cos(a) * r);
    // B59 for the orbits: the swing to the kart's side must not go through the barrier into the scenery. The orbit is
    // only 3–7.5 m out, so it may come in closer than the chase rig's 2.5 m (it is lifted to look down at the kart)
    this.wallClamp(this.tmpA, x, z, k.si, ORBIT_MIN);
    this.wallClampOnce(this.tmpA, x, z, k.si, ORBIT_MIN);
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

  /**
   * Set pieces (SIM_VERSION 8): the loop rig and the up vector, the wall-lane roll, the tunnel ceiling. Runs after the
   * chase rig, so it overrides it only on a piece.
   */
  private stunt(k: KartState, x: number, y: number, z: number, dt: number): void {
    const src = this.source;
    const t = src?.track;
    const rm = this.feel.reducedMotion;
    const bent = !!(t && t.pieces.length && src?.displayBasis?.(src.me, this.basis));
    const b = this.basis;
    const pc = t && k.rail > 0 ? t.pieces[k.rail - 1] : null;
    if (pc && t && rm) {
      // reduced motion: a fixed TV camera beside the loop, world up, cut in and out
      if (this.tvLoop !== pc.id) {
        this.tvLoop = pc.id;
        if (!src?.tvSpot?.(k.rail - 1, this.tv)) tvSpotAt(t, pc, TV_CANDIDATES[0], this.tv);
        this.pos.copy(this.tv);
        this.camUp.set(0, 1, 0);
      }
      this.pos.copy(this.tv);
      this.look.set(x, y + 0.6, z);
      this.upWant.set(0, 1, 0);
      this.camUp.set(0, 1, 0);
      return;
    }
    if (this.tvLoop >= 0) {
      // cut back behind the kart
      this.tvLoop = -1;
      this.snap(x, y, z, this.yaw);
    }
    if (pc) {
      const v = Math.hypot(k.vx, k.vz);
      this.railUpRate = Math.max(STUNT_CAM.upRate * DEG, (v / LOOP_SHAPE.R) * STUNT_CAM.railUpMargin);
      this.railTail = STUNT_CAM.railFastTail;
    } else this.railTail = Math.max(0, this.railTail - dt);
    if (pc && t && bent && !rm) {
      // on the loop: on the ribbon behind the kart, lifted along the ribbon's own normal there (so it stays inside the
      // loop round its tight top), looking at a point ahead of the kart on the ribbon
      ribbonPose(t, pc, k.su - STUNT_CAM.loopBack, k.sd * 0.5, STUNT_CAM.loopUp, camPose);
      this.want.set(camPose.x, camPose.y, camPose.z);
      this.pos.lerp(this.want, Math.min(1, 1 - Math.exp(-dt / 0.05)));
      // look at the kart (a little ahead and above it on its own surface): it stays centred round the tight top
      this.lookAt.set(x + b.fx * 2 + b.ux * 1.1, y + b.fy * 2 + b.uy * 1.1, z + b.fz * 2 + b.uz * 1.1);
      this.look.lerp(this.lookAt, Math.min(1, 1 - Math.exp(-dt / 0.05)));
      this.upWant.set(b.ux, b.uy, b.uz);
      // juice: the corkscrew sway would roll the view; keep that roll within STUNT_CAM.loopRoll (the loop stays a pitch)
      this.loopSide(t, k.si);
      capRoll(this.upWant, this.side, STUNT_CAM.loopRoll * DEG);
    } else if (bent && !rm && t) {
      // a wall lane: the rig follows the bend from the road side of the kart (straight behind on the outside of a bend
      // it would sit beyond the curl and look through it)
      const side = k.d > 0 ? 1 : -1;
      const j = (k.si - Math.round(STUNT_CAM.laneBack / t.step) + t.n) % t.n;
      // clamp to sample j's own road + lane (playtest B2: in the taper the lane is narrower 6.5 m back and the rig sat
      // behind the curl or inside its skirt), then keep it inside the walls like the chase rig
      const laneJ = side > 0 ? t.laneR[j] : t.laneL[j];
      const maxD = Math.max(0, t.halfW[j] + Math.max(0, laneJ) - 1.5);
      const dl = side * Math.min(maxD, Math.max(0, Math.abs(k.d) - STUNT_CAM.laneIn));
      this.want.set(t.px[j] - t.tz[j] * dl, Math.max(y, k.y) + this.up + STUNT_CAM.laneUp, t.pz[j] + t.tx[j] * dl);
      this.wallClamp(this.want, x, z, j);
      this.pos.lerp(this.want, Math.min(1, 1 - Math.exp(-dt / 0.08)));
      // a wall lane: roll half the curl, capped
      this.upWant.set(b.ux, b.uy, b.uz).normalize();
      const tilt = Math.acos(Math.max(-1, Math.min(1, this.upWant.y)));
      const want = Math.min(tilt * 0.5, STUNT_CAM.wallRoll * DEG);
      if (tilt > 1e-4) {
        this.tmpC.set(this.upWant.x, 0, this.upWant.z).normalize();
        this.upWant.set(this.tmpC.x * Math.sin(want), Math.cos(want), this.tmpC.z * Math.sin(want));
      } else this.upWant.set(0, 1, 0);
    } else this.upWant.set(0, 1, 0);
    // a tunnel: stay under its ceiling
    if (t && !pc && t.tunnelMask[k.si] && this.pos.y > t.py[k.si] + STUNT.tunnel.ceiling - 1) this.pos.y = t.py[k.si] + STUNT.tunnel.ceiling - 1;
    this.easeUp(dt);
    if (pc && t && bent && !rm) capRoll(this.camUp, this.side, STUNT_CAM.loopRoll * DEG);
  }

  /** The shadow's horizontal right axis at sample `si` (a loop pitches about it), into `this.side`. */
  private loopSide(t: BuiltTrack, si: number): void {
    const i = si >= 0 && si < t.n ? si : 0;
    this.side.set(-t.tz[i], 0, t.tx[i]).normalize();
  }

  /** Roll inside a loop (tests): degrees between the camera's up and the loop's pitch plane. */
  loopRollDeg(si: number): number {
    const t = this.source?.track;
    if (!t) return 0;
    this.loopSide(t, si);
    return (Math.asin(Math.max(-1, Math.min(1, this.camUp.dot(this.side)))) * 180) / Math.PI;
  }

  /** Turn the camera's up toward `upWant`: a 0.15 s ease, never faster than STUNT_CAM.upRate °/s. */
  private easeUp(dt: number): void {
    const c = this.camUp;
    const w = this.upWant;
    const dot = Math.max(-1, Math.min(1, c.dot(w)));
    const ang = Math.acos(dot);
    if (ang < 1e-5 || dt <= 0) return;
    const rate = this.railTail > 0 ? this.railUpRate : STUNT_CAM.upRate * DEG;
    const tau = this.railTail > 0 ? STUNT_CAM.railUpTau : STUNT_CAM.upTau;
    const step = Math.min(ang, rate * dt, ang * (1 - Math.exp(-dt / tau)) + 1e-4);
    this.tmpC.crossVectors(c, w);
    if (this.tmpC.lengthSq() < 1e-10) this.tmpC.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    this.tmpC.normalize();
    c.applyAxisAngle(this.tmpC, step).normalize();
  }

  /** The camera's current up (tests: the comfort limits). */
  get upVector(): Readonly<Vector3> {
    return this.camUp;
  }

  private apply(k: KartState, speed: number, topSpeed: number, dt: number): void {
    // FOV: horizontal spec → vertical
    const boosting = k.boostTicks > 0;
    const rm = this.feel.reducedMotion;
    const racing = this.modeNow === 'chase' || this.modeNow === 'lookBack';
    const kickTarget = rm || !racing ? 0 : boosting ? (this.strongBoost || k.autoTicks > 0 || k.boostLevel >= 1.34 ? FOV_KICK.strong : FOV_KICK.boost) : k.driftDir !== 0 ? FOV_KICK.drift : 0;
    const rate = kickTarget > this.fovKick ? dt / 0.12 : dt / 0.6;
    this.fovKick += (kickTarget - this.fovKick) * Math.min(1, rate * 3);
    // plus an absolute term (playtest round 2: 100cc and 150cc felt no faster): about +1° at 50cc, +4° at 100cc and
    // +6° at 150cc top speed
    const speedFov = rm || !racing ? 0 : Math.max(0, speed / topSpeed - 0.5) * 6 + Math.max(0, Math.min(6, (speed - 23) * 0.7));
    const hfov = (75 + this.feel.landscapeBonus + this.fovKick + speedFov + this.stuntFov) * DEG;
    const vfov = 2 * Math.atan(Math.tan(hfov / 2) / this.cam.aspect);
    const cap = 100 + (P_VFOV_MAX + this.fovKick * 0.6 - 100) * this.portrait;
    this.cam.fov = Math.min(cap, vfov / DEG);
    this.cam.updateProjectionMatrix();

    // trauma shake
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const sh = this.trauma * this.trauma * (rm ? 0.3 : 1) * (racing ? 1 : 0.3);
    const n = (o: number) => Math.sin(this.time * 47 + o) * 0.6 + Math.sin(this.time * 83 + o * 2.3) * 0.4;
    this.cam.position.set(this.pos.x + n(1) * 0.35 * sh, this.pos.y + n(2) * 0.35 * sh, this.pos.z + n(3) * 0.35 * sh);
    this.cam.up.copy(this.camUp);
    this.cam.lookAt(this.look);
    this.cam.rotateZ(n(4) * 2.5 * DEG * sh);
  }
}

/** Keep `v` (unit) within `max` radians of the plane normal to `axis` (unit): the roll cap. */
export function capRoll(v: Vector3, axis: Vector3, max: number): void {
  const r = v.dot(axis);
  const lim = Math.sin(max);
  if (Math.abs(r) <= lim) return;
  // the part in the plane, scaled so the result stays unit at exactly the cap
  v.addScaledVector(axis, -r);
  const len = v.length();
  if (len < 1e-9) return;
  v.multiplyScalar(Math.cos(max) / len).addScaledVector(axis, Math.sign(r) * lim);
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
