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

type Box = { x: number; y: number; width: number; height: number };
const overlaps = (a: Box, b: Box): boolean => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
/** Round controls: their discs touch (bounding boxes of neighbours on an arc overlap at the corners by design). */
const discsTouch = (a: Box, b: Box): boolean => Math.hypot(a.x + a.width / 2 - (b.x + b.width / 2), a.y + a.height / 2 - (b.y + b.height / 2)) < (a.width + b.width) / 2;

test('every match: the objective chip names the next timer, a tap sends its ping (no other order, no offer); strip and rings show', async ({ page }, info) => {
  await startVeteran(page);
  const chip = page.locator('.pl-goal.standing[data-ping]');
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

test('844x390: chip, strip and the optional last-hit and tower buttons stay clear of the controls and each other', async ({ page }, info) => {
  test.skip(info.project.name !== 'landscape', 'touch layout');
  await startVeteran(page, '', { 'pawlegends.lastHitButton': '1', 'pawlegends.towerButton': '1' });
  await expect(page.locator('.pl-touch.on')).toBeVisible();
  await expect(page.locator('.pl-tbtn.lasthit')).toBeVisible();
  await expect(page.locator('.pl-tbtn.tower')).toBeVisible();
  await expect(page.locator('.pl-goal.standing')).toBeVisible({ timeout: 10_000 });
  const vp = page.viewportSize()!;
  const boxes = async (sel: string): Promise<Box[]> => {
    const out: Box[] = [];
    for (const l of await page.locator(sel).all()) {
      const b = await l.boundingBox();
      if (b) out.push(b);
    }
    return out;
  };
  const buttons = await boxes('.pl-tbtn');
  const extra = await boxes('.pl-tbtn.lasthit, .pl-tbtn.tower');
  const fixed = [...(await boxes('.pl-pause')), ...(await boxes('.pl-minimap')), ...(await boxes('.pl-bar')), ...(await boxes('.pl-pingbtn'))];
  expect((await boxes('.pl-pingbtn')).length, 'GAPS B1 paw button on touch').toBe(1);
  const score = await boxes('.pl-score');
  const strip = await boxes('.pl-strip .pp');
  // the chip tucks under the score bar's rounded foot by design (it predates A4), so only the strip is held off it
  for (const p of strip) for (const c of buttons) expect(discsTouch(p, c)).toBe(false);
  const added = [...strip.map((b) => ({ b, against: [...fixed, ...score] })), ...(await boxes('.pl-goal.standing')).map((b) => ({ b, against: [...buttons, ...fixed, ...strip] }))];
  for (const { b: a, against } of added) {
    for (const c of against) expect(overlaps(a, c), `${JSON.stringify(a)} vs ${JSON.stringify(c)}`).toBe(false);
    expect(a.x >= 0 && a.y >= 0 && a.x + a.width <= vp.width && a.y + a.height <= vp.height).toBe(true);
  }
  // the two new buttons keep clear of every other button, the minimap, the hero box and the screen edges
  expect(extra.length).toBe(2);
  for (const a of extra) {
    expect(a.x >= 0 && a.y >= 0 && a.x + a.width <= vp.width && a.y + a.height <= vp.height, 'on screen').toBe(true);
    for (const c of fixed) expect(overlaps(a, c)).toBe(false);
    for (const c of buttons) if (c.x !== a.x || c.y !== a.y) expect(discsTouch(a, c), `${JSON.stringify(a)} vs ${JSON.stringify(c)}`).toBe(false);
  }
  // a level-up: the open talent card (its head and buttons, the same markup as src/ui/talents.ts) keeps clear of the strip
  await page.evaluate(() => {
    const t = document.querySelector<HTMLElement>('.pl-talents')!;
    t.innerHTML = `<div class="head">Level 2 talent: pick one</div><i class="time"></i>${[0, 1]
      .map((i) => `<button data-c="${i}"><kbd>${i + 1}</kbd><b>Talent ${i}</b><span class="d">A long talent line</span><span class="s">Short line</span></button>`)
      .join('')}`;
    t.classList.add('on');
  });
  await expect(page.locator('.pl-talents.on button')).toHaveCount(2);
  const talents = await boxes('.pl-talents.on .head, .pl-talents.on button');
  expect(talents.length).toBe(3);
  for (const p of await boxes('.pl-strip .pp')) for (const c of talents) expect(overlaps(p, c), `strip ${JSON.stringify(p)} vs talents ${JSON.stringify(c)}`).toBe(false);
});

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
