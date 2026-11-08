/**
 * Sim v17 reactable skill shots (docs/plans/moba/V17.md §3.8): slower projectiles so each can be dodged on reaction at
 * max range, and Frankie R's 12-tick windup (a 9 m stun shot).
 */
import { describe, expect, it } from 'vitest';
import { HERO_IDS } from '../../src/data/heroes';
import { TICK_HZ } from '../../src/data/timeline';
import { travelTicks } from '../../src/sim/effects';
import { kitNumbers } from '../../src/sim/heroes/talents';

const q = (h: string) => kitNumbers(HERO_IDS.indexOf(h as never), 10).q;
const ms = (range: number, speed: number): number => Math.floor((range * 1000) / speed);

describe('sim v17 skill-shot speeds (§3.8)', () => {
  it('each slowed projectile and its time at max range', () => {
    const rows = ['domino', 'bravo', 'lambo', 'bengas', 'pixel', 'rocket'].map((h) => [h, q(h).speed, ms(q(h).range, q(h).speed)]);
    expect(rows).toEqual([
      ['domino', 13000, 615],
      ['bravo', 12000, 541],
      ['lambo', 12000, 500],
      ['bengas', 14000, 500],
      ['pixel', 15000, 566],
      ['rocket', 17000, 529],
    ]);
    // In ticks: the sim's flight time.
    expect(travelTicks(q('domino').range, q('domino').speed)).toBe(Math.ceil((8000 * TICK_HZ) / 13000));
  });

  it('Frankie R: 12-tick windup + 450 ms of flight at 9 m', () => {
    const r = kitNumbers(HERO_IDS.indexOf('frankie'), 10).r;
    expect(r.windup).toBe(12);
    expect(Math.round((r.windup * 1000) / TICK_HZ) + ms(r.range, r.speed)).toBe(850);
  });
});
