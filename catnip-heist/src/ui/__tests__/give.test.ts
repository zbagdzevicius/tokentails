import { describe, expect, it } from 'vitest';
import { giveHref } from '../payouts';
import { GIVE_URL } from '../../types';

describe('giveHref (win-screen "rescue treat" button)', () => {
  it('defaults to the same-origin give page', () => {
    expect(GIVE_URL).toBe('/shelter-payouts/give');
    expect(giveHref(GIVE_URL, 'Luna')).toBe('/shelter-payouts/give?from=heist&cat=Luna');
  });
  it('encodes the rescued cat name', () => {
    expect(giveHref('/shelter-payouts/give', 'Mr. Whiskers & Co')).toBe('/shelter-payouts/give?from=heist&cat=Mr.+Whiskers+%26+Co');
    expect(giveHref('/g', 'Rožė')).toBe('/g?from=heist&cat=Ro%C5%BE%C4%97');
  });
  it('keeps an existing query and hash, and drops an empty cat', () => {
    expect(giveHref('https://tokentails.com/shelter-payouts/give?ref=x#top', '')).toBe('https://tokentails.com/shelter-payouts/give?ref=x&from=heist#top');
  });
  it('caps a very long name', () => {
    const href = giveHref('/g', 'a'.repeat(200));
    expect(new URLSearchParams(href.split('?')[1]).get('cat')).toHaveLength(64);
  });
  it('an empty or blank URL hides the button', () => {
    expect(giveHref('', 'Luna')).toBe('');
    expect(giveHref('   ', 'Luna')).toBe('');
  });
});
