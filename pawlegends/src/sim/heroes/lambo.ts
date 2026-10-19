/**
 * Lambo, Tank (shelter champion, sim v9). Bespoke hooks: Brave With Friends (less damage taken with an allied hero
 * near), Big Hug's two shields, Belly Flop's landing ring and Tangled Lights' pull toward him.
 *
 * Kit arrays: `kStage` = 1 while a Belly Flop hop is in flight (the landing resolves in the first stepKit after the
 * dash ended, and only when Lambo is not disabled: a hop stopped by a stun lands nothing).
 */
import { EFFECTS } from '../../data/effects';
import { PROJECTILE_KIND } from '../../data/towers';
import { BP_ONE, applyBp, dist2, isqrt } from '../fixed';
import type { MatchHandle } from '../state';
import { ENTITY_CAP, FM, Kind, RANGE, type World } from '../world';
import { dealDamage } from '../combat/damage';
import { addShield, collect, dash, fireSkillshot, inRing, knockback, root, stun, ON_HIT } from '../effects';
import { disabled } from '../effects/status';
import { radiusOf } from '../units/kinds';
import { Aim, HALF_TURN, aimAngle, lvl, type HeroKit, type SlotAim } from './kit';
import { abil, type KitNumbers } from './talents';

const hits = new Int32Array(ENTITY_CAP);

function aim(a: KitNumbers, slot: number): SlotAim {
  switch (slot) {
    case 0:
      return { aim: Aim.Dir, reach: a.q.range, windup: 0, mobility: false };
    case 1:
      return { aim: Aim.Self, reach: 0, windup: 0, mobility: false };
    case 2:
      return { aim: Aim.Dir, reach: 0, windup: 0, mobility: true };
    default:
      return { aim: Aim.Self, reach: 0, windup: a.r.windup, mobility: false };
  }
}

/** Nearest living allied hero of `id` (not itself) within `range`, or −1. */
export function nearestAlly(w: World, id: number, range: number): number {
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

/** Belly Flop lands: a ring of damage and a stun around Lambo. */
function land(m: MatchHandle, id: number): void {
  const w = m.world;
  const e = abil(w, id).e;
  const hx = w.x[id];
  const hy = w.y[id];
  const n = collect(w, w.team[id], hits, (t, r) => inRing(hx, hy, e.radius, w.x[t], w.y[t], r));
  const dmg = lvl(w, id, e.dmg, e.dmgPerLevel);
  for (let i = 0; i < n; i++) {
    dealDamage(m, id, w.team[id], Kind.Hero, hits[i], dmg, 'ability');
    stun(w, hits[i], e.stun);
  }
}

/** Tangled Lights: pull every enemy hero in the ring toward Lambo (never past him), damage and root. */
function tangle(m: MatchHandle, id: number): number {
  const w = m.world;
  const r = abil(w, id).r;
  const lx = w.x[id];
  const ly = w.y[id];
  const n = collect(w, w.team[id], hits, (t, tr) => inRing(lx, ly, r.radius, w.x[t], w.y[t], tr), true);
  const dmg = lvl(w, id, r.dmg, r.dmgPerLevel);
  for (let i = 0; i < n; i++) {
    const e = hits[i];
    const ex = w.x[e];
    const ey = w.y[e];
    const d = isqrt(dist2(lx, ly, ex, ey));
    const pd = Math.min(r.pull, Math.max(0, d - radiusOf(w, id) - radiusOf(w, e) - EFFECTS.pullGap));
    // knockback pushes away from a point: the victim's position mirrored through Lambo pulls it toward him.
    if (pd > 0) knockback(m, e, 2 * ex - lx, 2 * ey - ly, pd, w.facing[id] + HALF_TURN);
    dealDamage(m, id, w.team[id], Kind.Hero, e, dmg, 'ability');
    // root does not cancel FM.Knock, so the pull still finishes.
    root(w, e, r.root);
  }
  return r.cooldown;
}

export const LAMBO_KIT: HeroKit = {
  aim,
  cast(m, id, slot, x, y) {
    const w = m.world;
    const a = abil(w, id);
    switch (slot) {
      case 0: {
        const q = a.q;
        fireSkillshot(w, id, {
          kind: PROJECTILE_KIND.tuna,
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
        return q.cooldown;
      }
      case 1: {
        const h = a.w;
        // Both shields are shares of Lambo's own max HP (the hug comes from the tank).
        addShield(w, id, applyBp(w.maxHp[id], h.selfBp), h.duration);
        const ally = nearestAlly(w, id, h.range);
        if (ally >= 0) addShield(w, ally, applyBp(w.maxHp[id], h.allyBp), h.duration);
        return h.cooldown;
      }
      case 2: {
        // A hop up to e.dash: an aimed point closer than that is where he lands.
        const to = x === w.x[id] && y === w.y[id] ? a.e.dash : Math.min(a.e.dash, isqrt(dist2(w.x[id], w.y[id], x, y)));
        dash(m, id, aimAngle(w, id, x, y), Math.max(1, to));
        w.kStage[id] = 1;
        return a.e.cooldown;
      }
      default:
        return tangle(m, id);
    }
  },
  stepKit(m, id) {
    const w = m.world;
    if (w.kStage[id] === 1 && w.fmKind[id] === FM.None) {
      w.kStage[id] = 0;
      if (!disabled(w, id)) land(m, id);
    }
  },
  incoming(m, id, _src, dmg) {
    const w = m.world;
    const p = abil(w, id).passive;
    return nearestAlly(w, id, p.allyRange) >= 0 ? applyBp(dmg, BP_ONE - p.reduceBp) : dmg;
  },
  reset(w, id) {
    w.kStage[id] = 0;
  },
};
