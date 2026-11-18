import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { limit } from '../unit/cpu-budget';
import { serveSilhouettes } from './helpers';

// Home poster (docs/plans/moba/HOME-POSTER.md, founder pick #30 "Flat poster", Nov 18): the Home backdrop is a drawn
// poster, rose cats left and sky dogs right split by a halftone bolt. A cat champion stands big on the rose side with a
// dog rival's silhouette across the bolt; a dog champion is the mirror. The champion never sits under the Home HUD, at
// phone and desktop sizes and ultra-wide; switching to a champion of the other species swings the layout over.
// Screenshots go to ~/Downloads/paw-legends/lobby-v2/poster/ (POSTER_SHOTS overrides the folder).

const SHOTS = process.env.POSTER_SHOTS ?? `${homedir()}/Downloads/paw-legends/lobby-v2/poster`;
const SIZES = [
  [844, 390],
  [667, 375],
  [1440, 900],
  [2560, 1080],
] as const;
const HUD = ['.hm-profile', '.hm-cur', '.hm-corner', '.hm-left', '.hm-slot > *', '.hm-promo', '.hm-plate', '.hm-nav', '.hm-play', '.hm-line', '.lb-peek', '.lb-ver'];

async function seed(page: Page, hero: string, side: 'cat' | 'dog'): Promise<void> {
  await page.addInitScript((v) => {
    if (!localStorage.getItem('tt.pawlegends.profile.v1')) localStorage.setItem('tt.pawlegends.profile.v1', v);
  }, JSON.stringify({ v: 1, sessions: 3, matches: 6, wins: 3, firstWinDone: true, hero, side, firstPlaySession: 1 }));
  // the rival silhouettes stream from pawlegends.app: serve this checkout's files (offline, before the deploy)
  await serveSilhouettes(page);
}

/** `html[data-poster]` = side,flip,rival opacity; `html[data-poster-hero]` = the champion's drawn box (CSS px). */
async function poster(page: Page): Promise<{ side: string; flip: number; rival: number; box: number[] }> {
  return page.evaluate(() => {
    const [side, flip, rival] = (document.documentElement.dataset.poster ?? '').split(',');
    const box = (document.documentElement.dataset.posterHero ?? '').split(',').filter(Boolean).map(Number);
    return { side, flip: Number(flip), rival: Number(rival), box };
  });
}

async function hudRects(page: Page): Promise<{ sel: string; r: number[] }[]> {
  return page.evaluate((keys) => {
    const out: { sel: string; r: number[] }[] = [];
    for (const k of keys)
      for (const el of document.querySelectorAll<HTMLElement>(`.pl-home ${k}`)) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden') out.push({ sel: k, r: [r.left, r.top, r.right, r.bottom] });
      }
    return out;
  }, HUD);
}

const settled = (page: Page, side: string): Promise<unknown> =>
  expect
    .poll(async () => {
      const p = await poster(page);
      return p.side === side && Math.abs(p.flip) === 1 && p.rival === 1 && p.box.length === 4;
    }, { timeout: limit(30_000) })
    .toBe(true);

for (const [hero, side] of [
  ['clem', 'cat'],
  ['brutus', 'dog'],
] as const) {
  test(`poster: a ${side} champion (${hero}) big on its own side, clear of the HUD at every size`, async ({ browser }, info) => {
    test.skip(info.project.name !== 'desktop', 'sizes are set here');
    test.setTimeout(limit(240_000));
    mkdirSync(SHOTS, { recursive: true });
    const bad: string[] = [];
    for (const [w, h] of SIZES) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 1000, isMobile: w < 1000 });
      const page = await ctx.newPage();
      try {
        await seed(page, hero, side);
        await page.goto('/?e2e=1');
        await page.waitForSelector('html[data-screen="title"] .pl-home');
        await expect(page.locator('html')).toHaveAttribute('data-lobby-bg', 'poster');
        await settled(page, side);
        // the HUD entrance has played and the HUD-clear box is re-read
        await page.waitForTimeout(1200);
        await page.screenshot({ path: `${SHOTS}/${w}x${h}-${side}-${hero}.png` });
        const { box, flip } = await poster(page);
        const [l, t, r, b] = box;
        expect(flip).toBe(side === 'cat' ? 1 : -1);
        // its own side, inside the screen, and big (over 45% of the height)
        const cx = (l + r) / 2;
        if (side === 'cat') expect(cx, `${w}x${h}`).toBeLessThan(w / 2);
        else expect(cx, `${w}x${h}`).toBeGreaterThan(w / 2);
        expect(l).toBeGreaterThanOrEqual(-2);
        expect(r).toBeLessThanOrEqual(w + 2);
        expect(b - t, `${w}x${h} height`).toBeGreaterThan(h * 0.45);
        for (const { sel, r: q } of await hudRects(page)) {
          const over = Math.min(r, q[2]) - Math.max(l, q[0]) > 2 && Math.min(b, q[3]) - Math.max(t, q[1]) > 2;
          if (over) bad.push(`${w}x${h} ${hero} under ${sel}: hero ${box.join(',')} vs ${q.map(Math.round).join(',')}`);
        }
      } finally {
        await ctx.close();
      }
    }
    expect(bad, bad.join('\n')).toEqual([]);
  });
}

test('switching to a champion of the other species swings the poster to the mirror layout', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'one size is enough');
  test.setTimeout(limit(180_000));
  await page.setViewportSize({ width: 844, height: 390 });
  await seed(page, 'clem', 'cat');
  await page.goto('/?e2e=1');
  await page.waitForSelector('html[data-screen="title"] .pl-home');
  await settled(page, 'cat');
  const before = (await poster(page)).box;
  // the nameplate opens the champion browser; walk to a dog and SELECT it (Home follows in place)
  await page.locator('[data-testid="home-plate"]').click();
  const dlg = page.locator('.pl-champ[data-ready="1"]');
  await expect(dlg).toBeVisible({ timeout: limit(30_000) });
  const dogs = ['brutus', 'cacklejaw', 'nugget', 'marshmallow', 'bravo', 'chili', 'howler', 'rocket', 'frankie', 'domino', 'biscuit', 'champ', 'barkula', 'ranger'];
  for (let i = 0; i < 29 && !dogs.includes((await dlg.getAttribute('data-hero')) ?? ''); i++) await dlg.locator('.cb-next').click();
  const dog = (await dlg.getAttribute('data-hero'))!;
  expect(dogs).toContain(dog);
  // sample the flip through the swap: it passes between the two sides (an animation, not a cut)
  await page.evaluate(() => {
    const w = window as unknown as { __flips: number[] };
    w.__flips = [];
    new MutationObserver(() => w.__flips.push(Number((document.documentElement.dataset.poster ?? '').split(',')[1]))).observe(document.documentElement, { attributes: true, attributeFilter: ['data-poster'] });
  });
  await dlg.locator('[data-testid="hero-action"]').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.pl-champ')).toHaveCount(0);
  await settled(page, 'dog');
  const flips = await page.evaluate(() => (window as unknown as { __flips: number[] }).__flips);
  expect(flips.some((f) => f > -1 && f < 1), flips.join(',')).toBe(true);
  const after = (await poster(page)).box;
  expect((after[0] + after[2]) / 2).toBeGreaterThan(422);
  expect((before[0] + before[2]) / 2).toBeLessThan(422);
  await page.screenshot({ path: `${SHOTS}/844x390-swap-${dog}.png` });
});

test('reduced motion: the swap is a cut (no swing, no flicker)', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'one size is enough');
  test.setTimeout(limit(180_000));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seed(page, 'brutus', 'dog');
  await page.goto('/?e2e=1');
  await page.waitForSelector('html[data-screen="title"] .pl-home');
  await settled(page, 'dog');
  await page.evaluate(() => {
    const w = window as unknown as { __flips: number[] };
    w.__flips = [];
    new MutationObserver(() => w.__flips.push(Number((document.documentElement.dataset.poster ?? '').split(',')[1]))).observe(document.documentElement, { attributes: true, attributeFilter: ['data-poster'] });
  });
  await page.locator('[data-testid="home-plate"]').click();
  const dlg = page.locator('.pl-champ[data-ready="1"]');
  await expect(dlg).toBeVisible({ timeout: limit(30_000) });
  const cats = ['clem', 'sage', 'lambo', 'aviete', 'bengas', 'gabe', 'meatball', 'pixel', 'duchess', 'stilts', 'mochi', 'ziggy', 'nova', 'dusty'];
  for (let i = 0; i < 29 && !cats.includes((await dlg.getAttribute('data-hero')) ?? ''); i++) await dlg.locator('.cb-next').click();
  await dlg.locator('[data-testid="hero-action"]').click();
  await page.keyboard.press('Escape');
  await settled(page, 'cat');
  const flips = await page.evaluate(() => (window as unknown as { __flips: number[] }).__flips);
  expect(flips.every((f) => Math.abs(f) === 1), flips.join(',')).toBe(true);
});
