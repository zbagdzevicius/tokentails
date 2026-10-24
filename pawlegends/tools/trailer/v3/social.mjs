#!/usr/bin/env node
/**
 * Trailer v3 social encodes (decision G24): one H.264 copy of each master, at most 12 MB, for upload to social
 * platforms, named `<master>-social.mp4` next to it.
 *
 *   node tools/trailer/v3/social.mjs --dir DIR [--target-mb 11.5] [--sheets DIR]
 *
 * DIR holds the masters from v3/edit.mjs (pawlegends-trailer-{30s,15s}-{1080p,vertical}.mp4). Each one is re-encoded
 * x264 two-pass, preset veryslow, at the bitrate that lands on the target size, then measured: size inside the band,
 * duration equal to the master, frame count equal to the master's at the copy's rate, dimensions equal, SSIM against
 * the master over the whole file and over the cut's hardest stretch (the core fight and burst); rows go to
 * DIR/social.json. A size outside the band is retried once with the bitrate scaled to the miss.
 *
 * v3.10 (weakness 4: the 30 s 16:9 copy at 2.6 Mbit/s broke the dusty core-base teamfight into blocks; v3.6 fixed
 * that with an 18.5 MB file): every copy is back under 12 MB. The 30 s copies run at 30 fps (every second master
 * frame, full 1920x1080 / 1080x1920): at 11.5 MB that scored SSIM 0.991 on the core fight against 0.987 for 60 fps and
 * 0.985 / 0.989 for 1600x900 at 60 / 30 fps, and read crisper by eye in the dust. The 15 s copies keep 60 fps
 * (about 6 Mbit/s). Tuned AQ (aq-mode 3, strength 0.85), psy-rd 1.0:0.15, light deblock, no `-tune animation`.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { argValue } from '../../lib/args.mjs';

export const MB = 1e6;
/** v3.10: back to at most 12 MB per copy. */
export const SIZE_BAND = [8 * MB, 12 * MB];
export const TARGET_MB = 11.5;
/** v3.10: per cut length: the 30 s copies at 30 fps, the 15 s copies at 60 fps. */
export const PROFILE = { 30: { fps: 30, audioKbps: 128 }, 15: { fps: 60, audioKbps: 160 } };
export const profileFor = (seconds) => PROFILE[seconds > 20 ? 30 : 15];
/** The per-segment SSIM floor (social vs master at the copy's rate) on each cut's hardest stretch. */
export const SSIM_FLOOR = 0.99;
/** Master frames (60 fps) of the hardest stretch: the core fight and burst. */
export const HARD_SEGMENT = { 30: [900, 1139], 15: [475, 639] };
/** Container overhead (moov, sample tables) as a share of the payload. */
export const MUX_OVERHEAD = 0.012;
export const X264_PARAMS = 'aq-mode=3:aq-strength=0.85:psy-rd=1.0,0.15:deblock=-1,-1:bframes=5';

/** Video bitrate (kbit/s) that lands a file of `seconds` on `targetBytes` with `audioKbps` of AAC. */
export function socialBitrate(seconds, { targetBytes = TARGET_MB * MB, audioKbps = 160 } = {}) {
  if (!(seconds > 0)) throw new Error('duration must be positive');
  const totalKbps = (targetBytes * 8) / (1 + MUX_OVERHEAD) / seconds / 1000;
  const video = Math.floor(totalKbps - audioKbps);
  if (video < 500) throw new Error(`target too small for ${seconds} s: ${video} kbit/s video`);
  return video;
}

/** The file size (bytes) a cut of `seconds` lands on at `kbps` video plus `audioKbps` AAC. */
export function bytesFor(seconds, kbps, audioKbps = 160) {
  return (((kbps + audioKbps) * 1000 * seconds) / 8) * (1 + MUX_OVERHEAD);
}

/** Bitrate for a retry after a file came out `gotBytes` instead of `targetBytes`. */
export function retryBitrate(kbps, gotBytes, targetBytes = TARGET_MB * MB) {
  return Math.floor(kbps * (targetBytes / gotBytes));
}

/** SSIM fails: the hard segment below SSIM_FLOOR. */
export function ssimFails(seg, floor = SSIM_FLOOR) {
  return seg != null && seg < floor ? [`SSIM ${seg} < ${floor} on the hard segment`] : [];
}

/** Frames a copy at `fps` must hold for a 60 fps master of `masterFrames`. */
export const expectedFrames = (masterFrames, fps) => Math.round((masterFrames * fps) / 60);

export const inBand = (bytes) => bytes >= SIZE_BAND[0] && bytes <= SIZE_BAND[1];
export const socialName = (master) => master.replace(/\.mp4$/, '-social.mp4');

const probe = (file) => {
  const out = execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries',
    'stream=nb_read_frames,width,height,r_frame_rate:format=duration', '-of', 'json', file]).toString();
  const j = JSON.parse(out);
  return { frames: Number(j.streams[0].nb_read_frames), w: j.streams[0].width, h: j.streams[0].height,
    fps: j.streams[0].r_frame_rate, duration: Number(j.format.duration) };
};

function encode(src, dst, kbps, { fps, audioKbps }) {
  const passlog = join(tmpdir(), `social-${process.pid}-${Date.now()}`);
  const common = ['-hide_banner', '-loglevel', 'error', '-y', '-i', src, '-map', '0:v:0', '-map', '0:a:0',
    ...(fps === 60 ? [] : ['-vf', `fps=${fps}`]),
    '-c:v', 'libx264', '-preset', 'veryslow', '-profile:v', 'high', '-level', '4.2', '-pix_fmt', 'yuv420p',
    '-b:v', `${kbps}k`, '-maxrate', `${kbps * 2}k`, '-bufsize', `${kbps * 3}k`,
    '-x264-params', X264_PARAMS, '-g', String(fps * 2), '-passlogfile', passlog];
  execFileSync('ffmpeg', [...common, '-pass', '1', '-an', '-f', 'mp4', '/dev/null'], { stdio: 'inherit' });
  execFileSync('ffmpeg', [...common, '-pass', '2', '-c:a', 'aac', '-b:a', `${audioKbps}k`, '-ar', '48000',
    '-movflags', '+faststart', dst], { stdio: 'inherit' });
  for (const s of ['-0.log', '-0.log.mbtree']) rmSync(passlog + s, { force: true });
  return statSync(dst).size;
}

/** SSIM of `social` against `master` brought to the copy's rate; `range` = master frames [a, b] (60 fps) only. */
function ssimAll(master, social, fps, range = null) {
  const trim = range ? `,trim=start=${range[0] / 60}:end=${(range[1] + 1) / 60},setpts=PTS-STARTPTS` : '';
  const m = fps === 60 ? 'null' : `fps=${fps}`;
  const res = spawnSync('ffmpeg', ['-hide_banner', '-i', social, '-i', master, '-lavfi',
    `[0:v]null${trim}[a];[1:v]${m}${trim}[b];[a][b]ssim`, '-f', 'null', '-']).stderr.toString();
  const r = /All:([\d.]+)/.exec(res);
  return r ? Number(r[1]) : null;
}

/** Integrated loudness (LUFS) and true peak (dBTP) of a file's audio. */
function loudness(file) {
  const res = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-'])
    .stderr.toString();
  const tail = res.slice(res.lastIndexOf('Summary:'));
  const I = /I:\s+(-?[\d.]+) LUFS/.exec(tail);
  const TP = /Peak:\s+(-?[\d.]+) dBFS/.exec(tail);
  return { I: I ? Number(I[1]) : null, TP: TP ? Number(TP[1]) : null };
}

function sheets(master, social, out, times) {
  mkdirSync(out, { recursive: true });
  const base = master.split('/').pop().replace(/\.mp4$/, '');
  for (const t of times) {
    const png = join(out, `${base}-t${String(t).replace('.', '_')}.png`);
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-ss', `${t}`, '-i', master, '-ss', `${t}`,
      '-i', social, '-frames:v', '1', '-filter_complex', '[0:v][1:v]hstack', png]);
  }
}

async function main() {
  const dir = resolve(argValue('--dir') ?? '.');
  const target = Number(argValue('--target-mb') ?? TARGET_MB) * MB;
  const sheetDir = argValue('--sheets');
  const masters = ['30s-1080p', '30s-vertical', '15s-1080p', '15s-vertical']
    .map((k) => join(dir, `pawlegends-trailer-${k}.mp4`)).filter(existsSync);
  if (!masters.length) throw new Error(`no masters in ${dir}`);
  const report = [];
  for (const m of masters) {
    const src = probe(m);
    const prof = profileFor(src.duration);
    const dst = socialName(m);
    let kbps = socialBitrate(src.duration, { targetBytes: target, audioKbps: prof.audioKbps });
    let size = encode(m, dst, kbps, prof);
    if (!inBand(size)) {
      kbps = retryBitrate(kbps, size, target);
      size = encode(m, dst, kbps, prof);
    }
    const seg = HARD_SEGMENT[src.duration > 20 ? 30 : 15];
    const got = probe(dst);
    const row = { file: dst, bytes: size, mb: +(size / MB).toFixed(2), kbps, audioKbps: prof.audioKbps,
      frames: got.frames, duration: +got.duration.toFixed(3), size: `${got.w}x${got.h}`, fps: got.fps,
      ssim: ssimAll(m, dst, prof.fps), ssimHard: ssimAll(m, dst, prof.fps, seg), hardFrames: seg, loudness: loudness(dst), fails: [] };
    row.fails.push(...ssimFails(row.ssimHard));
    if (!inBand(size)) row.fails.push('SIZE');
    const want = expectedFrames(src.frames, prof.fps);
    if (got.frames !== want) row.fails.push(`FRAMES ${got.frames} != ${want}`);
    if (Math.abs(got.duration - src.duration) > 0.05) row.fails.push(`DURATION ${got.duration} != ${src.duration}`);
    if (got.w !== src.w || got.h !== src.h) row.fails.push('DIMENSIONS');
    report.push(row);
    console.log('[social]', JSON.stringify(row));
    if (sheetDir) sheets(m, dst, resolve(sheetDir), src.duration > 20 ? [1.5, 4, 9, 14, 16, 17.5, 18.1, 22.5, 27] : [1.5, 5, 8, 9.5, 10.5, 11.5, 13.5]);
  }
  writeFileSync(join(dir, 'social.json'), `${JSON.stringify(report, null, 1)}\n`);
  // v3.10: the rows also go into the run's report.json (`social`, keyed by cut and aspect, paths relative to DIR)
  const rep = join(dir, 'report.json');
  if (existsSync(rep)) {
    const r = JSON.parse(readFileSync(rep, 'utf8'));
    r.social = Object.fromEntries(report.map((row) => {
      const k = /trailer-(\d+)s-(1080p|vertical)/.exec(row.file);
      return [`${k[1]}/${k[2] === 'vertical' ? '9x16' : '16x9'}`, { ...row, file: row.file.split('/').pop() }];
    }));
    writeFileSync(rep, `${JSON.stringify(r, null, 1)}\n`);
  }
  if (report.some((r) => r.fails.length)) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
