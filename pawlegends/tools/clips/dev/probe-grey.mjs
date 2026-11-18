// dev probe: what greys the frame? (load a spec, step to frame F, list full-screen overlays with filters)
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { takeOf, scan, best } from '../scenes.mjs';
import { buildShot } from '../shots.mjs';
const PKG = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const [specFile, id, F] = process.argv.slice(2);
const spec = JSON.parse(readFileSync(specFile, 'utf8')).find((s) => s.id === id);
const fps = 30, N = spec.duration * fps;
const take = takeOf(spec); const sc = await scan(take);
const m = best(sc, spec.start.event, {}); const startTick = Math.max(0, m.tick - Math.round((spec.start.lead ?? 5) * 30));
const shot = buildShot(spec, { fps, N, take, moment: m, startTick, evF: Math.round((m.tick - startTick) / 30 * fps), check: null, scan: sc });
const { createServer } = await import('vite');
const s = await createServer({ root: PKG, configFile: join(PKG, 'vite.config.ts'), cacheDir: join(PKG, 'tools/clips/.vite-cache'), logLevel: 'error', server: { port: 5481, strictPort: true, host: '127.0.0.1', hmr: false, watch: null } });
await s.listen();
const prof = mkdtempSync(join(tmpdir(), 'pl-probe-'));
const { chromium } = await import('@playwright/test');
let ctx;
try {
  ctx = await chromium.launchPersistentContext(prof, { headless: true, viewport: { width: shot.width, height: shot.height }, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
  const page = ctx.pages()[0];
  await page.goto('http://127.0.0.1:5481/tools/clips/harness.html');
  await page.waitForFunction(() => window.__trailer?.ready, null, { timeout: 90000 });
  await page.evaluate((sh) => window.__trailer.load(sh), { ...shot, audio: false });
  for (let k = 0; k <= Number(F); k++) await page.evaluate((k) => window.__trailer.frameA(k, 0), k);
  await page.screenshot({ path: process.argv[5] ?? '/tmp/probe.png' });
  const info = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('*')) {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (r.width < innerWidth * 0.5 || r.height < innerHeight * 0.5) continue;
      if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) continue;
      out.push(`${el.tagName}.${el.className} filter=${cs.filter} bdf=${cs.backdropFilter} bg=${cs.backgroundColor} ${cs.backgroundImage.slice(0, 60)} op=${cs.opacity} mix=${cs.mixBlendMode}`);
    }
    return { out, info: window.__trailer.info() };
  });
  console.log(info.out.join('\n'));
  console.log(JSON.stringify(info.info.heroes.filter((h) => h.kind === 'hero').map((h) => [h.id, h.state])), JSON.stringify(info.info.cam));
} finally { await ctx?.close(); await s.close(); rmSync(prof, { recursive: true, force: true }); }
