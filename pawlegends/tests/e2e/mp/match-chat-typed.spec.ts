import { expect, test, type Browser, type BrowserContext, type Frame } from '@playwright/test';
import { mockHost, openHost } from '../host';
import { RELAY } from './party.helpers';

/*
 * Typed in-match chat between two registered 16+ players (MATCH-CHAT.md §2, founder ask Nov 2026: "allow to type").
 * Both play framed in the mock embed host, each with a fresh party ticket for an `e2e-adult-*` account from the relay
 * harness (`/e2e/ticket`; the harness answers 18+ for those accounts). A desktop and an 844x390 phone make a party and
 * reach the match. The desktop presses Enter, types and sends with Enter; the phone taps the chat button, types with
 * its keyboard and taps Send. Each line shows on the other client.
 */

test.use({
  launchOptions: {
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessRespectPreflightResults,BlockInsecurePrivateNetworkRequests'],
  },
});

const contexts: BrowserContext[] = [];
test.afterEach(async () => {
  await Promise.all(contexts.splice(0).map((c) => c.close().catch(() => undefined)));
});

const VETERAN = { v: 1, sessions: 3, matches: 6, wins: 3, firstWinDone: true, hero: 'sage', trick: 'hiss', difficulty: 'easy', veteran: true };

async function adult(browser: Browser, baseURL: string, account: string, phone: boolean): Promise<{ game: () => Frame; touch: boolean }> {
  const context = await browser.newContext(phone ? { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 } : { viewport: { width: 1280, height: 720 } });
  contexts.push(context);
  await context.addInitScript((p) => {
    try {
      if (!localStorage.getItem('tt.pawlegends.profile.v1')) localStorage.setItem('tt.pawlegends.profile.v1', JSON.stringify(p));
    } catch {
      /* opaque origin */
    }
  }, VETERAN);
  await context.exposeFunction('plTicket', async () => {
    const r = await fetch(`${RELAY}/e2e/ticket?account=${account}`);
    return ((await r.json()) as { ticket: string }).ticket;
  });
  await mockHost(context, baseURL, {
    app: { isApp: false, store: true },
    signedIn: true,
    ticketFn: true,
    pass: [new URL(RELAY).origin],
    gameOrigin: baseURL,
    sendTarget: '*',
    profile: VETERAN,
  });
  await context.route(new RegExp(`^${baseURL.replace(/[.]/g, '\\.')}/pawlegends-game/`), async (route) => {
    const url = new URL(route.request().url());
    const rest = url.pathname.slice('/pawlegends-game/'.length) || 'index.html';
    try {
      return await route.fulfill({ response: await route.fetch({ url: `${baseURL}/${rest}${url.search}` }) });
    } catch {
      return route.abort().catch(() => undefined);
    }
  });
  if (process.env.MP_CONSOLE) context.on('console', (m) => console.log(`[${account}] ${m.type()} ${m.text().slice(0, 200)}`));
  const page = await context.newPage();
  const frame = await openHost(page);
  return { game: () => frame, touch: phone };
}

const said = (g: Frame): Promise<string> => g.evaluate(() => document.documentElement.dataset.chatSaid ?? '');

test('two 16+ players type to each other in a match: desktop Enter and a phone keyboard', async ({ browser, baseURL }) => {
  test.setTimeout(480_000);
  const a = await adult(browser, baseURL!, 'e2e-adult-a', false);
  const b = await adult(browser, baseURL!, 'e2e-adult-b', true);
  const ga = a.game();
  const gb = b.game();

  // A: PLAY → Skirmish → With Friends: the party lobby and its code
  await expect(ga.locator('.pl-home[data-variants~="friends"]')).toBeVisible({ timeout: 90_000 });
  await ga.locator('[data-testid="home-play"]').click();
  await ga.locator('[data-testid="mode-skirmish"]').click();
  await ga.locator('[data-testid="mode-next"]').click();
  await ga.locator('[data-testid="variant-friends"]').click();
  await ga.locator('[data-testid="mode-go"]').click();
  const codeEl = ga.locator('[data-testid="party-code"]');
  await expect(codeEl).toBeVisible({ timeout: 60_000 });
  const code = ((await codeEl.textContent()) ?? '').replace(/\s/g, '');

  // B (phone): Join with code
  await expect(gb.locator('[data-testid="join-code"]')).toBeVisible({ timeout: 90_000 });
  await gb.locator('[data-testid="join-code"]').tap();
  await expect(gb.locator('.pp-box')).toHaveCount(6, { timeout: 30_000 });
  await gb.locator('.pp-box').first().focus();
  await gb.locator('.pp-box').first().pressSequentially(code.toLowerCase());
  await expect(ga.locator('[data-testid="party-seat"]')).toHaveCount(2, { timeout: 60_000 });

  // start, both lock a hero, the match goes live
  await ga.locator('[data-p="diff"][data-v="easy"]').click();
  await ga.locator('[data-testid="party-start"]').click();
  for (const [g, hero, touch] of [
    [ga, 'sage', false],
    [gb, 'lambo', true],
  ] as const) {
    await expect(g.locator('[data-testid="party-lock"]')).toBeVisible({ timeout: 60_000 });
    const tile = g.locator(`[data-testid="party-hero-${hero}"]`);
    if (!(await tile.isVisible())) {
      const all = g.locator('[data-cs="side"][data-side="all"]');
      if (await all.count()) await (touch ? all.tap() : all.click());
    }
    await (touch ? tile.tap() : tile.click());
    await (touch ? g.locator('[data-testid="party-lock"]').tap() : g.locator('[data-testid="party-lock"]').click());
  }
  for (const g of [ga, gb]) await g.waitForSelector('html[data-match="live"]', { timeout: 180_000 });
  for (const g of [ga, gb]) await g.waitForFunction(() => !document.querySelector('.pl-loading:not(.out)'), undefined, { timeout: 120_000 });

  // desktop: Enter opens the composer with a text field (a registered 16+ player types), Enter sends
  const drawerA = ga.locator('[data-testid="chat-drawer"]');
  await expect
    .poll(
      async () => {
        await ga.locator('html').press('Enter');
        const n = await drawerA.locator('.cd-input').count();
        if (!n) await ga.locator('html').press('Escape');
        return n;
      },
      { timeout: 30_000, intervals: [1000] },
    )
    .toBe(1);
  await expect(drawerA.locator('.cd-input')).toBeFocused();
  await drawerA.locator('.cd-input').pressSequentially('push mid with me');
  await drawerA.locator('.cd-input').press('Enter');
  await expect(drawerA).toBeHidden();
  await expect.poll(() => said(gb), { timeout: 15_000 }).toContain('push mid with me');

  // phone: the chat button opens the drawer, the field takes the keyboard, Send sends
  await gb.locator('[data-testid="chat-open"]').tap();
  const drawerB = gb.locator('[data-testid="chat-drawer"]');
  await expect(drawerB).toBeVisible();
  const input = drawerB.locator('.cd-input');
  await expect(input).toBeVisible();
  await input.tap();
  await input.pressSequentially('on my way');
  await drawerB.locator('.cd-send').tap();
  await expect(drawerB).toBeHidden();
  await expect.poll(() => said(ga), { timeout: 15_000 }).toContain('on my way');
  // a quick message still works next to typing
  await gb.locator('[data-testid="chat-open"]').tap();
  await drawerB.locator('.cd-chip[data-id="29"]').tap();
  await expect.poll(() => said(ga), { timeout: 15_000 }).toContain('Thanks!');
});
