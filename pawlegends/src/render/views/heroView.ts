/**
 * Heroes: one upright PPK-style character per slot (render/chars/: one skinned mesh, plus an ink outline hull on Med
 * and High), a relation ring underfoot, and the animation the snapshots imply: facing from the interpolated yaw with
 * a turn lean, a gait whose phase follows ground distance, the per-hero attack and cast, hit flinch, held poses for
 * block / channel / stun / fear, the faint pose and sink on death, the nap pose while recalling, a respawn pop, and
 * stealth. Render only: reads interpolated ViewEntity data, never the sim.
 */
import * as THREE from 'three';
import { BuffFlag, type HeroId } from '../../sim/api';
import type { ViewEntity, ViewFrame } from '../interp';
import { toX, toZ } from '../coords';
import { RELATION } from '../palette';
import { ELEMENT_COLOR, lookKey, type Look } from '../cosmetics';
import { boldRingTexture, DecalLayer, discTexture, ringTexture } from './decals';
import { HERO_RING } from './models';
import { DETAIL, makeHero, type Character, type CharState } from '../chars';
import { getSkin, isCardSkinId } from '../skins/skinStore';
import { TierFx, type FxHero } from '../skins/tierFx';
import { cardFxFor, type CardFx } from '../skins/cardFx';
import { mixColor } from '../cosmetics';

export type Relation = 'self' | 'ally' | 'enemy' | 'neutral';

interface HeroRig {
  id: number;
  hero: HeroId;
  team: 0 | 1;
  key: string;
  ch: Character;
  yaw: number;
  deadT: number;
  wasDead: boolean;
  visible: boolean;
  flash: number;
  /** Last drawn position (m) for FX anchoring. */
  pos: THREE.Vector3;
  /** Frame stamp of the last frame that had this hero (replaces a per-frame Set, ANIM-SPEC D6). */
  seen: number;
  /** Smoothed planar velocity / acceleration (world m/s, m/s²) for springs and the dash stretch. */
  vx: number;
  vz: number;
  ax: number;
  az: number;
  /** Sim position (m) last frame (the velocity) and the smoothed visual push-apart offset (m). */
  simX: number;
  simZ: number;
  sepX: number;
  sepZ: number;
  /** Drawn body alpha (eased toward the stealth look; trailer v3.3 review). */
  alpha: number;
}

/**
 * Visual push-apart (render only; the sim lets units overlap): heroes closer than `min` m are drawn pushed apart along
 * the line between them, each by at most `cap` m, so two bodies never fuse into one blob or stand inside each other.
 */
export const SEPARATION = Object.freeze({ min: 1.5, cap: 1.2, rate: 20, iters: 4, zK: 2.2, warm: 0.85 });

/**
 * Structures and big units a hero body is drawn clear of (render only): a hero is pushed out of a tower's, core's or
 * Pudding's footprint to `r` + BODY_R m, at most `cap` m (trailer review: Lambo stood half inside the tower base).
 */
export const OBSTACLE_CLEAR = Object.freeze({ bodyR: 0.5, cap: 3.2 });

/**
 * Drawn offsets (m) for bodies at `pts` (pure): pairwise push-apart and push-out of the `obs` footprints, relaxed over
 * a few passes so a hero squeezed between a tower and an ally is not pushed back into either. Each offset is capped
 * (`cap` for the push-apart share, OBSTACLE_CLEAR.cap overall).
 */
export function layoutBodies(
  pts: readonly { x: number; z: number }[],
  obs: readonly { x: number; z: number; r: number }[] = [],
  warm: readonly { x: number; z: number }[] | null = null,
  min = SEPARATION.min,
  cap = SEPARATION.cap,
): { x: number; z: number }[] {
  // warm start from last frame's offsets (decaying): a body deep inside a moving footprint keeps pushing out the same
  // way instead of flipping sides frame to frame (trailer review: Clem stood in Pudding while he walked through her)
  const out = pts.map((_, i) => ({ x: (warm?.[i]?.x ?? 0) * SEPARATION.warm, z: (warm?.[i]?.z ?? 0) * SEPARATION.warm }));
  const cur = pts.map((p, i) => ({ x: p.x + out[i].x, z: p.z + out[i].z }));
  // the gameplay camera looks north from above: two bodies one behind the other (along z) overlap on screen sooner
  // than two side by side, so depth counts zK times less and the push goes mostly sideways (screen x)
  const k = SEPARATION.zK;
  const sq = cur.map((p) => ({ x: p.x, z: p.z / k }));
  for (let it = 0; it < SEPARATION.iters; it++) {
    for (let i = 0; i < cur.length; i++) {
      sq[i].x = cur[i].x;
      sq[i].z = cur[i].z / k;
    }
    const sep = spreadSideways(sq, min, cap);
    for (let i = 0; i < pts.length; i++) {
      out[i].x += sep[i].x * 0.5;
      out[i].z += sep[i].z * 0.5;
      if (obs.length) {
        const c = clearOfObstacles(pts[i].x + out[i].x, pts[i].z + out[i].z, obs);
        out[i].x += c.x;
        out[i].z += c.z;
      }
      const l = Math.hypot(out[i].x, out[i].z);
      const lim = OBSTACLE_CLEAR.cap;
      if (l > lim) {
        out[i].x *= lim / l;
        out[i].z *= lim / l;
      }
      cur[i].x = pts[i].x + out[i].x;
      cur[i].z = pts[i].z + out[i].z;
    }
  }
  return out;
}

/**
 * Pairwise push-apart in the depth-scaled space (z / zK: depth counts less), biased sideways: two bodies one behind the other are moved
 * apart across the screen (x), not further along the line of sight, where they would still overlap (pure).
 */
function spreadSideways(pts: readonly { x: number; z: number }[], min: number, cap: number): { x: number; z: number }[] {
  const out = pts.map(() => ({ x: 0, z: 0 }));
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const dx = pts[j].x - pts[i].x;
      const dz = pts[j].z - pts[i].z;
      const d = Math.hypot(dx, dz);
      if (d >= min) continue;
      const push = (min - d) / 2;
      const side = Math.abs(dx) > 1e-3 ? Math.sign(dx) : j % 2 === 0 ? 1 : -1;
      let ux = d > 1e-4 ? dx / d : side;
      let uz = d > 1e-4 ? dz / d : 0;
      if (Math.abs(ux) < 0.8) ux = side * 0.8;
      uz *= 0.6;
      const l = Math.hypot(ux, uz) || 1;
      ux /= l;
      uz /= l;
      out[i].x -= ux * push;
      out[i].z -= uz * push;
      out[j].x += ux * push;
      out[j].z += uz * push;
    }
  }
  for (const o of out) {
    const l = Math.hypot(o.x, o.z);
    if (l > cap) {
      o.x *= cap / l;
      o.z *= cap / l;
    }
  }
  return out;
}

/** The offset (m) that moves a body at (x, z) out of every footprint circle (pure; 0 when clear). */
export function clearOfObstacles(x: number, z: number, obs: readonly { x: number; z: number; r: number }[], bodyR = OBSTACLE_CLEAR.bodyR, cap = OBSTACLE_CLEAR.cap): { x: number; z: number } {
  let ox = 0;
  let oz = 0;
  for (const o of obs) {
    const dx = x + ox - o.x;
    const dz = z + oz - o.z;
    const d = Math.hypot(dx, dz);
    const min = o.r + bodyR;
    if (d >= min) continue;
    const ux = d > 1e-4 ? dx / d : 0;
    const uz = d > 1e-4 ? dz / d : 1;
    ox += ux * (min - d);
    oz += uz * (min - d);
  }
  const l = Math.hypot(ox, oz);
  if (l > cap) {
    ox *= cap / l;
    oz *= cap / l;
  }
  return { x: ox, z: oz };
}

/** Pairwise push-apart offsets (pure): for points (x, z) m, the offset (m) each is drawn at. Coincident points fan out. */
export function separate(pts: readonly { x: number; z: number }[], min = SEPARATION.min, cap = SEPARATION.cap): { x: number; z: number }[] {
  const out = pts.map(() => ({ x: 0, z: 0 }));
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      // a tiny fixed spread per index (golden angle), so heroes on one spot fan out round it instead of lining up
      let dx = pts[j].x + Math.cos(j * 2.39996) * 0.01 - pts[i].x - Math.cos(i * 2.39996) * 0.01;
      let dz = pts[j].z + Math.sin(j * 2.39996) * 0.01 - pts[i].z - Math.sin(i * 2.39996) * 0.01;
      let d = Math.hypot(dx, dz);
      if (d >= min) continue;
      if (d < 1e-4) {
        // coincident: a fixed direction per pair (golden angle), so three stacked heroes fan out instead of lining up
        dx = Math.cos(j * 2.39996) - Math.cos(i * 2.39996);
        dz = Math.sin(j * 2.39996) - Math.sin(i * 2.39996);
        const l = Math.hypot(dx, dz) || 1;
        dx /= l;
        dz /= l;
        d = 1e-4;
      }
      const push = (min - d) / 2;
      const ux = d > 1e-4 ? dx / d : dx;
      const uz = d > 1e-4 ? dz / d : dz;
      out[i].x -= ux * push;
      out[i].z -= uz * push;
      out[j].x += ux * push;
      out[j].z += uz * push;
    }
  }
  for (const o of out) {
    const l = Math.hypot(o.x, o.z);
    if (l > cap) {
      o.x *= cap / l;
      o.z *= cap / l;
    }
  }
  return out;
}

/** Peak hit-flash mix on a hero (trailer review: 0.42 turned a hit or tower-locked hero into a white body). */
export const HIT_FLASH_MAX = 0.22;

/**
 * The stealth look (render only): the body eases toward `alpha` at `rate` per s and back, and its outline hull stays
 * on until the body is below `outlineBelow`. Trailer v3.3 review: a dog hero whose stealth lasted 3 ticks snapped to a
 * pale, see-through grey copy without its outline and popped back (read as a broken material or a model popping in).
 */
export const STEALTH_LOOK = Object.freeze({ alpha: 0.42, rate: 8, outlineBelow: 0.6 });

/** The drawn body alpha this frame (pure): eased from `prev` toward the stealth look or full. */
export function stealthAlpha(prev: number, stealth: boolean, dt: number): number {
  const want = stealth ? STEALTH_LOOK.alpha : 1;
  const v = prev + (want - prev) * Math.min(1, Math.max(0, dt) * STEALTH_LOOK.rate);
  return Math.abs(v - want) < 0.01 ? want : v;
}

/**
 * After the match ends the render clock stops, so every body froze in its last pose (trailer v3.3 review: the heroes
 * held one pose after VICTORY!). Once the clock has stood still for `after` s past the end, the bodies idle on real
 * time (render only; hit-stops during play still hold their pose).
 */
export const END_IDLE = Object.freeze({ after: 0.25 });

/** The animation step this frame (pure): the render clock's step, or real time once the ended clock stands still. */
export function animStep(dtR: number, dt: number, ended: boolean, stillT: number): number {
  return ended && dtR <= 1e-4 && stillT >= END_IDLE.after ? dt : dtR;
}

/** The player's own ring is this much larger than a relation ring (it sits outside the hero's footprint). */
export const SELF_RING_SCALE = 1.15;
/** Seconds between the own ring's outward pings. */
const SELF_PING = 1.3;

/** Sim v9 status glows underfoot: Avietė's charge (her sparks) and a charm (Gabė's hearts). */
const CHARGE_GLOW = 0xffe24d;
const CHARM_GLOW = 0xff6fa8;

/** Wrap an angle difference to -PI..PI. */
const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

/** The animation state a hero snapshot implies. */
export function charState(e: Pick<ViewEntity, 'state' | 'buffs' | 'speed' | 'charmed'>): CharState {
  if (e.state === 'dead') return 'dead';
  if (e.state === 'napping') return 'napping';
  if (e.buffs & BuffFlag.Stunned) return 'stunned';
  // Sim v9: a charmed hero walks to its charmer (Gabė's Under Her Spell), it does not cower.
  if (e.buffs & BuffFlag.Feared) return e.charmed ? 'moving' : 'feared';
  if (e.buffs & BuffFlag.Blocking) return 'blocking';
  if (e.buffs & BuffFlag.Channeling) return 'channel';
  return (e.speed * 30) / 1000 > 0.35 ? 'moving' : 'idle';
}

export class HeroView {
  readonly group = new THREE.Group();
  private rigs = new Map<number, HeroRig>();
  // Normal blending: an additive red ring on sand reads yellow, like an ally's (enemy rings must read red).
  private rings = new DecalLayer(ringTexture(), 8, { additive: false, y: 0.05, name: 'hero-rings' });
  /** Round 0: a chroma reads at match zoom: a soft element-coloured glow underfoot, pulsing with the stride. */
  private auras = new DecalLayer(discTexture(), 8, { additive: true, y: 0.045, renderOrder: 1, name: 'hero-chroma' });
  /**
   * The player's own hero (brawl readability): a thick gold ring on an ink band, breathing, plus a ping ring that
   * rolls outward every SELF_PING s. Both draw after every VFX layer (renderOrder 9; particles 6–7, shockwaves 4–7),
   * so sparks and shockwaves never bury them; the depth test stays on, so the hero's body still sits in front.
   */
  private selfRing = new DecalLayer(boldRingTexture(), 1, { y: 0.065, renderOrder: 9, name: 'hero-self-ring' });
  private selfPing = new DecalLayer(ringTexture(), 1, { additive: true, y: 0.06, renderOrder: 9, name: 'hero-self-ping' });
  private time = 0;
  /** Seconds the render clock has stood still, and the real time idled since the match ended (END_IDLE). */
  private stillT = 0;
  private endIdle = 0;
  private frameNo = 0;
  /** Render tick of the last frame (clips run on the render clock, so hitstop holds them: D5). */
  private lastTick = NaN;
  /** The animation director (render/anim/director.ts); null keeps the legacy animator (lobby, tests). */
  director: { respawned(id: number): void; emote?(id: number): boolean } | null = null;
  mySlot = 0;
  myTeam: 0 | 1 = 0;
  /** Round 2: team 0 is the dogs (the human picked a dog); each team's cloth follows its species. */
  styleSwap = false;
  /** No visual push-apart (tests that read exact positions). */
  reducedSep = false;
  /** Footprints (m) of standing structures and Pudding this frame (gameView): bodies are drawn outside them. */
  obstacles: readonly { x: number; z: number; r: number }[] = [];
  private readonly sepPts: { x: number; z: number }[] = [];
  private readonly sepIds: number[] = [];
  private readonly sepWarm: { x: number; z: number }[] = [];
  shadows = true;
  /** Mesh detail and the outline hull (quality tier: Low is lighter and has no hull, POC.md §10). */
  detail: number = DETAIL.med;
  outlines = true;
  /** Render-only looks per hero slot (the player's cosmetics; bots wear the default). */
  looks = new Map<number, Look>();
  /** Card skin rarity effects (render/skins/tierFx.ts); null = none (the lobby). GameView sets it with its particles. */
  tierFx: TierFx | null = null;
  /** The camera focus (m) for the team-fight test. */
  focus = { x: 0, z: 0 };
  private readonly fxHero: FxHero = { id: 0, x: 0, z: 0, rung: 'COMMON', element: 'FIRE', self: false, moving: false, stealth: false, dead: false, napping: false, phase: 0 };
  private readonly fxPos: { x: number; z: number; dead: boolean }[] = Array.from({ length: 8 }, () => ({ x: 0, z: 0, dead: true }));
  /** Wave C (C4): per slot, the last drawn frame's team and stealth, and a reused CardFx. */
  private readonly slotTeam = new Uint8Array(16);
  private readonly slotStealth = new Uint8Array(16);
  private readonly cardOut: CardFx[] = Array.from({ length: 16 }, () => ({ rung: 'COMMON', name: '', tint: 0, self: false, team: 0, extras: false }));

  constructor() {
    this.group.name = 'heroes';
    this.group.add(this.rings.mesh);
    this.group.add(this.auras.mesh);
    this.group.add(this.selfRing.mesh, this.selfPing.mesh);
  }

  relationOf(e: { id: number; team: number }): Relation {
    if (e.id === this.mySlot) return 'self';
    if (e.team === 2) return 'neutral';
    return e.team === this.myTeam ? 'ally' : 'enemy';
  }

  /** Quality tier: rebuilds the heroes at the new detail on their next frame. */
  setQuality(low: boolean, outlines: boolean): void {
    this.detail = low ? DETAIL.low : DETAIL.med;
    this.outlines = outlines;
  }

  private drop(r: HeroRig): void {
    this.group.remove(r.ch.object);
    r.ch.dispose();
    this.rigs.delete(r.id);
  }

  private ensure(e: ViewEntity): HeroRig {
    let r = this.rigs.get(e.id);
    const look = this.looks.get(e.id) ?? null;
    const hero = e.hero ?? 'clem';
    const team = (e.team === 1 ? 1 : 0) as 0 | 1;
    // round 2: the cloth follows the species (a dog-picking human's team wears the Woof blue)
    const dress = (this.styleSwap ? 1 - team : team) as 0 | 1;
    const self = e.id === this.mySlot;
    const key = `${hero}:${dress}:${lookKey(look)}:${this.detail}:${this.outlines ? 1 : 0}:${self ? 1 : 0}`;
    if (r && r.key !== key) {
      this.drop(r);
      r = undefined;
    }
    if (!r) {
      const ch = makeHero(hero, dress, look, { detail: this.detail, outline: this.outlines, shadows: this.shadows, match: true, self });
      // no outline hull (Low): a darker ink rim keeps the silhouette off the sand (ivory Clem faded into the lane)
      if (!this.outlines) ch.material.userData.u.uRim.value = 0.78;
      ch.object.name = `hero-${e.id}`;
      this.group.add(ch.object);
      r = { id: e.id, hero, team, key, ch, yaw: e.yaw, deadT: 0, wasDead: e.state === 'dead', visible: true, flash: 0, pos: new THREE.Vector3(toX(e.fx), 0, toZ(e.fy)), seen: -1, vx: 0, vz: 0, ax: 0, az: 0, simX: toX(e.fx), simZ: toZ(e.fy), sepX: 0, sepZ: 0, alpha: 1 };
      this.rigs.set(e.id, r);
    }
    return r;
  }

  setShadows(on: boolean): void {
    this.shadows = on;
    for (const r of this.rigs.values()) r.ch.mesh.castShadow = on;
  }

  /** A basic attack or ability swing by `id`. */
  swing(id: number): void {
    this.rigs.get(id)?.ch.anim.swing();
  }

  /** A cast pose by `id`. */
  cast(id: number): void {
    this.rigs.get(id)?.ch.anim.cast();
  }

  /** Play an emote pose on hero `id` (render only). Returns false when that hero is not drawn. */
  emote(id: number, pose: string, seconds = 1.4): boolean {
    const r = this.rigs.get(id);
    if (!r || !r.visible) return false;
    // a filled hero plays its own authored emote; stubs keep the legacy pose
    if (this.director?.emote?.(id)) return true;
    r.ch.anim.emote(pose, seconds);
    return true;
  }

  hit(id: number, heavy = false): void {
    const r = this.rigs.get(id);
    if (!r) return;
    r.flash = heavy ? 1 : 0.75;
    r.ch.anim.hit(heavy);
  }

  /** Last drawn position (m) of a hero, for FX. */
  positionOf(id: number): THREE.Vector3 | null {
    const r = this.rigs.get(id);
    return r && r.visible ? r.pos : null;
  }

  /** The drawn hero `id` (character, hero, team, place) for the animation director, or null. */
  rigOf(id: number): HeroRig | null {
    return this.rigs.get(id) ?? null;
  }

  update(frame: ViewFrame, dt: number): void {
    this.time += dt;
    const stamp = ++this.frameNo;
    // the render clock's step (0 while a hitstop holds it): animation time, so impact poses hold (D5)
    const dtR = this.lastTick === this.lastTick ? Math.max(0, Math.min(0.1, (frame.tick - this.lastTick) / 30)) : dt;
    this.lastTick = frame.tick;
    // the ended match: the clock stands still, the bodies keep idling on real time (END_IDLE)
    const ended = frame.latest?.clock?.phase === 'ended';
    this.stillT = dtR > 1e-4 ? 0 : this.stillT + dt;
    const aStep = animStep(dtR, dt, ended, this.stillT);
    const idleEnd = ended && aStep !== dtR;
    if (idleEnd) this.endIdle += dt;
    else if (!ended) this.endIdle = 0;
    const now = frame.tick / 30 + this.endIdle;
    this.rings.begin();
    this.auras.begin();
    this.selfRing.begin();
    this.selfPing.begin();
    const fx = this.tierFx;
    if (fx) {
      let n = 0;
      for (const e of frame.entities) {
        if (e.kind !== 'hero' || n >= this.fxPos.length) continue;
        const q = this.fxPos[n++];
        q.x = toX(e.fx);
        q.z = toZ(e.fy);
        q.dead = e.state === 'dead';
      }
      for (let i = n; i < this.fxPos.length; i++) this.fxPos[i].dead = true;
      fx.begin(dt, this.focus.x, this.focus.z, this.fxPos);
    }
    // the visual push-apart targets for this frame (render only)
    this.sepPts.length = 0;
    this.sepIds.length = 0;
    this.sepWarm.length = 0;
    for (const e of frame.entities) {
      if (e.kind !== 'hero') continue;
      this.sepPts.push({ x: toX(e.fx), z: toZ(e.fy) });
      this.sepIds.push(e.id);
      const was = this.rigs.get(e.id);
      this.sepWarm.push({ x: was?.sepX ?? 0, z: was?.sepZ ?? 0 });
    }
    const sep = this.reducedSep ? null : layoutBodies(this.sepPts, this.obstacles, this.sepWarm);
    for (const e of frame.entities) {
      if (e.kind !== 'hero') continue;
      const r = this.ensure(e);
      r.seen = stamp;
      const ch = r.ch;
      const dead = e.state === 'dead';
      const simX = toX(e.fx);
      const simZ = toZ(e.fy);
      const si = sep ? this.sepIds.indexOf(e.id) : -1;
      const k = Math.min(1, dt * SEPARATION.rate);
      const tx = si >= 0 ? sep![si].x : 0;
      const tz = si >= 0 ? sep![si].z : 0;
      r.sepX += (tx - r.sepX) * k;
      r.sepZ += (tz - r.sepZ) * k;
      const x = simX + r.sepX;
      const z = simZ + r.sepZ;
      // planar velocity and acceleration (smoothed), for the springs and the dash stretch
      if (dtR > 1e-4) {
        const vx = (simX - r.simX) / dtR;
        const vz = (simZ - r.simZ) / dtR;
        const teleport = vx * vx + vz * vz > 900;
        const nvx = teleport ? 0 : vx;
        const nvz = teleport ? 0 : vz;
        const k = Math.min(1, dtR * 18);
        const ax = (nvx - r.vx) / dtR;
        const az = (nvz - r.vz) / dtR;
        r.ax += (Math.max(-80, Math.min(80, ax)) - r.ax) * k;
        r.az += (Math.max(-80, Math.min(80, az)) - r.az) * k;
        r.vx += (nvx - r.vx) * Math.min(1, dtR * 30);
        r.vz += (nvz - r.vz) * Math.min(1, dtR * 30);
      }
      r.pos.set(x, 0, z);
      r.simX = simX;
      r.simZ = simZ;
      if (dead && !r.wasDead) r.deadT = 0;
      if (!dead && r.wasDead) {
        ch.anim.respawn();
        this.director?.respawned(e.id);
      }
      r.wasDead = dead;
      if (dead) r.deadT += dt;
      // facing: the interpolated yaw, with the yaw rate for the turn lean
      const dyaw = dead ? 0 : wrap(e.yaw - r.yaw);
      const yawRate = dt > 0 ? dyaw / dt : 0;
      r.yaw = dead ? r.yaw : e.yaw;
      // object space (facing +X): the velocity and acceleration the root and springs read
      const cy = Math.cos(r.yaw);
      const sy = Math.sin(r.yaw);
      ch.anim.stack.yaw = r.yaw;
      ch.anim.update(this.director ? aStep : dt, {
        state: idleEnd && !dead ? 'idle' : charState(e),
        speed: idleEnd ? 0 : (e.speed * 30) / 1000,
        height: ch.height,
        yawRate,
        now: this.director ? now : undefined,
        vx: r.vx * cy - r.vz * sy,
        vz: r.vx * sy + r.vz * cy,
        ax: r.ax * cy - r.az * sy,
        az: r.ax * sy + r.az * cy,
      });
      const sink = dead ? Math.max(0, (r.deadT - 1.2) * 0.8) : 0;
      r.visible = !(dead && r.deadT > 2.6);
      ch.object.visible = r.visible;
      ch.object.position.set(x, -sink, z);
      ch.object.rotation.y = r.yaw;
      r.flash = Math.max(0, r.flash - dt * 5);
      const u = ch.material.userData.u;
      const fall = dead ? Math.min(1, r.deadT / 0.35) : 0;
      // the hit flash is capped so it never washes out the coat (a flashing pug read as a pale-pink blob)
      u.uFlashK.value = dead ? 0.35 * fall : Math.min(HIT_FLASH_MAX, r.flash * 0.3);
      u.uFlash.value.setHex(dead ? 0x6b6b80 : 0xffffff);
      const stealth = (e.buffs & BuffFlag.Stealth) !== 0;
      if (e.id >= 0 && e.id < 16) {
        this.slotTeam[e.id] = e.team === 1 ? 1 : 0;
        this.slotStealth[e.id] = stealth ? 1 : 0;
      }
      // eased (STEALTH_LOOK): a stealth of a few ticks is a shimmer, never a grey copy popping in and out
      r.alpha = stealthAlpha(r.alpha, stealth, dt);
      if (u.uOpacity.value !== r.alpha) {
        const was = u.uOpacity.value < 1;
        u.uOpacity.value = r.alpha;
        const tr = r.alpha < 1;
        if (tr !== was || ch.material.transparent !== tr) {
          ch.material.transparent = tr;
          ch.material.needsUpdate = true;
        }
        if (ch.outline) ch.outline.visible = r.alpha >= STEALTH_LOOK.outlineBelow;
      }
      // card skins (GDD §7.2): Epic glints, Legendary foil and recall flourish; never an aura
      const lookCoat = this.looks.get(e.id)?.coat;
      const skin = fx && isCardSkinId(lookCoat) ? getSkin(lookCoat) : null;
      if (fx && skin) {
        const h = this.fxHero;
        h.id = e.id;
        h.x = x;
        h.z = z;
        h.rung = skin.rung;
        h.element = skin.element;
        h.self = e.id === this.mySlot;
        h.moving = charState(e) === 'moving';
        h.stealth = stealth;
        h.dead = dead;
        h.napping = e.state === 'napping';
        h.phase = ch.anim.stridePhase;
        const foil = fx.hero(h);
        u.uFoil.value = foil;
        if (foil > 0) u.uFoilColor.value.setHex(mixColor(0xffffff, ELEMENT_COLOR[skin.element], 0.5));
      } else u.uFoil.value = 0;
      if (!dead) {
        const rel = this.relationOf(e);
        if (rel === 'self') {
          const size = HERO_RING[r.hero] * SELF_RING_SCALE;
          this.selfRing.add(x, z, size * (1 + Math.sin(this.time * 5) * 0.035), RELATION.self, 0.92 + Math.sin(this.time * 5) * 0.08);
          const ph = (this.time % SELF_PING) / SELF_PING;
          this.selfPing.add(x, z, size * (1 + ph * 0.6), RELATION.self, (1 - ph) * 0.9);
        } else this.rings.add(x, z, HERO_RING[r.hero], RELATION[rel], 0.75);
        const chroma = this.looks.get(e.id)?.chroma;
        if (chroma && !stealth) this.auras.add(x, z, HERO_RING[r.hero] * 1.45, ELEMENT_COLOR[chroma], 0.55 + Math.sin(this.time * 3 + e.id) * 0.12);
        // Sim v9: Avietė's charge (a fast spark flicker both teams see: the counterplay) and a charmed hero's pink glow.
        if (e.charged && !stealth) this.auras.add(x, z, HERO_RING[r.hero] * 1.7, CHARGE_GLOW, 0.75 + Math.sin(this.time * 14 + e.id) * 0.25);
        if (e.charmed) this.auras.add(x, z, HERO_RING[r.hero] * 1.5, CHARM_GLOW, 0.7 + Math.sin(this.time * 6) * 0.2);
      }
    }
    for (const r of this.rigs.values()) {
      if (r.seen !== stamp) {
        r.ch.object.visible = false;
        r.visible = false;
      }
    }
    fx?.end();
    this.rings.end();
    this.auras.end();
    this.selfRing.end();
    this.selfPing.end();
  }

  /**
   * Wave C (C4): what hero `id`'s card skin adds (render/skins/cardFx.ts), as the Skin effects setting allows: Off
   * hides every card, Mine only hides the others'. Tints always; the extras follow tierFx's caps (another hero's only
   * on Med / High and outside a team fight; never from a stealthed hero). Reuses one object per slot.
   */
  cardOf(id: number): CardFx | null {
    if (id < 0 || id >= 16) return null;
    const fx = this.tierFx;
    const mode = fx?.mode ?? 'all';
    const self = id === this.mySlot;
    if (mode === 'off' || (mode === 'mine' && !self)) return null;
    const coat = this.looks.get(id)?.coat;
    const skin = isCardSkinId(coat) ? getSkin(coat) : null;
    const extras = this.slotStealth[id] === 0 && (self || (!(fx?.low ?? false) && !(fx?.teamFight ?? false)));
    return cardFxFor(skin, self, this.slotTeam[id] === 1 ? 1 : 0, extras, this.cardOut[id]);
  }

  dispose(): void {
    for (const r of [...this.rigs.values()]) this.drop(r);
    this.rings.dispose();
    this.auras.dispose();
    this.selfRing.dispose();
    this.selfPing.dispose();
  }
}

export interface LobbyHero {
  /** Place and turn this (it faces +X at rotation.y 0, like the match models). */
  object: THREE.Group;
  /** The character (animator, mesh) for idle life and the hop. */
  ch: Character;
  dispose(): void;
}

/** A standalone hero for the lobby turntable, the results screen and the portraits (full detail, outlined). */
export function lobbyHero(hero: HeroId, team: 0 | 1 = 0, look?: Look | null, o: { outline?: boolean } = {}): LobbyHero {
  const ch = makeHero(hero, team, look ?? null, { detail: DETAIL.lobby, outline: o.outline ?? true, shadows: true });
  return { object: ch.object, ch, dispose: () => ch.dispose() };
}
