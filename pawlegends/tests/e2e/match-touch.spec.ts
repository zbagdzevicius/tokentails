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
  await expect.poll(async () => (await ops(page)).some((o) => o === 2 || o === 3)).toBe(true);

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
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => attr(page, 'aim')).toBe('');
  await page.waitForTimeout(150);
  expect(await attr(page, 'casts')).toBe(before);

  // a plain tap on Q smart-casts
  const q = await page.locator('.pl-tbtn.q').boundingBox();
  await page.touchscreen.tap(q!.x + q!.width / 2, q!.y + q!.height / 2);
  await expect.poll(async () => Number(await attr(page, 'casts'))).toBe(Number(before) + 1);
});

/** POC.md §9: enemy hero in range first (lowest HP share), then the lowest-HP minion, then a tower; else nearest. */
const BODY: Record<string, number> = { hero: 500, minion: 400, tower: 1300, core: 3000, fountain: 0, camp: 500, pudding: 2000 };
type Seen = { id: number; kind: string; x: number; y: number; hp: number; maxHp: number };
function expected(p: { range: number; me: { x: number; y: number }; seen: Seen[] }): { id: number | null; why: string } {
  const d = (u: Seen) => Math.hypot(u.x - p.me.x, u.y - p.me.y) - BODY[u.kind];
  const inRange = p.seen.filter((u) => d(u) <= p.range + 300);
  const by = <T,>(xs: T[], key: (x: T) => number) => xs.reduce<T | null>((b, x) => (b === null || key(x) < key(b) ? x : b), null);
  const hero = by(inRange.filter((u) => u.kind === 'hero'), (u) => u.hp / u.maxHp);
  if (hero) return { id: hero.id, why: 'hero in range' };
  const minion = by(inRange.filter((u) => u.kind === 'minion' || u.kind === 'camp' || u.kind === 'pudding'), (u) => u.hp);
  if (minion) return { id: minion.id, why: 'lowest-HP minion in range' };
  const tower = by(inRange.filter((u) => u.kind === 'tower' || u.kind === 'core'), (u) => u.hp);
  if (tower) return { id: tower.id, why: 'tower in range' };
  const near = (k: (u: Seen) => boolean) => by(p.seen.filter((u) => k(u) && d(u) <= 7000), d);
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
  while (Date.now() < deadline && (reasons.size < 2 || checked < 25)) {
    if ((await attr(page, 'screen')) === 'results') break;
    // Walk toward the enemy side, then press Attack a few times.
    await touchDrag(page, 150, 250, 230, 250, 700);
    for (let i = 0; i < 3; i++) {
      await page.touchscreen.tap(atk.x + atk.width / 2, atk.y + atk.height / 2);
      await page.waitForTimeout(120);
      const n = await attr(page, 'atkN');
      if (!n || n === lastN) continue;
      lastN = n;
      const pick = JSON.parse(await attr(page, 'atk'));
      const want = expected(pick);
      expect(pick.id, `pick ${n} (${want.why})`).toBe(want.id);
      if (want.id !== null) {
        checked++;
        reasons.set(want.why, (reasons.get(want.why) ?? 0) + 1);
      }
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
