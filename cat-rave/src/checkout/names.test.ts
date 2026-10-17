import { describe, expect, it } from 'vitest';
import { normalizeCatName } from '../../../shared/name';
import { CUTE_NAMES, NAME_REPEAT_MESSAGE, checkName, checkNames, expandNames, nameFieldCount, namesSummary, placeholders, shoutOutText } from './names';

describe('cute default names', () => {
  it('has 40 distinct names that all pass the server name check', () => {
    expect(new Set(CUTE_NAMES).size).toBe(40);
    for (const n of CUTE_NAMES) expect(normalizeCatName(n)).toEqual({ ok: true, name: n });
  });
  it('placeholders are distinct and stable per seed', () => {
    const a = placeholders(10, 7);
    expect(new Set(a).size).toBe(10);
    expect(placeholders(10, 7)).toEqual(a);
    expect(placeholders(10, 8)).not.toEqual(a);
  });
});

describe('field counts', () => {
  it('one field per cat up to 10, then a rest field', () => {
    expect(nameFieldCount(1)).toEqual({ named: 1, rest: false });
    expect(nameFieldCount(5)).toEqual({ named: 5, rest: false });
    expect(nameFieldCount(10)).toEqual({ named: 10, rest: false });
    expect(nameFieldCount(11)).toEqual({ named: 10, rest: true });
    expect(nameFieldCount(500)).toEqual({ named: 10, rest: true });
  });
});

describe('checkName', () => {
  it('empty is fine (server default)', () => {
    expect(checkName('')).toEqual({ ok: true, name: null });
    expect(checkName('   ')).toEqual({ ok: true, name: null });
  });
  it('normalises good names', () => {
    expect(checkName('  Disco   Paws ')).toEqual({ ok: true, name: 'Disco Paws' });
    expect(checkName('Žemaitė')).toEqual({ ok: true, name: 'Žemaitė' });
  });
  it('refuses URLs, emoji spam, too long, too short and profanity', () => {
    expect(checkName('https://evil.example')).toMatchObject({ ok: false, code: 'NAME_CHARS' });
    expect(checkName('www.spam.com')).toMatchObject({ ok: false, code: 'NAME_CHARS' });
    expect(checkName('🐈🐈🐈🐈')).toMatchObject({ ok: false, code: 'NAME_CHARS' });
    expect(checkName('<b>hi</b>')).toMatchObject({ ok: false, code: 'NAME_CHARS' });
    expect(checkName('Seventeen chars xx')).toMatchObject({ ok: false, code: 'NAME_TOO_LONG' });
    expect(checkName('A')).toMatchObject({ ok: false, code: 'NAME_TOO_SHORT' });
    expect(checkName('fuuuck')).toMatchObject({ ok: false, code: 'NAME_BLOCKED' });
    expect(checkName('Fuuuck').ok).toBe(false);
  });
});

describe('checkNames', () => {
  it('collects per-field errors, keeps empty fields empty', () => {
    const r = checkNames(['Mochi', '', 'x!'], '', 3);
    expect(r.ok).toBe(false);
    expect(r.names).toEqual(['Mochi', '', '']);
    expect(r.errors).toEqual([{ index: 2, message: expect.any(String) }]);
  });
  it('only reads as many fields as cats', () => {
    const r = checkNames(['Mochi', 'bad!!'], '', 1);
    expect(r).toEqual({ ok: true, names: ['Mochi'], restName: '', errors: [] });
  });
  it('flags a 4th identical name (NAME_REPEAT), case and accent folded', () => {
    const r = checkNames(['Bob', 'bob', 'BOB', 'Bob', 'Mia'], '', 5);
    expect(r.errors).toEqual([{ index: 3, message: NAME_REPEAT_MESSAGE }]);
    expect(checkNames(['Bob', 'bob', 'BOB'], '', 3).ok).toBe(true);
  });
  it('checks the rest name only above 10 cats', () => {
    expect(checkNames([], 'b@d', 10).ok).toBe(true);
    expect(checkNames([], 'b@d', 11).errors).toEqual([{ index: 'rest', message: expect.any(String) }]);
    expect(checkNames([], 'Disco', 11).restName).toBe('Disco');
  });
});

describe('expandNames / summary / shout-out', () => {
  it('expands the rest name with 1-based numbers', () => {
    const names = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9', 'A10'];
    const all = expandNames(names, 'Disco', 12);
    expect(all.slice(9)).toEqual(['A10', 'Disco 11', 'Disco 12']);
    expect(expandNames(names, 'Disco', 500, 12)).toHaveLength(12);
    expect(expandNames(['Mochi'], null, 1)).toEqual(['Mochi']);
  });
  it('summarises names', () => {
    expect(namesSummary(['Mochi'], 1)).toBe('Mochi');
    expect(namesSummary(['Mochi', 'Pixel'], 2)).toBe('Mochi and Pixel');
    expect(namesSummary(['Mochi', 'Pixel', 'Bean'], 5)).toBe('Mochi, Pixel and 3 more');
    expect(namesSummary([], 3)).toBe('3 cats');
  });
  it('builds the DJ line', () => {
    expect(shoutOutText(['Mochi', 'Pixel', 'Bean'], 5, 'someone')).toBe('Shout-out to Mochi, Pixel and 3 more! Shout-out to @someone!');
    expect(shoutOutText(['Mochi'], 1, null)).toBe('Shout-out to Mochi!');
  });
});
