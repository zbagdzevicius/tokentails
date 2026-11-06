/**
 * Nugget, Support (sim v14, original dog; build spec docs/plans/moba/DOGS-V13.md §1.1). Bespoke hooks: Treat Pouch
 * (every few seconds his next basic on an enemy hero heals the weakest allied hero near him), Frisbee's piercing disc,
 * Best Friend's ally pick and landing, the Sploot (rooted, tougher, a heal over time on the allies round him) and
 * Herding Time (enemy heroes pulled toward a point that never sits inside his own tower's range).
 *
 * Kit arrays: kValor Treat Pouch ready (0/1); kHuntT pouch timer; kRT sploot ticks; kStage 1 = Best Friend landing
 * pending; kFoe the ally (−1 or himself: the solo hop).
 */
import { PROJECTILE_KIND } from '../../data/towers';
import { BP_ONE, applyBp, dist2, icos, idiv, isin, isqrt, TRIG_ONE } from '../fixed';
import { toySupport } from '../progression/fish';
import type { MatchHandle } from '../state';
import { ENTITY_CAP, FM, Kind, RANGE, type World } from '../world';
import { dealDamage } from '../combat/damage';
import { addShield, collect, dash, fireSkillshot, haste, heal, healOverTime, inRing, knockback, root, slow, ON_HIT, PFLAG } from '../effects';
import { creditHealShield } from '../effects/heal';
import { attackRange, radiusOf } from '../units/kinds';
import { weakestAlly, wrapTarget } from './gabe';
import { Aim, aimAngle, lvl, SNAP_FX, type HeroKit, type SlotAim } from './kit';
import { abil, type KitNumbers } from './talents';

const hits = new Int32Array(ENTITY_CAP);
/** The herd point the last Herding Time used (x, y); read by tests through `herdPoint`. */
const herd = new Int32Array(2);

function aim(a: KitNumbers, slot: number): SlotAim {
  switch (slot) {
    case 0:
      return { aim: Aim.Dir, reach: 0, windup: 0, mobility: false };
    case 1:
      // Reach 0: cast where he stands; cast() clamps the point to the range and picks the ally (Gabė's Wing Wrap).
      return { aim: Aim.Point, reach: 0, windup: 0, mobility: true };
    case 2:
      return { aim: Aim.Self, reach: 0, windup: 0, mobility: false };
    default:
      // Reach 0 as well: the aim is clamped onto his ring in cast(), so a far aim never walks him in.
      return { aim: Aim.Point, reach: 0, windup: a.r.windup, mobility: false };
  }
}

/** (x, y) pulled to within `range` of hero `id`, written to `out`. */
function clampTo(w: World, id: number, x: number, y: number, range: number, out: Int32Array): void {
  const dx = x - w.x[id];
  const dy = y - w.y[id];
  const d = isqrt(dx * dx + dy * dy);
  out[0] = d > range ? w.x[id] + idiv(dx * range, d) : x;
  out[1] = d > range ? w.y[id] + idiv(dy * range, d) : y;
}

const pick = new Int32Array(2);

/** Best Friend: dash next to the allied hero nearest the aim, else a solo hop along the aim. It never fizzles. */
function bestFriend(m: MatchHandle, id: number, x: number, y: number): number {
  const w = m.world;
  const p = abil(w, id).w;
  clampTo(w, id, x, y, p.range, pick);
  const ally = wrapTarget(w, id, pick[0], pick[1], p.range, p.pickRadius);
  w.kStage[id] = 1;
  w.kFoe[id] = ally;
  if (ally === id) {
    dash(m, id, aimAngle(w, id, x, y), p.soloDash);
    return p.cooldown;
  }
  const len = isqrt(dist2(w.x[id], w.y[id], w.x[ally], w.y[ally])) - radiusOf(w, id) - radiusOf(w, ally) - p.gap;
  if (len > 0) dash(m, id, aimAngle(w, id, w.x[ally], w.y[ally]), len);
  return p.cooldown;
}

/** Best Friend lands: the shield and the haste (on the ally and himself, or half the shield on himself alone). */
function friendLand(m: MatchHandle, id: number): void {
  const w = m.world;
  const p = abil(w, id).w;
  const ally = w.kFoe[id];
  w.kStage[id] = 0;
  w.kFoe[id] = -1;
  const shield = toySupport(w, id, lvl(w, id, p.shield, p.shieldPerLevel));
  if (ally < 0 || ally === id || w.alive[ally] === 0) {
    creditHealShield(m, id, addShield(w, id, shield >> 1, p.duration));
    haste(w, id, p.hasteBp, p.haste);
    return;
  }
  creditHealShield(m, id, addShield(w, ally, shield, p.duration));
  haste(w, ally, p.hasteBp, p.haste);
  haste(w, id, p.hasteBp, p.haste);
}

/** The Sploot: rooted and tougher; every allied hero within the radius (him too) heals over the sploot. */
function sploot(m: MatchHandle, id: number): number {
  const w = m.world;
  const e = abil(w, id).e;
  root(w, id, e.duration);
  w.kRT[id] = e.duration;
  const total = toySupport(w, id, lvl(w, id, e.heal, e.healPerLevel));
  for (let a = RANGE.heroes; a < RANGE.minions; a++) {
    if (w.alive[a] === 0 || w.kind[a] !== Kind.Hero || w.team[a] !== w.team[id]) continue;
    if (!inRing(w.x[id], w.y[id], e.radius, w.x[a], w.y[a], radiusOf(w, a))) continue;
    healOverTime(w, a, total, e.duration);
    // Credited at the cast, capped at what the hero is missing (the heal over time itself is not traced).
    creditHealShield(m, id, Math.min(total, w.maxHp[a] - w.hp[a]));
  }
  return e.cooldown;
}

/**
 * The herd point of Herding Time: the aim clamped to his ring, then pushed out of every allied alive tower and core's
 * range + `margin` (along tower → point; along his facing when it sits on the tower). Written to `herd`.
 */
export function herdPoint(w: World, id: number, x: number, y: number): Int32Array {
  const r = abil(w, id).r;
  clampTo(w, id, x, y, r.radius, herd);
  for (let t = RANGE.towers; t < RANGE.fountains; t++) {
    if (w.alive[t] === 0 || w.team[t] !== w.team[id]) continue;
    const keep = attackRange(w, t) + radiusOf(w, t) + r.towerMargin;
    let dx = herd[0] - w.x[t];
    let dy = herd[1] - w.y[t];
    let d = isqrt(dx * dx + dy * dy);
    if (d >= keep) continue;
    if (d === 0) {
      dx = idiv(icos(w.facing[id]) * keep, TRIG_ONE);
      dy = idiv(isin(w.facing[id]) * keep, TRIG_ONE);
      d = Math.max(1, isqrt(dx * dx + dy * dy));
    }
    herd[0] = w.x[t] + idiv(dx * keep, d);
    herd[1] = w.y[t] + idiv(dy * keep, d);
  }
  return herd;
}

/** Herding Time: enemy heroes in his ring skid toward the herd point (never past it), are hurt and slowed; allies speed up. */
function herding(m: MatchHandle, id: number, x: number, y: number): number {
  const w = m.world;
  const r = abil(w, id).r;
  const pt = herdPoint(w, id, x, y);
  const px = pt[0];
  const py = pt[1];
  const hx = w.x[id];
  const hy = w.y[id];
  const n = collect(w, w.team[id], hits, (e, er) => inRing(hx, hy, r.radius, w.x[e], w.y[e], er), true);
  const dmg = lvl(w, id, r.dmg, r.dmgPerLevel);
  for (let i = 0; i < n; i++) {
    const e = hits[i];
    const ex = w.x[e];
    const ey = w.y[e];
    // Pushed away from the herd point mirrored through the victim: toward the point, stopping on it.
    knockback(m, e, 2 * ex - px, 2 * ey - py, Math.min(r.push, isqrt(dist2(ex, ey, px, py))), w.facing[id]);
    dealDamage(m, id, w.team[id], Kind.Hero, e, dmg, 'ability');
    slow(w, e, r.slowBp, r.slow);
  }
  for (let a = RANGE.heroes; a < RANGE.minions; a++) {
    if (w.alive[a] === 0 || w.kind[a] !== Kind.Hero || w.team[a] !== w.team[id]) continue;
    if (inRing(hx, hy, r.radius, w.x[a], w.y[a], radiusOf(w, a))) haste(w, a, r.allyHasteBp, r.allyHaste);
  }
  return r.cooldown;
}

export const NUGGET_KIT: HeroKit = {
  aim,
  cast(m, id, slot, x, y) {
    const w = m.world;
    const a = abil(w, id);
    switch (slot) {
      case 0: {
        const q = a.q;
        const p = fireSkillshot(w, id, {
          kind: PROJECTILE_KIND.frisbee,
          angle: aimAngle(w, id, x, y),
          speed: q.speed,
          range: q.range,
          radius: q.width >> 1,
          dmg: lvl(w, id, q.dmg, q.dmgPerLevel),
          flags: PFLAG.Pierce,
          effect: ON_HIT.Slow,
          effA: q.slowBp,
          effB: q.slow,
        });
        return p < 0 ? -1 : q.cooldown;
      }
      case 1:
        return bestFriend(m, id, x, y);
      case 2:
        return sploot(m, id);
      default:
        return herding(m, id, x, y);
    }
  },
  stepKit(m, id) {
    const w = m.world;
    if (w.kValor[id] === 0) {
      if (w.kHuntT[id] > 0) w.kHuntT[id]--;
      if (w.kHuntT[id] === 0) w.kValor[id] = 1;
    }
    if (w.kRT[id] > 0) w.kRT[id]--;
    // The Nap trip home skips the landing (CATS-V11 "Reported, not fixed": Nap has no kit reset).
    if (w.kStage[id] === 1 && w.napT[id] > 0) {
      w.kStage[id] = 0;
      w.kFoe[id] = -1;
    }
    if (w.kStage[id] === 1 && w.fmKind[id] === FM.None) friendLand(m, id);
  },
  afterBasic(m, id, dst) {
    const w = m.world;
    if (w.kValor[id] === 0 || w.kind[dst] !== Kind.Hero || w.team[dst] === w.team[id]) return;
    const p = abil(w, id).passive;
    const t = weakestAlly(w, id, p.range);
    if (t >= 0) creditHealShield(m, id, heal(w, t, toySupport(w, id, lvl(w, id, p.heal, p.healPerLevel))));
    w.kValor[id] = 0;
    w.kHuntT[id] = p.every;
  },
  incoming(m, id, _src, dmg) {
    const w = m.world;
    return w.kRT[id] > 0 ? applyBp(dmg, BP_ONE - abil(w, id).e.reduceBp) : dmg;
  },
  reset(w, id) {
    // The pouch starts ready (match start and every respawn).
    w.kValor[id] = 1;
    w.kHuntT[id] = 0;
    w.kRT[id] = 0;
    w.kStage[id] = 0;
    w.kFoe[id] = -1;
  },
  snapFx: (w, id) => (w.kRT[id] > 0 ? SNAP_FX.Form : 0),
  resource: (w, id) => (w.kValor[id] > 0 ? 0xff : 0),
};
