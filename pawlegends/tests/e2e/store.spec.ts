import { expect, test } from '@playwright/test';
import { toChampSelect } from './helpers';
import { art, fakeToken, gattr, mockHost, openHost, received } from './host';

// Integration plan §2 (game side), NO-TOKENTAILS.md: the game sells only its own store items and pass on the web. An
// older host's Token Tails cat feed (featured cats, the "Meet" offer, a roster) shows nothing and opens nothing.
test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'store flow is viewport independent'));

const PUMPKIN = '65a1b2c3d4e5f6a7b8c9d0e1';
const NOVA = '65a1b2c3d4e5f6a7b8c9d0e2';
const FEATURED = [
  { catalogId: PUMPKIN, name: 'Pumpkin', type: 'GRASS', art: art('pumpkin') },
  { catalogId: NOVA, name: 'Nova', type: 'STELLAR', art: art('nova') },
];
const BOUGHT = [{ id: 'c1', name: 'Pumpkin', type: 'GRASS', tier: 'COMMON', isStarter: false, origin: 'adopt', catalogId: PUMPKIN }];
const SESSION_2 = { v: 1, sessions: 1, matches: 1, wins: 1, firstWinDone: true };

test('NO-TOKENTAILS.md: featured cats, a Meet offer and a roster show no card, squad or kitten; no open-cat', async ({ context, page, baseURL }) => {
  const six = [
    { id: 's1', name: 'Scout', type: 'WIND', tier: 'COMMON', isStarter: true, starterBreed: 'SCOUT', origin: 'starter' },
    { id: 'n1', name: 'Nova', type: 'STELLAR', tier: 'EPIC', isStarter: false, origin: 'adopt', art: art('nova') },
    { id: 'b1', name: 'Blaze', type: 'FIRE', tier: 'LEGENDARY', isStarter: false, origin: 'adopt' },
  ];
  await mockHost(context, baseURL!, {
    app: { isApp: false, store: true },
    signedIn: true,
    roster: six,
    featured: FEATURED,
    offer: { kind: 'meet', catalogId: PUMPKIN },
    catGrants: { [PUMPKIN]: BOUGHT },
    profile: SESSION_2,
    query: '&speed=8',
  });
  const game = await openHost(page);
  await expect(game.locator('.hm-nav [data-a="store"]')).toHaveCount(1); // STORE-PASS.md: the cosmetics store stays on the web
  await page.waitForTimeout(800);
  await expect(game.locator('.plc-meet, .plc-squad, .plc-joined, .lb-peek, [data-a="cards"], [data-testid="lobby-exit"]')).toHaveCount(0);
  await expect(game.locator('body')).not.toContainText(/token ?tails|your cats|squad/i);
  expect(await gattr(game, 'chromas')).toBe('');
  await toChampSelect(game);
  await expect(game.locator('.plc-pick, .plc-card, .cs-squad, .champ-owned')).toHaveCount(0);
  await game.locator('[data-a="start"]').click();
  await game.waitForSelector('html[data-match="live"]');
  expect(await gattr(game, 'kittens')).toBe('0');
  expect((await received(page)).some((m) => ['offer-seen', 'open-cat', 'champion-offer', 'skin-preview', 'purchase-intent'].includes(m.type as string))).toBe(false);
});

test('restore: a token bought earlier still dresses the hero', async ({ context, page, baseURL }) => {
  const legend = fakeToken(['coat.founder.clem', 'coat.founder.sage', 'coat.founder.brutus', 'coat.founder.cacklejaw', 'frame.founder', 'title.founder', 'skin.clem.dawnblade', 'frame.legend'], ['pl_founder_legend']);
  await mockHost(context, baseURL!, { app: { isApp: false, store: true }, token: legend });
  const game = await openHost(page);
  await expect.poll(() => gattr(game, 'look')).toBe('clem:skin.clem.dawnblade|-');
  expect(await gattr(game, 'frame')).toBe('frame.legend');
  // Home (HOME-MODES.md §4): the worn title under the profile name, the frame on the avatar ring
  await expect(game.locator('.hm-pf-title')).toContainText('Founder');
  await expect(game.locator('.hm-av')).toHaveAttribute('data-frame', 'frame.legend');
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
  await toChampSelect(game);
  await expect(game.locator('.plc-card')).toHaveCount(0);
  expect((await received(page)).some((m) => m.type === 'offer-seen' || m.type === 'open-cat')).toBe(false);
});
