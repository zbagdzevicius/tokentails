import { devices, expect, test } from '@playwright/test';

// iPhone Safari zoomed the page on a quick second tap or a pinch (app/noZoom.ts). Runs once, in WebKit with the
// iPhone touch profile (the landscape project only picks it up; launchOptions are cleared because the Chromium
// GPU flags are not WebKit flags).
const { defaultBrowserType: _b, ...iphone } = devices['iPhone 13 landscape'];
test.use({ ...iphone, browserName: 'webkit', launchOptions: {} });
test.beforeEach(({}, info) => test.skip(info.project.name !== 'landscape', 'one touch WebKit run'));

test('pinch and double-tap zoom are blocked, a tap still clicks', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('html[data-ready="1"]');

  // pinch (WebKit gesture events) and two-finger moves
  const gesture = await page.evaluate(() =>
    ['gesturestart', 'gesturechange', 'gestureend', 'dblclick'].map((t) => {
      const e = new Event(t, { bubbles: true, cancelable: true });
      document.body.dispatchEvent(e);
      return e.defaultPrevented;
    }),
  );
  expect(gesture).toEqual([true, true, true, true]);

  // a probe button over the title: count clicks and whether each touchend was prevented
  await page.evaluate(() => {
    const b = document.createElement('button');
    b.id = 'zoom-probe';
    b.textContent = 'probe';
    b.style.cssText = 'position:fixed;left:40%;top:40%;width:120px;height:60px;z-index:5000';
    document.body.appendChild(b);
    const w = window as unknown as { probe: { clicks: number; ends: boolean[] } };
    w.probe = { clicks: 0, ends: [] };
    b.addEventListener('click', () => w.probe.clicks++);
    window.addEventListener('touchend', (e) => w.probe.ends.push(e.defaultPrevented));
  });
  const box = (await page.locator('#zoom-probe').boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const probe = () => page.evaluate(() => (window as unknown as { probe: { clicks: number; ends: boolean[] } }).probe);

  await page.touchscreen.tap(cx, cy);
  await expect.poll(async () => (await probe()).clicks).toBe(1);
  expect((await probe()).ends).toEqual([false]);

  await page.waitForTimeout(400);
  await page.touchscreen.tap(cx, cy);
  await page.touchscreen.tap(cx, cy);
  await expect.poll(async () => (await probe()).clicks).toBe(3);
  expect((await probe()).ends).toEqual([false, false, true]);

  // CSS side: tappables and the canvas never allow double-tap zoom; text is not inflated
  const css = await page.evaluate(() => ({
    canvas: getComputedStyle(document.querySelector('#game-canvas')!).touchAction,
    buttons: Array.from(document.querySelectorAll('button')).map((b) => getComputedStyle(b).touchAction),
    html: getComputedStyle(document.documentElement).touchAction,
    // desktop WebKit does not compute -webkit-text-size-adjust (iOS only), so read the boot stylesheet
    adjust: /text-size-adjust:\s*100%/.test(document.head.innerHTML),
  }));
  expect(css.canvas).toBe('none');
  expect(css.html).toBe('none');
  for (const t of css.buttons) expect(['manipulation', 'none']).toContain(t);
  expect(css.adjust).toBe(true);
});
