import { describe, expect, it } from 'vitest';
import { CAPS } from '../../src/data/map';
import { ENTITY_CAP, RANGE, allocMinion, allocProjectile, allocZone, createWorld, hashedArrays } from '../../src/sim/world';

describe('world SoA', () => {
  it('has the §4.1 caps with ascending id ranges', () => {
    expect(RANGE.heroes).toBe(0);
    expect(RANGE.minions - RANGE.heroes).toBe(CAPS.heroes);
    expect(RANGE.towers - RANGE.minions).toBe(40);
    expect(RANGE.cores - RANGE.towers).toBe(8);
    expect(RANGE.fountains - RANGE.cores).toBe(2);
    expect(RANGE.camps - RANGE.fountains).toBe(2);
    expect(RANGE.pudding - RANGE.camps).toBe(4);
    expect(RANGE.end - RANGE.pudding).toBe(1);
    expect(ENTITY_CAP).toBe(63);
    const w = createWorld(1);
    expect(w.pAlive.length).toBe(48);
    expect(w.zAlive.length).toBe(24);
    expect(w.x.length).toBe(ENTITY_CAP);
  });
  it('every typed array is hashed', () => {
    const w = createWorld(1);
    const typed = Object.values(w).filter((v) => ArrayBuffer.isView(v));
    expect(hashedArrays(w).length).toBe(typed.length);
  });
  it('allocates the lowest free slot', () => {
    const w = createWorld(1);
    expect(allocProjectile(w)).toBe(0);
    w.pAlive[0] = 1;
    expect(allocProjectile(w)).toBe(1);
    w.zAlive.fill(1);
    expect(allocZone(w)).toBe(-1);
    expect(allocMinion(w)).toBe(RANGE.minions);
  });
});
