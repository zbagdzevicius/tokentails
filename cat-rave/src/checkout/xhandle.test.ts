import { describe, expect, it } from 'vitest';
import { normalizeXHandle, xProfileUrl } from './xhandle';

const ok = (handle: string | null) => ({ ok: true, handle });

describe('normalizeXHandle', () => {
  it('empty means no handle', () => {
    expect(normalizeXHandle('')).toEqual(ok(null));
    expect(normalizeXHandle('   ')).toEqual(ok(null));
    expect(normalizeXHandle(undefined)).toEqual(ok(null));
  });
  it('accepts @handle, handle and profile URLs', () => {
    const cases: Array<[string, string]> = [
      ['@someone', 'someone'],
      ['someone', 'someone'],
      ['  @Some_One1  ', 'Some_One1'],
      ['x.com/someone', 'someone'],
      ['https://x.com/someone', 'someone'],
      ['https://x.com/someone/', 'someone'],
      ['http://www.x.com/someone?s=21', 'someone'],
      ['https://twitter.com/someone', 'someone'],
      ['https://mobile.twitter.com/someone#top', 'someone'],
      ['HTTPS://X.COM/SomeOne', 'SomeOne'],
      ['@​someone', 'someone'],
      ['＠ｓｏｍｅｏｎｅ', 'someone'],
      ['a', 'a'],
      ['abcdefghijklmno', 'abcdefghijklmno'],
    ];
    for (const [input, handle] of cases) expect(normalizeXHandle(input), input).toEqual(ok(handle));
  });
  it('refuses other hosts, deeper paths, bad characters and long input', () => {
    const bad = [
      'https://instagram.com/someone',
      'https://x.com.evil.io/someone',
      'https://evil.io/x.com/someone',
      'https://x.com/someone/status/1',
      'https://x.com/',
      'x.com',
      'javascript:alert(1)',
      '@@someone',
      'some one',
      'some-one',
      'some.one',
      'abcdefghijklmnop',
      '<script>',
      '😺😺',
      'a'.repeat(101),
      '@someone"onmouseover=',
    ];
    for (const input of bad) expect(normalizeXHandle(input), input).toMatchObject({ ok: false, code: 'X_HANDLE_INVALID' });
  });
  it("refuses X's own pages", () => {
    for (const p of ['home', 'settings', 'i', 'Intent', 'https://x.com/explore', '@login']) {
      expect(normalizeXHandle(p), p).toMatchObject({ ok: false, code: 'X_HANDLE_INVALID' });
    }
  });
  it('refuses handles that fail the profanity check', () => {
    expect(normalizeXHandle('@fuuuck')).toMatchObject({ ok: false, code: 'X_HANDLE_BLOCKED' });
    expect(normalizeXHandle('https://x.com/fuck_you')).toMatchObject({ ok: false, code: 'X_HANDLE_BLOCKED' });
  });
  it('refuses non-strings', () => {
    expect(normalizeXHandle(42)).toMatchObject({ ok: false, code: 'X_HANDLE_INVALID' });
  });
});

describe('xProfileUrl', () => {
  it('builds the URL only from a valid handle', () => {
    expect(xProfileUrl('someone')).toBe('https://x.com/someone');
    expect(xProfileUrl('evil.com/x')).toBeNull();
    expect(xProfileUrl('a"b')).toBeNull();
    expect(xProfileUrl(null)).toBeNull();
    expect(xProfileUrl('')).toBeNull();
  });
});
