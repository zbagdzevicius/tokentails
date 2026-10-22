import { expect, test, type Page } from '@playwright/test';

async function trackId(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const fm = (window as unknown as { __fm?: { shell: { setup: { track: { id: string; name: string } } | null } } }).__fm;
    return fm?.shell.setup?.track.id ?? null;
  });
}

/** Drag a closed ellipse across the editor canvas. */
async function doodle(page: Page): Promise<void> {
  const box = (await page.locator('.fm-ed-canvas').boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const rx = box.width * 0.34;
  const ry = box.height * 0.3;
  await page.mouse.move(cx + rx, cy);
  await page.mouse.down();
  for (let i = 1; i <= 64; i++) {
    const a = (i / 64) * Math.PI * 2 * 0.97;
    await page.mouse.move(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry * (1 + 0.15 * Math.sin(3 * a)));
  }
  await page.mouse.up();
}

test('Track Doodle: draw a loop, it validates, race it, share link and remix', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?make&seed=4');
  await expect(page.locator('.fm-ed')).toBeVisible();
  await expect(page.locator('.fm-ed-status')).toContainText('doodle');
  await doodle(page);
  await expect(page.locator('.fm-ed-status')).toContainText('Drivable', { timeout: 10_000 });
  await page.screenshot({ path: 'e2e/screens/editor-doodle.png' });

  // stickers: drag a boost pad from the tray onto the road (the start line is on the road)
  await page.locator('.fm-ed-tab[data-tab="style"]').click();
  await page.locator('.fm-ed-field input').first().fill('Zoomies Loop');
  await page.locator('.fm-ed-field input').first().press('Enter');
  await expect(page.locator('.fm-ed-title')).toHaveText('Zoomies Loop');

  await page.locator('.fm-ed-actions .primary').click();
  await expect(page.locator('.fm-ed')).toHaveCount(0);
  // the banner shows on the grid (until shortly after GO)
  await expect(page.locator('.fm-ugc-banner.on')).toContainText('Zoomies Loop');
  await page.screenshot({ path: 'e2e/screens/ugc-race.png' });
  await expect.poll(() => trackId(page)).toMatch(/^u-/);
  expect(page.url()).toMatch(/\?t=[A-Za-z0-9_-]{40,}/);

  // the link alone (a fresh page) opens the same track
  const url = page.url();
  const id = await trackId(page);
  await page.goto('about:blank');
  await page.goto(url);
  await expect.poll(() => trackId(page), { timeout: 20_000 }).toBe(id);

  // saved on the device, listed in the Tracks sheet (paused)
  await page.locator('.fm-menu-btn').click();
  await expect(page.locator('[data-screen="pause"] [data-act="ugc-tracks"]')).toBeVisible();
  await page.locator('[data-screen="pause"] [data-act="ugc-tracks"]').click();
  await expect(page.locator('.fm-ugc-list')).toContainText('Zoomies Loop');
  await page.locator('[data-a="remix"]').click();
  await expect(page.locator('.fm-ed')).toBeVisible();
  await expect(page.locator('.fm-ed-status')).toContainText('Drivable');
  expect(errors).toEqual([]);
});

/** Drag a stadium (two long straights joined by half circles) across the canvas: room for a loop on each straight. */
async function stadium(page: Page): Promise<void> {
  const box = (await page.locator('.fm-ed-canvas').boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const r = box.width * 0.2;
  const h = box.height * 0.36;
  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= 4; i++) pts.push([cx + r, cy + h - (2 * h * i) / 4]);
  for (let i = 1; i <= 6; i++) pts.push([cx + r * Math.cos((Math.PI * i) / 6), cy - h - r * Math.sin((Math.PI * i) / 6)]);
  for (let i = 1; i <= 4; i++) pts.push([cx - r, cy - h + (2 * h * i) / 4]);
  for (let i = 1; i <= 5; i++) pts.push([cx - r * Math.cos((Math.PI * i) / 6), cy + h + r * Math.sin((Math.PI * i) / 6)]);
  await page.mouse.move(pts[0][0], pts[0][1]);
  await page.mouse.down();
  for (const [x, y] of pts.slice(1)) await page.mouse.move(x, y);
  await page.mouse.up();
}

type Qa = { x: number; y: number; frac: number; pieces: Array<{ kind: string; s: number }>; ok: boolean; driving: boolean } | null;
const qa = (page: Page, frac: number) => page.evaluate((f) => (window as unknown as { __fmDoodle?: { qa(f: number): Qa } }).__fmDoodle?.qa(f) ?? null, frac);

/** Drag a stunt sticker from the tray to the road `frac` of the lap past the start (< 0: the straightest stretch). */
async function dropStunt(page: Page, kind: string, frac: number): Promise<void> {
  const b = (await page.locator(`.fm-ed-stunt[data-piece="${kind}"]`).boundingBox())!;
  const to = (await qa(page, frac))!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  for (let k = 1; k <= 4; k++) await page.mouse.move(b.x + b.width / 2 + ((to.x - b.x - b.width / 2) * k) / 4, b.y + b.height / 2 + ((to.y - b.y - b.height / 2) * k) / 4);
  await page.mouse.up();
}

test('Track Doodle stunts: loop, jump and tunnel stickers snap onto the road, validate, test-drive and race (code v3)', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?make&seed=4');
  await stadium(page);
  // F10: a fresh doodle starts with stunts (a loop on the long straight); one Undo takes them off, the drawing stays
  await expect.poll(async () => (await qa(page, 0))?.pieces.map((p) => p.kind) ?? [], { timeout: 30_000 }).toContain('loop');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(async () => (await qa(page, 0))?.pieces.length, { timeout: 10_000 }).toBe(0);
  await expect(page.locator('.fm-ed-status')).toContainText('Drivable', { timeout: 30_000 });
  await page.locator('.fm-ed-tab[data-tab="stickers"]').click();
  await expect(page.locator('.fm-ed-stunt')).toHaveCount(4);
  await page.screenshot({ path: 'e2e/screens/editor-stunt-tray.png' });

  const loopAt = (await qa(page, -1))!.frac;
  await dropStunt(page, 'loop', -1);
  await expect.poll(async () => (await qa(page, 0))?.pieces.map((p) => p.kind), { timeout: 30_000 }).toEqual(['loop']);
  // the panel shows the picked stunt; the tray comes back with ✓
  await expect(page.locator('.fm-ed-panel')).toContainText('Loop');
  await page.locator('.fm-ed-panel [aria-label="Done"]').click();
  // the tunnel on the bend after the loop
  await dropStunt(page, 'tunnel', (loopAt + 0.25) % 1);
  await expect.poll(async () => (await qa(page, 0))?.pieces.length, { timeout: 30_000 }).toBe(2);
  // the tunnel's length stepper
  await expect(page.locator('.fm-ed-panel')).toContainText('Tunnel');
  await page.locator('.fm-ed-panel [aria-label="Done"]').click();
  // auto-validation: the test drive runs, then the status settles
  await expect.poll(async () => (await qa(page, 0))?.driving, { timeout: 10_000 }).toBe(false);
  await page.screenshot({ path: 'e2e/screens/editor-stunts.png' });
  const st = await qa(page, 0);
  const status = await page.locator('.fm-ed-status').textContent();
  expect(st?.ok, status ?? '').toBe(true);
  await expect(page.locator('.fm-ed-status')).toContainText('Drivable');

  // a stunt dragged off the road is removed
  await page.locator('.fm-ed-tab[data-tab="stickers"]').click();
  await dropStunt(page, 'jump', (loopAt + 0.75) % 1);
  await expect.poll(async () => (await qa(page, 0))?.pieces.length, { timeout: 30_000 }).toBe(3);
  await expect(page.locator('.fm-ed-panel')).toContainText('Gap');
  await page.locator('.fm-ed-panel').getByRole('button', { name: /Remove/ }).click();
  await expect.poll(async () => (await qa(page, 0))?.pieces.length, { timeout: 30_000 }).toBe(2);
  await expect.poll(async () => (await qa(page, 0))?.driving, { timeout: 10_000 }).toBe(false);
  await expect(page.locator('.fm-ed-status')).toContainText('Drivable');

  await page.locator('.fm-ed-actions .primary').click();
  await expect(page.locator('.fm-ed')).toHaveCount(0);
  // the share code is v3 (set pieces) and the race has them
  const code = new URL(page.url()).searchParams.get('t')!;
  const first = Buffer.from(code.replace(/-/g, '+').replace(/_/g, '/'), 'base64')[0];
  expect(first >> 4).toBe(3);
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __fm?: { shell: { world: { track: { pieces: Array<{ kind: string }> } } | null } } }).__fm?.shell.world?.track.pieces.map((p) => p.kind).sort() ?? null), { timeout: 20_000 })
    .toEqual(['loop', 'tunnel']);
  await page.screenshot({ path: 'e2e/screens/editor-stunts-race.png' });
  expect(errors).toEqual([]);
});

test('a broken track link says so and races Kitchen', async ({ page }) => {
  await page.goto('/?t=AAAAbrokenAAAA&seed=2');
  await expect(page.locator('.fm-ugc-sheet.on')).toContainText('This track link is broken');
  await expect.poll(() => trackId(page)).toBe('kitchen');
  await page.getByRole('button', { name: 'Race Kitchen' }).click();
  await expect(page.locator('.fm-ugc-sheet.on')).toHaveCount(0);
});

/** Captures navigator.share (url or text) instead of opening a sheet. */
async function stubShare(page: Page): Promise<void> {
  await page.addInitScript(() => {
    if (location.protocol !== 'http:') return;
    const w = window as unknown as { __shared: string[] };
    w.__shared = [];
    Object.defineProperty(navigator, 'share', { configurable: true, value: async (d: { url?: string; text?: string }) => void w.__shared.push(d.url ?? d.text ?? '') });
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
  });
}

const sharedList = (page: Page) => page.evaluate(() => (window as unknown as { __shared: string[] }).__shared);

test('doodles start spectacular: auto-stunts, Spice it up, Surprise track, and Beat the maker on the shared link', async ({ browser }) => {
  test.setTimeout(420_000);
  const errors: string[] = [];
  const maker = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  maker.on('pageerror', (e) => errors.push(e.message));
  await stubShare(maker);
  await maker.goto('/?make&seed=4&bot=1&speed=8');
  await doodle(maker);
  // a loop, a jump gap and (room permitting) a tunnel, placed by the editor's own snap; the hint says so
  await expect.poll(async () => (await qa(maker, 0))?.pieces.length ?? 0, { timeout: 30_000 }).toBeGreaterThanOrEqual(2);
  await expect(maker.locator('.fm-ed-status')).toContainText('Stunts added');
  const before = JSON.stringify((await qa(maker, 0))!.pieces);
  await maker.locator('[data-act="spice"]').click();
  await expect.poll(async () => JSON.stringify((await qa(maker, 0))?.pieces), { timeout: 30_000 }).not.toBe(before);
  await expect.poll(async () => (await qa(maker, 0))?.driving, { timeout: 30_000 }).toBe(false);
  expect((await qa(maker, 0))?.ok).toBe(true);
  await maker.screenshot({ path: 'e2e/screens/editor-spice.png' });

  // Surprise track: a random valid doodle in a random theme with stunts, ready to race
  await maker.locator('.fm-ed-tab[data-tab="draw"]').click();
  await maker.locator('[data-act="surprise"]').click();
  await expect(maker.locator('.fm-ed-status')).toContainText('Surprise');
  await expect.poll(async () => (await qa(maker, 0))?.driving, { timeout: 30_000 }).toBe(false);
  expect((await qa(maker, 0))?.ok).toBe(true);
  await maker.screenshot({ path: 'e2e/screens/editor-surprise.png' });

  // the test drive: its best completed lap is kept on this device, and the share link carries it
  await maker.locator('.fm-ed-actions .primary').click();
  await expect(maker.locator('.fm-overlay.on .fm-res-head')).toBeVisible({ timeout: 200_000 });
  const code = new URL(maker.url()).searchParams.get('t')!;
  await maker.goto('about:blank');
  await maker.goto(`/?make&t=${code}`);
  await expect(maker.locator('.fm-ed')).toBeVisible();
  await maker.locator('.fm-ed-actions button', { hasText: 'Share' }).click();
  await expect.poll(async () => (await sharedList(maker)).length, { timeout: 10_000 }).toBe(1);
  const link = new URL((await sharedList(maker))[0]);
  // the same track, now with the lap in the code, and the class the lap was driven at
  expect(link.searchParams.get('t')).not.toBe(code);
  const lapCls = link.searchParams.get('cls');
  expect(lapCls).toMatch(/^[012]$/);

  // a friend opens it: "Sender's lap 0:xx.xx · beat it", a live lap delta, and how it went on the results
  const friend = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  friend.on('pageerror', (e) => errors.push(e.message));
  // a race at another class shows no target (playtest: a 100cc lap to beat at 50cc)
  await friend.goto(`/?bot=1&t=${link.searchParams.get('t')}&cls=${(Number(lapCls) + 1) % 3}`);
  await expect(friend.locator('.fm-ugc-banner.on')).toBeVisible({ timeout: 20_000 });
  await expect(friend.locator('.fm-ugc-banner.on')).not.toContainText("Sender's lap");
  await friend.goto('about:blank');
  await friend.goto(`/?bot=1&speed=4&t=${link.searchParams.get('t')}&cls=${lapCls}`);
  await expect(friend.locator('.fm-ugc-banner.on')).toContainText(/Sender's lap \d:\d\d\.\d\d · beat it/, { timeout: 20_000 });
  await expect(friend.locator('.fm-lap-pill.on b')).toHaveText(/^[+−]\d+\.\d\d$/, { timeout: 60_000 });
  await friend.screenshot({ path: 'e2e/screens/ugc-maker-lap.png' });
  await expect(friend.locator('.fm-overlay.on .fm-lines')).toContainText("sender's lap", { timeout: 200_000 });
  // the track without a lap in its code has no target
  await friend.goto('about:blank');
  await friend.goto(`/?bot=1&t=${code}`);
  await expect(friend.locator('.fm-ugc-banner.on')).toBeVisible({ timeout: 20_000 });
  await expect(friend.locator('.fm-ugc-banner.on')).not.toContainText("Sender's lap");
  expect(errors).toEqual([]);
});
