#!/usr/bin/env node
/**
 * Renders landing roster portraits (client/public/pawlegends/landing/portrait-<hero>.<hash>.webp, 420 × 574,
 * transparent) from the dev page landing-portrait.html (src/gallery/landingPortrait.ts) with the game's own models.
 *
 *   npm run dev -- --port 5451 &   # any port
 *   node tools/landing-portraits.mjs --url http://localhost:5451 nugget marshmallow bravo chili howler
 *
 * Writes each file under its content hash (sha256, 8 hex) and prints the `P("<hero>", "<hash>")` entries for
 * client/components/pawlegends/landing/roster.ts. Needs `cwebp` (libwebp) on PATH.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { PKG_ROOT } from './lib/sim-bundle.mjs';

const argv = process.argv.slice(2);
const urlAt = argv.indexOf('--url');
const base = urlAt >= 0 ? argv[urlAt + 1] : 'http://localhost:5176';
const heroes = argv.filter((a, i) => !a.startsWith('--') && (urlAt < 0 || i !== urlAt + 1));
const outDir = resolve(PKG_ROOT, '..', 'client', 'public', 'pawlegends', 'landing');
const tmp = mkdtempSync(join(tmpdir(), 'pl-portrait-'));

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 420, height: 574 } });
  for (const hero of heroes) {
    await page.goto(`${base}/landing-portrait.html?hero=${hero}`);
    await page.waitForFunction(() => window.__portrait?.ready, null, { timeout: 60000 });
    const data = await page.evaluate(() => window.__portrait.png());
    const png = join(tmp, `${hero}.png`);
    writeFileSync(png, Buffer.from(data.split(',')[1], 'base64'));
    const webp = join(tmp, `${hero}.webp`);
    execFileSync('cwebp', ['-quiet', '-q', '82', '-alpha_q', '90', '-m', '6', png, '-o', webp]);
    const bytes = readFileSync(webp);
    const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 8);
    writeFileSync(join(outDir, `portrait-${hero}.${hash}.webp`), bytes);
    console.log(`P("${hero}", "${hash}")  ${(bytes.length / 1024).toFixed(1)} KB`);
  }
} finally {
  await browser.close();
}
