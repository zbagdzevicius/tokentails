import { expect, test } from '@playwright/test';
import { closeAll, createParty, joinByLink, player, showHero, tap } from './party.helpers';

test.afterEach(closeAll);

/*
 * Party chat and avatars over the relay harness (CHAT-AVATARS.md §5, §7, §8): every seat shows an avatar; the party's
 * chat strip carries a phrase from a phone to the desktop; guests make it quick (no text input); the VS intro shows
 * every player's avatar from the party view with no extra request; no page scrolls.
 */
test('party chat between a desktop and a 667x375 phone; avatars on seats and on the VS intro', async ({ browser }) => {
  test.setTimeout(300_000);
  const a = await player(browser, 'desktop');
  const b = await player(browser, 'phone-small');
  const code = await createParty(a);
  await joinByLink(b, code);
  await expect(a.page.locator('[data-testid="party-seat"]')).toHaveCount(2, { timeout: 30_000 });
  await expect(a.page.locator('[data-testid="party-seat"] .pl-av')).toHaveCount(2);
  // guests: quick chat only
  const stripB = b.page.locator('[data-testid="party-chat-strip"]');
  await expect(stripB).toBeVisible();
  await tap(b, stripB);
  await expect(b.page.locator('[data-testid="party-chat-input"]')).toHaveCount(0);
  await tap(b, b.page.locator('.pp-chat [data-a="say"][data-id="12"]'));
  await expect(a.page.locator('.pp-chat')).toContainText('Ready!', { timeout: 5_000 });
  for (const p of [a, b]) expect(await p.page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1)).toBe(true);

  // the match: no request leaves the page for avatars (they ride the party view)
  const social: string[] = [];
  for (const p of [a, b]) p.page.on('request', (r) => (/\/pawlegends\/social|avatar/.test(r.url()) ? social.push(r.url()) : undefined));
  await tap(a, a.page.locator('[data-p="diff"][data-v="easy"]'));
  await tap(a, a.page.locator('[data-testid="party-start"]'));
  const heroes = ['sage', 'lambo'];
  for (const [i, p] of [a, b].entries()) {
    await expect(p.page.locator('[data-testid="party-lock"]')).toBeVisible({ timeout: 30_000 });
    // the pick keeps the chat strip (phrases only)
    await expect(p.page.locator('[data-testid="party-chat"]')).toBeVisible();
    await showHero(p, heroes[i]);
    await tap(p, p.page.locator(`[data-testid="party-hero-${heroes[i]}"]`));
    await tap(p, p.page.locator('[data-testid="party-lock"]'));
  }
  await expect(a.page.locator('[data-testid="vs-avatar"]')).toHaveCount(2, { timeout: 60_000 });
  await expect(a.page.locator('[data-testid="party-chat"]')).toBeHidden();
  expect(social).toEqual([]);
});
