import { expect, test } from '@playwright/test';
import { closeAll, createParty, joinByLink, player, showHero, tap } from './party.helpers';

test.afterEach(closeAll);

/*
 * PARTY-XP.md (founder, Nov 20: "create a feature that party gives 50%+ xp boost"): a party alone hints "Invite a
 * friend: +50% XP"; with a friend in it both see "Party bonus +50% XP" on the lobby; after a match played together the
 * results' Pass block has the "Party bonus +50%" line on both screens.
 */
test('the party bonus shows on the lobby and in the results of a match played together', async ({ browser }) => {
  test.setTimeout(540_000);
  const a = await player(browser, 'desktop');
  const b = await player(browser, 'phone');
  const code = await createParty(a);
  const chipA = a.page.locator('[data-testid="party-xp-bonus"]');
  await expect(chipA).toHaveAttribute('data-pct', '0');
  await expect(chipA).toContainText('+50% XP');
  await joinByLink(b, code);
  await expect(a.page.locator('[data-testid="party-seat"]')).toHaveCount(2, { timeout: 30_000 });
  for (const p of [a, b]) {
    await expect(p.page.locator('[data-testid="party-xp-bonus"]')).toHaveAttribute('data-pct', '50');
    await expect(p.page.locator('[data-testid="party-xp-bonus"]')).toHaveText('Party bonus +50% XP');
  }
  await tap(a, a.page.locator('[data-p="diff"][data-v="easy"]'));
  await tap(a, a.page.locator('[data-testid="party-start"]'));
  const heroes = ['sage', 'lambo'];
  for (const [i, p] of [a, b].entries()) {
    await expect(p.page.locator('[data-testid="party-lock"]')).toBeVisible({ timeout: 30_000 });
    await showHero(p, heroes[i]);
    await tap(p, p.page.locator(`[data-testid="party-hero-${heroes[i]}"]`));
    await tap(p, p.page.locator('[data-testid="party-lock"]'));
  }
  for (const p of [a, b]) await p.page.waitForSelector('html[data-match="live"]', { timeout: 150_000 });
  // a surrender opens at 3:00 on Easy: A votes, B says yes
  await a.page.waitForFunction(() => Number(document.documentElement.dataset.tick ?? 0) >= 5450, null, { timeout: 300_000, polling: 1000 });
  await a.page.keyboard.press('Escape');
  await a.page.locator('.pl-menu [data-a="forfeit"]').click();
  const sure = b.page.locator('.pl-rail-act[data-act="vote-surrender-yes"]');
  await expect(sure).toBeVisible({ timeout: 10_000 });
  await tap(b, sure);
  for (const p of [a, b]) await p.page.waitForSelector('html[data-screen="results"]', { timeout: 60_000 });
  for (const p of [a, b]) {
    const line = p.page.locator('[data-testid="results-party-bonus"]');
    await expect(line).toHaveAttribute('data-pct', '50');
    // a surrender is a forfeit (20 Season XP): the bonus adds half of it
    await expect(line).toHaveText('Party bonus +50%: +10 Season XP');
  }
});
