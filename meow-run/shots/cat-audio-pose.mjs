// CAT-AUDIO pose gallery: node shots/cat-audio-pose.mjs [w h] [filter]
// Starts a stage, pauses it, hides the UI, takes over the camera for close-ups and forces the PlayerView fields
// for every pose (run, jump, pounce, slide, vault pole, wall claws, cloud, leaf surf, hit, wet, victory), then
// shows the actors (dog, cloud, leaf, grandma, yarn) next to the path.
import { chromium } from '@playwright/test';
const W = +(process.argv[2] || 1280), H = +(process.argv[3] || 720);
const filter = process.argv[4] || '';
const tag = W < 600 ? 'm' : 'd';
const URL = process.env.MEOW_URL || 'http://127.0.0.1:5178/';
const args = process.env.MEOW_GPU ? ['--use-angle=metal'] : ['--use-gl=angle', '--enable-unsafe-swiftshader'];
const b = await chromium.launch({ args });
const p = await b.newPage({ viewport: { width: W, height: H } });
const errs = [];
p.on('pageerror', (e) => errs.push(String(e)));
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto(URL);
await p.waitForTimeout(1500);
await p.evaluate(() => { window.__meow.dev.unlockAll(); window.__meow.dev.jump('meadow', 0.05); window.__meow.dev.invincible(true); });
await p.waitForTimeout(1200);
await p.evaluate(() => {
  const s = document.createElement('style');
  s.textContent = 'body > *:not(canvas){display:none !important}';
  document.head.appendChild(s);
  window.__meow.session.pause();
});
const shot = async (name, setup, cam = { a: 0.6, d: 3.2, h: 1.2 }) => {
  if (filter && !name.includes(filter)) return;
  await p.evaluate(({ src, cam }) => {
    const M = window.__meow;
    const P = M.P;
    Object.assign(P, { grounded: true, sliding: false, vy: 0, y: 0, ability: null, abilityT: 0, mode: 'run', surface: 'ground', sinceHit: 99, sincePounce: 99, sinceLand: 99, wet: 0, lean: 0, speed: 22, invuln: 0 });
    new Function('M', 'P', src)(M, P);
    M.setCameraOverride((c) => {
      const w = P.world;
      const ca = Math.cos(cam.a), sa = Math.sin(cam.a);
      c.position.set(
        w.pos.x + w.fwd.x * ca * cam.d + w.right.x * sa * cam.d + w.up.x * cam.h,
        w.pos.y + w.fwd.y * ca * cam.d + w.right.y * sa * cam.d + w.up.y * cam.h,
        w.pos.z + w.fwd.z * ca * cam.d + w.right.z * sa * cam.d + w.up.z * cam.h,
      );
      c.up.set(0, 1, 0);
      c.lookAt(w.pos.x + w.up.x * (cam.ly ?? 0.5), w.pos.y + w.up.y * (cam.ly ?? 0.5), w.pos.z + w.up.z * (cam.ly ?? 0.5));
      if (c.fov !== 40) { c.fov = 40; c.updateProjectionMatrix(); }
    });
  }, { src: setup, cam });
  await p.waitForTimeout(700);
  await p.screenshot({ path: `shots/cat-audio-${tag}-${name}.png` });
};
await shot('front', '');
await shot('back', '', { a: Math.PI, d: 3.4, h: 1.3 });
await shot('side', '', { a: Math.PI / 2, d: 3, h: 0.8 });
await shot('jump', 'P.grounded=false; P.vy=12; P.y=1.5;', { a: 2.4, d: 3.4, h: 1 });
await shot('fall', 'P.grounded=false; P.vy=-14; P.y=1.2;', { a: 2.0, d: 3.4, h: 1 });
await shot('slide', 'P.sliding=true;', { a: 2.2, d: 3, h: 0.8 });
await shot('wall', 'P.surface="wall";', { a: 2.2, d: 3, h: 0.8 });
await shot('cloud', 'P.ability="cloud"; P.base=0; P.mode="ride"; P.surface="cloud";', { a: 0.9, d: 4.5, h: 1.6 });
await shot('surf', 'P.surface="river";', { a: 2.4, d: 3.6, h: 1.4 });
await shot('hit', 'P.sinceHit=0.25;', { a: 0.5, d: 3, h: 1 });
await shot('wet', 'P.wet=1;', { a: 0.5, d: 3, h: 1 });
await shot('victory', 'P.mode="finish"; P.speed=0;', { a: Math.PI, d: 3.4, h: 1.2 });
await shot('vault', 'P.mode="arc"; P.ability="vault"; P.arc.s0=P.s-4; P.abilityT=0.25; P.y=2.5; P.grounded=false;', { a: 1.9, d: 7, h: 1.5, ly: 1 });
// actors
await shot('actors', `
  window.__actorObjs?.forEach((o) => o.parent.remove(o));
  window.__actorObjs = [];
  const ids = ['dog', 'cloud', 'leaf', 'grandma', 'yarn'];
  const xs = [5, -3, -1.5, 2, -6];
  ids.forEach((id, i) => {
    const r = M.actors.get(id).build();
    const w = P.world;
    r.root.position.set(w.pos.x - w.right.x * xs[i] + w.fwd.x * 6, w.pos.y + (id === 'cloud' ? 1 : 0), w.pos.z - w.right.z * xs[i] + w.fwd.z * 6);
    r.root.lookAt(r.root.position.x - w.fwd.x, r.root.position.y, r.root.position.z - w.fwd.z);
    if (id === 'yarn') r.root.scale.setScalar(1.6);
    window.__actorObjs.push(r.root);
    r.animate(0.016, 1, { speed: 20, action: id === 'grandma' ? 'wave' : 'run' });
    window.__catAudio.scene.add(r.root);
  });
`, { a: 0.05, d: 16, h: 3, ly: 1.2 });
console.log('ERRORS', errs.length, errs.slice(0, 5));
await b.close();
