import { describe, expect, it } from 'vitest';
import { filterName, filterTitle, isBlocked } from './text-filter';

describe('filterName', () => {
  it('keeps normal names in many scripts and whitelisted emoji', () => {
    expect(filterName('  Mochi  ')).toBe('Mochi');
    expect(filterName('Žygis')).toBe('Žygis');
    expect(filterName('Мурка')).toBe('Мурка');
    expect(filterName('Mochi 🐱')).toBe('Mochi 🐱');
    expect(filterName('Mr. Tofu')).toBe('Mr. Tofu');
    expect(filterName('Class Cat')).toBe('Class Cat');
    expect(filterName('Grape')).toBe('Grape');
  });
  it('caps the length in code points', () => {
    expect(filterName('Abcdefghijklmnop')).toBe('Abcdefghijkl');
    expect(Array.from(filterName('🐱🐱🐱🐱🐱🐱🐱🐱🐱🐱🐱🐱🐱🐱')).length).toBe(12);
    expect(filterTitle('A kitchen with a very long title here')).toBe('A kitchen with a very lo');
  });
  it('strips control characters, URLs, emails, handles, phone numbers and other symbols', () => {
    expect(filterName('Mo\u0000chi​')).toBe('Mo chi');
    expect(filterName('https://evil.example')).toBe('');
    expect(filterName('cat www.x.com')).toBe('cat');
    expect(filterName('buy at shop.ru')).toBe('buy at');
    expect(filterName('a@b.lt')).toBe('');
    expect(filterName('@mochi')).toBe('');
    expect(filterName('+370 600 12345')).toBe('');
    expect(filterName('<b>Tofu</b>')).toBe('bTofub');
    expect(filterName('💩')).toBe('');
    expect(filterName('')).toBe('');
  });
  it('blocks the list with leetspeak, separators, repeats and accents', () => {
    for (const bad of ['fuck', 'F.U.C.K', 'fuuuck', 'Sh1t', 'b1tch', 'kurwa', 'Scheiße', 'enculé', 'хуй', 'ass', 'puta', 'Hitler'])
      expect(filterName(bad), bad).toBe('');
    expect(isBlocked('computadora')).toBe(false);
    expect(isBlocked('Dickens')).toBe(false);
  });
});
