import { expect, test, type Frame, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';

// s7 verify (live): the overlap audit's checks (copied from overlap-audit.spec.ts) on the results of a whole Blitz
// and on Home, at the touch sizes, on the live game. A lighter run than the full audit (no HUD sweep at 2400x1080).
const SHOTS = `${homedir()}/Downloads/paw-legends/s7/verify/overlap`;
type Size = { w: number; h: number };
const SIZES: readonly Size[] = [{ w: 667, h: 375 }, { w: 844, h: 390 }, { w: 873, h: 393 }, { w: 1280, h: 590 }, { w: 1440, h: 900 }, { w: 1920, h: 1080 }];
const PROFILE = { v: 1, sessions: 6, matches: 30, wins: 18, firstWinDone: true, hero: 'marshmallow', side: 'cat', veteran: true, firstPlaySession: 1, difficulty: 'easy', fastest: { rookie: 400, easy: 300 } };
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

test('live overlap audit (touch): Home and a Blitz results screen', async ({ browser, baseURL }, info) => {
  test.skip(info.project.name !== 'desktop', 'sizes and touch are set here');
  test.setTimeout(1_500_000);
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  try {
    const page = await ctx.newPage();
    await page.addInitScript(([p, t]) => {
      if (!localStorage.getItem('tt.pawlegends.profile.v1')) {
        localStorage.setItem('tt.pawlegends.profile.v1', p);
        localStorage.setItem('tt.pawlegends.treats.v1', t);
      }
    }, [JSON.stringify(PROFILE), JSON.stringify(TREATS)] as const);
    const bad: string[] = [];
    await page.goto(`${baseURL}/?e2e=1&speed=16`);
    await page.waitForSelector('html[data-screen="title"] .pl-home');
    await page.waitForTimeout(900);
    bad.push(...(await sweep(page, page, SIZES, 'live-touch-home', '.pl-home', HOME_KEYS)));
    await page.setViewportSize({ width: 844, height: 390 });
    for (const sel of ['[data-testid="home-play"]', '[data-testid="mode-blitz"]', '[data-testid="mode-next"]', '[data-testid="variant-bots"]', '[data-testid="mode-go"]', '.pl-pick .cs-lock:not([disabled])'])
      await page.locator(sel).first().tap();
    await page.waitForSelector('html[data-screen="results"]', { timeout: 1_200_000 });
    await page.waitForSelector('.pl-results.actions-in', { timeout: 30_000 });
    await page.waitForTimeout(2500);
    bad.push(...(await sweep(page, page, SIZES, 'live-touch-results', '.pl-results', RESULTS_KEYS, () => tablesFit(page))));
    const chest = page.locator('.pl-reward .rw-open');
    if (await chest.count()) expect(await chest.evaluate((e) => getComputedStyle(e).filter)).toBe('none');
    expect(bad).toEqual([]);
  } finally {
    await ctx.close();
  }
});
