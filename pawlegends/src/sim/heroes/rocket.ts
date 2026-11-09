/**
 * Rocket, Marksman (sim v15, original dog; build spec docs/plans/moba/DOGS-V15.md §1.1). Bespoke hooks: Sighthound
 * (his basics on a far enemy hero hit harder), Lure Shot's hero-stop dart (a hero hit hastes him), Photo Finish's
 * loaded basic, SQUIRREL! (enemy heroes near the toy are hurt and run at it) and ZOOM… ZZZ (an untargetable sprint
 * that Clocks the heroes it passes, then a nap: `busy`, tougher).
 *
 * Basic multipliers, in this order, each an integer applyBp at the moment the bolt fires (`basic`): Sighthound (enemy
 * hero at least passive.range away, centre to centre), Photo Finish (any target, the next basic only), Clocked
 * (an enemy hero his sprint passed, while kWAge runs). His E and R hits run under the in-kit guard (kEmpower =
 * RESOLVING), so `afterDeal` reads only Lure Shot as "his ability hit a hero".
 *
 * SQUIRREL!'s pull is a fear from the toy point mirrored through the victim: fleeing from it walks the cat toward the
 * toy (the same trick as Nugget's herd knockback; no new primitive).
 *
 * Kit arrays: kWindow Photo Finish ticks left; kStage 1 = sprinting; kRT nap ticks; kCount Clocked bitmask (bit =
 * enemy hero id, hero ids are < 32); kWAge Clocked ticks left; kHonour/kChain the squirrel point; kWT squirrel wind-up
 * ticks; kEmpower the in-kit guard.
 */
import { HERO_RULES } from '../../data/xp';
import { PROJECTILE_KIND } from '../../data/towers';
import { BP_ONE, applyBp, dist2, idiv } from '../fixed';
import type { MatchHandle } from '../state';
import { FM, G, Kind, RANGE, type World, MAX_ENTITIES, fmHas, fmAdd } from '../world';
import { dealDamage } from '../combat/damage';
import { fireBolt } from '../combat/attack';
import { collect, dash, fear, fireSkillshot, haste, healOverTime, inRing, slow, spawnBurst, ON_HIT, PFLAG } from '../effects';
import { Aim, aimAngle, lvl, SNAP_FX, type HeroKit, type SlotAim } from './kit';
import { abil, type KitNumbers } from './talents';

/** kEmpower while his own E or R deals damage (afterDeal ignores it). */
const RESOLVING = 1;
const SPRINT = 1;
const hits = new Int32Array(MAX_ENTITIES);

function aim(a: KitNumbers, slot: number): SlotAim {
  switch (slot) {
    case 0:
      return { aim: Aim.Dir, reach: 0, windup: 0, mobility: false };
    case 1:
      return { aim: Aim.Dir, reach: 0, windup: 0, mobility: true };
    case 2:
      return { aim: Aim.Point, reach: a.e.range, windup: 0, mobility: false };
    default:
      // ZOOM… ZZZ is an 11 m dash: a root refuses it like every other dash.
      return { aim: Aim.Dir, reach: 0, windup: a.r.windup, mobility: true };
  }
}

const isFoeHero = (w: World, id: number, e: number): boolean =>
  e >= RANGE.heroes && e < RANGE.minions && w.kind[e] === Kind.Hero && w.team[e] !== w.team[id];

/** Is enemy hero `e` Clocked by his sprint (and still inside the window)? */
export const clocked = (w: World, id: number, e: number): boolean => w.kWAge[id] > 0 && e < 0x20 && (w.kCount[id] & (1 << e)) !== 0;

/** SQUIRREL! goes off: enemy heroes within the radius of the toy are hurt and run at it. */
function squirrel(m: MatchHandle, id: number): void {
  const w = m.world;
  const e = abil(w, id).e;
  const px = w.kHonour[id];
  const py = w.kChain[id];
  const n = collect(w, w.team[id], hits, (t, r) => inRing(px, py, e.radius, w.x[t], w.y[t], r), true);
  const dmg = lvl(w, id, e.dmg, e.dmgPerLevel);
  w.kEmpower[id] = RESOLVING;
  for (let i = 0; i < n; i++) {
    const t = hits[i];
    dealDamage(m, id, w.team[id], Kind.Hero, t, dmg, 'ability');
    // Fleeing from the toy point mirrored through the cat walks it toward the toy.
    fear(w, t, e.lure, 2 * w.x[t] - px, 2 * w.y[t] - py);
  }
  w.kEmpower[id] = 0;
}

/** The sprint ended (landed or cut short by CC): the nap always follows. */
function nap(m: MatchHandle, id: number): void {
  const w = m.world;
  const r = abil(w, id).r;
  w.kStage[id] = 0;
  w.kRT[id] = r.nap;
  // The nap drops a loaded Photo Finish and any swing.
  w.kWindow[id] = 0;
  w.windup[id] = 0;
  if (r.napHealBp > 0) healOverTime(w, id, idiv(w.maxHp[id] * r.napHealBp, BP_ONE), r.nap);
  m.events.push({ type: 'clip', tick: w.globals[G.Tick], id, what: 'zzz' });
}

export const ROCKET_KIT: HeroKit = {
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
          flags: PFLAG.HeroStop,
          minionBp: q.minionBp,
          effect: ON_HIT.Reveal,
          effA: q.reveal,
        });
        return p < 0 ? -1 : q.cooldown;
      }
      case 1: {
        const p = a.w;
        dash(m, id, aimAngle(w, id, x, y), p.dash, p.speed);
        w.kWindow[id] = p.window;
        return p.cooldown;
      }
      case 2: {
        const e = a.e;
        w.kHonour[id] = x;
        w.kChain[id] = y;
        w.kWT[id] = e.windup;
        // Visual only (no damage, no slow): render draws the squirrel and its ring on this zone, for both teams.
        spawnBurst(w, w.team[id], id, x, y, e.radius, e.windup, e.windup + e.lure, 0, 0, 0, 0, 0);
        return e.cooldown;
      }
      default: {
        const r = a.r;
        w.kStage[id] = SPRINT;
        w.kCount[id] = 0;
        w.kWAge[id] = 0;
        const ticks = dash(m, id, aimAngle(w, id, x, y), r.dash, r.speed);
        w.untargT[id] = Math.max(w.untargT[id], ticks);
        return r.cooldown;
      }
    }
  },
  stepKit(m, id) {
    const w = m.world;
    if (w.kWindow[id] > 0) w.kWindow[id]--;
    if (w.kRT[id] > 0) w.kRT[id]--;
    if (w.kWAge[id] > 0 && --w.kWAge[id] === 0) w.kCount[id] = 0;
    // Nap's trip home has no kit reset (CATS-V11 known gap): drop the sprint and the toy.
    if (w.napT[id] > 0) {
      w.kStage[id] = 0;
      w.kWT[id] = 0;
    }
    if (w.kStage[id] === SPRINT && w.fmKind[id] === FM.None) nap(m, id);
    if (w.kWT[id] > 0 && --w.kWT[id] === 0) squirrel(m, id);
  },
  onDashTick(m, id) {
    const w = m.world;
    if (w.kStage[id] !== SPRINT) return;
    const r = abil(w, id).r;
    const half = r.width >> 1;
    const n = collect(
      w,
      w.team[id],
      hits,
      (e, er) => !fmHas(w, id, e) && dist2(w.x[id], w.y[id], w.x[e], w.y[e]) <= (half + er) * (half + er),
      true,
    );
    const dmg = lvl(w, id, r.dmg, r.dmgPerLevel);
    w.kEmpower[id] = RESOLVING;
    for (let i = 0; i < n; i++) {
      const e = hits[i];
      fmAdd(w, id, e);
      dealDamage(m, id, w.team[id], Kind.Hero, e, dmg, 'ability');
      if (e < 0x20) w.kCount[id] |= 1 << e;
      w.kWAge[id] = r.clocked;
    }
    w.kEmpower[id] = 0;
  },
  basic(m, id, dst, dmg) {
    const w = m.world;
    const a = abil(w, id);
    let d = dmg;
    const foe = isFoeHero(w, id, dst);
    if (foe && dist2(w.x[id], w.y[id], w.x[dst], w.y[dst]) >= a.passive.range * a.passive.range) d = applyBp(d, a.passive.bonusBp);
    if (w.kWindow[id] > 0) d = applyBp(d, a.w.bonusBp);
    if (foe && clocked(w, id, dst)) d = applyBp(d, a.r.clockedBp);
    if (d === dmg) return false;
    fireBolt(w, id, dst, d, HERO_RULES.projectile, PROJECTILE_KIND.hero);
    return true;
  },
  afterBasic(m, id, dst) {
    const w = m.world;
    if (w.kWindow[id] === 0) return;
    const p = abil(w, id).w;
    w.kWindow[id] = 0;
    slow(w, dst, p.slowBp, p.slow);
  },
  afterDeal(m, id, dst, _dmg, kind) {
    const w = m.world;
    // Lure Shot (his only ability damage outside the guard) on an enemy hero: he speeds up.
    if (kind !== 'ability' || w.kEmpower[id] !== 0 || w.alive[id] === 0 || !isFoeHero(w, id, dst)) return;
    const q = abil(w, id).q;
    haste(w, id, q.hasteBp, q.haste);
  },
  incoming(m, id, _src, dmg) {
    const w = m.world;
    return w.kRT[id] > 0 ? applyBp(dmg, BP_ONE - abil(w, id).r.napReduceBp) : dmg;
  },
  busy: (w, id) => w.kRT[id] > 0,
  reset(w, id) {
    w.kWindow[id] = 0;
    w.kStage[id] = 0;
    w.kRT[id] = 0;
    w.kCount[id] = 0;
    w.kWAge[id] = 0;
    w.kWT[id] = 0;
    w.kEmpower[id] = 0;
  },
  snapFx: (w, id) => (w.kRT[id] > 0 ? SNAP_FX.Form : 0),
  resource: (w, id) => (w.kWindow[id] > 0 ? 0xff : 0),
};
