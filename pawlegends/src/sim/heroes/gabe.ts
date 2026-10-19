/**
 * Gabė, Support (shelter champion, sim v9). Bespoke hooks: Heart Breeze (her basic hits on heroes heal the weakest
 * allied hero near her), the Heart Balloon burst (damage and heal in one pop), Wing Wrap's ally pick, Chase the
 * Wind's haste along the path, and Under Her Spell's charm.
 *
 * Kit arrays: none (every timer lives in the shared status arrays and the burst zone).
 */
import { dist2, idiv, isqrt } from '../fixed';
import type { MatchHandle } from '../state';
import { ENTITY_CAP, Kind, RANGE, type World } from '../world';
import { addShield, charm, collect, dash, haste, heal, inCone, slow, spawnBurst } from '../effects';
import { Aim, aimAngle, lvl, type HeroKit, type SlotAim } from './kit';
import { abil, type KitNumbers } from './talents';

const hits = new Int32Array(ENTITY_CAP);

function aim(a: KitNumbers, slot: number): SlotAim {
  switch (slot) {
    case 0:
      return { aim: Aim.Point, reach: a.q.range, windup: 0, mobility: false };
    case 1:
      // Reach 0: cast where she stands; cast() clamps the point to the range and picks the ally.
      return { aim: Aim.Point, reach: 0, windup: 0, mobility: false };
    case 2:
      return { aim: Aim.Dir, reach: 0, windup: 0, mobility: true };
    default:
      return { aim: Aim.Dir, reach: 0, windup: a.r.windup, mobility: false };
  }
}

const alliedHero = (w: World, id: number, a: number): boolean => w.alive[a] === 1 && w.kind[a] === Kind.Hero && w.team[a] === w.team[id];

/** The allied hero (Gabė included) with the lowest HP share within `range` of her; ties: lowest id. */
export function weakestAlly(w: World, id: number, range: number): number {
  let best = -1;
  for (let a = RANGE.heroes; a < RANGE.minions; a++) {
    if (!alliedHero(w, id, a)) continue;
    if (dist2(w.x[id], w.y[id], w.x[a], w.y[a]) > range * range) continue;
    // hp[a] / maxHp[a] < hp[best] / maxHp[best], cross-multiplied.
    if (best < 0 || w.hp[a] * w.maxHp[best] < w.hp[best] * w.maxHp[a]) best = a;
  }
  return best;
}

/** Wing Wrap's target: the allied hero (not Gabė) nearest (px, py) within `pick` of it and `range` of her, else Gabė. */
export function wrapTarget(w: World, id: number, px: number, py: number, range: number, pick: number): number {
  let best = id;
  let bestD = 0;
  for (let a = RANGE.heroes; a < RANGE.minions; a++) {
    if (a === id || !alliedHero(w, id, a)) continue;
    if (dist2(w.x[id], w.y[id], w.x[a], w.y[a]) > range * range) continue;
    const d = dist2(px, py, w.x[a], w.y[a]);
    if (d > pick * pick) continue;
    if (best === id || d < bestD) {
      best = a;
      bestD = d;
    }
  }
  return best;
}

function wingWrap(m: MatchHandle, id: number, x: number, y: number): number {
  const w = m.world;
  const p = abil(w, id).w;
  let px = x;
  let py = y;
  const dx = x - w.x[id];
  const dy = y - w.y[id];
  const d = isqrt(dx * dx + dy * dy);
  if (d > p.range) {
    px = w.x[id] + idiv(dx * p.range, d);
    py = w.y[id] + idiv(dy * p.range, d);
  }
  const t = wrapTarget(w, id, px, py, p.range, p.pickRadius);
  addShield(w, t, lvl(w, id, p.shield, p.shieldPerLevel), p.duration);
  haste(w, t, p.hasteBp, p.haste);
  return p.cooldown;
}

export const GABE_KIT: HeroKit = {
  aim,
  cast(m, id, slot, x, y) {
    const w = m.world;
    const a = abil(w, id);
    switch (slot) {
      case 0: {
        const q = a.q;
        const z = spawnBurst(w, w.team[id], id, x, y, q.radius, q.arm, q.arm + 1, lvl(w, id, q.dmg, q.dmgPerLevel), lvl(w, id, q.heal, q.healPerLevel), 0, 0, 0);
        return z < 0 ? -1 : q.cooldown;
      }
      case 1:
        return wingWrap(m, id, x, y);
      case 2:
        dash(m, id, aimAngle(w, id, x, y), a.e.dash);
        return a.e.cooldown;
      default: {
        const r = a.r;
        const gx = w.x[id];
        const gy = w.y[id];
        const dir = aimAngle(w, id, x, y);
        const n = collect(w, w.team[id], hits, (e, er) => inCone(gx, gy, dir, r.range, r.arc, w.x[e], w.y[e], er), true);
        for (let i = 0; i < n; i++) {
          charm(w, hits[i], r.charm, id);
          slow(w, hits[i], r.slowBp, r.charm);
        }
        return r.cooldown;
      }
    }
  },
  onDashTick(m, id) {
    const w = m.world;
    const e = abil(w, id).e;
    for (let a = RANGE.heroes; a < RANGE.minions; a++) {
      if (a === id || !alliedHero(w, id, a)) continue;
      if (dist2(w.x[id], w.y[id], w.x[a], w.y[a]) <= e.touch * e.touch) haste(w, a, e.hasteBp, e.haste);
    }
  },
  afterDeal(m, id, dst, _dmg, kind) {
    const w = m.world;
    if (kind !== 'basic' || w.kind[dst] !== Kind.Hero) return;
    const p = abil(w, id).passive;
    const t = weakestAlly(w, id, p.range);
    if (t >= 0) heal(w, t, lvl(w, id, p.heal, p.healPerLevel));
  },
};
