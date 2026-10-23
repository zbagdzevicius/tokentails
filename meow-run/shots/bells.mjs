// Bell + score check: node shots/bells.mjs [stage] [runs] [w h]   (dev server: MEOW_URL, default http://127.0.0.1:5178/)
// Plays a stage start to finish with the real-input bot (shots/bot.mjs, NOT invincible) and reports, per run, the
// bells collected, the score against the stage's star target and, for every missed bell, where Mochi was as she
// passed it (lateral and height gap). Exits 1 if any run misses a bell (BELLS_MIN=n relaxes it) or on page errors.
import { chromium } from '@playwright/test';
import { createBot } from './bot.mjs';

const stage = process.argv[2] || 'sunset';
const runs = +(process.argv[3] || 1);
const W = +(process.argv[4] || 1280), H = +(process.argv[5] || 720);
const mobile = W < 600;
const URL = process.env.MEOW_URL || 'http://127.0.0.1:5178/';
const gpu = process.env.MEOW_GPU || (process.platform === 'darwin' && !process.env.MEOW_SWIFT);
const b = await chromium.launch({ args: gpu ? ['--use-angle=metal'] : ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: W, height: H }, hasTouch: mobile, isMobile: mobile });
const errs = [];
p.on('pageerror', (e) => errs.push(String(e)));
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
const bot = await createBot(p, { mobile, W, H });
await p.goto(URL);
await p.waitForFunction(() => window.__meow && window.__meow.dev, null, { timeout: 30000 });
await p.waitForTimeout(1200);
const results = [];
for (let r = 0; r < runs; r++) {
  await bot.install();
  await p.evaluate((id) => {
    const M = window.__meow;
    M.dev.unlockAll();
    window.__brainState = null;
    const L = (window.__bl = { got: [], hits: [], miss: {}, passed: {} });
    M.events.on('bell', (e) => L.got.push(e.index));
    M.events.on('hit', (e) => L.hits.push(`${e.label}@${Math.round(M.P.s)}`));
    M.dev.jump(id, 0);
    clearInterval(window.__bellWatch);
    // record Mochi's offset from every bell as she passes it
    window.__bellWatch = setInterval(() => {
      if (M.mode !== 'play') return;
      for (const c of M.colliders()) {
        if (c.label !== 'bell' || L.passed[c.s]) continue;
        if (M.P.s >= c.s) L.passed[c.s] = { s: Math.round(c.s), dx: +(M.P.x - c.x).toFixed(2), dy: +(M.P.y - c.y).toFixed(2), mode: M.P.mode, got: !c.enabled };
      }
    }, 4);
  }, stage);
  const last = await bot.playUntil((st) => st.mode === 'over' || st.mode === 'finish', { maxMs: 260000 });
  await p.waitForTimeout(300);
  const res = await p.evaluate(() => {
    const M = window.__meow;
    return {
      mode: M.mode,
      score: Math.round(M.G.score),
      target: M.game.stage?.scoreTarget,
      bells: M.G.bells.filter(Boolean).length,
      got: window.__bl.got,
      hits: window.__bl.hits,
      passed: Object.values(window.__bl.passed).filter((v) => !v.got),
      fish: M.G.fish,
      maxMult: M.G.maxMult,
    };
  });
  console.log(`run ${r + 1}`, stage, `${W}x${H}`, 'bells', res.bells, JSON.stringify(res.got), 'score', res.score, '/', res.target, 'fish', res.fish, 'maxMult', res.maxMult, 'hits', res.hits.join(' '), 'end', last?.mode);
  if (res.passed.length) console.log('   missed', JSON.stringify(res.passed));
  results.push(res);
  await p.evaluate(() => { clearInterval(window.__bellWatch); window.__meow.dev.unlockAll(); });
  await p.goto(URL);
  await p.waitForFunction(() => window.__meow && window.__meow.dev, null, { timeout: 30000 });
  await p.waitForTimeout(1000);
}
const min = +(process.env.BELLS_MIN || 7);
const bad = results.filter((r) => r.bells < min).length;
console.log('SUMMARY', JSON.stringify(results.map((r) => ({ bells: r.bells, score: r.score, target: r.target }))), 'ERRORS', errs.length, errs.slice(0, 4));
await b.close();
process.exit(errs.length || bad ? 1 : 0);
