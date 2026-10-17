import { describe, expect, it } from 'vitest';
import { advance, createLoop, TICK_MS, type Clock } from './loop';

describe('advance (30 Hz accumulator)', () => {
  it('runs one tick per 33.3 ms and carries the remainder as alpha', () => {
    let r = advance(0, 16.67);
    expect(r.steps).toBe(0);
    expect(r.alpha).toBeCloseTo(0.5, 1);
    r = advance(r.acc, 16.67);
    expect(r.steps).toBe(1);
    expect(r.alpha).toBeCloseTo(0, 1);
  });
  it('60 frames at 60 Hz give 30 ticks', () => {
    let acc = 0;
    let steps = 0;
    for (let i = 0; i < 60; i++) {
      const r = advance(acc, 1000 / 60);
      acc = r.acc;
      steps += r.steps;
    }
    expect(steps).toBe(30);
  });
  it('clamps long stalls and drops the backlog beyond maxSteps', () => {
    const r = advance(0, 5000, 8);
    expect(r.steps).toBe(7); // 250 ms clamp = 7.5 ticks
    const r2 = advance(0, 200, 3);
    expect(r2.steps).toBe(3);
    expect(r2.acc).toBe(0);
    expect(advance(0, -10).steps).toBe(0);
  });
});

describe('createLoop', () => {
  function fakeClock(): Clock & { advance(ms: number): void } {
    let t = 0;
    let cb: ((t: number) => void) | null = null;
    return {
      now: () => t,
      raf: (f) => {
        cb = f;
        return 1;
      },
      caf: () => {
        cb = null;
      },
      advance(ms) {
        t += ms;
        const f = cb;
        cb = null;
        f?.(t);
      },
    };
  }

  it('steps the sim at 30 Hz, draws every frame, stops stepping when tick() returns false, pauses', () => {
    const clock = fakeClock();
    let ticks = 0;
    let draws = 0;
    const loop = createLoop({ tick: () => ++ticks < 10, draw: () => void draws++ }, clock);
    loop.start();
    for (let i = 0; i < 6; i++) clock.advance(TICK_MS);
    expect(ticks).toBe(6);
    expect(draws).toBe(6);
    loop.setPaused(true);
    clock.advance(TICK_MS * 3);
    expect(ticks).toBe(6);
    loop.setPaused(false);
    for (let i = 0; i < 20; i++) clock.advance(TICK_MS);
    expect(ticks).toBe(10); // ended
    expect(draws).toBe(6 + 1 + 20);
    loop.stop();
    clock.advance(TICK_MS);
    expect(draws).toBe(27);
  });
});
