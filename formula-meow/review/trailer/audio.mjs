#!/usr/bin/env node
/**
 * Formula Meow trailer soundtrack generator (capture-only tooling; the game is not changed).
 *
 *   node review/trailer/audio.mjs            # from formula-meow/
 *
 * 1. Starts `vite` (dev server, so /src modules import) on 127.0.0.1:6213 (never 5175), opens
 *    review/trailer/audio/render.html in headless Chromium and renders four stems offline with the game's own synth
 *    (review/trailer/audio/score.ts: music, sfx, announcer, engine). Stops the server.
 * 2. ffmpeg: build/audio/music.wav (score), build/audio/sfx.wav (SFX + announcer + engine), both 30.000 s, 48 kHz
 *    stereo, at mix level; build/audio/mix.wav = both, bus compressor, two-pass loudnorm to -14 LUFS (TP -1.5),
 *    alimiter, last 10 frames silent. Verifies with ebur128 (I = -14 +/- 0.5, TP <= -1.0 dBTP).
 * 3. build/audio/cues.json: beat grid (25 frames per beat at 60 fps), bars, hit points, events, announcer lines.
 * 4. build/audio/waveform.png (1 px per frame, bar lines every 100 px) and build/audio/spectrum.png.
 */
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..'); // formula-meow/
const OUT = join(HERE, 'build/audio');
const STEMS = join(OUT, 'stems');
const PORT = Number(process.env.TRAILER_AUDIO_PORT || 6213);
if (PORT === 5175) throw new Error('5175 is the founder dev port');
const SR = 48000;
const N = SR * 30; // exactly 30.000 s
const FPS = 60;

// mix gains (dB) into music.wav / sfx.wav (pre-master); the master stage then sets the loudness
const GAIN = { music: -4, sfx: -7.5, vox: -3.5, engine: -11 };

mkdirSync(STEMS, { recursive: true });

function wav(path, chans) {
  const n = chans[0].length;
  const buf = Buffer.alloc(44 + n * chans.length * 4);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * chans.length * 4, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(3, 20); // IEEE float
  buf.writeUInt16LE(chans.length, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * chans.length * 4, 28);
  buf.writeUInt16LE(chans.length * 4, 32);
  buf.writeUInt16LE(32, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * chans.length * 4, 40);
  let o = 44;
  for (let i = 0; i < n; i++) for (const c of chans) (buf.writeFloatLE(c[i], o), (o += 4));
  writeFileSync(path, buf);
}

async function waitFor(url, ms = 30000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`server did not start: ${url}`);
}

async function render() {
  const vite = spawn(join(ROOT, 'node_modules/.bin/vite'), ['--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  vite.stdout.on('data', (d) => (log += d));
  vite.stderr.on('data', (d) => (log += d));
  const base = `http://127.0.0.1:${PORT}`;
  try {
    await waitFor(`${base}/review/trailer/audio/render.html`);
    const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
    try {
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
      await page.goto(`${base}/review/trailer/audio/render.html`);
      await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 }).catch((e) => {
        throw new Error(`render page failed: ${errors.join('\n')}\n${e}`);
      });
      const t0 = Date.now();
      const stems = await page.evaluate(() => window.renderStems());
      const plan = await page.evaluate(async () => (await import('/review/trailer/audio/score.ts')).plan());
      console.log(`rendered 4 stems in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
      if (errors.length) console.warn('page errors:\n' + errors.join('\n'));
      for (const [name, chans] of Object.entries(stems)) {
        const f = chans.map((s) => {
          const b = Buffer.from(s, 'base64');
          return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);
        });
        if (f[0].length !== N) throw new Error(`${name}: ${f[0].length} samples, want ${N}`);
        wav(join(STEMS, `${name}.wav`), f);
      }
      return plan;
    } finally {
      await browser.close();
    }
  } catch (e) {
    console.error(log);
    throw e;
  } finally {
    vite.kill('SIGTERM');
  }
}

const ff = (args) => execFileSync('ffmpeg', ['-hide_banner', '-nostats', '-y', ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
// ffmpeg writes filter logs (loudnorm, ebur128) to stderr: return it
function ffLog(args) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', ...args], { encoding: 'utf8', maxBuffer: 64 << 20 });
  if (r.status !== 0) throw new Error(r.stderr);
  return r.stderr;
}

function ebur(path) {
  const log = ffLog(['-i', path, '-af', 'ebur128=peak=true:framelog=quiet', '-f', 'null', '-']);
  const I = Number(/I:\s+(-?[\d.]+) LUFS/.exec(log.slice(log.lastIndexOf('Summary')))?.[1]);
  const LRA = Number(/LRA:\s+(-?[\d.]+) LU/.exec(log.slice(log.lastIndexOf('Summary')))?.[1]);
  const TP = Number(/Peak:\s+(-?[\d.inf]+) dBFS/.exec(log.slice(log.lastIndexOf('True peak')))?.[1]);
  return { I, LRA, TP };
}

async function main() {
  const plan = process.env.SKIP_RENDER && existsSync(join(OUT, 'plan.json')) ? JSON.parse(readFileSync(join(OUT, 'plan.json'), 'utf8')) : await render();
  writeFileSync(join(OUT, 'plan.json'), JSON.stringify(plan, null, 2));
  const s = (n) => join(STEMS, `${n}.wav`);
  const end = `atrim=end_sample=${N},apad=whole_len=${N}`;

  // music.wav and sfx.wav at mix level (24-bit)
  ff(['-i', s('music'), '-af', `volume=${GAIN.music}dB,${end}`, '-ar', SR, '-ac', 2, '-c:a', 'pcm_s24le', join(OUT, 'music.wav')].map(String));
  ff([
    ...['-i', s('sfx'), '-i', s('vox'), '-i', s('engine')],
    '-filter_complex',
    `[0]volume=${GAIN.sfx}dB[a];[1]volume=${GAIN.vox}dB[b];[2]volume=${GAIN.engine}dB[c];[a][b][c]amix=inputs=3:normalize=0,${end}[o]`,
    '-map', '[o]', '-ar', SR, '-ac', 2, '-c:a', 'pcm_s24le', join(OUT, 'sfx.wav'),
  ].map(String));

  // premix -> gentle bus compressor; then the master: linear gain + true-peak-safe limiter, iterated until the
  // integrated loudness sits at -14 LUFS (loudnorm's linear mode, done by hand so it never falls back to dynamic
  // compression), last 10 frames silent
  const premix = join(OUT, 'premix.wav');
  ff(['-i', join(OUT, 'music.wav'), '-i', join(OUT, 'sfx.wav'), '-filter_complex', `[0][1]amix=inputs=2:normalize=0,highpass=f=28:poles=2,lowshelf=f=90:g=-2.5,acompressor=threshold=-18dB:ratio=2:attack=10:release=160:knee=4,${end}[o]`, '-map', '[o]', '-c:a', 'pcm_f32le', premix]);
  // section contrast (before the master limiter): the beds before the three big hits sit 3-4 dB lower so that GO (f100),
  // the drop (f200) and the climax (f1200) land; the slow-motion breakdown gets +1.5 dB so it is not a dead zone.
  // The gain snaps back to 0 dB one frame before each hit (the hit's transient covers the step).
  const F = `(t*${FPS})`;
  const envDb = [
    `if(lt(${F},10),-0.4*${F}`, `if(lt(${F},99),-4`, `if(lt(${F},112),-3.5*(${F}-99)/13`, `if(lt(${F},199),-3.5`,
    `if(lt(${F},1000),0`, `if(lt(${F},1012),-3*(${F}-1000)/12`, `if(lt(${F},1199),-3`,
    `if(lt(${F},1400),0`, `if(lt(${F},1480),1.5`, `if(lt(${F},1495),1.5*(1495-${F})/15`, '0',
  ].join(',') + ')'.repeat(10);
  const shaped = join(OUT, 'premix-shaped.wav');
  ff(['-i', premix, '-af', `asetnsamples=n=240,volume='pow(10,(${envDb})/20)':eval=frame,${end}`, '-c:a', 'pcm_f32le', shaped]);
  ff(['-i', shaped, '-c:a', 'pcm_f32le', premix]);
  const silentFrom = (1790 / FPS).toFixed(4);
  let gain = -14 - ebur(premix).I;
  let pass = null;
  for (let i = 0; i < 5; i++) {
    // alimiter at -2.2 dBFS sample peak with 4x oversampling via aresample keeps true peak under -1.5 dBTP
    ff(['-i', premix, '-af', `volume=${gain.toFixed(3)}dB,aresample=${SR * 4},alimiter=limit=${Math.pow(10, -2.2 / 20).toFixed(4)}:attack=1.5:release=60:level=false:asc=1,aresample=${SR},volume=enable='gte(t,${silentFrom})':volume=0,${end}`, '-ar', String(SR), '-c:a', 'pcm_s24le', join(OUT, 'mix.wav')]);
    pass = ebur(join(OUT, 'mix.wav'));
    console.log(`master pass ${i + 1}: gain ${gain.toFixed(2)} dB -> I ${pass.I} LUFS, TP ${pass.TP} dBTP`);
    if (Math.abs(pass.I + 14) <= 0.15) break;
    gain += -14 - pass.I;
  }
  const j2 = { normalization_type: `linear gain ${gain.toFixed(2)} dB + limiter` };

  const loud = { mix: ebur(join(OUT, 'mix.wav')), music: ebur(join(OUT, 'music.wav')), sfx: ebur(join(OUT, 'sfx.wav')), loudnormPass2: j2.normalization_type };
  const ok = Math.abs(loud.mix.I + 14) <= 0.5 && loud.mix.TP <= -1.0;

  // pictures: waveform 1 px per frame with bar lines; spectrogram
  ff(['-i', join(OUT, 'mix.wav'), '-filter_complex', `showwavespic=s=1800x360:split_channels=0:colors=0xff3ea5,drawgrid=w=100:h=360:t=1:c=0x2cf6f3@0.6,drawgrid=w=25:h=360:t=1:c=0xffffff@0.12`, '-frames:v', '1', join(OUT, 'waveform.png')]);
  ff(['-i', join(OUT, 'mix.wav'), '-lavfi', 'showspectrumpic=s=1800x512:legend=1:scale=log:fscale=log:color=intensity', join(OUT, 'spectrum.png')]);
  ff(['-i', join(OUT, 'music.wav'), '-i', join(OUT, 'sfx.wav'), '-filter_complex', `[0]showwavespic=s=1800x200:colors=0xffd27a,drawgrid=w=100:h=200:t=1:c=0x2cf6f3@0.6[a];[1]showwavespic=s=1800x200:colors=0x7ff9f6,drawgrid=w=100:h=200:t=1:c=0xff3ea5@0.6[b];[a][b]vstack`, '-frames:v', '1', join(OUT, 'stems.png')]);

  // cues.json
  const beats = [];
  for (let i = 0; i < 72; i++) beats.push({ beat: i, frame: i * 25, t: +(i * 25 / FPS).toFixed(4), bar: Math.floor(i / 4), downbeat: i % 4 === 0 });
  const cues = {
    generated: 'review/trailer/audio.mjs',
    files: { music: 'build/audio/music.wav', sfx: 'build/audio/sfx.wav', mix: 'build/audio/mix.wav', stems: 'build/audio/stems/{music,sfx,vox,engine}.wav' },
    format: { sampleRate: SR, channels: 2, samples: N, seconds: 30, fps: FPS },
    grid: { bpm: 144, framesPerBeat: 25, framesPerBar: 100, beatsPerBar: 4, bars: 18, secondsPerBeat: 60 / 144, actionBars: [0, 15], endCardFrames: [1600, 1800], silentFromFrame: 1790 },
    song: plan.song,
    mixGainsDb: GAIN,
    bars: plan.bars,
    hits: [
      ...plan.musicHits.map((h) => ({ ...h, t: +(h.f / FPS).toFixed(4), source: 'music' })),
      ...plan.risers.map((r) => ({ f: r.to, name: r.name, kind: 'riser-end', fromFrame: r.from, t: +(r.to / FPS).toFixed(4), source: 'music' })),
    ].sort((a, b) => a.f - b.f),
    flashFrames: [100, 1200, 1500],
    cuts: plan.cuts,
    sfx: plan.events.map((e) => ({ f: e.f, t: +(e.f / FPS).toFixed(4), id: e.cue ?? e.ui ?? e.fx, kind: e.cue ? 'playCue' : e.ui ? 'playUi' : 'synth', label: e.label })),
    announcer: plan.lines.map((l) => ({ f: l.f, id: l.id, startT: +l.start.toFixed(4), len: +l.len.toFixed(3) })),
    beats,
    loudness: loud,
  };
  writeFileSync(join(OUT, 'cues.json'), JSON.stringify(cues, null, 2));
  console.log(JSON.stringify({ loud, ok }, null, 2));
  if (!ok) process.exitCode = 2;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
