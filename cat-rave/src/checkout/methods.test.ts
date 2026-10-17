import { describe, expect, it } from 'vitest';
import { METHOD_LABELS, defaultMethod, methodOffText } from './methods';

describe('Card | Crypto selector', () => {
  it('card is the default whenever it is open', () => {
    expect(defaultMethod({ card: true, usdc: true })).toBe('card');
    expect(defaultMethod({ card: true, usdc: false })).toBe('card');
    expect(defaultMethod({ card: false, usdc: true })).toBe('usdc');
  });
  it('crypto is labelled as USDC on Arc', () => {
    expect(METHOD_LABELS.usdc).toEqual({ main: '🪙 Crypto', sub: 'USDC on Arc' });
    expect(METHOD_LABELS.card.main).toBe('💳 Card');
  });
  it('says why a method is closed', () => {
    expect(methodOffText('card', 'keeper')).toMatch(/refills/);
    expect(methodOffText('card', 'stripe')).toMatch(/not available/);
    expect(methodOffText('usdc', 'chain')).toMatch(/USDC on Arc/);
  });
});
