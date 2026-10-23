import { expect, test, type Page } from '@playwright/test';
import { attr, me, startFirstMatch } from './helpers';

// LAUNCH-READY U2 (decision G22, compact HUD): on small landscape phones (below 700 px wide, or ≤ 380 px tall under
// 844 px) the self panel is smaller and the enemy portraits sit under the score. Nothing in the top band overlaps,
// the minimap, the ability buttons, the joystick and the ping wheel stay usable, and every tap target is ≥ 44 px.
// 844×390 keeps the layout it had. Screenshots: test-results/hud-compact/*.png (read them after a layout change).

const VETERAN = { v: 1, sessions: 3, matches: 5, wins: 2, firstWinDone: true, hero: 'sage', trick: 'hiss', difficulty: 'normal', veteran: true };
const SHOTS = 'test-results/hud-compact';

type Box = { x: number; y: number; width: number; height: number };
const overlaps = (a: Box, b: Box): boolean => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
const discsTouch = (a: Box, b: Box): boolean => Math.hypot(a.x + a.width / 2 - (b.x + b.width / 2), a.y + a.height / 2 - (b.y + b.height / 2)) < (a.width + b.width) / 2;

async function startVeteran(page: Page): Promise<void> {
  await page.addInitScript((p) => localStorage.setItem('tt.pawlegends.profile.v1', JSON.stringify(p)), { ...VETERAN, unlocks: ['emote.wave'] });
  await page.goto('/?e2e=1');
  await page.waitForSelector('html[data-screen="title"]');
  await page.locator('.pl-btn.big').first().click();
  await page.waitForSelector('html[data-match="live"]');
  await page.waitForFunction(() => !!document.documentElement.dataset.me);
  await page.waitForFunction(() => !document.querySelector('.pl-loading:not(.out)'));
}

async function boxes(page: Page, sel: string): Promise<Box[]> {
  return page.evaluate((s) => {
    return [...document.querySelectorAll<HTMLElement>(s)]
      .filter((e) => e.offsetParent !== null || getComputedStyle(e).position === 'fixed')
      .map((e) => e.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0)
      .map((r) => ({ x: r.x, y: r.y, width: r.width, height: r.height }));
  }, sel);
}

function noOverlap(label: string, a: Box[], b: Box[]): void {
  for (const x of a) for (const y of b) if (x !== y) expect(overlaps(x, y), `${label}: ${JSON.stringify(x)} vs ${JSON.stringify(y)}`).toBe(false);
}

async function touchDrag(page: Page, x0: number, y0: number, x1: number, y1: number, hold = 0): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  const tp = (x: number, y: number) => [{ x, y, id: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp(x0, y0) });
  for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tp(x0 + ((x1 - x0) * i) / 8, y0 + ((y1 - y0) * i) / 8) });
  if (hold) await page.waitForTimeout(hold);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

test.beforeEach(({}, info) => test.skip(info.project.name !== 'landscape', 'touch layout'));

for (const [width, height] of [
  [667, 375],
  [640, 360],
] as const) {
  const size = `${width}x${height}`;

  test(`${size} first match: compact top band, the goal chip under the enemy portraits`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await startFirstMatch(page);
    await expect(page.locator('.pl-touch.on')).toBeVisible();
    await expect(page.locator('.pl-goal.on')).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${SHOTS}/${size}-first-match.png` });
    const bar = (await boxes(page, '.pl-bar'))[0];
    const pause = (await boxes(page, '.pl-pause'))[0];
    const score = (await boxes(page, '.pl-score'))[0];
    const enemy = await boxes(page, '.pl-top .pl-strip.enemy .pp');
    const goal = await boxes(page, '.pl-goal.on');
    // the compact panel, under the 222 × 58 one of 844×390
    expect(bar.width).toBeLessThanOrEqual(160);
    expect(bar.height).toBeLessThanOrEqual(46);
    expect(enemy.length).toBe(3);
    // the enemy portraits are under the score, inside its width
    for (const p of enemy) {
      expect(p.y).toBeGreaterThanOrEqual(score.y + score.height);
      expect(p.x).toBeGreaterThanOrEqual(score.x);
      expect(p.x + p.width).toBeLessThanOrEqual(score.x + score.width);
    }
    const top = [bar, pause, score, ...enemy, ...(await boxes(page, '.pl-strip.ally .pp')), ...(await boxes(page, '.pl-minimap')), ...(await boxes(page, '.pl-pingbtn'))];
    noOverlap('top band', top, top);
    noOverlap('goal chip', goal, [...top, ...(await boxes(page, '.pl-tbtn'))]);
    for (const b of [...top, ...goal]) expect(b.x >= 0 && b.y >= 0 && b.x + b.width <= width && b.y + b.height <= height, `on screen ${JSON.stringify(b)}`).toBe(true);
  });

  test(`${size} veteran: emote, kill feed, talent card, ping wheel and joystick keep clear; taps are ≥ 44 px`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height });
    await startVeteran(page);
    await expect(page.locator('.pl-touch.on')).toBeVisible();
    await expect(page.locator('.pl-emote')).toBeVisible();
    // a full kill feed (four lines, the most the HUD keeps), the same markup as ui/hud.ts kill() and note()
    await page.evaluate(() => {
      const feed = document.querySelector('.pl-feed')!;
      const rows = [
        '<div class="pl-feed-row good"><b style="color:#ffd34d">You</b><span></span><b style="color:#ff4d5e">Sir Brutus</b></div>',
        '<div class="pl-feed-row note"><span></span><b>Blaze cheered your takedown, what a play</b></div>',
        '<div class="pl-feed-row bad"><b style="color:#ff4d5e">Cacklejaw</b><span></span><b style="color:#3fd0c9">Sage</b></div>',
        '<div class="pl-feed-row good"><b style="color:#3fd0c9">Clem</b><span></span><b style="color:#ff4d5e">Lambo</b></div>',
      ];
      feed.innerHTML = rows.join('');
    });
    const buttons = await boxes(page, '.pl-tbtn');
    const minimap = await boxes(page, '.pl-minimap');
    const paw = await boxes(page, '.pl-pingbtn');
    const emote = await boxes(page, '.pl-emote');
    const pause = await boxes(page, '.pl-pause');
    const feed = await boxes(page, '.pl-feed-row');
    const enemy = await boxes(page, '.pl-top .pl-strip.enemy .pp');
    const fixed = [...(await boxes(page, '.pl-bar')), ...pause, ...(await boxes(page, '.pl-score')), ...enemy, ...(await boxes(page, '.pl-strip.ally .pp')), ...minimap, ...paw, ...emote];
    expect(feed.length, 'two feed lines on a small phone').toBe(2);
    noOverlap('top band', fixed, fixed);
    noOverlap('feed', feed, [...fixed, ...buttons]);
    noOverlap('buttons', buttons, fixed);
    for (const p of enemy) for (const b of buttons) expect(discsTouch(p, b)).toBe(false);
    // tap targets: pause, paw, emote and every ability button are ≥ 44 px; each enemy portrait answers a tap 21 px
    // from its centre in every direction (its 44 px area)
    for (const b of [...pause, ...paw, ...emote, ...buttons]) expect(Math.min(b.width, b.height), JSON.stringify(b)).toBeGreaterThanOrEqual(44);
    const hits = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('.pl-top .pl-strip.enemy .pp')].map((el) => {
        const r = el.getBoundingClientRect();
        const cx = r.x + r.width / 2;
        const cy = r.y + r.height / 2;
        return [[0, 0], [-21, 0], [21, 0], [0, -21], [0, 21]].map(([dx, dy]) => { const h = document.elementFromPoint(cx + dx, cy + dy); return h?.closest('.pp') === el ? 'ok' : `${dx},${dy}:${h?.tagName}`; }).join(' ');
      }),
    );
    expect(hits).toEqual(Array(3).fill('ok ok ok ok ok'));
    // the paw and the emote are on top of whatever is under them
    for (const [sel, b] of [['.pl-pingbtn', paw[0]], ['.pl-emote', emote[0]], ['.pl-pause', pause[0]]] as const) {
      expect(await page.evaluate(([s, x, y]) => !!document.elementFromPoint(x, y)?.closest(s), [sel, b.x + b.width / 2, b.y + b.height / 2] as const), sel).toBe(true);
    }
    // a level-up: the open talent card (the markup of ui/talents.ts) keeps clear of the buttons and the portraits
    await page.evaluate(() => {
      const t = document.querySelector<HTMLElement>('.pl-talents')!;
      t.innerHTML = `<div class="head">Level 3 talent: pick one</div><i class="time"></i>${[0, 1]
        .map((i) => `<button data-c="${i}"><kbd>${i + 1}</kbd><b>Talent ${i}</b><span class="d">A long talent line</span><span class="s">Short line here</span></button>`)
        .join('')}`;
      t.classList.add('on');
    });
    await page.waitForTimeout(300);
    const talents = await boxes(page, '.pl-talents.on .head, .pl-talents.on button');
    expect(talents.length).toBe(3);
    noOverlap('talents', talents, [...buttons, ...fixed, ...feed]);
    for (const b of talents) expect(b.x >= 0 && b.y >= 0 && b.x + b.width <= width && b.y + b.height <= height, `on screen ${JSON.stringify(b)}`).toBe(true);
    await page.screenshot({ path: `${SHOTS}/${size}-veteran.png` });
    await page.evaluate(() => {
      const t = document.querySelector<HTMLElement>('.pl-talents')!;
      t.classList.remove('on');
      t.innerHTML = '';
    });

    // the joystick: a drag in the lower left starts on the field (no HUD under it) and walks the hero
    expect(await page.evaluate(([x, y]) => { const h = document.elementFromPoint(x, y); return h?.tagName === 'CANVAS' || !!h?.closest('.pl-touch'); }, [120, height - 110] as const)).toBe(true);
    const a = await me(page);
    await touchDrag(page, 120, height - 110, 200, height - 130, 1500);
    await expect.poll(async () => (await me(page)).x, { timeout: 10_000 }).toBeGreaterThan(a.x + 1000);

    // the ping wheel: every slice on screen and ≥ 44 px tall, a slice sends the ping
    const pb = paw[0];
    await page.touchscreen.tap(pb.x + pb.width / 2, pb.y + pb.height / 2);
    await expect(page.locator('.pl-pingwheel.on')).toBeVisible();
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${SHOTS}/${size}-ping-wheel.png` });
    const slices = await boxes(page, '.pl-pingwheel .slice');
    expect(slices.length).toBe(6);
    for (const b of slices) {
      expect(b.x >= 0 && b.y >= 0 && b.x + b.width <= width && b.y + b.height <= height, `slice on screen ${JSON.stringify(b)}`).toBe(true);
      expect(b.height).toBeGreaterThanOrEqual(44);
    }
    const defend = (await page.locator('.pl-pingwheel .slice[data-kind="defend"]').boundingBox())!;
    await page.touchscreen.tap(defend.x + defend.width / 2, defend.y + defend.height / 2);
    await expect(page.locator('.pl-pingwheel.on')).toHaveCount(0);
    await expect.poll(() => attr(page, 'pingsSent')).toBe('1');
  });
}

// Larger phones keep the layout they had before the compact HUD (the numbers of 844×390 at 323ab118).
test('844x390 keeps the full touch HUD', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await startVeteran(page);
  await expect(page.locator('.pl-touch.on')).toBeVisible();
  const r = (b: Box): number[] => [b.x, b.y, b.width, b.height].map(Math.round);
  expect(r((await boxes(page, '.pl-bar'))[0])).toEqual([16, 10, 222, 58]);
  expect(r((await boxes(page, '.pl-portrait'))[0])).toEqual([23, 17, 44, 44]);
  expect(r((await boxes(page, '.pl-pause'))[0])).toEqual([254, 10, 40, 40]);
  expect(r((await boxes(page, '.pl-score'))[0])).toEqual([275, 8, 294, 54]);
  expect(r((await boxes(page, '.pl-top .pl-strip.enemy'))[0])).toEqual([577, 12, 98, 30]);
  expect(r((await boxes(page, '.pl-strip.ally'))[0])).toEqual([80, 70, 72, 34]);
  await page.screenshot({ path: `${SHOTS}/844x390-unchanged.png` });
});
