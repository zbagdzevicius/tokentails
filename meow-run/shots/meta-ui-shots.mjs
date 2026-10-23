// META-UI lane screenshots: node shots/meta-ui-shots.mjs [w h] [only]  -> shots/meta-ui/<tag>-*.png
import { chromium } from '@playwright/test';
const W = +(process.argv[2] || 1280), H = +(process.argv[3] || 720);
const only = process.argv[4] || '';
const mobile = Math.min(W, H) < 600;
const tag = `${W}x${H}`;
const URL = process.env.MEOW_URL || 'http://127.0.0.1:5178/';
const args = process.env.MEOW_GPU ? ['--use-angle=metal'] : ['--use-gl=angle', '--enable-unsafe-swiftshader'];
const b = await chromium.launch({ args });
const p = await b.newPage({ viewport: { width: W, height: H }, hasTouch: mobile, isMobile: mobile });
const errs = [];
p.on('pageerror', (e) => errs.push(String(e)));
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
const S = (name) => p.screenshot({ path: `shots/meta-ui/${tag}-${name}.png` });
const ev = (f, a) => p.evaluate(f, a);
const want = (k) => !only || only.split(',').includes(k);

await p.goto(URL);
await ev(() => localStorage.clear());
await p.reload();
await p.waitForTimeout(2500);
if (want('title')) await S('01-title');
if (want('select')) {
  await ev(() => document.getElementById('play').click());
  await p.waitForTimeout(700);
  await S('02-select-fresh');
  await ev(() => {
    const s = window.__meow.dev.save();
    s.stages.meadow = { stars: [true, true, false], best: 18450, bestBells: 7, plays: 3, finished: true };
    localStorage.setItem('meowrun.save', JSON.stringify(s));
  });
  await p.reload();
  await p.waitForTimeout(2000);
  await ev(() => document.getElementById('play').click());
  await p.waitForTimeout(800);
  await S('03-select-progress');
}
if (want('hud')) {
  await ev(() => { window.__meow.dev.invincible(true); window.__meow.dev.jump('meadow', 0.3); });
  await p.waitForTimeout(1500);
  await ev(() => {
    const M = window.__meow;
    M.G.bells[0] = true; M.G.bells[2] = true; M.G.hearts = 2; M.G.mult = 18; M.G.meter = 0.62;
    window.__pr = setInterval(() => { M.hud.prompt = { action: 'jump', text: 'JUMP!', until: M.hud.now + 5 }; }, 30);
    M.events.emit('react', { mood: 'nom' });
    M.events.emit('callout', { text: 'NOM NOM!', tone: 'good' });
    M.events.emit('pickup', { kind: 'fish', points: 900, x: M.P.world.pos.x, y: M.P.world.pos.y + 1, z: M.P.world.pos.z + 3 });
  });
  await p.waitForTimeout(250);
  await S('04-hud');
  await ev(() => {
    const M = window.__meow;
    clearInterval(window.__pr);
    window.__pr = setInterval(() => { M.hud.prompt = { action: 'ability', text: 'TAIL VAULT!', until: M.hud.now + 5 }; }, 30);
    M.events.emit('react', { mood: 'ouch' });
    M.events.emit('callout', { text: 'CLOSE ONE!', tone: 'good' });
  });
  await p.waitForTimeout(450);
  await S('05-hud-ability');
  await ev(() => { clearInterval(window.__pr); window.__meow.session.pause(); });
  await p.waitForTimeout(500);
  await S('06-pause');
  await ev(() => document.getElementById('pauseSettings').click());
  await p.waitForTimeout(500);
  await S('07-settings');
  await ev(() => document.getElementById('settingsDone').click());
  await ev(() => document.getElementById('pauseResume').click());
}
if (want('tut')) {
  await ev(() => { localStorage.clear(); });
  await ev(() => window.__meow.dev.reset());
  await ev(() => window.__meow.dev.jump('meadow', 0));
  await p.waitForTimeout(1600);
  await S('08-tutorial-steer');
}
if (want('results')) {
  await ev(() => { window.__meow.dev.invincible(true); window.__meow.dev.jump('meadow', 0.97); });
  await p.waitForFunction(() => document.body.dataset.screen === 'results', null, { timeout: 30000 });
  await p.waitForTimeout(2200);
  await S('09-results');
}
if (want('ending')) {
  await ev(() => { window.__meow.dev.unlockAll(); window.__meow.dev.invincible(true); window.__meow.dev.jump('sunset', 0.985); });
  await p.waitForFunction(() => document.body.dataset.screen === 'cutscene', null, { timeout: 40000 });
  for (const [ms, n] of [[1200, 'a'], [2200, 'b'], [2200, 'c'], [1600, 'd'], [1700, 'e'], [1500, 'f']]) {
    await p.waitForTimeout(ms);
    await S(`10-ending-${n}`);
  }
  await p.waitForFunction(() => document.body.dataset.screen === 'results', null, { timeout: 8000 });
  await p.waitForTimeout(2600);
  await S('11-ending-results');
}
if (want('endless')) {
  await ev(() => { window.__meow.dev.unlockAll(); window.__meow.dev.jump('endless', 0); });
  await p.waitForTimeout(2500);
  await S('12-endless');
}
console.log('ERRORS', errs.length, errs.slice(0, 8));
await b.close();
