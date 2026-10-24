// SETPIECES lane playtest: node shots/setpieces-play.mjs <stage> [w h]   (dev server on http://127.0.0.1:5178)
// Plays a whole stage for real (NOT invincible) with a bot that reads the colliders and the prompts like a player:
// jump low hazards, slide under branches, steer around dodge hazards, press E on ability prompts, jump gaps.
// Reports time, hits, falls, respawns, bells and score; screenshots every 15 s. Exits 1 on page/console errors.
import { chromium } from '@playwright/test';
const stage = process.argv[2] || 'meadow';
const W = +(process.argv[3] || 1280), H = +(process.argv[4] || 720);
const mobile = W < 600;
const URL = process.env.MEOW_URL || 'http://127.0.0.1:5178/';
const args = process.env.MEOW_GPU ? ['--use-angle=metal'] : ['--use-gl=angle', '--enable-unsafe-swiftshader'];
const b = await chromium.launch({ args });
const p = await b.newPage({ viewport: { width: W, height: H }, hasTouch: mobile, isMobile: mobile });
const errs = [];
p.on('pageerror', (e) => errs.push(String(e)));
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto(URL);
await p.waitForFunction(() => window.__meow && window.__meow.dev, null, { timeout: 20000 });
await p.waitForTimeout(1500);
await p.evaluate((id) => {
  const M = window.__meow;
  M.dev.unlockAll();
  window.__log = { hits: [], falls: 0, respawns: 0, nearMiss: 0, callouts: [] };
  M.events.on('hit', (e) => window.__log.hits.push(`${e.label}@${Math.round(M.P.s)}`));
  M.events.on('fall', () => window.__log.falls++);
  M.events.on('respawn', () => window.__log.respawns++);
  M.events.on('nearMiss', () => window.__log.nearMiss++);
  M.events.on('callout', (e) => window.__log.callouts.push(e.text));
  M.dev.jump(id, 0);
  clearInterval(window.__bot);
  window.__bot = setInterval(() => {
    if (M.mode !== 'play') { M.input.botSteer = null; return; }
    const P = M.P;
    let steer = -P.x * 0.25;
    let best = 1e9;
    let dodge = 0;
    for (const c of M.colliders()) {
      if (!c.enabled) continue;
      const ds = c.s - P.s;
      if (c.kind === 'trigger' && ds > 2 && ds < 22 && ds < best && c.label !== 'puddle' && c.label !== 'rapid') { best = ds; steer = Math.max(-1, Math.min(1, (c.x - P.x) * 0.6)); }
      if (c.kind !== 'hurt') continue;
      const half = c.shape === 'sphere' ? c.r : c.hx;
      const lateral = Math.abs(c.x - P.x) - half - 0.4;
      // dodge hazards (rocks, bamboo, the dog's head, the yarn ball): steer to the free side
      const tall = c.shape === 'sphere' ? c.r > 1.3 || c.label === 'dog' : c.h > 3;
      if ((tall || c.label === 'rock') && ds > -3 && ds < 16 && lateral < 0.8) dodge += (P.x >= c.x ? 1 : -1) * (1.5 - Math.min(1.4, Math.max(0, lateral)));
      if (ds < 1.2 || ds > 1.2 + P.speed * 0.18 || lateral > 0.15 || tall) continue;
      if (c.y > 0.5) { if (!P.sliding) M.press('slide'); }
      else if (P.grounded) M.press('jump');
    }
    if (dodge !== 0) steer = Math.sign(dodge);
    const pr = M.hud.prompt;
    if (pr && pr.action === 'ability') M.press('ability');
    const ahead = M.game.track.kindAt(P.s + P.speed * 0.2);
    if (P.grounded && P.mode === 'run' && (ahead === 'gap') && !(pr && pr.action === 'ability')) M.press('jump');
    if (!P.grounded && P.mode === 'run' && M.game.track.kindAt(P.s) === 'gap' && P.vy < 0 && P.sincePounce > 5) M.press('jump');
    if (pr && pr.action === 'jump' && pr.text.includes('RAPIDS') && P.grounded && P.s > 0) {
      for (const c of M.colliders()) if (c.label === 'rapid' && c.s - P.s > 1 && c.s - P.s < 1.5 + P.speed * 0.15) M.press('jump');
    }
    M.input.botSteer = steer;
  }, 30);
}, stage);
const t0 = Date.now();
let k = 0;
while (Date.now() - t0 < 200000) {
  await p.waitForTimeout(1000);
  const st = await p.evaluate(() => ({ mode: window.__meow.mode, s: Math.round(window.__meow.P.s) }));
  if (st.mode === 'over' || st.mode === 'title') break;
  if ((Date.now() - t0) / 15000 > k) {
    k++;
    await p.screenshot({ path: `shots/setpieces-play-${mobile ? 'm' : 'd'}-${stage}-${String(k).padStart(2, '0')}.png` });
  }
}
const r = await p.evaluate(() => ({ mode: window.__meow.mode, G: { score: Math.round(window.__meow.G.score), time: +window.__meow.G.time.toFixed(1), bells: window.__meow.G.bells.filter(Boolean).length, hits: window.__meow.G.hits, maxMult: window.__meow.G.maxMult, fish: window.__meow.G.fish }, log: window.__log }));
console.log(stage, JSON.stringify(r.G), 'hits', r.log.hits.join(' '), 'falls', r.log.falls, 'respawns', r.log.respawns, 'nearMiss', r.log.nearMiss);
console.log('callouts', [...new Set(r.log.callouts)].join(' | '));
console.log('ERRORS', errs.length, errs.slice(0, 6));
await b.close();
process.exit(errs.length ? 1 : 0);
