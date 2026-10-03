import { expect, test, type Frame, type Page } from '@playwright/test';
import { seedFtueSeen } from './ftue-seed';

/**
 * Embed mode (plan G2 layer 1): the Heist inside a same-origin host page, as `/heist` in the core
 * app runs it. A minimal host (served at /__host.html by a route on the preview origin) speaks the
 * bridge: it retries `hello`, sends a `session` with insets and server progress, and records what
 * the Heist sends back.
 */

const HOST = (query: string) => `<!doctype html><html><body style="margin:0;background:#0b0820">
<iframe id="f" src="/index.html?${query}" style="position:fixed;inset:0;width:100%;height:100%;border:0"></iframe>
<script>
  const env = (type, extra) => Object.assign({ channel: 'tt-heist-bridge', v: 1, type }, extra || {});
  window.__msgs = [];
  window.__send = (type, extra) => document.getElementById('f').contentWindow.postMessage(env(type, extra), location.origin);
  let ready = false;
  const hello = setInterval(() => { if (ready) clearInterval(hello); else window.__send('hello'); }, 500);
  window.addEventListener('message', (e) => {
    if (e.origin !== location.origin || !e.data || e.data.channel !== 'tt-heist-bridge') return;
    window.__msgs.push(e.data);
    if (e.data.type === 'ready' && !ready) {
      ready = true;
      window.__send('session', {
        signedIn: false,
        insets: { top: 47, right: 0, bottom: 34, left: 0 },
        progress: { levels: { 'heist-01': { won: true, bestScore: 180, stars: 3 } } },
      });
    }
  });
</script></body></html>`;

type HeistQA = {
  screen(): string;
  getState(): { tick: number; won: boolean } | null;
  progress(): { levels: Record<string, { won: boolean; bestScore: number; stars: number }> };
  playSolution(levelId?: string): Promise<unknown>;
  log(): { seed: number } | null;
};

async function openHost(page: Page, query: string): Promise<Frame> {
  // First-run briefs are covered by ftue.spec.ts; here a started heist runs at once.
  await seedFtueSeen(page);
  await page.route('**/__host.html', (route) => route.fulfill({ contentType: 'text/html', body: HOST(query) }));
  await page.goto('/__host.html');
  const frame = page.frameLocator('#f');
  await expect(frame.locator('#app[data-ready="1"]')).toBeAttached({ timeout: 45_000 });
  const handle = await page.locator('#f').elementHandle();
  return (await handle!.contentFrame())!;
}

const messages = (page: Page) => page.evaluate(() => (window as unknown as { __msgs: Array<Record<string, unknown>> }).__msgs);

test('connects to the host, forces seed 1, applies insets and merges server progress', async ({ page }) => {
  test.setTimeout(120_000);
  const frame = await openHost(page, 'embed=1&qa=1&seed=99');
  await expect.poll(async () => (await messages(page)).some((m) => m.type === 'ready')).toBe(true);
  // Insets become the overlay's safe-area variables (env() is 0 inside an iframe).
  await expect.poll(() => frame.evaluate(() => getComputedStyle(document.querySelector('.ch-ui')!).getPropertyValue('--ch-sat').trim())).toBe('47px');
  // Server progress merged: level 1 won, so level 2 is open.
  await expect.poll(() => frame.evaluate(() => (window as unknown as { __heist: HeistQA }).__heist.progress().levels['heist-01']?.won ?? false)).toBe(true);
  await expect(frame.getByTestId('heist-exit')).toBeVisible();

  // A played win goes to the host as run-complete with a replayable log (seed 1, not 99).
  await frame.evaluate(() => (window as unknown as { __heist: HeistQA }).__heist.playSolution('heist-01'));
  await expect.poll(async () => (await messages(page)).filter((m) => m.type === 'run-complete').length, { timeout: 30_000 }).toBe(1);
  const run = (await messages(page)).find((m) => m.type === 'run-complete') as { won: boolean; levelId: string; runId: string; log: { seed: number; levelId: string; ticks: number } };
  expect(run.won).toBe(true);
  expect(run.levelId).toBe('heist-01');
  expect(run.log.seed).toBe(1);
  expect(run.log.ticks).toBeGreaterThan(0);
  expect(run.runId.length).toBeLessThanOrEqual(64);

  // Signed out: the results offer sign-in, which asks the host.
  await frame.getByTestId('heist-signin').click();
  await expect.poll(async () => (await messages(page)).some((m) => m.type === 'request-sign-in')).toBe(true);
  // Exit asks the host to leave.
  await frame.getByRole('button', { name: /Menu/ }).click();
  await frame.getByTestId('heist-exit').click();
  await expect.poll(async () => (await messages(page)).some((m) => m.type === 'exit')).toBe(true);
});

test('ignores ?replay=solution without qa=1 in embed mode', async ({ page }) => {
  test.setTimeout(90_000);
  const frame = await openHost(page, 'embed=1&replay=solution');
  await expect(frame.getByRole('button', { name: 'Play' })).toBeVisible();
  await page.waitForTimeout(1_000);
  await expect(frame.getByRole('button', { name: 'Play' })).toBeVisible();
  expect(await frame.evaluate(() => !!(window as unknown as { __heist?: unknown }).__heist)).toBe(false);
});

test('pauses a running heist when the host sends pause', async ({ page }) => {
  test.setTimeout(120_000);
  const frame = await openHost(page, 'embed=1&qa=1');
  await expect.poll(async () => (await messages(page)).some((m) => m.type === 'ready')).toBe(true);
  await frame.evaluate(() => (window as unknown as { __heist: { start(): Promise<unknown> } }).__heist.start());
  await expect.poll(() => frame.evaluate(() => (window as unknown as { __heist: HeistQA }).__heist.screen()), { timeout: 45_000 }).toBe('heist');
  await page.evaluate(() => (window as unknown as { __send: (type: string) => void }).__send('pause'));
  await expect.poll(() => frame.evaluate(() => (window as unknown as { __heist: HeistQA }).__heist.screen())).toBe('pause');
});
