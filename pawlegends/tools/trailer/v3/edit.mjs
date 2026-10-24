#!/usr/bin/env node
/**
 * Trailer v3 edit: builds the four masters from the captured footage (capture.mjs with v3/shots.mjs), the type
 * overlays (v3/type.mjs) and the score (v3/score.mjs), then measures them.
 *
 *   node tools/trailer/v3/edit.mjs --dir DIR        (DIR/shots, DIR/mg, DIR/audio in; DIR/out out)
 *
 * Per master: the copy gate, every take's hash, every shot's overlap QC, every frame present; per-frame picture
 * accents (a decaying shake <= 10 px, a one-frame exposure lift <= +15 % instead of any white flash, the 9:16 real-HUD
 * band, the end card's darkened and blurred line-up); one encode with a light grade (contrast and saturation only, no
 * bloom) and the type laid on top; H.264 High CRF 16 60 fps + AAC 320k, faststart. Then ffprobe, EBU R128 on the
 * encoded file, and a per-shot luma check (share of near-white pixels), duplicate / black frame checks.
 */
import { execFile, execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { argValue } from '../../lib/args.mjs';
import { lintTrailerCopy } from '../lint-copy.mjs';
import { ASPECTS, CUTS, END_AT, END_PLATE, GLARE, glareBlobFails, post, sourceFrame } from './timeline.mjs';
import { SHOTS } from './shots.mjs';

const run = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = resolve(argValue('--dir') ?? join(HERE, '..', 'out', 'v3'));
const SHOTS_DIR = join(DIR, 'shots');
const MG = resolve(argValue('--mg') ?? join(DIR, 'mg'));
const AUDIO = join(DIR, 'audio');
const OUT = resolve(argValue('--out-dir') ?? join(DIR, 'out'));
const WORK = join(OUT, 'work');
const ONLY_CUT = argValue('--cut');
const ONLY_ASPECT = argValue('--aspect');
const log = (...a) => console.log('[edit]', ...a);
const pad4 = (f) => `f${String(f).padStart(4, '0')}.png`;

// ---------------------------------------------------------------- checks

// v3.3 `--copy FILE --lint-target client`: the landing-only variant (its own strings, linted as client copy)
const copy = JSON.parse(readFileSync(argValue('--copy') ? resolve(argValue('--copy')) : join(HERE, 'copy.json'), 'utf8'));
const lint = lintTrailerCopy(copy, argValue('--lint-target') ?? 'pawlegends');
if (lint.findings.length) throw new Error(`copy gate failed: ${JSON.stringify(lint.findings)}`);
log(`copy gate: ${lint.lines} lines, 0 findings`);
const manifest = JSON.parse(readFileSync(join(SHOTS_DIR, 'manifest.json'), 'utf8'));
const bad = Object.entries(manifest.shots).filter(([, s]) => s.hash && !s.hash.ok);
if (bad.length) throw new Error(`take hash MISMATCH: ${bad.map(([k]) => k).join(', ')}`);
// v3.1 capture gates (harness FrameQc): bodies overlapping on screen, a hero inside a structure, game text at the edge
const gate = (key, what) => {
  const bad = Object.entries(manifest.shots).filter(([, s]) => s[key]?.length);
  if (bad.length) throw new Error(`${what} QC failed: ${bad.map(([k, s]) => `${k} ${JSON.stringify(s[key])}`).join('; ')}`);
};
if (!process.argv.includes('--no-gates')) {
  gate('overlaps', 'overlap');
  gate('inStruct', 'hero-in-structure');
  gate('edgeText', 'edge text');
  // v3.3: bodies in contact on the ground, a minion inside a hero, a twin hero side by side, a stale or pinned number
  gate('contacts', 'body contact');
  gate('minionIns', 'minion-in-hero');
  gate('dupes', 'twin hero');
  gate('stalePops', 'stale number');
  // v3.4: a number or word drawn on one frame only
  gate('flashPops', 'one-frame pop');
}
log(`takes: ${Object.keys(manifest.shots).length} shot captures, hashes ok, overlap / structure / edge-text QC clean`);

// v3.2 type QC: no word (at its slam size, grown by a 40 px margin at 1080 p) may touch a hero's body-and-plate box,
// any plate or bar the game draws, or a damage number or pop, on any frame it is drawn; the real-cats
// line (M4) may only sit over the game's pick screen or over plates that all name a champion
const mgManifest = JSON.parse(readFileSync(join(MG, 'manifest.json'), 'utf8'));
const qcCache = new Map();
function qcOf(shot, aspect) {
  const k = `${shot}/${aspect}`;
  if (!qcCache.has(k)) {
    const p = join(SHOTS_DIR, shot, aspect, 'qc.json');
    qcCache.set(k, existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null);
  }
  return qcCache.get(k);
}
const CHAMPIONS = new Set(['Lambo', 'Avietė', 'Bengas', 'Gabė']);
/**
 * v3.6: the game's own HUD is part of the footage, so the type QC counts it as an obstacle (v3.5 laid CALM PUDDING. on
 * the score bar): its boxes (landscape fractions) per layer set, while the shot's hudFade keeps it on screen.
 */
const HUD_RECTS = {
  hudlite: [['score bar', [0.385, 0, 0.715, 0.08]], ['minimap', [0.835, 0.815, 0.99, 0.985]]],
  hud: [['score bar', [0.315, 0, 0.715, 0.085]], ['ability bar', [0.33, 0.84, 0.67, 0.99]], ['minimap', [0.835, 0.815, 0.99, 0.985]]],
};
function hudAlpha(keys, f) {
  if (!keys?.length) return 1;
  if (f <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [f1, v1] = keys[i];
    const [f0, v0] = keys[i - 1];
    if (f <= f1) return v0 + ((v1 - v0) * (f - f0)) / Math.max(1, f1 - f0);
  }
  return keys.at(-1)[1];
}
function hudRects(s, aspect, f) {
  if (aspect !== '16x9') return [];
  const layers = s.layers ?? [];
  const set = layers.includes('hud') ? 'hud' : layers.includes('hudlite') ? 'hudlite' : null;
  if (!set || hudAlpha(s.hudFade, f) < 0.05) return [];
  return HUD_RECTS[set];
}
const typeQc = [];
for (const cut of ['30', '15']) {
  for (const aspect of ['16x9', '9x16']) {
    const { W, H } = ASPECTS[aspect];
    const mgn = (40 * Math.min(W, H)) / 1080;
    const boxes = mgManifest.cuts?.[cut]?.[aspect]?.boxes ?? {};
    for (const [fs, list] of Object.entries(boxes)) {
      const f = Number(fs);
      if (f >= END_AT[cut]) continue;
      const sf = sourceFrame(cut, f);
      const s = SHOTS.find((x) => sf >= x.f0 && sf <= x.f1);
      if (!s) continue;
      if (s.lobby) {
        // over the lobby: only the real-cats line may sit on the pick screen; the line-up shot has its own titles
        continue;
      }
      const band = false;
      const q = qcOf(s.id, aspect)?.[sf];
      if (!q) continue;
      const bh = (W * 1080) / 1920;
      const toPx = (bx) => (band ? [bx[0] * W, (H - bh) / 2 + bx[1] * bh, bx[2] * W, (H - bh) / 2 + bx[3] * bh] : [bx[0] * W, bx[1] * H, bx[2] * W, bx[3] * H]);
      const things = [
        // a hero drawn smaller than 3 % of the frame (the crane's whole-map view) is a speck, not a subject
        ...q.heroes.filter((h) => h.box[3] - h.box[1] > 0.03).map((h) => [`${h.hero}`, h.box]),
        ...(q.plates ?? []).map((p) => [`${p.kind === 'hero' ? `plate ${p.name}` : `${p.kind} bar`}`, p.box]),
        ...(q.pops ?? []).map((p) => [`pop ${p.text}`, p.box]),
        // v3.2: the towers, cores and Pudding themselves (a word over the core burst is a word over the subject)
        // (a box reaching far outside the frame is a fallen piece behind the lens, not a subject)
        ...(q.structs ?? []).filter((p) => p.box[3] - p.box[1] > 0.06 && p.box.every((v) => v > -0.5 && v < 1.5)).map((p) => [`${p.kind}`, p.box]),
        ...hudRects(s, aspect, sf).map(([n, b]) => [`HUD ${n}`, b]),
      ];
      for (const b of list) {
        if (b.id.startsWith('M4')) {
          const names = (q.plates ?? []).filter((p) => p.kind === 'hero').map((p) => p.name);
          const bad = names.filter((n) => !CHAMPIONS.has(n));
          if (bad.length) typeQc.push(`${cut}s ${aspect} f${f} ${b.id} with non-champion plates ${bad.join(',')} (${s.id} f${sf})`);
        }
        for (const [what, box] of things) {
          // VICTORY! is laid on the core burst by design (the title on the payoff); every other word stays off it
          if (b.id === 'M6' && what === 'core') continue;
          const [x0, y0, x1, y1] = toPx(box);
          if (b.x1 + mgn > x0 && b.x0 - mgn < x1 && b.y1 + mgn > y0 && b.y0 - mgn < y1) typeQc.push(`${cut}s ${aspect} f${f} ${b.id} over ${what} (${s.id} f${sf})`);
        }
      }
    }
  }
}
if (typeQc.length) {
  const by = {};
  for (const t of typeQc) {
    const k = t.split(' f')[0] + ' ' + t.split(' ')[3];
    by[k] = (by[k] ?? 0) + 1;
  }
  log(`type QC: ${typeQc.length} word-over-subject frames: ${JSON.stringify(by)}; first: ${typeQc.slice(0, 8).join(' | ')}`);
  // v3.5: every failing frame, for the fix
  mkdirSync(WORK, { recursive: true });
  writeFileSync(join(WORK, 'type-qc.txt'), `${typeQc.join('\n')}\n`);
  if (!process.argv.includes('--no-gates')) throw new Error('type QC failed (a word touches a hero, a plate or a pop)');
} else log('type QC: no word touches a hero, plate, bar, pop, banner or structure box (40 px margin) on any frame; M4 only over the pick screen');

// v3.2 match-end gate: no gameplay frame more than 8 sim ticks past its take's last tick (frozen units after the
// match ended), and no frame of a match shot after the take's end unless it is the core shot's tail
const TAKES_ALL = JSON.parse(readFileSync(join(HERE, '..', 'takes.json'), 'utf8')).takes;
const late = [];
for (const [k, m] of Object.entries(manifest.shots)) {
  const take = TAKES_ALL[m.take];
  if (!take?.length) continue;
  // v3.4: the bodies keep idling after the match ends (heroView END_IDLE), so the core shot may run 16 ticks past it;
  // the low-motion gate below still fails any held picture
  for (const [f, t] of Object.entries(m.ticks ?? {})) if (t > take.length + 16) late.push(`${k} f${f} tick ${t} > end ${take.length}`);
}
if (late.length) {
  log(`match-end gate: ${late.length} frames past the match: ${late.slice(0, 4).join(' | ')}`);
  if (!process.argv.includes('--no-gates')) throw new Error('match-end gate failed (units held after the match ended)');
} else log('match-end gate: no gameplay frame more than 16 ticks past its match end (bodies idle after it)');
if (process.argv.includes('--qc-only')) process.exit(typeQc.length ? 1 : 0);

/** The shot (by id) that owns master frame f. */
const shotOf = (f) => SHOTS.find((s) => f >= s.f0 && f <= s.f1);
/**
 * v3.3 the 9:16 pick screen (S18, captured in landscape only: the phone-portrait layout hides the hero behind its
 * panel): the landscape capture recomposed as the pedestal and hero above, the panel's name and "Inspired by ..."
 * lines below (both crops of the same real frame, no blur fill). Crops are fractions of the landscape frame.
 */
// v3.4: the hero crop starts higher (0.03, was 0.18: Lambo's ears were cut by the top edge) at the band's own aspect (no scale-and-crop) so every champion keeps headroom
// v3.6 (review of v3.5: the panel's right border cut off, a lighter backing rectangle ending abruptly, the pedestal
// sliced by the panel, a wedge of the glow disc at the crop edge): the source is S18's own 9:16 capture, landscape with
// the glow disc left out (one flat backdrop, `hideGlow`); the hero and pedestal are keyed off that backdrop over a whole
// disc drawn in the pick screen's glow colour, and the whole panel (rounded border included) sits below the pedestal,
// inside 40 px margins
const PICK_916 = { hero: [0.53, 0.02, 0.4, 0.8], heroAt: [160, 110, 760, 855], panel: [0.022, 0.42, 0.418, 0.195], panelAt: [40, 1010, 1000], bg: '0x2b1d2e', glow: '0x3f2550', disc: [540, 500, 440] };
/** v3.6: the 9:16 pick screen's backdrop: the flat lobby colour with the whole glow disc (PICK_916.disc). */
let pickBgFile = null;
function pickBg(W, H) {
  if (pickBgFile) return pickBgFile;
  const c = PICK_916;
  const [cx, cy, r] = c.disc;
  const hex = (h, i) => parseInt(h.slice(2 + 2 * i, 4 + 2 * i), 16);
  const ch = (i) => `if(lt(hypot(X-${cx},Y-${cy}),${r}),${hex(c.glow, i)},${hex(c.bg, i)})`;
  mkdirSync(WORK, { recursive: true });
  pickBgFile = join(WORK, 'pick916-bg.png');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `color=c=black:s=${W}x${H},format=rgb24`, '-vf', `geq=r='${ch(0)}':g='${ch(1)}':b='${ch(2)}'`, '-frames:v', '1', pickBgFile]);
  return pickBgFile;
}
/** Footage path of master frame f in an aspect (null when missing). */
function footage(f, aspect) {
  const s = shotOf(f);
  if (!s) return null;
  const p = join(SHOTS_DIR, s.id, aspect, pad4(f));
  return existsSync(p) ? p : null;
}

async function pool(jobs, n = Math.max(2, Math.min(8, cpus().length - 2))) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < jobs.length) await jobs[i++]();
  }));
}
const ff = (args) => run('ffmpeg', ['-hide_banner', '-v', 'error', '-y', ...args], { maxBuffer: 1 << 26 });

// ---------------------------------------------------------------- per-frame plan

/** Shake offset (px) at cut frame f: a decaying alternating kick of n frames. */
function shakeAt(cut, f) {
  for (const s of post(cut).shake) {
    const t = f - s.f;
    if (t < 0 || t >= s.n) continue;
    const k = s.px * (1 - t / s.n);
    return [Math.round(k * Math.sin(t * 2.3 + 0.7)), Math.round(k * Math.cos(t * 2.9 + 0.2))];
  }
  return null;
}
const punchAt = (cut, f) => post(cut).punch.find((p) => p.f === f)?.k ?? 0;

function plan(cut, aspect) {
  const out = [];
  const v = aspect === '9x16';
  for (let f = 0; f < CUTS[cut]; f++) {
    const sf = sourceFrame(cut, f);
    const s = shotOf(sf);
    // a shot captured in landscape only is recomposed for 9:16 (S18: PICK_916)
    const band = v && !!s?.pick916;
    const src = footage(sf, aspect) ?? (band ? footage(sf, '16x9') : null);
    if (!src) throw new Error(`${cut}s ${aspect}: no footage for frame ${f} (master ${sf}, ${s?.id})`);
    out.push({ f, sf, shot: s.id, src, band, end: f >= END_AT[cut], shake: shakeAt(cut, f), punch: punchAt(cut, f) });
  }
  return out;
}

async function buildBase(cut, aspect, dir) {
  const { W, H } = ASPECTS[aspect];
  const p = plan(cut, aspect);
  const fx = join(dir, 'fx');
  const base = join(dir, 'base');
  const ov = join(dir, 'ov');
  for (const d of [fx, base, ov]) {
    rmSync(d, { recursive: true, force: true });
    mkdirSync(d, { recursive: true });
  }
  const jobs = [];
  for (const q of p) {
    const chain = [];
    if (q.band) {
      // v3.3: the pick screen recomposed (PICK_916): the hero and pedestal above, the panel's lines below, on the pick
      // screen's own backdrop colour
      const c = PICK_916;
      const crop = (r) => `crop=iw*${r[2]}:ih*${r[3]}:iw*${r[0]}:ih*${r[1]}`;
      const [hx, hy, hw, hh] = c.heroAt;
      const [px, py, pw] = c.panelAt;
      chain.push(`split[a][b];[a]${crop(c.hero)},scale=${hw}:${hh}:flags=lanczos,format=rgba,colorkey=${c.bg}:0.035:0.05[h];[b]${crop(c.panel)},scale=${pw}:-2:flags=lanczos[p];[1:v][h]overlay=${hx}:${hy}[t];[t][p]overlay=${px}:${py}`);
      q.bg = pickBg(W, H);
    } else {
      // a capture at another size (S18 at DPR 2) is scaled to the master's
      const sz = manifest.shots[`${q.shot}/${aspect}`]?.size;
      if (sz && (sz[0] !== W || sz[1] !== H)) chain.push(`scale=${W}:${H}:flags=lanczos`);
    }
    if (q.end) chain.push(`gblur=sigma=${END_PLATE.blur},colorchannelmixer=rr=${END_PLATE.darken}:gg=${END_PLATE.darken}:bb=${END_PLATE.darken}`);
    if (q.shake) {
      const m = 12;
      chain.push(`scale=${W + 2 * m}:${H + 2 * m}:flags=bicubic,crop=${W}:${H}:${m + q.shake[0]}:${m + q.shake[1]}`);
    }
    if (q.punch) chain.push(`lutrgb=r='val*${1 + q.punch}':g='val*${1 + q.punch}':b='val*${1 + q.punch}'`);
    if (!chain.length) continue;
    q.fx = join(fx, pad4(q.f));
    jobs.push(() => ff(['-i', q.src, ...(q.bg ? ['-i', q.bg] : []), '-filter_complex', `${chain.join(',')},format=rgb24`, '-frames:v', '1', q.fx]));
  }
  await pool(jobs);
  const blank = join(dir, 'blank.png');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `color=c=black@0.0:s=${W}x${H},format=rgba`, '-frames:v', '1', blank]);
  for (const q of p) {
    symlinkSync(q.fx ?? q.src, join(base, pad4(q.f)));
    const o = join(MG, cut, aspect, pad4(q.f));
    symlinkSync(existsSync(o) ? o : blank, join(ov, pad4(q.f)));
  }
  return { plan: p, base, ov };
}

// ---------------------------------------------------------------- encode and measure

function ffprobe(path) {
  return JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-show_entries', 'format=duration,bit_rate:stream=codec_name,profile,width,height,pix_fmt,r_frame_rate,nb_read_frames,duration,sample_rate,channels,bit_rate', '-of', 'json', path], { encoding: 'utf8' }));
}
function loudness(path) {
  const out = execFileSync('sh', ['-c', `ffmpeg -hide_banner -nostats -i "${path}" -map 0:a -af ebur128=peak=true:framelog=quiet -f null - 2>&1`], { encoding: 'utf8' });
  const s = out.slice(out.lastIndexOf('Summary:'));
  const num = (re) => Number(re.exec(s)?.[1]);
  return { I: num(/I:\s+(-?[\d.]+) LUFS/), LRA: num(/LRA:\s+(-?[\d.]+) LU/), TP: num(/Peak:\s+(-?[\d.inf]+) dBFS/) };
}

/** Decode the master small and measure every frame: near-white share, mean luma, difference to the previous frame. */
function frameStats(path, W, H, pre = []) {
  const w = 160;
  const h = Math.round((H * w) / W / 2) * 2;
  return new Promise((ok, fail) => {
    const p = spawn('ffmpeg', ['-v', 'error', ...pre, '-i', path, '-vf', `scale=${w}:${h}:flags=area,format=rgb24`, '-f', 'rawvideo', '-']);
    const n = w * h * 3;
    let buf = Buffer.alloc(0);
    let prev = null;
    let prev2 = null;
    const stats = [];
    p.stdout.on('data', (d) => {
      buf = Buffer.concat([buf, d]);
      while (buf.length >= n) {
        const fr = buf.subarray(0, n);
        let white = 0;
        let clip = 0;
        let sumY = 0;
        let diff = 0;
        let diff2 = 0;
        for (let i = 0; i < n; i += 3) {
          const r = fr[i], g = fr[i + 1], b = fr[i + 2];
          const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
          const grey = (mx - mn) / Math.max(1, mx) < 0.25;
          if (y >= 225 && grey) white++;
          if (y >= 235 && grey) clip++;
          sumY += y;
          if (prev) diff += Math.abs(fr[i + 1] - prev[i + 1]);
          if (prev2) diff2 += Math.abs(fr[i + 1] - prev2[i + 1]);
        }
        // v3.3 the largest 4-connected near-white blob (Y >= 235, unsaturated), as a share of the frame
        const m = new Uint8Array(n / 3);
        for (let i = 0, k = 0; i < n; i += 3, k++) {
          const r = fr[i], g = fr[i + 1], b = fr[i + 2];
          const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
          m[k] = y >= 235 && (mx - mn) / Math.max(1, mx) < 0.25 ? 1 : 0;
        }
        let blob = 0;
        const stack = [];
        for (let k = 0; k < m.length; k++) {
          if (m[k] !== 1) continue;
          let size = 0;
          m[k] = 2;
          stack.push(k);
          while (stack.length) {
            const q = stack.pop();
            size++;
            const x = q % w;
            for (const nb of [x > 0 ? q - 1 : -1, x < w - 1 ? q + 1 : -1, q - w, q + w]) if (nb >= 0 && nb < m.length && m[nb] === 1) { m[nb] = 2; stack.push(nb); }
          }
          blob = Math.max(blob, size);
        }
        // diff2: this frame against the one two back (a pop returns: f-1 and f+1 match; an onset stays changed)
        stats.push({ blob: blob / (n / 3), white: white / (n / 3), clip: clip / (n / 3), y: sumY / (n / 3), diff: prev ? diff / (n / 3) : null, diff2: prev2 ? diff2 / (n / 3) : null });
        prev2 = prev;
        prev = Buffer.from(fr);
        buf = buf.subarray(n);
      }
    });
    p.on('close', (c) => (c ? fail(new Error(`decode failed ${c}`)) : ok(stats)));
  });
}

const report = { masters: {} };
const FILES = { '30/16x9': 'pawlegends-trailer-30s-1080p.mp4', '30/9x16': 'pawlegends-trailer-30s-vertical.mp4', '15/16x9': 'pawlegends-trailer-15s-1080p.mp4', '15/9x16': 'pawlegends-trailer-15s-vertical.mp4' };
mkdirSync(WORK, { recursive: true });
for (const cut of ['30', '15']) {
  if (ONLY_CUT && ONLY_CUT !== cut) continue;
  for (const aspect of ['16x9', '9x16']) {
    if (ONLY_ASPECT && ONLY_ASPECT !== aspect) continue;
    const t0 = Date.now();
    const { W, H } = ASPECTS[aspect];
    const dir = join(WORK, `${cut}-${aspect}`);
    const b = await buildBase(cut, aspect, dir);
    const file = join(OUT, FILES[`${cut}/${aspect}`]);
    const wav = join(AUDIO, `score-${cut}.wav`);
    const N = CUTS[cut];
    await run('ffmpeg', [
      '-hide_banner', '-v', 'error', '-y',
      '-framerate', '60', '-i', join(b.base, 'f%04d.png'),
      '-framerate', '60', '-i', join(b.ov, 'f%04d.png'),
      '-i', wav,
      '-filter_complex', `[0:v]scale=${W}:${H}:flags=lanczos,eq=contrast=1.04:saturation=1.06,format=rgb24[g];[g][1:v]overlay=format=auto:shortest=1,scale=out_color_matrix=bt709:out_range=tv,format=yuv420p[v]`,
      '-map', '[v]', '-map', '2:a',
      '-frames:v', String(N),
      '-c:v', 'libx264', '-profile:v', 'high', '-preset', 'slow', '-crf', '16', '-r', '60', '-g', '120',
      '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
      '-c:a', 'aac', '-b:a', '320k', '-ar', '48000', '-t', String(N / 60),
      '-movflags', '+faststart', file,
    ], { maxBuffer: 1 << 26 });
    const probe = ffprobe(file);
    const v = probe.streams.find((s) => s.codec_name === 'h264');
    const a = probe.streams.find((s) => s.codec_name === 'aac');
    const loud = loudness(file);
    const stats = await frameStats(file, W, H);
    // the luma gate reads the picture without the type (the cream type is meant to be bright)
    const pic = await frameStats(join(b.base, 'f%04d.png'), W, H, ['-framerate', '60']);
    const blobs = pic.map((p, f) => ({ f, blob: +p.blob.toFixed(4) })).filter((x) => x.blob > 0.01);
    stats.forEach((st, i) => {
      st.white = pic[i]?.white ?? st.white;
      st.clip = pic[i]?.clip ?? st.clip;
    });
    // per shot: the share of near-white pixels (mean over the shot) and its worst frame
    const perShot = {};
    stats.forEach((s, f) => {
      const id = b.plan[f]?.end ? 'END' : b.plan[f]?.shot;
      const o = (perShot[id] ??= { n: 0, white: 0, clip: 0, worst: 0, worstClip: 0 });
      o.n++;
      o.white += s.white;
      o.clip += s.clip;
      o.worst = Math.max(o.worst, s.white);
      o.worstClip = Math.max(o.worstClip, s.clip);
    });
    for (const o of Object.values(perShot)) {
      o.white = +(o.white / o.n).toFixed(4);
      o.clip = +(o.clip / o.n).toFixed(4);
      o.worst = +o.worst.toFixed(4);
      o.worstClip = +o.worstClip.toFixed(4);
    }
    const black = stats.map((s, f) => (s.y < 12 ? f : -1)).filter((f) => f >= 0);
    // a frozen picture outside the end card and the line-up's still moments (identical consecutive frames)
    // the freeze and pop checks read the picture without the type (a word slamming in is not a pop)
    const frozen = pic.map((s, f) => (s.diff !== null && s.diff < 0.02 && !b.plan[f]?.end && !SHOTS.find((x) => x.id === b.plan[f]?.shot)?.lobby ? f : -1)).filter((f) => f >= 0);
    const r = {
      file,
      frames: Number(v.nb_read_frames),
      duration: Number(probe.format.duration),
      video: { codec: v.codec_name, profile: v.profile, size: `${v.width}x${v.height}`, fps: v.r_frame_rate, pix: v.pix_fmt },
      audio: { codec: a.codec_name, rate: Number(a.sample_rate), channels: a.channels, bitrate: Number(a.bit_rate) },
      loudness: loud,
      luma: perShot,
      blackFrames: black,
      frozenFrames: frozen,
      typeQc: typeQc.filter((t) => t.startsWith(`${cut}s ${aspect}`)).length,
      lastFrameY: +stats.at(-1).y.toFixed(1),
    };
    const fails = [];
    if (r.frames !== N) fails.push(`frames ${r.frames} != ${N}`);
    if (Math.abs(r.duration - N / 60) > 0.02) fails.push(`duration ${r.duration}`);
    if (r.loudness.TP > -1) fails.push(`true peak ${r.loudness.TP}`);
    if (Math.abs(r.loudness.I + 14) > 0.5) fails.push(`loudness ${r.loudness.I}`);
    // glare: near-white, unsaturated pixels (Y >= 225; the dog base's pale lavender plaza is Y ~200 as the game paints
    // it, so it is excluded) over 8 % of a shot on average or 15 % on its worst frame; blowouts at Y >= 235
    for (const [id, o] of Object.entries(perShot)) {
      if (id === 'END') continue;
      if (o.white > GLARE.white || o.worst > GLARE.worst) fails.push(`glare ${id} mean ${o.white} worst ${o.worst}`);
      if (o.clip > GLARE.clip || o.worstClip > GLARE.worstClip) fails.push(`blowout ${id} mean ${o.clip} worst ${o.worstClip}`);
    }
    if (black.length) fails.push(`black frames ${black.join(',')}`);
    // frozen gameplay: two or more identical frames in a row inside a gameplay shot
    const frozenRuns = [];
    for (let i = 0; i < frozen.length; i++) if (frozen[i + 1] === frozen[i] + 1 && (i === 0 || frozen[i - 1] !== frozen[i] - 1)) frozenRuns.push(frozen[i]);
    if (frozenRuns.length) fails.push(`frozen gameplay from ${frozenRuns.join(',')}`);
    // a pop: one frame's change over 4x its neighbours' (and over 3) inside a shot, not on a cut
    const pops = [];
    for (let f = 3; f < pic.length - 3; f++) {
      const d = pic[f].diff;
      if (d === null || d < 3 || b.plan[f].end || b.plan[f].shot !== b.plan[f - 1].shot || b.plan[f].shot !== b.plan[f + 1]?.shot) continue;
      if (b.plan[f].shake || b.plan[f].punch) continue;
      // a real gameplay snap (a knockback, a pull or a blink moved a hero over 0.5 m in one frame) is not a render pop
      const sq = qcOf(b.plan[f].shot, b.plan[f].band ? '16x9' : aspect)?.[b.plan[f].sf];
      if ((sq?.move ?? 0) > 0.5) continue;
      // nor is the game's hit-stop: an impact frame after which the render clock holds (the hit lands, then freezes)
      const tk = manifest.shots[`${b.plan[f].shot}/${b.plan[f].band ? '16x9' : aspect}`]?.ticks ?? {};
      const sf0 = b.plan[f].sf;
      if (tk[sf0] !== undefined && tk[sf0 + 1] === tk[sf0] && tk[sf0 + 2] === tk[sf0]) continue;
      // isolated: far above both the frames before and the frames after (a motion onset keeps changing after it)
      const med = (xs) => xs.map((x) => x.diff ?? 0).sort((a, c) => a - c)[1];
      // v3.2: and it comes back: frame f+1 is close to frame f-1 again (an effect that starts and stays, such as an
      // ultimate's ring or a core's death glow, is an onset, not a pop)
      const back = (pic[f + 1].diff2 ?? 0) < 0.5 * d;
      if (back && d > 6 && d > 4 * Math.max(0.5, med([pic[f - 3], pic[f - 2], pic[f - 1]])) && d > 4 * Math.max(0.5, med([pic[f + 1], pic[f + 2], pic[f + 3]]))) pops.push(f);
    }
    r.popFrames = pops.map((f) => ({ f, d: +pic[f].diff.toFixed(1), shot: b.plan[f].shot }));
    if (pops.length) fails.push(`single-frame pops at ${pops.join(',')}`);
    // v3.3 low motion: more than 8 gameplay frames in a row whose picture barely changes (d < 0.35: units standing
    // still, a hit-stop held, a frozen number), outside the lobby and the end card
    const gameplay = (f) => !b.plan[f].end && !SHOTS.find((x) => x.id === b.plan[f].shot)?.lobby;
    const still = [];
    for (let f = 1, run = 0; f < pic.length; f++) {
      run = gameplay(f) && pic[f].diff !== null && pic[f].diff < 0.35 && b.plan[f].shot === b.plan[f - 1].shot ? run + 1 : 0;
      if (run === 9) still.push(f - 8);
    }
    r.lowMotion = still;
    if (still.length) fails.push(`low motion (9+ frames) from ${still.join(',')}`);
    // v3.3 head stutter: the first 3 frames of a gameplay shot far stiller than the rest of it (units holding on the cut)
    const heads = [];
    for (const sh of SHOTS) {
      if (sh.lobby) continue;
      const fr = b.plan.map((x, i) => (x.shot === sh.id && !x.end ? i : -1)).filter((i) => i > 0);
      if (fr.length < 12) continue;
      // the head (its first 3 frame steps) against the 9 steps right after it: units that hold still on the cut and
      // then start moving (a calm shot that stays calm is not a stutter)
      const ds = fr.slice(1).map((i) => pic[i].diff ?? 0);
      const next = ds.slice(3, 12).sort((a, c) => a - c);
      const med = next[Math.floor(next.length / 2)];
      const head = (ds[0] + ds[1] + ds[2]) / 3;
      if (med > 1.5 && head < 0.2 * med) heads.push(`${sh.id}@${fr[0]}`);
    }
    r.headStutter = heads;
    if (heads.length) fails.push(`head stutter ${heads.join(',')}`);
    // v3.3 local glare: a connected near-white region (Y >= 235, unsaturated). v3.5 (the v3.4 masters still showed
    // white shockwave rims and zone circles at 1-3.7 % that the old 2 %-on-3-frames rule let through): it fails over
    // GLARE.blobRun of the frame on GLARE.runFrames frames in a row, or over GLARE.blobPeak on any one frame
    r.glareBlobs = blobs.filter((x) => gameplay(x.f));
    r.glareBlobMax = +Math.max(0, ...pic.map((p, f) => (gameplay(f) ? p.blob : 0))).toFixed(4);
    const gb = glareBlobFails(pic.map((p) => p.blob), gameplay);
    if (gb.runs.length) fails.push(`glare blob from ${gb.runs.join(',')}`);
    if (gb.peaks.length) fails.push(`glare blob peak on ${gb.peaks.join(',')}`);
    r.fails = fails;
    report.masters[`${cut}/${aspect}`] = r;
    log(`${cut}s ${aspect}: ${r.frames} frames, ${r.duration} s, I ${loud.I} LUFS, TP ${loud.TP} dBTP, ${((Date.now() - t0) / 1000).toFixed(0)} s${fails.length ? `  FAIL: ${fails.join('; ')}` : ''}`);
    if (cut === '30') {
      // posters: CATS VS DOGS over the crane (f106, v3.5: all three words up, before the descent) and the end card (f1760)
      for (const [name, f] of [['poster', 106], ['poster-endcard', 1760]]) {
        const out = join(OUT, `pawlegends-trailer-${name}${aspect === '9x16' ? '-vertical' : ''}.png`);
        await ff(['-i', file, '-vf', `select=eq(n\\,${f}),scale=out_range=full,format=rgb24`, '-frames:v', '1', out]);
      }
    }
  }
}
writeFileSync(join(OUT, 'report.json'), `${JSON.stringify(report, null, 1)}\n`);
log(join(OUT, 'report.json'));
