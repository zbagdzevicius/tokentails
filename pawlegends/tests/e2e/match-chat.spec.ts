import { expect, test, type Page } from '@playwright/test';
import { playFromHome } from './helpers';
import { limit } from '../unit/cpu-budget';

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
  await page.waitForSelector('html[data-screen="title"]', { timeout: limit(120_000) });
  await playFromHome(page, { timeout: limit(120_000) });
  await page.waitForSelector('html[data-match="live"]', { timeout: limit(240_000) });
  await page.waitForFunction(() => !document.querySelector('.pl-loading:not(.out)'), undefined, { timeout: limit(120_000) });
}

test('a bot match: a bot says an ordinary line (as a phrase), the ticker shows it, the drawer has chips only', async ({ page }, info) => {
  test.setTimeout(limit(420_000));
  // seed 39: a teammate bot says "gl hf" about 7 s into the match (tests/unit/bot-chatter.test.ts covers the rates)
  await botMatch(page, 39);
  await page.waitForFunction(() => Number(document.documentElement.dataset.chatLines ?? 0) >= 1, undefined, { timeout: limit(180_000) });
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
  test.setTimeout(limit(420_000));
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

// MATCH-CHAT.md §4.4 (Nov 17, founder: "in-match chat is still missing"): a bot match had no chat button, so a phone
// could reach the chat only by tapping a bot's line in the few seconds it showed. Now every match has one.
test('the chat button: one tap opens chat in a bot match, a quick chat and a typed line (16+) go out, nothing is covered', async ({ page }, info) => {
  test.setTimeout(limit(420_000));
  await page.addInitScript(() => localStorage.setItem('pl.ageBand', '18+'));
  await botMatch(page, 7);
  const touch = info.project.name === 'landscape';
  const btn = page.locator('[data-testid="chat-open"]');
  await expect(btn).toBeVisible();
  // the button covers none of the controls around it (on phones it sits in the minimap's empty top-left corner)
  const box = (await btn.boundingBox())!;
  const others = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.pl-pingbtn, .pl-fish, .pl-emote, .pl-tbtn, .pl-tcluster, .pl-bar, .pl-score, .pl-strip')]
      .filter((e) => getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden')
      .map((e) => ({ c: e.className, r: e.getBoundingClientRect() }))
      .filter((o) => o.r.width > 0 && o.r.height > 0)
      .map((o) => ({ c: o.c, x: o.r.x, y: o.r.y, w: o.r.width, h: o.r.height })),
  );
  for (const o of others) {
    const hit = box.x < o.x + o.w && box.x + box.width > o.x && box.y < o.y + o.h && box.y + box.height > o.y;
    expect(hit, `chat button over ${o.c}`).toBe(false);
  }
  const drawer = page.locator('[data-testid="chat-drawer"]');
  const said = () => page.evaluate(() => document.documentElement.dataset.chatSaid ?? '');
  // a quick chat: open, one chip
  if (touch) await btn.tap();
  else await btn.click();
  await expect(drawer).toBeVisible();
  await expect(drawer.locator('.cd-input')).toBeVisible();
  const chip = drawer.locator('.cd-chip').first();
  const phrase = (await chip.textContent())!.trim();
  if (touch) await chip.tap();
  else await chip.click();
  await expect(drawer).toBeHidden();
  await expect.poll(said).toContain(phrase);
  // a typed line: desktop opens with Enter, phones with the button
  if (touch) await btn.tap();
  else await page.keyboard.press('Enter');
  const input = drawer.locator('.cd-input');
  await expect(input).toBeVisible();
  await input.fill('push mid with me');
  if (touch) await drawer.locator('.cd-send').tap();
  else await page.keyboard.press('Enter');
  await expect(drawer).toBeHidden();
  await expect.poll(said).toContain('push mid with me');
  await expect(page.locator('[data-testid="chat-ticker"]')).toContainText('push mid with me');
  await page.screenshot({ path: `test-results/match-chat/${info.project.name}-sent.png` });
});
