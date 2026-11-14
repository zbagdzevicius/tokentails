/**
 * Ziggy, Fighter (sim v29, original cat; build spec docs/plans/moba/ROSTER-V29.md §2.2): the dash skirmisher. Bespoke
 * hooks: Static Step (a dash charges his next basic), Zig (a dash that hits what it passes, recast twice in a window,
 * Clem's Paw Combo pattern), Spark Swipe (a stun ring after a short wind-up), Tail Flick (a hop with a shield) and
 * ZIGZAG STORM (untargetable, he strikes the enemy heroes round him one after another, beside each one in turn).
 *
 * Kit arrays: kStage Zig casts in the open window (0 closed); kWindow the window ticks; kChain the tick of the last
 * Zig; kEmpower 1 while a Zig dash is moving; kHuntT the Static Step window; kRT the storm strikes left; kCount the
 * ticks to the next strike; kValor the heroes struck (a bit per hero id); kHuntVictim the storm's first target.
 */
import { applyBp, dist2, iatan2, icos, idiv, isin, isqrt, TRIG_ONE } from '../fixed';
import type { MatchHandle } from '../state';
import { COOLDOWN_SLOTS, FM, G, Kind, RANGE, type World, MAX_ENTITIES, fmAdd, fmHas } from '../world';
import { dealDamage } from '../combat/damage';
import { addShield, blink, collect, dash, inRing, stun } from '../effects';
import { radiusOf, targetable } from '../units/kinds';
import { Aim, aimAngle, lvl, SNAP_FX, type HeroKit, type SlotAim } from './kit';
import { abil, type KitNumbers } from './talents';

const Q = 0;
const ZIG = 1;
const hits = new Int32Array(MAX_ENTITIES);

function aim(a: KitNumbers, slot: number): SlotAim {
  switch (slot) {
    case 0:
      return { aim: Aim.Dir, reach: 0, windup: 0, mobility: true };
    case 1:
      return { aim: Aim.Self, reach: 0, windup: a.w.windup, mobility: false };
    case 2:
      return { aim: Aim.Dir, reach: 0, windup: 0, mobility: true };
    default:
      return { aim: Aim.Unit, reach: a.r.reach, windup: a.r.windup, mobility: false };
  }
}

const bit = (e: number): number => 1 << (e - RANGE.heroes);

function castQ(m: MatchHandle, id: number, x: number, y: number): number {
  const w = m.world;
  const q = abil(w, id).q;
  const open = w.kStage[id] > 0 && w.kWindow[id] > 0;
  const stage = open ? w.kStage[id] + 1 : 1;
  dash(m, id, aimAngle(w, id, x, y), q.dash, q.speed);
  w.kEmpower[id] = ZIG;
  w.kHuntT[id] = abil(w, id).passive.window;
  w.kChain[id] = w.globals[G.Tick];
  if (stage >= 1 + q.recasts) {
    w.kStage[id] = 0;
    w.kWindow[id] = 0;
    return q.cooldown;
  }
  if (stage === 1) w.kWindow[id] = q.recastWindow;
  w.kStage[id] = stage;
  return 0;
}

/** The storm's next victim: the nearest enemy hero within range he has not struck, else the nearest struck one; −1. */
function nextVictim(w: World, id: number): number {
  const range = abil(w, id).r.range;
  const first = w.kHuntVictim[id];
  if (first >= 0 && (w.kValor[id] & bit(first)) === 0 && targetable(w, first, w.team[id])) return first;
  let fresh = -1;
  let freshD = 0;
  let again = -1;
  let againD = 0;
  for (let e = RANGE.heroes; e < RANGE.minions; e++) {
    if (w.kind[e] !== Kind.Hero || w.team[e] === w.team[id] || !targetable(w, e, w.team[id])) continue;
    const d = dist2(w.x[id], w.y[id], w.x[e], w.y[e]);
    const reach = range + radiusOf(w, e);
    if (d > reach * reach) continue;
    if ((w.kValor[id] & bit(e)) === 0) {
      if (fresh < 0 || d < freshD) {
        fresh = e;
        freshD = d;
      }
    } else if (again < 0 || d < againD) {
      again = e;
      againD = d;
    }
  }
  return fresh >= 0 ? fresh : again;
}

/** One storm strike: he appears beside the victim (on his side of it) and hits it. False when nobody is left. */
function strike(m: MatchHandle, id: number): boolean {
  const w = m.world;
  const r = abil(w, id).r;
  const e = nextVictim(w, id);
  if (e < 0) return false;
  const gap = radiusOf(w, id) + radiusOf(w, e);
  const dx = w.x[id] - w.x[e];
  const dy = w.y[id] - w.y[e];
  const d = isqrt(dx * dx + dy * dy);
  const a = d > 0 ? iatan2(dy, dx) : w.facing[id];
  const tx = w.x[e] + idiv(icos(a) * gap, TRIG_ONE);
  const ty = w.y[e] + idiv(isin(a) * gap, TRIG_ONE);
  blink(m, id, tx, ty, d + gap);
  w.facing[id] = iatan2(w.y[e] - w.y[id], w.x[e] - w.x[id]);
  let dmg = lvl(w, id, r.dmg, r.dmgPerLevel);
  if ((w.kValor[id] & bit(e)) !== 0) dmg = applyBp(dmg, r.repeatBp);
  w.kValor[id] |= bit(e);
  dealDamage(m, id, w.team[id], Kind.Hero, e, dmg, 'ability');
  return true;
}

function endStorm(w: World, id: number): void {
  w.kRT[id] = 0;
  w.kCount[id] = 0;
  w.kValor[id] = 0;
  w.kHuntVictim[id] = -1;
  w.untargT[id] = 0;
}

export const ZIGGY_KIT: HeroKit = {
  aim,
  recastReady: (w, id, slot) => slot === Q && w.kStage[id] > 0 && w.kWindow[id] > 0,
  cast(m, id, slot, x, y, target) {
    const w = m.world;
    const a = abil(w, id);
    switch (slot) {
      case 0:
        return castQ(m, id, x, y);
      case 1: {
        const p = a.w;
        const hx = w.x[id];
        const hy = w.y[id];
        const n = collect(w, w.team[id], hits, (e, r) => inRing(hx, hy, p.radius, w.x[e], w.y[e], r));
        const dmg = lvl(w, id, p.dmg, p.dmgPerLevel);
        for (let i = 0; i < n; i++) {
          const e = hits[i];
          dealDamage(m, id, w.team[id], Kind.Hero, e, dmg, 'ability');
          if (w.kind[e] === Kind.Hero) stun(w, e, p.stun);
        }
        return p.cooldown;
      }
      case 2: {
        const p = a.e;
        dash(m, id, aimAngle(w, id, x, y), p.dash);
        addShield(w, id, lvl(w, id, p.shield, p.shieldPerLevel), p.duration);
        w.kHuntT[id] = a.passive.window;
        return p.cooldown;
      }
      default: {
        const r = a.r;
        if (target < 0 || w.kind[target] !== Kind.Hero) return -1;
        w.kHuntVictim[id] = target;
        w.kValor[id] = 0;
        w.kRT[id] = r.strikes;
        w.kCount[id] = 0;
        w.untargT[id] = Math.max(w.untargT[id], r.strikes * r.gap + 1);
        m.events.push({ type: 'clip', tick: w.globals[G.Tick], id, what: 'zigzag' });
        if (!strike(m, id)) {
          endStorm(w, id);
          return r.cooldown;
        }
        w.kRT[id]--;
        w.kCount[id] = r.gap;
        if (w.kRT[id] === 0) endStorm(w, id);
        return r.cooldown;
      }
    }
  },
  stepKit(m, id) {
    const w = m.world;
    if (w.kWindow[id] > 0 && --w.kWindow[id] === 0 && w.kStage[id] > 0) {
      // Window closed before the last Zig: the cooldown counts from the last cast.
      const since = w.globals[G.Tick] - w.kChain[id];
      w.cooldowns[id * COOLDOWN_SLOTS + Q] = Math.max(0, abil(w, id).q.cooldown - since);
      w.kStage[id] = 0;
    }
    if (w.kHuntT[id] > 0) w.kHuntT[id]--;
    if (w.kEmpower[id] === ZIG && w.fmKind[id] === FM.None) w.kEmpower[id] = 0;
    if (w.kRT[id] > 0) {
      // A stun, a Nap or death ends the storm (no strike lands from a stunned Ziggy).
      if (w.alive[id] === 0 || w.stunT[id] > 0 || w.napT[id] > 0) {
        endStorm(w, id);
        return;
      }
      if (w.kCount[id] > 0 && --w.kCount[id] > 0) return;
      if (!strike(m, id)) {
        endStorm(w, id);
        return;
      }
      w.kRT[id]--;
      w.kCount[id] = abil(w, id).r.gap;
      if (w.kRT[id] === 0) endStorm(w, id);
    }
  },
  onDashTick(m, id) {
    const w = m.world;
    if (w.kEmpower[id] !== ZIG) return;
    const q = abil(w, id).q;
    const half = q.width >> 1;
    const hx = w.x[id];
    const hy = w.y[id];
    const n = collect(w, w.team[id], hits, (e, r) => !fmHas(w, id, e) && dist2(hx, hy, w.x[e], w.y[e]) <= (half + r) * (half + r));
    const dmg = lvl(w, id, q.dmg, q.dmgPerLevel);
    for (let i = 0; i < n; i++) {
      fmAdd(w, id, hits[i]);
      dealDamage(m, id, w.team[id], Kind.Hero, hits[i], dmg, 'ability');
    }
  },
  afterBasic(m, id, dst) {
    const w = m.world;
    if (w.kHuntT[id] === 0 || w.alive[dst] === 0) return;
    const p = abil(w, id).passive;
    w.kHuntT[id] = 0;
    dealDamage(m, id, w.team[id], Kind.Hero, dst, lvl(w, id, p.dmg, p.dmgPerLevel), 'ability');
  },
  reset(w, id) {
    w.kStage[id] = 0;
    w.kWindow[id] = 0;
    w.kChain[id] = 0;
    w.kEmpower[id] = 0;
    w.kHuntT[id] = 0;
    w.kRT[id] = 0;
    w.kCount[id] = 0;
    w.kValor[id] = 0;
    w.kHuntVictim[id] = -1;
  },
  /** The storm: no walking, no basic, no cast until the last strike. */
  busy: (w, id) => w.kRT[id] > 0,
  snapFx: (w, id) => (w.kRT[id] > 0 ? SNAP_FX.Form : 0),
  resource: (w, id) => (w.kHuntT[id] > 0 ? 0xff : 0),
};
