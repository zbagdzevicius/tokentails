import { expect, test, type Frame, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mockHost, openHost, received } from './host';
import { limit } from '../unit/cpu-budget';

/*
 * Match history (docs/plans/moba/MATCH-HISTORY.md): a signed-in player opens Profile → Match history, sees this
 * season's numbers, every match (no mode chips), opens a match (both teams' scoreboard, the Damage graph) and sets who can see the
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
    for (const el of document.querySelectorAll<HTMLElement>('[data-testid="match-history"] *, [data-testid="profile-screen"] .pfx-main *')) {
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

test('Match history: season stats, every match, a match scoreboard and damage, public (no privacy toggle), a friend', async ({ context, page, baseURL }, info) => {
  const touch = info.project.name === 'landscape';
  await mockHost(context, baseURL!, {
    app: { isApp: false, store: true },
    signedIn: true,
    profile: { v: 1, sessions: 3, matches: 5, wins: 2, firstWinDone: true, hero: 'sage', trick: 'hiss', difficulty: 'easy', veteran: true },
    api: {
      'history.list': { status: 200, body: page1 },
      'history.match': { status: 200, body: match1 },
      'social.get': { status: 200, body: social },
      'social.pulse': { status: 204 },
    },
  });
  const game = await openHost(page);
  const press = async (sel: string) => (touch ? game.locator(sel).first().tap() : game.locator(sel).first().click());
  await expect(game.locator('[data-testid="home-profile"]')).toBeVisible({ timeout: limit(60_000) });
  await press('[data-testid="home-profile"]');
  // Profile → Matches: the history inline; a row opens its match inside the Profile (LoL), Back shows the list again
  await press('[data-testid="open-history"]');
  const prof = game.locator('[data-testid="profile-screen"]');
  const rows = prof.locator('[data-testid="profile-match-list"] [data-a="match"]');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText('Victory');
  await expect(rows.first()).toContainText('Ranked');
  // founder Nov 17: match history is public, so there is no privacy toggle
  await expect(prof.locator('[data-testid="history-privacy"], select')).toHaveCount(0);

  const views: [number, number][] = touch ? [[844, 390], [667, 375]] : [[1440, 900], [1280, 590]];
  for (const [w, h] of views) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(150);
    await noSideScroll(game);
    await shot(page, 'list');
  }

  // founder Nov 19: no mode filter chips, every match is listed
  await expect(prof.locator('.pfx-filter')).toHaveCount(0);
  await expect(rows).toHaveCount(2);

  // the match: both teams, MVP, the damage graph, in the Profile (no sheet over Home)
  await press(`[data-testid="profile-match-list"] [data-a="match"][data-id="${ID1}"]`);
  const detail = prof.locator('[data-testid="history-match"]');
  await expect(detail).toBeVisible();
  await expect(game.locator('[data-testid="match-history"]')).toHaveCount(0);
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
  await press('.mh-back');
  await expect(rows).toHaveCount(2);
  await expect(prof).toHaveAttribute('data-tab', 'matches');

  // no privacy op is ever sent
  expect((await received(page)).some((m: any) => m.type === 'api-request' && m.op === 'history.privacy')).toBe(false);
  await press('[data-testid="profile-back"]');
  await expect(prof).toHaveCount(0);

  // a friend's history: their row on Home's friends panel opens their Player Card (PLAYER-CARD.md); Matches is one tab
  // away; a row opens that match there
  await expect(game.locator('[data-testid="home-friend"][data-code="PL-AAAA-AAAA"]')).toBeVisible({ timeout: limit(30_000) });
  await press('[data-testid="home-friend"][data-code="PL-AAAA-AAAA"] .fr-main');
  await expect.poll(async () => (await received(page)).some((m: any) => m.type === 'api-request' && m.op === 'history.list' && m.args?.code === 'PL-AAAA-AAAA')).toBe(true);
  await expect(prof).toHaveAttribute('data-tab', 'overview');
  await press('[data-testid="profile-tab-matches"]');
  await expect(rows).toHaveCount(2);
  await press('[data-testid="profile-match-list"] [data-a="match"]');
  await expect(detail).toBeVisible();
  // a friend's matches never offer this device's replays
  await expect(prof.locator('.mh-watch')).toHaveCount(0);
  await noSideScroll(game);
  await shot(page, 'friend');

  const reqs = (await received(page)).filter((m: any) => m.type === 'api-request');
  for (const r of reqs as any[]) expect(JSON.stringify({ op: r.op, args: r.args })).not.toMatch(/https?:|accesstoken|fb[A-Za-z0-9]/);
});
