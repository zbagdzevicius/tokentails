import { expect, test, type Frame } from '@playwright/test';
import { art, mockHost, openHost, received } from './host';

// Sim v9 shelter champions: 8 pick tiles (a cats row of 6, a dogs row of 2), the card art and the web-only owner
// badge on a champion tile, no Meet link on hero pick or in the lobby (title) champion info panel (information only:
// the champion-offer Meet card is the one purchase surface), none of the badges in an app build, and the Avietė /
// Gabė diacritics drawn in the UI font.
test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'pick and lobby panels are viewport independent'));

const LAMBO = '6a30473c1d6649b19b03622b';
const GABE = '6992227d890a12f52a317e22';
const CHAMPIONS = [
  { catalogId: LAMBO, forSale: true, catImg: art('lambo') },
  { catalogId: GABE, forSale: true, catImg: art('gabe') },
];
const OWNS_GABE = [{ id: 'g1', name: 'Gabė', type: 'WIND', tier: 'COMMON', isStarter: false, origin: 'adopt', catalogId: GABE }];
const PLAYED = { v: 1, sessions: 2, matches: 4, wins: 2, firstWinDone: true, hero: 'lambo' };

async function toPick(game: Frame): Promise<void> {
  await game.locator('[data-a="choose"]').click();
  await game.waitForSelector('.pl-pick');
}

test('8 pick tiles, card art and the owner badge on the web; no buy link on pick or in the lobby panel', async ({ context, page, baseURL }) => {
  await mockHost(context, baseURL!, { app: { isApp: false, store: true }, signedIn: true, roster: OWNS_GABE, champions: CHAMPIONS, profile: PLAYED });
  const game = await openHost(page);
  // Lobby (title): Lambo on the turntable, his info panel (information only, no buy link).
  const info = game.locator('.plc-champ');
  await expect(info).toBeVisible();
  await info.locator('[data-a="champion-info"]').click();
  await expect(info).toContainText('inspired by his Token Tails card');
  await expect(info.locator('[data-a="champion-meet"], .plc-meet-go')).toHaveCount(0);
  await expect(info).not.toContainText(/\$|€|price|pack|donat|fund|adopt/i);
  expect((await received(page)).some((m) => m.type === 'open-cat')).toBe(false);

  await toPick(game);
  await expect(game.locator('.heroes.cats .hero-card')).toHaveCount(6);
  await expect(game.locator('.heroes.dogs .hero-card')).toHaveCount(2);
  await expect(game.locator('.hero-card[data-h="lambo"] .champ-art')).toHaveCount(1);
  await expect(game.locator('.hero-card[data-h="gabe"] .champ-owned')).toHaveCount(1);
  await expect(game.locator('.hero-card[data-h="lambo"] .champ-owned')).toHaveCount(0);
  // GDD §8.1 #5: no offer on hero pick
  await game.locator('[data-h="aviete"]').click();
  await expect(game.locator('.pl-pick .detail')).toContainText("Inspired by Avietė's Token Tails card.".normalize('NFD'));
  await expect(game.locator('.pl-pick [data-a="champion-meet"], .pl-pick .plc-meet, .pl-pick .plc-champ')).toHaveCount(0);
});

test('app build: champions play, no owner badge, no Meet link anywhere', async ({ context, page, baseURL }) => {
  await mockHost(context, baseURL!, { app: { isApp: true, store: false }, signedIn: true, roster: OWNS_GABE, champions: CHAMPIONS, profile: PLAYED });
  const game = await openHost(page);
  const info = game.locator('.plc-champ');
  await expect(info).toBeVisible();
  await info.locator('[data-a="champion-info"]').click();
  await expect(info.locator('[data-a="champion-meet"]')).toHaveCount(0);
  await toPick(game);
  await expect(game.locator('.hero-card')).toHaveCount(8);
  await expect(game.locator('.champ-owned')).toHaveCount(0);
  await expect(game.locator('[data-a="champion-meet"]')).toHaveCount(0);
  expect((await received(page)).some((m) => m.type === 'open-cat')).toBe(false);
});

test('the Avietė and Gabė diacritics render in the UI font (Fredoka draws e + dot, no fallback face)', async ({ context, page, baseURL }) => {
  await mockHost(context, baseURL!, { app: { isApp: false, store: true }, champions: CHAMPIONS, profile: PLAYED });
  const game = await openHost(page);
  await toPick(game);
  // the UI writes them decomposed (NFD: e + combining dot), which is what Fredoka can draw
  await expect(game.locator('.hero-card[data-h="aviete"] b')).toHaveText('Avietė'.normalize('NFD'));
  await expect(game.locator('.hero-card[data-h="gabe"] b')).toHaveText('Gabė'.normalize('NFD'));
  const widths = await game.evaluate(async () => {
    await document.fonts.load('600 40px Fredoka', 'ė');
    const g = document.createElement('canvas').getContext('2d')!;
    const w = (font: string, t: string): number => {
      g.font = font;
      return g.measureText(t).width;
    };
    const label = document.querySelector('.hero-card[data-h="aviete"] b')?.textContent ?? '';
    return { loaded: document.fonts.check('600 40px Fredoka', label), edot: w('600 40px Fredoka, monospace', 'e\u0307'), e: w('600 40px Fredoka, monospace', 'e'), mono: w('600 40px monospace', 'e\u0307') };
  });
  expect(widths.loaded).toBe(true);
  // ė (e + U+0307) is shaped in Fredoka: its e plus a zero-advance dot, not a monospace fallback cluster
  expect(Math.abs(widths.edot - widths.e)).toBeLessThan(0.5);
  expect(Math.abs(widths.edot - widths.mono)).toBeGreaterThan(0.5);
});
