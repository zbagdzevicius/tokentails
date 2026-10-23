// CAT-AUDIO actor close-ups: node shots/cat-audio-actors.mjs [w h]
// Each actor (dog in every action, cloud, leaf, grandma sit/wave, yarn) stands on the path facing the camera.
import { chromium } from '@playwright/test';
const W = +(process.argv[2] || 1280), H = +(process.argv[3] || 720);
const tag = W < 600 ? 'm' : 'd';
const args = process.env.MEOW_GPU ? ['--use-angle=metal'] : ['--use-gl=angle', '--enable-unsafe-swiftshader'];
const b = await chromium.launch({ args });
const p = await b.newPage({ viewport: { width: W, height: H } });
const errs = [];
p.on('pageerror', (e) => errs.push(String(e)));
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto(process.env.MEOW_URL || 'http://127.0.0.1:5178/');
await p.waitForTimeout(1500);
await p.evaluate(() => {
  const M = window.__meow;
  M.dev.unlockAll(); M.dev.jump('meadow', 0.05); M.dev.invincible(true);
  const s = document.createElement('style');
  s.textContent = 'body > *:not(canvas){display:none !important}';
  document.head.appendChild(s);
});
await p.waitForTimeout(1000);
await p.evaluate(() => window.__meow.session.pause());
const shots = [
  ['dog-run', 'dog', 'run', 11, 2.2],
  ['dog-bark', 'dog', 'bark', 11, 2.2],
  ['dog-leap', 'dog', 'leap', 11, 2.2],
  ['dog-tumble', 'dog', 'tumble', 11, 1.5],
  ['cloud', 'cloud', 'idle', 5, 0.2],
  ['leaf', 'leaf', 'idle', 3.5, 0.2],
  ['grandma', 'grandma', 'sit', 4, 0.9],
  ['grandma-wave', 'grandma', 'wave', 4, 0.9],
  ['yarn', 'yarn', 'roll', 9, 2],
];
for (const [name, id, action, dist, ly] of shots) {
  await p.evaluate(({ id, action, dist, ly }) => {
    const M = window.__meow;
    const C = window.__catAudio;
    if (window.__act) { C.scene.remove(window.__act.root); window.__act = null; }
    const r = M.actors.get(id).build();
    window.__act = r;
    const w = M.P.world;
    const ax = w.pos.x + w.fwd.x * 8, ay = w.pos.y, az = w.pos.z + w.fwd.z * 8;
    r.root.position.set(ax, ay + (id === 'cloud' ? 1 : 0), az);
    if (id === 'yarn') r.root.scale.setScalar(1.8);
    const ang = 0.5;
    const cx = ax - w.fwd.x * dist * Math.cos(ang) + w.right.x * dist * Math.sin(ang);
    const cz = az - w.fwd.z * dist * Math.cos(ang) + w.right.z * dist * Math.sin(ang);
    r.root.lookAt(cx, ay + (id === 'cloud' ? 1 : 0), cz);
    C.scene.add(r.root);
    let tt = 0;
    M.setCameraOverride((c, dt, t) => {
      tt += 1 / 60;
      r.animate(1 / 60, t, { speed: id === 'grandma' || id === 'cloud' || id === 'leaf' ? 0 : 20, action });
      c.position.set(cx, ay + ly + dist * 0.25, cz);
      c.up.set(0, 1, 0);
      c.lookAt(ax, ay + ly + (id === 'cloud' ? 1 : 0), az);
      if (c.fov !== 45) { c.fov = 45; c.updateProjectionMatrix(); }
    });
  }, { id, action, dist, ly });
  await p.waitForTimeout(action === 'tumble' ? 1200 : 600);
  await p.screenshot({ path: `shots/cat-audio-${tag}-actor-${name}.png` });
}
console.log('ERRORS', errs.length, errs.slice(0, 5));
await b.close();
