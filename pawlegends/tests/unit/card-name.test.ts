// @vitest-environment happy-dom
/**
 * meta/cardName.ts, the dormant card-skin naming kit (lobby spec §3b): a registered card skin names the hero; only the
 * player's slot changes; bots and allies keep their names; featured (unowned) cats never rename anyone. The game no
 * longer registers any cat (NO-TOKENTAILS.md: the cards drawer and the pick screen's card tiles are gone), so these
 * pure helpers are kept for the in-match names (selfNames, cutName, tidyName). Nothing here imports the sim.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cardIdentity, cutName, displayName, getEquippedCard, heroSub, selfNames, tidyName, veilName } from '../../src/meta/cardName';
import { resetRegistry, setFeaturedSkins, setRosterSkins } from '../../src/render/skins/registry';
import { slotNames } from '../../src/ui/heroText';
import type { RosterCat } from '../../src/meta/roster';
import { plateName } from '../../src/ui/overhead';

const CDN = 'https://storage.googleapis.com/tokentails-public/heist';
const ROSTER: RosterCat[] = [
  { id: 'a', name: 'Simas', type: 'FIRE', tier: 'LEGENDARY', isStarter: false, origin: 'adopt', sprite: `${CDN}/assets/FICUS/base.png` },
  { id: 'b', name: 'Bartholomew The Third', type: 'ICE', tier: 'RARE', isStarter: false, origin: 'redeem' },
];

afterEach(() => {
  resetRegistry();
  document.body.innerHTML = '';
});

describe('card names (meta/cardName.ts)', () => {
  it('a worn owned card names the hero; the hero title and role go underneath', () => {
    setRosterSkins(ROSTER);
    const id = cardIdentity('clem', { coat: 'cat.a' });
    expect(id).toMatchObject({ name: 'Simas', heroTitle: 'Clem', role: 'Fighter', sub: 'Clem the Fighter', element: 'FIRE', elementName: 'Fire', rung: 'LEGENDARY' });
    expect(id?.sprite).toContain('FICUS');
    expect(getEquippedCard).toBe(cardIdentity);
    expect(displayName('brutus', { coat: 'cat.a' })).toBe('Simas');
    expect(heroSub('brutus')).toBe('Sir Brutus the Tank');
    expect(veilName('clem', { coat: 'cat.a' })).toBe('Simas (Clem)');
  });

  it('no card, a store coat, an unknown skin or a featured preview keep the hero title', () => {
    setRosterSkins(ROSTER);
    setFeaturedSkins([{ catalogId: 'abc123', name: 'Starry', type: 'STELLAR', tier: 'LEGENDARY' }]);
    for (const look of [null, { coat: null }, { coat: 'skin.clem.pink_bow' }, { coat: 'cat.gone' }, { coat: 'cat.f.abc123' }]) {
      expect(cardIdentity('clem', look)).toBeNull();
      expect(displayName('clem', look)).toBe('Clem');
      expect(veilName('clem', look)).toBe('Clem');
    }
  });

  it('a name with only spaces never renames; whitespace is collapsed', () => {
    setRosterSkins([{ id: 'w', name: '   ', type: 'WIND', tier: 'COMMON', isStarter: false }, { id: 'x', name: ' Mr   Paws ', type: 'WIND', tier: 'COMMON', isStarter: false }]);
    expect(cardIdentity('sage', { coat: 'cat.w' })).toBeNull();
    expect(cardIdentity('sage', { coat: 'cat.x' })?.name).toBe('Mr Paws');
    expect(tidyName(undefined)).toBe('');
  });

  it('QA: invisible, reordering and broken names are cleaned (or fall back to the hero title)', () => {
    // zero-width only: nothing printable, so no rename
    expect(tidyName('\u200B\u200B')).toBe('');
    // a right-to-left override cannot reorder "· Clem (you)" or the kill feed
    expect(tidyName('\u202Eevil\u202C')).toBe('evil');
    // a lone surrogate (an emoji cut by the roster's 24-character slice) is dropped, a whole emoji stays
    expect(tidyName(`${'x'.repeat(23)}\ud83d`)).toBe('x'.repeat(23));
    expect(tidyName('Luna 😀')).toBe('Luna 😀');
    // line and paragraph separators become plain spaces
    expect(tidyName('Mr\u2028Paws\u2029')).toBe('Mr Paws');
    // stacked combining marks collapse to two per letter; accents stay
    expect(tidyName(`Z${'\u0301'.repeat(23)}oe`)).toBe('Z\u0301\u0301oe');
    expect(tidyName('Renée')).toBe('Renée');
    // symbols alone still count as a name
    expect(tidyName('😺')).toBe('😺');
    setRosterSkins([{ id: 'z', name: '\u200B\u200D', type: 'WIND', tier: 'COMMON', isStarter: false }]);
    expect(cardIdentity('sage', { coat: 'cat.z' })).toBeNull();
  });

  it('selfNames renames only the player slot; bots keep their persona names', () => {
    const picks = ['clem', 'sage', 'brutus', 'cacklejaw', 'brutus', 'sage'] as const;
    const base = slotNames(picks, 1234, 0);
    const out = selfNames(base, 0, { name: 'Simas' });
    expect(out[0]).toBe('Simas');
    expect(out.slice(1)).toEqual(base.slice(1));
    expect(selfNames(base, 0, null)).toEqual(base);
    expect(selfNames(base, 9, { name: 'Simas' })).toEqual(base);
    // a dog-side player
    expect(selfNames(base, 4, { name: 'Simas' })[4]).toBe('Simas');
  });

  it('cutName cuts plate names at 14 code points with an ellipsis', () => {
    expect(cutName('Simas')).toBe('Simas');
    expect(cutName('Bartholomew The Third')).toBe('Bartholomew T…');
    expect(Array.from(cutName('Bartholomew The Third'))).toHaveLength(14);
    expect(cutName('😺😺😺😺😺😺😺😺😺😺😺😺😺😺😺😺', 14)).toBe(`${'😺'.repeat(13)}…`);
  });

  it('other plates are untouched: the player plate still reads "You" without a card', () => {
    expect(plateName({ id: 0, team: 0, hero: 'clem' }, 0, 0, new Set(), ['Simas'])).toBe('You');
  });
});
