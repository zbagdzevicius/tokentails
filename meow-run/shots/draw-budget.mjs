// Draw-call cap: npm run budget:draws   (starts its own vite on http://127.0.0.1:5191/ and stops it after)
// Samples renderer.info.render.calls (window.__meowUgc.perf.calls, the last render incl. the shadow pass) every frame
// while playing: meadow, gorge, sunset and endless at several points (dev.jump(stage, t)), a challenge ghost race
// (?c= link) and a Trail Maker trail. Two profiles: desktop 1280x720 HIGH (shadows on) and phone 390x844 LOW.
// Prints the max per scene and exits 1 when any profile goes over its cap.
//
// Caps = measured max + ~15% headroom. Measured 2026-10-24 (Apple GPU, --use-angle=metal):
//   desktop 1280x720 HIGH: max 333 calls (gorge t=0.3; ghost race 299, trail 269, others 211-283)  -> cap 385
//   phone   390x844  LOW : max 229 calls (ghost race on meadow; gorge 224, trail 212, others 111-200) -> cap 265
// Raise a cap only with a reason (new scenery, a new set piece) and record the new measurement here.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from '@playwright/test';

const CAPS = { desktop: 385, phone: 265 };
const PORT = 5191;
const URL = `http://127.0.0.1:${PORT}/`;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROFILES = [
  { name: 'desktop', W: 1280, H: 720, quality: 'high' },
  { name: 'phone', W: 390, H: 844, quality: 'low' },
];
const STAGES = ['meadow', 'gorge', 'sunset', 'endless'];
const POINTS = [0.05, 0.3, 0.55, 0.8];
const SAMPLE_MS = 2500;

// ---------------------------------------------------------------- vite
const vite = spawn(path.join(ROOT, 'node_modules/.bin/vite'), ['--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
  cwd: ROOT,
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true,
});
let viteLog = '';
vite.stdout.on('data', (d) => (viteLog += d));
vite.stderr.on('data', (d) => (viteLog += d));
const stopVite = () => {
  try {
    process.kill(-vite.pid, 'SIGTERM');
  } catch {
    /* already gone */
  }
};
process.on('exit', stopVite);
process.on('SIGINT', () => process.exit(130));

async function waitForServer() {
  for (let i = 0; i < 150; i++) {
    try {
      if ((await fetch(URL)).ok) return;
    } catch {
      /* not up yet */
    }
    if (vite.exitCode !== null) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`vite did not start on ${PORT}:\n${viteLog}`);
}

// ---------------------------------------------------------------- browser
async function launch() {
  try {
    return await chromium.launch({ args: ['--use-angle=metal'] });
  } catch {
    return chromium.launch({ args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
  }
}

const errs = [];
async function boot(p, q) {
  await p.waitForFunction(() => window.__meow && window.__meowUgc?.perf && window.__meowUgc.share && window.__meowUgc.trails, null, { timeout: 30000 });
  await p.waitForTimeout(800);
  await p.evaluate((quality) => {
    const M = window.__meow;
    M.dev.unlockAll();
    M.quality.set(quality);
    // every frame: the calls of the last render (rAF order alternates with the game loop, so at worst one frame late)
    window.__draws = { on: false, max: 0, sum: 0, n: 0 };
    const tick = () => {
      const d = window.__draws;
      if (d.on && M.mode === 'play') {
        const c = window.__meowUgc.perf.calls;
        if (c > d.max) d.max = c;
        d.sum += c;
        d.n++;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, q);
}

async function sample(p, ms = SAMPLE_MS) {
  await p.evaluate(() => window.__meow.dev.invincible(true));
  await p.waitForTimeout(700); // warm-up: shader compiles, the camera settles
  await p.evaluate(() => Object.assign(window.__draws, { on: true, max: 0, sum: 0, n: 0 }));
  await p.waitForTimeout(ms);
  return p.evaluate(() => {
    const d = window.__draws;
    d.on = false;
    return { max: d.max, avg: d.n ? Math.round(d.sum / d.n) : 0, frames: d.n, mode: window.__meow.mode };
  });
}

async function runProfile(b, prof) {
  const mobile = prof.W < 600;
  const ctx = await b.newContext({ viewport: { width: prof.W, height: prof.H }, hasTouch: mobile, isMobile: mobile });
  const p = await ctx.newPage();
  const watch = (pg) => {
    pg.on('pageerror', (e) => errs.push(`${prof.name}: ${e}`));
    pg.on('console', (m) => m.type() === 'error' && errs.push(`${prof.name}: ${m.text()}`));
  };
  watch(p);
  await p.goto(URL);
  await p.evaluate(() => localStorage.clear());
  await p.reload();
  await boot(p, prof.quality);
  const rows = [];

  for (const st of STAGES) {
    for (const t of POINTS) {
      await p.evaluate(([s, tt]) => window.__meow.dev.jump(s, tt), [st, t]);
      rows.push({ scene: `${st} t=${t}`, ...(await sample(p)) });
    }
  }

  // a Trail Maker trail (random valid trail, installed and started like TEST RUN)
  const trailOk = await p.evaluate(() => {
    const T = window.__meowUgc.trails;
    for (let seed = 1; seed < 20; seed++) {
      const r = T.load(T.encode(T.random(seed)));
      if (r.ok) return true;
    }
    return false;
  });
  if (!trailOk) errs.push(`${prof.name}: no valid random trail`);
  for (const t of [0.1, 0.5, 0.85]) {
    await p.evaluate((tt) => window.__meow.dev.jump('trail', tt), t);
    rows.push({ scene: `trail t=${t}`, ...(await sample(p)) });
  }

  // a challenge link: the ghost races on meadow
  const code = await p.evaluate(() => {
    const h = window.__meowUgc.share;
    const samples = [];
    for (let i = 0; i <= 6 * 60; i++) samples.push({ s: (21 * i) / 6, x: 1.4 * Math.sin(i / 8), y: 0, flags: 0 });
    return h.encode({ v: 1, stage: 'meadow', score: 512340, name: 'Mia', look: '3a0210', chain: 12, ghost: h.packGhost(samples, 6) });
  });
  const p2 = await ctx.newPage();
  watch(p2);
  await p2.goto(`${URL}?c=${code}`);
  await boot(p2, prof.quality);
  await p2.waitForSelector('#shareChalPlay', { state: 'visible', timeout: 10000 });
  await p2.click('#shareChalPlay');
  await p2.waitForFunction(() => window.__meow.mode === 'play', null, { timeout: 5000 });
  const ghost = await sample(p2, 5000);
  const g = await p2.evaluate(() => window.__meowUgc.share.ghost());
  if (!g?.active) errs.push(`${prof.name}: the ghost did not race`);
  rows.push({ scene: 'challenge ghost (meadow)', ...ghost });

  await ctx.close();
  return rows;
}

// ---------------------------------------------------------------- main
let failed = false;
try {
  await waitForServer();
  const b = await launch();
  for (const prof of PROFILES) {
    const rows = await runProfile(b, prof);
    const cap = CAPS[prof.name];
    console.log(`\n${prof.name} ${prof.W}x${prof.H} ${prof.quality.toUpperCase()} (cap ${cap} draw calls)`);
    console.log(`${'scene'.padEnd(28)} ${'max'.padStart(6)} ${'avg'.padStart(6)} ${'frames'.padStart(7)}`);
    for (const r of rows) console.log(`${r.scene.padEnd(28)} ${String(r.max).padStart(6)} ${String(r.avg).padStart(6)} ${String(r.frames).padStart(7)}${r.max > cap ? '  OVER' : ''}`);
    const top = rows.reduce((a, r) => (r.max > a.max ? r : a), rows[0]);
    const empty = rows.filter((r) => r.frames < 10);
    console.log(`max ${top.max} (${top.scene}), cap ${cap}`);
    if (top.max > cap) {
      console.error(`FAIL: ${prof.name} draws ${top.max} calls in ${top.scene}, cap ${cap}`);
      failed = true;
    }
    if (empty.length) {
      console.error(`FAIL: ${prof.name} sampled no play frames in ${empty.map((r) => r.scene).join(', ')}`);
      failed = true;
    }
  }
  await b.close();
} catch (e) {
  console.error(e);
  failed = true;
}
if (errs.length) {
  console.error(`errors:\n  ${errs.slice(0, 8).join('\n  ')}`);
  failed = true;
}
console.log(failed ? '\nDRAW BUDGET FAILED' : '\ndraw budget ok');
stopVite();
process.exit(failed ? 1 : 0);
