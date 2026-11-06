/** Audit CF-04: the touch arc (input/touch/touchArc.ts) keeps every pair of buttons apart on 667, 844 and 932 px phones. */
import { describe, expect, it } from 'vitest';
import { ARC_TOP, arcLayout, arcScale, arcStyle, minGap, type ArcButton } from '../../src/input/touch/touchArc';

const MAIN: ArcButton[] = ['attack', 'q', 'w', 'e', 'r', 'trick', 'nap'];

describe('CF-04 touch arc', () => {
  for (const [w, h] of [[667, 375], [844, 390], [932, 430]]) {
    it(`${w}x${h}: every pair of buttons (and the optional last-hit and tower ones) keeps a gap`, () => {
      const l = arcLayout(w, h);
      const k = arcScale(w, h);
      const main = minGap(l, MAIN);
      expect(main.gap, `${main.a} vs ${main.b}`).toBeGreaterThanOrEqual(w === 844 ? 16 : 14);
      const all = minGap(l);
      expect(all.gap, `${all.a} vs ${all.b}`).toBeGreaterThanOrEqual(12);
      // no main button reaches above the old E button's top (the phone kill feed and enemy portraits sit there)
      for (const id of MAIN) expect(l[id].by + l[id].d / 2, id).toBeLessThanOrEqual(ARC_TOP * k + 1);
      void k;
      // E and the trick overlapped by 5 px before
      expect(minGap(l, ['e', 'trick']).gap).toBeGreaterThan(14);
    });
  }

  it('every button stays at least 44 px wide, and the cluster fits a 667x375 phone', () => {
    const l = arcLayout(667, 375);
    for (const s of Object.values(l)) {
      expect(s.d).toBeGreaterThanOrEqual(44);
      // the cluster sits 28 px from the right and 24 px from the bottom
      expect(s.rx + s.d / 2 + 28).toBeLessThan(667 / 2);
      expect(s.by + s.d / 2 + 24).toBeLessThan(375 - 90);
      expect(s.rx - s.d / 2).toBeGreaterThanOrEqual(-28);
    }
  });

  it('a short phone gets a smaller arc than a tall one', () => {
    expect(arcScale(667, 375)).toBeLessThan(arcScale(932, 430));
    expect(arcScale(844, 390)).toBe(1);
    expect(arcStyle({ rx: 48, by: 48, d: 96 })).toEqual({ right: '0px', bottom: '0px', width: '96px', height: '96px' });
  });
});
