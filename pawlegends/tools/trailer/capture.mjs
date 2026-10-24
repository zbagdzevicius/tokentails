#!/usr/bin/env node
/**
 * Trailer capture (storyboard §8 step 3): steps every shot of shots.mjs frame by frame in Playwright Chromium through
 * the dev-only harness (tools/trailer/harness.html) and writes PNG sequences:
 *
 *   <out>/<shot>/<aspect>/f0000.png ...      (frame numbers are the 30 s master's, f0000-f1799)
 *   <out>/manifest.json                       frames, start ticks, measured key ticks, hash checks, changes
 *
 *   node tools/trailer/capture.mjs [--only S01,S13] [--aspect 16x9|9x16|both] [--out DIR] [--url http://127.0.0.1:5176]
 *                                  [--probe] [--every N]
 *
 * Timing: each shot puts its take's key tick on its anchor frame. A probe run (no screenshots) measures where the
 * key lands with the game's own hit-stops and slow motion, and the start tick is corrected until it lands exactly; a
 * `fit` key stretches the ramp on its segment the same way. WHIP frames are 32 sub-frames; the first 16 (a 180°
 * shutter) of the 3D canvas are averaged by ffmpeg and the screen-space layer is laid on top once per frame. Every take's event-log hash is checked against takes.json (Node).
 * `--probe` stops after the timing pass; `--every N` saves every Nth frame only (a quick look).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { argValue, hasFlag } from '../lib/args.mjs';
import * as SHOT_LIST from './shots.mjs';
// Node strips the types (the same maths the harness runs)
import { rampAt, rampTicks, scaleRamp } from './director.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = resolve(HERE, '..', '..');
const require = createRequire(join(PKG, 'package.json'));
const { chromium } = require('@playwright/test');

const OUT = resolve(argValue('--out') ?? join(HERE, 'out', 'shots'));
const ONLY = (argValue('--only') ?? '').split(',').filter(Boolean);
const ASPECT = argValue('--aspect') ?? 'both';
const EVERY = Number(argValue('--every') ?? 1);
const PROBE_ONLY = hasFlag('--probe');
/** v3.2 `--qc`: every frame run and QC'd (qc.json written), nothing saved: a fast check of a shot's window. */
const QC_ONLY = hasFlag('--qc');
/** `--debug`: print the harness debug() state after every frame (structures' render state). */
const DEBUG = hasFlag('--debug');
/** `--pick f,x,y`: debug, list what the lens sees at screen fraction (x, y) after frame f. */
const PICK = argValue('--pick') ? argValue('--pick').split(',').map(Number) : null;
// `--shots-file`: another shot list module (look-dev variants); same exports as shots.mjs
const { SHOTS, portraitKeys } = argValue('--shots-file') ? await import(resolve(argValue('--shots-file'))) : SHOT_LIST;
// v3.2 `--takes-file`: extra takes (a moment scan's candidates) merged over takes.json
const TAKES = { ...JSON.parse(readFileSync(join(HERE, 'takes.json'), 'utf8')).takes, ...(argValue('--takes-file') ? JSON.parse(readFileSync(resolve(argValue('--takes-file')), 'utf8')).takes : {}) };
const SIZES = { '16x9': [1920, 1080], '9x16': [1080, 1920] };

/** '@hero' → slot 0; '@name' → the take's role (an entity id), or for a `point` its point ([x, y] mm). */
function ref(v, take, point = false) {
  if (typeof v !== 'string' || !v.startsWith('@')) return v;
  const name = v.slice(1);
  if (name === 'hero') return 0;
  const first = point ? take?.points : take?.roles;
  const second = point ? take?.roles : take?.points;
  if (first && name in first) return first[name];
  if (second && name in second) return second[name];
  throw new Error(`unknown role ${v} in take ${take?.id}`);
}
function mapTarget(t, take) {
  if (!t) return t;
  if (t.cut) return { cut: t.cut.map(([f, x]) => [f, mapTarget(x, take)]) };
  if (t.blend) return { ...t, blend: t.blend.map((x) => mapTarget(x, take)) };
  const o = { ...t };
  for (const k of ['unit', 'proj', 'fallback', 'point', 'near']) if (k in o) o[k] = ref(o[k], take, k === 'point');
  if ('point' in o && !Array.isArray(o.point)) throw new Error(`point target ${t.point} is not a point in take ${take?.id}`);
  if (o.mid) o.mid = o.mid.map((x) => ref(x, take));
  return o;
}

function specFor(shot, aspect) {
  const portrait = aspect === '9x16';
  const take = shot.take ? TAKES[shot.take] : null;
  if (shot.take && !take) throw new Error(`${shot.id}: take ${shot.take} missing from takes.json (run seed-search.mjs)`);
  const p = portrait ? (shot.portrait ?? {}) : {};
  // v3: a landscape shot may set its CSS size and DPR (`size: [1280, 720], dpr: 1.5`: the HUD as big as a player sees it)
  const [w, h] = portrait ? [p.width ?? SIZES[aspect][0], p.height ?? SIZES[aspect][1]] : (shot.size ?? SIZES[aspect]);
  // v3: `portrait.cam` replaces the whole camera in 9:16 (the game is not played in portrait: a director preset there)
  const cs = portrait && p.cam !== undefined ? p.cam : shot.cam;
  return {
    id: shot.id,
    mode: shot.lobby ? 'lobby' : 'match',
    width: w,
    height: h,
    // `lead`: frames rendered (on the shot's ramp, through the real frame path) before f0 and not saved, so an event
    // just before the first saved frame (a cast whose clip must already be playing on frame 0) is drawn live
    f0: shot.f0 - (shot.lead ?? 0),
    // `portrait.f1`: the 9:16 take runs on (a beat the vertical leaves out, such as the landscape HUD)
    f1: p.f1 ?? shot.f1,
    preroll: shot.preroll ?? 90,
    take: take ? { seed: take.seed, hero: take.hero, trick: take.trick, difficulty: take.difficulty, script: take.script ?? [], look: shot.look ?? null, check: take.check } : null,
    cam: cs ? { target: mapTarget(p.target ?? cs.target, take), keys: portrait && p.cam === undefined ? portraitKeys(shot) : cs.keys, smooth: cs.smooth, ...(cs.base ? { base: cs.base } : {}), ...(cs.off ? { off: cs.off } : {}), ...((p.align ?? cs.align) ? { align: { a: ref((p.align ?? cs.align).a, take), b: ref((p.align ?? cs.align).b, take) } } : {}) } : null,
    ramp: shot.ramp ?? [],
    layers: p.layers ?? shot.layers ?? ["pops"],
    hide: shot.hide ?? [],
    wheel: shot.wheel ?? null,
    touch: !!p.touch,
    dpr: portrait ? (p.dpr ?? 1) : (shot.dpr ?? 1),
    gameLook: !!(p.gameLook ?? shot.gameLook),
    // v3.1: screen text in output time, hero names on plates, the off-screen "You" arrow only when the camera is the
    // player's own, the banner only inside `bannerOn` windows
    uiOut: !!(p.uiOut ?? shot.uiOut ?? (p.gameLook ?? shot.gameLook)),
    heroNames: !!(p.heroNames ?? shot.heroNames ?? (p.gameLook ?? shot.gameLook)),
    selfEdge: p.selfEdge ?? shot.selfEdge ?? (!portrait && cs?.base === 'game'),
    bannerOn: p.bannerOn ?? shot.bannerOn ?? null,
    // v3.2 plate options and the stray-number cull (harness ShotSpec)
    selfName: !!(p.selfName ?? shot.selfName),
    edgeArrows: p.edgeArrows ?? shot.edgeArrows ?? true,
    tags: p.tags ?? shot.tags ?? true,
    minionBars: p.minionBars ?? shot.minionBars ?? true,
    popCull: p.popCull ?? shot.popCull ?? null,
    popLife: p.popLife ?? shot.popLife ?? null,
    popMaxLife: p.popMaxLife ?? shot.popMaxLife ?? null,
    structNums: !!(p.structNums ?? shot.structNums),
    // v3.4: the real HUD faded by keys; twin heroes keep the game's persona plates
    hudFade: p.hudFade ?? shot.hudFade ?? null,
    twinNames: !!(p.twinNames ?? shot.twinNames),
    autoFit: (portrait ? p.autoFit : shot.autoFit) ?? null,
    uiFade: p.uiFade ?? shot.uiFade ?? null,
    popText: p.popText ?? shot.popText ?? null,
    dmgRadius: p.dmgRadius ?? shot.dmgRadius ?? null,
    realFlash: shot.realFlash ?? true,
    cullHeroes: p.cullHeroes ?? shot.cullHeroes ?? null,
    cullFront: p.cullFront ?? shot.cullFront ?? null,
    near: p.near ?? shot.near ?? null,
    wheelScale: p.wheelScale ?? shot.wheelScale ?? null,
    // v3: every director shot hides a structure in front of its subject unless the shot says `xray: false`
    xray: (p.xray ?? shot.xray) !== false && !!cs,
    flashCap: shot.flashCap ?? 2,
    flashMax: shot.flashMax ?? 0.06,
    cullMinions: p.cullMinions ?? shot.cullMinions ?? null,
    minionsOff: !!(p.minionsOff ?? shot.minionsOff),
    cullLens: p.cullLens ?? shot.cullLens ?? null,
    cullLos: p.cullLos ?? shot.cullLos ?? null,
    banners: !!(p.banners ?? shot.banners),
    xrayMode: p.xrayMode ?? shot.xrayMode ?? 'hide',
    hidePudding: !!(p.hidePudding ?? shot.hidePudding),
    ghosts: !!(p.ghosts ?? shot.ghosts),
    shockI: p.shockI ?? shot.shockI ?? 0.5,
    hideGroups: shot.hideGroups ?? [],
    hideNames: p.hideNames ?? shot.hideNames ?? [],
    hideIds: (p.hideIds ?? shot.hideIds ?? []).map((x) => ref(x, take)),
    popScale: p.popScale ?? shot.popScale ?? null,
    groundK: p.groundK ?? shot.groundK ?? null,
    bolts: !!(p.bolts ?? shot.bolts),
    lobby: shot.lobby ? { ...shot.lobby, ...(p.stands ? { stands: p.stands } : {}), ...(p.lobby ?? {}) } : undefined,
  };
}

async function startServer() {
  const url = argValue('--url');
  if (url) return { url, close: async () => undefined };
  const { createServer } = await import('vite');
  const server = await createServer({ root: PKG, configFile: join(PKG, 'vite.config.ts'), logLevel: 'error', server: { port: 5197, strictPort: false, host: '127.0.0.1', hmr: false, watch: null } });
  await server.listen();
  const addr = server.resolvedUrls?.local?.[0] ?? 'http://127.0.0.1:5197/';
  return { url: addr.replace(/\/$/, ''), close: () => server.close() };
}

const browser = await chromium.launch({ args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu', '--force-color-profile=srgb'] });
const server = await startServer();

async function openPage(spec) {
  const ctx = await browser.newContext({ viewport: { width: spec.width, height: spec.height }, deviceScaleFactor: spec.dpr ?? 1, reducedMotion: 'no-preference' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error(`  [${spec.id}] pageerror ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') console.error(`  [${spec.id}] console ${m.text().slice(0, 200)}`);
  });
  await page.goto(`${server.url}/tools/trailer/harness.html`);
  await page.waitForFunction(() => window.__trailer?.ready, null, { timeout: 60000 });
  const loaded = await page.evaluate((s) => window.__trailer.load(s), spec);
  if (spec.touch) await page.evaluate(() => window.__trailer.touch(true));
  return { page, ctx, loaded };
}

/** Render frames f0..last without saving; the render tick after each frame. */
async function probe(spec, last) {
  const { page, ctx } = await openPage(spec);
  const ticks = await page.evaluate(
    ({ f0, last }) => {
      const out = {};
      for (let f = f0; f <= last; f++) {
        out[f] = window.__trailer.frame(f).tick;
        out[`b${f}`] = document.documentElement.dataset.banner ?? '';
      }
      return out;
    },
    { f0: spec.f0, last },
  );
  await ctx.close();
  return ticks;
}

/** The shot's fits: `fits: [{ key, frame, seg }]` (v2, solved in order) or the single `fit`. */
const fitsOf = (shot, take) => (shot.fits ?? (shot.fit ? [shot.fit] : [])).filter((x) => Number.isFinite(take.keys[x.key]));

/**
 * Solve the start tick (anchor) and the ramp stretch per fit. Fits are solved one after another (each segment lies
 * after the one before, so a later stretch never moves an earlier key): fit i scales its own segment of the ramp that
 * already holds the stretches of fits 0..i-1.
 */
async function solveTiming(shot, spec) {
  const take = TAKES[shot.take];
  const a = shot.anchor;
  const K = take.keys[a.key] + (a.offset ?? 0);
  if (!Number.isFinite(K)) throw new Error(`${shot.id}: take ${shot.take} has no key ${a.key}`);
  if (a.frame < spec.f0 || a.frame > spec.f1) throw new Error(`${shot.id}: anchor frame ${a.frame} outside ${spec.f0}-${spec.f1}`);
  spec.startTick = K - rampTicks(spec.ramp, spec.f0 + 1, a.frame + 1);
  const fits = fitsOf(shot, take);
  const log = [];
  if (!fits.length) {
    for (let i = 0; i < 8; i++) {
      const t = await probe(spec, a.frame);
      const errA = K - t[a.frame];
      log.push({ errA: +errA.toFixed(3) });
      if (Math.abs(errA) <= 0.05) break;
      spec.startTick += errA;
    }
  }
  for (const fit of fits) {
    // the key must be crossed ON its frame (the frame before ends short of it). A game hit-stop that the key itself
    // starts freezes the clock right after the crossing, so the search measures the crossing frame: proportional steps
    // while the crossing is late, bisection once it has been early
    const baseRamp = spec.ramp;
    const last = Math.max(a.frame, fit.frame);
    const K2 = take.keys[fit.key] + (fit.offset ?? 0);
    let k = 1;
    let lo = 0;
    let hi = Infinity;
    let ok = false;
    for (let i = 0; i < 16; i++) {
      spec.ramp = scaleRamp(baseRamp, fit.seg[0], fit.seg[1], k);
      const t = await probe(spec, last);
      const errA = K - t[a.frame];
      let c = -1;
      for (let f = fit.seg[0]; f <= last; f++) if (t[f] >= K2 - 1e-3) {
        c = f;
        break;
      }
      const errF = c < 0 ? last + 1 - fit.frame : c - fit.frame;
      const base = t[fit.seg[0] - 1] ?? spec.startTick;
      log.push({ fit: fit.key, errA: +errA.toFixed(3), errF, k: +k.toFixed(4) });
      if (Math.abs(errA) <= 0.05 && c === fit.frame) {
        ok = true;
        break;
      }
      if (Math.abs(errA) > 0.05) {
        spec.startTick += errA;
        continue;
      }
      if (c < 0 || c > fit.frame) {
        lo = Math.max(lo, k);
        const covered = t[fit.frame - 1] - base;
        const want = K2 - (rampAt(spec.ramp, fit.frame) * 0.5) / 2 - base;
        const prop = covered > 0.01 ? (k * want) / covered : k * 1.5;
        k = Number.isFinite(hi) ? Math.min((lo + hi) / 2, prop) : prop;
        if (k <= lo) k = Number.isFinite(hi) ? (lo + hi) / 2 : lo * 1.2;
      } else {
        hi = Math.min(hi, k);
        k = lo > 0 ? (lo + hi) / 2 : k * 0.7;
      }
    }
    if (!ok) console.error(`  ${shot.id}: fit ${fit.key} -> f${fit.frame} not exact (${JSON.stringify(log.at(-1))})`);
  }
  // `banner`: the announcer's banner may wait behind another one; move the take so it is up on the anchor frame
  if (a.banner) {
    for (let i = 0; i < 5; i++) {
      const t = await probe(spec, a.frame + 240);
      let first = -1;
      for (let f = spec.f0; f <= a.frame + 240; f++) if (t[`b${f}`] === a.banner) {
        first = f;
        break;
      }
      log.push({ banner: first });
      if (first < 0 || first === a.frame) break;
      spec.startTick += t[first] - t[a.frame];
    }
  }
  return { anchorTick: K, log };
}

/** Overlap QC: hero bodies may overlap on screen for at most this many frames in a row. */
const OVERLAP_FRAMES = 2;
/**
 * v3.6: a body more than this share hidden behind a nearer one fails (was 0.5: Sir Brutus over Bruno the Cacklejaw at
 * 0.47 read as one blob in the v3.5 review), and so does any `clip` (a head drawn inside a nearer body: Bolt the Brutus
 * leaning into Gabė at 0.34-0.39 hidden).
 */
const HIDDEN_MAX = 0.4;

/** Sub-frames per WHIP frame (half of them, a 180° shutter, are averaged: a continuous smear, not ghost copies). */
const SUBS = 32;

function blend(files, out, dom = null) {
  const args = ['-loglevel', 'error', '-y'];
  for (const f of files) args.push('-i', f);
  if (dom) args.push('-i', dom);
  const mix = `mix=inputs=${files.length}:weights=${files.map(() => '1').join(' ')}`;
  args.push('-filter_complex', dom ? `${mix},format=rgba[m];[m][${files.length}:v]overlay=format=auto,format=rgb24` : mix, '-frames:v', '1', out);
  execFileSync('ffmpeg', args);
}

function partOf(shot, f) {
  if (!shot.parts) return shot.id;
  return shot.parts.find((p) => f >= p.f0 && f <= p.f1)?.id ?? shot.id;
}

/** Motion-blurred frames: the whip and, in v2, `blur: [[a, b], ...]` (acrobatic peaks). */
function blurRanges(shot) {
  const r = [];
  if (shot.whip) r.push(shot.whip);
  for (const b of shot.blur ?? []) r.push(b);
  return r;
}

async function capture(shot, aspect) {
  const spec = specFor(shot, aspect);
  const t0 = Date.now();
  let timing = null;
  if (spec.mode === 'match') timing = await solveTiming(shot, spec);
  if (PROBE_ONLY) return { id: shot.id, aspect, timing, startTick: spec.startTick, ramp: spec.ramp };
  // `looks`: the same frames once per card look ([[fromFrame, card], ...]); each pass keeps its own window
  const passes = shot.looks ? shot.looks.map(([from, card], i) => ({ card, a: from, b: i + 1 < shot.looks.length ? shot.looks[i + 1][0] - 1 : spec.f1 })) : [{ card: undefined, a: shot.f0, b: spec.f1 }];
  const dirs = new Set();
  const keyTicks = {};
  let saved = 0;
  let info = null;
  let hash = null;
  const overlaps = [];
  const inStruct = [];
  const edgeText = [];
  const extra = { contacts: [], minionIns: [], dupes: [], stalePops: [], flashPops: [] };
  for (const pass of passes) {
    if (pass.card !== undefined) spec.take = { ...spec.take, look: pass.card };
    const r = await capturePass(shot, spec, aspect, pass, dirs, keyTicks);
    saved += r.saved;
    info = r.info;
    hash = r.hash;
    overlaps.push(...r.overlaps);
    inStruct.push(...r.inStruct);
    edgeText.push(...r.edgeText);
    for (const k of Object.keys(extra)) extra[k].push(...(r[k] ?? []));
  }
  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  console.error(`  ${shot.id} ${aspect}: ${saved} frames${timing ? `, start tick ${spec.startTick.toFixed(2)}, anchor ${timing.anchorTick} (${JSON.stringify(timing.log.at(-1))})` : ''}${hash ? `, hash ${hash.ok ? 'ok' : `MISMATCH ${hash.browser} vs ${hash.node}`}` : ''} (${secs} s)`);
  return {
    id: shot.id,
    aspect,
    parts: shot.parts ?? [{ id: shot.id, f0: shot.f0, f1: spec.f1 }],
    frames: spec.f1 - shot.f0 + 1,
    saved,
    size: [spec.width * (spec.dpr ?? 1), spec.height * (spec.dpr ?? 1)],
    take: shot.take ?? null,
    startTick: spec.startTick ?? null,
    ramp: spec.ramp,
    timing,
    hash,
    said: info?.said ?? null,
    /** Overlap QC: frame runs where hero bodies overlapped on screen (empty = pass). */
    overlaps,
    inStruct,
    edgeText,
    ...extra,
    firstTick: keyTicks[shot.f0] ?? null,
    lastTick: keyTicks[spec.f1] ?? null,
    /** The render tick after each (non-blurred) frame: where every frame sits in the take. */
    ticks: Object.fromEntries(Object.entries(keyTicks).map(([f, t]) => [f, +t.toFixed(3)])),
  };
}

async function capturePass(shot, spec, aspect, pass, dirs, keyTicks) {
  const { page, ctx } = await openPage(spec);
  const blurs = blurRanges(shot);
  let saved = 0;
  /** Runs [from, to] of frames with overlapping hero bodies (longer than OVERLAP_FRAMES). */
  const overlaps = [];
  let overlapRun = null;
  /** v3.1 per-frame QC (harness FrameQc), written next to the frames as qc.json. */
  const qcFrames = {};
  for (let f = spec.f0; f <= spec.f1; f++) {
    const dir = join(OUT, partOf(shot, f), aspect);
    if (!dirs.has(dir) && f >= pass.a) {
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true });
      dirs.add(dir);
    }
    const file = join(dir, `f${String(f).padStart(4, '0')}.png`);
    if (PICK && f === PICK[0] + 1) console.log(`[pick ${shot.id} f${PICK[0]}]`, JSON.stringify(await page.evaluate(([x, y]) => window.__trailer.pick(x, y), [PICK[1], PICK[2]])));
    const save = !QC_ONLY && (f >= pass.a && f <= pass.b) && ((f - shot.f0) % EVERY === 0 || f === spec.f1);
    // v4: no accumulation on a held frame (speed 0 across the whole frame: the sub-frames are the same picture)
    const held = rampAt(spec.ramp, f) <= 1e-4 && rampAt(spec.ramp, f + 1) <= 1e-4;
    if (!held && !QC_ONLY && blurs.some(([a, b]) => f >= a && f <= b)) {
      // the 3D picture: SUBS sub-frames, the first `open` (the shutter) averaged; the screen-space layer (numbers,
      // callouts, barks) is shot once at the end of the frame and laid on top, so it never smears. v4: a hero that
      // jumps (a knockback snap, a blink) inside the shutter would leave a discrete double image, so the frame then
      // keeps only the sub-frames after the last snap
      const subs = [];
      const open = Math.max(1, Math.round(SUBS * (shot.shutter ?? 0.5)));
      if (save) await page.evaluate(() => window.__trailer.layerMode('canvas'));
      let snapAt = 0;
      for (let k = 0; k < SUBS; k++) {
        const r = await page.evaluate(({ f, k, n }) => window.__trailer.frame(f, k, n), { f, k, n: SUBS });
        if (k === 0 && r.qc && f >= shot.f0) qcFrames[f] = { ...r.qc, move: +r.move.toFixed(3) };
        if (k > 0 && k < open && r.move > 0.25) snapAt = k;
        if (k < open && save) {
          const sf = join(dir, `.sub-${f}-${k}.png`);
          await page.screenshot({ path: sf, type: 'png' });
          subs.push(sf);
        }
      }
      if (save) {
        const dom = join(dir, `.dom-${f}.png`);
        await page.evaluate(() => window.__trailer.layerMode('dom'));
        await page.screenshot({ path: dom, type: 'png', omitBackground: true });
        await page.evaluate(() => window.__trailer.layerMode('all'));
        blend(subs.slice(snapAt), file, dom);
        for (const s of [...subs, dom]) rmSync(s, { force: true });
      }
    } else {
      const r = await page.evaluate((f) => window.__trailer.frame(f), f);
      if (DEBUG) console.log(`[debug ${shot.id} f${f} t${r.tick.toFixed(1)}]`, JSON.stringify(await page.evaluate(() => window.__trailer.debug())));
      if (save) await page.screenshot({ path: file, type: 'png' });
      if (f >= shot.f0) keyTicks[f] = r.tick;
      if (r.qc && f >= shot.f0) qcFrames[f] = { ...r.qc, move: +r.move.toFixed(3) };
      // overlap QC: hero bodies overlapping on screen for more than OVERLAP_FRAMES frames in a row fail the take
      // v3.2: a pair sharing > 45 % of the smaller body box, or any body more than half hidden by a nearer one
      // v3.4: on a crane's whole-map view every hero is a speck (under 4 % of the frame tall): no body can read as
      // clipping there, so those frames are not counted
      const specks = (r.qc?.heroes ?? []).every((h) => h.box[3] - h.box[1] < 0.04);
      if (f >= shot.f0 && !specks && (r.overlap > 0 || (r.qc?.hidden ?? 0) > HIDDEN_MAX || (r.qc?.clip ?? 0) > 0)) overlapRun = overlapRun ? [overlapRun[0], f] : [f, f];
      else if (overlapRun) {
        if (overlapRun[1] - overlapRun[0] + 1 > OVERLAP_FRAMES) overlaps.push(overlapRun);
        overlapRun = null;
      }
    }
    if (save) saved++;
  }
  if (overlapRun && overlapRun[1] - overlapRun[0] + 1 > OVERLAP_FRAMES) overlaps.push(overlapRun);
  if (overlaps.length) console.error(`  ${shot.id} ${aspect}: OVERLAP QC FAIL, hero bodies overlap on f${overlaps.map(([a, b]) => `${a}-${b}`).join(', f')}`);
  // v3.1 gates on the per-frame QC: a hero inside a structure, game text at the frame edge (more than 2 frames running)
  const runsOf = (pred) => {
    const out = [];
    let run = null;
    for (let f = shot.f0; f <= spec.f1 + 1; f++) {
      const q = qcFrames[f];
      const specks = q && (q.heroes ?? []).every((h) => h.box[3] - h.box[1] < 0.04);
      if (q && !specks && pred(q)) run = run ? [run[0], f] : [f, f];
      else if (run) {
        if (run[1] - run[0] + 1 > OVERLAP_FRAMES) out.push(run);
        run = null;
      }
    }
    return out;
  };
  const inStruct = runsOf((q) => q.inStruct > 0);
  // v3.3 gates: bodies in contact on the ground, a minion inside a hero, one hero name drawn twice, a number older
  // than its game life or pinned in place (the pop cull should have dropped it)
  const contacts = runsOf((q) => (q.contact ?? 0) > 0);
  const minionIns = runsOf((q) => (q.minionIn ?? 0) > 0);
  const dupes = runsOf((q) => (q.dupes ?? []).length > 0);
  const stalePops = runsOf((q) => (q.pops ?? []).some((p) => (p.age ?? 0) > 60 || (p.still ?? 0) > 14));
  // v3.4: a number or word on screen for one frame only (none like it near it on the frames before and after) is a
  // stray pop (the trailer v3.3 review: an orange 79 on a shot's first frame, gone on the next)
  const flashPops = [];
  // a merged damage counter changes its number every hit: two numbers in one place are the same pop
  const num = (t) => /^[+\-]?[\d.,]+$/.test(t);
  const near = (a, b) => (a.text === b.text || (num(a.text) && num(b.text))) && Math.abs((a.box[0] + a.box[2]) / 2 - (b.box[0] + b.box[2]) / 2) < 0.06 && Math.abs((a.box[1] + a.box[3]) / 2 - (b.box[1] + b.box[3]) / 2) < 0.08;
  for (let f = shot.f0; f <= spec.f1; f++) {
    for (const p of qcFrames[f]?.pops ?? []) {
      const prev = (qcFrames[f - 1]?.pops ?? []).some((x) => near(x, p));
      const next = (qcFrames[f + 1]?.pops ?? []).some((x) => near(x, p));
      if (!next && (!prev || f === shot.f0) && f < spec.f1) flashPops.push([f, f, p.text]);
    }
  }
  if (flashPops.length) console.error(`  ${shot.id} ${aspect}: FLASH POP QC FAIL on ${flashPops.map(([f, , t]) => `f${f} "${t}"`).join(', ')}`);
  for (const [name, r] of [['CONTACT', contacts], ['MINION-IN-HERO', minionIns], ['DUPLICATE HERO', dupes], ['STALE POP', stalePops]]) {
    if (r.length) console.error(`  ${shot.id} ${aspect}: ${name} QC FAIL on f${r.map(([a, b]) => `${a}-${b}`).join(', f')}`);
  }
  const edgeText = runsOf((q) => q.edgeText > 0);
  if (inStruct.length) console.error(`  ${shot.id} ${aspect}: STRUCTURE QC FAIL, a hero inside a structure on f${inStruct.map(([a, b]) => `${a}-${b}`).join(', f')}`);
  if (edgeText.length) console.error(`  ${shot.id} ${aspect}: EDGE TEXT QC FAIL, game text at the frame edge on f${edgeText.map(([a, b]) => `${a}-${b}`).join(', f')}`);
  if (Object.keys(qcFrames).length) writeFileSync(join(OUT, shot.id, aspect, 'qc.json'), `${JSON.stringify(qcFrames)}\n`);
  const info = spec.mode === 'match' ? await page.evaluate(() => window.__trailer.info()) : null;
  const hash = spec.mode === 'match' ? await page.evaluate(() => window.__trailer.verify()) : null;
  await ctx.close();
  return { saved, info, hash, overlaps, inStruct, edgeText, contacts, minionIns, dupes, stalePops, flashPops };
}

mkdirSync(OUT, { recursive: true });
const manifestFile = join(OUT, 'manifest.json');
const manifest = existsSync(manifestFile) ? JSON.parse(readFileSync(manifestFile, 'utf8')) : { shots: {} };
const aspects = ASPECT === 'both' ? ['16x9', '9x16'] : [ASPECT];
const list = SHOTS.filter((s) => !ONLY.length || ONLY.includes(s.id) || (s.parts ?? []).some((p) => ONLY.includes(p.id)));
try {
  for (const shot of list) {
    for (const aspect of aspects) {
      // `aspects`: a shot only one master uses (v3: the landscape HUD beat is 16:9 only)
      if (shot.aspects && !shot.aspects.includes(aspect)) continue;
      const r = await capture(shot, aspect);
      if (!PROBE_ONLY) {
        manifest.shots[`${shot.id}/${aspect}`] = r;
        writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 1)}\n`);
      } else console.log(JSON.stringify(r));
    }
  }
} finally {
  await browser.close();
  await server.close();
}
