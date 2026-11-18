// @vitest-environment happy-dom
/** Practice's map colour picker (ui/mapPick.ts): the seasons offered per map, the saved pick, and what the match asks. */
import { beforeEach, describe, expect, it } from 'vitest';
import { MAP_POOL_3V3 } from '../../src/sim/api';
import { mapSchemes, pickScheme } from '../../src/render/mapSchemes';
import { practiceScheme, practiceSchemeChoices, practiceSchemeWish, SCHEME_CHIPS, setPracticeMap, setPracticeScheme } from '../../src/ui/mapPick';

describe('practice map colours', () => {
  beforeEach(() => localStorage.clear());

  it('offers Random plus each scheme of the picked map', () => {
    for (const m of MAP_POOL_3V3) expect(practiceSchemeChoices(m)).toEqual(['random', ...mapSchemes(m).map((s) => s.season)]);
    const any = practiceSchemeChoices('random');
    expect(any[0]).toBe('random');
    for (const m of MAP_POOL_3V3) for (const s of mapSchemes(m)) expect(any).toContain(s.season);
    for (const s of any) expect(SCHEME_CHIPS[s]).toBeTruthy();
  });

  it('defaults to Random and falls back when the map lacks the saved season', () => {
    expect(practiceScheme()).toBe('random');
    expect(practiceSchemeWish()).toBeNull();
    setPracticeScheme('frost');
    expect(practiceScheme('crossing')).toBe('frost');
    expect(practiceSchemeWish()).toBe('frost');
    setPracticeScheme('harvest');
    expect(practiceScheme('quarry')).toBe('random');
    setPracticeMap('crossing');
    expect(practiceScheme()).toBe('harvest');
  });

  it('the wished season wins over the seed', () => {
    for (const m of MAP_POOL_3V3) for (const s of mapSchemes(m)) for (const seed of [1, 7, 99]) expect(pickScheme(m, seed, s.season).id).toBe(s.id);
  });
});
