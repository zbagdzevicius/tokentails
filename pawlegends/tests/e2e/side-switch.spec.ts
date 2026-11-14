import { expect, test, type Page } from '@playwright/test';
import { attr, PROFILE_KEY, seedSide, startFirstMatch, toChampSelect } from './helpers';

// Sim v14 (DOGS-V13 §2, gate 13; DOGS-V15 §2: 10 v 10), champion select (LANDING-PICK-UX §B2.3): the All · Cats ·
// Dogs tabs filter the grid (cats 10, dogs 10); picking a dog plays the dog side (the bots fill both teams by species,
// a dog team never fields a hero twice), the hero and its side are remembered across a reload, the arrow keys move the
// tabs, and at 667x375 and 844x390 the tabs, the grid, the Paw Trick row and LOCK IN sit inside the viewport with LOCK
// IN in the same place on both sides.
// The DOGS lock before match 1 has no UI path in e2e (a first-time player only sees "Play as Clem"); it is covered by
// tests/unit/side-switch.test.ts, and first-match.spec still checks match 1 opens on Clem.

const DOGS = ['brutus', 'cacklejaw', 'nugget', 'marshmallow', 'bravo', 'chili', 'howler', 'rocket', 'frankie', 'domino'];
const CATS = ['clem', 'sage', 'lambo', 'aviete', 'bengas', 'gabe', 'meatball', 'pixel', 'duchess', 'stilts'];

const visibleTiles = (page: Page) => page.locator('.cs-grid .cs-tile:not([hidden])');

async function toPick(page: Page): Promise<void> {
  await page.goto('/?e2e=1');
  await page.waitForSelector('html[data-screen="title"]');
  await toChampSelect(page);
  await page.waitForSelector('html[data-screen="pick"]');
}

async function tapOrClick(page: Page, sel: string, touch: boolean): Promise<void> {
  if (touch) await page.locator(sel).tap();
  else await page.locator(sel).click();
}

test('DOGS shows the 10 dogs and plays the dog side with no duplicate on the team', async ({ page }, info) => {
  test.setTimeout(120_000);
  const touch = info.project.name === 'landscape';
  await seedSide(page, 'cat');
  await toPick(page);
  await expect(page.locator('html')).toHaveAttribute('data-pick-side', 'cat');
  await expect(visibleTiles(page)).toHaveCount(10);
  await expect(page.locator('.side-tab.dog')).toHaveAttribute('aria-label', /Dogs, 10 heroes$/);

  await tapOrClick(page, '.side-tab.dog', touch);
  // a tab filters only; the side follows the hero picked
  await expect(page.locator('html')).toHaveAttribute('data-pick-side', 'cat');
  await expect(page.locator('.side-tab.dog')).toHaveAttribute('aria-checked', 'true');
  await expect(visibleTiles(page)).toHaveCount(10);
  // the New tag marks heroes added in the current SIM_VERSION (isNewHero); sim v16 adds none, so the v15 dogs lost it
  const fresh = await page.locator('.cs-grid .cs-tile:not([hidden])[data-new="1"]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.h ?? ''));
  expect(fresh.sort()).toEqual([]);
  const ids = await visibleTiles(page).evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.h ?? ''));
  expect(ids.sort()).toEqual([...DOGS].sort());
  // one tap on Chili selects it (and the dog side)
  await tapOrClick(page, '.cs-tile[data-h="chili"]', touch);
  await expect(page.locator('.cs-tile.on')).toHaveAttribute('data-h', 'chili');
  await expect(page.locator('html')).toHaveAttribute('data-pick-side', 'dog');
  await expect(page.locator('.cs-panel')).toHaveAttribute('data-hero', 'chili');

  await tapOrClick(page, '.cs-fc [data-a="start"]', touch);
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

test('the side and the hero are remembered across a reload; the pick opens on the hero side', async ({ page }) => {
  await seedSide(page, 'cat', { hero: 'sage' });
  await toPick(page);
  await expect(page.locator('.cs-tile.on')).toHaveAttribute('data-h', 'sage');
  await page.locator('.side-tab.dog').click();
  await page.locator('.cs-tile[data-h="bravo"]').click();
  await expect(page.locator('.cs-tile.on')).toHaveAttribute('data-h', 'bravo');
  const saved = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '{}') as { side?: string; lastBySide?: Record<string, string> }, PROFILE_KEY);
  expect(saved.side).toBe('dog');
  expect(saved.lastBySide).toMatchObject({ cat: 'sage', dog: 'bravo' });

  await page.reload();
  await page.waitForSelector('html[data-screen="title"]');
  // the round PLAY button says only PLAY (v6 Home); the remembered hero is on Home's nameplate
  await expect(page.locator('[data-testid="home-plate"] .hm-plate-n')).toContainText('Bravo');
  await toChampSelect(page);
  await page.waitForSelector('html[data-screen="pick"]');
  await expect(page.locator('html')).toHaveAttribute('data-pick-side', 'dog');
  await expect(page.locator('.cs-tile.on')).toHaveAttribute('data-h', 'bravo');
  await expect(page.locator('.side-tab.dog')).toHaveAttribute('aria-checked', 'true');

  await page.locator('.side-tab.cat').click();
  await page.locator('.cs-tile[data-h="sage"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-pick-side', 'cat');
  await expect(page.locator('.cs-tile.on')).toHaveAttribute('data-h', 'sage');
  await expect(visibleTiles(page)).toHaveCount(10);
  const ids = await visibleTiles(page).evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.h ?? ''));
  expect(ids.sort()).toEqual([...CATS].sort());
});

test('the arrow keys move the side tabs (a radio group)', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'keyboard');
  await seedSide(page, 'cat');
  await toPick(page);
  await expect(page.locator('.side-switch')).toHaveAttribute('role', 'radiogroup');
  await page.locator('.side-tab.cat').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.side-tab.dog')).toBeFocused();
  await expect(page.locator('.side-tab.dog')).toHaveAttribute('aria-checked', 'true');
  await expect(visibleTiles(page)).toHaveCount(10);
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.side-tab.cat')).toBeFocused();
  await expect(page.locator('.side-tab.cat')).toHaveAttribute('aria-checked', 'true');
});

for (const vp of [
  { width: 667, height: 375 },
  { width: 844, height: 390 },
]) {
  test(`at ${vp.width}x${vp.height} the tabs, the grid, the Paw Trick row and LOCK IN fit, and LOCK IN stays put`, async ({ page }, info) => {
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
    const playBox = () => page.locator('.cs-fc [data-a="start"]').boundingBox();
    const fit = async (): Promise<void> => {
      await inside('.side-tab');
      await inside('.cs-grid .cs-tile:not([hidden])');
      await inside('.cs-trick');
      await inside('.cs-fc [data-a="start"]');
      // no name is cut with an ellipsis
      const cut = await page.locator('.cs-grid .cs-tile:not([hidden]) .cs-tn').evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent));
      expect(cut).toEqual([]);
      // the tabs are at least 32 px tall
      const tab = await page.locator('.side-tab.cat').boundingBox();
      expect(tab?.height ?? 0).toBeGreaterThanOrEqual(32);
    };
    await fit();
    const catPlay = await playBox();
    const catTricks = await page.locator('.cs-trow').boundingBox();
    await page.locator('.side-tab.dog').tap();
    await expect(page.locator('.side-tab.dog')).toHaveAttribute('aria-checked', 'true');
    await fit();
    const dogPlay = await playBox();
    const dogTricks = await page.locator('.cs-trow').boundingBox();
    expect(dogPlay).toEqual(catPlay);
    expect(Math.abs((dogTricks?.y ?? 0) - (catTricks?.y ?? 0))).toBeLessThanOrEqual(1);
  });
}

test('quick play from the title as a dog (one tap) starts the dog side', async ({ page }) => {
  test.setTimeout(90_000);
  await startFirstMatch(page, '', 'dog');
  await expect.poll(() => attr(page, 'sides')).toBe('dogs');
});
