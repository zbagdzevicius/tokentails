#!/usr/bin/env node
/**
 * Automatic demo videos, no editor work.
 *
 *   node funding/media/make-demo.mjs [--payouts-url URL] [--var KEY=value ...]
 *                                    [--only arc,colosseum] [--levels heist-01,heist-03]
 *                                    [--reuse] [--voice Samantha]
 *
 * 1. Builds Catnip Heist into out/work/heist-dist (catnip-heist/dist is left alone) and serves it
 *    with its own `vite preview` on 127.0.0.1:4174.
 * 2. Records the bundled solution replays (?replay=solution&speed=2) with Playwright recordVideo,
 *    keeping only the in-heist stretch of each level. With --payouts-url it also records a slow
 *    scroll of the /shelter-payouts page.
 * 3. Speaks every segment of scripts/<name>.md with macOS `say` (.aiff), writes ASS captions, and
 *    muxes it all with ffmpeg into out/demo-arc.mp4 and out/demo-colosseum.mp4 (2-3 minutes each).
 *
 * --reuse skips the recording when out/work/heist.mp4 (and payouts.mp4) already exist.
 * Nothing here signs, uploads or posts anything. Output is git-ignored (funding/media/.gitignore).
 */
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const HEIST = join(REPO, 'catnip-heist');
const OUT = join(HERE, 'out');
const WORK = join(OUT, 'work');
const W = 1280;
const H = 720;
const FPS = 30;
const PORT = 4174;
const GAP = 0.45; // seconds of silence after each segment
const MIN_S = 120;
const MAX_S = 180;
const DEFAULT_LEVELS = ['heist-01', 'heist-03', 'heist-04', 'heist-06', 'heist-08'];

// ---------- args ----------
function parseArgs(argv) {
  const a = { vars: {}, only: ['arc', 'colosseum'], levels: DEFAULT_LEVELS, payoutsUrl: '', reuse: false, voice: '' };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = () => {
      if (i + 1 >= argv.length) throw new Error(`${k} needs a value`);
      return argv[++i];
    };
    if (k === '--payouts-url') a.payoutsUrl = v();
    else if (k === '--var') {
      const [key, ...rest] = v().split('=');
      a.vars[key] = rest.join('=');
    } else if (k === '--only') a.only = v().split(',').filter(Boolean);
    else if (k === '--levels') a.levels = v().split(',').filter(Boolean);
    else if (k === '--reuse') a.reuse = true;
    else if (k === '--voice') a.voice = v();
    else if (k === '-h' || k === '--help') {
      console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0]);
      process.exit(0);
    } else throw new Error(`unknown argument ${k}`);
  }
  return a;
}

// ---------- process helpers ----------
function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', maxBuffer: 64 << 20, ...opts });
  if (r.status !== 0) {
    throw new Error(`${cmd} ${args.slice(0, 6).join(' ')} … failed (${r.status}):\n${(r.stderr || r.stdout || '').slice(-2000)}`);
  }
  return r.stdout;
}
const ffmpeg = (args, opts) => run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], opts);
const duration = (file) =>
  Number(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file]).trim());

function requireTools() {
  for (const [cmd, arg] of [['ffmpeg', '-version'], ['ffprobe', '-version'], ['say', '-v?']]) {
    if (spawnSync(cmd, [arg], { stdio: 'ignore' }).status !== 0) throw new Error(`${cmd} is required (macOS say, Homebrew ffmpeg)`);
  }
}

// ---------- script parsing ----------
/** Parses scripts/<name>.md: frontmatter (out, voice, rate, var.KEY) and `##` segments. */
export function parseScript(text, cliVars = {}) {
  const fm = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!fm) throw new Error('script has no frontmatter');
  const meta = { vars: {} };
  for (const line of fm[1].split('\n')) {
    const m = /^([\w.]+):\s*(.*)$/.exec(line.trim());
    if (!m) continue;
    if (m[1].startsWith('var.')) meta.vars[m[1].slice(4)] = m[2];
    else meta[m[1]] = m[2];
  }
  const vars = { ...meta.vars, ...cliVars };
  const fill = (s) => s.replace(/\{([A-Z0-9_]+)\}/g, (all, k) => (k in vars ? vars[k] : all));
  const segments = [];
  for (const block of text.slice(fm[0].length).split(/^## /m).slice(1)) {
    const [heading, ...lines] = block.split('\n');
    const seg = { heading: heading.trim(), visual: 'card', title: '', lines: [] };
    for (const raw of lines) {
      const line = raw.trim();
      const kv = /^(visual|title):\s*(.*)$/.exec(line);
      if (kv) seg[kv[1]] = fill(kv[2]);
      else if (line) seg.lines.push(fill(line));
    }
    if (!['heist', 'payouts', 'card'].includes(seg.visual)) throw new Error(`segment "${seg.heading}": unknown visual ${seg.visual}`);
    if (!seg.lines.length) throw new Error(`segment "${seg.heading}" has no narration`);
    segments.push(seg);
  }
  if (!segments.length) throw new Error('script has no ## segments');
  // Every {VAR} the caller did not pass: it is shown literally or with its script default.
  const body = fm[1] + text.slice(fm[0].length).split(/^## /m).slice(1).join('\n');
  const unresolved = [...new Set([...body.matchAll(/\{([A-Z0-9_]+)\}/g)].map((m) => m[1]))].filter((k) => !(k in cliVars));
  return { out: meta.out, voice: meta.voice || 'Samantha', rate: Number(meta.rate) || 175, segments, unresolved };
}

/** Splits narration into caption chunks of at most ~84 characters, cutting long sentences near
 *  their middle and preferring a comma. */
export function captionChunks(lines, max = 84) {
  const split = (text) => {
    if (text.length <= max) return [text];
    let best = -1;
    let bestScore = Infinity;
    for (let i = text.indexOf(' '); i > 0; i = text.indexOf(' ', i + 1)) {
      const score = Math.abs(i - text.length / 2) - (text[i - 1] === ',' || text[i - 1] === ':' ? 18 : 0);
      if (score < bestScore) [best, bestScore] = [i, score];
    }
    if (best < 0) return [text];
    return [...split(text.slice(0, best)), ...split(text.slice(best + 1))];
  };
  return lines.flatMap((line) => line.split(/(?<=[.!?])\s+/).filter(Boolean).flatMap((s) => split(s.trim())));
}

const assTime = (t) => {
  const cs = Math.max(0, Math.round(t * 100));
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
};
const assText = (s) => s.replace(/[{}]/g, (c) => (c === '{' ? '(' : ')'));

/** ASS subtitles: timed captions at the bottom, a segment label top left, card titles centred. */
export function buildAss(timeline) {
  const head = `[Script Info]
ScriptType: v4.00+
PlayResX: ${W}
PlayResY: ${H}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,Helvetica Neue,34,&H00FFFFFF,&H00FFFFFF,&H00000000,&H99000000,1,0,0,0,100,100,0,0,3,10,0,2,80,80,44,1
Style: Label,Helvetica Neue,22,&H0033D6FF,&H00FFFFFF,&H00000000,&H99000000,1,0,0,0,100,100,1,0,3,8,0,1,40,40,118,1
Style: Title,Helvetica Neue,56,&H00FFFFFF,&H00FFFFFF,&H00301018,&H00000000,1,0,0,0,100,100,0,0,1,4,2,5,90,90,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
  const ev = [];
  for (const seg of timeline) {
    const end = seg.start + seg.dur;
    if (seg.showTitle && seg.title) {
      // Shrink titles whose longest line would wrap (addresses are 42 chars, tx hashes 66).
      const longest = Math.max(...seg.title.split('\\N').map((l) => l.length));
      const size = longest > 42 ? `{\\fs${Math.max(20, Math.floor((56 * 42) / longest))}}` : '';
      ev.push(`Dialogue: 1,${assTime(seg.start)},${assTime(end)},Title,,0,0,0,,${size}${assText(seg.title)}`);
    }
    else ev.push(`Dialogue: 0,${assTime(seg.start)},${assTime(end)},Label,,0,0,0,,${assText(seg.heading.toUpperCase())}`);
    const chunks = captionChunks(seg.lines);
    const total = chunks.reduce((n, c) => n + c.length, 0);
    let t = seg.start;
    for (const c of chunks) {
      const d = (seg.speech * c.length) / total;
      ev.push(`Dialogue: 2,${assTime(t)},${assTime(t + d)},Caption,,0,0,0,,${assText(c)}`);
      t += d;
    }
  }
  return head + ev.join('\n') + '\n';
}

// ---------- recording ----------
function chromiumPath() {
  if (process.env.PW_CHROMIUM) return process.env.PW_CHROMIUM;
  const cache = join(homedir(), 'Library/Caches/ms-playwright');
  const candidates = [
    join(cache, 'chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell'),
    join(cache, 'chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'),
  ];
  return candidates.find((p) => existsSync(p));
}

async function waitForHttp(url, ms) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`${url} did not come up in ${ms / 1000}s`);
}

async function withPreview(fn) {
  const dist = join(WORK, 'heist-dist');
  console.log('• building Catnip Heist into out/work/heist-dist');
  run('npx', ['vite', 'build', '--outDir', dist, '--emptyOutDir', '--logLevel', 'error'], { cwd: HEIST });
  const server = spawn('npx', ['vite', 'preview', '--outDir', dist, '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
    cwd: HEIST,
    stdio: 'ignore',
    detached: true,
  });
  try {
    await waitForHttp(`http://127.0.0.1:${PORT}/`, 30_000);
    return await fn(`http://127.0.0.1:${PORT}/`);
  } finally {
    try {
      process.kill(-server.pid, 'SIGTERM');
    } catch {
      /* already gone */
    }
  }
}

function loadPlaywright() {
  const req = createRequire(join(HEIST, 'package.json'));
  return req('@playwright/test');
}

/** Records one browser session; `body(page, mark)` calls mark(start, end) for the keeper stretches. */
async function record(name, body) {
  const { chromium } = loadPlaywright();
  const dir = join(WORK, `rec-${name}`);
  rmSync(dir, { recursive: true, force: true });
  const browser = await chromium.launch({
    executablePath: chromiumPath(),
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
  });
  const keep = [];
  let raw;
  try {
    const context = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir, size: { width: W, height: H } } });
    const page = await context.newPage();
    const t0 = Date.now();
    const now = () => (Date.now() - t0) / 1000;
    await body(page, now, (a, b) => keep.push([a, b]));
    const video = page.video();
    await context.close();
    raw = await video.path();
  } finally {
    await browser.close();
  }
  if (!keep.length) throw new Error(`${name}: nothing was recorded`);
  copyFileSync(raw, join(WORK, `${name}.webm`));
  // Cut the keeper stretches out of the raw recording into one constant-rate clip.
  const parts = keep.map(([a, b], i) => `[0:v]trim=start=${a.toFixed(2)}:end=${b.toFixed(2)},setpts=PTS-STARTPTS,fps=${FPS},scale=${W}:${H}[v${i}]`);
  const filter = `${parts.join(';')};${keep.map((_, i) => `[v${i}]`).join('')}concat=n=${keep.length}:v=1:a=0[out]`;
  const outFile = join(WORK, `${name}.mp4`);
  ffmpeg(['-i', join(WORK, `${name}.webm`), '-filter_complex', filter, '-map', '[out]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', outFile]);
  writeFileSync(join(WORK, `${name}.json`), JSON.stringify({ keep }, null, 2));
  return outFile;
}

async function recordHeist(base, levels) {
  return record('heist', async (page, now, mark) => {
    for (const level of levels) {
      const ticks = JSON.parse(readFileSync(join(HEIST, 'src/levels', `${level}.solution.json`), 'utf8')).ticks;
      await page.goto(`${base}?replay=solution&speed=2&qa=1&level=${level}`);
      await page.waitForFunction(() => document.getElementById('app')?.dataset.ready === '1' && window.__heist?.screen() === 'heist', null, { timeout: 60_000 });
      const start = now();
      await page.waitForFunction(() => window.__heist.getState()?.won || window.__heist.screen() === 'results', null, {
        timeout: (ticks / 30 / 2) * 3000 + 30_000,
        polling: 250,
      });
      await page.waitForTimeout(1800); // let the Results card land
      mark(start, now());
      console.log(`  ${level}: ${(now() - start).toFixed(1)}s`);
    }
  });
}

async function recordPayouts(url) {
  return record('payouts', async (page, now, mark) => {
    await page.goto(url, { waitUntil: 'load', timeout: 60_000 });
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const start = now();
    await page.waitForTimeout(3000);
    const height = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
    const steps = 60;
    for (let i = 1; i <= steps; i++) {
      await page.evaluate((y) => scrollTo({ top: y }), (height * i) / steps);
      await page.waitForTimeout(250);
    }
    await page.waitForTimeout(2000);
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'smooth' }));
    await page.waitForTimeout(2500);
    mark(start, now());
  });
}

// ---------- assembly ----------
function speak(text, file, voice, rate) {
  run('say', ['-v', voice, '-r', String(rate), '-o', file, text]);
  return duration(file);
}

/** Loops `src` from `offset` for `dur` seconds; cards get a blurred, darkened copy. */
function clip(src, offset, dur, card, file) {
  const vf = [`fps=${FPS}`, `scale=${W}:${H}`, ...(card ? ['boxblur=18:2', 'eq=brightness=-0.22:saturation=0.8'] : []), 'format=yuv420p'].join(',');
  if (!src) {
    ffmpeg(['-f', 'lavfi', '-i', `color=c=0x1d1233:s=${W}x${H}:r=${FPS}:d=${dur.toFixed(3)}`, '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', file]);
    return;
  }
  ffmpeg(['-stream_loop', '-1', '-ss', offset.toFixed(3), '-i', src, '-t', dur.toFixed(3), '-an', '-vf', vf, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', file]);
}

function assemble(name, script, footage) {
  const dir = join(WORK, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const cursors = { heist: 0, payouts: 0 };
  const lengths = Object.fromEntries(Object.entries(footage).filter(([, f]) => f).map(([k, f]) => [k, duration(f)]));
  const timeline = [];
  let t = 0;
  script.segments.forEach((seg, i) => {
    const aiff = join(dir, `seg-${i}.aiff`);
    const speech = speak(seg.lines.join(' '), aiff, script.voice, script.rate);
    const dur = speech + GAP;
    const kind = seg.visual === 'payouts' && !footage.payouts ? 'card' : seg.visual;
    const srcKind = kind === 'payouts' ? 'payouts' : 'heist';
    const src = footage[srcKind];
    const offset = src ? cursors[srcKind] % lengths[srcKind] : 0;
    if (src) cursors[srcKind] += dur;
    clip(src, offset, dur, kind === 'card', join(dir, `seg-${i}.mp4`));
    timeline.push({ ...seg, start: t, dur, speech, aiff, showTitle: kind === 'card' });
    t += dur;
  });

  writeFileSync(join(dir, 'clips.txt'), timeline.map((_, i) => `file 'seg-${i}.mp4'`).join('\n') + '\n');
  ffmpeg(['-f', 'concat', '-safe', '0', '-i', 'clips.txt', '-c', 'copy', 'video.mp4'], { cwd: dir });

  const aIn = timeline.flatMap((s) => ['-i', s.aiff]);
  const pads = timeline.map((s, i) => `[${i}:a]aresample=48000,apad=whole_dur=${s.dur.toFixed(3)}[a${i}]`).join(';');
  const cat = `${timeline.map((_, i) => `[a${i}]`).join('')}concat=n=${timeline.length}:v=0:a=1[aout]`;
  ffmpeg([...aIn, '-filter_complex', `${pads};${cat}`, '-map', '[aout]', '-c:a', 'aac', '-b:a', '160k', 'voice.m4a'], { cwd: dir });

  writeFileSync(join(dir, 'captions.ass'), buildAss(timeline));
  const outFile = join(OUT, script.out);
  ffmpeg(
    ['-i', 'video.mp4', '-i', 'voice.m4a', '-vf', 'subtitles=captions.ass', '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'medium', '-crf', '21', '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-shortest', '-movflags', '+faststart', outFile],
    { cwd: dir },
  );
  return { outFile, seconds: duration(outFile), timeline };
}

// ---------- main ----------
async function main() {
  const args = parseArgs(process.argv.slice(2));
  requireTools();
  mkdirSync(WORK, { recursive: true });

  const footage = { heist: join(WORK, 'heist.mp4'), payouts: args.payoutsUrl ? join(WORK, 'payouts.mp4') : '' };
  const needHeist = !(args.reuse && existsSync(footage.heist));
  const needPayouts = !!args.payoutsUrl && !(args.reuse && existsSync(footage.payouts));
  if (needHeist) {
    await withPreview(async (base) => {
      console.log(`• recording solution replays: ${args.levels.join(', ')}`);
      await recordHeist(base, args.levels);
    });
  }
  if (needPayouts) {
    console.log(`• recording payouts page ${args.payoutsUrl}`);
    await recordPayouts(args.payoutsUrl);
  }
  if (!args.payoutsUrl) console.log('• no --payouts-url: payouts segments fall back to title cards');
  console.log(`• heist footage ${duration(footage.heist).toFixed(1)}s`);

  const results = [];
  for (const name of args.only) {
    const script = parseScript(readFileSync(join(HERE, 'scripts', `${name}.md`), 'utf8'), args.vars);
    if (args.voice) script.voice = args.voice;
    console.log(`• ${name}: ${script.segments.length} segments, voice ${script.voice} @ ${script.rate} wpm`);
    const r = assemble(name, script, footage);
    const ok = r.seconds >= MIN_S && r.seconds <= MAX_S;
    console.log(`  → ${r.outFile} ${r.seconds.toFixed(1)}s ${ok ? '(within 2-3 min)' : `(OUTSIDE ${MIN_S}-${MAX_S}s: edit scripts/${name}.md)`}`);
    if (script.unresolved.length) console.log(`  not passed, default or literal used: ${script.unresolved.map((k) => `{${k}}`).join(' ')} (pass --var KEY=value)`);
    results.push({ name, file: r.outFile, seconds: Number(r.seconds.toFixed(1)), ok, unresolved: script.unresolved });
  }
  writeFileSync(join(OUT, 'manifest.json'), JSON.stringify({ made: new Date().toISOString(), payoutsUrl: args.payoutsUrl || null, results }, null, 2));
  if (results.some((r) => !r.ok)) process.exitCode = 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e.message ?? e);
    process.exit(1);
  });
}
