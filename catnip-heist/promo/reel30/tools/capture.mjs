// Captures gameplay clips from Catnip Heist solution replays into ../assets/clips (reel30).
// Same technique as ../../tools/capture.mjs: Playwright fake clock + frozen sim, one sim tick
// (1/30 s) per frame. Usage: node capture.mjs [clipName ...]  (Heist vite dev on :5173)
import { launch, boot, startReplay } from './common.mjs';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const CLIPS = path.join(ROOT, 'assets/clips');
const DIMS = { 'heist-01': [38, 21], 'heist-02': [24, 21], 'heist-03': [30, 15], 'heist-04': [36, 20], 'heist-05': [28, 18], 'heist-06': [30, 16], 'heist-07': [38, 15], 'heist-08': [40, 27] };
const wideOf = (level, k0 = 0.43, k1 = 0.37) => { const [w, h] = DIMS[level]; return { from: (w + h) * k0, to: (w + h) * k1, center: [w / 2 - 0.5, h / 2 - 0.5] }; };
const LVL_START = { 'heist-01': 90, 'heist-02': 20, 'heist-03': 80, 'heist-04': 40, 'heist-05': 0, 'heist-06': 60, 'heist-07': 180, 'heist-08': 30 };

export const DEFS = [
  ...Object.keys(DIMS).map((level, i) => ({ name: `lvl-0${i + 1}`, level, start: LVL_START[level], frames: 60, wide: wideOf(level) })),
  { name: 'h03-twin-locks', level: 'heist-03', start: 85, frames: 150 },
  { name: 'h03-chain-swap', level: 'heist-03', start: 570, frames: 150 },
  { name: 'h03-rescue-exit', level: 'heist-03', start: 1090, frames: 120, tailOK: true },
  { name: 'h01-rescue', level: 'heist-01', start: 1695, frames: 90 },
  { name: 'h04-rescue', level: 'heist-04', start: 1105, frames: 90 },
  { name: 'h08-rescue', level: 'heist-08', start: 1755, frames: 100 },
  { name: 'h06-rescue-exit', level: 'heist-06', start: 1565, frames: 120, tailOK: true },
  { name: 'h07-rescue-exit', level: 'heist-07', start: 1150, frames: 120, tailOK: true },
  // Refreshed against the current build (current catnip sprig art, current level layouts) under
  // the 15 s reel's names; key moments re-found from scan-log.json.
  { name: 'h08-establish', level: 'heist-08', start: 200, frames: 150, wide: { from: 30, to: 21, center: [19.5, 13] } },
  { name: 'h01-plate-swap', level: 'heist-01', start: 150, frames: 150 },
  { name: 'h01-hud', level: 'heist-01', start: 150, frames: 150, hud: true },
  { name: 'h02-meow-lure', level: 'heist-02', start: 440, frames: 150 },
  { name: 'h02-spotted', level: 'heist-02', start: 445, frames: 150, live: { dropMeowAt: 483 } },
  { name: 'h02-rescue-exit', level: 'heist-02', start: 815, frames: 150, tailOK: true },
  { name: 'h04-key-doors', level: 'heist-04', start: 620, frames: 110 },
  { name: 'h05-coin-run', level: 'heist-05', start: 0, frames: 150 },
  { name: 'h05-rescue-exit', level: 'heist-05', start: 845, frames: 120, tailOK: true },
  { name: 'h06-sneak-corridor', level: 'heist-06', start: 1360, frames: 150 },
  { name: 'h07-split-shift', level: 'heist-07', start: 255, frames: 150 },
  { name: 'h08-vault-rescue', level: 'heist-08', start: 1670, frames: 125 },
  { name: 'h02-win', level: 'heist-02', start: 950, frames: 100, tailOK: true },
];

const HIDE_CSS = '.ch-ui{visibility:hidden !important}';

async function captureClip(def) {
  const { browser, page } = await launch();
  try {
    await boot(page);
    if (def.live) {
      await page.evaluate(async ({ level, live }) => {
        const j = await (await fetch(`/src/levels/${level}.solution.json`)).json();
        const inputs = [];
        for (const r of j.runs) for (let k = 0; k < r[3]; k++) inputs.push({ dx: r[0], dy: r[1], swap: !!(r[2] & 1), interact: !!(r[2] & 2), meow: !!(r[2] & 4) });
        if (live.dropMeowAt) inputs[live.dropMeowAt - 1] = { ...inputs[live.dropMeowAt - 1], meow: false };
        window.__liveInputs = inputs;
        window.__heist.freeze(true);
        await window.__heist.start(j.catIds, level);
        window.__heist.freeze(true);
        window.__step1 = () => window.__heist.step(1, window.__liveInputs[window.__heist.getState().tick] ?? {});
      }, { level: def.level, live: def.live });
    } else {
      await startReplay(page, def.level);
      await page.evaluate(() => { window.__step1 = () => window.__heist.step(1); });
    }
    await page.clock.install({ time: 1_000_000 });
    await page.clock.runFor(100);
    if (!def.hud) await page.addStyleTag({ content: HIDE_CSS });
    else await page.addStyleTag({ content: '.ch-iris{display:none !important}' });
    const warm = Math.min(def.start, 20);
    const bulk = def.start - warm;
    if (bulk > 0) await page.evaluate((n) => { for (let i = 0; i < n; i++) window.__step1(); }, bulk);
    if (def.wide) {
      await page.evaluate((w) => {
        const r = window.__heist.app.renderer;
        r.lockCamera({ x: w.center[0], z: w.center[1] });
        r.iso.baseViewHeight = w.from; r.iso.setAspect(16 / 9);
      }, def.wide);
    }
    if (def.wide) await page.evaluate((w) => { const i = window.__heist.app.renderer.iso; i.lead.set(0, 0, 0); i.leadGoal.set(0, 0, 0); i.target.set(w.center[0], 0, w.center[1]); i.goal.set(w.center[0], 0, w.center[1]); }, def.wide);
    for (let i = 0; i < warm; i++) { await page.evaluate(() => window.__step1()); await page.clock.runFor(1000 / 30); }
    await page.clock.runFor(def.start < 20 ? 600 : 100);
    const dir = path.join(CLIPS, def.name);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    const ticks = [];
    for (let f = 1; f <= def.frames; f++) {
      const st = await page.evaluate((w) => {
        const s = window.__step1();
        if (w) {
          const r = window.__heist.app.renderer;
          const e = 1 - Math.pow(1 - w.k, 3);
          r.iso.baseViewHeight = w.from + (w.to - w.from) * e; r.iso.setAspect(16 / 9);
        }
        return s ? { tick: s.tick, ev: s.events.filter(e => e.type !== 'STEP').map(e => e.type + (e.open === undefined ? '' : (e.open ? '+' : '-'))), won: s.won, active: s.activeIndex, coins: s.coinsCollected, rescued: s.rescued } : null;
      }, def.wide ? { ...def.wide, k: (f - 1) / (def.frames - 1) } : null);
      await page.clock.runFor(1000 / 30);
      await page.screenshot({ path: path.join(dir, String(f).padStart(4, '0') + '.jpg'), type: 'jpeg', quality: 90 });
      ticks.push({ f, ...st });
    }
    return ticks;
  } finally { await browser.close(); }
}

const only = process.argv.slice(2);
const logPath = path.join(import.meta.dirname, 'capture-log.json');
const log = fs.existsSync(logPath) ? JSON.parse(fs.readFileSync(logPath, 'utf8')) : {};
for (const def of DEFS) {
  if (only.length && !only.some(o => def.name === o || (o.endsWith('*') && def.name.startsWith(o.slice(0, -1))))) continue;
  const t0 = Date.now();
  for (let attempt = 1; attempt <= 4; attempt++) {
    try { log[def.name] = { def, ticks: await captureClip(def) }; break; }
    catch (e) { console.log('retry', def.name, attempt, e.message.split('\n')[0]); if (attempt === 4) throw e; }
  }
  fs.writeFileSync(logPath, JSON.stringify(log));
  const evs = log[def.name].ticks.filter(t => t.ev?.length).map(t => `${t.f}(t${t.tick}):${t.ev.join(',')}`).join(' ');
  console.log(def.name, ((Date.now() - t0) / 1000).toFixed(1) + 's', evs);
}
