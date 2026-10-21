/**
 * Win check and the result record (POC.md §4.3 step 9, §7.3). A destroyed core loses; if both cores fall on the
 * same tick, or at the 11:00 safety end, the lower core HP loses, then the higher total tower damage wins, then a
 * seeded coin. Sim v10 (GAPS B2): a forfeit applied this tick (input.ts) loses for the human's team, unless a core fell on
 * the same tick (that result stands).
 */
import { TIMELINE } from '../data/timeline';
import { HUMAN_SLOT, teamOfSlot, type MatchResult, type Team } from './api';
import { hashHex } from './hash';
import { Rng } from './rng';
import type { MatchHandle } from './state';
import { G, RANGE, TEAM_PURRHAVEN, TEAM_WOOF, hashWorld, type World } from './world';

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

export function endMatch(m: MatchHandle, winner: Team, reason: MatchResult['reason']): void {
  const w = m.world;
  w.globals[G.Winner] = winner;
  w.globals[G.EndReason] = reason === 'core' ? 1 : reason === 'safetyEnd' ? 2 : 3;
  const h = hashWorld(w);
  for (const s of m.stats) s.level = w.level[s.slot];
  m.ended = {
    outcome: winner === teamOfSlot(HUMAN_SLOT) ? 'won' : 'lost',
    winner,
    reason,
    ticks: w.globals[G.Tick],
    finalHash: hashHex(h),
    stats: m.stats.map((s) => ({ ...s })),
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
  else if (m.gate.forfeit) endMatch(m, teamOfSlot(HUMAN_SLOT) === TEAM_PURRHAVEN ? TEAM_WOOF : TEAM_PURRHAVEN, 'forfeit');
  else if (w.globals[G.Tick] >= TIMELINE.safetyEnd) endMatch(m, tieBreakWinner(w, m.config.seed), 'safetyEnd');
}
