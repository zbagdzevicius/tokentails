import { expect, test } from '@playwright/test';
import { closeAll, createParty, joinByLink, notes, player, shot, tap, type Player } from './party.helpers';

test.afterEach(closeAll);

/* Party play P8 (MULTIPLAYER.md §5.1, §12 P8): end → "Play again together" → "Leader started a rematch" → pick. */

async function surrender(p: Player): Promise<void> {
  if (p.kind === 'desktop') await p.page.keyboard.press('Escape');
  else await tap(p, p.page.locator('.pl-pause'));
  await expect(p.page.locator('.pl-menu')).toBeVisible();
  await tap(p, p.page.locator('.pl-menu [data-a="forfeit"]'));
  await tap(p, p.page.locator('.pl-menu [data-a="forfeit-yes"]'));
}

test('after a match, Play again together from the leader: a rematch note, then the pick with last heroes', async ({ browser }) => {
  // a surrender applies from 3:00 (Easy), so the match runs that long in real time
  test.setTimeout(480_000);
  const a = await player(browser, 'desktop');
  const b = await player(browser, 'phone');
  const code = await createParty(a);
  await joinByLink(b, code);
  await a.page.locator('[data-p="diff"][data-v="easy"]').click();
  await expect(b.page.locator('[data-testid="party-leader-picks"]')).toHaveText('Leader picks: Easy');
  await a.page.locator('[data-testid="party-start"]').click();
  await expect(b.page.locator('[data-testid="party-lock"]')).toBeVisible({ timeout: 15_000 });
  await a.page.locator('[data-testid="party-hero-sage"]').click();
  await a.page.locator('[data-testid="party-lock"]').click();
  await tap(b, b.page.locator('[data-testid="party-hero-lambo"]'));
  await tap(b, b.page.locator('[data-testid="party-lock"]'));
  for (const p of [a, b]) await p.page.waitForSelector('html[data-match="live"]', { timeout: 120_000 });
  await a.page.waitForFunction(() => Number(document.documentElement.dataset.tick ?? 0) >= 5450, null, { timeout: 300_000, polling: 1000 });
  await surrender(a);
  await surrender(b);
  for (const p of [a, b]) await p.page.waitForSelector('html[data-screen="results"]', { timeout: 60_000 });
  await shot(a, 'lane-P', '40-results');
  // Run it back returns to the party (its results phase)
  for (const p of [a, b]) {
    await tap(p, p.page.locator('[data-a="again"]'));
    await expect(p.page.locator('.pp-lobby[data-phase="results"]')).toBeVisible({ timeout: 30_000 });
  }
  await shot(b, 'lane-P', '41-party-results');
  await a.page.locator('[data-testid="party-start"]').click();
  await expect.poll(() => notes(b), { timeout: 10_000 }).toContain('Leader started a rematch');
  await expect(b.page.locator('[data-testid="party-lock"]')).toBeVisible({ timeout: 15_000 });
  // prefilled: each strip seat shows its last hero
  await expect(b.page.locator('.pp-ts').nth(0)).toHaveAttribute('data-hero', 'sage');
  await expect(b.page.locator('.pp-ts').nth(1)).toHaveAttribute('data-hero', 'lambo');
  await shot(b, 'lane-P', '42-rematch-pick');
});
