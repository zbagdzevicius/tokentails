import { expect, test } from '@playwright/test';
import { closeAll, createParty, joinByLink, notes, player, relayHealth, shot, tap, title } from './party.helpers';

test.afterEach(closeAll);

/* Party play P5 + D10 (MULTIPLAYER.md §5.3, §12 P5): links, code entry, share fallback, ended parties, solo party. */

test('a link opens "Joining…" then the lobby; the address bar drops ?party=', async ({ browser }) => {
  const a = await player(browser, 'desktop');
  const b = await player(browser, 'phone');
  const code = await createParty(a);
  await joinByLink(b, code);
  expect(await b.page.evaluate(() => (window as { __sawJoining?: boolean }).__sawJoining)).toBe(true);
  expect(new URL(b.page.url()).searchParams.get('party')).toBeNull();
  await expect(a.page.locator('[data-testid="party-seat"]')).toHaveCount(2);
  await expect(a.page.locator('.pp-notes')).toContainText('joined');
  await shot(a, 'lane-P', '10-lobby-two');
  await shot(b, 'lane-P', '10-lobby-two');
});

test('Share falls back to Copy when navigator.share is missing ("Link copied", the embed URL)', async ({ browser }) => {
  const a = await player(browser, 'desktop', { noShare: true });
  await a.ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(a.page.url() === 'about:blank' ? 'http://127.0.0.1:5402' : a.page.url()).origin });
  const code = await createParty(a);
  await a.page.locator('[data-testid="party-share"]').click();
  await expect(a.page.locator('.pp-notes')).toContainText('Link copied');
  expect(await a.page.evaluate(() => navigator.clipboard.readText())).toBe(`https://tokentails.com/pawlegends?party=${code}`);
});

test('an ended party: "This party has ended" with Play now (a solo match) and Start your own party', async ({ browser }) => {
  const b = await player(browser, 'phone');
  await b.page.goto('/?e2e=1&party=ZZZZZZ', { waitUntil: 'commit' });
  const ended = b.page.locator('[data-testid="party-ended"]');
  await expect(ended).toContainText('This party has ended', { timeout: 120_000 });
  await expect(b.page.locator('[data-testid="party-own"]')).toBeVisible();
  await shot(b, 'lane-P', '11-ended');
  await tap(b, b.page.locator('[data-testid="party-play-now"]'));
  await b.page.waitForSelector('html[data-match="live"]', { timeout: 120_000 });
});

test('Join with code: six boxes, paste, join', async ({ browser }) => {
  const a = await player(browser, 'desktop');
  const b = await player(browser, 'phone-small');
  const code = await createParty(a);
  await title(b);
  await tap(b, b.page.locator('[data-testid="join-code"]'));
  await expect(b.page.locator('.pp-box')).toHaveCount(6, { timeout: 30_000 });
  await shot(b, 'lane-P', '12-join-code');
  await b.page.locator('.pp-box').first().focus();
  await b.page.keyboard.type(code.toLowerCase());
  await expect(b.page.locator('[data-testid="party-code"]')).toHaveText(`${code.slice(0, 3)} ${code.slice(3)}`, { timeout: 30_000 });
  await expect(a.page.locator('[data-testid="party-seat"]')).toHaveCount(2);
});

test('a party of one presses Play: a normal local match, no room on the relay (D10)', async ({ browser }) => {
  const a = await player(browser, 'desktop');
  await createParty(a);
  await expect(a.page.locator('[data-testid="party-start"]')).toHaveText('Play');
  await a.page.locator('[data-testid="party-start"]').click();
  await a.page.waitForSelector('html[data-match="live"]', { timeout: 120_000 });
  expect((await relayHealth()).rooms_live).toBe(0);
  expect(await notes(a)).not.toContain('dropped');
});
