/** Pickups (sim v4, data/pickups.ts, src/sim/units/pickup.ts): Frenzy Catnip and Fish Snack. */
import { describe, expect, it } from 'vitest';
import { CAPS, TOWER_SPOTS, mirrorX } from '../../src/data/map';
import { FRENZY_SPOTS, PICKUPS, SNACK_BEHIND } from '../../src/data/pickups';
import { ZOOMIES } from '../../src/data/xp';
import { snapshot, step } from '../../src/sim/index';
import { bonusDamage } from '../../src/sim/effects/bonus';
import { moveSpeed } from '../../src/sim/units/kinds';
import { ENTITY_CAP, G } from '../../src/sim/world';
import { PICKUP_ID_BASE } from '../../src/sim/api';
import { heroMatch, hold, place, steps } from './heroes/kit-helpers';

const match = () => {
  const m = heroMatch(['clem', 'sage', 'brutus', 'sage', 'brutus', 'cacklejaw']);
  for (let id = 0; id < 6; id++) place(m, id, 30000 + id * 6000, 30000, 0);
  hold(m, 0, 1, 2, 3, 4, 5);
  return m;
};

/** Step through tick `t` (the step taken at tick `t` runs that tick's spawns). */
const until = (m: ReturnType<typeof match>, t: number): void => {
  while (m.world.globals[G.Tick] <= t) step(m);
};

describe('pickups (sim v4)', () => {
  it('snapshot ids of pickups start right after the last unit id', () => {
    expect(PICKUP_ID_BASE).toBe(ENTITY_CAP);
  });

  it('Fish Snacks from 0:30 every 30 s, one per team behind its outer tower, lanes in turn; Frenzy pairs from 0:45 on the river', () => {
    const m = match();
    const w = m.world;
    expect(w.pkAlive.length).toBe(CAPS.pickups);
    until(m, PICKUPS.snack.first);
    const sunnyOuter = TOWER_SPOTS.find((s) => s.lane === 'sunny' && s.tier === 'outer')!;
    expect([w.pkAlive[2], w.pkTeam[2], w.pkX[2], w.pkY[2]]).toEqual([1, 0, sunnyOuter.x - SNACK_BEHIND, sunnyOuter.y]);
    expect([w.pkAlive[3], w.pkTeam[3], w.pkX[3], w.pkY[3]]).toEqual([1, 1, mirrorX(sunnyOuter.x - SNACK_BEHIND), sunnyOuter.y]);
    expect(m.events.filter((e) => e.type === 'pickupSpawn' && e.kind === 'snack')).toHaveLength(2);
    until(m, PICKUPS.frenzy.first);
    const spots = FRENZY_SPOTS[0];
    expect([w.pkAlive[0], w.pkX[0], w.pkY[0], w.pkAlive[1], w.pkX[1], w.pkY[1]]).toEqual([1, spots[0], spots[1], 1, spots[2], spots[3]]);
    expect(w.pkTeam[0]).toBe(2); // anyone may take it
    // Mirrored: the river spot is its own mirror, so neither team is closer.
    expect(mirrorX(w.pkX[0])).toBe(w.pkX[0]);
    // Snapshot: kind 'pickup' with `sub`, for both teams.
    for (const team of [0, 1] as const) {
      const pk = snapshot(m, team).entities.filter((e) => e.kind === 'pickup');
      expect(pk.map((e) => e.sub).sort()).toEqual(['frenzy', 'frenzy', 'snack', 'snack']);
    }
    // The next pair replaces the old one.
    until(m, PICKUPS.frenzy.first + PICKUPS.frenzy.every);
    const next = FRENZY_SPOTS[1];
    expect([w.pkX[0], w.pkY[0]]).toEqual([next[0], next[1]]);
  });

  it('Frenzy Catnip: +25% damage, +20% move speed for 8 s and 20% max HP back; `pickup` and `buff` events', () => {
    const m = match();
    const w = m.world;
    until(m, PICKUPS.frenzy.first);
    const speed = moveSpeed(w, 1);
    w.hp[1] = 100;
    place(m, 1, w.pkX[0], w.pkY[0]);
    step(m);
    expect(w.pkAlive[0]).toBe(0);
    expect(w.hp[1]).toBe(100 + Math.trunc((w.maxHp[1] * PICKUPS.frenzy.healBp) / 10000));
    expect(m.events.some((e) => e.type === 'pickup' && e.id === 1 && e.kind === 'frenzy' && e.team === 0)).toBe(true);
    expect(m.events.some((e) => e.type === 'buff' && e.id === 1 && e.kind === 'frenzy' && e.ticks === PICKUPS.frenzy.ticks)).toBe(true);
    expect(bonusDamage(w, 1, 100)).toBe(125);
    expect(moveSpeed(w, 1)).toBe(Math.trunc((speed * 12000) / 10000));
    steps(m, PICKUPS.frenzy.ticks);
    expect(bonusDamage(w, 1, 100)).toBe(100);
  });

  it("Fish Snack: only its team takes it; heals 35% and refreshes Zoomies", () => {
    const m = match();
    const w = m.world;
    until(m, PICKUPS.snack.first);
    // Woof's hero walks over Purrhaven's snack: nothing.
    place(m, 3, w.pkX[2], w.pkY[2]);
    step(m);
    expect(w.pkAlive[2]).toBe(1);
    place(m, 3, 30000 + 3 * 6000, 30000);
    w.hp[1] = 100;
    place(m, 1, w.pkX[2], w.pkY[2]);
    step(m);
    expect(w.pkAlive[2]).toBe(0);
    expect(w.hp[1]).toBe(100 + Math.trunc((w.maxHp[1] * PICKUPS.snack.healBp) / 10000));
    expect(w.zoomT[1]).toBe(ZOOMIES.ticks - 1); // refreshed, then this tick's countdown
    expect(m.events.some((e) => e.type === 'pickup' && e.id === 1 && e.kind === 'snack')).toBe(true);
  });
});
