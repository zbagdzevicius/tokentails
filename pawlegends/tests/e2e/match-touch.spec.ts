import { expect, test } from '@playwright/test';
import { attr, me, ops, startFirstMatch } from './helpers';


test.beforeEach(({}, info) => test.skip(info.project.name !== 'landscape', 'touch controls'));

async function touchDrag(page: import('@playwright/test').Page, x0: number, y0: number, x1: number, y1: number, hold = 0): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  const tp = (x: number, y: number) => [{ x, y, id: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp(x0, y0) });
  for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tp(x0 + ((x1 - x0) * i) / 8, y0 + ((y1 - y0) * i) / 8) });
  if (hold) await page.waitForTimeout(hold);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

// POC.md §15 item 19.
test('joystick moves, Attack picks a target, drag-aim onto the cancel casts nothing', async ({ page }) => {
  await startFirstMatch(page);
  await expect(page.locator('.pl-touch.on')).toBeVisible();
  const a = await me(page);
  await touchDrag(page, 150, 250, 230, 230, 1500);
  await expect.poll(async () => (await me(page)).x, { timeout: 10000 }).toBeGreaterThan(a.x + 1000);
  expect(await ops(page)).toContain(1);

  const atk = await page.locator('.pl-tbtn.attack').boundingBox();
  await page.touchscreen.tap(atk!.x + atk!.width / 2, atk!.y + atk!.height / 2);
  // C5: Attack on something, or (nothing within reach) no order at all and the red ring instead of a walk
  await expect.poll(async () => (await ops(page)).some((o) => o === 3) || Number(await attr(page, 'atkNone')) > 0).toBe(true);
  expect((await ops(page)).slice(-1)).not.toEqual([2]);

  const before = await attr(page, 'casts');
  const w = await page.locator('.pl-tbtn.w').boundingBox();
  // drag W: the indicator and the ✕ show while dragging; releasing on the ✕ casts nothing
  const cdp = await page.context().newCDPSession(page);
  const x0 = w!.x + w!.width / 2;
  const y0 = w!.y + w!.height / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0, id: 2 }] });
  for (let i = 1; i <= 4; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 - i * 10, y: y0 - i * 6, id: 2 }] });
  const box = (await page.locator('.pl-cancel.on').boundingBox())!;
  // The ✕ never covers the minimap.
  const map = (await page.locator('.pl-minimap').boundingBox())!;
  const overlap = box.x < map.x + map.width && box.x + box.width > map.x && box.y < map.y + map.height && box.y + box.height > map.y;
  expect(overlap).toBe(false);
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const sx = x0 - 40;
  const sy = y0 - 24;
  for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: sx + ((cx - sx) * i) / 8, y: sy + ((cy - sy) * i) / 8, id: 2 }] });
  await expect.poll(() => attr(page, 'aim')).toBe('1');
  await expect.poll(() => attr(page, 'cancel')).toBe('1');
  // audit CF-01: the ✕ cancels after a 120 ms rest on it (CANCEL_DWELL_MS)
  await page.waitForTimeout(250);
  await expect(page.locator('.pl-cancel.hot')).toBeVisible();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => attr(page, 'aim')).toBe('');
  await page.waitForTimeout(150);
  expect(await attr(page, 'casts')).toBe(before);

  // a plain tap on Q smart-casts
  const q = await page.locator('.pl-tbtn.q').boundingBox();
  await page.touchscreen.tap(q!.x + q!.width / 2, q!.y + q!.height / 2);
  await expect.poll(async () => Number(await attr(page, 'casts'))).toBe(Number(before) + 1);
});

/**
 * POC.md §9: enemy hero in range first (lowest HP share), then the lowest-HP minion, then a tower; else the nearest,
 * but never a walk-in to a unit under an enemy tower or core that no allied minion is tanking (playtest fix).
 */
const BODY: Record<string, number> = { hero: 500, minion: 400, tower: 1300, core: 3000, fountain: 0, camp: 500, pudding: 2000 };
const TOWER_RANGE = 7000;
type Seen = { id: number; kind: string; team: number; x: number; y: number; hp: number; maxHp: number };
function expected(p: { range: number; me: { x: number; y: number }; seen: Seen[]; allyMinions: { x: number; y: number }[]; killable?: number[] }): { id: number | null; why: string } {
  const dd = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
  const guarded = (u: Seen) =>
    p.seen.some(
      (t) =>
        (t.kind === 'tower' || t.kind === 'core') &&
        t.team <= 1 &&
        dd(t, u) <= TOWER_RANGE + BODY.hero + BODY[t.kind] &&
        !p.allyMinions.some((m) => dd(m, t) <= TOWER_RANGE + BODY.tower),
    );
  const d = (u: Seen) => Math.hypot(u.x - p.me.x, u.y - p.me.y) - BODY[u.kind];
  const inRange = p.seen.filter((u) => d(u) <= p.range + 300);
  const by = <T,>(xs: T[], key: (x: T) => number) => xs.reduce<T | null>((b, x) => (b === null || key(x) < key(b) ? x : b), null);
  const hero = by(inRange.filter((u) => u.kind === 'hero'), (u) => u.hp / u.maxHp);
  if (hero) return { id: hero.id, why: 'hero in range' };
  // C5: minions and camp monsters within attack range + 1 m; the one the next basic kills (nearest) first
  const farm = p.seen.filter((u) => (u.kind === 'minion' || u.kind === 'camp') && d(u) <= p.range + 1000);
  const kill = by(farm.filter((u) => (p.killable ?? []).includes(u.id)), d);
  if (kill) return { id: kill.id, why: 'last hit in range' };
  const minion = by([...farm, ...inRange.filter((u) => u.kind === 'pudding')], (u) => u.hp);
  if (minion) return { id: minion.id, why: 'lowest-HP minion in range' };
  const tower = by(inRange.filter((u) => u.kind === 'tower' || u.kind === 'core'), (u) => u.hp);
  if (tower) return { id: tower.id, why: 'tower in range' };
  const near = (k: (u: Seen) => boolean) => by(p.seen.filter((u) => k(u) && d(u) <= 7000 && !guarded(u)), d);
  const nh = near((u) => u.kind === 'hero');
  if (nh) return { id: nh.id, why: 'nearest hero' };
  const nm = near((u) => u.kind === 'minion' || u.kind === 'camp' || u.kind === 'pudding');
  return nm ? { id: nm.id, why: 'nearest minion' } : { id: null, why: 'nothing' };
}

test('Attack picks by priority: hero in range, then the lowest-HP minion, then a tower', async ({ page }) => {
  test.setTimeout(180_000);
  await startFirstMatch(page, '&speed=4');
  const atk = (await page.locator('.pl-tbtn.attack').boundingBox())!;
  const reasons = new Map<string, number>();
  let checked = 0;
  let lastN = '';
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline && (reasons.size < 3 || checked < 25)) {
    if ((await attr(page, 'screen')) === 'results') break;
    // Walk toward the enemy side, then press Attack a few times. C5: Attack no longer walks the hero when nothing is
    // in reach (the old attack-move did half the walking here), so the stick walks further.
    await touchDrag(page, 150, 250, 230, 250, 1400);
    for (let i = 0; i < 3; i++) {
      await page.touchscreen.tap(atk.x + atk.width / 2, atk.y + atk.height / 2);
      await page.waitForTimeout(120);
      const n = await attr(page, 'atkN');
      if (!n || n === lastN) continue;
      lastN = n;
      const pick = JSON.parse(await attr(page, 'atk'));
      const want = expected(pick);
      expect(pick.id, `pick ${n} (${want.why})`).toBe(want.id);
      // C5: a press with nothing in reach is a checked pick too (null: the button sends nothing)
      checked++;
      reasons.set(want.why, (reasons.get(want.why) ?? 0) + 1);
    }
  }
  console.log(`attack priority: ${checked} picks checked, ${[...reasons].map(([k, v]) => `${k} ${v}`).join(', ')}`);
  expect(checked).toBeGreaterThan(5);
  expect([...reasons.keys()].some((k) => k.endsWith('in range'))).toBe(true);
});

test('portrait shows the rotate prompt', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('.pl-rotate')).toBeVisible();
});

// Fun plan F3: holding the joystick into the map edge never walks the hero outside the map (or into a corner).
test('a held joystick stops at the map edge', async ({ page }) => {
  test.setTimeout(90_000);
  await startFirstMatch(page, '&speed=4');
  await expect(page.locator('.pl-touch.on')).toBeVisible();
  // up and left from the fountain: straight into the west edge and the north-west corner
  await touchDrag(page, 200, 250, 140, 190, 12000);
  const p = await me(page);
  expect(p.x).toBeGreaterThanOrEqual(500);
  expect(p.y).toBeLessThanOrEqual(59500);
  expect(p.x).toBeLessThanOrEqual(99500);
  expect(p.y).toBeGreaterThanOrEqual(500);
});

// Desktop skill tooltips are desktop only: a phone never shows the hover card, even for a mouse-like pointer event.
test('no skill hover card on touch', async ({ page }) => {
  await startFirstMatch(page);
  await page.waitForTimeout(400);
  for (const sel of ['.pl-portrait', '.pl-slot[data-i="0"]', '.pl-tbtn.q']) {
    const box = await page.locator(sel).first().boundingBox();
    if (!box) continue;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(300);
    await expect(page.locator('.pl-slot-tip.on')).toHaveCount(0);
  }
  expect(await attr(page, 'slotTip')).toBe('');
});

// Fun pass (playtest #1): a skill dragged out and slid back onto its button (a 2 px wobble left) aims like a tap (the
// smart aim, MLBB's inner ring), not along the leftover 2 px at full range.
test('a drag slid back to its button aims and casts like a tap', async ({ page }) => {
  await startFirstMatch(page);
  await expect(page.locator('.pl-touch.on')).toBeVisible();
  const aim = () => page.evaluate(() => {
    const a = (window as unknown as { __plWorld?: { view: { aim: { x: number; z: number } | null } } }).__plWorld?.view.aim;
    return a ? { x: a.x, z: a.z } : null;
  });
  const q = (await page.locator('.pl-tbtn.q').boundingBox())!;
  const x0 = q.x + q.width / 2;
  const y0 = q.y + q.height / 2;
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x?: number, y?: number) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: x === undefined ? [] : [{ x, y: y!, id: 3 }] });
  // the held button's preview (the smart aim a tap casts at)
  await touch('touchStart', x0, y0);
  await page.waitForTimeout(350);
  const held = await aim();
  expect(held).not.toBeNull();
  for (let i = 1; i <= 6; i++) await touch('touchMove', x0 - 10 * i, y0 - 5 * i);
  await page.waitForTimeout(100);
  const out = (await aim())!;
  for (let i = 5; i >= 1; i--) await touch('touchMove', x0 - 10 * i, y0 - 5 * i);
  await touch('touchMove', x0 - 2, y0 + 1);
  await page.waitForTimeout(100);
  const back = (await aim())!;
  const d = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
  // back near the button: the preview is the smart aim again (the hero may have walked a little), not the drag's
  expect(d(back, held!), `back ${JSON.stringify(back)} held ${JSON.stringify(held)} out ${JSON.stringify(out)}`).toBeLessThan(d(back, out));
  const before = Number(await attr(page, 'casts'));
  await touch('touchEnd');
  await expect.poll(async () => Number(await attr(page, 'casts'))).toBe(before + 1);
});

type Disc = { x: number; y: number; width: number; height: number };
const discGap = (a: Disc, b: Disc): number =>
  Math.hypot(a.x + a.width / 2 - (b.x + b.width / 2), a.y + a.height / 2 - (b.y + b.height / 2)) - a.width / 2 - b.width / 2;

// Audit CF-01: a full-range aim up or up-left from W and E used to land on the ✕ and cancel (8 of 8 drags). The ✕
// now sits top centre, out of every drag's reach, so all four casts go out.
test('up and up-left drags from W and E cast; the ✕ stays out of their reach', async ({ page }) => {
  test.setTimeout(240_000);
  await startFirstMatch(page);
  await expect(page.locator('.pl-touch.on')).toBeVisible();
  const cdp = await page.context().newCDPSession(page);
  const vw = page.viewportSize()!.width;
  let id = 10;
  for (const b of ['w', 'e'] as const) {
    for (const [dx, dy] of [[0, -1], [-Math.SQRT1_2, -Math.SQRT1_2]]) {
      const btn = page.locator(`.pl-tbtn.${b}`);
      let cast = false;
      // a press the cast buffer refuses (the hero still busy from the last cast on a loaded machine) is tried again
      for (let attempt = 0; attempt < 3 && !cast; attempt++) {
        await expect(btn).not.toHaveClass(/cooling|locked/, { timeout: 30_000 });
        const box = (await btn.boundingBox())!;
        const x0 = box.x + box.width / 2;
        const y0 = box.y + box.height / 2;
        // the ✕ sits top centre (ui.css .pl-cancel: 50% across, 72 px down, 56 px wide): far past any 140 px drag
        expect(Math.hypot(vw / 2 - x0, 100 - y0), `${b}: ✕ distance`).toBeGreaterThan(200);
        const before = Number(await attr(page, 'casts'));
        id++;
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0, id }] });
        // 140 px: past the 90 px full-range aim, the way a thumb overshoots
        for (let i = 1; i <= 10; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + dx * 14 * i, y: y0 + dy * 14 * i, id }] });
        await page.waitForTimeout(200);
        expect(await page.locator('.pl-cancel.hot, .pl-cancel.arming').count(), `${b} ${dx},${dy}: on the ✕`).toBe(0);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        cast = await expect
          .poll(async () => Number(await attr(page, 'casts')), { timeout: 4000 })
          .toBeGreaterThan(before)
          .then(() => true, () => false);
      }
      expect(cast, `${b} ${dx},${dy} cast`).toBe(true);
    }
  }
});

// Audit CF-04: no two touch buttons touch (E and the trick overlapped by 5 px) at 667, 844 and 932 px wide.
test('the touch arc keeps a gap between every pair of buttons at 667, 844 and 932', async ({ page }) => {
  await startFirstMatch(page);
  await expect(page.locator('.pl-touch.on')).toBeVisible();
  for (const [width, height] of [[667, 375], [844, 390], [932, 430]]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(150);
    const boxes: Disc[] = [];
    for (const l of await page.locator('.pl-tbtn').all()) boxes.push((await l.boundingBox())!);
    expect(boxes.length).toBeGreaterThanOrEqual(7);
    for (let i = 0; i < boxes.length; i++) {
      const a = boxes[i];
      expect(a.x >= 0 && a.y >= 0 && a.x + a.width <= width && a.y + a.height <= height, `${width}: on screen`).toBe(true);
      for (let j = i + 1; j < boxes.length; j++) expect(discGap(a, boxes[j]), `${width}x${height}: ${i} vs ${j}`).toBeGreaterThanOrEqual(12);
    }
  }
});
