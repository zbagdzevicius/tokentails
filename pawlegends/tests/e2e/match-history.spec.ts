import { expect, test, type Frame, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mockHost, openHost, received } from './host';

/*
 * Match history (docs/plans/moba/MATCH-HISTORY.md): a signed-in player opens Profile → Match history, sees this
 * season's numbers, filters by mode, opens a match (both teams' scoreboard, the Damage graph) and sets who can see the
 * history; a friend's history opens from their row in Social. Every call goes through the host (`api-request`), and
 * the sheet fits without horizontal scroll at 1440x900, 1280x590, 844x390 and 667x375.
 */
test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop' && info.project.name !== 'landscape', 'desktop and landscape only'));

const SHOTS = process.env.PL_SHOTS ?? join(homedir(), 'Downloads/paw-legends/s7/history');

const ID1 = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const ID2 = 'aaaaaaaaaaaaaaaaaaaaaaa2';
const at = Date.now() - 3_600_000;
const rows = [
  { id: ID1, at, mode: 'ranked', map: 'crossing', mutator: null, difficulty: 'normal', outcome: 'won', seconds: 754, hero: 'sage', k: 7, d: 2, a: 9, grade: 'S', mvp: 'mvp' },
  { id: ID2, at: at - 86_400_000, mode: 'blitz', map: 'crossing', mutator: 'blitz', difficulty: 'easy', outcome: 'lost', seconds: 420, hero: 'clem', k: 2, d: 5, a: 3, grade: 'B', mvp: null },
];
const page1 = {
  owner: { name: 'Witty Biscuit', self: true },
  rows,
  next: null,
  stats: { season: 's1', name: 'Season 1', matches: 24, wins: 14, winRate: 58, kda: 3.4, mvp: 5, favourites: [{ hero: 'sage', matches: 12, wins: 8, winRate: 67 }, { hero: 'clem', matches: 7, wins: 3, winRate: 43 }] },
  visibility: 'friends',
};
const seat = (slot: number, team: 0 | 1, hero: string, extra: Record<string, unknown> = {}) => ({
  slot, team, hero, name: null, bot: true, owner: false, level: 9, k: 3, d: 3, a: 4, damage: 8_200 + slot * 900, taken: 9_000 - slot * 500, tower: 1200, heal: 0, fish: 6_400, toys: 3, cs: 42, grade: 'A', ...extra,
});
const match1 = {
  ...rows[0],
  slot: 0,
  winner: 0,
  mvpSlot: 0,
  svpSlot: 4,
  reason: 'core',
  players: [
    seat(0, 0, 'sage', { name: 'Witty Biscuit', bot: false, owner: true, level: 12, k: 7, d: 2, a: 9, grade: 'S' }),
    seat(1, 0, 'pixel', { name: 'Mira', bot: false }),
    seat(2, 0, 'lambo'),
    seat(3, 1, 'meatball'),
    seat(4, 1, 'brutus', { grade: 'S' }),
    seat(5, 1, 'chili'),
  ],
};
const social = {
  me: { code: 'PL-7KQ2-M9XR', name: 'Witty Biscuit', invisible: false, allowRecent: true, ageBand: '18+' },
  friends: [{ code: 'PL-AAAA-AAAA', name: 'Mira', presence: { state: 'offline' } }],
  requests: { in: [], out: [] },
  blocks: [],
  invites: [],
  rev: 'r1',
};

async function noSideScroll(game: Frame): Promise<void> {
  const over = await game.evaluate(() => {
    const out: string[] = [];
    const vw = document.documentElement.clientWidth;
    for (const el of document.querySelectorAll<HTMLElement>('[data-testid="match-history"] *')) {
      const r = el.getBoundingClientRect();
      if (r.width && (r.right > vw + 1 || r.left < -1)) out.push(`${el.className || el.tagName}:${Math.round(r.left)}-${Math.round(r.right)}`);
    }
    const card = document.querySelector<HTMLElement>('.mh-card');
    if (card && card.scrollWidth > card.clientWidth + 1) out.push(`card scrollWidth ${card.scrollWidth} > ${card.clientWidth}`);
    return out;
  });
  expect(over).toEqual([]);
}

async function shot(page: Page, name: string): Promise<void> {
  mkdirSync(SHOTS, { recursive: true });
  const v = page.viewportSize();
  await page.screenshot({ path: join(SHOTS, `${name}-${v?.width}x${v?.height}.png`) });
}

test('Match history: season stats, filters, a match scoreboard and damage, privacy, a friend', async ({ context, page, baseURL }, info) => {
  const touch = info.project.name === 'landscape';
  await mockHost(context, baseURL!, {
    app: { isApp: false, store: true },
    signedIn: true,
    profile: { v: 1, sessions: 3, matches: 5, wins: 2, firstWinDone: true, hero: 'sage', trick: 'hiss', difficulty: 'easy', veteran: true },
    api: {
      'history.list': { status: 200, body: page1 },
      'history.match': { status: 200, body: match1 },
      'history.privacy': { status: 200, body: { visibility: 'everyone' } },
      'social.get': { status: 200, body: social },
      'social.pulse': { status: 204 },
    },
  });
  const game = await openHost(page);
  const press = async (sel: string) => (touch ? game.locator(sel).first().tap() : game.locator(sel).first().click());
  await expect(game.locator('[data-testid="home-profile"]')).toBeVisible({ timeout: 60_000 });
  await press('[data-testid="home-profile"]');
  await press('[data-testid="open-history"]');
  const hist = game.locator('[data-testid="match-history"]');
  await expect(hist).toBeVisible();
  await expect(hist.locator('[data-testid="history-winrate"]')).toHaveText('58%');
  await expect(hist.locator('.mh-row')).toHaveCount(2);
  await expect(hist.locator('.mh-row').first()).toContainText('Victory');
  await expect(hist.locator('.mh-row').first()).toContainText('Ranked 3v3');
  await expect(hist.locator('.mh-row').first().locator('.mh-mvp')).toHaveText('MVP');
  await expect(hist.locator('[data-testid="history-privacy"]')).toHaveValue('friends');

  const views: [number, number][] = touch ? [[844, 390], [667, 375]] : [[1440, 900], [1280, 590]];
  for (const [w, h] of views) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(150);
    await noSideScroll(game);
    await shot(page, 'list');
  }

  // a filter chip asks the server for that mode
  await press('.mh-chip[data-filter="blitz"]');
  await expect.poll(async () => (await received(page)).some((m: any) => m.type === 'api-request' && m.op === 'history.list' && m.args?.mode === 'blitz')).toBe(true);
  await press('.mh-chip[data-filter="all"]');
  await expect(hist.locator('.mh-row')).toHaveCount(2);

  // the match: both teams, MVP, the damage graph
  await press(`.mh-row[data-open="${ID1}"]`);
  const detail = hist.locator('[data-testid="history-match"]');
  await expect(detail).toBeVisible();
  await expect(detail.locator('.mh-team')).toHaveCount(2);
  await expect(detail.locator('.mh-team').first()).toContainText('Your team');
  await expect(detail.locator('tr.me')).toContainText('You');
  await expect(detail.locator('.mh-bot').first()).toBeVisible();
  await expect(detail.locator('.mh-mvpline')).toContainText('Witty Biscuit');
  for (const [w, h] of views) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(150);
    await noSideScroll(game);
    await shot(page, 'match');
  }
  await press('.mh-tab[data-tab="damage"]');
  await expect(detail.locator('[data-testid="history-damage"]')).toBeVisible();
  await expect(detail.locator('.mh-grow')).toHaveCount(6);
  await noSideScroll(game);
  await shot(page, 'damage');
  await press('[data-a="back"]');
  await expect(hist.locator('.mh-row')).toHaveCount(2);

  // who can see my match history
  await hist.locator('[data-testid="history-privacy"]').selectOption('everyone');
  await expect.poll(async () => (await received(page)).some((m: any) => m.type === 'api-request' && m.op === 'history.privacy' && m.args?.visibility === 'everyone')).toBe(true);
  await press('[data-a="close"]');
  await expect(hist).toHaveCount(0);

  // a friend's history from their row in Social
  await expect(game.locator('[data-testid="lobby-social"]')).toBeVisible({ timeout: 30_000 });
  await press('[data-testid="lobby-social"]');
  await press('.pl-social [data-a="history"][data-code="PL-AAAA-AAAA"]');
  await expect(hist).toBeVisible();
  await expect.poll(async () => (await received(page)).some((m: any) => m.type === 'api-request' && m.op === 'history.list' && m.args?.code === 'PL-AAAA-AAAA')).toBe(true);
  await expect(hist.locator('.mh-row')).toHaveCount(2);
  // a friend's rows never offer this device's replays
  await expect(hist.locator('.mh-watch')).toHaveCount(0);
  await noSideScroll(game);
  await shot(page, 'friend');

  const reqs = (await received(page)).filter((m: any) => m.type === 'api-request');
  for (const r of reqs as any[]) expect(JSON.stringify({ op: r.op, args: r.args })).not.toMatch(/https?:|accesstoken|fb[A-Za-z0-9]/);
});
