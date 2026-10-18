import { expect, test } from '@playwright/test';
import { art, fakeToken, gattr, mockHost, openHost, received } from './host';

// Integration plan §2 (game side): the game sells nothing of its own. The one offer is the "Meet ‹name›" card for a
// Token Tails cat the host featured; tapping it asks the host to open its own cat checkout (`open-cat`). The mock
// host stands in for that sheet: it answers `purchase-result{catalogId, ok}` and a fresh roster with the new cat, as
// the real host does after a test-mode payment. The real checkout is covered by the client and backend tests.
test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'store flow is viewport independent'));

const PUMPKIN = '65a1b2c3d4e5f6a7b8c9d0e1';
const NOVA = '65a1b2c3d4e5f6a7b8c9d0e2';
const FEATURED = [
  { catalogId: PUMPKIN, name: 'Pumpkin', type: 'GRASS', art: art('pumpkin') },
  { catalogId: NOVA, name: 'Nova', type: 'STELLAR', art: art('nova') },
];
const BOUGHT = [{ id: 'c1', name: 'Pumpkin', type: 'GRASS', tier: 'COMMON', isStarter: false, origin: 'adopt', catalogId: PUMPKIN }];
const SESSION_2 = { v: 1, sessions: 1, matches: 1, wins: 1, firstWinDone: true };

test('Meet card → open-cat → the new cat joins the squad', async ({ context, page, baseURL }) => {
  await mockHost(context, baseURL!, {
    app: { isApp: false, store: true },
    signedIn: true,
    featured: FEATURED,
    offer: { kind: 'meet', catalogId: PUMPKIN },
    catGrants: { [PUMPKIN]: BOUGHT },
    profile: SESSION_2,
  });
  const game = await openHost(page);
  const card = game.locator('.plc-meet[data-offer="meet"]');
  await expect(card).toBeVisible();
  await expect(card).toContainText('Meet Pumpkin');
  await expect(card).not.toContainText(/\$|€|price|shelter|pack/i);
  await expect(game.locator('[data-a="store"]')).toHaveCount(0); // the pl_* store is retired
  await expect.poll(async () => (await received(page)).filter((m) => m.type === 'offer-seen').length).toBe(1);
  await card.locator('[data-a="meet"]').click();
  await expect.poll(async () => (await received(page)).some((m) => m.type === 'open-cat' && m.catalogId === PUMPKIN)).toBe(true);
  await expect(game.locator('.plc-joined')).toContainText('Pumpkin');
  await expect.poll(() => gattr(game, 'chromas')).toBe('GRASS');
  expect((await received(page)).some((m) => m.type === 'purchase-intent')).toBe(false);
  await game.locator('[data-a="choose"]').click();
  await expect(game.locator('.plc-pick .plc-card')).toContainText('Pumpkin');
});

test('round 0: a cat bought on a 6-cat roster walks in the next match (squad strip and kittens)', async ({ context, page, baseURL }) => {
  const LUNA = '65a1b2c3d4e5f6a7b8c9d0e3';
  const six = [
    { id: 's1', name: 'Scout', type: 'WIND', tier: 'COMMON', isStarter: true, starterBreed: 'SCOUT', origin: 'starter' },
    { id: 'p1', name: 'Pumpkin', type: 'GRASS', tier: 'COMMON', isStarter: false, origin: 'pack' },
    { id: 'n1', name: 'Nova', type: 'STELLAR', tier: 'EPIC', isStarter: false, origin: 'adopt' },
    { id: 'b1', name: 'Blaze', type: 'FIRE', tier: 'LEGENDARY', isStarter: false, origin: 'pack' },
    { id: 'z1', name: 'Ziggy', type: 'ELECTRIC', tier: 'RARE', isStarter: false, origin: 'pack' },
    { id: 'm1', name: 'Mittens', type: 'ICE', tier: 'COMMON', isStarter: false, origin: 'adopt' },
  ];
  const luna = { id: 'l1', name: 'Luna', type: 'DARK', tier: 'RARE', isStarter: false, origin: 'adopt', catalogId: LUNA };
  await mockHost(context, baseURL!, {
    app: { isApp: false, store: true },
    signedIn: true,
    roster: six,
    featured: [{ catalogId: LUNA, name: 'Luna', type: 'DARK', art: art('luna') }],
    offer: { kind: 'meet', catalogId: LUNA },
    catGrants: { [LUNA]: [...six, luna] },
    profile: SESSION_2,
    query: '&speed=8',
  });
  const game = await openHost(page);
  const card = game.locator('.plc-meet[data-offer="meet"]');
  await expect(card).toContainText('Adopt on Token Tails');
  await card.locator('[data-a="meet"]').click();
  await expect(game.locator('.plc-joined')).toContainText('Luna');
  // the title's read-only squad strip and the pick screen both put Luna first
  await expect.poll(() => game.locator('.plc-squad').getAttribute('data-squad')).toMatch(/^Luna,/);
  await game.locator('[data-a="choose"]').click();
  await expect(game.locator('.plc-pick .plc-card').first()).toContainText('Luna');
  // any other owned cat can be swapped in from the bench
  await expect(game.locator('.plc-bench [data-a="squad-swap"]')).toHaveCount(5);
  await game.locator('[data-a="start"]').click();
  await game.waitForSelector('html[data-match="live"]');
  expect(await gattr(game, 'kittens')).toBe('2');
  await expect.poll(() => gattr(game, 'squadNames')).toMatch(/^Luna,/);
});

test('restore: a token bought earlier still dresses the hero', async ({ context, page, baseURL }) => {
  const legend = fakeToken(['coat.founder.clem', 'coat.founder.sage', 'coat.founder.brutus', 'coat.founder.cacklejaw', 'frame.founder', 'title.founder', 'skin.clem.dawnblade', 'frame.legend'], ['pl_founder_legend']);
  await mockHost(context, baseURL!, { app: { isApp: false, store: true }, token: legend });
  const game = await openHost(page);
  await expect.poll(() => gattr(game, 'look')).toBe('clem:skin.clem.dawnblade|-');
  expect(await gattr(game, 'frame')).toBe('frame.legend');
  await expect(game.locator('.pl-badge')).toContainText('Founder');
});

test('app builds: no checkout, no offers, no guest cats, no purchased cosmetics', async ({ context, page, baseURL }) => {
  await mockHost(context, baseURL!, {
    app: { isApp: true, store: true },
    token: fakeToken(['skin.clem.pink_bow', 'emote.starter'], ['pl_starter']),
    featured: FEATURED,
    offer: { kind: 'meet', catalogId: PUMPKIN },
    profile: { v: 1, sessions: 4, matches: 5, wins: 2, firstWinDone: true },
  });
  const game = await openHost(page);
  await expect.poll(() => gattr(game, 'isApp')).toBe('1');
  await page.waitForTimeout(800);
  await expect(game.locator('[data-a="store"]')).toHaveCount(0);
  await expect(game.locator('.pl-offer, .plc-meet')).toHaveCount(0);
  expect(await gattr(game, 'items')).toBe('');
  expect(await gattr(game, 'look')).toBe('clem:-|-');
  await game.locator('[data-a="choose"]').click();
  await expect(game.locator('.plc-card.guest')).toHaveCount(0);
  expect((await received(page)).some((m) => m.type === 'offer-seen' || m.type === 'open-cat')).toBe(false);
});

test('no Meet card in session 1; once per session from session 2', async ({ context, page, baseURL }) => {
  await mockHost(context, baseURL!, { app: { isApp: false, store: true }, featured: FEATURED, offer: { kind: 'meet', catalogId: PUMPKIN } });
  const game = await openHost(page);
  await page.waitForTimeout(800);
  await expect(game.locator('.plc-meet')).toHaveCount(0);

  await game.evaluate(() => {
    const p = JSON.parse(localStorage.getItem('tt.pawlegends.profile.v1') ?? '{}');
    localStorage.setItem('tt.pawlegends.profile.v1', JSON.stringify({ ...p, matches: 1, wins: 1, firstWinDone: true }));
  });
  await page.reload();
  const game2 = await openHost(page);
  await expect(game2.locator('.plc-meet')).toBeVisible();
  await game2.locator('.plc-meet [data-a="meet-close"]').click();
  await game2.locator('[data-a="choose"]').click();
  await game2.locator('[data-a="back"]').click();
  await page.waitForTimeout(500);
  await expect(game2.locator('.plc-meet')).toHaveCount(0);
});
