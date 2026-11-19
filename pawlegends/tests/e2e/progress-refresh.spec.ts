import { expect, test, type Frame } from '@playwright/test';
import { limit } from '../unit/cpu-budget';
import { playFromHome } from './helpers';
import { mockHost, openHost, received } from './host';

// Founder, Nov 16: "progression is not refreshed (earned points / season xp) until app / web is restarted". The hosts
// now send a fresh `store` after every saved match and when the app or tab comes back (pawlegends-web storeSync.ts,
// unit-tested there and in pawlegends-app/tests); this is the game's half: whatever screen is up when that `store`
// lands (here Home, after the match, with the re-read arriving late), Home's Season XP, tier and the profile ring
// follow it in place, the quests count the match, and a pass claim lands, all without a reload.
test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'one bots match; the flow is viewport independent'));

const VETERAN = { v: 1, sessions: 3, matches: 5, wins: 2, firstWinDone: true, hero: 'clem', trick: 'pounce', difficulty: 'easy', veteran: true };
const SEASON = { id: 's1', xp: 900, tier: 2, premium: 'none', skips: 0, claimed: [] as string[], endsAt: '2027-01-05T00:00:00.000Z' };
const AFTER = { ...SEASON, xp: 1210, tier: 3 };

const chip = (game: Frame) => game.locator('.hm-curb');
const yarn = (game: Frame) => game.locator('[data-testid="home-yarn"]');
const CHAMPS = (balance: number) => ({ owned: [], founders: false, rotation: { week: 0 }, yarn: { balance, matches: 7, picksLeft: 0, nextPickAt: 15 }, bundles: [] });
const loadMarker = (game: Frame): Promise<number> => game.evaluate(() => ((window as unknown as { __plLoad?: number }).__plLoad ??= Math.random()));
const tallyOf = async (game: Frame): Promise<number> => Number(/(\d+) of \d+ done/.exec((await game.locator('[data-testid="home-goals"]').getAttribute('aria-label')) ?? '')?.[1] ?? -1);

test('Season XP, tier and quests on Home follow a saved bots match and a pass claim without a reload', async ({ context, page, baseURL }) => {
  test.setTimeout(limit(300_000));
  await mockHost(context, baseURL!, {
    app: { isApp: false, store: true },
    signedIn: true,
    profile: VETERAN,
    query: '&speed=64',
    store: { items: [], season: SEASON },
    champState: CHAMPS(652),
    // the re-read of /pawlegends/me lands late: the player is back on Home by then
    seasonOnSave: { season: { gained: 310, xp: 1210, tier: 3, prevTier: 2 }, store: { items: [], season: AFTER }, storeDelayMs: 2500 },
    passClaim: { items: ['coat.clem.s1_honey_tabby'], season: { ...AFTER, claimed: ['f:3'] } },
  });
  const game = await openHost(page);
  await expect(chip(game)).toContainText('900');
  await expect(chip(game)).toHaveAttribute('aria-label', /Season XP 900, Tier 2/);
  // founder Nov 17: the Yarn balance on Home too
  await expect(yarn(game)).toHaveAttribute('data-yarn', '652');
  const tally0 = await tallyOf(game);
  const marker = await loadMarker(game);

  // a bots match at speed 64, played to its end by the bots (as store-pass.spec.ts does)
  await playFromHome(game);
  await game.waitForSelector('html[data-match="live"]', { timeout: limit(60_000) });
  await game.waitForSelector('html[data-screen="results"]', { timeout: limit(240_000) });
  await expect(game.locator('.plc-season')).toContainText('+310');
  expect((await received(page)).some((m) => m.type === 'match-result')).toBe(true);

  // straight back to Home, before the late re-read lands
  await game.locator('[data-a="home"]').click();
  await game.waitForSelector('html[data-screen="title"]');
  // the late `store` lands while Home is up: the chips, the profile ring and its tier follow in place
  await expect(chip(game)).toHaveAttribute('aria-label', /Season XP 1210, Tier 3/, { timeout: limit(15_000) });
  await expect(chip(game)).toContainText('1,210');
  await expect(game.locator('[data-testid="home-profile"] .hm-pf-sub')).toHaveText('Lv 4 · Tier 3');
  // the Yarn the match paid shows on Home without a reload (the host's next `store`, storeSync.ts)
  await page.evaluate((c) => (window as unknown as { send(t: string, p: unknown): void }).send('store', { items: [], season: { id: 's1', xp: 1210, tier: 3, premium: 'none', skips: 0, claimed: [], endsAt: '2027-01-05T00:00:00.000Z' }, champions: c }), CHAMPS(756));
  await expect(yarn(game)).toHaveAttribute('data-yarn', '756');
  await expect(yarn(game)).toContainText('756');
  // the match counted for today's quests (local progress, no server round trip)
  expect(await tallyOf(game)).toBeGreaterThanOrEqual(tally0);
  // no reload happened on the way
  expect(await loadMarker(game)).toBe(marker);

  // a pass claim: the host answers the new `me`; the pass and Home follow it, still without a reload
  await game.locator('[data-a="collection"]').click();
  await game.locator('.pl-collection [data-a="pass"]').click();
  const pass = game.locator('.pl-pass');
  await expect(pass).toBeVisible();
  await expect(pass.locator('.pass-top [data-tier]')).toHaveAttribute('data-tier', '3');
  await pass.locator('[data-a="all"]').click();
  await expect(pass.locator('.pc.claimed')).toHaveCount(1);
  expect(await loadMarker(game)).toBe(marker);
});
