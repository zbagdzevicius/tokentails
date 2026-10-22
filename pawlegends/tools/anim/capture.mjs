#!/usr/bin/env node
/**
 * Animation capture (ANIM-SPEC §11), dev only: drives the gallery (gallery.html, src/gallery/) frame by frame at a
 * fixed 60 Hz in one Playwright Chromium page and writes, per hero and scenario:
 *
 *   <out>/<hero>/<scenario>.jpg   a contact sheet (12 frames across the move, the sim-tick ruler burned in)
 *   <out>/<hero>/<scenario>.mp4   the clip at 60 fps (needs ffmpeg on PATH)
 *
 * and prints one JSON line per scenario: { hero, scenario, clip, contactTick, eventTick, deltaFrames, maxUp, maxFwd },
 * so a reviewer or a test can check the sync numerically (deltaFrames = display frames between the clip's contact
 * marker and the sim anchor; 0–1 is on time).
 *
 *   node tools/anim/capture.mjs --hero clem[,sage|all] [--scenario basic,e,clip:clem.victory] [--tier low|med|high]
 *        [--set hero|demo] [--query branch=1&buffs=8] [--out DIR] [--url http://127.0.0.1:5191] [--port 5191]
 *        [--size 640x360] [--no-mp4]
 *
 * Without --url it starts its own Vite dev server on --port (strict) through the Vite API with its own dependency
 * cache (no "504 Outdated Optimize Dep" when other agents share node_modules/.vite), no HMR and no file watching (an
 * edit elsewhere in the worktree never reloads the page mid-capture), and stops it at the end. A scenario that fails
 * (a page error, a timeout) is retried twice on a fresh page. One browser: safe on a shared machine. Default --out:
 * $TMPDIR/pawlegends-anim. The hero's own clips are scenarios too (`clip:<id>`: idle, fidgets, victory, emote…).
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { argValue, hasFlag } from '../lib/args.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = resolve(HERE, '..', '..');
const require = createRequire(join(PKG, 'package.json'));
const { chromium } = require('@playwright/test');

const HEROES = ['clem', 'sage', 'brutus', 'cacklejaw', 'lambo', 'aviete', 'bengas', 'gabe'];
const heroArg = argValue('--hero') ?? 'clem';
const heroes = heroArg === 'all' ? HEROES : heroArg.split(',').filter((h) => HEROES.includes(h));
const only = (argValue('--scenario') ?? argValue('--clip') ?? '').split(',').filter(Boolean);
const tier = argValue('--tier') ?? 'high';
const set = argValue('--set') ?? 'hero';
const extraQuery = argValue('--query') ?? '';
const OUT = resolve(argValue('--out') ?? join(tmpdir(), 'pawlegends-anim'));
const port = Number(argValue('--port') ?? 5191);
const [W, H] = (argValue('--size') ?? '640x360').split('x').map(Number);
const RULER = 70;
const MP4 = !hasFlag('--no-mp4');
const SHEET_N = 12;
const MAX_FRAMES = 900;

let ffmpeg = null;
try {
  execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
  ffmpeg = 'ffmpeg';
} catch {
  console.warn('capture: no ffmpeg on PATH: PNG frames only, no sheet or mp4');
}

async function waitFor(url, ms = 60000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`no server at ${url}`);
}

let server = null;
let base = argValue('--url');
if (!base) {
  base = `http://127.0.0.1:${port}`;
  const vite = await import(pathToFileURL(require.resolve('vite')).href);
  server = await vite.createServer({
    root: PKG,
    configFile: join(PKG, 'vite.config.ts'),
    cacheDir: mkdtempSync(join(tmpdir(), 'pl-capture-vite-')),
    logLevel: 'warn',
    server: { port, strictPort: true, host: '127.0.0.1', hmr: false, watch: null },
  });
  await server.listen();
}

let stopped = false;
const stop = async () => {
  if (stopped || !server) return;
  stopped = true;
  await server.close().catch(() => undefined);
};
process.on('SIGINT', () => {
  void stop().then(() => process.exit(130));
});

try {
  await waitFor(`${base}/gallery.html`);
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  let page = null;
  const open = async (hero) => {
    if (page) await page.close().catch(() => undefined);
    page = await browser.newPage({ viewport: { width: W, height: H + RULER }, deviceScaleFactor: 1 });
    page.on('pageerror', (e) => console.error(`[page] ${e.message}`));
    await page.goto(`${base}/gallery.html?hero=${hero}&tier=${tier}&set=${set}&capture=1&w=${W}&h=${H}${extraQuery ? `&${extraQuery}` : ''}`, { timeout: 180000 });
    await page.waitForFunction(() => window.__animlab?.ready === true, null, { timeout: 180000 });
  };
  for (const hero of heroes) {
    await open(hero);
    const names = await page.evaluate(() => window.__animlab.scenarios());
    const dir = join(OUT, hero);
    mkdirSync(dir, { recursive: true });
    for (const name of names) {
      if (only.length && !only.includes(name)) continue;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await captureOne(hero, name, dir);
          break;
        } catch (err) {
          console.error(`capture: ${hero} ${name} attempt ${attempt + 1} failed: ${err.message}`);
          if (attempt === 2) break;
          await open(hero);
        }
      }
    }
  }
  await browser.close();

  async function captureOne(hero, name, dir) {
      const safe = name.replace(/[^a-z0-9.-]/gi, '_');
      const fdir = join(dir, `.frames-${safe}`);
      rmSync(fdir, { recursive: true, force: true });
      mkdirSync(fdir, { recursive: true });
      await page.evaluate((n) => window.__animlab.start(n), name);
      let f = 0;
      for (; f < MAX_FRAMES; f++) {
        await page.evaluate(() => window.__animlab.step(1));
        await page.screenshot({ path: join(fdir, `f${String(f).padStart(4, '0')}.png`), clip: { x: 0, y: 0, width: W, height: H + RULER }, timeout: 90000 });
        if (await page.evaluate(() => window.__animlab.done())) break;
      }
      const st = await page.evaluate(() => window.__animlab.stats());
      const frames = f + 1;
      if (ffmpeg) {
        // the sheet: SHEET_N frames evenly across the move
        const pick = Array.from({ length: SHEET_N }, (_, i) => Math.round((i * (frames - 1)) / (SHEET_N - 1)));
        const sel = pick.map((i) => `eq(n\\,${i})`).join('+');
        execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', join(fdir, 'f%04d.png'), '-vf', `select='${sel}',scale=${Math.round(W / 2)}:-2,tile=4x3:padding=4:color=0x1d1420`, '-frames:v', '1', '-q:v', '3', join(dir, `${safe}.jpg`)]);
        if (MP4) execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-framerate', '60', '-i', join(fdir, 'f%04d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', join(dir, `${safe}.mp4`)]);
        rmSync(fdir, { recursive: true, force: true });
      }
      const line = { hero, scenario: name, clip: st.clip || (st.legacy ? 'legacy' : ''), contactTick: st.contactTick, eventTick: Number.isFinite(st.eventTick) ? st.eventTick : null, deltaFrames: st.deltaFrames, maxUp: +st.maxUp.toFixed(3), maxFwd: +st.maxFwd.toFixed(3), frames };
      console.log(JSON.stringify(line));
      writeFileSync(join(dir, `${safe}.json`), JSON.stringify(line));
  }
} finally {
  await stop();
}
if (!existsSync(OUT)) process.exit(1);
