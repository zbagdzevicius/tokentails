import { expect, test, type Page } from '@playwright/test';

// Lane F (docs/FUN-PROGRESSION-V12.md F1–F5): the Fish chip sits clear of the rest of the HUD (desktop: on the ability
// plate; phones, where feel pass B3 hides the hero box: on the minimap's bottom-left rim, clear of the ping paw, the
// kill feed and the emote column); a last-hit "+N" Fish pop shows within 300 ms of its event; a Toy bought is a rail item (and the chip's
// ring bursts); the level-up line says "Ultimate unlocked!"; no rail text says "Treat"; and the results screen shows
// the progression summary (per-hero Toy timings, Fish, last hits, medals, Fish by source) at all four sizes.
// Screenshots: test-results/progression/*.png.

const SHOTS = 'test-results/progression';
const PHONES = [
  { w: 844, h: 390 },
  { w: 667, h: 375 },
  { w: 915, h: 412 },
] as const;
type Box = { x0: number; y0: number; x1: number; y1: number };
const hit = (a: Box, b: Box): boolean => a.x0 < b.x1 - 0.5 && a.x1 > b.x0 + 0.5 && a.y0 < b.y1 - 0.5 && a.y1 > b.y0 + 0.5;
type W = { view: { mySlot: number; frame: { latest: { clock: { tick: number } } } | null }; inject(ev: unknown): void };
const said = (page: Page): Promise<string[]> => page.evaluate(() => [...((window as unknown as { __plJuice?: { notify: { said: string[] } } }).__plJuice?.notify.said ?? [])]);

async function start(page: Page, speed: number): Promise<void> {
  await page.goto(`/?e2e=1&speed=${speed}`);
  await page.waitForSelector('html[data-screen="title"]');
  await page.locator('.pl-btn.big').first().click();
  await page.waitForSelector('html[data-match="live"]', { timeout: 60_000 });
  await page.waitForFunction(() => !!document.documentElement.dataset.me);
  await page.waitForFunction(() => !document.querySelector('.pl-loading:not(.out)'));
  await page.waitForFunction(() => !!(window as unknown as { __plWorld?: unknown }).__plWorld);
}

/** Boxes of every visible element matching `sel`. */
const boxes = (page: Page, sel: string) =>
  page.evaluate((s) => {
    const out: { sel: string; x0: number; y0: number; x1: number; y1: number }[] = [];
    for (const el of document.querySelectorAll<HTMLElement>(s)) {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05) out.push({ sel: s, x0: r.left, y0: r.top, x1: r.right, y1: r.bottom });
    }
    return out;
  }, sel);

test('Fish chip clear of the HUD, a last-hit Fish pop within 300 ms, a Toy toast on the rail, "Ultimate unlocked!"', async ({ page }, info) => {
  test.setTimeout(240_000);
  const touch = info.project.name === 'landscape';
  const sizes = touch ? PHONES : ([{ w: 1440, h: 900 }] as const);
  await page.setViewportSize({ width: sizes[0].w, height: sizes[0].h });
  await start(page, 8);
  // F1: the chip counts the passive Fish
  await expect.poll(async () => Number(await page.locator('.pl-fish').getAttribute('data-fish')), { timeout: 60_000 }).toBeGreaterThan(0);
  // feel pass B3 hid the hero box on phones and the chip with it; Hud.placeFish puts it back on the minimap's rim
  for (const s of sizes) {
    await page.setViewportSize({ width: s.w, height: s.h });
    await page.waitForTimeout(400);
    const [chip] = await boxes(page, '.pl-fish');
    expect(chip, 'the Fish chip is drawn').toBeTruthy();
    expect(chip.x0).toBeGreaterThanOrEqual(0);
    expect(chip.y0).toBeGreaterThanOrEqual(0);
    expect(chip.x1).toBeLessThanOrEqual(s.w);
    expect(chip.y1).toBeLessThanOrEqual(s.h);
    const others = [
      ...(await boxes(page, '.pl-strip .pp')),
      ...(await boxes(page, '.pl-pause')),
      ...(await boxes(page, '.pl-score')),
      // phones: the chip sits on the minimap's bottom rim on purpose (the ping paw holds the other corner)
      ...(touch ? [] : await boxes(page, '.pl-minimap')),
      ...(await boxes(page, '.pl-pingbtn')),
      ...(await boxes(page, '.pl-emote')),
      ...(await boxes(page, '.pl-chatbtn')),
      ...(await boxes(page, '.pl-feed-row')),
      ...(await boxes(page, '.pl-tbtn')),
      ...(await boxes(page, '.pl-slot')),
      ...(await boxes(page, '.pl-portrait .gap')),
      ...(await boxes(page, '.pl-rail-line.on')),
    ];
    for (const o of others) expect(hit(chip, o), `Fish chip ${JSON.stringify(chip)} vs ${o.sel} ${JSON.stringify(o)} at ${s.w}x${s.h}`).toBe(false);
    await page.screenshot({ path: `${SHOTS}/${s.w}x${s.h}-chip.png` });
  }
  await page.setViewportSize({ width: sizes[0].w, height: sizes[0].h });
  await page.waitForTimeout(300);

  // F1: a last-hit Fish event pops a gold "+7" within 300 ms (render path; the sim's last-hit Fish has its own tests).
  // Fish pops within 300 ms merge (DAMAGE_FX.fishMerge), and at speed 8 the player's own last hits and assists pop
  // often (more since the fun pass's bigger last-hit Fish): wait for a moment with no Fish pop on screen first, or the
  // "+7" merges into a real one and is never shown as "+7" alone.
  await page
    .waitForFunction(() => ![...document.querySelectorAll<HTMLElement>('.fx-dmg.fish')].some((e) => Number(getComputedStyle(e).opacity) > 0.05), null, { timeout: 15_000, polling: 'raf' })
    .catch(() => {});
  const popMs = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const w = (window as unknown as { __plWorld: W }).__plWorld;
        const tick = w.view.frame?.latest.clock.tick ?? 0;
        const num = (e: HTMLElement): number => Number((e.textContent ?? '').replace(/[^0-9]/g, '')) || 0;
        // a real pop in the same 300 ms merges with the "+7" (it then reads "+7" plus that pop): a new Fish pop, or one
        // that grew by 7 or more, is the injected Fish shown
        const before = new Map([...document.querySelectorAll<HTMLElement>('.fx-dmg.fish')].map((e) => [e, num(e)] as const));
        const t0 = performance.now();
        w.inject({ type: 'fish', tick, id: w.view.mySlot, amount: 7, reason: 'lastHit' });
        const look = (): void => {
          const el = [...document.querySelectorAll<HTMLElement>('.fx-dmg.fish')].find(
            (e) => Number(getComputedStyle(e).opacity) > 0.1 && (before.has(e) ? num(e) >= before.get(e)! + 7 : e.textContent === '+7'),
          );
          if (el) resolve(performance.now() - t0);
          else if (performance.now() - t0 > 2000) resolve(9999);
          else requestAnimationFrame(look);
        };
        look();
      }),
  );
  expect(popMs, '+7 within 300 ms').toBeLessThanOrEqual(300);

  // F2: the player's Toy: a rail item with its name and stat, the chip's ring burst
  await page.evaluate(() => {
    const w = (window as unknown as { __plWorld: W }).__plWorld;
    w.inject({ type: 'buy', tick: w.view.frame?.latest.clock.tick ?? 0, id: w.view.mySlot, tier: 1 });
  });
  await expect(page.locator('.pl-fish.burst')).toHaveCount(1);
  // it may wait behind a busier line (an announcer banner, a tip): the rail's said list records it once shown
  await expect.poll(async () => (await said(page)).some((t) => /^(Chew Rope|Red Dot|Comfy Bed|Feather|Yarn Ball|Bell Collar) I — \+\d+|^(Chew Rope|Red Dot|Comfy Bed|Feather|Yarn Ball|Bell Collar) I \+\d+.* · Lv \d+$/.test(t)), { timeout: 20_000 }).toBe(true);
  await page.screenshot({ path: `${SHOTS}/${sizes[0].w}x${sizes[0].h}-toy.png` });

  // F3: the level-up line says what is new; level 4 unlocks the ultimate (the XP trickle gets the player there). When the
  // ult tip or goal chip guides it, that line ("Level 4! ...") is the only one (fun pass, playtest #5)
  await expect.poll(async () => (await said(page)).some((t) => /^Level 4 — Ultimate unlocked!| · Lv 4$|^Level 4! /.test(t)), { timeout: 150_000 }).toBe(true);
  await page.screenshot({ path: `${SHOTS}/${sizes[0].w}x${sizes[0].h}-level.png` });
  for (const t of await said(page)) expect(t, 'rail text').not.toMatch(/treat/i);
});

test('results: the progression summary (Toy timings, Fish, last hits, medals, Fish by source) at every size', async ({ page }, info) => {
  test.setTimeout(300_000);
  const touch = info.project.name === 'landscape';
  const sizes = touch ? PHONES : ([{ w: 1440, h: 900 }] as const);
  await page.setViewportSize({ width: sizes[0].w, height: sizes[0].h });
  await start(page, 16);
  await page.waitForSelector('html[data-screen="results"]', { timeout: 240_000 });
  await page.waitForSelector('.pl-results.actions-in', { timeout: 20_000 });
  const prog = page.locator('.pl-results .pl-prog');
  await expect(prog).toHaveCount(1);
  await expect(prog.locator('tbody tr[data-slot]')).toHaveCount(6);
  // fun pass (playtest #12): a header row per team
  await expect(prog.locator('tbody tr.grp')).toHaveCount(2);
  await expect(prog.locator('tr.self')).toHaveCount(1);
  await expect(prog.locator('[data-medal="mvp"]')).toHaveCount(1);
  await expect(prog.locator('[data-medal]')).toHaveCount(4);
  await expect(prog.locator('.src [data-src]').first()).toBeVisible();
  await expect(page.locator('.pl-results')).not.toContainText(/catnip/i);
  for (const s of sizes) {
    await page.setViewportSize({ width: s.w, height: s.h });
    await page.waitForTimeout(400);
    await prog.scrollIntoViewIfNeeded();
    const r = (await boxes(page, '.pl-results .pl-prog'))[0];
    expect(r, 'the summary is drawn').toBeTruthy();
    expect(r.x1, 'no sideways overflow').toBeLessThanOrEqual(s.w);
    expect(r.y1 - r.y0, 'the summary fits the screen height').toBeLessThanOrEqual(s.h);
    // no page scroll: the results column scrolls inside itself
    const page2 = await page.evaluate(() => ({ sh: document.scrollingElement?.scrollHeight ?? 0, ih: innerHeight, sw: document.scrollingElement?.scrollWidth ?? 0, iw: innerWidth }));
    expect(page2.sh).toBeLessThanOrEqual(page2.ih + 1);
    expect(page2.sw).toBeLessThanOrEqual(page2.iw + 1);
    await page.screenshot({ path: `${SHOTS}/${s.w}x${s.h}-results.png` });
  }
});
