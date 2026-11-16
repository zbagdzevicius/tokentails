import { expect, test } from '@playwright/test';
import { mockHost, openHost } from './host';

/*
 * Profile and nickname (docs/plans/moba/SOCIAL-RANKED.md §2.3): the Home profile chip opens the Profile sheet; the first
 * change is free with a confirm step, the new name shows on Home at once and after a reload; a second change shows the
 * Yarn price and the server's refusal (not enough Yarn) in words. The host answers from a small stateful fake server.
 */
test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop' && info.project.name !== 'landscape', 'desktop and landscape only'));

function server() {
  const s = { name: 'Witty Biscuit', nick: null as string | null, changes: 0, yarn: 300 };
  const view = () => ({ name: s.name, nick: s.nick, changes: s.changes, free: s.changes === 0, price: s.changes === 0 ? 0 : 1500, cost: 1500, cooldownDays: 7, nextAt: null, yarn: s.yarn });
  return {
    s,
    async handle(op: string, args: Record<string, unknown>): Promise<{ status: number; body?: unknown }> {
      switch (op) {
        case 'name.get':
          return { status: 200, body: view() };
        case 'name.set': {
          if (s.changes > 0 && s.yarn < 1500) return { status: 402, body: { code: 'PAWLEGENDS_NAME_YARN', message: 'Not enough Yarn' } };
          if (String(args.name).toLowerCase() === 'mira') return { status: 409, body: { code: 'PAWLEGENDS_NAME_TAKEN' } };
          s.name = s.nick = String(args.name);
          s.changes += 1;
          return { status: 200, body: { ...view(), paid: 0 } };
        }
        case 'social.get':
          return { status: 200, body: { me: { code: 'PL-7KQ2-M9XR', name: s.name, invisible: false, allowRecent: true, ageBand: '18+', av: { i: 'h:sage' } }, friends: [], requests: { in: [], out: [] }, blocks: [], invites: [], rev: 'r1' } };
        case 'social.pulse':
          return { status: 204 };
        default:
          return { status: 0 };
      }
    },
  };
}

test('Profile: first name change is free, shows on Home and after a reload; the second needs Yarn', async ({ context, page, baseURL }) => {
  test.setTimeout(180_000);
  const srv = server();
  await context.exposeFunction('plApi', async (op: string, args: Record<string, unknown>) => srv.handle(op, args));
  await mockHost(context, baseURL!, {
    app: { isApp: false, store: true },
    signedIn: true,
    liveApi: true,
    profile: { v: 1, sessions: 3, matches: 5, wins: 2, firstWinDone: true, hero: 'sage', trick: 'hiss', difficulty: 'easy', veteran: true },
  });
  let game = await openHost(page);
  const chip = game.locator('[data-testid="home-profile"]');
  await expect(chip).toContainText('Witty Biscuit', { timeout: 60_000 });
  await chip.click();
  const sheet = game.locator('[data-testid="profile-sheet"]');
  await expect(sheet.locator('[data-testid="profile-price"]')).toHaveText('First change free');
  const input = sheet.locator('[data-testid="profile-nick-input"]');
  // a taken name: the server's answer in words, nothing changes
  await input.fill('Mira');
  await sheet.locator('[data-testid="profile-nick-change"]').click();
  await expect(sheet.locator('[data-testid="profile-confirm"]')).toContainText('Mira');
  await sheet.locator('[data-testid="profile-confirm-btn"]').click();
  await expect(sheet.locator('[data-testid="profile-note"]')).toHaveText('That name is taken. Try another one.');
  // the quick client check
  await input.fill('x');
  await sheet.locator('[data-testid="profile-nick-change"]').click();
  await expect(sheet.locator('[data-testid="profile-note"]')).toContainText('at least 2');
  // the free change, with the confirm step
  await input.fill('Pawsome Zyg');
  await sheet.locator('[data-testid="profile-nick-change"]').click();
  await expect(sheet.locator('[data-testid="profile-confirm-btn"]')).toContainText('Free');
  await sheet.locator('[data-testid="profile-confirm-btn"]').click();
  await expect(sheet.locator('[data-testid="profile-name"]')).toHaveText('Pawsome Zyg');
  await expect(sheet.locator('[data-testid="profile-price"]')).toContainText('1,500 Yarn');
  // a second change without the Yarn: refused before a call
  await input.fill('Zyg the Brave');
  await sheet.locator('[data-testid="profile-nick-change"]').click();
  await expect(sheet.locator('[data-testid="profile-note"]')).toContainText('Not enough Yarn');
  await sheet.locator('[data-a="close"]').click();
  await expect(chip).toContainText('Pawsome Zyg');
  // after a reload: still the new name
  await page.reload();
  game = await openHost(page);
  await expect(game.locator('[data-testid="home-profile"]')).toContainText('Pawsome Zyg', { timeout: 60_000 });
  expect(srv.s.changes).toBe(1);
});

test('Profile: a guest is asked to sign in to choose a name', async ({ context, page, baseURL }) => {
  await mockHost(context, baseURL!, {
    app: { isApp: false, store: true },
    signedIn: false,
    profile: { v: 1, sessions: 3, matches: 5, wins: 2, firstWinDone: true, hero: 'sage', trick: 'hiss', difficulty: 'easy', veteran: true },
  });
  const game = await openHost(page);
  await game.locator('[data-testid="home-profile"]').click({ timeout: 60_000 });
  await expect(game.locator('[data-testid="profile-guest"]')).toContainText('Sign in to choose your name');
});
