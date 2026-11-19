import { expect, test, type Page } from '@playwright/test';
import { closeAll, player, playVariant, shot, tap, title } from './party.helpers';

test.afterEach(closeAll);

/*
 * Bots fill from 3 s and play as players (founder, 2026-11-19: "add a bot / 3s from 3s, not from 17s. also while match
 * is found, in-game shouldn't appear as BOT but as generated user name, country, champ like as usual") against the
 * relay harness (backend/test/party-relay.harness.ts: the real matchmaker). One player alone on PLAY (casual PvP): the
 * first bot pip shows at about 3 s and one more every 3 s; at 15 s the Accept card says "3 players vs 3"; the pick,
 * loading, the match (plates, scoreboard, kill feed) and the results never say "Bot"; every bot seat carries a
 * generated name; no persona row offers a profile link, a report flag or a thumbs-up.
 */

/** Every "Bot" marker the game can draw for a bot seat, watched from the first paint (a phase can be brief). */
const BOT_MARKS = ['.pp-lc.bot', '.pp-ts.bot', '.cs-seat.bot', '.sb-bot', '.pr-tag', '[data-testid="party-result-bot"]', '.mh-bot', '[data-testid="mm-found"]'];

async function watchBots(page: Page): Promise<void> {
  await page.addInitScript((marks: string[]) => {
    const w = window as unknown as { __botSeen?: string[] };
    w.__botSeen = [];
    const check = (): void => {
      for (const sel of marks) {
        for (const el of document.querySelectorAll(sel)) {
          const text = el.textContent ?? '';
          // the found line counts players; any other match of a marker is a bot label
          if (sel === '[data-testid="mm-found"]' ? /\bbots?\b/i.test(text) : true) w.__botSeen!.push(`${sel}: ${text.trim().slice(0, 60)}`);
        }
      }
      for (const el of document.querySelectorAll('.pp-pick, .pp-loading, .pl-party-results')) {
        if (/(^|[^A-Za-z])Bot([^A-Za-z]|$)/.test(el.textContent ?? '')) w.__botSeen!.push(`text: ${(el.textContent ?? '').slice(0, 80)}`);
      }
    };
    new MutationObserver(check).observe(document, { subtree: true, childList: true, characterData: true });
  }, BOT_MARKS);
}

const botSeen = (page: Page): Promise<string[]> => page.evaluate(() => (window as unknown as { __botSeen?: string[] }).__botSeen ?? []);

test('alone on PLAY: a bot seat every 3 s from 3 s, a full match at 15 s, every bot a named player, no "Bot" anywhere', async ({ browser }) => {
  test.setTimeout(900_000);
  const p = await player(browser, 'desktop');
  await watchBots(p.page);
  await title(p);
  await playVariant(p, 'pvp');
  const queue = p.page.locator('[data-testid="mm-queue"][data-mode="pvp"]');
  await expect(queue).toBeVisible({ timeout: 15_000 });
  const t0 = Date.now();
  // the pips: when each bot seat showed (seconds after the queue card)
  const seenAt: number[] = [];
  let found = false;
  while (Date.now() - t0 < 30_000) {
    found = await p.page.locator('[data-testid="mm-accept-card"]').isVisible();
    if (found) break;
    const bots = Number((await p.page.locator('.pp-pvp-pips').getAttribute('data-bots').catch(() => '0')) ?? 0);
    while (seenAt.length < bots) seenAt.push((Date.now() - t0) / 1000);
    await p.page.waitForTimeout(150);
  }
  console.log(`[queue-fill] bot pips at ${seenAt.map((s) => s.toFixed(1)).join(', ')} s; Accept at ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  expect(found).toBe(true);
  // the first bot seat at about 3 s (never the old 17 s), then about one every 3 s
  expect(seenAt.length).toBeGreaterThanOrEqual(3);
  expect(seenAt[0]).toBeGreaterThan(1.5);
  expect(seenAt[0]).toBeLessThan(6);
  for (let i = 1; i < seenAt.length; i++) {
    expect(seenAt[i] - seenAt[i - 1]).toBeGreaterThan(1.5);
    expect(seenAt[i] - seenAt[i - 1]).toBeLessThan(4.5);
  }
  // the match forms at 15 s (five bot seats): the Accept card counts players, never bots
  expect((Date.now() - t0) / 1000).toBeLessThan(22);
  await expect(p.page.locator('[data-testid="mm-found"]')).toContainText('3 players vs 3');
  await expect(p.page.locator('[data-testid="mm-found"]')).not.toContainText(/bot/i);
  await shot(p, 'queue-fill', '01-accept');
  await tap(p, p.page.locator('[data-testid="mm-accept"]'));

  // the pick: the own team's two other seats are named players (no Bot seat)
  await expect(p.page.locator('[data-testid="party-lock"]')).toBeVisible({ timeout: 20_000 });
  await expect(p.page.locator('.pp-strip .pp-ts')).toHaveCount(3);
  await expect(p.page.locator('.pp-strip .pp-ts.bot')).toHaveCount(0);
  await shot(p, 'queue-fill', '02-pick');
  const free = p.page.locator('.pp-heroes [data-p="hero"]:not([disabled])');
  await tap(p, free.first());
  await tap(p, p.page.locator('[data-testid="party-lock"]'));

  // the match: every seat has a name; the plates say who, the scoreboard has no Bot chip
  await p.page.waitForSelector('html[data-match="live"]', { timeout: 150_000 });
  const plates = (await p.page.evaluate(() => document.documentElement.dataset.plateNames ?? '')).split('|');
  console.log(`[queue-fill] plates ${plates.join(' | ')}`);
  expect(plates).toHaveLength(6);
  for (const n of plates) {
    expect(n).not.toMatch(/\bbot\b/i);
    expect(n.length).toBeGreaterThan(2);
  }
  const personas = plates.filter((n) => /^[A-Z][a-z]+ [A-Z][a-z]+$/.test(n));
  expect(personas.length).toBeGreaterThanOrEqual(5);
  // every seat shows a flag or a paw like a player (FLAGS.md), the same as the relay's
  const flags = await p.page.evaluate(() => document.documentElement.dataset.matchFlags ?? '');
  expect(flags.split(',')).toHaveLength(6);
  await p.page.waitForFunction(() => Number(document.documentElement.dataset.tick ?? 0) >= 300, null, { timeout: 120_000, polling: 500 });
  await p.page.keyboard.down('Tab');
  await p.page.waitForTimeout(300);
  await expect(p.page.locator('.sb-bot')).toHaveCount(0);
  await shot(p, 'queue-fill', '03-scoreboard');
  await p.page.keyboard.up('Tab');

  // 4:00: the lone player's team surrenders (its one Yes passes the vote); the results name every persona
  await p.page.waitForFunction(() => Number(document.documentElement.dataset.tick ?? 0) >= 7230, null, { timeout: 480_000, polling: 1000 });
  await p.page.keyboard.press('Escape');
  await p.page.locator('.pl-menu [data-a="forfeit"]').click();
  await p.page.waitForSelector('html[data-screen="results"]', { timeout: 120_000 });
  await shot(p, 'queue-fill', '04-results');
  const results = p.page.locator('[data-testid="party-results"]');
  if (await results.count()) {
    await expect(results.locator('[data-testid="party-result-bot"]')).toHaveCount(0);
    await expect(results.locator('.pr-tag')).toHaveCount(0);
  }
  // no profile link, report flag or thumbs-up for a persona (they are not people): only real players get those
  const links = await p.page.evaluate(() => [...document.querySelectorAll<HTMLElement>('[data-profile]')].map((e) => e.dataset.pname ?? ''));
  for (const n of personas) expect(links).not.toContain(n);
  await expect(p.page.locator('[data-kudos]')).toHaveCount(0);
  const resultsText = (await p.page.locator('html[data-screen="results"] body').textContent().catch(() => '')) ?? '';
  for (const n of personas.slice(0, 2)) expect(resultsText).toContain(n);
  // nothing anywhere ever said Bot
  expect(await botSeen(p.page)).toEqual([]);
});

test('alone on PLAY at 844x390 (touch): bot seats from 3 s, the match at about 15 s, named players to the live match', async ({ browser }) => {
  test.setTimeout(400_000);
  const p = await player(browser, 'phone');
  await watchBots(p.page);
  await title(p);
  await playVariant(p, 'pvp');
  await expect(p.page.locator('[data-testid="mm-queue"][data-mode="pvp"]')).toBeVisible({ timeout: 15_000 });
  const t0 = Date.now();
  let firstBotS = -1;
  let found = false;
  while (Date.now() - t0 < 30_000) {
    found = await p.page.locator('[data-testid="mm-accept-card"]').isVisible();
    if (found) break;
    const bots = Number((await p.page.locator('.pp-pvp-pips').getAttribute('data-bots').catch(() => '0')) ?? 0);
    if (bots > 0 && firstBotS < 0) firstBotS = (Date.now() - t0) / 1000;
    await p.page.waitForTimeout(150);
  }
  const acceptS = (Date.now() - t0) / 1000;
  console.log(`[queue-fill phone] first bot pip at ${firstBotS.toFixed(1)} s; Accept at ${acceptS.toFixed(1)} s`);
  expect(found).toBe(true);
  expect(firstBotS).toBeGreaterThan(1.5);
  expect(firstBotS).toBeLessThan(6);
  expect(acceptS).toBeLessThan(22);
  await expect(p.page.locator('[data-testid="mm-found"]')).toContainText('3 players vs 3');
  // the Accept button fits the landscape phone and is tappable
  const box = await p.page.locator('[data-testid="mm-accept"]').boundingBox();
  expect(box && box.y + box.height <= 390 && box.x + box.width <= 844).toBe(true);
  await shot(p, 'queue-fill', 'phone-01-accept');
  await tap(p, p.page.locator('[data-testid="mm-accept"]'));
  await expect(p.page.locator('[data-testid="party-lock"]')).toBeVisible({ timeout: 20_000 });
  await expect(p.page.locator('.pp-strip .pp-ts.bot')).toHaveCount(0);
  await shot(p, 'queue-fill', 'phone-02-pick');
  await tap(p, p.page.locator('.pp-heroes [data-p="hero"]:not([disabled])').first());
  await tap(p, p.page.locator('[data-testid="party-lock"]'));
  await p.page.waitForSelector('html[data-match="live"]', { timeout: 150_000 });
  const plates = (await p.page.evaluate(() => document.documentElement.dataset.plateNames ?? '')).split('|');
  console.log(`[queue-fill phone] plates ${plates.join(' | ')}`);
  expect(plates).toHaveLength(6);
  for (const n of plates) expect(n).not.toMatch(/\bbot\b/i);
  expect(plates.filter((n) => /^[A-Z][a-z]+ [A-Z][a-z]+$/.test(n)).length).toBeGreaterThanOrEqual(5);
  await p.page.waitForFunction(() => Number(document.documentElement.dataset.tick ?? 0) >= 150, null, { timeout: 120_000, polling: 500 });
  await shot(p, 'queue-fill', 'phone-03-live');
  expect(await botSeen(p.page)).toEqual([]);
});
