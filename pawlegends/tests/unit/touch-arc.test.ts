/** Audit CF-04: the touch arc (input/touch/touchArc.ts) keeps every pair of buttons apart on 667, 844 and 932 px phones. */
import { describe, expect, it } from 'vitest';
import { ARC_GAP, ARC_MAIN, ARC_TOP, arcLayout, arcScale, arcStyle, minGap, type ArcButton } from '../../src/input/touch/touchArc';

const MAIN: ArcButton[] = [...ARC_MAIN];

describe('CF-04 touch arc', () => {
  for (const [w, h] of [[667, 375], [844, 390], [932, 430]]) {
    it(`${w}x${h}: every pair of buttons (and the optional last-hit and tower ones) keeps a gap`, () => {
      const l = arcLayout(w, h);
      const k = arcScale(w, h);
      const main = minGap(l, MAIN);
      // feel pass B3: the smallest gap is 14 px at scale 1 (R–W), scaled with the arc
      expect(main.gap, `${main.a} vs ${main.b}`).toBeGreaterThanOrEqual(ARC_GAP * k - 1);
      const all = minGap(l);
      expect(all.gap, `${all.a} vs ${all.b}`).toBeGreaterThanOrEqual(ARC_GAP * k - 1);
      // no main button reaches above ARC_TOP (the right-edge column is exempt)
      for (const id of MAIN) expect(l[id].by + l[id].d / 2, id).toBeLessThanOrEqual(ARC_TOP * k + 1);
      // the trick (flash) sits bottom-left beside Q, as in MLBB
      expect(l.trick.rx).toBeGreaterThan(l.q.rx);
      expect(l.trick.by).toBeLessThan(l.w.by);
    });
  }

  it('every button stays at least 44 px wide, and the cluster fits a 667x375 phone', () => {
    const l = arcLayout(667, 375);
    for (const [id, s] of Object.entries(l)) {
      expect(s.d).toBeGreaterThanOrEqual(44);
      // the cluster sits 28 px from the right and 24 px from the bottom
      expect(s.rx + s.d / 2 + 28).toBeLessThan(667 / 2);
      // the right-edge column reaches up to just under the 24 px top strip
      expect(s.by + s.d / 2 + 24, id).toBeLessThan(375 - 24);
      expect(s.rx - s.d / 2).toBeGreaterThanOrEqual(-28);
    }
  });

  it('feel pass B3: the main cluster is ~268 px wide at scale 1 (was 312)', () => {
    const l = arcLayout(844, 390);
    const reach = Math.max(...MAIN.map((id) => l[id].rx + l[id].d / 2));
    expect(reach).toBeLessThanOrEqual(270);
    expect(reach).toBeGreaterThanOrEqual(260);
  });

  it('a short phone gets a smaller arc than a tall one', () => {
    expect(arcScale(667, 375)).toBeLessThan(arcScale(932, 430));
    expect(arcScale(844, 390)).toBe(1);
    expect(arcStyle({ rx: 48, by: 48, d: 96 })).toEqual({ left: '', right: '0px', bottom: '0px', width: '96px', height: '96px' });
  });
});
