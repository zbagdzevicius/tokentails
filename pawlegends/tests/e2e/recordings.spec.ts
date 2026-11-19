import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { forfeitMatch, press } from './moments-helpers';
import { limit } from '../unit/cpu-budget';
import { SIM_VERSION } from '../../src/sim/version';

// Founder, Nov 18: "in recordings I can see only past match recording. and also I can't save it". Three solo matches
// in a row: Match history lists three rows, newest first, and each one's replay plays; a clip of one saves on the web
// (a download, "Saved to your Downloads."), in an app with the native save ("Saved to your gallery") and says why
// not in an old app (never a false "Saved"). A PvP match's replay is listed and plays from the player's own seat.

/** Record a 10 s clip from the replay on screen; resolves with the clip sheet open. */
async function recordClip(page: Page, touch: boolean): Promise<void> {
  await press(page, touch, '[data-testid="replay-clip"]');
  await press(page, touch, '[data-testid="clip-wide"]');
  await press(page, touch, '.mm-clippanel [data-len="10"]');
  await press(page, touch, '[data-testid="clip-record"]');
  await expect(page.locator('[data-testid="clip-sheet"]')).toBeVisible({ timeout: limit(60_000) });
}

test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop' && info.project.name !== 'landscape', 'desktop and landscape only'));

test('recordings: three matches give three replays, newest first, each one plays', async ({ page }, info) => {
  test.setTimeout(limit(1_200_000));
  const touch = info.project.name === 'landscape';
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  for (let i = 0; i < 3; i++) await forfeitMatch(page, touch);
  await press(page, touch, '.pl-results [data-a="home"]');
  await page.waitForSelector('html[data-screen="title"]', { timeout: limit(20_000) });
  const stored = await page.evaluate(() => ({
    rows: JSON.parse(localStorage.getItem('tt.pawlegends.history.v1') ?? '[]').map((r: { id: string; replay: boolean; at: number }) => ({ id: r.id, replay: r.replay, at: r.at })),
    replays: Object.keys(JSON.parse(localStorage.getItem('tt.pawlegends.replays.v1') ?? '{}')),
  }));
  console.log('stored', JSON.stringify(stored));
  expect(stored.rows).toHaveLength(3);
  expect(stored.replays).toHaveLength(3);

  // Profile → Matches → Recordings: this device's replays, newest first, each with Watch
  await press(page, touch, '[data-testid="home-profile"]');
  await press(page, touch, '[data-testid="open-history"]');
  const recs = page.locator('[data-testid="profile-recordings"]');
  await expect(recs).toBeVisible();
  await expect(recs.locator('[data-testid="profile-watch"]')).toHaveCount(3);
  const ids = await recs.locator('[data-testid="profile-watch"]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.id));
  expect(ids).toEqual([...stored.rows].sort((a: { at: number }, b: { at: number }) => b.at - a.at).map((r: { id: string }) => r.id));

  // each replay plays (the oldest one too)
  for (let i = 0; i < 3; i++) {
    if (i > 0) {
      await press(page, touch, '[data-testid="home-profile"]');
      await press(page, touch, '[data-testid="open-history"]');
    }
    await press(page, touch, `[data-testid="profile-watch"][data-id="${ids[i]}"]`);
    await page.waitForFunction(() => document.documentElement.dataset.replay === 'playing', null, { timeout: limit(60_000) });
    await expect.poll(async () => Number(await page.evaluate(() => document.documentElement.dataset.replayTick ?? 0)), { timeout: limit(20_000) }).toBeGreaterThan(30);
    if (i === 2) await saveChecks(page, touch);
    await press(page, touch, '.mm-bar [data-r="exit"]');
    await page.waitForSelector('html[data-screen="title"]', { timeout: limit(20_000) });
  }
  expect(errors).toEqual([]);
});

/** Save on the web, in an app with the native save, and in an old app without it. */
async function saveChecks(page: Page, touch: boolean): Promise<void> {
  await recordClip(page, touch);
  const sheet = page.locator('[data-testid="clip-sheet"]');
  const note = sheet.locator('.mm-share-note');
  // web: a download, and the sheet says where it went
  const dl = page.waitForEvent('download');
  await press(page, touch, '[data-testid="clip-save"]');
  expect((await dl).suggestedFilename()).toMatch(/^paw-legends-clip-\d{8}\.(mp4|webm)$/);
  await expect(note).toHaveText('Saved to your Downloads.');
  // the app with the native save (Android MediaStore / iOS Photos): the file reaches the shell
  await page.evaluate(() => {
    const w = window as unknown as Record<string, unknown>;
    w.__PL_PLATFORM__ = 'android';
    w.Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => 'android',
      PluginHeaders: [{ name: 'PawlegendsShell', methods: [{ name: 'saveFile' }] }],
      nativePromise: (plugin: string, method: string, o: { name: string; mime: string; data: string }) => {
        w.__saved = { plugin, method, name: o.name, mime: o.mime, bytes: o.data.length };
        return Promise.resolve({ folder: 'Movies/Paw Legends' });
      },
    };
  });
  await press(page, touch, '[data-testid="clip-save"]');
  await expect(note).toHaveText('Saved to your gallery (Movies › Paw Legends).');
  const saved = (await page.evaluate(() => (window as unknown as { __saved: { plugin: string; method: string; name: string; mime: string; bytes: number } }).__saved))!;
  expect(saved).toMatchObject({ plugin: 'PawlegendsShell', method: 'saveFile' });
  expect(saved.name).toMatch(/^paw-legends-clip-\d{8}\.(mp4|webm)$/);
  expect(saved.mime).toMatch(/^video\//);
  expect(saved.bytes).toBeGreaterThan(10_000);
  // an old app binary: no native save and no share sheet (an Android WebView): a reason, never "Saved"
  await page.evaluate(() => {
    const w = window as unknown as { Capacitor: { PluginHeaders: unknown[] } };
    w.Capacitor.PluginHeaders = [];
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
  });
  await press(page, touch, '[data-testid="clip-save"]');
  await expect(note).toHaveText("This app version can't save the video. Update the app, or save it on pawlegends.app.");
  await page.evaluate(() => {
    const w = window as unknown as Record<string, unknown>;
    delete w.Capacitor;
    delete w.__PL_PLATFORM__;
  });
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
}

test('recordings: a PvP match is listed and its replay plays from the player seat', async ({ page }, info) => {
  test.setTimeout(limit(300_000));
  const touch = info.project.name === 'landscape';
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const rec = JSON.parse(readFileSync(join(import.meta.dirname, `../../../backend/src/vendor/pawlegends-sim/v${SIM_VERSION}/pvp-replay.fixture.json`), 'utf8'));
  const me = rec.humans.find((h: { slot: number }) => h.slot >= 3);
  const row = { id: 'pvp-1', at: Date.now() - 60_000, hero: me.hero, mode: 'pvp', difficulty: rec.difficulty, outcome: 'won', grade: 'A', k: 3, d: 1, a: 4, seconds: Math.floor(rec.ticks / 30), simVersion: SIM_VERSION, replay: true, slot: me.slot, key: `${rec.finalHash}:${rec.ticks}` };
  const old = { ...row, id: 'old-1', at: Date.now() - 3_600_000, mode: 'skirmish', simVersion: SIM_VERSION - 1, slot: undefined, key: 'x:1' };
  await page.addInitScript(
    ([r, o, record]) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('tt.pawlegends.profile.v1', JSON.stringify({ v: 1, sessions: 3, matches: 5, wins: 2, firstWinDone: true, hero: 'sage', trick: 'hiss', difficulty: 'easy', veteran: true }));
      localStorage.setItem('tt.pawlegends.history.v1', JSON.stringify([r, o]));
      localStorage.setItem('tt.pawlegends.replays.v1', JSON.stringify({ [r.id]: record, [o.id]: { ...record, simVersion: o.simVersion } }));
    },
    [row, old, rec] as const,
  );
  await page.goto('/?e2e=1');
  await page.waitForSelector('html[data-screen="title"]');
  await press(page, touch, '[data-testid="home-profile"]');
  await press(page, touch, '[data-testid="open-history"]');
  // Recordings lists only the replay this version can play
  await expect(page.locator('[data-testid="profile-recordings"] [data-testid="profile-watch"]')).toHaveCount(1);
  // the full history (a row, then Back) still lists both and says why the older one cannot play
  await press(page, touch, '[data-testid="profile-match-list"] [data-a="match"]');
  await press(page, touch, '.mh-back');
  const hist = page.locator('[data-testid="match-history"]');
  await expect(hist.locator('.mh-row')).toHaveCount(2);
  await expect(hist.locator('.mh-row').first()).toContainText('PvP');
  // the older version's row stays listed and says why it cannot play
  await expect(hist.locator('[data-testid="history-older"]')).toHaveCount(1);
  await expect(hist.locator('.mh-watch')).toHaveCount(1);
  await press(page, touch, '.mh-watch[data-watch="pvp-1"]');
  await page.waitForFunction(() => document.documentElement.dataset.replay === 'playing', null, { timeout: limit(60_000) });
  await expect.poll(async () => Number(await page.evaluate(() => document.documentElement.dataset.replayTick ?? 0)), { timeout: limit(20_000) }).toBeGreaterThan(30);
  // the scout re-ran the PvP match to its saved end hash
  await press(page, touch, '.mm-bar [data-speed="4"]');
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.replayOk ?? ''), { timeout: limit(180_000) }).toBe('true');
  await press(page, touch, '.mm-bar [data-r="exit"]');
  await page.waitForSelector('html[data-screen="title"]', { timeout: limit(20_000) });
  expect(errors).toEqual([]);
});
