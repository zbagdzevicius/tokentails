import { expect, test, type Page } from '@playwright/test';
import { limit } from '../unit/cpu-budget';
import { startFirstMatch } from './helpers';

// Copy polish (Nov 18): the plain-text pass's rough spots, checked where a player reads them. Mode Select says the size
// once and gives Practice its own card; the variant names keep their casing ("PvP"); in a match the catch-up line fits
// the rail at 1440 × 900 and a long name in the kill feed ends in an ellipsis inside its row.

const SIZES = [
  { w: 1440, h: 900, project: 'desktop' },
  { w: 667, h: 375, project: 'landscape' },
] as const;

const PLAYED = { v: 1, sessions: 3, matches: 8, wins: 3, firstWinDone: true, hero: 'sage', firstPlaySession: 1 };

/** A returning player at Home → PLAY → Mode Select (the first-ever match starts in one tap instead). */
async function openModes(page: Page, touch: boolean): Promise<void> {
  await page.goto('/?e2e=1');
  await page.waitForSelector('html[data-screen="title"] .pl-home');
  await tap(page, '[data-testid="home-play"]', touch);
  await expect(page.locator('[data-testid="mode-select"]')).toBeVisible();
}

async function tap(page: Page, sel: string, touch: boolean): Promise<void> {
  const l = page.locator(sel).first();
  if (touch) await l.tap();
  else await l.click();
}

for (const s of SIZES) {
  test(`${s.w}x${s.h}: Mode Select says the size once, Practice is solo training, PvP keeps its casing`, async ({ page }, info) => {
    test.skip(info.project.name !== s.project, s.project);
    test.setTimeout(limit(90_000));
    await page.setViewportSize({ width: s.w, height: s.h });
    const touch = s.project === 'landscape';
    await page.addInitScript((v) => {
      if (!localStorage.getItem('tt.pawlegends.profile.v1')) localStorage.setItem('tt.pawlegends.profile.v1', v);
    }, JSON.stringify(PLAYED));
    const ms = page.locator('[data-testid="mode-select"]');
    // Practice: its own subtitle, and one "Solo" card that says what it is (not "vs Bots")
    await openModes(page, touch);
    await tap(page, '[data-testid="mode-practice"]', touch);
    await expect(ms.locator('.ms-sum')).toHaveText('Practice · Solo training');
    await tap(page, '[data-testid="mode-next"]', touch);
    await expect(ms).toHaveAttribute('data-stage', 'variant');
    await expect(ms.locator('.ms-var .ms-var-n')).toHaveText(['Solo']);
    await expect(ms.locator('.ms-var .ms-var-l')).toHaveText(['You vs 3 training dummies']);
    // Skirmish: "Skirmish 3v3 · ~7 min" (the size once); the variants keep their casing ("PvP")
    await openModes(page, touch);
    await tap(page, '[data-testid="mode-skirmish"]', touch);
    await expect(ms.locator('.ms-sum')).toHaveText('Skirmish 3v3 · ~7 min');
    await tap(page, '[data-testid="mode-next"]', touch);
    const pvp = ms.locator('[data-testid="variant-pvp"] .ms-var-n');
    await expect(pvp).toHaveText('PvP');
    expect(await pvp.evaluate((e) => getComputedStyle(e).textTransform)).toBe('none');
    await page.screenshot({ path: `test-results/copy-polish/${s.w}x${s.h}-variants.png` });
  });

  test(`${s.w}x${s.h}: the catch-up line fits the rail; a long kill-feed name ends in an ellipsis inside its row`, async ({ page }, info) => {
    test.skip(info.project.name !== s.project, s.project);
    test.setTimeout(limit(120_000));
    await page.setViewportSize({ width: s.w, height: s.h });
    await startFirstMatch(page, '&speed=3');
    await page.waitForFunction(() => !!(window as unknown as { __plJuice?: unknown }).__plJuice);
    const note = { key: 'underdog', title: 'Behind on Toys: +1 Fish/s', sub: 'Goes to your lowest-Fish teammate', tone: 'info', prio: 4 };
    await expect
      .poll(
        async () =>
          page.evaluate((n) => {
            const j = (window as unknown as { __plJuice: { notify: { queue: { clear(): void } }; push(x: unknown): boolean } }).__plJuice;
            const up = [...document.querySelectorAll<HTMLElement>('.pl-rail-line.on')].find((e) => (e.textContent ?? '').includes(n.title));
            if (up) return true;
            (document.querySelector('.pl-talents.on button') as HTMLElement | null)?.click();
            j.notify.queue.clear();
            j.push(n);
            return false;
          }, note),
        { timeout: limit(20_000) },
      )
      .toBe(true);
    const line = await page.evaluate((title) => {
      const el = [...document.querySelectorAll<HTMLElement>('.pl-rail-line.on')].find((e) => (e.textContent ?? '').includes(title))!;
      const fits = (sel: string): boolean => {
        const t = el.querySelector<HTMLElement>(sel);
        return !t || getComputedStyle(t).display === 'none' || t.scrollWidth <= t.clientWidth + 1;
      };
      const r = el.getBoundingClientRect();
      return { tt: fits('.tt'), sb: fits('.sb'), x0: r.left, x1: r.right, sbShown: getComputedStyle(el.querySelector('.sb')!).display !== 'none' };
    }, note.title);
    expect(line.x0).toBeGreaterThanOrEqual(0);
    expect(line.x1).toBeLessThanOrEqual(s.w);
    if (s.project === 'desktop') {
      expect(line.sbShown, 'the catch-up sub shows on desktop').toBe(true);
      expect(line.tt && line.sb, 'the catch-up title and sub are not cut at 1440 × 900').toBe(true);
    }
    await page.screenshot({ path: `test-results/copy-polish/${s.w}x${s.h}-catchup.png` });
    // a long name in the kill feed: the name ends in an ellipsis and the row stays inside the screen
    await page.evaluate(() =>
      (window as unknown as { __plHud: { kill(a: unknown, b: unknown, good: boolean): void } }).__plHud.kill(
        { name: 'Duke the Marshmallow', rel: 'enemy', hero: 'marshmallow' },
        { name: 'Princess Sparkle Whiskers', rel: 'ally', hero: 'clem' },
        false,
      ),
    );
    await page.waitForTimeout(400);
    const row = await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>('.pl-feed-row.kill')!;
      const r = el.getBoundingClientRect();
      const names = [...el.querySelectorAll<HTMLElement>('b')].filter((b) => getComputedStyle(b).display !== 'none');
      return {
        x0: r.left,
        x1: r.right,
        names: names.map((b) => {
          const br = b.getBoundingClientRect();
          const cs = getComputedStyle(b);
          return { inRow: br.left >= r.left - 0.5 && br.right <= r.right + 0.5, clipped: b.scrollWidth > b.clientWidth, ellipsis: cs.textOverflow === 'ellipsis' && cs.overflow === 'hidden' };
        }),
      };
    });
    expect(row.x0).toBeGreaterThanOrEqual(0);
    expect(row.x1).toBeLessThanOrEqual(s.w);
    for (const n of row.names) {
      expect(n.inRow, 'the name stays inside its row').toBe(true);
      if (n.clipped) expect(n.ellipsis, 'a cut name ends in an ellipsis').toBe(true);
    }
    if (s.project === 'desktop') expect(row.names.length).toBe(2);
    await page.screenshot({ path: `test-results/copy-polish/${s.w}x${s.h}-feed.png` });
  });
}
