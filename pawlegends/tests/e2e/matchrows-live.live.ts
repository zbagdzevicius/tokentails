import { expect, test, type BrowserContext, type Frame } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

/*
 * Live verify (Nov 19, Profile → Matches rows): a guest plays one quick Blitz vs bots on pawlegends.app, then opens
 * pawlegends.app/play → Profile → Matches at 1440x900, 844x390 (touch) and 390x844 (touch): the row's stats, the queue
 * name, no clipped or small text, the Recordings card's best moment in full, a row opens its match.
 * Out: LIVE_SHOTS (default ./live-shots).
 */
const OUT = process.env.LIVE_SHOTS ?? 'live-shots';
const SITE = process.env.LIVE_SITE ?? 'https://pawlegends.app';
const PROFILE = { v: 1, sessions: 9, matches: 40, wins: 22, firstWinDone: true, hero: 'sage', side: 'cat', veteran: true, firstPlaySession: 1, difficulty: 'easy' };
const SIZES: [string, number, number, boolean][] = [
  ['1440x900', 1440, 900, false],
  ['844x390', 844, 390, true],
  ['390x844', 390, 844, true],
];

async function audit(game: Frame): Promise<string[]> {
  return game.evaluate(() => {
    const out: string[] = [];
    const se = document.scrollingElement!;
    if (se.scrollWidth > innerWidth + 1) out.push(`page scrolls sideways: ${se.scrollWidth} > ${innerWidth}`);
    const pane = document.querySelector<HTMLElement>('.pfx-pane');
    if (pane && pane.scrollWidth > pane.clientWidth + 1) out.push(`pane scrolls sideways: ${pane.scrollWidth} > ${pane.clientWidth}`);
    for (const row of document.querySelectorAll<HTMLElement>('[data-testid="profile-match-list"] .pfx-mrowi, .pfx-rec')) {
      const rb = row.getBoundingClientRect();
      if (rb.left < -1 || rb.right > innerWidth + 1) out.push(`row off screen ${rb.left}..${rb.right}`);
      for (const el of row.querySelectorAll<HTMLElement>('*')) {
        const b = el.getBoundingClientRect();
        if (!b.width || !b.height || getComputedStyle(el).display === 'none') continue;
        if (b.left < rb.left - 1 || b.right > rb.right + 1 || b.top < rb.top - 1 || b.bottom > rb.bottom + 1) out.push(`${el.className || el.tagName} sticks out of its row`);
        if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim())) continue;
        const fs = parseFloat(getComputedStyle(el).fontSize);
        if (fs < 13.9) out.push(`small text ${el.className || el.tagName} ${fs}px "${el.textContent!.trim().slice(0, 20)}"`);
        if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== 'visible') out.push(`clipped ${el.className || el.tagName} "${el.textContent!.trim().slice(0, 24)}"`);
      }
    }
    return out;
  });
}

async function gameFrame(ctx: BrowserContext): Promise<{ frame: Frame; shot: (p: string) => Promise<unknown> }> {
  const page = await ctx.newPage();
  await page.goto(`${SITE}/play`);
  let frame: Frame | undefined;
  for (let i = 0; i < 300 && !frame; i++) {
    frame = page.frames().find((f) => f.url().includes('/pawlegends-game/'));
    if (!frame) await page.waitForTimeout(100);
  }
  if (!frame) throw new Error('game frame missing on /play');
  await frame.waitForSelector('html[data-ready="1"]', { timeout: 120_000 });
  return { frame, shot: (p) => page.screenshot({ path: p }) };
}

test('live: guest match → Profile → Matches rows', async ({ browser }, info) => {
  test.skip(info.project.name !== 'desktop', 'once');
  test.setTimeout(1_800_000);
  mkdirSync(OUT, { recursive: true });
  const notes: Record<string, unknown> = {};
  const play = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
  let state: Awaited<ReturnType<BrowserContext['storageState']>>;
  try {
    await play.addInitScript((p) => {
      if (!localStorage.getItem('tt.pawlegends.profile.v1')) localStorage.setItem('tt.pawlegends.profile.v1', p);
    }, JSON.stringify(PROFILE));
    const page = await play.newPage();
    await page.goto(`${SITE}/pawlegends-game/?e2e=1&speed=16`);
    await page.waitForSelector('html[data-screen="title"] .pl-home', { timeout: 120_000 });
    const playBtn = page.locator('[data-testid="home-play"]');
    notes.queue = await playBtn.getAttribute('data-queue', { timeout: 60_000 });
    await playBtn.tap({ timeout: 60_000 });
    await page.screenshot({ path: `${OUT}/after-play-844x390.png` });
    // the PvP queue: accept the found match (co-op vs bots after 45 s without an opponent), then LOCK IN
    const lock = page.locator('[data-testid="party-lock"]:not([disabled]), .pl-pick .cs-lock:not([disabled])').first();
    for (let i = 0; i < 400 && !(await lock.isVisible()); i++) {
      const accept = page.locator('[data-testid="mm-accept"]');
      if (await accept.isVisible()) {
        notes.accepted = true;
        await accept.tap().catch(() => undefined);
      }
      if (i % 40 === 0) await page.screenshot({ path: `${OUT}/queue-${i}-844x390.png` });
      await page.waitForTimeout(750);
    }
    await lock.tap({ timeout: 30_000 });
    await page.waitForSelector('html[data-match="live"]', { timeout: 240_000 });
    await page.screenshot({ path: `${OUT}/match-844x390.png` });
    await page.waitForSelector('html[data-screen="results"]', { timeout: 1_200_000 });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${OUT}/results-844x390.png` });
    notes.results = (await page.locator('.pl-results').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 600);
    notes.history = await page.evaluate(() => JSON.parse(localStorage.getItem('tt.pawlegends.history.v1') ?? '[]')[0] ?? null);
    state = await play.storageState();
    writeFileSync(`${OUT}/notes.json`, JSON.stringify(notes, null, 2));
  } finally {
    await play.close();
  }
  for (const [vp, w, h, touch] of SIZES) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch, storageState: state });
    try {
      const { frame, shot } = await gameFrame(ctx);
      await frame.locator('[data-testid="home-profile"]').first().click({ timeout: 60_000 });
      const screen = frame.locator('[data-testid="profile-screen"]');
      await screen.locator('[data-testid="profile-tab-matches"]').click();
      const list = screen.locator('[data-testid="profile-match-list"] [data-a="match"]');
      await expect(list.first()).toBeVisible();
      await frame.waitForTimeout(800);
      notes[`row-${vp}`] = (await list.first().getAttribute('aria-label')) ?? '';
      notes[`rowText-${vp}`] = (await list.first().innerText()).replace(/\s+/g, ' ');
      notes[`stats-${vp}`] = await list.first().locator('.pfx-s').evaluateAll((els) => els.map((e) => `${(e as HTMLElement).dataset.s}:${e.textContent!.trim()}`));
      notes[`audit-${vp}`] = await audit(frame);
      writeFileSync(`${OUT}/notes.json`, JSON.stringify(notes, null, 2));
      await shot(`${OUT}/matches-${vp}.png`);
      const rec = screen.locator('.pfx-recbest').first();
      if (await rec.count() && (await rec.innerText()).trim()) {
        notes[`rec-${vp}`] = await rec.innerText();
        await rec.scrollIntoViewIfNeeded();
        await frame.waitForTimeout(300);
        await shot(`${OUT}/matches-${vp}-recordings.png`);
      }
      await list.first().scrollIntoViewIfNeeded();
      await list.first().click();
      notes[`detail-${vp}`] = await screen.locator('.pfx-mdetail .mh-back').isVisible({ timeout: 10_000 }).catch(() => false);
      await frame.waitForTimeout(500);
      await shot(`${OUT}/matches-${vp}-detail.png`);
    } finally {
      await ctx.close();
    }
  }
  writeFileSync(`${OUT}/notes.json`, JSON.stringify(notes, null, 2));
});
