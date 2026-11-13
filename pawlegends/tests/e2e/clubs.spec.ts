import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { mockHost, openHost, received } from './host';

/*
 * Clubs (docs/plans/moba/CLUBS-KUDOS.md §6): a signed-in player opens Social → Clubs, creates a club with a generated
 * name (never typed), sees the club card with its code, the weekly chest and the good-teammate card without any scroll,
 * opens the chest, pages the members and opens the club chat on the club's thread. A second run joins by code. Every
 * call is an allowlisted `api-request` through the host (a stateful fake here). Screenshots go to
 * ~/Downloads/paw-legends/gaps/clubs-kudos/ when CLUBS_SHOTS=1.
 */
test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop' && info.project.name !== 'landscape', 'desktop and landscape only'));
// the first load builds the game's chunks cold: room for a busy machine
test.describe.configure({ timeout: 180_000 });

const SHOTS = process.env.CLUBS_SHOTS === '1' ? join(homedir(), 'Downloads', 'paw-legends', 'gaps', 'clubs-kudos') : null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const social = {
  me: { code: 'PL-7KQ2-M9XR', name: 'Witty Biscuit', invisible: false, allowRecent: true, ageBand: '18+' },
  friends: [],
  requests: { in: [], out: [] },
  blocks: [],
  invites: [],
  rev: 'r1',
};
const NAMES = ['Witty Biscuit', 'Sunny Pudding', 'Brave Mittens', 'Zippy Comet', 'Cozy Lantern', 'Plucky Paws', 'Golden Tail'];
const kudos = { month: '2026-11', endsAt: '2026-12-01T00:00:00.000Z', n: 2, tiers: [3, 8, 15], paid: [], got: [], next: { id: 'coat.clem.s1_honey_tabby', name: 'Honey Tabby coat' } };
const THREAD = `c${'Q'.repeat(22)}`;

function fakeServer() {
  let club: Record<string, unknown> | null = null;
  let claimed = false;
  const make = (name: string) => ({
    code: 'CL-7KQ2M9',
    name,
    size: NAMES.length,
    cap: 30,
    owner: true,
    thread: THREAD,
    tier: 'text',
    members: NAMES.map((n, i) => ({ mid: `${i}`.padStart(12, 'a'), name: n, owner: i === 0, you: i === 0, wins: [3, 5, 1, 0, 2, 4, 1][i] })),
    chest: { week: '2026-W46', endsAt: new Date(Date.now() + 3 * 86_400_000 + 4 * 3_600_000).toISOString(), wins: 16, tiers: [8, 20, 40], claimed: claimed ? [0] : [], open: claimed ? 0 : 1, mine: 3, perDay: 6, next: { id: 'title.s1.rookie', name: claimed ? 'Mud Puddle coat' : 'Rookie Legend title' } },
  });
  return async (op: string, args: Record<string, unknown>) => {
    if (op === 'social.get') return { status: 200, body: social };
    if (op === 'social.pulse') return { status: 204 };
    if (op === 'club.get') return { status: 200, body: { club, kudos } };
    if (op === 'club.create') {
      const [a, b] = String(args.name).split('.').map(Number);
      const first = ['Sunny', 'Brave', 'Sleepy', 'Zippy', 'Mighty', 'Nimble', 'Plucky', 'Swift', 'Cozy', 'Frosty', 'Golden', 'Lucky', 'Midnight', 'Thunder', 'Velvet', 'Wild', 'Starry', 'Rusty', 'Silver', 'Fuzzy', 'Daring', 'Jolly', 'Misty', 'Crimson'];
      const second = ['Paws', 'Whiskers', 'Pouncers', 'Rascals', 'Tails', 'Claws', 'Purrs', 'Biscuits', 'Comets', 'Lanterns', 'Rockets', 'Mittens', 'Zoomies', 'Puddings', 'Sparks', 'Howlers', 'Bandits', 'Legends', 'Nappers', 'Sprinters', 'Bolts', 'Rivals', 'Barkers', 'Prowlers'];
      club = make(`${first[a]} ${second[b]}`);
      return { status: 200, body: { club, kudos } };
    }
    if (op === 'club.join') {
      if (args.code !== 'CL-7KQ2M9') return { status: 403, body: { code: 'PAWLEGENDS_CLUB_UNAVAILABLE' } };
      club = { ...make('Swift Comets'), owner: false };
      return { status: 200, body: { club, kudos } };
    }
    if (op === 'club.claim') {
      claimed = true;
      club = { ...make(String(club?.name ?? 'Swift Comets')) };
      return { status: 200, body: { club, kudos, got: [{ id: 'title.s1.rookie', name: 'Rookie Legend title' }] } };
    }
    if (op === 'chat.history')
      return {
        status: 200,
        body: {
          thread: { id: THREAD, kind: 'club', tier: 'text', muted: false, readOnly: false },
          messages: [
            { mid: 'a'.repeat(24), mine: false, k: 'q', id: 0, at: new Date(Date.now() - 60_000).toISOString(), who: 'Sunny Pudding' },
            { mid: 'b'.repeat(24), mine: true, k: 't', text: 'gg, one more?', at: new Date().toISOString() },
          ],
          more: false,
        },
      };
    if (op === 'chat.read') return { status: 200, body: { ok: true } };
    if (op === 'chat.since') return { status: 204 };
    return { status: 404, body: { code: 'unknown' } };
  };
}

async function openClubs(context: import('@playwright/test').BrowserContext, page: import('@playwright/test').Page, baseURL: string) {
  await context.exposeFunction('plApi', fakeServer());
  await mockHost(context, baseURL, {
    app: { isApp: false, store: true },
    signedIn: true,
    liveApi: true,
    profile: { v: 1, sessions: 3, matches: 5, wins: 2, firstWinDone: true, hero: 'sage', trick: 'hiss', difficulty: 'easy', veteran: true },
  });
  const game = await openHost(page);
  const btn = game.locator('[data-testid="lobby-social"]');
  await expect(btn).toBeVisible({ timeout: 60_000 });
  await btn.click();
  const sheet = game.locator('.pl-social');
  await expect(sheet).toBeVisible();
  await sheet.locator('[data-tab="clubs"]').click();
  return { game, sheet };
}

test('Clubs: create with a generated name, the club card and chest, members, club chat', async ({ context, page, baseURL }, info) => {
  const { game, sheet } = await openClubs(context, page, baseURL!);
  const name = sheet.locator('[data-testid="club-name"]');
  await expect(name).toHaveText(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
  // all six tabs fit, none is cut to an ellipsis
  for (const t of await sheet.locator('.pl-social-tab').all()) expect(await t.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `after-01-no-club-${info.project.name}.png`) });
  const before = await name.textContent();
  for (let i = 0; i < 5 && (await name.textContent()) === before; i++) await sheet.locator('[data-testid="club-roll"]').click();
  await sheet.locator('[data-testid="club-create"]').click();
  const card = sheet.locator('[data-testid="club-card"]');
  await expect(card).toBeVisible();
  await expect(sheet.locator('[data-testid="club-code-text"]')).toHaveText('CL-7KQ2M9');
  await expect(sheet.locator('[data-testid="club-kudos"]')).toContainText('2/3');
  // no scroll anywhere in the sheet
  expect(await sheet.evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
  const body = sheet.locator('.pl-social-body');
  expect(await body.evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `after-02-club-${info.project.name}.png`) });
  await sheet.locator('[data-testid="club-claim"]').click();
  await expect(sheet.locator('.pl-social-note')).toContainText('Rookie Legend title');
  await expect(sheet.locator('[data-testid="club-claim"]')).toHaveCount(0);
  await sheet.locator('[data-testid="club-members"]').click();
  await expect(sheet.locator('[data-testid="club-member"]').first()).toContainText('(you)');
  expect(await body.evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `after-03-members-${info.project.name}.png`) });
  await sheet.locator('[data-club="back"]').click();
  await sheet.locator('[data-testid="club-chat"]').click();
  const chat = game.locator('[data-testid="chat-sheet"]');
  await expect(chat).toBeVisible();
  await expect(chat.locator('.pl-chat-who')).toHaveText('Sunny Pudding');
  await page.waitForTimeout(800);
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `after-04-chat-${info.project.name}.png`) });
  const reqs = (await received(page)).filter((m: any) => m.type === 'api-request') as any[];
  expect(reqs.find((r) => r.op === 'club.create')?.args.name).toMatch(/^\d{1,2}\.\d{1,2}$/);
  expect(reqs.some((r) => r.op === 'chat.open')).toBe(false);
  expect(reqs.find((r) => r.op === 'chat.history')?.args.thread).toBe(THREAD);
  // the random request id may contain "fb" by chance: only the op and args are checked
  for (const r of reqs) expect(JSON.stringify({ op: r.op, args: r.args })).not.toMatch(/https?:|accesstoken|fb[A-Za-z0-9]/);
});

test('Clubs: join by code', async ({ context, page, baseURL }) => {
  const { sheet } = await openClubs(context, page, baseURL!);
  const input = sheet.locator('[data-testid="club-code"]');
  await input.fill('cl 7kq2m9');
  await sheet.locator('[data-testid="club-join"]').click();
  await expect(sheet.locator('[data-testid="club-card"]')).toBeVisible();
  await expect(sheet.locator('.pl-club-name')).toHaveText('Swift Comets');
  const reqs = (await received(page)).filter((m: any) => m.type === 'api-request' && m.op === 'club.join') as any[];
  expect(reqs[0].args).toEqual({ code: 'CL-7KQ2M9' });
});
