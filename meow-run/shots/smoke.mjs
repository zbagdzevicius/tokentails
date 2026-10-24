// End-to-end smoke + full journey: node shots/smoke.mjs [w h]   (dev server on http://127.0.0.1:5178, or MEOW_URL)
//   SMOKE=fast     only the fast path (dev shortcuts, invincibility allowed)
//   SMOKE=journey  only the journey (no invincibility, no dev shortcuts during play)
//   default        both: fast path first (it ends on a fresh save), then the journey
// GPU: Metal on macOS by default (MEOW_SWIFT=1 forces SwiftShader; MEOW_GPU=1 forces Metal elsewhere).
//
// FAST PATH: fresh save -> title -> stage select (3 locked) -> Sunny Meadow with a real Space press (phones: a swipe
// up), a D-key steer -> 20 s of bot play -> pause/resume -> dev.jump near the finish -> results + save ->
// dev.unlockAll -> a look at every other stage -> settings -> the sunset ending (skipped) -> dev.reset.
//
// JOURNEY: a bot that only uses REAL input (Playwright keyboard on desktop: A/D held, Space, S, E, Esc, Enter;
// CDP touch events on phones: finger drag steer, swipe up/down, tap, taps on buttons) plays the whole campaign from a
// fresh save: title -> select -> stage 1 with the tutorial -> results -> NEXT -> stage 2 -> results -> NEXT -> stage 3
// -> the cottage cutscene played to the end -> results; reload (the save persists); endless: play, pause ->
// settings (quality LOW) -> resume, then hands off until out of hearts -> results + endless best; reload again.
// Exits 1 on any page error, console error or failed check.
import { chromium } from '@playwright/test';
import { createBot } from './bot.mjs';

const W = +(process.argv[2] || 1280), H = +(process.argv[3] || 720);
const mobile = W < 600;
const tag = mobile ? 'm' : 'd';
const PART = process.env.SMOKE || 'all';
const URL = process.env.MEOW_URL || 'http://127.0.0.1:5178/';
const gpu = process.env.MEOW_GPU || (process.platform === 'darwin' && !process.env.MEOW_SWIFT);
const args = gpu ? ['--use-angle=metal'] : ['--use-gl=angle', '--enable-unsafe-swiftshader'];
const b = await chromium.launch({ args });
const p = await b.newPage({ viewport: { width: W, height: H }, hasTouch: mobile, isMobile: mobile });
const errs = [];
const fails = [];
p.on('pageerror', (e) => errs.push(String(e)));
const warns = new Set();
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); else if (m.type() === 'warning') warns.add(m.text().slice(0, 160)); });
let n = 0;
const S = (name) => p.screenshot({ path: `shots/smoke-${tag}-${String(++n).padStart(2, '0')}-${name}.png` });
const click = async (sel) => { if (mobile) await p.tap(sel); else await p.click(sel); await p.waitForTimeout(300); };
const state = () => p.evaluate(() => ({ mode: window.__meow.mode, screen: document.body.dataset.screen, stage: window.__meow.game.stage?.id, s: Math.round(window.__meow.P.s), hearts: window.__meow.G.hearts, score: Math.round(window.__meow.G.score) }));
const check = (name, ok, info) => { console.log(ok ? 'ok  ' : 'FAIL', name, info === undefined ? '' : JSON.stringify(info)); if (!ok) fails.push(name); };
const waitFor = async (fn, ms, arg) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await p.evaluate(fn, arg).catch(() => false)) return true; await p.waitForTimeout(200); } return false; };
const bot = await createBot(p, { mobile, W, H });
const boot = async () => {
  await p.waitForFunction(() => window.__meow && window.__meow.dev, null, { timeout: 30000 });
  await p.waitForTimeout(1500);
  await bot.install();
};
const play = (stop, ms, onTick) => bot.playUntil(stop, { maxMs: ms, onTick });
const fresh = async () => {
  await p.goto(URL);
  await p.evaluate(() => localStorage.clear());
  await p.reload();
  await boot();
};

// ============================================================================================== FAST PATH
async function fastPath() {
  console.log('---- fast path', W, H);
  await fresh();
  await S('title');
  check('title shown', (await state()).screen === 'title', await state());
  check('attract scenery streamed', await p.evaluate(() => window.__meow.session.sessionInfo.chunks > 2));

  await click('#play');
  await S('select');
  check('select: meadow open, 3 locked', (await p.locator('.stage.locked').count()) === 3, await p.locator('.stage.locked').count());
  await click('.stage[data-id="meadow"]');
  await p.waitForTimeout(800);
  check('meadow playing', (await state()).mode === 'play' && (await state()).stage === 'meadow', await state());
  check('tutorial coach shows on a fresh save', await waitFor(() => !document.getElementById('coach').classList.contains('hidden'), 3000));

  // real input paths: a keyboard jump on desktop, a touch swipe-up on phones
  const jumped = p.evaluate(() => new Promise((res) => { const off = window.__meow.events.on('jump', () => { off(); res(true); }); setTimeout(() => res(false), 3000); }));
  if (mobile) await bot.act('jump');
  else {
    await p.waitForTimeout(300);
    await p.keyboard.press('Space');
  }
  check(mobile ? 'swipe up jumps' : 'Space jumps', await jumped);
  if (!mobile) {
    await p.keyboard.down('KeyD');
    await p.waitForTimeout(400);
    const x = await p.evaluate(() => window.__meow.P.x);
    await p.keyboard.up('KeyD');
    check('D steers right (+x)', x > 0.5, x);
  }

  const t0 = Date.now();
  let shot = 0;
  await play(() => false, 20000, async () => {
    const k = Math.floor((Date.now() - t0) / 7000);
    if (k > shot) { shot = k; await S(`play-${k * 7}s`); }
  });
  const after = await state();
  console.log('after 20 s', JSON.stringify(after), JSON.stringify(bot.stats), 'wall', Math.round((Date.now() - t0) / 1000), 's');
  check('ran forward', after.s > 250, after.s);
  check('still playing or finished', ['play', 'finish', 'over'].includes(after.mode), after.mode);
  check('score counts', after.score > 200, after.score);

  if (mobile) await click('#pauseBtn'); else { await p.keyboard.press('Escape'); await p.waitForTimeout(300); }
  await S('pause');
  check('paused', (await state()).mode === 'paused' && (await state()).screen === 'pause', await state());
  const s0 = (await state()).s;
  await p.waitForTimeout(700);
  check('frozen while paused', (await state()).s === s0);
  await click('#pauseResume');
  check('resumed', (await state()).mode === 'play', await state());

  // near the finish with dev shortcuts -> results + save
  await p.evaluate(() => { window.__meow.dev.invincible(true); window.__meow.dev.jump('meadow', 0.95); });
  await play((st) => st.mode === 'over', 30000);
  check('finished the stage', (await state()).mode === 'over', await state());
  check('results shown', await waitFor(() => document.body.dataset.screen === 'results', 5000), await state());
  await S('results');
  const saved = await p.evaluate(() => window.__meow.dev.save());
  check('meadow finished + star saved', saved.stages.meadow?.finished === true && saved.stages.meadow.stars[0] === true, saved.stages.meadow);
  check('NEXT offered', await p.evaluate(() => !document.getElementById('resNext').classList.contains('hidden')));
  await click('#resMenu');
  check('select: gorge + endless open now', (await p.locator('.stage.locked').count()) === 1, await p.locator('.stage.locked').count());
  await p.evaluate(() => window.__meow.dev.unlockAll());
  await p.waitForTimeout(200);
  check('dev.unlockAll', (await p.locator('.stage.locked').count()) === 0);

  for (const [id, at] of [['gorge', 0.12], ['gorge', 0.5], ['sunset', 0.2], ['endless', 0]]) {
    await p.evaluate(([i, a]) => window.__meow.dev.jump(i, a), [id, at]);
    await play(() => false, 4000);
    const st = await state();
    check(`dev.jump ${id} ${at}`, st.stage === id && ['play', 'finish', 'over'].includes(st.mode), st);
    await S(`${id}-${at}`);
  }
  // settings open from the title and close back to it (META-UI)
  await p.evaluate(() => window.__meow.dev.jump('meadow', 0.5));
  await p.waitForTimeout(300);
  await p.evaluate(() => window.__meow.session.quit());
  await click('#titleSettings');
  check('settings open', (await state()).screen === 'settings', await state());
  await click('#settingsDone');
  check('settings close to the title', (await state()).screen === 'title', await state());

  // the ending at Grandma's: reach the cutscene, skip it with a key / tap, results + endingSeen
  await p.evaluate(() => { window.__meow.dev.invincible(true); window.__meow.dev.jump('sunset', 0.985); });
  await play((st) => st.screen === 'cutscene', 40000);
  check('ending cutscene plays', (await state()).screen === 'cutscene', await state());
  await p.waitForTimeout(1500);
  await S('ending');
  if (mobile) await p.tap('#cutscene'); else await p.keyboard.press('Enter');
  check('ending skips to results', await waitFor(() => document.body.dataset.screen === 'results', 3000), await state());
  check('ending results title', (await p.evaluate(() => document.getElementById('resTitle').textContent)) === 'Home for dinner!');
  check('endingSeen saved', (await p.evaluate(() => window.__meow.dev.save().endingSeen)) === true);
  await S('ending-results');
  await click('#resMenu');
  check('results -> stages', (await state()).screen === 'select', await state());

  await p.evaluate(() => window.__meow.dev.reset());
  await p.waitForTimeout(300);
  check('dev.reset -> title, fresh save', (await state()).screen === 'title' && (await p.evaluate(() => Object.keys(window.__meow.dev.save().stages).length)) === 0);
}

// ============================================================================================== JOURNEY
const installLog = () => p.evaluate(() => {
  const M = window.__meow;
  const L = (window.__jlog = { hits: [], falls: 0, respawns: 0, callouts: {}, coach: {}, invincibleSeen: false, frames0: M.clock.frame, t0: performance.now() });
  M.events.on('hit', (e) => L.hits.push(`${e.label}@${Math.round(M.P.s)}`));
  M.events.on('fall', () => L.falls++);
  M.events.on('respawn', () => L.respawns++);
  M.events.on('callout', (e) => (L.callouts[e.text] = 1));
  M.events.on('stageStart', () => { L.hits = []; L.falls = 0; L.respawns = 0; L.frames0 = M.clock.frame; L.t0 = performance.now(); window.__brainState = null; });
  const coach = document.querySelector('#coach .say b');
  new MutationObserver(() => { if (!document.getElementById('coach').classList.contains('hidden')) L.coach[coach.textContent] = 1; }).observe(document.getElementById('coach'), { attributes: true, childList: true, subtree: true });
  setInterval(() => { if (M.G.invincible) L.invincibleSeen = true; }, 250);
});
const runInfo = () => p.evaluate(() => {
  const M = window.__meow, L = window.__jlog;
  const secs = (performance.now() - L.t0) / 1000;
  return { stage: M.game.stage?.id, score: Math.round(M.G.score), time: +M.G.time.toFixed(1), bells: M.G.bells.filter(Boolean).length, fish: M.G.fish, hits: L.hits, falls: L.falls, respawns: L.respawns, fps: Math.round((M.clock.frame - L.frames0) / secs), quality: M.quality.get(), invincible: L.invincibleSeen, prompts: Object.keys(window.__brainState?.prompts || {}) };
});

/** play the current campaign stage to the finish with real input; returns the run info */
async function runStage(id, budgetMs = 260000) {
  const t0 = Date.now();
  let k = 0;
  await play((st) => st.mode === 'over' || st.mode === 'finish', budgetMs, async () => {
    if ((Date.now() - t0) / 25000 > k) { k++; await S(`j-${id}-${k}`); }
  });
  const info = await runInfo();
  await play((st) => st.mode === 'over', 8000);
  const st = await state();
  console.log(`  ${id}: wall ${Math.round((Date.now() - t0) / 1000)} s`, JSON.stringify(info), 'bot', JSON.stringify({ ...bot.stats, latency: +bot.stats.latency.toFixed(3) }));
  check(`journey: ${id} finished with real input`, st.mode === 'over' && st.stage === id, st);
  check(`journey: ${id} never invincible`, !info.invincible);
  return info;
}
const resultsCard = () => p.evaluate(() => ({ title: document.getElementById('resTitle').textContent, stars: document.querySelectorAll('#resStars .star.on').length, next: !document.getElementById('resNext').classList.contains('hidden') }));

async function journey() {
  console.log('---- journey', W, H, mobile ? '(touch)' : '(keyboard)');
  await fresh();
  await installLog();
  check('journey: fresh save', (await p.evaluate(() => Object.keys(window.__meow.dev.save().stages).length)) === 0);
  // title -> select: Enter on desktop, a tap on PLAY on phones
  if (mobile) await click('#play'); else { await p.keyboard.press('Enter'); await p.waitForTimeout(400); }
  check('journey: select screen', (await state()).screen === 'select', await state());
  check('journey: 3 stages locked', (await p.locator('.stage.locked').count()) === 3);
  await click('.stage[data-id="meadow"]');
  check('journey: meadow starts', await waitFor(() => window.__meow.mode === 'play', 3000), await state());
  const meadow = await runStage('meadow');
  const coach = await p.evaluate(() => Object.keys(window.__jlog.coach));
  console.log('  tutorial cards seen', JSON.stringify(coach), 'prompts', JSON.stringify(meadow.prompts));
  check('journey: tutorial coach cards shown (steer, jump, slide, vault)', coach.length >= 4, coach);
  check('journey: stage 1 prompts (JUMP!, SLIDE!, TAIL VAULT!)', ['JUMP!', 'SLIDE!', 'TAIL VAULT!'].every((t) => meadow.prompts.includes(t)), meadow.prompts);
  check('journey: results after meadow', await waitFor(() => document.body.dataset.screen === 'results', 5000), await state());
  await p.waitForTimeout(2200);
  await S('j-meadow-results');
  const r1 = await resultsCard();
  const save1 = await p.evaluate(() => window.__meow.dev.save());
  console.log('  meadow results', JSON.stringify(r1), 'saved', JSON.stringify(save1.stages.meadow));
  check('journey: meadow results stars match the save', r1.stars === save1.stages.meadow.stars.filter(Boolean).length && r1.stars >= 1, r1);
  check('journey: tutorialDone saved', save1.tutorialDone === true);
  check('journey: NEXT offered after meadow', r1.next);

  // results -> NEXT: Enter on desktop, tap on phones
  if (mobile) await click('#resNext'); else await p.keyboard.press('Enter');
  check('journey: gorge starts from NEXT', await waitFor(() => window.__meow.mode === 'play' && window.__meow.game.stage.id === 'gorge', 4000), await state());
  check('journey: no tutorial on stage 2', await p.evaluate(() => document.getElementById('coach').classList.contains('hidden')));
  await runStage('gorge');
  check('journey: results after gorge', await waitFor(() => document.body.dataset.screen === 'results', 5000), await state());
  await p.waitForTimeout(2200);
  await S('j-gorge-results');
  const r2 = await resultsCard();
  console.log('  gorge results', JSON.stringify(r2));
  check('journey: NEXT offered after gorge', r2.next);
  if (mobile) await click('#resNext'); else await click('#resNext');
  check('journey: sunset starts from NEXT', await waitFor(() => window.__meow.mode === 'play' && window.__meow.game.stage.id === 'sunset', 4000), await state());
  await runStage('sunset');

  // the cottage cutscene, watched to the end
  check('journey: cottage cutscene', await waitFor(() => document.body.dataset.screen === 'cutscene', 6000), await state());
  const tc = Date.now();
  for (const at of [1500, 4500, 7500, 10000]) {
    await p.waitForTimeout(Math.max(0, at - (Date.now() - tc)));
    if ((await state()).screen !== 'cutscene') break;
    await S(`j-cutscene-${at}`);
  }
  check('journey: cutscene ends on its own into results', await waitFor(() => document.body.dataset.screen === 'results', 9000), await state());
  console.log('  cutscene lasted', ((Date.now() - tc) / 1000).toFixed(1), 's');
  await p.waitForTimeout(2200);
  await S('j-ending-results');
  const r3 = await resultsCard();
  console.log('  sunset results', JSON.stringify(r3));
  check('journey: ending results title', r3.title === 'Home for dinner!', r3.title);
  check('journey: no NEXT after the last stage', !r3.next);
  const save3 = await p.evaluate(() => window.__meow.dev.save());
  check('journey: all three stages finished in the save', ['meadow', 'gorge', 'sunset'].every((id) => save3.stages[id]?.finished), save3.stages);
  check('journey: endingSeen saved', save3.endingSeen === true);

  // the save survives a reload
  await p.reload();
  await boot();
  await installLog();
  const save4 = await p.evaluate(() => window.__meow.dev.save());
  check('journey: save persists across reload', JSON.stringify(save4.stages) === JSON.stringify(save3.stages) && save4.endingSeen && save4.tutorialDone, save4.stages);
  const titleStars = await p.evaluate(() => document.getElementById('titleStars').textContent.trim());
  const total = Object.values(save3.stages).reduce((a, s) => a + s.stars.filter(Boolean).length, 0);
  check('journey: title shows the stars after reload', titleStars.startsWith(String(total)), { titleStars, total });
  await click('#play');
  check('journey: nothing locked after the campaign (endless open)', (await p.locator('.stage.locked').count()) === 0);
  const cardStars = await p.locator('#stageList .star.on').count();
  check('journey: stage cards show the saved stars', cardStars === total, { cardStars, total });
  await S('j-select-after');

  // endless: play for real, pause -> settings (quality LOW) -> resume, then hands off until out of hearts
  await click('.stage[data-id="endless"]');
  check('journey: endless starts', await waitFor(() => window.__meow.mode === 'play' && window.__meow.game.stage.id === 'endless', 4000), await state());
  await play(() => false, 20000);
  const e1 = await state();
  check('journey: endless runs', e1.mode === 'play' && e1.s > 300, e1);
  await S('j-endless');
  if (mobile) await click('#pauseBtn'); else { await p.keyboard.press('Escape'); await p.waitForTimeout(300); }
  check('journey: endless paused', (await state()).screen === 'pause', await state());
  await click('#pauseSettings');
  check('journey: settings from pause', (await state()).screen === 'settings', await state());
  await click('#setQuality button[data-q="low"]');
  check('journey: quality LOW applied', (await p.evaluate(() => window.__meow.quality.get())) === 'low');
  await click('#settingsDone');
  check('journey: settings back to pause', (await state()).screen === 'pause', await state());
  if (mobile) await click('#pauseResume'); else { await p.keyboard.press('Escape'); await p.waitForTimeout(300); }
  check('journey: endless resumed', (await state()).mode === 'play', await state());
  await play(() => false, 4000);
  await S('j-endless-low');
  await bot.releaseAll();
  await p.evaluate(() => (window.__botPassive = true));
  await play((st) => st.mode === 'over', 120000);
  await p.evaluate(() => (window.__botPassive = false));
  check('journey: endless ends out of hearts', (await state()).mode === 'over', await state());
  check('journey: endless results', await waitFor(() => document.body.dataset.screen === 'results', 5000), await state());
  await p.waitForTimeout(1500);
  await S('j-endless-results');
  const re = await resultsCard();
  check('journey: endless results title', re.title === 'Run over!', re.title);
  const best = await p.evaluate(() => window.__meow.dev.save().endlessBest);
  check('journey: endless best saved', best.distance > 300 && best.score > 0, best);
  await p.reload();
  await boot();
  const best2 = await p.evaluate(() => window.__meow.dev.save());
  check('journey: endless best + quality persist across reload', best2.endlessBest.distance === best.distance && best2.settings?.quality === 'low', { best: best2.endlessBest, settings: best2.settings });
  // put the quality back for the next run of this browser profile (fresh contexts anyway)
  await p.evaluate(() => window.__meow.dev.reset());
}

if (PART !== 'journey') await fastPath();
if (PART !== 'fast') await journey();

console.log('WARNINGS', warns.size, [...warns].slice(0, 6));
console.log('ERRORS', errs.length, errs.slice(0, 8));
console.log(fails.length || errs.length ? `SMOKE FAILED: ${fails.join(', ')}` : 'SMOKE OK');
await b.close();
process.exit(fails.length || errs.length ? 1 : 0);
