import { expect, test } from '@playwright/test';
import { closeAll, player, tap, type Player, playVariant } from './party.helpers';

test.afterEach(closeAll);

/*
 * The PvP report button (docs/plans/moba/SOCIAL-RANKED.md §8) in a real casual PvP match against the relay harness:
 * the scoreboard shows a flag on the other human's row only (never on bots or your own row), one tap opens the four
 * reason chips, one chip tap sends at once (no confirm) and the chips close; the match keeps running underneath.
 * Standalone (no embed host) the send cannot reach the API, so the rail says "Report not sent" and the flag is free
 * again: the host path is covered by tests/e2e/social.spec.ts style mocks and the unit tests.
 */

async function title(p: Player): Promise<void> {
  await p.page.goto('/?e2e=1', { waitUntil: 'commit' });
  await p.page.waitForSelector('html[data-screen="title"]', { timeout: 240_000 });
  await expect(p.page.locator('.pl-home[data-variants~="pvp"]')).toBeVisible({ timeout: 30_000 });
}

test('scoreboard flag: other human only, one tap opens the chips, one chip sends', async ({ browser }) => {
  test.setTimeout(900_000);
  const a = await player(browser, 'desktop');
  const b = await player(browser, 'desktop');
  for (const p of [a, b]) await title(p);
  for (const p of [a, b]) await playVariant(p, 'pvp');
  for (const p of [a, b]) await expect(p.page.locator('[data-testid="mm-accept-card"]')).toBeVisible({ timeout: 90_000 });
  for (const p of [a, b]) await tap(p, p.page.locator('[data-testid="mm-accept"]'));
  for (const p of [a, b]) {
    await expect(p.page.locator('[data-testid="party-lock"]')).toBeVisible({ timeout: 30_000 });
    await tap(p, p.page.locator('.pp-heroes [data-p="hero"]:not([disabled])').first());
    await tap(p, p.page.locator('[data-testid="party-lock"]'));
  }
  for (const p of [a, b]) await p.page.waitForSelector('html[data-match="live"]', { timeout: 150_000 });
  await a.page.waitForFunction(() => Number(document.documentElement.dataset.tick ?? 0) >= 120, null, { timeout: 120_000, polling: 500 });
  // the scoreboard (Tab held on desktop)
  await a.page.keyboard.down('Tab');
  const board = a.page.locator('.pl-scoreboard.on');
  await expect(board).toBeVisible();
  const flags = board.locator('[data-report]');
  await expect(flags).toHaveCount(1);
  const mine = board.locator('tr.me [data-report]');
  await expect(mine).toHaveCount(0);
  const tick0 = Number(await a.page.evaluate(() => document.documentElement.dataset.tick ?? 0));
  await flags.first().dispatchEvent('pointerdown');
  const chips = a.page.locator('.pl-report-pop .pl-report-chip');
  await expect(chips).toHaveCount(4);
  await chips.nth(0).click();
  await expect(a.page.locator('.pl-report-pop')).toHaveCount(0);
  await a.page.keyboard.up('Tab');
  // the match never paused for it
  await a.page.waitForFunction((t) => Number(document.documentElement.dataset.tick ?? 0) > t + 30, tick0, { timeout: 30_000, polling: 250 });
});
