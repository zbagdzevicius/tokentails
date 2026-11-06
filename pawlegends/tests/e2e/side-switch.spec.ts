import { expect, test, type Page } from '@playwright/test';
import { attr, PROFILE_KEY, seedSide, startFirstMatch } from './helpers';

// Sim v13 (DOGS-V13 §2, gate 13): the CATS / DOGS switch on the pick screen. The switch filters the grid to one side
// (cats 10, dogs 7), choosing DOGS plays the dog side (the bots fill both teams by species, a dog team never fields a
// hero twice), the choice is remembered across a reload, the arrow keys move it, and at 667x375 and 844x390 the
// switch, the grid, the Paw Trick chips and Play sit inside the viewport with Play in the same place on both sides.
// The DOGS lock before match 1 has no UI path in e2e (a first-time player only sees "Play as Clem"); it is covered by
// tests/unit/side-switch.test.ts, and first-match.spec still checks match 1 opens on Clem.

const DOGS = ['brutus', 'cacklejaw', 'nugget', 'marshmallow', 'bravo', 'chili', 'howler'];
const CATS = ['clem', 'sage', 'lambo', 'aviete', 'bengas', 'gabe', 'meatball', 'pixel', 'duchess', 'stilts'];

const visibleTiles = (page: Page) => page.locator('.heroes:not([hidden]) .hero-card');

async function toPick(page: Page): Promise<void> {
  await page.goto('/?e2e=1');
  await page.waitForSelector('html[data-screen="title"]');
  await page.locator('[data-a="choose"]').click();
  await page.waitForSelector('html[data-screen="pick"]');
}

async function tapOrClick(page: Page, sel: string, touch: boolean): Promise<void> {
  if (touch) await page.locator(sel).tap();
  else await page.locator(sel).click();
}

test('DOGS shows the 7 dogs and plays the dog side with no duplicate on the team', async ({ page }, info) => {
  test.setTimeout(120_000);
  const touch = info.project.name === 'landscape';
  await seedSide(page, 'cat');
  await toPick(page);
  await expect(page.locator('html')).toHaveAttribute('data-pick-side', 'cat');
  await expect(visibleTiles(page)).toHaveCount(10);
  await expect(page.locator('.side-tab.dog')).toContainText('7');
  await expect(page.locator('.side-tab.dog')).not.toHaveAttribute('aria-disabled', 'true');

  await tapOrClick(page, '.side-tab.dog', touch);
  await expect(page.locator('html')).toHaveAttribute('data-pick-side', 'dog');
  await expect(page.locator('.side-tab.dog')).toHaveAttribute('aria-checked', 'true');
  await expect(visibleTiles(page)).toHaveCount(7);
  const ids = await visibleTiles(page).evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.h ?? ''));
  expect(ids.sort()).toEqual([...DOGS].sort());
  expect(await page.locator('.heroes:not([hidden])').getAttribute('data-side')).toBe('dog');
  // the selected hero is a dog (the side default, Sir Brutus); pick Chili
  await expect(page.locator('.hero-card.on')).toHaveAttribute('data-h', 'brutus');
  await tapOrClick(page, '[data-h="chili"]', touch);
  await expect(page.locator('.hero-card.on')).toHaveAttribute('data-h', 'chili');

  await tapOrClick(page, '.pl-pick-foot [data-a="start"]', touch);
  await page.waitForSelector('html[data-match="live"]');
  await expect(page.locator('html')).toHaveAttribute('data-sides', 'dogs');
  await page.waitForFunction(() => !!(window as unknown as { __plWorld?: unknown }).__plWorld);
  const team = await page.waitForFunction(
    () => {
      type E = { kind: string; team: number; hero?: string };
      const w = (window as unknown as { __plWorld: { view: { frame?: { latest: { team: number; entities: E[] } } } } }).__plWorld;
      const s = w.view.frame?.latest;
      if (!s) return null;
      const mine = s.entities.filter((e) => e.kind === 'hero' && e.team === s.team).map((e) => e.hero ?? '');
      return mine.length === 3 ? mine : null;
    },
    null,
    { timeout: 20_000 },
  );
  const picks = (await team.jsonValue()) as string[];
  expect(picks).toContain('chili');
  for (const h of picks) expect(DOGS).toContain(h);
  expect(new Set(picks).size).toBe(3);
});

test('the side and the hero are remembered across a reload; CATS brings back the last cat', async ({ page }) => {
  await seedSide(page, 'cat', { hero: 'sage' });
  await toPick(page);
  await expect(page.locator('.hero-card.on')).toHaveAttribute('data-h', 'sage');
  await page.locator('.side-tab.dog').click();
  await page.locator('[data-h="bravo"]').click();
  await expect(page.locator('.hero-card.on')).toHaveAttribute('data-h', 'bravo');
  const saved = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '{}') as { side?: string; lastBySide?: Record<string, string> }, PROFILE_KEY);
  expect(saved.side).toBe('dog');
  expect(saved.lastBySide).toMatchObject({ cat: 'sage', dog: 'bravo' });

  await page.reload();
  await page.waitForSelector('html[data-screen="title"]');
  await expect(page.locator('.pl-btn.big').first()).toContainText('Bravo');
  await page.locator('[data-a="choose"]').click();
  await page.waitForSelector('html[data-screen="pick"]');
  await expect(page.locator('html')).toHaveAttribute('data-pick-side', 'dog');
  await expect(page.locator('.hero-card.on')).toHaveAttribute('data-h', 'bravo');

  await page.locator('.side-tab.cat').click();
  await expect(page.locator('html')).toHaveAttribute('data-pick-side', 'cat');
  await expect(page.locator('.hero-card.on')).toHaveAttribute('data-h', 'sage');
  await expect(visibleTiles(page)).toHaveCount(10);
  const ids = await visibleTiles(page).evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.h ?? ''));
  expect(ids.sort()).toEqual([...CATS].sort());
});

test('the arrow keys move the switch (a radio group)', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'keyboard');
  await seedSide(page, 'cat');
  await toPick(page);
  await expect(page.locator('.side-switch')).toHaveAttribute('role', 'radiogroup');
  await page.locator('.side-tab.cat').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('html')).toHaveAttribute('data-pick-side', 'dog');
  await expect(page.locator('.side-tab.dog')).toBeFocused();
  await expect(page.locator('.side-tab.dog')).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('html')).toHaveAttribute('data-pick-side', 'cat');
  await expect(page.locator('.side-tab.cat')).toBeFocused();
  await expect(page.locator('.side-tab.cat')).toHaveAttribute('aria-checked', 'true');
});

for (const vp of [
  { width: 667, height: 375 },
  { width: 844, height: 390 },
]) {
  test(`at ${vp.width}x${vp.height} the switch, the grid, the Paw Trick chips and Play fit, and Play stays put`, async ({ page }, info) => {
    test.skip(info.project.name !== 'landscape', 'phone landscape');
    await page.setViewportSize(vp);
    await seedSide(page, 'cat');
    await toPick(page);
    const inside = async (sel: string): Promise<void> => {
      const boxes = await page.locator(sel).evaluateAll((els) =>
        els.filter((e) => (e as HTMLElement).offsetParent !== null).map((e) => {
          const r = e.getBoundingClientRect();
          return { l: r.left, t: r.top, r: r.right, b: r.bottom };
        }),
      );
      expect(boxes.length, sel).toBeGreaterThan(0);
      for (const b of boxes) {
        expect(b.l, sel).toBeGreaterThanOrEqual(-1);
        expect(b.t, sel).toBeGreaterThanOrEqual(-1);
        expect(b.r, sel).toBeLessThanOrEqual(vp.width + 1);
        expect(b.b, sel).toBeLessThanOrEqual(vp.height + 1);
      }
    };
    const playBox = () => page.locator('.pl-pick-foot [data-a="start"]').boundingBox();
    const fit = async (): Promise<void> => {
      await inside('.side-tab');
      await inside('.heroes:not([hidden]) .hero-card');
      await inside('.row.tricks .chip');
      await inside('.pl-pick-foot [data-a="start"]');
      // no name is cut with an ellipsis
      const cut = await page.locator('.heroes:not([hidden]) .hero-card b').evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent));
      expect(cut).toEqual([]);
      // the toggle is at least 32 px tall
      const tab = await page.locator('.side-tab.cat').boundingBox();
      expect(tab?.height ?? 0).toBeGreaterThanOrEqual(32);
    };
    await fit();
    const catPlay = await playBox();
    const catTricks = await page.locator('.row.tricks').boundingBox();
    await page.locator('.side-tab.dog').tap();
    await expect(page.locator('html')).toHaveAttribute('data-pick-side', 'dog');
    await fit();
    const dogPlay = await playBox();
    const dogTricks = await page.locator('.row.tricks').boundingBox();
    expect(dogPlay).toEqual(catPlay);
    expect(Math.abs((dogTricks?.y ?? 0) - (catTricks?.y ?? 0))).toBeLessThanOrEqual(1);
  });
}

test('quick play from the title as a dog (one tap) starts the dog side', async ({ page }) => {
  test.setTimeout(90_000);
  await startFirstMatch(page, '', 'dog');
  await expect.poll(() => attr(page, 'sides')).toBe('dogs');
});
