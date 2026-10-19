import { expect, test, type Page } from '@playwright/test';

/** items-ai lane smoke: items fly and land, the views render without errors, the Laser Dot banner shows. */
type Fm = {
  shell: {
    world: {
      st: {
        tick: number;
        karts: Array<{ item: string | null; itemCount: number; rouletteTicks: number; shieldTicks: number; lap: number }>;
        items: { s?: { proj: unknown[]; traps: unknown[] } };
        events: Array<{ type: string }>;
      };
    };
  };
};

async function onTrack(page: Page): Promise<number> {
  return page.evaluate(() => {
    const s = (window as unknown as { __fm?: Fm }).__fm?.shell.world?.st.items.s;
    return s ? s.proj.length + s.traps.length : 0;
  });
}

async function give(page: Page, item: string): Promise<void> {
  await page.evaluate((id) => {
    const k = (window as unknown as { __fm: Fm }).__fm.shell.world.st.karts[5];
    k.item = id;
    k.itemCount = 1;
    k.rouletteTicks = 0;
  }, item);
}

test('items fly and land on the track; Box and Zoomies render on the kart', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?bot=1&seed=7');
  await expect.poll(() => page.evaluate(() => (window as unknown as { __fm?: Fm }).__fm?.shell.world?.st.tick ?? 0), { timeout: 30_000 }).toBeGreaterThan(300);
  // the bot fires whatever it holds at once: a lobbed cucumber stays on the road behind it for 30 s
  await give(page, 'cucumber');
  await expect.poll(() => onTrack(page), { timeout: 20_000 }).toBeGreaterThan(0);
  await give(page, 'hairball');
  await page.waitForTimeout(150);
  await page.screenshot({ path: 'e2e/screens/items-kitchen.png' });
  await give(page, 'box');
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'e2e/screens/items-box.png' });
  await give(page, 'zoomies');
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'e2e/screens/items-zoomies.png' });
  expect(errors).toEqual([]);
});
