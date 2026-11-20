#!/usr/bin/env node
/**
 * Lobby-map stills (dev only, never in `build`): a champion standing in the real, live map, drawn by the real game
 * renderer, as a still backdrop for Home concepts. One JSON spec (or an array) in, one lossless PNG per spec out.
 *
 *   node tools/clips/stills.mjs <stills.json> [--only id,id] [--port 5482] [--out-dir DIR] [--ss 2] [--lock FILE]
 *                               [--frames 45] [--verbose]
 *
 * Spec:
 *   { "id": "crossing-01-fountain",
 *     "map": "crossing",            // any sim/api.ts MAP_IDS id (hearthwood = Classic 5v5)
 *     "scheme": "harvest",          // native | harvest | frost | bloom (| verdant where the map has it)
 *     "seed": 3, "at": 60,          // the take (seeded bots match) and the game second shown (towers, objective, toys)
 *     "hero": "frankie", "lookId": null, // the staged champion's coat ("coat.frankie.store_kebab_king") or null
 *     "pos": [12.5, -30],           // where it stands: world metres [x, z] (sim x/1000, -y/1000)
 *     "face": 120,                  // degrees, 0 = toward +Z (south, the default camera), 90 = toward +X (east)
 *     "look": [14, 1.1, -31],       // camera look point [x, y, z] m (frame the hero off-centre by moving this)
 *     "cam": { "dist": 9, "pitch": 14, "yaw": 210, "fov": 34 },   // metres from the look point, deg down, deg yaw
 *                                   //   (0 = camera south of the look point looking north), vertical fov deg
 *     "minions": false,             // true keeps the minion waves (default: none in frame)
 *     "act": "cheer", "actAt": 20,  // optional one-off flourish on that settle frame
 *     "size": [1920, 1080],         // output px (default 1920x1080); the page renders at ss x this
 *     "empty": true }               // the spot without the staged champion (Home's map backdrops)
 *
 * The frame is the game's own look (`gameLook`: no scenery, ground or structure clean-up), full vision (the clip
 * worker sees everything: no fog), no HUD, plates or pops; every sim hero is hidden so the staged champion is the
 * only one. High tier with its caps lifted (DPR = ss, 4096 px sun shadow map), adaptive quality off; the GPU renderer
 * string and the drawing-buffer size are checked before the grab (a software renderer fails). `--lock FILE`: wait
 * while FILE exists, hold it while the browser runs, remove it in finally. One profile folder, removed in finally and
 * on SIGINT/SIGTERM.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { argValue, hasFlag, positionals } from '../lib/args.mjs';
import { takeOf } from './scenes.mjs';

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const files = positionals(['--only', '--port', '--out-dir', '--ss', '--lock', '--frames']);
if (!files.length) {
  console.error('usage: node tools/clips/stills.mjs <stills.json> [--only id] [--port 5482] [--out-dir DIR] [--lock FILE]');
  process.exit(2);
}
let specs = [];
for (const f of files) {
  const j = JSON.parse(readFileSync(f, 'utf8'));
  specs.push(...(Array.isArray(j) ? j : [j]));
}
const only = argValue('--only')?.split(',');
if (only) specs = specs.filter((s) => only.includes(s.id));
const port = Number(argValue('--port') ?? 5482);
const outDir = resolve(argValue('--out-dir') ?? '.');
const SS = Math.max(1, Number(argValue('--ss') ?? 2));
const SETTLE = Math.max(2, Number(argValue('--frames') ?? 45));
const LOCK = argValue('--lock');
const verbose = hasFlag('--verbose');
/** The harness's director distance unit (harness.ts D0 = MOBA_DIST x ZOOM_DEFAULT). */
const D0 = 27 * 1.03;

const profile = mkdtempSync(join(tmpdir(), 'pl-stills-profile-'));
let lockHeld = false;
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
  if (lockHeld) rmSync(LOCK, { force: true });
}
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => void cleanup().finally(() => process.exit(130)));

async function takeLock() {
  if (!LOCK) return;
  for (let i = 0; ; i++) {
    try {
      writeFileSync(LOCK, `${process.pid} ${new Date().toISOString()} stills\n`, { flag: 'wx' });
      lockHeld = true;
      return;
    } catch {
      if (i % 12 === 0) console.error(`waiting for ${LOCK}`);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

/** A still spec → the harness ShotSpec (match mode, one fixed director key, the game's own look). */
function shotOf(s) {
  const [w, h] = s.size ?? [1920, 1080];
  const per = s.map === 'hearthwood' ? 5 : 3;
  const take = takeOf({ mode: s.map === 'hearthwood' ? 'classic' : 'skirmish', map: s.map, seed: s.seed ?? 1, teams: [[s.hero ?? null, ...Array(per - 1).fill(null)]] });
  const c = s.cam;
  return {
    id: s.id,
    mode: 'match',
    width: w,
    height: h,
    f0: 0,
    f1: SETTLE,
    fps: 30,
    take,
    startTick: Math.round((s.at ?? 60) * 30),
    cam: { target: { p3: s.look }, keys: [{ f: 0, dist: c.dist / D0, pitch: c.pitch, yaw: c.yaw, fov: c.fov ?? 34, lift: 1 }], smooth: 0 },
    gameLook: true,
    layers: [],
    plates: false,
    heroesOff: true,
    minionsOff: s.minions !== true,
    // `empty: true`: the spot without its champion (the take keeps `hero`, so the match plays out the same), for Home's
    // map backdrops (tools/bake-lobby-maps.mjs; render/lobby/mapViews.ts draws the champion live)
    stage: s.hero && !s.empty ? [{ hero: s.hero, team: 0, look: s.lookId ?? null, x: s.pos[0], z: s.pos[1], face: s.face ?? 0, act: s.act, actAt: s.actAt }] : [],
    hq: { dpr: SS, ss: SS, shadowMap: 4096 },
  };
}

async function main() {
  const { chromium } = await import('playwright');
  const { createServer } = await import('vite');
  mkdirSync(outDir, { recursive: true });
  await takeLock();
  server = await createServer({ root: PKG, configFile: join(PKG, 'vite.config.ts'), cacheDir: join(PKG, 'tools/clips/.vite-cache'), logLevel: 'error', server: { port, strictPort: true, host: '127.0.0.1', hmr: false, watch: null } });
  await server.listen();
  const rows = [];
  for (const s of specs) {
    const shot = shotOf(s);
    ctx = await chromium.launchPersistentContext(profile, {
      headless: true,
      viewport: { width: shot.width, height: shot.height },
      deviceScaleFactor: SS,
      args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu', '--force-color-profile=srgb'],
    });
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text().slice(0, 200));
      if (verbose && (m.type() === 'error' || m.type() === 'warning')) console.error(`  [${s.id}] ${m.text().slice(0, 300)}`);
    });
    for (let attempt = 0; ; attempt++) {
      await page.goto(`http://127.0.0.1:${port}/tools/clips/harness.html?scheme=${encodeURIComponent(s.scheme ?? 'native')}`);
      if (await page.waitForFunction(() => window.__trailer?.ready, null, { timeout: 60000 }).then(() => true, () => false)) break;
      if (attempt >= 2) throw new Error(`harness not ready: ${errors.join(' | ').slice(0, 600)}`);
    }
    await page.evaluate((sh) => window.__trailer.load(sh), shot);
    const gpu = await page.evaluate(() => window.__trailer.gpu());
    if (/swiftshader|llvmpipe|software|basic render/i.test(gpu?.renderer ?? 'none')) throw new Error(`${s.id}: software renderer (${gpu?.renderer})`);
    const want = [shot.width * SS, shot.height * SS];
    if (gpu.buffer[0] < want[0] - 1 || gpu.buffer[1] < want[1] - 1) throw new Error(`${s.id}: drawing buffer ${gpu.buffer.join('x')} under ${want.join('x')}`);
    if (gpu.settings.resScale !== 1 || gpu.settings.step !== 0 || gpu.settings.phone) throw new Error(`${s.id}: adaptive quality is on`);
    for (let k = 0; k < SETTLE; k++) await page.evaluate((f) => window.__trailer.frame(f), k);
    const png = await page.screenshot({ type: 'png', scale: 'device' });
    const end = await page.evaluate(() => window.__trailer.gpu());
    if (s.scheme && end.mapScheme && !end.mapScheme.endsWith(`:${s.scheme}`)) throw new Error(`${s.id}: drew scheme ${end.mapScheme}, not ${s.scheme}`);
    const out = join(outDir, `${s.id}.png`);
    writeFileSync(out, png);
    await ctx.close();
    ctx = null;
    const row = { id: s.id, out, px: [png.readUInt32BE(16), png.readUInt32BE(20)], gpu: gpu.renderer, scheme: end.mapScheme, errors: errors.slice(0, 5) };
    rows.push(row);
    console.log(JSON.stringify(row));
  }
  return rows;
}

main()
  .then(() => cleanup())
  .catch(async (e) => {
    console.error(e?.stack ?? e);
    await cleanup();
    process.exit(1);
  });
