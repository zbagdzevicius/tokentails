import { expect, test, type Frame } from '@playwright/test';
import { limit } from '../unit/cpu-budget';
import { playFromHome } from './helpers';
import { mockHost, openHost, received } from './host';

/*
 * Founder, Nov 21: "after a match profile stats / season xp / yarn / tier is not updated correctly here and level /
 * match is not updated in leaderboards. only match history gets updated looks like."
 *
 * One signed-in player in the mock embed host finishes a match (the game frame on the preview's own origin, which has
 * no party server, so PLAY is the 3v3 vs bots and the game hands its host a `match-result`; a relay match hands it a
 * `party-result`, which the mock host answers the same way). The host answers as the real ones do (storeSync.ts):
 * `save-result` with the save's Season XP at once, then the re-read `store` (Season XP, tier, Yarn) a few seconds
 * later, while the player already has Profile open. Without a reload:
 * - Profile's Yarn and Pass card follow the late store in place (before the fix Profile kept the numbers it copied when
 *   it opened; only its match rows moved), and its level counts the match;
 * - Home's Season XP and Tier chips, its Yarn and the profile chip ("Lv 12 · Tier 3") show the new values;
 * - Boards (Global) asked again shows the saved match: the window keeps no copy between opens (the server's own board
 *   cache is unit-tested in backend leaderboard.spec.ts).
 * The game frame never reaches the production relay: its origin is not a Token Tails host (partyLink.ts API_BY_HOST).
 */
test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'one bots match; the flow is viewport independent'));

const PROFILE = { v: 1, sessions: 3, matches: 35, wins: 18, firstWinDone: true, hero: 'sage', trick: 'hiss', difficulty: 'easy', veteran: true };
const SEASON = { id: 's1', xp: 900, tier: 2, premium: 'none', skips: 0, claimed: [] as string[], endsAt: '2027-01-05T00:00:00.000Z' };
const AFTER = { ...SEASON, xp: 1210, tier: 3 };
const CHAMPS = (balance: number) => ({ owned: [], founders: false, rotation: { week: 0 }, yarn: { balance, matches: 7, picksLeft: 0, nextPickAt: 15 }, bundles: [] });
const STORE_DELAY_MS = 9000;

/** The account's server: its saved matches move when the backend saves the match (here: when the host got it). */
function server() {
  const s = { matches: PROFILE.matches };
  const levelOf = (m: number) => [0, 2, 4, 6, 8, 10, 13, 16, 20, 25, 30, 36, 42, 50].filter((x) => m >= x).length;
  const handle = (op: string, args: Record<string, unknown>) => {
    if (op === 'board.get' && args.kind === 'level') {
      const me = { rank: 2, value: levelOf(s.matches), m: s.matches, name: 'Zygis' };
      return {
        status: 200,
        body: {
          period: 'all',
          page: 0,
          pages: 1,
          rows: [
            { rank: 1, name: 'Mira Real', value: 15, m: 60 },
            { ...me, me: true },
          ],
          me,
        },
      };
    }
    return { status: 404 };
  };
  return { s, handle };
}

/** Open Boards (Global), read my row's level and matches, close it. */
async function myBoardRow(game: Frame): Promise<string> {
  await game.locator('[data-testid="home-boards"]').click();
  const row = game.locator('.pl-bd.me').first();
  await expect(row).toBeVisible({ timeout: limit(15_000) });
  const metric = row.locator('.pl-bd-metric');
  const text = `${await metric.locator('b').textContent()} ${await metric.locator('small').textContent()}`;
  await game.locator('body').press('Escape');
  await expect(row).toHaveCount(0);
  return text;
}

test('after a match: Profile (open), Home and Boards show the new Season XP, tier, Yarn, level and matches without a reload', async ({ context, page, baseURL }) => {
  test.setTimeout(limit(360_000));
  const srv = server();
  await context.exposeFunction('plApi', async (op: string, args: Record<string, unknown>) => srv.handle(op, args ?? {}));
  await mockHost(context, baseURL!, {
    app: { isApp: false, store: true },
    signedIn: true,
    liveApi: true,
    // the game frame on the preview's origin (social-invites.spec.ts): no party server there, the host posts to '*'
    gameOrigin: baseURL!,
    sendTarget: '*',
    profile: PROFILE,
    query: '&speed=64',
    store: { items: [], season: SEASON },
    champState: CHAMPS(652),
    seasonOnSave: { season: { gained: 310, xp: 1210, tier: 3, prevTier: 2 }, store: { items: [], season: AFTER, champions: CHAMPS(756) }, storeDelayMs: STORE_DELAY_MS },
  });
  // the game's own storage on the preview's origin (the host writes the profile on its origin only)
  await context.addInitScript((p) => {
    try {
      if (location.port && !localStorage.getItem('tt.pawlegends.profile.v1')) localStorage.setItem('tt.pawlegends.profile.v1', JSON.stringify(p));
    } catch {
      /* opaque origin */
    }
  }, PROFILE);
  // the preview serves the game at /: map the host's /pawlegends-game/ path onto it
  await context.route(new RegExp(`^${baseURL!.replace(/[.]/g, '\\.')}/pawlegends-game/`), async (route) => {
    const url = new URL(route.request().url());
    const rest = url.pathname.slice('/pawlegends-game/'.length) || 'index.html';
    try {
      return await route.fulfill({ response: await route.fetch({ url: `${baseURL}/${rest}${url.search}` }) });
    } catch {
      return route.abort().catch(() => undefined);
    }
  });
  const game = await openHost(page);
  await game.waitForSelector('html[data-screen="title"] .pl-home', { timeout: limit(60_000) });
  const marker = await game.evaluate(() => ((window as unknown as { __plLoad?: number }).__plLoad ??= Math.random()));

  // before: Home and Boards show the old numbers
  await expect(game.locator('.hm-curb')).toHaveAttribute('aria-label', /Season XP 900, Tier 2/);
  await expect(game.locator('[data-testid="home-yarn"]')).toHaveAttribute('data-yarn', '652');
  await expect(game.locator('[data-testid="home-profile"] .hm-pf-sub')).toHaveText('Lv 11 · Tier 2');
  expect(await myBoardRow(game)).toBe('Lv 11 35 matches');

  // a bots match at speed 64, played to its end by the bots
  await playFromHome(game);
  await game.waitForSelector('html[data-match="live"]', { timeout: limit(60_000) });
  await game.waitForSelector('html[data-screen="results"]', { timeout: limit(240_000) });
  await expect.poll(async () => (await received(page)).some((m) => m.type === 'match-result' || m.type === 'party-result'), { timeout: limit(30_000) }).toBe(true);
  const sentAt = Date.now();
  // the backend saved it: the account's server count moves
  srv.s.matches += 1;

  // Home, then Profile, before the late store lands
  await game.locator('[data-a="home"]').first().click();
  await game.waitForSelector('html[data-screen="title"]', { timeout: limit(30_000) });
  await game.locator('[data-testid="home-profile"]').click();
  const profile = game.locator('[data-testid="profile-screen"]');
  await expect(profile).toBeVisible();
  const yarn = profile.locator('.cst-wallet');
  if (Date.now() - sentAt < STORE_DELAY_MS - 2000) await expect(yarn).toHaveText(/652/);
  // the late store lands while Profile is open: its Yarn and Pass follow in place
  await expect(yarn).toHaveText(/756/, { timeout: limit(30_000) });
  await expect(profile.locator('.pfx-pass')).toContainText('1,210 Season XP');
  await expect(profile.locator('.pfx-pass')).toContainText('3 / ');
  // the level counts the match (Lv 12 from 36 matches)
  await expect(profile.locator('[data-testid="profile-level"]').first()).toHaveText('Lv 12');
  await game.locator('[data-testid="profile-back"]').click();

  // Home: Season XP, tier, Yarn and the profile chip
  await expect(game.locator('.hm-curb')).toHaveAttribute('aria-label', /Season XP 1210, Tier 3/, { timeout: limit(15_000) });
  await expect(game.locator('[data-testid="home-yarn"]')).toHaveAttribute('data-yarn', '756');
  await expect(game.locator('[data-testid="home-profile"] .hm-pf-sub')).toHaveText('Lv 12 · Tier 3');
  // Boards asked again: the saved match and the new level
  expect(await myBoardRow(game)).toBe('Lv 12 36 matches');
  // no reload on the way
  expect(await game.evaluate(() => (window as unknown as { __plLoad?: number }).__plLoad)).toBe(marker);
});
