import { expect, test } from '@playwright/test';
import { attr, seedSide, startFirstMatch } from './helpers';

// Sim v15 (DOGS-V15 §6, gate 13; founder rule: zero friction on mobile). On 844×390 touch each new dog starts a
// match as itself on the dog side, and one plain tap on Q casts at once: no drag, no confirm, no dwell (Q is the
// skill a level-1 hero has; W, E and R share the same tap path in input/touch.ts and their per-hero tap fallbacks are
// unit-tested in src/input/aims/<id>.ts).

test.beforeEach(({}, info) => test.skip(info.project.name !== 'landscape', 'touch controls'));

for (const hero of ['rocket', 'frankie', 'domino']) {
  test(`${hero}: plays the dog side, and a tap on Q casts at once`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 844, height: 390 });
    await seedSide(page, 'dog', { hero, lastBySide: { dog: hero } });
    await startFirstMatch(page);
    await expect(page.locator('html')).toHaveAttribute('data-sides', 'dogs');
    const mine = await page.waitForFunction((h) => {
      type E = { kind: string; team: number; slot?: number; hero?: string };
      const w = (window as unknown as { __plWorld?: { view: { mySlot: number; frame?: { latest: { entities: E[] } } } } }).__plWorld;
      const s = w?.view.frame?.latest;
      if (!s) return null;
      const me = s.entities.find((e) => e.kind === 'hero' && e.slot === w!.view.mySlot);
      return me?.hero === h ? me.hero : null;
    }, hero);
    expect(await mine.jsonValue()).toBe(hero);
    await expect(page.locator('.pl-touch.on')).toBeVisible();
    const before = Number(await attr(page, 'casts'));
    const q = (await page.locator('.pl-tbtn.q').boundingBox())!;
    await page.touchscreen.tap(q.x + q.width / 2, q.y + q.height / 2);
    await expect.poll(async () => Number(await attr(page, 'casts')), { timeout: 5000 }).toBe(before + 1);
    // no aim indicator or cancel ✕ was left up: the tap was the whole cast
    expect(await attr(page, 'aim')).toBe('');
  });
}
