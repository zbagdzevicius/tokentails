/**
 * QA round 3 balance (SIM_VERSION 8), with the planner bot (sim/planner.ts) on the daily rooms:
 * - freezing has a risk: a 0.5 s reaction is never caught but loses PERFECT CRIME in some rooms (red-pawed);
 * - the human matters: a cat that never freezes is caught before 30 s (botProblems, also Tuesday #2 / #9, Kitchen #8);
 * - waiting stays at or under 40 % (mirror once per 8 s, two humans never warn together);
 * - the Couch Potato's cones cover at least 60 % of the swat cells;
 * - the Bedroom has at least 14 props to knock off.
 * The rank table and the shell band live in content/rank-bot.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { propKind } from '../types';
import { content } from '../content';
import { botProblems } from '../content/validate';
import { plannerRun, swatCellCoverage } from './planner';

const day = (n: number) => content.resolve(content.dailyRoom(n), 'ranked', n);
const DAYS = Array.from({ length: 14 }, (_, i) => i + 1);

describe('QA round 3 balance (v8)', () => {
  it('feel rules hold on days 1–14 (never-freezing cat caught < 30 s, waiting <= 40 %)', () => {
    const bad: string[] = [];
    for (const n of DAYS) for (const p of botProblems(day(n))) bad.push(`day ${n}: ${p}`);
    expect(bad).toEqual([]);
  }, 120_000);

  it('a 0.5 s reaction is never caught, but red-pawed costs PERFECT CRIME somewhere', () => {
    let lost = 0;
    for (const n of DAYS) {
      const r = plannerRun(day(n), { react: 15 });
      expect(r.caughtTick, `day ${n}`).toBe(-1);
      if (r.maxSuspPct > 50) lost++;
    }
    expect(lost).toBeGreaterThanOrEqual(2);
    expect(lost).toBeLessThanOrEqual(10);
  }, 120_000);

  it('Couch Potato covers >= 60 % of the swat cells (Tuesday #2, #9)', () => {
    for (const n of [2, 9]) {
      const p = day(n);
      expect(p.routine.name).toBe('Couch Potato');
      expect(swatCellCoverage(p)).toBeGreaterThanOrEqual(60);
    }
  });

  it('the Bedroom has at least 14 props to knock off', () => {
    for (const n of [7, 14, 21, 28]) {
      const p = day(n);
      const W = p.shell.width;
      const knock = p.room.props.filter((q) => {
        const k = propKind(q.kind);
        const lv = p.shell.levels[q.z * W + q.x] ?? 0;
        return !!k && lv >= 1 && k.base > 0 && !k.grabbable && !k.pull && !k.actor && !k.enterable && k.tall === undefined;
      }).length;
      expect(knock, `day ${n}`).toBeGreaterThanOrEqual(14);
    }
  });
});
