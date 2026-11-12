import { expect, test, type Frame } from '@playwright/test';
import { toChampSelect } from './helpers';
import { art, mockHost, openHost, received } from './host';

// Sim v9 shelter champions (sim v15: 20 pick tiles, 10 a side behind the All · Cats · Dogs tabs), the web-only owner
// badge on a champion tile (portraits only on the champion select; the card art lives in the lobby panel), no Meet link on hero pick or in the lobby (title) champion info panel (information only:
// the champion-offer Meet card is the one purchase surface), none of the badges in an app build, and the Raspberry /
// Gabby diacritics drawn in the UI font.
test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'pick and lobby panels are viewport independent'));

const LAMBO = '6a30473c1d6649b19b03622b';
const GABE = '6992227d890a12f52a317e22';
const CHAMPIONS = [
  { catalogId: LAMBO, forSale: true, catImg: art('lambo') },
  { catalogId: GABE, forSale: true, catImg: art('gabe') },
];
const OWNS_GABE = [{ id: 'g1', name: 'Gabby', type: 'WIND', tier: 'COMMON', isStarter: false, origin: 'adopt', catalogId: GABE }];
const PLAYED = { v: 1, sessions: 2, matches: 4, wins: 2, firstWinDone: true, hero: 'lambo' };

async function toPick(game: Frame): Promise<void> {
  await toChampSelect(game);
  await game.waitForSelector('.pl-pick .cs');
}

test('20 pick tiles (10 cats, 10 dogs), card art and the owner badge on the web; no buy link on pick or in the lobby panel', async ({ context, page, baseURL }) => {
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
  const cats = game.locator('.cs-grid .cs-tile[data-side="cat"]');
  const dogs = game.locator('.cs-grid .cs-tile[data-side="dog"]');
  await expect(cats).toHaveCount(10);
  await expect(dogs).toHaveCount(10);
  // the cat side shows (the selected hero's side); the dogs wait behind the Dogs tab, and no dog is a champion
  await expect(game.locator('.cs-grid .cs-tile[data-side="dog"]:not([hidden])')).toHaveCount(0);
  await expect(game.locator('.cs-grid .cs-tile[data-side="dog"] .champ-owned')).toHaveCount(0);
  await expect(game.locator('.cs-tile[data-h="gabe"] .champ-owned')).toHaveCount(1);
  await expect(game.locator('.cs-tile[data-h="lambo"] .champ-owned')).toHaveCount(0);
  // sim v11: the four original cats are not champions (no badge)
  for (const h of ['meatball', 'pixel', 'duchess', 'stilts']) await expect(game.locator(`.cs-tile[data-h="${h}"] .champ-owned`)).toHaveCount(0);
  // GDD §8.1 #5: no offer on hero pick
  await game.locator('[data-h="aviete"]').click();
  await expect(game.locator('.cs-panel .cs-name')).toHaveText('Raspberry');
  await expect(game.locator('.pl-pick [data-a="champion-meet"], .pl-pick .plc-meet, .pl-pick .plc-champ')).toHaveCount(0);
  await expect(game.locator('.pl-pick')).not.toContainText(/\$|€|price|pack|donat|fund|adopt/i);
});

test('app build: champions play, no owner badge, no Meet link anywhere', async ({ context, page, baseURL }) => {
  await mockHost(context, baseURL!, { app: { isApp: true, store: false }, signedIn: true, roster: OWNS_GABE, champions: CHAMPIONS, profile: PLAYED });
  const game = await openHost(page);
  const info = game.locator('.plc-champ');
  await expect(info).toBeVisible();
  await info.locator('[data-a="champion-info"]').click();
  await expect(info.locator('[data-a="champion-meet"]')).toHaveCount(0);
  await toPick(game);
  await expect(game.locator('.cs-grid .cs-tile')).toHaveCount(20);
  await expect(game.locator('.champ-owned')).toHaveCount(0);
  await expect(game.locator('[data-a="champion-meet"]')).toHaveCount(0);
  expect((await received(page)).some((m) => m.type === 'open-cat')).toBe(false);
});

test('the shelter champions show their English names on the pick screen', async ({ context, page, baseURL }) => {
  await mockHost(context, baseURL!, { app: { isApp: false, store: true }, champions: CHAMPIONS, profile: PLAYED });
  const game = await openHost(page);
  await toPick(game);
  await expect(game.locator('.cs-tile[data-h="aviete"] .cs-tn')).toHaveText('Raspberry');
  await expect(game.locator('.cs-tile[data-h="gabe"] .cs-tn')).toHaveText('Gabby');
  await expect(game.locator('.cs-tile[data-h="bengas"] .cs-tn')).toHaveText('Bengal');
  await expect(game.locator('.cs-tile[data-h="lambo"] .cs-tn')).toHaveText('Lambo');
});
