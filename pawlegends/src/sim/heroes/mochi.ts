/**
 * Mochi, Support (sim v29, original cat; build spec docs/plans/moba/ROSTER-V29.md §2.1): the enchanter. Bespoke hooks:
 * Warm Lap (her shields on a hurt ally are stronger), Pillow Toss (a stop-at-first-unit shot whose hit on an enemy hero
 * shields her weakest friend), Cuddle Bubble (a shield and attack speed on the ally nearest the aim), Purr Wave (speed
 * for her and the allies round her) and LULLABY (a heal for the allies, then the enemy heroes it made drowsy fall asleep
 * if they are still near her when the drowsiness ends).
 *
 * Kit arrays: kRT the drowsy ticks left; kValor the drowsy heroes (a bit per hero id, heroes are ids 0..9).
 */
import { PROJECTILE_KIND } from '../../data/towers';
import { BP_ONE, applyBp, dist2, idiv, isqrt } from '../fixed';
import { toySupport } from '../progression/fish';
import type { MatchHandle } from '../state';
import { G, Kind, RANGE, type World, MAX_ENTITIES } from '../world';
import { addShield, attackSpeed, collect, fireSkillshot, haste, heal, inRing, slow, stun, ON_HIT } from '../effects';
import { creditHealShield } from '../effects/heal';
import { radiusOf } from '../units/kinds';
import { weakestAlly, wrapTarget } from './gabe';
import { Aim, aimAngle, lvl, SNAP_FX, type HeroKit, type SlotAim } from './kit';
import { abil, type KitNumbers } from './talents';

const hits = new Int32Array(MAX_ENTITIES);
const pick = new Int32Array(2);

function aim(a: KitNumbers, slot: number): SlotAim {
  switch (slot) {
    case 0:
      return { aim: Aim.Dir, reach: 0, windup: 0, mobility: false };
    case 1:
      // Reach 0: cast where she stands; cast() clamps the aim to the range and picks the ally (Gabė's Wing Wrap).
      return { aim: Aim.Point, reach: 0, windup: 0, mobility: false };
    case 2:
      return { aim: Aim.Self, reach: 0, windup: 0, mobility: false };
    default:
      return { aim: Aim.Self, reach: 0, windup: a.r.windup, mobility: false };
  }
}

const isFoeHero = (w: World, id: number, e: number): boolean =>
  e >= RANGE.heroes && e < RANGE.minions && w.kind[e] === Kind.Hero && w.team[e] !== w.team[id];

/** Warm Lap: a shield of `amount` on ally `t` is stronger while `t` is below the passive's HP share. */
function lapShield(m: MatchHandle, id: number, t: number, amount: number, ticks: number): void {
  const w = m.world;
  const p = abil(w, id).passive;
  let s = toySupport(w, id, amount);
  if (t !== id && w.hp[t] * BP_ONE < w.maxHp[t] * p.lowBp) s = applyBp(s, BP_ONE + p.bonusBp);
  creditHealShield(m, id, addShield(w, t, s, ticks));
}

/** (x, y) pulled to within `range` of hero `id`, written to `pick`. */
function clampAim(w: World, id: number, x: number, y: number, range: number): void {
  const dx = x - w.x[id];
  const dy = y - w.y[id];
  const d = isqrt(dx * dx + dy * dy);
  pick[0] = d > range ? w.x[id] + idiv(dx * range, d) : x;
  pick[1] = d > range ? w.y[id] + idiv(dy * range, d) : y;
}

function lullaby(m: MatchHandle, id: number): number {
  const w = m.world;
  const r = abil(w, id).r;
  const hx = w.x[id];
  const hy = w.y[id];
  const amount = toySupport(w, id, lvl(w, id, r.heal, r.healPerLevel));
  for (let a = RANGE.heroes; a < RANGE.minions; a++) {
    if (w.alive[a] === 0 || w.kind[a] !== Kind.Hero || w.team[a] !== w.team[id]) continue;
    if (!inRing(hx, hy, r.allyRadius, w.x[a], w.y[a], radiusOf(w, a))) continue;
    creditHealShield(m, id, heal(w, a, amount));
  }
  const n = collect(w, w.team[id], hits, (e, er) => inRing(hx, hy, r.radius, w.x[e], w.y[e], er), true);
  let mask = 0;
  for (let i = 0; i < n; i++) {
    const e = hits[i];
    slow(w, e, r.slowBp, r.drowsy);
    mask |= 1 << (e - RANGE.heroes);
  }
  w.kValor[id] = mask;
  w.kRT[id] = mask !== 0 ? r.drowsy : 0;
  m.events.push({ type: 'clip', tick: w.globals[G.Tick], id, what: 'lullaby' });
  return r.cooldown;
}

/** The drowsiness ends: every drowsy hero still within the sleep radius of her falls asleep. */
function sleep(w: World, id: number): void {
  const r = abil(w, id).r;
  const mask = w.kValor[id];
  w.kValor[id] = 0;
  for (let e = RANGE.heroes; e < RANGE.minions; e++) {
    if ((mask & (1 << (e - RANGE.heroes))) === 0 || w.alive[e] === 0) continue;
    const reach = r.sleepRadius + radiusOf(w, e);
    if (dist2(w.x[id], w.y[id], w.x[e], w.y[e]) <= reach * reach) stun(w, e, r.sleep);
  }
}

export const MOCHI_KIT: HeroKit = {
  aim,
  cast(m, id, slot, x, y) {
    const w = m.world;
    const a = abil(w, id);
    switch (slot) {
      case 0: {
        const q = a.q;
        const p = fireSkillshot(w, id, {
          kind: PROJECTILE_KIND.fluff,
          angle: aimAngle(w, id, x, y),
          speed: q.speed,
          range: q.range,
          radius: q.width >> 1,
          dmg: lvl(w, id, q.dmg, q.dmgPerLevel),
          flags: 0,
          effect: ON_HIT.Slow,
          effA: q.slowBp,
          effB: q.slow,
        });
        return p < 0 ? -1 : q.cooldown;
      }
      case 1: {
        const p = a.w;
        clampAim(w, id, x, y, p.range);
        const t = wrapTarget(w, id, pick[0], pick[1], p.range, p.pickRadius);
        lapShield(m, id, t, lvl(w, id, p.shield, p.shieldPerLevel), p.duration);
        attackSpeed(w, t, p.asBp, p.as);
        return p.cooldown;
      }
      case 2: {
        const e = a.e;
        w.slowT[id] = 0;
        w.slowBp[id] = 0;
        for (let h = RANGE.heroes; h < RANGE.minions; h++) {
          if (w.alive[h] === 0 || w.kind[h] !== Kind.Hero || w.team[h] !== w.team[id]) continue;
          if (inRing(w.x[id], w.y[id], e.radius, w.x[h], w.y[h], radiusOf(w, h))) haste(w, h, e.hasteBp, e.haste);
        }
        return e.cooldown;
      }
      default:
        return lullaby(m, id);
    }
  },
  stepKit(m, id) {
    const w = m.world;
    if (w.kRT[id] > 0 && --w.kRT[id] === 0) sleep(w, id);
  },
  afterDeal(m, id, dst, _dmg, kind) {
    const w = m.world;
    // Her only damaging ability is the Pillow Toss: a hit on an enemy hero shields her weakest friend.
    if (kind !== 'ability' || w.alive[id] === 0 || !isFoeHero(w, id, dst)) return;
    const q = abil(w, id).q;
    const t = weakestAlly(w, id, q.shieldRange);
    if (t >= 0) lapShield(m, id, t, lvl(w, id, q.shield, q.shieldPerLevel), q.duration);
  },
  reset(w, id) {
    w.kRT[id] = 0;
    w.kValor[id] = 0;
  },
  snapFx: (w, id) => (w.kRT[id] > 0 ? SNAP_FX.Form : 0),
};
