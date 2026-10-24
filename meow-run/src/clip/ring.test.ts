import { describe, expect, it } from 'vitest';
import { SegmentRing } from './ring';

const seg = (t0: number, t1: number, size = 1000) => ({ blob: { size }, t0, t1 });

describe('SegmentRing', () => {
  it('keeps at most 3 segments', () => {
    const r = new SegmentRing<{ size: number }>();
    for (let i = 0; i < 5; i++) r.push(seg(i * 6, i * 6 + 6));
    expect(r.length).toBe(3);
    expect(r.segments[0].t0).toBe(12);
    expect(r.seconds).toBeCloseTo(18);
  });
  it('keeps at most 40 MB but never drops the newest', () => {
    const r = new SegmentRing<{ size: number }>();
    const MB = 1024 * 1024;
    r.push(seg(0, 6, 25 * MB));
    r.push(seg(6, 12, 20 * MB));
    expect(r.length).toBe(1);
    expect(r.bytes).toBe(20 * MB);
    r.push(seg(12, 18, 50 * MB));
    expect(r.length).toBe(1);
    expect(r.newest()?.t0).toBe(12);
  });
  it('ignores empty or broken segments', () => {
    const r = new SegmentRing<{ size: number }>();
    r.push(seg(5, 5));
    r.push(seg(6, 2));
    r.push(seg(NaN, 3));
    expect(r.length).toBe(0);
    expect(r.covering(12)).toBeNull();
  });
  it('covering: the newest segments for the last 12 s plus the offset', () => {
    const r = new SegmentRing<{ size: number }>();
    r.push(seg(0, 6));
    r.push(seg(6, 12));
    r.push(seg(12, 16.5));
    const c = r.covering(12)!;
    expect(c.segments.map((s) => s.t0)).toEqual([0, 6, 12]);
    expect(c.offset).toBeCloseTo(4.5);
    expect(c.seconds).toBeCloseTo(12);
  });
  it('covering: exactly aligned window skips older segments', () => {
    const r = new SegmentRing<{ size: number }>();
    r.push(seg(0, 6));
    r.push(seg(6, 12));
    r.push(seg(12, 18));
    const c = r.covering(12)!;
    expect(c.segments.map((s) => s.t0)).toEqual([6, 12]);
    expect(c.offset).toBe(0);
    expect(c.seconds).toBeCloseTo(12);
  });
  it('covering: short history returns everything from 0', () => {
    const r = new SegmentRing<{ size: number }>();
    r.push(seg(0, 4));
    const c = r.covering(12)!;
    expect(c.segments.length).toBe(1);
    expect(c.offset).toBe(0);
    expect(c.seconds).toBeCloseTo(4);
  });
  it('covering: an explicit now', () => {
    const r = new SegmentRing<{ size: number }>();
    r.push(seg(0, 6));
    r.push(seg(6, 12));
    const c = r.covering(3, 12)!;
    expect(c.segments.length).toBe(1);
    expect(c.offset).toBeCloseTo(3);
    expect(c.seconds).toBeCloseTo(3);
  });
  it('clear empties it', () => {
    const r = new SegmentRing<{ size: number }>();
    r.push(seg(0, 6));
    r.clear();
    expect(r.length).toBe(0);
    expect(r.bytes).toBe(0);
    expect(r.seconds).toBe(0);
  });
});
