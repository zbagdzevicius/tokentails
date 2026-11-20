import { expect, test } from '@playwright/test';
import { closeAll, player, playVariant, RELAY, title } from './party.helpers';

test.afterEach(async () => {
  await fetch(`${RELAY}/e2e/bounce?n=0`);
  await closeAll();
});

/*
 * Founder report (Nov 20): "when I click invite friend I get into party and see Reconnecting". Production runs two
 * relay instances and the older one drains for good, so ~45% of connects get `server_moving` before `welcome` and the
 * party screen sat on "Connecting…" under a "Reconnecting…" toast. The harness bounces the next K sockets the same way
 * (`/e2e/bounce?n=K`: `server_moving`, then the close 1 s later).
 */

/** Count every "Reconnecting…" the page ever shows (the toast is brief). */
const watchReconnecting = () => {
  const w = window as { __reconnecting?: number };
  w.__reconnecting = 0;
  new MutationObserver(() => {
    if (/Reconnecting…/.test(document.querySelector('.pp-notes')?.textContent ?? '')) w.__reconnecting = (w.__reconnecting ?? 0) + 1;
  }).observe(document, { subtree: true, childList: true, characterData: true });
};

test('Party with three bounces off a draining relay: the lobby and its code within 3 s, no "Reconnecting…"', async ({ browser }) => {
  const a = await player(browser, 'desktop');
  await a.ctx.addInitScript(watchReconnecting);
  await title(a);
  await expect(a.page.locator('.pl-home[data-variants~="friends"]')).toBeVisible({ timeout: 30_000 });
  await fetch(`${RELAY}/e2e/bounce?n=3`);
  // timed from the first socket (the tap, the party chunk and the first paint are not the relay's part)
  let t0 = 0;
  a.page.on('websocket', () => void (t0 ||= Date.now()));
  await playVariant(a, 'friends');
  const code = a.page.locator('[data-testid="party-code"]');
  await expect(code).toBeVisible({ timeout: 15_000 });
  // three bounces at ~0.3 s each, not ~1.6 s each (the client no longer waits for the balancer's close)
  expect(t0).toBeGreaterThan(0);
  expect(Date.now() - t0).toBeLessThan(3_000);
  expect(((await code.textContent()) ?? '').replace(/\s/g, '')).toMatch(/^[A-Z0-9]{6}$/);
  expect(await a.page.evaluate(() => (window as { __reconnecting?: number }).__reconnecting)).toBe(0);
});

test('a relay that never takes the socket: "No connection" with Try again after 15 s; Try again opens the lobby', async ({ browser }) => {
  test.setTimeout(120_000);
  const a = await player(browser, 'desktop');
  await title(a);
  await fetch(`${RELAY}/e2e/bounce?n=9999`);
  await playVariant(a, 'friends');
  await expect(a.page.locator('[data-testid="party-connecting"]')).toBeVisible();
  const ended = a.page.locator('[data-testid="party-ended"][data-reason="unreachable"]');
  await expect(ended).toBeVisible({ timeout: 25_000 });
  await expect(ended).toContainText('No connection');
  await fetch(`${RELAY}/e2e/bounce?n=0`);
  await a.page.locator('[data-testid="party-retry"]').click();
  await expect(a.page.locator('[data-testid="party-code"]')).toBeVisible({ timeout: 15_000 });
});
