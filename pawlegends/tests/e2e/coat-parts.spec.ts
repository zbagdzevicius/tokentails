import { expect, test } from '@playwright/test';
import { playFromHome } from './helpers';
import { mockHost, openHost, received } from './host';

// gaps2 coats-models: an owned, equipped Epic or Legendary coat is worn in a bot match (the model's coat parts are
// checked in tests/unit/coat-parts.test.ts; this proves the look reaches the match). COAT_SHOTS=<dir> also saves a
// screenshot of each coat in the match.
test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'the worn look is viewport independent'));

const SEASON = { id: 's1', xp: 0, tier: 0, premium: 'none', skips: 0, claimed: [] as string[], endsAt: '2027-01-05T00:00:00.000Z' };
const COATS: [hero: string, coat: string, side: 'cat' | 'dog'][] = [
  ['clem', 'coat.clem.s1_sunforged', 'cat'],
  ['brutus', 'coat.brutus.store_thunderpaw', 'dog'],
  ['duchess', 'coat.duchess.s1_eclipse', 'cat'],
  ['marshmallow', 'coat.marshmallow.store_frostbell', 'dog'],
  ['pixel', 'coat.pixel.store_moonwhisker', 'cat'],
  ['sage', 'coat.sage.store_bloomtail', 'cat'],
];
const SHOTS = process.env.COAT_SHOTS;
const ONLY = process.env.COAT_ONLY;

for (const [hero, coat, side] of COATS) {
  if (!SHOTS && hero !== 'clem' && hero !== 'brutus' && !ONLY) continue; // CI: one cat and one dog
  if (ONLY && !ONLY.split(',').includes(hero)) continue;
  test(`${coat} is worn in a bot match`, async ({ context, page, baseURL }) => {
    test.setTimeout(180_000);
    await mockHost(context, baseURL!, {
      app: { isApp: false, store: true },
      signedIn: true,
      profile: { v: 1, sessions: 3, matches: 5, wins: 2, firstWinDone: true, hero, side, trick: 'pounce', difficulty: 'easy', veteran: true, looks: { [hero]: { coat, chroma: null } } },
      store: { items: [coat], season: SEASON },
    });
    const game = await openHost(page);
    await game.waitForSelector('html[data-screen="title"]');
    await playFromHome(game);
    await game.waitForSelector('html[data-match="live"]');
    await expect.poll(async () => (await received(page)).some((m) => m.type === 'analytics' && m.event === 'item_seen_in_match' && (m.props as { item?: string })?.item === coat)).toBe(true);
    if (SHOTS) {
      await game.waitForFunction(() => !document.querySelector('.pl-loading:not(.out)'));
      await page.waitForTimeout(2500);
      await page.screenshot({ path: `${SHOTS}/${hero}-${coat}.png` });
    }
  });
}
