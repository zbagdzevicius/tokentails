import { expect, test } from '@playwright/test';
import { chatSaid, closeAll, partyMatch, player, tap, title } from './party.helpers';

test.afterEach(closeAll);

/*
 * In-match chat between two clients over the relay harness (MATCH-CHAT.md §3, §4, §8): guests are quick tier, so the
 * drawer offers phrase chips only. The phone opens it from the wheel's centre ("More") and says "gl hf" to the team;
 * the desktop opens it with Enter (All, since the team is phrases only), switches to Team and says "Thanks!". Each
 * line shows in the other client's ticker with the sender's party name. No page scrolls.
 */
test('team chat between a desktop and a 667x375 phone in a party match (phrases for guests)', async ({ browser }) => {
  test.setTimeout(420_000);
  const a = await player(browser, 'desktop');
  const b = await player(browser, 'phone-small');
  // a cold preview server: load the game once on the phone before the join link (the first load is the slow one)
  await title(b);
  await partyMatch([a, b], ['sage', 'lambo']);
  await a.page.waitForTimeout(3000);

  // the phone: wheel → More → the drawer, chips only
  await tap(b, b.page.locator('.pl-chatbtn'));
  await expect(b.page.locator('.pl-chatwheel.on')).toBeVisible();
  const more = b.page.locator('[data-testid="quick-chat-type"]');
  await expect(more).toHaveText('More');
  await tap(b, more);
  const drawerB = b.page.locator('[data-testid="chat-drawer"]');
  await expect(drawerB).toBeVisible();
  await expect(drawerB.locator('.cd-input')).toHaveCount(0);
  await tap(b, drawerB.locator('.cd-chip[data-id="24"]'));
  await expect(drawerB).toBeHidden();
  await expect.poll(() => chatSaid(a), { timeout: 10_000 }).toContain('gl hf');
  await expect.poll(() => chatSaid(b), { timeout: 10_000 }).toContain('gl hf');

  // the desktop: Enter opens All (the team is phrases only); Team, then Thanks!
  await a.page.keyboard.press('Enter');
  const drawerA = a.page.locator('[data-testid="chat-drawer"]');
  await expect(drawerA).toBeVisible();
  await expect(drawerA.locator('[data-ch="all"]')).toHaveAttribute('aria-selected', 'true');
  await drawerA.locator('[data-ch="team"]').click();
  await drawerA.locator('.cd-chip[data-id="29"]').click();
  await expect.poll(() => chatSaid(b), { timeout: 10_000 }).toContain('Thanks!');
  // all chat: "gg" reaches both
  await a.page.keyboard.press('Shift+Enter');
  await drawerA.locator('.cd-chip[data-id="25"]').click();
  await expect.poll(() => chatSaid(b), { timeout: 10_000 }).toContain('[All]');
  for (const p of [a, b]) expect(await p.page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1)).toBe(true);
});
