import { describe, expect, it } from 'vitest';
import { focusAt, hypeAt, newFrame, newTimeline, prune, pushMark, pushSample, scoreAt } from './hype';

describe('clip hype timeline', () => {
  it('interpolates the score and finds what showed at a time', () => {
    const tl = newTimeline();
    for (let i = 0; i <= 50; i++) pushSample(tl, i * 0.1, i * 100, 0.5, Number.NaN);
    expect(scoreAt(tl, 1.05)).toBeCloseTo(1050);
    expect(scoreAt(tl, 99)).toBe(5000);
    pushMark(tl, 1, 'combo', '', '', 1, 6, '');
    pushMark(tl, 1.2, 'stamp', 'NICE!', '', 1, 0, '');
    pushMark(tl, 1.3, 'pop', 'SPIN +250', '', 0, 0, 'trick');
    pushMark(tl, 1.4, 'pop', 'FLIP +200', '', 0, 0, 'trick');
    pushMark(tl, 2, 'combo', '', '', 2, 11, '');
    const f = hypeAt(tl, 1.5, newFrame());
    expect([f.combo, f.comboTier]).toEqual([6, 1]);
    expect(f.stamp?.text).toBe('NICE!');
    expect(f.pops.map((p) => p.text)).toEqual(['FLIP +200', 'SPIN +250']);
    const g = hypeAt(tl, 2.85, newFrame());
    expect(g.combo).toBe(11);
    expect(g.stamp).toBeNull();
    expect(g.pops.length).toBe(1);
    prune(tl, 4.5);
    expect(hypeAt(tl, 4.6, newFrame()).combo).toBe(11);
    expect(scoreAt(tl, 4.6)).toBeCloseTo(4600);
  });
  it('centres the crop on Mochi, or between her and a chaser that fits', () => {
    const tl = newTimeline();
    pushSample(tl, 0, 0, 0.3, Number.NaN);
    pushSample(tl, 1, 0, 0.5, 0.8);
    expect(focusAt(tl, 0, 0.3)).toBeCloseTo(0.3);
    expect(focusAt(tl, 1, 0.5)).toBeCloseTo(0.65);
    expect(focusAt(tl, 1, 0.2)).toBeCloseTo(0.5); // the chaser does not fit: Mochi wins
    expect(focusAt(tl, -1, 0.3)).toBeNaN();
  });
});
