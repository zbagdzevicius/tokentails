import { expect, test, type Page } from '@playwright/test';
import { PROFILE_KEY } from './helpers';

// The release watermark (src/ui/versionMark.ts) on the title screen: at a landscape phone (844x390, touch) and a
// desktop (1440x900), for a new and a returning profile, it renders the baked line ("v0.1.0 · build 20261111-1530 ·
// a1b2c3d · sim 20 · web"), sits inside the viewport, and overlaps no other control of the title. It is gone in a
// match, and a click copies the full line.

const RETURNING = { v: 1, sessions: 3, matches: 8, wins: 4, firstWinDone: true, hero: 'sage', side: 'cat', veteran: true, firstPlaySession: 1 };
const SIZES = [
  { name: '844x390', width: 844, height: 390, touch: true },
  { name: '1440x900', width: 1440, height: 900, touch: false },
];
const LINE = /^v\d+\.\d+\.\d+ · build \d{8}-\d{4} · [0-9a-z]+ · sim \d+ · web$/;

/** The watermark's box against every other visible interactive element on the page: the overlaps, and off-screen. */
async function problems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const mark = document.querySelector<HTMLElement>('.lb-ver');
    if (!mark || mark.offsetParent === null) return ['no watermark'];
    const m = mark.getBoundingClientRect();
    if (m.width < 20 || m.height < 8) out.push(`watermark ${Math.round(m.width)}x${Math.round(m.height)}`);
    if (m.left < -1 || m.top < -1 || m.right > innerWidth + 1 || m.bottom > innerHeight + 1) out.push('watermark off screen');
    const sel = 'button, a[href], summary, input, select, textarea, [role="button"], [role="radio"], [tabindex]:not([tabindex="-1"])';
    for (const e of document.querySelectorAll<HTMLElement>(sel)) {
      if (e === mark || mark.contains(e) || e.contains(mark)) continue;
      const cs = getComputedStyle(e);
      if (e.offsetParent === null && cs.position !== 'fixed') continue;
      if (cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
      const r = e.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.right > m.left + 0.5 && r.left < m.right - 0.5 && r.bottom > m.top + 0.5 && r.top < m.bottom - 0.5)
        out.push(`overlaps ${e.getAttribute('aria-label') ?? e.className ?? e.tagName}`);
    }
    // the topmost element at the watermark's centre is the watermark (nothing lies over it)
    const hit = document.elementFromPoint(m.left + m.width / 2, m.top + m.height / 2);
    if (!hit || !(hit === mark || mark.contains(hit))) out.push(`covered by ${hit?.className ?? 'nothing'}`);
    return out;
  });
}

for (const size of SIZES) {
  test.describe(`version watermark at ${size.name}`, () => {
    test.use({ viewport: { width: size.width, height: size.height }, hasTouch: size.touch, isMobile: size.touch, deviceScaleFactor: size.touch ? 2 : 1 });
    test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'the sizes are set per test'));

    for (const profile of ['new', 'returning'] as const) {
      test(`title, ${profile}`, async ({ page }) => {
        test.setTimeout(90_000);
        // a PvP-capable relay, as in production, so the online row is at its fullest
        await page.route('**/pawlegends/sim', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ simVersions: [18], pvpSince: 16 }) }));
        if (profile === 'returning')
          await page.addInitScript(([k, v]) => {
            if (!localStorage.getItem(k)) localStorage.setItem(k, v);
          }, [PROFILE_KEY, JSON.stringify(RETURNING)] as const);
        await page.goto('/?e2e=1');
        await page.waitForSelector('html[data-screen="title"] .pl-home');
        // past the lobby's fade-in and the peek's late styling
        await page.waitForTimeout(800);
        const mark = page.locator('[data-testid="version-mark"]');
        await expect(mark).toBeVisible();
        await expect(mark).toBeInViewport();
        const text = (await mark.innerText()).trim();
        expect(text).toMatch(LINE);
        expect(await mark.getAttribute('title')).toContain(text);
        expect(await problems(page)).toEqual([]);
        // low contrast: it never reads like a control
        expect(Number(await mark.evaluate((e) => getComputedStyle(e).opacity))).toBeLessThan(0.6);
      });
    }
  });
}

test('a click copies the full line; the watermark is gone in a match', async ({ page, context, browserName }, info) => {
  test.skip(info.project.name !== 'desktop' || browserName !== 'chromium', 'chromium clipboard permissions, desktop only');
  test.setTimeout(120_000);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/?e2e=1');
  await page.waitForSelector('html[data-screen="title"] .pl-home');
  const mark = page.locator('[data-testid="version-mark"]');
  const line = (await mark.innerText()).trim();
  await mark.click();
  await expect(mark).toHaveText('Copied');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(line);
  // the click did not start a match or open anything
  await expect(page.locator('html')).toHaveAttribute('data-screen', 'title');
  await expect(mark).toHaveText(line, { timeout: 3000 });
  // into a match: the title (and the watermark with it) is gone
  await page.locator('.pl-btn.big').first().click();
  await page.waitForSelector('html[data-match="live"]', { timeout: 60_000 });
  await expect(mark).toHaveCount(0);
});
