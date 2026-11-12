import { expect, test, type Frame, type Page } from '@playwright/test';
import { mockHost, openHost } from './host';

// The Treat Track and Legends Pass in the Hearth Storybook look (brandbook v1): one modal that fits 667x375 to
// 1440x900 with only its own area scrolling, gilded bookmark tabs, 44 px controls, keyboard tabs and Esc.
// PASS_SHOTS=<dir> also saves screenshots of both tabs at each size (the before/after record).
test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'sizes are set inside the test'));

const PROFILE = {
  v: 1,
  sessions: 4,
  matches: 9,
  wins: 4,
  firstWinDone: true,
  hero: 'clem',
  veteran: true,
  unlocks: ['emote.wave', 'coat.clem.marmalade', 'coat.sage.midnight', 'coat.brutus.biscuit', 'postcard.lambo', 'coat.clem.lilac', 'postcard.aviete', 'title.champ.lambo'],
};
const SEASON = { id: 's1', xp: 2620, tier: 6, premium: 'none', skips: 0, claimed: ['f:3'], endsAt: '2027-01-05T00:00:00.000Z' };
const SIZES: [number, number][] = [
  [667, 375],
  [844, 390],
  [1280, 720],
  [1440, 900],
];
const SHOTS = process.env.PASS_SHOTS;

async function fits(game: Frame, sel: string): Promise<void> {
  const r = await game.evaluate((s) => {
    const se = document.scrollingElement!;
    const card = document.querySelector(`${s} .card`)!.getBoundingClientRect();
    // every visible control inside the modal is at least 44 px on its short side (decorative rows excluded)
    const small = [...document.querySelectorAll<HTMLElement>(`${s} button, ${s} [role="tab"]`)]
      .filter((b) => b.offsetParent !== null && !b.closest('.pass-track'))
      .map((b) => ({ b, r: b.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 0 && Math.min(r.width, r.height) < 43.5)
      .map(({ b, r }) => `${b.className}|${b.dataset.a ?? b.dataset.target ?? ''}:${Math.round(r.width)}x${Math.round(r.height)}`);
    return { sh: se.scrollHeight, ch: se.clientHeight, sw: se.scrollWidth, cw: se.clientWidth, top: card.top, left: card.left, bottom: card.bottom, right: card.right, vh: innerHeight, vw: innerWidth, small };
  }, sel);
  expect(r.sh).toBeLessThanOrEqual(r.ch);
  expect(r.sw).toBeLessThanOrEqual(r.cw);
  expect(r.top).toBeGreaterThanOrEqual(-1);
  expect(r.left).toBeGreaterThanOrEqual(-1);
  expect(r.bottom).toBeLessThanOrEqual(r.vh + 1);
  expect(r.right).toBeLessThanOrEqual(r.vw + 1);
  expect(r.small).toEqual([]);
}

async function shot(page: Page, name: string): Promise<void> {
  if (!SHOTS) return;
  await page.waitForTimeout(450);
  await page.screenshot({ path: `${SHOTS}/${name}.png`, animations: 'disabled' });
}

test('Treat Track and Legends Pass fit every size, scroll only inside, and keep keyboard and Esc', async ({ context, page, baseURL }) => {
  test.setTimeout(180_000);
  // 12 chests opened and 180 Treat XP into the 13th
  await context.addInitScript(() => {
    if (location.pathname.startsWith('/pawlegends-game/')) localStorage.setItem('tt.pawlegends.treats.v1', JSON.stringify({ v: 2, xp: 12 * 300 + 180, chests: 12, target: null, winDay: null }));
  });
  await mockHost(context, baseURL!, { app: { isApp: false, store: true }, signedIn: true, profile: PROFILE, store: { items: [], season: SEASON } });
  const game = await openHost(page);
  for (const [w, h] of SIZES) {
    await page.setViewportSize({ width: w, height: h });
    await game.locator('[data-a="collection"]').first().click();
    const track = game.locator('.pl-collection');
    await expect(track).toBeVisible();
    await expect(track.locator('[data-postcard="gabe"]')).toHaveClass(/locked/);
    await shot(page, `track-${w}x${h}`);
    await fits(game, '.pl-collection');
    // the Legends Pass tab, by keyboard: arrow from the Treat Track tab
    await track.locator('[role="tab"][aria-selected="true"]').focus();
    await page.keyboard.press('ArrowRight');
    const pass = game.locator('.pl-pass');
    await expect(pass).toBeVisible();
    await expect(pass.locator('.pcol.now')).toBeVisible();
    await shot(page, `pass-${w}x${h}`);
    await fits(game, '.pl-pass');
    await page.keyboard.press('Escape');
    await expect(pass).toHaveCount(0);
    await expect(track).toHaveCount(0);
  }
});
