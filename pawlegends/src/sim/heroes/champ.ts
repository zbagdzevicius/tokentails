/**
 * Champ, Fighter (sim v29, original dog; build spec docs/plans/moba/ROSTER-V29.md §2.4): the bruiser. Bespoke hooks:
 * One-Two (every third basic on the same enemy hero is a Cross: extra damage and a slow), Haymaker (a cone after a short
 * wind-up), Rope-a-Dope (a guard that takes less damage and heals back part of what it took), Bob and Weave (a dash that
 * primes the Cross) and KNOCKOUT! (a big single-target punch that sends its victim flying; a wall stops the flight short
 * and stuns it).
 *
 * Kit arrays: kFoe the One-Two victim; kCount its basics in the window; kWindow the window ticks; kEmpower 1 = the next
 * basic is a Cross (Bob and Weave), kHuntT that window; kRT Rope-a-Dope ticks; kHonour the damage taken in it;
 * kHuntVictim the KNOCKOUT! victim in flight; kStage 1 while it flies into a wall (stunned on landing).
 */
import { BP_ONE, applyBp, dist2, isqrt } from '../fixed';
import type { MatchHandle } from '../state';
import { FM, G, Kind, RANGE, type World, MAX_ENTITIES } from '../world';
import { dealDamage } from '../combat/damage';
import { collect, dash, heal, inCone, knockback, slow, stun } from '../effects';
import { creditHealShield } from '../effects/heal';
import { Aim, aimAngle, lvl, SNAP_FX, type HeroKit, type SlotAim } from './kit';
import { abil, type KitNumbers } from './talents';

const PRIMED = 1;
const WALL = 1;
const hits = new Int32Array(MAX_ENTITIES);

function aim(a: KitNumbers, slot: number): SlotAim {
  switch (slot) {
    case 0:
      return { aim: Aim.Dir, reach: 0, windup: a.q.windup, mobility: false };
    case 1:
      return { aim: Aim.Self, reach: 0, windup: 0, mobility: false };
    case 2:
      return { aim: Aim.Dir, reach: 0, windup: 0, mobility: true };
    default:
      return { aim: Aim.Unit, reach: a.r.reach, windup: a.r.windup, mobility: false };
  }
}

const isFoeHero = (w: World, id: number, e: number): boolean =>
  e >= RANGE.heroes && e < RANGE.minions && w.kind[e] === Kind.Hero && w.team[e] !== w.team[id];

/** The Cross: the One-Two's third basic (or the one Bob and Weave primed). */
function cross(m: MatchHandle, id: number, dst: number): void {
  const w = m.world;
  const p = abil(w, id).passive;
  w.kCount[id] = 0;
  w.kEmpower[id] = 0;
  w.kHuntT[id] = 0;
  dealDamage(m, id, w.team[id], Kind.Hero, dst, lvl(w, id, p.dmg, p.dmgPerLevel), 'ability');
  slow(w, dst, p.slowBp, p.slow);
}

function knockout(m: MatchHandle, id: number, e: number): number {
  const w = m.world;
  const r = abil(w, id).r;
  if (e < 0 || w.kind[e] !== Kind.Hero || w.alive[e] === 0) return -1;
  const missing = w.maxHp[e] - w.hp[e];
  dealDamage(m, id, w.team[id], Kind.Hero, e, lvl(w, id, r.dmg, r.dmgPerLevel) + applyBp(missing, r.missingBp), 'ability');
  if (w.alive[e] === 0) return r.cooldown;
  knockback(m, e, w.x[id], w.y[id], r.push, w.facing[id]);
  if (w.fmKind[e] === FM.Knock) {
    const fly = isqrt(dist2(w.x[e], w.y[e], w.fmX[e], w.fmY[e]));
    if (fly * BP_ONE < r.push * r.wallBp) {
      w.kHuntVictim[id] = e;
      w.kStage[id] = WALL;
    }
  }
  return r.cooldown;
}

export const CHAMP_KIT: HeroKit = {
  aim,
  cast(m, id, slot, x, y, target) {
    const w = m.world;
    const a = abil(w, id);
    switch (slot) {
      case 0: {
        const q = a.q;
        const hx = w.x[id];
        const hy = w.y[id];
        const dir = aimAngle(w, id, x, y);
        const n = collect(w, w.team[id], hits, (e, r) => inCone(hx, hy, dir, q.range, q.arc, w.x[e], w.y[e], r));
        const dmg = lvl(w, id, q.dmg, q.dmgPerLevel);
        for (let i = 0; i < n; i++) dealDamage(m, id, w.team[id], Kind.Hero, hits[i], dmg, 'ability');
        return q.cooldown;
      }
      case 1:
        w.kRT[id] = a.w.duration;
        w.kHonour[id] = 0;
        return a.w.cooldown;
      case 2:
        dash(m, id, aimAngle(w, id, x, y), a.e.dash);
        w.kEmpower[id] = PRIMED;
        w.kHuntT[id] = a.e.window;
        return a.e.cooldown;
      default:
        return knockout(m, id, target);
    }
  },
  stepKit(m, id) {
    const w = m.world;
    if (w.kWindow[id] > 0 && --w.kWindow[id] === 0) {
      w.kFoe[id] = -1;
      w.kCount[id] = 0;
    }
    if (w.kHuntT[id] > 0 && --w.kHuntT[id] === 0) w.kEmpower[id] = 0;
    if (w.kRT[id] > 0 && --w.kRT[id] === 0) {
      const back = applyBp(w.kHonour[id], abil(w, id).w.healBp);
      w.kHonour[id] = 0;
      if (w.alive[id] === 1) creditHealShield(m, id, heal(w, id, back));
    }
    if (w.kStage[id] === WALL) {
      const e = w.kHuntVictim[id];
      if (e < 0 || w.alive[e] === 0) {
        w.kStage[id] = 0;
        w.kHuntVictim[id] = -1;
      } else if (w.fmKind[e] !== FM.Knock) {
        // It hit the wall: dazed.
        w.kStage[id] = 0;
        w.kHuntVictim[id] = -1;
        stun(w, e, abil(w, id).r.wallStun);
        m.events.push({ type: 'clip', tick: w.globals[G.Tick], id: e, what: 'ko' });
      }
    }
  },
  afterBasic(m, id, dst) {
    const w = m.world;
    if (!isFoeHero(w, id, dst) || w.alive[dst] === 0) return;
    const p = abil(w, id).passive;
    if (w.kEmpower[id] === PRIMED) {
      cross(m, id, dst);
      return;
    }
    if (w.kFoe[id] === dst && w.kWindow[id] > 0) w.kCount[id]++;
    else {
      w.kFoe[id] = dst;
      w.kCount[id] = 1;
    }
    w.kWindow[id] = p.window;
    if (w.kCount[id] >= p.every) cross(m, id, dst);
  },
  incoming(m, id, _src, dmg) {
    const w = m.world;
    if (w.kRT[id] === 0) return dmg;
    const cut = applyBp(dmg, BP_ONE - abil(w, id).w.reduceBp);
    w.kHonour[id] += cut;
    return cut;
  },
  reset(w, id) {
    w.kFoe[id] = -1;
    w.kCount[id] = 0;
    w.kWindow[id] = 0;
    w.kEmpower[id] = 0;
    w.kHuntT[id] = 0;
    w.kRT[id] = 0;
    w.kHonour[id] = 0;
    w.kHuntVictim[id] = -1;
    w.kStage[id] = 0;
  },
  snapFx: (w, id) => (w.kRT[id] > 0 ? SNAP_FX.Form : 0),
  resource: (w, id) => (w.kEmpower[id] === PRIMED || w.kCount[id] >= abil(w, id).passive.every - 1 ? 0xff : 0),
};
