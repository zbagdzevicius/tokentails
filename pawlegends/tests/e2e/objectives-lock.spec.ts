import { expect, test, type Page } from '@playwright/test';
import { attr, ops } from './helpers';

// GAPS A4 + A5: the next-objective chip (every match; GAPS B1: a tap sends its ping), the minimap countdown rings and the
// portrait strip; on touch, a tap on an enemy hero (field or portrait) locks it and Attack then sends Attack{id} on it.
// At 844x390 none of it covers the touch controls.

const VETERAN = { v: 1, sessions: 3, matches: 5, wins: 2, firstWinDone: true, hero: 'sage', trick: 'hiss', difficulty: 'normal', veteran: true };

async function startVeteran(page: Page, query = '', prefs: Record<string, string> = {}): Promise<void> {
  await page.addInitScript(
    ([p, extra]) => {
      localStorage.setItem('tt.pawlegends.profile.v1', JSON.stringify(p));
      for (const [k, v] of Object.entries(extra)) localStorage.setItem(k, v);
    },
    [VETERAN, prefs] as const,
  );
  await page.goto(`/?e2e=1${query}`);
  await page.waitForSelector('html[data-screen="title"]');
  await page.locator('.pl-btn.big').first().click();
  await page.waitForSelector('html[data-match="live"]');
  await page.waitForFunction(() => !!document.documentElement.dataset.me);
  await page.waitForFunction(() => !document.querySelector('.pl-loading:not(.out)'));
}


test('every match: the objective chip names the next timer, a tap sends its ping (no other order, no offer); strip and rings show', async ({ page }, info) => {
  await startVeteran(page);
  if (info.project.name === 'landscape') {
    // feel pass B3: phones have no standing chip and no ally portraits: the top strip shows the next objective's
    // timer from 10 s before it is up (the own camp at 0:30), and the enemy row shows only near enemies
    await page.touchscreen.tap(844 * 0.25, 390 * 0.85);
    await expect(page.locator('.pl-touch.on')).toBeVisible();
    await expect(page.locator('.pl-rail-rest.on[data-ping]')).toHaveCount(0);
    await expect(page.locator('.pl-strip.ally')).toBeHidden();
    await expect(page.locator('.pl-top .pl-strip.enemy .pp')).toHaveCount(3);
    await expect.poll(async () => Number(await attr(page, 'rings'))).toBeGreaterThanOrEqual(1);
    const obj = page.locator('.pl-score .obj:not([hidden])');
    await expect(obj).toBeVisible({ timeout: 45_000 });
    await expect(obj).toHaveAttribute('data-key', /rats|pudding|up/);
    await expect(obj.locator('b')).toHaveText(/^(\d{1,2}|Up!)$/);
    return;
  }
  // LoL pass (lane A): the standing goal is the top rail's resting line; a tap on it still sends the ping
  const chip = page.locator('.pl-rail-rest.on[data-ping]');
  await expect(chip).toBeVisible({ timeout: 10_000 });
  await expect(chip).toContainText(/Gates open in|Your rats \d:\d\d|Pudding in \d:\d\d|Sunset in/);
  expect(await attr(page, 'objChip')).toMatch(/^(gates|rats|pudding|sunset)\|/);
  await expect(page.locator('.pl-strip.ally .pp')).toHaveCount(2);
  await expect(page.locator('.pl-top .pl-strip.enemy .pp')).toHaveCount(3);
  // Pudding's spawn and the own camp count down on the minimap from the start
  await expect.poll(async () => Number(await attr(page, 'rings'))).toBeGreaterThanOrEqual(1);
  // after the gates (0:03) the own camp (0:30) is the next timer for a while: a stable chip to tap
  await expect(chip).toHaveAttribute('data-ping', 'rats', { timeout: 15_000 });
  await expect(chip).toContainText(/Your rats 0:\d\d/);
  const offers = await page.locator('.pl-offer, [data-offer]').count();
  const key = await chip.getAttribute('data-ping');
  const b = (await chip.boundingBox())!;
  if (info.project.name === 'landscape') await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
  else await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await expect.poll(() => attr(page, 'chipTap')).toBe(key);
  // GAPS B1: "Your rats" → one Go here ping (Op.Ping = 9) and nothing else
  await expect.poll(() => attr(page, 'pingsSent')).toBe('1');
  await expect.poll(async () => (await ops(page)).at(-1)).toBe(9);
  expect(await page.locator('.pl-offer, [data-offer]').count()).toBe(offers);
  if (info.project.name !== 'landscape') {
    // desktop: the strip is display only (clicks pass to the field; no lock with a mouse)
    expect(await page.locator('.pl-strip.enemy .pp').first().evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');
    expect(await attr(page, 'lock')).toBe('');
  }
});

// (feel pass B3: the 844x390 phone layout, the lock row and the conditional last-hit and tower buttons are checked by
// hud-compact.spec.ts and hud-area.spec.ts)

async function touchDrag(page: Page, x0: number, y0: number, x1: number, y1: number, hold = 0): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  const tp = (x: number, y: number) => [{ x, y, id: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp(x0, y0) });
  for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tp(x0 + ((x1 - x0) * i) / 8, y0 + ((y1 - y0) * i) / 8) });
  if (hold) await page.waitForTimeout(hold);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

test('touch lock: tap an enemy hero, Attack sends Attack{id} on it; its portrait toggles the lock', async ({ page }, info) => {
  test.skip(info.project.name !== 'landscape', 'touch controls');
  test.setTimeout(180_000);
  await startVeteran(page, '&speed=2');
  await expect(page.locator('.pl-touch.on')).toBeVisible();
  const atk = (await page.locator('.pl-tbtn.attack').boundingBox())!;
  const deadline = Date.now() + 140_000;
  let locked = '';
  let tries = 0;
  while (Date.now() < deadline && !locked) {
    if ((await attr(page, 'screen')) === 'results') break;
    const foe = await attr(page, 'foeHero');
    const id = await attr(page, 'foeHeroId');
    const [fx, fy, fd] = foe.split(',').map(Number);
    // a foe on screen within 8 m, and not under the touch cluster or the top HUD band (a tap there hits a button)
    if (foe && id && fd < 8000 && !(fx > 560 && fy > 170) && fy > 110) {
      tries++;
      await page.touchscreen.tap(fx, fy);
      try {
        await expect.poll(() => attr(page, 'lock'), { timeout: 600 }).toBe(id);
        locked = id;
      } catch {
        // missed (it moved): a second tap on a hero that did lock would let go, so clear before the next try
        if (await attr(page, 'lock')) await page.touchscreen.tap(fx, fy);
      }
      continue;
    }
    await touchDrag(page, 150, 250, 230, 236, 600);
  }
  console.log(`lock: ${tries} tap(s)`);
  expect(locked, 'an enemy hero came within 8 m and a tap locked it').not.toBe('');
  const n0 = await attr(page, 'atkN');
  await page.touchscreen.tap(atk.x + atk.width / 2, atk.y + atk.height / 2);
  await expect.poll(() => attr(page, 'atkN')).not.toBe(n0);
  const pick = JSON.parse(await attr(page, 'atk'));
  console.log(`attack pick: lock ${pick.lock}, id ${pick.id}`);
  // the lock may have ended between the tap and the press (death, 9 m, 5 s): then the usual pick ran
  if (pick.lock !== null) {
    expect(pick.lock).toBe(Number(locked));
    expect(pick.id).toBe(Number(locked));
    expect(await ops(page)).toContain(3);
    await expect(page.locator(`.pl-strip .pp[data-slot="${locked}"]`)).toHaveClass(/locked/);
    // a tap on the locked hero's portrait lets go
    const pp = (await page.locator(`.pl-strip .pp[data-slot="${locked}"]`).boundingBox())!;
    await page.touchscreen.tap(pp.x + pp.width / 2, pp.y + pp.height / 2);
    await expect.poll(() => attr(page, 'lock')).toBe('');
    // the portrait locks it again (when still within 9 m), and the lock ends by itself after 5 s
    await page.touchscreen.tap(pp.x + pp.width / 2, pp.y + pp.height / 2);
    await page.waitForTimeout(150);
    if ((await attr(page, 'lock')) === locked) {
      await page.waitForTimeout(5200);
      expect(await attr(page, 'lock')).toBe('');
    }
  }
});
