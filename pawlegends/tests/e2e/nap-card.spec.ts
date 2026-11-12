import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { playFromHome, seedSide } from './helpers';

// The nap card (founder ask 2026-11-12: the dead-player card was Token Tails' card back; it should be Paw Legends'):
// a real bots match, the hero walks into the other base until it is knocked out, then the card shows the countdown,
// who did it and a tip, with no Token Tails, and sits clear of the minimap, the abilities and the Fish chip.
// Screenshots: test-results/nap-card/*.png.

const SHOTS = 'test-results/nap-card';
type Box = { x: number; y: number; width: number; height: number };
const overlap = (a: Box, b: Box): boolean => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

async function knockedOut(page: Page, info: TestInfo, tag: string): Promise<void> {
  await seedSide(page, 'cat', { matches: 3 });
  await page.goto('/?e2e=1');
  await page.waitForSelector('html[data-screen="title"]');
  await playFromHome(page, { difficulty: 'hard' });
  await page.waitForSelector('html[data-match="live"]');
  await page.waitForFunction(() => !!document.documentElement.dataset.me);
  await page.waitForFunction(() => !document.querySelector('.pl-loading:not(.out)'));
  // walk at the other base (the minimap's move order, e2e hook) until knocked out
  const deadline = Date.now() + 200_000;
  let dead = false;
  while (Date.now() < deadline && !dead) {
    await page.evaluate(() => {
      const w = window as unknown as { __plSide?: number; __plMinimap?: { host?: { moveTo(x: number, y: number): void } } };
      const [x] = (document.documentElement.dataset.me ?? '0').split(',').map(Number);
      if (!w.__plSide) w.__plSide = x < 50000 ? 1 : -1;
      w.__plMinimap?.host?.moveTo(w.__plSide > 0 ? 94000 : 6000, 30000);
    });
    dead = await page
      .waitForSelector('.pl-napcard.on', { timeout: 1500 })
      .then(() => true)
      .catch(() => false);
  }
  expect(dead, 'the hero was knocked out').toBe(true);
  // read everything at once: an early knockout is a short nap
  const seen = await page.evaluate(() => {
    const card = document.querySelector<HTMLElement>('.pl-napcard.on');
    if (!card) return null;
    const r = card.getBoundingClientRect();
    const others: { sel: string; x: number; y: number; width: number; height: number }[] = [];
    for (const sel of ['.pl-minimap', '.pl-bar', '.pl-slot', '.pl-fish', '.pl-touch .pl-tbtn', '.pl-touch button']) {
      for (const e of document.querySelectorAll(sel)) {
        const cs = getComputedStyle(e);
        const b = e.getBoundingClientRect();
        if (cs.display !== 'none' && cs.visibility !== 'hidden' && b.width > 0 && b.height > 0) others.push({ sel, x: b.x, y: b.y, width: b.width, height: b.height });
      }
    }
    const q = (s: string) => card.querySelector(s);
    return {
      box: { x: r.x, y: r.y, width: r.width, height: r.height },
      others,
      kicker: q('.nc-kicker')?.textContent ?? '',
      secs: Number(q('.nc-secs')?.textContent ?? '0'),
      recap: q('.nc-recap')?.textContent ?? '',
      medals: card.querySelectorAll('.nc-medal.hero, .nc-medal.tower, .nc-medal.paw').length,
      line: q('.nc-line')?.textContent ?? '',
      img: q('img')?.getAttribute('src') ?? '',
      html: card.outerHTML,
      oldCard: document.querySelectorAll('.tt-respawn, .tt-back').length,
    };
  });
  await page.screenshot({ path: `${SHOTS}/${info.project.name}${tag}.png` });
  expect(seen).toBeTruthy();
  const v = seen!;
  expect(v.kicker).toBe('Napping at the fountain');
  expect(v.secs).toBeGreaterThanOrEqual(1);
  expect(v.recap).toMatch(/^Knocked out by /);
  expect(v.medals).toBe(1);
  expect(v.line.length).toBeGreaterThan(10);
  expect(v.img).toMatch(/splash\/clem-360\.webp$/);
  expect(v.html).not.toMatch(/token\s?tails|tt-card|tt-back|tt-flip|data-tier/i);
  // the old Token Tails respawn card never mounts
  expect(v.oldCard).toBe(0);
  const vw = page.viewportSize()!;
  expect(v.box.x).toBeGreaterThanOrEqual(0);
  expect(v.box.x + v.box.width).toBeLessThanOrEqual(vw.width);
  for (const b of v.others) expect(overlap(v.box, b), `nap card over ${b.sel}`).toBe(false);
}

test('knocked out: the nap card shows the countdown, the killer and a tip, no Token Tails, clear of the HUD', async ({ page }, info) => {
  test.setTimeout(240_000);
  await knockedOut(page, info, '');
});

// review 2026-11-12: at 667 x 375 the centred card covered the (locked) ult button, which sits near the middle there
test.describe('small phone', () => {
  test.use({ viewport: { width: 667, height: 375 } });
  test('knocked out at 667 x 375: the nap card stays clear of the touch buttons', async ({ page }, info) => {
    test.skip(info.project.name !== 'landscape', 'touch layout only');
    test.setTimeout(240_000);
    await knockedOut(page, info, '-667');
  });
});
