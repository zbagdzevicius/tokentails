import { expect, test } from '@playwright/test';
import { closeAll, createParty, joinByLink, player, shot, tap } from './party.helpers';

test.afterEach(closeAll);

/* Party play P7 (MULTIPLAYER.md §5.1, §12 P7): the shared pick. */

test('A locks Clem, B sees it greyed with A’s name; a leader side switch resets B’s hover; the timer auto-locks', async ({ browser }) => {
  test.setTimeout(240_000);
  const a = await player(browser, 'desktop');
  const b = await player(browser, 'phone');
  const code = await createParty(a);
  await joinByLink(b, code);
  const aName = (await a.page.locator('[data-testid="party-seat"]').first().locator('.pp-who b').textContent())!;
  await a.page.locator('[data-testid="party-start"]').click();
  await expect(b.page.locator('[data-testid="party-lock"]')).toBeVisible({ timeout: 15_000 });
  // the leader hovers a cat, B hovers another cat
  await a.page.locator('[data-testid="party-hero-sage"]').click();
  await tap(b, b.page.locator('[data-testid="party-hero-lambo"]'));
  await expect(a.page.locator('.pp-ts').nth(1)).toHaveAttribute('data-hero', 'lambo', { timeout: 5000 });
  // the leader switches to dogs: B's cat hover is reset and the cats are greyed for B
  await a.page.locator('[data-testid="party-hero-brutus"]').click();
  await expect(b.page.locator('[data-testid="party-hero-lambo"]')).toBeDisabled();
  await expect(b.page.locator('[data-testid="party-side-note"]')).toHaveText('Leader chose dogs');
  await expect(a.page.locator('.pp-ts').nth(1)).toHaveAttribute('data-hero', '');
  // back to cats, A locks Clem; B sees it taken with A's name
  await a.page.locator('[data-testid="party-hero-clem"]').click();
  await a.page.locator('[data-testid="party-lock"]').click();
  const clem = b.page.locator('[data-testid="party-hero-clem"]');
  await expect(clem).toBeDisabled();
  await expect(clem.locator('.pp-taken')).toHaveText(aName);
  await shot(a, 'lane-P', '30-pick');
  await shot(b, 'lane-P', '30-pick');
  // B never locks: the 30 s timer auto-locks B, nobody is kicked, and the match starts for both
  await b.page.waitForSelector('html[data-match="live"]', { timeout: 120_000 });
  await a.page.waitForSelector('html[data-match="live"]', { timeout: 120_000 });
});
