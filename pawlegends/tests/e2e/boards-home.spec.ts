import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Frame, type Locator } from '@playwright/test';
import { mockHost, openHost, received } from './host';
import { limit } from '../unit/cpu-budget';

/*
 * Founder Nov 19: the leaderboards are their own window, opened from Boards in Home's left stack right under # Join
 * (the one way in: no Leaderboard pill by the promo, no Boards tab in the friends panel). Weekly by default, Local
 * (players of my country, from my flag), my own row once. And Home's avatar is my avatar: the same picture Profile and
 * the friends list draw, updated live. Desktop and the 844x390 touch phone; at 1440x900, 1920x1080, 667x375 and
 * 390x844 the stack overlaps neither the profile, the nav, PLAY nor the corner. Screenshots to
 * ~/Downloads/paw-legends/boards/ when LB_SHOTS=1 (or SHOTS_DIR).
 */
test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop' && info.project.name !== 'landscape', 'desktop and landscape only'));

const SHOTS = process.env.SHOTS_DIR ?? (process.env.LB_SHOTS === '1' ? join(homedir(), 'Downloads', 'paw-legends', 'boards') : null);
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const me = { code: 'PL-7KQ2-M9XR', name: 'Zygis', invisible: false, allowRecent: true, ageBand: '18+', av: { i: 'h:nova' } as { i: string } };

function fakeServer() {
  return async (op: string, args: Record<string, unknown>) => {
    if (op === 'social.get') return { status: 200, body: { me: { ...me, av: { ...me.av } }, friends: [], requests: { in: [], out: [] }, blocks: [], invites: [], rev: 'r1' } };
    if (op === 'social.pulse') return { status: 204 };
    if (op === 'board.get') {
      if (args.kind === 'local')
        return {
          status: 200,
          body: {
            period: 's1',
            page: 0,
            pages: 1,
            local: { cc: 'LT', hidden: false },
            rows: [
              { rank: 1, name: 'Irvidas', value: 120, tier: 'Alley I', cc: 'LT' },
              { rank: 2, name: 'Zygis', value: 40, tier: 'Alley II', cc: 'LT', me: true },
            ],
            me: { rank: 2, value: 40, tier: 'Alley II', name: 'Zygis', cc: 'LT' },
          },
        };
      return {
        status: 200,
        body: {
          period: '2026-W47',
          page: 0,
          pages: 1,
          rows: [
            { rank: 1, name: 'Mira', value: 9, cc: 'LV' },
            { rank: 2, name: 'Sunny Pudding', value: 5 },
          ],
          me: { rank: 14, value: 1, name: 'Zygis', cc: 'LT' },
        },
      };
    }
    return { status: 200, body: {} };
  };
}

async function home(context: import('@playwright/test').BrowserContext, page: import('@playwright/test').Page, baseURL: string): Promise<Frame> {
  await context.exposeFunction('plApi', fakeServer());
  await mockHost(context, baseURL, {
    app: { isApp: false, store: true },
    signedIn: true,
    liveApi: true,
    profile: { v: 1, sessions: 3, matches: 5, wins: 2, firstWinDone: true, hero: 'sage', trick: 'hiss', difficulty: 'easy', veteran: true },
  });
  return openHost(page);
}

type Box = { x: number; y: number; width: number; height: number };
const overlaps = (a: Box, b: Box): boolean => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

async function boxes(list: Locator): Promise<Box[]> {
  const out: Box[] = [];
  for (const el of await list.all()) {
    if (!(await el.isVisible())) continue;
    const b = await el.boundingBox();
    if (b) out.push(b);
  }
  return out;
}

async function checkPlacement(game: Frame, name: string): Promise<void> {
  const btn = game.locator('[data-testid="home-boards"]');
  await expect(btn).toBeVisible();
  const c = (await btn.boundingBox())!;
  // a 44 px touch target, inside the screen, right under # Join in the left stack
  expect(c.height).toBeGreaterThanOrEqual(44);
  const [vw, vh] = await game.evaluate(() => [window.innerWidth, window.innerHeight]);
  expect(c.x).toBeGreaterThanOrEqual(0);
  expect(c.y + c.height).toBeLessThanOrEqual(vh + 0.5);
  expect(c.x + c.width).toBeLessThanOrEqual(vw + 0.5);
  const join = (await game.locator('[data-testid="join-code"]').boundingBox())!;
  expect(Math.abs(join.x - c.x), `${name}: Boards lines up with Join`).toBeLessThanOrEqual(1);
  expect(c.y, `${name}: Boards under Join`).toBeGreaterThan(join.y + join.height - 0.5);
  const others = [
    ...(await boxes(game.locator('.hm-corner .hm-icon, .hm-corner > *'))),
    ...(await boxes(game.locator('.hm-playc .hm-play, .hm-playc .hm-alt'))),
    ...(await boxes(game.locator('.hm-top, .hm-nav, .hm-promo'))),
  ];
  for (const o of others) expect(overlaps(c, o), `${name}: Boards overlaps ${JSON.stringify(o)}`).toBe(false);
}

test('Home Boards: one tap opens the leaderboards window; Local shows my country, my row once', async ({ context, page, baseURL }, info) => {
  const game = await home(context, page, baseURL!);
  const btn = game.locator('[data-testid="home-boards"]');
  await expect(btn).toBeVisible({ timeout: limit(60_000) });
  await expect(game.locator('[data-testid="home-leaderboard"], .hm-lb')).toHaveCount(0);
  // let the entrance settle before measuring
  await page.waitForTimeout(800);
  await checkPlacement(game, info.project.name);
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `home-boards-${info.project.name}.png`) });
  await btn.click();
  const modal = game.locator('[data-testid="boards-modal"]');
  await expect(modal).toBeVisible();
  await expect(modal.locator('[role="dialog"][aria-modal="true"]')).toHaveAccessibleName('Leaderboards');
  // the friends panel does not open: the boards are their own window
  await expect(game.locator('.pl-social')).toHaveCount(0);
  // straight on Weekly: no extra step
  await expect(modal.locator('[data-board="weekly"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(modal.locator('.pl-bd:not(.pin)')).toHaveCount(2);
  // off the page: one pinned row in the row style (name, flag, metric)
  const pin = modal.locator('[data-testid="board-pinned"]');
  await expect(pin).toHaveCount(1);
  await expect(pin).toContainText('#14');
  await expect(pin).toContainText('1 wins');
  // the dialog fits the screen with its gutters, and every board fits its button
  const d = (await modal.locator('.pl-boards').boundingBox())!;
  const [vw, vh] = await game.evaluate(() => [window.innerWidth, window.innerHeight]);
  expect(d.x).toBeGreaterThanOrEqual(15.5);
  expect(d.x + d.width).toBeLessThanOrEqual(vw - 15.5);
  expect(d.y + d.height).toBeLessThanOrEqual(vh + 0.5);
  for (const t of await modal.locator('.pl-boards-sub .pl-btn').all()) expect(await t.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  if (SHOTS) {
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(SHOTS, `boards-weekly-${info.project.name}.png`) });
  }
  await modal.locator('[data-board="local"]').click();
  await expect(modal.locator('[data-testid="board-local-head"]')).toContainText('Lithuania');
  await expect(modal.locator('.pl-bd')).toHaveCount(2);
  await expect(modal.locator('.pl-bd.me')).toHaveCount(1);
  await expect(modal.locator('[data-testid="board-pinned"]')).toHaveCount(0);
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `boards-local-${info.project.name}.png`) });
  const reqs = (await received(page)).filter((m: any) => m.type === 'api-request' && m.op === 'board.get');
  expect(reqs.map((r: any) => r.args.kind)).toEqual(['weekly', 'local']);
  // Esc closes it (focus back on Boards); reopening remembers Local
  await page.keyboard.press('Escape');
  await expect(modal).toHaveCount(0);
  if (!info.project.use.hasTouch) await expect(btn).toBeFocused();
  await btn.click();
  await expect(game.locator('[data-testid="boards-modal"] [data-board="local"]')).toHaveAttribute('aria-pressed', 'true');
  await game.locator('.pl-boards-scrim').click({ position: { x: 4, y: 4 } });
  await expect(game.locator('[data-testid="boards-modal"]')).toHaveCount(0);
  // the friends panel has no Recent tab, no Compact list and no leaderboards
  await game.locator('[data-testid="lobby-social"]').click();
  const sheet = game.locator('.pl-social');
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('[role="tab"]')).toHaveText(['Friends', 'Clubs']);
  await sheet.locator('[data-a="tabs-more"]').click();
  await expect(sheet.locator('.pl-social-moremenu [data-tab="boards"], [data-testid="social-density"]')).toHaveCount(0);
});

test('Home avatar = my avatar: the same picture as Profile and the friends list, updated live', async ({ context, page, baseURL }, info) => {
  const game = await home(context, page, baseURL!);
  const av = game.locator('[data-testid="home-avatar"]');
  // the Home hero is Sage; my avatar (the server's, picked in Profile) is Nova: Home shows Nova
  await expect(av).toHaveAttribute('data-av', 'h:nova', { timeout: limit(60_000) });
  expect(await av.locator('.hm-av-in').evaluate((el) => getComputedStyle(el).backgroundImage)).toMatch(/nova/i);
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `home-avatar-${info.project.name}.png`) });
  // changed elsewhere (another device, Profile): the next answer that carries it redraws Home in place
  me.av = { i: 'h:clem' };
  await game.locator('[data-testid="lobby-social"]').click();
  await expect(game.locator('.pl-social')).toBeVisible();
  await expect(av).toHaveAttribute('data-av', 'h:clem');
  // no self card in the friends panel: my name and "Online" are not repeated there
  await expect(game.locator('.pl-social-head')).not.toContainText('Zygis');
  if (SHOTS) {
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(SHOTS, `social-${info.project.name}.png`) });
  }
  me.av = { i: 'h:nova' };
});

test('Home Boards: clear of the profile, nav, PLAY and the corner icons at every size', async ({ context, page, baseURL }, info) => {
  test.skip(info.project.name !== 'desktop', 'sizes are set here');
  const game = await home(context, page, baseURL!);
  await expect(game.locator('[data-testid="home-boards"]')).toBeVisible({ timeout: limit(60_000) });
  for (const [w, h] of [
    [1440, 900],
    [1920, 1080],
    [844, 390],
    [667, 375],
    [390, 844],
  ] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(600);
    await checkPlacement(game, `${w}x${h}`);
    if (SHOTS) await page.screenshot({ path: join(SHOTS, `home-boards-${w}x${h}.png`) });
    await game.locator('[data-testid="home-boards"]').click();
    const d = (await game.locator('.pl-boards').boundingBox())!;
    expect(d.x, `${w}x${h} dialog gutter`).toBeGreaterThanOrEqual(15.5);
    expect(d.x + d.width, `${w}x${h} dialog gutter`).toBeLessThanOrEqual(w - 15.5);
    expect(d.y + d.height, `${w}x${h} dialog inside`).toBeLessThanOrEqual(h + 0.5);
    if (SHOTS) await page.screenshot({ path: join(SHOTS, `boards-${w}x${h}.png`) });
    await page.keyboard.press('Escape');
    await expect(game.locator('[data-testid="boards-modal"]')).toHaveCount(0);
  }
});
