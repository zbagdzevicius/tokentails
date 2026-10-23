/**
 * The novice player-bot (POC.md §7.2 tuning target, `npm run match -- --profile novice`): a scripted stand-in for a
 * new human in slot 0, following the first-match tips. It plays Sunny Lane all match: attack-moves with its wave
 * (behind the front allied minion, or in front of its own tower while no wave is out), steps back when an enemy
 * tower shoots it with no minion to tank, fights an enemy hero that comes close (after a human reaction time) and
 * casts whatever is ready at it with a rough aim, walks home when low and comes back when healed, and takes the
 * first talent. It never uses Nap, the Paw Trick, the rat camp or Pudding. It
 * reaches the sim only through commands, like a human.
 */
import { NOVICE } from '../../data/bots';
import { NO_TARGET, Op, type CastSlot, type Command } from '../api';
import { TRIG_ONE, dist2, iatan2, icos, idiv, isin, isqrt } from '../fixed';
import type { Rng } from '../rng';
import type { MatchHandle } from '../state';
import { G, Order, RANGE, TALENT_TIERS } from '../world';
import { canCast } from '../heroes/kit';
import { botTalentChoice, botTalentMode, unlockedTiers } from '../heroes/talents';
import type { BotMem } from './mem';
import { fountainX, fountainY, hpBp, laneFront, laneStructure, seenEnemy, sign, tanked, untankedThreat } from './sense';

const SUNNY = 0;
const NOVICE_MODE_HOME = 1;

/** An enemy hero in view within NOVICE.threatRange, or an enemy structure shooting hero `id`? */
function noviceThreat(w: MatchHandle['world'], id: number): boolean {
  const r2 = NOVICE.threatRange * NOVICE.threatRange;
  for (let e = RANGE.heroes; e < RANGE.minions; e++) {
    if (seenEnemy(w, w.team[id], e) && dist2(w.x[e], w.y[e], w.x[id], w.y[id]) <= r2) return true;
  }
  for (let t = RANGE.towers; t < RANGE.fountains; t++) if (w.alive[t] === 1 && w.team[t] !== w.team[id] && w.target[t] === id) return true;
  return false;
}

/** More visible enemy heroes than allies (self included) within NOVICE.countRange of hero `id`? */
function outnumbered(w: MatchHandle['world'], id: number): boolean {
  const r2 = NOVICE.countRange * NOVICE.countRange;
  let mine = 0;
  let theirs = 0;
  for (let h = RANGE.heroes; h < RANGE.minions; h++) {
    if (w.alive[h] === 0 || dist2(w.x[h], w.y[h], w.x[id], w.y[id]) > r2) continue;
    if (w.team[h] === w.team[id]) mine++;
    else if (seenEnemy(w, w.team[id], h)) theirs++;
  }
  return theirs > mine;
}

export function noviceThink(m: MatchHandle, id: number, mem: BotMem, rng: Rng): Command | null {
  const w = m.world;
  const tick = w.globals[G.Tick];
  if (w.alive[id] === 0) {
    mem.mode[id] = 0;
    return null;
  }
  for (let t = 0; t < unlockedTiers(w, id); t++) {
    if (w.talents[id * TALENT_TIERS + t] < 0) return { op: Op.Talent, tier: t as 0 | 1 | 2, choice: botTalentChoice(m.config.seed, id, t, botTalentMode(m)) };
  }
  if (w.castPhase[id] !== 0) return null;
  const team = w.team[id];
  const hp = hpBp(w, id);
  if (mem.mode[id] === NOVICE_MODE_HOME && hp >= NOVICE.returnHpBp) mem.mode[id] = 0;
  if (hp < NOVICE.retreatAlwaysBp || (hp < NOVICE.retreatHpBp && noviceThreat(w, id))) mem.mode[id] = NOVICE_MODE_HOME;
  if (mem.mode[id] === NOVICE_MODE_HOME) {
    const hx = fountainX(team);
    const hy = fountainY();
    if (w.order[id] === Order.Move && w.moveX[id] === hx) return null;
    return { op: Op.Move, x: hx, y: hy };
  }
  // Awareness (reaction time) of enemy heroes in fight range.
  let foe = -1;
  let foeD = 0;
  const r2 = NOVICE.fightRange * NOVICE.fightRange;
  for (let e = RANGE.heroes; e < RANGE.minions; e++) {
    const k = id * (RANGE.minions - RANGE.heroes) + e;
    const d = dist2(w.x[id], w.y[id], w.x[e], w.y[e]);
    if (!seenEnemy(w, team, e) || d > r2) {
      mem.seen[k] = -1;
      continue;
    }
    if (mem.seen[k] < 0) mem.seen[k] = tick;
    if (tick - mem.seen[k] < NOVICE.reactionTicks) continue;
    if (foe < 0 || d < foeD) {
      foe = e;
      foeD = d;
    }
  }
  // Beginner tips: no fight under an enemy tower nothing tanks, none while outnumbered.
  if (foe >= 0 && untankedThreat(w, team, w.x[foe], w.y[foe], 0) >= 0) foe = -1;
  if (foe >= 0 && (outnumbered(w, id) || (hp < NOVICE.fightHpBp && foe !== mem.foe[id]))) foe = -1;
  mem.foe[id] = foe;
  if (foe >= 0) {
    // Whatever is ready, aimed roughly at the foe (R first, like a new player mashing).
    for (let slot = 3; slot >= 0; slot--) {
      if (!canCast(w, id, slot)) continue;
      const a = iatan2(w.y[foe] - w.y[id], w.x[foe] - w.x[id]) + rng.range(-NOVICE.aimErrorSteps, NOVICE.aimErrorSteps);
      const d = Math.max(isqrt(foeD), 1);
      const x = w.x[id] + idiv(icos(a) * d, TRIG_ONE);
      const y = w.y[id] + idiv(isin(a) * d, TRIG_ONE);
      return { op: Op.Cast, slot: slot as CastSlot, x, y, id: slot === 3 ? foe : NO_TARGET };
    }
    if (w.order[id] === Order.Attack && w.target[id] === foe) return null;
    return { op: Op.Attack, id: foe };
  }
  const lane = SUNNY;
  // Tower fire with no minion to tank: step back to the own tower.
  const own = laneStructure(w, team, lane, true);
  for (let t = RANGE.towers; t < RANGE.fountains; t++) {
    if (w.alive[t] === 0 || w.team[t] === team || w.target[t] !== id || tanked(w, t, team)) continue;
    if (w.order[id] === Order.Move && w.moveX[id] === w.x[own]) return null;
    return { op: Op.Move, x: w.x[own], y: w.y[own] };
  }
  // Follow the wave: attack-move to just behind the front allied minion, else in front of the own tower.
  const front = laneFront(w, team, lane);
  const gx = front >= 0 ? w.x[front] - sign(team) * NOVICE.followBehind : w.x[own] + sign(team) * NOVICE.followBehind;
  const gy = front >= 0 ? w.y[front] : w.y[own];
  if (w.order[id] === Order.AttackMove && Math.abs(w.moveX[id] - gx) < NOVICE.followBehind && Math.abs(w.moveY[id] - gy) < NOVICE.followBehind) return null;
  return { op: Op.AttackMove, x: gx, y: gy };
}
