import { expect, test } from '@playwright/test';
import { art, mockHost, openHost, received, type HostConfig } from './host';

// GDD §7.2 card skins: the "Your cards" drawer (every owned cat on every champion, lobby spec §3b), the choice
// remembered after a reload, the locked featured card with a Preview (web, from session 2; never in an app build),
// the worn cat's name on the champion (pick tile, card row, loading veil, scoreboard), and a dog in a card-skin
// costume in a real match with the team ring under him.
test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'pick and lobby panels are viewport independent'));

const CDN = 'https://tokentails-nfts.fra1.cdn.digitaloceanspaces.com';
const ROSTER = [
  { id: 'c1', name: 'Pickles', type: 'GRASS', tier: 'COMMON', isStarter: false, origin: 'adopt', art: art('pickles'), sprite: `${CDN}/assets/PICKLES/base.png` },
  { id: 'c2', name: 'Ficus', type: 'FIRE', tier: 'LEGENDARY', isStarter: false, origin: 'adopt', art: art('ficus'), sprite: `${CDN}/assets/FICUS/base.png` },
  { id: 'c3', name: 'Packy', type: 'ICE', tier: 'EPIC', isStarter: false, origin: 'pack', sprite: `${CDN}/assets/GREY/base.png` },
];
const FEATURED = [{ catalogId: '65a1b2c3d4e5f6a7b8c9d0e1', name: 'Nova', type: 'STELLAR', art: art('nova'), sprite: `${CDN}/assets/OREO/base.png`, tier: 'RARE' }];
const PLAYED = { v: 1, sessions: 3, matches: 4, wins: 2, firstWinDone: true, hero: 'lambo', firstPlaySession: 1 };

/** The pick screen's card row opens the drawer (its own chunk). */
async function openCards(game: { locator(sel: string): import('@playwright/test').Locator }): Promise<void> {
  await game.locator('.pl-pick [data-a="deck"]:visible').click();
  await game.locator('.pl-deck .dk-row').waitFor();
}

test('Your cards: wear a cat on a champion, the turntable rebuilds, the hero takes its name, and it survives a reload', async ({ context, page, baseURL }) => {
  const cfg: HostConfig = { app: { isApp: false, store: true }, signedIn: true, roster: ROSTER, profile: PLAYED };
  await mockHost(context, baseURL!, cfg);
  let game = await openHost(page);
  await game.locator('[data-a="choose"]').click();
  await game.waitForSelector('.pl-pick');
  await expect(game.locator('.wardrobe .lbl:visible')).toHaveText('Card');
  await expect(game.locator('.pl-pick .skin-strip')).toHaveCount(0);
  await openCards(game);
  const deck = game.locator('.pl-deck');
  await expect(deck).toHaveAttribute('role', 'dialog');
  await expect(deck.locator('.dk-card[data-coat^="cat."]')).toHaveCount(3);
  // pack cats: Common rung (no tier from pack luck), the frame note in the tooltip, never the word pack
  await expect(deck.locator('.dk-card[data-coat="cat.c3"] .pip')).toHaveText('Common');
  await expect(deck.locator('.dk-card[data-coat="cat.c3"]')).toHaveAttribute('title', /frames come from cats you adopted by name/);
  await expect(deck).not.toContainText('no frame');
  await expect(deck.locator('.dk-card[data-coat="cat.c2"] .pip')).toHaveText('Legendary');
  await expect(deck).not.toContainText(/\bpacks?\b|\$|€|price|buy|donate/i);
  await deck.locator('.dk-card[data-coat="cat.c2"]').click();
  await expect.poll(() => game.evaluate(() => document.documentElement.dataset.look)).toBe('lambo:cat.c2@0|-');
  await expect(deck.locator('.dk-card[data-coat="cat.c2"]')).toHaveClass(/\bon\b/);
  await expect(deck.locator('.dk-card[data-coat="cat.c2"]')).toHaveAttribute('aria-pressed', 'true');
  // the worn card's effect line under the cards
  await expect(deck.locator('.card-fx[data-card-fx="LEGENDARY"] b')).toHaveText('Legendary card: Ficus burst');
  // Esc closes the drawer; the hero tile and the card row carry the cat's name now
  await page.keyboard.press('Escape');
  await expect(deck).toHaveCount(0);
  await expect(game.locator('.hero-card[data-h="lambo"] .tt-in > b')).toHaveText('Ficus');
  await expect(game.locator('.hero-card[data-h="lambo"] .tt-in > small')).toHaveText('Lambo · Tank');
  await expect(game.locator('.pl-pick .deck-pill:visible')).toContainText('Ficus');
  // no chroma swatches while a card skin is worn
  await expect(game.locator('.pl-pick .swatches')).toHaveCount(0);
  await page.waitForTimeout(300);
  // reload: the stored profile is the game's own now (the mock host stops seeding it)
  cfg.profile = undefined;
  await page.reload();
  game = await openHost(page);
  await game.locator('[data-a="choose"]').click();
  await game.waitForSelector('.pl-pick');
  await expect(game.locator('.hero-card[data-h="lambo"] .tt-in > b')).toHaveText('Ficus');
  await openCards(game);
  await expect(game.locator('.pl-deck .dk-card[data-coat="cat.c2"]')).toHaveClass(/\bon\b/);
  await expect.poll(() => game.evaluate(() => document.documentElement.dataset.look)).toBe('lambo:cat.c2@0|-');
});

test('Your cards: keyboard only (arrows, Enter, Esc), focus returns to the card row', async ({ context, page, baseURL }) => {
  await mockHost(context, baseURL!, { app: { isApp: false, store: true }, signedIn: true, roster: ROSTER, profile: PLAYED });
  const game = await openHost(page);
  await game.locator('[data-a="choose"]').click();
  await game.waitForSelector('.pl-pick');
  await game.locator('.pl-pick [data-a="deck"]:visible').focus();
  await page.keyboard.press('Enter');
  await game.locator('.pl-deck .dk-row').waitFor();
  const focused = () => game.locator('.pl-deck .dk-card:focus').getAttribute('data-coat');
  await expect.poll(focused).toBe('');
  await page.keyboard.press('ArrowRight');
  await expect.poll(focused).not.toBe('');
  const id = await focused();
  await page.keyboard.press('Enter');
  await expect.poll(() => game.evaluate(() => document.documentElement.dataset.look ?? '')).toContain(`lambo:${id}@`);
  await page.keyboard.press('Escape');
  await expect(game.locator('.pl-deck')).toHaveCount(0);
  await expect(game.locator('.pl-pick [data-a="deck"]:visible')).toBeFocused();
});

test('Your cards, guest with no cats: Classic, the shelter champions and Sign in; never a made-up card or a price', async ({ context, page, baseURL }) => {
  await mockHost(context, baseURL!, { app: { isApp: false, store: true }, signedIn: false, roster: [], profile: PLAYED });
  const game = await openHost(page);
  await game.locator('[data-a="choose"]').click();
  await game.waitForSelector('.pl-pick');
  await openCards(game);
  const deck = game.locator('.pl-deck');
  await expect(deck.locator('.dk-card[data-coat]')).toHaveCount(1);
  await expect(deck).toContainText('Your Token Tails cats become skins for every champion.');
  await expect(deck).not.toContainText(/\$|€|price|buy|donate|checkout/i);
  await deck.locator('[data-a="deck-sign-in"]').click();
  await expect.poll(async () => (await received(page)).filter((m) => m.type === 'request-sign-in').length).toBe(1);
});

test('locked featured tile: Preview spins it (one for a guest), tells the host, no price or link; app builds show none', async ({ context, page, baseURL }) => {
  await mockHost(context, baseURL!, { app: { isApp: false, store: true }, signedIn: false, roster: ROSTER, featured: FEATURED, profile: PLAYED });
  const game = await openHost(page);
  await game.locator('[data-a="choose"]').click();
  await game.waitForSelector('.pl-pick');
  await openCards(game);
  const locked = game.locator('.pl-deck .dk-slot.locked');
  await expect(locked).toHaveCount(1);
  await expect(locked.locator('a')).toHaveCount(0);
  await expect(locked).not.toContainText(/\$|€|price|buy|adopt/i);
  await locked.locator('[data-preview]').click();
  await expect.poll(() => game.evaluate(() => document.documentElement.dataset.skinPreview ?? '')).toBe('cat.f.65a1b2c3d4e5f6a7b8c9d0e1');
  await expect.poll(async () => (await received(page)).filter((m) => m.type === 'skin-preview').length).toBe(1);
  // a guest's one preview this session is used
  await page.keyboard.press('Escape');
  await game.locator('[data-h="sage"]').click();
  await openCards(game);
  await game.locator('.pl-deck .dk-slot.locked [data-preview]').click();
  await expect(game.locator('.pl-deck .dk-slot.locked [data-preview]')).toHaveText('Seen');
});

test('app build: owned skins only, no locked, preview or showcase tiles', async ({ context, page, baseURL }) => {
  await mockHost(context, baseURL!, { app: { isApp: true, store: false }, signedIn: true, roster: [{ ...ROSTER[0], origin: 'redeem' }, ROSTER[2]], featured: FEATURED, profile: PLAYED });
  const game = await openHost(page);
  await game.locator('[data-a="choose"]').click();
  await game.waitForSelector('.pl-pick');
  await openCards(game);
  await expect(game.locator('.pl-deck .dk-card[data-coat^="cat."]')).toHaveCount(1);
  await expect(game.locator('.pl-deck .dk-card.locked, [data-preview]')).toHaveCount(0);
});

test('dog costume in a match: Sir Brutus in a card skin, the team ring visible under him', async ({ context, page, baseURL }, info) => {
  test.setTimeout(90_000);
  await mockHost(context, baseURL!, { app: { isApp: false, store: true }, signedIn: true, roster: ROSTER, profile: { ...PLAYED, hero: 'brutus', looks: { brutus: { coat: 'cat.c1', chroma: null } } } });
  const game = await openHost(page);
  await game.locator('[data-a="quick"]').click();
  // lobby spec §3b: the champion takes the worn cat's name (veil, scoreboard), the hero underneath
  await expect(game.locator('.pl-loading .hero-line')).toContainText('as Pickles (Sir Brutus)');
  await game.waitForFunction(() => document.documentElement.dataset.match === 'live');
  await expect.poll(() => game.evaluate(() => document.documentElement.dataset.matchLook)).toBe('cat.c1@0|-');
  await page.keyboard.down('Tab');
  await expect(game.locator('.pl-scoreboard tr.me')).toContainText('Pickles');
  await expect(game.locator('.pl-scoreboard tr.me .cat')).toHaveText('· Sir Brutus');
  await page.keyboard.up('Tab');
  await game.waitForFunction(() => !document.querySelector('.pl-loading:not(.out)'));
  await page.waitForTimeout(1500);
  const shot = await page.screenshot();
  await info.attach('brutus-costume', { body: shot, contentType: 'image/png' });
  if (process.env.SKIN_SHOTS) (await import('node:fs')).writeFileSync(`${process.env.SKIN_SHOTS}/match-brutus-costume.png`, shot);
});

test('?skins=demo on a local standalone page: the demo roster fills the Skins row, every rung, no host needed', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('tt.pawlegends.profile.v1', JSON.stringify({ v: 1, sessions: 3, matches: 4, wins: 2, firstWinDone: true, hero: 'lambo', firstPlaySession: 1 })));
  await page.goto('/?skins=demo');
  await page.waitForSelector('html[data-ready="1"]');
  expect(await page.evaluate(() => document.documentElement.dataset.skinDemo)).toBe('1');
  await page.locator('[data-a="choose"]').click();
  await page.waitForSelector('.pl-pick');
  await openCards(page);
  const deck = page.locator('.pl-deck');
  await expect(deck.locator('.dk-card[data-coat^="cat."]')).toHaveCount(5);
  await expect(deck.locator('.dk-card.locked')).toHaveCount(0);
  for (const [id, rung] of [['cat.demo-ficus', 'Legendary'], ['cat.demo-pinkie', 'Epic'], ['cat.demo-rascal', 'Rare'], ['cat.demo-pickles', 'Common'], ['cat.demo-grey', 'Common']]) {
    await expect(deck.locator(`.dk-card[data-coat="${id}"] .pip`)).toHaveText(rung);
  }
  await deck.locator('.dk-card[data-coat="cat.demo-ficus"]').click();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.look)).toBe('lambo:cat.demo-ficus@0|-');
  // Wave C (C4): the worn card's effect line and demo under the cards
  await expect(deck.locator('.card-fx[data-card-fx="LEGENDARY"] b')).toHaveText('Legendary card: Ficus burst');
  await expect(deck.locator('.card-fx .fx-demo .paw')).toHaveCount(1);
  for (const [id, line] of [['cat.demo-pinkie', 'Epic card: Pinkie sparkle'], ['cat.demo-rascal', 'Rare card: Rascal tint'], ['cat.demo-pickles', 'Common card: Pickles look']]) {
    await deck.locator(`.dk-card[data-coat="${id}"]`).click();
    await expect(deck.locator('.card-fx b')).toHaveText(line);
  }
  await deck.locator('.dk-card[data-coat="cat.demo-ficus"]').click();
  await page.waitForTimeout(800);
  if (process.env.SKIN_SHOTS) await page.screenshot({ path: `${process.env.SKIN_SHOTS}/skins-demo-pick.png` });
});

test('?skins=demo in a match: a Legendary demo card draws its effects, the sim untouched', async ({ page }, info) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript(() => localStorage.setItem('tt.pawlegends.profile.v1', JSON.stringify({ v: 1, sessions: 3, matches: 4, wins: 2, firstWinDone: true, hero: 'sage', firstPlaySession: 1, looks: { sage: { coat: 'cat.demo-ficus', chroma: null } } })));
  await page.goto('/?skins=demo&e2e=1&speed=4');
  await page.waitForSelector('html[data-ready="1"]');
  await page.locator('[data-a="quick"]').click();
  await page.waitForFunction(() => document.documentElement.dataset.match === 'live');
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.matchLook)).toBe('cat.demo-ficus@0|-');
  // an idle hero at the fountain may never land a hit in the window (sim v11 picks and bot tuning): she casts Q (a
  // Legendary card sparkles on every ability cast) until the effect shows
  await expect
    .poll(
      async () => {
        await page.keyboard.press('q');
        return page.evaluate(() => Number(document.documentElement.dataset.cardFx ?? 0));
      },
      { timeout: 90_000, intervals: [2_000] },
    )
    .toBeGreaterThan(0);
  const shot = await page.screenshot();
  await info.attach('demo-legendary-match', { body: shot, contentType: 'image/png' });
  if (process.env.SKIN_SHOTS) (await import('node:fs')).writeFileSync(`${process.env.SKIN_SHOTS}/match-demo-legendary.png`, shot);
  expect(errors).toEqual([]);
});

test('?skins=demo is ignored without the query', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('html[data-ready="1"]');
  expect(await page.evaluate(() => document.documentElement.dataset.skinDemo ?? '')).toBe('');
});
