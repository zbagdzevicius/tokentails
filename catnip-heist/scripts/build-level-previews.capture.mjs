#!/usr/bin/env node
// Captures real gameplay frames for levels that have no promo clip (today: heist-03), for
// scripts/build-level-previews.mjs. Same method as promo/tools/capture.mjs: a solution replay with
// the sim frozen, one sim tick per frame under a Playwright fake clock, so the frames are
// deterministic. Nothing here changes the sim: it only steps the shipped solution.
//
//   ./node_modules/.bin/vite --port 5291 --strictPort --host 127.0.0.1 &   # a dev server (serves /src/levels)
//   node scripts/build-level-previews.capture.mjs [--url http://127.0.0.1:5291/] [clipName ...]
//
// Frames land in node_modules/.cache/level-previews/<clip>/0001.jpg ... (1920x1080, like the promo
// clips, so every level is graded from the same render size).
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
export const CAPTURE_DIR = resolve(here, '..', 'node_modules', '.cache', 'level-previews');

/** start = last tick before frame 1; frames = count (one tick each, 30 fps). */
export const CAPTURES = [
  // heist-03 Twin Locks: plate held (t100), door opens, SWAP (t103), partner runs through, plate
  // re-pressed (t142), SWAP back (t146). The patrol dog walks the next room.
  { name: 'h03-twin-locks', level: 'heist-03', start: 84, frames: 150 },
  // heist-03 rescue: Luna's crate opens at t1111, both cats head to the exit (win t1143).
  { name: 'h03-rescue', level: 'heist-03', start: 1080, frames: 62 },
];

const HIDE_CSS = '.ch-ui{visibility:hidden !important}';

function chromiumPath() {
  const cache = join(homedir(), 'Library/Caches/ms-playwright');
  const candidates = [
    process.env.PW_CHROMIUM,
    join(cache, 'chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell'),
    join(cache, 'chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'),
  ];
  return candidates.find((p) => p && existsSync(p));
}

export async function capture(def, url) {
  const browser = await chromium.launch({
    executablePath: chromiumPath(),
    headless: true,
    // A real GPU where there is one (Metal on macOS): SwiftShader renders the same frames, slower.
    args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    page.on('pageerror', (e) => console.warn('pageerror', e.message));
    await page.goto(new URL('?qa=1', url).href);
    await page.waitForFunction(() => document.getElementById('app')?.dataset.ready === '1', null, { timeout: 60_000 });
    await page.evaluate(async (level) => {
      const j = await (await fetch(`/src/levels/${level}.solution.json`)).json();
      window.__heist.freeze(true);
      await window.__heist.loadReplay(j);
      window.__heist.freeze(true);
    }, def.level);
    await page.clock.install({ time: 1_000_000 });
    await page.clock.runFor(100);
    await page.addStyleTag({ content: HIDE_CSS });
    // Bulk-step to just before the window, then warm up frame by frame so the camera and effects settle.
    const warm = Math.min(def.start, 20);
    if (def.start - warm > 0) await page.evaluate((n) => window.__heist.step(n), def.start - warm);
    for (let i = 0; i < warm; i++) {
      await page.evaluate(() => window.__heist.step(1));
      await page.clock.runFor(1000 / 30);
    }
    if (!warm) await page.clock.runFor(400);
    const dir = join(CAPTURE_DIR, def.name);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    for (let f = 1; f <= def.frames; f++) {
      await page.evaluate(() => window.__heist.step(1));
      await page.clock.runFor(1000 / 30);
      await page.screenshot({ path: join(dir, `${String(f).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 90 });
    }
    return dir;
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const at = args.indexOf('--url');
  const url = at >= 0 ? args.splice(at, 2)[1] : 'http://127.0.0.1:5291/';
  const only = args;
  for (const def of CAPTURES) {
    if (only.length && !only.includes(def.name)) continue;
    const t0 = Date.now();
    const dir = await capture(def, url);
    console.log(`${def.name}: ${def.frames} frames in ${((Date.now() - t0) / 1000).toFixed(1)} s -> ${dir}`);
  }
}
