/**
 * Howler, Fighter (sim v14, original dog; build spec docs/plans/moba/DOGS-V13.md §1.5). Bespoke hooks: Zoomie Brain
 * (after any ability his next basic hits harder and slows), AWOO's cone, Derp Dash's hits along the path, Talk Back
 * (tougher; each enemy hero that hits him is feared once; bots stop starting basics on him: `deterBasics`) and THE
 * SCREAM (a cone that knocks back, then fears).
 *
 * THE SCREAM's order is settled: `fear` interrupts but leaves a knockback in flight (effects/status.ts `interrupt`),
 * and fearT ticks during the knockback's EFFECTS.knockbackTicks, so the fear is given knockbackTicks extra: the victim
 * travels the full push, then runs for r.fear ticks.
 *
 * Kit arrays: kEmpower Zoomie Brain ticks; kRT Talk Back ticks; kCount Talk Back fear bitmask (bit = enemy hero id;
 * hero ids are < 32); kStage 1 = Derp Dash in flight.
 */
import { EFFECTS } from '../../data/effects';
import { applyBp, BP_ONE, dist2 } from '../fixed';
import { ENTITY_CAP, FM, G, Kind, RANGE, maskHas } from '../world';
import { dealDamage } from '../combat/damage';
import { collect, dash, fear, haste, inCone, knockback, slow } from '../effects';
import { Aim, aimAngle, lvl, type HeroKit, type SlotAim } from './kit';
import { abil, type KitNumbers } from './talents';

const hits = new Int32Array(ENTITY_CAP);

function aim(a: KitNumbers, slot: number): SlotAim {
  switch (slot) {
    case 0:
      return { aim: Aim.Dir, reach: 0, windup: 0, mobility: false };
    case 1:
      return { aim: Aim.Dir, reach: 0, windup: 0, mobility: true };
    case 2:
      return { aim: Aim.Self, reach: 0, windup: 0, mobility: false };
    default:
      return { aim: Aim.Dir, reach: 0, windup: a.r.windup, mobility: false };
  }
}

export const HOWLER_KIT: HeroKit = {
  aim,
  cast(m, id, slot, x, y) {
    const w = m.world;
    const a = abil(w, id);
    // Zoomie Brain: any ability arms the next basic.
    w.kEmpower[id] = a.passive.window;
    const hx = w.x[id];
    const hy = w.y[id];
    const dir = aimAngle(w, id, x, y);
    switch (slot) {
      case 0: {
        const q = a.q;
        const n = collect(w, w.team[id], hits, (e, r) => inCone(hx, hy, dir, q.range, q.arc, w.x[e], w.y[e], r));
        const dmg = lvl(w, id, q.dmg, q.dmgPerLevel);
        for (let i = 0; i < n; i++) {
          dealDamage(m, id, w.team[id], Kind.Hero, hits[i], dmg, 'ability');
          slow(w, hits[i], q.slowBp, q.slow);
        }
        return q.cooldown;
      }
      case 1:
        dash(m, id, dir, a.w.dash);
        w.kStage[id] = 1;
        return a.w.cooldown;
      case 2:
        w.kRT[id] = a.e.duration;
        w.kCount[id] = 0;
        return a.e.cooldown;
      default: {
        const r = a.r;
        const n = collect(w, w.team[id], hits, (e, er) => inCone(hx, hy, dir, r.range, r.arc, w.x[e], w.y[e], er), true);
        const dmg = lvl(w, id, r.dmg, r.dmgPerLevel);
        for (let i = 0; i < n; i++) {
          const e = hits[i];
          dealDamage(m, id, w.team[id], Kind.Hero, e, dmg, 'ability');
          knockback(m, e, hx, hy, r.push, dir);
          fear(w, e, r.fear + EFFECTS.knockbackTicks, hx, hy);
        }
        m.events.push({ type: 'clip', tick: w.globals[G.Tick], id, what: 'scream' });
        return r.cooldown;
      }
    }
  },
  stepKit(m, id) {
    const w = m.world;
    if (w.kEmpower[id] > 0) w.kEmpower[id]--;
    if (w.kRT[id] > 0) w.kRT[id]--;
    if (w.kStage[id] === 1 && (w.fmKind[id] === FM.None || w.napT[id] > 0)) {
      w.kStage[id] = 0;
      const p = abil(w, id).w;
      haste(w, id, p.hasteBp, p.haste);
    }
  },
  onDashTick(m, id) {
    const w = m.world;
    if (w.kStage[id] !== 1) return;
    const p = abil(w, id).w;
    const half = p.width >> 1;
    const n = collect(w, w.team[id], hits, (e, r) => !maskHas(w.fmHitLo[id], w.fmHitHi[id], e) && dist2(w.x[id], w.y[id], w.x[e], w.y[e]) <= (half + r) * (half + r));
    const dmg = lvl(w, id, p.dmg, p.dmgPerLevel);
    for (let i = 0; i < n; i++) {
      const e = hits[i];
      if (e < 0x20) w.fmHitLo[id] |= 1 << e;
      else w.fmHitHi[id] |= 1 << (e - 0x20);
      dealDamage(m, id, w.team[id], Kind.Hero, e, dmg, 'ability');
      if ((p.slowBp ?? 0) > 0) slow(w, e, p.slowBp, p.slow);
    }
  },
  basic(m, id, dst, dmg) {
    const w = m.world;
    if (w.kEmpower[id] === 0) return false;
    const p = abil(w, id).passive;
    w.kEmpower[id] = 0;
    dealDamage(m, id, w.team[id], Kind.Hero, dst, applyBp(dmg, p.bonusBp), 'basic');
    slow(w, dst, p.slowBp, p.slow);
    return true;
  },
  incoming(m, id, src, dmg) {
    const w = m.world;
    if (w.kRT[id] === 0) return dmg;
    const e = abil(w, id).e;
    if (src >= 0 && src < RANGE.minions && w.kind[src] === Kind.Hero && w.team[src] !== w.team[id] && (w.kCount[id] & (1 << src)) === 0) {
      w.kCount[id] |= 1 << src;
      fear(w, src, e.fear, w.x[id], w.y[id]);
    }
    return applyBp(dmg, BP_ONE - e.reduceBp);
  },
  deterBasics: (w, id) => w.kRT[id] > 0,
  reset(w, id) {
    w.kEmpower[id] = 0;
    w.kRT[id] = 0;
    w.kCount[id] = 0;
    w.kStage[id] = 0;
  },
  resource: (w, id) => (w.kEmpower[id] > 0 ? 0xff : 0),
};
