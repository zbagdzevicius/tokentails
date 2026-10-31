/**
 * Duchess, Mage (sim v11, original cat; build spec docs/plans/moba/CATS-V11.md §2.3). Bespoke hooks: Utter Disdain
 * (her ability hits stack Disdain on the victim; at the cap the victim is Snubbed), Fluff Puff's piercing shot, Not
 * Amused's cone, Cushion Glide's fur cloud and glide, and Royal Decree's ring.
 *
 * Kit arrays: none of her own; Disdain lives on the victim in the `mk*` arrays (effects/stack.ts).
 */
import { PROJECTILE_KIND } from '../../data/towers';
import type { MatchHandle } from '../state';
import { ENTITY_CAP, Kind } from '../world';
import { addShield, addStack, collect, consumeStack, dash, fireSkillshot, inCone, inRing, slow, spawnBurst, stun, ON_HIT, PFLAG } from '../effects';
import { creditHealShield } from '../effects/heal';
import { dealDamage } from '../combat/damage';
import { Aim, aimAngle, lvl, type HeroKit, type SlotAim } from './kit';
import { abil, type KitNumbers } from './talents';

const hits = new Int32Array(ENTITY_CAP);

function aim(a: KitNumbers, slot: number): SlotAim {
  switch (slot) {
    case 0:
      return { aim: Aim.Dir, reach: 0, windup: 0, mobility: false };
    case 1:
      return { aim: Aim.Dir, reach: 0, windup: a.w.windup, mobility: false };
    case 2:
      return { aim: Aim.Dir, reach: 0, windup: 0, mobility: true };
    default:
      return { aim: Aim.Self, reach: 0, windup: a.r.windup, mobility: false };
  }
}

/**
 * Add `n` Disdain to enemy hero `e`; at the cap it is Snubbed: the stack is consumed first (the lockout stops the
 * bonus hit from stacking again), then the stun and the bonus damage.
 */
function disdain(m: MatchHandle, id: number, e: number, n: number): void {
  const w = m.world;
  const p = abil(w, id).passive;
  if (!addStack(w, e, n, p.stacks, p.window)) return;
  consumeStack(w, e, p.lockout);
  stun(w, e, p.stun);
  dealDamage(m, id, w.team[id], Kind.Hero, e, lvl(w, id, p.dmg, p.dmgPerLevel), 'ability');
}

export const DUCHESS_KIT: HeroKit = {
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
          flags: PFLAG.Pierce,
          effect: ON_HIT.Slow,
          effA: q.slowBp,
          effB: q.slow,
        });
        return p < 0 ? -1 : q.cooldown;
      }
      case 1: {
        const p = a.w;
        const bx = w.x[id];
        const by = w.y[id];
        const dir = aimAngle(w, id, x, y);
        const dmg = lvl(w, id, p.dmg, p.dmgPerLevel);
        const n = collect(w, w.team[id], hits, (e, r) => inCone(bx, by, dir, p.range, p.arc, w.x[e], w.y[e], r));
        for (let i = 0; i < n; i++) {
          dealDamage(m, id, w.team[id], Kind.Hero, hits[i], dmg, 'ability');
          slow(w, hits[i], p.slowBp, p.slow);
        }
        return p.cooldown;
      }
      case 2: {
        const e = a.e;
        // The cloud is left where she starts; a full zone table skips it and the glide still happens.
        spawnBurst(w, w.team[id], id, w.x[id], w.y[id], e.radius, 0, e.ttl, 0, 0, e.every, e.slowBp, e.slow);
        dash(m, id, aimAngle(w, id, x, y), e.dash, e.speed);
        return e.cooldown;
      }
      default: {
        const r = a.r;
        const bx = w.x[id];
        const by = w.y[id];
        const dmg = lvl(w, id, r.dmg, r.dmgPerLevel);
        const n = collect(w, w.team[id], hits, (e, er) => inRing(bx, by, r.radius, w.x[e], w.y[e], er), true);
        for (let i = 0; i < n; i++) {
          const e = hits[i];
          // The hit adds 1 Disdain through afterDeal; the decree adds the rest.
          dealDamage(m, id, w.team[id], Kind.Hero, e, dmg, 'ability');
          slow(w, e, r.slowBp, r.slow);
          disdain(m, id, e, r.stacks - 1);
        }
        creditHealShield(m, id, addShield(w, id, lvl(w, id, r.shield, r.shieldPerLevel), r.duration));
        return r.cooldown;
      }
    }
  },
  afterDeal(m, id, dst, _dmg, kind) {
    // Utter Disdain: ability hits only (basics never stack), on enemy heroes.
    if (kind !== 'ability' || m.world.kind[dst] !== Kind.Hero || m.world.team[dst] === m.world.team[id]) return;
    disdain(m, id, dst, 1);
  },
};
