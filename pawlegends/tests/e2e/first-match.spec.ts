import { expect, test, type Page } from '@playwright/test';
import { attr, me, startFirstMatch } from './helpers';

// POC.md §12, §15 item 20: the first Easy match is one tap from the title; each of the five tips fires on its
// event and hides once done. The `?e2e=1` data attributes report the tip on screen (`data-tip`), the tips shown
// and done, the hero's level, where the nearest enemy minion and hero are on screen, and the point just behind the
// player's own wave front.

const TEXT: Record<string, RegExp> = {
  move: /Right-click the ground to walk/,
  attack: /Right-click an enemy minion to attack/,
  q: /Enemy hero! Press Q to strike/,
  dodge: /Incoming! Press E to Tumble out of the way/,
  ult: /Level 4! Press R for your ultimate/,
};

const list = async (page: Page, name: string) => (await attr(page, name)).split(',').filter(Boolean);
const point = async (page: Page, name: string) => {
  const [x, y] = (await attr(page, name)).split(',').map(Number);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
};

/** Attack-move onto `to`, else a little ahead of the hero (the cursor stays inside the view: no edge pan). */
async function aMove(page: Page, to: { x: number; y: number } | null): Promise<void> {
  const self = await point(page, 'meScreen');
  const x = to?.x ?? (self ? self.x + 260 : 760);
  const y = to?.y ?? (self ? self.y : 360);
  await page.mouse.move(x, y);
  await page.keyboard.press('a');
  await page.mouse.click(x, y);
}

test('first match is one tap away and the move tip fires', async ({ page }, info) => {
  await page.goto('/?e2e=1');
  await expect(page.locator('.pl-btn.big')).toHaveText('Play as Clem');
  await startFirstMatch(page);
  await expect(page.locator('html')).toHaveAttribute('data-screen', 'match');
  await expect(page.locator('.pl-tip.on')).toBeVisible({ timeout: 8000 });
  if (info.project.name === 'desktop') {
    await page.mouse.click(800, 300, { button: 'right' });
    await expect(page.locator('.pl-tip.on')).toHaveCount(0);
  }
});

test('all five tips fire on their events and hide once done (desktop)', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'desktop controls');
  test.setTimeout(300_000);
  await startFirstMatch(page, '&speed=4');
  const seen: Record<string, string> = {};
  const deadline = Date.now() + 270_000;
  let tick = 0;
  let home = false;
  let maxLevel = 0;
  while (Date.now() < deadline) {
    if ((await attr(page, 'screen')) === 'results') break;
    maxLevel = Math.max(maxLevel, Number(await attr(page, 'level')) || 0);
    const tip = await attr(page, 'tip');
    if (tip && !seen[tip]) seen[tip] = (await page.locator('.pl-tip.on').textContent()) ?? '';
    const done = await list(page, 'tipsDone');
    if (['move', 'attack', 'q', 'dodge', 'ult'].every((t) => done.includes(t))) break;
    if (tip === 'move') await page.mouse.click(760, 320, { button: 'right' });
    else if (tip === 'attack') {
      const m = await point(page, 'foeMinion');
      if (m) await page.mouse.click(m.x, m.y, { button: 'right' });
      else await aMove(page, null);
    } else if (tip === 'q' || tip === 'dodge' || tip === 'ult') {
      const h = await point(page, 'foeHero');
      await page.mouse.move(h?.x ?? 900, h?.y ?? 360);
      await page.keyboard.press(tip === 'q' ? 'q' : tip === 'dodge' ? 'e' : 'r');
    } else {
      // No tip up: farm the wave for XP like a careful new player. Low on HP: walk home and nap until healed.
      const hp = Number(await attr(page, 'hp'));
      if (hp > 0 && hp < 30) home = true;
      if (home && hp >= 75) home = false;
      if (home) {
        if (tick++ % 8 === 0) {
          await page.mouse.click(120, 380, { button: 'right' });
          await page.keyboard.press('b');
        }
      } else if (tick++ % 2 === 0) {
        // Follow the own wave from just behind its front minion (the minions tank the towers, and every minion that
        // dies within 10 m gives XP); with no wave in view, walk up Sunny Lane to this side of the river and wait.
        const front = await point(page, 'allyFront');
        const self = await point(page, 'meScreen');
        const pos = await me(page);
        // (Not before the move tip has had its turn: walking first would complete it unseen.)
        const moveTipped = (await list(page, 'tipsShown')).includes('move');
        if (front) await aMove(page, front);
        else if (moveTipped && self && pos.x < 40000) {
          const [dx, dy] = pos.y < 48000 ? [120, -110] : [220, 0];
          await page.mouse.click(self.x + dx, self.y + dy, { button: 'right' });
        }
      }
    }
    await page.waitForTimeout(250);
  }
  const shown = await list(page, 'tipsShown');
  const done = await list(page, 'tipsDone');
  const level = maxLevel;
  console.log(`first-match tips: shown ${shown.join(' ')}, done ${done.join(' ')}, highest level ${level}`);
  // The R tip needs level 4. The scripted player follows its own wave (data-ally-front) instead of attack-moving
  // onto the nearest enemy minion, so it farms XP under its minions' cover and reaches level 4 every run.
  expect(level, 'highest level').toBeGreaterThanOrEqual(4);
  for (const id of Object.keys(TEXT)) {
    expect(shown, `tip ${id} shown`).toContain(id);
    expect(seen[id] ?? '', `tip ${id} text`).toMatch(TEXT[id]);
    expect(done, `tip ${id} done`).toContain(id);
  }
  // Each hid once done: no tip is up now.
  await expect(page.locator('.pl-tip.on')).toHaveCount(0);
});
