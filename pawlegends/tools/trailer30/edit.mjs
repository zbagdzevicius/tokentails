#!/usr/bin/env node
/**
 * Trailer 30 ("The Rivalry") edit: gameplay takes (tools/clips/record.mjs, specs from specs.mjs) and motion graphics
 * (mg.js) cut to timeline.mjs, graded, scored (score.mjs) and exported.
 *
 *   node tools/trailer30/edit.mjs --takes DIR --gem DIR --audio DIR --out DIR [--aspect 16x9,9x16,1x1] [--brand DIR]
 *
 * --takes: the captured <take>-h.mp4 / <take>-v.mp4; --gem: the Gemini story frames (gemini.mjs); --audio: score.wav;
 * --brand: the v6 kit (logos/, renders/). Writes per aspect pawlegends-trailer30-<aspect>.mp4 (H.264 High CRF 16,
 * AAC 320k), posters, a web copy of the 16:9 master, and report.json. One browser (closed in finally and on a signal),
 * ffmpeg at -threads 4.
 */
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { argValue } from '../lib/args.mjs';
import { CUTS, EDL, FPS, N } from './timeline.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = resolve(HERE, '..', '..');
const TAKES = resolve(argValue('--takes'));
const GEM = resolve(argValue('--gem'));
const AUDIO = resolve(argValue('--audio'));
const OUT = resolve(argValue('--out'));
const BRAND = resolve(argValue('--brand') ?? join(process.env.HOME, 'Downloads/paw-legends/brandbook/v6-lightning-rivalry/kit'));
const ASPECTS = (argValue('--aspect') ?? '16x9,9x16,1x1').split(',');
const SIZE = { '16x9': [1920, 1080], '9x16': [1080, 1920], '1x1': [1080, 1080] };
const T = ['-threads', '4'];
mkdirSync(OUT, { recursive: true });
const WORK = join(OUT, 'work');
mkdirSync(WORK, { recursive: true });

const ff = (args) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...T, ...args], { stdio: ['ignore', 'inherit', 'inherit'] });
const ENC = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '8', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-an'];

/**
 * The take file and the crop for an aspect: 1:1 is the centre of the 16:9 take (the camera keeps its subject there);
 * 9:16 punches 1.3x into the portrait take (its wider lens left the heroes small).
 */
function takeOf(name, aspect) {
  const f = join(TAKES, `${name}-${aspect === '9x16' ? 'v' : 'h'}.mp4`);
  if (!existsSync(f)) throw new Error(`missing take ${f}`);
  return { file: f, crop: aspect === '1x1' ? 'crop=1080:1080:420:0,' : aspect === '9x16' ? 'crop=iw/1.3:ih/1.3,scale=1080:1920:flags=lanczos,' : '' };
}

/** The gameplay grade: a little more contrast and colour, a soft toe, a light sharpen. */
const GRADE = 'eq=contrast=1.07:saturation=1.16:gamma=0.97,curves=master=0/0.02 0.5/0.48 1/0.98,unsharp=5:5:0.35';

function gpSegment(out, take, aspect, a, len) {
  const { file, crop } = takeOf(take, aspect);
  ff(['-i', file, '-vf', `trim=start_frame=${a}:end_frame=${a + len},setpts=PTS-STARTPTS,${crop}${GRADE}`, '-frames:v', String(len), ...ENC, out]);
  const n = Number(execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v', '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0', out], { encoding: 'utf8' }).trim().split('\n')[0].replace(/,$/, ''));
  if (n !== len) throw new Error(`${take} [${a}, ${a + len}) gave ${n} frames: the take is too short`);
}

function stillOf(take, aspect, at) {
  const { file, crop } = takeOf(take, aspect);
  const out = join(WORK, `still-${take}-${aspect}-${at}.png`);
  if (!existsSync(out)) ff(['-i', file, '-vf', `select=eq(n\\,${at}),${crop}${GRADE}`, '-frames:v', '1', out]);
  return out;
}

// ---------------------------------------------------------------- a tiny file server for the MG page
const ROOTS = [PKG, GEM, BRAND, WORK, join(PKG, '..', 'pawlegends-web', 'public')];
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2' };
function serve() {
  const s = createServer((req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (!ROOTS.some((r) => p.startsWith(r + '/')) || !existsSync(p)) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'content-type': MIME[extname(p)] ?? 'application/octet-stream' });
    createReadStream(p).pipe(res);
  });
  return new Promise((ok) => s.listen(0, '127.0.0.1', () => ok(s)));
}

const CATS = ['clem', 'lambo', 'sage', 'raspberry', 'gabby', 'bengal', 'meatball', 'pixel', 'duchess', 'stilts'];
const DOGS = ['sir-brutus', 'cacklejaw', 'marshmallow', 'howler', 'nugget', 'bravo', 'chili', 'rocket', 'frankie', 'domino'];
const GLORY_ROWS = (aspect) => {
  if (aspect === '16x9') {
    return [
      { cats: CATS.slice(6, 10), dogs: DOGS.slice(6, 10), y: 0.64, h: 0.22, par: 0.01 },
      { cats: CATS.slice(2, 6), dogs: DOGS.slice(2, 6), y: 0.82, h: 0.3, par: 0.025 },
      { cats: CATS.slice(0, 2), dogs: DOGS.slice(0, 2), y: 1.02, h: 0.46, par: 0.05 },
    ];
  }
  // 9:16 and 1:1: fewer heroes per row, so nobody stands inside another
  const sq = aspect === '1x1';
  return [
    { cats: CATS.slice(3, 6), dogs: DOGS.slice(3, 6), y: sq ? 0.62 : 0.6, h: sq ? 0.2 : 0.11, par: 0.01 },
    { cats: CATS.slice(1, 3), dogs: DOGS.slice(1, 3), y: sq ? 0.8 : 0.74, h: sq ? 0.28 : 0.15, par: 0.025 },
    { cats: CATS.slice(0, 1), dogs: DOGS.slice(0, 1), y: sq ? 1.03 : 0.98, h: sq ? 0.42 : 0.24, par: 0.05 },
  ];
};

async function renderMg(page, seg, aspect, out, params) {
  const enc = spawn('ffmpeg', ['-y', '-v', 'error', ...T, '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-', ...ENC, out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((ok, no) => enc.on('close', (c) => (c === 0 ? ok() : no(new Error(`ffmpeg mg ${c}`)))));
  for (let f = 0; f < seg.len; f++) {
    await page.evaluate(([s, k, p]) => window.__mg.draw(s, k, p), [seg.mg, f, { ...params, n: seg.len }]);
    const buf = await page.locator('#c').screenshot({ type: 'png', omitBackground: false, scale: 'css' });
    await new Promise((ok, no) => enc.stdin.write(buf, (e) => (e ? no(e) : ok())));
  }
  enc.stdin.end();
  await done;
}

async function buildAspect(aspect, browser, base) {
  const [W, H] = SIZE[aspect];
  const dir = join(WORK, aspect);
  mkdirSync(dir, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}${HERE}/mg.html`);
  const R = (n) => `${base}${BRAND}/renders/pawlegends-${n}-render.png`;
  const assets = {
    vsWide: `${base}${GEM}/vs-wide.jpg`, vsTall: `${base}${GEM}/vs-tall.jpg`, warCats: `${base}${GEM}/war-cats.jpg`, warDogs: `${base}${GEM}/war-dogs.jpg`,
    eyes: `${base}${GEM}/eyes-clem.jpg`, keyClem: `${base}${GEM}/key-clem.jpg`, stadium: `${base}${GEM}/stadium.jpg`, stadiumTall: `${base}${GEM}/stadium-tall.jpg`,
    logo: `${base}${BRAND}/logos/pawlegends-logo-primary.png`,
    ...Object.fromEntries([...CATS, ...DOGS].map((n) => [`r_${n}`, R(n)])),
  };
  await page.evaluate((o) => window.__mg.setup(o), { W, H, assets, fonts: { rubik: `${base}${PKG}/public/assets/fonts/Rubik-Italic-Display.woff2`, fredoka: `${base}${PKG}/public/assets/fonts/Fredoka-Ext.woff2` } });
  const parts = [];
  for (const [i, seg] of EDL.entries()) {
    const id = `${String(i).padStart(2, '0')}`;
    if (seg.gp) {
      const g = seg.gp;
      if (g.freeze) {
        const [at, n] = g.freeze;
        const a = join(dir, `${id}a.mp4`), b = join(dir, `${id}b.mp4`), c = join(dir, `${id}c.mp4`);
        gpSegment(a, g.take, aspect, g.in, at);
        const still = stillOf(g.take, aspect, g.in + at);
        await page.evaluate(([k, src]) => window.__mg.still(k, src), ['still', `${base}${still}`]);
        await renderMg(page, { mg: 'freeze', len: n }, aspect, b, { still: 'still', side: seg.side });
        gpSegment(c, g.take, aspect, g.in + at + 1, seg.len - at - n);
        parts.push(a, b, c);
      } else {
        const a = join(dir, `${id}.mp4`);
        gpSegment(a, g.take, aspect, g.in, seg.len);
        parts.push(a);
      }
    } else {
      const params = {};
      if (seg.still) {
        const still = stillOf(seg.still.take, aspect, seg.still.at);
        await page.evaluate(([k, src]) => window.__mg.still(k, src), ['still', `${base}${still}`]);
        params.still = 'still';
      }
      if (seg.mg === 'glory') params.rows = GLORY_ROWS(aspect);
      const a = join(dir, `${id}.mp4`);
      await renderMg(page, seg, aspect, a, params);
      parts.push(a);
    }
    process.stderr.write(`  [${aspect}] ${id} ${seg.mg ?? seg.gp.take} f${seg.f}\n`);
  }
  await ctx.close();
  if (errors.length) throw new Error(`mg page errors: ${errors.join(' | ')}`);
  // concat (identical encodes), then the master: a fine grain, the score, H.264 High
  const list = join(dir, 'list.txt');
  writeFileSync(list, parts.map((p) => `file '${p}'`).join('\n') + '\n');
  const joined = join(dir, 'joined.mp4');
  ff(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', joined]);
  const master = join(OUT, `pawlegends-trailer30-${aspect}.mp4`);
  ff(['-i', joined, '-i', join(AUDIO, 'score.wav'), '-map', '0:v', '-map', '1:a', '-vf', 'noise=alls=3:allf=t,format=yuv420p',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-profile:v', 'high', '-level', '4.2', '-pix_fmt', 'yuv420p', '-r', String(FPS),
    '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-g', '120',
    '-c:a', 'aac', '-b:a', '320k', '-ar', '48000', '-frames:v', String(N), '-t', (N / FPS).toFixed(3), '-movflags', '+faststart', master]);
  return master;
}

function probe(f) {
  const j = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-show_entries', 'format=duration,size:stream=codec_name,profile,width,height,r_frame_rate,nb_read_frames,sample_rate', '-of', 'json', f], { encoding: 'utf8' }));
  return j;
}
function loudness(f) {
  const out = execFileSync('sh', ['-c', `ffmpeg -hide_banner -nostats -i "${f}" -af ebur128=peak=true:framelog=quiet -f null - 2>&1`], { encoding: 'utf8' });
  const s = out.slice(out.lastIndexOf('Summary:'));
  const num = (re) => Number(re.exec(s)?.[1]);
  return { I: num(/I:\s+(-?[\d.]+) LUFS/), LRA: num(/LRA:\s+(-?[\d.]+) LU/), TP: num(/Peak:\s+(-?[\d.inf]+) dBFS/) };
}

const { chromium } = await import('@playwright/test');
let browser = null;
let server = null;
const cleanup = async () => {
  try {
    await browser?.close();
  } catch {
    /* closed */
  }
  server?.close();
};
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => void cleanup().finally(() => process.exit(130)));
const report = { cuts: CUTS, masters: {} };
try {
  server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  // a plain launch: Playwright keeps its own temporary profile and removes it on close
  browser = await chromium.launch({ headless: true, args: ['--force-color-profile=srgb'] });
  for (const aspect of ASPECTS) {
    const m = await buildAspect(aspect, browser, base);
    report.masters[aspect] = { file: m, probe: probe(m), loudness: loudness(m), sizeMB: +(statSync(m).size / 1e6).toFixed(1) };
    console.log(`[edit] ${aspect}: ${JSON.stringify(report.masters[aspect].loudness)} ${report.masters[aspect].sizeMB} MB`);
  }
  // posters (16:9 frames) and the web copy (1080p30, two-pass, ~6 MB)
  const m16 = report.masters['16x9']?.file;
  if (m16) {
    for (const [name, f] of [['poster', 1560], ['poster-core', 1290], ['poster-vs', 88]]) ff(['-i', m16, '-vf', `select=eq(n\\,${f})`, '-frames:v', '1', '-q:v', '2', join(OUT, `pawlegends-trailer30-${name}.jpg`)]);
    const web = join(OUT, 'pawlegends-trailer30-web.mp4');
    const pass = join(WORK, 'x264pass');
    const v = ['-i', m16, '-vf', 'fps=30', '-c:v', 'libx264', '-preset', 'slow', '-b:v', '1500k', '-maxrate', '3000k', '-bufsize', '6000k', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-passlogfile', pass];
    ff([...v, '-pass', '1', '-an', '-f', 'null', '/dev/null']);
    ff([...v, '-pass', '2', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', web]);
    report.web = { file: web, sizeMB: +(statSync(web).size / 1e6).toFixed(1) };
  }
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 1) + '\n');
} finally {
  await cleanup();
}
