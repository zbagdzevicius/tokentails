import { expect, test } from '@playwright/test';
import { closeAll, partyMatch, player, pushed, setHidden, shot, tap, tickOf } from './party.helpers';

test.afterEach(closeAll);

/*
 * Party play M5, M6 (MULTIPLAYER.md §7): a pause vote from the Esc menu, answered by the friend's rail chip, freezes
 * both clients' tick; Resume from the rail. At 3:00 a surrender vote (Esc menu, then the friend's Yes chip) ends the
 * match for both; results together show two human rows (a "bot X%" chip for the friend a bot flew), each player's own
 * save status only, and "Play again together" goes back to the pick with the same heroes locked.
 */
test('pause vote, surrender vote, results together and play again together', async ({ browser }) => {
  test.setTimeout(540_000);
  const a = await player(browser, 'desktop');
  const b = await player(browser, 'phone');
  await partyMatch([a, b], ['sage', 'lambo']);
  await a.page.waitForTimeout(3000);

  // pause: A votes from the Esc menu; B answers with the rail chip
  await a.page.keyboard.press('Escape');
  await expect(a.page.locator('.pl-menu h2')).toHaveText('Menu');
  await shot(a, 'lane-M', '20-esc-menu');
  await a.page.locator('[data-testid="vote-pause"]').click();
  const yes = b.page.locator('.pl-rail-act[data-act="vote-pause-yes"]');
  await expect(yes).toBeVisible({ timeout: 5000 });
  await shot(b, 'lane-M', '21-pause-vote-chip');
  await tap(b, yes);
  await expect(a.page.locator('.pl-rail-act[data-act="vote-resume"]')).toBeVisible({ timeout: 5000 });
  // both clients drain the turns already sent, then hold: the tick stands still on both
  await a.page.waitForTimeout(1500);
  const ta = await tickOf(a);
  const tb = await tickOf(b);
  await a.page.waitForTimeout(2500);
  expect(await tickOf(a)).toBe(ta);
  expect(await tickOf(b)).toBe(tb);
  await shot(b, 'lane-M', '22-paused');
  await a.page.locator('.pl-rail-act[data-act="vote-resume"]').click();
  await a.page.waitForFunction((t) => Number(document.documentElement.dataset.tick ?? 0) > t + 60, ta, { timeout: 15_000 });

  // B goes away for ~25 s (its hero is flown by a bot: the results show its bot share)
  await setHidden(b, true);
  await a.page.waitForTimeout(25_000);
  await setHidden(b, false);

  // surrender opens at 3:00 on Easy
  await a.page.waitForFunction(() => Number(document.documentElement.dataset.tick ?? 0) >= 5450, null, { timeout: 300_000, polling: 1000 });
  await a.page.keyboard.press('Escape');
  await a.page.locator('.pl-menu [data-a="forfeit"]').click();
  const sure = b.page.locator('.pl-rail-act[data-act="vote-surrender-yes"]');
  const railDom = await b.page.evaluate(() => {
    const r = document.querySelector('.pl-rail') as HTMLElement;
    const cs = getComputedStyle(r);
    return `${r.className} vis=${cs.visibility} op=${cs.opacity} disp=${cs.display} :: ${[...r.children].map((c) => `${c.className}[${getComputedStyle(c).visibility}] ${c.textContent}`).join(' / ')} crest=${document.documentElement.dataset.crest ?? ''} q=${JSON.stringify((window as unknown as { __plJuice: { notify: { queue: { waiting: string[] } } } }).__plJuice.notify.queue.waiting)}`;
  });
  await expect(sure, `B's rail: ${railDom}`).toBeVisible({ timeout: 10_000 });
  await shot(b, 'lane-M', '23-surrender-vote');
  await tap(b, sure);
  for (const p of [a, b]) await p.page.waitForSelector('html[data-screen="results"]', { timeout: 60_000 });
  for (const p of [a, b]) await expect(p.page.locator('[data-testid="party-result-human"]')).toHaveCount(2);
  // B was away for ~25 s: its row says how much a bot flew it (A idles too, so it may carry one as well: AFK pilot)
  await expect(a.page.locator('.pr-row[data-slot="1"] [data-testid="party-bot-chip"]')).toHaveCount(1);
  await expect(a.page.locator('[data-testid="party-result-bot"]')).toHaveCount(1);
  // each player's own save status only (one chip, never a row per friend)
  for (const p of [a, b]) expect(await p.page.locator('.plc-save').count()).toBeLessThanOrEqual(1);
  await a.page.waitForTimeout(2600);
  await shot(a, 'lane-M', '24-results-together');
  await shot(b, 'lane-M', '24-results-together');
  expect(await pushed(a)).toBeDefined();
  // play again together: the leader's tap starts it; both land on the pick with their heroes locked
  await expect(a.page.locator('[data-testid="party-again"]')).toHaveText(/Play again together \(\d\/2\)/);
  await tap(b, b.page.locator('[data-testid="party-again"]'));
  await expect(a.page.locator('[data-testid="party-again"]')).toHaveText('Play again together (1/2)', { timeout: 5000 });
  await a.page.locator('[data-testid="party-again"]').click();
  for (const p of [a, b]) await expect(p.page.locator('[data-testid="party-lock"]')).toBeVisible({ timeout: 20_000 });
  await expect(b.page.locator('.pp-ts').nth(0)).toHaveAttribute('data-hero', 'sage');
  await expect(b.page.locator('.pp-ts').nth(1)).toHaveAttribute('data-hero', 'lambo');
  await shot(b, 'lane-M', '25-rematch-pick');
});
