#!/usr/bin/env node
/**
 * Quality self-check for trailer takes and masters (trailers-hq). Measures every video and, with `--report`, the
 * record tool's own capture facts, then prints one JSON row per file and fails (exit 1) on a hard miss.
 *
 *   node tools/clips/quality-check.mjs <video...> [--report record-report.json] [--crop x,y,w,h] [--sample 6]
 *                                      [--min-detail 0.012] [--json out.json]
 *
 * Per video (ffprobe + ffmpeg, `--sample` frames a second, inside `--crop` given as fractions of the frame):
 * - stream: codec, profile, pixel format, size, frame rate, bit rate, frame count;
 * - `edge`: the mean Sobel gradient of the luma (0-255; higher = more fine detail and crisper edges);
 * - `blur`: ffmpeg's blurdetect mean (lower = sharper);
 * - `detail`: 1 - SSIM(frame, the frame halved and scaled back up). A frame that was upscaled from a smaller render (or
 *   softened by a lossy chain) has almost nothing above half resolution and scores near 0; real full-resolution
 *   detail scores higher. This is the effective-resolution check;
 *   calibration (whole frame, 3 fps): the round 1-4 9:16 takes (810x1440 upscaled) 0.008, HQ takes 0.015-0.019 on
 *   Geode Quarry and Pawball Park (a 0.3,0.3,0.4,0.4 crop on the fight: 0.016 vs 0.037-0.039). Default fail 0.012;
 * - `dupFrames`: frames bit-identical (mpdecimate, zero threshold) to the one before, at the full frame rate: a capture
 *   that dropped and repeated frames shows them (an intended freeze-frame shows too: read it against the edit);
 * - `freezes`: freezedetect spans of 0.25 s or more.
 * From `--report` (tools/clips/record.mjs --report): the WebGL renderer string, the drawing buffer at the first and last
 * frame, the grabbed PNG size, the supersample factor, frames written vs expected and whether the render tick ran
 * monotonically (deterministic stepping, no dropped frames).
 *
 * Hard fails: a software renderer, a buffer or a grabbed frame smaller than output x ss, frames written != expected, a tick that ran
 * backwards, a stream under 1080 px on its short side, a frame rate under 60 for a take, `detail` under `--min-detail`.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { argValue, positionals } from '../lib/args.mjs';

const FFMPEG = existsSync('/opt/homebrew/bin/ffmpeg') ? '/opt/homebrew/bin/ffmpeg' : 'ffmpeg';
const FFPROBE = existsSync('/opt/homebrew/bin/ffprobe') ? '/opt/homebrew/bin/ffprobe' : 'ffprobe';
const files = positionals(['--report', '--crop', '--sample', '--min-detail', '--json', '--min-fps']);
if (!files.length) {
  console.error('usage: node tools/clips/quality-check.mjs <video...> [--report report.json] [--crop x,y,w,h] [--sample 6]');
  process.exit(2);
}
const SAMPLE = Number(argValue('--sample') ?? 6);
const MIN_DETAIL = Number(argValue('--min-detail') ?? 0.012);
const MIN_FPS = Number(argValue('--min-fps') ?? 60);
const crop = argValue('--crop')?.split(',').map(Number) ?? null;
const report = argValue('--report') ? JSON.parse(readFileSync(argValue('--report'), 'utf8')) : [];
const T = ['-threads', '4'];

const cropF = crop ? `crop=trunc(iw*${crop[2]}/2)*2:trunc(ih*${crop[3]}/2)*2:trunc(iw*${crop[0]}):trunc(ih*${crop[1]}),` : '';

function run(args) {
  const r = spawnSync(FFMPEG, ['-hide_banner', '-nostats', ...T, ...args], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  return `${r.stdout ?? ''}\n${r.stderr ?? ''}`;
}

const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);
const r4 = (v) => (Number.isFinite(v) ? +v.toFixed(4) : null);

/** Stream facts. */
function probe(f) {
  const j = JSON.parse(execFileSync(FFPROBE, ['-v', 'error', '-select_streams', 'v:0', '-count_packets', '-show_entries', 'stream=codec_name,profile,pix_fmt,width,height,r_frame_rate,bit_rate,nb_read_packets,color_range,color_space:format=duration,bit_rate,size', '-of', 'json', f], { encoding: 'utf8' }));
  const s = j.streams[0];
  const [n, d] = s.r_frame_rate.split('/').map(Number);
  const dur = +j.format.duration;
  return {
    codec: `${s.codec_name} ${s.profile ?? ''}`.trim(),
    pixFmt: s.pix_fmt,
    range: s.color_range ?? null,
    matrix: s.color_space ?? null,
    size: [s.width, s.height],
    fps: +(n / d).toFixed(3),
    frames: Number(s.nb_read_packets),
    seconds: +dur.toFixed(3),
    mbps: +(((Number(s.bit_rate) || (Number(j.format.size) * 8) / dur) / 1e6).toFixed(1)),
  };
}

/** Mean Sobel edge energy and blurdetect on `SAMPLE` frames a second. */
function sharpness(f) {
  const out = run(['-i', f, '-vf', `fps=${SAMPLE},${cropF}format=gray,sobel,signalstats,metadata=print:key=lavfi.signalstats.YAVG`, '-f', 'null', '-']);
  const edge = mean([...out.matchAll(/lavfi\.signalstats\.YAVG=([\d.]+)/g)].map((m) => +m[1]));
  const bo = run(['-i', f, '-vf', `fps=${SAMPLE},${cropF}format=gray,blurdetect=block_width=32:block_height=32`, '-f', 'null', '-']);
  const blur = +(/blur mean:\s*([\d.]+)/.exec(bo)?.[1] ?? NaN);
  return { edge: r4(edge), blur: r4(blur) };
}

/** 1 - SSIM(frame, half-and-back): detail above half resolution (the effective-resolution check). */
function detail(f) {
  const g = `fps=${SAMPLE},${cropF}format=gray,split[a][b];[b]scale=iw/2:ih/2:flags=area,scale=iw*2:ih*2:flags=bicubic[c];[a][c]ssim`;
  const out = run(['-i', f, '-filter_complex', g, '-f', 'null', '-']);
  const all = +(/SSIM Y:([\d.]+)/.exec(out)?.[1] ?? /All:([\d.]+)/.exec(out)?.[1] ?? NaN);
  return r4(1 - all);
}

/** Bit-identical repeats at the full rate and freeze spans. */
function repeats(f, frames) {
  const out = run(['-i', f, '-vf', 'mpdecimate=hi=1:lo=1:frac=0:max=0', '-fps_mode', 'vfr', '-f', 'null', '-']);
  const kept = Number([...out.matchAll(/frame=\s*(\d+)/g)].pop()?.[1] ?? NaN);
  const fr = run(['-i', f, '-vf', 'freezedetect=n=0.0005:d=0.25', '-map', '0:v:0', '-f', 'null', '-']);
  const freezes = [...fr.matchAll(/freeze_start: ([\d.]+)[\s\S]*?freeze_duration: ([\d.]+)/g)].map((m) => [+(+m[1]).toFixed(2), +(+m[2]).toFixed(2)]);
  return { dupFrames: Number.isFinite(kept) ? Math.max(0, frames - kept) : null, freezes };
}

const rows = [];
let bad = 0;
for (const f of files) {
  const st = probe(f);
  const row = { file: basename(f), ...st, ...sharpness(f), detail: detail(f), ...repeats(f, st.frames) };
  const rep = report.find((r) => r.out && basename(r.out) === basename(f));
  const fails = [];
  if (rep?.quality) {
    const q = rep.quality;
    row.capture = { mode: q.mode, renderer: q.renderer, ss: q.ss, renderDpr: q.renderDpr, buffer: q.bufferStart, bufferEnd: q.bufferEnd, grabbed: q.grabbed, output: q.output, frames: `${q.framesWritten}/${q.framesExpected}`, ticksMonotonic: q.ticksMonotonic, msPerGrab: q.grabMsPerFrame, tier: q.settings?.tier, shadowMap: q.settings?.shadowMap, bloom: q.settings?.bloom, resScale: q.settings?.resScale, map: q.map, scheme: q.scheme };
    if (/swiftshader|llvmpipe|software/i.test(q.renderer ?? '')) fails.push(`software renderer ${q.renderer}`);
    const want = [q.output[0] * q.ss, q.output[1] * q.ss];
    for (const b of [q.bufferStart, q.bufferEnd]) if (!b || b[0] < want[0] - 1 || b[1] < want[1] - 1) fails.push(`buffer ${b?.join('x')} < ${want.join('x')}`);
    if (q.grabbed && (q.grabbed[0] < want[0] - 1 || q.grabbed[1] < want[1] - 1)) fails.push(`grabbed ${q.grabbed.join('x')} < ${want.join('x')}`);
    if (q.framesWritten !== q.framesExpected) fails.push(`frames ${q.framesWritten}/${q.framesExpected}`);
    if (!q.ticksMonotonic) fails.push('render tick ran backwards');
  } else if (report.length) row.capture = null;
  if (Math.min(...st.size) < 1080) fails.push(`short side ${Math.min(...st.size)} < 1080`);
  if (rep && st.fps < MIN_FPS) fails.push(`fps ${st.fps} < ${MIN_FPS}`);
  if (row.detail !== null && row.detail < MIN_DETAIL) fails.push(`detail ${row.detail} < ${MIN_DETAIL} (upscaled or soft)`);
  row.pass = fails.length === 0;
  row.fails = fails;
  if (fails.length) bad++;
  rows.push(row);
  console.log(JSON.stringify(row));
}
if (argValue('--json')) writeFileSync(argValue('--json'), JSON.stringify(rows, null, 2) + '\n');
process.exit(bad ? 1 : 0);
