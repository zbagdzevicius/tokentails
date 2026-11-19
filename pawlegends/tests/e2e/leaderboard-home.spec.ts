import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Frame, type Locator } from '@playwright/test';
import { mockHost, openHost, received } from './host';
import { limit } from '../unit/cpu-budget';

/*
 * Founder Nov 19: a small Leaderboard chip under the Home promo opens the Boards in one tap, and the Boards gain a
 * Local sub-tab (players of my country, from my flag). Desktop and the 844x390 touch phone; at 1440x900, 1920x1080,
 * 667x375 and 390x844 the chip overlaps neither the promo, the PLAY cluster nor the top-right icons.
 * Screenshots to ~/Downloads/paw-legends/leaderboard-local/ when LB_SHOTS=1.
 */
test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop' && info.project.name !== 'landscape', 'desktop and landscape only'));

const SHOTS = process.env.LB_SHOTS === '1' ? join(homedir(), 'Downloads', 'paw-legends', 'leaderboard-local') : null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const me = { code: 'PL-7KQ2-M9XR', name: 'Zygis', invisible: false, allowRecent: true, ageBand: '18+' };

function fakeServer() {
  return async (op: string, args: Record<string, unknown>) => {
    if (op === 'social.get') return { status: 200, body: { me, friends: [], requests: { in: [], out: [] }, blocks: [], invites: [], rev: 'r1' } };
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
  const chip = game.locator('[data-testid="home-leaderboard"]');
  await expect(chip).toBeVisible();
  const c = (await chip.boundingBox())!;
  // a 44 px touch target, inside the screen
  expect(c.height).toBeGreaterThanOrEqual(44);
  const vw = await game.evaluate(() => window.innerWidth);
  expect(c.x + c.width).toBeLessThanOrEqual(vw + 0.5);
  const promo = game.locator('.hm-promo');
  if (await promo.isVisible()) {
    const p = (await promo.boundingBox())!;
    // right-aligned with the promo, under it, not over it
    expect(Math.abs(c.x + c.width - (p.x + p.width))).toBeLessThanOrEqual(1.5);
    expect(c.y).toBeGreaterThanOrEqual(p.y + p.height - 0.5);
  }
  const others = [
    ...(await boxes(game.locator('.hm-corner .hm-icon, .hm-corner > *'))),
    ...(await boxes(game.locator('.hm-playc .hm-play, .hm-playc .hm-alt'))),
    ...(await boxes(game.locator('.hm-top'))),
  ];
  for (const o of others) expect(overlaps(c, o), `${name}: chip overlaps ${JSON.stringify(o)}`).toBe(false);
}

test('Home Leaderboard chip: one tap opens the Boards; Local shows my country, my row once', async ({ context, page, baseURL }, info) => {
  const game = await home(context, page, baseURL!);
  const chip = game.locator('[data-testid="home-leaderboard"]');
  await expect(chip).toBeVisible({ timeout: limit(60_000) });
  // let the entrance settle before measuring
  await page.waitForTimeout(800);
  await checkPlacement(game, info.project.name);
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `home-chip-${info.project.name}.png`) });
  await chip.click();
  const sheet = game.locator('.pl-social');
  await expect(sheet).toBeVisible();
  // straight on Boards (Weekly by default): no extra step
  await expect(sheet.locator('[data-board="weekly"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(sheet.locator('.pl-bd:not(.pin)')).toHaveCount(2);
  // off the page: one pinned row in the row style (name, flag, metric)
  const pin = sheet.locator('[data-testid="board-pinned"]');
  await expect(pin).toHaveCount(1);
  await expect(pin).toContainText('#14');
  await expect(pin).toContainText('1 wins');
  if (SHOTS) {
    await page.waitForTimeout(500); // the panel's slide-in
    await page.screenshot({ path: join(SHOTS, `boards-weekly-${info.project.name}.png`) });
  }
  await sheet.locator('[data-board="local"]').click();
  await expect(sheet.locator('[data-testid="board-local-head"]')).toContainText('Lithuania');
  await expect(sheet.locator('.pl-bd')).toHaveCount(2);
  await expect(sheet.locator('.pl-bd.me')).toHaveCount(1);
  await expect(sheet.locator('[data-testid="board-pinned"]')).toHaveCount(0);
  // every sub-tab fits on one line, none cut
  for (const t of await sheet.locator('.pl-social-sub .pl-btn').all()) expect(await t.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `boards-local-${info.project.name}.png`) });
  const reqs = (await received(page)).filter((m: any) => m.type === 'api-request' && m.op === 'board.get');
  expect(reqs.map((r: any) => r.args.kind)).toEqual(['weekly', 'local']);
  // close and reopen from Home: the Boards remember Local
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await chip.click();
  await expect(game.locator('.pl-social [data-board="local"]')).toHaveAttribute('aria-pressed', 'true');
});

test('Home Leaderboard chip: clear of the promo, PLAY and the corner icons at every size', async ({ context, page, baseURL }, info) => {
  test.skip(info.project.name !== 'desktop', 'sizes are set here');
  const game = await home(context, page, baseURL!);
  await expect(game.locator('[data-testid="home-leaderboard"]')).toBeVisible({ timeout: limit(60_000) });
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
    if (SHOTS) await page.screenshot({ path: join(SHOTS, `home-chip-${w}x${h}.png`) });
  }
});
