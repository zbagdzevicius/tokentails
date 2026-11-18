import { expect, test, type Page } from '@playwright/test';
import { closeAll, notes, partyMatch, player, showHero, tap, tickOf, type Player } from './party.helpers';

test.afterEach(closeAll);

/*
 * The founder's 2026-11-14 report: two friends in one 3v3 party saw different enemies and towers, and "Play again"
 * kept the old champion. Two browser contexts (desktop and landscape touch) in one party play the same match: their
 * hash trails (every 30 ticks) and their world probes (enemy units, tower and core HP, takedowns every 150 ticks) agree
 * wherever both recorded the same tick. Then "Play again together" and a tap on another champion: the rematch plays it.
 */

const trail = (page: Page) =>
  page.evaluate(() => {
    const out: Record<string, string> = {};
    for (const e of (document.documentElement.dataset.mpTrail ?? '').split(' ').filter(Boolean)) {
      const [t, h] = e.split(':');
      out[t] = h;
    }
    return out;
  });
const probe = (page: Page) => page.evaluate(() => JSON.parse(document.documentElement.dataset.mpProbe ?? '{}') as Record<string, unknown>);

async function compare(a: Player, b: Player): Promise<{ hashes: number; probes: number }> {
  const [ta, tb, pa, pb] = await Promise.all([trail(a.page), trail(b.page), probe(a.page), probe(b.page)]);
  const ticks = Object.keys(ta).filter((t) => t in tb);
  for (const t of ticks) expect(`${t}:${ta[t]}`).toBe(`${t}:${tb[t]}`);
  const marks = Object.keys(pa).filter((t) => t in pb);
  for (const t of marks) expect({ t, ...(pa[t] as object) }).toEqual({ t, ...(pb[t] as object) });
  return { hashes: ticks.length, probes: marks.length };
}

async function surrender(p: Player): Promise<void> {
  if (p.kind === 'desktop') await p.page.keyboard.press('Escape');
  else await tap(p, p.page.locator('.pl-pause'));
  await expect(p.page.locator('.pl-menu')).toBeVisible();
  await tap(p, p.page.locator('.pl-menu [data-a="forfeit"]'));
}

test('3v3 party: both clients run one world (hashes, enemies, towers); Play again plays the newly tapped champion', async ({ browser }) => {
  test.setTimeout(600_000);
  const a = await player(browser, 'desktop');
  const b = await player(browser, 'phone');
  await partyMatch([a, b], ['sage', 'lambo']);
  // the same world on both, sampled every 10 s across the whole match
  let hashes = 0;
  let probes = 0;
  while ((await tickOf(a)) < 5450) {
    await a.page.waitForTimeout(10_000);
    const c = await compare(a, b);
    hashes += c.hashes;
    probes += c.probes;
  }
  expect(hashes).toBeGreaterThan(100);
  expect(probes).toBeGreaterThan(10);
  // no client was ever resynced or told it drifted
  for (const p of [a, b]) expect(await notes(p)).not.toMatch(/Catching up…|Connection lost · a bot plays/);
  await surrender(a);
  await surrender(b);
  for (const p of [a, b]) await p.page.waitForSelector('html[data-screen="results"]', { timeout: 60_000 });
  const room = await b.page.evaluate(() => document.documentElement.dataset.mpRoom);
  // "Play again together": the pick opens with the last heroes locked; a tap on a free champion moves the lock there
  await a.page.locator('[data-testid="party-again"]').click();
  await expect(b.page.locator('[data-testid="party-lock"]')).toBeVisible({ timeout: 15_000 });
  await expect(b.page.locator('.pp-ts').nth(1)).toHaveAttribute('data-hero', 'lambo');
  await showHero(b, 'clem');
  await tap(b, b.page.locator('[data-testid="party-hero-clem"]'));
  await expect(b.page.locator('.pp-ts').nth(1)).toHaveAttribute('data-hero', 'clem', { timeout: 5_000 });
  for (const p of [a, b]) await p.page.waitForFunction((r) => !!document.documentElement.dataset.mpRoom && document.documentElement.dataset.mpRoom !== r, room, { timeout: 120_000 });
  for (const p of [a, b]) await p.page.waitForSelector('html[data-match="live"]', { timeout: 150_000 });
  for (const p of [a, b]) expect((await p.page.evaluate(() => document.documentElement.dataset.mpPicks ?? '')).split(',').slice(0, 2)).toEqual(['sage', 'clem']);
  // the rematch reports hashes too (the last match's host never touched it) and both clients agree
  await a.page.waitForFunction(() => Number(document.documentElement.dataset.tick ?? 0) >= 900, null, { timeout: 120_000 });
  await b.page.waitForTimeout(3000);
  const c = await compare(a, b);
  expect(c.hashes).toBeGreaterThan(5);
});
