import { expect, test, type Page } from '@playwright/test';
import { attr, startFirstMatch } from './helpers';

// Fun plan F1, F2, F6 (FEEL lane): match 1 is the guided Rookie match (when the sim ships it), the first
// objective chip shows within 5 s, and a real event stream drives the announcer: a First Blood or Takedown banner,
// level-up callouts and XP pops. `data-said` lists the last words the juice layer showed; `data-goal` the chip.

const point = async (page: Page, name: string) => {
  const [x, y] = (await attr(page, name)).split(',').map(Number);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
};

test('the first objective chip shows within 5 s and points the way', async ({ page }) => {
  await startFirstMatch(page);
  await expect(page.locator('.pl-goal.on')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('.pl-goal.on')).toContainText('Run to the lane!');
  expect(await attr(page, 'goal')).toBe('lane');
  // match 1 is the Rookie match (fun plan F1)
  expect(await attr(page, 'difficulty')).toBe('rookie');
  // the Sunset countdown stays hidden while Sunset is far off
  await expect(page.locator('.pl-score .phase')).toHaveText('');
});

test('a fighting player sees First Blood or Takedown, level-ups and XP pops (desktop)', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'desktop controls');
  test.setTimeout(240_000);
  await startFirstMatch(page, '&speed=4');
  const deadline = Date.now() + 200_000;
  const said = new Set<string>();
  while (Date.now() < deadline) {
    if ((await attr(page, 'screen')) === 'results') break;
    for (const s of (await attr(page, 'said')).split('|')) if (s) said.add(s);
    const words = [...said];
    if (words.some((w) => /First Blood|Takedown|Assist/.test(w)) && words.some((w) => /^Level \d/.test(w)) && words.some((w) => /XP$/.test(w))) break;
    const hero = await point(page, 'foeHero');
    const minion = await point(page, 'foeMinion');
    const front = await point(page, 'allyFront');
    const hp = Number(await attr(page, 'hp'));
    if (hp > 0 && hp < 25) await page.mouse.click(120, 380, { button: 'right' });
    else if (hero) {
      await page.mouse.move(hero.x, hero.y);
      await page.keyboard.press('a');
      await page.mouse.click(hero.x, hero.y);
      for (const k of ['q', 'e', 'r']) await page.keyboard.press(k);
    } else if (minion) await page.mouse.click(minion.x, minion.y, { button: 'right' });
    else if (front) await page.mouse.click(front.x, front.y, { button: 'right' });
    else {
      const self = await point(page, 'meScreen');
      const [x, y] = (await attr(page, 'me')).split(',').map(Number);
      if (self && x < 45000) await page.mouse.click(self.x + (y < 48000 ? 120 : 220), self.y + (y < 48000 ? -110 : 0), { button: 'right' });
    }
    await page.waitForTimeout(250);
  }
  const words = [...said];
  console.log(`juice: ${words.join(' | ')}`);
  expect(words.some((w) => /First Blood|Takedown|Assist/.test(w)), 'a takedown call').toBe(true);
  expect(words.some((w) => /^Level \d/.test(w)), 'a level-up callout').toBe(true);
  expect(words.some((w) => /XP$/.test(w)), 'an XP pop').toBe(true);
});
