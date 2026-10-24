// TRAILS lane shots: node shots/trails-shots.mjs   (MEOW_URL, default http://127.0.0.1:5186/; TRAILS_ONLY=d|m)
// Desktop (1280x720) and phone (390x844, touch):
//   title -> TRAIL MAKER -> NEW TRAIL -> 1 block (validation error) -> 8 palette blocks + mirror -> editor, minimap
//   -> TEST RUN (invincible, real-input bot) to the finish (<= 150 s) -> results: SHARE TRAIL + EDIT TRAIL, save updated
//   -> the ?t= link from the hook in a fresh browser context -> overlay -> PLAY: the 'trail' specs equal the maker's
//   -> a broken ?t= link shows the toast.
// Desktop only: three RANDOM trails finished by the bot WITHOUT invincibility (hearts and respawns allowed).
// Exits 1 on a failed check or a page/console error (errors that point into another lane's folder are only reported).
import { chromium } from '@playwright/test';
import { createBot } from './bot.mjs';

const URL = process.env.MEOW_URL || 'http://127.0.0.1:5186/';
const ONLY = process.env.TRAILS_ONLY || '';
const gpu = process.env.MEOW_GPU || (process.platform === 'darwin' && !process.env.MEOW_SWIFT);
const ARGS = gpu ? ['--use-angle=metal'] : ['--use-gl=angle', '--enable-unsafe-swiftshader'];
const OTHER = /src\/(clip|photo|share|wardrobe|style|cat|juice|audio|world)\//;
const fails = [];
const reported = [];
const check = (name, ok, info) => {
  console.log(ok ? 'ok  ' : 'FAIL', name, info === undefined ? '' : JSON.stringify(info));
  if (!ok) fails.push(name);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function watch(p, errs) {
  const add = (text) => (OTHER.test(text) ? reported : errs).push(text.slice(0, 400));
  p.on('pageerror', (e) => add(String(e.stack || e)));
  p.on('console', (m) => {
    if (m.type() !== 'error') return;
    const loc = m.location();
    add(`${m.text()} @ ${loc?.url ?? ''}`);
  });
}
const waitFor = async (p, fn, ms, arg) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await p.evaluate(fn, arg).catch(() => false)) return true;
    await p.waitForTimeout(150);
  }
  return false;
};
const boot = async (p) => {
  await p.waitForFunction(() => window.__meow && window.__meow.dev && window.__meowUgc && window.__meowUgc.trails, null, { timeout: 30000 });
  await p.waitForTimeout(1200);
};
const specsOf = (p) => p.evaluate(() => JSON.stringify(window.__meow.session.sessionInfo.specs.map((s) => [s.type, +s.s.toFixed(3), s.x ?? 0, s.y ?? 0, s.len ?? 0])));

async function pass(mobile) {
  const W = mobile ? 390 : 1280, H = mobile ? 844 : 720, tag = mobile ? 'm' : 'd';
  console.log(`---- trails ${W}x${H}`);
  const b = await chromium.launch({ args: ARGS });
  const opts = { viewport: { width: W, height: H }, hasTouch: mobile, isMobile: mobile };
  const ctx = await b.newContext(opts);
  const p = await ctx.newPage();
  const errs = [];
  watch(p, errs);
  let n = 0;
  const S = (name, page = p) => page.screenshot({ path: `shots/trails-${tag}-${String(++n).padStart(2, '0')}-${name}.png` });
  const click = async (sel, page = p) => {
    if (mobile) await page.tap(sel);
    else await page.click(sel);
    await page.waitForTimeout(160);
  };
  const st = () => p.evaluate(() => ({ screen: document.body.dataset.screen, mode: window.__meow.mode, stage: window.__meow.game.stage?.id, t: window.__meowUgc.trails.state() }));

  await p.goto(URL);
  await p.evaluate(() => localStorage.clear());
  await p.reload();
  await boot(p);
  const bot = await createBot(p, { mobile, W, H });
  await bot.install();
  await S('title');
  check('title: TRAIL MAKER button', await p.isVisible('#ugcTrails'));
  check('trail stage registered (starter course)', await p.evaluate(() => window.__meow.stages.has('trail') && !!window.__meowUgc.trails.current()));

  // ---- the maker
  await click('#ugcTrails');
  check('maker opens on MY TRAILS', (await st()).screen === 'trails' && (await st()).t.view === 'list', await st());
  await S('list-empty');
  await click('#trailsNew');
  check('NEW TRAIL opens the editor', (await st()).t.view === 'edit');
  await click('.trails-blk[data-id="0"]');
  await p.waitForTimeout(250);
  const one = await st();
  check('one block: invalid, badge shows the first error', one.t.check && !one.t.check.ok && /at least 2/.test(await p.textContent('#trailsBadge')), one.t.check?.errors);
  await p.evaluate(() => document.getElementById('trails').scrollTo(0, 0));
  await S('editor-invalid');
  const add = ['4', 'a', '1', '5', 'c', '6', '9'];
  for (const id of add) await click(`.trails-blk[data-id="${id}"]`);
  await p.waitForTimeout(300);
  // select block 4 (the bend) and mirror it
  await click('.trails-chip[data-i="3"]');
  await click('#trailsMirror');
  await p.waitForTimeout(300);
  const ed = await st();
  check('8 blocks in the course', ed.t.draft?.blocks.length === 8, ed.t.draft?.blocks.length);
  check('block 4 mirrored', ed.t.draft?.blocks[3].mirror === true);
  check('editor validation: ready', ed.t.check?.ok === true && /Ready/.test(await p.textContent('#trailsBadge')), ed.t.check);
  check('time estimate inside 25..150 s', ed.t.check && ed.t.check.seconds > 25 && ed.t.check.seconds < 150, ed.t.check?.seconds);
  check('palette filtered: no puff cloud in the meadow', (await p.locator('.trails-blk[data-id="h"]').count()) === 0);
  await p.evaluate(() => document.getElementById('trails').scrollTo(0, 0));
  await p.waitForTimeout(250);
  await S('editor');
  await p.locator('.trails-mapbox').screenshot({ path: `shots/trails-${tag}-${String(++n).padStart(2, '0')}-minimap.png` });
  await p.evaluate(() => document.getElementById('trails').scrollTo(0, 99999));
  await p.waitForTimeout(250);
  await S('editor-bottom');
  // the gorge offers the cloud
  await click('.trails-theme[data-theme="gorge"]');
  check('gorge palette has the puff cloud', (await p.locator('.trails-blk[data-id="h"]').count()) === 1);
  await click('.trails-theme[data-theme="meadow"]');
  const draft = (await st()).t.draft;

  // ---- TEST RUN to the finish (invincible, real-input bot)
  await click('#trailsTest');
  check('TEST RUN starts the trail', await waitFor(p, () => window.__meow.mode === 'play' && window.__meow.game.stage?.id === 'trail', 5000), await st());
  await p.evaluate(() => window.__meow.dev.invincible(true));
  const code = await p.evaluate(() => window.__meowUgc.trails.current());
  check('the run plays the saved code', code === (await p.evaluate((d) => window.__meowUgc.trails.encode(d), draft)), code);
  const makerSpecs = await specsOf(p);
  const t0 = Date.now();
  let shot = 0;
  await bot.playUntil((s) => s.screen === 'results', {
    maxMs: 150000,
    onTick: async () => {
      if (shot < 2 && Date.now() - t0 > 12000 + shot * 20000) await S(`run-${++shot}`);
    },
  });
  const secs = (Date.now() - t0) / 1000;
  const res = await p.evaluate(() => window.__meow.G && { screen: document.body.dataset.screen, finishS: window.__meow.G.finishS });
  check(`bot finished the trail in ${secs.toFixed(0)} s (<= 150)`, res.screen === 'results' && secs <= 150, res);
  await p.evaluate(() => window.__meow.dev.invincible(false));
  await p.waitForTimeout(700);
  check('results: SHARE TRAIL visible', await p.isVisible('#ugcTrailShare'));
  check('results: EDIT TRAIL visible', await p.isVisible('#ugcTrailEdit'));
  check('results title: Trail clear!', (await p.textContent('#resTitle'))?.includes('Trail clear'));
  await S('results');
  const sv = await p.evaluate(() => window.__meow.dev.save());
  check('save: my trail is finished with a best', sv.trails.mine[0]?.code === code && sv.trails.mine[0].finished && sv.trails.mine[0].best > 0, sv.trails.mine[0]);
  check('save: ugcStats.trailsFinished = 1', sv.ugcStats.trailsFinished === 1, sv.ugcStats);
  await click('#ugcTrailShare');
  check('SHARE TRAIL reports back', await waitFor(p, () => document.getElementById('ugc-toast')?.classList.contains('on'), 3000));
  const link = await p.evaluate(() => window.__meowUgc.trails.link());
  check('trail link carries ?t=', /[?&]t=1[mgs]/.test(link), link);

  // EDIT TRAIL goes back to the editor with the same course; MY TRAILS shows it cleared
  await click('#ugcTrailEdit');
  const back = await st();
  check('EDIT TRAIL opens the editor on the same trail', back.screen === 'trails' && back.t.view === 'edit' && back.t.draft?.blocks.length === 8);
  check('editor SHARE visible once finished', await p.isVisible('#trailsShare'));
  await p.evaluate(() => document.getElementById('trails').scrollTo(0, 0));
  await S('edit-again');
  await click('#trailsBack');
  check('MY TRAILS lists it as cleared', (await p.locator('.trails-entry .trails-state.done').count()) === 1);
  await S('list-cleared');
  await click('#trailsBack');
  check('back to the title', (await st()).screen === 'title');

  // ---- the link in a fresh browser (a friend)
  const ctx2 = await b.newContext(opts);
  const q = await ctx2.newPage();
  const errs2 = [];
  watch(q, errs2);
  await q.goto(link);
  await boot(q);
  check('link overlay shows', await q.isVisible('.trails-linkcard'));
  check('overlay names the trail', (await q.textContent('.trails-linkname')) === draft.name, await q.textContent('.trails-linkname'));
  check('link param cleared from the address bar', !q.url().includes('t='), q.url());
  await S('link-overlay', q);
  await click('#trailsLinkPlay', q);
  check('PLAY starts the trail', await waitFor(q, () => window.__meow.mode === 'play' && window.__meow.game.stage?.id === 'trail', 5000));
  check("the friend's course equals the maker's (sessionInfo.specs)", (await specsOf(q)) === makerSpecs);
  await q.waitForTimeout(2500);
  await S('link-play', q);
  // a broken link
  await q.goto(`${URL}?t=1m2zzz-garbage%3C`);
  await boot(q);
  check('broken link: toast', (await q.textContent('#ugc-toast'))?.includes('broken') && !(await q.isVisible('.trails-linkcard')));
  await S('link-broken', q);
  // SAVE COPY from a link
  await q.goto(link);
  await boot(q);
  await click('#trailsLinkSave', q);
  await click('#trailsLinkSkip', q);
  const sv2 = await q.evaluate(() => window.__meow.dev.save());
  check('SAVE COPY adds it (not finished yet: the copy must be finished before sharing)', sv2.trails.mine.length === 1 && !sv2.trails.mine[0].finished, sv2.trails.mine);
  await ctx2.close();

  // ---- desktop: random trails finished WITHOUT invincibility
  if (!mobile) {
    for (const seed of [1, 2, 3]) {
      const info = await p.evaluate((seed) => {
        const h = window.__meowUgc.trails;
        const t = h.random(seed);
        const code = h.encode(t);
        const r = h.load(code);
        window.__meow.dev.invincible(false);
        window.__meow.dev.jump('trail', 0);
        return { code, r, check: h.validate(t) };
      }, seed);
      const t1 = Date.now();
      await bot.playUntil((s) => s.screen === 'results', { maxMs: 240000 });
      const out = await p.evaluate(() => ({ screen: document.body.dataset.screen, hits: window.__meow.G.hits, respawns: window.__meow.G.respawns, inv: window.__meow.G.invincible }));
      check(`random(${seed}) ${info.code} finished by the bot without invincibility in ${((Date.now() - t1) / 1000).toFixed(0)} s (est ${info.check.seconds.toFixed(0)} s)`, out.screen === 'results' && !out.inv, out);
      if (seed === 1) await S('random-results');
    }
  }

  check(`${tag}: no page or console errors`, errs.length === 0 && errs2.length === 0, [...errs, ...errs2].slice(0, 6));
  await b.close();
}

if (ONLY !== 'm') await pass(false);
if (ONLY !== 'd') await pass(true);
if (reported.length) console.log('REPORTED (other lanes):', [...new Set(reported)].slice(0, 8));
console.log(fails.length ? `TRAILS FAIL ${fails.length}: ${fails.join(' | ')}` : 'TRAILS OK');
process.exit(fails.length ? 1 : 0);
