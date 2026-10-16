import { expect, test, type Page, type Route } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The rescue win screen sends the Pink Paw treat in place (founder request, Oct 15, 2026): a button,
// never a link, and the game tab never navigates. Replays the heist-01 solution to Results. Every
// treat request is answered by `page.route`; nothing here reaches a real backend.
const here = dirname(fileURLToPath(import.meta.url));
const SOLUTION = readFileSync(join(here, '../src/levels/heist-01.solution.json'), 'utf8');

// Local view of the QA hook (heist.spec.ts owns the global Window declaration).
type Heist = { screen(): string; loadReplay(json: string): Promise<unknown>; step(n: number): unknown; app: { ui: { showPayouts(): void } } };

// The rail decides whether the button shows (plan G11): only a live backend status does. The preview
// host has no API, so the live case points the runtime config at a mocked API.
const API = 'http://rail.e2e.test';
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type, accept', 'access-control-allow-methods': 'GET, POST, OPTIONS' };
const RECEIPT = 'https://arcscan.app/tx/0xabc';

type PostAnswer = { status: number; body: unknown; delayMs?: number };

const LIVE_STATUS = { enabled: true, railState: 'live', chainId: 5042, amountWei: '10000000000000000', treatsLeftToday: 5 };

async function mockApi(page: Page, answers: PostAnswer[], today: unknown = null, railStatus: unknown = LIVE_STATUS) {
  const posts: unknown[] = [];
  // Belt and braces: anything aimed at the production API is refused and recorded.
  const prod: string[] = [];
  await page.route('https://api.tokentails.com/**', (route) => {
    prod.push(route.request().method() + ' ' + route.request().url());
    return route.abort();
  });
  await page.addInitScript((apiUrl) => {
    (window as unknown as { __TT_HEIST_CONFIG__: unknown }).__TT_HEIST_CONFIG__ = { apiUrl };
  }, API);
  await page.route(`${API}/**`, async (route: Route) => {
    const req = route.request();
    const url = req.url();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (url.endsWith('/shelter/donate/status')) {
      return route.fulfill({ contentType: 'application/json', headers: CORS, body: JSON.stringify(railStatus) });
    }
    if (url.endsWith('/shelter/donate/guest/me')) {
      return route.fulfill({ contentType: 'application/json', headers: CORS, body: JSON.stringify({ today, resetsAt: null }) });
    }
    if (url.endsWith('/shelter/donate/guest') && req.method() === 'POST') {
      posts.push(req.postDataJSON());
      const a = answers.shift() ?? { status: 500, body: null };
      if (a.delayMs) await new Promise((r) => setTimeout(r, a.delayMs));
      return route.fulfill({ status: a.status, contentType: 'application/json', headers: CORS, body: JSON.stringify(a.body) });
    }
    return route.fulfill({ status: 404, headers: CORS, body: '' });
  });
  return { posts, prod };
}

async function playToResults(page: Page) {
  await page.goto('/?qa=1');
  await page.waitForFunction(() => !!(window as unknown as { __heist?: unknown }).__heist && document.getElementById('app')?.dataset.ready === '1', null, { timeout: 30_000 });
  await page.evaluate((j) => (window as unknown as { __heist: Heist }).__heist.loadReplay(j), SOLUTION);
  await page.evaluate(() => (window as unknown as { __heist: Heist }).__heist.step(100_000));
  await expect.poll(() => page.evaluate(() => (window as unknown as { __heist: Heist }).__heist.screen()), { timeout: 10_000 }).toBe('results');
}

const panel = (page: Page) => page.locator('.ch-results [data-testid="treat-panel"]');
const score = (page: Page) => page.locator('.ch-results').getAttribute('data-score');

test('a live rail sends the treat in place: sending, then sent with a new-tab receipt; the game stays put', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const api = await mockApi(page, [{ status: 200, body: { txHash: '0xabc', chainId: 5042, amountWei: '10000000000000000', explorerUrl: RECEIPT }, delayMs: 600 }]);
  await playToResults(page);
  const urlBefore = page.url();
  const scoreBefore = await score(page);

  const give = page.locator('.ch-results').getByTestId('give-treat');
  await expect(panel(page)).toHaveAttribute('data-state', 'ready');
  await expect(give).toHaveText('Send Pink Paw a rescue treat 🐾');
  expect(await give.evaluate((el) => el.tagName)).toBe('BUTTON');
  expect(await give.getAttribute('href')).toBeNull();
  expect(await give.getAttribute('target')).toBeNull();
  await expect(panel(page).getByTestId('treat-custody')).toHaveText('Held by Token Tails for the shelter until handover.');

  await give.click();
  await expect(panel(page)).toHaveAttribute('data-state', 'sending');
  await expect(give).toBeDisabled();
  // SwiftShader renders the 3D scene behind the results on the CPU, so the page answers slowly here.
  await expect(panel(page)).toHaveAttribute('data-state', 'sent', { timeout: 20_000 });
  await expect(panel(page).getByTestId('treat-line')).toHaveText('Treat sent! Token Tails sent Pink Paw a free 0.01 USDC treat.');
  const receipt = panel(page).getByTestId('treat-receipt');
  await expect(receipt).toHaveAttribute('href', RECEIPT);
  await expect(receipt).toHaveAttribute('target', '_blank');

  // The status names no `chains` list, so the treat goes to the main chain (no chainId).
  expect(api.posts).toEqual([{ source: 'heist' }]);
  expect(page.url()).toBe(urlBefore);
  expect(await page.evaluate(() => (window as unknown as { __heist: Heist }).__heist.screen())).toBe('results');
  expect(await score(page)).toBe(scoreBefore);
  await expect(page.locator('.ch-results')).toBeVisible();

  // The payouts modal shares the send state: sent there too, and no second POST.
  await page.evaluate(() => (window as unknown as { __heist: Heist }).__heist.app.ui.showPayouts());
  await expect(page.locator('.ch-pay [data-testid="treat-panel"]')).toHaveAttribute('data-state', 'sent');
  expect(api.posts).toHaveLength(1);
  expect(api.prod).toEqual([]);
  expect(errors).toEqual([]);
});

test('failed then retry, which ends in used up', async ({ page }) => {
  test.setTimeout(120_000);
  const api = await mockApi(page, [
    { status: 424, body: { statusCode: 424, code: 'DONATE_SEND_FAILED' } },
    { status: 409, body: { statusCode: 409, code: 'DONATE_BUDGET_SPENT' } },
  ]);
  await playToResults(page);
  const urlBefore = page.url();
  const give = page.locator('.ch-results').getByTestId('give-treat');
  await expect(panel(page)).toHaveAttribute('data-state', 'ready');
  await give.click();
  await expect(panel(page)).toHaveAttribute('data-state', 'failed', { timeout: 20_000 });
  await expect(panel(page).getByTestId('treat-line')).toHaveText('The treat did not go through. Try again.');
  await expect(give).toHaveText('Try again');
  await give.click();
  await expect(panel(page)).toHaveAttribute('data-state', 'used-up', { timeout: 20_000 });
  await expect(panel(page).getByTestId('treat-line')).toHaveText("Today's treats are gone, back at 00:00 UTC.");
  await expect(give).toBeHidden();
  expect(api.posts).toHaveLength(2);
  expect(page.url()).toBe(urlBefore);
  expect(api.prod).toEqual([]);
});

test('a 429 already-today answer shows "already"', async ({ page }) => {
  test.setTimeout(90_000);
  const api = await mockApi(page, [{ status: 429, body: { statusCode: 429, code: 'DONATE_ALREADY_TODAY' } }]);
  await playToResults(page);
  await page.locator('.ch-results').getByTestId('give-treat').click();
  await expect(panel(page)).toHaveAttribute('data-state', 'already', { timeout: 20_000 });
  await expect(panel(page).getByTestId('treat-line')).toHaveText("Today's treat already went out. Back at 00:00 UTC.");
  expect(api.posts).toHaveLength(1);
});

test('today already sent (guest me) shows "already" without a button', async ({ page }) => {
  test.setTimeout(90_000);
  const api = await mockApi(page, [], { status: 'CONFIRMED' });
  await playToResults(page);
  await expect(panel(page)).toHaveAttribute('data-state', 'already');
  await expect(page.locator('.ch-results').getByTestId('give-treat')).toBeHidden();
  expect(api.posts).toHaveLength(0);
});

test('before the rail is live the win screen shows "Opens soon" and no give button', async ({ page }) => {
  test.setTimeout(90_000);
  const api = await mockApi(page, [], null, { enabled: true, railState: 'not-deployed' });
  await playToResults(page);
  await expect(page.getByTestId('rail-chip')).toHaveText('Opens soon');
  await expect(page.getByTestId('rail-line')).toHaveAttribute('data-rail', 'pre-launch');
  await expect(page.getByTestId('give-treat')).toHaveCount(0);
  expect(api.posts).toHaveLength(0);
});

test('a paused rail says "Treats are paused right now." before any send', async ({ page }) => {
  test.setTimeout(90_000);
  const api = await mockApi(page, [], null, { enabled: true, railState: 'paused' });
  await playToResults(page);
  await expect(page.getByTestId('rail-line')).toHaveText('Treats are paused right now.');
  await expect(page.getByTestId('rail-chip')).toHaveText('Paused');
  await expect(page.locator('.ch-results')).not.toContainText(/open soon/i);
  await expect(page.getByTestId('give-treat')).toHaveCount(0);
  expect(api.posts).toHaveLength(0);
});

test('off tokentails.com (no API) the win screen offers the tokentails.com/heist link, never "open soon"', async ({ page }) => {
  test.setTimeout(90_000);
  const requests: string[] = [];
  page.on('request', (r) => {
    // (chain RPC reads for the shelter total are JSON-RPC POSTs and are fine; no treat route, no production API)
    if (/shelter\/donate|api\.tokentails\.com/.test(r.url())) requests.push(r.method() + ' ' + r.url());
  });
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await playToResults(page);
  const url = page.url();
  await expect(panel(page)).toHaveAttribute('data-state', 'unavailable');
  await expect(panel(page).getByTestId('treat-line')).toHaveText('Play on tokentails.com/heist to send a treat.');
  await expect(panel(page).getByTestId('treat-custody')).toHaveText('Held by Token Tails for the shelter until handover.');
  await expect(page.locator('.ch-results')).not.toContainText(/open soon/i);
  await expect(page.getByTestId('rail-chip')).toHaveCount(0);
  await panel(page).getByTestId('treat-copy').click();
  await expect(panel(page).getByTestId('treat-copy')).toHaveText(/Link copied|tokentails\.com\/heist/);
  expect(page.url()).toBe(url);
  expect(requests).toEqual([]);
});
