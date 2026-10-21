// @vitest-environment happy-dom
/**
 * Wave C (C4) previews: the pick screen names the worn card's effect under the Skins strip, the results line shows the
 * card's effect after the match, and the Treat Track lists "Legendary card: <name> burst" for every owned card. Looks
 * only: no price, money word or number.
 */
import { describe, expect, it, vi } from 'vitest';
import { pickScreen, resultsScreen, type SkinTile } from '../../src/ui/screens';
import { collectionPanel } from '../../src/ui/collection';
import { freshTreats } from '../../src/meta/treats';
import { rosterCosmetics } from '../../src/meta/roster';
import type { Owned } from '../../src/render/cosmetics';

vi.mock('../../src/render/portraits', () => ({ portraitUrl: () => null }));

const owned = (ids: string[]): Owned => ({ items: new Set(), unlocks: new Set(), roster: rosterCosmetics(ids.map((id) => ({ id, name: `Cat ${id}`, type: 'FIRE', tier: 'COMMON', isStarter: false, origin: 'adopt' }))) });
const tile = (id: string, over: Partial<SkinTile> = {}): SkinTile => ({ id, name: `Cat ${id}`, element: 'FIRE', rung: 'COMMON', bond: 0, ...over });

describe('C4 card effect previews', () => {
  it('pick screen: the worn card shows its line and demo; none without a card skin', () => {
    document.body.innerHTML = '';
    const skins = { owned: [tile('cat.a', { name: 'Ficus', rung: 'LEGENDARY', tint: 0xff7a3d }), tile('cat.b', { name: 'Pinkie', rung: 'EPIC' })], locked: [] };
    const root = pickScreen(document.body, {
      initial: { hero: 'clem', trick: 'pounce', difficulty: 'easy' },
      owned: owned(['a', 'b']),
      looks: { clem: { coat: 'cat.a', chroma: null } },
      skins,
      onHero: () => undefined,
      onStart: () => undefined,
      onBack: () => undefined,
    });
    const fx = root.querySelector('.card-fx[data-card-fx="LEGENDARY"]') as HTMLElement;
    expect(fx?.querySelector('b')?.textContent).toBe('Legendary card: Ficus burst');
    expect(fx.getAttribute('style')).toContain('--fx:#ff7a3d');
    expect(fx.querySelector('.fx-demo .paw')).not.toBeNull();
    (root.querySelector('.skin-tile[data-coat="cat.b"]') as HTMLElement).click();
    expect(root.querySelector('.card-fx b')?.textContent).toBe('Epic card: Pinkie sparkle');
    expect(root.querySelector('.card-fx .fx-demo .paw')).toBeNull();
    expect(root.querySelectorAll('.card-fx .fx-demo .tw')).toHaveLength(3);
    expect(root.textContent ?? '').not.toMatch(/\$|€|price|buy|\bpacks?\b/i);
  });

  it('results: the worn card line carries its effect', () => {
    document.body.innerHTML = '';
    const root = resultsScreen(document.body, {
      won: true, seconds: 432, hero: 'clem', difficulty: 'easy', kills: 2, deaths: 1, level: 6, teamKills: [9, 4], firstWin: false, best: false,
      onAgain: () => {}, onChange: () => {}, onShare: () => {}, dareLink: 'https://example.test/d',
      skin: { name: 'Rascal', bond: 3, next: 10, rung: 'RARE', tint: 0x66ccff },
    });
    expect(root.querySelector('.pl-skin-fx b')?.textContent).toBe('Rare card: Rascal tint');
  });

  it('Treat Track: one line per owned card, best rung first as given; nothing to buy', () => {
    document.body.innerHTML = '';
    const root = collectionPanel(document.body, {
      treats: freshTreats(), owned: new Set(), art: {}, portrait: () => null, wornTitle: null, wornFrame: null,
      cards: [{ name: 'Ficus', rung: 'LEGENDARY', tint: 0xff7a3d }, { name: 'Rascal', rung: 'RARE' }, { name: 'Pickles', rung: 'COMMON' }],
      onTarget: () => {}, onWear: () => {}, onClose: () => {},
    });
    expect([...root.querySelectorAll('.card-fx-list .card-fx b')].map((b) => b.textContent)).toEqual(['Legendary card: Ficus burst', 'Rare card: Rascal tint', 'Common card: Pickles look']);
    expect(root.querySelector('a, [data-sku], [data-buy]')).toBeNull();
    expect(root.textContent ?? '').not.toMatch(/\$|buy|price|adopt|donat|fund|help|save/i);
  });
});
