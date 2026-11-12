import type { Locator, Page } from '@playwright/test';

/** A page, a frame or a frame locator: anything that finds elements. */
export type Root = { locator(selector: string): Locator };

export const attr = (page: Page, name: string): Promise<string> => page.evaluate((n) => document.documentElement.dataset[n] ?? '', name);

export async function me(page: Page): Promise<{ x: number; y: number; state: string }> {
  const [x, y, state] = (await attr(page, 'me')).split(',');
  return { x: Number(x), y: Number(y), state };
}

/** The local profile key (meta/profile.ts). */
export const PROFILE_KEY = 'tt.pawlegends.profile.v1';

/**
 * Seed a played profile (match 1 complete, so the DOGS tab is open) on `side` before the page loads, once: a reload
 * keeps what the game saved since.
 */
export async function seedSide(page: Page, side: 'cat' | 'dog', extra: Record<string, unknown> = {}): Promise<void> {
  const profile = { v: 1, sessions: 2, matches: 1, wins: 1, firstWinDone: true, hero: side === 'dog' ? 'brutus' : 'clem', side, ...extra };
  await page.addInitScript(
    ([key, json]) => {
      try {
        if (!localStorage.getItem(key)) localStorage.setItem(key, json);
      } catch {
        /* storage blocked */
      }
    },
    [PROFILE_KEY, JSON.stringify(profile)] as const,
  );
}

/**
 * Home → a bots match through the one play path (HOME-MODES.md §5): PLAY; for a returning player Mode Select opens,
 * then `mode` (default: the remembered one) → Next → vs Bots (with `difficulty`) → Choose champion → LOCK IN. The
 * first-ever match (and a dare) still starts in one tap.
 */
export async function playFromHome(
  root: Root,
  opts: { mode?: string; difficulty?: 'easy' | 'normal' | 'hard'; timeout?: number } = {},
): Promise<void> {
  const t = opts.timeout !== undefined ? { timeout: opts.timeout } : {};
  const play = root.locator('[data-testid="home-play"]');
  // read before the tap: the first match's PLAY leaves the page as the match loads
  const flow = (await play.getAttribute('aria-haspopup', t)) === 'dialog';
  await play.click(t);
  if (!flow) return;
  await root.locator('[data-testid="mode-select"]').waitFor(t);
  if (opts.mode) await root.locator(`[data-testid="mode-${opts.mode}"]`).click(t);
  await root.locator('[data-testid="mode-next"]').click(t);
  await root.locator('[data-testid="variant-bots"]').click(t);
  if (opts.difficulty) await root.locator(`[data-testid="bots-${opts.difficulty}"]`).click(t);
  await root.locator('[data-testid="mode-go"]').click(t);
  await root.locator('.pl-pick .cs-lock:not([disabled])').click(t);
}

/**
 * Home → the champion select through the one play path: PLAY → `mode` (default: the remembered one) → Next → vs Bots
 * → Choose champion (a returning player; the nav Heroes only browses now).
 */
/** Home → With Friends through the one play path (PLAY → Skirmish → With Friends → Open party): the party lobby. */
export async function withFriends(root: Root): Promise<void> {
  await root.locator('[data-testid="home-play"]').click();
  await root.locator('[data-testid="mode-select"]').waitFor();
  await root.locator('[data-testid="mode-skirmish"]').click();
  await root.locator('[data-testid="mode-next"]').click();
  await root.locator('[data-testid="variant-friends"]').click();
  await root.locator('[data-testid="mode-go"]').click();
}

export async function toChampSelect(root: Root, opts: { mode?: string; difficulty?: 'easy' | 'normal' | 'hard' } = {}): Promise<void> {
  await root.locator('[data-testid="home-play"]').click();
  await root.locator('[data-testid="mode-select"]').waitFor();
  if (opts.mode) await root.locator(`[data-testid="mode-${opts.mode}"]`).click();
  await root.locator('[data-testid="mode-next"]').click();
  await root.locator('[data-testid="variant-bots"]').click();
  if (opts.difficulty) await root.locator(`[data-testid="bots-${opts.difficulty}"]`).click();
  await root.locator('[data-testid="mode-go"]').click();
  await root.locator('.pl-pick').waitFor();
}

/**
 * Title → first match (one tap). With `side`, a played profile on that side is seeded first (sim v14: `dog` starts the
 * match as Sir Brutus on the dog side, so the bots fill both teams by species).
 */
export async function startFirstMatch(page: Page, query = '', side?: 'cat' | 'dog'): Promise<void> {
  if (side) await seedSide(page, side);
  await page.goto(`/?e2e=1${query}`);
  await page.waitForSelector('html[data-screen="title"]');
  await playFromHome(page);
  await page.waitForSelector('html[data-match="live"]');
  await page.waitForFunction(() => !!document.documentElement.dataset.me);
  // the loading veil takes clicks until it fades (app.ts adds .out on a timer, late under CPU load)
  await page.waitForFunction(() => !document.querySelector('.pl-loading:not(.out)'));
}

export const ops = async (page: Page): Promise<number[]> => (await attr(page, 'ops')).split(',').filter(Boolean).map(Number);

/**
 * Feel pass B2: the client px of sim point (xMm, yMm) on the minimap, which is turned with the diagonal camera (the
 * e2e hook `__plMinimap.P`, scaled from the canvas's drawn size to the box it shows in).
 */
export async function minimapPoint(page: Page, xMm: number, yMm: number): Promise<{ x: number; y: number }> {
  return page.evaluate(
    ([x, y]) => {
      const m = (window as unknown as { __plMinimap: { P(x: number, y: number): [number, number] } }).__plMinimap;
      const c = document.querySelector<HTMLCanvasElement>('.pl-minimap canvas')!;
      const r = c.getBoundingClientRect();
      const k = r.width / (c.width / Math.min(2, devicePixelRatio || 1));
      const [px, py] = m.P(x, y);
      return { x: r.left + px * k, y: r.top + py * k };
    },
    [xMm, yMm] as const,
  );
}
