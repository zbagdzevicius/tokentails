// SETPIECES lane visual tour: node shots/setpieces-tour.mjs [w h] [filter]   (dev server on http://127.0.0.1:5178)
// Jumps to every set piece with dev.jump (invincible, a simple bot playing) and screenshots it.
// Shots land in shots/setpieces-<d|m>-<name>.png. Exits 1 on any page or console error.
import { chromium } from '@playwright/test';
const W = +(process.argv[2] || 1280), H = +(process.argv[3] || 720);
const only = process.argv[4] || '';
const mobile = W < 600;
const tag = mobile ? 'm' : 'd';
const URL = process.env.MEOW_URL || 'http://127.0.0.1:5178/';
const args = process.env.MEOW_GPU ? ['--use-angle=metal'] : ['--use-gl=angle', '--enable-unsafe-swiftshader'];
const b = await chromium.launch({ args });
const p = await b.newPage({ viewport: { width: W, height: H }, hasTouch: mobile, isMobile: mobile });
const errs = [];
p.on('pageerror', (e) => errs.push(String(e)));
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); if (m.type() === 'warning') console.log('warn:', m.text()); });

// [stage, s, name, screenshot delays (ms after the jump), ability presses?]
const TOUR = [
  ['meadow', 186, 'logs', [500]],
  ['meadow', 352, 'branch', [600]],
  ['meadow', 536, 'airbell', [900]],
  ['meadow', 612, 'gap', [700]],
  ['meadow', 672, 'bridge', [300]],
  ['meadow', 870, 'puddles', [700, 1300]],
  ['meadow', 1046, 'vault', [300, 1500, 2300]],
  ['meadow', 1385, 'pounce', [500]],
  ['meadow', 1935, 'finish', [700]],
  ['gorge', 360, 'wall', [600, 2500]],
  ['gorge', 812, 'river', [800, 2600]],
  ['gorge', 985, 'rapid', [500]],
  ['gorge', 1470, 'dog', [900, 2200, 3600, 5200]],
  ['gorge', 1950, 'bankwall', [900]],
  ['sunset', 395, 'cloud', [900, 2500, 5000]],
  ['sunset', 890, 'bamboo', [400, 1800]],
  ['sunset', 1385, 'yarn', [700, 1500, 2100, 3000, 4200]],
  ['sunset', 3080, 'end', [400]],
  ['endless', 400, 'endless', [1500, 6000]],
  ['endless', 4000, 'endless-far', [1500, 6000]],
].filter((x) => !only || x[2].includes(only) || x[0].includes(only));

const startBot = () => p.evaluate(() => {
  const M = window.__meow;
  clearInterval(window.__bot);
  window.__bot = setInterval(() => {
    if (M.mode !== 'play') { M.input.botSteer = null; return; }
    const P = M.P;
    let steer = -P.x * 0.3;
    let best = 1e9;
    for (const c of M.colliders()) {
      if (!c.enabled) continue;
      const ds = c.s - P.s;
      if (c.kind === 'trigger' && ds > 2 && ds < 25 && ds < best && c.label !== 'puddle' && c.label !== 'rapid') { best = ds; steer = Math.max(-1, Math.min(1, (c.x - P.x) * 0.6)); }
      if (c.kind !== 'hurt' || ds < 1.5 || ds > 1.5 + P.speed * 0.2) continue;
      const lateral = Math.abs(c.x - P.x) - (c.shape === 'sphere' ? c.r : c.hx) - 0.4;
      if (lateral > 0.2) continue;
      if (c.y > 0.5) { if (!P.sliding) M.press('slide'); }
      else if (P.grounded) M.press('jump');
    }
    const pr = M.hud.prompt;
    if (pr && pr.action === 'ability') M.press('ability');
    if (pr && pr.action === 'jump' && P.grounded && M.game.track.kindAt(P.s + P.speed * 0.25) === 'gap') M.press('jump');
    M.input.botSteer = steer;
  }, 40);
});

const boot = async () => {
  await p.goto(URL);
  await p.waitForFunction(() => window.__meow && window.__meow.dev, null, { timeout: 20000 });
  await p.waitForTimeout(1200);
  await p.evaluate(() => window.__meow.dev.unlockAll());
  await startBot();
};
await p.goto(URL);
await p.evaluate(() => localStorage.clear());
await boot();
const visit = async ([stage, s, name, delays]) => {
  await p.evaluate(([id, at]) => {
    const M = window.__meow;
    M.session.prepareStage(id);
    const f = Number.isFinite(M.G.finishS) ? M.G.finishS : 2000;
    M.dev.jump(id, at / f);
    M.dev.invincible(true);
  }, [stage, s]);
  let t0 = 0;
  for (const d of delays) {
    await p.waitForTimeout(d - t0);
    t0 = d;
    await p.screenshot({ path: `shots/setpieces-${tag}-${stage}-${name}-${d}.png` });
  }
  const st = await p.evaluate(() => ({ s: Math.round(window.__meow.P.s), mode: window.__meow.mode, live: window.__meow.session.sessionInfo.live, score: Math.round(window.__meow.G.score), bells: window.__meow.G.bells.filter(Boolean).length }));
  console.log(stage, name, JSON.stringify(st));
};
for (const entry of TOUR) {
  try {
    await visit(entry);
  } catch (e) {
    // other lanes hot-reload the dev server while we run: reboot and try the entry again
    console.log('retry', entry[2], String(e).split('\n')[0]);
    await p.waitForTimeout(1500);
    await boot();
    await visit(entry);
  }
}
console.log('ERRORS', errs.length, errs.slice(0, 8));
await b.close();
process.exit(errs.length ? 1 : 0);
