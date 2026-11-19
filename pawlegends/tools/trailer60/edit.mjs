#!/usr/bin/env node
/**
 * Trailer 60 ("The Understudy", feat. Rocket) edit: gameplay takes (tools/clips/record.mjs, specs from specs.mjs) and motion graphics
 * (mg.js) cut to timeline.mjs, graded, scored (score.mjs) and exported.
 *
 *   node tools/trailer60/edit.mjs --takes DIR --gem DIR --audio DIR --out DIR [--aspect 16x9,9x16,1x1] [--brand DIR]
 *
 * --takes: the captured <take>-h.mp4 / <take>-v.mp4; --gem: the Gemini story frames (gemini.mjs); --audio: score.wav;
 * --brand: the v6 kit (logos/, renders/). Writes per aspect pawlegends-trailer60-<aspect>.mp4 (H.264 High CRF 16,
 * AAC 320k), posters, a web copy of the 16:9 master, and report.json. One browser (closed in finally and on a signal),
 * ffmpeg at -threads 4.
 */
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { argValue } from '../lib/args.mjs';
import { COPY, CUTS, EDL, FPS, N } from './timeline.mjs';

/** The 15 s cutdown: master frame ranges, 900 frames, every join on the beat. */
const CUTDOWN = [[0, 150], [1680, 1800], [2250, 2700], [3060, 3240]];

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = resolve(HERE, '..', '..');
const TAKES = resolve(argValue('--takes'));
const GEM = resolve(argValue('--gem'));
const AUDIO = resolve(argValue('--audio'));
const OUT = resolve(argValue('--out'));
const BRAND = resolve(argValue('--brand') ?? join(process.env.HOME, 'Downloads/paw-legends/brandbook/v6-lightning-rivalry/kit'));
const ASPECTS = (argValue('--aspect') ?? '16x9,9x16,1x1').split(',');
// --fonts DIR: rubik-italic-900.woff2 + fredoka-600-700.woff2 (Google Fonts, OFL; the brand book's faces). The game's
// own Rubik-Italic-Display.woff2 is a subset; setup() refuses any face that falls back on a glyph of the copy.
const FONTS = argValue('--fonts') ? resolve(argValue('--fonts')) : null;
// --only-seg 3,5 (debug): render just those EDL segments as stills / clips into work/<aspect>/
const ONLY = argValue('--only-seg') ? argValue('--only-seg').split(',').map(Number) : null;
const SIZE = { '16x9': [1920, 1080], '9x16': [1080, 1920], '1x1': [1080, 1080] };
const T = ['-threads', '4'];
mkdirSync(OUT, { recursive: true });
const WORK = join(OUT, 'work');
mkdirSync(WORK, { recursive: true });

const ff = (args) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...T, ...args], { stdio: ['ignore', 'inherit', 'inherit'] });
const ENC = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '8', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-an'];

/**
 * The take file and the crop for an aspect: 1:1 is the centre of the 16:9 take (the camera keeps its subject there);
 * 9:16 punches 1.1x into the portrait take (round 2 takes are shot closer, without the clip engine's autoFit).
 */
function takeOf(name, aspect) {
  const f = join(TAKES, `${name}-${aspect === '9x16' ? 'v' : 'h'}.mp4`);
  if (!existsSync(f)) throw new Error(`missing take ${f}`);
  return { file: f, crop: aspect === '1x1' ? 'crop=1080:1080:420:0,' : aspect === '9x16' ? 'crop=iw/1.1:ih/1.1,scale=1080:1920:flags=lanczos,' : '' };
}

/**
 * The gameplay grade (round 3: the autumn ground read muddy next to the comic frames): more contrast, vibrance on the
 * greens and the blue-grey floor only (the lane browns stay put), a soft toe, a light sharpen.
 */
const GRADE = 'eq=contrast=1.1:saturation=1.1:gamma=0.97,huesaturation=colors=g+c:saturation=0.35:intensity=0.05,huesaturation=colors=y:saturation=-0.08,curves=master=0/0.01 0.25/0.23 0.5/0.5 0.8/0.83 1/1,unsharp=5:5:0.4';

/** punch: [zoom, fx, fy] on the 16:9 take (also feeds the 1:1 crop), a lanczos punch-in centred on (fx, fy). */
function punchOf(punch, aspect) {
  if (!punch || aspect === '9x16') return '';
  const [z, fx, fy] = punch;
  const cw = Math.round(1920 / z / 2) * 2, chh = Math.round(1080 / z / 2) * 2;
  const x = Math.round(Math.min(1920 - cw, Math.max(0, fx * 1920 - cw / 2))), y = Math.round(Math.min(1080 - chh, Math.max(0, fy * 1080 - chh / 2)));
  return `crop=${cw}:${chh}:${x}:${y},scale=1920:1080:flags=lanczos,`;
}

function gpSegment(out, take, aspect, a, len, punch = null) {
  const { file, crop } = takeOf(take, aspect);
  ff(['-i', file, '-vf', `trim=start_frame=${a}:end_frame=${a + len},setpts=PTS-STARTPTS,${punchOf(punch, aspect)}${crop}${GRADE}`, '-frames:v', String(len), ...ENC, out]);
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
const ROOTS = [PKG, resolve(PKG, '..', 'pawlegends-web', 'public'), GEM, BRAND, WORK, join(PKG, '..', 'pawlegends-web', 'public'), ...(FONTS ? [FONTS] : [])];
const MIME = { '.html': 'text/html', '.json': 'application/json', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2' };
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

const ART = join(PKG, '..', 'pawlegends-web', 'public', 'pawlegends-art', 'loading');
// round 3: the cards are the champions' comic panels (pawlegends-web/public/pawlegends-art/loading/<id>-640.webp), the
// same comic style as the Gemini story frames (round 2's painted splash art was a third visual language)
const CATS = ['lambo', 'clem', 'sage', 'bengas', 'gabe', 'nova', 'stilts', 'dusty', 'ziggy', 'meatball', 'pixel', 'duchess'];
const DOGS = ['brutus', 'cacklejaw', 'marshmallow', 'howler', 'nugget', 'barkula', 'chili', 'ranger', 'rocket', 'frankie', 'domino', 'champ'].filter((h) => existsSync(join(ART, `${h}-640.webp`)));

/** Overlay frames (transparent PNGs) for a segment, into dir/%04d.png. */
async function renderOverlay(page, ov, len, dir) {
  mkdirSync(dir, { recursive: true });
  await page.evaluate(() => window.__mg.transparent(true));
  for (let f = 0; f < len; f++) {
    await page.evaluate(([s, k, p]) => window.__mg.draw(s, k, p), [ov.mg, f, { ...ov, n: len }]);
    writeFileSync(join(dir, `${String(f).padStart(4, '0')}.png`), await page.locator('#c').screenshot({ type: 'png', omitBackground: true, scale: 'css' }));
  }
  await page.evaluate(() => window.__mg.transparent(false));
}

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
  const assets = {
    ...Object.fromEntries(['cut', 'eye', 'peek', 'curtain'].flatMap((k) => [[`${k}Wide`, `${base}${GEM}/${k}-wide.jpg`], [`${k}Tall`, `${base}${GEM}/${k}-tall.jpg`]])),
    logo: `${base}${BRAND}/logos/pawlegends-logo-primary.png`,
    ...Object.fromEntries([...CATS, ...DOGS].filter((h) => existsSync(join(ART, `${h}-640.webp`))).map((n) => [`l_${n}`, `${base}${ART}/${n}-640.webp`])),
  };
  const fonts = FONTS
    ? { rubik: `${base}${FONTS}/rubik-italic-900.woff2`, fredoka: `${base}${FONTS}/fredoka-600-700.woff2` }
    : { rubik: `${base}${PKG}/public/assets/fonts/Rubik-Italic-Display.woff2`, fredoka: `${base}${PKG}/public/assets/fonts/Fredoka-Ext.woff2` };
  await page.evaluate((o) => window.__mg.setup(o), { W, H, assets, fonts });
  // round 1 set the last S of CATS / DOGS in a fallback face: refuse to render with a face missing a glyph
  const missing = await page.evaluate((t) => window.__mg.glyphs(t), COPY.join('').toUpperCase());
  if (missing.length) throw new Error(`display face lacks ${JSON.stringify(missing.join(''))}: pass --fonts`);
  const parts = [];
  for (const [i, seg] of EDL.entries()) {
    const id = `${String(i).padStart(2, '0')}`;
    if (ONLY && !ONLY.includes(i)) continue;
    if (seg.gp) {
      const g = seg.gp;
      const segParts = [];
      if (g.freeze) {
        // hold the take frame at segment frame `at` for `n` frames (the overlay draws on it)
        const [at, n] = g.freeze;
        const a = join(dir, `${id}a.mp4`), b = join(dir, `${id}b.mp4`), c = join(dir, `${id}c.mp4`);
        gpSegment(a, g.take, aspect, g.in, at);
        const still = stillOf(g.take, aspect, g.in + at);
        ff(['-loop', '1', '-framerate', String(FPS), '-i', still, '-frames:v', String(n), ...ENC, b]);
        gpSegment(c, g.take, aspect, g.in + at + 1, seg.len - at - n);
        segParts.push(a, b, c);
      } else {
        const a = join(dir, `${id}g.mp4`);
        gpSegment(a, g.take, aspect, g.in, seg.len, g.punch);
        segParts.push(a);
      }
      const plain = join(dir, seg.ov ? `${id}p.mp4` : `${id}.mp4`);
      if (segParts.length > 1 || seg.ov) {
        const l = join(dir, `${id}.txt`);
        writeFileSync(l, segParts.map((x) => `file '${x}'`).join('\n') + '\n');
        ff(['-f', 'concat', '-safe', '0', '-i', l, '-c', 'copy', plain]);
      } else ff(['-i', segParts[0], '-c', 'copy', plain]);
      if (seg.ov) {
        // the overlay (name card, mission line, VICTORY!) drawn over the moving gameplay
        const odir = join(dir, `${id}-ov`);
        execFileSync('rm', ['-rf', odir]);
        await renderOverlay(page, seg.ov, seg.len, odir);
        const a = join(dir, `${id}.mp4`);
        ff(['-i', plain, '-framerate', String(FPS), '-i', join(odir, '%04d.png'), '-filter_complex', '[0:v][1:v]overlay=0:0:format=auto,format=yuv420p', '-frames:v', String(seg.len), ...ENC, a]);
        execFileSync('rm', ['-rf', odir]);
        parts.push(a);
      } else parts.push(plain);
    } else {
      const params = { ...seg };
      delete params.still;
      if (seg.still) {
        const still = stillOf(seg.still.take, aspect, seg.still.at);
        await page.evaluate(([k, src]) => window.__mg.still(k, src), ['still', `${base}${still}`]);
        params.still = 'still';
      }
      if (seg.mg === 'end') Object.assign(params, { cats: CATS, dogs: DOGS });
      const a = join(dir, `${id}.mp4`);
      await renderMg(page, seg, aspect, a, params);
      parts.push(a);
    }
    process.stderr.write(`  [${aspect}] ${id} ${seg.mg ?? seg.gp.take} f${seg.f}\n`);
  }
  await ctx.close();
  if (errors.length) throw new Error(`mg page errors: ${errors.join(' | ')}`);
  if (ONLY) return null;
  // concat (identical encodes), then the master: a fine grain, the score, H.264 High
  const list = join(dir, 'list.txt');
  writeFileSync(list, parts.map((p) => `file '${p}'`).join('\n') + '\n');
  const joined = join(dir, 'joined.mp4');
  ff(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', joined]);
  const master = join(OUT, `pawlegends-trailer60-${aspect}.mp4`);
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
    if (!m) continue;
    report.masters[aspect] = { file: m, probe: probe(m), loudness: loudness(m), sizeMB: +(statSync(m).size / 1e6).toFixed(1) };
    console.log(`[edit] ${aspect}: ${JSON.stringify(report.masters[aspect].loudness)} ${report.masters[aspect].sizeMB} MB`);
  }
  // posters (16:9 frames) and the web copy (1080p30, two-pass, ~6 MB)
  const m16 = report.masters['16x9']?.file;
  if (m16) {
    for (const [name, f] of [['poster', 2330], ['poster-title', 140], ['poster-credits', 770], ['poster-rocket', 2650]]) ff(['-i', m16, '-vf', `select=eq(n\\,${f})`, '-frames:v', '1', '-q:v', '2', join(OUT, `pawlegends-trailer60-${name}.jpg`)]);
    const web = join(OUT, 'pawlegends-trailer60-web.mp4');
    const pass = join(WORK, 'x264pass');
    const v = ['-i', m16, '-vf', 'fps=30', '-c:v', 'libx264', '-preset', 'slow', '-b:v', '1500k', '-maxrate', '3000k', '-bufsize', '6000k', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-passlogfile', pass];
    ff([...v, '-pass', '1', '-an', '-f', 'null', '/dev/null']);
    ff([...v, '-pass', '2', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', web]);
    report.web = { file: web, sizeMB: +(statSync(web).size / 1e6).toFixed(1) };
  }
  // the 15 s cutdown, cut on the beat from each master: the hook and title, the Act II fight, the payoff and ROCKET: 1,
  // the end card; 3-frame audio crossfades at the joins
  for (const aspect of Object.keys(report.masters)) {
    const m = report.masters[aspect].file;
    const out = join(OUT, `pawlegends-trailer60-15s-${aspect}.mp4`);
    const vf = CUTDOWN.map(([a, b], i) => `[0:v]trim=start_frame=${a}:end_frame=${b},setpts=PTS-STARTPTS[v${i}]`).join(';');
    const af = CUTDOWN.map(([a, b], i) => `[0:a]atrim=start=${(a / FPS).toFixed(4)}:end=${(b / FPS).toFixed(4)},asetpts=PTS-STARTPTS,afade=t=in:d=0.02,afade=t=out:st=${((b - a) / FPS - 0.03).toFixed(4)}:d=0.03[a${i}]`).join(';');
    const cat = CUTDOWN.map((_, i) => `[v${i}][a${i}]`).join('') + `concat=n=${CUTDOWN.length}:v=1:a=1[v][a0];[a0]loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[a]`;
    ff(['-i', m, '-filter_complex', `${vf};${af};${cat}`, '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-c:a', 'aac', '-b:a', '256k', '-movflags', '+faststart', out]);
    report[`cut15-${aspect}`] = { file: out, probe: probe(out), loudness: loudness(out) };
  }
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 1) + '\n');
} finally {
  await cleanup();
}
