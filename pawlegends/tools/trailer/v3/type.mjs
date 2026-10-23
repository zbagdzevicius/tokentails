#!/usr/bin/env node
/**
 * Trailer v3 type pass: renders the overlay (type and end card, transparent PNG) of every frame that draws anything,
 * per cut and aspect, after the copy gate.
 *
 *   node tools/trailer/v3/type.mjs --out DIR/mg
 *
 * Writes DIR/mg/<cut>/<aspect>/fNNNN.png (the cut's frame numbers) and DIR/mg/manifest.json (frames and the text
 * boxes per frame, for the type-vs-hero QC).
 */
import { createReadStream, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { argValue } from '../../lib/args.mjs';
import { lintTrailerCopy } from '../lint-copy.mjs';
import { ASPECTS, CUTS, endCard, typeEls } from './timeline.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = resolve(HERE, '..', '..', '..');
const require = createRequire(join(PKG, 'package.json'));
const { chromium } = require('@playwright/test');
const OUT = resolve(argValue('--out') ?? join(HERE, '..', 'out', 'v3', 'mg'));

// v3.3 `--copy FILE --lint-target client`: the landing-only variant (its own strings, linted as client copy)
const copy = JSON.parse(readFileSync(argValue('--copy') ? resolve(argValue('--copy')) : join(HERE, 'copy.json'), 'utf8'));
const lint = lintTrailerCopy(copy, argValue('--lint-target') ?? 'pawlegends');
if (lint.findings.length) {
  for (const f of lint.findings) console.error(`  ${f.id}: ${f.rule} ${f.message}`);
  console.error(`[type] copy gate failed (${lint.findings.length} findings): nothing rendered`);
  process.exit(1);
}
console.log(`[type] copy gate: ${lint.lines} lines, 0 findings`);

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.woff2': 'font/woff2' };
const ROOTS = { '/pkg/': PKG, '/v3/': HERE };
const server = createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const prefix = Object.keys(ROOTS).find((p) => url.startsWith(p));
  if (!prefix) return res.writeHead(404).end();
  const path = normalize(join(ROOTS[prefix], url.slice(prefix.length)));
  if (!path.startsWith(ROOTS[prefix]) || !existsSync(path) || statSync(path).isDirectory()) return res.writeHead(404).end();
  res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
  createReadStream(path).pipe(res);
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
const manifest = { copyLint: { lines: lint.lines, findings: 0 }, cuts: {} };
try {
  for (const cut of ['30', '15']) {
    manifest.cuts[cut] = {};
    for (const aspect of Object.keys(ASPECTS)) {
      const { W, H } = ASPECTS[aspect];
      const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
      page.on('pageerror', (e) => console.error(`[type] page error: ${e.message}`));
      await page.goto(`${base}/v3/type.html`);
      if (!(await page.evaluate((o) => window.mgInit(o), { cut, aspect, copy }))) throw new Error('Fredoka did not load');
      const dir = join(OUT, cut, aspect);
      // a clean folder: an overlay frame left from an earlier timeline would be laid over the new cut
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true });
      const els = typeEls(cut, aspect, copy);
      const live = new Set();
      for (const e of els) for (let f = e.in; f < e.out + 8; f++) live.add(f);
      for (let f = endCard(cut).logo; f < CUTS[cut]; f++) live.add(f);
      const frames = [...live].sort((a, b) => a - b);
      const boxes = {};
      for (const f of frames) {
        const data = await page.evaluate((x) => window.mgFrame(x), f);
        writeFileSync(join(dir, `f${String(f).padStart(4, '0')}.png`), Buffer.from(data.slice(data.indexOf(',') + 1), 'base64'));
        boxes[f] = await page.evaluate((x) => window.mgBoxes(x), f);
      }
      manifest.cuts[cut][aspect] = { frames: frames.length, boxes };
      console.log(`[type] ${cut}s ${aspect}: ${frames.length} overlay frames`);
      await page.close();
    }
  }
} finally {
  await browser.close();
  server.close();
}
writeFileSync(join(OUT, 'manifest.json'), `${JSON.stringify(manifest)}\n`);
