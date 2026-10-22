import { expect, test, type Page } from '@playwright/test';
import { LEGACY } from '../review/v3-legacy-codes';

/** Captures navigator.share / clipboard text instead of opening a sheet. */
async function stubShare(page: Page): Promise<void> {
  await page.addInitScript(() => {
    if (location.protocol !== 'http:') return;
    const w = window as unknown as { __shared: string[] };
    w.__shared = [];
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (d: { text?: string }) => {
        w.__shared.push(d.text ?? '');
      },
    });
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => false });
  });
}

const shared = (page: Page) => page.evaluate(() => (window as unknown as { __shared: string[] }).__shared);

type Fm = { shell: { world: { tick: number; cfg: { mode?: string }; st: { karts: unknown[] } } | null; stage: { scene: { getObjectByName(n: string): unknown } }; setup: { seed: number; track: { id: string } } | null } };
/** Evaluate `expr` with `f` = window.__fm (the shell's QA hook). */
const fm = (page: Page, expr: string) => page.evaluate(`(() => { const f = window.__fm; return ${expr}; })()`);
const ghostIn = (page: Page, name: string) => page.evaluate((n) => !!(window as unknown as { __fm: Fm }).__fm.shell.stage.scene.getObjectByName(`kart-${n}`), name);
const field = (page: Page) => page.evaluate(() => (window as unknown as { __fm: Fm }).__fm.shell.world?.st.karts.length ?? 0);

/** The element's box is inside a 390x844 viewport (above the fold). */
async function aboveFold(page: Page, sel: string): Promise<void> {
  const b = (await page.locator(sel).first().boundingBox())!;
  expect(b, sel).toBeTruthy();
  expect(b.y, sel).toBeGreaterThanOrEqual(0);
  expect(b.y + b.height, sel).toBeLessThanOrEqual(844);
}

/** A share link's hash (#g=…) from the shared text. */
function dareHash(text: string): string {
  const link = text.split('\n').find((l) => l.includes('#g='))!;
  expect(link).toBeTruthy();
  return link.slice(link.indexOf('#'));
}

test('phone results: headline and Next above the fold, the rest in the tray; the dare opens a card and a 1v1 ghost duel', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await stubShare(page);
  await page.goto('/?bot=1&seed=5&speed=8');
  await expect(page.locator('.fm-overlay.on .fm-place')).toBeVisible({ timeout: 110_000 });
  // F7: one big card: place, time and the one line that matters, then Next; all five share actions still exist
  await expect(page.locator('.fm-overlay.on .fm-headline')).toBeVisible();
  await aboveFold(page, '.fm-overlay.on .fm-headline');
  await aboveFold(page, '.fm-overlay.on [data-act="next"]');
  await aboveFold(page, '.fm-overlay.on [data-id="dare"]');
  const btns = page.locator('.fm-overlay [data-x]');
  await expect(btns).toHaveCount(5);
  const x = (i: number) => page.locator(`.fm-overlay [data-x="${i}"]`);
  await expect(x(1)).toContainText('Dare a friend');
  await expect(x(2)).toContainText('Daily #');
  await expect(x(3)).toContainText('Your cat');
  await expect(x(4)).toContainText('Pink Paw');
  // the icon actions wait in the "•••" tray on a phone
  await expect(x(3)).toBeHidden();
  await page.locator('.fm-overlay [data-act="more"]').click();
  await expect(x(3)).toBeVisible();
  await expect(x(4)).toBeVisible();
  await page.screenshot({ path: 'e2e/screens/share-results.png' });

  // no saved cat: the dare asks once for the sender's name
  await x(1).click();
  await expect(page.locator('.fm-dare-name input')).toBeVisible();
  await page.locator('.fm-dare-name input').fill('Mia');
  await page.locator('.fm-dare-name [type="submit"]').click();
  await expect.poll(async () => (await shared(page)).length, { timeout: 10_000 }).toBe(1);
  const text = (await shared(page))[0];
  expect(text).toContain('#formulameow');
  expect(text).toContain('https://tokentails.com/shelter-payouts');
  const hash = dareHash(text);

  // F9: the dare opens on a full-screen card (the bot taps it), then a 1v1: one kart on the track and the ghost
  await page.goto('about:blank');
  await page.goto(`/?bot=1&speed=8${hash}`);
  await expect(page.locator('.fm-dare-card')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.fm-dare-card h2')).toHaveText('Mia dares you');
  // the ghost's time is recomputed on this device, never read from the link
  await expect(page.locator('.fm-dare-time b')).toHaveText(/^\d:\d\d\.\d\d$/, { timeout: 15_000 });
  await page.screenshot({ path: 'e2e/screens/dare-card.png' });
  await expect(page.locator('.fm-dare-card')).toHaveCount(0, { timeout: 10_000 });
  await expect.poll(() => field(page), { timeout: 10_000 }).toBe(1);
  await expect.poll(() => ghostIn(page, 'Mia'), { timeout: 10_000 }).toBe(true);
  expect(await fm(page, 'f.shell.setup?.seed')).toBe(5);
  // the live gap pill
  await expect(page.locator('.fm-gap-pill:not(.fm-lap-pill) b')).toHaveText(/^[+−]\d+\.\d\d$/, { timeout: 30_000 });
  await page.screenshot({ path: 'e2e/screens/dare-ghost.png' });
  await expect(page.locator('.fm-overlay.on .fm-headline')).toContainText("Mia's ghost", { timeout: 110_000 });
  await expect(page.locator('.fm-overlay.on tr.ghost')).toContainText('Mia');
  await expect(page.locator('.fm-overlay.on')).toContainText('Rivalry: You');
  await aboveFold(page, '.fm-overlay.on .fm-headline');
  // Rematch: the same ghost, the same 1v1
  await page.locator('.fm-overlay.on [data-act="again"]').click();
  await expect(page.locator('.fm-overlay.on')).toHaveCount(0);
  await expect.poll(() => ghostIn(page, 'Mia'), { timeout: 10_000 }).toBe(true);
  expect(await field(page)).toBe(1);
  expect(errors).toEqual([]);
});

test('the dare card: "Race the pack" races the ghost in the full field; an older ghost races without it', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // no bot: the grid waits under the card
  await page.goto(`/#g=${LEGACY.dare11}&n=Mia`);
  await expect(page.locator('.fm-dare-card')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.fm-dare-mode')).toHaveText('1v1: you and the ghost');
  expect(await fm(page, 'f.shell.world?.tick ?? 0')).toBe(0);
  await page.locator('.fm-dare-card [data-act="pack"]').check();
  await expect(page.locator('.fm-dare-mode')).toHaveText('You, the ghost and 7 cats');
  await page.locator('.fm-dare-card [data-act="dare-go"]').click();
  await expect(page.locator('.fm-dare-card')).toHaveCount(0);
  await expect.poll(() => field(page), { timeout: 10_000 }).toBe(8);
  await expect.poll(() => ghostIn(page, 'Mia'), { timeout: 10_000 }).toBe(true);
  await expect.poll(() => fm(page, 'f.shell.world?.tick ?? 0'), { timeout: 15_000 }).toBeGreaterThan(30);

  // SIM_VERSION 10: the card says so and the race runs on the same track without the ghost (a target-time race)
  await page.goto('about:blank');
  await page.goto(`/?bot=1#g=${LEGACY.dare10}&n=Mia`);
  await expect(page.locator('.fm-dare-card')).toContainText('another version of the game', { timeout: 20_000 });
  await expect.poll(() => fm(page, 'f.shell.world?.tick ?? 0'), { timeout: 30_000 }).toBeGreaterThan(200);
  expect(await field(page)).toBe(8);
  expect(await ghostIn(page, 'Mia')).toBe(false);
  expect(errors).toEqual([]);
});

test('a Time Trial dare: Dare a friend on the results, the link opens a time-trial duel with the ghost', async ({ page }) => {
  test.setTimeout(420_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await stubShare(page);
  await page.addInitScript(() => {
    if (location.protocol !== 'http:') return;
    if (!localStorage.getItem('fm:save')) localStorage.setItem('fm:save', JSON.stringify({ v: 2, settings: {}, slots: { core: { races: 4, unlocked: 1, pounces: 2, drifts: 2, bestTimes: {} } } }));
  });
  await page.goto('/?bot=1&speed=8');
  await expect(page.locator('[data-screen="title"]')).toBeVisible({ timeout: 20_000 });
  await page.locator('[data-act="start"]').click();
  await page.locator('[data-tile="tt"]').click();
  await page.locator('[data-act="ready"]').click();
  await page.locator('[data-act="track-kitchen"]').click();
  await page.locator('[data-screen="tt"] [data-act="start"]').click();
  await expect(page.locator('[data-act="mode-again"]')).toBeVisible({ timeout: 200_000 });
  // F9: the time trial results carry the dare (the headline says how the run went)
  await expect(page.locator('.fm-overlay.on .fm-headline')).toContainText('New best');
  const dare = page.locator('.fm-overlay.on [data-id="dare"]');
  await expect(dare).toContainText('Dare a friend');
  await aboveFold(page, '.fm-overlay.on [data-id="dare"]');
  await dare.click();
  await page.locator('.fm-dare-name input').fill('Zyg');
  await page.locator('.fm-dare-name [type="submit"]').click();
  await expect.poll(async () => (await shared(page)).length, { timeout: 10_000 }).toBe(1);
  const text = (await shared(page))[0];
  // a lone kart: no "1st/8"
  expect(text).not.toContain('/8');
  const hash = dareHash(text);

  await page.goto('about:blank');
  await page.goto(`/?bot=1&speed=8${hash}`);
  await expect(page.locator('.fm-dare-card')).toContainText('Time trial: you and the ghost', { timeout: 20_000 });
  await expect(page.locator('.fm-dare-card [data-act="pack"]')).toHaveCount(0);
  await expect.poll(() => fm(page, 'f.shell.world?.cfg.mode'), { timeout: 15_000 }).toBe('tt');
  await expect.poll(() => ghostIn(page, 'Zyg'), { timeout: 10_000 }).toBe(true);
  expect(await field(page)).toBe(1);
  await expect(page.locator('.fm-gap-pill:not(.fm-lap-pill)')).toBeVisible({ timeout: 30_000 });
  // the bot drives the same run again: a dead heat with its own ghost, to the hundredth
  await expect(page.locator('.fm-overlay.on .fm-headline')).toContainText("Zyg's ghost", { timeout: 200_000 });
  await page.screenshot({ path: 'e2e/screens/dare-tt-results.png' });
  expect(errors).toEqual([]);
});

test('the daily route races the Daily Cup and shares a Wordle-style card', async ({ page }) => {
  await stubShare(page);
  await page.goto('/?daily=1&bot=1&speed=8');
  await expect(page.locator('.fm-overlay.on .fm-place')).toBeVisible({ timeout: 110_000 });
  await expect(page.locator('.fm-overlay.on')).toContainText('Daily Cup #1');
  await page.locator('.fm-overlay [data-act="more"]').click();
  await page.locator('.fm-overlay [data-x="2"]').click();
  await expect.poll(async () => (await shared(page)).length, { timeout: 10_000 }).toBe(1);
  expect((await shared(page))[0]).toMatch(/^Formula Meow Daily #1 · \d+(st|nd|rd|th)\/8 · /);
});

test('the cat maker opens from the results and closes', async ({ page }) => {
  await page.goto('/?bot=1&seed=9&speed=8');
  await expect(page.locator('.fm-overlay.on .fm-place')).toBeVisible({ timeout: 110_000 });
  await page.locator('.fm-overlay [data-act="more"]').click();
  await page.locator('.fm-overlay [data-x="3"]').click();
  await expect(page.locator('.fm-maker')).toBeVisible();
  await expect(page.locator('.fm-maker')).toContainText('stays on this device');
  await page.screenshot({ path: 'e2e/screens/maker.png' });
  await page.locator('.fm-maker [data-act="close"]').click();
  await expect(page.locator('.fm-maker')).toHaveCount(0);
});
