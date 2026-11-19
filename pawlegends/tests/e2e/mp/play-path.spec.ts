import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { closeAll, player, tap, title, type Kind, type Player } from './party.helpers';

test.afterEach(closeAll);

/*
 * One main queue against the relay harness (docs/plans/moba/MODE-UNLOCKS.md, founder Nov 19: "keep: 3v3 as main
 * queue ... Ranked appears from level 10"). A returning player at 844x390 (touch) and 1440x900:
 *   PLAY → the 3v3 queue card (PvP: players first, bots fill), Cancel back Home;
 *   Party → the party lobby with its code (not a match); its leader's "Play online" searches the 3v3 queue, and a Lv 10
 *   leader also gets Ranked (a Lv 1 leader does not).
 * PLAY_SHOTS=1 saves each step to ~/Downloads/paw-legends/play-flow/.
 */
const SHOTS = process.env.PLAY_SHOTS ? `${homedir()}/Downloads/paw-legends/play-flow` : '';
const shot = async (p: Player, step: string): Promise<void> => {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  const v = p.page.viewportSize()!;
  await p.page.screenshot({ path: `${SHOTS}/${step}-${v.width}x${v.height}.png`, timeout: 60_000 });
};
const LV10 = { v: 1, sessions: 3, matches: 25, wins: 12, firstWinDone: true, hero: 'sage', trick: 'hiss', difficulty: 'easy', veteran: true };

for (const kind of ['phone', 'desktop'] as Kind[]) {
  test(`${kind}: PLAY is one tap into the 3v3 queue; Party opens the lobby; a Lv 10 leader can search Ranked`, async ({ browser }) => {
    test.setTimeout(300_000);
    const p = await player(browser, kind, { profile: LV10 });
    await title(p);
    const play = p.page.locator('[data-testid="home-play"][data-queue="pvp"]');
    await expect(play).toBeVisible({ timeout: 30_000 });
    await expect(p.page.locator('[data-testid="home-ranked"]')).toBeVisible();
    await expect(p.page.locator('[data-testid="home-practice"]')).toBeVisible();
    await shot(p, '1-home-lv10');
    await tap(p, play);
    // no mode picker: the queue card at once
    await expect(p.page.locator('[data-testid="mode-select"]')).toHaveCount(0);
    const q = p.page.locator('[data-testid="mm-queue"]');
    await expect(p.page.locator('[data-testid="mm-queue"][data-mode="pvp"], [data-testid="mm-accept-card"]').first()).toBeVisible({ timeout: 15_000 });
    await shot(p, '2-main-queue');
    await tap(p, p.page.locator('[data-testid="mm-cancel"]'));
    await p.page.waitForSelector('html[data-screen="title"] .pl-home', { timeout: 15_000 });
    await expect(q).toHaveCount(0);

    await tap(p, p.page.locator('[data-testid="home-party"]'));
    await expect(p.page.locator('[data-testid="party-code"]')).toBeVisible({ timeout: 30_000 });
    await expect(p.page.locator('html')).not.toHaveAttribute('data-match', 'live');
    await expect(p.page.locator('[data-testid="party-queue"]')).toBeVisible();
    await expect(p.page.locator('[data-testid="party-queue-ranked"]')).toBeVisible();
    await shot(p, '3-party-lobby');
    await tap(p, p.page.locator('[data-testid="party-leave"]'));
  });
}

test('a Lv 1 party leader gets Play online and no Ranked', async ({ browser }) => {
  test.setTimeout(240_000);
  const p = await player(browser, 'desktop', { profile: { ...LV10, matches: 1, wins: 1 } });
  await title(p);
  await expect(p.page.locator('[data-testid="home-play"][data-queue="pvp"]')).toBeVisible({ timeout: 30_000 });
  await expect(p.page.locator('[data-testid="home-ranked"], [data-testid="home-practice"]')).toHaveCount(0);
  await tap(p, p.page.locator('[data-testid="home-party"]'));
  await expect(p.page.locator('[data-testid="party-queue"]')).toBeVisible({ timeout: 30_000 });
  await expect(p.page.locator('[data-testid="party-queue-ranked"]')).toHaveCount(0);
});
