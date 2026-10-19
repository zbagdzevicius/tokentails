import { describe, expect, it } from 'vitest';
import { WALLS } from '../../src/data/map';
import { dealDamage } from '../../src/sim/combat/damage';
import {
  addShield, attackSpeed, blink, charm, cooldownRate, dash, fear, haste, heal, inCone, inFront, inLine, inRing, knockback,
  lowestHpEnemyHero, reveal, root, slow, spawnBurst, stealth, stun,
} from '../../src/sim/effects';
import { EFFECTS, ZONE_KIND } from '../../src/data/effects';
import { isqrt } from '../../src/sim/fixed';
import { canCast, step } from '../../src/sim/index';
import { cellOf, walkable } from '../../src/sim/map/grid';
import { attackEvery, moveSpeed } from '../../src/sim/units/kinds';
import { Kind } from '../../src/sim/world';
import { MID, cast, cd, heroMatch, hold, place, steps } from './heroes/kit-helpers';

const match = () => {
  const m = heroMatch(['clem', 'sage', 'brutus', 'sage', 'brutus', 'cacklejaw']);
  for (let id = 0; id < 6; id++) place(m, id, MID.x + (id < 3 ? -30000 : 30000), MID.y + id * 3000, 0);
  hold(m, 0, 1, 2, 3, 4, 5);
  return m;
};
const [WX0, WY0, WX1] = WALLS[0];

describe('effect primitives (§4.4)', () => {
  it('cone, ring, line shapes', () => {
    expect(inCone(0, 0, 0, 2000, 1024, 1900, 0, 0)).toBe(true);
    expect(inCone(0, 0, 0, 2000, 1024, 1000, 1100, 0)).toBe(false); // 47.7° > 45°
    expect(inCone(0, 0, 0, 2000, 1024, -300, 0, 500)).toBe(true); // overlaps the apex
    expect(inRing(0, 0, 3000, 3400, 0, 500)).toBe(true);
    expect(inRing(0, 0, 3000, 3600, 0, 500)).toBe(false);
    expect(inLine(0, 0, 10000, 0, 600, 5000, 1000, 500)).toBe(true);
    expect(inLine(0, 0, 10000, 0, 600, 5000, 1200, 500)).toBe(false);
    expect(inLine(0, 0, 10000, 0, 600, 11200, 0, 500)).toBe(false); // past the end cap
  });

  it('dash and knockback stop at walls; blink crosses to a free point, else stops short', () => {
    const m = match();
    const w = m.world;
    const x = (WX0 + WX1) >> 1;
    place(m, 0, x, WY0 - 2000, 0);
    dash(m, 0, 1024, 5000);
    steps(m, 10);
    expect(w.y[0]).toBeLessThan(WY0);
    expect(walkable(m.grid, cellOf(w.x[0], w.y[0]))).toBe(true);
    place(m, 3, x, WY0 - 1500, 0);
    knockback(m, 3, x, WY0 - 3000, 4000, 0);
    steps(m, 8);
    expect(w.y[3]).toBeLessThan(WY0);
    place(m, 1, x, WY0 - 1000, 0);
    blink(m, 1, x, WY0 + 5500, 7000);
    expect(w.y[1]).toBe(WY0 + 5500); // over the 4 m wall to free ground
    place(m, 1, x, WY0 - 1000, 0);
    blink(m, 1, x, WY0 + 2000, 7000); // inside the wall: stops before it
    expect(w.y[1]).toBeLessThan(WY0);
  });

  it('stun cancels a windup and stops everything; root stops walking and mobility casts only', () => {
    const m = match();
    const w = m.world;
    place(m, 0, MID.x, MID.y, 0);
    place(m, 3, MID.x + 1500, MID.y, 2048);
    w.attackTimer[0] = 0;
    step(m);
    expect(w.windup[0]).toBeGreaterThan(0);
    stun(w, 0, 15);
    expect(w.windup[0]).toBe(0);
    expect(canCast(w, 0, 0)).toBe(false);
    steps(m, 15);
    expect(canCast(w, 0, 0)).toBe(true);
    root(w, 0, 30);
    expect(canCast(w, 0, 2)).toBe(false); // Tumble is a dash
    expect(canCast(w, 0, 0)).toBe(true);
    const x = w.x[3];
    root(w, 3, 30);
    w.attackTimer[3] = 1 << 20;
    step(m, []);
    m.world.order[3] = 1;
    w.moveX[3] = x + 5000;
    steps(m, 20);
    expect(w.x[3]).toBe(x);
  });

  it('slow: strongest wins, never below 25% speed; haste adds', () => {
    const m = match();
    const w = m.world;
    slow(w, 0, 3000, 30);
    slow(w, 0, 2000, 90);
    expect([w.slowBp[0], w.slowT[0]]).toEqual([3000, 30]);
    expect(moveSpeed(w, 0)).toBe(3500);
    slow(w, 0, 9000, 30);
    expect(moveSpeed(w, 0)).toBe(1250);
    haste(w, 1, 2000, 30);
    expect(moveSpeed(w, 1)).toBe(5880);
  });

  it('fear: runs straight away from the source', () => {
    const m = match();
    const w = m.world;
    place(m, 3, MID.x, MID.y, 0);
    fear(w, 3, 30, MID.x - 1000, MID.y);
    steps(m, 30);
    expect(w.x[3] - MID.x).toBeGreaterThan(4000);
    expect(w.y[3]).toBe(MID.y);
  });

  it('shield (flat): absorbs before HP, expires; frontal arc test', () => {
    const m = match();
    const w = m.world;
    addShield(w, 3, 50, 10);
    const hp = w.hp[3];
    dealDamage(m, 0, 0, Kind.Hero, 3, 36, 'basic'); // × 1.3 hero vs hero (sim v4) = 46, 40 after armour 15
    expect(w.hp[3]).toBe(hp);
    expect(w.shield[3]).toBe(10);
    steps(m, 10);
    expect(w.shield[3]).toBe(0);
    place(m, 3, MID.x, MID.y, 0);
    expect(inFront(w, 3, MID.x + 1000, MID.y + 500, 2048)).toBe(true);
    expect(inFront(w, 3, MID.x - 1000, MID.y, 2048)).toBe(false);
  });

  it('heal caps at max HP', () => {
    const m = match();
    m.world.hp[0] = m.world.maxHp[0] - 10;
    expect(heal(m.world, 0, 100)).toBe(10);
  });

  it('buff: attack speed shortens the attack timer; cooldown rate speeds cooldowns', () => {
    const m = match();
    const w = m.world;
    attackSpeed(w, 1, 5000, 30);
    expect(attackEvery(w, 1)).toBe(18);
    place(m, 0, MID.x, MID.y, 0);
    cast(m, 0, 2, MID.x + 1000, MID.y);
    expect(cd(m, 0, 2)).toBe(330);
    cooldownRate(w, 0, 10000, 1000);
    steps(m, 100);
    expect(cd(m, 0, 2)).toBe(130);
  });

  it('stealth hides; mark picks the lowest-HP enemy hero in range and reveals it', () => {
    const m = match();
    const w = m.world;
    place(m, 3, MID.x, MID.y, 0);
    place(m, 4, MID.x + 2000, MID.y, 0);
    place(m, 0, MID.x - 8000, MID.y, 0);
    w.hp[4] = 10;
    expect(lowestHpEnemyHero(w, 0, MID.x - 8000, MID.y, 12000)).toBe(4);
    expect(lowestHpEnemyHero(w, 0, MID.x - 8000, MID.y, 8000)).toBe(3);
    stealth(w, 3, 30);
    step(m);
    expect(lowestHpEnemyHero(w, 0, MID.x - 8000, MID.y, 8000)).toBe(-1);
    reveal(w, 3, 30);
    step(m);
    expect(lowestHpEnemyHero(w, 0, MID.x - 8000, MID.y, 8000)).toBe(3);
  });

  it('sim v9 burst zone: arms, then pulses every `every` ticks for its life (8 pulses), damage, slow and an ally heal', () => {
    const m = match();
    const w = m.world;
    place(m, 3, MID.x, MID.y, 0);
    place(m, 1, MID.x + 500, MID.y, 0);
    w.maxHp[3] *= 10;
    w.hp[3] = w.maxHp[3];
    w.hp[1] = 100;
    const z = spawnBurst(w, 0, 0, MID.x, MID.y, 3500, 18, 18 + 120, 25, 7, 15, 2500, 16);
    expect(w.zKind[z]).toBe(ZONE_KIND.burst);
    let pulses = 0;
    let healed = 0;
    for (let t = 0; t < 160; t++) {
      const before = w.hp[1];
      step(m);
      if (m.events.some((e) => e.type === 'hit' && e.dst === 3 && e.src === 0)) {
        pulses++;
        healed += w.hp[1] - before;
        expect(w.slowBp[3]).toBe(2500);
      }
      place(m, 3, MID.x, MID.y, 0);
      place(m, 1, MID.x + 500, MID.y, 0);
      w.hp[1] = Math.min(w.hp[1], 100);
    }
    expect(pulses).toBe(8);
    expect(healed).toBeGreaterThanOrEqual(7);
    expect(w.zAlive[z]).toBe(0);
  });

  it('sim v9 burst zone: every = 0 is a single pulse, then the zone is gone', () => {
    const m = match();
    const w = m.world;
    place(m, 3, MID.x, MID.y, 0);
    w.maxHp[3] *= 10;
    w.hp[3] = w.maxHp[3];
    const z = spawnBurst(w, 0, 0, MID.x, MID.y, 2200, 15, 16, 55, 0, 0, 0, 0);
    let hits = 0;
    for (let t = 0; t < 40; t++) {
      step(m);
      if (m.events.some((e) => e.type === 'hit' && e.dst === 3 && e.src === 0)) hits++;
    }
    expect(hits).toBe(1);
    expect(w.zAlive[z]).toBe(0);
  });

  it('sim v9 charm: walks toward the source, stops within 1 m, cannot act, ends when the source dies', () => {
    const m = match();
    const w = m.world;
    place(m, 0, MID.x, MID.y, 0);
    place(m, 3, MID.x + 4000, MID.y, 2048);
    charm(w, 3, 90, 0);
    expect(canCast(w, 3, 0)).toBe(false);
    steps(m, 10);
    const d = (): number => isqrt((w.x[3] - w.x[0]) ** 2 + (w.y[3] - w.y[0]) ** 2);
    expect(d()).toBeLessThan(4000);
    steps(m, 60);
    expect(d()).toBeGreaterThanOrEqual(EFFECTS.charmStop - 100);
    expect(d()).toBeLessThanOrEqual(EFFECTS.charmStop + 300);
    // A fear replaces it (runs away again).
    fear(w, 3, 5, w.x[0], w.y[0]);
    expect(w.fearSrc[3]).toBe(-1);
    steps(m, 6);
    charm(w, 3, 90, 0);
    w.hp[0] = 1;
    dealDamage(m, 4, 1, Kind.Hero, 0, 500, 'basic');
    steps(m, 2);
    expect(w.alive[0]).toBe(0);
    expect([w.fearT[3], w.fearSrc[3]]).toEqual([0, -1]);
  });
});
