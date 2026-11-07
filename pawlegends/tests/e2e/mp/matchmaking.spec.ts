import { expect, test, type Page } from '@playwright/test';
import { closeAll, mpNames, player, shot, tap, tickOf, type Player } from './party.helpers';

test.afterEach(closeAll);

/*
 * Quick Play co-op M1a (docs/plans/moba/M1A-IMPL.md §1, §3, §9.4) against the relay harness (its in-memory
 * matchmaker, the real fill times). Browsers that never met: no party, no code, one tap each.
 *
 * 1. Solo: one tap shows the queue card with a running timer and Cancel at once; Cancel goes back to the title; a
 *    second search fills with bots (8 s in a quiet pool) and the pick shows the locked side switch and Bot seats.
 * 2. Co-op: a desktop and a phone search together and land on one team against bots (the side switch locked on the
 *    same side, each other's generated name in the match). The desktop leaves at about 0:15; a third browser that
 *    searches next is offered the seat, joins the match in progress and plays it to the end (a surrender vote at
 *    3:00 with the phone). Results: the strangers see Play again and Back; Play again searches again.
 */

// match 1 played (Play online opens from match 1), fewer than 3 matches: the bots stay Easy (surrender from 3:00)
const ONE_MATCH = { v: 1, sessions: 2, matches: 1, wins: 1, firstWinDone: true, hero: 'clem', trick: 'pounce', difficulty: 'easy' };

async function title(p: Player): Promise<void> {
  await p.page.goto('/?e2e=1', { waitUntil: 'commit' });
  // a busy machine (several WebGL pages in software) can take minutes to boot one
  await p.page.waitForSelector('html[data-screen="title"]', { timeout: 240_000 });
  await expect(p.page.locator('[data-testid="play-online"]')).toBeVisible({ timeout: 30_000 });
}

/** The party chunk is in (the title prefetches it while idle): a tap then reaches the relay at once. */
async function warm(p: Player): Promise<void> {
  await p.page
    .waitForFunction(() => performance.getEntriesByType('resource').some((e) => /\/party-[\w-]+\.js$/.test(e.name)), null, { timeout: 90_000, polling: 500 })
    .catch(() => undefined);
}

async function onTop(page: Page, sel: string): Promise<boolean> {
  return page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return false;
    const r = el.getBoundingClientRect();
    if (r.right > innerWidth + 1 || r.bottom > innerHeight + 1 || r.left < -1 || r.top < -1) return false;
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!hit && (hit === el || el.contains(hit));
  }, sel);
}

/** Lock a free hero of the assigned side (the nth free tile, so two strangers never race for one hero). */
async function lockFree(p: Player, nth: number): Promise<void> {
  const free = p.page.locator('.pp-heroes [data-p="hero"]:not([disabled])');
  // the 30 s pick auto-locks a slow player (a loaded machine): already past the pick is fine
  if ((await p.page.locator('[data-testid="party-lock"]').count()) === 0) return;
  if ((await free.count()) <= nth) return;
  await tap(p, free.nth(nth));
  await tap(p, p.page.locator('[data-testid="party-lock"]'));
  // locked in, or already past the pick (the last lock starts the loading at once)
  await expect
    .poll(async () => {
      const l = p.page.locator('[data-testid="party-lock"]');
      return (await l.count()) === 0 || (await l.textContent()) === 'Locked in';
    }, { timeout: 10_000 })
    .toBe(true);
}

test('solo: the queue card at once, Cancel back to the title, a bot fill to a locked-side pick', async ({ browser }) => {
  test.setTimeout(240_000);
  const a = await player(browser, 'phone-small', { profile: ONE_MATCH });
  await title(a);
  expect(await onTop(a.page, '[data-testid="play-online"]')).toBe(true);
  await shot(a, 'm1a', '00-title-play-online');
  await tap(a, a.page.locator('[data-testid="play-online"]'));
  await expect(a.page.locator('[data-testid="mm-cancel"]')).toBeVisible({ timeout: 1500 });
  await expect(a.page.locator('[data-testid="mm-timer"]')).toHaveText(/^0:0\d$/);
  expect(await onTop(a.page, '[data-testid="mm-cancel"]')).toBe(true);
  // the timer runs, and the relay's status arrives (estimate)
  await expect(a.page.locator('[data-testid="mm-timer"]')).not.toHaveText('0:00', { timeout: 5000 });
  await expect(a.page.locator('.pp-queue')).toContainText('usually', { timeout: 5000 });
  await shot(a, 'm1a', '01-queue-card');
  // the side chip answers the arrow keys
  await a.page.locator('[data-testid="mm-side-any"]').focus();
  await a.page.keyboard.press('ArrowLeft');
  await expect(a.page.locator('[data-testid="mm-side-dog"]')).toHaveAttribute('aria-checked', 'true');
  await tap(a, a.page.locator('[data-testid="mm-cancel"]'));
  await a.page.waitForSelector('html[data-screen="title"] .pl-lobby', { timeout: 10_000 });
  await expect(a.page.locator('[data-testid="party"]')).toHaveCount(0);

  // search again (the side is remembered: dogs); quiet pool: bots fill in about 8 s
  const t1 = Date.now();
  await tap(a, a.page.locator('[data-testid="play-online"]'));
  await expect(a.page.locator('[data-testid="mm-side-dog"]')).toHaveAttribute('aria-checked', 'true');
  await expect(a.page.locator('[data-testid="mm-found"]')).toContainText('1 player + 2 bots · Dogs', { timeout: 20_000 });
  expect(Date.now() - t1).toBeLessThan(16_000);
  await shot(a, 'm1a', '02-match-found');
  await expect(a.page.locator('[data-testid="party-lock"]')).toBeVisible({ timeout: 10_000 });
  await expect(a.page.locator('[data-testid="mm-side-switch"]')).toHaveAttribute('data-side', 'dog');
  await expect(a.page.locator('[data-testid="mm-your-team"]')).toHaveText('Your team: Dogs');
  await expect(a.page.locator('.pp-ts.bot')).toHaveCount(2);
  // a stranger never sees a party code
  await expect(a.page.locator('[data-testid="party-code"]')).toHaveCount(0);
  await shot(a, 'm1a', '03-pick-locked-side');
});

test('co-op: two strangers on one team vs bots; a leaver is backfilled by a third; the match plays to the end', async ({ browser }) => {
  test.setTimeout(1_500_000);
  const a = await player(browser, 'desktop', { profile: ONE_MATCH });
  const b = await player(browser, 'phone', { profile: ONE_MATCH });
  for (const p of [a, b]) await title(p);
  expect(await onTop(a.page, '[data-testid="play-online"]')).toBe(true);
  expect(await onTop(b.page, '[data-testid="play-online"]')).toBe(true);
  // both search within a moment of each other (a lone search fills with bots after 8 s in a quiet pool)
  await Promise.all([warm(a), warm(b)]);
  await Promise.all([tap(a, a.page.locator('[data-testid="play-online"]')), tap(b, b.page.locator('[data-testid="play-online"]'))]);
  // the card, then "Match found" (it may already have turned into the pick on a slow machine: the pick repeats it)
  for (const p of [a, b]) await expect(p.page.locator('[data-testid="mm-queue"], [data-testid="party-lock"]').first()).toBeVisible({ timeout: 30_000 });
  for (const p of [a, b]) await expect(p.page.locator('[data-testid="mm-found"], [data-testid="mm-found-line"]').first()).toContainText('2 players + 1 bot', { timeout: 30_000 });
  await shot(b, 'm1a', '10-found-phone');
  for (const p of [a, b]) await expect(p.page.locator('[data-testid="party-lock"]')).toBeVisible({ timeout: 10_000 });
  const side = await a.page.locator('[data-testid="mm-side-switch"]').getAttribute('data-side');
  expect(side === 'cat' || side === 'dog').toBe(true);
  await expect(b.page.locator('[data-testid="mm-side-switch"]')).toHaveAttribute('data-side', side!);
  for (const p of [a, b]) {
    await expect(p.page.locator('.pp-ts.bot')).toHaveCount(1);
    await expect(p.page.locator('[data-testid="party-code"]')).toHaveCount(0);
  }
  // each sees the other under the relay's generated name (never a code, never an account name)
  const strangerOfA = ((await a.page.locator('.pp-ts:not(.bot):not([data-me]) b').first().textContent()) ?? '').trim();
  expect(strangerOfA.length).toBeGreaterThan(0);
  await shot(b, 'm1a', '11-pick-phone');
  await lockFree(a, 0);
  await lockFree(b, 1);
  for (const p of [a, b]) await p.page.waitForSelector('html[data-match="live"]', { timeout: 150_000 });
  for (const p of [a, b]) await p.page.waitForFunction(() => !!(window as unknown as { __plMp?: unknown }).__plMp, null, { timeout: 30_000 });
  // one team: B flies a slot of A's team (0..2), under the name A saw in the pick
  await expect.poll(async () => (await mpNames(a)).slice(0, 3).includes(strangerOfA), { timeout: 15_000 }).toBe(true);
  await shot(b, 'm1a', '12-in-match-phone');

  // A leaves at about 0:15 (Esc menu, Leave match, confirm): back to the title, a bot flies the seat
  await a.page.waitForFunction(() => Number(document.documentElement.dataset.tick ?? 0) >= 450, null, { timeout: 120_000, polling: 500 });
  await a.page.keyboard.press('Escape');
  await a.page.locator('.pl-menu [data-a="leave"]').click();
  await expect(a.page.locator('.pl-menu')).toContainText('Another player or a bot takes your place');
  await a.page.locator('.pl-menu [data-a="leave-yes"]').click();
  await a.page.waitForSelector('html[data-screen="title"] .pl-lobby', { timeout: 20_000 });
  // B's view: A's seat is piloted now
  await b.page.waitForFunction(() => (Number(document.documentElement.dataset.mpMask ?? 0) & 7) !== 0, null, { timeout: 30_000 });
  const pilotedBefore = await b.page.evaluate(() => Number(document.documentElement.dataset.mpMask ?? 0) & 7);

  // A is done (its page closes: three WebGL pages at once are too much for a busy CI machine)
  await a.ctx.close();
  // C, who never met either, searches. The seat is backfillable until 3:00 (tick 5,400): offered after 3 s of search,
  // before any bot fill. On a machine so slow that C boots after 3:00, the bot keeps the seat and C gets its own match.
  const c = await player(browser, 'desktop', { profile: ONE_MATCH });
  await title(c);
  const tickAtSearch = await tickOf(b);
  await tap(c, c.page.locator('[data-testid="play-online"]'));
  const backfill = tickAtSearch < 5400 - 30 * 20;
  let humans = 1;
  if (backfill) {
    await expect(c.page.locator('[data-testid="mm-offer"]')).toBeVisible({ timeout: 15_000 });
    await expect(c.page.locator('[data-testid="mm-offer"]')).toContainText('Join a match in progress');
    await shot(c, 'm1a', '13-backfill-offer');
    await tap(c, c.page.locator('[data-testid="mm-offer-join"]'));
    await c.page.waitForSelector('html[data-match="live"]', { timeout: 150_000 });
    await c.page.waitForFunction(() => (document.documentElement.dataset.mpTurn ?? '') !== '', null, { timeout: 60_000 });
    // the seat turns human on C's caught-up `back`: B sees one piloted seat fewer
    await b.page.waitForFunction((before) => (Number(document.documentElement.dataset.mpMask ?? 0) & 7) < before, pilotedBefore, { timeout: 90_000 });
    // C's own clock caught up with B's (a join in progress, not a new match)
    expect(Math.abs((await tickOf(c)) - (await tickOf(b)))).toBeLessThan(300);
    expect(await tickOf(c)).toBeGreaterThan(450);
    await shot(c, 'm1a', '14-backfilled');
    humans = 2;
  } else {
    // too late for a backfill: C is matched with bots in a match of its own; A's seat stays with the bot
    await expect(c.page.locator('[data-testid="mm-found"], [data-testid="mm-found-line"]').first()).toContainText('1 player + 2 bots', { timeout: 40_000 });
    expect(await b.page.evaluate(() => Number(document.documentElement.dataset.mpMask ?? 0) & 7)).toBe(pilotedBefore);
    await c.ctx.close();
  }
  const team = backfill ? [b, c] : [b];

  // the end: a surrender vote from 3:00 (Easy): B asks, C (when there) answers
  await b.page.waitForFunction(() => Number(document.documentElement.dataset.tick ?? 0) >= 5450, null, { timeout: 420_000, polling: 1000 });
  await b.page.keyboard.press('Escape');
  await tap(b, b.page.locator('.pl-menu [data-a="forfeit"]'));
  if (backfill) {
    const yes = c.page.locator('.pl-rail-act[data-act="vote-surrender-yes"]');
    await expect(yes).toBeVisible({ timeout: 15_000 });
    await yes.click();
  }
  for (const p of team) await p.page.waitForSelector('html[data-screen="results"]', { timeout: 90_000 });
  for (const p of team) {
    await expect(p.page.locator('[data-testid="party-result-human"]')).toHaveCount(humans);
    await expect(p.page.locator('[data-testid="party-again"]')).toHaveText('Play again');
    await expect(p.page.locator('[data-testid="party-leave-results"]')).toHaveText('Back');
    await expect(p.page.locator('[data-testid="party-change"]')).toHaveCount(0);
  }
  await b.page.waitForTimeout(2600);
  await shot(b, 'm1a', '15-results-phone');
  // Play again: the stranger searches again with the same side; Back takes the other to the title
  const again = team[team.length - 1];
  await tap(again, again.page.locator('[data-testid="party-again"]'));
  await expect(again.page.locator('[data-testid="mm-cancel"]')).toBeVisible({ timeout: 15_000 });
  await tap(again, again.page.locator('[data-testid="mm-cancel"]'));
  await again.page.waitForSelector('html[data-screen="title"]', { timeout: 15_000 });
  if (backfill) {
    await tap(b, b.page.locator('[data-testid="party-leave-results"]'));
    await b.page.waitForSelector('html[data-screen="title"]', { timeout: 15_000 });
  }
});
