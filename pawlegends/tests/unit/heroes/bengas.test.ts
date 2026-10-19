import { describe, expect, it } from 'vitest';
import { HERO_IDS } from '../../../src/data/heroes';
import { BENGAS } from '../../../src/data/heroes/bengas';
import { baseNumbers } from '../../../src/sim/heroes/talents';
import { ZONE_KIND } from '../../../src/data/effects';
import { PROJECTILE_KIND } from '../../../src/data/towers';
import { dealDamage } from '../../../src/sim/combat/damage';
import { slow } from '../../../src/sim/effects';
import { snapshot } from '../../../src/sim/index';
import { Op } from '../../../src/sim/api';
import { applyOrder } from '../../../src/sim/units/hero';
import { Kind } from '../../../src/sim/world';
import { MID, cast, cd, heroHit, heroMatch, hold, place, setLevel, steps, tanky } from './kit-helpers';

// Bengas (slot 0) vs Clem (slot 3, armour 25) and Sage (slot 4, armour 15).
const BG = 0;
const FOE = 3;
const FOE2 = 4;
const A = baseNumbers(HERO_IDS.indexOf('bengas'));

function arena() {
  const m = heroMatch(['bengas', 'clem', 'sage', 'clem', 'sage', 'clem']);
  place(m, BG, MID.x, MID.y, 0);
  place(m, 1, MID.x - 20000, MID.y + 15000, 0);
  place(m, 2, MID.x - 20000, MID.y - 15000, 0);
  place(m, FOE, MID.x + 3000, MID.y, 2048);
  place(m, FOE2, MID.x + 20000, MID.y - 20000, 2048);
  place(m, 5, MID.x + 20000, MID.y + 20000, 2048);
  hold(m, 0, 1, 2, 3, 4, 5);
  tanky(m, FOE, FOE2);
  return m;
}

describe('Bengas, shelter champion mage (sim v9)', () => {
  it('data: a FIRE cat mage; Hot Toast is +15%', () => {
    expect([BENGAS.side, BENGAS.role, BENGAS.element]).toEqual(['cat', 'mage', 'FIRE']);
    expect([A.q.cooldown, A.w.cooldown, A.e.cooldown, A.r.cooldown]).toEqual([180, 420, 390, 1950]);
    expect(BENGAS.passive).toEqual({ bonusBp: 11500 });
    expect([A.w.windup, A.w.stun, A.w.slowBp, A.w.slow]).toEqual([9, 23, 2500, 30]);
    expect(BENGAS.pvp).toEqual({ dmgBp: 11000, takenBp: 9100 });
  });

  it('Hot Toast: +15% damage to a slowed (or otherwise crowd-controlled) enemy hero', () => {
    const m = arena();
    const w = m.world;
    let hp = w.hp[FOE];
    dealDamage(m, BG, 0, Kind.Hero, FOE, 100, 'basic');
    const plain = hp - w.hp[FOE];
    slow(w, FOE, 1000, 30);
    hp = w.hp[FOE];
    dealDamage(m, BG, 0, Kind.Hero, FOE, 100, 'basic');
    expect(plain).toBe(heroHit(100, 25));
    expect(hp - w.hp[FOE]).toBe(heroHit(115, 25));
  });

  it('Burnt Toast: a skillshot that stops at the first unit', () => {
    const m = arena();
    const w = m.world;
    place(m, FOE2, MID.x + 5000, MID.y, 2048);
    const hp = w.hp[FOE];
    const hp2 = w.hp[FOE2];
    cast(m, BG, 0, MID.x + 7000, MID.y);
    expect(w.pKind.includes(PROJECTILE_KIND.toast)).toBe(true);
    steps(m, 20);
    expect(hp - w.hp[FOE]).toBe(heroHit(A.q.dmg, 25));
    expect(w.hp[FOE2]).toBe(hp2);
  });

  it('Striking Pose: after a 0.3 s wind-up, stuns enemy heroes in the cone that face Bengas, slows those facing away', () => {
    const m = arena();
    const w = m.world;
    place(m, FOE, MID.x + 3000, MID.y, 2048); // facing him (west)
    place(m, FOE2, MID.x + 1500, MID.y + 600, 0); // in the cone, walking away (east): facing follows movement
    applyOrder(m, FOE2, { op: Op.Move, x: MID.x + 30000, y: MID.y + 600 });
    cast(m, BG, 1, MID.x + 3000, MID.y);
    expect(w.stunT[FOE]).toBe(0);
    steps(m, A.w.windup);
    expect(w.stunT[FOE]).toBeGreaterThan(0);
    expect(w.stunT[FOE2]).toBe(0);
    // the cast is never wasted: the ones looking away are slowed 25% for 1 s (and Hot Toast reads the slow)
    expect(w.slowBp[FOE2]).toBe(A.w.slowBp);
    expect(w.slowT[FOE2]).toBeGreaterThan(A.w.slow - 3);
    expect(w.slowT[FOE]).toBe(0);
    expect(cd(m, BG, 1)).toBeGreaterThan(0);
    // outside the cone: nothing
    const far = arena();
    place(far, FOE, MID.x - 3000, MID.y, 0);
    cast(far, BG, 1, MID.x + 3000, MID.y);
    steps(far, A.w.windup);
    expect([far.world.stunT[FOE], far.world.slowT[FOE]]).toEqual([0, 0]);
  });

  it('Camellia Hop: dash 3.5 m, then +20% speed', () => {
    const m = arena();
    const w = m.world;
    cast(m, BG, 2, MID.x - 9000, MID.y);
    steps(m, 8);
    expect(w.x[BG]).toBe(MID.x - A.e.dash);
    expect(w.hasteBp[BG]).toBe(A.e.hasteBp);
  });

  it('Curtains Up!: a fire disc that arms after 0.6 s and pulses 8 times (25 +5/lvl, slow); visible to both teams', () => {
    const m = arena();
    const w = m.world;
    setLevel(m, BG, 4);
    place(m, FOE, MID.x + 6000, MID.y, 2048);
    let hits = 0;
    const hp = w.hp[FOE];
    cast(m, BG, 3, MID.x + 6000, MID.y);
    expect(w.zKind[0]).toBe(ZONE_KIND.burst);
    const enemy = (): boolean => m.events.some((e) => e.type === 'hit' && e.src === BG && e.dst === FOE);
    for (let t = 0; t < A.r.windup + A.r.duration + 10; t++) {
      steps(m, 1);
      if (enemy()) hits++;
      w.hp[FOE] = Math.max(w.hp[FOE], 1);
      place(m, FOE, MID.x + 6000, MID.y, 2048);
    }
    expect(hits).toBe(A.r.duration / A.r.every);
    expect(hp).toBeGreaterThan(w.hp[FOE]);
    expect(w.zAlive[0]).toBe(0);
    // The enemy team sees the disc (only traps are hidden).
    const m2 = arena();
    setLevel(m2, BG, 4);
    cast(m2, BG, 3, MID.x + 6000, MID.y);
    expect(snapshot(m2, 1).zones.some((z) => z.kind === ZONE_KIND.burst && (z.arm ?? 0) > 0)).toBe(true);
  });
});
