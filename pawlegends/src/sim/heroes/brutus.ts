/**
 * Sir Brutus, Tank (POC.md §6.5). Bespoke hooks: Honour (a shield that builds while heroes hit him and decays out of
 * combat), Front Guard's projectile block, Pug Charge's first-hero stop, Champion's Challenge damage reduction
 * against the challenged hero, and Rally Howl (allies in the ring move faster).
 */
import { BP_ONE, applyBp, dist2, idiv } from '../fixed';
import { ENTITY_CAP, FM, G, Kind, RANGE, type World } from '../world';
import { dealDamage } from '../combat/damage';
import { collect, dash, haste, inFront, inRing, knockback, slow, startArena, stun } from '../effects';
import { radiusOf, targetable } from '../units/kinds';
import { Aim, aimAngle, lvl, type HeroKit, type SlotAim } from './kit';
import { abil, type KitNumbers } from './talents';

/** HERO_IDS index of Sir Brutus. */
export const BRUTUS_INDEX = 2;
const hits = new Int32Array(ENTITY_CAP);

function aim(a: KitNumbers, slot: number): SlotAim {
  switch (slot) {
    case 0:
    case 1:
      return { aim: Aim.Self, reach: 0, windup: 0, mobility: false };
    case 2:
      return { aim: Aim.Dir, reach: 0, windup: 0, mobility: true };
    default:
      return { aim: Aim.Unit, reach: a.r.range, windup: 0, mobility: false };
  }
}

/** Honour's cap and its build/decay per tick. */
function honour(w: World, id: number): { cap: number; rate: number } {
  const p = abil(w, id).passive;
  const cap = applyBp(w.maxHp[id], p.shieldCapBp);
  return { cap, rate: Math.max(1, idiv(cap, p.buildWindow)) };
}

/** Does an active Front Guard of an enemy of `team` stop a projectile at (x, y)? */
export function guardBlocks(w: World, team: number, x: number, y: number): boolean {
  for (let b = RANGE.heroes; b < RANGE.minions; b++) {
    if (w.kind[b] !== Kind.Hero || w.sub[b] !== BRUTUS_INDEX || w.alive[b] === 0 || w.kWT[b] === 0 || w.team[b] === team) continue;
    const g = abil(w, b).w;
    if (dist2(w.x[b], w.y[b], x, y) <= g.radius * g.radius && inFront(w, b, x, y, g.arc)) return true;
  }
  return false;
}

export const BRUTUS_KIT: HeroKit = {
  aim,
  cast(m, id, slot, x, y, target) {
    const w = m.world;
    const a = abil(w, id);
    switch (slot) {
      case 0: {
        const q = a.q;
        const hx = w.x[id];
        const hy = w.y[id];
        const n = collect(w, w.team[id], hits, (e, r) => inRing(hx, hy, q.radius, w.x[e], w.y[e], r));
        const dmg = lvl(w, id, q.dmg, q.dmgPerLevel);
        for (let i = 0; i < n; i++) {
          dealDamage(m, id, w.team[id], Kind.Hero, hits[i], dmg, 'ability');
          slow(w, hits[i], q.slowBp, q.slow);
        }
        return q.cooldown;
      }
      case 1:
        if (x !== w.x[id] || y !== w.y[id]) w.facing[id] = aimAngle(w, id, x, y);
        w.kWT[id] = a.w.duration;
        return a.w.cooldown;
      case 2:
        w.kStage[id] = 0;
        dash(m, id, aimAngle(w, id, x, y), a.e.dash);
        return a.e.cooldown;
      default: {
        const r = a.r;
        if (target < 0 || w.kind[target] !== Kind.Hero) return -1;
        const reach = r.range + radiusOf(w, target);
        if (dist2(w.x[id], w.y[id], w.x[target], w.y[target]) > reach * reach) return -1;
        if (startArena(w, id, target, r.ringRadius, r.duration) < 0) return -1;
        w.kRT[id] = r.duration;
        w.kFoe[id] = target;
        return r.cooldown;
      }
    }
  },
  stepKit(m, id) {
    const w = m.world;
    const p = abil(w, id).passive;
    const { cap, rate } = honour(w, id);
    if (w.globals[G.Tick] - w.kHurt[id] < p.decayAfter) w.kHonour[id] = Math.min(cap, w.kHonour[id] + rate);
    else w.kHonour[id] = Math.max(0, w.kHonour[id] - rate);
    if (w.kWT[id] > 0) w.kWT[id]--;
    if (w.kRT[id] > 0) {
      const bp = abil(w, id).r.allySpeedBp ?? 0;
      const z = w.tether[id];
      if (bp > 0 && z >= 0) {
        for (let ally = RANGE.heroes; ally < RANGE.minions; ally++) {
          if (w.alive[ally] === 0 || w.team[ally] !== w.team[id]) continue;
          if (inRing(w.zX[z], w.zY[z], w.zRadius[z], w.x[ally], w.y[ally], 0)) haste(w, ally, bp, 2);
        }
      }
      if (--w.kRT[id] === 0) w.kFoe[id] = -1;
    }
  },
  onDashTick(m, id) {
    const w = m.world;
    if (w.kStage[id] !== 0) return;
    const e = abil(w, id).e;
    for (let h = RANGE.heroes; h < RANGE.minions; h++) {
      if (!targetable(w, h, w.team[id])) continue;
      const reach = radiusOf(w, id) + radiusOf(w, h);
      if (dist2(w.x[id], w.y[id], w.x[h], w.y[h]) > reach * reach) continue;
      w.kStage[id] = 1;
      knockback(m, h, w.x[id], w.y[id], e.knockback, w.facing[id]);
      stun(w, h, e.stun);
      w.fmT[id] = 0;
      w.fmKind[id] = FM.None;
      w.moveX[id] = w.x[id];
      w.moveY[id] = w.y[id];
      return;
    }
  },
  incoming(m, id, src, dmg) {
    const w = m.world;
    if (w.kRT[id] > 0 && src >= 0 && src === w.kFoe[id]) return applyBp(dmg, BP_ONE - abil(w, id).r.reduceBp);
    return dmg;
  },
  absorb(w, id, dmg) {
    const used = Math.min(w.kHonour[id], dmg);
    w.kHonour[id] -= used;
    return used;
  },
  reset(w, id) {
    w.kHonour[id] = 0;
    w.kWT[id] = 0;
    w.kRT[id] = 0;
    w.kFoe[id] = -1;
    w.kStage[id] = 0;
  },
};
