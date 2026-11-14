import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { mockHost, openHost, received, SITE } from './host';

// SHARE-PUSH.md §2: framed on the web with a push key from the host, Settings shows Notifications; turning it on asks
// the browser, registers /push-sw.js and (when the browser has a push service) sends the subscription through the
// host's API op. Without a key there is nothing to turn on.

test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'desktop only'));
test.describe.configure({ timeout: 180_000 });

const profile = { v: 1, sessions: 3, matches: 5, wins: 2, firstWinDone: true, hero: 'sage', trick: 'hiss', difficulty: 'easy', veteran: true };
const KEY = `B${'A'.repeat(86)}`;
const SW = readFileSync(new URL('../../../pawlegends-web/public/push-sw.js', import.meta.url), 'utf8');

async function openSettings(game: import('@playwright/test').Frame) {
  await game.locator('[data-a="settings"]').first().click();
  const panel = game.locator('.pl-settings');
  await expect(panel).toBeVisible();
  return panel;
}

test('Settings: Notifications with categories when the server has a key; the browser is asked on Turn on', async ({ context, page, baseURL }) => {
  await mockHost(context, baseURL!, {
    app: { isApp: false, store: true },
    signedIn: true,
    profile,
    api: {
      'push.key': { status: 200, body: { key: KEY, cats: ['invite', 'club', 'ranked', 'event', 'nap'] } },
      'push.subscribe': { status: 200, body: { on: true } },
      'social.pulse': { status: 204 },
    },
  });
  await context.route(`${SITE}/push-sw.js`, (r) => r.fulfill({ contentType: 'text/javascript', body: SW }));
  await context.grantPermissions(['notifications'], { origin: SITE });
  const game = await openHost(page);
  await expect.poll(async () => (await received(page)).some((m: any) => m.type === 'api-request' && m.op === 'push.key'), { timeout: 30_000 }).toBe(true);
  const panel = await openSettings(game);
  const row = panel.locator('[data-a="push"]');
  await expect(row).toHaveText('Off');
  await row.click();
  // either the push service answered (on: one row per category) or this headless browser has none (a note)
  await expect.poll(async () => (await panel.locator('[data-pushcat]').count()) > 0 || (await panel.locator('[data-testid="push-note"]').count()) > 0, { timeout: 30_000 }).toBe(true);
  if (await panel.locator('[data-pushcat]').count()) {
    await expect(panel.locator('[data-pushcat]')).toHaveCount(5);
    const sub = (await received(page)).find((m: any) => m.type === 'api-request' && m.op === 'push.subscribe') as any;
    expect(sub.args.endpoint).toMatch(/^https:\/\//);
    expect(sub.args.cats).toBe('invite,club,ranked,event,nap');
  } else {
    await expect(panel.locator('[data-testid="push-note"]')).toContainText('Could not turn notifications on');
  }
  // the worker was registered at the site root (scope /), from the framed game
  expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistration('/'))?.scope ?? '')).toBe(`${SITE}/`);
});

test('Settings: no Notifications row when the server has no key', async ({ context, page, baseURL }) => {
  await mockHost(context, baseURL!, {
    app: { isApp: false, store: true },
    signedIn: true,
    profile,
    api: { 'push.key': { status: 200, body: { key: null } }, 'social.pulse': { status: 204 } },
  });
  const game = await openHost(page);
  await expect.poll(async () => (await received(page)).some((m: any) => m.type === 'api-request' && m.op === 'push.key'), { timeout: 30_000 }).toBe(true);
  const panel = await openSettings(game);
  await expect(panel.locator('[data-a="push"]')).toHaveCount(0);
});
