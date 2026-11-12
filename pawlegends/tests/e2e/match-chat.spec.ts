import { expect, test, type Page } from '@playwright/test';
import { playFromHome } from './helpers';

// MATCH-CHAT.md §4, §5, §8: in-match chat in a bot match. A bot sometimes types (a pinned chatter seed makes "sometimes"
// happen early), its line shows in the ticker as a phrase (a solo player's age is unknown, so everything is a phrase),
// the drawer offers chips only, and on desktop Enter opens the composer, typing never casts, Enter sends.

const PROFILE = { v: 1, sessions: 3, matches: 5, wins: 2, firstWinDone: true, hero: 'sage', veteran: true };

async function botMatch(page: Page, seed: number): Promise<void> {
  await page.addInitScript(
    ([p, s]) => {
      localStorage.setItem('tt.pawlegends.profile.v1', JSON.stringify(p));
      localStorage.removeItem('pl.botSeen');
      (window as unknown as { __plChatSeed?: number }).__plChatSeed = s;
    },
    [PROFILE, seed] as const,
  );
  await page.goto('/?e2e=1');
  await page.waitForSelector('html[data-screen="title"]', { timeout: 120_000 });
  await playFromHome(page, { timeout: 120_000 });
  await page.waitForSelector('html[data-match="live"]', { timeout: 240_000 });
  await page.waitForFunction(() => !document.querySelector('.pl-loading:not(.out)'), undefined, { timeout: 120_000 });
}

test('a bot match: a bot says an ordinary line (as a phrase), the ticker shows it, the drawer has chips only', async ({ page }, info) => {
  test.setTimeout(420_000);
  // seed 39: a teammate bot says "gl hf" about 7 s into the match (tests/unit/bot-chatter.test.ts covers the rates)
  await botMatch(page, 39);
  await page.waitForFunction(() => Number(document.documentElement.dataset.chatLines ?? 0) >= 1, undefined, { timeout: 180_000 });
  // the ticker row fades after 5 s: the e2e record of what it showed
  expect(await page.evaluate(() => document.documentElement.dataset.chatSaid ?? '')).toMatch(/gl hf/i);
  const ticker = page.locator('[data-testid="chat-ticker"] .cl-row');
  const sent = await page.evaluate(() => (window as unknown as { __plChat: { engine: { sent: { k: string; id?: number; slot: number }[] } } }).__plChat.engine.sent);
  expect(sent.length).toBeGreaterThanOrEqual(1);
  // no age band in a solo match: bots send phrase ids only, from a bot seat
  for (const l of sent) {
    expect(l.k).toBe('q');
    expect(l.slot).not.toBe(0);
  }
  // the drawer: chips only (no input) for a quick-tier team
  if (info.project.name === 'landscape') {
    // a fresh line to tap (the bot's has faded by now on a slow machine)
    await page.evaluate(() => (window as unknown as { __plChat: { debugLine(s: number, t: string): void } }).__plChat.debugLine(1, 'nice'));
    await ticker.first().tap();
  } else await page.keyboard.press('Enter');
  const drawer = page.locator('[data-testid="chat-drawer"]');
  await expect(drawer).toBeVisible();
  await expect(drawer.locator('.cd-input')).toHaveCount(0);
  await expect(drawer.locator('.cd-chip').first()).toBeVisible();
  // a chip sends at once and the drawer folds back to the ticker; the own line shows
  const before = Number(await page.evaluate(() => document.documentElement.dataset.chatLines ?? 0));
  if (info.project.name === 'landscape') await drawer.locator('.cd-chip').first().tap();
  else await drawer.locator('.cd-chip').first().click();
  await expect(drawer).toBeHidden();
  await page.waitForFunction((n) => Number(document.documentElement.dataset.chatLines ?? 0) > n, before);
});

test('desktop: Enter opens the composer, letters never cast, Enter sends, Esc cancels', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'desktop keys');
  test.setTimeout(420_000);
  await botMatch(page, 7);
  // a text-tier team (a seam: a solo player has no age band, so the test sets the tier)
  await page.evaluate(() => {
    (window as unknown as { __plChat: { drawer: { tier: string } } }).__plChat.drawer.tier = 'text';
  });
  const casts = async () => Number(await page.evaluate(() => document.documentElement.dataset.casts ?? 0));
  const before = await casts();
  await page.keyboard.press('Enter');
  const input = page.locator('[data-testid="chat-drawer"] .cd-input');
  await expect(input).toBeFocused();
  await page.keyboard.type('qwer qwer');
  await page.waitForTimeout(500);
  expect(await casts()).toBe(before);
  await expect(input).toHaveValue('qwer qwer');
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-testid="chat-drawer"]')).toBeHidden();
  await expect(page.locator('[data-testid="chat-ticker"]')).toContainText('qwer qwer');
  // Esc cancels without sending; Up recalls the last line
  await page.keyboard.press('Enter');
  await expect(input).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(input).toHaveValue('qwer qwer');
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-testid="chat-drawer"]')).toBeHidden();
  // Shift+Enter opens all chat: phrases only
  await page.keyboard.press('Shift+Enter');
  await expect(page.locator('[data-testid="chat-drawer"] [data-ch="all"]')).toHaveAttribute('aria-selected', 'true');
  await expect(input).toHaveCount(0);
  expect(await casts()).toBe(before);
});
