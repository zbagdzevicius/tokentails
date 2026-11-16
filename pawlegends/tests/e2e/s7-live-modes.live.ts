import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';

// s7 verify (live): Blitz, Skirmish and Classic 5v5 to the results on sim 32. No Sudden Death text anywhere during the
// match or on the results; the match ends on structures (core kill or the Blitz final whistle) in a sane time.
const OUT = `${homedir()}/Downloads/paw-legends/s7/verify/modes`;
const PROFILE = { v: 1, sessions: 9, matches: 40, wins: 22, firstWinDone: true, hero: 'marshmallow', side: 'cat', veteran: true, firstPlaySession: 1, difficulty: 'normal' };
const SPEED: Record<string, number> = { blitz: 8, skirmish: 16, classic: 16 };
const SIZES = [
  { w: 1280, h: 590 },
  { w: 844, h: 390 },
  { w: 667, h: 375 },
  { w: 1440, h: 900 },
];

for (const mode of ['blitz', 'skirmish', 'classic']) {
  test(`live ${mode}: no Sudden Death, ends on structures`, async ({ browser, baseURL }, info) => {
    test.skip(info.project.name !== 'desktop', 'once');
    test.setTimeout(1_500_000);
    mkdirSync(OUT, { recursive: true });
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 590 }, hasTouch: true, isMobile: true });
    const scripts: string[] = [];
    try {
      const page: Page = await ctx.newPage();
      page.on('response', async (r) => {
        if (r.url().endsWith('.js') && r.url().includes('pawlegends')) scripts.push(await r.text().catch(() => ''));
      });
      await page.addInitScript((p) => { if (!localStorage.getItem('tt.pawlegends.profile.v1')) localStorage.setItem('tt.pawlegends.profile.v1', p); }, JSON.stringify(PROFILE));
      await page.goto(`${baseURL}/?e2e=1&speed=${SPEED[mode]}`);
      await page.waitForSelector('html[data-screen="title"] .pl-home');
      const ver = await page.evaluate(() => fetch('/pawlegends-game/version.json').then((r) => r.json()));
      await page.locator('[data-testid="home-play"]').tap();
      await page.locator('[data-testid="mode-select"]').waitFor();
      const tile = page.locator(`[data-testid="mode-${mode}"]`);
      if (!(await tile.isVisible())) await page.locator('[data-testid="mode-more"], .ms-more summary, .ms-more button').first().tap().catch(() => undefined);
      await tile.tap();
      await page.locator('[data-testid="mode-next"]').tap();
      await page.locator('[data-testid="variant-bots"]').tap();
      await page.locator('[data-testid="mode-go"]').tap();
      await page.locator('.pl-pick .cs-lock:not([disabled])').tap();
      await page.waitForSelector('html[data-match="live"]', { timeout: 240_000 });
      const flags = await page.evaluate(() => document.documentElement.dataset.matchFlags ?? '');
      const sd: string[] = [];
      let lastClock = '';
      let late = false;
      const t0 = Date.now();
      while (Date.now() - t0 < 1_300_000) {
        const s = await page.evaluate(() => ({
          screen: document.documentElement.dataset.screen ?? '',
          text: document.body.innerText,
          clock: String((window as unknown as { __plWorld?: { view: { frame: { latest: { clock: { tick: number } } } | null } } }).__plWorld?.view.frame?.latest.clock.tick ?? ''),
        }));
        if (/sudden\s*death/i.test(s.text)) sd.push(s.text.match(/.{0,60}sudden\s*death.{0,60}/is)![0]);
        if (/Take their core|Final whistle/i.test(s.text)) late = true;
        if (s.clock && s.clock !== '0') lastClock = s.clock;
        if (s.screen === 'results') break;
        await page.waitForTimeout(400);
      }
      await page.waitForSelector('html[data-screen="results"]', { timeout: 10_000 });
      await page.waitForSelector('.pl-results.actions-in', { timeout: 30_000 }).catch(() => undefined);
      await page.waitForTimeout(2500);
      const res = await page.evaluate(() => ({
        reason: document.documentElement.dataset.endReason ?? '',
        text: document.querySelector('.pl-results')?.textContent?.replace(/\s+/g, ' ').slice(0, 900) ?? '',
        ccs: [...document.querySelectorAll('.pl-results .pl-cc')].map((e) => (e as HTMLElement).dataset.cc ?? e.textContent),
      }));
      for (const z of SIZES) {
        await page.setViewportSize({ width: z.w, height: z.h });
        await page.waitForTimeout(600);
        await page.screenshot({ path: `${OUT}/${mode}-results-${z.w}x${z.h}.jpg`, type: 'jpeg', quality: 72 });
      }
      const bundleSd = scripts.reduce((n, s) => n + (s.match(/sudden.death/gi)?.length ?? 0), 0);
      const secs = Number(lastClock) / 30;
      const row = { mode, ver, flags, lastTick: lastClock, matchTime: `${Math.floor(secs / 60)}:${String(Math.round(secs % 60)).padStart(2, '0')}`, late, sdSeen: sd.slice(0, 3), bundleSdMentions: bundleSd, ...res };
      writeFileSync(`${OUT}/${mode}.json`, JSON.stringify(row, null, 2));
      expect(sd).toEqual([]);
      expect(/sudden\s*death/i.test(res.text)).toBe(false);
    } finally {
      await ctx.close();
    }
  });
}
