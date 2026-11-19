import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { forfeitMatch, press } from './moments-helpers';
import { limit } from '../unit/cpu-budget';
import { SIM_VERSION } from '../../src/sim/version';

// Founder, Nov 19: "I can't see stats of last match, only watch recording, but it didn't work due to error
// 'unavailable'". A Quick Play, party or PvP match stored a display stub the viewer refused ("Replay not available");
// the last match must show in Profile → Matches with both teams' stats, a Recordings card opens the same detail, and
// an older replay says so before the tap.

test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop' && info.project.name !== 'landscape', 'desktop and landscape only'));

const fixture = (name: string) => JSON.parse(readFileSync(join(import.meta.dirname, `../../../backend/src/vendor/pawlegends-sim/v${SIM_VERSION}/${name}`), 'utf8'));

test('a Quick Play or PvP match stored Nov 18-19 (the display stub) plays from Recordings; an older one says why first', async ({ page }, info) => {
  test.setTimeout(limit(300_000));
  const touch = info.project.name === 'landscape';
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const rec = fixture('pvp-replay.fixture.json');
  const me = rec.humans.find((h: { slot: number }) => h.slot >= 3);
  // what the app stored for a main-queue match before the fix: NetHost's v1 stub around the real record
  const stub = { v: 1, simVersion: rec.simVersion, seed: rec.seed, difficulty: 'normal', hero: me.hero, trick: me.trick, ticks: rec.ticks, inputs: '', outcome: 'won', finalHash: rec.finalHash, mutator: 'none', party: { room: 'r0om12abc', slot: me.slot, record: rec, scored: true } };
  const row = { id: 'q-1', at: Date.now() - 60_000, hero: me.hero, mode: 'pvp', difficulty: 'normal', outcome: 'won', grade: 'A', k: 3, d: 1, a: 4, seconds: Math.floor(rec.ticks / 30), best: 'Shut down!', simVersion: rec.simVersion, replay: true, slot: me.slot, key: `${rec.finalHash}:${rec.ticks}` };
  const old = { ...row, id: 'old-1', at: Date.now() - 3_600_000, simVersion: SIM_VERSION - 1, key: 'x:1' };
  await page.addInitScript(
    ([r, o, s, orec]) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('tt.pawlegends.profile.v1', JSON.stringify({ v: 1, sessions: 3, matches: 5, wins: 2, firstWinDone: true, hero: 'sage', trick: 'hiss', difficulty: 'easy', veteran: true }));
      localStorage.setItem('tt.pawlegends.history.v1', JSON.stringify([r, o]));
      localStorage.setItem('tt.pawlegends.replays.v1', JSON.stringify({ [r.id]: s, [o.id]: orec }));
    },
    [row, old, stub, { ...rec, simVersion: SIM_VERSION - 1 }] as const,
  );
  await page.goto('/?e2e=1');
  await page.waitForSelector('html[data-screen="title"]');
  await press(page, touch, '[data-testid="home-profile"]');
  await press(page, touch, '[data-testid="open-history"]');
  const recs = page.locator('[data-testid="profile-recordings"]');
  await expect(recs.locator('[data-testid="profile-rec"]')).toHaveCount(2);
  await expect(recs.locator('[data-testid="profile-rec-older"]')).toHaveText('Older version');
  await expect(recs.locator('[data-testid="profile-watch"]')).toHaveCount(1);
  // the card opens the match detail; Watch inside it plays (before the fix: "Replay not available", error:party)
  await press(page, touch, '[data-testid="profile-rec"][data-id="local:q-1"] .pfx-oc');
  await expect(page.locator('[data-testid="profile-screen"] [data-testid="history-match"]')).toBeVisible();
  await press(page, touch, '[data-testid="history-watch"]');
  await page.waitForFunction(() => document.documentElement.dataset.replay === 'playing' || (document.documentElement.dataset.replay ?? '').startsWith('error'), null, { timeout: limit(60_000) });
  expect(await page.evaluate(() => document.documentElement.dataset.replay)).toBe('playing');
  await expect.poll(async () => Number(await page.evaluate(() => document.documentElement.dataset.replayTick ?? 0)), { timeout: limit(20_000) }).toBeGreaterThan(30);
  await press(page, touch, '.mm-bar [data-r="exit"]');
  await page.waitForSelector('html[data-screen="title"]', { timeout: limit(20_000) });
  expect(errors).toEqual([]);
});

test('three quick matches: three rows in Matches, each with both teams, and three playable recordings', async ({ page }, info) => {
  test.setTimeout(limit(1_200_000));
  const touch = info.project.name === 'landscape';
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  for (let i = 0; i < 3; i++) await forfeitMatch(page, touch);
  await press(page, touch, '.pl-results [data-a="home"]');
  await page.waitForSelector('html[data-screen="title"]', { timeout: limit(20_000) });
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('tt.pawlegends.history.v1') ?? '[]') as { id: string; board?: { players: unknown[] }; save?: { st: string; why?: string } }[]);
  expect(stored).toHaveLength(3);
  // every row keeps both teams' scoreboard; with no host nothing is posted (the row says so)
  for (const r of stored) {
    expect(r.board?.players.length).toBe(6);
    expect(r.save).toEqual({ st: 'off', why: 'device' });
  }
  await press(page, touch, '[data-testid="home-profile"]');
  await press(page, touch, '[data-testid="open-history"]');
  const rows = page.locator('[data-testid="profile-match-list"] [data-a="match"]');
  await expect(rows).toHaveCount(3);
  await expect(page.locator('[data-testid="profile-recordings"] [data-testid="profile-watch"]')).toHaveCount(3);
  for (let i = 0; i < 3; i++) {
    if (i > 0) {
      await press(page, touch, '[data-testid="home-profile"]');
      await press(page, touch, '[data-testid="open-history"]');
    }
    await press(page, touch, `[data-testid="profile-match-list"] [data-a="match"][data-id="local:${stored[i].id}"]`);
    // the newest match's full detail: both teams (6 rows), Watch inside it
    await expect(page.locator('[data-testid="history-match"] tr[data-slot]')).toHaveCount(6);
    await press(page, touch, '[data-testid="history-watch"]');
    await page.waitForFunction(() => document.documentElement.dataset.replay === 'playing', null, { timeout: limit(60_000) });
    await press(page, touch, '.mm-bar [data-r="exit"]');
    await page.waitForSelector('html[data-screen="title"]', { timeout: limit(20_000) });
  }
  expect(errors).toEqual([]);
});
