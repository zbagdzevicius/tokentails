#!/usr/bin/env node
/**
 * The Geode Job: render the motion-graphics segments of one cut and aspect (mg.js on a canvas in headless Chromium)
 * to RGBA PNG-in-MOV files, one per segment that has graphics. Freeze polaroids use the frozen gameplay frame, taken
 * from the take files first.
 *   node tools/trailers-hq/geode-job/render-mg.mjs --work DIR --cut 30s|60s --aspect h|v|s [--only 3,5] [--lock FILE]
 * DIR holds takes/ (record.mjs output), gem/ (Gemini frames A-F, -h and -v), assets/ (fonts, logo); writes DIR/mg/.
 */
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { argValue } from '../../lib/args.mjs';
import { CUTS, FPS } from './timeline.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORK = resolve(argValue('--work'));
const CUT = argValue('--cut');
const AS = argValue('--aspect');
const ONLY = argValue('--only')?.split(',').map(Number);
const LOCK = argValue('--lock');
const SIZE = { h: [1920, 1080], v: [1080, 1920], s: [1080, 1080] }[AS];
const OUT = join(WORK, 'mg', `${CUT}-${AS}`);
mkdirSync(OUT, { recursive: true });
const { segs, words } = CUTS[CUT];
const takeFile = (id) => join(WORK, 'takes', `${id}-${AS === 'v' ? 'v' : 'h'}.mp4`);
const art = AS === 'v' ? 'v' : 'h';

// jobs
const jobs = [];
const assets = { A: `/w/gem/A-${art}.jpg`, logo: '/w/assets/logo.webp' };
segs.forEach((s, i) => {
  const ws = words.filter((w) => w.at < s.b && w.to > s.a);
  const base = { a: s.a, b: s.b, words: ws, fx: s.fx ?? [], art };
  if (s.kind === 'gem') { assets[s.gem] = `/w/gem/${s.gem}-${art}.jpg`; jobs.push({ i, ...base, kind: 'gem', gem: s.gem, push: s.push, yarn: s.yarn, coins: s.coins, sparkle: s.sparkle, zzz: s.zzz, tunnel: s.tunnel }); }
  else if (s.kind === 'end') { assets.D = `/w/gem/D-${art}.jpg`; jobs.push({ i, ...base, kind: 'end' }); }
  else if (s.kind === 'split') jobs.push({ i, ...base, kind: 'split', cross: s.a + (s.b - s.a === 2 ? 0.8 : 1.4) });
  else if (s.kind === 'freeze') {
    const slot = (s.b - s.a) / s.crew.length, freezeAt = 0.6;
    const keys = s.crew.map(([take, tin], k) => {
      const key = `crew-${CUT}-${AS}-${k}`;
      const png = join(WORK, 'mg', 'stills', `${key}.png`);
      mkdirSync(dirname(png), { recursive: true });
      // the frame on screen at the freeze (the last played frame), cropped to the aspect
      const tt = tin + slot * freezeAt - 1 / FPS;
      const crop = AS === 's' ? ',crop=1080:1080:420:0' : '';
      if (!ONLY || ONLY.includes(i)) execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', tt.toFixed(4), '-i', takeFile(take), '-frames:v', '1', '-vf', `format=rgb24${crop}`, png]);
      assets[key] = `/w/mg/stills/${key}.png`;
      return key;
    });
    jobs.push({ i, ...base, kind: 'freeze', crew: s.crew, freezeAt, crewKeys: keys });
  } else if (ws.length || (s.fx ?? []).length) jobs.push({ i, ...base, kind: 'overlay' });
});
const todo = jobs.filter((j) => !ONLY || ONLY.includes(j.i));

// a static server for the page, the art and the fonts (file:// would taint the canvas)
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.ttf': 'font/ttf' };
const page = `<!doctype html><meta charset=utf-8><style>@font-face{font-family:Rubik;font-weight:900;font-style:italic;src:url(/w/assets/Rubik-BlackItalic.ttf)}@font-face{font-family:Fredoka;font-weight:700;src:url(/w/assets/Fredoka-Bold.ttf)}html,body{margin:0;background:transparent}</style><canvas id=c></canvas><script src=/t/mg.js></script>`;
const server = createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/') return res.writeHead(200, { 'content-type': 'text/html' }), res.end(page);
  const f = u.startsWith('/w/') ? join(WORK, u.slice(3)) : u.startsWith('/t/') ? join(HERE, u.slice(3)) : null;
  if (!f || !existsSync(f)) return res.writeHead(404), res.end();
  res.writeHead(200, { 'content-type': MIME[extname(f)] ?? 'application/octet-stream' });
  res.end(readFileSync(f));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

let browser = null, lockHeld = false;
const profile = mkdtempSync(join(tmpdir(), 'pl-geode-mg-'));
async function cleanup() {
  try { await browser?.close(); } catch { /* closed */ }
  server.close();
  rmSync(profile, { recursive: true, force: true });
  if (lockHeld) rmSync(LOCK, { force: true });
}
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => void cleanup().finally(() => process.exit(130)));
try {
  if (LOCK) {
    for (let i = 0; ; i++) {
      try { writeFileSync(LOCK, `${process.pid} mg ${new Date().toISOString()}\n`, { flag: 'wx' }); lockHeld = true; break; } catch { if (i % 24 === 0) console.error('waiting for lock'); await new Promise((r) => setTimeout(r, 5000)); }
    }
  }
  const { chromium } = await import('playwright');
  browser = await chromium.launchPersistentContext(profile, { headless: true, viewport: { width: 400, height: 300 }, args: ['--use-angle=metal', '--enable-gpu'] });
  const pg = browser.pages()[0] ?? (await browser.newPage());
  await pg.goto(`http://127.0.0.1:${port}/`);
  const fonts = await pg.evaluate((o) => window.__mg.setup(o), { W: SIZE[0], H: SIZE[1], assets });
  if (!fonts.rubik || !fonts.fredoka) throw new Error(`fonts not loaded ${JSON.stringify(fonts)}`);
  for (const j of todo) {
    const out = join(OUT, `seg${String(j.i).padStart(2, '0')}.mov`);
    const N = Math.round((j.b - j.a) * FPS);
    const ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-', ...(j.kind === 'gem' || j.kind === 'end' ? ['-c:v', 'libx264', '-preset', 'medium', '-crf', '6', '-pix_fmt', 'yuv420p', '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709'] : ['-c:v', 'png', '-pix_fmt', 'rgba']), out], { stdio: ['pipe', 'inherit', 'inherit'] });
    const done = new Promise((r, x) => ff.on('close', (c) => (c ? x(new Error(`ffmpeg ${c}`)) : r())));
    for (let f = 0; f < N; f++) {
      const url = await pg.evaluate(([job, t]) => window.__mg.frame(job, t), [j, j.a + f / FPS]);
      const buf = Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
      if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    }
    ff.stdin.end();
    await done;
    console.log(`${CUT}-${AS} seg${j.i} ${j.kind} ${N} frames`);
  }
  writeFileSync(join(OUT, 'jobs.json'), JSON.stringify(jobs.map(({ i, kind, a, b }) => ({ i, kind, a, b })), null, 1));
} finally {
  await cleanup();
}
