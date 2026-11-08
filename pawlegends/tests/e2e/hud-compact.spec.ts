import { expect, test, type Page } from '@playwright/test';
import { attr, me, startFirstMatch } from './helpers';

// Feel pass B3 (docs/plans/moba/FEEL-PASS.md, the phone HUD diet): one 24 px top strip (kills, clock, towers, the
// objective timer, pause), a 112 px minimap top left (104 px on short phones) with the ping corner and the emote under
// it, a 2-line kill feed beside it, the target-lock row by the cluster. Nothing persistent overlaps, every tap target
// answers 44 px, the joystick and the ping wheel stay usable. Screenshots: test-results/hud-compact/*.png.

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

/** Does a tap `d` px from `b`'s centre in each direction land on `sel`? (its 44 px hit area) */
async function answers(page: Page, sel: string, b: Box, d = 20): Promise<string> {
  return page.evaluate(
    ([s, cx, cy, r]) =>
      [[0, 0], [-r, 0], [r, 0], [0, -r], [0, r]]
        .map(([dx, dy]) => {
          // a point off the screen (the strip touches the top edge) cannot be tapped: skip it
          if (cy + dy < 0 || cx + dx < 0 || cy + dy > innerHeight || cx + dx > innerWidth) return 'ok';
          const h = document.elementFromPoint(cx + dx, cy + dy);
          return h?.closest(s) ? 'ok' : `${dx},${dy}:${h?.tagName}.${h?.className}`;
        })
        .join(' '),
    [sel, b.x + b.width / 2, b.y + b.height / 2, d] as const,
  );
}

for (const [width, height] of [
  [667, 375],
  [640, 360],
  [844, 390],
] as const) {
  const size = `${width}x${height}`;

  test(`${size} veteran: strip, minimap, feed, lock row, talent card, ping wheel and joystick keep clear; taps answer 44 px`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height });
    await startVeteran(page);
    await page.touchscreen.tap(width * 0.25, height * 0.85);
    await expect(page.locator('.pl-touch.on')).toBeVisible();
    await expect(page.locator('.pl-emote')).toBeVisible();
    // every conditional piece up: the lock row full, the last-hit and tower buttons (the match toggles them per frame)
    await page.addStyleTag({ content: "html[data-touch='1'] .pl-match .pl-top .pl-strip.enemy .pp { display: block !important; } html[data-touch='1'] .pl-match .pl-tbtn.gone { display: grid !important; }" });
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
    await page.waitForTimeout(150);
    const buttons = await boxes(page, '.pl-tbtn');
    const minimap = await boxes(page, '.pl-minimap');
    const paw = await boxes(page, '.pl-pingbtn');
    const emote = await boxes(page, '.pl-emote');
    const pause = await boxes(page, '.pl-pause');
    const strip = await boxes(page, '.pl-score');
    const feed = await boxes(page, '.pl-feed-row');
    const enemy = await boxes(page, '.pl-top .pl-strip.enemy .pp');
    // the strip: 24 px tall, at most 220 px wide, centred at the top; pause inside it
    expect(strip[0].height).toBeLessThanOrEqual(24.5);
    expect(strip[0].width).toBeLessThanOrEqual(220);
    expect(Math.abs(strip[0].x + strip[0].width / 2 - width / 2)).toBeLessThan(2);
    expect(overlaps(pause[0], strip[0])).toBe(true);
    // the minimap: top left, square, 112 px (104 on short phones)
    expect(minimap[0].x).toBeLessThan(20);
    expect(minimap[0].y).toBeLessThan(20);
    expect(Math.round(minimap[0].width)).toBe(height <= 380 ? 104 : 112);
    expect(Math.round(minimap[0].height)).toBe(Math.round(minimap[0].width));
    // the kill feed: 2 lines, right of the minimap
    expect(feed.length, 'feed lines').toBe(2);
    for (const f of feed) expect(f.x).toBeGreaterThanOrEqual(minimap[0].x + minimap[0].width);
    // nothing overlaps (the paw sits on the minimap's corner by design)
    const fixed = [...strip, ...minimap, ...emote, ...enemy];
    noOverlap('top band', fixed, fixed);
    noOverlap('paw', paw, [...strip, ...emote, ...enemy, ...buttons]);
    noOverlap('feed', feed, [...fixed, ...paw, ...buttons]);
    noOverlap('buttons', buttons, [...fixed, ...paw]);
    for (const p of enemy) for (const b of buttons) expect(discsTouch(p, b)).toBe(false);
    // the lock row sits low (below 80% of the height), 3 portraits
    expect(enemy.length).toBe(3);
    for (const p of enemy) expect(p.y).toBeGreaterThanOrEqual(height * 0.8);
    // tap targets: every ability button is ≥ 44 px; pause, paw, emote and each portrait answer a tap 20 px from their
    // centre in every direction (their 44 px area)
    for (const b of buttons) expect(Math.min(b.width, b.height), JSON.stringify(b)).toBeGreaterThanOrEqual(43.9);
    for (const [sel, b] of [['.pl-pause', pause[0]], ['.pl-pingbtn', paw[0]], ['.pl-emote', emote[0]]] as const) expect(await answers(page, sel, b), sel).toBe('ok ok ok ok ok');
    for (const p of enemy) expect(await answers(page, '.pp', p, 19)).toBe('ok ok ok ok ok');
    // a level-up: the open talent card (the markup of ui/talents.ts) keeps clear of the buttons and the top pieces
    await page.evaluate(() => {
      const t = document.querySelector<HTMLElement>('.pl-talents')!;
      t.innerHTML = `<div class="head">Level 3 talent: pick one</div><i class="time"></i>${[0, 1]
        .map((i) => `<button data-c="${i}"><kbd>${i + 1}</kbd><b>Talent ${i}</b><span class="d">A long talent line</span><span class="s">Short line here</span></button>`)
        .join('')}`;
      t.classList.add('on');
    });
    await page.waitForTimeout(300);
    const talents = await boxes(page, '.pl-talents.on button');
    expect(talents.length).toBe(2);
    noOverlap('talents', talents, [...buttons, ...fixed, ...paw]);
    for (const b of talents) expect(b.x >= 0 && b.y >= 0 && b.x + b.width <= width && b.y + b.height <= height, `on screen ${JSON.stringify(b)}`).toBe(true);
    // the announcement rail moves under the open card: its top is at or below every talent button's bottom
    const railTop = await page.evaluate(() => document.querySelector('.pl-rail')!.getBoundingClientRect().top);
    for (const b of talents) expect(railTop, `rail top vs ${JSON.stringify(b)}`).toBeGreaterThanOrEqual(b.y + b.height - 0.5);
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

test('the removed pieces stay removed on phones: no hero box, no ally portraits, no standing objective chip', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await startFirstMatch(page);
  await page.touchscreen.tap(844 * 0.25, 390 * 0.85);
  await expect(page.locator('.pl-touch.on')).toBeVisible();
  await page.waitForTimeout(1000);
  await expect(page.locator('.pl-bar')).toBeHidden();
  await expect(page.locator('.pl-strip.ally')).toBeHidden();
  // the R slot is a 44 px ghost chip before level 4
  const r = (await boxes(page, '.pl-tbtn.r.locked'))[0];
  expect(Math.round(r.width)).toBeLessThanOrEqual(45);
  // last-hit and tower show only with a target (none at the fountain)
  await expect(page.locator('.pl-tbtn.lasthit')).toBeHidden();
  await expect(page.locator('.pl-tbtn.tower')).toBeHidden();
  await page.screenshot({ path: `${SHOTS}/844x390-diet.png` });
});
