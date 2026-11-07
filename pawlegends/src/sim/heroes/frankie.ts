/**
 * Frankie, Assassin (sim v15, original dog; build spec docs/plans/moba/DOGS-V15.md §1.2). Bespoke hooks: Ketchup and
 * Mustard (an ability hit and a basic on the same enemy hero within the window, either order, add a Combo hit; then a
 * lockout), Weenie Roll (a dash that stops at the first enemy hero and knocks it back), Dig (untargetable travel to a
 * point, a stun on the pop), Bun Hop (a hop that shakes off slows) and FOOTLONG! (a hero-stop shot; the hero it hits
 * is stunned and he snaps to it; a miss refunds part of the cooldown).
 *
 * The grab is the R shot's ability hit on an enemy hero while the shot is in flight (kWT > 0), outside a Q roll
 * (fmKind Dash) and outside the guard: the Combo hit and the Dig pop run under kEmpower = COMBO / POP.
 *
 * Kit arrays: kFoe the last Combo victim; kValor what landed on it (1 ability, 2 basic); kWindow the Combo window;
 * kHuntT the Combo lockout; kStage 1 = rolling, 2 = digging, 4 = snapping to the grabbed hero; kWT FOOTLONG flight
 * ticks left; kHuntVictim the grabbed hero; kEmpower the in-kit guard.
 */
import { PROJECTILE_KIND } from '../../data/towers';
import { BP_ONE, applyBp, dist2, iatan2, idiv, isqrt } from '../fixed';
import type { MatchHandle } from '../state';
import { COOLDOWN_SLOTS, ENTITY_CAP, FM, G, Kind, RANGE, maskHas, type World } from '../world';
import { dealDamage } from '../combat/damage';
import { collect, dash, fireSkillshot, haste, inRing, knockback, stun, travelTicks, PFLAG } from '../effects';
import { radiusOf } from '../units/kinds';
import { Aim, aimAngle, lvl, SNAP_FX, type HeroKit, type SlotAim } from './kit';
import { abil, type KitNumbers } from './talents';

/** kEmpower values: the Combo hit (no new Combo from it) and the Dig pop (never a FOOTLONG grab). */
const COMBO = 1;
const POP = 2;
/** kStage values. */
const ROLL = 1;
const DIG = 2;
const SNAP = 4;
const R_SLOT = 3;
const hits = new Int32Array(ENTITY_CAP);

function aim(a: KitNumbers, slot: number): SlotAim {
  switch (slot) {
    case 0:
      return { aim: Aim.Dir, reach: 0, windup: 0, mobility: true };
    case 1:
      return { aim: Aim.Point, reach: a.w.range, windup: 0, mobility: true };
    case 2:
      return { aim: Aim.Dir, reach: 0, windup: 0, mobility: true };
    default:
      return { aim: Aim.Dir, reach: 0, windup: a.r.windup, mobility: false };
  }
}

const isFoeHero = (w: World, id: number, e: number): boolean =>
  e >= RANGE.heroes && e < RANGE.minions && w.kind[e] === Kind.Hero && w.team[e] !== w.team[id];

/** Ketchup and Mustard: `t` (1 ability, 2 basic) landed on enemy hero `dst`. */
function combo(m: MatchHandle, id: number, dst: number, t: number): void {
  const w = m.world;
  if (w.kHuntT[id] > 0) return;
  if (w.kFoe[id] === dst && w.kWindow[id] > 0 && w.kValor[id] !== t) {
    const p = abil(w, id).passive;
    w.kWindow[id] = 0;
    w.kFoe[id] = -1;
    w.kValor[id] = 0;
    w.kHuntT[id] = p.lockout;
    w.kEmpower[id] = COMBO;
    dealDamage(m, id, w.team[id], Kind.Hero, dst, lvl(w, id, p.dmg, p.dmgPerLevel), 'ability');
    w.kEmpower[id] = 0;
    return;
  }
  w.kFoe[id] = dst;
  w.kValor[id] = t;
  w.kWindow[id] = abil(w, id).passive.window;
}

/** FOOTLONG! grabbed enemy hero `dst`: stunned first, then he snaps to it. */
function grab(m: MatchHandle, id: number, dst: number): void {
  const w = m.world;
  const r = abil(w, id).r;
  stun(w, dst, r.stun);
  w.kWT[id] = 0;
  w.kHuntVictim[id] = dst;
  const d = isqrt(dist2(w.x[id], w.y[id], w.x[dst], w.y[dst]));
  const len = d - radiusOf(w, id) - radiusOf(w, dst);
  if (len > 0) {
    dash(m, id, iatan2(w.y[dst] - w.y[id], w.x[dst] - w.x[id]), len, r.snapSpeed);
    w.kStage[id] = SNAP;
  }
  m.events.push({ type: 'clip', tick: w.globals[G.Tick], id, what: 'footlong' });
}

/** Dig pops up: enemies within the radius take the hit; enemy heroes are stunned. */
function pop(m: MatchHandle, id: number): void {
  const w = m.world;
  const p = abil(w, id).w;
  w.kStage[id] = 0;
  const hx = w.x[id];
  const hy = w.y[id];
  const n = collect(w, w.team[id], hits, (e, r) => inRing(hx, hy, p.radius, w.x[e], w.y[e], r));
  const dmg = lvl(w, id, p.dmg, p.dmgPerLevel);
  for (let i = 0; i < n; i++) {
    const e = hits[i];
    w.kEmpower[id] = POP;
    dealDamage(m, id, w.team[id], Kind.Hero, e, dmg, 'ability');
    w.kEmpower[id] = 0;
    if (w.kind[e] === Kind.Hero) stun(w, e, p.stun);
  }
}

export const FRANKIE_KIT: HeroKit = {
  aim,
  cast(m, id, slot, x, y) {
    const w = m.world;
    const a = abil(w, id);
    switch (slot) {
      case 0:
        dash(m, id, aimAngle(w, id, x, y), a.q.dash, a.q.speed);
        w.kStage[id] = ROLL;
        return a.q.cooldown;
      case 1: {
        const p = a.w;
        const d = Math.min(p.range, isqrt(dist2(w.x[id], w.y[id], x, y)));
        const ticks = dash(m, id, aimAngle(w, id, x, y), Math.max(d, 1), p.speed);
        w.untargT[id] = Math.max(w.untargT[id], ticks);
        w.kStage[id] = DIG;
        return p.cooldown;
      }
      case 2: {
        const e = a.e;
        // Slows only: a root refuses the hop (canCast), and a stun or fear stops the cast.
        w.slowT[id] = 0;
        w.slowBp[id] = 0;
        dash(m, id, aimAngle(w, id, x, y), e.dash);
        haste(w, id, e.hasteBp, e.haste);
        return e.cooldown;
      }
      default: {
        const r = a.r;
        const p = fireSkillshot(w, id, {
          kind: PROJECTILE_KIND.fluff,
          angle: aimAngle(w, id, x, y),
          speed: r.speed,
          range: r.range,
          radius: r.width >> 1,
          dmg: lvl(w, id, r.dmg, r.dmgPerLevel),
          flags: PFLAG.HeroStop,
          minionBp: r.minionBp,
        });
        if (p < 0) return -1;
        w.kWT[id] = travelTicks(r.range, r.speed) + 1;
        return r.cooldown;
      }
    }
  },
  stepKit(m, id) {
    const w = m.world;
    if (w.kWindow[id] > 0 && --w.kWindow[id] === 0) {
      w.kFoe[id] = -1;
      w.kValor[id] = 0;
    }
    if (w.kHuntT[id] > 0) w.kHuntT[id]--;
    // Nap's trip home has no kit reset (CATS-V11 known gap): no landing, no grab.
    if (w.napT[id] > 0) {
      w.kStage[id] = 0;
      w.kWT[id] = 0;
      w.kHuntVictim[id] = -1;
    }
    if (w.fmKind[id] === FM.None) {
      if (w.kStage[id] === DIG) pop(m, id);
      else if (w.kStage[id] !== 0) {
        w.kStage[id] = 0;
        w.kHuntVictim[id] = -1;
      }
    }
    if (w.kWT[id] > 0 && --w.kWT[id] === 0) {
      // A miss: part of the cooldown comes back.
      const r = abil(w, id).r;
      const i = id * COOLDOWN_SLOTS + R_SLOT;
      w.cooldowns[i] = Math.min(w.cooldowns[i], idiv(r.cooldown * (BP_ONE - r.missRefundBp), BP_ONE));
    }
  },
  onDashTick(m, id) {
    const w = m.world;
    if (w.kStage[id] !== ROLL) return;
    const q = abil(w, id).q;
    const half = q.width >> 1;
    const hx = w.x[id];
    const hy = w.y[id];
    const n = collect(w, w.team[id], hits, (e, r) => !maskHas(w.fmHitLo[id], w.fmHitHi[id], e) && dist2(hx, hy, w.x[e], w.y[e]) <= (half + r) * (half + r));
    const dmg = lvl(w, id, q.dmg, q.dmgPerLevel);
    for (let i = 0; i < n; i++) {
      const e = hits[i];
      if (e < 0x20) w.fmHitLo[id] |= 1 << e;
      else w.fmHitHi[id] |= 1 << (e - 0x20);
      if (w.kind[e] === Kind.Hero) {
        // The first enemy hero stops the roll (hero ids come first in `collect`).
        dealDamage(m, id, w.team[id], Kind.Hero, e, dmg, 'ability');
        knockback(m, e, hx, hy, q.push, w.facing[id]);
        w.fmT[id] = 0;
        w.fmKind[id] = FM.None;
        w.kStage[id] = 0;
        return;
      }
      dealDamage(m, id, w.team[id], Kind.Hero, e, applyBp(dmg, q.minionBp), 'ability');
    }
  },
  afterDeal(m, id, dst, _dmg, kind) {
    const w = m.world;
    if (w.alive[id] === 0 || !isFoeHero(w, id, dst)) return;
    const guard = w.kEmpower[id];
    if (kind === 'ability' && guard === 0 && w.kWT[id] > 0 && w.fmKind[id] !== FM.Dash) grab(m, id, dst);
    if (guard === COMBO) return;
    if (kind === 'ability') combo(m, id, dst, 1);
    else if (kind === 'basic') combo(m, id, dst, 2);
  },
  reset(w, id) {
    w.kFoe[id] = -1;
    w.kValor[id] = 0;
    w.kWindow[id] = 0;
    w.kHuntT[id] = 0;
    w.kStage[id] = 0;
    w.kWT[id] = 0;
    w.kHuntVictim[id] = -1;
    w.kEmpower[id] = 0;
  },
  snapFx: (w, id) => (w.kStage[id] === DIG || w.kWT[id] > 0 ? SNAP_FX.Form : 0),
  resource: (w, id) => (w.kWindow[id] > 0 ? 0xff : 0),
};
