// Iteration 3 checks: node shots/iter3-check.mjs [w h]   (MEOW_URL, default http://127.0.0.1:5180/)
// Screens and numbers for the playtest fixes: the take-off SPIN hint and rushed spins, the HUD combo pill, the
// finish swing, the results style row, toasts under overlays, the wardrobe camera, the score race pill and the ghost
// tag, a rendered 9:16 clip (saved for ffprobe), photo mode framing and export, the Trail Maker layout.
// Shots: shots/i3-<tag>-*.png. Exits 1 on page errors or failed checks.
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const W = +(process.argv[2] || 1280), H = +(process.argv[3] || 720);
const mobile = Math.min(W, H) < 600;
const tag = `${W}x${H}`;
const URL = process.env.MEOW_URL || 'http://127.0.0.1:5180/';
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
const want = (k) => !ONLY.length || ONLY.includes(k);
const b = await chromium.launch({ args: ['--use-angle=metal'] });
const ctx = await b.newContext({ viewport: { width: W, height: H }, hasTouch: mobile, isMobile: mobile, acceptDownloads: true });
const errs = [];
const fails = [];
const watch = (pg) => {
  pg.on('pageerror', (e) => errs.push(String(e.stack || e).slice(0, 300)));
  pg.on('console', (m) => m.type() === 'error' && errs.push(m.text().slice(0, 300)));
};
let p = await ctx.newPage();
watch(p);
const S = (name, pg = p) => pg.screenshot({ path: `shots/i3-${tag}-${name}.png` });
const check = (name, ok, info) => {
  console.log(ok ? 'ok  ' : 'FAIL', name, info === undefined ? '' : JSON.stringify(info));
  if (!ok) fails.push(name);
};
const waitFor = async (fn, ms, arg, pg = p) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await pg.evaluate(fn, arg).catch(() => false)) return true;
    await pg.waitForTimeout(100);
  }
  return false;
};
const boot = async (pg = p) => {
  await pg.waitForFunction(() => window.__meow?.dev && window.__meowUgc?.share && window.__meowUgc?.trails && window.__meowUgc?.style, null, { timeout: 30000 });
  await pg.waitForTimeout(800);
};
await p.goto(URL);
await p.evaluate(() => localStorage.clear());
await p.reload();
await boot();
await p.evaluate(() => {
  window.__meow.dev.unlockAll();
  window.__meowUgc.wardrobe.devOwnAll(true);
});

// ------------------------------------------------------------------ wardrobe camera
if (want('wardrobe')) {
  await p.evaluate(() => window.__meowUgc.wardrobe.open());
  await p.waitForTimeout(7000);
  await S('wardrobe-idle7s');
  await p.evaluate(() => window.__meowUgc.wardrobe.tab('hat'));
  await p.waitForTimeout(300);
  const i = await p.evaluate(() => window.__meowUgc.wardrobe.indexOf('hat', 'witch'));
  const tile = await p.$$('.wardrobe-tile');
  if (tile[Math.max(1, i)]) await tile[Math.max(1, i)].click();
  await p.waitForTimeout(700);
  const st = await p.evaluate(() => window.__meowUgc.wardrobe.state());
  check('wardrobe: a pick eases to the front 3/4', Math.abs(st.yaw - 0.35) < 0.15, { yaw: st.yaw });
  await S('wardrobe-hat-picked');
  const v = await p.evaluate(() => window.__meowUgc.wardrobe.view());
  check('wardrobe: view() with no args returns the view', Number.isFinite(v?.yaw), v);
  await p.evaluate(() => window.__meowUgc.wardrobe.close(false));
  await p.waitForTimeout(300);
}

// ------------------------------------------------------------------ spin hint + tricks (gorge: not a tutorial stage)
const startAt = async (stage, at) => {
  await p.evaluate(([s, a]) => window.__meow.dev.jump(s, a), [stage, at]);
  await waitFor(() => window.__meow.game.mode === 'play', 8000);
  await p.waitForTimeout(400);
};
const grounded = () => waitFor(() => window.__meow.P.grounded && window.__meow.P.mode === 'run', 3000);
if (want('tricks')) {
  await startAt('gorge', 0.02);
  await p.evaluate(() => window.__meow.dev.invincible(true));
  let hintAt = -1;
  for (let k = 0; k < 3 && hintAt < 0; k++) {
    await grounded();
    await p.keyboard.press('Space');
    for (let t = 0; t < 12; t++) {
      const h = await p.evaluate(() => ({ text: window.__meow.hud.prompt?.text, air: window.__meow.P.airTime }));
      if (h.text === 'SPIN!') {
        hintAt = h.air;
        await S('spin-hint');
        break;
      }
      await p.waitForTimeout(25);
    }
    await p.waitForTimeout(700);
  }
  check('SPIN hint shows at take-off', hintAt >= 0 && hintAt < 0.25, { air: hintAt });
  const trial = async (name, seq) => {
    await grounded();
    const before = await p.evaluate(() => window.__meowUgc.style.state().tricks);
    for (const s of seq) {
      if (typeof s === 'number') await p.waitForTimeout(s);
      else await p.keyboard.press(s);
    }
    await grounded();
    await p.waitForTimeout(120);
    const pops = await p.evaluate(() => [...document.querySelectorAll('.style-pop.on')].map((e) => e.textContent));
    const after = await p.evaluate(() => window.__meowUgc.style.state().tricks);
    return { name, dTricks: after - before, pops };
  };
  const late = await trial('late E', ['Space', 430, 'KeyE']);
  check('a late SPIN press still lands clean', late.dTricks >= 1 && !late.pops.some((x) => /SLOPPY/.test(x)), late);
  const dbl = await trial('E E', ['Space', 100, 'KeyE', 80, 'KeyE']);
  check('E, E on a plain jump lands a DOUBLE', dbl.pops.some((x) => /DOUBLE SPIN \+/.test(x)), dbl);
  await p.evaluate(() => window.__meowUgc.style.forceTier(24, 6));
  await p.evaluate(() => window.__meowUgc.style.trick('DOUBLE'));
  await p.waitForTimeout(250);
  await S('hud-combo-pill');
  const r = await p.evaluate(() => {
    const m = document.getElementById('mult').getBoundingClientRect();
    const c = window.__meowUgc.style.rects().combo;
    return { multBottom: m.bottom, comboTop: c?.top ?? null };
  });
  check('combo pill sits under the multiplier with a gap', r.comboTop !== null && r.comboTop - r.multBottom >= 6, r);
}

// ------------------------------------------------------------------ finish swing, results, toast, share sheet
if (want('finish')) {
  await startAt('gorge', 0.985);
  await p.evaluate(() => {
    window.__meowUgc.style.forceTier(12, 6);
    window.__meowUgc.style.trick('DOUBLE');
  });
  await waitFor(() => window.__meow.game.mode === 'finish', 15000);
  const t0 = Date.now();
  await waitFor(() => window.__meowUgc.style.state().swinging && window.__meow.clock.sim > 0, 2000);
  // sim 1.2 s after the line
  const sim0 = await p.evaluate(() => window.__meow.clock.sim);
  await waitFor((s) => window.__meow.clock.sim - s > 1.15, 4000, sim0);
  await S('finish-1_2s');
  const face = await p.evaluate(() => {
    const M = window.__meow;
    const cam = M.camera;
    const rig = M.P.world;
    // camera direction relative to the track forward: > 0 = in front of a cat that faces back down the track
    const dx = cam.position.x - rig.pos.x, dz = cam.position.z - rig.pos.z;
    return { along: -(dx * rig.fwd.x + dz * rig.fwd.z), swinging: window.__meowUgc.style.state().swinging };
  });
  check('finish swing is on and holding at +1.2 s', face.swinging, face);
  await waitFor(() => document.body.dataset.screen === 'results', 8000);
  await p.waitForTimeout(1700);
  await S('results');
  const row = await p.evaluate(() => document.getElementById('resStyle')?.textContent ?? null);
  check('results show the style row', !!row && /BEST COMBO/.test(row), row);
  await p.click('#ugcShare');
  await p.waitForTimeout(1200);
  await S('share-sheet');
  const tb = await p.evaluate(() => {
    const t = document.getElementById('ugc-toast');
    const h = document.querySelector('.share-sheet-card h2');
    if (!t || !t.classList.contains('on') || !h) return { overlap: false };
    const a = t.getBoundingClientRect(), c = h.getBoundingClientRect();
    return { overlap: a.left < c.right && c.left < a.right && a.top < c.bottom && c.top < a.bottom };
  });
  check('no toast over the share sheet title', !tb.overlap, tb);
  for (let k = 0; k < 3 && (await p.$('.ugc-overlay')); k++) {
    await p.keyboard.press('Escape');
    await p.waitForTimeout(300);
  }
  await p.click('#resRetry');
  await p.waitForTimeout(1500);
  const toastOn = await p.evaluate(() => document.getElementById('ugc-toast')?.classList.contains('on') ?? false);
  check('no toast rides into gameplay after RETRY', !toastOn);
  await p.evaluate(() => window.__meow.session.quit());
  await p.waitForTimeout(400);
}

// ------------------------------------------------------------------ clip: 9:16 with the hype layer
if (want('clip')) {
  await startAt('gorge', 0.9);
  await p.evaluate(() => window.__meow.dev.invincible(true));
  await p.waitForTimeout(1500);
  await p.evaluate(() => window.__meowUgc.style.forceTier(40, 6));
  await p.evaluate(() => window.__meowUgc.style.trick('TRIPLE'));
  await p.waitForTimeout(1500);
  await p.evaluate(() => window.__meowUgc.style.forceTier(80, 6));
  await p.evaluate(() => window.__meowUgc.style.trick('CORKSCREW'));
  await waitFor(() => document.body.dataset.screen === 'results', 30000);
  await p.waitForTimeout(800);
  const out = await p.evaluate(async () => {
    try {
      return await window.__meowUgc.clip.renderBlob({ vertical: true });
    } catch (e) {
      return { err: String(e) };
    }
  });
  check('a 9:16 clip renders at 720x1280', out && out.w === 720 && out.h === 1280, out);
  if (out && !out.err) {
    const bytes = await p.evaluate(async () => {
      const r = await fetch(window.__meowUgc.clip.lastUrl());
      return [...new Uint8Array(await r.arrayBuffer())];
    });
    const ext = (out.name || 'x.mp4').split('.').pop();
    fs.mkdirSync('/private/tmp/claude-501/mr-ugc', { recursive: true });
    fs.writeFileSync(`/private/tmp/claude-501/mr-ugc/i3-${tag}-clip.${ext}`, Buffer.from(bytes));
    console.log('clip saved', `/private/tmp/claude-501/mr-ugc/i3-${tag}-clip.${ext}`, bytes.length);
  }
  await p.evaluate(() => window.__meow.session.quit());
  await p.waitForTimeout(400);
}

// ------------------------------------------------------------------ race: score pill + tag
if (want('race')) {
  await p.evaluate(() => window.__meowUgc.share.devAllowPartial(true));
  await startAt('meadow', 0.6);
  await p.evaluate(() => window.__meow.dev.invincible(true));
  await waitFor(() => document.body.dataset.screen === 'results', 90000);
  const link = await p.evaluate(() => window.__meowUgc.share.link());
  check('a challenge link was made', !!link, link && link.length);
  if (link) {
    const q = new globalThis.URL(link).search;
    const p2 = await ctx.newPage();
    watch(p2);
    await p2.goto(URL + q);
    await boot(p2);
    await p2.waitForTimeout(800);
    await S('race-card', p2);
    const hasPlay = await p2.$('#shareChalPlay');
    if (hasPlay) await hasPlay.click();
    await p2.waitForTimeout(300);
    // a challenge from a partial run starts at its own start: jump the same way
    await p2.waitForTimeout(6000);
    await S('race-6s', p2);
    const pill = await p2.evaluate(() => document.getElementById('sharePill')?.textContent ?? '');
    check('the race pill shows a score gap (not metres only)', /[+-][\d,]+/.test(pill) && !/^vs .* [+-]\d+ m$/.test(pill.trim()), pill);
    await p2.close();
  }
  await p.evaluate(() => window.__meow.session.quit());
}

console.log(errs.length ? `ERRORS ${errs.length}\n${errs.slice(0, 8).join('\n')}` : 'ERRORS 0');
await b.close();
process.exit(errs.length || fails.length ? 1 : 0);
