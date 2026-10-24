// WARDROBE lane shots: node shots/wardrobe-shots.mjs [w h]   (MEOW_URL, default http://127.0.0.1:5184/)
// title -> WARDROBE (screenshot) -> devOwnAll -> every tab -> equip galaxy fur + golden crown + hero cape + rainbow
// ribbon -> DONE -> title mascot + attract runner -> meadow from behind (crown + cape) -> sunset finish: the cottage
// cutscene + the results portrait -> reload (the look persists) -> a ghost kitten beside Mochi -> fps at LOW with the
// full look vs the classic look. Exits 1 on a failed check or a page / console error (errors from another lane's
// folder are reported, not failed, while the lanes work in parallel).
import { chromium } from '@playwright/test';

const W = +(process.argv[2] || 1280), H = +(process.argv[3] || 720);
const mobile = W < 600;
const tag = mobile ? 'm' : 'd';
const URL = process.env.MEOW_URL || 'http://127.0.0.1:5184/';
const FILTER = process.env.ONLY || '';
let b;
try {
  b = await chromium.launch({ args: ['--use-angle=metal'] });
} catch {
  b = await chromium.launch({ args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
}
const ctx = await b.newContext({ viewport: { width: W, height: H }, hasTouch: mobile, isMobile: mobile, deviceScaleFactor: mobile ? 2 : 1 });
const p = await ctx.newPage();
const errs = [];
const foreign = [];
const OTHER = /\/src\/(clip|photo|share|style|trails|stages|setpieces|juice)\//;
const note = (msg, where) => (OTHER.test(where || msg) && !/\/src\/(wardrobe|cat)\/|portrait/.test(where || msg) ? foreign : errs).push(msg);
p.on('pageerror', (e) => note(String(e), e.stack || ''));
p.on('console', (m) => {
  if (m.type() === 'error') note(m.text(), m.location()?.url || '');
});
const fails = [];
const check = (name, ok, info) => {
  console.log(ok ? 'ok  ' : 'FAIL', name, info === undefined ? '' : JSON.stringify(info));
  if (!ok) fails.push(name);
};
let n = 0;
const S = (name) => p.screenshot({ path: `shots/wardrobe-${tag}-${String(++n).padStart(2, '0')}-${name}.png` });
const tap = async (sel) => {
  if (mobile) await p.tap(sel);
  else await p.click(sel);
  await p.waitForTimeout(250);
};
const W8 = (ms) => p.waitForTimeout(ms);
const hook = (fn, arg) => p.evaluate(fn, arg);
const boot = async () => {
  await p.waitForFunction(() => window.__meow?.dev && window.__meowUgc?.wardrobe, null, { timeout: 30000 });
  await W8(1200);
};
/** a screenshot of an element's box (animated elements never settle for locator.screenshot) */
const clipShot = async (sel, name, pad = 0) => {
  const r = await p.locator(sel).boundingBox();
  if (!r) return;
  const x = Math.max(0, r.x - pad), y = Math.max(0, r.y - pad);
  await p.screenshot({ path: `shots/wardrobe-${tag}-${String(++n).padStart(2, '0')}-${name}.png`, clip: { x, y, width: Math.min(W - x, r.width + pad * 2), height: Math.min(H - y, r.height + pad * 2) } });
};
const want = (s) => !FILTER || FILTER.split(',').includes(s);

await p.goto(URL);
await p.evaluate(() => localStorage.clear());
await p.reload();
await boot();

// ------------------------------------------------------------------ 1. title + wardrobe
if (want('open')) {
  check('title button exists', await p.locator('#ugcWardrobe').isVisible());
  const badge = await p.locator('#ugcWardrobe .ugc-badge').textContent();
  check('fresh save: NEW badge counts the free items', Number(badge) >= 6, badge);
  check('title runner built', !!(await hook(() => window.__meowUgc.wardrobe.runner())));
  await S('title');
  await tap('#ugcWardrobe');
  await W8(900);
  const st = await hook(() => window.__meowUgc.wardrobe.state());
  check('wardrobe screen open', st.open && st.screen === 'wardrobe', st);
  check('preview sits', (await hook(() => window.__meowUgc.wardrobe.preview()))?.pose === 'sit');
  check('8+ fur tiles, locked ones show a rule', (await p.locator('.wardrobe-tile').count()) >= 9 && (await p.locator('.wardrobe-tile.locked .wardrobe-rule').count()) > 0);
  await S('wardrobe');
  // tap a locked tile: a try-on
  await tap('.wardrobe-tile.locked >> nth=0');
  await W8(500);
  check('locked try-on says how to unlock', /Locked:/.test((await p.locator('.wardrobe-status').textContent()) || ''));
  await S('locked-tryon');
  await p.evaluate(() => window.__meowUgc.wardrobe.close(false));
  await W8(300);
  check('back discards the draft', (await hook(() => window.__meowUgc.wardrobe.look())) === '000000');
}

// ------------------------------------------------------------------ 2. every tab with everything owned
const want3 = want('tabs') || want('look');
if (want3) {
  await hook(() => window.__meowUgc.wardrobe.devOwnAll(true));
  await hook(() => window.__meowUgc.wardrobe.open());
  await W8(700);
  if (want('tabs')) {
    for (const slot of ['fur', 'pattern', 'eyes', 'hat', 'scarf', 'fx']) {
      await tap(`.wardrobe-tab[data-slot="${slot}"]`);
      const tiles = await p.locator('.wardrobe-tile').count();
      // try the last item of each tab on her
      await tap(`.wardrobe-tile >> nth=${tiles - 1}`);
      await W8(slot === 'fx' ? 1400 : 900);
      check(`tab ${slot}: ${tiles} tiles, none locked`, tiles >= 5 && (await p.locator('.wardrobe-tile.locked').count()) === 0);
      await S(`tab-${slot}`);
    }
    // the poses
    for (const pose of ['proud', 'wave', 'loaf', 'stretch', 'leap']) {
      await hook((id) => window.__meowUgc.wardrobe.pose(id), pose);
      await W8(800);
      if (pose === 'proud' || pose === 'leap') await S(`pose-${pose}`);
    }
    check('pose button cycles', (await hook(() => window.__meowUgc.wardrobe.preview()))?.pose === 'leap');
  }
  // the brief's look: galaxy fur, golden crown, hero cape, rainbow ribbon
  const idx = await hook(() => {
    const w = window.__meowUgc.wardrobe;
    return { fur: w.indexOf('fur', 'galaxy'), hat: w.indexOf('hat', 'crown'), scarf: w.indexOf('scarf', 'cape'), fx: w.indexOf('fx', 'rainbow'), pattern: w.indexOf('pattern', 'tabby'), eyes: w.indexOf('eyes', 'starry') };
  });
  for (const slot of ['fur', 'pattern', 'eyes', 'hat', 'scarf', 'fx']) await hook(([s, i]) => window.__meowUgc.wardrobe.pick(s, i), [slot, idx[slot]]);
  await hook(() => window.__meowUgc.wardrobe.pose('sit'));
  await W8(1500);
  await S('full-look');
  await tap('.wardrobe-actions .btn.green');
  await W8(900);
  const code = await hook(() => window.__meowUgc.wardrobe.look());
  check('DONE saved the look', code === ['fur', 'pattern', 'eyes', 'hat', 'scarf', 'fx'].map((k) => idx[k].toString(36)).join(''), code);
  check('DONE cleared the NEW badge', (await hook(() => window.__meowUgc.wardrobe.state().newCount)) === 0);
  check('back on the title', (await hook(() => document.body.dataset.screen)) === 'title');
  await W8(600);
  check('the title runner wears it', (await hook(() => window.__meowUgc.wardrobe.runner()))?.look === code);
  await S('title-look');
  await clipShot('#titleMascot', 'mascot', 24);
}

// ------------------------------------------------------------------ 3. in game: meadow from behind, the ending, results
if (want('look') || want('game')) {
  await hook(() => {
    window.__meow.dev.unlockAll();
    window.__meow.dev.invincible(true);
    window.__meow.dev.jump('meadow', 0.2);
  });
  await W8(3000);
  check('gameplay rig wears the look', (await hook(() => window.__meowUgc.wardrobe.rigLook())) === (await hook(() => window.__meowUgc.wardrobe.look())));
  await S('meadow-behind');
  // a closer look from behind and from the side (camera override, paused)
  await hook(() => window.__meow.session.pause());
  await W8(300);
  await hook(() => {
    const s = document.createElement('style');
    s.id = 'wardrobe-hideui';
    s.textContent = 'body > *:not(canvas){visibility:hidden !important}';
    document.head.appendChild(s);
  });
  for (const [name, a, d, h] of [
    ['close-back', Math.PI, 3.3, 1.5],
    ['close-front', 0.5, 3.0, 1.0],
  ]) {
    await hook(
      ([a, d, h]) => {
        const M = window.__meow;
        const P = M.P;
        M.setCameraOverride((c) => {
          const w = P.world;
          const ca = Math.cos(a), sa = Math.sin(a);
          c.position.set(w.pos.x + w.fwd.x * ca * d + w.right.x * sa * d + w.up.x * h, w.pos.y + w.fwd.y * ca * d + w.right.y * sa * d + w.up.y * h, w.pos.z + w.fwd.z * ca * d + w.right.z * sa * d + w.up.z * h);
          c.up.set(0, 1, 0);
          c.lookAt(w.pos.x + w.up.x * 0.6, w.pos.y + w.up.y * 0.6, w.pos.z + w.up.z * 0.6);
          if (c.fov !== 40) {
            c.fov = 40;
            c.updateProjectionMatrix();
          }
        });
      },
      [a, d, h],
    );
    await W8(700);
    await S(name);
  }
  // the ghost: a translucent kitten 2 u beside her
  check('ghost placed', await hook(() => window.__meowUgc.wardrobe.ghost('0b1355')));
  await hook(() => {
    const M = window.__meow;
    const P = M.P;
    M.setCameraOverride((c) => {
      const w = P.world;
      c.position.set(w.pos.x + w.fwd.x * 4.2 + w.right.x * 1 + w.up.x * 1.4, w.pos.y + w.fwd.y * 4.2 + w.up.y * 1.4, w.pos.z + w.fwd.z * 4.2 + w.right.z * 1 + w.up.z * 1.4);
      c.up.set(0, 1, 0);
      c.lookAt(w.pos.x + w.right.x * 1 + w.up.x * 0.5, w.pos.y + w.up.y * 0.5, w.pos.z + w.right.z * 1 + w.up.z * 0.5);
    });
  });
  await W8(700);
  await S('ghost');
  await hook(() => {
    window.__meowUgc.wardrobe.clearGhost();
    window.__meow.setCameraOverride(null);
    document.getElementById('wardrobe-hideui')?.remove();
    window.__meow.session.resume();
  });
  await W8(400);
  // the pause card cat wears the look too
  await hook(() => window.__meow.session.pause());
  await W8(400);
  await S('pause');
  await hook(() => window.__meow.session.resume());

  // the trail FX in a run
  await W8(1500);
  await S('meadow-trail');

  // the ending: the cottage cutscene with the look, then the results portrait
  await hook(() => window.__meow.dev.jump('sunset', 0.985));
  const inCut = await (async () => {
    for (let i = 0; i < 60; i++) {
      if ((await hook(() => document.body.dataset.screen)) === 'cutscene') return true;
      await W8(250);
    }
    return false;
  })();
  check('cutscene started', inCut);
  await W8(2200);
  await S('cutscene');
  await W8(2600);
  await S('cutscene-2');
  await hook(() => document.getElementById('cutscene')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
  const res = await (async () => {
    for (let i = 0; i < 60; i++) {
      if ((await hook(() => document.body.dataset.screen)) === 'results') return true;
      await W8(250);
    }
    return false;
  })();
  check('results shown', res);
  await W8(1800);
  await S('results');
  await clipShot('#resCat', 'results-portrait', 16);
}

// ------------------------------------------------------------------ 4. reload: the look persists
if (want('look') || want('reload')) {
  const before = await hook(() => window.__meow.dev.save().wardrobe.look);
  await p.reload();
  await boot();
  const after = await hook(() => window.__meow.dev.save().wardrobe.look);
  check('look persists in the save', before === after && after !== '000000', { before, after });
}

// ------------------------------------------------------------------ 5. fps at LOW: full look vs classic
if (want('fps')) {
  const fps = async (code) => {
    await hook((c) => {
      window.__meowUgc.wardrobe.devOwnAll(true);
      window.__meowUgc.wardrobe.equip(c);
      window.__meow.quality.set('low');
      window.__meow.dev.invincible(true);
      window.__meow.dev.jump('meadow', 0.3);
    }, code);
    await W8(1500);
    const f0 = await hook(() => [window.__meow.clock.frame, performance.now()]);
    await W8(5000);
    const f1 = await hook(() => [window.__meow.clock.frame, performance.now()]);
    return ((f1[0] - f0[0]) * 1000) / (f1[1] - f0[1]);
  };
  const classic = await fps('000000');
  const full = await fps('804753');
  const ratio = full / classic;
  console.log(`fps LOW ${W}x${H}: classic ${classic.toFixed(1)}  full look ${full.toFixed(1)}  ratio ${ratio.toFixed(3)}`);
  check('full look fps within 5% of classic', ratio >= 0.95, { classic: +classic.toFixed(1), full: +full.toFixed(1) });
}

console.log('ERRORS', errs.length, errs.slice(0, 6));
if (foreign.length) console.log('OTHER-LANE ERRORS (reported, not failed)', foreign.length, foreign.slice(0, 4));
await b.close();
if (errs.length || fails.length) {
  console.log('WARDROBE SHOTS FAILED', fails);
  process.exit(1);
}
console.log('WARDROBE SHOTS OK');
