import { expect, test } from '@playwright/test';
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
  expect(await game.locator('.pl-badge').getAttribute('data-frame')).toBe('frame.legendary');
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
  expect(errs).toContainEqual(expect.objectContaining({ source: 'window', msg: 'e2e boom b https x example uid 7 b', screen: 'title', sim: 10 }));
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
