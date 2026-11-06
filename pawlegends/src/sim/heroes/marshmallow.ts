/**
 * Marshmallow, Mage (sim v13, original dog; build spec docs/plans/moba/DOGS-V13.md §1.2). A zone mage. Bespoke hooks:
 * Fresh Snow (standing in her own snow she is faster and her basics slow), the Snowball, the Snow Patch, the Belly
 * Slide's landing (haste and a shield) and SNOW DAY! (a blizzard; enemy heroes still inside when it ends are Frozen).
 *
 * Kit arrays: kValor Fresh Snow active (0/1); kStage 1 = slide landing pending; kRT SNOW DAY! ticks to the freeze;
 * kHonour / kChain the blizzard centre (x, y).
 */
import { ZONE_KIND } from '../../data/effects';
import { PROJECTILE_KIND } from '../../data/towers';
import { dist2 } from '../fixed';
import type { MatchHandle } from '../state';
import { FM, G, Kind, RANGE, type World } from '../world';
import { addShield, ccImmune, dash, fireSkillshot, haste, inRing, root, slow, spawnBurst, ON_HIT } from '../effects';
import { creditHealShield } from '../effects/heal';
import { radiusOf } from '../units/kinds';
import { Aim, aimAngle, lvl, type HeroKit, type SlotAim } from './kit';
import { abil, type KitNumbers } from './talents';

function aim(a: KitNumbers, slot: number): SlotAim {
  switch (slot) {
    case 0:
      return { aim: Aim.Dir, reach: 0, windup: 0, mobility: false };
    case 1:
      return { aim: Aim.Point, reach: a.w.range, windup: 0, mobility: false };
    case 2:
      return { aim: Aim.Dir, reach: 0, windup: 0, mobility: true };
    default:
      return { aim: Aim.Point, reach: a.r.range, windup: a.r.windup, mobility: false };
  }
}

/**
 * Is hero `id` inside one of her own burst zones (the Snow Patch or the blizzard)? The owner and kind check makes a
 * zone index another hero reused safe.
 */
export function inOwnSnow(w: World, id: number): boolean {
  for (let z = 0; z < w.zAlive.length; z++) {
    if (w.zAlive[z] === 0 || w.zOwner[z] !== id || w.zKind[z] !== ZONE_KIND.burst) continue;
    const r = w.zRadius[z];
    if (dist2(w.x[id], w.y[id], w.zX[z], w.zY[z]) <= r * r) return true;
  }
  return false;
}

/** SNOW DAY! ends: every enemy hero still inside the blizzard is Frozen (rooted), one `frozen` clip each. */
function freeze(m: MatchHandle, id: number): void {
  const w = m.world;
  const r = abil(w, id).r;
  const cx = w.kHonour[id];
  const cy = w.kChain[id];
  const tick = w.globals[G.Tick];
  for (let e = RANGE.heroes; e < RANGE.minions; e++) {
    if (w.alive[e] === 0 || w.kind[e] !== Kind.Hero || w.team[e] === w.team[id] || w.untargT[e] > 0) continue;
    if (!inRing(cx, cy, r.radius, w.x[e], w.y[e], radiusOf(w, e)) || ccImmune(w, e)) continue;
    root(w, e, r.freeze);
    m.events.push({ type: 'clip', tick, id: e, what: 'frozen' });
  }
}

export const MARSHMALLOW_KIT: HeroKit = {
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
          effect: ON_HIT.Slow,
          effA: q.slowBp,
          effB: q.slow,
        });
        return p < 0 ? -1 : q.cooldown;
      }
      case 1: {
        const p = a.w;
        const z = spawnBurst(w, w.team[id], id, x, y, p.radius, p.windup, p.windup + p.ttl, lvl(w, id, p.dmg, p.dmgPerLevel), 0, p.every, p.slowBp, p.slow);
        return z < 0 ? -1 : p.cooldown;
      }
      case 2:
        dash(m, id, aimAngle(w, id, x, y), a.e.dash, a.e.speed);
        w.kStage[id] = 1;
        return a.e.cooldown;
      default: {
        const r = a.r;
        // The cast's wind-up is the telegraph; the snow falls at once.
        const z = spawnBurst(w, w.team[id], id, x, y, r.radius, 0, r.duration, lvl(w, id, r.dmg, r.dmgPerLevel), 0, r.every, r.slowBp, r.slow);
        if (z < 0) return -1;
        w.kHonour[id] = x;
        w.kChain[id] = y;
        w.kRT[id] = r.duration;
        return r.cooldown;
      }
    }
  },
  stepKit(m, id) {
    const w = m.world;
    const a = abil(w, id);
    if (inOwnSnow(w, id)) {
      w.kValor[id] = 1;
      haste(w, id, a.passive.hasteBp, 2);
    } else w.kValor[id] = 0;
    if (w.kStage[id] === 1 && w.napT[id] > 0) w.kStage[id] = 0;
    if (w.kStage[id] === 1 && w.fmKind[id] === FM.None) {
      w.kStage[id] = 0;
      const e = a.e;
      haste(w, id, e.hasteBp, e.haste);
      creditHealShield(m, id, addShield(w, id, lvl(w, id, e.shield, e.shieldPerLevel), e.duration));
    }
    if (w.kRT[id] > 0 && --w.kRT[id] === 0) freeze(m, id);
  },
  afterBasic(m, id, dst) {
    const w = m.world;
    if (w.kValor[id] === 0 || w.team[dst] === w.team[id]) return;
    const p = abil(w, id).passive;
    slow(w, dst, p.slowBp, p.slow);
  },
  reset(w, id) {
    w.kValor[id] = 0;
    w.kStage[id] = 0;
    w.kRT[id] = 0;
  },
  resource: (w, id) => (w.kValor[id] > 0 ? 0xff : 0),
};
