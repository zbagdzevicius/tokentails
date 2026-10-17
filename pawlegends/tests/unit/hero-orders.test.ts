import { describe, expect, it } from 'vitest';
import { Op } from '../../src/sim/api';
import { respawnTicks, resolveDeaths } from '../../src/sim/combat/damage';
import { step } from '../../src/sim/index';
import { lineClear } from '../../src/sim/map/grid';
import { G, Order } from '../../src/sim/world';
import { putHero, putMinion, quietMatch } from './sim-helpers';

describe('hero orders (M1 subset)', () => {
  it('the gate barrier holds heroes behind x = 8 m for the first 10 s', () => {
    const m = quietMatch();
    step(m, [{ op: Op.Move, x: 30000, y: 30000 }]);
    for (let t = 1; t < 299; t++) step(m);
    expect(m.world.x[0]).toBeLessThanOrEqual(8000);
    for (let t = 0; t < 60; t++) step(m);
    expect(m.world.x[0]).toBeGreaterThan(8000);
  });
  it('a move order walks around a wall to the exact point', () => {
    const m = quietMatch();
    m.world.globals[G.Tick] = 300; // barrier down
    putHero(m, 0, 27000, 34000);
    step(m, [{ op: Op.Move, x: 27000, y: 44000 }]);
    expect(lineClear(m.grid, 27000, 34000, 27000, 44000)).toBe(false);
    for (let t = 0; t < 30 * 6 && m.world.order[0] !== Order.None; t++) step(m);
    expect([m.world.x[0], m.world.y[0]]).toEqual([27000, 44000]);
  });
  it('an attack order chases and hits; the hero auto-attacks what stands in range', () => {
    const m = quietMatch();
    m.world.globals[G.Tick] = 300;
    putHero(m, 0, 20000, 30000);
    const id = putMinion(m, 1, 24000, 30500);
    step(m, [{ op: Op.Attack, id }]);
    for (let t = 0; t < 90; t++) step(m);
    expect(m.world.hp[id]).toBeLessThan(300);
    expect(m.stats[0].heroDamage).toBe(0); // minions are not hero damage
  });
  it('a dead hero respawns at its fountain after 4 s + 0.8 s × level', () => {
    const m = quietMatch();
    putHero(m, 0, 40000, 30000);
    m.world.hp[0] = 0;
    resolveDeaths(m);
    expect(m.world.alive[0]).toBe(0);
    expect(m.world.timer[0]).toBe(respawnTicks(1, 0));
    expect(respawnTicks(1, 0)).toBe(144);
    expect(respawnTicks(10, 0)).toBe(360);
    expect(respawnTicks(1, 14400)).toBe(216);
    for (let t = 0; t < 144; t++) step(m);
    expect(m.world.alive[0]).toBe(1);
    expect(m.world.x[0]).toBeLessThan(6000);
    expect(m.stats[0].deaths).toBe(1);
  });
});
