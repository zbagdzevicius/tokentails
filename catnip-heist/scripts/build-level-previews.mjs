#!/usr/bin/env node
// Builds the level-select previews in public/assets/images/levels/ from real gameplay frames:
//
//   heist-0N.webp       card thumbnail, 480x270
//   heist-0N@2x.webp    the same at 960x540 (retina cards, and the hero of the brief panel)
//   heist-0N-loop.mp4   a ~2.5 s muted "living" loop for the focused card (H.264, 480x270, 15 fps,
//                       the last frames crossfaded into the first so it loops without a jump)
//
// Sources (read-only): the promo clip frame sequences in promo/assets/clips/<clip>/NNNN.jpg
// (1920x1080, captured by promo/tools/capture.mjs from solution replays) and, for levels with no
// promo clip (heist-03), frames captured by scripts/build-level-previews.capture.mjs into
// node_modules/.cache/level-previews/. Both are gitignored and reproducible; this script only
// reads them. Every level gets the same treatment: one 16:9 crop shared by its stills and its
// loop (so the loop fades in over its own thumbnail), an exposure match to a common target so the
// eight read as one set, a light saturation and contrast lift and a gentle sharpen.
//
//   node scripts/build-level-previews.mjs            # build everything, print sizes
//   node scripts/build-level-previews.mjs heist-03   # just some levels
//
// Needs ffmpeg with libx264 on PATH. The table below is the whole art direction; src/ui/levels/
// previews.ts maps level ids to these file names.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '..');
const PROMO = join(ROOT, 'promo', 'assets', 'clips');
const CAPTURED = join(ROOT, 'node_modules', '.cache', 'level-previews');
export const OUT = join(ROOT, 'public', 'assets', 'images', 'levels');

const SRC_W = 1920;
const SRC_H = 1080;
const THUMB = { w: 480, h: 270, quality: 80 };
const THUMB2X = { w: 960, h: 540, quality: 72 };
const LOOP = { w: 480, h: 270, fps: 15, step: 2, fade: 6, crf: 29 };
/** Mean luma (0-255) every level is matched to; the promo renders sit around 60-75. */
const TARGET_LUMA = 66;

/**
 * Per level: the clip, the thumbnail frame, the loop's frame range (source frames at 30 fps; every
 * `LOOP.step`-th is kept) and the crop: centre as a fraction of the 1920x1080 frame, and a zoom
 * (1 = the full frame). Frame numbers follow the event notes in promo/assets/clips/clips.json.
 */
export const LEVELS = [
  // Plate held, door slides open, SWAP ring (f16-19); the patrol cone sweeps the crate stacks.
  { id: 'heist-01', clip: 'h01-plate-swap', thumb: 60, loop: [6, 92], center: [0.56, 0.45], zoom: 1.25 },
  // MEOW shockwave (f43), the doorman's cone turns orange and he walks off to investigate.
  { id: 'heist-02', clip: 'h02-meow-lure', thumb: 80, loop: [34, 120], center: [0.52, 0.44], zoom: 1.3 },
  // Captured (no promo clip): leapfrog on the plates, SWAP at f19, dog patrolling the crate room.
  { id: 'heist-03', clip: 'h03-twin-locks', captured: true, thumb: 76, loop: [6, 92], center: [0.5, 0.52], zoom: 1.25 },
  // Rapid swaps through the plate door, coins, then the KEY burst (f102).
  { id: 'heist-04', clip: 'h04-key-doors', thumb: 60, loop: [24, 110], center: [0.56, 0.4], zoom: 1.3 },
  // Coin run between the turning sentry cones (coins f64, f82, f124).
  { id: 'heist-05', clip: 'h05-coin-run', thumb: 80, loop: [56, 142], center: [0.6, 0.55], zoom: 1.3 },
  // Threading the 1-tile corridor to the exit and the crate; plate (f100) and SWAP (f104).
  { id: 'heist-06', clip: 'h06-sneak-corridor', thumb: 96, loop: [62, 148], center: [0.45, 0.5], zoom: 1.5 },
  // Two wings: plate and door (f13), SWAP (f16), door closes (f19), SWAP (f53).
  { id: 'heist-07', clip: 'h07-split-shift', thumb: 60, loop: [1, 87], center: [0.62, 0.38], zoom: 1.25 },
  // HQ finale: alerted guard by the vault, coins, then the RESCUE flash and confetti (f113).
  { id: 'heist-08', clip: 'h08-vault-rescue', thumb: 100, loop: [39, 125], center: [0.52, 0.45], zoom: 1.2 },
];

const framePath = (lv, f) => join(lv.captured ? CAPTURED : PROMO, lv.clip, `${String(f).padStart(4, '0')}.jpg`);

function cropBox(lv) {
  const w = Math.round(SRC_W / lv.zoom);
  const h = Math.round((w * 9) / 16);
  const left = Math.min(SRC_W - w, Math.max(0, Math.round(lv.center[0] * SRC_W - w / 2)));
  const top = Math.min(SRC_H - h, Math.max(0, Math.round(lv.center[1] * SRC_H - h / 2)));
  return { left, top, width: w, height: h };
}

/** Cropped (not yet graded) frame at the given size, as a sharp pipeline. */
const cropped = (lv, f, size) => sharp(framePath(lv, f)).extract(cropBox(lv)).resize(size.w, size.h, { kernel: 'lanczos3' });

/** One exposure gain per level, from its thumbnail frame, applied to its stills and its loop alike. */
async function exposureGain(lv) {
  const { channels } = await cropped(lv, lv.thumb, THUMB).stats();
  const luma = 0.2126 * channels[0].mean + 0.7152 * channels[1].mean + 0.0722 * channels[2].mean;
  return Math.min(1.35, Math.max(0.85, TARGET_LUMA / luma));
}

/** The shared grade: exposure match, +10% saturation, a mild S-ish contrast lift, a light sharpen. */
const grade = (img, gain) =>
  img
    .modulate({ brightness: gain, saturation: 1.1 })
    .linear(1.06, -6)
    .sharpen({ sigma: 0.6, m1: 0.6, m2: 1.2 });

async function writeStill(lv, gain, size, file) {
  await grade(cropped(lv, lv.thumb, size), gain).webp({ quality: size.quality, effort: 6, smartSubsample: true }).toFile(file);
}

async function loopFrames(lv, gain) {
  const out = [];
  for (let f = lv.loop[0]; f <= lv.loop[1]; f += LOOP.step) {
    out.push(await grade(cropped(lv, f, LOOP), gain).removeAlpha().raw().toBuffer());
  }
  // Seamless loop: blend the last `fade` frames into the first ones, then drop the tail, so the
  // final frame flows into frame 0 with no cut.
  const k = LOOP.fade;
  const n = out.length;
  const frames = out.slice(0, n - k);
  for (let i = 0; i < k; i++) {
    const a = (i + 1) / (k + 1);
    const tail = out[n - k + i];
    const head = frames[i];
    const mix = Buffer.alloc(head.length);
    for (let p = 0; p < head.length; p++) mix[p] = Math.round(tail[p] * (1 - a) + head[p] * a);
    frames[i] = mix;
  }
  return frames;
}

function encodeLoop(frames, file) {
  return new Promise((ok, fail) => {
    const ff = spawn(
      'ffmpeg',
      [
        '-loglevel', 'error', '-y',
        '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${LOOP.w}x${LOOP.h}`, '-r', String(LOOP.fps), '-i', '-',
        '-an', '-c:v', 'libx264', '-preset', 'veryslow', '-crf', String(LOOP.crf), '-tune', 'animation',
        '-profile:v', 'high', '-level', '3.1', '-pix_fmt', 'yuv420p', '-g', String(frames.length),
        '-movflags', '+faststart', '-map_metadata', '-1', '-fflags', '+bitexact', '-flags:v', '+bitexact',
        file,
      ],
      { stdio: ['pipe', 'inherit', 'inherit'] },
    );
    ff.on('error', fail);
    ff.on('close', (code) => (code === 0 ? ok() : fail(new Error(`ffmpeg exited ${code} for ${file}`))));
    for (const fr of frames) ff.stdin.write(fr);
    ff.stdin.end();
  });
}

const kb = (file) => `${(statSync(file).size / 1024).toFixed(1)} KB`;

async function build(lv) {
  const missing = [lv.thumb, lv.loop[0], lv.loop[1]].map((f) => framePath(lv, f)).filter((p) => !existsSync(p));
  if (missing.length) {
    const how = lv.captured ? 'node scripts/build-level-previews.capture.mjs (with a dev server up)' : 'promo/tools/capture.mjs';
    throw new Error(`${lv.id}: missing source frames (${missing[0]}). Capture them with ${how}.`);
  }
  const gain = await exposureGain(lv);
  const files = {
    thumb: join(OUT, `${lv.id}.webp`),
    thumb2x: join(OUT, `${lv.id}@2x.webp`),
    loop: join(OUT, `${lv.id}-loop.mp4`),
  };
  await writeStill(lv, gain, THUMB, files.thumb);
  await writeStill(lv, gain, THUMB2X, files.thumb2x);
  const frames = await loopFrames(lv, gain);
  await encodeLoop(frames, files.loop);
  const sizes = Object.values(files).reduce((n, f) => n + statSync(f).size, 0);
  console.log(
    `${lv.id}  gain ${gain.toFixed(2)}  ${lv.id}.webp ${kb(files.thumb)}  @2x ${kb(files.thumb2x)}  ` +
      `loop ${kb(files.loop)} (${frames.length} frames, ${(frames.length / LOOP.fps).toFixed(1)} s)  = ${(sizes / 1024).toFixed(1)} KB`,
  );
  return sizes;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const only = process.argv.slice(2);
  mkdirSync(OUT, { recursive: true });
  let total = 0;
  for (const lv of LEVELS) if (!only.length || only.includes(lv.id)) total += await build(lv);
  console.log(`total ${(total / 1024).toFixed(1)} KB`);
}
