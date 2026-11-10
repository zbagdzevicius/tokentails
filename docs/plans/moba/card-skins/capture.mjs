// CARD-SKINS.md: tier screenshots and an A/B frame-cost check of the skin-effect kit in the real skill preview
// (pawlegends/skill-preview.html, dev only). Not part of any bundle.
//
// 1. cd pawlegends && npx vite --port 5391 --strictPort --host 127.0.0.1
// 2. node docs/plans/moba/card-skins/capture.mjs http://127.0.0.1:5391 docs/plans/moba/card-skins
//    env: GPU=1 (Metal ANGLE, headed) for real draw costs, else SwiftShader; SHOTS=0 skips the screenshots;
//    PERF=0 skips the A/B; PAIRS / ROUNDS trim it; TIER (low|med, default low = what phones play).
// Writes <out>/<tier-name>.webp (one still per tier) and <out>/<tier-name>-anim.webp (6 frames), and prints JSON.
// Playwright's own temporary browser profile is removed by browser.close() (in finally, and on SIGINT / SIGTERM).
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const req = createRequire(new URL('../../../../pawlegends/package.json', import.meta.url));
const { chromium } = req('@playwright/test');

const [base = 'http://127.0.0.1:5391', outDir = 'docs/plans/moba/card-skins'] = process.argv.slice(2);
const TIER = process.env.TIER ?? 'low';
fs.mkdirSync(outDir, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pl-card-skins-'));

/** One clip per rung: hero, slot, and the look (coat id or demo card). */
const LOOKS = [
  { name: 'common', hero: 'clem', slot: 'r', q: '' },
  { name: 'rare', hero: 'clem', slot: 'r', q: '&coat=coat.clem.store_calico' },
  { name: 'epic', hero: 'pixel', slot: 'r', q: '&coat=coat.pixel.store_moonwhisker' },
  { name: 'legendary', hero: 'clem', slot: 'r', q: '&coat=coat.clem.s1_sunforged' },
  { name: 'legendary-thunderpaw', hero: 'brutus', slot: 'r', q: '&coat=coat.brutus.store_thunderpaw' },
  { name: 'awakened', hero: 'clem', slot: 'r', q: '&card=ficus&bond=30' },
];

let browser = null;
const cleanup = async () => {
  try {
    await browser?.close();
  } catch {}
  fs.rmSync(tmp, { recursive: true, force: true });
};
process.on('SIGINT', () => void cleanup().then(() => process.exit(130)));
process.on('SIGTERM', () => void cleanup().then(() => process.exit(143)));

const out = { tier: TIER, gpu: process.env.GPU === '1', shots: [], perf: [], errors: [] };
try {
  browser = await chromium.launch(process.env.GPU === '1' ? { headless: false, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] } : { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const open = async (l, w, h, tier) => {
    const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
    page.on('pageerror', (e) => out.errors.push(`${l.name}: ${e}`));
    await page.goto(`${base}/skill-preview.html?hero=${l.hero}&slot=${l.slot}&tier=${tier}&w=${w}&h=${h}&capture=1${l.q}`);
    await page.waitForFunction(() => window.__preview, null, { timeout: 120000 });
    await page.evaluate(() => window.__preview.ready);
    return page;
  };

  if (process.env.SHOTS !== '0') {
    for (const l of LOOKS) {
      const page = await open(l, 360, 240, 'med');
      const box = await page.locator('#box').boundingBox();
      const frames = [];
      // the clip: the cast (0.6 s) and its hits; 6 frames 0.15 s apart from 0.65 s
      await page.evaluate(() => window.__preview.advance(0.65));
      for (let i = 0; i < 6; i++) {
        const png = path.join(tmp, `${l.name}-${i}.png`);
        await page.screenshot({ path: png, clip: box, timeout: 180000 });
        frames.push(png);
        await page.evaluate(() => window.__preview.advance(0.15));
      }
      const still = path.join(outDir, `${l.name}.webp`);
      execFileSync('cwebp', ['-quiet', '-q', '70', frames[2], '-o', still]);
      const anim = path.join(outDir, `${l.name}-anim.webp`);
      execFileSync('img2webp', ['-loop', '0', '-lossy', '-q', '55', '-d', '200', ...frames, '-o', anim], { stdio: 'ignore' });
      out.shots.push({ name: l.name, still, anim, kb: Math.round((fs.statSync(still).size + fs.statSync(anim).size) / 1024) });
      await page.close();
    }
  }

  if (process.env.PERF !== '0') {
    // A/B: the same clip with no look and with each Legendary look; 3 rounds, 8 s of clip each, alternating order
    const pairs = [
      ['clem', 'r', '', 'coat.clem.s1_sunforged'],
      ['brutus', 'r', '', 'coat.brutus.store_thunderpaw'],
      ['clem', 'q', '', '&card=ficus&bond=30'],
    ];
    for (const [hero, slot, , look] of pairs.slice(0, Number(process.env.PAIRS ?? pairs.length))) {
      const q = look.startsWith('&') ? look : `&coat=${look}`;
      const runs = { plain: [], skin: [] };
      for (let r = 0; r < Number(process.env.ROUNDS ?? 3); r++) {
        for (const which of r % 2 === 0 ? ['plain', 'skin'] : ['skin', 'plain']) {
          const page = await open({ name: `${hero}-${which}`, hero, slot, q: which === 'skin' ? q : '' }, 480, 300, TIER);
          await page.evaluate(() => window.__preview.advance(2)); // warm up (programs, pools)
          const t0 = Date.now();
          await page.evaluate(() => window.__preview.advance(8));
          const wall = Date.now() - t0;
          const s = await page.evaluate(() => window.__preview.stats());
          runs[which].push({ avgMs: s.avgMs, maxMs: s.maxMs, wallPerFrame: wall / (8 * 30) });
          await page.close();
        }
      }
      const mean = (a, k) => a.reduce((n, x) => n + x[k], 0) / a.length;
      out.perf.push({
        clip: `${hero} ${slot}`,
        look,
        plainAvgMs: +mean(runs.plain, 'avgMs').toFixed(3),
        skinAvgMs: +mean(runs.skin, 'avgMs').toFixed(3),
        deltaMs: +(mean(runs.skin, 'avgMs') - mean(runs.plain, 'avgMs')).toFixed(3),
        plainMaxMs: +Math.max(...runs.plain.map((x) => x.maxMs)).toFixed(2),
        skinMaxMs: +Math.max(...runs.skin.map((x) => x.maxMs)).toFixed(2),
      });
    }
  }
} finally {
  await cleanup();
}
console.log(JSON.stringify(out, null, 1));
