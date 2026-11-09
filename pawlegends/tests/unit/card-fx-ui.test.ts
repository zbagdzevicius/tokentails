// @vitest-environment happy-dom
/**
 * Wave C (C4) previews: the cards drawer names the worn card's effect (tests/unit/card-name), the results line shows the
 * card's effect after the match, and the Treat Track lists "Legendary card: <name> burst" for every owned card. Looks
 * only: no price, money word or number.
 */
import { describe, expect, it, vi } from 'vitest';
import { resultsScreen } from '../../src/ui/screens';
import { collectionPanel } from '../../src/ui/collection';
import { freshTreats } from '../../src/meta/treats';

vi.mock('../../src/render/portraits', () => ({ portraitUrl: () => null }));


describe('C4 card effect previews', () => {
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
