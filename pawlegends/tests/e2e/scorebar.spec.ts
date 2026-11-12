import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { playFromHome, seedSide } from './helpers';

// Founder ask 2026-11-12: "on mobile make this a little bit bigger and show K/D/A as well". In a real bots match the
// phone score strip is about 1.3× its old 151 × 24 px (31 px tall, 20 px digits, still one line, at most 248 px wide),
// shows the own K / D / A beside the clock and updates it live from the scoreboard's counts, and overlaps none of the
// minimap, its ping corner, the Nap button, the emote column, the kill feed or the rail (the announcer and first-blood
// banners live there). Desktop shows the K / D / A in the clock tab. Screenshots: test-results/scorebar/*.png
// (SCOREBAR_SHOTS overrides the folder).

const SHOTS = process.env.SCOREBAR_SHOTS ?? 'test-results/scorebar';
type Box = { x: number; y: number; width: number; height: number };
const overlap = (a: Box, b: Box): boolean => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

async function startBots(page: Page, w: number, h: number, touch: boolean): Promise<void> {
  await page.setViewportSize({ width: w, height: h });
  await seedSide(page, 'cat', {
    sessions: 3,
    matches: 5,
    wins: 2,
    veteran: true,
  });
  await page.goto('/?e2e=1');
  await page.waitForSelector('html[data-screen="title"]');
  await playFromHome(page);
  await page.waitForSelector('html[data-match="live"]');
  await page.waitForFunction(() => !document.querySelector('.pl-loading:not(.out)'));
  if (touch) {
    await page.touchscreen.tap(w * 0.3, h * 0.85);
    await expect(page.locator('.pl-touch.on')).toBeVisible();
  }
  await page.waitForTimeout(1200);
}

/** Through the e2e scoreboard hook: the own hero takes a knockout, an extra assist, and is knocked out once. */
async function scoreKda(page: Page): Promise<void> {
  await page.evaluate(() => {
    const sb = (
      window as unknown as {
        __plScoreboard: {
          mySlot: number;
          picks: unknown[];
          death(v: number, k: number): void;
          credit(id: number): void;
        };
      }
    ).__plScoreboard;
    const per = sb.picks.length >> 1;
    const enemy = sb.mySlot < per ? per : 0;
    sb.death(enemy, sb.mySlot);
    sb.credit(sb.mySlot);
    sb.credit(sb.mySlot);
    sb.death(sb.mySlot, enemy);
  });
}

const boxes = (page: Page, sel: string): Promise<Box[]> =>
  page.evaluate(
    (s) =>
      [...document.querySelectorAll<HTMLElement>(s)]
        .filter((e) => {
          const cs = getComputedStyle(e);
          const r = e.getBoundingClientRect();
          return cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.04 && r.width > 0 && r.height > 0;
        })
        .map((e) => {
          const r = e.getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height };
        }),
    sel,
  );

// small phones (667 × 375) start at the second squeeze step: 17 px digits and a 208 px strip, so a kill row still
// fits beside the larger minimap; 844 × 390 has 20 px digits and up to 248 px
for (const s of [
  { w: 667, h: 375, maxW: 208, digit: 17 },
  { w: 844, h: 390, maxW: 248, digit: 20 },
] as const) {
  test(`${s.w}x${s.h}: the phone score strip is bigger, shows the own K / D / A live and overlaps nothing`, async ({ page }, info) => {
    test.skip(info.project.name !== 'landscape', 'touch phone sizes');
    test.setTimeout(120_000);
    mkdirSync(SHOTS, { recursive: true });
    await startBots(page, s.w, s.h, true);
    const plate = (await boxes(page, '.pl-score'))[0]!;
    // before: 151 × 24 px, 15 px digits; now ≈ 1.3× (31 px tall), one line, centred, inside the safe top
    expect(plate.height).toBeGreaterThanOrEqual(30);
    expect(plate.height).toBeLessThanOrEqual(32);
    expect(plate.width).toBeGreaterThan(151 * 1.2);
    expect(plate.width).toBeLessThanOrEqual(s.maxW);
    expect(plate.y).toBeGreaterThanOrEqual(0);
    expect(Math.abs(plate.x + plate.width / 2 - s.w / 2)).toBeLessThanOrEqual(2);
    const sizes = await page.evaluate(() => ({
      digit: parseFloat(getComputedStyle(document.querySelector('.pl-score .k0')!).fontSize),
      kdaTop: document.querySelector('.pl-score .kda')!.getBoundingClientRect().top,
      clockTop: document.querySelector('.pl-score .clock')!.getBoundingClientRect().top,
    }));
    expect(sizes.digit).toBeGreaterThanOrEqual(s.digit);
    // the K / D / A chip: shown, on the strip's one line, 0 / 0 / 0 at the start
    const kda = page.locator('.pl-score .kda');
    await expect(kda).toBeVisible();
    await expect(kda).toHaveAttribute('aria-label', 'Your K / D / A: 0 / 0 / 0');
    const chip = (await boxes(page, '.pl-score .kda'))[0]!;
    expect(chip.y).toBeGreaterThanOrEqual(plate.y);
    expect(chip.y + chip.height).toBeLessThanOrEqual(plate.y + plate.height + 0.5);
    expect(chip.x + chip.width).toBeLessThanOrEqual(plate.x + plate.width);
    // live: a knockout, an assist and a nap reach the strip on the next frames
    await scoreKda(page);
    await expect(kda).toHaveAttribute('aria-label', 'Your K / D / A: 1 / 1 / 1');
    await expect(kda).toHaveAttribute('data-kda', '1/1/1');
    // the busiest strips each squeeze step must hold (hud.ts scoreDense: the level each case gets), measured on still
    // copies: the pause's right edge plus the frame's padding stays within 248 px
    const need = await page.evaluate((narrow) => {
      const el = document.querySelector<HTMLElement>('.pl-score')!;
      type V = { n: string; d: string; c: string; o?: boolean; p?: boolean; nums?: string };
      const cases: V[] = [
        { n: 'plain 8:08', d: '0', c: '8:08' },
        { n: 'kills 18, 12:34', d: '1', c: '12:34', nums: '18,0,0,0,0' },
        { n: 'K / D 18 / 10', d: '1', c: '9:59', nums: '0,0,18,10,0' },
        { n: 'objective, 12:34, kills 18', d: '2', c: '12:34', o: true, nums: '18,0,0,0,0' },
        { n: 'all two digits, 12:34', d: '2', c: '12:34', nums: '18,18,18,18,18' },
        { n: 'ping, 12:34, kills 18', d: '3', c: '12:34', p: true, nums: '18,0,0,0,0' },
        { n: 'everything', d: '3', c: '25:00', o: true, p: true, nums: '18,18,18,18,18' },
      ];
      return cases.map((v) => {
        const c = el.cloneNode(true) as HTMLElement;
        // small phones start at step 2 and go one step further (hud.ts scoreDense)
        c.dataset.dense = narrow ? String(Math.min(4, Math.max(2, Number(v.d) + 1))) : v.d;
        c.style.maxWidth = 'none';
        c.querySelector('.clock')!.textContent = v.c;
        if (v.o) {
          const o = c.querySelector<HTMLElement>('.obj')!;
          o.hidden = false;
          o.dataset.key = 'rats';
          o.querySelector('b')!.textContent = 'Up!';
        }
        if (v.p) {
          const p = document.createElement('span');
          p.className = 'mp-ping';
          p.textContent = '120 ms';
          c.querySelector('.mid')!.appendChild(p);
        }
        (v.nums ?? '0,0,0,0,0').split(',').forEach((t, i) => (c.querySelector(['.k0', '.k1', '.kk', '.kd', '.ka'][i])!.textContent = t));
        el.parentElement!.appendChild(c);
        const r = c.getBoundingClientRect();
        const w = c.querySelector('.pl-pause')!.getBoundingClientRect().right - r.left + parseFloat(getComputedStyle(c).paddingRight);
        c.remove();
        return { n: v.n, w, max: parseFloat(getComputedStyle(el).maxWidth) };
      });
    }, s.w < 700);
    console.log(`[scorebar] ${JSON.stringify(need)}`);
    for (const c of need) expect(c.w, c.n).toBeLessThanOrEqual(c.max);
    // the kill feed's two rows, beside the minimap
    await page.evaluate(() => {
      const h = (
        window as unknown as {
          __plHud: { kill(a: unknown, b: unknown, good: boolean): void };
        }
      ).__plHud;
      h.kill({ name: 'You', rel: 'self', hero: 'clem' }, { name: 'Sir Brutus', rel: 'enemy', hero: 'brutus' }, true);
      h.kill({ name: 'A tower', rel: 'enemy' }, { name: 'Sage', rel: 'ally', hero: 'sage' }, false);
    });
    await page.waitForTimeout(300);
    const after = (await boxes(page, '.pl-score'))[0]!;
    // one line, nothing spills out of the frame (the pause included): today's numbers, then a late game's two-digit
    // ones (15 – 14 and 12 / 10 / 15, written and measured in one task, before the next frame puts the real ones back)
    for (const big of [false, true]) {
      const fit = await page.evaluate((late) => {
        const el = document.querySelector<HTMLElement>('.pl-score')!;
        if (late) {
          const h = (window as unknown as { __plHud: { update(...a: unknown[]): void; kda(k: number, d: number, a: number): void } }).__plHud;
          h.update(null, { seconds: 1500, phase: 'play', nextPhaseIn: 0, tick: 45000 }, { kills: [15, 14], towers: [3, 2] }, 0);
          h.kda(12, 10, 15);
        }
        const r = el.getBoundingClientRect();
        const kids = [...el.querySelectorAll<HTMLElement>('.team, .sw, .mid, .kda, .clock, .pl-pause')]
          .filter((e) => getComputedStyle(e).display !== 'none')
          .map((e) => e.getBoundingClientRect());
        const out = kids.filter((k) => k.left < r.left - 0.5 || k.right > r.right + 0.5 || k.top < r.top - 0.5 || k.bottom > r.bottom + 0.5).length;
        return { out, pause: !!el.querySelector('.pl-pause'), dense: el.dataset.dense ?? '', w: r.width, h: r.height };
      }, big);
      expect(fit.pause, 'the pause sits in the strip').toBe(true);
      expect(fit.out, `nothing spills out (late ${big}, dense ${fit.dense})`).toBe(0);
      expect(fit.dense).toBe(s.w < 700 ? (big ? '3' : '2') : big ? '2' : '0');
      expect(fit.w).toBeLessThanOrEqual(s.maxW);
      expect(fit.h).toBeLessThanOrEqual(32);
      if (big) {
        // the screenshot: a still copy of the late strip under the live one (the live one has the real numbers again)
        await page.evaluate(() => {
          const el = document.querySelector<HTMLElement>('.pl-score')!;
          const c = el.cloneNode(true) as HTMLElement;
          const put = (q: string, t: string) => c.querySelectorAll(q).forEach((e) => (e.textContent = t));
          put('.k0', '15');
          put('.k1', '14');
          put('.tw0', '3');
          put('.tw1', '2');
          put('.kk', '12');
          put('.kd', '10');
          put('.ka', '15');
          put('.clock', '25:00');
          c.dataset.dense = document.querySelector<HTMLElement>('.pl-score')!.dataset.dense ?? '2';
          c.classList.add('e2e-late');
          c.style.marginTop = '46px';
          el.parentElement!.appendChild(c);
        });
        await page.screenshot({ path: `${SHOTS}/${s.w}x${s.h}-late-top.png`, clip: { x: 0, y: 0, width: s.w, height: 110 } });
        const late = (await boxes(page, '.pl-score.e2e-late'))[0]!;
        expect(late.width).toBeLessThanOrEqual(s.maxW);
        await page.evaluate(() => document.querySelector('.pl-score.e2e-late')?.remove());
      }
    }
    await expect(kda).toHaveAttribute('data-kda', '1/1/1');
    for (const sel of [
      '.pl-minimap',
      '.pl-pingbtn',
      '.pl-tbtn.nap',
      '.pl-emote',
      '.pl-chatbtn',
      '.pl-feed-row',
      '.pl-rail',
      '.pl-rail-line',
      '.pl-fish',
      '.pl-tbtn',
    ]) {
      for (const b of await boxes(page, sel)) expect(overlap(after, b), `${sel} ${JSON.stringify(b)} vs the strip ${JSON.stringify(after)}`).toBe(false);
    }
    await page.screenshot({ path: `${SHOTS}/${s.w}x${s.h}.png` });
    await page.screenshot({
      path: `${SHOTS}/${s.w}x${s.h}-top.png`,
      clip: { x: 0, y: 0, width: s.w, height: 90 },
    });
    info.annotations.push({
      type: 'scorebar',
      description: `${s.w}x${s.h} strip ${Math.round(after.width)}x${Math.round(after.height)}`,
    });
    console.log(`[scorebar] ${s.w}x${s.h} strip ${after.width.toFixed(1)}x${after.height.toFixed(1)} chip ${chip.width.toFixed(1)}x${chip.height.toFixed(1)}`);
  });
}

test('1440x900 desktop: the K / D / A sits in the clock tab and updates live', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'desktop');
  test.setTimeout(120_000);
  mkdirSync(SHOTS, { recursive: true });
  await startBots(page, 1440, 900, false);
  const plate = (await boxes(page, '.pl-score'))[0]!;
  // the desktop plate keeps its size (300 × 48 before)
  expect(plate.height).toBeLessThanOrEqual(50);
  expect(plate.width).toBeLessThanOrEqual(320);
  const kda = page.locator('.pl-score .kda');
  await expect(kda).toBeVisible();
  await expect(kda).toHaveAttribute('aria-label', 'Your K / D / A: 0 / 0 / 0');
  await scoreKda(page);
  await expect(kda).toHaveAttribute('aria-label', 'Your K / D / A: 1 / 1 / 1');
  const mid = (await boxes(page, '.pl-score .mid'))[0]!;
  const chip = (await boxes(page, '.pl-score .kda'))[0]!;
  expect(chip.x).toBeGreaterThanOrEqual(mid.x);
  expect(chip.x + chip.width).toBeLessThanOrEqual(mid.x + mid.width);
  await page.screenshot({ path: `${SHOTS}/1440x900.png` });
  await page.screenshot({
    path: `${SHOTS}/1440x900-top.png`,
    clip: { x: 360, y: 0, width: 720, height: 120 },
  });
  console.log(`[scorebar] 1440x900 plate ${plate.width.toFixed(1)}x${plate.height.toFixed(1)} chip ${chip.width.toFixed(1)}x${chip.height.toFixed(1)}`);
});
