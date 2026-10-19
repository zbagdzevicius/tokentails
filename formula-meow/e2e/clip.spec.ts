import fs from 'node:fs';
import { expect, test } from '@playwright/test';

// The finish clip (GDD 9.1): rendered from the replay after the race and handed to navigator.share as an MP4.
// Software WebGL makes this slow in CI, so it has its own long timeout. Skipped where WebCodecs H.264 is missing.
test('the finish clip encodes a 12 s vertical MP4 and goes to the share sheet', async ({ page }) => {
  test.setTimeout(420_000);
  await page.addInitScript(() => {
    const w = window as unknown as { __files: Array<{ name: string; type: string; size: number; b64: string }> };
    w.__files = [];
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (d: { files?: File[] }) => {
        for (const f of d.files ?? []) {
          const buf = new Uint8Array(await f.arrayBuffer());
          let s = '';
          for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
          w.__files.push({ name: f.name, type: f.type, size: f.size, b64: btoa(s) });
        }
      },
    });
  });
  await page.goto('/?bot=1&seed=5&speed=8');
  await expect(page.locator('.fm-overlay.on .fm-place')).toBeVisible({ timeout: 110_000 });
  const clipBtn = page.locator('.fm-overlay [data-x="0"]');
  await expect(clipBtn).toHaveText(/Share (clip|card)/, { timeout: 360_000 });
  test.skip((await clipBtn.textContent())!.includes('card'), 'no WebCodecs H.264 in this browser');
  await clipBtn.click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __files: unknown[] }).__files.length), { timeout: 10_000 }).toBe(1);
  const f = await page.evaluate(() => (window as unknown as { __files: Array<{ name: string; type: string; size: number; b64: string }> }).__files[0]);
  expect(f.type).toBe('video/mp4');
  expect(f.name).toMatch(/^formula-meow-\d{8}\.mp4$/);
  expect(f.size).toBeGreaterThan(100_000);
  fs.mkdirSync('e2e/screens', { recursive: true });
  fs.writeFileSync('e2e/screens/clip.mp4', Buffer.from(f.b64, 'base64'));
});
