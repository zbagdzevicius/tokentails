import { expect, test } from '@playwright/test';
import { closeAll, createParty, player, playVariant, RELAY, tap, title, type Kind } from './party.helpers';

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

// desktop and the 844x390 landscape phone
for (const kind of ['desktop', 'phone'] as Kind[]) {
  test(`${kind}: Party with three bounces off a draining relay: the lobby and its code within 3 s, no "Reconnecting…"`, async ({ browser }) => {
    const a = await player(browser, kind);
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

  test(`${kind}: a relay that never takes the socket: "No connection" with Try again after 15 s; Try again opens the lobby`, async ({ browser }) => {
    test.setTimeout(120_000);
    const a = await player(browser, kind);
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
}

/*
 * The connect budget counts from when "Joining …" began, not from when the party screen opened: a code typed after a
 * minute on the code boxes gets its own 30 s (the relay here answers the join 2.5 s late, so a budget counted from the
 * open would flash "No connection" first).
 */
test('phone: a code typed after 32 s on the code boxes joins without a "No connection" flash', async ({ browser }) => {
  test.setTimeout(150_000);
  const a = await player(browser, 'desktop');
  const b = await player(browser, 'phone');
  const code = await createParty(a);
  await b.page.routeWebSocket(/\/pawlegends\/ws/, (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((m) => {
      if (typeof m === 'string' && m.includes('"party.join"')) setTimeout(() => server.send(m), 2_500);
      else server.send(m);
    });
  });
  await b.ctx.addInitScript(() => {
    const w = window as { __noConn?: number };
    w.__noConn = 0;
    new MutationObserver(() => {
      if (/No connection/.test(document.querySelector('.pl-party')?.textContent ?? '')) w.__noConn = (w.__noConn ?? 0) + 1;
    }).observe(document, { subtree: true, childList: true, characterData: true });
  });
  await title(b);
  await tap(b, b.page.locator('[data-testid="join-code"]'));
  await expect(b.page.locator('.pp-box')).toHaveCount(6, { timeout: 30_000 });
  await b.page.waitForTimeout(32_000);
  await b.page.locator('.pp-box').first().focus();
  await b.page.keyboard.type(code.toLowerCase());
  await expect(b.page.locator('[data-testid="party-code"]')).toHaveText(`${code.slice(0, 3)} ${code.slice(3)}`, { timeout: 30_000 });
  expect(await b.page.evaluate(() => (window as { __noConn?: number }).__noConn)).toBe(0);
});
