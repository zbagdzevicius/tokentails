import { expect, test, type BrowserContext, type Page } from '@playwright/test';

/**
 * FULL build flows (W3-UI-SHELL, GDD 3.5, 6.3, 6.4, 6.7, 7.3, 8, 9.2, 13.5, 14) on the QA build
 * (VITE_BADCAT_QA=1, every other env flag empty). Runs drive the real sim through the QA hook.
 */

type TickInput = { dir: number; speed: number; buttons: number };
type Qa = {
  screen(): string;
  play(inputs: TickInput[]): Promise<{ ticks: number; score: number; mode: string; targets: number; stamp: string }>;
  scoring?(maxTries?: number, minTargets?: number): TickInput[] | null;
  goto?(screen: string, opts?: { dayNo?: number; glass?: boolean; mode?: string }): void;
  setDay?(n: number): void;
  router?(): { screen: string; plan: { dayNo?: number; glass?: boolean; mode: string; household?: boolean; ugc?: boolean } | null };
  events?(): { e: string; p: Record<string, unknown> }[];
  services?(): Record<string, unknown>;
};
// window.__BADCAT_QA__ is typed by src/ui/app-shell.ts (QaHook); `Qa` documents the subset used here.
export type { Qa };

const SHOTS = process.env.BADCAT_E2E_SHOTS;
async function shot(page: Page, name: string): Promise<void> {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/full-${name}.png` });
}

/** The QA screen; 'none' while the page navigates (a room link reloads the game on hashchange). */
const screen = (page: Page): Promise<string> => page.evaluate(() => window.__BADCAT_QA__?.screen() ?? 'none').catch(() => 'none');
async function waitScreen(page: Page, name: string, timeout = 20_000): Promise<void> {
  await expect.poll(() => screen(page), { timeout }).toBe(name);
}

/** Wander east, swat a lot: a run that ends at its tick limit. */
function script(n = 2400): TickInput[] {
  const out: TickInput[] = [];
  for (let t = 0; t < n; t++) {
    const phase = Math.floor(t / 45) % 6;
    out.push({ dir: t % 90 < 60 ? [3, 3, 1, 5, 7, 3][phase] : 0, speed: 2, buttons: t % 9 === 0 ? 1 : 0 });
  }
  return out;
}
const play = (page: Page, inputs: TickInput[] = script()) => page.evaluate((i) => window.__BADCAT_QA__!.play(i as never), inputs);
const scoring = (page: Page, tries = 400, minTargets = 0) =>
  page.evaluate(([t, m]) => window.__BADCAT_QA__!.scoring?.(t, m) ?? null, [tries, minTargets] as const);

/** A returning player: the first heist is done (and optionally a session already happened). */
async function returning(ctx: BrowserContext, sessions = 1): Promise<void> {
  await ctx.addInitScript((n) => {
    try {
      if (!localStorage.getItem('bcd:v1:ftueDone')) {
        localStorage.setItem('bcd:v1:ftueDone', 'true');
        const p = { cats: [{ pattern: 'tabby', ears: 'normal', tail: 'normal', body: 'normal', eyes: 0, base: 0x8c8c8c, secondary: 0x5a5a5a, tertiary: 0xdddddd, collar: 0, hat: 0, name: 'Mochi' }], active: 0, createdAt: 1, sessions: n, settings: { audio: false, reduceMotion: true, showPhotoInClips: true } };
        localStorage.setItem('bcd:v1:profile', JSON.stringify(p));
      }
    } catch {
      /* storage blocked */
    }
  }, sessions);
}

async function freshPage(browser: import('@playwright/test').Browser, opts: { sessions?: number; returning?: boolean; ua?: string } = {}): Promise<{ ctx: BrowserContext; page: Page; errors: string[] }> {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['clipboard-read', 'clipboard-write'], ...(opts.ua ? { userAgent: opts.ua } : {}) });
  if (opts.returning) await returning(ctx, opts.sessions ?? 1);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  return { ctx, page, errors };
}

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

test('link → skip → first heist → clip → share in at most 6 taps', async ({ browser }) => {
  test.setTimeout(480_000);
  const { ctx, page, errors } = await freshPage(browser);
  // headless Chromium's navigator.share never settles: take the download path (what a desktop browser does)
  await ctx.addInitScript(() => {
    try {
      Object.defineProperty(Navigator.prototype, 'share', { value: undefined, configurable: true });
      Object.defineProperty(Navigator.prototype, 'canShare', { value: undefined, configurable: true });
    } catch {
      /* ignore */
    }
  });
  let taps = 0;
  const t0 = Date.now();
  const tap = async (fn: () => Promise<void>): Promise<void> => {
    taps++;
    if (process.env.BADCAT_E2E_DEBUG) console.log(`[tap ${taps}] ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    await fn();
  };
  await page.goto('./#d=3');
  await waitScreen(page, 'catmaker');
  await tap(() => page.locator('[data-bcm="skip"]').click());
  await waitScreen(page, 'briefing');
  await expect(page.locator('.bc-briefing:not(.is-loading)')).toBeVisible({ timeout: 20_000 });
  await tap(() => page.locator('.bc-briefing').click());
  await waitScreen(page, 'run');
  const r = await play(page, (await scoring(page)) ?? script(1200));
  expect(r.mode).toBe('ftue');
  await waitScreen(page, 'result');
  await tap(() => page.locator('.bc-share-btn').click());
  await waitScreen(page, 'share');
  // the Post button reads "Post clip" while disabled too: wait for the export to settle (enabled, or unavailable)
  const settled = async (): Promise<string> => {
    const b = page.locator('.bc-post');
    const t = (await b.textContent()) ?? '';
    if (process.env.BADCAT_E2E_DEBUG) console.log('[clip]', t, await b.getAttribute('class'), await page.locator('.bc-post .bc-progress').getAttribute('style'), JSON.stringify(await page.evaluate(() => window.__BADCAT_QA__!.events!().filter((x) => x.e === 'bc_clip_export').map((x) => x.p))));
    return (await b.isEnabled()) || /newer browser/.test(t) ? t : 'rendering';
  };
  await expect.poll(settled, { timeout: 300_000, intervals: [1_000] }).toMatch(/Post clip|Clip interrupted|newer browser/);
  const ok = /Post clip/.test((await page.locator('.bc-post').textContent()) ?? '');
  if (ok) {
    const dl = page.waitForEvent('download', { timeout: 10_000 }).catch(() => null);
    await tap(() => page.locator('.bc-post').click({ force: true, noWaitAfter: true, timeout: 10_000 }));
    if (process.env.BADCAT_E2E_DEBUG) console.log('[post] clicked');
    await dl;
    await expect.poll(() => page.evaluate(() => window.__BADCAT_QA__!.events!().some((x) => x.e === 'bc_clip_saved')), { timeout: 10_000 }).toBe(true);
  }
  expect(taps).toBeLessThanOrEqual(6);
  await shot(page, 'taps-share');
  // never a paywall in the first session
  await page.getByRole('button', { name: 'Done' }).click();
  await waitScreen(page, 'home');
  await expect(page.getByText(/ranked run for .* is ready/)).toBeVisible();
  expect(await page.evaluate(() => window.__BADCAT_QA__!.events!().some((x) => x.e === 'bc_paywall_view'))).toBe(false);
  await ctx.close();
  expect(errors).toEqual([]);
});

test('ranked once per day: the second run of today is practice, also after a reload', async ({ browser }) => {
  test.setTimeout(180_000);
  const { ctx, page, errors } = await freshPage(browser, { returning: true });
  await page.goto('./');
  await waitScreen(page, 'home');
  await page.evaluate(() => window.__BADCAT_QA__!.setDay!(2));
  await page.locator('.bc-today .bc-cta').click();
  await waitScreen(page, 'briefing');
  await expect(page.locator('.bc-mode')).toHaveText('RANKED');
  expect((await play(page)).mode).toBe('ranked');
  await waitScreen(page, 'result');
  await page.locator('.bc-result').getByRole('button', { name: /play again/i }).click();
  await waitScreen(page, 'briefing');
  await expect(page.locator('.bc-mode')).toHaveText('PRACTICE');
  await page.reload();
  await waitScreen(page, 'home');
  await page.evaluate(() => window.__BADCAT_QA__!.setDay!(2));
  await expect(page.locator('.bc-today')).toContainText(/Ranked run done today/);
  await page.locator('.bc-today .bc-cta').click();
  await waitScreen(page, 'briefing');
  await expect(page.locator('.bc-mode')).toHaveText('PRACTICE');
  await ctx.close();
  expect(errors).toEqual([]);
});

test('dare link with g + g2 and a v4 replay-only ghost', async ({ browser, baseURL }) => {
  test.setTimeout(240_000);
  const sender = await freshPage(browser, { returning: true });
  await sender.page.goto('./');
  await waitScreen(sender.page, 'home');
  // build the dare in the page with the real codec: a v5 ghost from a real run and a v4 ghost (older rules)
  const link = await sender.page.evaluate(async (base) => {
    const qa = window.__BADCAT_QA__!;
    qa.setDay!(3);
    const sv = qa.services!() as unknown as {
      codec: { buildLink(s: unknown, b: string): string; buildLinkAsync?(s: unknown, b: string): Promise<string> };
      content: { dailyRoom(n: number): unknown; resolve(r: unknown, m: string, d?: number): unknown };
      sim: { runToEnd(p: unknown, c: unknown, i: unknown, o?: unknown): { score: number } };
    };
    const inputs: { dir: number; speed: number; buttons: number }[] = [];
    for (let t = 0; t < 600; t++) inputs.push({ dir: [3, 1, 5, 7][Math.floor(t / 40) % 4], speed: 2, buttons: t % 7 === 0 ? 1 : 0 });
    const cat = { pattern: 'tabby', ears: 'normal', tail: 'normal', body: 'normal', eyes: 1, base: 0xe39a4f, secondary: 0xb46a2c, tertiary: 0xf7e3c8, collar: 0, hat: 0, name: 'Mochi' };
    const old = { ...cat, name: 'Oldie', base: 0x333333 };
    const st = { dayNo: 3, ghosts: [{ inputs, cat, name: 'Mochi', simVersion: 8 }, { inputs: inputs.slice(0, 300), cat: old, name: 'Oldie', simVersion: 4 }] };
    return sv.codec.buildLink(st, base);
  }, baseURL!);
  await sender.ctx.close();
  expect(link).toMatch(/g=.*g2=/);
  const u = new URL(link);
  const friend = await freshPage(browser, { returning: true });
  await friend.page.goto(`./#d=3&${u.searchParams.toString()}`);
  await waitScreen(friend.page, 'briefing');
  // v8: a ghost that trots through every look can be caught with nothing broken (then the line says so, not ": 0")
  await expect(friend.page.locator('.bc-dare-note')).toHaveText(/Beat Mochi's ghost: [1-9]|Mochi's ghost made no mess: any crash wins/);
  await shot(friend.page, 'dare-briefing');
  const r = await play(friend.page);
  expect(r.mode).toBe('practice');
  await waitScreen(friend.page, 'result');
  await expect(friend.page.locator('.bc-dare-note')).toHaveText(/You beat Mochi by|Mochi still rules|Dead heat with Mochi/);
  await expect(friend.page.locator('.bc-dare-extra')).toHaveText(/Oldie's ghost ran on older rules \(replay only\)/);
  const ev = await friend.page.evaluate(() => window.__BADCAT_QA__!.events!().filter((x) => x.e === 'bc_dare_result').length);
  expect(ev).toBe(1); // the replay-only ghost is never "beaten"
  await shot(friend.page, 'dare-result');
  await friend.ctx.close();
  expect(friend.errors).toEqual([]);
});

test('room link: play, remix in the Room Maker, clear it, publish, open the new link', async ({ browser, baseURL }) => {
  test.setTimeout(300_000);
  const { ctx, page, errors } = await freshPage(browser, { returning: true });
  await page.goto('./');
  await waitScreen(page, 'home');
  const link = await page.evaluate(async (base) => {
    type P = { x: number; z: number; target?: boolean };
    type R = { props: P[]; spawn: { x: number; z: number } } & Record<string, unknown>;
    const sv = window.__BADCAT_QA__!.services!() as unknown as {
      codec: { buildLink(s: unknown, b: string): string };
      content: { dailyRoom(n: number): R };
      loadEditor(): Promise<{ check(room: unknown, content: unknown): { ok: boolean } }>;
    };
    const ed = await sv.loadEditor();
    const daily = sv.content.dailyRoom(1);
    // A small player room from the Monday Kitchen: three props near the spawn become the targets (the authored ones
    // sit on the far counters, where a scripted run rarely wrecks 2 of 3), plus a few others, inside the maker budget.
    const near = daily.props
      .map((p, i) => ({ i, d: Math.abs(p.x - daily.spawn.x) + Math.abs(p.z - daily.spawn.z) }))
      .sort((a, b) => a.d - b.d || a.i - b.i)
      .slice(0, 10)
      .map((o) => o.i);
    const build = (t: number[]): R => {
      const props = daily.props.map((p, i) => ({ ...p, target: t.includes(i) }));
      const keep = [...props.filter((p) => p.target), ...props.filter((p) => !p.target).slice(0, 4)];
      return { ...daily, id: 'ugc-e2e', title: 'Zyg Kitchen', author: 'Zyg', props: keep, accomplice: undefined, sponsor: undefined, telegraph: undefined };
    };
    let room = build(daily.props.flatMap((p, i) => (p.target ? [i] : [])));
    search: for (let a = 0; a < near.length; a++)
      for (let b = a + 1; b < near.length; b++)
        for (let c = b + 1; c < near.length; c++) {
          const r = build([near[a]!, near[b]!, near[c]!]);
          if (ed.check(r, sv.content).ok) {
            room = r;
            break search;
          }
        }
    return sv.codec.buildLink({ ghosts: [], room }, base);
  }, baseURL!);
  const u = new URL(link);
  // same-document hash change: the game reloads itself on a room link (hashchange)
  await page.goto(`./#${u.searchParams.toString()}`);
  await waitScreen(page, 'briefing');
  await expect(page.locator('.bc-brief-card h2')).toContainText('Zyg Kitchen');
  await expect(page.locator('.bc-brief-card')).toContainText('Built by Zyg');
  expect((await play(page)).mode).toBe('practice');
  await waitScreen(page, 'result');
  await page.locator('.bc-share-btn').click().catch(() => undefined);
  await waitScreen(page, 'share');
  await page.getByRole('button', { name: /Remix this room/ }).click();
  await waitScreen(page, 'maker');
  await expect(page.locator('[data-bce="next"]')).toBeVisible({ timeout: 30_000 });
  await shot(page, 'maker-remix');
  // props → human → targets → clear it
  for (let i = 0; i < 6; i++) {
    if (await page.locator('[data-bce="play"]').count()) break;
    await page.locator('[data-bce="next"]').click();
    await page.waitForTimeout(250);
  }
  await expect(page.locator('[data-bce="play"]')).toBeVisible();
  await page.locator('[data-bce="play"]').click();
  await waitScreen(page, 'briefing');
  // "Clear it" runs the draft as a real practice run in the shell and hands the result back to the maker. A random
  // search rarely wrecks 2 of 3 targets in 75 s, so the publish half runs only when a clearing script is found.
  const clear = await scoring(page, 1500, 2);
  const res = await play(page, clear ?? script());
  await waitScreen(page, 'maker');
  await expect(page.locator('[data-bce="clear-msg"]')).toHaveText(/Cleared!|Only \d of 3|Zero wrecked/, { timeout: 20_000 });
  expect(await page.evaluate(() => window.__BADCAT_QA__!.events!().some((x) => x.e === 'bc_run_end' && x.p.playtest === true))).toBe(true);
  if (res.targets < 2) {
    test.info().annotations.push({ type: 'note', description: `clear run wrecked ${res.targets} of 3: publish not reached (covered by app-shell unit tests)` });
    await ctx.close();
    expect(errors).toEqual([]);
    return;
  }
  await page.locator('[data-bce="next"]').click();
  await page.locator('[data-bce="title"]').fill('Mia Kitchen');
  await page.locator('[data-bce="publish"]').click();
  await expect(page.locator('[data-bce="done"]')).toBeVisible({ timeout: 30_000 });
  await page.locator('[data-bce="done"]').click();
  await waitScreen(page, 'rooms');
  await expect(page.locator('.bc-screen')).toContainText('Mia Kitchen');
  // with a room card the share sheet saves the image (no native share in headless Chromium), so the link comes from
  // the clipboard when it was copied, else from the saved My rooms entry (the same buildLink the share uses)
  const copied = await page.evaluate(async (base) => {
    const t = await navigator.clipboard.readText().catch(() => '');
    if (/r=/.test(t)) return t;
    const sv = window.__BADCAT_QA__!.services!() as unknown as {
      platform: { store: unknown };
      progress: { myRooms(s: unknown): { code: string; title: string }[] };
      codec: { decodeRoom(c: string): unknown; buildLink(s: unknown, b: string): string };
    };
    const mine = sv.progress.myRooms(sv.platform.store).find((r) => r.title === 'Mia Kitchen');
    return mine ? sv.codec.buildLink({ ghosts: [], room: sv.codec.decodeRoom(mine.code), roomCode: mine.code }, base) : '';
  }, baseURL!);
  expect(copied).toMatch(/r=/);
  await shot(page, 'my-rooms');
  // the published link opens the room for a friend
  const pub = new URL(copied.match(/https?:\/\/\S+/)![0]);
  const friend = await freshPage(browser, { returning: true });
  await friend.page.goto(`./#${pub.searchParams.toString()}`);
  await waitScreen(friend.page, 'briefing');
  await expect(friend.page.locator('.bc-brief-card')).toContainText('Mia Kitchen');
  await expect(friend.page.locator('.bc-brief-card')).toContainText(/remix of Zyg/);
  await friend.ctx.close();
  await ctx.close();
  expect(errors).toEqual([]);
});

test('picker: The Glass, today and 14 past dailies', async ({ browser }) => {
  const { ctx, page, errors } = await freshPage(browser, { returning: true });
  await page.goto('./#pick=1');
  await waitScreen(page, 'picker');
  // pre-launch the picker lists the 7 Kitchen variants; from Day 15 on: The Glass, today and 14 past dailies
  await page.evaluate(() => window.__BADCAT_QA__!.setDay!(30));
  await expect(page.locator('.bc-room-card')).toHaveCount(16);
  await expect(page.locator('.bc-room-card').nth(1)).toContainText(/#30/);
  await expect(page.locator('.bc-room-card').first()).toContainText('The Glass');
  await page.locator('.bc-room-card').nth(3).click();
  await waitScreen(page, 'briefing');
  expect(await page.evaluate(() => window.__BADCAT_QA__!.events!().find((x) => x.e === 'bc_picker')?.p.choice)).toBe('past');
  await ctx.close();
  expect(errors).toEqual([]);
});

test('archive: days older than 14 are locked (no card in session 1)', async ({ browser }) => {
  const { ctx, page, errors } = await freshPage(browser, { returning: true, sessions: 0 });
  await page.goto('./');
  await waitScreen(page, 'home');
  await page.evaluate(() => {
    window.__BADCAT_QA__!.setDay!(30);
    window.__BADCAT_QA__!.goto!('archive');
  });
  await waitScreen(page, 'archive');
  await expect(page.locator('.bmt-case.is-locked').first()).toBeVisible();
  await shot(page, 'archive');
  await page.locator('.bmt-case.is-locked').first().click();
  // flags off (no Club UI, plan 7.4 / 0c): the lock says so without selling the Club
  await expect(page.locator('.bc-toast')).toContainText(/older than 14 days: it stays locked for now/);
  expect(await screen(page)).toBe('archive');
  await page.locator('.bmt-case:not(.is-locked)').nth(1).click();
  await waitScreen(page, 'briefing');
  await ctx.close();
  expect(errors).toEqual([]);
});

test('Saturday boss and Sunday Napper runs (setDay)', async ({ browser }) => {
  test.setTimeout(180_000);
  const { ctx, page, errors } = await freshPage(browser, { returning: true });
  await page.goto('./');
  await waitScreen(page, 'home');
  for (const [day, check] of [
    [6, /BOSS ROOM/],
    [7, /Napper|noise|Sneak|💤|Grandma|Laundry/i],
  ] as const) {
    await page.evaluate((d) => {
      window.__BADCAT_QA__!.setDay!(d);
      window.__BADCAT_QA__!.goto!('briefing');
    }, day);
    await waitScreen(page, 'briefing');
    await expect(page.locator('.bc-brief-card')).toContainText(check);
    await expect(page.locator('.bc-briefing:not(.is-loading)')).toBeVisible({ timeout: 20_000 });
    await shot(page, `day-${day}`);
    const r = await play(page);
    expect(r.ticks).toBeGreaterThan(0);
    await waitScreen(page, 'result');
    await shot(page, `day-${day}-result`);
    await page.locator('.bc-result').getByRole('button', { name: 'Home' }).click();
    await waitScreen(page, 'home');
  }
  await ctx.close();
  expect(errors).toEqual([]);
});

test('Felony Friday: choose who commits the crime', async ({ browser }) => {
  test.setTimeout(120_000);
  const { ctx, page, errors } = await freshPage(browser, { returning: true });
  await page.goto('./');
  await waitScreen(page, 'home');
  await page.evaluate(() => {
    window.__BADCAT_QA__!.setDay!(5);
    window.__BADCAT_QA__!.goto!('briefing');
  });
  await waitScreen(page, 'briefing');
  await expect(page.locator('.bc-chooser')).toBeVisible();
  await expect(page.locator('.bc-chooser .bc-chip.is-on')).toHaveAttribute('data-choice', 'pinkpaw');
  await expect(page.locator('.bc-chooser-line')).toContainText(/from Pink Paw commits the crime\. Mochi/);
  await shot(page, 'felony');
  await page.locator('.bc-chooser [data-choice="mine"]').click();
  await expect(page.locator('.bc-chooser-line')).toHaveText('Mochi commits the crime. Felony Friday!');
  expect(await screen(page)).toBe('briefing');
  await page.locator('.bc-chooser [data-choice="pinkpaw"]').click();
  await play(page);
  await waitScreen(page, 'result');
  const src = await page.evaluate(() => window.__BADCAT_QA__!.events!().find((x) => x.e === 'bc_run_start')?.p.cat_source);
  expect(src).toBe('pinkpaw');
  await ctx.close();
  expect(errors).toEqual([]);
});

test('clip handoff: a new browser re-adds the photo (skip) and re-renders the clip from the replay', async ({ browser }) => {
  test.setTimeout(300_000);
  const ig = await freshPage(browser, {
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.0.0',
  });
  await ig.page.goto('./');
  await waitScreen(ig.page, 'catmaker');
  await ig.page.locator('[data-bcm="skip"]').click();
  await waitScreen(ig.page, 'briefing');
  await play(ig.page, (await scoring(ig.page)) ?? script(1200));
  await waitScreen(ig.page, 'result');
  await ig.page.locator('.bc-share-btn').click();
  await waitScreen(ig.page, 'share');
  await expect(ig.page.locator('.bc-steps li')).toHaveCount(3);
  await ig.page.getByRole('button', { name: 'Copy link' }).click();
  const link = new URL(await ig.page.evaluate(() => navigator.clipboard.readText()));
  expect(link.searchParams.get('clip')).toBe('1');
  await ig.ctx.close();

  const real = await freshPage(browser);
  const day = link.pathname.match(/\/d\/(p?\d+)/)?.[1];
  await real.page.goto(`./#${day ? `d=${day}&` : ''}${link.searchParams.toString()}`);
  await waitScreen(real.page, 'catmaker');
  await expect(real.page.locator('[data-bcm="readd-skip"]')).toBeVisible();
  await real.page.locator('[data-bcm="readd-skip"]').click();
  await waitScreen(real.page, 'result');
  await expect(real.page.locator('.bc-result-score')).not.toHaveText('0', { timeout: 5_000 });
  await expect.poll(async () => (await real.page.locator('.bc-share-btn').textContent()) ?? '', { timeout: 200_000 }).toMatch(/Share clip|Clip interrupted/);
  expect(await real.page.evaluate(() => window.__BADCAT_QA__!.events!().some((x) => x.e === 'bc_inapp_handoff' && x.p.step === 'arrived'))).toBe(true);
  await real.ctx.close();
  expect(real.errors).toEqual([]);
});

/** A fake money lane installed through the QA hook (offline build: the real one never offers anything). */
async function fakeMoney(page: Page): Promise<void> {
  await page.evaluate(() => {
    const sv = window.__BADCAT_QA__!.services!() as unknown as Record<string, unknown>;
    const real = sv.money as Record<string, unknown>;
    const w = window as unknown as { __offers: string[] };
    w.__offers = [];
    sv.money = {
      ...real,
      status: async () => ({ enabled: true, checkout: true, cameos: false, gifts: false, restoreEmail: false, faceUploads: false, creatorCodes: false, brand: false, testMode: true }),
      paywall: (ctx: { trigger: string; sessionIndex: number; afterShare: boolean; shownThisSession: boolean }) => {
        w.__offers.push(`${ctx.trigger}:${ctx.sessionIndex}:${ctx.afterShare}`);
        if (ctx.sessionIndex < 2 || ctx.shownThisSession || ctx.trigger !== 'post_share' || !ctx.afterShare) return null;
        return { trigger: 'post_share', offer: 'cameo', sku: 'cameo', title: 'Clip posted.', body: 'Put Mochi in tomorrow’s room', cta: 'Cameo $4.99', abArm: 'A' };
      },
      mount: {
        ...(real.mount as Record<string, unknown>),
        offerCard: (host: HTMLElement, p: { offer: { title: string }; onDismiss(): void }) => {
          const d = document.createElement('div');
          d.className = 'e2e-offer bc-card';
          d.textContent = p.offer.title;
          const b = document.createElement('button');
          b.textContent = 'Not now';
          b.onclick = () => p.onDismiss();
          d.append(b);
          host.append(d);
          return () => d.remove();
        },
      },
    };
  });
}

async function glassShare(page: Page): Promise<void> {
  await page.locator('.bc-room-card.is-glass').click();
  await waitScreen(page, 'briefing');
  await play(page, (await scoring(page)) ?? script(1200));
  await waitScreen(page, 'result');
  await page.locator('.bc-share-btn').click();
}

test('paywall: none in session 1, one card after a share in session 2', async ({ browser }) => {
  test.setTimeout(180_000);
  const { ctx, page, errors } = await freshPage(browser, { returning: true, sessions: 0 });
  await page.goto('./');
  await waitScreen(page, 'home');
  await fakeMoney(page);
  await glassShare(page);
  await waitScreen(page, 'share');
  await page.getByRole('button', { name: 'Done' }).click();
  await waitScreen(page, 'home');
  expect(await page.locator('.e2e-offer').count()).toBe(0);
  // a reload alone is not a new session (review round 1); session 2 comes after 30+ minutes idle
  await page.reload();
  await waitScreen(page, 'home');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('bcd:v1:profile') || '{}').sessions)).toBe(1);
  // (leaving the page records the time, so the "31 minutes ago" goes in before the next load's scripts run)
  await page.addInitScript(() => {
    if (sessionStorage.getItem('e2e-idle')) return;
    sessionStorage.setItem('e2e-idle', '1');
    localStorage.setItem('bcd:v1:lastActiveAt', JSON.stringify(Date.now() - 31 * 60_000));
  });
  // session 2
  await page.reload();
  await waitScreen(page, 'home');
  await fakeMoney(page);
  await glassShare(page);
  await waitScreen(page, 'share');
  expect(await page.locator('.e2e-offer').count()).toBe(0); // never before the share sheet is done
  await page.getByRole('button', { name: 'Done' }).click();
  await waitScreen(page, 'offer');
  await expect(page.locator('.e2e-offer')).toContainText('Clip posted.');
  await shot(page, 'offer');
  await page.locator('.e2e-offer button').click();
  await waitScreen(page, 'home');
  // one per session
  await glassShare(page);
  await waitScreen(page, 'share');
  await page.getByRole('button', { name: 'Done' }).click();
  await waitScreen(page, 'home');
  const offers = await page.evaluate(() => (window as unknown as { __offers: string[] }).__offers);
  expect(offers.some((o) => o.startsWith('post_share:2:true'))).toBe(true);
  await ctx.close();
  expect(errors).toEqual([]);
});

test('save code round trip: export on one device, import on another', async ({ browser }) => {
  test.setTimeout(120_000);
  const a = await freshPage(browser, { returning: true });
  await a.page.goto('./');
  await waitScreen(a.page, 'home');
  await a.page.evaluate(() => window.__BADCAT_QA__!.setDay!(2));
  await a.page.locator('.bc-today .bc-cta').click();
  await waitScreen(a.page, 'briefing');
  await play(a.page);
  await waitScreen(a.page, 'result');
  await a.page.evaluate(() => window.__BADCAT_QA__!.goto!('settings'));
  await waitScreen(a.page, 'settings');
  await a.page.locator('.bmt-export').click();
  const code = (await a.page.locator('.bmt-save-out textarea').inputValue()).trim();
  expect(code.length).toBeGreaterThan(10);
  await a.ctx.close();

  const b = await freshPage(browser, { returning: true });
  await b.page.goto('./');
  await waitScreen(b.page, 'home');
  await b.page.evaluate(() => window.__BADCAT_QA__!.goto!('settings'));
  await waitScreen(b.page, 'settings');
  await b.page.locator('textarea[aria-label="Save code to import"]').fill(code);
  await b.page.locator('.bmt-import').click();
  await expect(b.page.locator('.bmt-import-msg')).toHaveText(/Welcome back/);
  await waitScreen(b.page, 'home', 15_000);
  await b.page.evaluate(() => window.__BADCAT_QA__!.setDay!(2));
  await expect(b.page.locator('.bc-today')).toContainText(/Ranked run done today/);
  await b.ctx.close();
  expect(a.errors.concat(b.errors)).toEqual([]);
});

test('consent banner never shows without an analytics key, in session 1 or 2', async ({ browser }) => {
  const { ctx, page, errors } = await freshPage(browser, { returning: true, sessions: 0 });
  await page.goto('./');
  await waitScreen(page, 'home');
  await expect(page.locator('.bmt-consent')).toHaveCount(0);
  await page.reload();
  await waitScreen(page, 'home');
  await page.waitForTimeout(500);
  await expect(page.locator('.bmt-consent')).toHaveCount(0);
  await ctx.close();
  expect(errors).toEqual([]);
});

test('zero network calls beyond the game’s own files with an empty env', async ({ browser, baseURL }) => {
  test.setTimeout(180_000);
  const { ctx, page, errors } = await freshPage(browser);
  const foreign: string[] = [];
  const origin = new URL(baseURL!).origin;
  ctx.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith(origin) && !u.startsWith('data:') && !u.startsWith('blob:')) foreign.push(u);
  });
  await page.goto('./');
  await waitScreen(page, 'catmaker');
  await page.locator('[data-bcm="skip"]').click();
  await waitScreen(page, 'briefing');
  await play(page, script(1200));
  await waitScreen(page, 'result');
  await page.locator('.bc-share-btn').click({ timeout: 5_000 }).catch(() => undefined);
  await page.waitForTimeout(1500);
  await page.reload();
  await waitScreen(page, 'home');
  for (const s of ['archive', 'settings', 'rapsheet', 'season', 'picker']) {
    await page.evaluate((x) => window.__BADCAT_QA__!.goto!(x), s);
    await page.waitForTimeout(200);
  }
  expect(foreign).toEqual([]);
  await ctx.close();
  expect(errors).toEqual([]);
});
