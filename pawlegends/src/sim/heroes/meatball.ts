/**
 * Meatball, Tank (sim v11, original cat; build spec docs/plans/moba/CATS-V11.md §2.1). Bespoke hooks: Food Coma (a
 * hit below the threshold puts him to sleep under a shield), Bowling Roll's sideways knock along the path, Loaf Mode's
 * rooted damage cut and charm, Big Brother's ally pick and landing, and Unstoppable Chonk's bumps.
 *
 * Kit arrays: kHuntT Food Coma lockout; kRT loaf ticks; kWindow Chonk ticks; kCount Chonk bump bitmask (bit = enemy
 * hero id); kEmpower ticks until the bitmask clears; kStage 1 = Big Brother landing pending; kFoe the ally being guarded.
 */
import { ANGLE_STEPS, BP_ONE, applyBp, dist2, icos, idiv, isin, isqrt } from '../fixed';
import type { MatchHandle } from '../state';
import { ENTITY_CAP, FM, Kind, maskHas, type World } from '../world';
import { dealDamage } from '../combat/damage';
import { addShield, charm, cleanse, collect, dash, haste, inRing, knockback, selfRoot, slow } from '../effects';
import { creditHealShield } from '../effects/heal';
import { radiusOf } from '../units/kinds';
import { wrapTarget } from './gabe';
import { Aim, aimAngle, lvl, SNAP_FX, type HeroKit, type SlotAim } from './kit';
import { abil, type KitNumbers } from './talents';

const hits = new Int32Array(ENTITY_CAP);
/** A quarter turn (angle steps): Bowling Roll knocks units off to the side of his heading. */
const QUARTER = ANGLE_STEPS >> 2;

function aim(_a: KitNumbers, slot: number): SlotAim {
  switch (slot) {
    case 0:
      return { aim: Aim.Dir, reach: 0, windup: 0, mobility: true };
    case 1:
      return { aim: Aim.Self, reach: 0, windup: 0, mobility: false };
    case 2:
      // Reach 0: cast where he stands; cast() clamps the point to the range and picks the ally (Gabė's Wing Wrap).
      return { aim: Aim.Point, reach: 0, windup: 0, mobility: true };
    default:
      return { aim: Aim.Self, reach: 0, windup: 0, mobility: false };
  }
}

/** Rolling (Bowling Roll in flight, not Big Brother's dash) or Unstoppable Chonk: the ball pose. */
const formed = (w: World, id: number): boolean => w.kWindow[id] > 0 || (w.fmKind[id] === FM.Dash && w.kStage[id] !== 1);

/** End Loaf Mode early (a Bowling Roll, Big Brother or Chonk cast): no root, no damage cut. */
function unloaf(w: World, id: number): void {
  if (w.kRT[id] === 0) return;
  w.kRT[id] = 0;
  w.rootT[id] = 0;
}

/** Big Brother: dash next to the allied hero nearest the aim (within the pick radius), else 4 m along the aim alone. */
function bigBrother(m: MatchHandle, id: number, x: number, y: number): number {
  const w = m.world;
  const e = abil(w, id).e;
  let px = x;
  let py = y;
  const dx = x - w.x[id];
  const dy = y - w.y[id];
  const d = isqrt(dx * dx + dy * dy);
  if (d > e.range) {
    px = w.x[id] + idiv(dx * e.range, d);
    py = w.y[id] + idiv(dy * e.range, d);
  }
  const ally = wrapTarget(w, id, px, py, e.range, e.pickRadius);
  w.kStage[id] = 1;
  w.kFoe[id] = ally;
  if (ally === id) {
    // No ally in the pick: a solo hop along the aim (half the shield lands on himself). It never fizzles.
    dash(m, id, aimAngle(w, id, x, y), e.soloDash);
    return e.cooldown;
  }
  const len = isqrt(dist2(w.x[id], w.y[id], w.x[ally], w.y[ally])) - radiusOf(w, id) - radiusOf(w, ally) - e.gap;
  if (len > 0) dash(m, id, aimAngle(w, id, w.x[ally], w.y[ally]), len);
  return e.cooldown;
}

/** Big Brother lands: the shield (on the ally, or half on himself) and the push off the ally. */
function guardLand(m: MatchHandle, id: number): void {
  const w = m.world;
  const e = abil(w, id).e;
  const ally = w.kFoe[id];
  w.kStage[id] = 0;
  w.kFoe[id] = -1;
  const full = idiv(w.maxHp[id] * e.shieldBp, BP_ONE);
  if (ally < 0 || ally === id) {
    creditHealShield(m, id, addShield(w, id, full >> 1, e.duration));
    return;
  }
  if (w.alive[ally] === 0) return;
  creditHealShield(m, id, addShield(w, ally, full, e.duration));
  const ax = w.x[ally];
  const ay = w.y[ally];
  const n = collect(w, w.team[id], hits, (v, r) => inRing(ax, ay, e.radius, w.x[v], w.y[v], r), true);
  for (let i = 0; i < n; i++) knockback(m, hits[i], ax, ay, e.push, aimAngle(w, ally, w.x[hits[i]], w.y[hits[i]]));
}

/** Unstoppable Chonk: enemy heroes he bumps (once per rehit window each) are hurt and sent flying along his heading. */
function chonkBumps(m: MatchHandle, id: number): void {
  const w = m.world;
  const r = abil(w, id).r;
  if (--w.kEmpower[id] <= 0) {
    w.kEmpower[id] = r.rehit;
    w.kCount[id] = 0;
  }
  const hx = w.x[id];
  const hy = w.y[id];
  const reach = r.touch + radiusOf(w, id);
  const n = collect(w, w.team[id], hits, (v, vr) => (w.kCount[id] & (1 << v)) === 0 && inRing(hx, hy, reach, w.x[v], w.y[v], vr), true);
  const dmg = lvl(w, id, r.dmg, r.dmgPerLevel);
  for (let i = 0; i < n; i++) {
    const v = hits[i];
    w.kCount[id] |= 1 << v;
    dealDamage(m, id, w.team[id], Kind.Hero, v, dmg, 'ability');
    knockback(m, v, hx, hy, r.push, w.facing[id]);
  }
}

export const MEATBALL_KIT: HeroKit = {
  aim,
  cast(m, id, slot, x, y) {
    const w = m.world;
    const a = abil(w, id);
    switch (slot) {
      case 0:
        unloaf(w, id);
        w.kStage[id] = 0;
        dash(m, id, aimAngle(w, id, x, y), a.q.dash);
        return a.q.cooldown;
      case 1: {
        const g = a.w;
        selfRoot(w, id, g.duration);
        w.kRT[id] = g.duration;
        const hx = w.x[id];
        const hy = w.y[id];
        const n = collect(w, w.team[id], hits, (v, r) => inRing(hx, hy, g.radius, w.x[v], w.y[v], r), true);
        for (let i = 0; i < n; i++) {
          charm(w, hits[i], g.charm, id);
          slow(w, hits[i], g.slowBp, g.charm);
        }
        return g.cooldown;
      }
      case 2:
        unloaf(w, id);
        return bigBrother(m, id, x, y);
      default: {
        const r = a.r;
        unloaf(w, id);
        cleanse(w, id, r.duration);
        haste(w, id, r.hasteBp, r.duration);
        w.kWindow[id] = r.duration;
        w.kCount[id] = 0;
        w.kEmpower[id] = r.rehit;
        return r.cooldown;
      }
    }
  },
  stepKit(m, id) {
    const w = m.world;
    if (w.kHuntT[id] > 0) w.kHuntT[id]--;
    if (w.kRT[id] > 0) w.kRT[id]--;
    if (w.kStage[id] === 1 && w.fmKind[id] === FM.None) guardLand(m, id);
    if (w.kWindow[id] > 0) {
      w.kWindow[id]--;
      chonkBumps(m, id);
    }
  },
  onDashTick(m, id) {
    const w = m.world;
    // Big Brother's dash passes through; only Bowling Roll knocks things aside.
    if (w.kStage[id] === 1) return;
    const q = abil(w, id).q;
    const hx = w.x[id];
    const hy = w.y[id];
    const head = w.facing[id];
    const n = collect(w, w.team[id], hits, (v, r) => !maskHas(w.fmHitLo[id], w.fmHitHi[id], v) && inRing(hx, hy, q.touch, w.x[v], w.y[v], r));
    const dmg = lvl(w, id, q.dmg, q.dmgPerLevel);
    const cx = icos(head);
    const cy = isin(head);
    for (let i = 0; i < n; i++) {
      const v = hits[i];
      if (v < 0x20) w.fmHitLo[id] |= 1 << v;
      else w.fmHitHi[id] |= 1 << (v - 0x20);
      // Side of the path (cross product of heading × to-victim): left (+90°) when ≥ 0, so one dead on the line goes left.
      const side = cx * (w.y[v] - hy) - cy * (w.x[v] - hx) >= 0 ? head + QUARTER : head - QUARTER;
      // From its own spot: knockback falls back to the side angle, straight off the path.
      knockback(m, v, w.x[v], w.y[v], q.push, side);
      dealDamage(m, id, w.team[id], Kind.Hero, v, dmg, 'ability');
      if (w.kind[v] === Kind.Hero) slow(w, v, q.slowBp, q.slow);
    }
  },
  incoming(m, id, _src, dmg) {
    const w = m.world;
    const a = abil(w, id);
    let d = dmg;
    if (w.kRT[id] > 0) d = applyBp(d, BP_ONE - a.w.reduceBp);
    const p = a.passive;
    if (w.kHuntT[id] === 0 && d > 0 && w.hp[id] - d < idiv(w.maxHp[id] * p.thresholdBp, BP_ONE)) {
      // Food Coma: he dozes off under a big shield (it soaks this hit too).
      creditHealShield(m, id, addShield(w, id, idiv(w.maxHp[id] * p.shieldBp, BP_ONE), p.duration));
      w.kHuntT[id] = p.cooldown;
    }
    return d;
  },
  reset(w, id) {
    // The Food Coma lockout (kHuntT) carries through death, like a cooldown.
    w.kRT[id] = 0;
    w.kWindow[id] = 0;
    w.kCount[id] = 0;
    w.kEmpower[id] = 0;
    w.kStage[id] = 0;
    w.kFoe[id] = -1;
  },
  snapFx: (w, id) => (formed(w, id) ? SNAP_FX.Form : 0),
};
