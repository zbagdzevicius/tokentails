/**
 * Pixel, Marksman (sim v11, original cat; build spec docs/plans/moba/CATS-V11.md §2.2). Bespoke hooks: Cardboard
 * Plating (an absorb plate that refills out of combat), Cap Cannon's reveal shot, Laser Pointer's channelled beam that
 * turns with her, Duck and Cover's damage cut, and BOXBOT MK II's splash on basics.
 *
 * Kit arrays: kHonour plate HP; kWT beam ticks left; kStage beam angle; kCount beam pulses; kRT duck ticks; kWindow
 * Boxbot ticks; kHurt (shared) last hero damage.
 */
import { PROJECTILE_KIND } from '../../data/towers';
import { ANGLE_MASK, BP_ONE, angleDiff, applyBp, icos, idiv, isin, TRIG_ONE } from '../fixed';
import type { MatchHandle } from '../state';
import { FM, G, Kind, type World, MAX_ENTITIES } from '../world';
import { dealDamage } from '../combat/damage';
import {
  addShield,
  cleanse,
  collect,
  cooldownRate,
  disabled,
  fireSkillshot,
  haste,
  inLine,
  inRing,
  ON_HIT,
  PFLAG,
  selfRoot,
  slow,
} from '../effects';
import { attackRange } from '../units/kinds';
import { Aim, SNAP_FX, aimAngle, lvl, type HeroKit, type SlotAim } from './kit';
import { abil, type KitNumbers } from './talents';

const hits = new Int32Array(MAX_ENTITIES);

function aim(_a: KitNumbers, slot: number): SlotAim {
  switch (slot) {
    case 0:
    case 1:
      return { aim: Aim.Dir, reach: 0, windup: 0, mobility: false };
    default:
      return { aim: Aim.Self, reach: 0, windup: 0, mobility: false };
  }
}

const fx = (w: World, id: number): number => (w.kWindow[id] > 0 ? SNAP_FX.Form : 0) | (w.kWT[id] > 0 ? SNAP_FX.Channel : 0);

/** Cardboard Plating's full plate: plateBp of max HP. */
const plate = (w: World, id: number): number => applyBp(w.maxHp[id], abil(w, id).passive.plateBp);

/** One Laser Pointer pulse: every enemy on the beam takes the hit and a slow that grows with each pulse. */
function pulse(m: MatchHandle, id: number): void {
  const w = m.world;
  const b = abil(w, id).w;
  w.kCount[id]++;
  const ax = w.x[id];
  const ay = w.y[id];
  const bx = ax + idiv(icos(w.kStage[id]) * b.range, TRIG_ONE);
  const by = ay + idiv(isin(w.kStage[id]) * b.range, TRIG_ONE);
  const n = collect(w, w.team[id], hits, (e, r) => inLine(ax, ay, bx, by, b.width >> 1, w.x[e], w.y[e], r));
  const dmg = lvl(w, id, b.dmg, b.dmgPerLevel);
  const bp = Math.min(b.slowMaxBp, b.slowStepBp * w.kCount[id]);
  for (let i = 0; i < n; i++) {
    dealDamage(m, id, w.team[id], Kind.Hero, hits[i], dmg, 'ability');
    slow(w, hits[i], bp, b.every + 2);
  }
}

export const PIXEL_KIT: HeroKit = {
  aim,
  cast(m, id, slot, x, y) {
    const w = m.world;
    const a = abil(w, id);
    // Any other cast drops the beam.
    w.kWT[id] = 0;
    switch (slot) {
      case 0: {
        const q = a.q;
        const p = fireSkillshot(w, id, {
          kind: PROJECTILE_KIND.cap,
          angle: aimAngle(w, id, x, y),
          speed: q.speed,
          range: q.range,
          radius: q.width >> 1,
          dmg: lvl(w, id, q.dmg, q.dmgPerLevel),
          flags: PFLAG.HeroStop,
          minionBp: q.minionBp,
          effect: ON_HIT.Reveal,
          effA: q.reveal,
        });
        return p < 0 ? -1 : q.cooldown;
      }
      case 1: {
        const b = a.w;
        w.kWT[id] = b.duration;
        w.kStage[id] = aimAngle(w, id, x, y);
        w.kCount[id] = 0;
        slow(w, id, b.selfSlowBp, 2);
        return b.cooldown;
      }
      case 2: {
        const e = a.e;
        selfRoot(w, id, e.duration);
        w.kRT[id] = e.duration;
        w.kHonour[id] = plate(w, id);
        return e.cooldown;
      }
      default: {
        const r = a.r;
        addShield(w, id, lvl(w, id, r.shield, r.shieldPerLevel), r.duration);
        haste(w, id, r.hasteBp, r.duration);
        cleanse(w, id, r.immune);
        cooldownRate(w, id, r.cdrBp, r.duration);
        w.kWindow[id] = r.duration;
        return r.cooldown;
      }
    }
  },
  stepKit(m, id) {
    const w = m.world;
    const a = abil(w, id);
    if (w.globals[G.Tick] - w.kHurt[id] >= a.passive.refill) w.kHonour[id] = plate(w, id);
    if (w.kRT[id] > 0) w.kRT[id]--;
    if (w.kWindow[id] > 0) w.kWindow[id]--;
    if (w.kWT[id] === 0) return;
    // The beam breaks on hard CC or a forced move.
    if (disabled(w, id) || w.fmKind[id] !== FM.None) {
      w.kWT[id] = 0;
      return;
    }
    const b = a.w;
    // Walking steers the beam: at most `turn` steps a tick toward her facing.
    const d = angleDiff(w.kStage[id], w.facing[id]);
    w.kStage[id] = (w.kStage[id] + Math.max(-b.turn, Math.min(b.turn, d))) & ANGLE_MASK;
    // The self-slow is held tick by tick, so it ends with the beam.
    slow(w, id, b.selfSlowBp, 2);
    w.kWT[id]--;
    if ((b.duration - w.kWT[id]) % b.every === 0) pulse(m, id);
  },
  incoming(m, id, src, dmg) {
    const w = m.world;
    if (w.kRT[id] === 0) return dmg;
    const e = abil(w, id).e;
    if (src >= 0 && w.kind[src] === Kind.Hero && w.team[src] !== w.team[id] && attackRange(w, src) <= e.meleeRange) slow(w, src, e.slowBp, e.slow);
    return applyBp(dmg, BP_ONE - e.reduceBp);
  },
  absorb(m, id, dmg) {
    const w = m.world;
    if (w.kHonour[id] === 0) return 0;
    const used = Math.min(w.kHonour[id], dmg);
    w.kHonour[id] -= used;
    if (w.kHonour[id] === 0) {
      const p = abil(w, id).passive;
      haste(w, id, p.hasteBp, p.haste);
    }
    return used;
  },
  afterDeal(m, id, dst, dmg, kind) {
    const w = m.world;
    if (kind !== 'basic' || w.kWindow[id] === 0) return;
    const r = abil(w, id).r;
    const cx = w.x[dst];
    const cy = w.y[dst];
    const n = collect(w, w.team[id], hits, (e, er) => e !== dst && inRing(cx, cy, r.splash, w.x[e], w.y[e], er));
    // 'ability': the splash neither recurses nor counts as a basic.
    const splash = applyBp(dmg, r.splashBp);
    for (let i = 0; i < n; i++) dealDamage(m, id, w.team[id], Kind.Hero, hits[i], splash, 'ability');
  },
  reset(w, id) {
    w.kHonour[id] = 0;
    w.kWT[id] = 0;
    w.kStage[id] = 0;
    w.kCount[id] = 0;
    w.kRT[id] = 0;
    w.kWindow[id] = 0;
  },
  snapFx: fx,
};
