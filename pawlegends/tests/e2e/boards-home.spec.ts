import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Frame, type Locator } from '@playwright/test';
import { mockHost, openHost, received } from './host';
import { limit } from '../unit/cpu-budget';

/*
 * Founder Nov 19: the leaderboards are their own window, opened from Boards in Home's left stack right under # Join
 * (the one way in: no Leaderboard pill by the promo, no Boards tab in the friends panel). Founder Nov 20: its tabs are
 * Level (top by account level), Country (my country, from my flag), Cats vs Dogs (total wins, a tug-of-war bar) and
 * Ranked (this season's ladder); Level by default, my own row once, the last tab remembered. And Home's avatar is my
 * avatar: the same picture Profile and the friends list draw, updated live. Desktop and the 844x390 touch phone; at
 * 1440x900, 1920x1080, 844x390, 667x375 and 390x844 the stack overlaps neither the profile, the nav, PLAY nor the
 * corner, and every tab fits the dialog (no sideways clip, 44 px tabs, 14 px text). Screenshots to
 * ~/Downloads/paw-legends/boards/ when LB_SHOTS=1 (or SHOTS_DIR).
 */
test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop' && info.project.name !== 'landscape', 'desktop and landscape only'));

const SHOTS = process.env.SHOTS_DIR ?? (process.env.LB_SHOTS === '1' ? join(homedir(), 'Downloads', 'paw-legends', 'boards') : null);
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const me = { code: 'PL-7KQ2-M9XR', name: 'Zygis', invisible: false, allowRecent: true, ageBand: '18+', av: { i: 'h:nova' } as { i: string } };

const LEVEL_ROWS = [
  { rank: 1, name: 'Mira', value: 21, m: 120, cc: 'LV', av: { i: 'h:sage' } },
  { rank: 2, name: 'Sunny Pudding', value: 18, m: 92, av: { i: 'h:howler' } },
  { rank: 3, name: 'Irvidas', value: 15, m: 61, cc: 'LT', av: { i: 'h:clem' } },
  { rank: 4, name: 'Captain Whiskerton', value: 12, m: 43, cc: 'GB' },
  { rank: 5, name: 'Bea', value: 9, m: 25, cc: 'US', av: { i: 'h:chili' } },
  { rank: 6, name: 'Noodle', value: 7, m: 13 },
];

function fakeServer() {
  return async (op: string, args: Record<string, unknown>) => {
    if (op === 'social.get') return { status: 200, body: { me: { ...me, av: { ...me.av } }, friends: [], requests: { in: [], out: [] }, blocks: [], invites: [], rev: 'r1' } };
    if (op === 'social.pulse') return { status: 204 };
    if (op === 'board.get') {
      if (args.kind === 'country')
        return {
          status: 200,
          body: {
            period: 'all',
            page: 0,
            pages: 1,
            local: { cc: 'LT', hidden: false },
            rows: [
              { rank: 1, name: 'Irvidas', value: 15, m: 61, cc: 'LT', av: { i: 'h:clem' } },
              { rank: 2, name: 'Zygis', value: 6, m: 12, cc: 'LT', me: true, av: { i: 'h:nova' } },
            ],
            me: { rank: 2, value: 6, m: 12, name: 'Zygis', cc: 'LT' },
          },
        };
      if (args.kind === 'sides')
        return {
          status: 200,
          body: {
            season: { id: 's1', name: 'Season 1', cat: 12840, dog: 11872 },
            all: { cat: 40211, dog: 43902 },
            week: { id: '2026-W47', cat: 1630, dog: 1402 },
            lastWeek: { id: '2026-W46', cat: 1490, dog: 1420 },
            mine: { cat: 12, dog: 4 },
          },
        };
      if (args.kind === 'global')
        return {
          status: 200,
          body: {
            period: 's1',
            page: 0,
            pages: 13,
            rows: [
              { rank: 1, name: 'Mira', value: 412, tier: 'Legend', cc: 'LV', av: { i: 'h:sage' } },
              { rank: 2, name: 'Sunny Pudding', value: 1240, tier: 'Alley I', av: { i: 'h:howler' } },
              { rank: 3, name: 'Irvidas', value: 880, tier: 'Alley II', cc: 'LT' },
            ],
            me: { rank: 57, value: 40, tier: 'Kitten II', name: 'Zygis', cc: 'LT' },
          },
        };
      return { status: 200, body: { period: 'all', page: 0, pages: 5, rows: LEVEL_ROWS, me: { rank: 14, value: 6, m: 12, name: 'Zygis', cc: 'LT' } } };
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

/** The dialog fits the screen with its gutters; nothing in it is clipped sideways; text is 14 px or more. */
async function checkDialog(game: Frame, name: string): Promise<void> {
  const modal = game.locator('[data-testid="boards-modal"]');
  const d = (await modal.locator('.pl-boards').boundingBox())!;
  const [vw, vh] = await game.evaluate(() => [window.innerWidth, window.innerHeight]);
  expect(d.x, `${name}: dialog gutter`).toBeGreaterThanOrEqual(15.5);
  expect(d.x + d.width, `${name}: dialog gutter`).toBeLessThanOrEqual(vw - 15.5);
  expect(d.y + d.height, `${name}: dialog inside`).toBeLessThanOrEqual(vh + 0.5);
  for (const t of await modal.locator('.pl-boards-sub .pl-btn').all()) {
    expect(await t.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), `${name}: tab label fits`).toBe(true);
    expect((await t.boundingBox())!.height, `${name}: 44 px tab`).toBeGreaterThanOrEqual(43.5);
  }
  const bad = await modal.evaluate((root) => {
    const out: string[] = [];
    const body = root.querySelector('.pl-boards-body') as HTMLElement;
    if (body.scrollWidth > body.clientWidth + 1) out.push(`body scrolls sideways ${body.scrollWidth}>${body.clientWidth}`);
    for (const el of root.querySelectorAll<HTMLElement>('.pl-boards-body *')) {
      if (!el.childNodes.length || ![...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? '').trim())) continue;
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs < 13.5 && !el.closest('.pl-bd-you, .pl-cc')) out.push(`${el.className || el.tagName} ${fs}px`);
    }
    return out;
  });
  expect(bad, `${name}: no clipping, readable text`).toEqual([]);
}

test('Home Boards: Level, Country, Cats vs Dogs and Ranked, my row once, the last tab remembered', async ({ context, page, baseURL }, info) => {
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
  await expect(modal.locator('.pl-boards-sub .pl-btn')).toHaveText(['Level', 'Country', 'Cats vs Dogs', 'Ranked']);
  // straight on Level: no extra step
  await expect(modal.locator('[data-board="level"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(modal.locator('.pl-bd:not(.pin)')).toHaveCount(LEVEL_ROWS.length);
  await expect(modal.locator('.pl-bd').first().locator('.pl-bd-metric')).toContainText('Lv 21');
  // off the page: one pinned row in the row style (name, flag, level)
  const pin = modal.locator('[data-testid="board-pinned"]');
  await expect(pin).toHaveCount(1);
  await expect(pin).toContainText('#14');
  await expect(pin).toContainText('Lv 6');
  await checkDialog(game, `${info.project.name} level`);
  if (SHOTS) {
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(SHOTS, `boards-level-${info.project.name}.png`) });
  }
  await modal.locator('[data-board="country"]').click();
  await expect(modal.locator('[data-testid="board-country-head"]')).toContainText('Lithuania');
  await expect(modal.locator('.pl-bd')).toHaveCount(2);
  await expect(modal.locator('.pl-bd.me')).toHaveCount(1);
  await expect(modal.locator('[data-testid="board-pinned"]')).toHaveCount(0);
  await checkDialog(game, `${info.project.name} country`);
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `boards-country-${info.project.name}.png`) });
  await modal.locator('[data-board="sides"]').click();
  await expect(modal.locator('[data-testid="cvd-lead"]')).toHaveText('CATS LEAD by 4%');
  await expect(modal.locator('[data-n="cat"]')).toHaveText('12,840', { timeout: limit(5_000) });
  await expect(modal.locator('[data-n="dog"]')).toHaveText('11,872');
  await expect(modal.locator('[data-testid="cvd-trend"]')).toContainText('This week: Cats 54%');
  await expect(modal.locator('[data-testid="cvd-mine"]')).toContainText('12 as a cat, 4 as a dog');
  // the bolt sits at the split: 52% across the bar
  const bar = (await modal.locator('.pl-cvd-bar').boundingBox())!;
  await page.waitForTimeout(1000);
  const bolt = (await modal.locator('.pl-cvd-bolt').boundingBox())!;
  expect(Math.abs(bolt.x + bolt.width / 2 - (bar.x + bar.width * (12840 / (12840 + 11872))))).toBeLessThanOrEqual(4);
  await checkDialog(game, `${info.project.name} sides`);
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `boards-sides-${info.project.name}.png`) });
  await modal.locator('[data-range="all"]').click();
  await expect(modal.locator('[data-testid="cvd-lead"]')).toHaveText('DOGS LEAD by 4%');
  await expect(modal.locator('[data-n="dog"]')).toHaveText('43,902', { timeout: limit(5_000) });
  if (SHOTS) {
    await page.waitForTimeout(800);
    await page.screenshot({ path: join(SHOTS, `boards-sides-all-${info.project.name}.png`) });
  }
  await modal.locator('[data-board="ranked"]').click();
  await expect(modal.locator('.pl-bd:not(.pin)')).toHaveCount(3);
  await expect(modal.locator('.pl-bd').first().locator('.pl-bd-metric')).toContainText('Legend');
  await expect(modal.locator('[data-testid="board-pinned"]')).toContainText('Kitten II');
  await checkDialog(game, `${info.project.name} ranked`);
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `boards-ranked-${info.project.name}.png`) });
  const reqs = (await received(page)).filter((m: any) => m.type === 'api-request' && m.op === 'board.get');
  expect(reqs.map((r: any) => r.args.kind)).toEqual(['level', 'country', 'sides', 'global']);
  // Esc closes it (focus back on Boards); reopening remembers Ranked
  await page.keyboard.press('Escape');
  await expect(modal).toHaveCount(0);
  if (!info.project.use.hasTouch) await expect(btn).toBeFocused();
  await btn.click();
  await expect(game.locator('[data-testid="boards-modal"] [data-board="ranked"]')).toHaveAttribute('aria-pressed', 'true');
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

test('Home Boards: clear of the profile, nav, PLAY and the corner icons; every tab fits at every size', async ({ context, page, baseURL }) => {
  test.skip(test.info().project.name !== 'desktop', 'sizes are set here');
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
    const modal = game.locator('[data-testid="boards-modal"]');
    for (const tab of ['level', 'country', 'sides', 'ranked'] as const) {
      await modal.locator(`[data-board="${tab}"]`).click();
      await expect(modal.locator(tab === 'sides' ? '[data-testid="cvd"]' : '.pl-bd').first()).toBeVisible();
      await page.waitForTimeout(tab === 'sides' ? 1300 : 300);
      await checkDialog(game, `${w}x${h} ${tab}`);
      if (SHOTS) await page.screenshot({ path: join(SHOTS, `boards-${tab}-${w}x${h}.png`) });
    }
    await page.keyboard.press('Escape');
    await expect(game.locator('[data-testid="boards-modal"]')).toHaveCount(0);
  }
});
