/**
 * GAPS A2: the match grade (S/A/B/C), the MVP and "Best on your team" on a loss. Pure: it reads only
 * `MatchResult.stats` and `winner`, so it never touches the sim, a replay or its hash.
 *
 * Score in 0..1, weighted by role. Sim v10 (GAPS B0) adds damage taken, heal and shield to `SlotStats`, so the
 * frontline roles grade on what they do (a v9 result has neither: those shares are 0):
 *   KP = (K + A) / max(1, team kills), D = 1 − deaths / (deaths + 3), shares are of the slot's own team.
 *   Carry (fighter, marksman, assassin, mage): 0.35·KP + 0.25·heroDmgShare + 0.20·towerDmgShare + 0.20·D
 *   Tank:    0.35·KP + 0.25·takenShare      + 0.05·heroDmgShare + 0.10·towerDmgShare + 0.25·D
 *   Support: 0.35·KP + 0.25·healShieldShare + 0.05·heroDmgShare + 0.10·towerDmgShare + 0.25·D
 * Thresholds are per role, calibrated with `node tools/grade-calibrate.mjs` (headless Normal-profile human vs Normal
 * bots, 1,400 seeds a hero) toward 12% S, 30% A, 35% B and 23% C, with at least 25% of losses graded A or S.
 *
 * Rewards: Treat XP only (never catnip). The ladder uses the grade in place of the old KDA impact (not on top of it).
 */
import { HEROES } from '../data/heroes';
import type { HeroRole } from '../data/heroes';
import type { HeroId, MatchResult, SlotStats } from '../sim/api';

export type Grade = 'S' | 'A' | 'B' | 'C';
export const GRADES: readonly Grade[] = Object.freeze(['S', 'A', 'B', 'C'] as Grade[]);

export interface GradeWeights {
  kp: number;
  heroDmg: number;
  towerDmg: number;
  alive: number;
  /** Sim v10: share of the team's damage taken (tank). */
  taken: number;
  /** Sim v10: share of the team's heal and shield given (support). */
  healShield: number;
}

/** The weight sets (GAPS A2; tank and support use the v10 stats, GAPS B0). Each sums to 1. */
export const GRADE_WEIGHTS: Readonly<{ carry: GradeWeights; tank: GradeWeights; support: GradeWeights }> = Object.freeze({
  carry: Object.freeze({ kp: 0.35, heroDmg: 0.25, towerDmg: 0.2, alive: 0.2, taken: 0, healShield: 0 }),
  tank: Object.freeze({ kp: 0.35, heroDmg: 0.05, towerDmg: 0.1, alive: 0.25, taken: 0.25, healShield: 0 }),
  support: Object.freeze({ kp: 0.35, heroDmg: 0.05, towerDmg: 0.1, alive: 0.25, taken: 0, healShield: 0.25 }),
});

/** Roles that grade on their own frontline weights (tank: Sir Brutus, Lambo; support: Gabė). */
export const FRONTLINE_ROLES: readonly HeroRole[] = Object.freeze(['tank', 'support'] as HeroRole[]);

/**
 * Lowest score for S, A and B, per role (below B is C). Calibrated 2026-10-20 (tools/grade-calibrate.mjs: Normal human
 * vs Normal bots, random trick), fit on 1,400 seeds a hero (1..600, 1001..1400, 2001..2400); GAPS starting values were
 * S 0.72 / A 0.55 / B 0.40, which gave under 6% S on every role. Carry roles were fit on sim v9 and still pass the
 * GAPS §7 gate (±5 points per role) on the v10 fit set. Tank and support were refit on sim v10 for their frontline
 * weights (GAPS B0); held out on 3001..3400 they land within 2.5 points of every target (tank 11.6/29.3/34.8/24.4,
 * support 14.5/30.8/32.8/22.0; losses graded A/S 31.9% and 36.7%). On that held-out block fighter (one hero) is 5.5
 * points off on B; at 400 seeds the sampling error alone is about 3 points. Re-run it after any balance or SlotStats
 * change.
 */
export const GRADE_THRESHOLDS: Readonly<Record<HeroRole, Readonly<{ S: number; A: number; B: number }>>> = Object.freeze({
  fighter: Object.freeze({ S: 0.615, A: 0.524, B: 0.433 }),
  marksman: Object.freeze({ S: 0.616, A: 0.527, B: 0.441 }),
  assassin: Object.freeze({ S: 0.609, A: 0.528, B: 0.443 }),
  mage: Object.freeze({ S: 0.613, A: 0.521, B: 0.43 }),
  tank: Object.freeze({ S: 0.59, A: 0.516, B: 0.444 }),
  support: Object.freeze({ S: 0.726, A: 0.65, B: 0.573 }),
});

/** Treat XP for the grade (GAPS A2). Never catnip. */
export const GRADE_TREAT_XP: Readonly<Record<Grade, number>> = Object.freeze({ S: 40, A: 25, B: 10, C: 0 });

/**
 * The ladder share by grade (replaces `impactOf`): a win pays `win` × the step, a loss costs `loss` × the step.
 * An S or A loss costs half (GAPS A2), a B loss three quarters, a C loss all of it; a C win (along for the ride) pays
 * 60%. Tuned so the average climb per match stays near `impactOf`'s: on 1,400 cached seeds a hero (Normal, +25/−12) it
 * is 85–110% of the old rule per role (all roles about 6.5 vs 7.1 points a match).
 */
export const GRADE_LADDER: Readonly<Record<Grade, Readonly<{ win: number; loss: number }>>> = Object.freeze({
  S: Object.freeze({ win: 1, loss: 0.5 }),
  A: Object.freeze({ win: 1, loss: 0.5 }),
  B: Object.freeze({ win: 0.9, loss: 0.75 }),
  C: Object.freeze({ win: 0.6, loss: 1 }),
});

export const roleOf = (hero: HeroId): HeroRole => HEROES[hero].role;
export const weightsFor = (role: HeroRole): GradeWeights => (role === 'tank' ? GRADE_WEIGHTS.tank : role === 'support' ? GRADE_WEIGHTS.support : GRADE_WEIGHTS.carry);
const teamOf = (slot: number): 0 | 1 => (slot < 3 ? 0 : 1);
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

export interface GradeParts {
  kp: number;
  heroDmgShare: number;
  towerDmgShare: number;
  alive: number;
  takenShare: number;
  healShieldShare: number;
}

/** A stat, 0 when missing (a v9 result has no `damageTaken` or `healShield`) or negative. */
const stat = (s: SlotStats, k: 'kills' | 'heroDamage' | 'towerDamage' | 'damageTaken' | 'healShield'): number => Math.max(0, s[k] ?? 0);

/** The inputs for one slot, from the whole match's stats (shares are of its own team). Pure. */
export function gradeParts(stats: readonly SlotStats[], slot: number): GradeParts {
  const me = stats.find((s) => s.slot === slot);
  if (!me) return { kp: 0, heroDmgShare: 0, towerDmgShare: 0, alive: 0, takenShare: 0, healShieldShare: 0 };
  const mates = stats.filter((s) => teamOf(s.slot) === teamOf(slot));
  const sum = (k: 'kills' | 'heroDamage' | 'towerDamage' | 'damageTaken' | 'healShield'): number => mates.reduce((t, s) => t + stat(s, k), 0);
  const share = (k: 'heroDamage' | 'towerDamage' | 'damageTaken' | 'healShield'): number => clamp01(stat(me, k) / Math.max(1, sum(k)));
  return {
    kp: clamp01((me.kills + me.assists) / Math.max(1, sum('kills'))),
    heroDmgShare: share('heroDamage'),
    towerDmgShare: share('towerDamage'),
    alive: 1 - Math.max(0, me.deaths) / (Math.max(0, me.deaths) + 3),
    takenShare: share('damageTaken'),
    healShieldShare: share('healShield'),
  };
}

/** The 0..1 score for one slot. Pure. */
export function gradeScore(stats: readonly SlotStats[], slot: number): number {
  const me = stats.find((s) => s.slot === slot);
  if (!me) return 0;
  const w = weightsFor(roleOf(me.hero));
  const p = gradeParts(stats, slot);
  return w.kp * p.kp + w.heroDmg * p.heroDmgShare + w.towerDmg * p.towerDmgShare + w.alive * p.alive + w.taken * p.takenShare + w.healShield * p.healShieldShare;
}

/** The letter for a score on this role's thresholds. Pure. */
export function gradeOf(score: number, role: HeroRole): Grade {
  const t = GRADE_THRESHOLDS[role];
  return score >= t.S ? 'S' : score >= t.A ? 'A' : score >= t.B ? 'B' : 'C';
}

export interface SlotGrade {
  slot: number;
  hero: HeroId;
  score: number;
  grade: Grade;
}

export interface MatchGrades {
  /** Every slot, in `stats` order. */
  slots: SlotGrade[];
  /** The MVP: the best score on the winning team. */
  mvp: number;
  /** The best score on each team (team 0 = Purrhaven). The losing team's is "Best on your team" when it is ours. */
  best: [number, number];
}

/** Highest score, then more takedowns (K + A), then the lower slot. */
function bestOf(rows: readonly SlotGrade[], stats: readonly SlotStats[]): number {
  const td = (slot: number): number => {
    const s = stats.find((x) => x.slot === slot);
    return s ? s.kills + s.assists : 0;
  };
  let best = rows[0];
  for (const r of rows.slice(1)) {
    if (r.score > best.score + 1e-9 || (Math.abs(r.score - best.score) <= 1e-9 && (td(r.slot) > td(best.slot) || (td(r.slot) === td(best.slot) && r.slot < best.slot)))) best = r;
  }
  return best ? best.slot : -1;
}

/** Grades, the MVP and the best on each team, for a finished match. Pure. */
export function gradeMatch(result: Pick<MatchResult, 'stats' | 'winner'>): MatchGrades {
  const slots = result.stats.map((s) => {
    const score = gradeScore(result.stats, s.slot);
    return { slot: s.slot, hero: s.hero, score, grade: gradeOf(score, roleOf(s.hero)) };
  });
  const best: [number, number] = [bestOf(slots.filter((r) => teamOf(r.slot) === 0), result.stats), bestOf(slots.filter((r) => teamOf(r.slot) === 1), result.stats)];
  return { slots, mvp: best[result.winner], best };
}
