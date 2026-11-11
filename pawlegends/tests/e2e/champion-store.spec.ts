import { expect, test, type Frame } from '@playwright/test';
import { ALL_CHAMPS, mockHost, openHost, received } from './host';

// CHAMPION-STORE.md: a new guest sees the 6 starters and the week's 6 free champions; every other tile is locked with
// its unlock row and plays as Practice (nothing posted to /live); an existing player with the Founders roster keeps
// every champion; the app build never shows a price.
test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'pick panels are viewport independent'));

const PLAYED = { v: 1, sessions: 2, matches: 4, wins: 2, firstWinDone: true, hero: 'clem' };
const NEW_GUEST = { ...ALL_CHAMPS, owned: [], founders: false, yarn: { balance: 0, matches: 0, picksLeft: 0, nextPickAt: 5 } };

async function toPick(game: Frame): Promise<void> {
  await game.locator('[data-a="choose"]').click();
  await game.waitForSelector('.pl-pick .cs');
}

/** The week's rotation as the game computes it (the e2e clock is real time). */
async function freeThisWeek(game: Frame): Promise<string[]> {
  return game.evaluate(() => [...document.querySelectorAll('.cs-tile .champ-free')].map((e) => (e.closest('.cs-tile') as HTMLElement).dataset.h ?? ''));
}

test('a new guest: 12 open tiles (starters and the free 6), the rest locked with Yarn to go and Practice', async ({ context, page, baseURL }) => {
  await mockHost(context, baseURL!, { app: { isApp: false, store: true }, signedIn: false, profile: PLAYED, champState: NEW_GUEST });
  const game = await openHost(page);
  await toPick(game);
  await expect(game.locator('.cs-grid .cs-tile')).toHaveCount(20);
  await expect(game.locator('.cs-grid .cs-tile:not(.locked)')).toHaveCount(12);
  for (const h of ['clem', 'sage', 'gabe', 'brutus', 'frankie', 'marshmallow']) await expect(game.locator(`.cs-tile[data-h="${h}"]`)).not.toHaveClass(/locked/);
  expect(await freeThisWeek(game)).toHaveLength(6);
  // a locked champion: its skills show, LOCK IN is Practice, the unlock row says how far the Yarn is
  const locked = await game.evaluate(() => (document.querySelector('.cs-grid .cs-tile.locked[data-side="cat"]') as HTMLElement).dataset.h ?? '');
  await game.locator(`.cs-grid [data-h="${locked}"]`).click();
  await expect(game.locator('.cs-panel')).toHaveAttribute('data-hero', locked);
  await expect(game.locator('.cs-lock')).toContainText('PRACTICE');
  await expect(game.locator('[data-testid="champ-togo"]')).toContainText('Yarn to go');
  await expect(game.locator('[data-testid="champ-buy"]')).toHaveCount(1);
});

test('an existing player with the Founders roster keeps every champion', async ({ context, page, baseURL }) => {
  await mockHost(context, baseURL!, { app: { isApp: false, store: true }, signedIn: true, profile: PLAYED });
  const game = await openHost(page);
  await toPick(game);
  await expect(game.locator('.cs-grid .cs-tile.locked')).toHaveCount(0);
});

test('a Yarn unlock is asked of the host; the app build shows no price', async ({ context, page, baseURL }) => {
  const rich = { ...NEW_GUEST, yarn: { balance: 9000, matches: 40, picksLeft: 0, nextPickAt: null } };
  await mockHost(context, baseURL!, { app: { isApp: true, store: false }, signedIn: true, profile: PLAYED, champState: rich });
  const game = await openHost(page);
  await toPick(game);
  const locked = await game.evaluate(() => (document.querySelector('.cs-grid .cs-tile.locked[data-side="cat"]') as HTMLElement).dataset.h ?? '');
  await game.locator(`.cs-grid [data-h="${locked}"]`).click();
  await expect(game.locator('[data-testid="champ-buy"]')).toHaveCount(0);
  await expect(game.locator('.pl-pick')).not.toContainText(/\$|€/);
  await game.locator('[data-testid="champ-unlock"]').click();
  await expect.poll(async () => (await received(page)).filter((m) => m.type === 'champ-unlock').map((m) => m.hero)).toEqual([locked]);
});
