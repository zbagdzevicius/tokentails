import { expect, test, type Browser, type BrowserContext, type Frame, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { mockHost, openHost } from './host';

// Overlap audit (s7 ui, founder ask Nov 15: the results' reward strip drew over the scoreboard and the MVP card, and
// Home's version line and level chips sat on the nav, a champion and the name banner). On Home, Mode Select, the
// champion select, the match HUD, the results and the store, at every landscape phone size we ship to and on desktop,
// the visible controls and key panels must not overlap each other and must sit inside the viewport; a results
// scoreboard is fully shown or scrolls inside its own box. One match per device class: the viewport is resized
// through the sizes on each screen. Screenshots: ~/Downloads/paw-legends/s7/ui/.

const SHOTS = process.env.SHOTS_DIR ?? `${homedir()}/Downloads/paw-legends/s7/ui`;
type Size = { w: number; h: number };
/** Landscape phones and tablets (touch): 667x375 (iPhone SE), 844x390, the founder's 1280x590 and 2400x1080 / 1920x1080 tablets. */
const TOUCH: readonly Size[] = [
  { w: 667, h: 375 },
  { w: 844, h: 390 },
  { w: 873, h: 393 },
  { w: 1280, h: 590 },
  { w: 1920, h: 1080 },
  { w: 2400, h: 1080 },
];
const DESKTOP: readonly Size[] = [
  { w: 1280, h: 720 },
  { w: 1440, h: 900 },
  { w: 1920, h: 1080 },
];

/** A seasoned profile (Mode Select opens), with local fastest wins (Home's level chips) and a Treat Track one XP from a chest. */
const PROFILE = {
  v: 1, sessions: 6, matches: 30, wins: 18, firstWinDone: true, hero: 'marshmallow', side: 'cat', veteran: true, firstPlaySession: 1,
  difficulty: 'easy', fastest: { rookie: 400, easy: 300 },
};
const TREATS = { v: 2, xp: 299, chests: 0, target: null, winDay: null };

type Scope = Page | Frame;

/**
 * Every pair of visible controls (and `extra` key panels) under `scope` whose boxes overlap, and every key panel
 * outside the viewport. A box is clipped to its scrolling/clipping ancestors (a row scrolled out of its list is not
 * drawn); an element inside another (a badge on a button) is not an overlap.
 */
async function audit(s: Scope, scope: string, extra: readonly string[]): Promise<string[]> {
  return s.evaluate(
    ([scopeSel, extraSels]) => {
      const root = document.querySelector<HTMLElement>(scopeSel);
      if (!root) return [`no ${scopeSel}`];
      const INTERACTIVE = 'button, a[href], summary, input:not([type="hidden"]), select, textarea, [role="button"], [role="tab"], [role="radio"]';
      const keys = new Set<Element>();
      for (const sel of extraSels) for (const e of document.querySelectorAll(sel)) keys.add(e);
      const all = new Set<Element>([...root.querySelectorAll(INTERACTIVE), ...keys]);
      const name = (e: Element): string => {
        const h = e as HTMLElement;
        return (
          h.dataset?.testid ??
          (h.dataset?.a ? `[data-a=${h.dataset.a}]` : null) ??
          h.getAttribute('aria-label') ??
          (typeof h.className === 'string' && h.className ? `.${h.className.trim().split(/\s+/).slice(0, 2).join('.')}` : h.tagName.toLowerCase())
        ).slice(0, 60);
      };
      type Box = { e: Element; l: number; t: number; r: number; b: number };
      const shown = (e: Element): Box | null => {
        const rects = e.getClientRects();
        if (!rects.length) return null;
        const d = e.closest('details');
        if (d && !d.open && !e.closest('summary') && e !== d) return null;
        let r = e.getBoundingClientRect();
        let l = r.left, t = r.top, rr = r.right, b = r.bottom;
        for (let n: Element | null = e; n; n = n.parentElement) {
          const cs = getComputedStyle(n);
          if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) return null;
          if (n !== e && (cs.overflowX !== 'visible' || cs.overflowY !== 'visible')) {
            r = n.getBoundingClientRect();
            if (cs.overflowX !== 'visible') { l = Math.max(l, r.left); rr = Math.min(rr, r.right); }
            if (cs.overflowY !== 'visible') { t = Math.max(t, r.top); b = Math.min(b, r.bottom); }
          }
          if (cs.position === 'fixed') break;
        }
        l = Math.max(l, 0); t = Math.max(t, 0); rr = Math.min(rr, innerWidth); b = Math.min(b, innerHeight);
        if (rr - l < 2 || b - t < 2) return null;
        return { e, l, t, r: rr, b };
      };
      const boxes = [...all].map(shown).filter((x): x is Box => !!x);
      const out: string[] = [];
      for (const k of keys) {
        const r = k.getBoundingClientRect();
        if (!r.width || !r.height || !shown(k)) continue;
        if (r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1) out.push(`${name(k)} off screen (${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)})`);
      }
      for (let i = 0; i < boxes.length; i++)
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i], b = boxes[j];
          if (a.e.contains(b.e) || b.e.contains(a.e)) continue;
          // a badge drawn on its own card on purpose (Mode Select's "i" on a mode tile) may cover that card only
          if ((a.e.matches('[data-badge]') && a.e.parentElement?.contains(b.e)) || (b.e.matches('[data-badge]') && b.e.parentElement?.contains(a.e))) continue;
          const w = Math.min(a.r, b.r) - Math.max(a.l, b.l);
          const h = Math.min(a.b, b.b) - Math.max(a.t, b.t);
          if (w > 2 && h > 2) out.push(`${name(a.e)} × ${name(b.e)} (${Math.round(w)}x${Math.round(h)})`);
        }
      return out;
    },
    [scope, extra] as const,
  );
}

/** A results table must show every column, or scroll sideways inside its own box (never cut by the screen or a panel). */
async function tablesFit(s: Scope): Promise<string[]> {
  return s.evaluate(() => {
    const out: string[] = [];
    for (const t of document.querySelectorAll<HTMLTableElement>('.pl-results table')) {
      if (!t.getClientRects().length) continue;
      const own = t.parentElement!;
      const cs = getComputedStyle(own);
      const scrolls = cs.overflowX === 'auto' || cs.overflowX === 'scroll';
      const r = t.getBoundingClientRect();
      const o = own.getBoundingClientRect();
      if (scrolls) {
        if (o.right > innerWidth + 1) out.push(`${own.className} box past the screen`);
      } else if (r.right > o.right + 1 || r.right > innerWidth + 1) out.push(`${own.className} table cut (${Math.round(r.right)} > ${Math.round(Math.min(o.right, innerWidth))})`);
    }
    return out;
  });
}

const settle = async (s: Scope, quick = false): Promise<void> => {
  await s.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  // the live HUD always animates (timers, bars): two frames only, so the sweep ends long before the match does
  if (quick) return;
  await s
    .waitForFunction(() => document.getAnimations().every((a) => a.effect?.getTiming().iterations === Infinity || a.playState !== 'running'), null, { timeout: 4000 })
    .catch(() => undefined);
};

async function sweep(
  page: Page, s: Scope, sizes: readonly Size[], tag: string, scope: string, extra: readonly string[], more?: () => Promise<string[]>, quick = false,
): Promise<string[]> {
  mkdirSync(SHOTS, { recursive: true });
  const bad: string[] = [];
  for (const z of sizes) {
    await page.setViewportSize({ width: z.w, height: z.h });
    await page.waitForTimeout(quick ? 150 : 350);
    await settle(s, quick);
    const found = [...(await audit(s, scope, extra)), ...(more ? await more() : [])];
    await page.screenshot({ path: `${SHOTS}/${tag}-${z.w}x${z.h}.jpg`, type: 'jpeg', quality: 70 });
    for (const f of found) bad.push(`${tag} ${z.w}x${z.h}: ${f}`);
  }
  return bad;
}

const HOME_KEYS = ['.pl-home .hm-profile', '.pl-home .hm-cur', '.pl-home .hm-corner', '.pl-home .hm-left', '.pl-home .hm-slot > *', '.pl-home .hm-promo', '.pl-home .hm-plate', '.pl-home .hm-nav', '.pl-home .hm-play', '.pl-home .hm-line', '.pl-home .lb-peek', '.pl-home .lb-ver'];
const RESULTS_KEYS = ['.pl-results .pl-results-col', '.pl-results .pl-reward', '.pl-results .actions.pinned', '.pl-results .tt-mvp', '.pl-results .pl-tohome'];
const HUD_KEYS = ['.pl-hud .pl-minimap', '.pl-hud .pl-bar', '.pl-hud .pl-pause', '.pl-hud .pl-chat', '.pl-hud .pl-score', '.pl-hud .pl-tbtn'];

async function tap(_page: Page, s: Scope, sel: string, touch: boolean): Promise<void> {
  const l = s.locator(sel).first();
  if (touch) await l.tap();
  else await l.click();
}

/** Home → PLAY → Blitz vs bots → the champion select (at 844x390; `onModes` runs while Mode Select is open). */
async function toPick(page: Page, touch: boolean, onModes?: () => Promise<void>): Promise<void> {
  await page.setViewportSize({ width: 844, height: 390 });
  await tap(page, page, '[data-testid="home-play"]', touch);
  await expect(page.locator('[data-testid="mode-select"]')).toBeVisible();
  if (onModes) {
    await onModes();
    await page.setViewportSize({ width: 844, height: 390 });
  }
  await tap(page, page, '[data-testid="mode-blitz"]', touch);
  await tap(page, page, '[data-testid="mode-next"]', touch);
  await tap(page, page, '[data-testid="variant-bots"]', touch);
  await tap(page, page, '[data-testid="mode-go"]', touch);
  await page.waitForSelector('.pl-pick');
}

async function lockIn(page: Page, touch: boolean): Promise<void> {
  await page.setViewportSize({ width: 844, height: 390 });
  await tap(page, page, '.pl-pick .cs-lock:not([disabled])', touch);
  await page.waitForSelector('html[data-match="live"]');
  await page.waitForFunction(() => !document.querySelector('.pl-loading:not(.out)'));
}

async function device(browser: Browser, touch: boolean): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: touch, isMobile: touch, deviceScaleFactor: touch ? 2 : 1 });
  const page = await ctx.newPage();
  return { ctx, page };
}

for (const touch of [true, false]) {
  const sizes = touch ? TOUCH : DESKTOP;
  const kind = touch ? 'touch' : 'desktop';

  test(`overlap audit (${kind}): Home, Mode Select, champion select, HUD and results`, async ({ browser, baseURL }, info) => {
    test.skip(info.project.name !== 'desktop', 'sizes and touch are set per test');
    test.setTimeout(1_200_000);
    const { ctx, page } = await device(browser, touch);
    try {
      await page.addInitScript(([p, t]) => {
        if (!localStorage.getItem('tt.pawlegends.profile.v1')) {
          localStorage.setItem('tt.pawlegends.profile.v1', p);
          localStorage.setItem('tt.pawlegends.treats.v1', t);
        }
      }, [JSON.stringify(PROFILE), JSON.stringify(TREATS)] as const);
      const bad: string[] = [];
      // pass 1, real time (a WebGL screenshot at 2400x1080 takes seconds; at ?speed= the match would end mid-sweep):
      // Home, Mode Select, the champion select and the live HUD
      await page.goto(`${baseURL}/?e2e=1`);
      await page.waitForSelector('html[data-screen="title"] .pl-home');
      await page.waitForTimeout(900);
      bad.push(...(await sweep(page, page, sizes, `${kind}-home`, '.pl-home', HOME_KEYS)));
      // the level chips are up (the local fastest wins), so Home's founder bug is covered
      await expect(page.locator('.pl-home .hm-slot .plc-level').first()).toBeVisible();
      await toPick(page, touch, async () => {
        bad.push(...(await sweep(page, page, sizes, `${kind}-modes`, '[data-testid="mode-select"]', [])));
      });
      bad.push(...(await sweep(page, page, sizes, `${kind}-pick`, '.pl-pick', [])));
      await lockIn(page, touch);
      bad.push(...(await sweep(page, page, sizes, `${kind}-hud`, '.pl-hud', HUD_KEYS, undefined, true)));
      expect(await page.locator('html').getAttribute('data-match'), 'the match is still live after the HUD sweep').toBe('live');

      // pass 2, fast: a whole Blitz to the results
      await page.goto(`${baseURL}/?e2e=1&speed=8`);
      await page.waitForSelector('html[data-screen="title"] .pl-home');
      await toPick(page, touch);
      await lockIn(page, touch);
      await page.waitForSelector('html[data-screen="results"]', { timeout: 200_000 });
      await page.waitForSelector('.pl-results.actions-in', { timeout: 15_000 });
      await page.waitForTimeout(2500);
      bad.push(...(await sweep(page, page, sizes, `${kind}-results`, '.pl-results', RESULTS_KEYS, () => tablesFit(page))));
      // the chest toast is drawn once (no offset shadow copy of its text)
      const chest = page.locator('.pl-reward .rw-open');
      if (await chest.count()) expect(await chest.evaluate((e) => getComputedStyle(e).filter)).toBe('none');
      expect(bad).toEqual([]);
    } finally {
      await ctx.close();
    }
  });
}

test('overlap audit: the store and a signed-in Home (level chips) in the host', async ({ browser, baseURL }, info) => {
  test.skip(info.project.name !== 'desktop', 'sizes and touch are set per test');
  test.setTimeout(900_000);
  for (const touch of [true, false]) {
    const { ctx, page } = await device(browser, touch);
    try {
      await mockHost(ctx, baseURL!, { app: { isApp: false, store: true }, signedIn: true, name: 'Marshmallow fan', profile: PROFILE });
      const game = await openHost(page);
      await game.waitForSelector('html[data-screen="title"] .pl-home');
      await page.waitForTimeout(900);
      const kind = touch ? 'touch' : 'desktop';
      const sizes = touch ? TOUCH : DESKTOP;
      const bad: string[] = [];
      bad.push(...(await sweep(page, game, sizes, `${kind}-home-host`, '.pl-home', HOME_KEYS)));
      await page.setViewportSize({ width: 844, height: 390 });
      await tap(page, game, '.hm-nav [data-a="store"]', touch);
      await game.waitForSelector('.pl-store');
      bad.push(...(await sweep(page, game, sizes, `${kind}-store`, '.pl-store', [])));
      expect(bad).toEqual([]);
    } finally {
      await ctx.close();
    }
  }
});
