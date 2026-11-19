import { expect, test, type Page } from '@playwright/test';
import { limit } from '../unit/cpu-budget';

// Founder, Nov 18: "spells (like flash) lack in-game sound". In Practice the player casts Pounce (the Flash: D), a few
// abilities and the Nap (B); the game's audio probe (`__plAudioProbe`, the same hook audio.spec.ts reads) records each
// sound that starts. Pounce plays its own whoosh where it leaves and sparkle where it lands (audio/spellSfx.ts), the
// abilities their nature cast sounds, the Nap its lullaby.

const PLAYED = { v: 1, sessions: 3, matches: 8, wins: 3, firstWinDone: true, hero: 'sage', trick: 'pounce', firstPlaySession: 1, muted: false, audioV: 2 };

test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'desktop keys'));

const heard = (page: Page): Promise<{ name: string; gain: number }[]> => page.evaluate(() => (window as unknown as { __sp: { name: string; gain: number }[] }).__sp.slice());

test('Practice: Pounce (the Flash), Q/W/E and the Nap each play their own sound', async ({ page }) => {
  test.setTimeout(limit(150_000));
  await page.addInitScript((v) => {
    const W = window as unknown as Record<string, unknown>;
    const list: { name: string; gain: number }[] = [];
    W.__sp = list;
    W.__plAudioProbe = (o: { kind: string; name: string; gain: number }) => {
      if (o.kind === 'sfx') list.push({ name: o.name, gain: o.gain });
    };
    try {
      if (!localStorage.getItem('tt.pawlegends.profile.v1')) localStorage.setItem('tt.pawlegends.profile.v1', v);
    } catch {
      /* storage blocked */
    }
  }, JSON.stringify(PLAYED));
  await page.goto('/?e2e=1');
  await page.waitForSelector('html[data-screen="title"] .pl-home');
  // Practice (Lv 5, beside PLAY, MODE-UNLOCKS.md)
  await page.locator('[data-testid="home-practice"]').click();
  await page.locator('[data-testid="mode-go"]').click();
  await page.waitForSelector('html[data-screen="pick"] .cs');
  await page.locator('.cs-lock').click();
  await page.waitForSelector('html[data-match="live"]', { timeout: limit(90_000) });
  await page.waitForFunction(() => !document.querySelector('.pl-loading:not(.out)'), null, { timeout: limit(30_000) });
  await page.waitForFunction(() => !!document.documentElement.dataset.me);
  // a click on the ground (a gesture: the audio unlocks) and three Level +1 so W and E are learned
  const vp = page.viewportSize()!;
  await page.mouse.click(vp.width * 0.5, vp.height * 0.55, { button: 'right' });
  for (let i = 0; i < 3; i++) await page.locator('.pl-practice button[data-k="1"]').click();
  // the bake runs in small slices after the unlock
  await page.waitForTimeout(1500);

  // Pounce toward the cursor
  await page.mouse.move(vp.width * 0.62, vp.height * 0.45);
  await page.keyboard.press('d');
  await expect.poll(async () => (await heard(page)).map((h) => h.name).filter((n) => n.startsWith('sp:blink')), { timeout: limit(15_000) }).toEqual(expect.arrayContaining(['sp:blinkOut', 'sp:blinkIn']));
  // a few abilities
  for (const k of ['q', 'w', 'e']) {
    await page.mouse.move(vp.width * 0.58, vp.height * 0.42);
    await page.keyboard.press(k);
    await page.waitForTimeout(500);
  }
  await expect.poll(async () => (await heard(page)).filter((h) => /^n:[a-z]+:cast$/.test(h.name)).length, { timeout: limit(15_000) }).toBeGreaterThan(0);
  // the Nap: stand still and press B
  await page.keyboard.press('s');
  await page.waitForTimeout(300);
  await page.keyboard.press('b');
  await expect.poll(async () => (await heard(page)).some((h) => h.name === 'sp:napStart'), { timeout: limit(15_000) }).toBe(true);

  const all = await heard(page);
  const spells = all.filter((h) => h.name.startsWith('sp:'));
  console.log('[spell-sfx]', JSON.stringify(spells));
  // every spell sound went out with a real gain (not muted, not a dead path)
  expect(spells.every((h) => h.gain > 0.01)).toBe(true);
});
