/**
 * Minions: one InstancedMesh per team × variant (6 draw calls for up to 40 minions, POC.md §10). Kitten squires and
 * pup guards are upright chibi characters (render/chars/); each copy walks on its own leg / arm cycle, swings its
 * weapon arm and flinches through a per-instance `aAnim` attribute read by the upright part shader. Siege carts
 * roll. Render only.
 *
 * Weight: an attack has an anticipation (the arm cocks back and the body leans away over the sim windup before the
 * predicted contact: last contact + attackEvery), a strike that lands ON the contact (a melee hit, a ranged / siege
 * bolt's spawn: never the bolt's landing), an overshoot and a follow-through with a small lunge. A hit squashes,
 * leans the minion away from the attacker and shoves it back a little; a struck or striking minion holds its pose for
 * 20 ms (the minion hit-stop). A dying minion is not just removed: it pops up, tumbles away from the killing blow and
 * shrinks into the death poof over 0.45 s. Nothing allocates per frame.
 */
import * as THREE from 'three';
import { CAPS } from '../../data/map';
import { MINIONS } from '../../data/minions';
import type { ViewFrame } from '../interp';
import { toX, toZ } from '../coords';
import { minionGeometry, type MinionVariant } from './models';
import { RELATION } from '../palette';
import { DecalLayer, ringTexture } from './decals';
import { uprightMaterial } from './rig';

const VARIANTS: readonly MinionVariant[] = ['melee', 'ranged', 'siege'];
/**
 * Instance scale: the upright minions are built in H (≈ 1 unit to the ear tips), so this is their height in metres;
 * the siege cart is built in metres. Kept near the readability-pass size (~1.5 m tall at 844×390).
 */
const SCALE: Record<MinionVariant, number> = { melee: 1.65, ranged: 1.6, siege: 1.95 };
const TICK = 1 / 30;
/** Seconds between attacks and of the windup, per variant (data/minions.ts). */
const PERIOD: Record<MinionVariant, number> = { melee: MINIONS.melee.attackEvery * TICK, ranged: MINIONS.ranged.attackEvery * TICK, siege: MINIONS.siege.attackEvery * TICK };
const WINDUP: Record<MinionVariant, number> = { melee: MINIONS.melee.windup * TICK, ranged: MINIONS.ranged.windup * TICK, siege: MINIONS.siege.windup * TICK };

/** Arm shape: cocked back (anticipation), the strike, its overshoot and the follow-through (s); lunge / shove (m). */
export const MINION_ANIM = Object.freeze({ cock: -0.45, strike: 1, over: 1.18, overAt: 0.05, settle: 0.38, lunge: 0.16, hitStop: 0.02, dieLen: 0.45, shove: 0.12 });
const DIE_MAX = 24;
const MAX_IDS = 4096;

interface Anim {
  phase: number;
  walk: number;
  hit: number;
  /** Seconds since the last strike (contact / release); −1 = none yet. */
  strikeT: number;
  /** Seconds the minion has been attacking without a strike yet (the first windup). */
  attackT: number;
  freeze: number;
  /** Hit lean / shove direction (world, unit) and its size. */
  hx: number;
  hz: number;
  shove: number;
  x: number;
  z: number;
  yaw: number;
  k: number;
  stamp: number;
  variant: MinionVariant;
}

interface Dying {
  on: boolean;
  t: number;
  k: number;
  x: number;
  z: number;
  yaw: number;
  /** Tumble direction (world, unit): away from the last hit. */
  dx: number;
  dz: number;
  phase: number;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _ax = new THREE.Vector3();

const smooth = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/** The arm value the shader reads (aAnim.z): negative = cocked back, 1 = the strike, above 1 = the overshoot. */
export function minionArm(variant: MinionVariant, strikeT: number, attackT: number, attacking: boolean): number {
  const M = MINION_ANIM;
  if (strikeT >= 0 && strikeT < M.settle) {
    if (strikeT < M.overAt) return M.strike + (M.over - M.strike) * (strikeT / M.overAt);
    return M.over * (1 - smooth((strikeT - M.overAt) / (M.settle - M.overAt)));
  }
  if (!attacking) return 0;
  const W = WINDUP[variant];
  // the next contact: last strike + period (or, before the first one, one windup after the attack started)
  const until = strikeT >= 0 ? PERIOD[variant] - strikeT : W - attackT;
  if (until > W || until < -0.2) return 0;
  return M.cock * smooth(1 - until / W);
}

/**
 * A minion is drawn at least this far (m) from a hero's centre (render only; the sim lets them overlap). v3.3: 0.75
 * still put a Kitten Cadet's body inside Sir Brutus and Cacklejaw (a big hero's body is ~0.6 m round, a cadet's
 * ~0.35 m: trailer v3.2 review), so 1.0, pushed up to MINION_PUSH m in one frame.
 */
export const MINION_CLEAR = 1.0;
export const MINION_PUSH = 0.7;

/** True when (x, z) m lies inside one of the zones (render only). */
export function inClearZone(zones: readonly { x: number; z: number; r: number }[], x: number, z: number): boolean {
  for (const c of zones) if ((x - c.x) * (x - c.x) + (z - c.z) * (z - c.z) < c.r * c.r) return true;
  return false;
}

export class MinionInstances {
  readonly group = new THREE.Group();
  private meshes: THREE.InstancedMesh[] = [];
  private anim = new Map<number, Anim>();
  private material = uprightMaterial();
  private animAttr: THREE.InstancedBufferAttribute[] = [];
  /** A team-coloured ring under every minion (one draw call), so a wave reads as ours or theirs at a glance. */
  private rings = new DecalLayer(ringTexture(), CAPS.minions, { additive: false, y: 0.04, name: 'minion-rings' });
  private readonly counts = new Int32Array(6);
  private readonly dying: Dying[] = Array.from({ length: DIE_MAX }, () => ({ on: false, t: 0, k: 0, x: 0, z: 0, yaw: 0, dx: 1, dz: 0, phase: 0 }));
  /** Projectile owner per pool index last seen (+1; 0 = none): a new ranged / siege bolt is that minion's release. */
  private readonly projOwner = new Int32Array(512);
  private readonly projStamp = new Int32Array(512);
  private stamp = 0;
  /** Reduce motion: no tumble, no shove or hit tilt; the death is a quick shrink. */
  reduced = false;
  myTeam: 0 | 1 = 0;
  /** Round 2: team 0 is the dogs (the human picked a dog): each team wears the other style. */
  styleSwap = false;
  /** Where each minion was drawn this frame (m, by entity id); a minion missing here is not drawn (no bar for it). */
  readonly drawnAt = new Map<number, { x: number; z: number }>();
  /** Ground circles (m) where minions are not drawn this frame (a falling core: no cart clipping its burst). */
  clearZones: { x: number; z: number; r: number }[] = [];
  /** Live hero positions (m) this frame: a minion is drawn pushed out of a hero's body (render only). */
  heroes: { x: number; z: number }[] = [];
  /** Structure footprints (m): a minion is drawn outside them (a pup stood inside the doghouse wall, trailer review). */
  blocks: readonly { x: number; z: number; r: number }[] = [];

  constructor() {
    this.group.name = 'minions';
    this.group.add(this.rings.mesh);
    for (const team of [0, 1] as const) {
      for (const v of VARIANTS) {
        const geo = minionGeometry(v, team);
        const aa = new THREE.InstancedBufferAttribute(new Float32Array(CAPS.minions * 4), 4);
        aa.setUsage(THREE.DynamicDrawUsage);
        geo.setAttribute('aAnim', aa);
        this.animAttr.push(aa);
        const mesh = new THREE.InstancedMesh(geo, this.material, CAPS.minions);
        mesh.name = `minions-${team}-${v}`;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.count = 0;
        mesh.frustumCulled = false;
        mesh.castShadow = true;
        this.meshes.push(mesh);
        this.group.add(mesh);
      }
    }
  }

  setShadows(on: boolean): void {
    for (const m of this.meshes) m.castShadow = on;
  }

  /** A hit on minion `id`, from world (fromX, fromZ) when known: squash, lean away, a small shove, the hit-stop. */
  hit(id: number, fromX = NaN, fromZ = NaN): void {
    const a = this.anim.get(id);
    if (!a) return;
    a.hit = 1;
    a.freeze = MINION_ANIM.hitStop;
    if (fromX === fromX) {
      const dx = a.x - fromX;
      const dz = a.z - fromZ;
      const l = Math.hypot(dx, dz);
      if (l > 1e-3) {
        a.hx = dx / l;
        a.hz = dz / l;
        a.shove = this.reduced ? 0 : 1;
      }
    }
  }

  /** A melee minion's contact (its basic hit fired): the strike lands now. Ranged / siege strike on their bolt. */
  swing(id: number): void {
    const a = this.anim.get(id);
    if (a && a.variant === 'melee') this.strike(a);
  }

  private strike(a: Anim): void {
    a.strikeT = 0;
    a.attackT = 0;
    a.freeze = Math.max(a.freeze, MINION_ANIM.hitStop);
  }

  /** Last drawn position (m), for FX. */
  positionOf(id: number, out: THREE.Vector3): THREE.Vector3 | null {
    const a = this.anim.get(id);
    return a ? out.set(a.x, 0, a.z) : null;
  }

  update(frame: ViewFrame, dt: number, time: number): void {
    this.material.userData.rig.uTime.value = time;
    const stamp = ++this.stamp;
    const counts = this.counts;
    counts.fill(0);
    this.rings.begin();
    const drawnAt = this.drawnAt;
    for (const p of drawnAt.values()) p.x = NaN;
    // new minion bolts this frame: a ranged / siege minion's release (its strike)
    const ps = frame.projectiles;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      if (p.index < 0 || p.index >= this.projOwner.length) continue;
      // new: the slot was empty last frame or held another owner's bolt
      if (this.projStamp[p.index] !== stamp - 1 || this.projOwner[p.index] !== p.owner + 1) {
        const a = this.anim.get(p.owner);
        if (a && a.variant !== 'melee') this.strike(a);
      }
      this.projOwner[p.index] = p.owner + 1;
      this.projStamp[p.index] = stamp;
    }
    for (const e of frame.entities) {
      if (e.kind !== 'minion' || e.state === 'dead') continue;
      if (this.clearZones.length && inClearZone(this.clearZones, toX(e.fx), toZ(e.fy))) continue;
      const v = (VARIANTS as readonly string[]).includes(e.variant ?? '') ? (e.variant as MinionVariant) : 'melee';
      const team = e.team === 1 ? 1 : 0;
      // round 2: a dog-picking human's own wave are pups (styleSwap: the species, not the slot, picks the look)
      const k = (this.styleSwap ? 1 - team : team) * 3 + VARIANTS.indexOf(v);
      const mesh = this.meshes[k];
      const i = counts[k]++;
      if (i >= CAPS.minions) continue;
      let a = this.anim.get(e.id);
      if (!a) {
        if (this.anim.size >= MAX_IDS) continue;
        a = { phase: e.id * 0.7, walk: 0, hit: 0, strikeT: -1, attackT: 0, freeze: 0, hx: 1, hz: 0, shove: 0, x: 0, z: 0, yaw: 0, k, stamp, variant: v };
        this.anim.set(e.id, a);
      }
      a.stamp = stamp;
      a.k = k;
      a.variant = v;
      const mps = (e.speed * 30) / 1000;
      const moving = mps > 0.3;
      // the minion hit-stop: its pose holds (no phase, no strike clock) for 20 ms
      const fdt = a.freeze > 0 ? 0 : dt;
      a.freeze = Math.max(0, a.freeze - dt);
      // phase from ground distance over the stride (~0.55 of the height), so the feet keep pace
      a.phase += moving ? (mps * fdt * Math.PI) / (SCALE[v] * 0.55) : 0;
      a.walk += ((moving ? 1 : 0) - a.walk) * Math.min(1, dt * 10);
      a.hit = Math.max(0, a.hit - dt * 5);
      a.shove = Math.max(0, a.shove - dt * 6);
      const attacking = e.state === 'attacking';
      if (a.strikeT >= 0) a.strikeT += fdt;
      if (a.strikeT > PERIOD[v] * 2.2) a.strikeT = -1;
      a.attackT = attacking ? a.attackT + fdt : 0;
      a.x = toX(e.fx);
      a.z = toZ(e.fy);
      a.yaw = e.yaw;
      const upright = v !== 'siege';
      const arm = minionArm(v, a.strikeT, a.attackT, attacking);
      // the lunge: forward on the strike, back with the cock (object +X is forward)
      const lunge = arm > 0 ? (a.strikeT >= 0 && a.strikeT < 0.12 ? MINION_ANIM.lunge * (1 - a.strikeT / 0.12) : 0) : arm * 0.08;
      const sh = a.shove * MINION_ANIM.shove;
      let px = a.x + Math.cos(a.yaw) * lunge + a.hx * sh;
      let pz = a.z - Math.sin(a.yaw) * lunge + a.hz * sh;
      const px0 = px;
      const pz0 = pz;
      // never inside a hero's body: pushed out to MINION_CLEAR m from the nearest hero (at most 0.5 m)
      // v3.3: three passes, so a minion pushed out of one hero is not left inside the hero next to it
      for (let pass = 0; pass < 3; pass++) {
        for (const h of this.heroes) {
          const dx = px - h.x;
          const dz = pz - h.z;
          const d = Math.hypot(dx, dz);
          if (d >= MINION_CLEAR) continue;
          const push = Math.min(MINION_PUSH, MINION_CLEAR - d);
          const ux = d > 1e-4 ? dx / d : 1;
          const uz = d > 1e-4 ? dz / d : 0;
          px += ux * push;
          pz += uz * push;
        }
      }
      for (const b of this.blocks) {
        const dx = px - b.x;
        const dz = pz - b.z;
        const d = Math.hypot(dx, dz);
        const min = b.r + 0.35;
        if (d >= min) continue;
        const ux = d > 1e-4 ? dx / d : 1;
        const uz = d > 1e-4 ? dz / d : 0;
        px += ux * Math.min(2, min - d);
        pz += uz * Math.min(2, min - d);
      }
      const hop = upright ? Math.abs(Math.cos(a.phase)) * 0.06 * a.walk : moving ? Math.abs(Math.sin(a.phase * 0.5)) * 0.03 : 0;
      const sq = 1 - a.hit * 0.18;
      const s = SCALE[v];
      this.animAttr[k].setXYZW(i, a.phase, a.walk, upright ? arm : Math.max(0, arm), a.hit);
      // body: lean into the strike, back on the cock (siege: the cart bucks on its shot)
      const lean = upright ? -a.walk * 0.08 + a.hit * 0.15 - Math.max(0, arm) * 0.16 - Math.min(0, arm) * 0.22 : -Math.max(0, arm) * 0.3 + Math.sin(time * 2 + e.id) * 0.02;
      _e.set(0, a.yaw, lean);
      _q.setFromEuler(_e);
      if (a.hit > 0.01 && !this.reduced) {
        // tilt away from the hit: about the ground axis perpendicular to the hit direction
        _ax.set(-a.hz, 0, a.hx);
        _q2.setFromAxisAngle(_ax, -a.hit * 0.28);
        _q.premultiply(_q2);
      }
      _m.compose(_p.set(px, hop, pz), _q, _s.set(s * (1 + a.hit * 0.15), s * sq, s * (1 + a.hit * 0.15)));
      mesh.setMatrixAt(i, _m);
      const at = drawnAt.get(e.id);
      if (at) {
        at.x = px;
        at.z = pz;
      } else drawnAt.set(e.id, { x: px, z: pz });
      this.rings.add(a.x + px - px0, a.z + pz - pz0, 0.95 * s, team === this.myTeam ? RELATION.ally : RELATION.enemy, 0.7);
    }
    for (const [id, p] of drawnAt) if (Number.isNaN(p.x)) drawnAt.delete(id);
    // gone this frame: the death tumble starts where it stood
    for (const [id, a] of this.anim) {
      if (a.stamp === stamp) continue;
      this.die(a);
      this.anim.delete(id);
    }
    this.drawDying(dt);
    this.rings.end();
    for (let k = 0; k < this.meshes.length; k++) {
      this.meshes[k].count = Math.min(CAPS.minions, counts[k]);
      this.meshes[k].instanceMatrix.needsUpdate = true;
      this.animAttr[k].needsUpdate = true;
    }
  }

  private die(a: Anim): void {
    let d: Dying | null = null;
    for (const c of this.dying) if (!c.on) d = c;
    if (!d) return;
    d.on = true;
    d.t = 0;
    d.k = a.k;
    d.x = a.x;
    d.z = a.z;
    d.yaw = a.yaw;
    d.phase = a.phase;
    // tumble away from the last hit (else backwards)
    if (a.hit > 0 || a.shove > 0) {
      d.dx = a.hx;
      d.dz = a.hz;
    } else {
      d.dx = -Math.cos(a.yaw);
      d.dz = Math.sin(a.yaw);
    }
  }

  /** Dying minions: pop up, tumble away from the blow, shrink into the poof. Drawn after the living ones. */
  private drawDying(dt: number): void {
    const L = MINION_ANIM.dieLen;
    for (const d of this.dying) {
      if (!d.on) continue;
      d.t += dt;
      if (d.t >= L) {
        d.on = false;
        continue;
      }
      const k = d.k;
      const i = this.counts[k];
      if (i >= CAPS.minions) continue;
      this.counts[k]++;
      const u = d.t / L;
      const v = VARIANTS[k % 3];
      const s = SCALE[v] * (1 - smooth((u - 0.45) / 0.55));
      const red = this.reduced;
      const up = red ? 0 : 0.55 * Math.sin(Math.min(1, u * 1.6) * Math.PI);
      const away = red ? 0 : 0.6 * smooth(u * 1.4);
      _e.set(0, d.yaw, 0);
      _q.setFromEuler(_e);
      if (!red) {
        _ax.set(-d.dz, 0, d.dx);
        _q2.setFromAxisAngle(_ax, -smooth(u * 1.3) * 1.9);
        _q.premultiply(_q2);
      }
      _m.compose(_p.set(d.x + d.dx * away, up, d.z + d.dz * away), _q, _s.set(Math.max(0.01, s * (1 + u * 0.2)), Math.max(0.01, s * (1 - u * 0.25)), Math.max(0.01, s * (1 + u * 0.2))));
      this.meshes[k].setMatrixAt(i, _m);
      // the arm flung up, the flinch held
      this.animAttr[k].setXYZW(i, d.phase, 0, red ? 0 : -0.6, 1);
    }
  }

  dispose(): void {
    for (const m of this.meshes) m.geometry.dispose();
    this.material.dispose();
    this.rings.dispose();
  }
}
