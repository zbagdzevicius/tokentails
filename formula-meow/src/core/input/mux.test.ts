import { describe, expect, it } from 'vitest';
import { InputMux } from './mux';
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
});
