import { expect, test, type Page } from '@playwright/test';
import { seedSide } from './helpers';

// Champion browser (src/ui/champBrowser/): Preview in the champion select's hero panel opens the hero's page on the
// tapped skill (the only live clip on the pick); a skill tap switches the clip; Lore links jump to the rival; Select picks; Esc closes; the page fits the viewport at
// 1280x720 and 844x390 with no page scroll; and in a match a held skill button shows its card without pausing.

async function toPick(page: Page): Promise<void> {
  await seedSide(page, 'cat');
  await page.goto('/?e2e=1');
  await page.waitForSelector('html[data-screen="title"]');
  await page.locator('[data-a="choose"]').click();
  await page.waitForSelector('html[data-screen="pick"]');
}

const press = async (page: Page, sel: string, touch: boolean): Promise<void> => {
  if (touch) await page.locator(sel).first().tap();
  else await page.locator(sel).first().click();
};

test('Preview opens Skills and Lore on the tapped skill; Select picks; nothing on the LOCK IN path changes', async ({ page }, info) => {
  // three browser opens, a clip and a match load on SwiftShader: a loaded machine needs more than 240 s
  test.setTimeout(420_000);
  const touch = info.project.name === 'landscape';
  await toPick(page);
  // one tap shows Sage's skills in the panel (no clip yet); Q, then Preview
  await press(page, '.cs-tile[data-h="sage"]', touch);
  await expect(page.locator('.cs-panel')).toHaveAttribute('data-hero', 'sage');
  await press(page, '.cs-sk[data-slot="q"]', touch);
  await press(page, '.cs-panel [data-a="codex"]', touch);
  const dlg = page.locator('.pl-champ[data-ready="1"]');
  // the browser is its own lazy chunk (SwiftShader under load: give it time)
  await expect(dlg).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.cs-tile.on')).toHaveAttribute('data-h', 'sage');
  await expect(dlg.locator('.cb-name')).toHaveText('Sage');
  await expect(dlg).toHaveAttribute('data-skill', 'q');
  // the dialog fits: no part of it is off screen
  const vp = page.viewportSize()!;
  const box = await dlg.locator('.cb-panel').boundingBox();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(vp.height + 1);
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
  // the clip starts (SwiftShader may be slow: loading or playing, never an error)
  await expect.poll(() => dlg.getAttribute('data-clip'), { timeout: 60_000 }).toMatch(/playing|loading/);
  await press(page, '.cb-skill-btn[data-slot="r"]', touch);
  await expect(dlg).toHaveAttribute('data-skill', 'r');
  await expect(dlg.locator('.cb-card')).toContainText('Moonshot');
  await press(page, '.cb-skill-btn[data-slot="passive"]', touch);
  await expect(dlg).toHaveAttribute('data-clip', 'none');
  await press(page, '.cb-tab[data-tab="lore"]', touch);
  await expect(dlg.locator('.cb-lore')).toBeVisible();
  await expect(dlg.locator('.cb-quote')).toContainText('Moonshot');
  await press(page, '.cb-link[data-rel="rival"]', touch);
  await expect(dlg.locator('.cb-name')).toHaveText('Howler');
  // Select a dog: the pick switches side
  await press(page, '.cb-select', touch);
  await expect(page.locator('.pl-champ')).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('data-pick-side', 'dog');
  await expect(page.locator('.cs-tile.on')).toHaveAttribute('data-h', 'howler');
  // Esc closes a reopened browser and LOCK IN still starts the match in one tap
  await press(page, '.cs-panel [data-a="codex"]', touch);
  await expect(page.locator('.pl-champ[data-ready="1"]')).toBeVisible({ timeout: 30_000 });
  await page.keyboard.press('Escape');
  await expect(page.locator('.pl-champ')).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('data-screen', 'pick');
  await press(page, '[data-a="start"]', touch);
  await page.waitForSelector('html[data-match="live"]', { timeout: 90_000 });
});

test('in a match, holding a skill shows its card and the match keeps running', async ({ page }, info) => {
  test.setTimeout(240_000);
  const touch = info.project.name === 'landscape';
  await seedSide(page, 'cat');
  await page.goto('/?e2e=1');
  await page.waitForSelector('html[data-screen="title"]');
  await page.locator('.pl-btn.big').first().click();
  await page.waitForSelector('html[data-match="live"]', { timeout: 120_000 });
  await page.waitForFunction(() => !document.querySelector('.pl-loading:not(.out)'));
  const sel = touch ? '.pl-tbtn[data-b="w"]' : '.pl-slot[data-i="1"]';
  const b = (await page.locator(sel).first().boundingBox())!;
  const x = b.x + b.width / 2;
  const y = b.y + b.height / 2;
  // record the card the moment it shows (SwiftShader frames under load can take seconds, so a poll may miss it)
  await page.evaluate(() => {
    const w = window as unknown as { __peek?: string };
    const mo = new MutationObserver(() => {
      const c = document.querySelector('.pl-skill-peek.on');
      if (c && !w.__peek) w.__peek = `${document.documentElement.dataset.skillPeek}|${c.textContent}`;
    });
    mo.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'], childList: true });
  });
  if (touch) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await page.waitForFunction(() => !!(window as unknown as { __peek?: string }).__peek, null, { timeout: 30_000 });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.waitForFunction(() => !!(window as unknown as { __peek?: string }).__peek, null, { timeout: 30_000 });
    await page.mouse.up();
  }
  const seen = await page.evaluate(() => (window as unknown as { __peek: string }).__peek);
  expect(seen.startsWith('w|')).toBe(true);
  expect(seen).toContain('The Stand');
  // no pause: the match is still live and the card takes no taps
  await expect(page.locator('html')).toHaveAttribute('data-match', 'live');
  expect(await page.locator('.pl-skill-peek').evaluate((e) => getComputedStyle(e).pointerEvents)).toBe('none');
  await expect(page.locator('.pl-skill-peek.on')).toHaveCount(0, { timeout: 15_000 });
});
