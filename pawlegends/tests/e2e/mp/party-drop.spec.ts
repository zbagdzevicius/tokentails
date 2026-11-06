import { expect, test } from '@playwright/test';
import { closeAll, mpNames, partyMatch, player, pushed, shot } from './party.helpers';

test.afterEach(closeAll);

/*
 * Party play M4 (MULTIPLAYER.md §7): closing B gives A "<B> dropped · bot plays" within 7 s and a greyed robot
 * plate; B comes back (a reload with its stored seat), catches up and takes the hero back: A sees "<B> is back", B sees
 * "Bot covered for you".
 */
test('a dropped friend is flown by a bot, comes back, and is told the bot covered', async ({ browser }) => {
  test.setTimeout(300_000);
  const a = await player(browser, 'desktop');
  // the 915x412 landscape phone (the fourth screenshot size)
  const b = await player(browser, 'phone-wide');
  await partyMatch([a, b], ['sage', 'lambo']);
  const bName = (await mpNames(a))[1];
  await a.page.waitForTimeout(3000);
  // B's tab closes (its context keeps the resume token)
  await b.page.close();
  const t0 = Date.now();
  await expect.poll(() => pushed(a), { timeout: 9000, intervals: [250] }).toContain(`${bName.slice(0, 13)}`);
  await expect.poll(() => pushed(a), { timeout: 9000, intervals: [250] }).toContain('dropped · bot plays');
  expect(Date.now() - t0).toBeLessThan(7500);
  await a.page.waitForFunction(() => (Number(document.documentElement.dataset.mpMask ?? 0) & 2) === 2, null, { timeout: 5000 });
  // the plate's ring is greyed with a robot: the HUD's overhead seat says bot
  const bot = await a.page.evaluate(() => (window as unknown as { __plWorld: { overhead: { seats: Map<number, { bot: boolean }> } } }).__plWorld.overhead.seats.get(1)?.bot);
  expect(bot).toBe(true);
  await a.page.waitForTimeout(1500);
  await shot(a, 'lane-M', '10-friend-dropped');
  // B returns: a reload rejoins with the stored seat
  b.page = await b.ctx.newPage();
  await b.page.goto('/?e2e=1', { waitUntil: 'commit' });
  await b.page.waitForSelector('html[data-match="live"]', { timeout: 150_000 });
  await expect.poll(() => pushed(b), { timeout: 60_000, intervals: [500] }).toContain('Bot covered for you');
  await expect.poll(() => pushed(a), { timeout: 30_000, intervals: [500] }).toContain('is back');
  await a.page.waitForFunction(() => (Number(document.documentElement.dataset.mpMask ?? 0) & 2) === 0, null, { timeout: 20_000 });
  await shot(b, 'lane-M', '11-bot-covered');
  await shot(a, 'lane-M', '12-friend-back');
});
