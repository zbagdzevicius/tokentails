/**
 * Barkula, Mage (sim v31, original dog; build spec docs/plans/moba/ROSTER-V31.md §2.3): the drain battle mage. Bespoke
 * hooks: Night Thirst (his ability damage heals him), Bat Bite (a stop-at-first-unit shot), Bat Swarm (a pulsing ring
 * of bats round him while he walks faster), Mist Form (a short untargetable dash-walk that shakes off slows) and BLOOD
 * MOON (marks and slows the enemy heroes round him; when the marks pop, every marked hero still near him is hurt and he
 * drinks more of it).
 *
 * Kit arrays: kRT Bat Swarm ticks left, kCount ticks to its next pulse; kWT RED MOON mark ticks left; kValor the
 * marked heroes (a bit per hero id, heroes are ids 0..9); kEmpower the in-kit guard while RED MOON pops (its own
 * heal rate).
 */
import { PROJECTILE_KIND } from '../../data/towers';
import { applyBp, dist2 } from '../fixed';
import type { MatchHandle } from '../state';
import { G, Kind, RANGE, MAX_ENTITIES } from '../world';
import { dealDamage } from '../combat/damage';
import { collect, fireSkillshot, haste, heal, inRing, slow } from '../effects';
import { creditHealShield } from '../effects/heal';
import { radiusOf } from '../units/kinds';
import { Aim, aimAngle, lvl, SNAP_FX, type HeroKit, type SlotAim } from './kit';
import { abil, type KitNumbers } from './talents';

const POPPING = 1;
const hits = new Int32Array(MAX_ENTITIES);

function aim(a: KitNumbers, slot: number): SlotAim {
  switch (slot) {
    case 0:
      return { aim: Aim.Dir, reach: 0, windup: 0, mobility: false };
    case 1:
      return { aim: Aim.Self, reach: 0, windup: 0, mobility: false };
    case 2:
      return { aim: Aim.Self, reach: 0, windup: 0, mobility: false };
    default:
      return { aim: Aim.Self, reach: 0, windup: a.r.windup, mobility: false };
  }
}

const bit = (e: number): number => 1 << (e - RANGE.heroes);

/** One Bat Swarm pulse round him. */
function swarm(m: MatchHandle, id: number): void {
  const w = m.world;
  const p = abil(w, id).w;
  const hx = w.x[id];
  const hy = w.y[id];
  const n = collect(w, w.team[id], hits, (e, r) => inRing(hx, hy, p.radius, w.x[e], w.y[e], r));
  const dmg = lvl(w, id, p.dmg, p.dmgPerLevel);
  for (let i = 0; i < n; i++) dealDamage(m, id, w.team[id], Kind.Hero, hits[i], dmg, 'ability');
}

function redMoon(m: MatchHandle, id: number): number {
  const w = m.world;
  const r = abil(w, id).r;
  const hx = w.x[id];
  const hy = w.y[id];
  const n = collect(w, w.team[id], hits, (e, er) => inRing(hx, hy, r.radius, w.x[e], w.y[e], er), true);
  let mask = 0;
  for (let i = 0; i < n; i++) {
    const e = hits[i];
    slow(w, e, r.slowBp, r.slow);
    mask |= bit(e);
  }
  w.kValor[id] = mask;
  w.kWT[id] = mask !== 0 ? r.slow : 0;
  m.events.push({ type: 'clip', tick: w.globals[G.Tick], id, what: 'redmoon' });
  return r.cooldown;
}

/** The marks pop: every marked hero still within popRadius of him is hurt; he drinks healBp more of it. */
function pop(m: MatchHandle, id: number): void {
  const w = m.world;
  const r = abil(w, id).r;
  const mask = w.kValor[id];
  w.kValor[id] = 0;
  if (w.alive[id] === 0) return;
  const dmg = lvl(w, id, r.dmg, r.dmgPerLevel);
  let drunk = 0;
  w.kEmpower[id] = POPPING;
  for (let e = RANGE.heroes; e < RANGE.minions; e++) {
    if ((mask & bit(e)) === 0 || w.alive[e] === 0) continue;
    const reach = r.popRadius + radiusOf(w, e);
    if (dist2(w.x[id], w.y[id], w.x[e], w.y[e]) > reach * reach) continue;
    drunk += dealDamage(m, id, w.team[id], Kind.Hero, e, dmg, 'ability');
    m.events.push({ type: 'clip', tick: w.globals[G.Tick], id: e, what: 'bitten' });
  }
  w.kEmpower[id] = 0;
  if (drunk > 0) creditHealShield(m, id, heal(w, id, applyBp(drunk, abil(w, id).passive.heroBp + r.drinkBp)));
}

export const BARKULA_KIT: HeroKit = {
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
        w.kRT[id] = p.duration;
        w.kCount[id] = 0;
        haste(w, id, p.hasteBp, p.haste);
        return p.cooldown;
      }
      case 2: {
        const e = a.e;
        w.slowT[id] = 0;
        w.slowBp[id] = 0;
        w.untargT[id] = Math.max(w.untargT[id], e.untargetable);
        haste(w, id, e.hasteBp, e.haste);
        return e.cooldown;
      }
      default:
        return redMoon(m, id);
    }
  },
  stepKit(m, id) {
    const w = m.world;
    if (w.kRT[id] > 0) {
      if (w.alive[id] === 0) w.kRT[id] = 0;
      else {
        if (w.kCount[id] === 0) {
          swarm(m, id);
          w.kCount[id] = abil(w, id).w.every;
        }
        w.kCount[id]--;
        w.kRT[id]--;
      }
    }
    if (w.kWT[id] > 0 && --w.kWT[id] === 0) pop(m, id);
  },
  afterDeal(m, id, dst, dmg, kind) {
    const w = m.world;
    // Night Thirst: his ability damage heals him (RED MOON's pop heals at its own rate, in pop()).
    if (kind !== 'ability' || dmg <= 0 || w.kEmpower[id] === POPPING || w.alive[id] === 0) return;
    const p = abil(w, id).passive;
    const hero = dst >= RANGE.heroes && dst < RANGE.minions && w.kind[dst] === Kind.Hero && w.team[dst] !== w.team[id];
    creditHealShield(m, id, heal(w, id, applyBp(dmg, hero ? p.heroBp : p.otherBp)));
  },
  reset(w, id) {
    w.kRT[id] = 0;
    w.kCount[id] = 0;
    w.kWT[id] = 0;
    w.kValor[id] = 0;
    w.kEmpower[id] = 0;
  },
  /** The swarm (Form) and the mist (Channel bit: the render fades him). */
  snapFx: (w, id) => (w.kRT[id] > 0 ? SNAP_FX.Form : 0) | (w.untargT[id] > 0 ? SNAP_FX.Channel : 0),
};
