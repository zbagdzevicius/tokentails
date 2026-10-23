// Trailer capture, group A (STORYBOARD sections 6 and 8): race set pieces, the hook, the grid, the hero slow motion and
// the finish. Deterministic frame-stepped capture: a virtual clock (clock-shim-a.js) advances exactly 1/60 s per
// frame, the shell's accumulator is quantised so a normal frame runs exactly one sim step, and each frame is a CDP
// screenshot piped to ffmpeg. Capture-only: the game build is untouched (page-a.js uses the existing QA hooks).
//
//   node review/trailer/capture-a.mjs probe [S01 S02 ...]     find anchors (seed sweeps) -> build/anchors-A.json
//   node review/trailer/capture-a.mjs record [S01 ...] [--aspect 16x9|9x16]
//                                                             -> build/footage/A/<id>-<aspect>.mp4 + .json
// Needs the game served on TRAILER_A_PORT (default 6211):
//   vite build --outDir review/trailer/build/dist-A --emptyOutDir
//   vite preview --outDir review/trailer/build/dist-A --host 127.0.0.1 --port 6211 --strictPort
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { H, SHOTS } from './shots-a.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BUILD = path.join(HERE, 'build');
const OUT = path.join(BUILD, 'footage', 'A');
const ANCHORS = path.join(BUILD, 'anchors-A.json');
const PORT = Number(process.env.TRAILER_A_PORT ?? 6211);
const BASE = `http://127.0.0.1:${PORT}`;
const Q = '&quality=high&bloom=1';
const SHIM = fs.readFileSync(path.join(HERE, 'clock-shim-a.js'), 'utf8');
const PAGE = fs.readFileSync(path.join(HERE, 'page-a.js'), 'utf8');
const ASPECTS = {
  '16x9': { viewport: { width: 960, height: 540 }, deviceScaleFactor: 2, size: [1920, 1080] },
  '9x16': { viewport: { width: 540, height: 960 }, deviceScaleFactor: 2, size: [1080, 1920] },
};
const MAX_TICK = 60 * 200;

fs.mkdirSync(OUT, { recursive: true });
const loadAnchors = () => (fs.existsSync(ANCHORS) ? JSON.parse(fs.readFileSync(ANCHORS, 'utf8')) : {});
const saveAnchors = (a) => fs.writeFileSync(ANCHORS, JSON.stringify(a, null, 2));

let browser = null;
async function getBrowser() {
  browser ??= await chromium.launch({ headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'] });
  return browser;
}

const url = (track, cls, seed) => `${BASE}/?track=${track}&bot=1&cls=${cls}&seed=${seed}${Q}`;

/** A fresh context on the race URL, frozen at the first tick, set up (muted, DOM hidden, DPR pinned). */
async function openRace(aspect, track, cls, seed) {
  const a = ASPECTS[aspect];
  const b = await getBrowser();
  const ctx = await b.newContext({ viewport: a.viewport, deviceScaleFactor: a.deviceScaleFactor, hasTouch: false, isMobile: false });
  await ctx.addInitScript({ content: SHIM });
  await ctx.addInitScript({ content: PAGE });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('console: ' + m.text());
  });
  await page.goto(url(track, cls, seed));
  await page.waitForFunction(() => window.__cap && window.__cap.frozen && window.__fm && window.__fm.shell.world, null, { timeout: 60_000 });
  const info = await page.evaluate(() => window.__A.setup({ dom: false }));
  return { ctx, page, errors, info };
}

/** Render-only warm-up at simSpeed 0: textures, the lazy bloom chunk, the camera settles on the grid. */
async function warm(page) {
  for (let i = 0; i < 400; i++) {
    const ok = await page.evaluate((n) => {
      window.__fm.shell.simSpeed = 0;
      window.__cap.step(1);
      return n > 20 && (!window.__fmFeel || window.__fmFeel.post());
    }, i);
    if (ok) return true;
    await new Promise((r) => setTimeout(r, 15));
  }
  return false;
}

// ---- probe --------------------------------------------------------------------------------------------------------
async function probeOne(shot, track, seed) {
  const { ctx, page, errors } = await openRace('16x9', track, shot.cls, seed);
  try {
    await page.evaluate(([spec, wall]) => {
      window.__A.hook(spec);
      if (wall) window.__A.installWall();
      window.__A.stopOnFinish = true;
    }, [shot.spec, !!shot.wall]);
    let tick = 0;
    for (let guard = 0; guard < 200; guard++) {
      const r = await page.evaluate((max) => {
        const t = window.__A.ff(max, 60, 24);
        const w = window.__fm.shell.world;
        return { t, fin: !!w.st.karts[w.cfg.humans[0]].finished, occ: window.__A.occ.length };
      }, MAX_TICK);
      tick = r.t;
      if (r.fin || tick >= MAX_TICK) break;
      if (shot.firstOnly && r.occ > 0) break;
    }
    // finish the pending scoring windows a little past the end
    const occ = await page.evaluate(() => window.__A.occ);
    return { occ, errors: [...errors], tick };
  } finally {
    await ctx.close();
  }
}

async function probe(ids) {
  const anchors = loadAnchors();
  for (const id of ids) {
    const shot = SHOTS[id];
    let seeds = shot.seeds;
    if (typeof seeds === 'string') seeds = [anchors[seeds]?.seed ?? 7];
    const tracks = Array.isArray(shot.track) ? shot.track : [shot.track];
    let best = null;
    const t0 = Date.now();
    for (const track of tracks) {
      for (const seed of seeds) {
        const r = await probeOne(shot, track, seed);
        if (r.errors.length) console.log(`  ${id} ${track} seed ${seed}: errors`, r.errors.slice(0, 3));
        // usable: the take window starts at or after tick 1
        const ok = r.occ.filter((o) => (shot.slowmo ? (o.launch ?? o.tick) - 10 : o.tick - shot.at) - H - 1 >= 1);
        const top = ok.reduce((m, o) => (!m || o.score > m.score ? o : m), null);
        process.stdout.write(`  ${id} ${track} s${seed}: ${r.occ.length} occ, best ${top ? `t${top.tick} sc${top.score.toFixed?.(2)} lap${top.lap}` : '-'}\n`);
        if (top && (!best || top.score > best.score)) best = { ...top, seed, track };
        if (seeds.length === 1 && tracks.length === 1) break;
      }
    }
    if (!best) {
      console.log(`${id}: NO ANCHOR`);
      continue;
    }
    anchors[id] = { track: best.track, cls: shot.cls, seed: best.seed, tick: best.tick, score: best.score, lap: best.lap, launch: best.launch, probedAt: new Date().toISOString() };
    saveAnchors(anchors);
    console.log(`${id}: ${best.track} seed ${best.seed} tick ${best.tick} score ${best.score} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  }
}

// ---- record -------------------------------------------------------------------------------------------------------
/**
 * S34 speed profiles (speed per cut frame f; the handles share the edge speeds). The landing (the anchor) must show on
 * cut f100. The flight is ~53 ticks, so a launch at cut f10 leaves room for only ~0.53x; two takes:
 *  - 'hero': the shot opens mid-air at 0.3x, ramps 0.3 -> 1 over cut f88-100, lands on f100 (the launch is before f0)
 *  - 'launch': 1x to cut f12 (launch on f10), a 6-frame ease to s = (n - 11) / 79, ramps back to 1x on f100
 */
function slowProfile(kind, n) {
  if (kind === 'hero') {
    const s = 0.3;
    return { s, sp: (f) => (f < 88 ? s : f < 100 ? s + ((1 - s) * (f - 88 + 1)) / 12 : 1) };
  }
  const s = Math.max(0.2, Math.min(1, (n - 11) / 79));
  const sp = (f) => {
    if (f < 12) return 1;
    if (f < 18) return 1 + ((s - 1) * (f - 12 + 1)) / 6;
    if (f < 88) return s;
    if (f < 100) return s + ((1 - s) * (f - 88 + 1)) / 12;
    return 1;
  };
  return { s, sp };
}

async function recordOne(id, aspect) {
  const shot = SHOTS[id];
  const anc = loadAnchors()[shot.anchorOf ?? id];
  if (!anc) throw new Error(`${id}: no anchor, run probe first`);
  const rec = shot.len + 2 * H;
  const flight = shot.slowmo ? anc.tick - anc.launch : 0;
  const prof = shot.slowmo ? slowProfile(shot.slowmo, flight) : null;
  // the frame where the cut starts shows tick `cut0`; recorded frame i shows the tick after i+1 steps from `start`
  let start = anc.tick - shot.at - H - 1;
  if (prof) {
    // frame i shows `start + floor(sum of speeds up to i)`: put the landing on cut f100 exactly
    let cum = 0;
    for (let i = 0; i <= H + shot.at; i++) cum += prof.sp(i - H);
    start = anc.tick - Math.floor(cum + 1e-6);
  }
  const { ctx, page, errors, info } = await openRace(aspect, anc.track, shot.cls, anc.seed);
  const file = path.join(OUT, `${id}-${aspect}.mp4`);
  const [W, Hh] = ASPECTS[aspect].size;
  try {
    if (info.w !== W || info.h !== Hh) throw new Error(`${id} ${aspect}: canvas ${info.w}x${info.h}, want ${W}x${Hh}`);
    await page.evaluate(([spec, wall]) => {
      window.__A.hook(spec);
      if (wall) window.__A.installWall();
    }, [shot.spec, !!shot.wall]);
    const warmed = await warm(page);
    const reached = await page.evaluate(async (to) => {
      let t = 0;
      for (let i = 0; i < 400 && t < to; i++) t = window.__A.ff(to, 50, 24);
      // the chase rig lagged the fast-forward: cut it to the kart (a teleport, as review/v3 does), then 60 handle
      // frames of normal running settle it before the cut
      const s = window.__fm.shell;
      const k = s.world.st.karts[s.world.cfg.humans[0]];
      if (!k.rail) s.camera.snap(k.x, k.y, k.z, k.heading);
      return t;
    }, start);
    if (reached !== start) throw new Error(`${id}: fast-forward reached ${reached}, want ${start}`);
    const cdp = await ctx.newCDPSession(page);
    const ff = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', '60', '-c:v', 'png', '-i', '-',
      '-vf', 'scale=out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int', '-c:v', 'libx264', '-preset', 'slow', '-crf', '12',
      '-pix_fmt', 'yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv', '-r', '60', '-movflags', '+faststart', file], { stdio: ['pipe', 'inherit', 'inherit'] });
    const done = new Promise((res, rej) => ff.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg ' + c)))));
    const frames = [];
    for (let i = 0; i < rec; i++) {
      const f = i - H; // cut frame
      const cfg = {};
      if (i === 0) cfg.resetAcc = true;
      if (shot.tv) cfg.tv = true;
      if (prof) cfg.simSpeed = prof.sp(f);
      const fi = await page.evaluate((c) => window.__A.frame(c), cfg);
      // clip scale = the device scale factor: without it CDP returns CSS pixels (960x540), with it the native canvas
      const shotPng = await cdp.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, ...ASPECTS[aspect].viewport, scale: ASPECTS[aspect].deviceScaleFactor } });
      const buf = Buffer.from(shotPng.data, 'base64');
      if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
      if (i === 0 && (buf.readUInt32BE(16) !== W || buf.readUInt32BE(20) !== Hh)) throw new Error(`${id}: screenshot ${buf.readUInt32BE(16)}x${buf.readUInt32BE(20)}`);
      frames.push({ i, cut: f, ...fi });
    }
    if (shot.tv) await page.evaluate(() => (window.__fm.shell.camera.feel.reducedMotion = false));
    ff.stdin.end();
    await done;
    const anchorFrame = frames.findIndex((x) => x.tick >= anc.tick);
    const want = H + shot.at;
    const odd = frames.filter((x) => x.steps !== 1 && !prof).map((x) => `${x.i}:${x.steps}`);
    const meta = {
      id, aspect, track: anc.track, cls: shot.cls, seed: anc.seed, url: url(anc.track, shot.cls, anc.seed).replace(BASE, ''),
      fps: 60, frames: rec, size: [W, Hh], cutIn: H, cutOut: H + shot.len, anchorTick: anc.tick, anchorFrame, anchorFrameWanted: want,
      slowmo: prof ? { flightTicks: flight, minSpeed: +prof.s.toFixed(3), launchFrame: frames.findIndex((x) => x.tick >= anc.launch) } : undefined,
      warmed, oddSteps: odd, peakCalls: Math.max(...frames.map((x) => x.calls)), errors,
      frameLog: frames.map((x) => ({ i: x.i, tick: x.tick, si: x.si, rail: x.rail, air: x.air, surface: x.surface, place: x.place, cam: x.cam, ev: x.events.length ? x.events : undefined })),
    };
    fs.writeFileSync(file.replace(/\.mp4$/, '.json'), JSON.stringify(meta));
    console.log(`${id} ${aspect}: ${rec} f, anchor frame ${anchorFrame} (want ${want}), odd steps [${odd.slice(0, 12).join(' ')}${odd.length > 12 ? ' …' : ''}], peak calls ${meta.peakCalls}, errors ${errors.length}${prof ? `, slow ${prof.s.toFixed(2)} flight ${flight}` : ''}`);
    return meta;
  } finally {
    await ctx.close();
  }
}

// ---- main ---------------------------------------------------------------------------------------------------------
const [cmd, ...rest] = process.argv.slice(2);
const aspIdx = rest.indexOf('--aspect');
const aspects = aspIdx >= 0 ? rest.splice(aspIdx, 2)[1].split(',') : ['16x9', '9x16'];
const ids = rest.length ? rest : Object.keys(SHOTS).filter((k) => cmd !== 'probe' || !SHOTS[k].anchorOf);
try {
  if (cmd === 'probe') await probe(ids);
  else if (cmd === 'record') {
    for (const id of ids) for (const a of aspects) await recordOne(id, a);
  } else console.log('usage: capture-a.mjs probe|record [ids] [--aspect 16x9,9x16]');
} finally {
  await browser?.close();
}
