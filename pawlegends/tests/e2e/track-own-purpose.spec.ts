import { expect, test } from '@playwright/test';
import { mockHost, openHost } from './host';
import { limit } from '../unit/cpu-budget';

// Founder, Nov 19 ("each thing should serve its own purpose"): the Treat Track shows the track only. No champion
// browser or Match history buttons, no champion / Yarn count, no title or frame chooser (Profile is the one place to
// wear them); a title the track just gave shows one "Wear it" link that opens Profile on Collection.
// TRACK_SHOTS=<dir> saves screenshots of the Treat Track and the Legends Pass.
const PROFILE = {
  v: 1,
  sessions: 4,
  matches: 9,
  wins: 4,
  firstWinDone: true,
  hero: 'clem',
  veteran: true,
  unlocks: ['emote.wave', 'coat.clem.marmalade', 'coat.sage.midnight', 'coat.brutus.biscuit', 'postcard.lambo', 'coat.clem.lilac', 'postcard.aviete', 'title.champ.aviete'],
};
const SEASON = { id: 's1', xp: 2620, tier: 6, premium: 'none', skips: 0, claimed: ['f:3'], endsAt: '2027-01-05T00:00:00.000Z' };
const SHOTS = process.env.TRACK_SHOTS;

test('the Treat Track keeps to the track; "Wear it" opens Profile > Collection', async ({ context, page, baseURL }, info) => {
  test.setTimeout(limit(120_000));
  await context.addInitScript(() => {
    if (location.pathname.startsWith('/pawlegends-game/')) localStorage.setItem('tt.pawlegends.treats.v1', JSON.stringify({ v: 2, xp: 12 * 300 + 180, chests: 12, target: null, winDay: null }));
  });
  await mockHost(context, baseURL!, { app: { isApp: false, store: true }, signedIn: true, profile: PROFILE, store: { items: [], season: SEASON }, viewport: true });
  if (info.project.name === 'desktop') await page.setViewportSize({ width: 1440, height: 900 });
  const game = await openHost(page);
  const tap = async (sel: string) => {
    const l = game.locator(sel).first();
    if (info.project.use.hasTouch) await l.tap();
    else await l.click();
  };
  const size = `${page.viewportSize()!.width}x${page.viewportSize()!.height}`;
  await tap('[data-a="collection"]');
  const track = game.locator('.pl-collection');
  await expect(track).toBeVisible();
  await expect(track.locator('[data-a="champions"], [data-a="history"], [data-testid="open-history"], .champ-count, [data-wear], .set-row')).toHaveCount(0);
  await expect(track).not.toContainText('abilities');
  await expect(track).not.toContainText('Match history');
  await expect(track).not.toContainText('Yarn');
  await expect(track.locator('.md-row [data-target]')).toHaveCount(29);
  await expect(track.locator('[data-new]')).toHaveAttribute('data-new', 'title.champ.aviete');
  if (SHOTS) {
    await page.waitForTimeout(450);
    await page.screenshot({ path: `${SHOTS}/track-${size}.png`, animations: 'disabled' });
  }
  // the Legends Pass tab: progress, tiers, claim, buy; nothing to wear
  await tap('.pl-collection [data-a="pass"]');
  const pass = game.locator('.pl-pass');
  await expect(pass.locator('.pcol.now')).toBeVisible();
  await expect(pass.locator('[data-wear], .set-row, [data-a="champions"], [data-a="history"]')).toHaveCount(0);
  if (SHOTS) {
    await page.waitForTimeout(450);
    await page.screenshot({ path: `${SHOTS}/pass-${size}.png`, animations: 'disabled' });
  }
  await tap('.pl-pass [data-a="track"]');
  await expect(track).toBeVisible();
  // "Wear it": closes the track and opens Profile on Collection, the one place to wear it
  await tap('[data-testid="track-wear-it"]');
  await expect(track).toHaveCount(0);
  const prof = game.locator('[data-testid="profile-screen"]');
  await expect(prof).toBeVisible();
  await expect(prof.locator('[data-testid="profile-tab-collection"]')).toHaveAttribute('aria-selected', 'true');
  if (SHOTS) {
    await page.waitForTimeout(450);
    await page.screenshot({ path: `${SHOTS}/wear-it-profile-${size}.png`, animations: 'disabled' });
  }
});
