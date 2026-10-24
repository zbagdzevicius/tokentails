#!/usr/bin/env node
/**
 * Trailer v3 social encodes (decision G24): one 8-12 MB H.264 copy of each master for upload to social platforms,
 * named `<master>-social.mp4` next to it.
 *
 *   node tools/trailer/v3/social.mjs --dir DIR [--target-mb 10.5] [--audio-kbps 160]
 *
 * DIR holds the masters from v3/edit.mjs (pawlegends-trailer-{30s,15s}-{1080p,vertical}.mp4). Each one is re-encoded
 * two-pass at the bitrate that lands on the target size (x264 High, preset slower, aq-mode 3 against banding in the
 * dark gradients, 60 fps kept, AAC 48 kHz), then measured: size inside 8-12 MB, duration and frame count equal to the
 * master, SSIM against the master; the rows go to DIR/social.json. A size outside the band is retried once with the bitrate scaled to the miss.
 * Banding is checked by eye on frames from both files (`--sheets` writes master/social pairs for that).
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { argValue } from '../../lib/args.mjs';

export const MB = 1e6;
/** v3.6: up to 20 MB (the 30 s copies at ~5 Mbit/s; still far under the platforms' upload limits). */
export const SIZE_BAND = [8 * MB, 20 * MB];
/**
 * v3.6: the video bitrate floor (kbit/s). At 10.5 MB the 30 s 16:9 copy ran 2.6 Mbit/s and the core-base teamfight's
 * dust, the AoE domes and the selection discs broke into macroblocks (v3.5 review; SSIM 0.983 over f900-1400), while
 * the 15 s copies at 5.4 Mbit/s held. Every cut now gets at least this much.
 */
export const KBPS_MIN = 4800;
/** v3.6: the per-segment SSIM floor (social vs master) on each cut's hardest stretch: the core fight and burst. */
export const SSIM_FLOOR = 0.99;
export const HARD_SEGMENT = { 30: [900, 1389], 15: [475, 614] };
/** Container overhead (moov, sample tables at 60 fps) as a share of the payload. */
export const MUX_OVERHEAD = 0.012;

/** Video bitrate (kbit/s) that lands a file of `seconds` on `targetBytes` with `audioKbps` of AAC. */
export function socialBitrate(seconds, { targetBytes = 10.5 * MB, audioKbps = 160, floor = KBPS_MIN } = {}) {
  if (!(seconds > 0)) throw new Error('duration must be positive');
  const totalKbps = (targetBytes * 8) / (1 + MUX_OVERHEAD) / seconds / 1000;
  const video = Math.floor(totalKbps - audioKbps);
  if (video < 500) throw new Error(`target too small for ${seconds} s: ${video} kbit/s video`);
  return Math.max(video, floor);
}

/** The file size (bytes) a cut of `seconds` lands on at `kbps` video plus `audioKbps` AAC. */
export function bytesFor(seconds, kbps, audioKbps = 160) {
  return (((kbps + audioKbps) * 1000 * seconds) / 8) * (1 + MUX_OVERHEAD);
}

/** Bitrate for a retry after a file came out `gotBytes` instead of `targetBytes`. */
export function retryBitrate(kbps, gotBytes, targetBytes = 10.5 * MB) {
  return Math.floor(kbps * (targetBytes / gotBytes));
}

/** SSIM fails: the whole file below none, the hard segment below SSIM_FLOOR. */
export function ssimFails(seg, floor = SSIM_FLOOR) {
  return seg != null && seg < floor ? [`SSIM ${seg} < ${floor} on the hard segment`] : [];
}

export const inBand = (bytes) => bytes >= SIZE_BAND[0] && bytes <= SIZE_BAND[1];
export const socialName = (master) => master.replace(/\.mp4$/, '-social.mp4');

const probe = (file) => {
  const out = execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries',
    'stream=nb_read_frames,width,height,r_frame_rate:format=duration', '-of', 'json', file]).toString();
  const j = JSON.parse(out);
  return { frames: Number(j.streams[0].nb_read_frames), w: j.streams[0].width, h: j.streams[0].height,
    fps: j.streams[0].r_frame_rate, duration: Number(j.format.duration) };
};

function encode(src, dst, kbps, audioKbps) {
  const passlog = join(tmpdir(), `social-${process.pid}-${Date.now()}`);
  const common = ['-hide_banner', '-loglevel', 'error', '-y', '-i', src, '-map', '0:v:0', '-map', '0:a:0',
    '-c:v', 'libx264', '-preset', 'slower', '-tune', 'animation', '-profile:v', 'high', '-level', '4.2', '-pix_fmt', 'yuv420p',
    '-b:v', `${kbps}k`, '-maxrate', `${Math.round(kbps * 1.8)}k`, '-bufsize', `${kbps * 2}k`,
    '-x264-params', 'aq-mode=3:aq-strength=0.9:deblock=-1,-1', '-g', '120', '-passlogfile', passlog];
  execFileSync('ffmpeg', [...common, '-pass', '1', '-an', '-f', 'mp4', '/dev/null'], { stdio: 'inherit' });
  execFileSync('ffmpeg', [...common, '-pass', '2', '-c:a', 'aac', '-b:a', `${audioKbps}k`, '-ar', '48000',
    '-movflags', '+faststart', dst], { stdio: 'inherit' });
  for (const s of ['-0.log', '-0.log.mbtree']) rmSync(passlog + s, { force: true });
  return statSync(dst).size;
}

function ssimAll(master, social, range = null) {
  // v3.6 `range`: frames [a, b] only (the hard segment)
  const sel = range ? `[0:v]select='between(n\\,${range[0]}\\,${range[1]})',setpts=N/60/TB[a];[1:v]select='between(n\\,${range[0]}\\,${range[1]})',setpts=N/60/TB[b];[a][b]ssim` : 'ssim';
  const res = spawnSync('ffmpeg', ['-hide_banner', '-i', social, '-i', master, '-lavfi', sel, '-f', 'null', '-'])
    .stderr.toString();
  const m = /All:([\d.]+)/.exec(res);
  return m ? Number(m[1]) : null;
}

function sheets(master, social, out, times) {
  mkdirSync(out, { recursive: true });
  const base = master.split('/').pop().replace(/\.mp4$/, '');
  for (const t of times) {
    const png = join(out, `${base}-t${String(t).replace('.', '_')}.png`);
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-ss', `${t}`, '-i', master, '-ss', `${t}`,
      '-i', social, '-frames:v', '1', '-filter_complex',
      '[0:v]scale=iw/2:-2[a];[1:v]scale=iw/2:-2[b];[a][b]hstack', png]);
  }
}

async function main() {
  const dir = resolve(argValue('--dir') ?? '.');
  const target = Number(argValue('--target-mb') ?? 10.5) * MB;
  const audioKbps = Number(argValue('--audio-kbps') ?? 160);
  const sheetDir = argValue('--sheets');
  const masters = ['30s-1080p', '30s-vertical', '15s-1080p', '15s-vertical']
    .map((k) => join(dir, `pawlegends-trailer-${k}.mp4`)).filter(existsSync);
  if (!masters.length) throw new Error(`no masters in ${dir}`);
  const report = [];
  for (const m of masters) {
    const src = probe(m);
    const dst = socialName(m);
    let kbps = socialBitrate(src.duration, { targetBytes: target, audioKbps });
    const want = Math.max(target, bytesFor(src.duration, kbps, audioKbps));
    let size = encode(m, dst, kbps, audioKbps);
    if (!inBand(size)) {
      kbps = retryBitrate(kbps, size, want);
      size = encode(m, dst, kbps, audioKbps);
    }
    const seg = HARD_SEGMENT[src.duration > 20 ? 30 : 15];
    const got = probe(dst);
    const row = { file: dst, bytes: size, mb: +(size / MB).toFixed(2), kbps, frames: got.frames,
      duration: +got.duration.toFixed(3), size: `${got.w}x${got.h}`, fps: got.fps, ssim: ssimAll(m, dst),
      ssimHard: ssimAll(m, dst, seg), hardFrames: seg, fails: [] };
    row.fails.push(...ssimFails(row.ssimHard));
    if (!inBand(size)) row.fails.push('SIZE');
    if (got.frames !== src.frames) row.fails.push(`FRAMES ${got.frames} != ${src.frames}`);
    if (got.w !== src.w || got.h !== src.h) row.fails.push('DIMENSIONS');
    report.push(row);
    console.log('[social]', JSON.stringify(row));
    if (sheetDir) sheets(m, dst, resolve(sheetDir), src.duration > 20 ? [1.5, 4, 9, 14, 19, 22.5, 27] : [1.5, 5, 8, 11.5, 13.5]);
  }
  writeFileSync(join(dir, 'social.json'), `${JSON.stringify(report, null, 1)}\n`);
  if (report.some((r) => r.fails.length)) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
