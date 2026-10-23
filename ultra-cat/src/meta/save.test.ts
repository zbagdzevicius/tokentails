import { describe, expect, it } from 'vitest';
import { CAT_ORDER, SAVE_VERSION, UPGRADE_MAX, type SaveData } from '../core/types';
import { defaultSave, migrate } from './save';

describe('defaultSave', () => {
  it('owns only the tabby and is a fixed point of migrate', () => {
    const d = defaultSave();
    expect(d.v).toBe(SAVE_VERSION);
    expect(d.cats.tabby.owned).toBe(true);
    expect(CAT_ORDER.filter((c) => d.cats[c].owned)).toEqual(['tabby']);
    expect(migrate(d)).toEqual(d);
    expect(migrate(JSON.parse(JSON.stringify(d)))).toEqual(d);
  });
});

describe('migrate', () => {
  const garbage: unknown[] = [null, undefined, 0, 42, NaN, '', 'not json {', '[1,2]', true, [], [1, 2, 3], () => 1, Symbol('x'), { v: 'x' }, { cats: 5, levels: 'no', settings: [] }];
  it.each(garbage.map((g) => [g]))('never throws and returns a valid save for %s', (g) => {
    const s = migrate(g);
    expect(s.v).toBe(SAVE_VERSION);
    expect(s.cats.tabby.owned).toBe(true);
    expect(s.selectedCat).toBe('tabby');
    expect(s.catnip).toBe(0);
  });

  it('survives getters that throw', () => {
    const evil = {};
    Object.defineProperty(evil, 'cats', {
      get() {
        throw new Error('boom');
      },
      enumerable: true,
    });
    expect(migrate(evil)).toEqual(defaultSave());
  });

  it('parses a JSON string', () => {
    const d = defaultSave();
    d.catnip = 77;
    expect(migrate(JSON.stringify(d)).catnip).toBe(77);
  });

  it('clamps numbers and drops wrong types field by field', () => {
    const s = migrate({
      catnip: -50,
      selectedCat: 'chonk', // not owned -> tabby
      cats: { tabby: { owned: false, upgrades: { power: 99, speed: -3, fur: 2.7, ultra: 'x' } }, chonk: { owned: 'yes' }, dog: { owned: true } },
      levels: {
        meowhattan: { stars: 9, objectives: [true, 'true', 1], best: -5, plays: 3.9 },
        moon: { stars: 3 },
        docks: 'nope',
        suburbia: { stars: 1.5, objectives: [false, false, true, true], best: Infinity },
      },
      settings: { master: 3, music: -1, sfx: 'loud', shake: 0.25, quality: 'ultra' },
      tutorialDone: 'yes',
      totals: { runs: 2, damage: NaN, catnipEarned: 1e30 },
    });
    expect(s.catnip).toBe(0);
    expect(s.selectedCat).toBe('tabby');
    expect(s.cats.tabby).toEqual({ owned: true, upgrades: { power: UPGRADE_MAX, speed: 0, fur: 2, ultra: 0 } });
    expect(s.cats.chonk.owned).toBe(false);
    expect((s.cats as Record<string, unknown>).dog).toBeUndefined();
    expect(s.levels.meowhattan).toEqual({ stars: 3, objectives: [true, false, false], best: 0, plays: 3 });
    expect((s.levels as Record<string, unknown>).moon).toBeUndefined();
    expect(s.levels.docks).toBeUndefined();
    expect(s.levels.suburbia).toEqual({ stars: 1, objectives: [false, false, true], best: 0, plays: 0 });
    expect(s.settings).toEqual({ master: 1, music: 0, sfx: 1, shake: 0.25, quality: 'high' });
    expect(s.tutorialDone).toBe(false);
    expect(s.totals.runs).toBe(2);
    expect(s.totals.damage).toBe(0);
    expect(s.totals.catnipEarned).toBeLessThanOrEqual(1e9);
  });

  it('raises stars to the objectives already collected', () => {
    const s = migrate({ levels: { docks: { stars: 0, objectives: [true, true, false], best: 10, plays: 1 } } });
    expect(s.levels.docks?.stars).toBe(2);
  });

  it('keeps a valid partial save and fills the rest', () => {
    const s = migrate({ catnip: 320, selectedCat: 'shadow', cats: { shadow: { owned: true, upgrades: { speed: 3 } } }, tutorialDone: true });
    expect(s.catnip).toBe(320);
    expect(s.selectedCat).toBe('shadow');
    expect(s.cats.shadow.upgrades).toEqual({ power: 0, speed: 3, fur: 0, ultra: 0 });
    expect(s.cats.siamese.owned).toBe(false);
    expect(s.tutorialDone).toBe(true);
    expect(s.settings).toEqual(defaultSave().settings);
  });

  it('reads a future version best-effort and stamps the current version', () => {
    const fut = { ...defaultSave(), v: 99, catnip: 12, newField: { x: 1 } } as unknown as SaveData;
    const s = migrate(fut);
    expect(s.v).toBe(SAVE_VERSION);
    expect(s.catnip).toBe(12);
    expect((s as unknown as Record<string, unknown>).newField).toBeUndefined();
  });

  it('does not mutate its input', () => {
    const raw = { catnip: 5, cats: { tabby: { owned: false, upgrades: { power: 9 } } } };
    const copy = JSON.parse(JSON.stringify(raw));
    migrate(raw);
    expect(raw).toEqual(copy);
  });
});
