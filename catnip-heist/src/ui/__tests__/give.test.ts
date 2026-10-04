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
  it('passes an optional ?chain=<id> through to the give page, and drops a malformed one', () => {
    expect(giveHref('/shelter-payouts/give', 'Luna', '84532')).toBe('/shelter-payouts/give?from=heist&cat=Luna&chain=84532');
    for (const bad of ['', '0', '-1', '0x14a34', '84532&x=1', null]) {
      expect(giveHref('/shelter-payouts/give', 'Luna', bad)).toBe('/shelter-payouts/give?from=heist&cat=Luna');
    }
    // A chain already in the build's give URL wins.
    expect(giveHref('/g?chain=4217', 'Luna', '84532')).toBe('/g?chain=4217&from=heist&cat=Luna');
  });
  it('an empty or blank URL hides the button', () => {
    expect(giveHref('', 'Luna')).toBe('');
    expect(giveHref('   ', 'Luna')).toBe('');
  });
});
