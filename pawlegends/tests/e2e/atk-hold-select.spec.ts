import { expect, test, type Page } from '@playwright/test';
import { attr, me, minimapPoint, seedSide, startFirstMatch } from './helpers';

/**
 * Hold-to-select on ATK (founder ask, Wild Rift style) at 667x375 and 844x390: held, the enemies in reach get rings
 * (html[data-atk-cands]); a drag off the button selects one (data-atk-sel) and the release locks it and attacks it
 * (data-atk-sent, data-atk-lock); a drag back into the button centre cancels (no lock, no attack); a quick tap stays
 * the smart auto-target; the joystick keeps steering while ATK is held. Selection math: tests/unit/atk-hold-select.test.ts.
 */
test.beforeEach(({}, info) => test.skip(info.project.name !== 'landscape', 'touch controls'));

type Pt = { x: number; y: number; id: number };
const selN = async (page: Page): Promise<{ locked: number; cancelled: number; last: string; kind: string }> => {
  const [locked, cancelled, last, kind] = (await attr(page, 'atkSelN')).split(',');
  return { locked: Number(locked), cancelled: Number(cancelled), last, kind };
};

for (const [w, h] of [
  [667, 375],
  [844, 390],
] as const) {
  test(`${w}x${h}: hold ATK to select, drag to point, release locks; centre cancels; tap stays smart`, async ({ page }) => {
    test.setTimeout(300_000);
    await page.setViewportSize({ width: w, height: h });
    // Rookie bots: the walk into the lane fight dies less, so the hold-drag-release gets its tries
    await seedSide(page, 'cat', { difficulty: 'rookie' });
    await startFirstMatch(page, '&speed=3');
    const cdp = await page.context().newCDPSession(page);
    const send = (type: 'touchStart' | 'touchMove' | 'touchEnd', pts: Pt[]) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
    await page.touchscreen.tap(w * 0.25, h * 0.85);
    await expect(page.locator('.pl-touch.on')).toBeVisible();
    const atk = async (): Promise<Pt> => {
      const r = (await page.locator('.pl-tbtn.attack').boundingBox())!;
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), id: 2 };
    };

    // (every check polls: the e2e machine runs the game at a few frames a second under load, and the HUD and the
    // data attributes update per frame)
    // walk up Sunny Lane until a held ATK offers candidates (the minion waves meet near the middle); ATK may ring a
    // hero up to 7 m away (the tap walks in), but the selector offers only units within range + 2.5 m. A fight can kill
    // the hero mid-hold (the selector then stays shut): that try is dropped and the walk goes on after the respawn.
    const dbg = async (): Promise<string> =>
      `hold=${await attr(page, 'atkHold')} cands=${await attr(page, 'atkCands')} sel=${await attr(page, 'atkSel')} n=${await attr(page, 'atkSelN')} me=${await attr(page, 'me')}`;
    const alive = async (): Promise<boolean> => (await me(page)).state !== 'dead';
    let goalX = 30000;
    const deadline = Date.now() + 200_000;
    let a = await atk();
    let s0 = await selN(page);
    let sel = '';
    let tries = 0;
    while (Date.now() < deadline) {
      if ((await attr(page, 'screen')) === 'results') break;
      if (!(await alive())) {
        goalX = 30000;
        await page.waitForTimeout(1000);
        continue;
      }
      if (process.env.ATK_SEL_DEBUG) console.log(`walk goal=${goalX} ring=${await attr(page, 'atkTarget')} ${await dbg()}`);
      if (await attr(page, 'atkTarget')) {
        a = await atk();
        s0 = await selN(page);
        // 1. hold: the candidates get rings after ~200 ms, nothing is locked yet
        await send('touchStart', [a]);
        const held = await expect
          .poll(() => attr(page, 'atkCands'), { timeout: 4000 })
          .not.toBe('')
          .then(() => true)
          .catch(() => false);
        if (held) {
          tries++;
          // 2. drag up-left (toward the field) 70 px: a selection snaps on; the release locks and attacks it
          await send('touchMove', [{ x: a.x - 50, y: a.y - 50, id: 2 }]);
          // (the hold already shows the tap's own pick as the selection: wait for the drag to register first)
          sel = await expect
            .poll(async () => (await attr(page, 'atkHold')) === 'drag' && (await attr(page, 'atkSel')) !== '', { timeout: 6000 })
            .toBe(true)
            .then(() => attr(page, 'atkSel'))
            .catch(() => '');
          if (sel) {
            expect((await attr(page, 'atkCands')).split(',')).toContain(sel);
            expect(await attr(page, 'atkHold')).toBe('drag');
            // (no screenshot here: a slow one lets the lane fight kill every candidate before the release)
            await send('touchEnd', []);
            const ok = await expect
              .poll(async () => (await selN(page)).locked, { timeout: 6000 })
              .toBe(s0.locked + 1)
              .then(() => true)
              .catch(() => false);
            if (ok) break;
            console.log(`${w}x${h} try ${tries}: release did not lock (${await dbg()})`);
            sel = '';
            continue;
          }
          console.log(`${w}x${h} try ${tries}: no selection (${await dbg()})`);
        }
        await send('touchEnd', []);
      }
      goalX = Math.min(50000, goalX + 2500);
      // (the minimap can be gone for a moment, e.g. while the match ends)
      const p = await minimapPoint(page, goalX, 52500).catch(() => null);
      if (p) await page.mouse.click(p.x, p.y, { button: 'right' });
      await page.waitForTimeout(700);
    }
    expect(sel, 'a hold-drag-release locked a unit').not.toBe('');
    const s1 = await selN(page);
    // the selection may have moved on to another candidate between the last read and the release (the lane moves)
    sel = s1.last;
    expect(await attr(page, 'atkCands')).toBe('');
    expect(await attr(page, 'atkHold')).toBe('');
    // the Attack order went out on the selected unit (the sent id; it may already be dead and gone from the frame)
    expect((await attr(page, 'atkSent')).split(':')[0]).toBe(sel);
    const lock = await attr(page, 'atkLock');
    // the lock holds while the unit lives (a minion can die from the very hit)
    expect(lock === sel || lock === '').toBe(true);

    await expect.poll(alive, { timeout: 30_000 }).toBe(true);
    // 3. drag out, then back into the button centre: the centre ring turns red, the release cancels (no new lock)
    a = await atk();
    await send('touchStart', [a]);
    await expect.poll(() => attr(page, 'atkCands'), { timeout: 5000 }).not.toBe('').catch(() => undefined);
    await page.screenshot({ path: `test-results/atk-hold-select/${w}x${h}-hold.png` });
    await send('touchMove', [{ x: a.x - 50, y: a.y - 40, id: 2 }]);
    await expect.poll(() => attr(page, 'atkHold'), { timeout: 5000 }).toBe('drag');
    await page.screenshot({ path: `test-results/atk-hold-select/${w}x${h}-select.png` });
    await send('touchMove', [{ x: a.x + 3, y: a.y - 2, id: 2 }]);
    await expect.poll(() => attr(page, 'atkHold'), { timeout: 5000 }).toBe('cancel');
    await expect(page.locator('.pl-aimring.atk.back')).toHaveCount(1);
    await expect.poll(() => attr(page, 'atkSel'), { timeout: 3000 }).toBe('');
    await page.screenshot({ path: `test-results/atk-hold-select/${w}x${h}-cancel.png` });
    await send('touchEnd', []);
    await expect.poll(async () => (await selN(page)).cancelled, { timeout: 3000 }).toBe(s1.cancelled + 1);
    expect((await selN(page)).locked).toBe(s1.locked);
    await expect(page.locator('.pl-aimring.on')).toHaveCount(0);

    // 4. a quick tap stays the smart auto-target (no selector, no lock from it)
    const picks = Number(await attr(page, 'atkN'));
    a = await atk();
    await send('touchStart', [a]);
    await send('touchEnd', []);
    await expect.poll(async () => Number(await attr(page, 'atkN')), { timeout: 3000 }).toBeGreaterThan(picks);
    expect((await selN(page)).locked).toBe(s1.locked);
    expect((await selN(page)).cancelled).toBe(s1.cancelled + 1);

    await expect.poll(alive, { timeout: 30_000 }).toBe(true);
    // 5. the joystick keeps steering while the selector is up (two fingers): the hero walks back toward base
    a = await atk();
    const before = await me(page);
    const stick = { x: Math.round(w * 0.18), y: Math.round(h * 0.75), id: 1 };
    const aim = { x: a.x - 50, y: a.y - 50, id: 2 };
    await send('touchStart', [a]);
    await send('touchMove', [aim]);
    await send('touchStart', [aim, stick]);
    for (let i = 1; i <= 6; i++) {
      await send('touchMove', [aim, { x: stick.x - 8 * i, y: stick.y + 6 * i, id: 1 }]);
      await page.waitForTimeout(120);
    }
    expect(await attr(page, 'atkHold')).toBe('drag');
    await page.waitForTimeout(600);
    const after = await me(page);
    await send('touchEnd', []);
    expect(Math.hypot(after.x - before.x, after.y - before.y), 'the hero moved while ATK was held').toBeGreaterThan(300);
  });
}
