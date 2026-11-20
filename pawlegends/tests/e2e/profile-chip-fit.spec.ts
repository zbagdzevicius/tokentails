import { expect, test, type Page } from '@playwright/test';
import { limit } from '../unit/cpu-budget';

// Founder Nov 20: "on desktop XP indicator goes out of that section". The Home profile chip (homeScreen.ts profileHtml)
// caps its width (max-width), but the Season XP bar under the name had a fixed width (240 px on desktop) that was wider
// than the text column the cap leaves (300 - avatar 64 - gap 10 - padding 16 = 210 px), so the bar ran past the plate.
// At every Home size, with the short and the long name and title, the bar, the name, the title and the level line stay
// inside the chip (clear of its right padding), and the chip never runs into the Yarn chip or the champion nameplate.

const SIZES = [
  { name: '1280x720', width: 1280, height: 720, dpr: 1 },
  { name: '1280x720@1.5', width: 1280, height: 720, dpr: 1.5 },
  { name: '1440x900', width: 1440, height: 900, dpr: 2 },
  { name: '1920x1080', width: 1920, height: 1080, dpr: 1 },
  { name: '2560x1440', width: 2560, height: 1440, dpr: 1 },
  { name: '844x390', width: 844, height: 390, dpr: 3 },
  { name: '667x375', width: 667, height: 375, dpr: 2 },
];

const CASES = [
  { name: 'short', who: 'Zygis', title: "Raspberry's Pal", sub: 'Lv 8 · Tier 2' },
  { name: 'long', who: 'Sir Barkington the Third', title: 'Season One Legend', sub: 'Lv 30 · Tier 50' },
  { name: 'no title', who: 'Sir Barkington the Third', title: '', sub: 'Lv 30 · Tier 50' },
];

const PLAYED = { v: 1, sessions: 3, matches: 8, wins: 3, firstWinDone: true, hero: 'sage', firstPlaySession: 1 };

/** Puts the case's name, title and level line in the chip (the same markup profileHtml writes). */
async function dress(page: Page, c: (typeof CASES)[number]): Promise<void> {
  await page.evaluate((c) => {
    const t = document.querySelector<HTMLElement>('[data-testid="home-profile"] .hm-pf-t')!;
    t.querySelector('.hm-pf-name')!.textContent = c.who;
    t.querySelector('.hm-pf-title')?.remove();
    if (c.title) {
      const s = document.createElement('small');
      s.className = 'hm-pf-title';
      s.textContent = c.title;
      t.querySelector('.hm-pf-name')!.after(s);
    }
    t.querySelector('.hm-pf-sub')!.textContent = c.sub;
    t.querySelector<HTMLElement>('.hm-xp i')!.style.width = '62%';
  }, c);
}

/** Everything that leaves the chip or collides with its neighbours, as readable lines (empty = fits). */
function fitProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const chip = document.querySelector<HTMLElement>('[data-testid="home-profile"]')!;
    const c = chip.getBoundingClientRect();
    const pad = parseFloat(getComputedStyle(chip).paddingRight);
    const r = (n: number): number => Math.round(n * 10) / 10;
    for (const sel of ['.hm-xp', '.hm-pf-name', '.hm-pf-title', '.hm-pf-sub']) {
      const e = chip.querySelector<HTMLElement>(sel);
      if (!e) continue;
      const b = e.getBoundingClientRect();
      // the bar's -8deg skew leans its corners under a pixel past its box; 1 px of slack
      if (b.right > c.right - pad + 1) out.push(`${sel} right ${r(b.right)} past the chip's padding edge ${r(c.right - pad)}`);
      if (b.left < c.left - 1) out.push(`${sel} left ${r(b.left)} before the chip ${r(c.left)}`);
      if (e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).textOverflow !== 'ellipsis') out.push(`${sel} text spills (${e.scrollWidth} > ${e.clientWidth})`);
    }
    if (c.right > innerWidth || c.bottom > innerHeight) out.push('chip off screen');
    for (const sel of ['.hm-cur > *', '.hm-plate', '.fr-rail']) {
      for (const n of document.querySelectorAll<HTMLElement>(sel)) {
        if (n.offsetParent === null) continue;
        const b = n.getBoundingClientRect();
        if (b.width === 0) continue;
        if (b.right > c.left && b.left < c.right && b.bottom > c.top && b.top < c.bottom)
          out.push(`chip overlaps ${n.getAttribute('aria-label') ?? n.className}`);
      }
    }
    return out;
  });
}

for (const size of SIZES) {
  test.describe(`profile chip fit at ${size.name}`, () => {
    test.use({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: size.dpr });
    test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'the sizes are set per test'));

    test('the XP bar and the text stay inside the chip', async ({ page }) => {
      test.setTimeout(limit(90_000));
      await page.addInitScript((v) => {
        try {
          if (!localStorage.getItem('tt.pawlegends.profile.v1')) localStorage.setItem('tt.pawlegends.profile.v1', v);
        } catch {
          /* storage blocked */
        }
      }, JSON.stringify(PLAYED));
      await page.goto('/');
      const chip = page.locator('[data-testid="home-profile"]');
      await chip.waitFor();
      await page.waitForFunction(() => document.getAnimations().every((a) => a.effect?.getTiming().iterations === Infinity || a.playState !== 'running'), null, { timeout: limit(30_000) });
      const shots = process.env.XPCHIP_SHOTS;
      const problems: string[] = [];
      for (const c of CASES) {
        await dress(page, c);
        if (shots) await page.screenshot({ path: `${shots}/${size.name}-${c.name.replace(' ', '-')}.png`, clip: await chip.evaluate((e) => { const b = e.getBoundingClientRect(); return { x: Math.max(0, b.x - 12), y: Math.max(0, b.y - 12), width: b.width + 120, height: b.height + 24 }; }) });
        for (const p of await fitProblems(page)) problems.push(`${c.name}: ${p}`);
      }
      expect(problems).toEqual([]);
    });
  });
}
