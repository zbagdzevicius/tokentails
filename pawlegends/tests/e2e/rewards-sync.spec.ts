import { expect, test, type Browser, type Frame, type Page } from '@playwright/test';
import { mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { luckyOddsTable } from '../../../backend/src/pawlegends/progress/lucky';
import { emptyBlob, mergeBlobs, sanitizeBlob, type ProgressBlob } from '../../../backend/src/pawlegends/progress/progress-merge';
import { mockHost, openHost } from './host';

/*
 * Gap plan P2 `rewards-cloud`: the same account in two browsers. Device A (a player with progress) syncs; device B (a
 * new device, nothing stored) opens and gets the same Treat Track, quests and settings; a Lucky Treat the `/live` save
 * paid in between opens on B with its odds viewable before it opens; Home's Today list shows the Welcome Path and the
 * odds sheet. The server is a stateful fake using the backend's own merge (progress-merge.ts).
 */

const DAY = new Date().toISOString().slice(0, 10);

function server() {
  let blob: ProgressBlob = emptyBlob();
  const grants: Record<string, unknown>[] = [];
  const calls: { who: string; applied: string[] }[] = [];
  const view = () => ({
    rev: calls.length,
    today: DAY,
    blob,
    grants,
    lucky: { ...luckyOddsTable(), n: grants.filter((g) => g.kind === 'lucky').length, day: DAY, eligible: true },
    welcome: { days: 2, today: true },
    mastery: { clem: { m: 9, w: 4 }, sage: { m: 30, w: 18 } },
  });
  return {
    calls,
    grant: (g: Record<string, unknown>) => grants.push(g),
    blob: () => blob,
    handle(who: string, op: string, args: Record<string, unknown>) {
      if (op === 'progress.sync') {
        const incoming = sanitizeBlob(JSON.parse(String(args.blob)));
        calls.push({ who, applied: incoming.applied });
        blob = mergeBlobs(blob, incoming);
        return { status: 200, body: view() };
      }
      if (op === 'progress.get') return { status: 200, body: view() };
      return { status: 200, body: {} };
    },
  };
}

const SHOTS = process.env.RW_SHOTS ? join(homedir(), 'Downloads/paw-legends/gaps/rewards-cloud') : null;
async function shot(page: Page, name: string): Promise<void> {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.waitForTimeout(700);
  await page.screenshot({ path: join(SHOTS, `after-${name}.png`), animations: 'disabled' });
}

async function device(browser: Browser, baseURL: string, who: string, srv: ReturnType<typeof server>, viewport: { width: number; height: number }, profile: Record<string, unknown> | undefined, seed: Record<string, string> = {}) {
  const context = await browser.newContext({ viewport, hasTouch: viewport.width < 1000 });
  await context.exposeFunction('plApi', async (op: string, args: Record<string, unknown>) => srv.handle(who, op, args));
  // the device's own storage before the game loads (same origin as the game frame)
  await context.addInitScript((s: Record<string, string>) => {
    if (!location.pathname.includes('/pawlegends-game/') || sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v);
  }, seed);
  await mockHost(context, baseURL, { app: { isApp: false, store: true }, signedIn: true, liveApi: true, ...(profile ? { profile } : {}) });
  const page = await context.newPage();
  const game = await openHost(page);
  return { game, page, context };
}

const treatsOf = (f: Frame) => f.evaluate(() => JSON.parse(localStorage.getItem('tt.pawlegends.treats.v1') ?? '{}') as { xp?: number; chests?: number });

test('the same account in two browsers: same Treat Track; a Lucky Treat opens with its odds; Today shows the Welcome Path', async ({ browser, baseURL }, info) => {
  test.setTimeout(180_000);
  const srv = server();
  const vp = info.project.name === 'landscape' ? { width: 844, height: 390 } : { width: 1280, height: 720 };

  // device A: a player with progress
  const a = await device(
    browser,
    baseURL!,
    'A',
    srv,
    vp,
    { v: 1, sessions: 6, matches: 14, wins: 9, firstWinDone: true, hero: 'sage', trick: 'hiss', difficulty: 'easy', veteran: true, numbers: true, unlocks: ['coat.brutus.biscuit', 'emote.wave', 'coat.clem.marmalade', 'coat.sage.midnight'] },
    {
      'tt.pawlegends.treats.v1': JSON.stringify({ v: 2, xp: 1340, chests: 4, target: null, winDay: DAY }),
      'pawlegends.leftHanded': '1',
    },
  );
  await expect.poll(() => srv.calls.filter((c) => c.who === 'A').length, { timeout: 20_000 }).toBeGreaterThan(0);
  expect(srv.blob().treats).toMatchObject({ xp: 1340, chests: 4 });
  expect(srv.blob().counts.matches).toBe(14);

  // the next /live save (on A's account) drew a Lucky Treat; B, a brand-new device, opens the game
  srv.grant({ id: `lucky:${DAY}`, kind: 'lucky', day: DAY, n: 1, rarity: 'rare', item: 'coat.pixel.arctic', at: new Date().toISOString() });
  const b = await device(browser, baseURL!, 'B', srv, vp, undefined);

  // B: the chest waits on Home; its odds open before it does
  const chest = b.game.locator('[data-testid="lucky-treat"]');
  await expect(chest).toBeVisible({ timeout: 20_000 });
  await shot(b.page, `lucky-sealed-${info.project.name}`);
  await chest.locator('[data-k="odds"]').click();
  const sheet = b.game.locator('[data-testid="lucky-odds-sheet"]');
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText('62%');
  await expect(sheet).toContainText('Rare or better');
  await shot(b.page, `lucky-odds-${info.project.name}`);
  await sheet.locator('[data-k="close"]').click();
  await expect(sheet).toHaveCount(0);
  await chest.locator('.pl-btn[data-k="open"]').click();
  await expect(chest).toContainText('Arctic Pixel coat');
  await expect(chest).toContainText('Rare');
  await shot(b.page, `lucky-open-${info.project.name}`);
  await chest.locator('[data-k="close"]').click();
  await expect(chest).toHaveCount(0);

  // the same Treat Track, counters and settings on both devices; the grant is on B now and the server knows it
  expect(await treatsOf(b.game)).toMatchObject({ xp: 1340, chests: 4 });
  expect(await treatsOf(b.game)).toEqual(await treatsOf(a.game));
  expect(await b.game.evaluate(() => (JSON.parse(localStorage.getItem('tt.pawlegends.profile.v1') ?? '{}') as { matches?: number; unlocks?: string[] }).matches)).toBe(14);
  expect(await b.game.evaluate(() => (JSON.parse(localStorage.getItem('tt.pawlegends.profile.v1') ?? '{}') as { unlocks: string[] }).unlocks)).toEqual(
    expect.arrayContaining(['emote.wave', 'coat.sage.midnight', 'coat.pixel.arctic']),
  );
  expect(await b.game.evaluate(() => localStorage.getItem('pawlegends.leftHanded'))).toBe('1');
  await expect.poll(() => srv.blob().applied, { timeout: 10_000 }).toContain(`lucky:${DAY}`);

  // B's Home: Today has the friend quest, the Welcome Path and the Lucky Treat odds row
  const today = b.game.locator('.hm-today');
  await expect(today).toBeVisible({ timeout: 20_000 });
  await today.locator('summary').click();
  await expect(b.game.locator('.hm-qlist .q.bonus')).toContainText('Play 2 matches with a friend');
  await expect(b.game.locator('[data-testid="welcome-path"]')).toBeVisible();
  await expect(b.game.locator('[data-testid="welcome-path"] .rw-days li.got')).toHaveCount(2);
  await shot(b.page, `today-${info.project.name}`);
  await b.game.locator('[data-testid="today-lucky"]').click();
  await expect(b.game.locator('[data-testid="lucky-odds-sheet"]')).toBeVisible();
  await b.page.keyboard.press('Escape');
  await expect(b.game.locator('[data-testid="lucky-odds-sheet"]')).toHaveCount(0);

  // champion mastery (verified matches, from the server) on the champion browser
  await b.game.locator('.hm-nav [data-a="heroes"]').click();
  const chip = b.game.locator('[data-testid="mastery-chip"]');
  await expect(chip).toBeVisible({ timeout: 15_000 });
  await expect(chip).toContainText('M3');
  await shot(b.page, `champ-browser-${info.project.name}`);

  // A: no chest (the Lucky Treat was B's to open), still the same Treat Track after it syncs again
  await expect(a.game.locator('[data-testid="lucky-treat"]')).toHaveCount(0);
  await a.context.close();
  await b.context.close();
});
