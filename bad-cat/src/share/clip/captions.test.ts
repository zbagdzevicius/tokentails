import { describe, expect, it } from 'vitest';
import { fixtureRoom, fixtureRun } from '../test-fixtures';
import { captionAt, captionFor, clipShareText, formatGap, hookFor } from './captions';
import { planClip } from './highlights';

describe('captions', () => {
  it('formats the turn gap in tenths of a second', () => {
    expect(formatGap(12)).toBe('0.4');
    expect(formatGap(6)).toBe('0.2');
    expect(formatGap(0)).toBe('0.1');
    expect(formatGap(45)).toBe('1.5');
  });

  it('captionFor uses the measured gap, else the hook', () => {
    const plan = planClip(fixtureRun([]), fixtureRoom(), 'Mochi');
    expect(captionFor(plan, 12)).toBe('He turned around 0.4 seconds too late');
    expect(captionFor(plan)).toBe(plan.hook);
    expect(captionAt(plan, 299)).toBe(plan.hook);
    expect(captionAt(plan, 300)).toBe(plan.urlLine);
  });

  it('templates', () => {
    expect(hookFor('perfect', 'Mochi')).toBe('Mochi has never been caught');
    expect(hookFor('glass', 'Mochi')).toBe('Mochi vs. the wine glass');
    expect(clipShareText('Mochi', 'tokentails.com/badcat/d/18')).toContain('#badcatdaily');
  });
});
