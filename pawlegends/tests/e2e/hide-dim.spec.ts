import { expect, test, type Page } from '@playwright/test';
import { startFirstMatch } from './helpers';
import { limit } from '../unit/cpu-budget';

// Hidden in a bush (founder, 2026-11-17): the view dims a little, under the HUD, with no text. Screenshots in and out
// of hiding on desktop and 844x390: test-results/hide-dim (or HIDE_SHOTS).

const SHOTS = process.env.HIDE_SHOTS ?? 'test-results/hide-dim';

const setHidden = (page: Page, on: boolean | null) =>
  page.evaluate((v) => {
    const W = (window as unknown as { __plWorld: { hideDim(): { force: boolean | null } | null } }).__plWorld;
    W.hideDim()!.force = v;
  }, on);

const dimState = (page: Page) =>
  page.evaluate(() => {
    const el = document.querySelector<HTMLElement>('[data-testid="hide-dim"]');
    if (!el) return null;
    const cs = getComputedStyle(el);
    return { on: el.dataset.on === '1', opacity: Number(cs.opacity), visibility: cs.visibility, text: el.textContent, first: el.parentElement?.firstElementChild === el };
  });

for (const s of [
  { w: 1280, h: 720, project: 'desktop' },
  { w: 844, h: 390, project: 'landscape' },
] as const) {
  test(`${s.w}x${s.h}: the view dims while hidden and the HUD stays bright`, async ({ page }, info) => {
    test.skip(info.project.name !== s.project, `${s.project} size`);
    test.setTimeout(limit(120_000));
    await page.setViewportSize({ width: s.w, height: s.h });
    await startFirstMatch(page, '&speed=3');
    await page.waitForFunction(() => !!document.querySelector('[data-testid="hide-dim"]'), null, { timeout: limit(20_000) });
    await page.waitForTimeout(800);
    // at the fountain: not hidden
    const out = (await dimState(page))!;
    expect(out).toMatchObject({ on: false, opacity: 0, visibility: 'hidden', text: '', first: true });
    await page.screenshot({ path: `${SHOTS}/${s.w}x${s.h}-out.png` });

    await setHidden(page, true);
    await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('[data-testid="hide-dim"]')!).opacity) === 1, null, { timeout: limit(3000) });
    const inside = (await dimState(page))!;
    expect(inside).toMatchObject({ on: true, opacity: 1, visibility: 'visible', text: '' });
    // the HUD sits above the dim: the ability buttons are what a tap at their centre hits, and they are not dimmed
    const above = await page.evaluate(() => {
      const btn = [...document.querySelectorAll<HTMLElement>('.pl-tbtn, .pl-slot')].find((b) => b.getBoundingClientRect().width > 0)!;
      const dim = document.querySelector<HTMLElement>('[data-testid="hide-dim"]')!;
      dim.style.pointerEvents = 'auto';
      const r = btn.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      dim.style.pointerEvents = '';
      return !!hit && btn.contains(hit);
    });
    expect(above).toBe(true);
    await page.screenshot({ path: `${SHOTS}/${s.w}x${s.h}-in.png` });

    await setHidden(page, false);
    await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-testid="hide-dim"]')!).visibility === 'hidden', null, { timeout: limit(3000) });
    await setHidden(page, null);
  });
}
