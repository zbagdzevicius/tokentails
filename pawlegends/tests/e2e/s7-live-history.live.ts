import { expect, test } from '@playwright/test';
import { openSettingsFromHome } from './openSettings';
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';

// s7 verify (live, signed out): a Blitz to the results with a seeded flag, then Home → Profile → Match history (the
// device rows), a match's detail if offered, Settings (flag toggle, the version line) and hiding the flag in a match.
const OUT = `${homedir()}/Downloads/paw-legends/s7/verify/history`;
const PROFILE = { v: 1, sessions: 9, matches: 40, wins: 22, firstWinDone: true, hero: 'clem', side: 'cat', veteran: true, firstPlaySession: 1, difficulty: 'easy' };

test('live: device match history, Settings flag toggle and version line, hidden flag in a match', async ({ browser, baseURL }, info) => {
  test.skip(info.project.name !== 'desktop', 'once');
  test.setTimeout(1_500_000);
  mkdirSync(OUT, { recursive: true });
  const notes: Record<string, unknown> = {};
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 590 }, hasTouch: true, isMobile: true });
  try {
    await ctx.addInitScript((p) => {
      if (!localStorage.getItem('tt.pawlegends.profile.v1')) {
        localStorage.setItem('tt.pawlegends.profile.v1', p);
        localStorage.setItem('pl.flag', JSON.stringify({ cc: 'LT', at: Date.now() }));
      }
    }, JSON.stringify(PROFILE));
    const page = await ctx.newPage();
    const blitz = async () => {
      await page.goto(`${baseURL}/?e2e=1&speed=16`);
      await page.waitForSelector('html[data-screen="title"] .pl-home');
      await page.locator('[data-testid="home-play"]').tap();
      await page.locator('[data-testid="mode-blitz"]').tap();
      await page.locator('[data-testid="mode-next"]').tap();
      await page.locator('[data-testid="variant-bots"]').tap();
      await page.locator('[data-testid="mode-go"]').tap();
      await page.locator('.pl-pick .cs-lock:not([disabled])').tap();
      await page.waitForSelector('html[data-match="live"]', { timeout: 240_000 });
      return page.evaluate(() => document.documentElement.dataset.matchFlags ?? '');
    };
    notes.flagsShown = await blitz();
    await page.waitForSelector('html[data-screen="results"]', { timeout: 900_000 });
    await page.waitForTimeout(3000);
    notes.resultsFlags = await page.evaluate(() => [...document.querySelectorAll('.pl-results .pl-cc')].map((e) => (e as HTMLElement).dataset.cc ?? 'paw'));
    await page.screenshot({ path: `${OUT}/results-flags-1280x590.jpg`, type: 'jpeg', quality: 72 });
    // Home → Profile → Match history
    await page.goto(`${baseURL}/?e2e=1`);
    await page.waitForSelector('html[data-screen="title"] .pl-home');
    await page.locator('[data-testid="home-profile"]').tap();
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/profile-1280x590.jpg`, type: 'jpeg', quality: 72 });
    await page.locator('[data-testid="open-history"]').tap();
    const hist = page.locator('[data-testid="match-history"]');
    await expect(hist).toBeVisible();
    await page.waitForTimeout(1500);
    notes.historyRows = await hist.locator('.mh-row').count();
    notes.historyText = (await hist.innerText()).replace(/\s+/g, ' ').slice(0, 500);
    for (const [w, h] of [[1280, 590], [844, 390], [667, 375], [1440, 900]] as const) {
      await page.setViewportSize({ width: w, height: h });
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${OUT}/history-${w}x${h}.jpg`, type: 'jpeg', quality: 72 });
    }
    await page.setViewportSize({ width: 1280, height: 590 });
    if ((notes.historyRows as number) > 0) {
      await hist.locator('.mh-row').first().tap();
      await page.waitForTimeout(1200);
      notes.detailOpen = await page.locator('[data-testid="history-match"]').isVisible();
      await page.screenshot({ path: `${OUT}/history-detail-1280x590.jpg`, type: 'jpeg', quality: 72 });
    }
    // Settings: the flag toggle and the version line
    await page.goto(`${baseURL}/?e2e=1`);
    await page.waitForSelector('html[data-screen="title"] .pl-home');
    await openSettingsFromHome(page, true);
    const flag = page.locator('[data-a="flag"]');
    await expect(flag).toBeVisible();
    notes.versionLine = (await page.locator('[data-testid="settings-version"]').innerText().catch(() => '')).trim();
    await flag.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${OUT}/settings-1280x590.jpg`, type: 'jpeg', quality: 72 });
    await flag.tap();
    notes.flagToggle = await flag.getAttribute('aria-pressed');
    notes.flagsHidden = await blitz();
    writeFileSync(`${OUT}/notes.json`, JSON.stringify(notes, null, 2));
    expect(String(notes.flagsShown).split(',')[0]).toBe('LT');
    expect(String(notes.flagsHidden).split(',')[0]).toBe('-');
  } finally {
    await ctx.close();
  }
});
