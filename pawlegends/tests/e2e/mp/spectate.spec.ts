import { expect, test } from '@playwright/test';
import { closeAll, partyMatch, player, relayHealth, shot, tap, tickOf } from './party.helpers';

test.afterEach(closeAll);

/*
 * Live spectating (docs/plans/moba/SPECTATE.md): two players in a party match, a third client watches it by its room
 * (`?watch=<room>`, what a friend's Watch opens) with the harness delay (4 s), sees both teams' heroes and the spectator
 * count, follows another hero, frees the camera, opens the scores and leaves; the players' match never notices.
 */

test('two play, a third watches the live match a short delay behind, follows heroes and leaves', async ({ browser }) => {
  test.setTimeout(600_000);
  const a = await player(browser, 'desktop');
  const b = await player(browser, 'desktop');
  await partyMatch([a, b], ['clem', 'sage']);
  const room = await a.page.evaluate(() => document.documentElement.dataset.mpRoom ?? '');
  expect(room).toMatch(/^[a-z0-9]{12}$/);
  const before = await relayHealth();

  for (const kind of ['desktop', 'phone'] as const) {
    const w = await player(browser, kind);
    await w.page.goto(`/?e2e=1&watch=${room}`, { waitUntil: 'commit' });
    await w.page.waitForSelector('html[data-spectate="live"]', { timeout: 150_000 });
    await expect(w.page.locator('[data-testid="spectate-live"]')).toContainText('4 s behind live');
    await expect(w.page.locator('html')).toHaveAttribute('data-spectate-viewers', '1');
    // both teams' heroes: 3 + 3 chips, the two humans marked
    await expect(w.page.locator('.sp-hero')).toHaveCount(6);
    await expect(w.page.locator('.sp-hero.human')).toHaveCount(2);
    // the delayed stream runs: the spectator's tick climbs and stays behind the players'
    const t0 = await tickOf(w);
    await expect.poll(() => tickOf(w), { timeout: 20_000 }).toBeGreaterThan(t0 + 30);
    const [mine, theirs] = await Promise.all([tickOf(w), tickOf(a)]);
    expect(theirs - mine).toBeGreaterThan(60);
    // no controls: the touch pad, ping and chat buttons are hidden (the bar replaces them)
    expect(await w.page.locator('.pl-touch:visible, .pl-pingbtn:visible, .pl-chatbtn:visible').count()).toBe(0);
    await shot(w, 'spectate', '10-live');
    // follow the enemy team's first hero, then a free camera, then the scores
    await tap(w, w.page.locator('.sp-hero[data-slot="3"]'));
    await expect(w.page.locator('html')).toHaveAttribute('data-spectate-follow', '3');
    await tap(w, w.page.locator('[data-testid="spectate-cam"]'));
    await expect(w.page.locator('html')).toHaveAttribute('data-spectate-follow', 'free');
    await tap(w, w.page.locator('[data-testid="spectate-scores"]'));
    await expect(w.page.locator('[data-testid="spectate-scores"]')).toHaveAttribute('aria-pressed', 'true');
    await shot(w, 'spectate', '11-free-scores');
    // leave: back Home, the relay forgets the spectator, the players play on
    await tap(w, w.page.locator('[data-testid="spectate-exit"]'));
    await w.page.waitForSelector('html[data-screen="title"]', { timeout: 30_000 });
    await expect(w.page.locator('html')).not.toHaveAttribute('data-spectate', /.*/);
  }
  // the players never noticed: still live, both seats human (no pilot bit), the room still on the relay
  const tick = await tickOf(a);
  await expect.poll(() => tickOf(a), { timeout: 10_000 }).toBeGreaterThan(tick + 30);
  expect(await a.page.evaluate(() => Number(document.documentElement.dataset.mpMask ?? 0) & 3)).toBe(0);
  expect((await relayHealth()).rooms_live).toBeGreaterThanOrEqual(before.rooms_live);
});

test('a room nobody plays any more says so', async ({ browser }) => {
  const w = await player(browser, 'phone');
  await w.page.goto('/?e2e=1&watch=zzzzzzzzzzzz', { waitUntil: 'commit' });
  await w.page.waitForSelector('html[data-spectate="error:watch_none"]', { timeout: 150_000 });
  await expect(w.page.locator('.mm-err')).toContainText('Nothing to watch');
  await shot(w, 'spectate', '20-none');
  await tap(w, w.page.locator('.mm-err [data-r="exit"]'));
  await w.page.waitForSelector('html[data-screen="title"]', { timeout: 30_000 });
});
