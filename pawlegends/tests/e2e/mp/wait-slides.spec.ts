import { expect, test, type Page } from '@playwright/test';
import { closeAll, player, tap, title, type Kind } from './party.helpers';

test.afterEach(closeAll);

/*
 * While-you-wait slides (src/ui/waitSlides, founder Nov 20: "some interesting info / slideshow to see while waiting so
 * that it won't be boring here"), at 844x390 (touch) and 1440x900:
 *   the Short wait (a leaver's low-priority countdown; the relay socket is mocked so the wait is certain) shows a panel
 *   beside the card that never covers the countdown, the side chip or Cancel; it advances on its own, on a tap, the
 *   arrow buttons and the arrow keys;
 *   the real relay's search card shows the same panel, and Cancel takes it away with the card.
 */

/** A relay that answers `hello` and puts every `mm.join` into an 81 s low-priority wait. */
async function mockWaitRelay(page: Page): Promise<void> {
  await page.routeWebSocket(/\/pawlegends\/ws/, (ws) => {
    ws.onMessage((m) => {
      if (typeof m !== 'string') return;
      const f = JSON.parse(m) as { t: string; queue?: string; side?: string };
      if (f.t === 'hello') ws.send(JSON.stringify({ t: 'welcome', proto: 8, member: 'm1', resumeToken: 'r1', serverMs: Date.now() }));
      if (f.t === 'mm.join') ws.send(JSON.stringify({ t: 'mm.status', queue: f.queue, side: f.side, waitedMs: 0, estimateMs: 15_000, found: 1, lowPriorityMs: 81_000, warn: 'leaver' }));
    });
  });
}

const overlaps = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

for (const kind of ['phone', 'desktop'] as Kind[]) {
  test(`${kind}: the Short wait shows slides beside the card, and they advance`, async ({ browser }) => {
    test.setTimeout(180_000);
    const p = await player(browser, kind);
    await mockWaitRelay(p.page);
    await title(p);
    await tap(p, p.page.locator('[data-testid="home-play"]'));
    await expect(p.page.locator('[data-testid="mm-queue"][data-state="wait"]')).toBeVisible({ timeout: 15_000 });
    const panel = p.page.locator('[data-testid="wait-slides"]');
    await expect(panel).toBeVisible({ timeout: 10_000 });
    const stage = p.page.locator('[data-testid="wait-stage"]');
    await expect(stage.locator('.pw-card h3')).not.toHaveText('');

    // nothing of the card is covered, and nothing scrolls sideways
    const pb = (await panel.boundingBox())!;
    for (const id of ['mm-wait-timer', 'mm-side', 'mm-cancel']) {
      const b = (await p.page.locator(`[data-testid="${id}"]`).boundingBox())!;
      expect(overlaps(pb, b), id).toBe(false);
    }
    expect(await p.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    // on its own (every 6.5 s)
    const first = await stage.getAttribute('data-id');
    await expect(stage).not.toHaveAttribute('data-id', first!, { timeout: 12_000 });
    // the next arrow, a tap on the panel, then back with the arrow key
    const a = await stage.getAttribute('data-id');
    await tap(p, p.page.locator('[data-testid="wait-next"]'));
    await expect(stage).not.toHaveAttribute('data-id', a!);
    const b = await stage.getAttribute('data-id');
    await tap(p, stage);
    await expect(stage).not.toHaveAttribute('data-id', b!);
    await p.page.keyboard.press('ArrowLeft');
    await expect(stage).toHaveAttribute('data-id', b!);

    // Cancel: the card and the slides go together
    await tap(p, p.page.locator('[data-testid="mm-cancel"]'));
    await expect(panel).toBeHidden({ timeout: 10_000 });
  });
}

test('the relay search card shows the slides too', async ({ browser }) => {
  test.setTimeout(180_000);
  const p = await player(browser, 'desktop');
  await title(p);
  await tap(p, p.page.locator('[data-testid="home-play"]'));
  await expect(p.page.locator('[data-testid="mm-queue"][data-state="searching"]')).toBeVisible({ timeout: 15_000 });
  await expect(p.page.locator('[data-testid="wait-slides"]')).toBeVisible({ timeout: 10_000 });
  await tap(p, p.page.locator('[data-testid="mm-cancel"]'));
  await expect(p.page.locator('[data-testid="wait-slides"]')).toBeHidden({ timeout: 10_000 });
});
