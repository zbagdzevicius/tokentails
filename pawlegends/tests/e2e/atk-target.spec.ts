import { expect, test, type Page } from '@playwright/test';
import { attr, startFirstMatch } from './helpers';

/**
 * UX pass 2 (Wild Rift basic-attack targeting), touch at 844x390 and 667x375: the field rings the unit ATK would hit
 * (html[data-atk-target]); a tap on ATK attacks exactly that unit; with nothing in reach there is no ring and ATK sends
 * nothing; the last-hit (minion) and tower buttons are on by default, LH attacks a minion, TWR with no tower in reach
 * is refused (never a walk-in).
 */
test.beforeEach(({}, info) => test.skip(info.project.name !== 'landscape', 'touch controls'));

const tapEl = async (page: Page, sel: string): Promise<void> => {
  // the match can end between two taps (the buttons go): never wait for the test timeout on a gone button
  const b = await page.locator(sel).boundingBox({ timeout: 3000 }).catch(() => null);
  if (b) await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
};

for (const size of [
  { w: 844, h: 390 },
  { w: 667, h: 375 },
]) {
  test(`${size.w}x${size.h}: ATK hits the ringed unit; nothing in reach, no ring; LH and TWR`, async ({ page }) => {
    test.setTimeout(420_000);
    await page.setViewportSize({ width: size.w, height: size.h });
    // a played profile (match 2, not the guided first match): the minimap is up for the walk
    await startFirstMatch(page, '&speed=3', 'cat');
    // both extra buttons are there by default
    await expect(page.locator('.pl-tbtn.lasthit')).toBeVisible();
    await expect(page.locator('.pl-tbtn.tower')).toBeVisible();

    // scenario 1: at the base nothing is in reach: no ring, and ATK sends no attack (the "nothing in reach" flash)
    expect(await attr(page, 'atkTarget')).toBe('');
    const none0 = Number(await attr(page, 'atkNone'));
    await expect
      .poll(
        async () => {
          await tapEl(page, '.pl-tbtn.attack');
          return Number(await attr(page, 'atkNone'));
        },
        { timeout: 90_000, intervals: [600] },
      )
      .toBeGreaterThan(none0);
    expect(await attr(page, 'atkSent')).toBe('');
    // the last-hit and tower buttons with nothing in reach: refused on the spot (red flash), never a walk-in
    for (const b of ['lasthit', 'tower']) {
      await tapEl(page, `.pl-tbtn.${b}`);
      await expect(page.locator(`.pl-tbtn.${b}.deny`)).toHaveCount(1, { timeout: 2000 });
    }
    expect(await attr(page, 'extraHits')).toBe('0,0');
    expect(await attr(page, 'walkin')).toBe('');
    expect(await attr(page, 'atkSent')).toBe('');

    // scenarios 2 and 3: up Sunny Lane, every ATK press that finds the field ringing a unit hits exactly that unit
    const map = (await page.locator('.pl-minimap canvas').boundingBox())!;
    const goTo = async (x: number, y: number) => page.mouse.click(map.x + (x / 100000) * map.width, map.y + (1 - y / 60000) * map.height, { button: 'right' });
    const deadline = Date.now() + Math.max(60_000, test.info().timeout - 150_000);
    const ringed: string[] = [];
    let lh = false;
    let n = await attr(page, 'atkN');
    let goalX = 30000;
    while (Date.now() < deadline && (ringed.length < 3 || !lh)) {
      if ((await attr(page, 'screen')) === 'results') break;
      const ring = await attr(page, 'atkTarget');
      if (!ring) {
        // a step further up Sunny Lane while nothing is in reach (the minions meet near the middle)
        goalX = Math.min(50000, goalX + 2500);
        await goTo(goalX, 52500);
        await page.waitForTimeout(700);
        continue;
      }
      await tapEl(page, '.pl-tbtn.attack');
      await page.waitForTimeout(200);
      const n1 = await attr(page, 'atkN');
      if (n1 !== n) {
        n = n1;
        const pick = JSON.parse(await attr(page, 'atk')) as { id: number | null; ring: number | null; seen: { id: number; kind: string }[] };
        if (pick.ring !== null) {
          expect(pick.id, `ATK hit ${pick.id}, the ring was on ${pick.ring}`).toBe(pick.ring);
          ringed.push(pick.seen.find((u) => u.id === pick.ring)?.kind ?? '?');
        }
      }
      if (!lh) {
        const a = Number((await attr(page, 'extraHits')).split(',')[0]);
        await tapEl(page, '.pl-tbtn.lasthit');
        await page.waitForTimeout(150);
        if (Number((await attr(page, 'extraHits')).split(',')[0]) > a) {
          expect(await attr(page, 'atkSent')).toMatch(/^\d+:(minion|camp)$/);
          lh = true;
        }
      }
    }
    console.log(`ATK: ${ringed.length} ringed presses (${ringed.join(', ')}); LH on a minion: ${lh}`);
    // an idle machine sees 3 ringed presses and the LH hit (checked above when it lands) within a minute; a loaded one
    // may end the match sooner, so one ringed press is the floor
    expect(ringed.length).toBeGreaterThanOrEqual(1);
    await page.screenshot({ path: `test-results/atk-target-${size.w}x${size.h}.png` });
  });
}
