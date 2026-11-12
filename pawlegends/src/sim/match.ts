/**
 * Win check and the result record (POC.md §4.3 step 9, §7.3). A destroyed core loses; if both cores fall on the
 * same tick, or at the 11:00 safety end, the lower core HP loses, then the higher total tower damage wins, then a
 * seeded coin. Sim v10 (GAPS B2): a forfeit applied this tick (input.ts) loses for the human's team, unless a core fell on
 * the same tick (that result stands).
 */
import { TIMELINE } from '../data/timeline';
import { HUMAN_SLOT, PVP_LEAD1, teamOfSlot, type MatchResult, type Team } from './api';
import { hashHex } from './hash';
import { Rng } from './rng';
import type { MatchHandle } from './state';
import { G, RANGE, TEAM_PURRHAVEN, TEAM_WOOF, hashWorld, type World } from './world';
import { mutOf } from './mutator';

/** Lower core HP loses; tie-break total tower damage dealt; then a seeded coin. */
export function tieBreakWinner(w: World, seed: number): Team {
  const c0 = w.hp[RANGE.cores];
  const c1 = w.hp[RANGE.cores + 1];
  if (c0 !== c1) return c0 > c1 ? 0 : 1;
  const d0 = w.globals[G.TowerDamage0];
  const d1 = w.globals[G.TowerDamage1];
  if (d0 !== d1) return d0 > d1 ? 0 : 1;
  return new Rng(seed).fork('coin').int(2) === 0 ? 0 : 1;
}

/**
 * Sim v22 (WR-BS-PLAN.md §4.2): the winner at a Blitz match's hard end, objective first: more enemy towers destroyed,
 * then the higher own core HP share, then more takedowns, then more structure damage dealt; all equal is a draw (−1).
 * No coin: a draw is a result.
 */
export function timeUpWinner(w: World): Team | -1 {
  const t0 = w.globals[G.Towers0];
  const t1 = w.globals[G.Towers1];
  if (t0 !== t1) return t0 > t1 ? 0 : 1;
  // core HP share, compared exactly by cross-multiplying (core HP stays far below 2^26, so the products are exact)
  const s0 = w.hp[RANGE.cores] * w.maxHp[RANGE.cores + 1];
  const s1 = w.hp[RANGE.cores + 1] * w.maxHp[RANGE.cores];
  if (s0 !== s1) return s0 > s1 ? 0 : 1;
  const k0 = w.globals[G.Kills0];
  const k1 = w.globals[G.Kills1];
  if (k0 !== k1) return k0 > k1 ? 0 : 1;
  const d0 = w.globals[G.TowerDamage0];
  const d1 = w.globals[G.TowerDamage1];
  if (d0 !== d1) return d0 > d1 ? 0 : 1;
  return -1;
}

const END_REASON: Readonly<Record<MatchResult['reason'], number>> = Object.freeze({ core: 1, safetyEnd: 2, forfeit: 3, timeUp: 4 });

export function endMatch(m: MatchHandle, winner: Team | -1, reason: MatchResult['reason']): void {
  const w = m.world;
  w.globals[G.Winner] = winner;
  w.globals[G.EndReason] = END_REASON[reason];
  const h = hashWorld(w);
  for (const s of m.stats) s.level = w.level[s.slot];
  m.ended = {
    outcome: winner === teamOfSlot(HUMAN_SLOT) ? 'won' : 'lost',
    winner,
    reason,
    ticks: w.globals[G.Tick],
    finalHash: hashHex(h),
    stats: m.stats.map((s) => ({ ...s })),
    ...(winner === -1 ? { draw: true as const } : {}),
  };
}

/** Step 9 (after the tick counter advanced). */
export function checkWin(m: MatchHandle): void {
  const w = m.world;
  const dead0 = w.alive[RANGE.cores] === 0;
  const dead1 = w.alive[RANGE.cores + 1] === 0;
  if (dead0 && dead1) endMatch(m, tieBreakWinner(w, m.config.seed), 'core');
  else if (dead0) endMatch(m, TEAM_WOOF, 'core');
  else if (dead1) endMatch(m, TEAM_PURRHAVEN, 'core');
  else if (m.pvp) {
    // Sim v16 S-PvP (V16.md §3.1.5): each team's lead carries its team's surrender. Both on one tick: the tie-break.
    const ff0 = m.gate.forfeit;
    const ff1 = m.party?.gates[PVP_LEAD1]?.forfeit === true;
    if (ff0 && ff1) endMatch(m, tieBreakWinner(w, m.config.seed), 'forfeit');
    else if (ff0) endMatch(m, TEAM_WOOF, 'forfeit');
    else if (ff1) endMatch(m, TEAM_PURRHAVEN, 'forfeit');
    else if (w.globals[G.Tick] >= TIMELINE.safetyEnd) endMatch(m, tieBreakWinner(w, m.config.seed), 'safetyEnd');
  } else if (m.gate.forfeit) endMatch(m, teamOfSlot(HUMAN_SLOT) === TEAM_PURRHAVEN ? TEAM_WOOF : TEAM_PURRHAVEN, 'forfeit');
  // Sim v22: a mutator's designed end (Blitz 3:15); PvP never plays a mutator.
  else if (mutOf(w).hardEnd > 0 && w.globals[G.Tick] >= mutOf(w).hardEnd) endMatch(m, timeUpWinner(w), 'timeUp');
  else if (w.globals[G.Tick] >= TIMELINE.safetyEnd) endMatch(m, tieBreakWinner(w, m.config.seed), 'safetyEnd');
}
