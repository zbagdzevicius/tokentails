// Iteration 3 phone layout checks: node shots/iter3-phone.mjs [w h]  (MEOW_URL, default http://127.0.0.1:5180/)
// Title, Trail Maker editor (top and scrolled; tappable palette blocks), photo mode (framing, sticker spawn, export
// size), the clip sheet, the share sheet and a challenge card. Shots: shots/i3p-<w>x<h>-*.png.
import { chromium } from '@playwright/test';

const W = +(process.argv[2] || 390), H = +(process.argv[3] || 844);
const tag = `${W}x${H}`;
const URL = process.env.MEOW_URL || 'http://127.0.0.1:5180/';
const b = await chromium.launch({ args: ['--use-angle=metal'] });
const ctx = await b.newContext({ viewport: { width: W, height: H }, hasTouch: true, isMobile: true, acceptDownloads: true });
const p = await ctx.newPage();
const errs = [];
const fails = [];
p.on('pageerror', (e) => errs.push(String(e).slice(0, 300)));
p.on('console', (m) => m.type() === 'error' && errs.push(m.text().slice(0, 300)));
const S = (n) => p.screenshot({ path: `shots/i3p-${tag}-${n}.png` });
const check = (name, ok, info) => {
  console.log(ok ? 'ok  ' : 'FAIL', name, info === undefined ? '' : JSON.stringify(info));
  if (!ok) fails.push(name);
};
const waitFor = async (fn, ms, arg) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await p.evaluate(fn, arg).catch(() => false)) return true;
    await p.waitForTimeout(120);
  }
  return false;
};
/** how many of the selector's elements are tappable (their centre hit-tests to themselves) */
const tappable = (sel) =>
  p.evaluate((s) => {
    let n = 0;
    const all = [...document.querySelectorAll(s)];
    for (const e of all) {
      const r = e.getBoundingClientRect();
      if (r.width < 2 || r.bottom < 0 || r.top > innerHeight) continue;
      const h = document.elementFromPoint(r.left + r.width / 2, Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2)));
      if (h && (h === e || e.contains(h))) n++;
    }
    return { n, of: all.length };
  }, sel);
const hits = (sel) =>
  p.evaluate((s) => {
    const e = document.querySelector(s);
    if (!e) return false;
    const r = e.getBoundingClientRect();
    const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!h && (h === e || e.contains(h)) && r.bottom <= innerHeight + 1 && r.top >= -1;
  }, sel);

await p.goto(URL);
await p.evaluate(() => localStorage.clear());
await p.reload();
await p.waitForFunction(() => window.__meowUgc?.trails && window.__meowUgc?.photo, null, { timeout: 30000 });
await p.waitForTimeout(1000);
await p.evaluate(() => window.__meow.dev.unlockAll());
await p.evaluate(() => window.__meow.dev.reset?.());
await p.waitForTimeout(600);
await S('title');
const playOk = await hits('#play');
const trailBtn = await p.evaluate(() => {
  const r = document.getElementById('ugcTrails')?.getBoundingClientRect();
  return r ? r.bottom : null;
});
check('title: PLAY and the hub row are on screen', playOk && trailBtn !== null && trailBtn <= H - 4, { trailBtn });

// ------------------------------------------------------------------ Trail Maker
await p.evaluate(() => window.__meowUgc.trails.open());
await p.waitForTimeout(400);
await p.tap('#trailsNew');
await p.waitForTimeout(500);
await S('trails-new');
let t = await tappable('.trails-blk');
check('trails: the first palette row is tappable in the empty editor', t.n >= 3, t);
for (let i = 0; i < 6; i++) {
  const blks = await p.$$('.trails-blk');
  const ok = await tappable('.trails-blk');
  if (!ok.n) break;
  await p.evaluate(() => {
    const all = [...document.querySelectorAll('.trails-blk')];
    const e = all.find((x) => {
      const r = x.getBoundingClientRect();
      const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return h && (h === x || x.contains(h));
    });
    e?.click();
  });
  void blks;
  await p.waitForTimeout(150);
}
await S('trails-built');
for (const sc of [300, 100000]) {
  await p.evaluate((y) => {
    const root = document.getElementById('trails');
    root.scrollTop = y;
    for (const c of document.querySelectorAll('.trails-col')) c.scrollTop = y;
  }, sc);
  await p.waitForTimeout(350);
  await S(`trails-scroll-${sc}`);
  t = await tappable('.trails-blk');
  check(`trails: palette blocks tappable at scroll ${sc}`, t.n >= 4, t);
}
for (const id of ['#trailsName', '#trailsTest', '#trailsRandom', '#trailsBack']) {
  await p.evaluate(() => {
    document.getElementById('trails').scrollTop = 0;
    for (const c of document.querySelectorAll('.trails-col')) c.scrollTop = 0;
  });
  if (id === '#trailsName') await p.evaluate(() => document.querySelector('.trails-setup:not(.open) #trailsSetupBtn')?.click());
  await p.evaluate((s) => document.querySelector(s)?.scrollIntoView({ block: 'center' }), id);
  await p.waitForTimeout(200);
  check(`trails: ${id} reachable`, await hits(id));
}
await p.evaluate(() => window.__meowUgc.trails.close());
await p.waitForTimeout(400);

// ------------------------------------------------------------------ a run: photo mode, clip sheet
await p.evaluate(() => window.__meow.dev.jump('gorge', 0.3));
await waitFor(() => window.__meow.game.mode === 'play', 8000);
await p.evaluate(() => window.__meow.dev.invincible(true));
await p.waitForTimeout(7000);
await p.evaluate(() => window.__meow.session.pause());
await p.waitForTimeout(400);
await p.evaluate(() => window.__meowUgc.photo.open());
await p.waitForTimeout(900);
await S('photo');
const frame = await p.evaluate(() => {
  const P = window.__meow.P.world.pos.clone().addScaledVector(window.__meow.P.world.up, 0.55).project(window.__meow.camera);
  const y = ((1 - P.y) / 2) * innerHeight;
  const x = ((P.x + 1) / 2) * innerWidth;
  const sh = document.querySelector('.photo-shutter').getBoundingClientRect();
  const tray = document.querySelector('.photo-tray').getBoundingClientRect();
  return { x, y, shutterTop: sh.top, shutterLeft: sh.left, trayTop: tray.top, trayLeft: tray.left };
});
const clear = H > W ? frame.y < frame.shutterTop - 30 : frame.x < frame.trayLeft - 40;
check('photo: Mochi framed clear of the shutter and tray', clear, frame);
await p.evaluate(() => window.__meowUgc.photo.setTab('stickers'));
await p.evaluate(() => {
  window.__meowUgc.photo.addSticker('crown');
  window.__meowUgc.photo.addSticker('heart');
  window.__meowUgc.photo.addSticker('star');
});
await p.waitForTimeout(300);
await S('photo-stickers');
const stk = await p.evaluate(() => window.__meowUgc.photo.stickers());
const W0 = W;
check('photo: new stickers are not on her middle', stk.slice(1).every((s) => Math.hypot(s.x * W - frame.x, s.y * H - frame.y) > 50), { stk, frame });
const shot = await p.evaluate(() => window.__meowUgc.photo.shoot());
check('photo: export short edge >= 1080', Math.min(shot.w, shot.h) >= 1076, shot);
await p.waitForTimeout(700);
await S('photo-preview');
check('photo: SHARE visible in the preview', await hits('#photoShare'));
await p.evaluate(() => window.__meowUgc.photo.closePreview());
await p.evaluate(() => window.__meowUgc.photo.close());
await p.waitForTimeout(300);
await p.evaluate(() => window.__meowUgc.share && window.__meowUgc.clip.open());
await p.waitForTimeout(2500);
await S('clip-sheet');
for (const id of ['#clipShare', '#clipClose', '.clip-aspect button.on']) {
  const v = await p.evaluate((s) => {
    const e = document.querySelector(s);
    if (!e || e.closest('.hidden')) return 'hidden';
    const r = e.getBoundingClientRect();
    const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { ok: !!h && (h === e || e.contains(h)) && r.bottom <= innerHeight, h: r.height };
  }, id);
  check(`clip sheet: ${id} usable`, v === 'hidden' || v.ok, v);
}
await p.evaluate(() => window.__meowUgc.clip.close());
await p.waitForTimeout(300);
await p.evaluate(() => window.__meow.session.resume());
await p.evaluate(() => window.__meow.dev.jump('gorge', 0.985));
await waitFor(() => document.body.dataset.screen === 'results', 20000);
await p.waitForTimeout(1500);
await S('results');
await p.evaluate(() => {
  localStorage.setItem('x', '1');
});
await p.tap('#ugcShare');
await p.waitForTimeout(800);
if (await p.$('#shareNameInput')) {
  await p.fill('#shareNameInput', 'Zig');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(1200);
}
await S('share-sheet');
for (const id of ['#shareChallenge', '#shareCard']) {
  const ok = await p.evaluate((s) => {
    const e = document.querySelector(s);
    if (!e || e.classList.contains('hidden')) return 'hidden';
    const r = e.getBoundingClientRect();
    return r.bottom <= innerHeight && r.top >= 0;
  }, id);
  check(`share sheet: ${id} on screen`, ok === true || ok === 'hidden', ok);
}
console.log(errs.length ? `ERRORS ${errs.length}\n${errs.slice(0, 6).join('\n')}` : 'ERRORS 0');
await b.close();
process.exit(errs.length || fails.length ? 1 : 0);
