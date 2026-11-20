import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Frame, type Page } from '@playwright/test';
import { mockHost, openHost, received } from './host';
import { limit } from '../unit/cpu-budget';

/*
 * The Player Card (docs/plans/moba/PLAYER-CARD.md; a player: "on these leaderboards, tap a nickname to see the
 * player's profile, their stats, and add them as a friend right away"; the founder: "even from match history").
 * - Boards: a name opens that player's card over the window (the window stays under it); Add friend in one tap reads
 *   Request sent; Esc closes the card and leaves the window open; my own row opens my own profile.
 * - Match history: a human's name in a match's scoreboard opens their card; a bot's row is plain text.
 * Fits 1440x900 and 844x390 without sideways scroll. Screenshots to PLAYER_CARD_SHOTS (or SHOTS_DIR) when set.
 */
test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop' && info.project.name !== 'landscape', 'desktop and landscape only'));

const SHOTS = process.env.PLAYER_CARD_SHOTS ?? process.env.SHOTS_DIR ?? null;

const me = { code: 'PL-7KQ2-M9XR', name: 'Zygis', invisible: false, allowRecent: true, ageBand: '18+', av: { i: 'h:nova' } };
const MATCH = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const at = Date.now() - 3_600_000;

const LEVEL = {
  period: 'all',
  page: 0,
  pages: 1,
  rows: [
    { rank: 1, name: 'Mira', value: 21, m: 120, cc: 'LV', av: { i: 'h:sage' }, code: 'PL-MIRA-0001' },
    { rank: 2, name: 'Sunny Pudding', value: 18, m: 92, av: { i: 'h:howler' }, code: 'PL-SUNN-0002' },
    { rank: 3, name: 'Irvidas', value: 15, m: 61, cc: 'LT', av: { i: 'h:clem' }, code: 'PL-IRVI-0003' },
  ],
  me: { rank: 14, value: 6, m: 12, name: 'Zygis', cc: 'LT' },
};

const seat = (slot: number, team: 0 | 1, hero: string, extra: Record<string, unknown> = {}) => ({
  slot, team, hero, name: null, bot: true, owner: false, level: 9, k: 3, d: 3, a: 4, damage: 8_200 + slot * 900, taken: 9_000 - slot * 500, tower: 1200, heal: 0, fish: 6_400, toys: 3, cs: 42, grade: 'A', ...extra,
});
const row = { id: MATCH, at, mode: 'ranked', map: 'crossing', mutator: null, difficulty: 'normal', outcome: 'won', seconds: 754, hero: 'sage', k: 7, d: 2, a: 9, grade: 'S', mvp: 'mvp' };
const match = {
  ...row,
  slot: 0,
  winner: 0,
  mvpSlot: 0,
  svpSlot: 4,
  reason: 'core',
  players: [
    seat(0, 0, 'sage', { name: 'Mira', bot: false, owner: true, level: 12, k: 7, d: 2, a: 9, grade: 'S' }),
    seat(1, 0, 'pixel', { name: 'Rex', bot: false, code: 'PL-REXX-0004' }),
    seat(2, 0, 'lambo'),
    seat(3, 1, 'meatball'),
    seat(4, 1, 'brutus', { grade: 'S' }),
    seat(5, 1, 'chili'),
  ],
};
const stats = { season: 's1', name: 'Season 1', matches: 120, wins: 70, winRate: 58, kda: 3.4, k: 6, d: 3, a: 7, mvp: 21, favourites: [{ hero: 'sage', matches: 60, wins: 38, winRate: 63 }, { hero: 'pixel', matches: 30, wins: 16, winRate: 53 }] };
const card = (rel: string, online: boolean) => ({ matches: 120, ranked: { placementsLeft: 0, placementsOf: 5, tierIdx: 7, tier: 'alley', label: 'Alley II', points: 40, peak: 'Alley I' }, av: { i: 'h:sage', f: 'frame.store.goldpaw' }, cc: 'LV', rel, online });

function fakeServer() {
  const sent: string[] = [];
  return async (op: string, args: Record<string, unknown>) => {
    if (op === 'social.get') return { status: 200, body: { me, friends: [], requests: { in: [], out: [] }, blocks: [], invites: [], rev: 'r1' } };
    if (op === 'social.pulse') return { status: 204 };
    if (op === 'board.get') return { status: 200, body: LEVEL };
    if (op === 'history.list') {
      const code = typeof args.code === 'string' ? args.code : null;
      if (code === 'PL-REXX-0004') return { status: 200, body: { owner: { name: 'Rex', self: false }, rows: [], next: null, stats: { ...stats, matches: 4, favourites: [] }, player: card('none', false) } };
      const name = code === 'PL-MIRA-0001' ? 'Mira' : code ? 'Someone' : 'Zygis';
      return { status: 200, body: { owner: { name, self: !code }, rows: [row], next: null, stats, ...(code ? { player: card(sent.includes(code) ? 'sent' : 'none', true) } : {}) } };
    }
    if (op === 'history.match') return { status: 200, body: match };
    if (op === 'friend.add') {
      sent.push(String(args.code));
      return { status: 201, body: { state: 'sent' } };
    }
    return { status: 200, body: {} };
  };
}

async function home(context: import('@playwright/test').BrowserContext, page: Page, baseURL: string): Promise<Frame> {
  await context.exposeFunction('plApi', fakeServer());
  await mockHost(context, baseURL, {
    app: { isApp: false, store: true },
    signedIn: true,
    liveApi: true,
    profile: { v: 1, sessions: 3, matches: 5, wins: 2, firstWinDone: true, hero: 'sage', trick: 'hiss', difficulty: 'easy', veteran: true },
  });
  return openHost(page);
}

async function shot(page: Page, name: string): Promise<void> {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  const v = page.viewportSize();
  await page.screenshot({ path: join(SHOTS, `${name}-${v?.width}x${v?.height}.png`) });
}

async function noSideScroll(game: Frame): Promise<void> {
  const over = await game.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const out: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>('[data-testid="profile-screen"] .pfx-who *')) {
      const r = el.getBoundingClientRect();
      if (r.width && (r.right > vw + 1 || r.left < -1)) out.push(`${el.className || el.tagName}:${Math.round(r.left)}-${Math.round(r.right)}`);
    }
    return out;
  });
  expect(over).toEqual([]);
}

test('Player Card from Boards: tap a name, see the stats, Add friend in one tap; Esc leaves the Boards open', async ({ context, page, baseURL }, info) => {
  const touch = info.project.name === 'landscape';
  if (!touch) await page.setViewportSize({ width: 1440, height: 900 });
  const game = await home(context, page, baseURL!);
  const press = async (sel: string) => (touch ? game.locator(sel).first().tap() : game.locator(sel).first().click());
  await expect(game.locator('[data-testid="home-boards"]')).toBeVisible({ timeout: limit(60_000) });
  await press('[data-testid="home-boards"]');
  const boards = game.locator('[data-testid="boards-modal"]');
  await expect(boards).toBeVisible();
  const names = boards.locator('[data-testid="board-player"]');
  await expect(names.first()).toHaveText('Mira');
  await shot(page, 'boards');
  await press('[data-testid="board-player"]');

  const cardEl = game.locator('[data-testid="profile-screen"]');
  await expect(cardEl).toBeVisible();
  await expect(cardEl).toHaveAttribute('data-self', '0');
  await expect(cardEl.locator('[data-testid="profile-name"]')).toHaveText('Mira');
  await expect(cardEl.locator('.pfx-skel')).toHaveCount(0, { timeout: limit(10_000) });
  await expect(cardEl.locator('[data-testid="profile-rank"]')).toContainText('Alley');
  await expect(cardEl.locator('[data-testid="profile-level"]')).toBeVisible();
  // the card is on top of the window (what a tap at its centre reaches is the card)
  const onTop = await game.evaluate(() => {
    const el = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
    return !!el?.closest('[data-testid="profile-screen"]');
  });
  expect(onTop).toBe(true);
  await noSideScroll(game);
  await shot(page, 'card-boards');

  await press('[data-testid="profile-add-friend"]');
  await expect(cardEl.locator('[data-testid="profile-request-sent"]')).toHaveText('Request sent');
  const reqs = (await received(page)).filter((m: any) => m.type === 'api-request');
  expect(reqs.find((m: any) => m.op === 'friend.add')?.args).toEqual({ code: 'PL-MIRA-0001' });
  await shot(page, 'card-sent');

  // Esc closes the card only: the Boards window is still there
  await page.keyboard.press('Escape');
  await expect(cardEl).toHaveCount(0);
  await expect(boards).toBeVisible();
  // a name opened again remembers the request (the server says `sent`)
  await press('[data-testid="board-player"]');
  await expect(cardEl.locator('[data-testid="profile-request-sent"]')).toBeVisible();
  await press('[data-testid="profile-back"]');
  await expect(boards).toBeVisible();

  // my own pinned row opens my own profile (with Edit profile, never Add friend)
  await press('[data-testid="board-pinned"] [data-testid="board-player"]');
  await expect(cardEl).toHaveAttribute('data-self', '1');
  await expect(cardEl.locator('[data-testid="profile-add-friend"]')).toHaveCount(0);
});

test('Player Card from match history: a human in the scoreboard opens their card; a bot row is plain text', async ({ context, page, baseURL }, info) => {
  const touch = info.project.name === 'landscape';
  if (!touch) await page.setViewportSize({ width: 1440, height: 900 });
  const game = await home(context, page, baseURL!);
  const press = async (sel: string) => (touch ? game.locator(sel).first().tap() : game.locator(sel).first().click());
  await expect(game.locator('[data-testid="home-boards"]')).toBeVisible({ timeout: limit(60_000) });
  // Mira's card (from Boards) → her match → the scoreboard
  await press('[data-testid="home-boards"]');
  await press('[data-testid="board-player"]');
  const cardEl = game.locator('[data-testid="profile-screen"]');
  await expect(cardEl.locator('[data-testid="profile-name"]')).toHaveText('Mira');
  await press('[data-testid="profile-screen"] [data-a="match"]');
  const detail = cardEl.locator('[data-testid="history-match"]');
  await expect(detail).toBeVisible();
  // the bots: plain names, no profile button
  await expect(detail.locator('tr[data-slot="2"] [data-profile]')).toHaveCount(0);
  await expect(detail.locator('[data-profile]')).toHaveCount(1);
  await shot(page, 'history-match');
  await press('[data-testid="history-match"] [data-profile="PL-REXX-0004"]');
  await expect(cardEl.locator('[data-testid="profile-name"]')).toHaveText('Rex');
  await expect(cardEl.locator('.pfx-skel')).toHaveCount(0, { timeout: limit(10_000) });
  await expect(cardEl.locator('[data-testid="profile-add-friend"]')).toBeVisible();
  const reqs = (await received(page)).filter((m: any) => m.type === 'api-request');
  expect(reqs.some((m: any) => m.op === 'history.list' && m.args?.code === 'PL-REXX-0004')).toBe(true);
  await noSideScroll(game);
  await shot(page, 'card-history');
});
