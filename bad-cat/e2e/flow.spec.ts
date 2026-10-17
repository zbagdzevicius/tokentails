import { expect, test, type Page } from '@playwright/test';

/**
 * Full M0 flow (GDD 8, 6.3): first visit → skippable cat maker → briefing → 40 s first heist → result →
 * share (emoji card, result card, clip export attempt) → home → ranked run → dare link → a friend opens the
 * dare and plays against the ghost.
 */

type TickInput = { dir: number; speed: number; buttons: number };
type Qa = {
  screen(): string;
  play(inputs: TickInput[]): Promise<{ ticks: number; score: number; mode: string }>;
  scoring?(maxTries?: number): TickInput[] | null;
};

const SHOTS = process.env.BADCAT_E2E_SHOTS;

async function screen(page: Page): Promise<string> {
  return page.evaluate(() => (window as unknown as { __BADCAT_QA__?: Qa }).__BADCAT_QA__?.screen() ?? 'none');
}

async function waitScreen(page: Page, name: string, timeout = 15_000): Promise<void> {
  await expect.poll(() => screen(page), { timeout }).toBe(name);
}

async function shot(page: Page, name: string): Promise<void> {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

/** Scripted run: trot east, swat a lot, wander, so something breaks. */
function script(): TickInput[] {
  const out: TickInput[] = [];
  for (let t = 0; t < 2400; t++) {
    const phase = Math.floor(t / 45) % 6;
    const dir = [3, 3, 1, 5, 7, 3][phase];
    out.push({ dir: t % 90 < 60 ? dir : 0, speed: 2, buttons: t % 9 === 0 ? 1 : t % 31 === 0 ? 4 : 0 });
  }
  return out;
}

/** A run that scores on Kitchen #1 (found by a seeded search over the real sim). */
const SCORING: [number, number, number][] = [[4,21,0],[2,15,0],[5,23,0],[4,46,0],[5,42,0],[6,35,2],[1,25,0],[5,11,2],[4,34,0],[2,22,2],[3,45,2],[5,36,0],[2,49,0],[8,48,0],[1,30,0],[3,45,0],[8,29,0],[7,28,0],[5,34,0],[2,38,0],[2,24,2],[5,13,0],[3,43,0],[1,24,0],[4,15,0],[7,21,0],[1,26,0],[4,38,2],[5,44,0],[7,24,2],[5,24,2],[5,15,0],[6,28,0],[4,45,0],[2,27,2],[1,33,2],[2,16,2],[5,48,0],[3,42,0],[8,40,0]];

function scoringScript(): TickInput[] {
  const out: TickInput[] = [];
  for (const [dir, n, jump] of SCORING) for (let t = 0; t < n; t++) out.push({ dir, speed: 2, buttons: t === 0 ? jump : t % 6 === 0 ? 1 : 0 });
  return out;
}

/** A scoring script for the room on the briefing now (seeded search in the page), else the old fixed one. */
async function scoringFor(page: Page): Promise<TickInput[]> {
  const found = await page.evaluate(() => (window as unknown as { __BADCAT_QA__: Qa }).__BADCAT_QA__.scoring?.() ?? null);
  return found ?? scoringScript();
}

async function playScripted(page: Page, inputs: TickInput[] = script()): Promise<{ ticks: number; score: number; mode: string }> {
  return page.evaluate((i) => (window as unknown as { __BADCAT_QA__: Qa }).__BADCAT_QA__.play(i), inputs);
}

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

test('first visit → share → ranked → dare → friend plays the ghost', async ({ page, browser, baseURL }) => {
  test.setTimeout(480_000);
  const t0 = Date.now();
  const mark = (m: string): void => console.log(`[flow] ${((Date.now() - t0) / 1000).toFixed(1)}s ${m}`);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto('./');
  await waitScreen(page, 'catmaker');
  await shot(page, '01-catmaker');
  await page.locator('[data-bcm="skip"]').click();
  await waitScreen(page, 'briefing');
  await expect(page.locator('canvas').first()).toBeAttached({ timeout: 15_000 });
  await page.waitForTimeout(800);
  await shot(page, '02-briefing');
  mark("await shot(page, '02-briefing');");

  // review round 1: the first heist spawns by the wine glass, so a fixed script may miss; use a scoring one
  const ftue = await playScripted(page, await scoringFor(page));
  expect(ftue.mode).toBe('ftue');
  expect(ftue.ticks).toBeLessThanOrEqual(1200);
  await waitScreen(page, 'result');
  await page.waitForTimeout(1500);
  await shot(page, '03-result-ftue');
  mark("await shot(page, '03-result-ftue');");
  // No dare after the first heist (GDD 6.3).
  await expect(page.getByRole('button', { name: 'Dare a friend' })).toHaveCount(0);

  await page.getByRole('button', { name: /Share clip|Making your clip|Clip interrupted/ }).click();
  await waitScreen(page, 'share');
  await page.getByRole('button', { name: 'Copy for the group chat' }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText()), { timeout: 5_000 }).toMatch(/BAD CAT DAILY/);
  // The clip export runs (or fails cleanly) without a page error.
  await expect
    .poll(async () => (await page.locator('.bc-post').textContent()) ?? '', { timeout: 120_000 })
    .toMatch(/Post clip|Clip interrupted|newer browser/);
  await shot(page, '04-share');
  mark("await shot(page, '04-share');");
  await page.getByRole('button', { name: 'Done' }).click();
  await waitScreen(page, 'home');
  await shot(page, '05-home');
  mark("await shot(page, '05-home');");

  // Ranked run on today's room, then dare a friend.
  await page.getByRole('button', { name: /ranked|play|today/i }).first().click();
  await waitScreen(page, 'briefing');
  const ranked = await playScripted(page, await scoringFor(page));
  expect(ranked.mode).toBe('ranked');
  expect(ranked.score).toBeGreaterThan(0);
  await waitScreen(page, 'result');
  await page.getByRole('button', { name: 'Dare a friend' }).click();
  mark("  await page.getByRole('button', { name: 'Dare a friend' }).click();");
  const dare = await page.evaluate(() => navigator.clipboard.readText());
  const url = dare.match(/https?:\/\/\S+/)?.[0] ?? '';
  expect(url).toMatch(/\/d\/p?\d+\?g=/); // round 3: preview days are /d/p<n>, never negative

  // A friend (fresh storage) opens the dare: standalone hash form of the same link.
  const u = new URL(url);
  const day = u.pathname.match(/\/d\/(p?\d+)/)![1];
  const friendUrl = `${baseURL}/#d=${day}&${u.searchParams.toString()}`;
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const friend = await ctx.newPage();
  friend.on('pageerror', (e) => errors.push(String(e)));
  await friend.goto(friendUrl);
  await waitScreen(friend, 'catmaker');
  // GDD 6.3 / 8, review round 1: the intro names the dare, then a first-timer plays the dared room itself (no 40 s
  // first heist in between): the briefing carries the dare line and the ghost runs.
  await expect(friend.locator('.bcm h1')).toHaveText(/dared you: [1-9]/);
  await friend.locator('[data-bcm="skip"]').click();
  await waitScreen(friend, 'briefing');
  await friend.waitForTimeout(800);
  await expect(friend.locator('.bc-dare-note')).toHaveText(/ghost: [1-9]/);
  await shot(friend, '06-dare-briefing');
  mark("await shot(friend, '06-dare-briefing');");
  // Start for real and look at the ghost for a moment (06b), then let the script finish the run.
  // The briefing waits for the first heist's clip export to finish before it accepts a tap.
  await expect
    .poll(
      async () => {
        if ((await screen(friend)) === 'briefing') await friend.locator('.bc-briefing').click({ timeout: 2_000 }).catch(() => undefined);
        return screen(friend);
      },
      { timeout: 240_000, intervals: [1_000] },
    )
    .toBe('run');
  await friend.waitForTimeout(3000);
  await shot(friend, '06b-dare-run');
  const fr = await playScripted(friend);
  expect(fr.mode).toBe('ranked');
  await waitScreen(friend, 'result');
  await expect(friend.locator('.bc-dare-note')).toHaveText(/still rules/);
  await shot(friend, '07-dare-result');
  mark("await shot(friend, '07-dare-result');");
  await ctx.close();

  expect(errors).toEqual([]);
});

test('in-app browser → copy handoff link → real browser re-renders the clip', async ({ browser, baseURL }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  const ig = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.0.0',
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const page = await ig.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('./');
  await waitScreen(page, 'catmaker');
  await page.locator('[data-bcm="skip"]').click();
  await waitScreen(page, 'briefing');
  await playScripted(page, await scoringFor(page));
  await waitScreen(page, 'result');
  await page.locator('.bc-share-btn').click();
  await waitScreen(page, 'share');
  await page.getByRole('button', { name: 'Copy link' }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText()), { timeout: 5_000 }).toMatch(/rp=.+clip=1/);
  const link = new URL(await page.evaluate(() => navigator.clipboard.readText()));
  expect(link.searchParams.get('m')).toBe('f');
  await ig.close();

  const real = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p2 = await real.newPage();
  p2.on('pageerror', (e) => errors.push(String(e)));
  const day = link.pathname.match(/\/d\/(p?\d+)/)![1];
  await p2.goto(`${baseURL}/#d=${day}&${link.searchParams.toString()}`);
  // a new browser has no photo: the cat maker offers to add it again for the opener (GDD 13.5), skippable
  await waitScreen(p2, 'catmaker', 20_000);
  await p2.locator('[data-bcm="readd-skip"]').click();
  await waitScreen(p2, 'result', 20_000);
  await expect(p2.locator('.bc-result-score')).not.toHaveText('0', { timeout: 5_000 });
  await expect
    .poll(async () => (await p2.locator('.bc-share-btn').textContent()) ?? '', { timeout: 200_000 })
    .toMatch(/Share clip|Clip interrupted/);
  await shot(p2, '08-handoff-result');
  await real.close();
  expect(errors).toEqual([]);
});
