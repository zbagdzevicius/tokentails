// STYLE lane shots: node shots/style-shots.mjs [w h]   (MEOW_URL, default http://127.0.0.1:5185/)
//   1. meadow 0.3: jump + ability x2 in the air (desktop Space, E, E; phone swipe up + taps) -> mid-spin shot, tricks >= 1
//   2. forceTier(25): the combo meter, the tier stamp and gold speed lines; HUD overlap checks
//   3. gorge 0.62 (dog chase) with the bot: slow-mo (timeScale < 1) seen at least once
//   4. meadow 0.985: finish flourish at +0.3 s and +1.2 s, results, the camera is back behind Mochi on retry
//   5. reduced motion: no time-scale change, no swing
// Exits 1 on a page/console error from this lane or a failed check (errors from other lanes' folders are reported).
import { chromium } from '@playwright/test';
import { createBot } from './bot.mjs';

const W = +(process.argv[2] || 1280), H = +(process.argv[3] || 720);
const mobile = W < 600;
const tag = mobile ? 'm' : 'd';
const URL = process.env.MEOW_URL || 'http://127.0.0.1:5185/';
let b;
try {
  b = await chromium.launch({ args: ['--use-angle=metal'] });
} catch {
  b = await chromium.launch({ args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
}
const p = await b.newPage({ viewport: { width: W, height: H }, hasTouch: mobile, isMobile: mobile });
const errs = [];
const foreign = [];
const OTHER = /src\/(clip|photo|share|wardrobe|cat|trails|stages|setpieces|world|ui|audio|meta|ugc)\//;
const note = (text, where) => {
  const all = `${where || ''} ${text}`;
  (!/src\/(style|juice)\//.test(all) && OTHER.test(all) ? foreign : errs).push(text.slice(0, 300));
};
p.on('pageerror', (e) => note(String(e), e.stack || ''));
p.on('console', (m) => { if (m.type() === 'error') note(m.text(), m.location()?.url || ''); });
const fails = [];
const check = (name, ok, info) => { console.log(ok ? 'ok  ' : 'FAIL', name, info === undefined ? '' : JSON.stringify(info)); if (!ok) fails.push(name); };
const S = (name) => p.screenshot({ path: `shots/style-${tag}-${name}.png` });
const st = () => p.evaluate(() => window.__meowUgc.style.state());
const sleep = (ms) => p.waitForTimeout(ms);
const bot = await createBot(p, { mobile, W, H });
const waitFor = async (fn, ms, arg) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await p.evaluate(fn, arg).catch(() => false)) return true; await sleep(50); } return false; };

async function boot(save) {
  await p.goto(URL);
  await p.evaluate((s) => { localStorage.clear(); if (s) localStorage.setItem('meowrun.save', JSON.stringify(s)); }, save || null);
  await p.reload();
  await p.waitForFunction(() => window.__meow && window.__meow.dev && window.__meowUgc && window.__meowUgc.style, null, { timeout: 30000 });
  await sleep(1200);
  await bot.install();
  // page-side watcher: the lowest time scale and any swing, sampled every frame
  await p.evaluate(() => {
    window.__styleWatch = { minScale: 1, swung: false, finishAt: 0 };
    const tick = () => {
      const s = window.__meowUgc.style.state();
      window.__styleWatch.minScale = Math.min(window.__styleWatch.minScale, s.timeScale);
      if (s.swinging) window.__styleWatch.swung = true;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    window.__meow.events.on('finishLine', () => (window.__styleWatch.finishAt = performance.now()));
  });
}
const resetWatch = () => p.evaluate(() => Object.assign(window.__styleWatch, { minScale: 1, swung: false, finishAt: 0 }));

/** HUD overlap: our visible rects vs the core HUD and the share pill */
async function overlaps() {
  return p.evaluate(() => {
    const ours = window.__meowUgc.style.rects();
    const sel = ['#prompt', '#callouts .callout span', '#meter', '#abilityBtn', '#distPill', '.hud [id*="ghost" i]', '.hud [class*="ghost" i]', '.hud [class*="pill" i]:not(#distPill)'];
    const bad = [];
    for (const s of sel)
      for (const e of document.querySelectorAll(s)) {
        if (e.closest('#style-combo, #style-stamp, #style-pops')) continue;
        const cs = getComputedStyle(e);
        if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05 || e.classList.contains('hidden')) continue;
        const r = e.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) continue;
        for (const [k, o] of Object.entries(ours)) {
          if (!o) continue;
          if (o.left < r.right && o.right > r.left && o.top < r.bottom && o.bottom > r.top) bad.push(`${k} x ${s}`);
        }
      }
    const vw = innerWidth;
    for (const [k, o] of Object.entries(ours)) if (o && (o.left < 0 || o.right > vw + 1)) bad.push(`${k} off-screen`);
    return bad;
  });
}

// ============================================================================ 1. tricks
console.log('---- style shots', W, H);
await boot();
await p.evaluate(() => { window.__meow.dev.unlockAll(); });
let landed = 0;
let midSpin = false;
for (let attempt = 0; attempt < 4 && landed < 1; attempt++) {
  await p.evaluate(() => { window.__meow.dev.jump('meadow', 0.3); window.__meow.dev.invincible(true); });
  await sleep(1400);
  await waitFor(() => window.__meow.P.grounded && window.__meow.mode === 'play', 3000);
  if (mobile) {
    await bot.act('jump');
    await bot.act('ability');
    await bot.act('ability');
  } else {
    await p.keyboard.press('Space');
    await p.keyboard.press('KeyE');
    await p.keyboard.press('KeyE');
  }
  await sleep(140);
  const s1 = await st();
  if (s1.spinning && !midSpin) { midSpin = true; await S('1-midspin'); }
  await waitFor(() => window.__meow.P.grounded, 2000);
  await sleep(200);
  landed = (await st()).tricks;
  if (!landed) console.log('  attempt', attempt, 'no trick yet', JSON.stringify(await st()));
}
check('mid-spin seen', midSpin);
check('trick landed (tricks >= 1)', landed >= 1, await st());
await S('1-landed');

// ============================================================================ 2. combo meter + gold speed lines
await p.evaluate(() => window.__meowUgc.style.forceTier(25, 8));
await sleep(450);
await S('2-tier-stamp');
const t2 = await st();
check('forceTier(25) -> CLAW-SOME! tier 3', t2.tier === 3 && t2.chain >= 25, t2);
const ov1 = await overlaps();
check('no HUD overlap (stamp + meter)', ov1.length === 0, ov1);
await sleep(900);
await S('2-meter-gold');
const ov2 = await overlaps();
check('no HUD overlap (meter)', ov2.length === 0, ov2);
check('combo meter visible', await p.evaluate(() => document.getElementById('style-combo').classList.contains('on')));
await p.evaluate(() => window.__meowUgc.style.trick('DOUBLE'));
await sleep(250);
await S('2-trick-popup');
const ov3 = await overlaps();
check('no HUD overlap (popup)', ov3.length === 0, ov3);

// ============================================================================ 3. dog chase slow-mo
await resetWatch();
await p.evaluate(() => { window.__meow.dev.jump('gorge', 0.62); window.__meow.dev.invincible(true); });
await sleep(800);
let slowShot = false;
const t3 = Date.now();
await bot.playUntil((s) => s.mode !== 'play' || Date.now() - t3 > 40000, {
  maxMs: 42000,
  onTick: async () => {
    if (slowShot) return;
    const s = await st();
    if (s.timeScale < 1) { slowShot = true; await S('3-slowmo'); }
  },
});
const w3 = await p.evaluate(() => window.__styleWatch);
const s3 = await st();
check('slow-mo seen (timeScale < 1)', w3.minScale < 1, { minScale: w3.minScale, slowmos: s3.slowmos });
check('time scale back to 1', (await st()).timeScale === 1 || (await p.evaluate(() => window.__meow.mode)) !== 'play', await st());
if (!slowShot) await S('3-chase');

// ============================================================================ 4. finish flourish
await resetWatch();
await p.evaluate(() => { window.__meow.dev.invincible(true); window.__meow.dev.jump('meadow', 0.985); });
const gotFinish = await waitFor(() => window.__styleWatch.finishAt > 0, 15000);
check('crossed the finish', gotFinish);
const fAt = await p.evaluate(() => window.__styleWatch.finishAt);
await p.waitForFunction((t) => performance.now() - t >= 300, fAt);
await S('4-flourish-0.3s');
const f1 = await st();
check('swing + slow-mo at +0.3 s', f1.swinging && f1.timeScale < 1, f1);
await p.waitForFunction((t) => performance.now() - t >= 1200, fAt);
await S('4-flourish-1.2s');
await p.waitForFunction((t) => performance.now() - t >= 1550, fAt);
await S('4-flourish-rank');
const ov4 = await overlaps();
check('no HUD overlap (rank stamp)', ov4.length === 0, ov4);
check('results shown', await waitFor(() => document.body.dataset.screen === 'results', 8000));
await sleep(500);
await S('4-results');
const f2 = await st();
check('swing released before results', !f2.swinging, f2);
check('a rank was given', ['S', 'A', 'B', 'C'].includes(f2.rank), f2.rank);
// retry: the core camera is back behind Mochi
if (mobile) await p.tap('#resRetry'); else await p.click('#resRetry');
await sleep(1600);
const cam = await p.evaluate(() => {
  const M = window.__meow;
  const c = M.camera.position, w = M.P.world;
  const dx = c.x - w.pos.x, dy = c.y - w.pos.y, dz = c.z - w.pos.z;
  return { along: dx * w.fwd.x + dy * w.fwd.y + dz * w.fwd.z, mode: M.mode };
});
check('camera behind Mochi on retry', cam.mode === 'play' && cam.along < -2, cam);
await S('4-retry');
const summ = await p.evaluate(() => window.__meowUgc.style.summary());
console.log('summary', JSON.stringify(summ));
const saved = await p.evaluate(() => window.__meow.dev.save().ugcStats);
check('save: ugcStats.tricks and bestChain written', saved.tricks >= 1 && saved.bestChain >= 25, saved);

// ============================================================================ 5. reduced motion
const sv = await p.evaluate(() => window.__meow.dev.save());
sv.settings.reducedMotion = true;
await boot(sv);
await resetWatch();
await p.evaluate(() => { window.__meow.dev.invincible(true); window.__meow.dev.jump('meadow', 0.985); });
await waitFor(() => window.__styleWatch.finishAt > 0, 15000);
await sleep(300);
await S('5-reduced-finish');
await waitFor(() => document.body.dataset.screen === 'results', 8000);
await p.evaluate(() => { window.__meow.dev.jump('gorge', 0.62); window.__meow.dev.invincible(true); });
await sleep(800);
const t5 = Date.now();
await bot.playUntil((s) => s.mode !== 'play' || Date.now() - t5 > 14000, { maxMs: 15000 });
const w5 = await p.evaluate(() => window.__styleWatch);
check('reduced motion: no time-scale change', w5.minScale === 1, w5);
check('reduced motion: no swing', !w5.swung, w5);

await b.close();
if (foreign.length) console.log('OTHER-LANE ERRORS (reported, not failed):', foreign.length, '\n ', [...new Set(foreign)].slice(0, 6).join('\n  '));
console.log('ERRORS', errs.length, errs.slice(0, 6));
if (fails.length || errs.length) {
  console.log('STYLE SHOTS FAILED', fails);
  process.exit(1);
}
console.log('STYLE SHOTS OK');
