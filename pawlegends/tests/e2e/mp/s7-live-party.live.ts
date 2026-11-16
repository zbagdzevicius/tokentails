import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { chatSaid, closeAll, partyMatch, player, tap, type Player } from './party.helpers';

// s7 verify (LIVE, production relay): two guests in one party and a match. The helpers open `/?e2e=1…`; each context
// serves the live standalone game for that document (assets come from /pawlegends-game/ as on the site).
const OUT = `${homedir()}/Downloads/paw-legends/s7/verify/party`;
test.afterEach(closeAll);

async function live(p: Player): Promise<Player> {
  await p.ctx.route(/^https:\/\/pawlegends\.app\/(\?.*)?$/, async (route) => {
    const res = await route.fetch({ url: 'https://pawlegends.app/pawlegends-game/index.html' });
    await route.fulfill({ response: res });
  });
  return p;
}
const shot = (p: Page, n: string) => p.screenshot({ path: `${OUT}/${n}.jpg`, type: 'jpeg', quality: 70 });

test('live: two guests, party lobby, match, team and all chat both ways, mute, report, phone chat collapsed', async ({ browser }) => {
  mkdirSync(OUT, { recursive: true });
  const notes: Record<string, unknown> = {};
  const a = await live(await player(browser, 'desktop'));
  const b = await live(await player(browser, 'phone-small'));
  await b.page.setViewportSize({ width: 1280, height: 590 });
  const code = await partyMatch([a, b], ['sage', 'lambo']).catch(async (e) => {
    await shot(a.page, 'fail-a');
    await shot(b.page, 'fail-b');
    throw e;
  });
  notes.code = code;
  await a.page.waitForTimeout(3000);
  // phone: the chat drawer is collapsed by default
  notes.phoneDrawerHiddenAtStart = !(await b.page.locator('[data-testid="chat-drawer"]').isVisible());
  expect(notes.phoneDrawerHiddenAtStart).toBe(true);
  await shot(b.page, 'b-1280x590-hud-collapsed');
  notes.flagsA = await a.page.evaluate(() => document.documentElement.dataset.matchFlags ?? '');
  notes.flagsB = await b.page.evaluate(() => document.documentElement.dataset.matchFlags ?? '');
  // phone → team "gl hf"
  await tap(b, b.page.locator('.pl-chatbtn'));
  await tap(b, b.page.locator('[data-testid="quick-chat-type"]'));
  const drawerB = b.page.locator('[data-testid="chat-drawer"]');
  await expect(drawerB).toBeVisible();
  await shot(b.page, 'b-1280x590-drawer');
  notes.guestTypedInput = await drawerB.locator('.cd-input').count();
  await tap(b, drawerB.locator('.cd-chip[data-id="24"]'));
  await expect.poll(() => chatSaid(a), { timeout: 15_000 }).toContain('gl hf');
  // desktop → team "Thanks!", then all "gg"
  await a.page.keyboard.press('Enter');
  const drawerA = a.page.locator('[data-testid="chat-drawer"]');
  await expect(drawerA).toBeVisible();
  await drawerA.locator('[data-ch="team"]').click();
  await drawerA.locator('.cd-chip[data-id="29"]').click();
  await expect.poll(() => chatSaid(b), { timeout: 15_000 }).toContain('Thanks!');
  await a.page.keyboard.press('Shift+Enter');
  await drawerA.locator('.cd-chip[data-id="25"]').click();
  await expect.poll(() => chatSaid(b), { timeout: 15_000 }).toContain('[All]');
  await shot(a.page, 'a-1440x900-chat');
  // phone at 667x375 and 844x390
  for (const [w, h] of [[844, 390], [667, 375]] as const) {
    await b.page.setViewportSize({ width: w, height: h });
    await b.page.waitForTimeout(800);
    await shot(b.page, `b-${w}x${h}-hud`);
  }
  // mute all on the phone: the desktop's next line does not show there
  await tap(b, b.page.locator('.pl-chatbtn'));
  await tap(b, b.page.locator('[data-testid="quick-chat-type"]'));
  const mall = drawerB.locator('[data-testid="chat-mute-all"]');
  await tap(b, mall);
  await expect(mall).toHaveAttribute('aria-pressed', 'true');
  const before = await chatSaid(b);
  await a.page.keyboard.press('Enter');
  await drawerA.locator('[data-ch="team"]').click();
  await a.page.waitForTimeout(5500); // the 5-in-10 s rate window
  await drawerA.locator('.cd-chip[data-id="29"]').click();
  await expect.poll(() => chatSaid(a), { timeout: 15_000 }).toMatch(/Thanks!.*Thanks!/);
  await b.page.waitForTimeout(4000);
  notes.mutedHeld = (await chatSaid(b)) === before;
  expect(notes.mutedHeld).toBe(true);
  // report: the scoreboard flag on the other human's row only
  await a.page.keyboard.press('Escape').catch(() => undefined);
  await a.page.keyboard.down('Tab');
  const board = a.page.locator('.pl-scoreboard.on');
  await expect(board).toBeVisible();
  notes.scoreboardFlagChips = await board.locator('.pl-cc').count();
  notes.reportButtons = await board.locator('[data-report]').count();
  await shot(a.page, 'a-1440x900-scoreboard');
  if ((notes.reportButtons as number) > 0) {
    await board.locator('[data-report]').first().dispatchEvent('pointerdown');
    notes.reportChips = await a.page.locator('.pl-report-pop .pl-report-chip').count();
    await shot(a.page, 'a-1440x900-report-chips');
    await a.page.keyboard.press('Escape').catch(() => undefined);
  }
  await a.page.keyboard.up('Tab');
  notes.saidA = await chatSaid(a);
  notes.saidB = await chatSaid(b);
  writeFileSync(`${OUT}/notes.json`, JSON.stringify(notes, null, 2));
});
