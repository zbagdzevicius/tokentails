import { expect, test } from '@playwright/test';
import { SIM_VERSION } from '../../src/sim/version';
import { EVIL, SITE, gattr, mockHost, openHost, received, recordPostTargets } from './host';

// POC.md §15 item 21, against the standalone build framed by a mock host (tests/e2e/host.ts).
test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'bridge behaviour is viewport independent'));

test('a host on the wrong origin is ignored and nothing is posted to it', async ({ context, page, baseURL }) => {
  await recordPostTargets(context);
  // the evil host posts with '*' so its hello does arrive; the game must drop it (origin not on the allowlist)
  await mockHost(context, baseURL!, { app: { isApp: false, store: true }, sendTarget: '*', gameOrigin: SITE, roster: [{ id: 'c1', name: 'X', type: 'FIRE', tier: 'RARE', isStarter: false }] }, EVIL);
  const game = await openHost(page, EVIL);
  await page.waitForTimeout(2500);
  expect(await received(page)).toEqual([]);
  expect(await gattr(game, 'embed')).toBe('1');
  expect(await gattr(game, 'store')).not.toBe('1');
  expect(await gattr(game, 'chromas')).toBe('');

});

test('roster cats become chromas, frames and Companion Kittens; the result reaches the host and /live', async ({ context, page, baseURL }) => {
  test.setTimeout(150_000);
  await recordPostTargets(context);
  const roster = [
    { id: 'cat1', name: 'Mochi', type: 'FIRE', tier: 'EPIC', isStarter: true, starterBreed: 'PINKIE', origin: 'starter' },
    { id: 'cat2', name: 'Biscuit', type: 'ICE', tier: 'LEGENDARY', isStarter: false, origin: 'adopt' },
    { id: '<bad>', name: 'x', type: 'FIRE', tier: 'RARE', isStarter: false },
  ];
  const mock = await mockHost(context, baseURL!, { app: { isApp: false, store: true }, signedIn: true, roster, query: '&speed=64' });
  const game = await openHost(page);
  await expect.poll(() => gattr(game, 'chromas')).toBe('ICE,FIRE');
  expect(await gattr(game, 'frame')).toBe('frame.legendary');
  // QA (lobby fix pass): a first visit hides the roster tier frame badge (it read as unexplained); the frame is still
  // owned and worn in the match (matchFrame below)
  await expect(game.locator('.pl-badge')).toHaveCount(0);
  const msgs = await received(page);
  expect(msgs[0]).toMatchObject({ type: 'ready' });

  // first match: one tap, wearing the Pinkie coat (the starter breed) and the first squad mate's chroma (round 1:
  // the highest tier walks first, Biscuit the LEGENDARY: ICE), with two kittens
  await game.locator('.pl-btn.big').first().click();
  await game.waitForSelector('html[data-match="live"]');
  await expect.poll(() => gattr(game, 'matchLook')).toBe('coat.breed.PINKIE|ICE');
  expect(await gattr(game, 'kittens')).toBe('2');
  expect(await gattr(game, 'matchFrame')).toBe('frame.legendary');

  await game.waitForSelector('html[data-screen="results"]', { timeout: 120_000 });
  await expect.poll(async () => (await received(page)).filter((m) => m.type === 'match-result').length).toBe(1);
  const result = (await received(page)).find((m) => m.type === "match-result") as unknown as { replay: Record<string, unknown>; summary: Record<string, unknown>; matchId: unknown };
  // match 1 is the Rookie match (fun plan F1); the integration names it with a match id the host saves under
  expect(result.replay).toMatchObject({ v: 1, difficulty: 'rookie', hero: 'clem', trick: 'pounce' });
  expect(String(result.matchId)).toMatch(/^[a-z0-9]{1,16}$/);
  expect(String(result.replay.finalHash)).toMatch(/^[0-9a-f]{8}$/);
  expect(String(result.replay.inputs)).toMatch(/^[A-Za-z0-9+/]*={0,2}$/);
  expect(typeof result.summary.won).toBe('boolean');
  await expect.poll(() => mock.lives.length).toBe(1);
  expect(mock.lives[0]).toMatchObject({ type: 'PAWLEGENDS', pawlegends: { v: 1 } });

  // every post named the exact origin, and no message carries a token or credential
  const targets = await game.evaluate(() => (window as unknown as { __targets: string[] }).__targets);
  expect(targets.length).toBeGreaterThan(0);
  expect(targets.every((t) => t === SITE)).toBe(true);
  expect(JSON.stringify(await received(page))).not.toMatch(/accesstoken|firebase|idtoken/i);
});

test('a crash inside the frame shows the overlay and reaches the host as client-error (launch finding R1)', async ({ context, page, baseURL }) => {
  await mockHost(context, baseURL!, { app: { isApp: false, store: true } });
  const game = await openHost(page);
  await expect.poll(async () => (await received(page)).some((m) => m.type === 'ready')).toBe(true);
  await game.evaluate(() => {
    setTimeout(() => {
      throw new Error('E2E boom: <b>https://x.example/?uid=7</b>');
    });
    void Promise.reject(new Error('E2E nope'));
  });
  await expect(game.locator('#crash')).toBeVisible();
  await expect.poll(async () => (await received(page)).filter((m) => m.type === 'client-error').length).toBe(2);
  const errs = (await received(page)).filter((m) => m.type === 'client-error');
  expect(errs).toContainEqual(expect.objectContaining({ source: 'window', msg: 'e2e boom b https x example uid 7 b', screen: 'title', sim: SIM_VERSION }));
  expect(errs).toContainEqual(expect.objectContaining({ source: 'rejection', msg: 'e2e nope', screen: 'title' }));
  for (const e of errs) expect(String(e.msg)).toMatch(/^[a-z0-9_ ]{1,80}$/);
});

test('game events go to the host as analytics messages, with no stats prompt in the frame (launch finding PUB-02)', async ({ context, page, baseURL }) => {
  await mockHost(context, baseURL!, { app: { isApp: false, store: true } });
  const game = await openHost(page);
  await expect.poll(async () => (await received(page)).some((m) => m.type === 'ready')).toBe(true);
  // quality_tier and title_view were tracked before the first hello: held, then sent once the host could take them
  await expect.poll(async () => (await received(page)).filter((m) => m.type === 'analytics').map((m) => m.event)).toEqual(expect.arrayContaining(['quality_tier', 'title_view']));
  const events = (await received(page)).filter((m) => m.type === 'analytics');
  for (const e of events) {
    expect(e.props).toMatchObject({ embed: true });
    expect(JSON.stringify(e.props)).not.toMatch(/https?:|@|accesstoken|firebase/i);
  }
  expect(events.some((e) => e.event === 'app_error')).toBe(false);
  await expect(game.locator('.pl-consent')).toHaveCount(0);
});

test('party play (P9): the game asks its host for a ticket and sends it in the relay hello, never a token', async ({ context, page, baseURL }) => {
  test.setTimeout(120_000);
  await recordPostTargets(context);
  const TICKET = `eyJhdWQiOiJwbC1wYXJ0eSIsInYiOjF9.${'A'.repeat(43)}`;
  const hellos: Record<string, unknown>[] = [];
  // the relay: only record the hello (no answer, the lobby stays on "Connecting…")
  await context.routeWebSocket(/\/pawlegends\/ws$/, (ws) => {
    ws.onMessage((m) => {
      try {
        const j = JSON.parse(String(m)) as Record<string, unknown>;
        if (j.t === 'hello') hellos.push(j);
      } catch {
        /* binary */
      }
    });
  });
  await mockHost(context, baseURL!, { app: { isApp: false, store: true }, signedIn: true, partyTicket: TICKET });
  const game = await openHost(page);
  await game.locator('[data-testid="play-friends"]').click();
  await expect.poll(() => hellos.length, { timeout: 30_000 }).toBeGreaterThan(0);
  expect(hellos[0].ticket).toBe(TICKET);
  const asks = (await received(page)).filter((m) => m.type === 'party-ticket-request');
  expect(asks).toHaveLength(1);
  expect(String(asks[0].id)).toMatch(/^[a-z0-9]{1,16}$/);
  // every post named the exact origin; nothing the game sent carries an access token
  const targets = await game.evaluate(() => (window as unknown as { __targets: string[] }).__targets);
  expect(targets.every((t) => t === SITE)).toBe(true);
  expect(JSON.stringify(await received(page))).not.toMatch(/accesstoken/i);
});

test('party play (P9): a host without a ticket answers null and the player joins as a guest', async ({ context, page, baseURL }) => {
  test.setTimeout(120_000);
  const hellos: Record<string, unknown>[] = [];
  await context.routeWebSocket(/\/pawlegends\/ws$/, (ws) => {
    ws.onMessage((m) => {
      try {
        const j = JSON.parse(String(m)) as Record<string, unknown>;
        if (j.t === 'hello') hellos.push(j);
      } catch {
        /* binary */
      }
    });
  });
  await mockHost(context, baseURL!, { app: { isApp: false, store: true }, partyTicket: null });
  const game = await openHost(page);
  await game.locator('[data-testid="play-friends"]').click();
  await expect.poll(() => hellos.length, { timeout: 30_000 }).toBeGreaterThan(0);
  expect(hellos[0].ticket).toBeUndefined();
  expect(typeof hellos[0].guestKey).toBe('string');
});

test('UX pass 2: the lobby "Games" button posts exit to the host (the host draws no close button)', async ({ context, page, baseURL }) => {
  await mockHost(context, baseURL!, { app: { isApp: false, store: true } });
  const game = await openHost(page);
  await game.waitForSelector('html[data-screen="title"]');
  const exit = game.getByTestId('lobby-exit');
  await expect(exit).toBeVisible();
  // it sits in the lobby's top corner group, inside the frame
  const box = await exit.boundingBox();
  expect(box!.y).toBeLessThan(40);
  await exit.click();
  await expect.poll(async () => (await received(page)).some((m) => m.type === 'exit')).toBe(true);
});
