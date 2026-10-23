import { describe, expect, it } from 'vitest';
import { MINIONS } from '../../src/data/minions';
import { TIMELINE } from '../../src/data/timeline';
import { result, snapshot, step } from '../../src/sim/index';
import { LANE_PATHS } from '../../src/sim/map/lanes';
import { RANGE } from '../../src/sim/world';
import { quietMatch } from './sim-helpers';

const minions = (m: ReturnType<typeof quietMatch>) => snapshot(m, 0).entities.filter((e) => e.kind === 'minion');

describe('minion waves (§7.1)', { timeout: 120000 }, () => {
  it('lane paths run core to core, mirrored for Woof', () => {
    const p0 = LANE_PATHS[0][0];
    const p1 = LANE_PATHS[1][0];
    expect([p0.x[0], p0.y[0]]).toEqual([10000, 30000]);
    expect([p0.x[p0.length - 1], p0.y[p0.length - 1]]).toEqual([90000, 30000]);
    for (let i = 0; i < p0.length; i++) expect([p1.x[i], p1.y[i]]).toEqual([100000 - p0.x[i], p0.y[i]]);
  });
  it('the first wave is 2 melee + 1 ranged per lane per team at 0:30', () => {
    const m = quietMatch();
    while (m.world.globals[0] < TIMELINE.firstWave) step(m);
    expect(minions(m)).toHaveLength(0);
    step(m);
    const list = minions(m);
    expect(list).toHaveLength(12);
    for (const team of [0, 1]) {
      for (const lane of ['sunny', 'puddle']) {
        const v = list.filter((e) => e.team === team && e.lane === lane).map((e) => e.variant).sort();
        expect(v).toEqual(['melee', 'melee', 'ranged']);
      }
    }
    expect(list.find((e) => e.variant === 'melee')!.maxHp).toBe(MINIONS.melee.hp);
  });
  it('from 2:00 every 3rd wave adds a siege; HP grows 3% a minute', () => {
    const m = quietMatch();
    // The first wave at or after TIMELINE.siegeFrom (sim v4: 2:00) carries the first siege.
    const at = TIMELINE.firstWave + Math.ceil((TIMELINE.siegeFrom - TIMELINE.firstWave) / TIMELINE.waveEvery) * TIMELINE.waveEvery;
    while (m.world.globals[0] <= at) step(m);
    const growth = Math.trunc(at / TIMELINE.minute) * 300; // +3% a whole minute
    const siege = minions(m).filter((e) => e.variant === 'siege');
    expect(siege).toHaveLength(4);
    expect(siege[0].maxHp).toBe(MINIONS.siege.hp + Math.trunc((MINIONS.siege.hp * growth) / 10000));
    const melee = minions(m).filter((e) => e.variant === 'melee' && e.maxHp > MINIONS.melee.hp);
    expect(melee.length).toBeGreaterThan(0);
    expect(Math.max(...melee.map((e) => e.maxHp))).toBe(MINIONS.melee.hp + Math.trunc((MINIONS.melee.hp * growth) / 10000));
  });
  it('waves walk their lane and meet at the river', () => {
    const m = quietMatch();
    while (m.world.globals[0] < TIMELINE.firstWave + 30 * 25) step(m);
    const xs = minions(m).map((e) => [e.team, e.x] as const);
    expect(xs.some(([t, x]) => t === 0 && x > 40000)).toBe(true);
    expect(xs.some(([t, x]) => t === 1 && x < 60000)).toBe(true);
  });
  it('an unopposed push takes the outer, then the inner, then the core', () => {
    const m = quietMatch(1);
    const w = m.world;
    const order: string[] = [];
    while (!result(m)) {
      step(m);
      for (let id = RANGE.minions; id < RANGE.towers; id++) if (w.team[id] === 1) w.alive[id] = 0; // no Woof minions
      for (const e of m.events) if (e.type === 'tower') order.push(w.sub[e.id] === 0 ? 'outer' : 'inner');
    }
    expect(order).toEqual(['outer', 'outer', 'inner', 'inner']);
    const res = result(m)!;
    expect(res.reason).toBe('core');
    expect(res.winner).toBe(0);
    expect(w.alive[RANGE.cores + 1]).toBe(0);
    expect(w.alive[RANGE.cores]).toBe(1);
  });
});
