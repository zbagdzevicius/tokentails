import { expect, test } from '@playwright/test';
import { attr, seedSide, startFirstMatch, toChampSelect } from './helpers';

// Sim v29 roster (docs/plans/moba/ROSTER-V29.md): the four new champions are in the champion select and the champion
// browser (with their art and words), and each one starts a match as itself on its own side; on touch a plain tap on
// Q casts at once (founder rule: zero friction).

const ROSTER = [
  { hero: 'mochi', name: 'Mochi', side: 'cat' as const, sides: 'cats', ult: 'LULLABY' },
  { hero: 'ziggy', name: 'Ziggy', side: 'cat' as const, sides: 'cats', ult: 'ZIGZAG STORM' },
  { hero: 'biscuit', name: 'Biscuit', side: 'dog' as const, sides: 'dogs', ult: 'WALKIES!' },
  { hero: 'champ', name: 'Champ', side: 'dog' as const, sides: 'dogs', ult: 'KNOCKOUT!' },
];

test('the champion select and browser show the four new champions, tagged New, with their kit', async ({ page }, info) => {
  test.setTimeout(300_000);
  const touch = info.project.name === 'landscape';
  for (const r of ROSTER) {
    await seedSide(page, r.side);
    await page.goto('/?e2e=1');
    await page.waitForSelector('html[data-screen="title"]');
    await toChampSelect(page);
    await page.waitForSelector('html[data-screen="pick"]');
    const tile = page.locator(`.cs-tile[data-h="${r.hero}"]`);
    // the pick remembers the last side tab: open this hero's side
    const tab = page.locator(`.cs-tab.side-tab[data-side="${r.side}"]`);
    if (touch) await tab.tap();
    else await tab.click();
    await expect(tile).toBeVisible();
    await expect(tile).toHaveAttribute('data-new', '1');
    if (touch) await tile.tap();
    else await tile.click();
    await expect(page.locator('.cs-panel')).toHaveAttribute('data-hero', r.hero);
    const codex = page.locator('.cs-panel [data-a="codex"]').first();
    if (touch) await codex.tap();
    else await codex.click();
    const dlg = page.locator('.pl-champ[data-ready="1"]');
    await expect(dlg).toBeVisible({ timeout: 30_000 });
    await expect(dlg.locator('.cb-name')).toHaveText(r.name);
    const ult = dlg.locator('.cb-skill-btn[data-slot="r"]');
    if (touch) await ult.tap();
    else await ult.click();
    await expect(dlg.locator('.cb-card')).toContainText(r.ult.replace('!', ''));
    await page.screenshot({ path: `test-results/roster-v29-${r.hero}-${info.project.name}.png` });
    await page.keyboard.press('Escape');
  }
});

for (const r of ROSTER) {
  test(`${r.hero}: plays its own side; Q casts`, async ({ page }, info) => {
    test.setTimeout(180_000);
    const touch = info.project.name === 'landscape';
    if (touch) await page.setViewportSize({ width: 844, height: 390 });
    await seedSide(page, r.side, { hero: r.hero, lastBySide: { [r.side]: r.hero } });
    await startFirstMatch(page);
    await expect(page.locator('html')).toHaveAttribute('data-sides', r.sides);
    const mine = await page.waitForFunction((h) => {
      type E = { kind: string; team: number; slot?: number; hero?: string };
      const w = (window as unknown as { __plWorld?: { view: { mySlot: number; frame?: { latest: { entities: E[] } } } } }).__plWorld;
      const s = w?.view.frame?.latest;
      if (!s) return null;
      const me = s.entities.find((e) => e.kind === 'hero' && e.slot === w!.view.mySlot);
      return me?.hero === h ? me.hero : null;
    }, r.hero);
    expect(await mine.jsonValue()).toBe(r.hero);
    const before = Number(await attr(page, 'casts'));
    if (touch) {
      await expect(page.locator('.pl-touch.on')).toBeVisible();
      const q = (await page.locator('.pl-tbtn.q').boundingBox())!;
      await page.touchscreen.tap(q.x + q.width / 2, q.y + q.height / 2);
    } else {
      const vp = page.viewportSize()!;
      await page.mouse.move(vp.width / 2 + 120, vp.height / 2);
      await page.keyboard.press('q');
    }
    await expect.poll(async () => Number(await attr(page, 'casts')), { timeout: 8000 }).toBeGreaterThan(before);
    await page.screenshot({ path: `test-results/roster-v29-match-${r.hero}-${info.project.name}.png` });
  });
}
