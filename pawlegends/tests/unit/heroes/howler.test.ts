import { describe, expect, it } from 'vitest';
import { BOTS } from '../../../src/data/bots';
import { EFFECTS } from '../../../src/data/effects';
import { HERO_IDS } from '../../../src/data/heroes';
import { HOWLER } from '../../../src/data/heroes/howler';
// The kit table first (sim/heroes/kit.ts imports every hero module; a hero module first would see it half-built).
import { kitOf } from '../../../src/sim/heroes/kit';
import { baseNumbers } from '../../../src/sim/heroes/talents';
import { think } from '../../../src/sim/bots/brain';
import { createMem } from '../../../src/sim/bots/mem';
import { Rng } from '../../../src/sim/rng';
import { Op } from '../../../src/sim/api';
import { COOLDOWN_SLOTS, FM, G, RANGE } from '../../../src/sim/world';
import { MID, cast, heroMatch, hold, place, steps, tanky } from './kit-helpers';

// Howler (slot 0) with Brutus (1) and Cacklejaw (2) vs Clem (3), Sage (4), Clem (5).
const HW = 0;
const FOE = 3;
const FOE2 = 4;
const A = baseNumbers(HERO_IDS.indexOf('howler'));

function arena() {
  const m = heroMatch(['howler', 'brutus', 'cacklejaw', 'clem', 'sage', 'clem']);
  place(m, HW, MID.x, MID.y, 0);
  place(m, 1, MID.x - 20000, MID.y + 15000, 0);
  place(m, 2, MID.x - 20000, MID.y - 15000, 0);
  place(m, FOE, MID.x + 20000, MID.y + 20000, 2048);
  place(m, FOE2, MID.x + 20000, MID.y - 20000, 2048);
  place(m, 5, MID.x + 25000, MID.y + 25000, 2048);
  hold(m, 0, 1, 2, 3, 4, 5);
  tanky(m, HW, FOE, FOE2);
  return m;
}

describe('Howler, original dog fighter (sim v14)', () => {
  it('data: a WIND dog fighter, index 16', () => {
    expect([HOWLER.side, HOWLER.role, HOWLER.element, HOWLER.name]).toEqual(['dog', 'fighter', 'WIND', 'Howler']);
    expect(HERO_IDS.indexOf('howler')).toBe(16);
  });

  it('Zoomie Brain: after any ability the next basic hits harder and slows, once', () => {
    const m = arena();
    const w = m.world;
    place(m, FOE, MID.x + 8000, MID.y, 2048);
    cast(m, HW, 0, MID.x + 3000, MID.y);
    expect(w.kEmpower[HW]).toBeGreaterThan(0);
    const kit = kitOf(w, HW);
    const hp = w.hp[FOE];
    expect(kit.basic!(m, HW, FOE, 100)).toBe(true);
    const empowered = hp - w.hp[FOE];
    expect(w.slowBp[FOE]).toBe(A.passive.slowBp);
    expect(kit.basic!(m, HW, FOE, 100)).toBe(false);
    expect(empowered).toBeGreaterThan(0);
  });

  it('AWOO: a cone that hurts and slows', () => {
    const m = arena();
    const w = m.world;
    place(m, FOE, MID.x + 2500, MID.y, 2048);
    const hp = w.hp[FOE];
    cast(m, HW, 0, MID.x + 3000, MID.y);
    expect(hp - w.hp[FOE]).toBeGreaterThan(0);
    expect(w.slowBp[FOE]).toBe(A.q.slowBp);
  });

  it('Talk Back: less damage, and each enemy hero that hits him is feared once', () => {
    const m = arena();
    const w = m.world;
    cast(m, HW, 2, MID.x, MID.y);
    const kit = kitOf(w, HW);
    expect(kit.incoming!(m, HW, FOE, 1000)).toBe(1000 - (1000 * A.e.reduceBp) / 10000);
    expect(w.fearT[FOE]).toBe(A.e.fear);
    w.fearT[FOE] = 0;
    kit.incoming!(m, HW, FOE, 1000);
    expect(w.fearT[FOE]).toBe(0);
    kit.incoming!(m, HW, FOE2, 1000);
    expect(w.fearT[FOE2]).toBe(A.e.fear);
  });

  it('Talk Back: bots stop starting basics on him (they step back), and swing again once it ends', () => {
    const m = arena();
    const w = m.world;
    // A fair fight (not the ×10 HP test Howler), so the bot takes it.
    w.maxHp[HW] = Math.trunc(w.maxHp[HW] / 10);
    w.hp[HW] = Math.trunc(w.maxHp[HW] / 2);
    place(m, FOE, MID.x + 1500, MID.y, 2048);
    // Past every difficulty's truce (an enemy bot leaves the human alone before it).
    w.globals[G.Tick] = 9000;
    // The bot cannot cast (every cooldown up), so its only fight answer is a basic.
    for (let s = 0; s < COOLDOWN_SLOTS; s++) w.cooldowns[FOE * COOLDOWN_SLOTS + s] = 9999;
    const mem = () => {
      const mm = createMem();
      mm.seen[FOE * (RANGE.minions - RANGE.heroes) + HW] = 0;
      return mm;
    };
    w.kRT[HW] = A.e.duration;
    const deterred = think(m, FOE, BOTS.normal, mem(), new Rng(1));
    expect(deterred?.op).toBe(Op.Move);
    w.kRT[HW] = 0;
    const swing = think(m, FOE, BOTS.normal, mem(), new Rng(1));
    expect(swing).toMatchObject({ op: Op.Attack, id: HW });
  });

  it('THE SCREAM: the knockback travels the full push, then the fear runs its full length', () => {
    const m = arena();
    const w = m.world;
    w.level[HW] = 4;
    place(m, FOE, MID.x + 2000, MID.y, 2048);
    cast(m, HW, 3, MID.x + 3000, MID.y);
    steps(m, A.r.windup - 1);
    expect(w.fmKind[FOE]).toBe(FM.Knock);
    expect(m.events.some((e) => e.type === 'clip' && e.what === 'scream')).toBe(true);
    steps(m, EFFECTS.knockbackTicks);
    expect(w.x[FOE]).toBe(MID.x + 2000 + A.r.push);
    expect(w.fearT[FOE]).toBeGreaterThanOrEqual(A.r.fear - 1);
    expect(w.fearT[FOE]).toBeLessThanOrEqual(A.r.fear);
  });
});
