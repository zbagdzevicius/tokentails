// Iteration 2 performance probe: node shots/ugc-perf.mjs [w h]   (MEOW_URL, default http://127.0.0.1:5178/)
// Phone-sized LOW quality, full look, style on: fps and long tasks (> 50 ms) with clip capture ON (segments rotate
// every 6 s) vs OFF, over 20 s of bot play each on gorge. Prints the numbers; exits 1 on a long task during capture
// that lines up with a segment rotation, or a capture-on fps more than 5% under capture-off.
// THROTTLE=4 slows the CPU 4x through CDP (a rough mid-range phone; headless Chromium caps at 60 fps otherwise).
import { chromium } from '@playwright/test';
import { createBot } from './bot.mjs';

const W = +(process.argv[2] || 390), H = +(process.argv[3] || 844);
const mobile = W < 600;
const URL = process.env.MEOW_URL || 'http://127.0.0.1:5178/';
const gpu = process.env.MEOW_GPU || (process.platform === 'darwin' && !process.env.MEOW_SWIFT);
const b = await chromium.launch({ args: gpu ? ['--use-angle=metal'] : ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: W, height: H }, hasTouch: mobile, isMobile: mobile });
if (+process.env.THROTTLE > 1) await (await p.context().newCDPSession(p)).send('Emulation.setCPUThrottlingRate', { rate: +process.env.THROTTLE });
const errs = [];
p.on('pageerror', (e) => errs.push(String(e)));
p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
await p.goto(URL);
await p.evaluate(() => localStorage.clear());
await p.reload();
await p.waitForFunction(() => window.__meow && window.__meowUgc && window.__meowUgc.clip, null, { timeout: 30000 });
await p.waitForTimeout(1200);
const bot = await createBot(p, { mobile, W, H });
await bot.install();
await p.evaluate(() => {
  const M = window.__meow, U = window.__meowUgc;
  M.dev.unlockAll();
  M.quality.set('low');
  U.wardrobe.devOwnAll(true);
  // galaxy-ish fur, a pattern, eyes, a hat, a cape and a trail effect: the heaviest look
  const c = U.wardrobe.catalog;
  const last = (slot) => c[slot][c[slot].length - 1].index.toString(36);
  U.wardrobe.equip(last('fur') + last('pattern') + last('eyes') + last('hat') + last('scarf') + last('fx'));
  window.__lt = [];
  window.__rot = [];
  const st = MediaRecorder.prototype.start;
  MediaRecorder.prototype.start = function (...a) { window.__rot.push(performance.now()); return st.apply(this, a); };
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push({ t: e.startTime, d: e.duration }); }).observe({ type: 'longtask', buffered: false });
});

async function sample(capture) {
  await p.evaluate((c) => window.__meowUgc.clip.setMode(c), capture);
  await p.evaluate(() => { window.__meow.dev.invincible(true); window.__meow.dev.jump('gorge', 0.1); });
  await bot.playUntil(() => false, { maxMs: 3000 }); // warm-up (shader compiles, first segment)
  const r0 = await p.evaluate(() => { window.__lt.length = 0; window.__rot.length = 0; return { f: window.__meow.clock.frame, t: performance.now() }; });
  await bot.playUntil(() => false, { maxMs: 20000 });
  return p.evaluate((r) => ({ fps: +(((window.__meow.clock.frame - r.f) * 1000) / (performance.now() - r.t)).toFixed(1), long: window.__lt.map((e) => Math.round(e.d)), near: window.__lt.filter((e) => e.d > 50).map((e) => Math.round(Math.min(...window.__rot.map((r) => Math.abs(r - e.t)), 1e9))), state: window.__meowUgc.clip.state() }), r0);
}
const on = await sample('on');
const off = await sample('off');
await p.evaluate(() => window.__meowUgc.clip.setMode('auto'));
console.log(`throttle ${process.env.THROTTLE || 1}x`);
console.log(`${W}x${H} LOW full look: capture ON ${on.fps} fps, long tasks ${JSON.stringify(on.long)}; segments ${on.state.segments} (${on.state.seconds?.toFixed?.(1)} s)`);
console.log(`${W}x${H} LOW full look: capture OFF ${off.fps} fps, long tasks ${JSON.stringify(off.long)}`);
const ratio = on.fps / off.fps;
const bad = [];
if (ratio < 0.95) bad.push(`fps ratio ${ratio.toFixed(3)}`);
console.log(`long tasks > 50 ms with capture on: ${on.near.length}, ms from the nearest segment start: ${JSON.stringify(on.near)}`);
// a long task within 150 ms of a recorder start is blamed on the segment rotation
if (on.near.some((d) => d < 150)) bad.push(`long task at a segment rotation: ${Math.max(...on.long)} ms`);
if (errs.length) bad.push(`errors: ${errs.slice(0, 3).join(' | ')}`);
console.log(bad.length ? `PERF FAILED: ${bad.join(', ')}` : `PERF OK (ratio ${ratio.toFixed(3)})`);
await b.close();
process.exit(bad.length ? 1 : 0);
