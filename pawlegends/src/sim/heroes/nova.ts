/**
 * Nova, Mage (sim v31, original cat; build spec docs/plans/moba/ROSTER-V31.md §2.1): the artillery mage. Bespoke hooks:
 * Starlight (her hits on an enemy hero 7 m or more away hit harder), Starfall (a delayed burst disc on a point),
 * Shooting Star (a long line shot that flies through everything and reveals the heroes it hits), Moon Hop (a hop that
 * leaves a delayed slowing moonbeam where she stood) and METEOR SHOWER (a long-range disc that takes several meteors).
 *
 * Every delayed hit is a burst zone (effects/zone.ts), visible to both teams while it arms: that telegraph is the
 * counter-play. No kit arrays: Starlight reads the distance when the hit lands.
 */
import { PROJECTILE_KIND } from '../../data/towers';
import { applyBp, dist2 } from '../fixed';
import { RANGE, Kind, type World } from '../world';
import { dash, fireSkillshot, spawnBurst, ON_HIT, PFLAG } from '../effects';
import { Aim, aimAngle, lvl, type HeroKit, type SlotAim } from './kit';
import { abil, type KitNumbers } from './talents';

function aim(a: KitNumbers, slot: number): SlotAim {
  switch (slot) {
    case 0:
      return { aim: Aim.Point, reach: a.q.range, windup: 0, mobility: false };
    case 1:
      return { aim: Aim.Dir, reach: 0, windup: 0, mobility: false };
    case 2:
      return { aim: Aim.Dir, reach: 0, windup: 0, mobility: true };
    default:
      return { aim: Aim.Point, reach: a.r.range, windup: a.r.windup, mobility: false };
  }
}

const isFoeHero = (w: World, id: number, e: number): boolean =>
  e >= RANGE.heroes && e < RANGE.minions && w.kind[e] === Kind.Hero && w.team[e] !== w.team[id];

export const NOVA_KIT: HeroKit = {
  aim,
  cast(m, id, slot, x, y) {
    const w = m.world;
    const a = abil(w, id);
    switch (slot) {
      case 0: {
        const q = a.q;
        const z = spawnBurst(w, w.team[id], id, x, y, q.radius, q.arm, q.arm + 1, lvl(w, id, q.dmg, q.dmgPerLevel), 0, 0, q.slowBp, q.slow);
        return z < 0 ? -1 : q.cooldown;
      }
      case 1: {
        const p = a.w;
        const s = fireSkillshot(w, id, {
          kind: PROJECTILE_KIND.fluff,
          angle: aimAngle(w, id, x, y),
          speed: p.speed,
          range: p.range,
          radius: p.width >> 1,
          dmg: lvl(w, id, p.dmg, p.dmgPerLevel),
          flags: PFLAG.Pierce,
          minionBp: p.minionBp,
          effect: ON_HIT.Reveal,
          effA: p.reveal,
        });
        return s < 0 ? -1 : p.cooldown;
      }
      case 2: {
        const e = a.e;
        // The moonbeam stays where she stood: a slow-only burst (no damage) that goes off after `arm`.
        spawnBurst(w, w.team[id], id, w.x[id], w.y[id], e.radius, e.arm, e.arm + 1, 0, 0, 0, e.slowBp, e.slow);
        dash(m, id, aimAngle(w, id, x, y), e.dash);
        return e.cooldown;
      }
      default: {
        const r = a.r;
        const z = spawnBurst(w, w.team[id], id, x, y, r.radius, r.arm, r.arm + r.every * r.pulses, lvl(w, id, r.dmg, r.dmgPerLevel), 0, r.every, r.slowBp, r.slow);
        return z < 0 ? -1 : r.cooldown;
      }
    }
  },
  outgoing(m, id, dst, raw) {
    const w = m.world;
    if (!isFoeHero(w, id, dst)) return raw;
    const p = abil(w, id).passive;
    return dist2(w.x[id], w.y[id], w.x[dst], w.y[dst]) >= p.range * p.range ? applyBp(raw, p.bonusBp) : raw;
  },
};
