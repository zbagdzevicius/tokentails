import { expect, test } from '@playwright/test';
import { mockHost, openHost, received } from './host';
import { limit } from '../unit/cpu-budget';

/*
 * Social (docs/plans/moba/SOCIAL-RANKED.md §14.2, §13; friends panel Nov 20): a signed-in returning player sees friends
 * on Home's friends panel without opening anything, and adds a friend by name from the panel's add-friend sheet; every
 * call goes through the host as an `api-request` (the game never sees a token or a URL). The host here is the mock of
 * tests/e2e/host.ts.
 */
test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop' && info.project.name !== 'landscape', 'desktop and landscape only'));

const social = {
  me: { code: 'PL-7KQ2-M9XR', name: 'Witty Biscuit', invisible: false, allowRecent: true, ageBand: '18+' },
  friends: [
    { code: 'PL-AAAA-AAAA', name: 'Mira', presence: { state: 'party', joinable: true, party: 'ABCD' } },
    { code: 'PL-BBBB-BBBB', name: 'Sunny Pudding', presence: { state: 'offline' } },
  ],
  requests: { in: [], out: [] },
  blocks: [],
  invites: [],
  rev: 'r1',
};

test('friends panel: friends with presence on Home, add a friend by name through the host', async ({ context, page, baseURL }) => {
  await mockHost(context, baseURL!, {
    app: { isApp: false, store: true },
    signedIn: true,
    profile: { v: 1, sessions: 3, matches: 5, wins: 2, firstWinDone: true, hero: 'sage', trick: 'hiss', difficulty: 'easy', veteran: true },
    api: {
      'social.get': { status: 200, body: social },
      'social.pulse': { status: 204 },
      'friend.add': { status: 200, body: { state: 'sent' } },
    },
  });
  const game = await openHost(page);
  const panel = game.locator('[data-testid="home-friends"]');
  await expect(panel.locator('[data-testid="home-friend"]')).toHaveCount(2, { timeout: limit(60_000) });
  await expect(panel.locator('[data-testid="home-friend"]').first()).toContainText('In lobby'); // fc868b09: a friend in a party lobby reads "In lobby"
  await game.locator('[data-testid="home-friends-add"]').click();
  const sheet = game.locator('[data-testid="friends-sheet"]');
  await expect(sheet).toBeVisible();
  await sheet.locator('input[name="code"]').fill('Fuzzy Paws');
  await sheet.locator('form button[type="submit"]').click();
  await expect.poll(async () => (await received(page)).some((m: any) => m.type === 'api-request' && m.op === 'friend.add' && m.args?.name === 'Fuzzy Paws')).toBe(true);
  const reqs = (await received(page)).filter((m: any) => m.type === 'api-request');
  // the game never sends a URL or a token, only allowlisted ops
  for (const r of reqs as any[]) {
    // op and args only: the request id is random and can contain "fb" + letters (a false token hit, QA flaky-qa)
    expect(JSON.stringify({ op: r.op, args: r.args })).not.toMatch(/https?:|accesstoken|fb[A-Za-z0-9]/);
  }
});
