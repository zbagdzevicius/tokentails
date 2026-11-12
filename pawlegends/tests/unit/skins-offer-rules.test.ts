// @vitest-environment happy-dom
/**
 * Card skins and the offer rules (GDD §7.2, §8.1), parked by NO-TOKENTAILS.md: the game sends no showcase bots and the
 * pick screen has no cards. The dormant render kit keeps its rules (gates, showcase hash) for a later return; the pick
 * screen's Look sheet holds coats and colour tints only, with no Cards button, price, money word or pack anywhere.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { pickScreen } from '../../src/ui/screens';
import { showcaseGate, resetRegistry, setFeaturedSkins, setRosterSkins } from '../../src/render/skins/registry';
import { rosterCosmetics } from '../../src/meta/roster';
import { PREVIEW_CAP, previewAllowed } from '../../src/meta/profile';
import type { Owned } from '../../src/render/cosmetics';
import { getSkin } from '../../src/render/skins/skinStore';

vi.mock('../../src/render/portraits', () => ({ portraitUrl: () => null }));

const owned = (ids: string[]): Owned => ({ items: new Set(), unlocks: new Set(), roster: rosterCosmetics(ids.map((id) => ({ id, name: `Cat ${id}`, type: 'FIRE', tier: 'COMMON', isStarter: false, origin: 'adopt' }))) });

function pick(cats: string[]): HTMLElement {
  document.body.innerHTML = '';
  return pickScreen(document.body, {
    initial: { hero: 'clem', trick: 'pounce', difficulty: 'easy' },
    owned: owned(cats),
    onHero: () => undefined,
    onStart: () => undefined,
    onBack: () => undefined,
  });
}

beforeEach(() => resetRegistry());

describe('gates', () => {
  it('locked tiles: web from play session 2; bots also never in the first match; app builds: none', () => {
    expect(showcaseGate({ isApp: false, playSession: 1, firstMatch: false })).toEqual({ tiles: false, bots: false });
    expect(showcaseGate({ isApp: false, playSession: 0, firstMatch: true })).toEqual({ tiles: false, bots: false });
    expect(showcaseGate({ isApp: false, playSession: 2, firstMatch: false })).toEqual({ tiles: true, bots: true });
    expect(showcaseGate({ isApp: false, playSession: 2, firstMatch: true })).toEqual({ tiles: true, bots: false });
    expect(showcaseGate({ isApp: true, playSession: 9, firstMatch: false })).toEqual({ tiles: false, bots: false });
  });
  it(`guest preview cap ${PREVIEW_CAP.guest}, signed in ${PREVIEW_CAP.signedIn}`, () => {
    expect(previewAllowed({ sessions: 3, previewsSeen: { session: 3, n: 1 } }, false)).toBe(false);
    expect(previewAllowed({ sessions: 3, previewsSeen: { session: 3, n: 1 } }, true)).toBe(true);
    expect(previewAllowed({ sessions: 3, previewsSeen: { session: 3, n: 3 } }, true)).toBe(false);
  });
});

describe('champion select: no offers, the Look sheet', () => {
  it('the pick shows no skins strip, no locked or preview tiles and no price, money word or pack anywhere', () => {
    const root = pick(['a']);
    expect(root.querySelector('.skin-strip, .skin-tile, [data-preview]')).toBeNull();
    (root.querySelector('[data-a="look"]') as HTMLElement).click();
    expect(root.querySelector('.cs-looksheet')).not.toBeNull();
    const text = root.textContent ?? '';
    expect(text).not.toMatch(/\$|€|£|price|buy|pack|donat|fund|adopt now|purchase|shop/i);
    expect(root.querySelector('a, [href]')).toBeNull();
    // NO-TOKENTAILS.md: no Cards button and no "Cards dress your heroes" line
    expect(root.querySelector('.cs-looksheet [data-a="deck"], .cs-ls-cards')).toBeNull();
    expect(text).not.toMatch(/\bcards?\b|token ?tails/i);
  });
  it('no coats or tints to choose: no Look button (Paw Legends without cats has no chromas)', () => {
    const root = pick([]);
    expect(root.querySelector('[data-a="look"]')).toBeNull();
  });
  it('a colour tint is chosen on the Look sheet', () => {
    const onLook = vi.fn();
    document.body.innerHTML = '';
    const root = pickScreen(document.body, {
      initial: { hero: 'clem', trick: 'pounce', difficulty: 'easy' },
      owned: owned(['a']),
      onLook,
      onHero: () => undefined,
      onStart: () => undefined,
      onBack: () => undefined,
    });
    (root.querySelector('[data-a="look"]') as HTMLElement).click();
    const tints = root.querySelectorAll<HTMLElement>('.cs-looksheet [data-chroma]');
    expect(tints.length).toBeGreaterThan(1);
    tints[1].click();
    expect(onLook).toHaveBeenLastCalledWith('clem', expect.objectContaining({ chroma: tints[1].dataset.chroma }));
    expect(root.querySelector('.cs-looksheet [data-chroma].on')?.getAttribute('data-chroma')).toBe(tints[1].dataset.chroma);
  });
});

describe('showcase bots', () => {
  it('at most one bot per team and two per match, never the player, the same for the same seed', async () => {
    const { HeroView } = await import('../../src/render/views/heroView');
    setRosterSkins([]);
    setFeaturedSkins([
      { catalogId: '65a1b2c3d4e5f6a7b8c9d0e1', name: 'Nova', type: 'STELLAR' },
      { catalogId: '65a1b2c3d4e5f6a7b8c9d0e2', name: 'Pip', type: 'ICE', tier: 'EPIC' },
    ]);
    expect(getSkin('cat.f.65a1b2c3d4e5f6a7b8c9d0e2')?.rung).toBe('RARE');
    const { GameView } = await import('../../src/render/gameView');
    const dress = (seed: number, mySlot: number): Map<number, string> => {
      const fake = { heroes: new HeroView(), mySlot } as unknown as InstanceType<typeof GameView>;
      return GameView.prototype.dressBots.call(fake, seed, ['clem', 'sage', 'lambo', 'brutus', 'cacklejaw', 'brutus'], ['cat.f.65a1b2c3d4e5f6a7b8c9d0e1', 'cat.f.65a1b2c3d4e5f6a7b8c9d0e2']);
    };
    for (let seed = 1; seed < 50; seed++) {
      const mine = seed % 6;
      const shown = dress(seed, mine);
      expect(shown.size).toBeLessThanOrEqual(2);
      expect(shown.has(mine)).toBe(false);
      expect([...shown.keys()].filter((s) => s < 3).length).toBeLessThanOrEqual(1);
      expect([...shown.keys()].filter((s) => s >= 3).length).toBeLessThanOrEqual(1);
      expect([...dress(seed, mine)]).toEqual([...shown]);
    }
    const none = { heroes: new HeroView(), mySlot: 0 } as unknown as InstanceType<typeof GameView>;
    expect(GameView.prototype.dressBots.call(none, 7, ['clem', 'sage', 'lambo', 'brutus', 'cacklejaw', 'brutus'], []).size).toBe(0);
  });
});
