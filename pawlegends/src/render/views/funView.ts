/**
 * Sim v21 (docs/plans/moba/V21-FUN.md §1.5, §1.6, §2): the Kibble Cannon, the Boing Beds and the Mega Yarn Balls on
 * the field. Render only: it reads the snapshot's `fun` block (the cannon's state, carrier, fuse, windup and aim; each
 * yarn ball) and the v21 events (a launch's flight arc, a bed's squash, the shot's muzzle cloud, a KABOOM's shockwave).
 * Sim v24 (V21-FUN.md §2.1 "v24: instant beds"): a bed wobbles when a hero steps on it, and while the player's own hero
 * is near one a dotted arc and a ring show where it throws (BED_GUIDE); the launch's squash, puff and ring play on the
 * `boing` event itself.
 * Sim v25 (founder: "hard to navigate through them"): the drawn toys match the sim's reach. The cannon's gold ring ends
 * where a hero's body takes it (CANNON_RING, out to 1.55 m), the ball is as big as a kick's contact (BALL_R), and the bed guide adds a
 * faint wedge behind the cushion: the 60° walk that throws (a walk across it from anywhere else does not).
 *
 * Original models built from primitives (a brass party cannon on a red-and-cream wheelbase, pastel cat beds with a paw
 * print, a striped yarn ball). Phone budget (PERF-IOS): a fixed set of meshes made once (one cannon, at most two balls,
 * the beds of the map, one lane telegraph), shared geometry and basic materials, no per-frame allocation; bursts go to
 * the shared particle pools and scale with the quality tier (Particles.countScale).
 */
import * as THREE from 'three';
import { BOING, CANNON, FUN_BY_MAP, YARN, YARN_BALLS } from '../../data/fun';
import { PLAYFIELD, RADIUS, mirrorX, mirrorY } from '../../data/map';
import type { FunSnap, SimEvent } from '../../sim/api';
import { toX, toZ } from '../coords';
import { RELATION } from '../palette';
import { SHAPE, type Particles } from '../fx/Particles.js';
import type { Shockwaves } from '../fx/Shockwaves.js';
import { PICKUP_BEAM } from './pickupView';

/** Flight arc of a Boing Bed launch: peak height (m) and length (s, the sim's BOING.flight ticks). */
export const LEAP = Object.freeze({ peak: 3.2, secs: BOING.flight / 30, spins: 1 });

/** The lane telegraph's width (m): the kibble's footprint (CANNON.radius) on both sides plus a hero's. */
export const LANE_W = ((CANNON.radius + 500) * 2) / 1000;

/** Height (m) of a leap `t` seconds into it (0 outside the flight): a parabola peaking at LEAP.peak. */
export function leapLift(t: number): number {
  if (t <= 0 || t >= LEAP.secs) return 0;
  const u = t / LEAP.secs;
  return 4 * LEAP.peak * u * (1 - u);
}

/**
 * Sim v25: the cannon's ground ring (m): its outer edge is where a hero's body reaches when the sim lets it take the
 * cannon (centre within CANNON.reach + RADIUS.hero, so the body's edge within CANNON.reach), plus a hairline so the touch
 * reads. v21–v24 drew it to 1.35 m against a 1.5 m body reach.
 */
export const CANNON_RING = Object.freeze({ inner: (CANNON.reach - 350) / 1000, outer: (CANNON.reach + 50) / 1000 });
/** Sim v25: the yarn ball's radius (m): a kick is a hero's body touching it (YARN.kickReach − RADIUS.hero). */
export const BALL_R = (YARN.kickReach - RADIUS.hero) / 1000;
/** Sim v25: the bed's throw wedge (m and rad): behind the cushion, ±60° around the way in that throws. */
export const BED_CONE = Object.freeze({ inner: 1.3, outer: 2.8, half: Math.PI / 3 });

const BRASS = 0xd9a441;
const RED = 0xd8443c;
const CREAM = 0xfff1d6;
const KIBBLE = 0xb5733a;
const BED_COLORS = [0xffc4d6, 0xc9e7ff, 0xd8f5c8, 0xffe6a8];
const YARN_PINK = 0xff7eb6;

/**
 * Sim v24: the bed guide. Shown while the player's own hero is within `near` m of a bed (and not flying): `dots` dots
 * on the flight arc from the cushion to the landing and a ring at the landing, fading in over the last `fade` m. A hero
 * stepping onto the disc (BOING.reach) wobbles the bed by `step` of a launch's squash.
 */
export const BED_GUIDE = Object.freeze({ near: 6, fade: 2, dots: 7, step: 0.45, reach: BOING.reach / 1000 });

/** Hero ids the bed wobble looks at (both teams of the 5v5 map; Crossing uses the first six). */
const HERO_SLOTS = 10;

interface Bed {
  root: THREE.Group;
  squash: number;
  /** Bed and landing centres (m). */
  bx: number;
  bz: number;
  lx: number;
  lz: number;
  /** The throw arrow's own material (brightens with the guide). */
  arrowMat: THREE.MeshBasicMaterial;
  /** The guide: dots on the arc and the landing ring, in world space; its own material for the fade. */
  guide: THREE.Group;
  guideMat: THREE.MeshBasicMaterial;
  dots: THREE.Mesh[];
  /** Bit h set = hero h was on the cushion last frame (a new bit wobbles the bed). */
  on: number;
  /** Sim v25: the throw wedge's own material (fainter than the dots) and geometry (its sector faces this bed's way). */
  coneMat: THREE.MeshBasicMaterial;
  coneGeo: THREE.RingGeometry;
}

interface Ball {
  root: THREE.Group;
  x: number;
  z: number;
  roll: number;
  /** Render only: the drawn offset (m) a hero's body pushes a resting ball aside by (eased). */
  nx: number;
  nz: number;
  /** Render only: seconds left of the shrink after it unravelled (a ball stopped at once by a tower still shows going). */
  fade: number;
}

/** Render only (sim v25): how a resting ball reads as a toy a hero walks through without kicking it. */
export const BALL_NUDGE = Object.freeze({ max: 0.45, ease: 10, fade: 0.35 });

/** The fuse's sparks (one options object, reused: no allocation per frame). */
const SPARK = { additive: true, n: 2, shape: SHAPE.STAR4, color: 0xffe14a, intensity: 2, size: [0.08, 0.14], life: [0.2, 0.35], speed: [0.5, 1.5], up: 1 };

/** No yarn balls (a snapshot without the `fun` block, e.g. an older sim's replay): shared, not allocated per frame. */
const NO_YARN: FunSnap['yarn'] = [];
const _p = new THREE.Vector3();
/** A launch's puff and ring (shared options objects). */
const BED_PUFF = { n: 8, shape: SHAPE.PUFF, color: 0xf3e7d3, size: [0.3, 0.5], life: [0.35, 0.6], speed: [1, 2.2], up: 0.6 };
const BED_RING = { r1: 2.2, dur: 0.3, color: '#FFF1D6', height: 0.35 };
const _d = new THREE.Vector3();

export class FunView {
  readonly group = new THREE.Group();
  /** The player's team and slot (the lane telegraph: gold for the player's own, blue for an ally's, red for theirs). */
  myTeam: 0 | 1 = 0;
  mySlot = 0;
  /** Reduce motion: no squash, spin or camera punch. */
  reduceMotion = false;
  private time = 0;
  private map = -1;
  private readonly cannon: THREE.Group;
  private readonly cannonRing: THREE.Mesh;
  private readonly cannonBeam: THREE.Mesh;
  private readonly fuseSpark: THREE.Mesh;
  private readonly soonRing: THREE.Mesh;
  private readonly lane: THREE.Mesh;
  private readonly laneMat: THREE.MeshBasicMaterial;
  private readonly balls: Ball[] = [];
  private readonly beds: Bed[] = [];
  /** Hero id → render time its leap started (a `boing` event), so heroView can lift it on the arc. */
  private readonly leaps = new Map<number, number>();
  /** The cannon's spawn drop (s since it appeared) and whether it was on the ground last frame. */
  private dropT = 9;
  private wasState: FunSnap['cannon']['state'] = 'away';
  /** The player's own aim preview while it drags the FIRE button (sim mm), or null. */
  aim: { x: number; y: number } | null = null;
  private sparkT = 0;

  constructor(
    private readonly particles: Particles,
    private readonly shock: Shockwaves,
  ) {
    this.group.name = 'fun';
    this.cannon = makeCannon();
    this.group.add(this.cannon);
    const ringGeo = new THREE.RingGeometry(CANNON_RING.inner, CANNON_RING.outer, 32);
    this.cannonRing = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffe14a, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.cannonRing.rotation.x = -Math.PI / 2;
    this.cannonRing.position.y = 0.06;
    this.cannonBeam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.42, 7, 8, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffe14a, transparent: true, opacity: PICKUP_BEAM.opacity, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
    );
    this.cannonBeam.position.y = 3.5;
    this.fuseSpark = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe14a, toneMapped: false }));
    this.soonRing = new THREE.Mesh(new THREE.RingGeometry(1.6, 1.9, 40), new THREE.MeshBasicMaterial({ color: 0xffe14a, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide }));
    this.soonRing.rotation.x = -Math.PI / 2;
    this.soonRing.position.y = 0.05;
    this.soonRing.visible = false;
    this.group.add(this.cannonRing, this.cannonBeam, this.soonRing);
    this.cannon.add(this.fuseSpark);
    this.fuseSpark.position.set(-0.55, 0.95, 0);
    // the shot lane: a flat strip from the carrier along the aim, as long as the shot's range
    const laneGeo = new THREE.PlaneGeometry(1, 1);
    laneGeo.rotateX(-Math.PI / 2);
    laneGeo.translate(0.5, 0, 0);
    this.laneMat = new THREE.MeshBasicMaterial({ color: RELATION.enemy, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    this.lane = new THREE.Mesh(laneGeo, this.laneMat);
    this.lane.position.y = 0.08;
    this.lane.renderOrder = 8;
    this.lane.visible = false;
    this.group.add(this.lane);
    this.cannon.visible = false;
    this.cannonRing.visible = false;
    this.cannonBeam.visible = false;
    const ballGeo = new THREE.SphereGeometry(BALL_R, 14, 10);
    const ballMat = new THREE.MeshLambertMaterial({ color: YARN_PINK });
    const bandGeo = new THREE.TorusGeometry(BALL_R + 0.01, 0.07, 6, 24);
    const bandMat = new THREE.MeshLambertMaterial({ color: 0xfff1f7 });
    for (let i = 0; i < YARN_BALLS; i++) {
      const root = new THREE.Group();
      const body = new THREE.Mesh(ballGeo, ballMat);
      root.add(body);
      for (let k = 0; k < 3; k++) {
        const band = new THREE.Mesh(bandGeo, bandMat);
        band.rotation.set(k * 1.1, k * 0.7, 0);
        root.add(band);
      }
      root.visible = false;
      this.group.add(root);
      this.balls.push({ root, x: 0, z: 0, roll: 0, nx: 0, nz: 0, fade: 0 });
    }
  }

  /** Build the beds of map `index` (MAP_IDS order), both teams' (team 1's are the reflection of team 0's). */
  private buildBeds(index: number): void {
    for (const b of this.beds) {
      this.group.remove(b.root, b.guide);
      b.arrowMat.dispose();
      b.guideMat.dispose();
      b.coneMat.dispose();
      b.coneGeo.dispose();
    }
    this.beds.length = 0;
    // sim v28: the Sunny Lane strip has no Boing Beds (they stand off its one lane)
    const rows = PLAYFIELD.strip === 1 ? [] : (FUN_BY_MAP[index]?.beds ?? []);
    const cushion = new THREE.CylinderGeometry(0.95, 1.05, 0.38, 20);
    const rim = new THREE.TorusGeometry(0.95, 0.2, 8, 24);
    const pad = new THREE.CircleGeometry(0.22, 12);
    const toe = new THREE.CircleGeometry(0.1, 10);
    const padMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
    const arrow = new THREE.ConeGeometry(0.35, 0.8, 3);
    const dot = new THREE.CircleGeometry(0.16, 10);
    dot.rotateX(-Math.PI / 2);
    const ring = new THREE.RingGeometry(0.75, 0.95, 28);
    ring.rotateX(-Math.PI / 2);
    for (let i = 0; i < rows.length * 2; i++) {
      const r = rows[i % rows.length];
      const team1 = i >= rows.length;
      const bx = team1 ? mirrorX(r[0]) : r[0];
      const by = team1 ? mirrorY(r[1]) : r[1];
      const lx = team1 ? mirrorX(r[2]) : r[2];
      const ly = team1 ? mirrorY(r[3]) : r[3];
      const root = new THREE.Group();
      const color = BED_COLORS[i % BED_COLORS.length];
      const mat = new THREE.MeshLambertMaterial({ color });
      const c = new THREE.Mesh(cushion, mat);
      c.position.y = 0.19;
      const rr = new THREE.Mesh(rim, mat);
      rr.rotation.x = Math.PI / 2;
      rr.position.y = 0.36;
      const paw = new THREE.Group();
      const p0 = new THREE.Mesh(pad, padMat);
      paw.add(p0);
      for (let k = 0; k < 4; k++) {
        const t = new THREE.Mesh(toe, padMat);
        t.position.set(-0.24 + k * 0.16, 0.26 + (k === 1 || k === 2 ? 0.06 : 0), 0);
        paw.add(t);
      }
      paw.rotation.x = -Math.PI / 2;
      paw.position.y = 0.395;
      // a faint arrow toward the landing (which way the bed throws)
      const arrowMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide });
      const a = new THREE.Mesh(arrow, arrowMat);
      const ang = Math.atan2(-(ly - by), lx - bx);
      a.rotation.set(-Math.PI / 2, 0, -Math.PI / 2);
      const holder = new THREE.Group();
      holder.add(a);
      holder.rotation.y = ang;
      a.position.set(1.6, 0.1, 0);
      root.add(c, rr, paw, holder);
      root.position.set(toX(bx), 0, toZ(by));
      // v24 guide: where this bed throws (dots on the arc, a ring at the landing), shown near the player's hero
      const guideMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
      const guide = new THREE.Group();
      const dots: THREE.Mesh[] = [];
      for (let k = 0; k < BED_GUIDE.dots; k++) {
        const d = new THREE.Mesh(dot, guideMat);
        dots.push(d);
        guide.add(d);
      }
      const land = new THREE.Mesh(ring, guideMat);
      land.position.set(toX(lx), 0.07, toZ(ly));
      guide.add(land);
      // v25: the wedge behind the cushion a walk comes in through to be thrown (heading within 60° of the throw)
      const coneMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
      const wx = toX(bx) - toX(lx);
      const wz = toZ(by) - toZ(ly);
      // a flat ring sector: local angle θ lies at world (cos θ, −sin θ) once rotated flat
      const mid = Math.atan2(-wz, wx);
      const coneGeo = new THREE.RingGeometry(BED_CONE.inner, BED_CONE.outer, 16, 1, mid - BED_CONE.half, BED_CONE.half * 2);
      const cone = new THREE.Mesh(coneGeo, coneMat);
      cone.rotation.x = -Math.PI / 2;
      cone.position.set(toX(bx), 0.06, toZ(by));
      guide.add(cone);
      guide.visible = false;
      this.group.add(root, guide);
      this.beds.push({ root, squash: 0, bx: toX(bx), bz: toZ(by), lx: toX(lx), lz: toZ(ly), arrowMat, guide, guideMat, dots, on: 0, coneMat, coneGeo });
    }
  }

  /** Bed index nearest (x, z) m, within 2 m, or −1. */
  private bedAt(x: number, z: number): number {
    let best = -1;
    let bd = 4;
    for (let i = 0; i < this.beds.length; i++) {
      const p = this.beds[i].root.position;
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  }

  /** How high (m) hero `id` flies right now (heroView adds it to the body). */
  liftOf(id: number): number {
    const at = this.leaps.get(id);
    if (at === undefined) return 0;
    const t = this.time - at;
    if (t >= LEAP.secs) {
      this.leaps.delete(id);
      return 0;
    }
    return leapLift(t);
  }

  /** A spin (rad) of a leaping hero (0 under reduce motion). */
  spinOf(id: number): number {
    const at = this.leaps.get(id);
    if (at === undefined || this.reduceMotion) return 0;
    const u = Math.min(1, Math.max(0, (this.time - at) / LEAP.secs));
    return u * Math.PI * 2 * LEAP.spins;
  }

  /** The v21 events' visuals (the announcer does the words, effects/sfx the sounds). */
  event(e: SimEvent, who: (id: number) => { x: number; z: number } | null): void {
    switch (e.type) {
      case 'boing': {
        this.leaps.set(e.id, this.time);
        const b = this.bedAt(toX(e.x), toZ(e.y));
        if (b >= 0) this.beds[b].squash = 1;
        _p.set(toX(e.x), 0.2, toZ(e.y));
        this.particles.burst(_p, BED_PUFF);
        // v24: a ring off the cushion the moment it throws (the sound plays on the same event, gameView)
        this.shock.start(_p.setY(0), BED_RING);
        return;
      }
      case 'cannonFire': {
        const w = who(e.id);
        const x = w ? w.x : toX(e.x);
        const z = w ? w.z : toZ(e.y);
        _d.set(toX(e.ax) - x, 0, toZ(e.ay) - z);
        if (_d.lengthSq() > 0) _d.normalize();
        _p.set(x + _d.x * 1.1, 1.0, z + _d.z * 1.1);
        // the muzzle cloud: a big puff of cream smoke and a few sparks down the lane
        this.particles.burst(_p, { n: 10, shape: SHAPE.PUFF, color: 0xfaf3e6, size: [0.6, 1.0], life: [0.6, 1.0], speed: [1, 3], dir: _d, spread: 0.9, drag: 2 });
        this.particles.burst(_p, { additive: true, n: 10, shape: SHAPE.STAR4, color: 0xffe14a, intensity: 2, size: [0.18, 0.3], life: [0.3, 0.5], speed: [5, 9], dir: _d, spread: 0.35 });
        this.shock.start(_p.setY(0), { r1: 2.2, dur: 0.25, color: '#FFF08A', height: 0.4 });
        return;
      }
      case 'kaboom': {
        const w = who(e.dst);
        if (!w) return;
        _p.set(w.x, 1.0, w.z);
        this.shock.start(_p.setY(0), { r1: 5, dur: 0.45, color: '#FFE14A', height: 1 });
        _p.y = 1.2;
        this.particles.burst(_p, { n: 18, shape: SHAPE.CONFETTI, color: KIBBLE, size: [0.16, 0.3], life: [0.7, 1.1], speed: [3, 7], up: 4, gravity: -9 });
        this.particles.burst(_p, { additive: true, n: 14, shape: SHAPE.STAR4, color: 0xffe14a, intensity: 2.2, size: [0.25, 0.4], life: [0.4, 0.7], speed: [3, 6], up: 2 });
        return;
      }
      case 'cannonParry': {
        const w = who(e.id);
        if (!w) return;
        _p.set(w.x, 1.2, w.z);
        this.particles.ring(_p, { n: 16, r0: 0.6, speed: [2, 3.5], up: 1, color: 0xffe14a, alpha: 1, additive: true, size: [0.2, 0.3], shape: SHAPE.STAR4, intensity: 2 });
        return;
      }
      case 'cannonBlock': {
        _p.set(toX(e.x), 1.2, toZ(e.y));
        this.shock.start(_p.setY(0), { r1: 3, dur: 0.35, color: '#7CC6FF', height: 1 });
        _p.y = 1.2;
        this.particles.burst(_p, { n: 12, shape: SHAPE.CONFETTI, color: KIBBLE, size: [0.14, 0.26], life: [0.5, 0.9], speed: [2, 5], up: 3, gravity: -9 });
        this.particles.ring(_p, { n: 12, r0: 0.5, speed: [2, 3], up: 0.6, color: 0x7cc6ff, alpha: 1, additive: true, size: [0.2, 0.3], shape: SHAPE.STAR4, intensity: 1.8 });
        return;
      }
      case 'cannonFizzle':
      case 'cannonDrop': {
        _p.set(toX(e.x), 0.8, toZ(e.y));
        this.particles.burst(_p, { n: 6, shape: SHAPE.PUFF, color: 0xbdb5a8, size: [0.4, 0.7], life: [0.5, 0.9], speed: [0.5, 1.4], up: 1.2 });
        if (e.type === 'cannonFizzle') this.particles.burst(_p, { n: 10, shape: SHAPE.CONFETTI, color: 0xff3d7f, size: [0.12, 0.2], life: [0.6, 1], speed: [1, 2.5], up: 2.5, gravity: -6 });
        return;
      }
      case 'yarnUnravel': {
        _p.set(toX(e.x), 0.8, toZ(e.y));
        this.particles.burst(_p, { n: 14, shape: SHAPE.STAR4, color: YARN_PINK, size: [0.12, 0.22], life: [0.6, 1], speed: [1.5, 3.5], up: 2, gravity: -5 });
        return;
      }
      case 'cannonSpawn':
        this.dropT = 0;
        return;
      default:
        return;
    }
  }

  /** Draw from the latest snapshot's `fun` block. `heroAt` gives a hero's drawn place (m), for the carried cannon. */
  update(fun: FunSnap | undefined, map: number, dt: number, heroAt: (id: number) => { x: number; z: number; yaw: number } | null, carrierTeam: (id: number) => number): void {
    this.time += dt;
    if (map !== this.map) {
      this.map = map;
      this.buildBeds(map);
    }
    this.updateBeds(dt, heroAt);
    const c = fun?.cannon;
    const state = c?.state ?? 'away';
    if (state === 'ground' && this.wasState !== 'ground' && this.wasState !== 'soon') this.dropT = 0.6; // a drop, no sky fall
    this.wasState = state;
    this.cannon.visible = state === 'ground' || state === 'carried';
    this.cannonRing.visible = state === 'ground';
    this.cannonBeam.visible = state === 'ground';
    this.soonRing.visible = state === 'soon';
    this.lane.visible = false;
    if (c && state === 'soon') {
      this.soonRing.position.set(toX(c.x), 0.05, toZ(c.y));
      const s = 1 + 0.12 * Math.sin(this.time * 6);
      this.soonRing.scale.setScalar(s);
    }
    if (c && state === 'ground') {
      this.dropT += dt;
      const fall = Math.max(0, 1 - this.dropT / 0.6);
      const bounce = this.dropT > 0.6 && this.dropT < 0.9 ? Math.sin(((this.dropT - 0.6) / 0.3) * Math.PI) * 0.4 : 0;
      this.cannon.position.set(toX(c.x), fall * fall * 12 + bounce, toZ(c.y));
      this.cannon.rotation.set(0, this.time * 0.8, 0);
      this.cannon.scale.setScalar(1.4);
      this.cannonRing.position.set(toX(c.x), 0.06, toZ(c.y));
      this.cannonRing.scale.setScalar(1 + Math.sin(this.time * 4) * 0.08);
      this.cannonBeam.position.set(toX(c.x), 3.5, toZ(c.y));
      if (this.dropT >= 0.6 && this.dropT - dt < 0.6) {
        _p.set(toX(c.x), 0, toZ(c.y));
        this.shock.start(_p, { r1: 2.8, dur: 0.35, color: '#F3E7D3', height: 0.3 });
      }
    }
    if (c && state === 'carried' && c.by >= 0) {
      // the carrier's drawn place; unseen (fog, out of view), the snapshot's carrier position (the sim sends it to both
      // teams, the carrier is revealed anyway), so the cannon never hangs where the hero was last drawn
      const h = heroAt(c.by);
      const hx = h ? h.x : toX(c.x);
      const hz = h ? h.z : toZ(c.y);
      const yaw = h ? h.yaw : this.cannon.rotation.y;
      // on the carrier's back, barrel up and back; it swells during the windup
      const wind = c.windup > 0 ? 1 - c.windup / CANNON.windup : 0;
      this.cannon.position.set(hx - Math.cos(yaw) * 0.35, 1.9 + wind * 0.2, hz + Math.sin(yaw) * 0.35);
      this.cannon.rotation.set(0, yaw, c.windup > 0 ? 0.25 : 0.9);
      this.cannon.scale.setScalar(1.2 * (1 + wind * 0.25));
      const rel = c.by === this.mySlot ? RELATION.self : carrierTeam(c.by) === this.myTeam ? RELATION.ally : RELATION.enemy;
      if (c.windup > 0) this.drawLane(hx, hz, toX(c.ax), toZ(c.ay), rel, 0.35 + 0.35 * wind);
      else if (this.aim && c.by === this.mySlot) this.drawLane(hx, hz, toX(this.aim.x), toZ(this.aim.y), RELATION.self, 0.25);
    }
    // the fuse spark: blinks faster as the fuse runs low (every 0.5 s, then every 0.15 s under 5 s)
    if (this.cannon.visible && c) {
      const fast = state === 'carried' && (c.windup > 0 || c.fuse < 150);
      this.sparkT += dt;
      const period = fast ? 0.15 : 0.5;
      this.fuseSpark.visible = this.sparkT % period < period * 0.55;
      if (state === 'carried' && this.sparkT > period) {
        this.sparkT = 0;
        this.fuseSpark.getWorldPosition(_p);
        this.particles.burst(_p, SPARK);
      }
    }
    const yarn = fun?.yarn ?? NO_YARN;
    for (let i = 0; i < this.balls.length; i++) {
      const b = this.balls[i];
      const y = yarn[i];
      if (!y || y.state === 'away') {
        // it just unravelled: shrink away where it was drawn instead of vanishing in one frame
        if (b.root.visible && b.fade <= 0 && y) b.fade = BALL_NUDGE.fade;
        if (b.fade > 0) {
          b.fade = Math.max(0, b.fade - dt);
          b.root.scale.setScalar(Math.max(0.01, b.fade / BALL_NUDGE.fade));
        }
        b.root.visible = b.fade > 0;
        b.nx = 0;
        b.nz = 0;
        continue;
      }
      b.fade = 0;
      b.root.scale.setScalar(1);
      b.root.visible = true;
      const x = toX(y.x);
      const z = toZ(y.y);
      const moved = Math.hypot(x - b.x, z - b.z);
      if (moved > 0.0001 && moved < 3) {
        b.roll += moved / 0.85;
        b.root.rotation.set(0, Math.atan2(-(z - b.z), x - b.x), 0);
        b.root.children[0].rotation.z = -b.roll;
        for (let k = 1; k < b.root.children.length; k++) b.root.children[k].rotation.z = -b.roll + k * 1.1;
      }
      b.x = x;
      b.z = z;
      // a resting ball leans away from a hero's body inside it (a walk through it that does not kick, sim v25)
      let tx = 0;
      let tz = 0;
      if (y.state === 'rest') {
        const touch = BALL_R + RADIUS.hero / 1000;
        for (let h = 0; h < HERO_SLOTS; h++) {
          const p = heroAt(h);
          if (!p) continue;
          const dx = x - p.x;
          const dz = z - p.z;
          const d = Math.hypot(dx, dz);
          if (d >= touch) continue;
          const push = Math.min(BALL_NUDGE.max, touch - d);
          if (d < 0.0001) {
            tx += push;
            continue;
          }
          tx += (dx / d) * push;
          tz += (dz / d) * push;
        }
        const len = Math.hypot(tx, tz);
        if (len > BALL_NUDGE.max) {
          tx = (tx / len) * BALL_NUDGE.max;
          tz = (tz / len) * BALL_NUDGE.max;
        }
      }
      const k = Math.min(1, dt * BALL_NUDGE.ease);
      b.nx += (tx - b.nx) * k;
      b.nz += (tz - b.nz) * k;
      b.root.position.set(x + b.nx, 0.85, z + b.nz);
    }
  }

  /** Sim v24: each bed's wobble when a hero steps on, its squash, and the guide near the player's own hero. */
  private updateBeds(dt: number, heroAt: (id: number) => { x: number; z: number; yaw: number } | null): void {
    const me = this.leaps.has(this.mySlot) ? null : heroAt(this.mySlot);
    const mx = me ? me.x : 0;
    const mz = me ? me.z : 0;
    const r2 = BED_GUIDE.reach * BED_GUIDE.reach;
    for (const b of this.beds) {
      // a hero stepping onto the cushion: a small wobble (the launch itself squashes fully on the event)
      let on = 0;
      for (let h = 0; h < HERO_SLOTS; h++) {
        const p = heroAt(h);
        if (p && (p.x - b.bx) ** 2 + (p.z - b.bz) ** 2 <= r2) on |= 1 << h;
      }
      if ((on & ~b.on) !== 0 && b.squash < BED_GUIDE.step) b.squash = BED_GUIDE.step;
      b.on = on;
      if (b.squash > 0) {
        b.squash = Math.max(0, b.squash - dt * 3);
        const k = this.reduceMotion ? 0 : Math.sin(b.squash * Math.PI) * b.squash;
        b.root.scale.set(1 + 0.25 * k, 1 - 0.45 * k, 1 + 0.25 * k);
      }
      // the guide: fades in as the player's hero comes within BED_GUIDE.near m
      const d = me ? Math.hypot(mx - b.bx, mz - b.bz) : Infinity;
      const a = Math.min(1, Math.max(0, (BED_GUIDE.near - d) / BED_GUIDE.fade));
      b.guide.visible = a > 0;
      b.arrowMat.opacity = 0.35 + 0.5 * a;
      if (a <= 0) continue;
      const pulse = this.reduceMotion ? 1 : 0.75 + 0.25 * Math.sin(this.time * 6);
      b.guideMat.opacity = 0.85 * a * pulse;
      b.coneMat.opacity = 0.22 * a;
      // dots on the flight arc (LEAP's parabola), drifting toward the landing
      const n = b.dots.length;
      const drift = this.reduceMotion ? 0 : (this.time * 0.8) % (1 / n);
      for (let k = 0; k < n; k++) {
        const u = ((k + 0.5) / n + drift) % 1;
        const dot = b.dots[k];
        dot.position.set(b.bx + (b.lx - b.bx) * u, 0.08 + leapLift(u * LEAP.secs) * 0.35, b.bz + (b.lz - b.bz) * u);
      }
    }
  }

  /** The aim lane in `color` (RELATION: self gold, ally blue, enemy red, as the HUD and the kill feed). */
  private drawLane(x: number, z: number, ax: number, az: number, color: number, alpha: number): void {
    const range = (FUN_BY_MAP[this.map]?.cannon.range ?? 16000) / 1000;
    const ang = Math.atan2(-(az - z), ax - x);
    this.lane.visible = true;
    this.lane.position.set(x, 0.08, z);
    this.lane.rotation.set(0, ang, 0);
    this.lane.scale.set(range, 1, LANE_W);
    this.laneMat.color.setHex(color);
    this.laneMat.opacity = alpha;
  }

  dispose(): void {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) for (const x of mat) x.dispose();
      else mat?.dispose();
    });
    this.leaps.clear();
  }
}

/** The Kibble Cannon: a brass barrel on a red-and-cream wheelbase, a cream band and a kibble in the muzzle (≈ 1 m). */
function makeCannon(): THREE.Group {
  const g = new THREE.Group();
  const brass = new THREE.MeshLambertMaterial({ color: BRASS });
  const red = new THREE.MeshLambertMaterial({ color: RED });
  const cream = new THREE.MeshLambertMaterial({ color: CREAM });
  const kib = new THREE.MeshLambertMaterial({ color: KIBBLE });
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.36, 1.3, 14), brass);
  barrel.rotation.z = Math.PI / 2 - 0.35;
  barrel.position.set(0.1, 0.62, 0);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.07, 8, 16), brass);
  lip.rotation.y = Math.PI / 2;
  lip.rotation.z = -0.35;
  lip.position.set(0.7, 0.85, 0);
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.06, 6, 16), cream);
  band.rotation.y = Math.PI / 2;
  band.rotation.z = -0.35;
  band.position.set(-0.05, 0.56, 0);
  const kibble = new THREE.Mesh(new THREE.DodecahedronGeometry(0.2, 0), kib);
  kibble.position.set(0.72, 0.86, 0);
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.18, 0.6), red);
  base.position.y = 0.32;
  g.add(barrel, lip, band, kibble, base);
  const wheel = new THREE.CylinderGeometry(0.3, 0.3, 0.12, 14);
  for (const s of [-1, 1]) {
    const w = new THREE.Mesh(wheel, cream);
    w.rotation.x = Math.PI / 2;
    w.position.set(0, 0.3, s * 0.38);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.14, 8), red);
    hub.rotation.x = Math.PI / 2;
    hub.position.copy(w.position);
    g.add(w, hub);
  }
  return g;
}
