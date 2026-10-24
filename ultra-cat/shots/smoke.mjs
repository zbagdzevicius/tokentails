// End-to-end smoke test: node shots/smoke.mjs [w h]
// fresh save -> title -> map -> intro -> tutorial -> play Meowhattan with a bot to the results -> star + catnip saved,
// Catfish Wharf unlocked -> NEXT CITY -> intro -> play -> pause -> resume -> quit to map;
// then the dev shortcuts: unlockAll + jump to Fort Fluffington + boss() -> Roomba Prime's bar appears.
// Exits 1 on any page error, console error or failed check.
import { chromium } from '@playwright/test';
const W = +(process.argv[2] || 1280), H = +(process.argv[3] || 720);
const mobile = W < 600;
const tag = mobile ? 'm' : 'd';
const b = await chromium.launch({ args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: W, height: H }, hasTouch: mobile, isMobile: mobile });
const errs = [];
const fails = [];
p.on('pageerror', (e) => errs.push(String(e)));
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
let n = 0;
const S = (name) => p.screenshot({ path: `shots/smoke-${tag}-${String(++n).padStart(2, '0')}-${name}.png` });
const click = async (sel) => { if (mobile) await p.tap(sel); else await p.click(sel); await p.waitForTimeout(300); };
const state = () => p.evaluate(() => ({ mode: window.__ultra.mode, screen: document.body.dataset.screen, level: window.__ultra.game.level?.id, cat: window.__ultra.game.cat?.id }));
const check = (name, ok, info) => { console.log(ok ? 'ok  ' : 'FAIL', name, info === undefined ? '' : JSON.stringify(info)); if (!ok) fails.push(name); };
const waitFor = async (fn, ms, arg) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await p.evaluate(fn, arg).catch(() => false)) return true; await p.waitForTimeout(250); } return false; };

// a simple bot: walk at the nearest tall building (or the WANTED one), swat, pounce near it, fire ULTRA when full
const startBot = () => p.evaluate(() => {
  const U = window.__ultra;
  clearInterval(window.__bot);
  window.__bot = setInterval(() => {
    const k = U.keys;
    if (U.mode !== 'play') { k.clear(); return; }
    const C = U.C;
    let tx = 0, tz = 0, best = 1e9;
    for (let i = 0; i < U.city.buildings.length; i++) {
      const bd = U.city.buildings[i];
      const h = U.city.standing(bd);
      if (h <= 7) continue;
      const s = Math.hypot(bd.x - C.pos.x, bd.z - C.pos.z) - h * 0.3;
      if (s < best) { best = s; tx = bd.x; tz = bd.z; }
    }
    let diff = Math.atan2(tx - C.pos.x, tz - C.pos.z) - C.heading;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    k.add('KeyW'); k.delete('KeyA'); k.delete('KeyD');
    if (diff > 0.25) k.add('KeyA'); else if (diff < -0.25) k.add('KeyD');
    U.doSwipe();
    if (Math.hypot(tx - C.pos.x, tz - C.pos.z) < 60) U.doPounce();
    U.doUltra();
  }, 50);
});
const stopBot = () => p.evaluate(() => { clearInterval(window.__bot); window.__ultra.keys.clear(); });

await p.goto('http://127.0.0.1:5177/');
await p.evaluate(() => localStorage.clear());
await p.reload();
await p.waitForTimeout(2500);
await S('title');
check('title shown', (await state()).screen === 'title', await state());

await click('#play');
await S('map');
check('map: 1 open, 4 locked', (await p.locator('.node.locked').count()) === 4, await p.locator('.node.locked').count());
await click('.node[data-id="meowhattan"]');
if ((await state()).screen === 'map') await click('#mapGo');
await p.waitForTimeout(600);
await S('intro');
check('intro meowhattan', (await state()).screen === 'intro', await state());
await click('#introPlay');
await p.waitForTimeout(800);
check('tutorial runs on a fresh save', await p.evaluate(() => document.body.classList.contains('tutorial') && window.__ultra.G.timeFrozen));
await S('tutorial');
await startBot();
const tutDone = await waitFor(() => !document.body.classList.contains('tutorial'), 60000);
check('tutorial completed by playing', tutDone, await p.evaluate(() => document.getElementById('tutTitle').textContent));
await p.waitForTimeout(6000);
await S('play');

// play the whole level for real (90 s of game time); hard wall-clock cap, then fast-forward the clock
const t0 = Date.now();
let shotMid = false;
while ((await p.evaluate(() => window.__ultra.mode)) === 'play' && Date.now() - t0 < 200000) {
  await p.waitForTimeout(2000);
  if (!shotMid && (await p.evaluate(() => window.__ultra.G.elapsed)) > 45) { shotMid = true; await S('play-mid'); }
}
const run = await p.evaluate(() => ({ el: Math.round(window.__ultra.G.elapsed), dmg: Math.round(window.__ultra.G.damage), pat: Math.round(window.__ultra.G.patience), helis: window.__ultra.G.kills.heli ?? 0, wanted: window.__ultra.G.wanted }));
console.log('run', JSON.stringify(run), 'wall', Math.round((Date.now() - t0) / 1000), 's');
if ((await p.evaluate(() => window.__ultra.mode)) === 'play') await p.evaluate(() => { window.__ultra.G.time = 0.05; });
await stopBot();
check('level ended', await waitFor(() => window.__ultra.mode === 'over', 5000));
check('results shown', await waitFor(() => document.body.dataset.screen === 'results', 6000), await state());
await p.waitForTimeout(500);
await S('results-reveal');
await p.waitForTimeout(6000);
await S('results');
const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('ultracat.save')));
check('stars saved for meowhattan', (saved.levels.meowhattan?.stars ?? 0) >= 1, saved.levels.meowhattan);
check('catnip earned', saved.catnip > 0, saved.catnip);
check('tutorialDone saved', saved.tutorialDone === true);
check('NEXT CITY offered', await p.evaluate(() => !document.getElementById('resNext').classList.contains('hidden')));

await click('#resNext');
await p.waitForTimeout(1000);
await S('intro-docks');
check('intro for docks', (await state()).level === 'docks' && (await state()).screen === 'intro', await state());
await click('#introPlay');
await p.waitForTimeout(2500);
check('docks playing', (await state()).mode === 'play', await state());
await startBot();
await p.waitForTimeout(8000);
await stopBot();
await S('docks-play');
if (mobile) await click('#pauseBtn'); else { await p.keyboard.press('Escape'); await p.waitForTimeout(400); }
await S('pause');
check('paused', (await state()).mode === 'paused' && (await state()).screen === 'pause', await state());
const el0 = await p.evaluate(() => window.__ultra.G.elapsed);
await p.waitForTimeout(1000);
check('clock stopped while paused', (await p.evaluate(() => window.__ultra.G.elapsed)) === el0);
await click('#pauseResume');
check('resumed', (await state()).mode === 'play', await state());
if (mobile) await click('#pauseBtn'); else { await p.keyboard.press('Escape'); await p.waitForTimeout(400); }
await click('#pauseQuit');
await p.waitForTimeout(800);
await S('map-after');
check('quit to map', (await state()).screen === 'map' && (await state()).mode === 'title', await state());
check('map: docks open now', (await p.locator('.node.locked').count()) === 3, await p.locator('.node.locked').count());

// dev shortcuts: everything unlocked, straight to the boss city
await p.evaluate(() => window.__ultra.dev.unlockAll());
await p.waitForTimeout(500);
check('dev.unlockAll unlocks every city', (await p.locator('.node.locked').count()) === 0);
await p.evaluate(() => { window.__ultra.dev.jump('base', 'shadow'); });
await p.waitForTimeout(1200);
check('dev.jump base/shadow', (await state()).level === 'base' && (await state()).cat === 'shadow' && (await state()).mode === 'play', await state());
await p.evaluate(() => window.__ultra.dev.boss());
const bossUp = await waitFor(() => !document.getElementById('bossBar').classList.contains('hidden'), 10000);
check('boss bar appears', bossUp, await p.evaluate(() => document.getElementById('bossName').textContent));
await startBot();
await p.waitForTimeout(5000);
await stopBot();
await S('boss');

console.log('ERRORS', errs.length, errs.slice(0, 8));
console.log(fails.length || errs.length ? `SMOKE FAILED: ${fails.join(', ')}` : 'SMOKE OK');
await b.close();
process.exit(fails.length || errs.length ? 1 : 0);
