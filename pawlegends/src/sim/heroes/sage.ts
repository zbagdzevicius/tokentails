/**
 * Sage, Marksman (POC.md §6.4). Bespoke hooks: Steady Paw (every Nth basic is a piercing line shot instead of a
 * bolt), Volley's per-target arrow cap, Sun Snare's trap limit, Hop Back's "away from the aim" direction and
 * Moonshot's windup (telegraphed through the `windup` event). Sim v10 (GAPS B6): with Piercing Shot (`q.lance`) Volley
 * is one piercing line instead of the fan.
 */
import { ZONE_KIND } from '../../data/effects';
import { PROJECTILE_KIND } from '../../data/towers';
import { idiv } from '../fixed';
import type { MatchHandle } from '../state';
import { ENTITY_CAP } from '../world';
import { dash, fireSkillshot, oldestZone, spawnZone, ON_HIT, PFLAG } from '../effects';
import { Aim, HALF_TURN, aimAngle, lvl, type HeroKit, type SlotAim } from './kit';
import { abil, type KitNumbers } from './talents';
import { isStructure } from '../units/kinds';

function aim(a: KitNumbers, slot: number): SlotAim {
  switch (slot) {
    case 0:
      return { aim: Aim.Dir, reach: a.q.range, windup: 0, mobility: false };
    case 1:
      return { aim: Aim.Point, reach: a.w.range, windup: 0, mobility: false };
    case 2:
      return { aim: Aim.Dir, reach: 0, windup: 0, mobility: true };
    default:
      return { aim: Aim.Dir, reach: 0, windup: a.r.windup, mobility: false };
  }
}

/** Sim v10 (GAPS B6) Piercing Shot: one line that pierces everything it passes (Sticky Arrows' slow included). */
function piercingShot(m: MatchHandle, id: number, x: number, y: number): number {
  const w = m.world;
  const q = abil(w, id).q;
  const sticky = (q.slowBp ?? 0) > 0;
  fireSkillshot(w, id, {
    kind: PROJECTILE_KIND.lance,
    angle: aimAngle(w, id, x, y),
    speed: q.speed,
    range: q.range,
    radius: q.width >> 1,
    dmg: lvl(w, id, q.dmg, q.dmgPerLevel),
    flags: PFLAG.Pierce,
    effect: sticky ? ON_HIT.Slow : ON_HIT.None,
    effA: sticky ? q.slowBp : 0,
    effB: sticky ? q.slow : 0,
  });
  return q.cooldown;
}

function volley(m: MatchHandle, id: number, x: number, y: number): number {
  const w = m.world;
  const q = abil(w, id).q;
  if ((q.lance ?? 0) > 0) return piercingShot(m, id, x, y);
  w.volleyHits.fill(0, id * ENTITY_CAP, (id + 1) * ENTITY_CAP);
  const dir = aimAngle(w, id, x, y);
  const n = q.arrows;
  const sticky = (q.slowBp ?? 0) > 0;
  for (let i = 0; i < n; i++) {
    const angle = n > 1 ? dir - (q.arc >> 1) + idiv(q.arc * i, n - 1) : dir;
    fireSkillshot(w, id, {
      kind: PROJECTILE_KIND.arrow,
      angle,
      speed: q.speed,
      range: q.range,
      radius: q.width >> 1,
      dmg: lvl(w, id, q.dmg, q.dmgPerLevel),
      flags: PFLAG.Capped,
      effect: sticky ? ON_HIT.Slow : ON_HIT.None,
      effA: sticky ? q.slowBp : 0,
      effB: sticky ? q.slow : 0,
    });
  }
  return q.cooldown;
}

function snare(m: MatchHandle, id: number, x: number, y: number): number {
  const w = m.world;
  const s = abil(w, id).w;
  const { count, oldest } = oldestZone(w, id, ZONE_KIND.trap);
  if (count >= s.maxTraps && oldest >= 0) w.zAlive[oldest] = 0;
  const z = spawnZone(w, ZONE_KIND.trap, w.team[id], id, x, y, s.radius, s.duration, s.arm, s.root);
  return z < 0 ? -1 : s.cooldown;
}

export const SAGE_KIT: HeroKit = {
  aim,
  cast(m, id, slot, x, y) {
    const w = m.world;
    const a = abil(w, id);
    switch (slot) {
      case 0:
        return volley(m, id, x, y);
      case 1:
        return snare(m, id, x, y);
      case 2: {
        // Away from the aim: the hop faces back toward it, so the bow keeps pointing at the threat.
        const toward = aimAngle(w, id, x, y);
        dash(m, id, toward + HALF_TURN, a.e.dash);
        w.facing[id] = toward;
        return a.e.cooldown;
      }
      default: {
        const r = a.r;
        const reveal = (r.reveal ?? 0) > 0;
        fireSkillshot(w, id, {
          kind: PROJECTILE_KIND.moonshot,
          angle: aimAngle(w, id, x, y),
          speed: r.speed,
          range: r.range,
          radius: r.width >> 1,
          dmg: lvl(w, id, r.dmg, r.dmgPerLevel),
          flags: PFLAG.HeroStop,
          minionBp: r.minionBp,
          effect: reveal ? ON_HIT.Reveal : ON_HIT.None,
          effA: reveal ? r.reveal : 0,
        });
        return r.cooldown;
      }
    }
  },
  basic(m, id, dst, dmg) {
    const w = m.world;
    const p = abil(w, id).passive;
    w.kCount[id]++;
    // Skillshots never hit structures: a tower or core always takes the normal bolt.
    if (w.kCount[id] % p.everyNth !== 0 || isStructure(w, dst)) return false;
    fireSkillshot(w, id, {
      kind: PROJECTILE_KIND.pierce,
      angle: aimAngle(w, id, w.x[dst], w.y[dst]),
      speed: p.pierceSpeed,
      range: p.pierceRange,
      radius: p.pierceWidth >> 1,
      dmg,
      flags: PFLAG.Pierce | PFLAG.Basic,
    });
    return true;
  },
  reset(w, id) {
    w.kCount[id] = 0;
  },
};
