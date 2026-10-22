import { describe, expect, it } from 'vitest';
import { InputMux, type MuxContext } from './mux';
import type { InputSource, RawInput } from './raw';

class Fake implements InputSource {
  state: Partial<RawInput> = {};
  poll(out: RawInput): void {
    Object.assign(out, this.state);
  }
  dispose(): void {}
}

const ctx = { racing: true, speedFrac: 0.8, drifting: false };

describe('input mux (GDD 2)', () => {
  it('quantizes steer to −7..+7 and latches every 2 ticks', () => {
    const f = new Fake();
    const m = new InputMux([f], { autoGas: false, oneThumb: false });
    f.state = { steer: 0.5, gas: true };
    m.frame(1 / 60, ctx);
    expect(m.sample(0, ctx).steer).toBe(4);
    f.state = { steer: -1, gas: true };
    m.frame(1 / 60, ctx);
    expect(m.sample(1, ctx).steer).toBe(4); // odd tick: still the latched value
    expect(m.sample(2, ctx).steer).toBe(-7);
  });

  it('keeps a short tap for one latch (never lost between latches)', () => {
    const f = new Fake();
    const m = new InputMux([f], { autoGas: false, oneThumb: false });
    m.sample(0, ctx);
    f.state = { item: true };
    m.frame(1 / 60, ctx);
    f.state = {};
    m.frame(1 / 60, ctx);
    expect(m.sample(2, ctx).item).toBe(true);
    m.frame(1 / 60, ctx);
    expect(m.sample(4, ctx).item).toBe(false);
  });

  it('B24: a swipe-down item press keeps its throw-back flag through the latch', () => {
    const f = new Fake();
    const m = new InputMux([f], { autoGas: false, oneThumb: true });
    m.sample(0, ctx);
    f.state = { touch: true, item: true, itemBack: true };
    m.frame(1 / 60, ctx);
    f.state = { touch: true };
    m.frame(1 / 60, ctx);
    const i = m.sample(2, ctx);
    expect(i.item).toBe(true);
    expect(i.itemBack).toBe(true);
  });

  it('touch gets auto gas after GO; one-thumb mode drifts on a held full lock', () => {
    const f = new Fake();
    const m = new InputMux([f], { autoGas: false, oneThumb: true });
    f.state = { touch: true, steer: 0.9 };
    let drift = false;
    for (let t = 0; t < 30; t++) {
      m.frame(1 / 60, ctx);
      const i = m.sample(t, ctx);
      expect(i.gas).toBe(true);
      drift ||= i.drift;
    }
    expect(drift).toBe(true);
    f.state = { touch: true, steer: 0 };
    m.frame(1 / 60, ctx);
    m.sample(40, ctx); // consumes any press still latched from the held frames
    m.frame(1 / 60, ctx);
    expect(m.sample(42, ctx).drift).toBe(false);
  });

  it('one-thumb drift arms only into a bend that turns the same way, and lets go on a wall', () => {
    const run = (c: typeof ctx & { curve?: number; wall?: boolean }, steer: number) => {
      const f = new Fake();
      const m = new InputMux([f], { autoGas: false, oneThumb: true });
      f.state = { touch: true, steer };
      let drift = false;
      for (let t = 0; t < 30; t++) {
        m.frame(1 / 60, c);
        drift ||= m.sample(t, c).drift;
      }
      return drift;
    };
    // a right-hander (curve < 0) with the stick right: drift
    expect(run({ ...ctx, curve: -0.05 }, 0.9)).toBe(true);
    // a straight, or a left-hander with the stick right: no drift
    expect(run({ ...ctx, curve: 0 }, 0.9)).toBe(false);
    expect(run({ ...ctx, curve: 0.05 }, 0.9)).toBe(false);
    // on a wall: no drift
    expect(run({ ...ctx, curve: -0.05, wall: true }, 0.9)).toBe(false);
  });

  describe('Smart Steer (iteration 4, F2)', () => {
    // the 0.5 s point sits 0.2 m past the right edge, the road there heads 0.3 rad left of the travel direction
    const edge = { racing: true, speedFrac: 0.8, drifting: false, edgeL: 14.2, edgeR: -0.2, edgeHeading: 0.3, onRail: false, air: false, driftDir: 0 };
    const latch = (state: Partial<RawInput>, c: MuxContext, smartSteer = true) => {
      const f = new Fake();
      const m = new InputMux([f], { autoGas: false, oneThumb: false, smartSteer });
      f.state = state;
      m.frame(1 / 60, c);
      return { steer: m.sample(0, c).steer, assist: m.assist };
    };

    it('pulls a touch stick away from the edge the path is closing on', () => {
      const r = latch({ touch: true, steer: 0.2, steerTouch: true }, edge);
      expect(r.assist).toBeLessThan(-0.1);
      expect(r.steer).toBeLessThan(Math.round(0.2 * 7));
      // mirrored: the left edge pushes right
      const l = latch({ touch: true, steer: -0.2, steerTouch: true }, { ...edge, edgeL: -0.2, edgeR: 14.2, edgeHeading: -0.3 });
      expect(l.assist).toBeGreaterThan(0.1);
      // far from both edges: nothing
      expect(latch({ touch: true, steer: 0.2, steerTouch: true }, { ...edge, edgeR: 3, edgeL: 11 }).assist).toBe(0);
    });

    it('is off for keys and a gamepad: their TickInputs are bit-identical with the setting on or off', () => {
      for (const steer of [-1, -0.6, -0.1, 0, 0.3, 0.8, 1]) {
        for (const c of [edge, { ...edge, edgeL: -0.4, edgeR: 14.4, edgeHeading: -0.5 }, ctx]) {
          // keys (digital), a gamepad (analog, not touch), keys with a finger also on the screen
          for (const st of [{ steer, digital: true }, { steer }, { steer, digital: true, touch: true }] as Partial<RawInput>[]) {
            const on = latch(st, c, true);
            expect(on).toEqual(latch(st, c, false));
            expect(on.assist).toBe(0);
          }
        }
      }
    });

    it('stays off while drifting into the bend, and helps once the drift has spun past it', () => {
      // drifting right (driftDir +1) with the stick right, the road still bending right (edgeHeading < 0): hands off
      const into = { ...edge, drifting: true, driftDir: 1, edgeHeading: -0.4 };
      expect(latch({ touch: true, steer: 0.9, steerTouch: true }, into).assist).toBe(0);
      expect(latch({ touch: true, steer: 0.9, steerTouch: true }, { ...into, edgeHeading: 0.2 }).assist).toBe(0);
      // drifting left with the stick left, but the drift has turned the kart past the bend (the road ahead now heads
      // right) and the path runs into the inside wall: it may help
      expect(latch({ touch: true, steer: -0.9, steerTouch: true }, { ...into, driftDir: -1, edgeL: -0.3, edgeR: 14.3, edgeHeading: -0.6 }).assist).toBeGreaterThan(0);
    });

    it('is bounded at 0.35 of full lock and only ever steers away from the edge', () => {
      let rng = 12345;
      const rand = () => ((rng = (rng * 1664525 + 1013904223) >>> 0) / 4294967296);
      let acted = 0;
      for (let i = 0; i < 4000; i++) {
        const steer = Math.round((rand() * 2 - 1) * 100) / 100;
        const eR = rand() * 6 - 3;
        const c = { ...edge, edgeR: eR, edgeL: 14 - eR, edgeHeading: rand() * 3 - 1.5, drifting: false, driftDir: 0 };
        const r = latch({ touch: true, steer, steerTouch: true }, c);
        expect(Math.abs(r.assist)).toBeLessThanOrEqual(0.35 + 1e-9);
        expect(r.assist).toBeLessThanOrEqual(0); // the right edge only ever pushes left
        expect(Math.abs(r.steer - Math.round(steer * 7))).toBeLessThanOrEqual(3); // 0.35 × 7 = 2.45, plus rounding
        if (r.assist !== 0) acted++;
      }
      expect(acted).toBeGreaterThan(500);
    });

    it('is zero on a rail, in the air and before GO', () => {
      for (const c of [{ ...edge, onRail: true }, { ...edge, air: true }, { ...edge, racing: false }]) {
        for (const steer of [-1, 0, 0.5, 1]) expect(latch({ touch: true, steer, steerTouch: true }, c).assist).toBe(0);
      }
    });

    it('answers a path swinging toward the edge a few frames early (the look-ahead trend), never a receding one', () => {
      const f = new Fake();
      const m = new InputMux([f], { autoGas: false, oneThumb: false, smartSteer: true });
      f.state = { touch: true, steer: 0.3, steerTouch: true };
      // the right edge distance shrinks 4 m/s: at 1.0 m it is still outside the margin, but the trend sees it coming
      let acted = false;
      for (let t = 0; t <= 20; t += 2) {
        const c = { ...edge, edgeR: 2.2 - (t / 60) * 4, edgeL: 11.8 + (t / 60) * 4, edgeHeading: 0 };
        m.frame(1 / 60, c);
        m.sample(t, c);
        if (c.edgeR > 0.75 && m.assist < 0) acted = true;
      }
      expect(acted).toBe(true);
      // receding: never
      const g = new InputMux([f], { autoGas: false, oneThumb: false, smartSteer: true });
      for (let t = 0; t <= 20; t += 2) {
        const c = { ...edge, edgeR: 0.7 + (t / 60) * 4, edgeL: 13.3 - (t / 60) * 4, edgeHeading: 0 };
        g.frame(1 / 60, c);
        g.sample(t, c);
        expect(g.assist).toBe(0);
      }
    });
  });
});
