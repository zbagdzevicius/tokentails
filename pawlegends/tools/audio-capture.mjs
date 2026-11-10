// Audio pass 2: render the scripted hit sequence (tools/audio-capture/capture.ts) through the game's Sfx with an
// OfflineAudioContext in headless Chromium and write it as a WAV, with the node counts beside it (JSON).
// Usage: node tools/audio-capture.mjs <out.wav> [root, default this package]. Not part of the game bundle.
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const out = path.resolve(process.argv[2] ?? 'test-results/audio/hits.wav');
const root = path.resolve(process.argv[3] ?? path.join(import.meta.dirname, '..'));
const server = await createServer({ root, configFile: path.join(root, 'vite.config.ts'), logLevel: 'error', server: { port: 0, host: '127.0.0.1' } });
await server.listen();
const url = server.resolvedUrls.local[0] + 'tools/audio-capture/index.html';
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  page.on('console', (m) => { if (m.type() === 'error') console.error('[page]', m.text()); });
  await page.goto(url);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120_000 });
  const r = await page.evaluate(() => window.__capture());
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.from(r.wav, 'base64'));
  const meta = { nodes: r.nodes, sources: r.sources, events: r.plays, peak: +r.peak.toFixed(3), rms: +r.rms.toFixed(4) };
  fs.writeFileSync(out.replace(/\.wav$/, '.json'), JSON.stringify(meta, null, 2) + '\n');
  console.log(out, JSON.stringify(meta));
} finally {
  await browser.close();
  await server.close();
}
