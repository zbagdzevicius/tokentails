import { expect, test, type Page } from '@playwright/test';

/**
 * Progression lane (ITERATION-2): earn fish, buy a hat and see it on the grid; an old v1 save keeps its classes;
 * daily challenges, achievements and the rival; the garage works with the keyboard.
 */

interface ProgState {
  fish: number;
  fishTotal: number;
  classUnlocked: number;
  owned: { hats: number[]; trails: number[] };
  equip: { hat: number; body: number; paint: number; trail: number };
  stats: { races: number; finishes: number };
  achievements: Record<string, number>;
  daily: { ids: string[] };
  rivals: Record<string, { w: number; l: number }>;
}
type Win = {
  __fmProg?: { prog(): ProgState; setProg(s: ProgState): void };
  __fm?: {
    shell: {
      racers: Array<{ hat?: number; trail?: number; rival?: boolean; kart: { body: number; paint: number[] } }>;
      world: { cfg: { humans: number[] }; st: { tick: number } } | null;
      setup: { cls: number; mode?: string } | null;
      view: { karts: Array<{ root: { getObjectByName(n: string): unknown } }> } | null;
      hud: { hudModel: { rival?: { name: string } } };
    };
  };
};

const prog = (page: Page) => page.evaluate(() => (window as unknown as Win).__fmProg!.prog());

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

test('a race pays fish; buying a hat in the garage puts it on the cat in the next race', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/?bot=1&seed=3&speed=8');
  const section = page.locator('[data-screen="results"] [data-section="progression"]');
  await expect(section).toBeVisible({ timeout: 110_000 });
  await expect(section.locator('.fm-prog-plus')).toContainText('+');
  const after = await prog(page);
  expect(after.fish).toBeGreaterThan(0);
  expect(after.fishTotal).toBe(after.fish);
  expect(after.stats.races).toBe(1);
  expect(after.daily.ids).toHaveLength(3);
  await expect(section.locator('.fm-prog-ch')).toHaveCount(3);
  // F12: the Style row (Kitchen's loop and jump gap) and the track's first Style best
  const style = section.locator('[data-section="style"]');
  await expect(style).toBeVisible();
  await expect(style).toContainText('Style');
  await expect(style.locator('[data-style-best="new"]')).toBeVisible();
  const best = await page.evaluate(() => (window as unknown as { __fmProg: { prog(): { styleBest: Record<string, number> } } }).__fmProg.prog().styleBest.kitchen ?? 0);
  expect(best).toBeGreaterThan(0);
  await expect.poll(() => style.locator('.fm-prog-style-n').textContent()).toBe(String(best));

  // enough fish for the beanie (60) whatever the bot earned
  await page.evaluate(() => {
    const p = (window as unknown as Win).__fmProg!;
    p.setProg({ ...p.prog(), fish: Math.max(p.prog().fish, 75) });
  });
  const before = (await prog(page)).fish;
  // the garage door sits in the folded "Challenges, goals and garage" part of the results
  await section.locator('.fm-prog-moreinfo').evaluate((d) => ((d as HTMLDetailsElement).open = true));
  await section.locator('[data-act="garage"]').click();
  const garage = page.locator('[data-screen="garage"]');
  await expect(garage).toBeVisible();
  await expect(page.locator('[data-screen="results"]')).toBeHidden();
  await garage.getByRole('tab', { name: 'Hat' }).click();
  await garage.locator('[data-item="hat-beanie"]').click();
  await garage.locator('[data-act="buy"]').click();
  await page.locator('.fm-ui-modal').getByRole('button', { name: 'Buy' }).click();
  await expect(garage.locator('[data-item="hat-beanie"]')).toHaveClass(/eq/);
  const bought = await prog(page);
  expect(bought.fish).toBe(before - 60);
  expect(bought.owned.hats).toContain(2);
  expect(bought.equip.hat).toBe(2);
  // pick a paint too
  await garage.getByRole('tab', { name: 'Paint' }).click();
  await garage.locator('[data-item="paint-7"]').click();
  await garage.locator('[data-act="done"]').click();
  await expect(page.locator('[data-screen="results"]')).toBeVisible();

  await page.locator('[data-screen="results"] [data-act="again"]').click();
  await expect.poll(() => page.evaluate(() => (window as unknown as Win).__fm!.shell.world?.st.tick ?? 999), { timeout: 10_000 }).toBeLessThan(600);
  const onGrid = await page.evaluate(() => {
    const sh = (window as unknown as Win).__fm!.shell;
    const me = sh.world!.cfg.humans[0];
    return { hat: sh.racers[me].hat, paint: sh.racers[me].kart.paint[0], drawn: !!sh.view!.karts[me].root.getObjectByName('fm-hat') };
  });
  expect(onGrid).toEqual({ hat: 2, paint: 0xff3ea5, drawn: true });
  await page.screenshot({ path: 'e2e/screens/progression-hat.png' });

  // it is saved
  await page.reload();
  await expect.poll(async () => (await prog(page)).owned.hats).toContain(2);
  expect(errors).toEqual([]);
});

test('an old v1 save keeps its class unlocks and races, with a welcome-back bonus', async ({ page }) => {
  await page.addInitScript(() => {
    if (localStorage.getItem('fm:save')) return;
    localStorage.setItem('fm:progress', JSON.stringify({ races: 9, unlocked: 2, pounces: 3, drifts: 3, bestTimes: { 'kitchen:1': 80.5 } }));
    localStorage.setItem('fm:settings', JSON.stringify({ autoGas: false, oneThumb: true, reducedMotion: false, muted: true, cls: 2 }));
  });
  await page.goto('/?seed=3');
  await expect.poll(async () => (await prog(page)).classUnlocked).toBe(2);
  const s = await prog(page);
  expect(s.stats.races).toBe(9);
  expect(s.fish).toBe(45);
  expect(await page.evaluate(() => (window as unknown as Win).__fm!.shell.setup!.cls)).toBe(2);
  await page.evaluate(() => (window as unknown as { __fmProg: { screens: { push(id: string, p?: unknown): Promise<unknown> } } }).__fmProg.screens.push('achievements', { tab: 2 }));
  const awards = page.locator('[data-screen="achievements"]');
  await expect(awards.locator('.fm-unl li.ok')).toHaveCount(3); // 100cc, 150cc, Battle (9 finishes)
  await awards.locator('[data-act="back"]').click();
  await page.evaluate(() => (window as unknown as { __fmProg: { screens: { push(id: string): Promise<unknown> } } }).__fmProg.screens.push('stats'));
  await expect(page.locator('[data-screen="stats"] .fm-st').first()).toContainText('9');
});

test('the Daily Cup names a rival and records the head-to-head', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/?daily=1&bot=1&speed=8');
  await expect.poll(() => page.evaluate(() => (window as unknown as Win).__fm?.shell.setup?.mode)).toBe('daily');
  const rival = await page.evaluate(() => {
    const sh = (window as unknown as Win).__fm!.shell;
    return { flags: sh.racers.filter((r) => r.rival).length, hud: sh.hud.hudModel.rival?.name ?? null };
  });
  expect(rival.flags).toBe(1);
  expect(rival.hud).not.toBeNull();
  const section = page.locator('[data-screen="results"] [data-section="progression"]');
  await expect(section).toBeVisible({ timeout: 110_000 });
  await expect(section.locator('.fm-prog-rival')).toContainText(rival.hud!);
  const s = await prog(page);
  expect(Object.keys(s.rivals)).toEqual([rival.hud]);
  expect(errors).toEqual([]);
});

test('the awards list all 26 achievements and the garage works from the keyboard', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?seed=4');
  await expect.poll(() => page.evaluate(() => !!(window as unknown as Win).__fmProg)).toBe(true);
  await page.evaluate(() => (window as unknown as { __fmProg: { screens: { push(id: string): Promise<unknown> } } }).__fmProg.screens.push('garage'));
  const garage = page.locator('[data-screen="garage"]');
  await expect(garage.locator('.fm-garage-stage canvas')).toBeVisible();
  // the garage opens with a control focused (B5); arrows move focus between the tiles; Enter tries a body on
  await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('[data-screen="garage"]'))).toBe(true);
  await garage.locator('[role="tab"]').first().focus();
  await page.keyboard.press('ArrowDown');
  const focused = await page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.item ?? (document.activeElement as HTMLElement | null)?.getAttribute('role') ?? '');
  expect(focused).not.toBe('');
  await garage.locator('[data-item="body-5"]').focus();
  await page.keyboard.press('Enter');
  await expect(garage.locator('[data-item="body-5"]')).toHaveClass(/sel/);
  await expect(garage.locator('.fm-garage-detail')).toContainText('Teacup');
  await expect(garage.locator('[data-act="buy"]')).toBeDisabled();
  await garage.locator('[data-act="awards"]').click();
  await expect(page.locator('[data-screen="achievements"] .fm-aw')).toHaveCount(26);
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-screen="achievements"]')).toHaveCount(0);
  await expect(garage).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(garage).toHaveCount(0);
});
