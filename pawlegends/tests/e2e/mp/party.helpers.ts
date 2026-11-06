import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

/* Shared steps of the party e2e specs (playwright.mp.config.ts): players, party creation, links, visibility. */

export const RELAY = `http://127.0.0.1:${Number(process.env.PAWLEGENDS_MP_RELAY ?? 3107)}`;
export const SHOTS = process.env.SHOTS ?? '';
const VETERAN = { v: 1, sessions: 3, matches: 6, wins: 3, firstWinDone: true, hero: 'sage', trick: 'hiss', difficulty: 'easy', veteran: true };

export type Kind = 'desktop' | 'phone' | 'phone-small' | 'phone-wide';
const SIZES: Record<Kind, { width: number; height: number; touch: boolean }> = {
  desktop: { width: 1440, height: 900, touch: false },
  phone: { width: 844, height: 390, touch: true },
  'phone-small': { width: 667, height: 375, touch: true },
  'phone-wide': { width: 915, height: 412, touch: true },
};

export interface Player {
  kind: Kind;
  ctx: BrowserContext;
  page: Page;
}

const open: BrowserContext[] = [];
/** Close every context the test opened (the worker's browser outlives a test; idle pages would keep playing). */
export async function closeAll(): Promise<void> {
  await Promise.all(open.splice(0).map((c) => c.close().catch(() => undefined)));
}

/** A player in its own context (its own localStorage: guest key and resume token). */
export async function player(browser: Browser, kind: Kind, opts: { profile?: Record<string, unknown> | null; noShare?: boolean } = {}): Promise<Player> {
  const s = SIZES[kind];
  const ctx = await browser.newContext({ viewport: { width: s.width, height: s.height }, hasTouch: s.touch, isMobile: s.touch, deviceScaleFactor: 1 });
  const profile = opts.profile === undefined ? VETERAN : opts.profile;
  if (profile) await ctx.addInitScript((p) => localStorage.setItem('tt.pawlegends.profile.v1', JSON.stringify(p)), profile);
  if (opts.noShare) await ctx.addInitScript(() => void delete (Navigator.prototype as { share?: unknown }).share);
  // remember whether "Joining …" ever showed (it is brief on a fast relay)
  await ctx.addInitScript(() => {
    new MutationObserver(() => {
      if (/Joining [A-Z0-9]{3} [A-Z0-9]{3}/.test(document.body?.textContent ?? '')) (window as { __sawJoining?: boolean }).__sawJoining = true;
    }).observe(document, { subtree: true, childList: true, characterData: true });
  });
  open.push(ctx);
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (process.env.MP_CONSOLE) console.log(`[${kind}] ${m.type()} ${m.text().slice(0, 200)}`);
  });
  page.on('pageerror', (e) => console.log(`[${kind}] pageerror ${e.message}`));
  return { kind, ctx, page };
}

export async function title(p: Player, query = ''): Promise<void> {
  await p.page.goto(`/?e2e=1${query}`, { waitUntil: 'commit' });
  await p.page.waitForSelector('html[data-screen="title"]', { timeout: 120_000 });
}

/** The leader taps "Play with friends": the party exists at once. Returns its code. */
export async function createParty(p: Player): Promise<string> {
  await title(p);
  await tap(p, p.page.locator('[data-testid="play-friends"]'));
  const code = p.page.locator('[data-testid="party-code"]');
  await expect(code).toBeVisible({ timeout: 30_000 });
  return ((await code.textContent()) ?? '').replace(/\s/g, '');
}

export async function joinByLink(p: Player, code: string): Promise<void> {
  await p.page.goto(`/?e2e=1&party=${code}`, { waitUntil: 'commit' });
  await expect(p.page.locator('[data-testid="party-code"]')).toBeVisible({ timeout: 120_000 });
}

export async function tap(p: Player, l: ReturnType<Page['locator']>): Promise<void> {
  if (SIZES[p.kind].touch) await l.tap();
  else await l.click();
}

/** Emulate a hidden or visible tab (the lobby's away/back). */
export async function setHidden(p: Player, hidden: boolean): Promise<void> {
  await p.page.evaluate((h) => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
}

/** The lines the screen's top band showed (lobby notes) and the match rail said. */
export async function notes(p: Player): Promise<string> {
  return p.page.evaluate(() => [...document.querySelectorAll('.pp-note-item')].map((e) => e.textContent).join(' | ') + ' || ' + (document.querySelector('[data-said]') as HTMLElement | null)?.dataset.said);
}

export async function relayHealth(): Promise<{ rooms_live: number; sockets: number }> {
  const r = await fetch(`${RELAY}/health`);
  return (await r.json()) as { rooms_live: number; sockets: number };
}

export async function shot(p: Player, stage: string, label: string): Promise<void> {
  if (!SHOTS) return;
  mkdirSync(`${SHOTS}/${stage}`, { recursive: true });
  const s = SIZES[p.kind];
  await p.page.screenshot({ path: `${SHOTS}/${stage}/${label}-${s.width}x${s.height}.png`, timeout: 60_000 });
}
