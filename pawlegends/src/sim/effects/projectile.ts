/**
 * `projectile` (POC.md §4.4, pierce): skillshots fly straight from the caster at a fixed speed for a fixed range
 * and hit enemies whose footprint the swept segment touches, nearest first. Flags choose pierce (keep going),
 * hero-stop (pierce minions, stop at the first hero: Moonshot) and the per-target cap (Volley). combat/projectile.ts
 * steps them with the homing bolts.
 */
import { TICK_HZ } from '../../data/timeline';
import { BP_ONE, icos, idiv, isin, TRIG_ONE } from '../fixed';
import { allocProjectile, type World } from '../world';

export const PFLAG = Object.freeze({
  Pierce: 1,
  /** Pierce minions, stop at the first hero. */
  HeroStop: 2,
  /** Per-target cap from the owner's Volley numbers. */
  Capped: 4,
  /** Counts as a basic attack (Steady Paw), not an ability. */
  Basic: 8,
  /** Reflected by a parry: the reflector owns it now. */
  Reflected: 16,
} as const);

/** On-hit effects of a skillshot (`pEffect`), with `pEffA`/`pEffB` as its numbers. */
export const ON_HIT = Object.freeze({
  None: 0,
  /** Slow pEffA bp for pEffB ticks. */
  Slow: 1,
  /** Reveal a hero hit for pEffA ticks. */
  Reveal: 2,
} as const);

export interface SkillshotSpec {
  kind: number;
  angle: number;
  speed: number;
  range: number;
  radius: number;
  dmg: number;
  flags: number;
  /** Damage share to minions, bp (default 100%). */
  minionBp?: number;
  effect?: number;
  effA?: number;
  effB?: number;
}

/** Fire a skillshot from `owner`'s position. Returns the projectile index or −1 (cap reached). */
export function fireSkillshot(w: World, owner: number, s: SkillshotSpec): number {
  const p = allocProjectile(w);
  if (p < 0) return -1;
  const step = idiv(s.speed, TICK_HZ);
  w.pAlive[p] = 1;
  w.pTeam[p] = w.team[owner];
  w.pKind[p] = s.kind;
  w.pOwner[p] = owner;
  w.pTarget[p] = -1;
  w.pX[p] = w.x[owner];
  w.pY[p] = w.y[owner];
  w.pVx[p] = idiv(icos(s.angle) * step, TRIG_ONE);
  w.pVy[p] = idiv(isin(s.angle) * step, TRIG_ONE);
  w.pSpeed[p] = s.speed;
  w.pTtl[p] = s.range;
  w.pRange[p] = s.range;
  w.pDmg[p] = s.dmg;
  w.pFlags[p] = s.flags;
  w.pHitLo[p] = 0;
  w.pHitHi[p] = 0;
  w.pRadius[p] = s.radius;
  w.pEffect[p] = s.effect ?? ON_HIT.None;
  w.pEffA[p] = s.effA ?? 0;
  w.pEffB[p] = s.effB ?? 0;
  w.pBp[p] = s.minionBp ?? BP_ONE;
  return p;
}

/** Add `id` to projectile `p`'s hit mask. */
export function markHit(w: World, p: number, id: number): void {
  if (id < 0x20) w.pHitLo[p] |= 1 << id;
  else w.pHitHi[p] |= 1 << (id - 0x20);
}

/** Reverse a skillshot toward where it came from, now owned by `by` (a parry). */
export function reflectSkillshot(w: World, p: number, by: number): void {
  w.pVx[p] = -w.pVx[p];
  w.pVy[p] = -w.pVy[p];
  w.pTeam[p] = w.team[by];
  w.pOwner[p] = by;
  w.pFlags[p] |= PFLAG.Reflected;
  w.pTtl[p] = Math.max(w.pRange[p] - w.pTtl[p], idiv(w.pSpeed[p], TICK_HZ));
  w.pHitLo[p] = 0;
  w.pHitHi[p] = 0;
  markHit(w, p, by);
}
