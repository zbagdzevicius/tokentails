#!/usr/bin/env node
/**
 * Trailer "Wild Rivals" edit: one cut (30 or 60) in one aspect (h 16:9 1920x1080, v 9:16 1080x1920, s 1:1 1080x1080)
 * per call. One ffmpeg pass: the native takes of that aspect, cut frame-exact by the timeline (no scaling, no punch-in,
 * no grade, no grain), with the motion graphics (mg.js, drawn frame by frame in a headless browser, transparent PNGs
 * piped in) overlaid, encoded straight to the master (x264 High CRF 12, tools/clips/encode.mjs) with the score; then the
 * web copy from the master and a poster.
 *
 *   node tools/wildrivals/edit.mjs --cut 30 --aspect h --takes DIR --gem DIR --fonts DIR --logo PNG --audio DIR --out DIR [--lock FILE]
 */
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { argValue } from '../lib/args.mjs';
import { AUDIO, SEGMENT, master, web } from '../clips/encode.mjs';
import { CUTS, FPS } from './timeline.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CUT = +(argValue('--cut') ?? 30);
const ASP = argValue('--aspect') ?? 'h';
const TAKES = resolve(argValue('--takes'));
const GEM = resolve(argValue('--gem'));
const FONTS = resolve(argValue('--fonts'));
const LOGO = resolve(argValue('--logo'));
const AUD = resolve(argValue('--audio'));
const OUT = resolve(argValue('--out'));
const LOCK = argValue('--lock');
const FROM = argValue('--frames'); // debug: "a-b" renders only these frames of the MG to PNGs
mkdirSync(OUT, { recursive: true });
const K = CUTS[CUT];
const SIZE = { h: [1920, 1080], v: [1080, 1920], s: [1080, 1080] }[ASP];
const [W, H] = SIZE;
const NF = Math.round(K.len * FPS);
const NAME = `wild-rivals-${CUT}s-${{ h: '16x9', v: '9x16', s: '1x1' }[ASP]}`;
const GEMSUF = { h: '16x9', v: '9x16', s: '1x1' }[ASP];

const dataUrl = (p, mime) => `data:${mime};base64,${readFileSync(p).toString('base64')}`;

async function withLock(fn) {
  if (!LOCK) return fn();
  while (existsSync(LOCK)) await new Promise((r) => setTimeout(r, 3000));
  writeFileSync(LOCK, `${process.pid} ${new Date().toISOString()}`);
  const drop = () => { try { if (readFileSync(LOCK, 'utf8').startsWith(`${process.pid} `)) rmSync(LOCK, { force: true }); } catch {} };
  process.on('SIGINT', () => { drop(); process.exit(130); });
  process.on('SIGTERM', () => { drop(); process.exit(143); });
  try { return await fn(); } finally { drop(); }
}

// ---------------------------------------------------------------- the ffmpeg graph: takes cut by the timeline
const inputs = [];
const parts = [];
let fc = '';
for (const [i, s] of K.segs.entries()) {
  const n = Math.round(s.t1 * FPS) - Math.round(s.t0 * FPS);
  if (s.take) {
    const f = join(TAKES, `${s.take}-${ASP}.mp4`);
    if (!existsSync(f) && !FROM) throw new Error(`missing take ${f}`);
    let k = inputs.indexOf(f);
    if (k < 0) { inputs.push(f); k = inputs.length - 1; }
    const a = Math.round(s.in * FPS);
    fc += `[${k}:v]trim=start_frame=${a}:end_frame=${a + n},setpts=PTS-STARTPTS,format=yuv444p[p${i}];`;
  } else {
    fc += `color=c=0x2A1137:s=${W}x${H}:r=${FPS}:d=${(n / FPS).toFixed(6)},format=yuv444p,trim=end_frame=${n}[p${i}];`;
  }
  parts.push(`[p${i}]`);
}
fc += `${parts.join('')}concat=n=${parts.length}:v=1:a=0,format=yuv420p[base]`;
// two passes (a single graph with the takes, the PNG pipe and the score stalled: ffmpeg starved on the pipe): the
// gameplay cut first to a visually lossless segment (x264 CRF 6, encode.mjs SEGMENT), then the MG over it
const fc2 = `[1:v]scale=out_color_matrix=bt709:out_range=tv,format=yuva444p[mg];[0:v]format=yuv444p[b];[b][mg]overlay=format=yuv444:eof_action=pass,format=yuv420p[v]`;

async function render() {
  const { chromium } = await import('@playwright/test');
  // a plain launch: Playwright keeps a temporary profile and removes it on close (no userDataDir of ours)
  const browser = await chromium.launch({ headless: true, args: ['--force-color-profile=srgb'] });
  try {
    const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:transparent;overflow:hidden}canvas{display:block}</style></head><body><canvas id="c" width="${W}" height="${H}"></canvas></body></html>`);
    await page.addScriptTag({ content: readFileSync(join(HERE, 'mg.js'), 'utf8') });
    const assets = { logo: dataUrl(LOGO, 'image/png') };
    for (const k of new Set(K.segs.filter((s) => s.gem).map((s) => s.gem))) {
      const p = join(GEM, `${k}-${GEMSUF}.jpg`);
      if (!existsSync(p)) throw new Error(`missing story frame ${p}`);
      assets[k] = dataUrl(p, 'image/jpeg');
    }
    const fonts = [
      { family: 'Rubik', src: dataUrl(join(FONTS, 'rubik-italic-900.woff2'), 'font/woff2'), weight: '900', style: 'italic' },
      { family: 'Fredoka', src: dataUrl(join(FONTS, 'fredoka-600-700.woff2'), 'font/woff2'), weight: '700' },
    ];
    const ok = await page.evaluate((o) => window.__mg.setup(o), { W, H, aspect: ASP, cut: K, fps: FPS, assets, fonts });
    console.error(`[edit ${NAME}] mg ready ${JSON.stringify(ok.fonts)}`);
    for (const [font, text] of [['italic 900 80px Rubik', 'WILD RIVALS CATS VS DOGS 3V3 PLAY FREE'], ['700 80px Fredoka', 'pawlegends.app']]) {
      if (!(await page.evaluate(([t, f]) => window.__mg.check(t, f), [text, font]))) throw new Error(`font ${font} is missing glyphs for ${text}`);
    }
    const grab = async (f) => {
      await page.evaluate((t) => window.__mg.draw(t), f / FPS);
      return page.locator('#c').screenshot({ type: 'png', omitBackground: true });
    };
    if (FROM) {
      const [a, b] = FROM.split('-').map(Number);
      for (let f = a; f <= b; f += Math.max(1, Math.round((b - a) / 12))) writeFileSync(join(OUT, `${NAME}-mg-${f}.png`), await grab(f));
      return;
    }
    const wav = join(AUD, `wild-rivals-${CUT}.wav`);
    if (!existsSync(wav)) throw new Error(`no score ${wav}`);
    const out = join(OUT, `${NAME}.mp4`);
    const base = join(OUT, `.${NAME}-base.mp4`);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-threads', '4', ...inputs.flatMap((f) => ['-i', f]), '-filter_complex', fc, '-map', '[base]', ...SEGMENT, '-r', String(FPS), '-frames:v', String(NF), '-an', base]);
    const args = ['-y', '-loglevel', 'error', '-threads', '4', '-i', base, '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-', '-i', wav,
      '-filter_complex', fc2, '-map', '[v]', '-map', '2:a', ...master(FPS), '-frames:v', String(NF), ...AUDIO, '-t', K.len.toFixed(3), '-movflags', '+faststart', out];
    const p = spawn('ffmpeg', args, { stdio: ['pipe', 'inherit', 'inherit'] });
    const done = new Promise((res, rej) => p.on('close', (c) => (c === 0 ? res() : rej(new Error(`ffmpeg exit ${c}`)))));
    const t0 = Date.now();
    for (let f = 0; f < NF; f++) {
      const buf = await grab(f);
      if (!p.stdin.write(buf)) await new Promise((r) => p.stdin.once('drain', r));
      if (f % 600 === 0) console.error(`[edit ${NAME}] frame ${f}/${NF} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    }
    p.stdin.end();
    await done;
    rmSync(base, { force: true });
    console.error(`[edit ${NAME}] master ${out}`);
  } finally {
    await browser.close();
  }
}

await withLock(render);
if (!FROM) {
  const out = join(OUT, `${NAME}.mp4`);
  const webOut = join(OUT, `${NAME}-web.mp4`);
  if (ASP === 'h') execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-threads', '4', '-i', out, ...web(FPS), '-c:a', 'aac', '-b:a', '160k', webOut]);
  // poster: the end card's settled frame (logo, PLAY FREE, address)
  const posterT = K.end + 2.2;
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', posterT.toFixed(3), '-i', out, '-frames:v', '1', '-q:v', '2', join(OUT, `${NAME}-poster.jpg`)]);
  const pr = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration,size,bit_rate:stream=codec_name,width,height,r_frame_rate,pix_fmt,profile', '-of', 'json', out], { encoding: 'utf8' });
  console.log(JSON.stringify({ name: NAME, out, probe: JSON.parse(pr) }));
}
