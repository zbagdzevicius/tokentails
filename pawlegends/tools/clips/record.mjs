#!/usr/bin/env node
/**
 * Clip engine (tools/clips/README.md): a JSON clip spec in, one finished MP4 out (H.264 yuv420p +faststart, AAC with
 * the game's own SFX and music rendered in lockstep with the frames, loudness-normalised to -14 LUFS).
 *
 *   node tools/clips/record.mjs <spec.json | specs.json> [--only id,id] [--port 5480] [--out-dir DIR] [--keep]
 *                               [--every N] (preview: every Nth frame only, no audio)
 *
 * A file may hold one spec or an array. One Vite server and one browser profile folder serve the whole batch.
 */
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { argValue, hasFlag, positionals } from '../lib/args.mjs';
import { takeOf, scan, best, hashAt } from './scenes.mjs';
import { buildShot } from './shots.mjs';

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FFMPEG = existsSync('/opt/homebrew/bin/ffmpeg') ? '/opt/homebrew/bin/ffmpeg' : 'ffmpeg';
const FFPROBE = existsSync('/opt/homebrew/bin/ffprobe') ? '/opt/homebrew/bin/ffprobe' : 'ffprobe';

const files = positionals(['--only', '--port', '--out-dir', '--every', '--report']);
if (!files.length) {
  console.error('usage: node tools/clips/record.mjs <spec.json> [--only id] [--port 5480] [--out-dir DIR]');
  process.exit(2);
}
let specs = [];
for (const f of files) {
  const j = JSON.parse(readFileSync(f, 'utf8'));
  specs.push(...(Array.isArray(j) ? j : [j]));
}
const only = argValue('--only')?.split(',');
if (only) specs = specs.filter((s) => only.includes(s.id));
const port = Number(argValue('--port') ?? 5480);
const outDir = argValue('--out-dir');
const every = Number(argValue('--every') ?? 0);

// one profile folder for the batch, removed in finally and on a signal
const profile = mkdtempSync(join(tmpdir(), 'pl-clips-profile-'));
const work = mkdtempSync(join(tmpdir(), 'pl-clips-work-'));
let server = null;
let ctx = null;
let cleaned = false;
async function cleanup() {
  if (cleaned) return;
  cleaned = true;
  try {
    await ctx?.close();
  } catch {
    /* closed */
  }
  try {
    await server?.close();
  } catch {
    /* closed */
  }
  rmSync(profile, { recursive: true, force: true });
  if (!hasFlag('--keep')) rmSync(work, { recursive: true, force: true });
}
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    void cleanup().finally(() => process.exit(130));
  });
}

const scanCache = new Map();
async function scanOf(take) {
  const k = JSON.stringify(take);
  if (!scanCache.has(k)) scanCache.set(k, await scan(take));
  return scanCache.get(k);
}

/** Resolve the spec's timing: the moment, the start tick, the event's output frame. */
async function plan(spec) {
  const fps = spec.fps ?? 30;
  const N = Math.round((spec.duration ?? 20) * fps);
  if (spec.mode === 'skins') return { fps, N, shot: buildShot(spec, { fps, N }) };
  const take = takeOf(spec);
  const sc = await scanOf(take);
  let moment = null;
  let startTick;
  const lead = spec.start?.lead ?? (spec.start?.event === 'victory' ? Math.max(4, (spec.duration ?? 20) - 5) : Math.min(5, (spec.duration ?? 20) * 0.3));
  if (spec.start?.event) {
    moment = best(sc, spec.start.event, { after: Math.round((spec.start.after ?? 0) * 30), before: spec.start.before !== undefined ? Math.round(spec.start.before * 30) : Infinity, pick: spec.start.pick ?? 0 });
    if (!moment) throw new Error(`${spec.id}: no ${spec.start.event} moment in seed ${spec.seed} (${spec.mode}); try another seed or pick`);
    startTick = Math.max(0, moment.tick - Math.round(lead * 30));
  } else startTick = Math.max(0, Math.round((spec.start?.at ?? 60) * 30));
  // output frame of the moment (game time = output time before any slow motion)
  const evF = moment ? Math.round(((moment.tick - startTick) / 30) * fps) : Math.round(N * 0.35);
  const checkTick = Math.min(sc.endTick, startTick + Math.round((N / fps) * 30) + 90);
  const check = { tick: checkTick, eventHash: await hashAt(take, checkTick) };
  return { fps, N, take, scan: sc, moment, startTick, evF, shot: buildShot(spec, { fps, N, take, moment, startTick, evF, check, scan: sc }) };
}

async function startServer() {
  const { createServer } = await import('vite');
  const s = await createServer({ root: PKG, configFile: join(PKG, 'vite.config.ts'), cacheDir: join(PKG, 'tools/clips/.vite-cache'), logLevel: 'error', server: { port, strictPort: true, host: '127.0.0.1', hmr: false, watch: null } });
  await s.listen();
  return s;
}

function ffmpegVideo(out, fps) {
  const args = ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
    '-vf', 'scale=in_range=pc:out_range=tv,format=yuv420p', '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-maxrate', '20M', '-bufsize', '40M', '-pix_fmt', 'yuv420p',
    '-profile:v', 'high', '-level', '4.2', '-g', String(fps * 2), '-r', String(fps), '-an', out];
  const p = spawn(FFMPEG, args, { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => p.on('close', (c) => (c === 0 ? res() : rej(new Error(`ffmpeg video exit ${c}`)))));
  return { p, done };
}

/** Mux: two-pass loudnorm to -14 LUFS / -1.5 dBTP (linear), AAC 192k, +faststart. Returns the measured input. */
function mux(video, wav, out, seconds) {
  const r = spawnSync(FFMPEG, ['-hide_banner', '-nostats', '-i', wav, '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-'], { encoding: 'utf8' });
  const m = /\{[^{}]*"input_i"[^{}]*\}/.exec(r.stderr ?? '');
  const j = m ? JSON.parse(m[0]) : null;
  const ln = j && Number.isFinite(+j.input_i)
    ? `loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=${j.input_i}:measured_TP=${j.input_tp}:measured_LRA=${j.input_lra}:measured_thresh=${j.input_thresh}:offset=${j.target_offset}:linear=true`
    : 'loudnorm=I=-14:TP=-1.5:LRA=11';
  execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', video, '-i', wav, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy',
    '-af', `${ln},aresample=48000`, '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-t', seconds.toFixed(3), '-movflags', '+faststart', out]);
  return j;
}

function probe(file) {
  const j = JSON.parse(execFileSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration,size:stream=codec_type,codec_name,width,height,r_frame_rate,pix_fmt,sample_rate,channels', '-of', 'json', file], { encoding: 'utf8' }));
  return j;
}

async function record(spec, chromium) {
  const t0 = Date.now();
  const p = await plan(spec);
  const { fps, N, shot } = p;
  const out = resolve(outDir ?? '.', spec.out ?? `${spec.id}.mp4`);
  mkdirSync(dirname(out), { recursive: true });
  const vtmp = join(work, `${spec.id}.video.mp4`);
  const wav = join(work, `${spec.id}.wav`);
  ctx = await chromium.launchPersistentContext(profile, {
    headless: true,
    viewport: { width: shot.width, height: shot.height },
    deviceScaleFactor: shot.dpr,
    reducedMotion: 'no-preference',
    args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu', '--force-color-profile=srgb', '--autoplay-policy=no-user-gesture-required'],
  });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  const errors = [];
  const verbose = hasFlag('--verbose');
  page.on('pageerror', (e) => {
    errors.push(e.message);
    if (verbose) console.error(`  [${spec.id}] pageerror ${e.message}`);
  });
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text().slice(0, 200));
    if (verbose && (m.type() === 'error' || m.type() === 'warning')) console.error(`  [${spec.id}] ${m.type()} ${m.text().slice(0, 300)}`);
  });
  // a cold Vite may re-optimise its deps on the first load (504 Outdated Optimize Dep): reload and wait again
  for (let attempt = 0; ; attempt++) {
    await page.goto(`http://127.0.0.1:${port}/tools/clips/harness.html`);
    const ok = await page.waitForFunction(() => window.__trailer?.ready, null, { timeout: 60000 }).then(() => true, () => false);
    if (ok) break;
    if (attempt >= 2) throw new Error(`harness not ready: ${errors.join(' | ').slice(0, 600)}`);
    errors.length = 0;
  }
  const audio = !every;
  const lead = 0.5;
  if (audio) await page.evaluate(([sec, f]) => window.__trailer.audioPrep(sec, f), [N / fps + lead + 1, fps]);
  const loaded = await page.evaluate((s) => window.__trailer.load(s), { ...shot, audio });
  // the lobby's painted backdrop and fonts load in real time: give them a moment before frame 0
  if (shot.mode === 'lobby') {
    await page.waitForTimeout(2500);
    // unsaved frames after the wait: the backdrop's crossfade settles before frame 0
    await page.evaluate(() => {
      for (let i = 0; i < 90; i++) window.__trailer.frame(-1000 + i);
    });
  }
  const enc = ffmpegVideo(vtmp, every ? Math.max(1, Math.round(fps / every)) : fps);
  const write = (buf) => new Promise((res, rej) => enc.p.stdin.write(buf, (e) => (e ? rej(e) : res())));
  let ticks = [];
  for (let k = 0; k < N; k++) {
    const r = await page.evaluate(([f, kk]) => window.__trailer.frameA(f, kk), [k, audio ? k : 0]);
    if (k === 0 && audio) await page.evaluate((n) => window.__trailer.audioStart(n[0], n[1]), [N, spec.mode === 'skins' ? (spec.music ?? 2) : -1]);
    if (hasFlag('--debug') && k % 30 === 0) {
      const inf = await page.evaluate(() => window.__trailer.info());
      console.error(`  f${k} tick ${inf.tick.toFixed(1)} look ${JSON.stringify(inf.look)} cam ${JSON.stringify(inf.cam)} heroes ${inf.heroes.filter((h) => h.kind === 'hero').map((h) => `${h.id}:${(h.x / 1000).toFixed(1)},${(-h.y / 1000).toFixed(1)}:${h.state}`).join(' ')}`);
    }
    if (every && k % every !== 0) continue;
    ticks.push(r.tick);
    await write(await page.screenshot({ type: 'jpeg', quality: 94 }));
  }
  enc.p.stdin.end();
  await enc.done;
  const verify = shot.take?.check ? await page.evaluate(() => window.__trailer.verify()) : null;
  let a = null;
  if (audio) {
    a = await page.evaluate(() => window.__trailer.audioDone());
    writeFileSync(wav, Buffer.from(a.wav, 'base64'));
  }
  await ctx.close();
  ctx = null;
  let ln = null;
  if (audio) ln = mux(vtmp, wav, out, N / fps);
  else execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', vtmp, '-c', 'copy', '-movflags', '+faststart', out]);
  const pr = probe(out);
  const row = {
    id: spec.id,
    out,
    mode: spec.mode,
    variant: spec.variant ?? (spec.mode === 'skins' ? undefined : 'bots'),
    aspect: spec.aspect,
    camera: spec.camera,
    seed: spec.seed,
    startTick: p.startTick,
    moment: p.moment ? { type: p.moment.type, sub: p.moment.sub, tick: p.moment.tick, note: p.moment.note } : null,
    frames: N,
    seconds: +(N / fps).toFixed(2),
    tickSpan: [ticks[0], ticks[ticks.length - 1]],
    hash: verify ? (verify.ok ? 'ok' : `MISMATCH ${verify.browser} vs ${verify.node}`) : 'n/a',
    audioRaw: a ? { peak: +a.peak.toFixed(3), rms: +a.rms.toFixed(4) } : null,
    loudnessIn: ln ? { I: ln.input_i, TP: ln.input_tp } : null,
    sizeMB: +(statSync(out).size / 1e6).toFixed(1),
    probe: { duration: +pr.format.duration, streams: pr.streams.map((s) => `${s.codec_type}:${s.codec_name}${s.width ? ` ${s.width}x${s.height} ${s.r_frame_rate} ${s.pix_fmt}` : ` ${s.sample_rate}Hz ${s.channels}ch`}`) },
    errors: [...new Set(errors)].slice(0, 5),
    recordSeconds: Math.round((Date.now() - t0) / 1000),
    loaded,
  };
  console.log(JSON.stringify(row));
  return row;
}

const { chromium } = await import('@playwright/test');
const rows = [];
try {
  server = await startServer();
  for (const spec of specs) {
    try {
      rows.push(await record(spec, chromium));
    } catch (e) {
      console.error(`[${spec.id}] FAILED: ${e.stack ?? e}`);
      rows.push({ id: spec.id, error: String(e.message ?? e) });
      try {
        await ctx?.close();
      } catch {
        /* closed */
      }
      ctx = null;
    }
  }
} finally {
  await cleanup();
}
const report = argValue('--report');
if (report) writeFileSync(report, JSON.stringify(rows, null, 2) + '\n');
process.exit(rows.some((r) => r.error) ? 1 : 0);
