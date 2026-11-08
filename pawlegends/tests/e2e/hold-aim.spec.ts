import { expect, test, type Page } from '@playwright/test';
import { attr, startFirstMatch } from './helpers';

// Feel pass B4 (docs/plans/moba/FEEL-PASS.md): hold to aim on touch at 667x375 and 844x390. A quick tap quick-casts;
// a held skill shows its aim and the cancel bubble 150 px above the button after 180 ms and casts on release; a drag
// aims and casts on release; resting on the bubble cancels (no cast); a skill pressed with a second finger while the
// joystick steers still casts. (Flash on the same tick: flash-touch.spec.ts. The drag direction for both seats, the
// slide-back smart cast and R: tests/unit/hold-aim.test.ts.)

test.beforeEach(({}, info) => test.skip(info.project.name !== 'landscape', 'touch controls'));

type Pt = { x: number; y: number; id: number };

async function rig(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  const send = (type: 'touchStart' | 'touchMove' | 'touchEnd', pts: Pt[]) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
  const casts = async (): Promise<number> => Number(await attr(page, 'casts'));
  const btn = async (b: string): Promise<Pt> => {
    const r = (await page.locator(`.pl-tbtn.${b}`).boundingBox())!;
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), id: 2 };
  };
  /**
   * Wait until skill `b` is off cooldown. After a cast (`after`), first give the snapshot time to carry the cooldown
   * (a loaded machine can be slow to show it), then wait for it to end.
   */
  const ready = async (b: string, after = false): Promise<void> => {
    // after a cast, first see the cooldown arrive (a loaded machine can take well over 600 ms to show it: pressing in
    // that gap was denied and the hold preview never came), then wait for it to end
    if (after) await expect(page.locator(`.pl-tbtn.${b}`)).toHaveClass(/cooling/, { timeout: 5000 }).catch(() => undefined);
    await expect(page.locator(`.pl-tbtn.${b}`)).not.toHaveClass(/cooling/, { timeout: 30_000 });
    await page.waitForTimeout(100);
  };
  return { send, casts, btn, ready };
}

for (const [w, h] of [
  [667, 375],
  [844, 390],
] as const) {
  test(`${w}x${h}: tap, hold, drag, cancel by the bubble, and a skill while steering`, async ({ page }) => {
    test.setTimeout(150_000);
    await page.setViewportSize({ width: w, height: h });
    await startFirstMatch(page, '&speed=4', 'cat');
    const { send, casts, btn, ready } = await rig(page);
    // a tap makes the touch HUD live; the gates open at 0:03
    await page.touchscreen.tap(w * 0.25, h * 0.85);
    await expect(page.locator('.pl-touch.on')).toBeVisible();
    await expect.poll(async () => Number(await attr(page, 'tick')), { timeout: 30_000 }).toBeGreaterThan(130);

    // 1. a quick tap quick-casts
    await ready('q');
    let q = await btn('q');
    let n = await casts();
    await send('touchStart', [q]);
    await send('touchEnd', []);
    await expect.poll(casts, { timeout: 5000 }).toBe(n + 1);

    // 2. hold: the aim and the bubble show after 180 ms (150 px above the button), the release casts
    await ready('q', true);
    q = await btn('q');
    n = await casts();
    await send('touchStart', [q]);
    // (polled: a loaded machine draws few frames, and the hold preview starts on a frame)
    await expect.poll(() => attr(page, 'aim'), { timeout: 5000 }).toBe('1');
    await expect(page.locator('.pl-cancel.on')).toBeVisible();
    const bub = (await page.locator('.pl-cancel').boundingBox())!;
    expect(Math.round(bub.width)).toBe(72);
    // 150 px up, clamped 48 px from the top; pushed down, it slides sideways to stay 144 px from the button
    const by = Math.max(48, q.y - 150);
    const bx = q.y - by >= 144 ? q.x : q.x + (q.x > w / 2 ? -1 : 1) * Math.sqrt(144 * 144 - (q.y - by) ** 2);
    expect(Math.abs(bub.x + bub.width / 2 - Math.max(48, Math.min(w - 48, bx)))).toBeLessThan(2);
    expect(Math.abs(bub.y + bub.height / 2 - by)).toBeLessThan(2);
    await page.screenshot({ path: `test-results/hold-aim/${w}x${h}-hold.png` });
    await send('touchEnd', []);
    await expect.poll(casts, { timeout: 5000 }).toBe(n + 1);
    await expect(page.locator('.pl-cancel.on')).toHaveCount(0);

    // 3. drag 60 px up-left: the aim follows the thumb, the release casts there
    await ready('q', true);
    q = await btn('q');
    n = await casts();
    await send('touchStart', [q]);
    for (let i = 1; i <= 6; i++) await send('touchMove', [{ ...q, x: q.x - i * 10, y: q.y - i * 10 }]);
    await expect.poll(() => attr(page, 'aim'), { timeout: 5000 }).toBe('1');
    await page.screenshot({ path: `test-results/hold-aim/${w}x${h}-drag.png` });
    await send('touchEnd', []);
    await expect.poll(casts, { timeout: 5000 }).toBe(n + 1);

    // 4. drag onto the bubble and rest there: it arms (red) and the release casts nothing
    await ready('q', true);
    q = await btn('q');
    n = await casts();
    await send('touchStart', [q]);
    await send('touchMove', [{ ...q, y: q.y - 30 }]);
    await expect(page.locator('.pl-cancel.on')).toBeVisible();
    const b2 = (await page.locator('.pl-cancel').boundingBox())!;
    const on = { ...q, x: Math.round(b2.x + b2.width / 2), y: Math.round(b2.y + b2.height / 2) };
    for (let i = 1; i <= 4; i++) await send('touchMove', [{ ...q, x: Math.round(q.x + ((on.x - q.x) * i) / 4), y: Math.round(q.y - 30 + ((on.y - q.y + 30) * i) / 4) }]);
    await expect(page.locator('.pl-cancel.hot')).toBeVisible({ timeout: 3000 });
    await page.screenshot({ path: `test-results/hold-aim/${w}x${h}-cancel.png` });
    await send('touchEnd', []);
    await page.waitForTimeout(600);
    expect(await casts()).toBe(n);

    // 5. the joystick steers (thumb 1) while a second finger taps W: it casts, the stick keeps steering
    await ready('w');
    const wb = { ...(await btn('w')), id: 3 };
    n = await casts();
    const base = { x: Math.round(w * 0.18), y: Math.round(h * 0.7), id: 1 };
    await send('touchStart', [base]);
    for (let i = 1; i <= 4; i++) await send('touchMove', [{ ...base, x: base.x + i * 12 }]);
    const s = { ...base, x: base.x + 48 };
    await page.waitForTimeout(300);
    await send('touchStart', [s, wb]);
    await send('touchEnd', [wb]);
    await expect.poll(casts, { timeout: 5000 }).toBe(n + 1);
    await expect(page.locator('.pl-stick.on')).toHaveCount(1);
    await send('touchEnd', [s]);
  });
}
