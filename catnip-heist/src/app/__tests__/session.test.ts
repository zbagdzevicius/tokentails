import { describe, expect, it } from 'vitest';
import { NO_INPUT, TICK_HZ } from '../../types';
import { getHeist01, HEIST_01_SOLUTION } from '../../levels';
import { decodeInputs, replay } from '../../sim';
import { HeistSession, MAX_FRAME_DT, MAX_TICKS_PER_FRAME, TICK_S } from '../session';
import { isoMapDir } from '../controls';

describe('HeistSession', () => {
  it('replays the heist-01 solution to a win with the recorded final hash', () => {
    const level = getHeist01();
    const s = new HeistSession({ level, seed: 99, catIds: ['x', 'y'], replay: HEIST_01_SOLUTION });
    expect(s.mode).toBe('replay');
    expect(s.seed).toBe(HEIST_01_SOLUTION.seed);
    let guard = 0;
    while (!s.done && guard++ < 100_000) s.advance(1 / 60, () => NO_INPUT);
    expect(s.cur.won).toBe(true);
    expect(s.cur.hash).toBe(HEIST_01_SOLUTION.finalHash);
    expect(s.cur.hash).toBe(replay(level, HEIST_01_SOLUTION).final.hash);
  });

  it('records a play-mode log that replays to the same hash', () => {
    const level = getHeist01();
    const play = new HeistSession({ level, seed: 1, catIds: ['bob', 'oreo'] });
    const inputs = decodeInputs(HEIST_01_SOLUTION.runs);
    let k = 0;
    while (!play.done && k < inputs.length) play.stepOnce(inputs[k++]);
    expect(play.cur.won).toBe(true);
    const log = play.log();
    expect(log.ticks).toBe(play.cur.tick);
    expect(log.finalHash).toBe(play.cur.hash);
    const back = new HeistSession({ level, seed: 5, catIds: ['a', 'b'], replay: log });
    while (back.stepOnce()) {
      /* run */
    }
    expect(back.cur.hash).toBe(play.cur.hash);
    expect(play.result()).toMatchObject({ rescued: true, coins: 20, rescuedName: level.crate.catName, hash: play.cur.hash });
  });

  it('runs whole ticks at 30 Hz, samples once per tick and caps a stalled frame', () => {
    const s = new HeistSession({ level: getHeist01(), seed: 1, catIds: ['bob', 'oreo'] });
    let samples = 0;
    const sample = () => (samples++, NO_INPUT);
    expect(s.advance(TICK_S * 0.5, sample)).toBe(0);
    expect(s.alpha).toBeCloseTo(0.5, 5);
    expect(s.advance(TICK_S * 0.6, sample)).toBe(1);
    expect(samples).toBe(1);
    // A 1 s stall is clamped to MAX_FRAME_DT (0.25 s = 7.5 ticks): exactly 7 ticks run.
    const t0 = s.cur.tick;
    expect(s.advance(1, sample)).toBe(Math.floor(MAX_FRAME_DT / TICK_S));
    expect(s.cur.tick).toBe(t0 + 7);
    // A huge backlog (e.g. accumulated while the tab slept) is capped per frame and then dropped.
    s.resetClock();
    (s as unknown as { acc: number }).acc = 100 * TICK_S;
    expect(s.advance(0, sample)).toBe(MAX_TICKS_PER_FRAME);
    expect(s.advance(0, sample)).toBeLessThanOrEqual(1);
    // Fast replays scale the cap with the speed.
    s.resetClock();
    (s as unknown as { acc: number }).acc = 100 * TICK_S;
    expect(s.advance(0, sample, undefined, 3)).toBe(MAX_TICKS_PER_FRAME * 3);
    s.resetClock();
    expect(s.alpha).toBe(0);
    expect(TICK_HZ).toBe(30);
  });

  it('maps screen directions onto the 45 degree iso grid', () => {
    expect(isoMapDir(1, 0)).toEqual([1, -1]);
    expect(isoMapDir(-1, 0)).toEqual([-1, 1]);
    expect(isoMapDir(0, -1)).toEqual([-1, -1]);
    expect(isoMapDir(0, 1)).toEqual([1, 1]);
    expect(isoMapDir(1, -1)).toEqual([0, -1]);
    expect(isoMapDir(1, 1)).toEqual([1, 0]);
  });
});
