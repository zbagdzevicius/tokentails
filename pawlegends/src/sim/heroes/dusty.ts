/**
 * Dusty, Marksman (sim v31, original cat; build spec docs/plans/moba/ROSTER-V31.md §2.2): the gunslinger. Bespoke hooks:
 * Four Corks (every 4th basic is a Big Cork that hits harder and slows, then a short reload), Trick Shot (a targeted
 * cork that bounces to the nearest other enemy, a hero first), Lasso (a short wind-up line that roots the first enemy
 * hero on it), Quick Draw (a dash that loads a Big Cork she can fire at once) and HIGH NOON (she plants her boots and
 * fires big corks along the aim, one after another; the last hits hardest).
 *
 * Kit arrays: kCount basics since the last Big Cork; kEmpower 1 = Quick Draw loaded, kWindow its ticks; kHuntT 1 while
 * the basic just fired is a Big Cork (basic → afterBasic); kStage HIGH NOON corks left, kWT ticks to the next one,
 * kChain the aim angle, kHonour corks fired.
 */
import { HERO_RULES } from '../../data/xp';
import { PROJECTILE_KIND } from '../../data/towers';
import { applyBp, dist2 } from '../fixed';
import type { MatchHandle } from '../state';
import { G, Kind, RANGE, type World } from '../world';
import { dealDamage } from '../combat/damage';
import { fireBolt } from '../combat/attack';
import { alongLine, dash, fireSkillshot, root, slow, PFLAG } from '../effects';
import { isAbilityTarget } from '../effects/targets';
import { radiusOf, targetable } from '../units/kinds';
import { Aim, aimAngle, lvl, SNAP_FX, type HeroKit, type SlotAim } from './kit';
import { abil, type KitNumbers } from './talents';
import { icos, idiv, isin, TRIG_ONE } from '../fixed';

const LOADED = 1;
const BIG = 1;
/** HIGH NOON's cork offsets from the aim (× spread steps): straight, left, right, straight. */
const SPREAD = [0, -1, 1, 0] as const;

function aim(a: KitNumbers, slot: number): SlotAim {
  switch (slot) {
    case 0:
      return { aim: Aim.Unit, reach: a.q.reach, windup: 0, mobility: false };
    case 1:
      return { aim: Aim.Dir, reach: 0, windup: a.w.windup, mobility: false };
    case 2:
      return { aim: Aim.Dir, reach: 0, windup: 0, mobility: true };
    default:
      return { aim: Aim.Dir, reach: 0, windup: a.r.windup, mobility: false };
  }
}

/** The bounce: the nearest enemy hero within `range` of `from` (not `from`), else the nearest other ability target; −1. */
function bounceTarget(w: World, team: number, from: number, range: number): number {
  let hero = -1;
  let heroD = 0;
  let any = -1;
  let anyD = 0;
  for (let e = 0; e < RANGE.end; e++) {
    if (e === from || !isAbilityTarget(w, e, team)) continue;
    const reach = range + radiusOf(w, e);
    const d = dist2(w.x[from], w.y[from], w.x[e], w.y[e]);
    if (d > reach * reach) continue;
    if (e < RANGE.minions && w.kind[e] === Kind.Hero) {
      if (hero < 0 || d < heroD) {
        hero = e;
        heroD = d;
      }
    } else if (any < 0 || d < anyD) {
      any = e;
      anyD = d;
    }
  }
  return hero >= 0 ? hero : any;
}

function trickShot(m: MatchHandle, id: number, target: number): number {
  const w = m.world;
  const q = abil(w, id).q;
  if (target < 0 || !targetable(w, target, w.team[id])) return -1;
  const dmg = lvl(w, id, q.dmg, q.dmgPerLevel);
  // Pick the bounce before the first hit: a cork that kills its target still bounces from where it stood.
  const next = bounceTarget(w, w.team[id], target, q.bounce);
  dealDamage(m, id, w.team[id], Kind.Hero, target, dmg, 'ability');
  if (next >= 0) {
    dealDamage(m, id, w.team[id], Kind.Hero, next, applyBp(dmg, q.bounceBp), 'ability');
    m.events.push({ type: 'clip', tick: w.globals[G.Tick], id: next, what: 'ricochet' });
  }
  return q.cooldown;
}

/** Lasso: the first enemy hero on the line (nearest along it; ties: lower id) is hurt and rooted. */
function lasso(m: MatchHandle, id: number, x: number, y: number): number {
  const w = m.world;
  const p = abil(w, id).w;
  const ang = aimAngle(w, id, x, y);
  const ax = w.x[id];
  const ay = w.y[id];
  const bx = ax + idiv(icos(ang) * p.range, TRIG_ONE);
  const by = ay + idiv(isin(ang) * p.range, TRIG_ONE);
  let best = -1;
  let bestAt = 0;
  for (let e = RANGE.heroes; e < RANGE.minions; e++) {
    if (w.kind[e] !== Kind.Hero || !targetable(w, e, w.team[id])) continue;
    const at = alongLine(ax, ay, bx, by, p.width >> 1, w.x[e], w.y[e], radiusOf(w, e));
    if (at < 0) continue;
    if (best < 0 || at < bestAt) {
      best = e;
      bestAt = at;
    }
  }
  if (best >= 0) {
    dealDamage(m, id, w.team[id], Kind.Hero, best, lvl(w, id, p.dmg, p.dmgPerLevel), 'ability');
    root(w, best, p.root);
    m.events.push({ type: 'clip', tick: w.globals[G.Tick], id: best, what: 'lasso' });
  }
  return p.cooldown;
}

/** One HIGH NOON cork. */
function noonShot(m: MatchHandle, id: number): void {
  const w = m.world;
  const r = abil(w, id).r;
  const n = w.kHonour[id];
  let dmg = lvl(w, id, r.dmg, r.dmgPerLevel);
  if (w.kStage[id] === 1) dmg = applyBp(dmg, r.lastBp);
  fireSkillshot(w, id, {
    kind: PROJECTILE_KIND.fluff,
    angle: w.kChain[id] + SPREAD[n & 3] * r.spread,
    speed: r.speed,
    range: r.range,
    radius: r.width >> 1,
    dmg,
    flags: PFLAG.HeroStop,
    minionBp: r.minionBp,
  });
  w.kHonour[id] = n + 1;
  w.kStage[id]--;
  w.kWT[id] = w.kStage[id] > 0 ? r.gap : 0;
}

function endNoon(w: World, id: number): void {
  w.kStage[id] = 0;
  w.kWT[id] = 0;
  w.kHonour[id] = 0;
}

export const DUSTY_KIT: HeroKit = {
  aim,
  cast(m, id, slot, x, y, target) {
    const w = m.world;
    const a = abil(w, id);
    switch (slot) {
      case 0:
        return trickShot(m, id, target);
      case 1:
        return lasso(m, id, x, y);
      case 2: {
        const e = a.e;
        dash(m, id, aimAngle(w, id, x, y), e.dash);
        w.kEmpower[id] = LOADED;
        w.kWindow[id] = e.window;
        w.attackTimer[id] = 0;
        return e.cooldown;
      }
      default: {
        const r = a.r;
        w.kChain[id] = aimAngle(w, id, x, y);
        w.facing[id] = w.kChain[id];
        w.kStage[id] = r.shots;
        w.kHonour[id] = 0;
        m.events.push({ type: 'clip', tick: w.globals[G.Tick], id, what: 'highnoon' });
        noonShot(m, id);
        return r.cooldown;
      }
    }
  },
  stepKit(m, id) {
    const w = m.world;
    if (w.kWindow[id] > 0 && --w.kWindow[id] === 0) w.kEmpower[id] = 0;
    if (w.kStage[id] > 0) {
      // A stun, a Nap or death ends HIGH NOON.
      if (w.alive[id] === 0 || w.stunT[id] > 0 || w.napT[id] > 0) {
        endNoon(w, id);
        return;
      }
      if (w.kWT[id] > 0 && --w.kWT[id] > 0) return;
      noonShot(m, id);
      if (w.kStage[id] === 0) endNoon(w, id);
    }
  },
  basic(m, id, dst, dmg) {
    const w = m.world;
    const p = abil(w, id).passive;
    const big = w.kEmpower[id] === LOADED || w.kCount[id] >= p.every - 1;
    if (!big) return false;
    w.kHuntT[id] = BIG;
    fireBolt(w, id, dst, applyBp(dmg, p.bonusBp), HERO_RULES.projectile, PROJECTILE_KIND.hero);
    m.events.push({ type: 'clip', tick: w.globals[G.Tick], id, what: 'bigcork' });
    return true;
  },
  afterBasic(m, id, dst) {
    const w = m.world;
    const p = abil(w, id).passive;
    if (w.kHuntT[id] !== BIG) {
      w.kCount[id]++;
      return;
    }
    w.kHuntT[id] = 0;
    w.kCount[id] = 0;
    w.kEmpower[id] = 0;
    w.kWindow[id] = 0;
    if (w.alive[dst] === 1 && (w.kind[dst] === Kind.Hero || w.kind[dst] === Kind.Minion)) slow(w, dst, p.slowBp, p.slow);
    // The reload: the next shot waits `reload` ticks longer.
    w.attackTimer[id] += p.reload;
  },
  reset(w, id) {
    w.kCount[id] = 0;
    w.kEmpower[id] = 0;
    w.kWindow[id] = 0;
    w.kHuntT[id] = 0;
    endNoon(w, id);
    w.kChain[id] = 0;
  },
  /** HIGH NOON: planted, no walking, no basic, no cast until the last cork. */
  busy: (w, id) => w.kStage[id] > 0,
  snapFx: (w, id) => (w.kStage[id] > 0 ? SNAP_FX.Channel : 0),
  /** The HUD's Big Cork light: the next basic is a Big Cork. */
  resource: (w, id) => (w.kEmpower[id] === LOADED || w.kCount[id] >= abil(w, id).passive.every - 1 ? 0xff : 0),
};
