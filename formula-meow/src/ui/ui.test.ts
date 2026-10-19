import { describe, expect, it } from 'vitest';
import { pseudo, registerStrings, setLocale, t } from './i18n';
import { driftTierColors, setA11y } from './a11y';
import { nextFocus } from './kit';

describe('ui contracts (iteration 2)', () => {
  it('t() looks keys up, fills vars and falls back to the key; ?lang=xx pseudo-localises', () => {
    registerStrings('en', { 'Hello {n}': 'Hello, {n}!' });
    setLocale('en');
    expect(t('Hello {n}', { n: 'Tofu' })).toBe('Hello, Tofu!');
    expect(t('Missing key')).toBe('Missing key');
    setLocale('xx');
    expect(t('Hello {n}', { n: 'Tofu' })).toMatch(/^⟦.*Tófú.*⟧$/);
    expect(pseudo('{n} cats')).toContain('{n}');
    setLocale('en');
  });

  it('drift tier colours follow the colourblind setting', () => {
    setA11y({ colourblind: 'off' });
    const off = driftTierColors();
    setA11y({ colourblind: 'deut' });
    expect(driftTierColors()).not.toEqual(off);
    setA11y({ colourblind: 'off' });
  });

  it('focus moves to the nearest control in the pressed direction', () => {
    const grid = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 0, y: 60 },
      { x: 100, y: 60 },
    ];
    expect(nextFocus(grid, -1, 0, 1)).toBe(0);
    expect(nextFocus(grid, 0, 1, 0)).toBe(1);
    expect(nextFocus(grid, 0, 0, 1)).toBe(2);
    expect(nextFocus(grid, 3, 0, -1)).toBe(1);
    expect(nextFocus(grid, 1, 1, 0)).toBe(1); // nothing further right: stay
  });
});
