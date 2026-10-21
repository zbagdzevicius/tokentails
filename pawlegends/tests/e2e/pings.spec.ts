import { expect, test, type Page } from '@playwright/test';
import { attr, ops } from './helpers';

// GAPS B1: command pings. Desktop: hold G for the wheel (point at a slice, release G), Alt-click pings Go here on the
// ground. Touch: the paw button by the minimap opens a six-slice wheel, a long press on the minimap pings Go here, a
// long press on an enemy portrait pings Focus hero. The allied bots answer (bark) and the ping goes out as Op.Ping (9).
// Match 2 shows one ping tip.

const VETERAN = { v: 1, sessions: 3, matches: 5, wins: 2, firstWinDone: true, hero: 'sage', trick: 'hiss', difficulty: 'normal', veteran: true };

async function start(page: Page, profile: Record<string, unknown> = VETERAN, query = ''): Promise<void> {
  await page.addInitScript((p) => localStorage.setItem('tt.pawlegends.profile.v1', JSON.stringify(p)), profile);
  await page.goto(`/?e2e=1${query}`);
  await page.waitForSelector('html[data-screen="title"]');
  await page.locator('.pl-btn.big').first().click();
  await page.waitForSelector('html[data-match="live"]');
  await page.waitForFunction(() => !!document.documentElement.dataset.me);
  await page.waitForFunction(() => !document.querySelector('.pl-loading:not(.out)'));
}

const barks = async (page: Page): Promise<string[]> => (await attr(page, 'barks')).split(',').filter(Boolean);

test('desktop: hold G, point up, release: Group on me goes out and both allies answer; Alt-click pings Go here', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'desktop controls');
  await start(page);
  await page.mouse.move(640, 400);
  await page.keyboard.down('g');
  await expect(page.locator('.pl-pingwheel.on')).toBeVisible();
  await expect(page.locator('.pl-pingwheel .slice')).toHaveCount(6);
  await page.mouse.move(640, 320, { steps: 4 });
  await expect(page.locator('.pl-pingwheel .slice.hot')).toHaveAttribute('data-kind', 'group');
  await page.keyboard.up('g');
  await expect(page.locator('.pl-pingwheel.on')).toHaveCount(0);
  await expect.poll(() => attr(page, 'pingsSent')).toBe('1');
  // a second ping inside the debounce (1.5 s) is held on the client (the sim would drop it)
  await page.keyboard.down('Alt');
  await page.mouse.click(700, 420);
  await page.keyboard.up('Alt');
  expect(await attr(page, 'pingsSent')).toBe('1');
  await expect.poll(async () => (await ops(page)).at(-1)).toBe(9);
  // both allied bots are healthy at the start: they take it ("ok")
  await expect.poll(async () => (await barks(page)).sort().join(',')).toBe('1:ok,2:ok');
  await page.waitForTimeout(1600);
  await page.keyboard.down('Alt');
  await page.mouse.click(700, 420);
  await page.keyboard.up('Alt');
  await expect.poll(() => attr(page, 'pingsSent')).toBe('2');
  await expect.poll(async () => (await barks(page)).length).toBe(4);
});

test('touch: the paw button opens the wheel, a slice sends it; long presses on the minimap and an enemy portrait ping', async ({ page }, info) => {
  test.skip(info.project.name !== 'landscape', 'touch controls');
  await start(page);
  await expect(page.locator('.pl-touch.on')).toBeVisible();
  const paw = page.locator('.pl-pingbtn');
  await expect(paw).toBeVisible();
  const pb = (await paw.boundingBox())!;
  await page.touchscreen.tap(pb.x + pb.width / 2, pb.y + pb.height / 2);
  await expect(page.locator('.pl-pingwheel.on')).toBeVisible();
  // every slice is on screen and big enough to tap
  const vp = page.viewportSize()!;
  for (const l of await page.locator('.pl-pingwheel .slice').all()) {
    const b = (await l.boundingBox())!;
    expect(b.x >= 0 && b.y >= 0 && b.x + b.width <= vp.width && b.y + b.height <= vp.height).toBe(true);
    expect(b.height).toBeGreaterThanOrEqual(40);
  }
  const defend = (await page.locator('.pl-pingwheel .slice[data-kind="defend"]').boundingBox())!;
  await page.touchscreen.tap(defend.x + defend.width / 2, defend.y + defend.height / 2);
  await expect(page.locator('.pl-pingwheel.on')).toHaveCount(0);
  await expect.poll(() => attr(page, 'pingsSent')).toBe('1');
  await expect.poll(async () => (await barks(page)).length).toBe(2);
  // a long press on the minimap: Go here
  await page.waitForTimeout(1600);
  const mm = (await page.locator('.pl-minimap canvas').boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  const press = async (x: number, y: number, ms: number): Promise<void> => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
    await page.waitForTimeout(ms);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  await press(mm.x + mm.width * 0.4, mm.y + mm.height * 0.5, 700);
  await expect.poll(() => attr(page, 'pingsSent')).toBe('2');
  // a long press on an enemy portrait: Focus hero (the tap's lock comes with it)
  await page.waitForTimeout(1600);
  const pp = (await page.locator('.pl-top .pl-strip.enemy .pp').first().boundingBox())!;
  await press(pp.x + pp.width / 2, pp.y + pp.height / 2, 700);
  await expect.poll(() => attr(page, 'pingsSent')).toBe('3');
  await expect.poll(async () => (await ops(page)).filter((o) => o === 9).length).toBe(3);
});

test('match 2 shows the ping tip once', async ({ page }) => {
  test.setTimeout(120_000);
  await start(page, { v: 1, sessions: 1, matches: 1, wins: 1, firstWinDone: true, hero: 'clem' }, '&speed=8');
  await expect.poll(() => attr(page, 'pingTip'), { timeout: 60_000 }).toBe('1');
  // ftue-2: the flag is set only once the banner is on screen, and it holds long enough to read (5.5 s, not 2.1 s)
  expect(await attr(page, 'banner')).toBe('Tell your team what to do');
  await page.waitForTimeout(3_000);
  expect(await attr(page, 'banner')).toBe('Tell your team what to do');
});

// ftue-1: the Wave emote (Treat Track unlock after the first win) must never cover the paw or the minimap on phones.
for (const [width, height] of [
  [740, 360],
  [844, 390],
] as const) {
  test(`touch ${width}x${height} with the Wave emote: the paw stays on top and opens the wheel`, async ({ page }, info) => {
    test.skip(info.project.name !== 'landscape', 'touch controls');
    await page.setViewportSize({ width, height });
    await start(page, { ...VETERAN, unlocks: ['emote.wave'] });
    const paw = page.locator('.pl-pingbtn');
    const emote = page.locator('.pl-emote');
    await expect(paw).toBeVisible();
    await expect(emote).toBeVisible();
    const layout = await page.evaluate(() => {
      const box = (s: string): DOMRect => document.querySelector(s)!.getBoundingClientRect();
      const hit = (a: DOMRect, b: DOMRect): boolean =>
        Math.min(a.right, b.right) > Math.max(a.left, b.left) && Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top);
      const p = box('.pl-pingbtn');
      const e = box('.pl-emote');
      const top = [0.25, 0.5, 0.75].map((f) => !!document.elementFromPoint(p.x + p.width * f, p.y + p.height / 2)?.closest('.pl-pingbtn'));
      return { top, paw: hit(e, p), minimap: hit(e, box('.pl-minimap')), onScreen: e.left >= 0 && e.bottom <= innerHeight };
    });
    expect(layout).toEqual({ top: [true, true, true], paw: false, minimap: false, onScreen: true });
    // the emote still answers its own tap
    const eb = (await emote.boundingBox())!;
    await page.touchscreen.tap(eb.x + eb.width / 2, eb.y + eb.height / 2);
    await expect.poll(() => attr(page, 'emotes')).toBe('1');
    // and the paw opens the ping wheel, not the emote
    const pb = (await paw.boundingBox())!;
    await page.touchscreen.tap(pb.x + pb.width / 2, pb.y + pb.height / 2);
    await expect(page.locator('.pl-pingwheel.on')).toBeVisible();
    expect(await attr(page, 'emotes')).toBe('1');
  });
}
