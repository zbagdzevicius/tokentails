import { afterEach, describe, expect, it } from 'vitest';
import { funCount, funPool, funPop, funRand, resetFunKit, setFunSink, sticker, stickerBurst } from '../../src/render/fx/fun/funKit';
import type { FxCtx } from '../../src/render/anim/types';

/** A fake Particles pool: counts what the kit emits (the real spec object is reused, like Particles.begin()). */
function pool() {
  const spec: Record<string, number> = {};
  const p = {
    n: 0,
    add: 0,
    gravity: [] as number[],
    begin: () => spec,
    emit(additive: boolean) {
      p.n++;
      if (additive) p.add++;
      p.gravity.push(spec.gravity);
      return p.n - 1;
    },
    scaled: (n: number) => n,
  };
  return p;
}
const fx = (tier: 'low' | 'med' | 'high' = 'med', reduced = false) => ({ tier, reduced, particles: {}, sfx: { cue() {} } }) as unknown as FxCtx;

afterEach(() => {
  setFunSink({});
  resetFunKit();
});

describe('fun kit', () => {
  it('funRand is deterministic, in [0, 1) and varies with every input', () => {
    const a = funRand(120, 3, 0);
    expect(funRand(120, 3, 0)).toBe(a);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(1);
    expect(funRand(121, 3, 0)).not.toBe(a);
    expect(funRand(120, 4, 0)).not.toBe(a);
    expect(funRand(120, 3, 1)).not.toBe(a);
    // roughly uniform
    let lo = 0;
    for (let t = 0; t < 2000; t++) if (funRand(t, 1, 2) < 0.5) lo++;
    expect(lo).toBeGreaterThan(900);
    expect(lo).toBeLessThan(1100);
  });

  it('does nothing without a particle pool (test stubs, no sink)', () => {
    expect(() => sticker(fx(), 0, 1, 0, 'PAW', 0xffffff, 0.4, 1)).not.toThrow();
    expect(funPop(fx(), 0, 'POW!', 0, 2, 0)).toBe(false);
  });

  it('draws single and composite stickers into the pools; bursts fall (positive Particles gravity)', () => {
    const p = pool();
    setFunSink({ particles: p });
    sticker(fx(), 0, 1, 0, 'HEART', 0xff9ec8, 0.4, 1);
    expect(p.n).toBe(1);
    sticker(fx(), 0, 1, 0, 'PAW', 0xffffff, 0.4, 1);
    expect(p.n).toBe(6);
    p.gravity.length = 0;
    stickerBurst(fx(), 0, 1, 0, 'STAR', 0xffffff, 0.3, 0.5, 6, 2, 2, -6);
    expect(p.gravity.length).toBe(6);
    for (const g of p.gravity) expect(g).toBeGreaterThan(0);
  });

  it('reduced effects halve a burst', () => {
    const p = pool();
    setFunSink({ particles: p });
    stickerBurst(fx('med', true), 0, 1, 0, 'STAR', 0xffffff, 0.3, 0.5, 8);
    expect(p.n).toBe(4);
  });

  it('pops: one per caster per 0.6 s', () => {
    const shown: string[] = [];
    setFunSink({ pop: (t) => (shown.push(t), true) });
    expect(funPop(fx(), 2, 'POW!', 0, 2, 0)).toBe(true);
    expect(funPop(fx(), 2, 'BONK!', 0, 2, 0)).toBe(false);
    expect(shown).toEqual(['POW!']);
  });

  it('one pool lookup and one tier count for every lane helper', () => {
    expect(funPool(fx())).toBeNull();
    const p = pool();
    setFunSink({ particles: p });
    expect(funPool(fx())).toBe(p);
    expect(funCount(fx('med'), 6)).toBe(6);
    expect(funCount(fx('low'), 6)).toBe(3);
    expect(funCount(fx('high', true), 6)).toBe(3);
    expect(funCount(fx('low'), 1)).toBe(1);
  });
});
