/**
 * V20-CHASE.md §3: the chase regression gate (`npm run chase-gate`; not in `npm test`, it runs in the release check).
 * Every hero chases a fleeing enemy hero for 6 s through each command path (harness.ts) and must reach the v20
 * targets: a single order lands its swings, a held or tapped ATK with the stick toward the target reaches at least 95%
 * of the single order's hits and sends no stick move, an A-click on the target spams nothing away, no cancelled
 * windup keeps the attack timer spent, and Stilts lands every swing she starts.
 */
import { describe, expect, it } from 'vitest';
import { HERO_IDS } from '../../src/data/heroes';
import type { HeroId } from '../../src/sim/api';
import { run, type Path, type Result } from './harness';

const mean = <T,>(rs: readonly T[], f: (r: T) => number): number => rs.reduce((a, r) => a + f(r), 0) / Math.max(1, rs.length);
const PATHS: readonly Path[] = ['straight', 'zigzag', 'tower'];

describe('chase gate (V20-CHASE.md §3)', () => {
  const rows: { hero: HeroId; path: Path; order: Result; hold: Result[]; tap: Result[]; aclick: Result; amove: Result }[] = [];
  for (const hero of HERO_IDS)
    for (const path of PATHS)
      rows.push({
        hero,
        path,
        order: run(hero, path, 'order', 0),
        hold: [run(hero, path, 'hold', 0, 0), run(hero, path, 'hold', 0, 4)],
        tap: [run(hero, path, 'tap', 0, 0), run(hero, path, 'tap', 0, 4)],
        aclick: run(hero, path, 'aclick', 0),
        amove: run(hero, path, 'amove', 0),
      });

  it('a single Attack order at equal speed: melee >= 5.6 and ranged >= 5.7 hits in 6 s on average', () => {
    const melee = rows.filter((r) => !r.order.ranged);
    const ranged = rows.filter((r) => r.order.ranged);
    expect(mean(melee, (r) => r.order.hits)).toBeGreaterThanOrEqual(5.6);
    expect(mean(ranged, (r) => r.order.hits)).toBeGreaterThanOrEqual(5.7);
  });

  it('touch hold and tap (stick toward the target, 0 and 4 ticks of view lag) reach >= 95% of the single order, every path', () => {
    for (const path of PATHS) {
      for (const ranged of [false, true]) {
        const rs = rows.filter((r) => r.path === path && r.order.ranged === ranged);
        const order = mean(rs, (r) => r.order.hits);
        expect(mean(rs, (r) => mean(r.hold, (h) => h.hits)), `hold ${path} ${ranged ? 'R' : 'M'}`).toBeGreaterThanOrEqual(order * 0.95);
        expect(mean(rs, (r) => mean(r.tap, (h) => h.hits)), `tap ${path} ${ranged ? 'R' : 'M'}`).toBeGreaterThanOrEqual(order * 0.95);
      }
    }
  });

  it('the stick held within 90° of the locked living target sends no move (hold and tap, equal speed)', () => {
    for (const r of rows) for (const t of [...r.hold, ...r.tap]) expect(t.moves, `${r.hero} ${r.path} ${t.mode} lag ${t.lag}`).toBe(0);
  });

  it('desktop A-click every 250 ms, on the target or on the ground at it (attack-move), lands >= 5 hits in 6 s', () => {
    for (const r of rows) expect(r.aclick.hits, `${r.hero} ${r.path}`).toBeGreaterThanOrEqual(5);
    for (const r of rows) expect(r.amove.hits, `${r.hero} ${r.path} amove`).toBeGreaterThanOrEqual(5);
  });

  it('no cancelled windup leaves the attack timer spent (every path, every mode, dash included)', () => {
    let lost = 0;
    for (const r of rows) for (const t of [r.order, ...r.hold, ...r.tap, r.aclick, r.amove]) lost += t.timerLost;
    for (const hero of HERO_IDS) for (const path of ['dash', 'slowedMe'] as const) lost += run(hero, path, 'order', 0).timerLost;
    expect(lost).toBe(0);
  });

  it('no started swing is cancelled by the target walking out of range at equal speed (order, hold, tap)', () => {
    for (const r of rows) for (const t of [r.order, ...r.hold, ...r.tap]) expect(t.cancels.outOfRangeAtEnd ?? 0, `${r.hero} ${r.path} ${t.mode}`).toBe(0);
  });

  it('Stilts lands every swing she starts (no pounce out of her own windup)', () => {
    for (const r of rows.filter((q) => q.hero === 'stilts')) {
      expect(Object.values(r.order.cancels).reduce((a, b) => a + b, 0), r.path).toBe(0);
      expect(r.order.starts - r.order.hits, r.path).toBeLessThanOrEqual(1);
    }
  });
});
