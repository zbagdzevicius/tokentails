// PHOTO lane shots: node shots/photo-shots.mjs [w h]   (MEOW_URL, default http://127.0.0.1:5182/)
// Both viewports: node shots/photo-shots.mjs && node shots/photo-shots.mjs 390 844
// For each of sunset 0.18 (cloud ride) and gorge 0.3: pause -> PHOTO -> 3/4 front -> every filter (screenshots) ->
// orbit / zoom gestures (real mouse or CDP touch) -> 3 stickers (one dragged) + polaroid -> shoot (PNG size + long
// edge) -> preview (SAVE downloads) -> pose 'wave' (or disabled until the WARDROBE lane lands setPose) -> back ->
// resume: play again, Mochi moves, the camera follows, the canvas filter and pixel ratio are restored.
// Exits 1 on a failed check or a page / console error (errors from another lane's folder are reported only).
import { chromium } from '@playwright/test';

const W = +(process.argv[2] || 1280), H = +(process.argv[3] || 720);
const mobile = W < 600;
const tag = mobile ? 'm' : 'd';
const URL = process.env.MEOW_URL || 'http://127.0.0.1:5182/';
const OTHER_LANES = /src\/(clip|share|style|trails|wardrobe)\//;
let b;
try {
  b = await chromium.launch({ args: ['--use-angle=metal'] });
} catch {
  b = await chromium.launch({ args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
}
const ctx = await b.newContext({ viewport: { width: W, height: H }, hasTouch: mobile, isMobile: mobile, acceptDownloads: true });
const p = await ctx.newPage();
const errs = [];
const foreign = [];
const note = (txt) => (OTHER_LANES.test(txt) ? foreign : errs).push(txt.slice(0, 400));
p.on('pageerror', (e) => note(`${e}\n${e.stack || ''}`));
p.on('console', (m) => { if (m.type() === 'error') note(`${m.text()} @ ${m.location()?.url || ''}`); });
const fails = [];
const check = (name, ok, info) => { console.log(ok ? 'ok  ' : 'FAIL', name, info === undefined ? '' : JSON.stringify(info)); if (!ok) fails.push(name); };
const S = (name) => p.screenshot({ path: `shots/photo-${tag}-${name}.png` });
const click = async (sel) => { if (mobile) await p.tap(sel); else await p.click(sel); await p.waitForTimeout(220); };
const st = () => p.evaluate(() => ({ mode: window.__meow.mode, screen: document.body.dataset.screen, ...window.__meowUgc.photo.state() }));
const waitFor = async (fn, ms, arg) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await p.evaluate(fn, arg).catch(() => false)) return true; await p.waitForTimeout(150); } return false; };
const cdp = mobile ? await ctx.newCDPSession(p) : null;
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i + 1 })) });

async function drag(x0, y0, x1, y1, steps = 8) {
  if (mobile) {
    await touch('touchStart', [[x0, y0]]);
    for (let i = 1; i <= steps; i++) await touch('touchMove', [[x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps]]);
    await touch('touchEnd', []);
  } else {
    await p.mouse.move(x0, y0);
    await p.mouse.down();
    await p.mouse.move(x1, y1, { steps });
    await p.mouse.up();
  }
  await p.waitForTimeout(150);
}
async function pinch(cx, cy, d0, d1, steps = 8) {
  // two fingers spreading horizontally (phones) / the mouse wheel (desktop)
  if (!mobile) {
    await p.mouse.move(cx, cy);
    await p.mouse.wheel(0, d1 > d0 ? -400 : 400);
    await p.waitForTimeout(150);
    return;
  }
  await touch('touchStart', [[cx - d0 / 2, cy], [cx + d0 / 2, cy]]);
  for (let i = 1; i <= steps; i++) {
    const d = d0 + ((d1 - d0) * i) / steps;
    await touch('touchMove', [[cx - d / 2, cy], [cx + d / 2, cy]]);
  }
  await touch('touchEnd', []);
  await p.waitForTimeout(150);
}

await p.goto(URL);
await p.evaluate(() => localStorage.clear());
await p.reload();
await p.waitForFunction(() => window.__meow && window.__meow.dev && window.__meowUgc && window.__meowUgc.photo, null, { timeout: 30000 });
await p.waitForTimeout(1200);
await p.evaluate(() => { window.__meow.dev.unlockAll(); });
// the browser's first user gesture (so audio exists, like a real player)
await click('#play');
await p.evaluate(() => window.__meow.session.quit());

const scenes = [
  ['sunset', 0.18, 'cloud'],
  ['gorge', 0.3, 'gorge'],
];
let first = true;
for (const [stage, at, name] of scenes) {
  console.log('----', stage, at, W, H);
  await p.evaluate(([s, a]) => { window.__meow.dev.invincible(true); window.__meow.dev.jump(s, a); }, [stage, at]);
  if (stage === 'sunset') {
    const ride = await waitFor(() => window.__meow.P.mode === 'ride', 9000);
    console.log('  cloud ride reached:', ride, await p.evaluate(() => window.__meow.P.mode));
    await p.waitForTimeout(500);
  } else await p.waitForTimeout(2500);
  check(`${name}: playing`, (await st()).mode === 'play', await st());
  if (mobile) await click('#pauseBtn');
  else {
    await p.keyboard.press('Escape');
    await p.waitForTimeout(300);
  }
  check(`${name}: paused`, (await st()).screen === 'pause', await st());
  check(`${name}: PHOTO button in the pause card`, await p.isVisible('#ugcPhoto'));
  const canvas0 = await p.evaluate(() => ({ w: document.querySelector('body > canvas').width, filter: document.querySelector('body > canvas').style.filter }));
  const s0 = await p.evaluate(() => window.__meow.P.s);
  await click('#ugcPhoto');
  let s = await st();
  check(`${name}: photo mode open`, s.open && s.screen === 'photo' && s.mode === 'paused', s);
  check(`${name}: starts at the 3/4 front view`, Math.abs(s.yaw - 35) < 1 && Math.abs(s.dist - 4.2) < 0.05, s);
  const camD = await p.evaluate(() => { const m = window.__meow; return m.camera.position.distanceTo(m.P.world.pos); });
  check(`${name}: camera orbits Mochi`, camD > 2.5 && camD < 6, camD);
  await p.waitForTimeout(400);
  check(`${name}: still paused, Mochi frozen`, (await p.evaluate(() => window.__meow.P.s)) === s0);

  await p.evaluate(() => window.__meowUgc.photo.clearStickers());
  // filters
  await click('#photoTab-filter');
  for (const f of ['none', 'warm', 'noir', 'dreamy', 'pixel']) {
    await click(`#photoFilter-${f}`);
    await p.waitForTimeout(250);
    const live = await p.evaluate(() => ({ filter: document.querySelector('body > canvas').style.filter, w: document.querySelector('body > canvas').width }));
    if (f === 'pixel') check(`${name}: pixel lowers the pixel ratio`, live.w < canvas0.w * 0.4, live);
    if (f === 'noir') check(`${name}: noir css filter`, live.filter.includes('grayscale'), live);
    await S(`${name}-filter-${f}`);
  }
  await click('#photoFilter-none');
  check(`${name}: pixel ratio restored after PIXEL`, (await p.evaluate(() => document.querySelector('body > canvas').width)) === canvas0.w);

  // camera gestures
  await click('#photoTab-camera');
  let a = await st();
  await drag(W * 0.5, H * 0.35, W * 0.5 + 120, H * 0.35 + 40);
  let b2 = await st();
  check(`${name}: drag orbits`, Math.abs(b2.yaw - a.yaw) > 20 && b2.pitch > a.pitch, { a: [a.yaw, a.pitch], b: [b2.yaw, b2.pitch] });
  await pinch(W * 0.5, H * 0.35, 80, 220);
  const c = await st();
  check(`${name}: pinch / wheel zooms in`, c.dist < b2.dist - 0.2, { before: b2.dist, after: c.dist });
  await click('#photoView-low');
  await p.waitForTimeout(700);
  await S(`${name}-view-low`);
  await click('#photoView-hero');
  await p.waitForTimeout(700);
  s = await st();
  check(`${name}: HERO preset back at the 3/4 front`, Math.abs(s.yaw - 35) < 2 && Math.abs(s.dist - 4.2) < 0.15, s);
  const above = await p.evaluate(() => { const m = window.__meow; const f = m.P.world; return m.camera.position.clone().sub(f.pos).dot(f.up); });
  check(`${name}: camera above the ground`, above > 0.2, above);

  // stickers + polaroid
  await p.evaluate(() => window.__meowUgc.photo.clearStickers());
  await click('#photoTab-stickers');
  for (const id of ['heart', 'meow', 'crown']) await click(`#photoSticker-${id}`);
  s = await st();
  check(`${name}: 3 stickers`, s.stickers === 3, s);
  const box = await p.locator('.photo-stk.sel').boundingBox();
  if (box) await drag(box.x + box.width / 2, box.y + box.height / 2, box.x + box.width / 2 - W * 0.18, box.y + box.height / 2 - H * 0.12);
  const box2 = await p.locator('.photo-stk.sel').boundingBox();
  check(`${name}: sticker drags`, box && box2 && box2.x < box.x - 20, { box, box2 });
  await click('#photoStkBigger');
  await click('#photoStkRotR');
  await click('#photoTab-frame');
  await click('#photoFrame-polaroid');
  await click('#photoTab-filter');
  await click('#photoFilter-warm');
  await S(`${name}-composed`);

  // shutter: the real button the first time (preview + SAVE download), the test hook for the numbers
  const photos0 = await p.evaluate(() => window.__meow.dev.save().ugcStats.photos);
  if (first) {
    await click('.photo-shutter');
    check('shutter opens the preview', await waitFor(() => !!document.querySelector('.photo-preview img'), 5000));
    const dl = p.waitForEvent('download', { timeout: 5000 }).catch(() => null);
    await click('#photoSave');
    const d = await dl;
    check('SAVE downloads a PNG', !!d && /^meowrun-photo-.*\.png$/.test(d.suggestedFilename()), d && d.suggestedFilename());
    await click('#photoPreviewBack');
    check('preview closes', !(await p.isVisible('.photo-preview')));
  }
  const shot = await p.evaluate(() => window.__meowUgc.photo.shoot());
  const longEdge = Math.max(shot.w, shot.h);
  check(`${name}: PNG > 30 KB`, shot.size > 30 * 1024, shot);
  check(`${name}: long edge >= ${mobile ? 780 : 1080}`, longEdge >= (mobile ? 780 : 1080) && longEdge <= 2048, shot);
  await p.waitForTimeout(700);
  await S(`${name}-preview`);
  const photos1 = await p.evaluate(() => window.__meow.dev.save().ugcStats.photos);
  check(`${name}: ugcStats.photos counts`, photos1 === photos0 + (first ? 2 : 1), { photos0, photos1 });
  check(`${name}: pixel ratio restored after the shot`, (await p.evaluate(() => document.querySelector('body > canvas').width)) === canvas0.w);
  await click('#photoPreviewBack');

  // poses
  await click('#photoTab-pose');
  const poseable = (await st()).poseable;
  const disabled = await p.evaluate(() => document.getElementById('photoPose-wave').disabled);
  if (poseable) {
    await click('#photoPose-wave');
    await p.waitForTimeout(1300);
    check(`${name}: pose wave`, (await st()).pose === 'wave', await st());
  } else check(`${name}: pose buttons disabled until the cat can pose`, disabled === true);
  await S(`${name}-pose-wave`);

  // hide UI, then back
  await click('.photo-eye');
  await S(`${name}-clean`);
  await click('.photo-eye');
  await click('.photo-back');
  s = await st();
  check(`${name}: back to the pause card`, !s.open && s.screen === 'pause' && s.mode === 'paused', s);
  const canvas1 = await p.evaluate(() => ({ w: document.querySelector('body > canvas').width, filter: document.querySelector('body > canvas').style.filter }));
  check(`${name}: canvas restored`, canvas1.w === canvas0.w && canvas1.filter === canvas0.filter, { canvas0, canvas1 });
  await click('#pauseResume');
  await p.waitForTimeout(400);
  const r0 = await p.evaluate(() => window.__meow.P.s);
  await p.waitForTimeout(600);
  const r1 = await p.evaluate(() => ({ s: window.__meow.P.s, mode: window.__meow.mode, d: window.__meow.camera.position.distanceTo(window.__meow.P.world.pos) }));
  check(`${name}: resumed and running`, r1.mode === 'play' && r1.s > r0 + 1, { r0, r1 });
  check(`${name}: the game camera follows again`, r1.d < 14, r1.d);
  await S(`${name}-resumed`);
  first = false;
}

// Esc leaves photo mode (desktop) / the pause card's PHOTO hides outside pause
if (!mobile) {
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);
  await click('#ugcPhoto');
  await p.keyboard.press('Escape');
  await p.waitForTimeout(200);
  const s = await st();
  check('Esc leaves photo mode to the pause card', !s.open && s.screen === 'pause', s);
  await click('#pauseResume');
}
check('openPhoto outside pause does nothing', await p.evaluate(() => { window.__meowUgc.photo.open(); return !window.__meowUgc.photo.state().open; }));

if (foreign.length) console.log('OTHER-LANE ERRORS (reported, not failed):\n  ' + foreign.join('\n  '));
console.log('ERRORS', errs.length, errs.slice(0, 8));
await b.close();
if (errs.length || fails.length) {
  console.log('PHOTO SHOTS FAIL', fails);
  process.exit(1);
}
console.log('PHOTO SHOTS OK', W, H);
