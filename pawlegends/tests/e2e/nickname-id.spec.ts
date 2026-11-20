import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Frame, type Page } from '@playwright/test';
import { mockHost, openHost } from './host';
import { limit } from '../unit/cpu-budget';

/*
 * Founder, Nov 20: "this PL-WF... code is redundant, we have nicknames that must be unique and represent actual
 * username". An assigned name is told once on Home (Choose a name opens the name editor), the editor says taken /
 * available while typing, Add friend takes a player name with suggestions, and no player code shows anywhere.
 * NICK_SHOTS=<dir> also writes screenshots (desktop at 1440x900, landscape at 844x390).
 */
test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop' && info.project.name !== 'landscape', 'desktop and landscape only'));

const SHOTS = process.env.NICK_SHOTS || null;
const TAKEN = new Set(['mira', 'scout']);

function server() {
  const s = { name: 'Scout2', nick: 'Scout2', auto: true, changes: 0, yarn: 300, notice: { kind: 'taken', from: 'Scout' } as unknown, seen: 0, adds: [] as unknown[], checks: [] as string[] };
  const view = () => ({ name: s.name, nick: s.nick, auto: s.auto, notice: s.notice, changes: s.changes, free: s.changes === 0, price: s.changes === 0 ? 0 : 1500, cost: 1500, cooldownDays: 7, nextAt: null, yarn: s.yarn });
  return {
    s,
    async handle(op: string, args: Record<string, unknown>): Promise<{ status: number; body?: unknown }> {
      switch (op) {
        case 'name.get':
          return { status: 200, body: view() };
        case 'name.seen':
          s.seen++;
          s.notice = null;
          return { status: 200, body: { ok: true } };
        case 'name.check': {
          const n = String(args.name).trim();
          s.checks.push(n);
          if (n.toLowerCase() === s.nick.toLowerCase()) return { status: 200, body: { name: n, available: true, mine: true } };
          return TAKEN.has(n.toLowerCase()) ? { status: 200, body: { name: n, available: false, reason: 'taken', message: 'That name is taken. Try another one.' } } : { status: 200, body: { name: n, available: true } };
        }
        case 'name.set': {
          if (TAKEN.has(String(args.name).toLowerCase())) return { status: 409, body: { code: 'PAWLEGENDS_NAME_TAKEN' } };
          s.name = s.nick = String(args.name);
          s.auto = false;
          s.changes += 1;
          return { status: 200, body: { ...view(), paid: 0 } };
        }
        case 'social.get':
          return { status: 200, body: { me: { code: 'PL-WF2Z-88WQ', name: s.name, nameKind: 'nick', invisible: false, allowRecent: true, ageBand: '18+', av: { i: 'h:sage' } }, friends: [], requests: { in: [], out: [] }, blocks: [], invites: [], rev: 'r1' } };
        case 'social.search':
          return { status: 200, body: { players: [{ name: 'Mira', av: { i: 'h:clem' }, cc: 'LT' }, { name: 'Mirabel', av: { i: 'h:pixel' } }] } };
        case 'friend.add':
          s.adds.push(args);
          return { status: 200, body: { state: 'sent' } };
        case 'social.pulse':
          return { status: 204 };
        default:
          return { status: 0 };
      }
    },
  };
}

async function shot(page: Page, project: string, name: string) {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, `${project}-${name}.png`) });
}

const noCode = async (game: Frame) => expect(await game.locator('body').innerText()).not.toMatch(/PL-WF2Z|friend code|player code/i);

test('nickname is the username: notice once, live taken / available, add friend by name, no player code anywhere', async ({ context, page, baseURL }, info) => {
  test.setTimeout(limit(180_000));
  const project = info.project.name;
  if (project === 'desktop') await page.setViewportSize({ width: 1440, height: 900 });
  const srv = server();
  await context.exposeFunction('plApi', async (op: string, args: Record<string, unknown>) => srv.handle(op, args));
  await mockHost(context, baseURL!, {
    app: { isApp: false, store: true },
    signedIn: true,
    liveApi: true,
    profile: { v: 1, sessions: 3, matches: 12, wins: 6, firstWinDone: true, hero: 'sage', trick: 'hiss', difficulty: 'easy', veteran: true },
  });
  const game = await openHost(page);
  await expect(game.locator('[data-testid="home-profile"]')).toContainText('Scout2', { timeout: limit(60_000) });

  // 1. the one-time notice on Home
  const notice = game.locator('[data-testid="name-notice"]');
  await expect(notice).toContainText('"Scout" was already taken, so you are Scout2 now');
  await shot(page, project, 'notice');
  await notice.locator('[data-testid="name-notice-choose"]').click();
  await expect(notice).toHaveCount(0);
  await expect.poll(() => srv.s.seen).toBe(1);

  // 2. Choose a name: the editor opens; taken / available while typing
  const screen = game.locator('[data-testid="profile-screen"]');
  const editor = screen.locator('[data-testid="profile-editor"]');
  await expect(editor).toBeVisible({ timeout: limit(20_000) });
  const input = editor.locator('[data-testid="profile-nick-input"]');
  const hint = editor.locator('[data-testid="profile-nick-hint"]');
  await input.fill('mira');
  await expect(hint).toHaveText('That name is taken. Try another one.');
  await shot(page, project, 'rename-taken');
  await editor.locator('[data-testid="profile-nick-change"]').click();
  await expect(editor.locator('[data-testid="profile-confirm"]')).toHaveCount(0);
  await input.fill('Pawsome Zyg');
  await expect(hint).toHaveText('Pawsome Zyg is available');
  await shot(page, project, 'rename-available');
  await editor.locator('[data-testid="profile-nick-change"]').click();
  await editor.locator('[data-testid="profile-confirm-btn"]').click();
  await expect(screen.locator('[data-testid="profile-name"]')).toHaveText('Pawsome Zyg');
  expect(srv.s.checks).toContain('mira');
  await editor.locator('[data-a="edit-close"]').click();

  // 3. the Profile header and Account tab: the name, no code
  await noCode(game);
  await shot(page, project, 'profile');
  await screen.locator('[data-testid="profile-tab-account"]').click();
  await noCode(game);
  await shot(page, project, 'profile-account');
  await screen.locator('[data-testid="profile-back"]').click();
  await expect(screen).toHaveCount(0);

  // 4. a reload does not show the notice again
  await page.reload();
  const again = await openHost(page);
  await expect(again.locator('[data-testid="home-profile"]')).toContainText('Pawsome Zyg', { timeout: limit(60_000) });
  await again.waitForTimeout(1500);
  await expect(again.locator('[data-testid="name-notice"]')).toHaveCount(0);

  // 5. Add friend by name: suggestions while typing, Add sends the exact name
  // (Home's friends panel, Nov 20: the add-friend button opens the add-friend sheet)
  await again.locator('[data-testid="home-friends-add"]').click();
  const sheet = again.locator('[data-testid="friends-sheet"]');
  await again.addStyleTag({ content: '.pl-social, .pl-fsheet-scrim { animation: none !important; } .pl-social * { transition: none !important; }' });
  const add = sheet.locator('[data-testid="social-add-input"]');
  await expect(add).toHaveAttribute('placeholder', 'Player name');
  await add.fill('Mir');
  await expect(sheet.locator('[data-testid="social-suggest"]')).toHaveCount(2);
  await noCode(again);
  await shot(page, project, 'add-friend');
  await sheet.locator('[data-testid="social-suggest"]').first().locator('[data-a="add-name"]').click();
  await expect(sheet.locator('.pl-social-note')).toHaveText('Request sent to Mira');
  await expect.poll(() => srv.s.adds).toEqual([{ name: 'Mira' }]);
  // my card (the sheet's You section) copies my name, never a code
  await expect(sheet.locator('[data-testid="social-copy-name"]')).toContainText('Pawsome Zyg');
  await noCode(again);
  await shot(page, project, 'my-card');
});
