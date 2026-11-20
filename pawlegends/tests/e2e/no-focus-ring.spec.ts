// No focus ring, and Tab walks no buttons (founder, Nov 19: "remove that indicator when clicking TAB from buttons
// everywhere across the app"). On each screen a control has focus, Tab is pressed four times: focus stays where it was
// (input/tabGuard.ts) and neither that control nor its ancestors draw a ring (an outline, or a box-shadow that differs
// from the same element without focus). In a match Tab still holds the scoreboard. The CSS guard is
// tests/unit/no-focus-ring.test.ts.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Frame, type Page } from '@playwright/test';
import { startFirstMatch, toChampSelect } from './helpers';
import { mockHost, openHost } from './host';
import { limit } from '../unit/cpu-budget';

test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'Tab is a keyboard key (desktop)'));
test.describe.configure({ timeout: limit(180_000) });

type Root = Page | Frame;

/** FOCUS_SHOTS=<dir>: a screenshot after each Tab run (the before / after evidence). */
const SHOTS = process.env.FOCUS_SHOTS || null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

/** Rings on the focused element and its ancestors (outline, or a focus-only box-shadow). Runs in the page. */
const rings = (root: Root): Promise<{ tag: string; problems: string[] }> =>
  root.evaluate(() => {
    const a = document.activeElement as HTMLElement | null;
    const name = (el: Element): string => `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? `.${el.className.trim().split(/\s+/).join('.')}` : ''}`;
    const problems: string[] = [];
    if (!a || a === document.body) return { tag: 'body', problems };
    const chain: HTMLElement[] = [];
    for (let el: HTMLElement | null = a; el && el !== document.body; el = el.parentElement) chain.push(el);
    const focused = chain.map((el) => {
      const cs = getComputedStyle(el);
      if (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) problems.push(`${name(el)} outline ${cs.outlineWidth} ${cs.outlineStyle}`);
      return cs.boxShadow;
    });
    a.blur();
    const blurred = chain.map((el) => getComputedStyle(el).boxShadow);
    a.focus({ preventScroll: true });
    chain.forEach((el, i) => {
      if (focused[i] !== blurred[i]) problems.push(`${name(el)} box-shadow on focus: ${focused[i]}`);
    });
    return { tag: name(a), problems };
  });

/** Focus `sel` (the first visible match), press Tab four times: focus has not moved and nothing draws a ring. */
async function tabStays(page: Page, root: Root, sel: string, label: string): Promise<void> {
  const el = root.locator(sel).locator('visible=true').first();
  await el.focus();
  await root.evaluate(() => ((window as unknown as { __plBefore?: Element | null }).__plBefore = document.activeElement));
  for (let i = 0; i < 4; i++) await page.keyboard.press('Tab');
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `${label.replace(/\W+/g, '-')}.png`) });
  const same = await root.evaluate(() => document.activeElement === (window as unknown as { __plBefore?: Element | null }).__plBefore);
  expect(same, `${label}: Tab moved focus off ${sel}`).toBe(true);
  const r = await rings(root);
  expect(r.problems, `${label}: a focus ring on ${r.tag}`).toEqual([]);
}

/** No transitions: a ring that fades in must be read at its end value. */
const still = (root: Root): Promise<unknown> => root.evaluate(() => {
  const s = document.createElement('style');
  s.textContent = '*, *::before, *::after { transition: none !important; }';
  document.head.append(s);
});

async function openGame(context: Parameters<typeof mockHost>[0], page: Page, baseURL: string): Promise<Frame> {
  await mockHost(context, baseURL, {
    app: { isApp: false, store: true },
    signedIn: true,
    profile: { v: 1, sessions: 3, matches: 5, wins: 2, firstWinDone: true, hero: 'sage', difficulty: 'easy', veteran: true },
    store: { items: [], season: null },
    api: {
      'social.get': { status: 200, body: { me: { code: 'PL-7KQ2-M9XR', name: 'Witty Biscuit', invisible: false, allowRecent: true, ageBand: '18+' }, friends: [], requests: { in: [], out: [] }, blocks: [], invites: [], rev: 'r1', chat: { unread: 0 }, live: {} } },
      'social.pulse': { status: 204 },
    },
  });
  const game = await openHost(page);
  await game.waitForSelector('.pl-home');
  await still(game);
  return game;
}

test('Home, nav, settings and Friends: Tab moves no focus and draws no ring', async ({ context, page, baseURL }) => {
  const game = await openGame(context, page, baseURL!);
  // nothing focused: Tab does not reach the nav (the founder's screenshot: a ring around Champions)
  await game.locator('.hm-nav [data-a="heroes"]').focus();
  await game.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  for (let i = 0; i < 4; i++) await page.keyboard.press('Tab');
  expect(await game.evaluate(() => document.activeElement === document.body || document.activeElement === null)).toBe(true);
  await tabStays(page, game, '.hm-nav [data-a="heroes"]', 'home nav Champions');
  await tabStays(page, game, '.hm-nav button', 'home nav');
  await tabStays(page, game, '[data-testid="home-play"]', 'home PLAY');
  // Home's friends panel (Nov 20)
  if (await game.locator('.fr-rail button').first().isVisible()) await tabStays(page, game, '.fr-rail button', 'friends panel');
  // Settings: on the Profile screen since Nov 20 (Home's corner buttons are gone)
  await game.locator('[data-testid="home-profile"]').first().click();
  await game.locator('[data-testid="profile-settings"]').click();
  await game.locator('.pl-settings').waitFor();
  await tabStays(page, game, '.pl-settings button', 'settings');
  await page.keyboard.press('Escape');
  await expect(game.locator('.pl-settings')).toHaveCount(0);
});

test('Store: Tab moves no focus and draws no ring', async ({ context, page, baseURL }) => {
  const game = await openGame(context, page, baseURL!);
  await game.locator('.hm-nav [data-a="store"]').click();
  await game.locator('.pl-shop .cst-tab').first().waitFor();
  await tabStays(page, game, '.pl-shop .cst-tab', 'store tab');
  await tabStays(page, game, '.pl-shop .cst-card', 'store card');
});

test('Profile: Tab moves no focus and draws no ring', async ({ context, page, baseURL }) => {
  const game = await openGame(context, page, baseURL!);
  await game.locator('[data-testid="home-profile"]').click();
  await game.locator('[data-testid="profile-screen"]').waitFor();
  await tabStays(page, game, '[data-testid="profile-screen"] button', 'profile');
});

test('Champion select: Tab moves no focus and draws no ring', async ({ context, page, baseURL }) => {
  const game = await openGame(context, page, baseURL!);
  await toChampSelect(game);
  await game.waitForSelector('.pl-pick .cs');
  await tabStays(page, game, '.pl-pick .cs-tile', 'champion tile');
  await tabStays(page, game, '.pl-pick button', 'champion select');
});

test('In a match: Tab holds the scoreboard, moves no focus, draws no ring', async ({ page }) => {
  test.setTimeout(limit(180_000));
  await startFirstMatch(page);
  await still(page);
  await page.keyboard.down('Tab');
  await expect(page.locator('.pl-scoreboard')).toBeVisible();
  await page.keyboard.up('Tab');
  expect(await page.evaluate(() => document.activeElement === document.body || document.activeElement === null)).toBe(true);
  await tabStays(page, page, '.pl-hud button', 'match HUD');
});
