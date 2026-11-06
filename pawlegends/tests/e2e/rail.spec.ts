import { expect, test, type Page } from '@playwright/test';
import { attr } from './helpers';

// LoL pass, lane A: every screen-anchored message is one line on the top rail (ui/notify.ts), just under the score
// bar. On phones the rail ends by y 84 (844×390, 915×412) or y 70 (667×375) and shows one line; on desktop it ends
// by y 160 (1440×900). It never covers the player's own plate, the old centre layers are gone, and the lane help
// that used to re-fire shows once however often it is pushed. Screenshots: test-results/rail/*.png.

const SHOTS = 'test-results/rail';
type Box = { x0: number; y0: number; x1: number; y1: number };
const hit = (a: Box, b: Box): boolean => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

const SIZES = [
  { w: 844, h: 390, touch: true, bottom: 84 },
  { w: 667, h: 375, touch: true, bottom: 70 },
  { w: 915, h: 412, touch: true, bottom: 84 },
  { w: 1440, h: 900, touch: false, bottom: 160 },
] as const;

async function start(page: Page): Promise<void> {
  await page.goto('/?e2e=1&speed=3');
  await page.waitForSelector('html[data-screen="title"]');
  await page.locator('.pl-btn.big').first().click();
  await page.waitForSelector('html[data-match="live"]', { timeout: 60_000 });
  await page.waitForFunction(() => !!document.documentElement.dataset.me);
  await page.waitForFunction(() => !document.querySelector('.pl-loading:not(.out)'));
  await page.waitForFunction(() => !!(window as unknown as { __plJuice?: unknown }).__plJuice);
}

/** The rail's box and the visible lines. */
const railState = (page: Page) =>
  page.evaluate(() => {
    const rail = document.querySelector('.pl-rail') as HTMLElement;
    const r = rail.getBoundingClientRect();
    const lines = [...document.querySelectorAll<HTMLElement>('.pl-rail-line.on')].filter((e) => getComputedStyle(e).visibility !== 'hidden');
    return {
      rail: { x0: r.left, y0: r.top, x1: r.right, y1: r.bottom },
      lines: lines.map((e) => {
        const b = e.getBoundingClientRect();
        return { text: e.textContent ?? '', box: { x0: b.left, y0: b.top, x1: b.right, y1: b.bottom } };
      }),
    };
  });

for (const s of SIZES) {
  test(`${s.w}x${s.h}: one note of each priority stays in the top rail, clear of the player's plate`, async ({ page }, info) => {
    test.skip(info.project.name !== (s.touch ? 'landscape' : 'desktop'), s.touch ? 'touch sizes' : 'desktop size');
    test.setTimeout(120_000);
    await page.setViewportSize({ width: s.w, height: s.h });
    await start(page);
    const notes = [
      { title: 'Our core is under attack!', prio: 0, tone: 'bad' },
      { key: 'tower', title: 'Tower aiming at you!', sub: 'Step out of its ring.', prio: 1, tone: 'bad' },
      { title: 'First Blood!', sub: 'Tofu drew first blood', prio: 2, tone: 'gold', big: true },
      { title: 'Takedown!', prio: 3, tone: 'gold', count: true },
      { key: 'tip:q', title: 'Enemy hero! Tap the glowing skill', prio: 4, tone: 'info' },
    ];
    for (const n of notes) {
      await page.evaluate((note) => {
        const j = (window as unknown as { __plJuice: { notify: { queue: { clear(): void } }; push(n: unknown): boolean } }).__plJuice;
        j.notify.queue.clear();
        j.push(note);
      }, n);
      // A real match note can hold the rail, and an open talent card holds prio 2-4 (NoteQueue.hold) until the note is
      // stale: a level-up at 667 × 375 did both. Push again on each poll until the note is up (pushing a note that is
      // on screen only refreshes it).
      await expect
        .poll(
          async () => {
            if ((await railState(page)).lines.some((l) => l.text.includes(n.title))) return true;
            await page.evaluate((note) => {
              (document.querySelector('.pl-talents.on button') as HTMLElement | null)?.click();
              (window as unknown as { __plJuice: { push(n: unknown): boolean } }).__plJuice.push(note);
            }, n);
            return false;
          },
          { timeout: 20_000 },
        )
        .toBe(true);
      await page.waitForTimeout(250);
      const st = await railState(page);
      expect(st.rail.y1, `rail bottom for prio ${n.prio}`).toBeLessThanOrEqual(s.bottom);
      for (const l of st.lines) expect(l.box.y1, `${l.text} bottom`).toBeLessThanOrEqual(s.bottom + 0.5);
      if (s.touch) expect(st.lines.length, 'one rail line on a phone').toBeLessThanOrEqual(1);
      const plate = (await attr(page, 'selfPlate')).split(',').map(Number);
      if (plate.length === 4 && plate.every(Number.isFinite)) {
        const box = { x0: plate[0], y0: plate[1], x1: plate[2], y1: plate[3] };
        for (const l of st.lines) expect(hit(l.box, box), `${l.text} vs the player's plate ${JSON.stringify(box)}`).toBe(false);
      }
      await page.screenshot({ path: `${SHOTS}/${s.w}x${s.h}-prio${n.prio}.png` });
    }
    // the old centre layers are gone
    expect(await page.locator('[class*="pl-banner"], [class*="pl-callout"], .pl-alert, .pl-tip, .pl-count, .pl-lc-gate').count()).toBe(0);
    // its own key: the match's real lane help (key lane-help) may already be on its cooldown
    // three identical lane-help pushes within 5 s show once: once it has shown, the next two are refused (its 8 s
    // cooldown; a note put back by a more important one may come back, but never as a new push)
    await page.evaluate(() => (window as unknown as { __plJuice: { notify: { queue: { clear(): void } } } }).__plJuice.notify.queue.clear());
    const pushLane = () =>
      page.evaluate(() => {
        const juice = (window as unknown as { __plJuice: { notify: { push(n: unknown): boolean } } }).__plJuice;
        return juice.notify.push({ key: 'e2e-lane-help', title: 'Your team needs you in Sunny Lane', prio: 4, cooldown: 8000, tone: 'info' });
      });
    await pushLane();
    await expect.poll(() => page.evaluate(() => document.querySelector('.pl-rail')?.getAttribute('data-said') ?? ''), { timeout: 20_000 }).toContain('Your team needs you in Sunny Lane');
    await page.waitForTimeout(1500);
    const again = [await pushLane()];
    await page.waitForTimeout(1500);
    again.push(await pushLane());
    expect(again, 'the lane help shows once').toEqual([false, false]);
  });
}
