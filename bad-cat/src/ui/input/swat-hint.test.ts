import { describe, expect, it } from 'vitest';
import { swatHintFor } from './source';

describe('swatHintFor (SWAT / GRAB / PULL label)', () => {
  it('carrying reads GRAB (drop), the FTUE swat lesson reads SWAT, a pull reads PULL', () => {
    expect(swatHintFor(null, true)).toBe('grab');
    expect(swatHintFor({ grab: true }, false, true)).toBe('swat');
    expect(swatHintFor({ grab: true }, false)).toBe('grab');
    expect(swatHintFor({ grab: false, pull: 'cloth' }, false)).toBe('pull');
    expect(swatHintFor({ grab: false, pull: 'cable' }, false)).toBe('pull');
    expect(swatHintFor({ grab: false }, false)).toBe('swat');
    expect(swatHintFor(null, false)).toBe('swat');
  });
});
