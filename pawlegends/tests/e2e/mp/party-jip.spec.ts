import { expect, test } from '@playwright/test';
import { attr } from '../helpers';
import { closeAll, createParty, player, shot } from './party.helpers';

test.afterEach(closeAll);

/* Party play P10 (MULTIPLAYER.md §12 P10): Open seats; a friend joins mid-match and takes the empty piloted seat. */

test('Open seats: the leader starts alone, a friend joins by link mid-match and flies slot 1', async ({ browser }) => {
  test.setTimeout(240_000);
  const a = await player(browser, 'desktop');
  const code = await createParty(a);
  await a.page.locator('input[data-p="open"]').check();
  await expect(a.page.locator('.pp-ctl')).toContainText('Unfilled seats lower rewards');
  await expect(a.page.locator('[data-testid="party-start"]')).toHaveText('Start');
  await shot(a, 'lane-P', '50-open-seats');
  await a.page.locator('[data-testid="party-start"]').click();
  await a.page.locator('[data-testid="party-lock"]').click();
  await a.page.waitForSelector('html[data-match="live"]', { timeout: 120_000 });
  // slots 1 and 2 are human seats flown by the bot pilot until someone claims them
  await a.page.waitForFunction(() => (Number(document.documentElement.dataset.mpMask ?? 0) & 6) === 6, null, { timeout: 30_000 });
  const b = await player(browser, 'phone');
  await b.page.goto(`/?e2e=1&party=${code}`, { waitUntil: 'commit' });
  await b.page.waitForSelector('html[data-match="live"]', { timeout: 150_000 });
  expect(await attr(b.page, 'mpTurn')).not.toBe('');
  await a.page.waitForFunction(() => (Number(document.documentElement.dataset.mpMask ?? 0) & 2) === 0, null, { timeout: 60_000 });
  await shot(b, 'lane-P', '51-joined-mid-match');
});
