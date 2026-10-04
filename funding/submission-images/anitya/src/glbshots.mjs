// Renders extra views of the exported Anitya GLB worlds through the exporter's own preview().
// node glbshots.mjs <outdir> <jobs.json>   jobs: [{world, name, opts}]
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const HEIST = '/Users/zygimantasbagdzevicius/me/tokentails-app/catnip-heist';
const require = createRequire(HEIST + '/package.json');
const { createServer } = await import(require.resolve('vite'));
const { chromium } = require('playwright');
const [outDir, jobsFile] = process.argv.slice(2);
const jobs = JSON.parse(fs.readFileSync(jobsFile, 'utf8'));
fs.mkdirSync(outDir, { recursive: true });
const server = await createServer({ root: HEIST, configFile: HEIST + '/vite.config.ts', logLevel: 'warn',
  server: { host: '127.0.0.1', port: 5291, strictPort: false, hmr: false } });
await server.listen();
const url = server.resolvedUrls.local[0];
const EXE = '/Users/zygimantasbagdzevicius/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  await page.goto(`${url}tools/export-glb.html`);
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 90_000 });
  const cache = {};
  for (const j of jobs) {
    cache[j.world] ??= fs.readFileSync(path.join(HEIST, 'export/anitya/worlds', j.world + '.glb')).toString('base64');
    const res = await page.evaluate(([b, o]) => window.__export.preview(b, o), [cache[j.world], j.opts]);
    fs.writeFileSync(path.join(outDir, j.name + '.png'), Buffer.from(res.png, 'base64'));
    console.log('ok', j.name);
  }
} finally {
  await browser.close();
  await server.close();
}
