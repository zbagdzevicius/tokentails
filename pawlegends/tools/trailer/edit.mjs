#!/usr/bin/env node
/**
 * The edit (storyboard §8 step 7): builds each master from the captured footage, the motion-graphics plates and
 * overlays and the score stems, driving ffmpeg. Reproducible: same inputs, same filtergraph, same files.
 *
 *   node tools/trailer/edit.mjs --dir <trailer work dir> [--cut 30|15|both] [--aspect 16x9|9x16|both] [--prores]
 *                               [--shots DIR] [--mg DIR] [--audio DIR] [--out DIR] [--keep-work] [--mix-only]
 *
 * <dir> holds shots/ (capture.mjs), mg/ (type.mjs), audio/ (score.mjs); masters land in <dir>/out/.
 *
 * Per master:
 *   1. checks: the copy gate (lint-copy.mjs), every take's browser hash equals its Node hash, every frame present
 *   2. base frames (rgb24, W x H): footage on the beat grid (the speed ramps are baked in at capture: real in-engine
 *      time scaling, never retimed here), the photo / end-card plates, per-frame geometry for the bark push-ins, the
 *      skin-flip bumps and the 9:16 HUD band
 *   3. one ffmpeg pass: camera shakes, sharpening (CAS), the grade (eq, S-curve, warm balance, 18 % vignette),
 *      the bar-9 desaturation, chromatic accents (rgbashift), the type overlay (flashes, whip-zoom, end card),
 *      BT.709 conversion and film grain; H.264 High CRF 16 + AAC 320k, faststart
 *   4. the audio mix: music ducked under the impacts (sfx + game stems), glue, -14 LUFS, latency-free true-peak
 *      limiter (cues stay sample-locked to their frames), end fade and digital silence
 *   5. verification with ffprobe (duration, frames, size, codecs) and ebur128 on the encoded file; report.json
 */
import { execFile, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { argValue, hasFlag } from '../lib/args.mjs';
import { Bus, SR, compress, dbToGain, limit, readWav, writeWav } from './dsp.mjs';
import { framePlan, gradeWindows, pad4, rangesExpr, shakeExpr, vignetteAlphaExpr, zoomGeometry } from './edit-plan.mjs';
import { lintTrailerCopy } from './lint-copy.mjs';
import { ASPECTS, CUTS, post } from './mg-timeline.mjs';

const run = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = argValue('--dir') ? resolve(argValue('--dir')) : null;
const need = (flag, sub) => {
  const v = argValue(flag) ?? (DIR ? join(DIR, sub) : null);
  if (!v) throw new Error(`pass --dir or ${flag}`);
  return resolve(v);
};
const SHOTS = need('--shots', 'shots');
const MG = need('--mg', 'mg');
const AUDIO = need('--audio', 'audio');
const OUT = need('--out', 'out');
const WORK = join(OUT, 'work');
const CUT_ARG = argValue('--cut') ?? 'both';
const ASPECT_ARG = argValue('--aspect') ?? 'both';
const PRORES = hasFlag('--prores');
const edl = JSON.parse(readFileSync(join(HERE, 'edl.json'), 'utf8'));
const FPS = edl.fps;
const log = (...a) => console.log('[edit]', ...a);

// ---------------------------------------------------------------- 1. checks

const copy = JSON.parse(readFileSync(join(HERE, 'copy.json'), 'utf8'));
const lint = lintTrailerCopy(copy);
if (lint.findings.length) {
  for (const f of lint.findings) console.error(`  ${f.id}: ${f.rule} ${f.message}`);
  throw new Error(`copy gate failed (${lint.findings.length} findings): nothing rendered`);
}
log(`copy gate: ${lint.lines} lines, 0 findings`);

const shotManifest = JSON.parse(readFileSync(join(SHOTS, 'manifest.json'), 'utf8'));
const mgManifest = JSON.parse(readFileSync(join(MG, 'manifest.json'), 'utf8'));
const bad = Object.entries(shotManifest.shots).filter(([, s]) => s.hash && !s.hash.ok);
if (bad.length) throw new Error(`take hash MISMATCH (browser != node): ${bad.map(([k]) => k).join(', ')}`);

/** master frame -> { path, size, shot } per aspect. */
function footageIndex(aspect) {
  const map = new Map();
  for (const [key, s] of Object.entries(shotManifest.shots)) {
    if (s.aspect !== aspect) continue;
    for (const p of s.parts) {
      const dir = join(SHOTS, p.id, aspect);
      for (let f = p.f0; f <= p.f1; f++) {
        const path = join(dir, pad4(f));
        if (existsSync(path)) map.set(f, { path, size: s.size, shot: p.id, key });
      }
    }
  }
  return map;
}

// ---------------------------------------------------------------- helpers

async function pool(jobs, n = Math.max(2, cpus().length - 2)) {
  let i = 0;
  const worker = async () => {
    while (i < jobs.length) await jobs[i++]();
  };
  await Promise.all(Array.from({ length: n }, worker));
}

const ff = (args) => run('ffmpeg', ['-hide_banner', '-v', 'error', '-y', ...args], { maxBuffer: 1 << 26 });

function ffprobe(path) {
  return JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-show_entries', 'format=duration,size,bit_rate:stream=codec_name,profile,width,height,pix_fmt,r_frame_rate,nb_read_frames,duration,sample_rate,channels,bit_rate', '-of', 'json', path], { encoding: 'utf8' }));
}

function loudness(path) {
  const out = execFileSync('sh', ['-c', `ffmpeg -hide_banner -nostats -i "${path}" -map 0:a -af ebur128=peak=true:framelog=quiet -f null - 2>&1`], { encoding: 'utf8' });
  const s = out.slice(out.lastIndexOf('Summary:'));
  const num = (re) => {
    const m = re.exec(s);
    return m ? Number(m[1]) : NaN;
  };
  return { I: num(/I:\s+(-?[\d.]+) LUFS/), LRA: num(/LRA:\s+(-?[\d.]+) LU/), TP: num(/True peak:\s+Peak:\s+(-?[\d.inf]+) dBFS/) };
}

// ---------------------------------------------------------------- 2. base frames

async function buildBase(cut, aspect, dir) {
  const { W, H } = ASPECTS[aspect];
  const foot = footageIndex(aspect);
  const plateDir = join(MG, cut, aspect, 'plate');
  const ovDir = join(MG, cut, aspect, 'overlay');
  const hasPlate = (f) => existsSync(join(plateDir, pad4(f)));
  const plan = framePlan(cut, aspect, edl, { hasPlate, footageSize: (src) => foot.get(src)?.size });
  const missing = plan.filter((p) => p.kind !== 'plate' && !foot.has(p.src)).map((p) => p.f);
  if (missing.length) throw new Error(`${cut}s ${aspect}: no footage for cut frames ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? ' ...' : ''}`);

  const fx = join(dir, 'fx');
  const base = join(dir, 'base');
  const ov = join(dir, 'ov');
  for (const d of [fx, base, ov]) {
    rmSync(d, { recursive: true, force: true });
    mkdirSync(d, { recursive: true });
  }
  const jobs = [];
  const runs = (kind) => {
    const r = [];
    for (const p of plan.filter((q) => q.kind === kind)) {
      const last = r[r.length - 1];
      if (last && p.f === last[1] + 1 && p.src === last[3] + 1) {
        last[1] = p.f;
        last[3] = p.src;
      } else r.push([p.f, p.f, p.src, p.src]);
    }
    return r;
  };
  // plates: rgba -> rgb24 (opaque already), one ffmpeg per run
  for (const [a, b] of runs('plate')) {
    jobs.push(() => ff(['-framerate', `${FPS}`, '-start_number', `${a}`, '-i', join(plateDir, 'f%04d.png'), '-frames:v', `${b - a + 1}`, '-vf', 'format=rgb24', '-start_number', `${a}`, join(fx, 'f%04d.png')]));
  }
  // the 9:16 HUD band: crops of the landscape capture, punched in to full width, over a blurred, darkened copy of it
  for (const p of plan.filter((q) => q.kind === 'band')) {
    const bd = edl.band[aspect];
    const seg = bd.segs.find((x) => p.f >= x.f0 && p.f <= x.f1) ?? bd.segs[0];
    const [cx, cy, cw, ch] = seg.crop;
    const bh = 2 * Math.round((W * ch) / cw / 2);
    const vf = `split[bg][fg];[bg]scale=-2:${H}:flags=bicubic,crop=${W}:${H},gblur=sigma=${bd.blur},colorchannelmixer=rr=${bd.darken}:gg=${bd.darken}:bb=${bd.darken}[b];`
      + `[fg]crop=${cw}:${ch}:${cx}:${cy},scale=${W}:${bh}:flags=lanczos[f];[b][f]overlay=0:${Math.round((H - bh) / 2)}:format=rgb,format=rgb24`;
    jobs.push(() => ff(['-i', foot.get(p.src).path, '-filter_complex', vf, '-frames:v', '1', join(fx, pad4(p.f))]));
  }
  // push-ins and bumps: per frame (scale about the anchor, crop back)
  for (const p of plan.filter((q) => q.kind === 'zoom')) {
    const g = zoomGeometry(W, H, p.zoom);
    jobs.push(() => ff(['-i', foot.get(p.src).path, '-vf', `scale=${g.sw}:${g.sh}:flags=lanczos,crop=${W}:${H}:${g.x}:${g.y},format=rgb24`, '-frames:v', '1', join(fx, pad4(p.f))]));
  }
  await pool(jobs);

  // a blank overlay frame for frames with no motion graphics
  const blank = join(dir, 'blank.png');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `color=c=black@0.0:s=${W}x${H},format=rgba`, '-frames:v', '1', blank]);
  let nOv = 0;
  for (const p of plan) {
    const src = p.kind === 'footage' ? foot.get(p.src).path : join(fx, pad4(p.f));
    if (!existsSync(src)) throw new Error(`${cut}s ${aspect}: missing base frame ${p.f} (${p.kind})`);
    symlinkSync(src, join(base, pad4(p.f)));
    const o = join(ovDir, pad4(p.f));
    if (existsSync(o)) nOv++;
    symlinkSync(existsSync(o) ? o : blank, join(ov, pad4(p.f)));
  }
  // vignette mask (black with alpha), the same for every graded frame
  const vig = join(dir, 'vignette.png');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `color=c=black:s=${W}x${H},format=rgba`, '-vf', `geq=r=0:g=0:b=0:a='${vignetteAlphaExpr(W, H, edl.grade.vignette)}'`, '-frames:v', '1', vig]);
  const counts = plan.reduce((m, p) => ((m[p.kind] = (m[p.kind] ?? 0) + 1), m), {});
  const shots = [...new Set(plan.filter((p) => foot.has(p.src) && p.kind !== 'plate').map((p) => foot.get(p.src).shot))];
  return { plan, counts, overlayFrames: nOv, shots, base, ov, vig };
}

// ---------------------------------------------------------------- 3. the picture graph

/**
 * Flashes as additive light, never a solid fill: on each flash frame the picture is screened with a soft, lifted copy
 * of itself (a bloom) at the flash strength, and at half of it on the next frame. Returns filtergraph chains.
 */
export function bloomGraph(cut, inp, out) {
  const levels = new Map();
  for (const fl of post(cut).flash) {
    for (const [n, a] of [[fl.f, fl.a], [fl.f + 1, fl.a / 2]]) {
      const k = a.toFixed(3);
      if (!levels.has(k)) levels.set(k, []);
      levels.get(k).push(n);
    }
  }
  if (!levels.size) return [`${inp}null${out}`];
  const ks = [...levels.keys()];
  const g = [`${inp}format=gbrp,split=2[bl_src][bl_b]`, `[bl_b]gblur=sigma=28,eq=brightness=0.12:saturation=1.1,split=${ks.length}${ks.map((_, i) => `[bl${i}]`).join('')}`];
  let cur = '[bl_src]';
  ks.forEach((k, i) => {
    const en = levels.get(k).map((n) => `eq(n,${n})`).join('+');
    const next = i === ks.length - 1 ? '[bl_out]' : `[bx${i}]`;
    g.push(`${cur}[bl${i}]blend=all_mode=screen:all_opacity=${k}:enable='${en}'${next}`);
    cur = next;
  });
  g.push(`[bl_out]format=rgb24${out}`);
  return g;
}

function videoGraph(cut, aspect) {
  const { W, H } = ASPECTS[aspect];
  const M = edl.shakeMargin;
  const sh = shakeExpr(post(cut).shake);
  const g = gradeWindows(cut, edl);
  const G = rangesExpr(g.graded);
  const v = [];
  v.push(`[0:v]format=rgb24,pad=${W + 2 * M}:${H + 2 * M}:${M}:${M},fillborders=left=${M}:right=${M}:top=${M}:bottom=${M}:mode=mirror`);
  v.push(`crop=${W}:${H}:x='${M}+clip(${sh.x},-${M},${M})':y='${M}+clip(${sh.y},-${M},${M})'`);
  v.push(`${edl.grade.sharpen}:enable='${G}'`);
  v.push(`${edl.grade.eq}:enable='${G}'`);
  for (const [a, b, s] of g.desat) v.push(`eq=saturation=${s}:enable='between(n,${a},${b})'`);
  v.push(`${edl.grade.curves}:enable='${G}'`);
  v.push(`${edl.grade.colorbalance}:enable='${G}'`);
  v.push(`rgbashift=rh=${edl.chroma.strong}:bh=-${edl.chroma.strong}:enable='${rangesExpr(g.strong)}'`);
  v.push(`rgbashift=rh=${edl.chroma.light}:bh=-${edl.chroma.light}:enable='${rangesExpr(g.light)}'[g]`);
  const graph = [
    v.join(','),
    `[2:v]format=rgba[vig]`,
    `[g][vig]overlay=0:0:format=rgb:enable='${G}'[gv]`,
    `[1:v]format=rgba[ov]`,
    `[gv][ov]overlay=0:0:format=rgb[c0]`,
    ...bloomGraph(cut, '[c0]', '[c]'),
    PRORES ? '[c]split=2[c1][c2]' : '[c]null[c1]',
    // grain in RGB before the 4:2:0 conversion: it dithers smooth gradients (the blurred plates) instead of banding
    `[c1]format=gbrp,${edl.grade.grain}${edl.grade.grainAll ? '' : `:enable='${G}'`},scale=out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int,format=yuv420p[vout]`,
  ];
  if (PRORES) graph.push(`[c2]format=gbrp,${edl.grade.grain}${edl.grade.grainAll ? '' : `:enable='${G}'`},scale=out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int,format=yuv422p10le[vpr]`);
  return graph.join(';');
}

// ---------------------------------------------------------------- 4. the audio mix

function duckGain(key, n, d) {
  const look = Math.round((d.lookaheadMs / 1000) * SR);
  const at = Math.exp(-1 / ((d.attackMs / 1000) * SR));
  const rt = Math.exp(-1 / ((d.releaseMs / 1000) * SR));
  const gain = new Float32Array(n);
  let env = 0;
  for (let i = 0; i < n; i++) {
    const j = Math.min(n - 1, i + look);
    const x = key[j];
    env = x > env ? at * env + (1 - at) * x : rt * env + (1 - rt) * x;
    const over = 20 * Math.log10(env + 1e-9) - d.thresholdDb;
    gain[i] = over > 0 ? dbToGain(-Math.min(d.maxDb, over * (1 - 1 / d.ratio))) : 1;
  }
  return gain;
}

function measureWav(path) {
  return loudness(path);
}

function mixAudio(cut) {
  const a = edl.audio;
  const read = (k) => readWav(join(AUDIO, 'stems', `${k}-${cut}.wav`));
  const music = read('music');
  const sfx = read('sfx');
  const game = read('game');
  const n = CUTS[cut] * (SR / FPS);
  for (const s of [music, sfx, game]) if (s.sr !== SR || s.L.length !== n) throw new Error(`stem for ${cut}s: ${s.sr} Hz, ${s.L.length} samples (want ${SR} Hz, ${n})`);
  const key = new Float32Array(n);
  for (let i = 0; i < n; i++) key[i] = Math.max(Math.abs(sfx.L[i] + game.L[i]), Math.abs(sfx.R[i] + game.R[i]));
  const duck = duckGain(key, n, a.duck);
  let maxDuck = 1;
  const pre = new Bus(n);
  for (let i = 0; i < n; i++) {
    maxDuck = Math.min(maxDuck, duck[i]);
    pre.L[i] = music.L[i] * duck[i] + sfx.L[i] + game.L[i];
    pre.R[i] = music.R[i] * duck[i] + sfx.R[i] + game.R[i];
  }
  // the energy curve: the montage sits under the open, the climax and the end card
  for (const [f0, f1, db] of a.sections?.[cut] ?? []) {
    const r = 8 * (SR / FPS);
    const s0 = f0 * (SR / FPS);
    const s1 = (f1 + 1) * (SR / FPS);
    const g = dbToGain(db);
    pre.gainCurve((i) => (i < s0 + r ? 1 + (g - 1) * ((i - s0) / r) : i > s1 - r ? g + (1 - g) * ((i - (s1 - r)) / r) : g), s0, s1);
  }
  compress(pre, a.glue);
  const fadeFrom = (CUTS[cut] - a.fadeFrames) * (SR / FPS);
  const silenceFrom = (CUTS[cut] - a.silenceFrames) * (SR / FPS);
  const tmp = join(WORK, `mix-${cut}.wav`);
  mkdirSync(WORK, { recursive: true });
  let gainDb = 0;
  let lm = null;
  for (let it = 0; it < 6; it++) {
    const out = pre.clone();
    out.gainCurve(() => dbToGain(gainDb));
    limit(out, a.ceilingDb, 0.0015, 0.09);
    out.gainCurve((i) => Math.max(0, 1 - (i - fadeFrom) / (silenceFrom - fadeFrom)) ** 2, fadeFrom, silenceFrom);
    for (let i = silenceFrom; i < n; i++) out.L[i] = out.R[i] = 0;
    writeWav(tmp, out.L, out.R);
    lm = measureWav(tmp);
    if (Math.abs(lm.I - a.targetLufs) < 0.1 && lm.TP <= a.maxTruePeakWavDb) break;
    gainDb += a.targetLufs - lm.I;
  }
  return { path: tmp, loudness: lm, gainDb: +gainDb.toFixed(2), maxDuckDb: +(20 * Math.log10(maxDuck)).toFixed(1) };
}

// ---------------------------------------------------------------- 5. encode, verify, poster

async function encode(cut, aspect, b, mix, file) {
  const n = CUTS[cut];
  const out = join(OUT, file);
  const args = [
    '-framerate', `${FPS}`, '-start_number', '0', '-i', join(b.base, 'f%04d.png'),
    '-framerate', `${FPS}`, '-start_number', '0', '-i', join(b.ov, 'f%04d.png'),
    '-loop', '1', '-framerate', `${FPS}`, '-i', b.vig,
    '-i', mix.path,
    '-filter_complex', videoGraph(cut, aspect),
    '-map', '[vout]', '-map', '3:a',
    '-frames:v', `${n}`, '-r', `${FPS}`,
    ...edl.video.codec, '-x264-params', 'aq-mode=3',
    '-c:a', 'aac', '-b:a', edl.audio.aacBitrate, '-ar', `${SR}`,
    '-t', (n / FPS).toFixed(3),
    '-movflags', '+faststart', '-metadata', 'title=Pawlegends trailer', out,
  ];
  if (PRORES) args.push('-map', '[vpr]', '-map', '3:a', '-frames:v', `${n}`, '-r', `${FPS}`, ...edl.video.prores, '-c:a', 'pcm_s24le', '-t', (n / FPS).toFixed(3), out.replace(/\.mp4$/, '.mov'));
  const t0 = Date.now();
  await ff(args);
  log(`${file}: encoded in ${((Date.now() - t0) / 1000).toFixed(0)} s${PRORES ? ' (+ ProRes 422 HQ .mov from the same graph)' : ''}`);
  return out;
}

function verify(path, cut, aspect) {
  const { W, H } = ASPECTS[aspect];
  const p = ffprobe(path);
  const vs = p.streams.find((s) => s.codec_name === 'h264');
  const as = p.streams.find((s) => s.codec_name === 'aac');
  const loud = loudness(path);
  const problems = [];
  if (!vs || vs.width !== W || vs.height !== H) problems.push(`video ${vs?.width}x${vs?.height}`);
  if (vs && Number(vs.nb_read_frames) !== CUTS[cut]) problems.push(`frames ${vs.nb_read_frames} != ${CUTS[cut]}`);
  if (vs && vs.r_frame_rate !== `${FPS}/1`) problems.push(`rate ${vs.r_frame_rate}`);
  if (vs && vs.pix_fmt !== 'yuv420p') problems.push(`pix_fmt ${vs.pix_fmt}`);
  if (Math.abs(Number(p.format.duration) - CUTS[cut] / FPS) > 0.0005) problems.push(`duration ${p.format.duration}`);
  if (loud.TP > edl.audio.maxTruePeakDb) problems.push(`true peak ${loud.TP} dBTP`);
  return {
    file: path,
    duration: Number(p.format.duration),
    videoDuration: Number(vs?.duration),
    audioDuration: Number(as?.duration),
    frames: Number(vs?.nb_read_frames),
    size: `${vs?.width}x${vs?.height}`,
    video: `${vs?.codec_name} ${vs?.profile} ${vs?.pix_fmt} ${vs?.r_frame_rate}`,
    audio: `${as?.codec_name} ${as?.sample_rate} Hz ${as?.channels} ch ${Math.round(Number(as?.bit_rate) / 1000)} kb/s`,
    bytes: Number(p.format.size),
    loudness: loud,
    problems,
  };
}

async function poster(aspect) {
  const { W, H } = ASPECTS[aspect];
  const pf = edl.poster;
  const foot = footageIndex(aspect).get(pf.frame);
  const ov = join(MG, '30', aspect, 'overlay', pad4(pf.overlayFrame));
  if (!foot || !existsSync(ov)) return null;
  const out = join(OUT, pf.files[aspect]);
  // the frame graded like the edit (no grain), a cocoa wash behind the logo for legibility, then the end-card graphics
  const g = edl.grade;
  const wash = `color=c=0x5A3B2E:s=${W}x${H},format=rgba,geq=r=90:g=59:b=46:a='170*exp(-pow((Y-${aspect === '9x16' ? 1000 : 600})/${aspect === '9x16' ? 520 : 380},2))'`;
  await ff([
    '-i', foot.path, '-i', join(OUT, 'work', `30-${aspect}`, 'vignette.png'), '-f', 'lavfi', '-i', wash, '-i', ov,
    '-filter_complex', `[0:v]format=rgb24,${g.sharpen},${g.eq},${g.curves},${g.colorbalance}[a];[a][1:v]overlay=format=rgb[b];[b][2:v]overlay=format=rgb[c];[c][3:v]overlay=format=rgb,format=rgb24`,
    '-frames:v', '1', out,
  ]);
  return out;
}

// ---------------------------------------------------------------- main

mkdirSync(WORK, { recursive: true });
const report = { generated: 'tools/trailer/edit.mjs', copyGate: { lines: lint.lines, findings: 0 }, takesHashOk: true, mixes: {}, masters: [], posters: [] };
const outputs = edl.outputs.filter((o) => (CUT_ARG === 'both' || o.cut === CUT_ARG) && (ASPECT_ARG === 'both' || o.aspect === ASPECT_ARG));
const mixes = {};
for (const cut of [...new Set(outputs.map((o) => o.cut))]) {
  const t0 = Date.now();
  mixes[cut] = mixAudio(cut);
  report.mixes[cut] = { ...mixes[cut], wav: join(OUT, `pawlegends-trailer-${cut}s-mix.wav`) };
  execFileSync('cp', [mixes[cut].path, report.mixes[cut].wav]);
  const l = mixes[cut].loudness;
  log(`mix ${cut}s: I ${l.I} LUFS, LRA ${l.LRA} LU, TP ${l.TP} dBTP, gain ${mixes[cut].gainDb} dB, deepest duck ${mixes[cut].maxDuckDb} dB (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}
if (hasFlag('--mix-only')) {
  writeFileSync(join(OUT, 'report-mix.json'), `${JSON.stringify(report.mixes, null, 1)}\n`);
  process.exit(0);
}
for (const o of outputs) {
  const dir = join(WORK, `${o.cut}-${o.aspect}`);
  mkdirSync(dir, { recursive: true });
  const t0 = Date.now();
  const b = await buildBase(o.cut, o.aspect, dir);
  log(`${o.cut}s ${o.aspect}: base ${JSON.stringify(b.counts)}, ${b.overlayFrames} overlay frames, ${b.shots.length} shots (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  const path = await encode(o.cut, o.aspect, b, mixes[o.cut], o.file);
  const v = verify(path, o.cut, o.aspect);
  report.masters.push({ cut: o.cut, aspect: o.aspect, base: b.counts, shots: b.shots, ...v });
  log(`${o.file}: ${v.duration.toFixed(3)} s, ${v.frames} frames, ${v.size}, I ${v.loudness.I} LUFS, TP ${v.loudness.TP} dBTP${v.problems.length ? `, PROBLEMS: ${v.problems.join('; ')}` : ''}`);
}
for (const aspect of ['16x9', '9x16']) {
  if (!existsSync(join(WORK, `30-${aspect}`, 'vignette.png'))) continue;
  const p = await poster(aspect);
  if (p) {
    report.posters.push(p);
    log(`poster ${p}`);
  }
}
writeFileSync(join(OUT, 'report.json'), `${JSON.stringify(report, null, 1)}\n`);
log(join(OUT, 'report.json'));
if (!hasFlag('--keep-work')) {
  for (const d of readdirSync(WORK)) {
    const p = join(WORK, d);
    if (statSync(p).isDirectory()) rmSync(join(p, 'fx'), { recursive: true, force: true });
  }
}
const failed = report.masters.filter((m) => m.problems.length);
if (failed.length) {
  console.error(`[edit] ${failed.length} master(s) failed verification`);
  process.exit(1);
}
