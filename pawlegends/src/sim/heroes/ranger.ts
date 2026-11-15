/**
 * Ranger, Marksman (sim v31, original dog; build spec docs/plans/moba/ROSTER-V31.md §2.4): the stealth sniper. Bespoke
 * hooks: Camouflage (3 s without dealing or taking damage hides him until he hits; his first basic from hiding hits
 * harder), Tracer Ball (a hero-stop shot that reveals), Warning Bark (a peel cone: knockback and slow), Bush Dive (a
 * dash that hides him and loads the Camouflage shot) and LONG SHOT (he settles and fires homing balls at one enemy hero
 * from far away; it stays revealed while he shoots).
 *
 * Stealth is the shared primitive (effects/stealth.ts): enemies within EFFECTS.stealthReveal still see him, and any
 * damage he deals breaks it (combat/damage.ts).
 *
 * Kit arrays: kChain the tick he last dealt damage; kEmpower 1 = the next basic is a Camouflage shot, kHuntT 1 while the
 * basic just fired is one; kStage LONG SHOT balls left, kWT ticks to the next, kHuntVictim its target.
 */
import { HERO_RULES } from '../../data/xp';
import { PROJECTILE_KIND } from '../../data/towers';
import { applyBp, dist2 } from '../fixed';
import type { MatchHandle } from '../state';
import { G, Kind, type World, MAX_ENTITIES } from '../world';
import { dealDamage } from '../combat/damage';
import { fireBolt } from '../combat/attack';
import { collect, dash, fireSkillshot, inCone, knockback, reveal, slow, stealth, ON_HIT, PFLAG } from '../effects';
import { targetable } from '../units/kinds';
import { Aim, aimAngle, lvl, SNAP_FX, type HeroKit, type SlotAim } from './kit';
import { abil, type KitNumbers } from './talents';

const CAMO = 1;
const hits = new Int32Array(MAX_ENTITIES);

function aim(a: KitNumbers, slot: number): SlotAim {
  switch (slot) {
    case 0:
      return { aim: Aim.Dir, reach: 0, windup: 0, mobility: false };
    case 1:
      return { aim: Aim.Dir, reach: 0, windup: 0, mobility: false };
    case 2:
      return { aim: Aim.Dir, reach: 0, windup: 0, mobility: true };
    default:
      return { aim: Aim.Unit, reach: a.r.reach, windup: a.r.windup, mobility: false };
  }
}

/** Ticks since he last dealt or took damage. */
const quietFor = (w: World, id: number): number => w.globals[G.Tick] - Math.max(w.kChain[id], w.hurtTick[id]);

/** One LONG SHOT ball (false: the target is gone, out of the leash or untargetable). */
function longShot(m: MatchHandle, id: number): boolean {
  const w = m.world;
  const r = abil(w, id).r;
  const e = w.kHuntVictim[id];
  if (e < 0 || w.alive[e] === 0 || w.untargT[e] > 0) return false;
  if (dist2(w.x[id], w.y[id], w.x[e], w.y[e]) > r.leash * r.leash) return false;
  // The scope: it stays revealed until the last ball (so a bush or stealth cannot drop it).
  reveal(w, e, r.gap + 2);
  if (!targetable(w, e, w.team[id])) return false;
  const dmg = lvl(w, id, r.dmg, r.dmgPerLevel) + applyBp(w.maxHp[e] - w.hp[e], r.missingHpBp);
  fireBolt(w, id, e, dmg, r.speed, PROJECTILE_KIND.fluff);
  w.facing[id] = aimAngle(w, id, w.x[e], w.y[e]);
  w.kStage[id]--;
  w.kWT[id] = w.kStage[id] > 0 ? r.gap : 0;
  return true;
}

function endShot(w: World, id: number): void {
  w.kStage[id] = 0;
  w.kWT[id] = 0;
  w.kHuntVictim[id] = -1;
}

export const RANGER_KIT: HeroKit = {
  aim,
  cast(m, id, slot, x, y, target) {
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
          flags: PFLAG.HeroStop,
          minionBp: q.minionBp,
          effect: ON_HIT.Reveal,
          effA: q.reveal,
        });
        return p < 0 ? -1 : q.cooldown;
      }
      case 1: {
        const p = a.w;
        const hx = w.x[id];
        const hy = w.y[id];
        const dir = aimAngle(w, id, x, y);
        const n = collect(w, w.team[id], hits, (e, r) => inCone(hx, hy, dir, p.range, p.arc, w.x[e], w.y[e], r));
        const dmg = lvl(w, id, p.dmg, p.dmgPerLevel);
        for (let i = 0; i < n; i++) {
          const e = hits[i];
          dealDamage(m, id, w.team[id], Kind.Hero, e, dmg, 'ability');
          if (w.alive[e] === 0 || w.kind[e] !== Kind.Hero) continue;
          knockback(m, e, hx, hy, p.push, dir);
          slow(w, e, p.slowBp, p.slow);
        }
        return p.cooldown;
      }
      case 2: {
        const e = a.e;
        dash(m, id, aimAngle(w, id, x, y), e.dash);
        stealth(w, id, e.hide);
        w.kEmpower[id] = CAMO;
        return e.cooldown;
      }
      default: {
        const r = a.r;
        if (target < 0 || w.kind[target] !== Kind.Hero) return -1;
        w.kHuntVictim[id] = target;
        w.kStage[id] = r.shots;
        m.events.push({ type: 'clip', tick: w.globals[G.Tick], id, what: 'longshot' });
        if (!longShot(m, id)) {
          endShot(w, id);
          return r.cooldown;
        }
        if (w.kStage[id] === 0) endShot(w, id);
        return r.cooldown;
      }
    }
  },
  stepKit(m, id) {
    const w = m.world;
    if (w.kStage[id] > 0) {
      // A stun, a Nap or death ends LONG SHOT.
      if (w.alive[id] === 0 || w.stunT[id] > 0 || w.napT[id] > 0) endShot(w, id);
      else if (w.kWT[id] > 0 && --w.kWT[id] === 0) {
        if (!longShot(m, id) || w.kStage[id] === 0) endShot(w, id);
      }
    }
    // Camouflage: quiet long enough, he slips out of sight (a rolling stealth, so any hit he deals ends it at once).
    if (w.alive[id] === 1 && w.kStage[id] === 0 && quietFor(w, id) >= abil(w, id).passive.still) {
      stealth(w, id, 2);
      w.kEmpower[id] = CAMO;
    }
  },
  basic(m, id, dst, dmg) {
    const w = m.world;
    if (w.kEmpower[id] !== CAMO) return false;
    w.kHuntT[id] = CAMO;
    fireBolt(w, id, dst, applyBp(dmg, abil(w, id).passive.bonusBp), HERO_RULES.projectile, PROJECTILE_KIND.hero);
    m.events.push({ type: 'clip', tick: w.globals[G.Tick], id, what: 'camoshot' });
    return true;
  },
  afterBasic(m, id) {
    // The bolt is fired: the Camouflage shot is spent (its hit breaks the stealth when it lands).
    const w = m.world;
    if (w.kHuntT[id] === CAMO) {
      w.kHuntT[id] = 0;
      w.kEmpower[id] = 0;
    }
  },
  onWindup(m, id, slot, ev) {
    // LONG SHOT names its target in the windup event (the render's scope locks on it at once).
    if (slot === 3) ev.dst = m.world.castId[id];
  },
  afterDeal(m, id, _dst, dmg) {
    if (dmg > 0) m.world.kChain[id] = m.world.globals[G.Tick];
  },
  reset(w, id) {
    w.kChain[id] = w.globals[G.Tick];
    w.kEmpower[id] = 0;
    w.kHuntT[id] = 0;
    endShot(w, id);
  },
  /** LONG SHOT: settled, no walking, no basic, no cast until the last ball. */
  busy: (w, id) => w.kStage[id] > 0,
  snapFx: (w, id) => (w.kStage[id] > 0 ? SNAP_FX.Channel : 0),
  /** The HUD's light: the next basic is a Camouflage shot. */
  resource: (w, id) => (w.kEmpower[id] === CAMO ? 0xff : 0),
};
