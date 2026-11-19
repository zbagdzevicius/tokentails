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
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { argValue } from '../lib/args.mjs';
import { CAPS, COPY, CREDIT_AT, CUTS, EDL, FPS, N } from './timeline.mjs';

/**
 * The 15 s cutdown, round 3 (review: no skin swap, the end card took 23 % of it): one whole gag arc. STARRING: BRAVO, a
 * failed audition, CUT!, the costume change (four coats), the ENCORE! payoff (FUMBLE!), ROCKET 1, a 2 s end card.
 * 900 frames, every join on the half beat.
 */
const CUTDOWN = [[CUTS.hook, CUTS.title], [CUTS.aud2, CUTS.credits], [CUTS.costume, CUTS.bush], [CUTS.payoff, CUTS.score], [CUTS.score + 60, CUTS.victory], [CUTS.end, CUTS.end + 120]];

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = resolve(HERE, '..', '..');
const TAKES = resolve(argValue('--takes'));
const GEM = resolve(argValue('--gem'));
const AUDIO = resolve(argValue('--audio'));
const OUT = resolve(argValue('--out'));
const BRAND = resolve(argValue('--brand') ?? join(process.env.HOME, 'Downloads/paw-legends/brandbook/v6-lightning-rivalry/kit'));
const ASPECTS = (argValue('--aspect') ?? '16x9,9x16,1x1').split(',');
// --fonts DIR: rubik-italic-900.woff2 + fredoka-600-700.woff2 (and their -ext latin-ext subsets) (Google Fonts, OFL; the brand book's faces). The game's
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

/** Round 2: a take's per-frame QC (tools/clips/record.mjs `<id>.qc.json`: drawn hero boxes, frame fractions). */
const qcCache = new Map();
function qcOf(name, aspect) {
  const f = join(TAKES, `${name}-${aspect === '9x16' ? 'v' : 'h'}.qc.json`);
  if (!qcCache.has(f)) qcCache.set(f, existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null);
  return qcCache.get(f);
}
/** A take-frame point (fractions of the capture) in the output frame of an aspect (its crop and punch). */
function toOut([x, y], aspect) {
  if (aspect === '1x1') return [(x * 1920 - 420) / 1080, y];
  if (aspect === '9x16') return [(x - 0.5) * 1.1 + 0.5, (y - 0.5) * 1.1 + 0.5];
  return [x, y];
}
/** The take frame shown at segment frame k (freezes hold, then the take resumes one frame on). */
function takeFrameAt(g, k) {
  if (g.parts) {
    let r = k;
    for (const [a, n] of g.parts) {
      if (r < n) return a + r;
      r -= n;
    }
    const [a, n] = g.parts.at(-1);
    return a + n - 1;
  }
  if (!g.freeze) return g.in + k;
  const [at, n] = g.freeze;
  return k < at ? g.in + k : k < at + n ? g.in + at : g.in + k - n + 1;
}
/**
 * Per-segment-frame screen points of a tracked hero (the top centre of its drawn body box, output fractions), smoothed
 * over 5 frames; null where the hero is not drawn.
 */
function trackPts(g, len, aspect, track) {
  const qc = qcOf(g.take, aspect);
  if (!qc) throw new Error(`no QC for ${g.take} (${aspect}): record it with the round 2 recorder`);
  const raw = [];
  for (let k = 0; k < len; k++) {
    const row = qc[takeFrameAt(g, k)] ?? [];
    const h = row.find((r) => r.hero === track.hero && (track.team === undefined || r.team === track.team)) ?? row.find((r) => r.hero === track.hero);
    raw.push(h ? toOut([(h.box[0] + h.box[2]) / 2, h.box[1]], aspect) : null);
  }
  return raw.map((p, k) => {
    if (!p) return null;
    const near = raw.slice(Math.max(0, k - 2), k + 3).filter(Boolean);
    return [near.reduce((a, q) => a + q[0], 0) / near.length, near.reduce((a, q) => a + q[1], 0) / near.length].map((v) => +v.toFixed(4));
  });
}
/**
 * Round 3: a prop's screen points by colour (the Kibble Cannon's bolt-yellow spawn ring), per segment frame, from a
 * 480 px wide decode of the take: the densest blob of the colour, smoothed; null once it is gone (picked up).
 */
const COLOR_RULE = { cannon: ([r, g, b]) => r > 220 && g > 180 && b < 80 };
function colorPts(g, len, aspect, rule) {
  const { file } = takeOf(g.take, aspect);
  const w = 480, h = aspect === '9x16' ? 853 : 270;
  const buf = execFileSync('ffmpeg', ['-v', 'error', ...T, '-i', file, '-vf', `scale=${w}:${h}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 30 });
  const fr = w * h * 3;
  const test = COLOR_RULE[rule];
  const raw = [];
  for (let k = 0; k < len; k++) {
    const t = takeFrameAt(g, k);
    if ((t + 1) * fr > buf.length) {
      raw.push(null);
      continue;
    }
    const xs = [], ys = [];
    for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
      const o = t * fr + (y * w + x) * 3;
      if (test([buf[o], buf[o + 1], buf[o + 2]])) {
        xs.push(x);
        ys.push(y);
      }
    }
    if (xs.length < 8) {
      raw.push(null);
      continue;
    }
    let best = null;
    for (let i = 0; i < xs.length; i += 3) {
      let n = 0;
      for (let j = 0; j < xs.length; j++) if (Math.abs(xs[j] - xs[i]) < 20 && Math.abs(ys[j] - ys[i]) < 20) n++;
      if (!best || n > best[0]) best = [n, xs[i], ys[i]];
    }
    const sel = xs.map((x, j) => (Math.abs(x - best[1]) < 25 && Math.abs(ys[j] - best[2]) < 25 ? j : -1)).filter((j) => j >= 0);
    if (sel.length < 8) {
      raw.push(null);
      continue;
    }
    const px = sel.reduce((a, j) => a + xs[j], 0) / sel.length / w, py = sel.reduce((a, j) => a + ys[j], 0) / sel.length / h;
    raw.push(toOut([px, py], aspect));
  }
  // drop jumps (another yellow blob), then smooth over 7 frames
  const clean = raw.map((p, k) => {
    if (!p) return null;
    const prev = raw.slice(Math.max(0, k - 4), k).filter(Boolean).at(-1);
    return prev && Math.hypot(p[0] - prev[0], p[1] - prev[1]) > 0.08 ? null : p;
  });
  return clean.map((p, k) => {
    if (!p) return null;
    const near = clean.slice(Math.max(0, k - 3), k + 4).filter(Boolean);
    return [near.reduce((a, q) => a + q[0], 0) / near.length, near.reduce((a, q) => a + q[1], 0) / near.length].map((v) => +v.toFixed(4));
  });
}

/**
 * Round 4: a fixed point of the take (a prop that does not move, e.g. the cat core; take-frame fractions of the 16:9
 * capture) in the output frame, through the segment's punch and, in 9:16, the `wideV` landscape inset.
 */
function anchorPts(g, len, aspect, [ax, ay]) {
  let u = ax, v = ay;
  if (g.punch) {
    const [z, fx, fy] = g.punch;
    const cw = 1920 / z, ch = 1080 / z;
    const x0 = Math.min(1920 - cw, Math.max(0, fx * 1920 - cw / 2)), y0 = Math.min(1080 - ch, Math.max(0, fy * 1080 - ch / 2));
    u = (ax * 1920 - x0) / cw;
    v = (ay * 1080 - y0) / ch;
  }
  let p;
  if (aspect === '9x16' && g.wideV === true) {
    const w = 1320 * (16 / 9);
    p = [(u * w - (w - 1080) / 2) / 1080, (v * 1320 + 340) / 1920];
  } else if (aspect === '9x16') p = toOut([ax, ay], aspect);
  else p = toOut([u, v], aspect);
  return Array.from({ length: len }, () => p.map((x) => +x.toFixed(4)));
}

/** The overlay with its tracked items' points filled in. */
function withTracks(ov, g, len, aspect) {
  if (!ov) return ov;
  const o = { ...ov };
  if (o.track) o.pts = trackPts(g, len, aspect, o.track);
  if (o.items) o.items = o.items.map((it) => (it.track ? { ...it, pts: trackPts(g, len, aspect, it.track) } : it.colorTrack ? { ...it, pts: colorPts(g, len, aspect, it.colorTrack) } : it.anchor ? { ...it, pts: anchorPts(g, len, aspect, it.anchor) } : it));
  return o;
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

/**
 * Round 2 (review: some takes on the pale stone plaza read washed out next to the green lanes): each take's mean luma
 * and saturation after the grade are measured once, and a take brighter or paler than the cut's target is brought to it
 * (gamma down, saturation up), so the grade matches across takes.
 */
const TARGET = { y: 150, sat: 50 };
const normCache = new Map();
function normOf(take, aspect) {
  const k = `${take}/${aspect}`;
  if (normCache.has(k)) return normCache.get(k);
  if (/^cc\d/.test(take)) {
    // the lobby lineups keep their painted backdrops' own light
    const r = { vf: '' };
    normCache.set(k, r);
    return r;
  }
  const { file, crop } = takeOf(take, aspect);
  const txt = execFileSync('sh', ['-c', `ffmpeg -v error -threads 4 -i "${file}" -vf "select=not(mod(n\\,6)),${crop}${GRADE},signalstats,metadata=print:file=-" -f null - 2>&1`], { encoding: 'utf8', maxBuffer: 1 << 26 });
  const avg = (key) => {
    const v = [...txt.matchAll(new RegExp(`${key}=([\\d.]+)`, 'g'))].map((m) => Number(m[1]));
    return v.reduce((a, b) => a + b, 0) / Math.max(1, v.length);
  };
  const y = avg('lavfi.signalstats.YAVG'), sat = avg('lavfi.signalstats.SATAVG');
  // gamma: map the mean (16-235) onto the target; only darken washed takes (never lift a dark one more than a touch)
  const yn = Math.min(0.99, Math.max(0.01, (y - 16) / 219)), tn = (TARGET.y - 16) / 219;
  const gamma = Math.max(0.6, Math.min(1.06, Math.log(yn) / Math.log(tn)));
  const sats = Math.max(1, Math.min(1.35, TARGET.sat / Math.max(1, sat)));
  const r = { y: +y.toFixed(1), sat: +sat.toFixed(1), gamma: +gamma.toFixed(3), sats: +sats.toFixed(3) };
  r.vf = Math.abs(gamma - 1) < 0.03 && sats < 1.04 ? '' : `,eq=gamma=${r.gamma}:saturation=${r.sats}`;
  normCache.set(k, r);
  report.norm[k] = r;
  return r;
}

/** zoomOut [frames, zoom]: punch in on the centre over the segment's last frames (ease-in), output size kept. */
function zoomOf(zoom, len, aspect, focus = [0.5, 0.5]) {
  if (!zoom) return '';
  const [n, z] = zoom;
  const [W, H] = SIZE[aspect];
  const s = len - n;
  // the punch lands on `focus` (output fractions; the tracked hero's body), kept inside the frame
  const [fx, fy] = focus.map((v) => Math.min(0.75, Math.max(0.25, v)));
  return `,zoompan=z='if(gte(on\\,${s})\\,1+${z - 1}*pow((on-${s})/${n}\\,2)\\,1)':x='max(0\\,min(iw-iw/zoom\\,iw*${fx.toFixed(3)}-iw/zoom/2))':y='max(0\\,min(ih-ih/zoom\\,ih*${fy.toFixed(3)}-ih/zoom/2))':d=1:s=${W}x${H}:fps=${FPS}`;
}

function gpSegment(out, take, aspect, a, len, punch = null, zoom = null, focus = undefined, wideV = false) {
  if (wideV === 'fit' && aspect !== '16x9') {
    // round 3: the curtain call's portrait lineup left the champions a few pixels tall and the 1:1 crop cut the outer
    // two off: both show the landscape lineup fitted to the width over a blurred copy of itself
    const [W, H] = SIZE[aspect];
    const { file } = takeOf(take, '16x9');
    ff(['-i', file, '-filter_complex', `[0:v]trim=start_frame=${a}:end_frame=${a + len},setpts=PTS-STARTPTS,split[a][b];[a]scale=-2:${H},crop=${W}:${H},boxblur=24:2,eq=brightness=-0.12:saturation=0.8[bg];[b]scale=${W}:-2:flags=lanczos[fg];[bg][fg]overlay=0:(H-h)/2,format=yuv420p[v]`, '-map', '[v]', '-frames:v', String(len), ...ENC, out]);
    return;
  }
  if (wideV === true && aspect === '9x16') {
    // round 2: the vertical core shot hung the burning core's smoke column over the top of the tall frame; the 9:16 cut
    // shows the landscape take (no smoke in it) over a blurred, darkened copy of itself. Round 3 (review: a thin strip
    // inside a big blur): the landscape take's centre 1080 x 1320, so gameplay fills 69 % of the tall frame
    const { file } = takeOf(take, '16x9');
    const norm = normOf(take, '16x9');
    ff(['-i', file, '-filter_complex', `[0:v]trim=start_frame=${a}:end_frame=${a + len},setpts=PTS-STARTPTS,${GRADE}${norm.vf},split[a][b];[a]scale=-2:1920,crop=1080:1920,boxblur=24:2,eq=brightness=-0.12:saturation=0.8[bg];[b]${punchOf(punch, '16x9').replace(/,$/, '')}${punch ? ',' : ''}scale=-2:1320:flags=lanczos,crop=1080:1320[fg];[bg][fg]overlay=0:(H-h)/2+40,format=yuv420p[v]`, '-map', '[v]', '-frames:v', String(len), ...ENC, out]);
    return;
  }
  const { file, crop } = takeOf(take, aspect);
  const norm = normOf(take, aspect);
  ff(['-i', file, '-vf', `trim=start_frame=${a}:end_frame=${a + len},setpts=PTS-STARTPTS,${punchOf(punch, aspect)}${crop}${GRADE}${norm.vf}${zoomOf(zoom, len, aspect, focus)}`, '-frames:v', String(len), ...ENC, out]);
  const n = Number(execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v', '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0', out], { encoding: 'utf8' }).trim().split('\n')[0].replace(/,$/, ''));
  if (n !== len) throw new Error(`${take} [${a}, ${a + len}) gave ${n} frames: the take is too short`);
}

function stillOf(take, aspect, at) {
  const { file, crop } = takeOf(take, aspect);
  const out = join(WORK, `still-${take}-${aspect}-${at}.png`);
  if (!existsSync(out)) ff(['-i', file, '-vf', `select=eq(n\\,${at}),${crop}${GRADE}${normOf(take, aspect).vf}`, '-frames:v', '1', out]);
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
    ? { rubik: `${base}${FONTS}/rubik-italic-900.woff2`, fredoka: `${base}${FONTS}/fredoka-600-700.woff2`, ...(existsSync(join(FONTS, 'rubik-italic-900-ext.woff2')) ? { rubikExt: `${base}${FONTS}/rubik-italic-900-ext.woff2`, fredokaExt: `${base}${FONTS}/fredoka-600-700-ext.woff2` } : {}) }
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
      if (g.parts) {
        // jump cuts inside one take; `hold` pads with the last frame (round 3 hook)
        g.parts.forEach(([a, n], k) => {
          const x = join(dir, `${id}${String.fromCharCode(97 + k)}.mp4`);
          gpSegment(x, g.take, aspect, a, n);
          segParts.push(x);
        });
        if (g.hold) {
          const [a, n] = g.parts.at(-1);
          const x = join(dir, `${id}h.mp4`);
          ff(['-loop', '1', '-framerate', String(FPS), '-i', stillOf(g.take, aspect, a + n - 1), '-frames:v', String(g.hold), ...ENC, x]);
          segParts.push(x);
        }
      } else if (g.freeze) {
        // hold the take frame at segment frame `at` for `n` frames (the overlay draws on it)
        const [at, n] = g.freeze;
        const a = join(dir, `${id}a.mp4`), b = join(dir, `${id}b.mp4`), c = join(dir, `${id}c.mp4`);
        gpSegment(a, g.take, aspect, g.in, at);
        const still = stillOf(g.take, aspect, g.in + at);
        ff(['-loop', '1', '-framerate', String(FPS), '-i', still, '-frames:v', String(n), ...ENC, b]);
        gpSegment(c, g.take, aspect, g.in + at + 1, seg.len - at - n);
        segParts.push(a, b, c);
      } else if (g.swap) {
        // a coat change: the same ticks in another take from frame `at` on (a match cut)
        const a = join(dir, `${id}a.mp4`), b = join(dir, `${id}b.mp4`);
        gpSegment(a, g.take, aspect, g.in, g.swap.at);
        if (g.swap.hold) {
          // round 4: a before/after hold (the base coat's last frame, then the new coat's first), the take resumes after
          const [h0, h1] = g.swap.hold;
          const c = join(dir, `${id}c.mp4`), d = join(dir, `${id}d.mp4`);
          ff(['-loop', '1', '-framerate', String(FPS), '-i', stillOf(g.take, aspect, g.in + g.swap.at - 1), '-frames:v', String(h0), ...ENC, c]);
          ff(['-loop', '1', '-framerate', String(FPS), '-i', stillOf(g.swap.take, aspect, g.in + g.swap.at), '-frames:v', String(h1), ...ENC, d]);
          gpSegment(b, g.swap.take, aspect, g.in + g.swap.at + 1, seg.len - g.swap.at - h0 - h1);
          segParts.push(a, c, d, b);
        } else {
          gpSegment(b, g.swap.take, aspect, g.in + g.swap.at, seg.len - g.swap.at);
          segParts.push(a, b);
        }
      } else {
        const a = join(dir, `${id}g.mp4`);
        // the bridge punch-in aims at Bravo's body on the last frame (the hero box centre)
        let focus;
        if (g.zoomOut) {
          const pts = trackPts(g, seg.len, aspect, { hero: 'bravo', team: 0 });
          const p = pts.slice().reverse().find(Boolean);
          if (p) focus = [p[0], Math.min(0.9, p[1] + 0.06)];
        }
        gpSegment(a, g.take, aspect, g.in, seg.len, g.punch, g.zoomOut, focus, g.wideV);
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
        await renderOverlay(page, withTracks(seg.ov, g, seg.len, aspect), seg.len, odir);
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
  // round 2: the vertical cut burns the sound-off captions (one transparent PNG each, enabled over its frames)
  const capIn = [];
  let vf = 'noise=alls=3:allf=t';
  if (aspect === '9x16') {
    const cdir = join(dir, 'caps');
    mkdirSync(cdir, { recursive: true });
    const ctx2 = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    const pg = await ctx2.newPage();
    await pg.goto(`${base}${HERE}/mg.html`);
    await pg.evaluate((o) => window.__mg.setup(o), { W, H, assets: {}, fonts: FONTS ? { rubik: `${base}${FONTS}/rubik-italic-900.woff2`, fredoka: `${base}${FONTS}/fredoka-600-700.woff2`, ...(existsSync(join(FONTS, 'rubik-italic-900-ext.woff2')) ? { rubikExt: `${base}${FONTS}/rubik-italic-900-ext.woff2`, fredokaExt: `${base}${FONTS}/fredoka-600-700-ext.woff2` } : {}) } : { rubik: `${base}${PKG}/public/assets/fonts/Rubik-Italic-Display.woff2`, fredoka: `${base}${PKG}/public/assets/fonts/Fredoka-Ext.woff2` } });
    await pg.evaluate(() => window.__mg.transparent(true));
    let chain = '[0:v]noise=alls=3:allf=t[c0]';
    for (const [i, [a, b, text]] of CAPS.entries()) {
      const png = join(cdir, `${i}.png`);
      await pg.evaluate((t) => window.__mg.draw('caption', 0, { text: t }), text);
      writeFileSync(png, await pg.locator('#c').screenshot({ type: 'png', omitBackground: true, scale: 'css' }));
      capIn.push('-i', png);
      chain += `;[c${i}][${i + 2}:v]overlay=0:0:enable='between(n\\,${a}\\,${b - 1})'[c${i + 1}]`;
    }
    await ctx2.close();
    vf = `${chain};[c${CAPS.length}]format=yuv420p[v]`;
  }
  ff(['-i', joined, '-i', join(AUDIO, 'score.wav'), ...capIn, ...(aspect === '9x16' ? ['-filter_complex', vf, '-map', '[v]'] : ['-map', '0:v', '-vf', `${vf},format=yuv420p`]), '-map', '1:a',
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
const report = { cuts: CUTS, masters: {}, norm: {} };
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
    for (const [name, f] of [['poster', CUTS.title + 75], ['poster-credits', CREDIT_AT[1] + 45], ['poster-rocket', CUTS.score + 130], ['poster-payoff', CUTS.payoff + 170]]) ff(['-i', m16, '-vf', `select=eq(n\\,${f})`, '-frames:v', '1', '-q:v', '2', join(OUT, `pawlegends-trailer60-${name}.jpg`)]);
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
