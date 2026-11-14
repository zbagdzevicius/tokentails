// gaps3 coat-fx: stills and short animations of every themed coat's Ultimate, Recall and Takedown, plus the shared
// Rare set, in the real skill preview (pawlegends/skill-preview.html, dev only), and an A/B frame-cost check.
// Not part of any bundle.
//
// 1. cd pawlegends && npx vite --port 5392 --strictPort --host 127.0.0.1
// 2. node docs/plans/moba/coat-fx/capture.mjs http://127.0.0.1:5392 <out dir>
//    env: TIER (low|med, default med), ONLY=<coat-name> one coat, PERF=0 skips the A/B, GPU=1 (Metal, headed),
//    KEEP=<dir> also keeps every frame PNG there.
// Writes <out>/<coat>-<clip>.webp (the busiest frame) and <out>/<coat>-<clip>-anim.webp (8 frames), prints JSON.
// One browser profile (Playwright's own temporary one), removed by browser.close() in finally and on SIGINT/SIGTERM;
// the frame PNGs go to one temp folder, deleted the same way.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const req = createRequire(new URL('../../../../pawlegends/package.json', import.meta.url));
const { chromium } = req('@playwright/test');

const [base = 'http://127.0.0.1:5392', outDir = 'docs/plans/moba/coat-fx/out'] = process.argv.slice(2);
const TIER = process.env.TIER ?? 'med';
fs.mkdirSync(outDir, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pl-coat-fx-'));

const COATS = [
  { name: 'thunderpaw', hero: 'brutus', coat: 'coat.brutus.store_thunderpaw' },
  { name: 'sunforged', hero: 'clem', coat: 'coat.clem.s1_sunforged' },
  { name: 'bloomtail', hero: 'sage', coat: 'coat.sage.store_bloomtail', ultAt: 1.55 },
  { name: 'eclipse', hero: 'duchess', coat: 'coat.duchess.s1_eclipse' },
  { name: 'moonwhisker', hero: 'pixel', coat: 'coat.pixel.store_moonwhisker' },
  { name: 'frostbell', hero: 'marshmallow', coat: 'coat.marshmallow.store_frostbell' },
  { name: 'rare-calico', hero: 'clem', coat: 'coat.clem.store_calico' },
];
/** Each clip: where to start (s) and the gap between the 8 frames (s). Recall lands at ~4.6 s; takedown ~1.4-1.8 s. */
const CLIPS = [
  { clip: 'ult', q: '', at: 0.62, step: 0.1 },
  // (per coat `ultAt` overrides the ultimate's start)
  { clip: 'recall', q: '&clip=recall', at: 4.45, step: 0.1, nap: 2.2 },
  { clip: 'takedown', q: '&clip=takedown', at: 1.25, step: 0.12 },
];
const W = Number(process.env.W ?? 640);
const H = Number(process.env.H ?? 420);

let browser = null;
const cleanup = async () => {
  try {
    await browser?.close();
  } catch {}
  fs.rmSync(tmp, { recursive: true, force: true });
};
process.on('SIGINT', () => void cleanup().then(() => process.exit(130)));
process.on('SIGTERM', () => void cleanup().then(() => process.exit(143)));

const out = { tier: TIER, shots: [], perf: [], errors: [] };
try {
  browser = await chromium.launch(process.env.GPU === '1' ? { headless: false, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] } : { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const open = async (hero, q, w, h, tier) => {
    const page = await browser.newPage({ viewport: { width: Math.max(900, w + 120), height: Math.max(600, h + 160) } });
    page.on('pageerror', (e) => out.errors.push(`${hero}${q}: ${e}`));
    await page.goto(`${base}/skill-preview.html?hero=${hero}&slot=r&tier=${tier}&w=${w}&h=${h}&capture=1${q}`);
    await page.waitForFunction(() => window.__preview, null, { timeout: 120000 });
    await page.evaluate(() => window.__preview.ready);
    return page;
  };
  for (const c of COATS.filter((x) => !process.env.ONLY || x.name === process.env.ONLY)) {
    for (const k of CLIPS) {
      const page = await open(c.hero, `&coat=${c.coat}${k.q}`, W, H, TIER);
      const box = await page.locator('#box').boundingBox();
      const frames = [];
      let t = 0;
      if (k.nap) {
        await page.evaluate((s) => window.__preview.advance(s), k.nap);
        t = k.nap;
        const png = path.join(tmp, `${c.name}-${k.clip}-nap.png`);
        await page.screenshot({ path: png, clip: box, timeout: 180000 });
        frames.push(png);
      }
      // a hero whose ultimate winds up (Sage) casts later
      const at = k.clip === 'ult' && c.ultAt ? c.ultAt : k.at;
      await page.evaluate((s) => window.__preview.advance(s), at - t);
      for (let i = 0; i < 8; i++) {
        const png = path.join(tmp, `${c.name}-${k.clip}-${i}.png`);
        await page.screenshot({ path: png, clip: box, timeout: 180000 });
        frames.push(png);
        await page.evaluate((s) => window.__preview.advance(s), k.step);
      }
      if (process.env.KEEP) for (const f of frames) fs.copyFileSync(f, path.join(process.env.KEEP, path.basename(f)));
      const stats = await page.evaluate(() => window.__preview.stats());
      const busy = frames.slice(k.nap ? 1 : 0).reduce((a, b) => (fs.statSync(b).size > fs.statSync(a).size ? b : a));
      const still = path.join(outDir, `${c.name}-${k.clip}.webp`);
      execFileSync('cwebp', ['-quiet', '-q', '78', busy, '-o', still]);
      const anim = path.join(outDir, `${c.name}-${k.clip}-anim.webp`);
      execFileSync('img2webp', ['-loop', '0', '-lossy', '-q', '50', '-d', '160', ...frames, '-o', anim], { stdio: 'ignore' });
      if (k.nap) execFileSync('cwebp', ['-quiet', '-q', '78', frames[0], '-o', path.join(outDir, `${c.name}-nap.webp`)]);
      out.shots.push({ coat: c.name, clip: k.clip, still, lands: stats.lands, kb: Math.round((fs.statSync(still).size + fs.statSync(anim).size) / 1024) });
      await page.close();
    }
  }
  if (process.env.PERF !== '0') {
    // A/B on the phone tier: the same ultimate clip in the classic look and in each Legendary coat, 8 s each
    for (const c of COATS.slice(0, 3)) {
      const runs = { plain: [], coat: [] };
      for (let r = 0; r < 2; r++)
        for (const which of r % 2 === 0 ? ['plain', 'coat'] : ['coat', 'plain']) {
          const page = await open(c.hero, which === 'coat' ? `&coat=${c.coat}` : '', 480, 300, 'low');
          await page.evaluate(() => window.__preview.advance(2));
          await page.evaluate(() => window.__preview.advance(8));
          runs[which].push((await page.evaluate(() => window.__preview.stats())).avgMs);
          await page.close();
        }
      const mean = (a) => a.reduce((n, x) => n + x, 0) / a.length;
      out.perf.push({ coat: c.name, plainAvgMs: +mean(runs.plain).toFixed(3), coatAvgMs: +mean(runs.coat).toFixed(3) });
    }
  }
} finally {
  await cleanup();
}
console.log(JSON.stringify(out, null, 1));
