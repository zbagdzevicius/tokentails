// WORLD-ART look check: node shots/world-art-shots.mjs [w h] [stage:t:waitMs ...]
// Jumps into stages with dev.jump (invincible, a steering bot), screenshots each spot, reports chunk build times,
// fps and any page or console errors. Screenshots: shots/world-art-<tag>-NN-<stage>-<t>.png
import { chromium } from '@playwright/test';
const W = +(process.argv[2] || 1280), H = +(process.argv[3] || 720);
const mobile = W < 600;
const tag = mobile ? 'm' : 'd';
const URL = process.env.MEOW_URL || 'http://127.0.0.1:5178/';
const spots = process.argv.slice(4).length ? process.argv.slice(4) : ['title', 'meadow:0:2500', 'meadow:0.35:2500', 'meadow:0.6:2500', 'gorge:0.2:2500', 'gorge:0.45:2500', 'sunset:0.15:2500', 'sunset:0.97:3500', 'endless:0:3000'];
const args = process.env.MEOW_GPU ? ['--use-angle=metal'] : ['--use-gl=angle', '--enable-unsafe-swiftshader'];
const b = await chromium.launch({ args });
const p = await b.newPage({ viewport: { width: W, height: H }, hasTouch: mobile, isMobile: mobile });
const errs = [];
p.on('pageerror', (e) => errs.push(String(e)));
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto(URL);
await p.waitForTimeout(2500);
await p.evaluate(() => {
  const M = window.__meow;
  window.__build = [];
  for (const id of ['meadow', 'gorge', 'sunset']) {
    const th = M.themes.get(id);
    const orig = th.buildChunk.bind(th);
    th.buildChunk = (ctx, s0, s1) => { const t0 = performance.now(); const o = orig(ctx, s0, s1); window.__build.push(performance.now() - t0); return o; };
  }
  M.dev.unlockAll();
  window.__fps = { n: 0, t: 0 };
  let last = performance.now();
  const tick = (now) => { window.__fps.n++; window.__fps.t += now - last; last = now; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  // steer gently toward the centre and through hazards (invincible anyway)
  window.__bot = setInterval(() => {
    if (M.mode !== 'play') return;
    M.input.botSteer = Math.max(-1, Math.min(1, -M.P.x * 0.3));
    if (M.hud.prompt && M.hud.prompt.action === 'ability') M.press('ability');
  }, 50);
});
let n = 0;
for (const spot of spots) {
  if (spot.startsWith('look:')) {
    // look:stage:kind:index:back:height:ahead  -> fixed camera at (segment start - back) looking ahead
    const [, stage, kind, idx = '0', back = '14', hgt = '4', ahead = '20'] = spot.split(':');
    await p.evaluate(([st]) => { window.__meow.dev.invincible(true); window.__meow.dev.jump(st, 0); window.__meow.dev.invincible(true); }, [stage]);
    await p.waitForTimeout(400);
    const ok = await p.evaluate(([kind, idx]) => {
      const M = window.__meow;
      const seg = kind === 'finish' ? { s0: M.G.finishS + +idx } : M.game.track.segments.filter((g) => g.kind === kind)[+idx];
      if (!seg) return false;
      window.__lookS = seg.s0;
      M.P.s = Math.max(0, seg.s0 - 30);
      M.P.x = 0;
      return true;
    }, [kind, idx]);
    if (!ok) { console.log(spot, 'no such segment'); continue; }
    await p.waitForTimeout(1600);
    await p.evaluate(([back, hgt, ahead]) => {
      const M = window.__meow;
      const t = M.game.track;
      M.setCameraOverride((cam) => {
        const s = window.__lookS;
        t.toWorld(s - back, 0, hgt, cam.position);
        const v = cam.position.clone();
        t.toWorld(s + ahead, 0, 0, v);
        cam.up.set(0, 1, 0);
        cam.lookAt(v);
      });
    }, [+back, +hgt, +ahead]);
    await p.waitForTimeout(500);
    await p.screenshot({ path: `shots/world-art-${tag}-${String(++n).padStart(2, '0')}-look-${stage}-${kind}${idx}.png` });
    await p.evaluate(() => window.__meow.setCameraOverride(null));
    continue;
  }
  if (spot.startsWith('q:')) {
    await p.evaluate((q) => window.__meow.quality.set(q), spot.slice(2));
    await p.waitForTimeout(600);
    console.log(spot, await p.evaluate(() => window.__meow.quality.get()));
    continue;
  }
  if (spot.startsWith('at:')) {
    // at:stage:kind:index:ds[:wait]  -> put the kitten at segment start + ds (or ds from the end if 'end'), normal camera
    const [, stage, kind, idx = '0', ds = '10', wait = '700'] = spot.split(':');
    await p.evaluate(([st]) => { window.__meow.dev.invincible(true); window.__meow.dev.jump(st, 0); window.__meow.dev.invincible(true); }, [stage]);
    await p.waitForTimeout(300);
    const ok = await p.evaluate(([kind, idx, ds]) => {
      const M = window.__meow;
      const t = M.game.track;
      const s = kind === 'finish' ? M.G.finishS + +ds : (() => { const seg = t.segments.filter((g) => g.kind === kind)[+idx]; return seg ? seg.s0 + +ds : null; })();
      if (s === null) return false;
      M.P.s = Math.max(0, s - 60);
      M.P.x = 0;
      window.__atS = s;
      return true;
    }, [kind, idx, ds]);
    if (!ok) { console.log(spot, 'no such segment'); continue; }
    await p.waitForTimeout(1500);
    await p.evaluate(() => { const M = window.__meow; M.P.s = window.__atS - M.P.speed * 0.7; });
    await p.waitForTimeout(+wait);
    const info = await p.evaluate(() => ({ s: Math.round(window.__meow.P.s), kind: window.__meow.game.track.kindAt(window.__meow.P.s), mode: window.__meow.mode }));
    console.log(spot, JSON.stringify(info));
    await p.screenshot({ path: `shots/world-art-${tag}-${String(++n).padStart(2, '0')}-at-${stage}-${kind}${idx}.png` });
    continue;
  }
  const [stage, at, wait] = spot.split(':');
  if (stage === 'title') {
    await p.screenshot({ path: `shots/world-art-${tag}-${String(++n).padStart(2, '0')}-title.png` });
    continue;
  }
  await p.evaluate(([st, a]) => { window.__meow.dev.invincible(true); window.__meow.dev.jump(st, +a); window.__meow.dev.invincible(true); }, [stage, at]);
  await p.evaluate(() => { window.__fps = { n: 0, t: 0 }; });
  await p.waitForTimeout(+(wait || 2500));
  const info = await p.evaluate(() => ({ s: Math.round(window.__meow.P.s), kind: window.__meow.game.track.kindAt(window.__meow.P.s), mode: window.__meow.mode, fps: Math.round((window.__fps.n * 1000) / Math.max(1, window.__fps.t)), q: window.__meow.quality.get() }));
  console.log(spot, JSON.stringify(info));
  await p.screenshot({ path: `shots/world-art-${tag}-${String(++n).padStart(2, '0')}-${stage}-${at}.png` });
}
const bt = await p.evaluate(() => (window.__build || []).slice().sort((a, b) => a - b));
console.log('chunks built', bt.length, 'median ms', bt[Math.floor(bt.length / 2)]?.toFixed(2), 'p90', bt[Math.floor(bt.length * 0.9)]?.toFixed(2), 'max', bt[bt.length - 1]?.toFixed(2));
console.log('ERRORS', errs.length, errs.slice(0, 8));
await b.close();
process.exit(errs.length ? 1 : 0);
