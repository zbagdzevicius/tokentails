import { expect, test } from '@playwright/test';
import { closeAll, createParty, joinByLink, player, setHidden, shot, tap } from './party.helpers';

test.afterEach(closeAll);

/* Party play P6 (MULTIPLAYER.md §5.1, §12 P6): Start without a ready check, the waiting chip and Nudge; kick. */

test('Start with everyone present goes to pick; a hidden tab shows "Waiting for … · Nudge" and the nudge reaches it', async ({ browser }) => {
  const a = await player(browser, 'desktop');
  const b = await player(browser, 'phone');
  const code = await createParty(a);
  await joinByLink(b, code);
  const bName = (await a.page.locator('[data-testid="party-seat"]').nth(1).locator('.pp-who b').textContent())!;
  await setHidden(b, true);
  await expect(a.page.locator('[data-testid="party-seat"]').nth(1)).toHaveAttribute('data-conn', 'away');
  await a.page.locator('[data-testid="party-start"]').click();
  const chip = a.page.locator('[data-testid="party-waiting"]');
  await expect(chip).toContainText(`Waiting for ${bName}`);
  await expect(chip.locator('[data-p="nudge"]')).toHaveText('Nudge');
  await shot(a, 'lane-P', '20-waiting');
  await chip.locator('[data-p="nudge"]').click();
  await expect(chip.locator('[data-p="nudge"]')).toHaveText('Nudged');
  await expect(b.page.locator('.pp-notes')).toContainText('nudged you');
  // after 10 s the leader may start anyway
  await expect(a.page.locator('[data-testid="party-start"]')).toHaveText('Start anyway', { timeout: 15_000 });
  await setHidden(b, false);
  await expect(chip).toHaveCount(0);
  await a.page.locator('[data-testid="party-start"]').click();
  await expect(a.page.locator('[data-testid="party-lock"]')).toBeVisible();
  await expect(b.page.locator('[data-testid="party-lock"]')).toBeVisible();
});

test('kick: the member is told, the code rotates, the old link says it is out of date', async ({ browser }) => {
  const a = await player(browser, 'desktop');
  const b = await player(browser, 'phone');
  const code = await createParty(a);
  await joinByLink(b, code);
  // a two-tap confirm: the first tap arms it ("Tap again to remove")
  await a.page.locator('[data-p="kick"]').click();
  await expect(a.page.locator('[data-p="kick"][data-sure]')).toHaveCount(1);
  await a.page.locator('[data-p="kick"]').click();
  await expect(b.page.locator('[data-testid="party-ended"]')).toContainText('You were removed from the party');
  await expect(a.page.locator('[data-testid="party-code"]')).not.toHaveText(`${code.slice(0, 3)} ${code.slice(3)}`);
  const c = await player(browser, 'phone-small');
  await c.page.goto(`/?e2e=1&party=${code}`, { waitUntil: 'commit' });
  await expect(c.page.locator('[data-testid="party-ended"]')).toContainText('This invite is out of date', { timeout: 120_000 });
  await tap(c, c.page.locator('[data-testid="party-own"]'));
  await expect(c.page.locator('[data-testid="party-code"]')).toBeVisible({ timeout: 30_000 });
});
