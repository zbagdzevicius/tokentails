/**
 * The scoreboard a device history row keeps (founder, Nov 19: "I can't see stats of last match"): both teams' level,
 * K / D / A, CS, Fish, Toys, damage dealt and taken, grade, MVP and SVP, from the match's own result, so Profile →
 * Matches opens the full detail at once, before (or without) the account's row. The account's row keeps the same
 * numbers from its verified re-run. Pure; display only (never posted).
 */
import { teamOfSlot, type MapId, type MatchResult } from '../sim/api';
import type { MatchGrades } from '../meta/grade';
import type { LocalBoard } from './store';

const n0 = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : 0);

export function boardOf(
  result: Pick<MatchResult, 'stats' | 'winner' | 'reason' | 'draw'>,
  grades: Pick<MatchGrades, 'slots' | 'mvp' | 'best'> | null,
  o: { map?: string; mutator?: string; names?: readonly (string | null | undefined)[]; humans: ReadonlySet<number>; me: number },
): LocalBoard | null {
  if (!Array.isArray(result.stats) || !result.stats.length) return null;
  const map = o.map as MapId | undefined;
  const winner: 0 | 1 | -1 = result.draw || result.winner === -1 ? -1 : result.winner === 1 ? 1 : 0;
  const players = result.stats
    .filter((st) => Number.isInteger(st.slot) && st.slot >= 0)
    .map((st) => ({
      s: st.slot,
      t: teamOfSlot(st.slot, map),
      h: String(st.hero),
      n: o.humans.has(st.slot) ? (o.names?.[st.slot] ?? null) : null,
      bot: !o.humans.has(st.slot),
      lv: n0(st.level),
      k: n0(st.kills),
      d: n0(st.deaths),
      a: n0(st.assists),
      hd: n0(st.heroDamage),
      dt: n0(st.damageTaken),
      td: n0(st.towerDamage),
      hs: n0(st.healShield),
      f: n0(st.fish),
      ty: n0(st.toys),
      cs: n0(st.lastHits),
      g: grades?.slots.find((g) => g.slot === st.slot)?.grade ?? null,
    }))
    .sort((a, b) => a.s - b.s);
  if (!players.some((p) => p.s === o.me)) return null;
  const mvp = grades && grades.mvp >= 0 ? grades.mvp : null;
  // the SVP: the best on the losing team (none on a draw, where the MVP is the better of both teams' bests)
  const svp = grades && winner !== -1 ? (grades.best[winner === 0 ? 1 : 0] ?? null) : null;
  return {
    winner,
    reason: result.reason ?? null,
    mvp,
    svp: svp !== null && svp >= 0 ? svp : null,
    ...(o.mutator && o.mutator !== 'none' ? { mutator: o.mutator } : {}),
    players,
  };
}
