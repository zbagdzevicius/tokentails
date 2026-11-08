/**
 * Sim v17 Cacklejaw R (docs/plans/moba/V17.md §3.6): Pack Hunt winds up 9 ticks and marks its victim at the windup's
 * start (the windup event's `dst`); at the end the hunt fizzles (no cooldown) when the victim turned untargetable or
 * is beyond range + 2 m. 12 m takes 9 + up to 18 ticks at 20 m/s.
 */
import { describe, expect, it } from 'vitest';
import { NO_TARGET, Op, type SimEvent } from '../../src/sim/api';
import { travelTicks } from '../../src/sim/effects';
import { step, type MatchHandle } from '../../src/sim/index';
import { FM } from '../../src/sim/world';
import { MID, cd, heroMatch, hold, place, setLevel, steps, tanky } from './heroes/kit-helpers';

const CJ = 0;
const A = 3;
const B = 4;

function hunt(): MatchHandle {
  const m = heroMatch(['cacklejaw', 'sage', 'clem', 'sage', 'clem', 'clem']);
  for (let id = 0; id < 6; id++) place(m, id, MID.x + (id < 3 ? -30000 : 30000), MID.y + (id % 3) * 9000, 0);
  place(m, CJ, MID.x, MID.y, 0);
  setLevel(m, CJ, 10);
  hold(m, 0, 1, 2, 3, 4, 5);
  tanky(m, A, B);
  return m;
}

const castR = (m: MatchHandle): Extract<SimEvent, { type: 'windup' }>[] => {
  step(m, [{ op: Op.Cast, slot: 3, x: m.world.x[CJ], y: m.world.y[CJ], id: NO_TARGET }]);
  return m.events.filter((e): e is Extract<SimEvent, { type: 'windup' }> => e.type === 'windup' && e.src === CJ);
};

describe('sim v17 Pack Hunt (§3.6)', () => {
  it('the windup event names the lowest-HP enemy hero at the order, even if another drops lower during the windup', () => {
    const m = hunt();
    const w = m.world;
    place(m, A, MID.x + 6000, MID.y, 0);
    place(m, B, MID.x + 5000, MID.y + 2000, 0);
    w.hp[A] = 1000;
    w.hp[B] = 2000;
    const ev = castR(m);
    expect(ev.map((e) => [e.ticks, e.dst])).toEqual([[9, A]]);
    w.hp[B] = 500;
    steps(m, 30);
    expect(w.kHuntVictim[CJ]).toBe(A);
  });

  it('a victim that Pounces out of range + 2 m during the windup: fizzle, cooldown 0', () => {
    const m = hunt();
    const w = m.world;
    place(m, A, MID.x + 11000, MID.y, 0);
    castR(m);
    place(m, A, MID.x + 15000, MID.y, 0);
    steps(m, 9);
    expect(w.fmKind[CJ]).toBe(FM.None);
    expect(cd(m, CJ, 3)).toBe(0);
  });

  it('a victim that turns untargetable during the windup (Chili E): fizzle', () => {
    const m = hunt();
    const w = m.world;
    place(m, A, MID.x + 6000, MID.y, 0);
    castR(m);
    w.untargT[A] = 30;
    steps(m, 9);
    expect(w.fmKind[CJ]).toBe(FM.None);
    expect(cd(m, CJ, 3)).toBe(0);
  });

  it('the hunt reaches a victim 12 m away within 9 + 18 = 27 ticks of the cast', () => {
    expect(9 + travelTicks(12000, 20000)).toBe(27);
    const m = hunt();
    const w = m.world;
    place(m, A, MID.x + 12000, MID.y, 0);
    const hp = w.hp[A];
    castR(m);
    let t = 1;
    while (w.hp[A] === hp && t < 40) {
      step(m);
      t++;
    }
    expect(t).toBeGreaterThan(9 + 10);
    expect(t).toBeLessThanOrEqual(27);
  });
});
