import { expect, test } from '@playwright/test';
import { mockHost, openHost, received } from './host';

/*
 * Social (docs/plans/moba/SOCIAL-RANKED.md §14.2, §13): a signed-in returning player opens the Social sheet from the
 * lobby corner, sees friends without any scroll, and adds a friend by code; every call goes through the host as an
 * `api-request` (the game never sees a token or a URL). The host here is the mock of tests/e2e/host.ts.
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

test('Social sheet: friends with presence, add a friend by code through the host', async ({ context, page, baseURL }) => {
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
  const btn = game.locator('[data-testid="lobby-social"]');
  await expect(btn).toBeVisible({ timeout: 60_000 });
  await btn.click();
  const sheet = game.locator('.pl-social');
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('.pl-social-row')).toHaveCount(2);
  await expect(sheet.locator('.pl-social-row').first()).toContainText('In party');
  // no scroll anywhere in the sheet
  expect(await sheet.evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
  await sheet.locator('[data-a="add"]').click();
  await sheet.locator('input[name="code"]').fill('PL-CCCC-CCCC');
  await sheet.locator('form button[type="submit"]').click();
  await expect.poll(async () => (await received(page)).some((m: any) => m.type === 'api-request' && m.op === 'friend.add' && m.args?.code === 'PL-CCCC-CCCC')).toBe(true);
  const reqs = (await received(page)).filter((m: any) => m.type === 'api-request');
  // the game never sends a URL or a token, only allowlisted ops
  for (const r of reqs as any[]) {
    // op and args only: the request id is random and can contain "fb" + letters (a false token hit, QA flaky-qa)
    expect(JSON.stringify({ op: r.op, args: r.args })).not.toMatch(/https?:|accesstoken|fb[A-Za-z0-9]/);
  }
});
