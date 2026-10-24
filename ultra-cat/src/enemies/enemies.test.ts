import { describe, expect, it } from 'vitest';
import { applyDamage, ballistic, bossDamage, bounce, DOG_DAMAGE, phaseOf, ROOMBA_DAMAGE } from './bossmath';
import { drive, nearestStreet, snapToLane, streetAt, type Grid, type Mover } from './nav';
import { maxAlive, param, spawnInterval, Spawner, type SpawnSpec } from './spawn';

const spec: SpawnSpec = { delay: 8, every: 12, minEvery: 6, everyRamp: 1, max: 2, maxRamp: 30 };

describe('spawn rules', () => {
  it('interval shrinks with elapsed time down to the floor', () => {
    expect(spawnInterval(spec, 0)).toBe(12);
    expect(spawnInterval(spec, 20)).toBe(10);
    expect(spawnInterval(spec, 200)).toBe(6);
  });
  it('max alive grows every maxRamp seconds, never with maxRamp 0', () => {
    expect(maxAlive(spec, 0)).toBe(2);
    expect(maxAlive(spec, 29.9)).toBe(2);
    expect(maxAlive(spec, 60)).toBe(4);
    expect(maxAlive({ ...spec, maxRamp: 0 }, 999)).toBe(2);
  });
  it('param falls back to the default', () => {
    expect(param({ ...spec, params: { speed: 3 } }, 'speed', 1)).toBe(3);
    expect(param(spec, 'speed', 1)).toBe(1);
    expect(param(null, 'x', 5)).toBe(5);
  });
  it('spawner waits for delay, slots and unblocked time', () => {
    const s = new Spawner();
    s.reset(spec);
    expect(s.tick(7.9, 0, false)).toBe(false);
    expect(s.tick(8, 0, true)).toBe(false); // frozen / frenzy
    expect(s.tick(8, 0, false)).toBe(true);
    expect(s.tick(8.1, 1, false)).toBe(false); // interval
    expect(s.tick(8 + 11.3, 2, false)).toBe(false); // full
    expect(s.tick(8 + 11.3, 1, false)).toBe(true); // slot opened
    s.reset(null);
    expect(s.tick(1000, 0, false)).toBe(false);
  });
});

describe('boss math', () => {
  it('phases from hp fractions', () => {
    expect(phaseOf(40, 40, [0.5])).toBe(1);
    expect(phaseOf(20.5, 40, [0.5])).toBe(1);
    expect(phaseOf(19.9, 40, [0.5])).toBe(2);
    expect(phaseOf(120, 120, [0.66, 0.33])).toBe(1);
    expect(phaseOf(70, 120, [0.66, 0.33])).toBe(2);
    expect(phaseOf(30, 120, [0.66, 0.33])).toBe(3);
    expect(phaseOf(0, 120, [0.66, 0.33])).toBe(3);
  });
  it('damage table per GDD', () => {
    expect(bossDamage(DOG_DAMAGE, 'swat')).toBe(2);
    expect(bossDamage(DOG_DAMAGE, 'pounce')).toBe(4);
    expect(bossDamage(DOG_DAMAGE, 'laser', { frames: 1 })).toBeCloseTo(0.15);
    expect(bossDamage(DOG_DAMAGE, 'blast', { power: 3 })).toBe(12);
    expect(bossDamage(ROOMBA_DAMAGE, 'pounce')).toBe(8);
    expect(bossDamage(ROOMBA_DAMAGE, 'pounce', { dizzy: true })).toBe(12);
    expect(bossDamage(ROOMBA_DAMAGE, 'swat', { dizzy: true })).toBe(4);
    expect(bossDamage(ROOMBA_DAMAGE, 'laser', { frames: 2, dizzy: true })).toBeCloseTo(0.8);
    expect(bossDamage(ROOMBA_DAMAGE, 'blast', { power: 2, shield: true })).toBe(0);
    expect(applyDamage(3, 5)).toBe(0);
    expect(applyDamage(3, -5)).toBe(3);
  });
  it('ballistic lands on target', () => {
    const o = { x: 0, y: 0, z: 0 };
    const g = -90;
    ballistic(100, -30, 50, 2, g, o);
    const T = 2;
    expect(o.x * T).toBeCloseTo(100);
    expect(o.z * T).toBeCloseTo(50);
    expect(o.y * T + 0.5 * g * T * T).toBeCloseTo(-30);
  });
  it('bounce decays and stops', () => {
    expect(bounce(-40, 0.6)).toBeCloseTo(24);
    expect(bounce(-5, 0.6)).toBe(0);
  });
});

describe('street navigation', () => {
  const g: Grid = { n: 9, block: 100, half: 450 };
  it('snaps to the lane of the nearest street', () => {
    const m: Mover = { x: -340, z: 10, axis: 0, dir: 1, lane: 5 };
    snapToLane(g, m);
    expect(m.x).toBe(streetAt(g, nearestStreet(g, -340)) + 5);
  });
  it('turns toward the target at an intersection and closes the distance', () => {
    const m: Mover = { x: streetAt(g, 2) + 5, z: -340, axis: 0, dir: 1, lane: 5 };
    const tx = 300;
    const tz = -300;
    let d0 = Math.hypot(tx - m.x, tz - m.z);
    for (let i = 0; i < 400; i++) drive(g, m, 2, tx, tz, false);
    const d1 = Math.hypot(tx - m.x, tz - m.z);
    expect(d1).toBeLessThan(d0 * 0.5);
    // stays on a street lane
    const onX = Math.abs(((m.x + g.half) % g.block + g.block) % g.block - 5) < 0.01 || Math.abs((((m.x + g.half) % g.block) + g.block) % g.block - 95) < 0.01;
    const onZ = Math.abs((((m.z + g.half) % g.block) + g.block) % g.block - 5) < 0.01 || Math.abs((((m.z + g.half) % g.block) + g.block) % g.block - 95) < 0.01;
    expect(onX || onZ).toBe(true);
    d0 = d1;
  });
  it('flees away from the target', () => {
    const m: Mover = { x: streetAt(g, 4) + 5, z: 0, axis: 0, dir: 1, lane: 5 };
    for (let i = 0; i < 100; i++) drive(g, m, 2, 0, 0, true);
    expect(Math.hypot(m.x, m.z)).toBeGreaterThan(150);
  });
  it('turns around at the city edge', () => {
    const m: Mover = { x: streetAt(g, 4) + 5, z: 440, axis: 0, dir: 1, lane: 5 };
    drive(g, m, 10, 0, 9999, false);
    expect(m.dir).toBe(-1);
    expect(Math.abs(m.z)).toBeLessThanOrEqual(g.half - 6);
  });
});
