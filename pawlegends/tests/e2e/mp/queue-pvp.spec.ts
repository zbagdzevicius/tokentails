import { expect, test, type Page } from '@playwright/test';
import { closeAll, player, shot, tap, tickOf, type Player, playVariant } from './party.helpers';

test.afterEach(closeAll);

/*
 * Casual PvP M1b (docs/plans/moba/V16.md §4.6, §5) against the relay harness (its in-memory matchmaker, the real 30 s
 * fill). Two browsers that never met pick PvP on the title's mode chip and Play: after the 30 s fill they get the
 * Accept card, accept, pick on opposite teams (each sees only its own team), load with both teams shown, and play a
 * real match to its end: at 4:00 the desktop's team surrenders, and each side gets its own result (one Victory, one
 * Defeat). The phone is 844x390 touch; a second test checks the 667x375 phone's mode chip and Accept card (a decline
 * is a dodge, the other player goes back to the queue).
 */

async function title(p: Player): Promise<void> {
  await p.page.goto('/?e2e=1', { waitUntil: 'commit' });
  await p.page.waitForSelector('html[data-screen="title"]', { timeout: 240_000 });
  await expect(p.page.locator('.pl-home[data-variants~="pvp"]')).toBeVisible({ timeout: 30_000 });
}

async function warm(p: Player): Promise<void> {
  await p.page
    .waitForFunction(() => performance.getEntriesByType('resource').some((e) => /\/party-[\w-]+\.js$/.test(e.name)), null, { timeout: 90_000, polling: 500 })
    .catch(() => undefined);
}

/** The element is on screen, on top, and at least `min` px in both directions (a touch target): '' or why not. */
async function whyNotTappable(page: Page, sel: string, min = 44): Promise<string> {
  return page.evaluate(
    ([s, m]) => {
      const el = document.querySelector(s as string);
      if (!el) return 'missing';
      const r = el.getBoundingClientRect();
      const box = `${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)} in ${innerWidth}x${innerHeight}`;
      if (r.width < (m as number) || r.height < (m as number)) return `small ${box}`;
      if (r.right > innerWidth + 1 || r.bottom > innerHeight + 1 || r.left < -1 || r.top < -1) return `off-screen ${box}`;
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!hit && (hit === el || el.contains(hit)) ? '' : `covered by ${hit?.className ?? 'nothing'} ${box}`;
    },
    [sel, min],
  );
}
const tappable = async (page: Page, sel: string, min = 44): Promise<boolean> => {
  const why = await whyNotTappable(page, sel, min);
  if (why) console.log(`[tappable] ${sel}: ${why}`);
  return why === '';
};

const noSideScroll = (page: Page) => page.evaluate(() => (document.scrollingElement?.scrollWidth ?? 0) <= innerWidth + 1);

/** PvP through the one play path: PLAY → Skirmish → PvP → Find match. */
async function playPvp(p: Player): Promise<void> {
  await playVariant(p, 'pvp');
  await expect(p.page.locator('[data-testid="mm-queue"][data-mode="pvp"], [data-testid="mm-accept-card"]').first()).toBeVisible({ timeout: 15_000 });
}

/** Lock the nth free hero of the player's own team. */
async function lockFree(p: Player, nth: number): Promise<void> {
  const free = p.page.locator('.pp-heroes [data-p="hero"]:not([disabled])');
  if ((await p.page.locator('[data-testid="party-lock"]').count()) === 0) return;
  if ((await free.count()) <= nth) return;
  await tap(p, free.nth(nth));
  await tap(p, p.page.locator('[data-testid="party-lock"]'));
}

test('two strangers on opposite teams: PvP chip, Accept, a hidden-team pick, a real match to the end, one result each', async ({ browser }) => {
  test.setTimeout(1_200_000);
  const a = await player(browser, 'desktop');
  const b = await player(browser, 'phone');
  for (const p of [a, b]) await title(p);
  await Promise.all([warm(a), warm(b)]);
  // PLAY, a tappable target on the phone, no sideways scroll
  expect(await tappable(b.page, '[data-testid="home-play"]', 44)).toBe(true);
  expect(await noSideScroll(b.page)).toBe(true);
  await shot(b, 'm1b', '00-title-mode-chip');
  await Promise.all([playPvp(a), playPvp(b)]);
  await shot(b, 'm1b', '01-queue-pvp');
  // both pips (yours vs theirs) and the 30 s fill note
  await expect(b.page.locator('.pp-pvp-pips')).toBeVisible();
  // the 30 s fill: a 1v1 with two bots per team, behind the Accept card
  for (const p of [a, b]) await expect(p.page.locator('[data-testid="mm-accept-card"]')).toBeVisible({ timeout: 60_000 });
  for (const p of [a, b]) await expect(p.page.locator('[data-testid="mm-found"]')).toContainText('1 player + 2 bots vs 1 + 2 bots');
  expect(await tappable(b.page, '[data-testid="mm-accept"]', 56)).toBe(true);
  expect(await noSideScroll(b.page)).toBe(true);
  await shot(b, 'm1b', '02-accept-card-phone');
  await tap(a, a.page.locator('[data-testid="mm-accept"]'));
  await expect(a.page.locator('[data-testid="mm-accepted"]')).toBeVisible({ timeout: 5000 });
  await tap(b, b.page.locator('[data-testid="mm-accept"]'));
  // the pick: opposite teams, each sees its own team only
  for (const p of [a, b]) await expect(p.page.locator('[data-testid="party-lock"]')).toBeVisible({ timeout: 20_000 });
  const ta = await a.page.locator('.pp-pick').getAttribute('data-pvp');
  const tb = await b.page.locator('.pp-pick').getAttribute('data-pvp');
  expect(new Set([ta, tb])).toEqual(new Set(['0', '1']));
  for (const p of [a, b]) {
    await expect(p.page.locator('[data-testid="pvp-their-hidden"]')).toBeVisible();
    await expect(p.page.locator('.pp-strip .pp-ts:not(.bot)')).toHaveCount(1);
  }
  const sa = await a.page.locator('[data-testid="mm-side-switch"]').getAttribute('data-side');
  const sb = await b.page.locator('[data-testid="mm-side-switch"]').getAttribute('data-side');
  expect(sa).not.toBe(sb);
  await shot(b, 'm1b', '03-pick-phone');
  await lockFree(a, 0);
  await lockFree(b, 0);
  for (const p of [a, b]) await p.page.waitForSelector('html[data-match="live"]', { timeout: 150_000 });
  for (const p of [a, b]) await p.page.waitForFunction(() => !!(window as unknown as { __plMp?: unknown }).__plMp, null, { timeout: 30_000 });
  // in the match: both clients run the same turns (one room), the phone stays inside the screen
  await a.page.waitForFunction(() => Number(document.documentElement.dataset.tick ?? 0) >= 300, null, { timeout: 120_000, polling: 500 });
  expect(await noSideScroll(b.page)).toBe(true);
  await shot(b, 'm1b', '04-in-match-phone');
  // the Esc menu of a PvP match: no Vote pause, Mute opponents instead
  await a.page.keyboard.press('Escape');
  await expect(a.page.locator('.pl-menu h2')).toHaveText('Menu');
  await expect(a.page.locator('[data-testid="vote-pause"]')).toHaveCount(0);
  await expect(a.page.locator('[data-testid="mute-opponents"]')).toBeVisible();
  await a.page.keyboard.press('Escape');

  // 4:00: the desktop's team (one human: the vote passes with its one Yes) surrenders
  await a.page.waitForFunction(() => Number(document.documentElement.dataset.tick ?? 0) >= 7230, null, { timeout: 480_000, polling: 1000 });
  await a.page.keyboard.press('Escape');
  await a.page.locator('.pl-menu [data-a="forfeit"]').click();
  for (const p of [a, b]) await p.page.waitForSelector('html[data-screen="results"]', { timeout: 120_000 });
  for (const p of [a, b]) expect(await p.page.evaluate(() => document.documentElement.dataset.endReason)).toBe('forfeit');
  // each side its own result: the desktop surrendered (Defeat), the phone won (Victory)
  await expect(a.page.locator('body')).toContainText('Defeat', { timeout: 20_000 });
  await expect(b.page.locator('body')).toContainText('Victory', { timeout: 20_000 });
  expect(await tickOf(a)).toBeGreaterThanOrEqual(7200);
  expect(await noSideScroll(b.page)).toBe(true);
  await shot(b, 'm1b', '05-results-phone');
});

test('667x375 phone: the mode chip and the Accept card fit; a decline is a dodge and the other player re-queues', async ({ browser }) => {
  test.setTimeout(300_000);
  const a = await player(browser, 'phone-small');
  const b = await player(browser, 'desktop');
  for (const p of [a, b]) await title(p);
  await Promise.all([warm(a), warm(b)]);
  expect(await tappable(a.page, '[data-testid="home-play"]', 44)).toBe(true);
  expect(await noSideScroll(a.page)).toBe(true);
  await shot(a, 'm1b', '10-title-small');
  await Promise.all([playPvp(a), playPvp(b)]);
  expect(await tappable(a.page, '[data-testid="mm-cancel"]', 36)).toBe(true);
  for (const p of [a, b]) await expect(p.page.locator('[data-testid="mm-accept-card"]')).toBeVisible({ timeout: 60_000 });
  expect(await tappable(a.page, '[data-testid="mm-accept"]', 56)).toBe(true);
  expect(await tappable(a.page, '[data-testid="mm-decline"]', 36)).toBe(true);
  expect(await noSideScroll(a.page)).toBe(true);
  await shot(a, 'm1b', '11-accept-small');
  await tap(a, a.page.locator('[data-testid="mm-decline"]'));
  await expect(a.page.locator('[data-testid="mm-stopped"]')).toHaveAttribute('data-reason', 'declined', { timeout: 10_000 });
  // the other player is back at the front of the queue, told why
  await expect(b.page.locator('[data-testid="mm-requeued"]')).toBeVisible({ timeout: 10_000 });
  await tap(b, b.page.locator('[data-testid="mm-cancel"]'));
});

/*
 * Ranked (round 4, SOCIAL-RANKED.md §7.11) against the relay harness (backend/test/party-relay.harness.ts: always open,
 * guests allowed, a fixed status answer). The tile is live with the searching count, PLAY → Ranked offers PvP only,
 * Find match queues ranked with `bots: true`; the card says when labelled bots fill, the searching count and the
 * region ping. Alone, the search becomes Ranked vs AI after the fill + 30 s (the strip says so), and the match starts.
 * The backend ranked-relay.spec.ts checks six players, the bot-filled 1v1 and that a game without `bots` never fills.
 */
for (const kind of ['phone', 'desktop'] as const) {
  test(`${kind}: ranked is always open: PLAY → Ranked → PvP queues ranked; the card is honest about bots; alone it plays vs AI`, async ({ browser }) => {
    test.setTimeout(300_000);
    const p = await player(browser, kind);
    await title(p);
    await expect(p.page.locator('.hm-nav [data-a="ranked"][data-live="1"]')).toBeVisible({ timeout: 30_000 });
    await tap(p, p.page.locator('[data-testid="home-play"]'));
    const tile = p.page.locator('[data-testid="mode-ranked"]');
    await expect(tile).not.toHaveAttribute('aria-disabled', 'true');
    await expect(tile).toContainText('searching', { timeout: 15_000 });
    await shot(p, 'ranked', '00-tile');
    await tap(p, tile);
    await tap(p, p.page.locator('[data-testid="mode-next"]'));
    // PvP only
    for (const v of ['bots', 'coop', 'friends']) await expect(p.page.locator(`[data-testid="variant-${v}"]`)).toHaveCount(0);
    await tap(p, p.page.locator('[data-testid="variant-pvp"]'));
    await shot(p, 'ranked', '01-variant-pvp');
    await tap(p, p.page.locator('[data-testid="mode-go"]'));
    const q = p.page.locator('[data-testid="mm-queue"][data-ranked="1"]');
    await expect(q).toBeVisible({ timeout: 15_000 });
    await expect(q).toContainText('Finding a Ranked match');
    await expect(q.locator('[data-testid="mm-ranked-note"]')).toContainText('Players first. Bots fill empty seats in');
    await expect(q.locator('[data-testid="mm-ranked-live"]')).toContainText('1 searching');
    await expect(q.locator('[data-testid="mm-ranked-live"]')).toContainText(/Europe · \d+ ms/, { timeout: 15_000 });
    expect(await tappable(p.page, '[data-testid="mm-cancel"]', 44)).toBe(true);
    expect(await noSideScroll(p.page)).toBe(true);
    await shot(p, 'ranked', '02-queue');
    if (kind === 'phone') {
      // the phone run stops here: Cancel goes home
      await tap(p, p.page.locator('[data-testid="mm-cancel"]'));
      await p.page.waitForSelector('html[data-screen="title"] .pl-home', { timeout: 15_000 });
      return;
    }
    // alone: after the fill + 30 s (75 + 30 s in Prime Time) the search plays vs AI, and the strip says so
    const ai = p.page.locator('[data-testid="mm-found-ai"]');
    await expect(ai).toBeVisible({ timeout: 150_000 });
    await expect(ai).toContainText('against bots · quarter points');
    await shot(p, 'ranked', '03-vs-ai-found');
    await p.page.waitForSelector('html[data-screen="pick"], .pp-pick, .cs', { timeout: 30_000 });
    await shot(p, 'ranked', '04-vs-ai-pick');
  });
}
