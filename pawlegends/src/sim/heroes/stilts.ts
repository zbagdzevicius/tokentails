/**
 * Stilts, Assassin (sim v11, original cat; build spec docs/plans/moba/CATS-V11.md §2.4). Bespoke hooks: Long Stride
 * (Stride from distance walked, drained by standing still; at full she pounces on her attack target), High Leap's
 * untargetable leap and landing, Ear Swivel's reveal, Swat-Swat's two swats and Zoomies.
 *
 * Kit arrays: kValor Stride; kCount mm walked carry; kChain/kEmpower last x/y; kHuntT ticks standing still; kStage 1
 * pounce in flight, 2 High Leap landing; kWT second-swat timer; kWAge swat angle; kRT Zoomies ticks.
 *
 * Stride carry: kCount holds mm walked × perMetre, so 14 per metre (Quick Stride) gains exactly 14 over a metre.
 * Walking is what moved her on her own feet (fmKind None, at most STILTS_RULES.stepBp of her move speed for one
 * tick): a dash, a knockback, Nap's trip home or a Pounce blink never fills Stride.
 */
import { STILTS_RULES } from '../../data/heroes/stilts';
import { TICK_HZ } from '../../data/timeline';
import { COOLDOWN_SLOTS, FM, Kind, RANGE, type World, MAX_ENTITIES } from '../world';
import { applyBp, dist2, icos, idiv, isin, isqrt, TRIG_ONE } from '../fixed';
import type { MatchHandle } from '../state';
import { dealDamage } from '../combat/damage';
import { attackSpeed, collect, dash, haste, inLine, inRing, reveal, slow } from '../effects';
import { disabled } from '../effects/status';
import { attackRange, moveSpeed, radiusOf, targetable } from '../units/kinds';
import { Aim, aimAngle, lvl, SNAP_FX, type HeroKit, type SlotAim } from './kit';
import { abil, type KitNumbers } from './talents';

/** HERO_IDS index of Stilts (the snapshot's resource reads her Stride through the kit). */
export const STILTS_INDEX = 11;

const Q = 0;
/** kStage values. */
const POUNCE = 1;
const LEAP = 2;
const hits = new Int32Array(MAX_ENTITIES);

function aim(a: KitNumbers, slot: number): SlotAim {
  switch (slot) {
    case 0:
      return { aim: Aim.Point, reach: a.q.dash, windup: 0, mobility: true };
    case 2:
      return { aim: Aim.Dir, reach: 0, windup: 0, mobility: false };
    default:
      return { aim: Aim.Self, reach: 0, windup: 0, mobility: false };
  }
}

/** Is Stride full (a basic now is a pounce)? */
export const strideFull = (w: World, id: number): boolean => w.kValor[id] >= abil(w, id).passive.max;

function addStride(w: World, id: number, n: number): void {
  w.kValor[id] = Math.min(abil(w, id).passive.max, w.kValor[id] + n);
}

/** Where her basic reaches `t` from (centre to centre, as inAttackRange measures it). */
const reachTo = (w: World, id: number, t: number): number => attackRange(w, id) + radiusOf(w, id) + radiusOf(w, t);

/** High Leap lands: the nearest enemy hero within `touch` (lowest id on a tie) takes the hit, and Stride fills. */
function land(m: MatchHandle, id: number): void {
  const w = m.world;
  const q = abil(w, id).q;
  const lx = w.x[id];
  const ly = w.y[id];
  const n = collect(w, w.team[id], hits, (e, r) => inRing(lx, ly, q.touch, w.x[e], w.y[e], r), true);
  if (n === 0) return;
  let best = hits[0];
  for (let i = 1; i < n; i++) if (dist2(lx, ly, w.x[hits[i]], w.y[hits[i]]) < dist2(lx, ly, w.x[best], w.y[best])) best = hits[i];
  dealDamage(m, id, w.team[id], Kind.Hero, best, lvl(w, id, q.dmg, q.dmgPerLevel), 'ability');
  w.kValor[id] = abil(w, id).passive.max;
}

/** One Swat-Swat swipe from where she stands along `dir`. Returns true when it hit an enemy hero. */
function swat(m: MatchHandle, id: number, dir: number, second: boolean): boolean {
  const w = m.world;
  const e = abil(w, id).e;
  const ax = w.x[id];
  const ay = w.y[id];
  const bx = ax + idiv(icos(dir) * e.range, TRIG_ONE);
  const by = ay + idiv(isin(dir) * e.range, TRIG_ONE);
  const n = collect(w, w.team[id], hits, (t, r) => inLine(ax, ay, bx, by, e.width >> 1, w.x[t], w.y[t], r));
  const dmg = lvl(w, id, e.dmg, e.dmgPerLevel);
  let hero = false;
  for (let i = 0; i < n; i++) {
    const t = hits[i];
    dealDamage(m, id, w.team[id], Kind.Hero, t, dmg, 'ability');
    if (!second) continue;
    slow(w, t, e.slowBp, e.slow);
    if (w.kind[t] === Kind.Hero) hero = true;
  }
  return hero;
}

/** Ear Swivel: every enemy hero within the radius is revealed, hidden in brush or stealth or not (no breakStealth). */
function earSwivel(w: World, id: number): number {
  const p = abil(w, id).w;
  for (let e = RANGE.heroes; e < RANGE.minions; e++) {
    if (w.alive[e] === 0 || w.kind[e] !== Kind.Hero || w.team[e] === w.team[id]) continue;
    if (inRing(w.x[id], w.y[id], p.radius, w.x[e], w.y[e], radiusOf(w, e))) reveal(w, e, p.reveal);
  }
  attackSpeed(w, id, p.attackSpeedBp, p.duration);
  return p.cooldown;
}

/** Long Stride: walking fills, standing still drains, Zoomies holds it full. */
function stride(w: World, id: number): void {
  const p = abil(w, id).passive;
  const dx = w.x[id] - w.kChain[id];
  const dy = w.y[id] - w.kEmpower[id];
  w.kChain[id] = w.x[id];
  w.kEmpower[id] = w.y[id];
  if (w.kRT[id] > 0) {
    w.kValor[id] = p.max;
    w.kHuntT[id] = 0;
    return;
  }
  if (dx === 0 && dy === 0) {
    if (++w.kHuntT[id] >= p.drainEvery) {
      w.kHuntT[id] = 0;
      w.kValor[id] = Math.max(0, w.kValor[id] - p.drain);
    }
    return;
  }
  w.kHuntT[id] = 0;
  if (w.fmKind[id] !== FM.None) return;
  const d = isqrt(dx * dx + dy * dy);
  if (d * TICK_HZ > applyBp(moveSpeed(w, id), STILTS_RULES.stepBp)) return;
  w.kCount[id] += d * p.perMetre;
  const gain = idiv(w.kCount[id], STILTS_RULES.metre);
  w.kCount[id] -= gain * STILTS_RULES.metre;
  if (gain > 0) addStride(w, id, gain);
}

/** At full Stride, a live enemy hero she is attacking just out of reach gets pounced on (a dash into reach). */
function autoPounce(m: MatchHandle, id: number): void {
  const w = m.world;
  if (!strideFull(w, id) || w.kStage[id] !== 0 || w.fmKind[id] !== FM.None || w.castPhase[id] !== 0) return;
  if (disabled(w, id) || w.rootT[id] > 0) return;
  const t = w.target[id];
  if (t < 0 || t >= RANGE.minions || w.kind[t] !== Kind.Hero || !targetable(w, t, w.team[id])) return;
  const a = abil(w, id);
  const leap = w.kRT[id] > 0 ? a.r.leap : a.passive.leap;
  const near = reachTo(w, id, t);
  const d = isqrt(dist2(w.x[id], w.y[id], w.x[t], w.y[t]));
  if (d <= near || d > near + leap) return;
  dash(m, id, aimAngle(w, id, w.x[t], w.y[t]), d - near + STILTS_RULES.overshoot);
  w.kStage[id] = POUNCE;
}

export const STILTS_KIT: HeroKit = {
  aim,
  cast(m, id, slot, x, y) {
    const w = m.world;
    const a = abil(w, id);
    switch (slot) {
      case 0: {
        const q = a.q;
        // A leap up to q.dash: an aimed point closer than that is where she lands.
        const to = x === w.x[id] && y === w.y[id] ? q.dash : Math.min(q.dash, isqrt(dist2(w.x[id], w.y[id], x, y)));
        const ticks = dash(m, id, aimAngle(w, id, x, y), Math.max(1, to), q.speed);
        // Untargetable in the air (the Tumble pattern): until the landing tick.
        w.untargT[id] = Math.max(w.untargT[id], ticks);
        w.kStage[id] = LEAP;
        return q.cooldown;
      }
      case 1:
        return earSwivel(w, id);
      case 2: {
        const dir = aimAngle(w, id, x, y);
        swat(m, id, dir, false);
        w.kWAge[id] = dir;
        w.kWT[id] = a.e.gap;
        return a.e.cooldown;
      }
      default:
        haste(w, id, a.r.hasteBp, a.r.duration);
        w.kRT[id] = a.r.duration;
        w.kValor[id] = a.passive.max;
        return a.r.cooldown;
    }
  },
  stepKit(m, id) {
    const w = m.world;
    // A leap or pounce whose dash ended (landed, or stopped by CC) resolves first.
    if (w.kStage[id] === LEAP && w.fmKind[id] === FM.None) {
      w.kStage[id] = 0;
      if (!disabled(w, id)) land(m, id);
    } else if (w.kStage[id] === POUNCE && w.fmKind[id] === FM.None) w.kStage[id] = 0;
    if (w.kWT[id] > 0) {
      if (disabled(w, id)) w.kWT[id] = 0;
      else if (--w.kWT[id] === 0 && swat(m, id, w.kWAge[id], true)) addStride(w, id, abil(w, id).e.stride);
    }
    if (w.kRT[id] > 0) w.kRT[id]--;
    stride(w, id);
    autoPounce(m, id);
  },
  basic(m, id, dst, dmg) {
    const w = m.world;
    if (!strideFull(w, id) || w.kind[dst] !== Kind.Hero) return false;
    const a = abil(w, id);
    dealDamage(m, id, w.team[id], Kind.Hero, dst, applyBp(dmg, a.passive.bonusBp), 'basic');
    slow(w, dst, a.passive.slowBp, a.passive.slow);
    w.kStage[id] = 0;
    if (w.kRT[id] > 0) {
      const i = id * COOLDOWN_SLOTS + Q;
      w.cooldowns[i] = Math.max(0, w.cooldowns[i] - a.r.refund);
    } else {
      w.kValor[id] = 0;
      w.kCount[id] = 0;
    }
    return true;
  },
  reset(w, id) {
    w.kValor[id] = 0;
    w.kCount[id] = 0;
    w.kHuntT[id] = 0;
    w.kStage[id] = 0;
    w.kWT[id] = 0;
    w.kWAge[id] = 0;
    w.kRT[id] = 0;
    w.kChain[id] = w.x[id];
    w.kEmpower[id] = w.y[id];
  },
  snapFx: (w: World, id: number) => (w.kRT[id] > 0 ? SNAP_FX.Form : 0),
  resource: (w: World, id: number) => w.kValor[id],
};
