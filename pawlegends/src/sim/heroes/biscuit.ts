/**
 * Biscuit, Support (sim v29, original dog; build spec docs/plans/moba/ROSTER-V29.md §2.3): the catcher. Bespoke hooks:
 * Good Boy (every few seconds his next basic on an enemy hero stuns it and shields him and a friend), Fetch! (a
 * stop-at-first-unit leash shot; the enemy hero it hits is stunned and pulled to just in front of him), Tail Wag (a
 * knock-back ring), Stubborn (a cleanse, CC immunity and less damage for a moment) and WALKIES! (every enemy hero round
 * him is pulled in, hurt and slowed; he gains a shield).
 *
 * Kit arrays: kValor Good Boy ready (0/1); kHuntT its timer; kChain the Fetch! flight ticks left (> 0: the next
 * ability hit on an enemy hero is the catch; not kWT, which brush.ts reads as a block); kRT Stubborn ticks; kEmpower the
 * in-kit guard (a non-catch ability hit).
 */
import { PROJECTILE_KIND } from '../../data/towers';
import { BP_ONE, applyBp, dist2, idiv, isqrt } from '../fixed';
import { toySupport } from '../progression/fish';
import type { MatchHandle } from '../state';
import { FM, G, Kind, RANGE, type World, MAX_ENTITIES } from '../world';
import { dealDamage } from '../combat/damage';
import { addShield, cleanse, clipTravel, collect, fireSkillshot, inRing, knockback, slow, startForced, stun, travelTicks } from '../effects';
import { ccImmune, drGrant, interrupt } from '../effects/status';
import { creditHealShield } from '../effects/heal';
import { radiusOf } from '../units/kinds';
import { Aim, aimAngle, lvl, SNAP_FX, type HeroKit, type SlotAim } from './kit';
import { abil, type KitNumbers } from './talents';

const GUARD = 1;
const hits = new Int32Array(MAX_ENTITIES);
const end = new Int32Array(2);

function aim(a: KitNumbers, slot: number): SlotAim {
  switch (slot) {
    case 0:
      return { aim: Aim.Dir, reach: 0, windup: a.q.windup, mobility: false };
    case 1:
      return { aim: Aim.Self, reach: 0, windup: 0, mobility: false };
    case 2:
      return { aim: Aim.Self, reach: 0, windup: 0, mobility: false };
    default:
      return { aim: Aim.Self, reach: 0, windup: a.r.windup, mobility: false };
  }
}

const isFoeHero = (w: World, id: number, e: number): boolean =>
  e >= RANGE.heroes && e < RANGE.minions && w.kind[e] === Kind.Hero && w.team[e] !== w.team[id];

/** The allied hero nearest him (not himself) within `range`, or −1. */
function nearestFriend(w: World, id: number, range: number): number {
  let best = -1;
  let bestD = 0;
  for (let a = RANGE.heroes; a < RANGE.minions; a++) {
    if (a === id || w.alive[a] === 0 || w.kind[a] !== Kind.Hero || w.team[a] !== w.team[id]) continue;
    const d = dist2(w.x[id], w.y[id], w.x[a], w.y[a]);
    if (d > range * range) continue;
    if (best < 0 || d < bestD) {
      best = a;
      bestD = d;
    }
  }
  return best;
}

/** Pull enemy hero `e` straight toward him, to `gap` from his edge, at `speed` (hard CC while it travels). */
function pull(m: MatchHandle, id: number, e: number, gap: number, speed: number): void {
  const w = m.world;
  if (ccImmune(w, e)) return;
  const dx = w.x[e] - w.x[id];
  const dy = w.y[e] - w.y[id];
  const d = isqrt(dx * dx + dy * dy);
  const keep = radiusOf(w, id) + radiusOf(w, e) + gap;
  if (d <= keep || d === 0) return;
  const tx = w.x[id] + idiv(dx * keep, d);
  const ty = w.y[id] + idiv(dy * keep, d);
  clipTravel(m, e, tx, ty, end);
  const len = isqrt(dist2(w.x[e], w.y[e], end[0], end[1]));
  if (len <= 0) return;
  const ticks = travelTicks(len, speed);
  drGrant(w, e, ticks);
  interrupt(w, e, true);
  startForced(w, e, end[0], end[1], ticks, FM.Knock);
}

/** Fetch! caught enemy hero `dst`. */
function caught(m: MatchHandle, id: number, dst: number): void {
  const w = m.world;
  const q = abil(w, id).q;
  w.kChain[id] = 0;
  stun(w, dst, q.stun);
  pull(m, id, dst, q.gap, q.pullSpeed);
  m.events.push({ type: 'clip', tick: w.globals[G.Tick], id, what: 'fetch' });
}

function walkies(m: MatchHandle, id: number): number {
  const w = m.world;
  const r = abil(w, id).r;
  const hx = w.x[id];
  const hy = w.y[id];
  const n = collect(w, w.team[id], hits, (e, er) => inRing(hx, hy, r.radius, w.x[e], w.y[e], er), true);
  const dmg = lvl(w, id, r.dmg, r.dmgPerLevel);
  for (let i = 0; i < n; i++) {
    const e = hits[i];
    const d = isqrt(dist2(hx, hy, w.x[e], w.y[e]));
    const keep = radiusOf(w, id) + radiusOf(w, e) + r.gap;
    const len = Math.min(r.pull, d - keep);
    // Pushed away from the point mirrored through the victim: toward him, never closer than the gap.
    if (len > 0) knockback(m, e, 2 * w.x[e] - hx, 2 * w.y[e] - hy, len, w.facing[id]);
    w.kEmpower[id] = GUARD;
    dealDamage(m, id, w.team[id], Kind.Hero, e, dmg, 'ability');
    w.kEmpower[id] = 0;
    slow(w, e, r.slowBp, r.slow);
  }
  creditHealShield(m, id, addShield(w, id, lvl(w, id, r.shield, r.shieldPerLevel), r.duration));
  return r.cooldown;
}

export const BISCUIT_KIT: HeroKit = {
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
        });
        if (p < 0) return -1;
        w.kChain[id] = travelTicks(q.range, q.speed) + 1;
        return q.cooldown;
      }
      case 1: {
        const p = a.w;
        const hx = w.x[id];
        const hy = w.y[id];
        const n = collect(w, w.team[id], hits, (e, r) => inRing(hx, hy, p.radius, w.x[e], w.y[e], r));
        const dmg = lvl(w, id, p.dmg, p.dmgPerLevel);
        for (let i = 0; i < n; i++) {
          const e = hits[i];
          w.kEmpower[id] = GUARD;
          dealDamage(m, id, w.team[id], Kind.Hero, e, dmg, 'ability');
          w.kEmpower[id] = 0;
          knockback(m, e, hx, hy, p.push, w.facing[id]);
        }
        return p.cooldown;
      }
      case 2: {
        const p = a.e;
        cleanse(w, id, p.duration);
        w.kRT[id] = p.duration;
        return p.cooldown;
      }
      default:
        return walkies(m, id);
    }
  },
  stepKit(m, id) {
    const w = m.world;
    if (w.kValor[id] === 0) {
      if (w.kHuntT[id] > 0) w.kHuntT[id]--;
      if (w.kHuntT[id] === 0) w.kValor[id] = 1;
    }
    if (w.kChain[id] > 0) w.kChain[id]--;
    if (w.kRT[id] > 0) w.kRT[id]--;
    if (w.napT[id] > 0) w.kChain[id] = 0;
  },
  afterDeal(m, id, dst, _dmg, kind) {
    const w = m.world;
    if (kind !== 'ability' || w.alive[id] === 0) return;
    if (w.kChain[id] === 0 || w.kEmpower[id] !== 0) return;
    // The ball stops at the first unit: a minion ends the flight, an enemy hero is caught.
    if (isFoeHero(w, id, dst)) caught(m, id, dst);
    else w.kChain[id] = 0;
  },
  afterBasic(m, id, dst) {
    const w = m.world;
    if (w.kValor[id] === 0 || !isFoeHero(w, id, dst) || w.alive[dst] === 0) return;
    const p = abil(w, id).passive;
    w.kValor[id] = 0;
    w.kHuntT[id] = p.every;
    stun(w, dst, p.stun);
    const s = toySupport(w, id, lvl(w, id, p.shield, p.shieldPerLevel));
    creditHealShield(m, id, addShield(w, id, s, p.duration));
    const f = nearestFriend(w, id, p.range);
    if (f >= 0) creditHealShield(m, id, addShield(w, f, s, p.duration));
  },
  incoming(m, id, _src, dmg) {
    const w = m.world;
    return w.kRT[id] > 0 ? applyBp(dmg, BP_ONE - abil(w, id).e.reduceBp) : dmg;
  },
  reset(w, id) {
    // Good Boy starts ready (match start and every respawn).
    w.kValor[id] = 1;
    w.kHuntT[id] = 0;
    w.kChain[id] = 0;
    w.kRT[id] = 0;
    w.kEmpower[id] = 0;
  },
  snapFx: (w, id) => (w.kRT[id] > 0 ? SNAP_FX.Form : 0),
  resource: (w, id) => (w.kValor[id] > 0 ? 0xff : 0),
};
