import { expect, test, type Page } from '@playwright/test';
import { closeAll, createParty, joinByLink, player, SHOTS, tap } from './party.helpers';

/* Party play P4 + §8 layout rules: every pre-match screen at 844x390, 667x375, 915x412 and 1440x900, with no page
   scroll and nothing outside the viewport. Screenshots go to $SHOTS/lane-P/screens when SHOTS is set. */

test.afterEach(closeAll);

const SIZES = [
  { width: 844, height: 390 },
  { width: 667, height: 375 },
  { width: 915, height: 412 },
  { width: 1440, height: 900 },
];

/** At every size: no scrolling, the main buttons inside the viewport, then a screenshot. */
async function atEverySize(page: Page, label: string, must: string[]): Promise<void> {
  for (const s of SIZES) {
    await page.setViewportSize(s);
    await page.waitForTimeout(250);
    const over = await page.evaluate(() => {
      const root = document.querySelector('.pl-party') as HTMLElement;
      const card = root.querySelector('.pp-card') as HTMLElement;
      return { scroll: root.scrollHeight > root.clientHeight + 1, cardBottom: card.getBoundingClientRect().bottom, h: innerHeight };
    });
    expect(over.scroll, `${label} scrolls at ${s.width}x${s.height}`).toBe(false);
    expect(over.cardBottom, `${label} card below the fold at ${s.width}x${s.height}`).toBeLessThanOrEqual(over.h + 1);
    for (const sel of must) {
      const box = await page.locator(sel).first().boundingBox();
      expect(box, `${sel} missing in ${label} at ${s.width}x${s.height}`).not.toBeNull();
      expect(box!.y + box!.height, `${sel} below the fold in ${label} at ${s.width}x${s.height}`).toBeLessThanOrEqual(s.height + 1);
      expect(box!.x + box!.width, `${sel} off the right edge in ${label} at ${s.width}x${s.height}`).toBeLessThanOrEqual(s.width + 1);
    }
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/lane-P/screens/${label}-${s.width}x${s.height}.png` });
  }
}

test('the title shows PLAY (its With Friends variant opens the party) and Join with code inside the viewport at every size', async ({ browser }) => {
  const a = await player(browser, 'phone');
  await a.page.goto('/?e2e=1', { waitUntil: 'commit' });
  await a.page.waitForSelector('html[data-screen="title"]', { timeout: 120_000 });
  for (const s of SIZES) {
    await a.page.setViewportSize(s);
    await a.page.waitForTimeout(300);
    for (const sel of ['[data-testid="home-play"]', '[data-testid="join-code"]']) {
      const box = (await a.page.locator(sel).boundingBox())!;
      expect(box.y + box.height, `${sel} below the fold at ${s.width}x${s.height}`).toBeLessThanOrEqual(s.height);
      expect(box.height).toBeGreaterThanOrEqual(36);
    }
    if (SHOTS) await a.page.screenshot({ path: `${SHOTS}/lane-P/screens/title-${s.width}x${s.height}.png` });
  }
});

test('lobby, QR, pick and join code fit every size', async ({ browser }) => {
  test.setTimeout(420_000);
  const a = await player(browser, 'desktop');
  const b = await player(browser, 'phone');
  const c = await player(browser, 'phone-small');
  const code = await createParty(a);
  await joinByLink(b, code);
  await atEverySize(a.page, 'lobby-leader-2', ['[data-testid="party-start"]', '[data-testid="party-share"]', '[data-testid="party-seat-empty"]']);
  await joinByLink(c, code);
  await expect(a.page.locator('[data-testid="party-seat"]')).toHaveCount(3);
  await a.page.locator('input[data-p="open"]').check();
  await atEverySize(a.page, 'lobby-leader-3-open', ['[data-testid="party-start"]', '[data-testid="party-share"]']);
  await atEverySize(b.page, 'lobby-member', ['[data-testid="party-wait-leader"]', '[data-testid="party-share"]']);
  // the phone's full-screen QR
  await b.page.setViewportSize({ width: 844, height: 390 });
  await tap(b, b.page.locator('[data-p="qr"]'));
  await expect(b.page.locator('[data-testid="party-qr-sheet"]')).toBeVisible();
  await atEverySize(b.page, 'qr-sheet', ['[data-p="qr-close"]']);
  await b.page.setViewportSize({ width: 844, height: 390 });
  await tap(b, b.page.locator('[data-p="qr-close"]'));
  await a.page.locator('input[data-p="open"]').uncheck();
  await a.page.locator('[data-testid="party-start"]').click();
  await expect(b.page.locator('[data-testid="party-lock"]')).toBeVisible({ timeout: 15_000 });
  await a.page.locator('[data-testid="party-hero-clem"]').click();
  await a.page.locator('[data-testid="party-lock"]').click();
  // the leader's Clem sets the cat side: B's grid shows the cats (Lambo), its LOCK IN and the 0:30 timer
  await atEverySize(b.page, 'pick-member', ['[data-testid="party-lock"]', '[data-testid="party-hero-lambo"]', '[data-testid="party-timer"]']);
  // the pick lasts 30 s: the leader's locked view at desktop size only
  if (SHOTS) await a.page.screenshot({ path: `${SHOTS}/lane-P/screens/pick-leader-locked-1440x900.png` });
  // join by code on a fresh phone
  const d = await player(browser, 'phone');
  await d.page.goto('/?e2e=1', { waitUntil: 'commit' });
  await d.page.waitForSelector('html[data-screen="title"]', { timeout: 120_000 });
  await tap(d, d.page.locator('[data-testid="join-code"]'));
  await expect(d.page.locator('.pp-box')).toHaveCount(6, { timeout: 30_000 });
  await atEverySize(d.page, 'join-code', ['[data-testid="party-join"]']);
});
