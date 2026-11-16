import { expect, test, type Frame, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';

// SOCIAL-INVITES.md verify (LIVE, pawlegends.app and the production relay, no harness): two guests in the real web
// host. A opens a party through the one play path and sees "Invite friends" (a guest gets the sign-in panel: invites and
// DMs are for registered friends), B joins by typing the code, both see one lobby. The new API routes answer (not 404).
// Signed-in invites and DMs need two real friend accounts: covered by the harness e2e (social-invites.spec.ts).
const OUT = `${homedir()}/Downloads/paw-legends/social-invites/verify`;
const API = 'https://api.tokentails.com';

const gameFrame = async (page: Page): Promise<Frame> => {
  for (let i = 0; i < 240; i++) {
    const f = page.frames().find((x) => x.url().includes('/pawlegends-game/'));
    if (f) return f;
    await page.waitForTimeout(250);
  }
  throw new Error('no game frame');
};

async function home(page: Page): Promise<Frame> {
  await page.goto('https://pawlegends.app/play', { waitUntil: 'domcontentloaded' });
  const g = await gameFrame(page);
  await g.waitForSelector('html[data-ready="1"]', { timeout: 120_000 });
  // a first visit plays the guided match: skip it when it offers to, else the Home shows
  await expect(g.locator('[data-testid="home-play"]')).toBeVisible({ timeout: 120_000 });
  return g;
}

test('live: Invite friends in the lobby, join by code, the inbox and answer routes are deployed', async ({ browser }) => {
  test.setTimeout(600_000);
  mkdirSync(OUT, { recursive: true });
  const notes: Record<string, unknown> = {};
  for (const [path, method] of [
    ['/pawlegends/social/inbox', 'GET'],
    ['/pawlegends/social/invite/0123456789abcdef01234567/answer', 'POST'],
  ] as const) {
    const r = await fetch(`${API}${path}`, { method, headers: { 'content-type': 'application/json' }, body: method === 'POST' ? '{}' : undefined });
    notes[path] = r.status;
    expect(r.status, path).not.toBe(404);
  }
  const profile = { v: 1, sessions: 3, matches: 6, wins: 3, firstWinDone: true, hero: 'sage', trick: 'hiss', difficulty: 'easy', veteran: true };
  const ctx = async () => {
    const c = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await c.addInitScript((p) => {
      try {
        if (!localStorage.getItem('tt.pawlegends.profile.v1')) localStorage.setItem('tt.pawlegends.profile.v1', JSON.stringify(p));
      } catch {
        /* storage off */
      }
    }, profile);
    return c;
  };
  const ca = await ctx();
  const cb = await ctx();
  try {
    const pa = await ca.newPage();
    const pb = await cb.newPage();
    const ga = await home(pa);
    notes.version = await (await fetch('https://pawlegends.app/pawlegends-game/version.json?' + Date.now())).json();
    await ga.locator('[data-testid="home-play"]').click();
    await ga.locator('[data-testid="mode-skirmish"]').click();
    await ga.locator('[data-testid="mode-next"]').click();
    await ga.locator('[data-testid="variant-friends"]').click();
    await ga.locator('[data-testid="mode-go"]').click();
    const codeEl = ga.locator('[data-testid="party-code"]');
    await expect(codeEl).toBeVisible({ timeout: 90_000 });
    const code = ((await codeEl.textContent()) ?? '').replace(/\s/g, '');
    notes.code = code;
    await expect(ga.locator('[data-testid="party-invite-friends"]')).toBeVisible();
    await pa.screenshot({ path: `${OUT}/a-lobby-invite-friends.jpg`, type: 'jpeg', quality: 70 });
    await ga.locator('[data-testid="party-invite-friends"]').click();
    // a guest: the Friends sheet over the lobby asks to sign in (friends, invites and DMs are for accounts)
    await expect(ga.locator('.pl-social')).toBeVisible();
    notes.guestSheet = (await ga.locator('.pl-social-body').innerText()).slice(0, 120);
    await pa.screenshot({ path: `${OUT}/a-friends-over-lobby.jpg`, type: 'jpeg', quality: 70 });
    await ga.locator('.pl-social [data-a="close"]').first().click();

    const gb = await home(pb);
    await gb.locator('[data-testid="join-code"]').click();
    await expect(gb.locator('.pp-box')).toHaveCount(6, { timeout: 60_000 });
    await gb.locator('.pp-box').first().focus();
    await pb.keyboard.type(code.toLowerCase());
    await expect(gb.locator('[data-testid="party-code"]')).toHaveText(`${code.slice(0, 3)} ${code.slice(3)}`, { timeout: 90_000 });
    await expect(ga.locator('[data-testid="party-seat"]')).toHaveCount(2, { timeout: 60_000 });
    notes.seatsA = await ga.locator('[data-testid="party-seat"]').count();
    await pa.screenshot({ path: `${OUT}/a-lobby-two.jpg`, type: 'jpeg', quality: 70 });
    await pb.screenshot({ path: `${OUT}/b-lobby-two.jpg`, type: 'jpeg', quality: 70 });
    // leave so the lobby closes on the relay
    for (const g of [gb, ga]) {
      const leave = g.locator('[data-testid="party-leave"]');
      await leave.click({ timeout: 10_000 }).catch(() => undefined);
      await leave.click({ timeout: 5_000 }).catch(() => undefined);
    }
  } finally {
    writeFileSync(`${OUT}/notes.json`, JSON.stringify(notes, null, 2));
    await ca.close().catch(() => undefined);
    await cb.close().catch(() => undefined);
  }
});
