/**
 * Step 6 for projectiles (POC.md §4.3): homing bolts (minions, towers, cores, ranged basics) and skillshots
 * (effects/projectile.ts). Before a projectile lands, an enemy Front Guard in its way blocks it (Sir Brutus) and an
 * open parry window reflects it (Clem's The Stand). A reflected bolt flies back at its shooter; a reflected
 * skillshot flies back the way it came, both owned by the reflector.
 */
import { MAP } from '../../data/map';
import { PROJECTILE_KIND } from '../../data/towers';
import { TICK_HZ } from '../../data/timeline';
import { applyBp, idiv, isqrt } from '../fixed';
import type { MatchHandle } from '../state';
import { ENTITY_CAP, Kind, RANGE, maskHas, type World } from '../world';
import { dealDamage } from './damage';
import { ON_HIT, PFLAG, markHit, reflectSkillshot } from '../effects/projectile';
import { alongLine } from '../effects/line';
import { isAbilityTarget } from '../effects/targets';
import { reveal } from '../effects/mark';
import { slow } from '../effects/slow';
import { guardBlocks } from '../heroes/brutus';
import { parryOpen } from '../heroes/clem';
import { abil } from '../heroes/talents';
import { radiusOf, targetable } from '../units/kinds';

/** Source kind a bolt's damage counts as (backdoor and tower-aggro rules), by PROJECTILE_KIND. */
const SRC_KIND: readonly number[] = [Kind.Minion, Kind.Minion, Kind.Tower, Kind.Core, Kind.Hero, Kind.Hero, Kind.Hero, Kind.Hero, Kind.Hero];

const srcKindOf = (w: World, p: number): number => ((w.pFlags[p] & PFLAG.Reflected) !== 0 ? Kind.Hero : SRC_KIND[w.pKind[p]]);

function hitKind(w: World, p: number): 'basic' | 'ability' | 'tower' {
  if ((w.pFlags[p] & PFLAG.Reflected) !== 0) return 'ability';
  const k = w.pKind[p];
  if (k === PROJECTILE_KIND.tower || k === PROJECTILE_KIND.core) return 'tower';
  if (k <= PROJECTILE_KIND.hero || (w.pFlags[p] & PFLAG.Basic) !== 0) return 'basic';
  return 'ability';
}

/** Homing bolt `p` reaches `dst`. */
function landBolt(m: MatchHandle, p: number, dst: number): void {
  const w = m.world;
  if (w.team[dst] !== w.pTeam[p] && parryOpen(w, dst)) {
    const back = w.pOwner[p];
    if (back >= 0 && w.alive[back] === 1 && targetable(w, back, w.team[dst])) {
      w.pTarget[p] = back;
      w.pOwner[p] = dst;
      w.pTeam[p] = w.team[dst];
      w.pFlags[p] |= PFLAG.Reflected;
      return;
    }
  }
  w.pAlive[p] = 0;
  dealDamage(m, w.pOwner[p], w.pTeam[p], srcKindOf(w, p), dst, w.pDmg[p], hitKind(w, p));
}

function stepBolt(m: MatchHandle, p: number): void {
  const w = m.world;
  const dst = w.pTarget[p];
  if (dst < 0 || w.alive[dst] === 0 || w.untargT[dst] > 0) {
    w.pAlive[p] = 0;
    return;
  }
  if (guardBlocks(w, w.pTeam[p], w.pX[p], w.pY[p])) {
    w.pAlive[p] = 0;
    return;
  }
  const step = idiv(w.pSpeed[p], TICK_HZ);
  const dx = w.x[dst] - w.pX[p];
  const dy = w.y[dst] - w.pY[p];
  const d = isqrt(dx * dx + dy * dy);
  if (d <= step + radiusOf(w, dst)) {
    landBolt(m, p, dst);
    return;
  }
  w.pVx[p] = idiv(dx * step, d);
  w.pVy[p] = idiv(dy * step, d);
  w.pX[p] += w.pVx[p];
  w.pY[p] += w.pVy[p];
  if (guardBlocks(w, w.pTeam[p], w.pX[p], w.pY[p])) w.pAlive[p] = 0;
}

const cand = new Int32Array(ENTITY_CAP);
/** Along-segment keys: at most one tick's travel squared (well inside int32). */
const key = new Int32Array(ENTITY_CAP);

function applyOnHit(w: World, p: number, e: number): void {
  const fx = w.pEffect[p];
  if (fx === ON_HIT.Slow) slow(w, e, w.pEffA[p], w.pEffB[p]);
  else if (fx === ON_HIT.Reveal && w.kind[e] === Kind.Hero) reveal(w, e, w.pEffA[p]);
}

function stepSkillshot(m: MatchHandle, p: number): void {
  const w = m.world;
  const step = idiv(w.pSpeed[p], TICK_HZ);
  const move = Math.min(step, w.pTtl[p]);
  const ax = w.pX[p];
  const ay = w.pY[p];
  const bx = ax + idiv(w.pVx[p] * move, step);
  const by = ay + idiv(w.pVy[p] * move, step);
  w.pX[p] = bx;
  w.pY[p] = by;
  w.pTtl[p] -= move;
  if (guardBlocks(w, w.pTeam[p], bx, by)) {
    w.pAlive[p] = 0;
    return;
  }
  // Candidates the swept segment touches this tick, nearest first (ties: lowest id).
  let n = 0;
  for (let e = 0; e < RANGE.end; e++) {
    if (maskHas(w.pHitLo[p], w.pHitHi[p], e) || !isAbilityTarget(w, e, w.pTeam[p])) continue;
    const along = alongLine(ax, ay, bx, by, w.pRadius[p], w.x[e], w.y[e], radiusOf(w, e));
    if (along < 0) continue;
    let i = n++;
    while (i > 0 && key[i - 1] > along) {
      cand[i] = cand[i - 1];
      key[i] = key[i - 1];
      i--;
    }
    cand[i] = e;
    key[i] = along;
  }
  const owner = w.pOwner[p];
  const flags = w.pFlags[p];
  for (let i = 0; i < n; i++) {
    const e = cand[i];
    if (w.alive[e] === 0) continue;
    if (parryOpen(w, e)) {
      reflectSkillshot(w, p, e);
      return;
    }
    markHit(w, p, e);
    if ((flags & PFLAG.Capped) !== 0 && owner >= 0 && owner < RANGE.minions) {
      const slot = owner * ENTITY_CAP + e;
      if (w.volleyHits[slot] >= abil(w, owner).q.maxPerTarget) continue;
      w.volleyHits[slot]++;
    }
    const isHero = w.kind[e] === Kind.Hero;
    const dmg = isHero ? w.pDmg[p] : applyBp(w.pDmg[p], w.pBp[p]);
    dealDamage(m, owner, w.pTeam[p], srcKindOf(w, p), e, dmg, hitKind(w, p));
    applyOnHit(w, p, e);
    if ((flags & PFLAG.Pierce) !== 0) continue;
    if ((flags & PFLAG.HeroStop) !== 0 && !isHero) continue;
    w.pAlive[p] = 0;
    return;
  }
  if (w.pTtl[p] <= 0 || bx < 0 || by < 0 || bx > MAP.width || by > MAP.height) w.pAlive[p] = 0;
}

export function stepProjectiles(m: MatchHandle): void {
  const w = m.world;
  for (let p = 0; p < w.pAlive.length; p++) {
    if (w.pAlive[p] === 0) continue;
    if (w.pTarget[p] >= 0) stepBolt(m, p);
    else stepSkillshot(m, p);
  }
}
