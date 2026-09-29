// Captures real gameplay clips from Catnip Heist solution replays into ../assets/clips.
// Deterministic: Playwright fake clock + frozen sim, one sim tick (1/30 s) per captured frame.
// Usage: node capture.mjs [clipName ...]   (vite dev server must run on :5199)
import { launch, boot, startReplay } from './common.mjs';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const CLIPS = path.join(ROOT, 'assets/clips');

// start = first captured tick (frame 1 shows state after tick `start`); frames = count.
// tail = frames captured after the sim is done (win celebration).
export const DEFS = [
  { name: 'h08-establish', level: 'heist-08', start: 200, frames: 150, wide: { from: 30, to: 21, center: [20, 13] } },
  { name: 'h01-plate-swap', level: 'heist-01', start: 150, frames: 150 },
  { name: 'h02-meow-lure', level: 'heist-02', start: 440, frames: 150 },
  { name: 'h05-coin-run', level: 'heist-05', start: 0, frames: 150 },
  { name: 'h04-key-doors', level: 'heist-04', start: 585, frames: 110 },
  { name: 'h08-vault-rescue', level: 'heist-08', start: 1850, frames: 125 },
  { name: 'h02-rescue-exit', level: 'heist-02', start: 815, frames: 150, tailOK: true },
  { name: 'h05-rescue-exit', level: 'heist-05', start: 905, frames: 120, tailOK: true },
  { name: 'h06-sneak-corridor', level: 'heist-06', start: 1440, frames: 150 },
  { name: 'h07-split-shift', level: 'heist-07', start: 260, frames: 150 },
  { name: 'h02-spotted', level: 'heist-02', start: 445, frames: 150, live: { dropMeowAt: 483 } },
  { name: 'h01-hud', level: 'heist-01', start: 150, frames: 150, hud: true },
];

const HIDE_CSS = '.ch-ui{visibility:hidden !important}';

async function captureClip(def) {
  const { browser, page } = await launch();
  await boot(page);
  if (def.live) {
    // Live run fed with the solution's inputs, altered (e.g. skip the meow) to get caught.
    await page.evaluate(async ({ level, live }) => {
      const j = await (await fetch(`/src/levels/${level}.solution.json`)).json();
      const inputs = [];
      for (const r of j.runs) for (let k = 0; k < r[3]; k++) inputs.push({ dx: r[0], dy: r[1], swap: !!(r[2] & 1), interact: !!(r[2] & 2), meow: !!(r[2] & 4) });
      if (live.dropMeowAt) inputs[live.dropMeowAt - 1] = { ...inputs[live.dropMeowAt - 1], meow: false };
      window.__liveInputs = inputs;
      window.__heist.freeze(true);
      await window.__heist.start(j.catIds, level);
      window.__heist.freeze(true);
    }, { level: def.level, live: def.live });
  } else await startReplay(page, def.level);
  await page.clock.install({ time: 1_000_000 });
  await page.clock.runFor(100);
  if (!def.hud) await page.addStyleTag({ content: HIDE_CSS });
  else await page.addStyleTag({ content: '.ch-iris{display:none !important}' });
  const warm = Math.min(def.start, 20);
  const bulk = def.start - warm;
  await page.evaluate((n) => { if (window.__liveInputs) { for (let i = 0; i < n; i++) window.__heist.step(1, window.__liveInputs[window.__heist.getState().tick] ?? {}); } else if (n > 0) window.__heist.step(n); }, bulk);
  if (def.wide) {
    await page.evaluate((w) => {
      const r = window.__heist.app.renderer;
      r.lockCamera({ x: w.center[0], z: w.center[1] });
      r.iso.baseViewHeight = w.from; r.iso.setAspect(16 / 9);
    }, def.wide);
  }
  for (let i = 0; i < warm; i++) { await page.evaluate(() => window.__liveInputs ? window.__heist.step(1, window.__liveInputs[window.__heist.getState().tick] ?? {}) : window.__heist.step(1)); await page.clock.runFor(1000 / 30); }
  if (!warm) await page.clock.runFor(400);
  const dir = path.join(CLIPS, def.name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const ticks = [];
  for (let f = 1; f <= def.frames; f++) {
    const st = await page.evaluate((w) => {
      const s = window.__liveInputs ? window.__heist.step(1, window.__liveInputs[window.__heist.getState().tick] ?? {}) : window.__heist.step(1);
      if (w) {
        const r = window.__heist.app.renderer;
        const k = w.k; const e = 1 - Math.pow(1 - k, 3);
        r.iso.baseViewHeight = w.from + (w.to - w.from) * e; r.iso.setAspect(16 / 9);
      }
      return s ? { tick: s.tick, ev: s.events.filter(e => e.type !== 'STEP').map(e => e.type + (e.open === undefined ? '' : (e.open ? '+' : '-'))), won: s.won, active: s.activeIndex, coins: s.coinsCollected, spotted: s.spottedCount, guards: s.guards.map(g => g.mode) } : null;
    }, def.wide ? { ...def.wide, k: (f - 1) / (def.frames - 1) } : null);
    await page.clock.runFor(1000 / 30);
    await page.screenshot({ path: path.join(dir, String(f).padStart(4, '0') + '.jpg'), type: 'jpeg', quality: 90 });
    ticks.push({ f, ...st });
  }
  await browser.close();
  return ticks;
}

const only = process.argv.slice(2);
const logPath = path.join(import.meta.dirname, 'capture-log.json');
const log = fs.existsSync(logPath) ? JSON.parse(fs.readFileSync(logPath, 'utf8')) : {};
for (const def of DEFS) {
  if (only.length && !only.includes(def.name)) continue;
  const t0 = Date.now();
  log[def.name] = { def, ticks: await captureClip(def) };
  fs.writeFileSync(logPath, JSON.stringify(log));
  const evs = log[def.name].ticks.filter(t => t.ev?.length).map(t => `${t.f}(t${t.tick}):${t.ev.join(',')}`).join(' ');
  console.log(def.name, ((Date.now() - t0) / 1000).toFixed(1) + 's', evs);
}
