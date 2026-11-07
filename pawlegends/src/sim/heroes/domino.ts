/**
 * Domino, Mage (sim v15, original dog; build spec docs/plans/moba/DOGS-V15.md §1.3). Bespoke hooks: Spot On (each of
 * his ability hits on an enemy hero sticks a Spot on it; he deals more to a hero per Spot), Spot Shot, Splatter (one
 * delayed burst pulse), Big Shake (a knockback ring that shakes off his slows) and CONNECT THE DOTS! (links the
 * Spotted enemy heroes in range, nearest first, roots and hurts them by their Spots; others on a line take part and
 * are slowed; the Spots are used up).
 *
 * Spots live on the VICTIM in the World arrays `dotN` / `dotT` (sim v15), apart from Duchess's `mkStack`. They count
 * down in `tickStatus` and fall off when the victim dies (`clearStatus`) or when Domino dies (`reset`). Only one
 * Domino can hit a given team (picks never repeat a hero within a team), so two never share a victim.
 *
 * A dead source's damage (a Splatter that pulses after he died) adds no Spot: `afterDeal` checks he is alive.
 *
 * Kit arrays: kEmpower the in-kit guard (R damage adds no Spot).
 */
import { PROJECTILE_KIND } from '../../data/towers';
import { BP_ONE, applyBp, dist2, idiv } from '../fixed';
import type { MatchHandle } from '../state';
import { ENTITY_CAP, G, Kind, RANGE, type World } from '../world';
import { dealDamage } from '../combat/damage';
import { collect, fireSkillshot, inLine, inRing, knockback, root, slow, spawnBurst } from '../effects';
import { Aim, aimAngle, lvl, type HeroKit, type SlotAim } from './kit';
import { abil, type KitNumbers } from './talents';

const RESOLVING = 1;
const hits = new Int32Array(ENTITY_CAP);
/** The last CONNECT THE DOTS! path (hero ids, in link order; `pathLen` used). Read by tests through `dotsPath`. */
const path = new Int32Array(8);
let pathLen = 0;
/** Link points (Domino, then each path hero), captured before anyone moves. */
const sx = new Int32Array(9);
const sy = new Int32Array(9);

function aim(a: KitNumbers, slot: number): SlotAim {
  switch (slot) {
    case 0:
      return { aim: Aim.Dir, reach: 0, windup: 0, mobility: false };
    case 1:
      return { aim: Aim.Point, reach: a.w.range, windup: 0, mobility: false };
    case 2:
      return { aim: Aim.Self, reach: 0, windup: 0, mobility: false };
    default:
      return { aim: Aim.Self, reach: 0, windup: a.r.windup, mobility: false };
  }
}

const isFoeHero = (w: World, id: number, e: number): boolean =>
  e >= RANGE.heroes && e < RANGE.minions && w.kind[e] === Kind.Hero && w.team[e] !== w.team[id];

/** The last CONNECT THE DOTS! path, in link order (a copy). */
export const dotsPath = (): number[] => Array.from(path.subarray(0, pathLen));

/** Clear the Spots on hero `e`. */
function clearDots(w: World, e: number): void {
  w.dotN[e] = 0;
  w.dotT[e] = 0;
}

/**
 * The path: from Domino, repeatedly the unvisited Spotted enemy hero nearest the last link point (ties: lower id), each
 * within `range` of Domino. With no Spotted hero in range, the nearest enemy hero in range alone. Returns the length.
 */
function buildPath(w: World, id: number, range: number): number {
  const hx = w.x[id];
  const hy = w.y[id];
  const n = collect(w, w.team[id], hits, (e, r) => w.kind[e] === Kind.Hero && inRing(hx, hy, range, w.x[e], w.y[e], r), true);
  pathLen = 0;
  let cx = hx;
  let cy = hy;
  for (;;) {
    let best = -1;
    let bestD = 0;
    for (let i = 0; i < n; i++) {
      const e = hits[i];
      if (w.dotN[e] <= 0) continue;
      let used = false;
      for (let k = 0; k < pathLen; k++) if (path[k] === e) used = true;
      if (used) continue;
      const d = dist2(cx, cy, w.x[e], w.y[e]);
      if (best < 0 || d < bestD) {
        best = e;
        bestD = d;
      }
    }
    if (best < 0 || pathLen >= path.length) break;
    path[pathLen++] = best;
    cx = w.x[best];
    cy = w.y[best];
  }
  if (pathLen > 0) return pathLen;
  let best = -1;
  let bestD = 0;
  for (let i = 0; i < n; i++) {
    const d = dist2(hx, hy, w.x[hits[i]], w.y[hits[i]]);
    if (best < 0 || d < bestD) {
      best = hits[i];
      bestD = d;
    }
  }
  if (best >= 0) path[pathLen++] = best;
  return pathLen;
}

/** CONNECT THE DOTS! Returns the cooldown, or −1 when no enemy hero is in range (no cooldown spent). */
function connect(m: MatchHandle, id: number): number {
  const w = m.world;
  const r = abil(w, id).r;
  const len = buildPath(w, id, r.range);
  if (len === 0) return -1;
  const base = lvl(w, id, r.dmg, r.dmgPerLevel);
  // Link segments, captured before anyone moves: Domino → T1 → T2 → …
  sx[0] = w.x[id];
  sy[0] = w.y[id];
  for (let k = 0; k < len; k++) {
    sx[k + 1] = w.x[path[k]];
    sy[k + 1] = w.y[path[k]];
  }
  w.kEmpower[id] = RESOLVING;
  for (let k = 0; k < len; k++) {
    const t = path[k];
    const spots = w.dotN[t];
    dealDamage(m, id, w.team[id], Kind.Hero, t, base + r.perDot * spots, 'ability');
    root(w, t, r.root + r.rootPerDot * spots);
  }
  // Other enemy heroes on a line: part of the base damage and a slow, once each.
  let lo = 0;
  for (let k = 0; k < len; k++) if (path[k] < 0x20) lo |= 1 << path[k];
  const half = r.width >> 1;
  const part = applyBp(base, r.lineBp);
  for (let k = 0; k < len; k++) {
    const ax = sx[k];
    const ay = sy[k];
    const bx = sx[k + 1];
    const by = sy[k + 1];
    const n = collect(w, w.team[id], hits, (e, er) => e < 0x20 && (lo & (1 << e)) === 0 && inLine(ax, ay, bx, by, half, w.x[e], w.y[e], er), true);
    for (let i = 0; i < n; i++) {
      const e = hits[i];
      lo |= 1 << e;
      dealDamage(m, id, w.team[id], Kind.Hero, e, part, 'ability');
      slow(w, e, r.slowBp, r.slow);
    }
  }
  w.kEmpower[id] = 0;
  for (let k = 0; k < len; k++) clearDots(w, path[k]);
  if (len >= 2) m.events.push({ type: 'clip', tick: w.globals[G.Tick], id, what: 'dots' });
  return r.cooldown;
}

export const DOMINO_KIT: HeroKit = {
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
        return p < 0 ? -1 : q.cooldown;
      }
      case 1: {
        const p = a.w;
        // One pulse after the wind-up (every = 0); the zone is also render's telegraph ring.
        spawnBurst(w, w.team[id], id, x, y, p.radius, p.windup, p.windup + 1, lvl(w, id, p.dmg, p.dmgPerLevel), 0, 0, p.slowBp, p.slow);
        return p.cooldown;
      }
      case 2: {
        const e = a.e;
        const hx = w.x[id];
        const hy = w.y[id];
        const n = collect(w, w.team[id], hits, (t, r) => inRing(hx, hy, e.radius, w.x[t], w.y[t], r));
        const dmg = lvl(w, id, e.dmg, e.dmgPerLevel);
        for (let i = 0; i < n; i++) {
          const t = hits[i];
          dealDamage(m, id, w.team[id], Kind.Hero, t, dmg, 'ability');
          knockback(m, t, hx, hy, e.push, w.facing[id]);
        }
        // Slows only (not a cleanse: stuns and fears stop the cast anyway).
        w.slowT[id] = 0;
        w.slowBp[id] = 0;
        return e.cooldown;
      }
      default:
        return connect(m, id);
    }
  },
  outgoing(m, id, dst, raw) {
    const w = m.world;
    if (!isFoeHero(w, id, dst) || w.dotN[dst] === 0) return raw;
    return idiv(raw * (BP_ONE + abil(w, id).passive.perDotBp * w.dotN[dst]), BP_ONE);
  },
  afterDeal(m, id, dst, _dmg, kind) {
    const w = m.world;
    if (kind !== 'ability' || w.kEmpower[id] !== 0 || w.alive[id] === 0 || !isFoeHero(w, id, dst)) return;
    const p = abil(w, id).passive;
    w.dotN[dst] = Math.min(p.max, w.dotN[dst] + 1);
    w.dotT[dst] = p.ttl;
  },
  reset(w, id) {
    w.kEmpower[id] = 0;
    // His Spots fall off when he goes down.
    for (let e = RANGE.heroes; e < RANGE.minions; e++) if (isFoeHero(w, id, e)) clearDots(w, e);
  },
  resource: (w, id) => {
    let s = 0;
    for (let e = RANGE.heroes; e < RANGE.minions; e++) if (isFoeHero(w, id, e)) s += w.dotN[e];
    return Math.min(0xff, s);
  },
};
