import { expect, test } from '@playwright/test';
import { closeAll, partyMatch, player, playVariant, relayHealth, type Player } from './party.helpers';

test.afterEach(closeAll);

/*
 * Founder bug (Nov 18): in a friend party, Leave match put the player on the party's loading card ("Into the
 * Crossing…") with no way out, while the room played on with bots until the 2-minute empty-room timer. Now Leave goes
 * Home at once, the last leaver closes the room, and both can open a new party right away.
 */
async function leave(p: Player): Promise<void> {
  await p.page.keyboard.press('Escape');
  await p.page.locator('.pl-menu [data-a="leave"]').click();
  await expect(p.page.locator('.pl-menu')).toContainText('You go Home and leave the party');
  await p.page.locator('.pl-menu [data-a="leave-yes"]').click();
  // Home within a few seconds, never the party's loading card
  await p.page.waitForSelector('html[data-screen="title"] .pl-home', { timeout: 5_000 });
  await expect(p.page.locator('[data-testid="party-loading"]')).toHaveCount(0);
}

test('both friends leave mid-match: Home at once, the room closes, both can play again', async ({ browser }) => {
  test.setTimeout(300_000);
  const a = await player(browser, 'desktop');
  const b = await player(browser, 'desktop');
  const before = (await relayHealth()).rooms_live;
  await partyMatch([a, b], ['sage', 'lambo']);
  expect((await relayHealth()).rooms_live).toBe(before + 1);
  await a.page.waitForFunction(() => Number(document.documentElement.dataset.tick ?? 0) >= 60, null, { timeout: 60_000, polling: 250 });
  await leave(a);
  // one friend still plays: the room stays
  expect((await relayHealth()).rooms_live).toBe(before + 1);
  await leave(b);
  // the last human left: the room is gone within a couple of seconds, not after the 2-minute empty-room timer
  await expect.poll(async () => (await relayHealth()).rooms_live, { timeout: 5_000, intervals: [250] }).toBe(before);
  // both can start again: a new party opens for each
  for (const p of [a, b]) {
    await playVariant(p, 'friends');
    await expect(p.page.locator('[data-testid="party-code"]')).toBeVisible({ timeout: 30_000 });
  }
});
