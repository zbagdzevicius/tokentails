/**
 * Cacklejaw, Assassin (POC.md §6.6). Bespoke hooks: Pack Flank (+20% from behind or with an ally near the target),
 * Jeer Slash's hit-a-hero recast, Bush Slink's brush linger and haste, Ambush (first hit out of stealth), and Pack
 * Hunt's homing dash with its takedown reset (Feeding Frenzy: twice).
 *
 * Q stages (`kStage`): 0 idle, 1 first dash, 2 recast window open, 3 recast dash. `kCount` = the dash hit a hero.
 * R: `kHuntT` is the dash lifetime while hunting, then the reset window; `kChain` resets used; `kEmpower` = R is
 * ready because of a reset (the next natural cast starts a new chain).
 */
import { TICK_HZ } from '../../data/timeline';
import { angleDiff, applyBp, dist2, iatan2, moveToward } from '../fixed';
import { COOLDOWN_SLOTS, ENTITY_CAP, FM, Kind, RANGE, maskHas, type World } from '../world';
import { dealDamage } from '../combat/damage';
import { collect, dash, fear, inCone, lowestHpEnemyHero, reveal, slow, startForced, stealth, travelTicks } from '../effects';
import { attackRange, radiusOf, targetable } from '../units/kinds';
import { Aim, aimAngle, lvl, type HeroKit, type SlotAim } from './kit';
import { abil, type KitNumbers } from './talents';

const Q = 0;
const R = 3;
const hits = new Int32Array(ENTITY_CAP);

function aim(a: KitNumbers, slot: number): SlotAim {
  switch (slot) {
    case 0:
      return { aim: Aim.Dir, reach: 0, windup: 0, mobility: true };
    case 1:
      return { aim: Aim.Dir, reach: a.w.range, windup: 0, mobility: false };
    case 2:
      return { aim: Aim.Self, reach: 0, windup: 0, mobility: false };
    default:
      return { aim: Aim.Self, reach: 0, windup: 0, mobility: true };
  }
}

const step = new Int32Array(3);

/** Aim the next one-tick hop of a homing dash toward `v` at `speed` (the carry keeps the speed exact). */
function hopToward(w: World, id: number, v: number, speed: number): void {
  moveToward(w.x[id], w.y[id], w.x[v], w.y[v], speed, w.moveCarry[id], TICK_HZ, step);
  w.fmX[id] = step[0];
  w.fmY[id] = step[1];
  w.moveCarry[id] = step[2];
  w.fmT[id] = 1;
}

/** A Jeer Slash dash ended (landed, or was stopped by CC): open the recast window or start the cooldown. */
function jeerEnded(w: World, id: number): void {
  const q = abil(w, id).q;
  if (w.kStage[id] === 1 && w.kCount[id] === 1) {
    w.kStage[id] = 2;
    w.kWindow[id] = q.recastWindow;
  } else {
    if (w.kStage[id] === 1) w.cooldowns[id * COOLDOWN_SLOTS + Q] = q.cooldown;
    w.kStage[id] = 0;
  }
}

function endHunt(w: World, id: number): void {
  w.fmT[id] = 0;
  w.fmKind[id] = FM.None;
  w.fmTarget[id] = -1;
  w.moveX[id] = w.x[id];
  w.moveY[id] = w.y[id];
}

export const CACKLEJAW_KIT: HeroKit = {
  aim,
  recastReady: (w, id, slot) => slot === Q && w.kStage[id] === 2 && w.kWindow[id] > 0,
  cast(m, id, slot, x, y) {
    const w = m.world;
    const a = abil(w, id);
    switch (slot) {
      case 0: {
        const recast = w.kStage[id] === 2 && w.kWindow[id] > 0;
        w.kStage[id] = recast ? 3 : 1;
        w.kWindow[id] = 0;
        w.kCount[id] = 0;
        dash(m, id, aimAngle(w, id, x, y), a.q.dash);
        return recast ? a.q.cooldown : 0;
      }
      case 1: {
        const g = a.w;
        const hx = w.x[id];
        const hy = w.y[id];
        const dir = aimAngle(w, id, x, y);
        const n = collect(w, w.team[id], hits, (e, r) => inCone(hx, hy, dir, g.range, g.arc, w.x[e], w.y[e], r));
        for (let i = 0; i < n; i++) fear(w, hits[i], g.fear, hx, hy);
        return g.cooldown;
      }
      case 2:
        stealth(w, id, a.e.duration);
        return a.e.cooldown;
      default: {
        const r = a.r;
        const victim = lowestHpEnemyHero(w, w.team[id], w.x[id], w.y[id], r.range);
        if (victim < 0) return -1;
        if (w.kEmpower[id] === 0) w.kChain[id] = 0;
        w.kEmpower[id] = 0;
        reveal(w, victim, r.resetWindow);
        const life = travelTicks(r.range * 2, r.speed);
        startForced(w, id, w.x[victim], w.y[victim], life, FM.Hunt);
        w.fmTarget[id] = victim;
        w.kHuntT[id] = life;
        w.kHuntVictim[id] = -1;
        return r.cooldown;
      }
    }
  },
  stepKit(m, id) {
    const w = m.world;
    const a = abil(w, id);
    if ((w.kStage[id] === 1 || w.kStage[id] === 3) && w.fmKind[id] === FM.None) jeerEnded(w, id);
    if (w.kWindow[id] > 0 && --w.kWindow[id] === 0 && w.kStage[id] === 2) {
      w.kStage[id] = 0;
      w.cooldowns[id * COOLDOWN_SLOTS + Q] = a.q.cooldown;
    }
    if (w.stealthT[id] > 0) {
      if (w.bush[id] >= 0) w.stealthT[id] = Math.max(w.stealthT[id], a.e.brushLinger);
      if (w.hasteT[id] <= 1 || w.hasteBp[id] <= a.e.speedBp) {
        w.hasteBp[id] = Math.max(w.hasteBp[id], a.e.speedBp);
        w.hasteT[id] = Math.max(w.hasteT[id], 1);
      }
    }
    if (w.fmKind[id] !== FM.Hunt && w.kHuntT[id] > 0 && --w.kHuntT[id] === 0) w.kHuntVictim[id] = -1;
  },
  onDashTick(m, id) {
    const w = m.world;
    if (w.fmKind[id] === FM.Hunt || (w.kStage[id] !== 1 && w.kStage[id] !== 3)) return;
    const q = abil(w, id).q;
    const half = q.width >> 1;
    const n = collect(w, w.team[id], hits, (e, r) => !maskHas(w.fmHitLo[id], w.fmHitHi[id], e) && dist2(w.x[id], w.y[id], w.x[e], w.y[e]) <= (half + r) * (half + r));
    const dmg = lvl(w, id, q.dmg, q.dmgPerLevel);
    for (let i = 0; i < n; i++) {
      const e = hits[i];
      if (e < 0x20) w.fmHitLo[id] |= 1 << e;
      else w.fmHitHi[id] |= 1 << (e - 0x20);
      dealDamage(m, id, w.team[id], Kind.Hero, e, dmg, 'ability');
      if (w.kind[e] === Kind.Hero) w.kCount[id] = 1;
      if (w.kStage[id] === 3 && (q.slowBp ?? 0) > 0) slow(w, e, q.slowBp, q.slow);
    }
  },
  aimHunt(m, id) {
    const w = m.world;
    const v = w.fmTarget[id];
    if (v < 0 || !targetable(w, v, w.team[id]) || --w.kHuntT[id] <= 0) {
      endHunt(w, id);
      w.kHuntT[id] = 0;
      return;
    }
    const r = abil(w, id).r;
    const reach = attackRange(w, id) + radiusOf(w, id) + radiusOf(w, v);
    if (dist2(w.x[id], w.y[id], w.x[v], w.y[v]) <= reach * reach) {
      const dmg = lvl(w, id, r.dmg, r.dmgPerLevel) + applyBp(w.maxHp[v] - Math.max(0, w.hp[v]), r.missingHpBp);
      w.facing[id] = iatan2(w.y[v] - w.y[id], w.x[v] - w.x[id]);
      endHunt(w, id);
      dealDamage(m, id, w.team[id], Kind.Hero, v, dmg, 'ability');
      w.kHuntT[id] = r.resetWindow;
      w.kHuntVictim[id] = v;
      return;
    }
    hopToward(w, id, v, r.speed);
  },
  outgoing(m, id, dst, raw) {
    const w = m.world;
    const a = abil(w, id);
    let out = raw;
    if ((a.e.ambushBp ?? 0) > 0 && w.stealthT[id] > 0) out = applyBp(out, a.e.ambushBp);
    const k = w.kind[dst];
    if (k !== Kind.Hero && k !== Kind.Minion && k !== Kind.Camp) return out;
    const p = a.passive;
    const behind = Math.abs(angleDiff(w.facing[dst], iatan2(w.y[id] - w.y[dst], w.x[id] - w.x[dst]))) > p.behindArc;
    let flank = behind;
    for (let h = RANGE.heroes; h < RANGE.minions && !flank; h++) {
      if (h === id || w.alive[h] === 0 || w.team[h] !== w.team[id]) continue;
      if (dist2(w.x[h], w.y[h], w.x[dst], w.y[dst]) <= p.allyRange * p.allyRange) flank = true;
    }
    return flank ? applyBp(out, p.bonusBp) : out;
  },
  onTakedown(m, id, victim) {
    const w = m.world;
    const r = abil(w, id).r;
    if (victim !== w.kHuntVictim[id] || w.kHuntT[id] === 0 || w.kChain[id] >= r.resets) return;
    w.kChain[id]++;
    w.kEmpower[id] = 1;
    w.kHuntT[id] = 0;
    w.kHuntVictim[id] = -1;
    w.cooldowns[id * COOLDOWN_SLOTS + R] = 0;
  },
  reset(w, id) {
    w.kStage[id] = 0;
    w.kWindow[id] = 0;
    w.kCount[id] = 0;
    w.kHuntT[id] = 0;
    w.kHuntVictim[id] = -1;
  },
};
