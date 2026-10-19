/**
 * Bengas, Mage (shelter champion, sim v9). Bespoke hooks: Hot Toast (+15% damage to crowd-controlled enemy heroes,
 * Curtains Up! pulses included: the burst deals its damage with Bengas as the hero source), Striking Pose's
 * facing check (a stun on heroes facing him, a slow on the rest), Camellia Hop's haste after the landing, and the
 * Curtains Up! burst disc.
 *
 * Kit arrays: `kStage` = 1 while a Camellia Hop is in flight (the haste starts when it ends).
 */
import { PROJECTILE_KIND } from '../../data/towers';
import { applyBp } from '../fixed';
import { ENTITY_CAP, FM, Kind } from '../world';
import { collect, dash, fireSkillshot, haste, inCone, inFront, slow, spawnBurst, stun, ON_HIT } from '../effects';
import { Aim, aimAngle, lvl, type HeroKit, type SlotAim } from './kit';
import { abil, type KitNumbers } from './talents';

const hits = new Int32Array(ENTITY_CAP);

function aim(a: KitNumbers, slot: number): SlotAim {
  switch (slot) {
    case 0:
      return { aim: Aim.Dir, reach: a.q.range, windup: 0, mobility: false };
    case 1:
      return { aim: Aim.Dir, reach: 0, windup: a.w.windup, mobility: false };
    case 2:
      return { aim: Aim.Dir, reach: 0, windup: 0, mobility: true };
    default:
      return { aim: Aim.Point, reach: a.r.range, windup: 0, mobility: false };
  }
}

export const BENGAS_KIT: HeroKit = {
  aim,
  cast(m, id, slot, x, y) {
    const w = m.world;
    const a = abil(w, id);
    switch (slot) {
      case 0: {
        const q = a.q;
        const sticky = (q.slowBp ?? 0) > 0;
        fireSkillshot(w, id, {
          kind: PROJECTILE_KIND.toast,
          angle: aimAngle(w, id, x, y),
          speed: q.speed,
          range: q.range,
          radius: q.width >> 1,
          dmg: lvl(w, id, q.dmg, q.dmgPerLevel),
          flags: 0,
          effect: sticky ? ON_HIT.Slow : ON_HIT.None,
          effA: sticky ? q.slowBp : 0,
          effB: sticky ? q.slow : 0,
        });
        return q.cooldown;
      }
      case 1: {
        const p = a.w;
        const bx = w.x[id];
        const by = w.y[id];
        const dir = aimAngle(w, id, x, y);
        // Heroes facing him (facing follows movement, so a chaser is facing him) are stunned; the others in the cone
        // are slowed, so the cast is never wasted (and Hot Toast reads the slow).
        const n = collect(w, w.team[id], hits, (e, r) => inCone(bx, by, dir, p.range, p.arc, w.x[e], w.y[e], r), true);
        for (let i = 0; i < n; i++) {
          const e = hits[i];
          if (inFront(w, e, bx, by, p.facingArc)) stun(w, e, p.stun);
          else slow(w, e, p.slowBp, p.slow);
        }
        return p.cooldown;
      }
      case 2:
        dash(m, id, aimAngle(w, id, x, y), a.e.dash);
        w.kStage[id] = 1;
        return a.e.cooldown;
      default: {
        const r = a.r;
        const z = spawnBurst(w, w.team[id], id, x, y, r.radius, r.windup, r.windup + r.duration, lvl(w, id, r.dmg, r.dmgPerLevel), 0, r.every, r.slowBp, r.slow);
        return z < 0 ? -1 : r.cooldown;
      }
    }
  },
  stepKit(m, id) {
    const w = m.world;
    if (w.kStage[id] === 1 && w.fmKind[id] === FM.None) {
      w.kStage[id] = 0;
      const e = abil(w, id).e;
      haste(w, id, e.hasteBp, e.haste);
    }
  },
  outgoing(m, id, dst, raw) {
    const w = m.world;
    if (w.kind[dst] !== Kind.Hero) return raw;
    const cc = w.stunT[dst] > 0 || w.rootT[dst] > 0 || w.fearT[dst] > 0 || w.slowT[dst] > 0;
    return cc ? applyBp(raw, abil(w, id).passive.bonusBp) : raw;
  },
  reset(w, id) {
    w.kStage[id] = 0;
  },
};
