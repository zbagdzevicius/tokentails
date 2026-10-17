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

  // first match: one tap, wearing the Pinkie coat (the starter breed) and the first chroma, with two kittens
  await game.locator('.pl-btn.big').first().click();
  await game.waitForSelector('html[data-match="live"]');
  await expect.poll(() => gattr(game, 'matchLook')).toBe('coat.breed.PINKIE|ICE');
  expect(await gattr(game, 'kittens')).toBe('2');
  expect(await gattr(game, 'matchFrame')).toBe('frame.legendary');

  await game.waitForSelector('html[data-screen="results"]', { timeout: 120_000 });
  await expect.poll(async () => (await received(page)).filter((m) => m.type === 'match-result').length).toBe(1);
  const result = (await received(page)).find((m) => m.type === "match-result") as unknown as { replay: Record<string, unknown>; summary: Record<string, unknown> };
  expect(result.replay).toMatchObject({ v: 1, difficulty: 'easy', hero: 'clem', trick: 'pounce' });
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
