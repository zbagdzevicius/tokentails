#!/usr/bin/env node
// Catnip Heist showreel renderer.
//
//   node render.mjs                     full render: out/frames/0000..0899.png -> out/showreel.mp4
//   node render.mjs --step 30           every 30th frame (0.5 s) -> out/preview.mp4 (quick look)
//   node render.mjs --from 3.75 --to 7.5  a range (seconds, [from, to)) -> out/preview.mp4
//   node render.mjs --contact           out/contact.png: grid of every 0.25 s frame, timecode labels
//   node render.mjs --verify            determinism check (same t twice, two pages) + exit
//   node render.mjs --serve [port]      static server for the realtime preview (index.html?play=1)
//
// Other flags: --workers N (parallel pages, default 6), --mb N (motion-blur sub-samples),
//   --no-video, --strict (fail on scene errors), --clean (wipe out/frames first), --crf N,
//   --quiet. Frame files are always named by their global index (60 fps), so partial renders
//   refresh just those frames.

import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, 'out');
const FRAMES = path.join(OUT, 'frames');
const FFMPEG = fs.existsSync('/opt/homebrew/bin/ffmpeg') ? '/opt/homebrew/bin/ffmpeg' : 'ffmpeg';
const FPS = 60, DURATION = 15, TOTAL = FPS * DURATION;
const FONT = ['/System/Library/Fonts/Menlo.ttc', '/System/Library/Fonts/SFNSMono.ttf', '/Library/Fonts/Arial.ttf'].find((f) => fs.existsSync(f));

// ------------------------------------------------------------------ args
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] != null && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const args = {
  from: +opt('from', 0), to: +opt('to', DURATION), step: Math.max(1, +opt('step', 1) | 0),
  contact: flag('contact'), verify: flag('verify'), serve: flag('serve'), port: +opt('serve', 0) || 8123,
  workers: Math.max(1, +opt('workers', Math.min(6, Math.max(2, Math.floor(os.cpus().length / 2)))) | 0),
  mb: +opt('mb', 0) | 0, noVideo: flag('no-video'), strict: flag('strict'), clean: flag('clean'),
  crf: +opt('crf', 16), quiet: flag('quiet'),
};
const log = (...a) => console.log(...a);

// ------------------------------------------------------------------ static server (+ PUT /__out/*)
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.mp4': 'video/mp4', '.md': 'text/markdown; charset=utf-8' };
function startServer(port = 0) {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x');
      let p = decodeURIComponent(url.pathname);
      if (req.method === 'PUT' && p.startsWith('/__out/')) {
        const dest = path.join(OUT, p.slice('/__out/'.length));
        if (!dest.startsWith(OUT + path.sep)) { res.writeHead(403).end(); return; }
        const chunks = []; for await (const c of req) chunks.push(c);
        await fsp.mkdir(path.dirname(dest), { recursive: true });
        await fsp.writeFile(dest, Buffer.concat(chunks));
        res.writeHead(200).end('ok'); return;
      }
      if (p.endsWith('/')) p += 'index.html';
      const file = path.join(ROOT, p);
      if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
      let st; try { st = await fsp.stat(file); } catch { res.writeHead(404).end('not found'); return; }
      if (st.isDirectory()) { res.writeHead(404).end(); return; }
      const headers = { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store', 'Accept-Ranges': 'bytes' };
      const range = req.headers.range && /bytes=(\d*)-(\d*)/.exec(req.headers.range);
      if (range) {
        const start = range[1] ? +range[1] : 0, end = range[2] ? Math.min(+range[2], st.size - 1) : st.size - 1;
        res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1 });
        if (req.method === 'HEAD') return res.end();
        fs.createReadStream(file, { start, end }).pipe(res); return;
      }
      res.writeHead(200, { ...headers, 'Content-Length': st.size });
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(file).pipe(res);
    } catch (e) { res.writeHead(500).end(String(e)); }
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

// ------------------------------------------------------------------ helpers
const pad = (i) => String(i).padStart(4, '0');
const tOf = (i) => i / FPS;
function run(cmd, a) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, a, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = ''; p.stderr.on('data', (d) => (err += d));
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}\n${err.slice(-2000)}`))));
  });
}
const fmtTime = (ms) => (ms < 60000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.floor(ms / 60000)}m${Math.round((ms % 60000) / 1000)}s`);

async function openPage(browser, base, mb) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  await page.goto(`${base}/index.html?render=1${mb ? `&mb=${mb}` : ''}`);
  await page.waitForFunction(() => window.__ready !== undefined);
  const info = await page.evaluate(() => window.__ready);
  return { page, info, logs };
}

// Link a set of frame files into a temp dir as a 0-based sequence (for ffmpeg image2).
async function sequence(dir, frames) {
  await fsp.rm(dir, { recursive: true, force: true });
  await fsp.mkdir(dir, { recursive: true });
  let k = 0;
  for (const i of frames) {
    const src = path.join(FRAMES, `${pad(i)}.png`);
    if (!fs.existsSync(src)) continue;
    await fsp.symlink(src, path.join(dir, `${pad(k++)}.png`));
  }
  return k;
}

// Launch Playwright's bundled chromium; if that exact build isn't downloaded (offline machine),
// fall back to the newest chrome-headless-shell / chromium already in the ms-playwright cache.
// Override with CHROME_PATH=/path/to/chrome.
async function launchBrowser(o) {
  if (process.env.CHROME_PATH) return chromium.launch({ ...o, executablePath: process.env.CHROME_PATH });
  try { return await chromium.launch(o); } catch (e) {
    if (!/Executable doesn't exist/.test(e.message)) throw e;
    const cache = process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(os.homedir(), 'Library/Caches/ms-playwright');
    const cands = [];
    for (const d of fs.existsSync(cache) ? fs.readdirSync(cache) : []) {
      const m = /^chromium(_headless_shell)?-(\d+)$/.exec(d); if (!m) continue;
      const dir = path.join(cache, d);
      for (const sub of fs.readdirSync(dir)) {
        const exe = m[1]
          ? path.join(dir, sub, 'chrome-headless-shell')
          : path.join(dir, sub, 'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
        if (fs.existsSync(exe)) cands.push({ exe, rev: +m[2], shell: !!m[1] });
      }
    }
    cands.sort((a, b) => b.rev - a.rev || b.shell - a.shell);
    if (!cands.length) throw e;
    if (!args.quiet) log(`  (bundled chromium not installed; using ${path.relative(cache, cands[0].exe)})`);
    return chromium.launch({ ...o, executablePath: cands[0].exe });
  }
}

// ------------------------------------------------------------------ main
async function main() {
  const server = await startServer(args.serve ? args.port : 0);
  const base = `http://127.0.0.1:${server.address().port}`;
  if (args.serve) {
    log(`serving ${ROOT}\n  preview:  ${base}/index.html?play=1\n  one frame: ${base}/index.html?t=5.0\n  (ctrl-c to stop)`);
    return;
  }
  const t0 = Date.now();
  await fsp.mkdir(FRAMES, { recursive: true });
  if (args.clean) { for (const f of await fsp.readdir(FRAMES)) await fsp.rm(path.join(FRAMES, f)); }

  const fStart = Math.max(0, Math.round(args.from * FPS)), fEnd = Math.min(TOTAL, Math.round(args.to * FPS));
  const want = new Set();
  if (!args.verify) for (let i = fStart; i < fEnd; i += args.step) want.add(i);
  const contactFrames = [];
  if (args.contact) for (let i = Math.ceil(fStart / 15) * 15; i < fEnd; i += 15) { contactFrames.push(i); want.add(i); }
  const contactOnly = args.contact && !['--step', '--from', '--to'].some((f) => argv.includes(f));
  if (contactOnly) {
    // --contact alone renders just the contact frames
    want.clear(); contactFrames.forEach((i) => want.add(i));
  }
  const frames = [...want].sort((a, b) => a - b);
  const full = fStart === 0 && fEnd === TOTAL && args.step === 1 && !args.verify && frames.length === TOTAL;

  const browser = await launchBrowser({
    headless: true,
    args: ['--force-color-profile=srgb', '--disable-gpu', '--font-render-hinting=none', '--disable-lcd-text', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'],
  });
  let exitCode = 0;
  try {
    const nWorkers = args.verify ? 2 : Math.max(1, Math.min(args.workers, Math.ceil(frames.length / 8)));
    const workers = await Promise.all(Array.from({ length: nWorkers }, () => openPage(browser, base, args.mb)));
    const info = workers[0].info;
    log(`scenes: ${info.scenes.map((s) => `${s.name}[${s.start.toFixed(3)}-${s.end.toFixed(3)}]${s.broken ? '!BROKEN' : ''}`).join(' ') || 'none'}`);
    log(`assets: ${info.clips.length} clips, ${info.cats} cats, ${info.dogs} dogs, images [${info.images.join(', ')}], font "${info.font}", ${info.cues} cues${info.cuesSynthetic ? ' (synthetic)' : ''}, audio ${info.audio ? 'yes' : 'no'}`);
    for (const w of info.warnings) log(`  warn: ${w}`);

    if (args.verify) {
      const ts = [0, 1.875, 3.9, 5.5, 7.6, 9.4, 11.3, 13.2, 14.99, 14.9833];
      const [a, b] = workers;
      let ok = true;
      for (const t of ts) {
        const h1 = await a.page.evaluate((t) => window.__hash(t), t);
        await a.page.evaluate((t) => window.__hash(t), (t + 7.3) % 15); // disturb caches/state
        const h2 = await a.page.evaluate((t) => window.__hash(t), t);
        const h3 = await b.page.evaluate((t) => window.__hash(t), t);
        const same = h1 === h2 && h2 === h3;
        ok &&= same;
        log(`  t=${t.toFixed(4)}  ${h1.slice(0, 16)}  ${same ? 'deterministic' : `MISMATCH ${h2.slice(0, 16)} ${h3.slice(0, 16)}`}`);
      }
      log(ok ? 'verify: OK (same t -> same pixels, across re-renders and pages)' : 'verify: FAILED');
      exitCode = ok ? 0 : 1;
      return;
    }

    // contiguous chunks per worker (clip frame cache locality)
    const chunks = Array.from({ length: nWorkers }, (_, k) => frames.slice(Math.floor((k * frames.length) / nWorkers), Math.floor(((k + 1) * frames.length) / nWorkers)));
    let done = 0, bytes = 0;
    const tr = Date.now();
    const progress = () => {
      if (args.quiet) return;
      const el = Date.now() - tr, eta = done ? (el / done) * (frames.length - done) : 0;
      process.stdout.write(`\r  rendering ${done}/${frames.length}  ${(done / Math.max(0.001, el / 1000)).toFixed(1)} fps  eta ${fmtTime(eta)}   `);
    };
    await Promise.all(workers.map(async (w, k) => {
      for (const i of chunks[k]) {
        bytes += await w.page.evaluate(([t, url]) => window.__renderTo(t, url), [tOf(i), `${base}/__out/frames/${pad(i)}.png`]);
        done++; progress();
      }
    }));
    if (!args.quiet) process.stdout.write('\n');
    log(`rendered ${frames.length} frames in ${fmtTime(Date.now() - tr)} (${nWorkers} workers, avg ${(bytes / frames.length / 1024).toFixed(0)} KB/png)`);

    const errs = new Set();
    for (const w of workers) {
      const inf = await w.page.evaluate(() => window.__info());
      inf.errors.forEach((e) => errs.add(e));
      w.logs.filter((l) => l.includes('pageerror')).forEach((l) => errs.add(l));
    }
    if (errs.size) { log(`scene errors (${errs.size}):`); for (const e of errs) log(`  ${e}`); if (args.strict) exitCode = 2; }
  } finally {
    await browser.close();
    server.close();
  }
  if (args.verify || exitCode === 2) process.exit(exitCode);

  const audio = path.join(ROOT, 'assets/audio/track.wav');
  const hasAudio = fs.existsSync(audio);
  // ---------------- video
  if (!args.noVideo && frames.length > 1 && !contactOnly) {
    const color = ['-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709'];
    if (full) {
      const missing = []; for (let i = 0; i < TOTAL; i++) if (!fs.existsSync(path.join(FRAMES, `${pad(i)}.png`))) missing.push(i);
      if (missing.length) throw new Error(`missing ${missing.length} frames, e.g. ${missing.slice(0, 5)}`);
      const out = path.join(OUT, 'showreel.mp4');
      const a = ['-y', '-framerate', String(FPS), '-start_number', '0', '-i', path.join(FRAMES, '%04d.png')];
      if (hasAudio) a.push('-i', audio);
      a.push('-map', '0:v'); if (hasAudio) a.push('-map', '1:a');
      a.push('-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', String(args.crf), '-pix_fmt', 'yuv420p', '-r', String(FPS), ...color, '-frames:v', String(TOTAL));
      if (hasAudio) a.push('-c:a', 'aac', '-b:a', '320k', '-ar', '48000');
      a.push('-movflags', '+faststart', out);
      const te = Date.now(); await run(FFMPEG, a);
      log(`video: ${path.relative(process.cwd(), out)} (${(fs.statSync(out).size / 1048576).toFixed(1)} MB, encode ${fmtTime(Date.now() - te)})${hasAudio ? '' : ' [no audio: assets/audio/track.wav missing]'}`);
    } else {
      const seqDir = path.join(OUT, '.seq');
      const vidFrames = frames.filter((i) => (i - fStart) % args.step === 0);
      const n = await sequence(seqDir, vidFrames);
      const out = path.join(OUT, 'preview.mp4');
      const rate = FPS / args.step;
      const a = ['-y', '-framerate', String(rate), '-i', path.join(seqDir, '%04d.png')];
      if (hasAudio) a.push('-ss', String(fStart / FPS), '-t', String((n * args.step) / FPS), '-i', audio);
      a.push('-map', '0:v'); if (hasAudio) a.push('-map', '1:a');
      a.push('-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-r', String(Math.max(rate, 24)), ...color);
      if (hasAudio) a.push('-c:a', 'aac', '-b:a', '192k');
      a.push('-movflags', '+faststart', out);
      await run(FFMPEG, a);
      await fsp.rm(seqDir, { recursive: true, force: true });
      log(`preview: ${path.relative(process.cwd(), out)} (${n} frames @ ${rate} fps, from ${(fStart / FPS).toFixed(3)}s)`);
    }
  }
  // ---------------- contact sheet
  if (args.contact && contactFrames.length) {
    const dir = path.join(OUT, '.contact');
    const n = await sequence(dir, contactFrames);
    const cols = Math.min(10, n), rows = Math.ceil(n / cols);
    const offset = contactFrames[0] / FPS;
    const draw = FONT
      ? `,drawtext=fontfile=${FONT}:text='%{pts\\:hms}  f%{eif\\:n*15+${contactFrames[0]}\\:d}  b%{eif\\:floor(t/0.46875+0.000001)+1\\:d}':x=8:y=8:fontsize=18:fontcolor=white:box=1:boxcolor=black@0.65:boxborderw=5`
      : '';
    const out = path.join(OUT, 'contact.png');
    await run(FFMPEG, ['-y', '-framerate', '4', '-i', path.join(dir, '%04d.png'),
      '-vf', `setpts=PTS+${offset}/TB,scale=384:216:flags=area${draw},tile=${cols}x${rows}:padding=4:margin=4:color=0x181018`,
      '-frames:v', '1', '-update', '1', out]);
    await fsp.rm(dir, { recursive: true, force: true });
    log(`contact: ${path.relative(process.cwd(), out)} (${n} frames, ${cols}x${rows}, every 0.25s)`);
  }
  log(`total ${fmtTime(Date.now() - t0)}`);
  process.exit(exitCode);
}

main().catch((e) => { console.error(e); process.exit(1); });
