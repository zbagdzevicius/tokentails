#!/usr/bin/env node
/**
 * The Geode Job edit: cuts the takes and the motion-graphics segments of one cut and aspect into segments (one
 * visually lossless generation, CRF 6), joins them, lays the score under them and writes the master (x264 High CRF
 * 12, 60 fps), plus, for 16:9, the web copy; a poster per aspect. No grain, no sharpening, no upscaling: 16:9 and
 * 9:16 use their own native takes, 1:1 is a centre 1080x1080 crop of the 16:9 take (pixel for pixel).
 *
 *   node tools/trailers-hq/geode-job/edit.mjs --work DIR --cut 30s|60s --aspect h|v|s --out DIR [--poster S]
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { argValue } from '../../lib/args.mjs';
import { AUDIO, SEGMENT, master, web } from '../../clips/encode.mjs';
import { CUTS, FPS } from './timeline.mjs';

const WORK = resolve(argValue('--work'));
const CUT = argValue('--cut');
const AS = argValue('--aspect');
const OUT = resolve(argValue('--out'));
const [W, H] = { h: [1920, 1080], v: [1080, 1920], s: [1080, 1080] }[AS];
const TAG = { h: '16x9', v: '9x16', s: '1x1' }[AS];
const SEGD = join(WORK, 'seg', `${CUT}-${AS}`);
mkdirSync(SEGD, { recursive: true });
mkdirSync(OUT, { recursive: true });
const { segs } = CUTS[CUT];
const take = (id) => join(WORK, 'takes', `${id}-${AS === 'v' ? 'v' : 'h'}.mp4`);
const mgOf = (i) => join(WORK, 'mg', `${CUT}-${AS}`, `seg${String(i).padStart(2, '0')}.mov`);
const ff = (args) => execFileSync('ffmpeg', ['-v', 'error', '-y', '-threads', '4', ...args], { stdio: ['ignore', 'inherit', 'inherit'] });
const fr = (s) => Math.round(s * FPS);
const fit = AS === 's' ? ',crop=1080:1080:420:0' : '';

const list = [];
segs.forEach((s, i) => {
  const out = join(SEGD, `seg${String(i).padStart(2, '0')}.mp4`);
  const N = fr(s.b) - fr(s.a);
  const mg = mgOf(i);
  const hasMg = existsSync(mg);
  const inputs = [];
  let fc = '';
  if (s.kind === 'take') {
    inputs.push('-i', take(s.take));
    fc = `[0:v]trim=start_frame=${fr(s.in)}:end_frame=${fr(s.in) + N},setpts=PTS-STARTPTS${fit},setsar=1[base]`;
  } else if (s.kind === 'split') {
    inputs.push('-i', take(s.take));
    const t = `[0:v]trim=start_frame=${fr(s.in)}:end_frame=${fr(s.in) + N},setpts=PTS-STARTPTS`;
    if (AS === 'h') fc = `${t},crop=960:1080:480:0,pad=1920:1080:960:0:black,setsar=1[base]`;
    else if (AS === 'v') fc = `${t},crop=1080:960:0:480,pad=1080:1920:0:960:black,setsar=1[base]`;
    else fc = `${t},crop=540:1080:690:0,pad=1080:1080:540:0:black,setsar=1[base]`;
  } else if (s.kind === 'freeze') {
    const slot = (s.b - s.a) / s.crew.length;
    s.crew.forEach(([id], k) => inputs.push('-i', take(id)));
    const parts = s.crew.map(([, tin], k) => {
      const n = fr(s.a + (k + 1) * slot) - fr(s.a + k * slot);
      return `[${k}:v]trim=start_frame=${fr(tin)}:end_frame=${fr(tin) + n},setpts=PTS-STARTPTS${fit},setsar=1[p${k}]`;
    });
    fc = `${parts.join(';')};${s.crew.map((_, k) => `[p${k}]`).join('')}concat=n=${s.crew.length}:v=1:a=0[base]`;
  } else {
    // gem / end: the graphics are the whole frame
    if (!hasMg) throw new Error(`missing ${mg}`);
    inputs.push('-i', mg);
    fc = `[0:v]setsar=1[base]`;
  }
  let last = '[base]';
  if (hasMg && s.kind !== 'gem' && s.kind !== 'end') {
    const k = inputs.filter((x) => x === '-i').length;
    inputs.push('-i', mg);
    fc += `;[base][${k}:v]overlay=0:0:format=auto[ov]`;
    last = '[ov]';
  }
  // a constant 60 fps clock from the trimmed frames (an fps filter here dropped the last frame of a trim)
  fc += `;${last}setpts=N/(${FPS}*TB),format=yuv420p[out]`;
  ff([...inputs, '-filter_complex', fc, '-map', '[out]', '-frames:v', String(N), '-r', String(FPS), ...SEGMENT, out]);
  list.push(out);
});
const concat = join(SEGD, 'list.txt');
writeFileSync(concat, list.map((f) => `file '${f}'`).join('\n') + '\n');
const joined = join(SEGD, 'joined.mp4');
ff(['-f', 'concat', '-safe', '0', '-i', concat, '-c', 'copy', joined]);
const score = join(WORK, 'audio', `score-${CUT}.wav`);
const base = `pawlegends-geode-job-${CUT}`;
const mOut = join(OUT, `${base}-${TAG}.mp4`);
ff(['-i', joined, '-i', score, '-map', '0:v', '-map', '1:a', ...master(FPS), ...AUDIO, '-shortest', '-movflags', '+faststart', mOut]);
if (AS === 'h') ff(['-i', mOut, '-map', '0:v', '-map', '0:a', ...web(FPS), '-c:a', 'aac', '-b:a', '160k', join(OUT, `${base}-web.mp4`)]);
// posters: the end card (logo, PLAY FREE) and the core burst under VICTORY!
const endc = segs.find((x) => x.kind === 'end');
const vic = segs.find((x) => x.take === 't20b-victory');
for (const [name, t] of [['poster', endc.a + (endc.logoAt ?? 0.1) + 1.6], ['poster-victory', vic.victory + 0.15]]) ff(['-ss', t.toFixed(3), '-i', mOut, '-frames:v', '1', '-q:v', '1', join(OUT, `${base}-${name}-${TAG}.jpg`)]);
if (!process.argv.includes('--keep')) rmSync(SEGD, { recursive: true, force: true });
console.log(`${mOut}`);
