import { expect, test } from '@playwright/test';
import { startFirstMatch } from './helpers';

// Wave C (C2): ability ranks come with levels. The ability bar (desktop) and the touch buttons show rank pips, and a
// level that ranks an ability up shows the "Rank up!" toast over the bar.

test('rank pips fill as the hero levels, and level 2 shows the rank-up toast', async ({ page }, info) => {
  test.setTimeout(120_000);
  await startFirstMatch(page, '&speed=8');
  const touch = info.project.name === 'landscape';
  const q = touch ? '.pl-tbtn.q .rk b' : '.pl-slot[data-i="0"] .rk b';
  const r = touch ? '.pl-tbtn.r .rk b' : '.pl-slot[data-i="3"] .rk b';
  await expect(page.locator(q)).toHaveCount(4);
  await expect(page.locator(r)).toHaveCount(3);
  await expect(page.locator(`${r}.on`)).toHaveCount(0);
  // the XP trickle alone reaches level 2 at about 0:30 of match time
  await expect(page.locator(`${q}.on`)).toHaveCount(2, { timeout: 60_000 });
  await expect(page.locator('.pl-rankup')).toContainText('Rank up!');
  await expect(page.locator('.pl-rankup')).toContainText('rank 2');
});
