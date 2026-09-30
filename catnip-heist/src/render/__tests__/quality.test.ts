import { beforeEach, describe, expect, it } from 'vitest';
import { cappedPixelRatio, FpsProbe, LOW_FPS, QualityGovernor, resetQualityMemory, UP_FPS } from '../quality';

/** Feed `seconds` of frames at `fps`; returns the last tier the governor asked for. */
function run(g: QualityGovernor, fps: number, seconds: number) {
  let t: ReturnType<QualityGovernor['sample']> = null;
  for (let i = 0; i < Math.round(fps * seconds); i++) t = g.sample(1 / fps);
  return t;
}

/** Frames at `fps` until the governor asks for `tier`; returns the seconds it took (Infinity if never). */
function until(g: QualityGovernor, fps: number, tier: string, max = 30) {
  for (let i = 0; i < fps * max; i++) if (g.sample(1 / fps) === tier) return (i + 1) / fps;
  return Infinity;
}

describe('QualityGovernor', () => {
  beforeEach(() => resetQualityMemory());

  it('lets the start probe decide first', () => {
    const g = new QualityGovernor('high', new FpsProbe());
    expect(g.done).toBe(false);
    expect(run(g, 30, 3)).toBe('low');
    expect(g.done).toBe(true);
  });

  it('steps down only after sustained slow windows on high', () => {
    const g = new QualityGovernor('high', null);
    expect(run(g, LOW_FPS * 0.8, 2.5)).toBe('high');
    // A fast window resets the count (hysteresis).
    expect(run(g, 60, 4.5)).toBe('high');
    const t = until(g, LOW_FPS * 0.8, 'low');
    expect(t).toBeGreaterThan(2);
    expect(t).toBeLessThan(6.5);
  });

  it('does not step down at the probe threshold itself', () => {
    const g = new QualityGovernor('high', null);
    expect(run(g, LOW_FPS - 1, 20)).toBe('high');
  });

  it('steps up once after sustained headroom, re-probes, and falls back for good', () => {
    const g = new QualityGovernor('low', null);
    expect(run(g, UP_FPS - 5, 20)).toBe('low');
    expect(until(g, 60, 'high')).toBeGreaterThan(7.9);
    // High does not hold: the re-probe drops back to low.
    expect(run(g, 20, 3)).toBe('low');
    // No second attempt this session.
    expect(run(g, 60, 30)).toBe('low');
    expect(run(new QualityGovernor('low', null), 60, 30)).toBe('low');
  });

  it('keeps high after a successful step up', () => {
    const g = new QualityGovernor('low', null);
    expect(until(g, 60, 'high')).toBeLessThan(10);
    expect(run(g, 60, 10)).toBe('high');
  });

  it('never steps up when step-ups are off (title diorama)', () => {
    const g = new QualityGovernor('low', null, LOW_FPS, false);
    expect(run(g, 60, 30)).toBe('low');
  });

  it('ignores hitches over a second', () => {
    const g = new QualityGovernor('high', null);
    for (let i = 0; i < 10; i++) g.sample(2);
    expect(run(g, 60, 5)).toBe('high');
  });
});

describe('cappedPixelRatio', () => {
  it('keeps the device ratio up to the tier cap when within the pixel budget', () => {
    expect(cappedPixelRatio(3, 2, 390, 844, 2.6e6)).toBe(2);
    expect(cappedPixelRatio(1, 2, 1280, 720, 2.6e6)).toBe(1);
  });

  it('lowers the ratio on big hi-DPI screens, never below 1', () => {
    const pr = cappedPixelRatio(2, 2, 1728, 1117, 2.6e6);
    expect(pr).toBeLessThan(2);
    expect(1728 * 1117 * pr * pr).toBeLessThanOrEqual(2.6e6);
    expect(cappedPixelRatio(2, 2, 3840, 2160, 2.6e6)).toBe(1);
    expect(cappedPixelRatio(0.8, 2, 3840, 2160, 2.6e6)).toBe(0.8);
  });
});
