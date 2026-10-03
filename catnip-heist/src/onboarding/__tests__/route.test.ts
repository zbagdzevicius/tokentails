import { describe, expect, it } from 'vitest';
import { LEVEL_IDS, getLevel, getSolution } from '../../levels';
import { compileLevel, decodeInputs, initSim, isOpenTile, stepSim } from '../../sim';
import type { SimState } from '../../types';
import { MAX_PRINTS, buildRoute, pickLeg, routeGeometry, stageIndex } from '../route';

const allOpen = (n: number) => Array.from({ length: n }, () => true);

describe('ghost-paw route legs (plan G10 Heist)', () => {
  for (const id of LEVEL_IDS) {
    describe(id, () => {
      const level = getLevel(id);
      const solution = getSolution(id);
      const legs = buildRoute(level, solution);
      const c = compileLevel(level);

      it('has legs, each non-empty, with ticks in order', () => {
        expect(legs.length).toBeGreaterThan(1);
        let tick = 0;
        for (const leg of legs) {
          expect(leg.tiles.length).toBeGreaterThan(0);
          expect(leg.startTick).toBeGreaterThanOrEqual(tick);
          expect(leg.endTick).toBeGreaterThanOrEqual(leg.startTick);
          tick = leg.startTick;
        }
        expect(legs[legs.length - 1].endTick).toBe(solution.ticks);
      });

      it('is walkable: floor tiles only, each step to a neighbouring tile', () => {
        for (const leg of legs) {
          for (let k = 0; k < leg.tiles.length; k++) {
            const t = leg.tiles[k];
            expect(isOpenTile(c, t.x, t.y, allOpen(level.doors.length)), `${id} leg tile ${t.x},${t.y}`).toBe(true);
            if (k > 0) {
              const p = leg.tiles[k - 1];
              expect(Math.max(Math.abs(t.x - p.x), Math.abs(t.y - p.y))).toBe(1);
            }
          }
          for (const a of leg.actions) expect(a.at).toBeGreaterThanOrEqual(0), expect(a.at).toBeLessThan(leg.tiles.length);
        }
      });

      it('covers every objective stage the solution passes through, in order', () => {
        const stages = legs.map((l) => l.stage);
        for (let i = 1; i < stages.length; i++) expect(stages[i]).toBeGreaterThanOrEqual(stages[i - 1] === 0 || stages[i - 1] === 1 ? 0 : stages[i - 1]);
        expect(stages[stages.length - 1]).toBe(4);
        expect(new Set(stages).has(3)).toBe(true);
      });

      it('marks the presses that free the shelter cat', () => {
        expect(legs.some((l) => l.actions.some((a) => a.kind === 'act'))).toBe(true);
      });

      it('picks a leg for every state along the solution, and the prints are drawable', () => {
        const inputs = decodeInputs(solution.runs);
        let s: SimState = initSim(level, solution.seed, [solution.catIds[0], solution.catIds[1]]);
        for (let i = 0; i < inputs.length && !s.won; i++) {
          if (i % 45 === 0) {
            const pick = pickLeg(legs, level, s);
            expect(pick, `${id} tick ${s.tick}`).not.toBeNull();
            expect(pick!.leg.stage === stageIndex(level, s) || pick!.leg.stage > stageIndex(level, s)).toBe(true);
            const geo = routeGeometry(pick!);
            expect(geo.prints.length).toBeGreaterThan(0);
            expect(geo.prints.length).toBeLessThanOrEqual(MAX_PRINTS);
            for (const p of geo.prints) expect(Number.isFinite(p.x) && Number.isFinite(p.z) && Number.isFinite(p.rot)).toBe(true);
          }
          s = stepSim(level, s, inputs[i]);
        }
        expect(s.won).toBe(true);
      });
    });
  }

  it('starts the drawn route at the walking cat and points the first print along the walk', () => {
    const level = getLevel('heist-01');
    const legs = buildRoute(level, getSolution('heist-01'));
    const s = initSim(level, 1, ['bob', 'oreo']);
    const pick = pickLeg(legs, level, s)!;
    expect(pick.legIndex).toBe(0);
    expect(pick.from).toBe(0);
    expect(pick.needsSwap).toBe(false);
    const geo = routeGeometry(pick);
    const t0 = pick.leg.tiles[0];
    expect(Math.abs(geo.prints[0].x - (t0.x + 0.5))).toBeLessThan(0.2);
    expect(Math.abs(geo.prints[0].z - (t0.y + 0.5))).toBeLessThan(0.2);
    const t1 = pick.leg.tiles[1];
    // Toes point along (dx, dz): rot = atan2(-dx, -dz).
    const dx = t1.x - t0.x;
    const dz = t1.y - t0.y;
    expect(geo.prints[0].rot).toBeCloseTo(Math.atan2(-dx / Math.hypot(dx, dz), -dz / Math.hypot(dx, dz)), 5);
  });

  it('asks for a swap when the next leg belongs to the parked cat', () => {
    const level = getLevel('heist-01');
    const legs = buildRoute(level, getSolution('heist-01'));
    const i = legs.findIndex((l, k) => k > 0 && l.active !== legs[k - 1].active);
    expect(i).toBeGreaterThan(0);
    const before = legs[i - 1];
    expect(routeGeometry({ leg: before, legIndex: i - 1, from: 0, needsSwap: false, swapAfter: true }).marks.some((m) => m.kind === 'swap')).toBe(true);
  });
});
