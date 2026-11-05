// @vitest-environment happy-dom
/**
 * Lobby spec §3b: a hero wearing one of the player's own Token Tails cats is called by the cat's name everywhere the
 * player's name shows (pick tile, loading veil, plate, kill feed, scoreboard, results), with the hero underneath. Only
 * the player's slot changes; bots and allies keep their names; featured (unowned) cats never rename anyone. The
 * "Your cards" drawer shows real cards only (an empty roster gets the shelter champions and a sign-in or link, never
 * an invented card, a price or a buy button). Render and UI only: nothing here imports the sim.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cardIdentity, cutName, displayName, getEquippedCard, heroSub, selfNames, tidyName, veilName } from '../../src/meta/cardName';
import { resetRegistry, setFeaturedSkins, setRosterSkins } from '../../src/render/skins/registry';
import { slotNames } from '../../src/ui/heroText';
import { pickScreen, setPickLook } from '../../src/ui/screens';
import { rosterCosmetics, type RosterCat } from '../../src/meta/roster';
import { bondLine, catFace, cardLabel, cssUrl, deckCard } from '../../src/ui/deck/deckCard';
import { emptyAction, emptyCard, postcards } from '../../src/ui/deck/empty';
import { openDeck } from '../../src/ui/deck/deck';
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

describe('pick screen with the cards drawer', () => {
  const opts = (onDeck = vi.fn()) => ({
    initial: { hero: 'clem' as const, trick: 'pounce' as const, difficulty: 'easy' as const },
    owned: { items: new Set<string>(), unlocks: new Set<string>(), roster: rosterCosmetics(ROSTER) },
    looks: { clem: { coat: 'cat.a', chroma: null } },
    skins: { owned: [{ id: 'cat.a', name: 'Simas', element: 'FIRE' as const, rung: 'LEGENDARY' as const, bond: 3 }], locked: [] },
    onHero: () => undefined,
    onStart: () => undefined,
    onBack: () => undefined,
    onDeck,
  });

  it('the worn card names the hero tile and the compact row; the strip is gone', () => {
    setRosterSkins(ROSTER);
    const onDeck = vi.fn();
    const root = pickScreen(document.body, opts(onDeck));
    const tile = root.querySelector('.hero-card[data-h="clem"]') as HTMLElement;
    expect(tile.querySelector('b')?.textContent).toBe('Simas');
    expect(tile.querySelector('.tt-in > small')?.textContent).toBe('Clem · Fighter');
    expect(tile.getAttribute('aria-label')).toBe('Simas: Clem, Cat Fighter');
    expect(root.querySelector('.hero-card[data-h="sage"] b')?.textContent).toBe('Sage');
    expect(root.querySelector('.skin-strip')).toBeNull();
    const pill = root.querySelector('.deck-pill') as HTMLElement;
    expect(pill.textContent).toContain('Simas');
    expect(pill.textContent).toContain('Change');
    pill.click();
    expect(onDeck).toHaveBeenCalledWith('clem');
  });

  it('setPickLook redraws in place and keeps the trick picked on the screen', () => {
    setRosterSkins(ROSTER);
    const root = pickScreen(document.body, opts());
    (root.querySelector('[data-t="hiss"]') as HTMLElement | null)?.click();
    const trick = root.querySelector('.tricks .chip.on')?.getAttribute('data-t');
    expect(trick).toBe('hiss');
    setPickLook(root, 'clem', { coat: null, chroma: null });
    expect(root.querySelector('.hero-card[data-h="clem"] b')?.textContent).toBe('Clem');
    expect(root.querySelector('.deck-pill b')?.textContent).toBe('Classic');
    expect(root.querySelector('.tricks .chip.on')?.getAttribute('data-t')).toBe(trick);
  });
});

describe('cards drawer (ui/deck)', () => {
  it('builders escape names and keep URLs out of CSS unless they are plain https', () => {
    expect(cssUrl('https://x.test/a.png')).toBe('url(&quot;https://x.test/a.png&quot;)');
    for (const bad of ['javascript:alert(1)', 'https://x.test/a.png")', 'https://x.test/a b.png', undefined]) expect(cssUrl(bad)).toBeNull();
    const html = deckCard({ id: 'cat.a', name: '<b>x</b>', element: 'FIRE', rung: 'EPIC', bond: 4, next: 10 }, 'clem', true);
    expect(html).not.toContain('<b>x</b>');
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(html).toContain('data-nature="FIRE"');
    expect(html).toContain('pl-nature');
    expect(html).toContain('aria-pressed="true"');
    expect(catFace({ sprite: `${CDN}/assets/FICUS/base.png` })).toContain('dk-sprite');
    expect(catFace({})).toContain('dk-noart');
  });

  it('labels and bond lines read like the card', () => {
    expect(cardLabel({ id: 'cat.a', name: 'Simas', element: 'FIRE', rung: 'LEGENDARY', bond: 0 }, 'clem', false)).toBe('Simas, Fire, Legendary card. Wear on Clem');
    expect(cardLabel({ id: 'cat.a', name: 'Simas', element: 'DARK', rung: 'RARE', bond: 0 }, 'brutus', true)).toBe('Simas, Shadow, Rare card. Wearing on Sir Brutus');
    expect(bondLine({ bond: 4, next: 10, rung: 'RARE' })).toBe('Bond 4 · 6 more to Epic');
    expect(bondLine({ bond: 4, next: 10, rung: 'LEGENDARY' })).toBe('Bond 4');
    expect(bondLine({ bond: 31, next: null, rung: 'LEGENDARY' })).toBe('Bond 31');
  });

  it('empty state: sign in when embedded as a guest, a link on the standalone web, nothing in the app; never a price', () => {
    expect(emptyAction({ signedIn: false, isApp: false, embed: true })).toBe('sign-in');
    expect(emptyAction({ signedIn: true, isApp: false, embed: true })).toBe('none');
    expect(emptyAction({ signedIn: false, isApp: false, embed: false })).toBe('link');
    expect(emptyAction({ signedIn: false, isApp: true, embed: true })).toBe('none');
    expect(emptyAction({ signedIn: false, isApp: true, embed: false })).toBe('none');
    const app = emptyCard({ signedIn: false, isApp: true, embed: false });
    expect(app).not.toMatch(/href|<button/);
    const web = emptyCard({ signedIn: false, isApp: false, embed: false });
    expect(web).toContain('href="https://tokentails.com"');
    expect(web).toContain('rel="noopener"');
    for (const h of [app, web, emptyCard({ signedIn: false, isApp: false, embed: true })]) expect(h).not.toMatch(/\$|€|price|buy|donate|checkout/i);
    expect(postcards([{ name: 'Lambo', art: 'https://x.test/l.gif' }, { name: 'No art' }])).toContain('Lambo');
    expect(postcards([{ name: 'No art' }])).toBe('');
  });

  it('opens as a modal; arrows move a roving tabindex; Enter wears; Esc closes and returns focus', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    const onEquip = vi.fn();
    const onClose = vi.fn();
    const h = openDeck(document.body, {
      hero: 'clem',
      current: null,
      owned: [
        { id: 'cat.a', name: 'Simas', element: 'FIRE', rung: 'LEGENDARY', bond: 30, next: null },
        { id: 'cat.b', name: 'Bart', element: 'ICE', rung: 'RARE', bond: 3, next: 10 },
      ],
      signedIn: true,
      isApp: false,
      embed: true,
      onEquip,
      onClose,
    });
    const dlg = document.querySelector('.pl-deck') as HTMLElement;
    expect(dlg.getAttribute('role')).toBe('dialog');
    expect(dlg.getAttribute('aria-modal')).toBe('true');
    const cards = () => [...dlg.querySelectorAll<HTMLElement>('.dk-card[data-coat]')];
    expect(cards().map((c) => c.dataset.coat)).toEqual(['', 'cat.a', 'cat.b']);
    expect(cards().filter((c) => c.tabIndex === 0)).toHaveLength(1);
    expect(document.activeElement).toBe(cards()[0]);
    const key = (k: string) => (document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
    key('ArrowRight');
    expect((document.activeElement as HTMLElement).dataset.coat).toBe('cat.a');
    expect(dlg.querySelector('.dk-foot')?.textContent).toContain('Simas');
    key('End');
    expect((document.activeElement as HTMLElement).dataset.coat).toBe('cat.b');
    (document.activeElement as HTMLElement).click();
    expect(onEquip).toHaveBeenCalledWith('cat.b');
    expect(dlg.querySelector('.dk-card[data-coat="cat.b"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(dlg.querySelector('.dk-card[data-coat=""]')?.getAttribute('aria-pressed')).toBe('false');
    expect(dlg.querySelector('.dk-foot')?.textContent).toContain('Bond 3 · 7 more to Epic');
    key('Escape');
    expect(onClose).toHaveBeenCalled();
    expect(document.activeElement).toBe(opener);
    h.close();
  });

  it('an empty roster shows Classic, the empty card and the champions, never a made-up cat', () => {
    openDeck(document.body, {
      hero: 'lambo',
      current: null,
      owned: [],
      postcards: [{ name: 'Lambo', art: 'https://x.test/l.gif' }],
      signedIn: false,
      isApp: false,
      embed: true,
      onEquip: () => undefined,
      onSignIn: vi.fn(),
    });
    const dlg = document.querySelector('.pl-deck') as HTMLElement;
    expect(dlg.classList.contains('empty')).toBe(true);
    expect(dlg.querySelectorAll('.dk-card[data-coat]')).toHaveLength(1);
    expect(dlg.querySelector('[data-a="deck-sign-in"]')?.textContent).toBe('Sign in');
    expect(dlg.querySelectorAll('.dk-postcard')).toHaveLength(1);
  });
});
