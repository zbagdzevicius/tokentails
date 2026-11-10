/**
 * Chili, Marksman (sim v14, original dog; build spec docs/plans/moba/DOGS-V13.md §1.4). Bespoke hooks: Small Dog
 * Syndrome (Rage from enemy-hero damage, at most once a tick, and from Yaps that hit a hero; each Rage is attack speed),
 * Yap Yap Yap's three queued shots, Tiny Zoomies, Purse Mode (untargetable and `busy` in the bag, a slow on the way
 * out) and BIG DOG ENERGY (Rage locked full, +damage on heroes, basics splash onto at most two heroes or minions).
 *
 * Kit arrays: kValor Rage (0..max); kHuntT Rage decay timer; kWAge the tick of the last hit-Rage gain; kStage yaps left
 * to fire; kWindow ticks to the next yap; kFoe the yap angle; kRT purse ticks; kWT BIG DOG ticks.
 */
import { PROJECTILE_KIND } from '../../data/towers';
import { BP_ONE, applyBp, dist2, idiv } from '../fixed';
import type { MatchHandle } from '../state';
import { G, Kind, RANGE, type World, MAX_ENTITIES } from '../world';
import { dealDamage } from '../combat/damage';
import { attackSpeed, cleanse, collect, dash, fireSkillshot, haste, healOverTime, inRing, slow } from '../effects';
import { disabled } from '../effects/status';
import { Aim, aimAngle, lvl, SNAP_FX, type HeroKit, type SlotAim } from './kit';
import { abil, type KitNumbers } from './talents';
import { cancelSwing } from '../combat/swing';

const hits = new Int32Array(MAX_ENTITIES);
/** True while a BIG DOG splash deals its damage: afterDeal then knows an ability hit is not a yap. */
let splashing = false;

function aim(_a: KitNumbers, slot: number): SlotAim {
  switch (slot) {
    case 0:
      return { aim: Aim.Dir, reach: 0, windup: 0, mobility: false };
    case 1:
      return { aim: Aim.Dir, reach: 0, windup: 0, mobility: true };
    default:
      return { aim: Aim.Self, reach: 0, windup: 0, mobility: false };
  }
}

/** Add `n` Rage (capped), restart the decay window and refresh the attack-speed buff. */
export function rage(w: World, id: number, n: number): void {
  const p = abil(w, id).passive;
  w.kValor[id] = Math.min(p.max, w.kValor[id] + n);
  w.kHuntT[id] = p.window;
  attackSpeed(w, id, w.kValor[id] * p.attackSpeedBpPer, p.window);
}

/** One yap along `angle`. */
function yap(w: World, id: number, angle: number): void {
  const q = abil(w, id).q;
  fireSkillshot(w, id, {
    kind: PROJECTILE_KIND.yap,
    angle,
    speed: q.speed,
    range: q.range,
    radius: q.width >> 1,
    dmg: lvl(w, id, q.dmg, q.dmgPerLevel),
    flags: 0,
  });
}

/** Purse Mode ends: every enemy hero within the radius is slowed (no fear: it is a slow ring). */
function popOut(w: World, id: number): void {
  const e = abil(w, id).e;
  const hx = w.x[id];
  const hy = w.y[id];
  const n = collect(w, w.team[id], hits, (t, r) => inRing(hx, hy, e.radius, w.x[t], w.y[t], r), true);
  for (let i = 0; i < n; i++) slow(w, hits[i], e.slowBp, e.slow);
}

/** BIG DOG splash: up to splashMax enemy heroes or minions within `splash` of `dst` (nearest first, ties lowest id). */
function splash(m: MatchHandle, id: number, dst: number, dmg: number): void {
  const w = m.world;
  const r = abil(w, id).r;
  const cx = w.x[dst];
  const cy = w.y[dst];
  let n = collect(w, w.team[id], hits, (e, er) => e !== dst && e < RANGE.towers && inRing(cx, cy, r.splash, w.x[e], w.y[e], er));
  // collect is ascending id: a stable insertion sort by distance keeps the lowest id first on a tie.
  for (let i = 1; i < n; i++) {
    const v = hits[i];
    const d = dist2(cx, cy, w.x[v], w.y[v]);
    let j = i;
    while (j > 0 && dist2(cx, cy, w.x[hits[j - 1]], w.y[hits[j - 1]]) > d) {
      hits[j] = hits[j - 1];
      j--;
    }
    hits[j] = v;
  }
  n = Math.min(n, r.splashMax);
  const part = applyBp(dmg, r.splashBp);
  splashing = true;
  for (let i = 0; i < n; i++) dealDamage(m, id, w.team[id], Kind.Hero, hits[i], part, 'ability');
  splashing = false;
}

export const CHILI_KIT: HeroKit = {
  aim,
  cast(m, id, slot, x, y) {
    const w = m.world;
    const a = abil(w, id);
    switch (slot) {
      case 0: {
        const dir = aimAngle(w, id, x, y);
        yap(w, id, dir);
        w.kStage[id] = a.q.count - 1;
        w.kWindow[id] = a.q.gap;
        w.kFoe[id] = dir;
        return a.q.cooldown;
      }
      case 1: {
        const p = a.w;
        dash(m, id, aimAngle(w, id, x, y), p.dash);
        haste(w, id, p.hasteBp, p.haste);
        rage(w, id, p.rage);
        return p.cooldown;
      }
      case 2: {
        const e = a.e;
        w.untargT[id] = Math.max(w.untargT[id], e.duration);
        healOverTime(w, id, idiv(w.maxHp[id] * e.healBp, BP_ONE), e.duration);
        w.kRT[id] = e.duration;
        // Into the bag: the yap queue and any swing stop.
        w.kStage[id] = 0;
        cancelSwing(w, id);
        return e.cooldown;
      }
      default: {
        const r = a.r;
        cleanse(w, id, r.immune);
        w.kWT[id] = r.duration;
        rage(w, id, a.passive.max);
        m.events.push({ type: 'clip', tick: w.globals[G.Tick], id, what: 'bigdog' });
        return r.cooldown;
      }
    }
  },
  stepKit(m, id) {
    const w = m.world;
    const a = abil(w, id);
    if (w.kWT[id] > 0) {
      w.kWT[id]--;
      // Rage stays full for the whole BIG DOG ENERGY.
      if (w.kHuntT[id] < a.passive.window || w.kValor[id] < a.passive.max) rage(w, id, a.passive.max);
    }
    if (w.kHuntT[id] > 0 && --w.kHuntT[id] === 0) w.kValor[id] = 0;
    if (w.kRT[id] > 0 && --w.kRT[id] === 0) popOut(w, id);
    if (w.kStage[id] > 0) {
      // The Nap trip home or hard CC drops the rest of the queue.
      if (w.napT[id] > 0 || disabled(w, id)) w.kStage[id] = 0;
      else if (--w.kWindow[id] <= 0) {
        yap(w, id, w.kFoe[id]);
        w.kStage[id]--;
        w.kWindow[id] = a.q.gap;
      }
    }
  },
  incoming(m, id, src, dmg) {
    const w = m.world;
    const tick = w.globals[G.Tick];
    // A burst counts once: at most one Rage a tick from damage.
    if (src >= 0 && src < RANGE.minions && w.kind[src] === Kind.Hero && w.team[src] !== w.team[id] && w.kWAge[id] !== tick) {
      w.kWAge[id] = tick;
      rage(w, id, 1);
    }
    return dmg;
  },
  outgoing(m, id, dst, raw) {
    const w = m.world;
    return w.kWT[id] > 0 && w.kind[dst] === Kind.Hero ? applyBp(raw, abil(w, id).r.bonusBp) : raw;
  },
  afterDeal(m, id, dst, dmg, kind) {
    const w = m.world;
    if (kind === 'basic') {
      if (w.kWT[id] > 0) splash(m, id, dst, dmg);
      return;
    }
    // A yap (his only other ability damage; the splash is flagged) on an enemy hero: +1 Rage.
    if (kind === 'ability' && !splashing && w.kind[dst] === Kind.Hero && w.team[dst] !== w.team[id]) rage(w, id, 1);
  },
  busy: (w, id) => w.kRT[id] > 0,
  reset(w, id) {
    w.kValor[id] = 0;
    w.kHuntT[id] = 0;
    w.kWAge[id] = -1;
    w.kStage[id] = 0;
    w.kWindow[id] = 0;
    w.kFoe[id] = -1;
    w.kRT[id] = 0;
    w.kWT[id] = 0;
  },
  snapFx: (w, id) => (w.kRT[id] > 0 || w.kWT[id] > 0 ? SNAP_FX.Form : 0),
  // A full bar (0xff) at max Rage.
  resource: (w, id) => idiv(w.kValor[id] * 0xff, abil(w, id).passive.max),
};
