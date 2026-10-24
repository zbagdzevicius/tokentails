// Iteration 2 UGC smoke: node shots/ugc-smoke.mjs [w h]   (dev server on http://127.0.0.1:5178, or MEOW_URL)
// Visits every UGC entry with real clicks / taps and closes every screen and overlay it opens:
//   fresh save -> title hub (WARDROBE, TRAIL MAKER; DAILY hidden) -> WARDROBE: pick a free hat, DONE (saved) ->
//   meadow: a real air spin (Space/E, or swipe up + ability taps) -> trick counted, combo meter + tier stamp ->
//   pause: PHOTO (shutter -> preview -> SAVE downloads a PNG -> back) and SAVE CLIP badge -> finish -> results:
//   SHARE sheet (name, card, link) + SAVE CLIP sheet (render, DOWNLOAD counts a clip) -> a challenge link in a fresh
//   page: the card, PLAY, the ghost races -> TRAIL MAKER: new trail, 6 blocks, TEST RUN, finish, SHARE TRAIL; the
//   ?t= link in a fresh page plays the same course -> settings: Replays + Vertical rows -> the Daily Run from the
//   title, to the results (Daily best saved) -> a short phone/desktop layout check of the results card.
// Exits 1 on any page error, console error or failed check.
import { chromium } from '@playwright/test';
import { createBot } from './bot.mjs';

const W = +(process.argv[2] || 1280), H = +(process.argv[3] || 720);
const mobile = W < 600;
const tag = mobile ? 'm' : 'd';
const URL = process.env.MEOW_URL || 'http://127.0.0.1:5178/';
const gpu = process.env.MEOW_GPU || (process.platform === 'darwin' && !process.env.MEOW_SWIFT);
const ARGS = gpu ? ['--use-angle=metal'] : ['--use-gl=angle', '--enable-unsafe-swiftshader'];
const b = await chromium.launch({ args: ARGS });
const ctx = await b.newContext({ viewport: { width: W, height: H }, hasTouch: mobile, isMobile: mobile, acceptDownloads: true });
const errs = [];
const warns = new Set();
const fails = [];
const watch = (pg) => {
  pg.on('pageerror', (e) => errs.push(String(e.stack || e).slice(0, 400)));
  pg.on('console', (m) => {
    if (m.type() === 'error') errs.push(`${m.text()} @ ${m.location()?.url || ''}`.slice(0, 400));
    else if (m.type() === 'warning') warns.add(m.text().slice(0, 160));
  });
};
let p = await ctx.newPage();
watch(p);
let n = 0;
const S = (name, pg = p) => pg.screenshot({ path: `shots/ugc-${tag}-${String(++n).padStart(2, '0')}-${name}.png` });
const check = (name, ok, info) => {
  console.log(ok ? 'ok  ' : 'FAIL', name, info === undefined ? '' : JSON.stringify(info));
  if (!ok) fails.push(name);
};
const click = async (sel, pg = p) => {
  if (mobile) await pg.tap(sel);
  else await pg.click(sel);
  await pg.waitForTimeout(250);
};
const waitFor = async (fn, ms, arg, pg = p) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await pg.evaluate(fn, arg).catch(() => false)) return true;
    await pg.waitForTimeout(150);
  }
  return false;
};
const scr = (pg = p) => pg.evaluate(() => document.body.dataset.screen);
const visible = (sel, pg = p) => pg.evaluate((s) => { const e = document.querySelector(s); return !!e && !e.classList.contains('hidden') && e.getClientRects().length > 0; }, sel);
const boot = async (pg = p) => {
  await pg.waitForFunction(() => window.__meow && window.__meow.dev && window.__meowUgc && window.__meowUgc.share && window.__meowUgc.trails, null, { timeout: 30000 });
  await pg.waitForTimeout(1200);
};
/** every element of the card is inside the viewport (or the card scrolls) and no two UGC buttons overlap */
const layout = (pg = p) => pg.evaluate(() => {
  const vis = (e) => e && e.getClientRects().length > 0 && !e.classList.contains('hidden');
  const btns = [...document.querySelectorAll('#ugc-results .btn, #results .row .btn')].filter(vis).map((e) => ({ id: e.id || e.textContent.trim(), r: e.getBoundingClientRect() }));
  const overlaps = [];
  for (let i = 0; i < btns.length; i++) for (let j = i + 1; j < btns.length; j++) {
    const a = btns[i].r, c = btns[j].r;
    if (a.left < c.right - 1 && c.left < a.right - 1 && a.top < c.bottom - 1 && c.top < a.bottom - 1) overlaps.push([btns[i].id, btns[j].id]);
  }
  const host = document.getElementById('results');
  const narrow = btns.filter((x) => x.r.width < 44 || x.r.height < 40).map((x) => x.id);
  const scrolls = host.scrollHeight > host.clientHeight + 1;
  const cut = scrolls ? [] : btns.filter((x) => x.r.bottom > innerHeight || x.r.top < 0 || x.r.left < 0 || x.r.right > innerWidth).map((x) => x.id);
  return { overlaps, narrow, cut, scrolls, n: btns.length };
});

// ==================================================================== title hub
await p.goto(URL);
await p.evaluate(() => localStorage.clear());
await p.reload();
await boot();
const bot = await createBot(p, { mobile, W, H });
await bot.install();
check('title: WARDROBE + TRAIL MAKER shown', (await visible('#ugcWardrobe')) && (await visible('#ugcTrails')));
check('title: DAILY hidden on a fresh save', !(await visible('#ugcDaily')));
await S('title');

// ==================================================================== wardrobe: a free hat, DONE
await click('#ugcWardrobe');
check('wardrobe opens', (await scr()) === 'wardrobe');
const hat = await p.evaluate(() => window.__meowUgc.wardrobe.catalog.hat.find((i) => i.index > 0 && i.unlock.kind === 'free'));
check('a free hat exists', !!hat, hat?.key);
await p.evaluate((i) => { window.__meowUgc.wardrobe.tab('hat'); window.__meowUgc.wardrobe.pick('hat', i); }, hat.index);
await p.waitForTimeout(600);
await S('wardrobe-hat');
await click('#wardrobe [data-act="done"]');
check('DONE back to the title', (await scr()) === 'title');
const look = await p.evaluate(() => window.__meow.dev.save().wardrobe.look);
check('the look is saved with the hat', !!look && look !== '000000' && look[3] === hat.index.toString(36), look);

// ==================================================================== a real air spin + the combo HUD
await p.evaluate(() => { window.__meow.dev.unlockAll(); window.__meow.dev.invincible(true); window.__meow.dev.jump('meadow', 0.3); });
await p.waitForTimeout(1200);
const spin = async () => {
  if (mobile) {
    await bot.act('jump');
    await p.waitForTimeout(160);
    await bot.act('ability');
    await p.waitForTimeout(120);
    await bot.act('ability');
  } else {
    await p.keyboard.press('Space');
    await p.waitForTimeout(160);
    await p.keyboard.press('KeyE');
    await p.waitForTimeout(120);
    await p.keyboard.press('KeyE');
  }
};
let tricks = 0;
for (let i = 0; i < 4 && tricks < 1; i++) {
  await spin();
  await p.waitForTimeout(1400);
  tricks = await p.evaluate(() => window.__meowUgc.style.state().tricks);
}
check('a real air spin counts as a trick', tricks >= 1, await p.evaluate(() => window.__meowUgc.style.state()));
await p.evaluate(() => window.__meowUgc.style.forceTier(10, 3));
await p.waitForTimeout(350);
const stamp = await p.evaluate(() => ({ txt: document.querySelector('#style-stamp .style-s-txt')?.textContent, combo: getComputedStyle(document.getElementById('style-combo')).display !== 'none', n: document.querySelector('#style-combo .style-c-n')?.textContent }));
check('tier stamp + combo meter', /PAWSOME/.test(stamp.txt || '') && stamp.combo, stamp);
await S('combo');

// ==================================================================== pause: photo mode + the clip badge
await p.evaluate(() => window.__meow.dev.jump('gorge', 0.1));
await bot.playUntil(() => false, { maxMs: 7000 });
if (mobile) await click('#pauseBtn'); else { await p.keyboard.press('Escape'); await p.waitForTimeout(300); }
check('paused', (await scr()) === 'pause');
check('pause: PHOTO + SAVE CLIP', (await visible('#ugcPhoto')) && (await visible('#ugcClipPause')), await p.evaluate(() => window.__meowUgc.clip.state()));
await S('pause');
await click('#ugcPhoto');
check('photo mode opens', (await scr()) === 'photo');
await p.evaluate(() => { const h = window.__meowUgc.photo; h.setFilter('warm'); h.setFrame('polaroid'); h.addSticker('heart'); h.preset('hero'); });
await p.waitForTimeout(500);
await S('photo');
await click('.photo-shutter');
check('photo preview', await waitFor(() => !!document.getElementById('photoSave'), 5000));
const dl1 = p.waitForEvent('download', { timeout: 8000 }).catch(() => null);
await click('#photoSave');
const png = await dl1;
check('SAVE downloads a PNG', !!png && /meowrun-photo-.*\.png$/.test(png.suggestedFilename()), png?.suggestedFilename());
check('ugcStats.photos = 1', (await p.evaluate(() => window.__meow.dev.save().ugcStats.photos)) === 1);
await S('photo-preview');
await click('#photoPreviewBack');
await click('.photo-back');
check('photo back to pause', (await scr()) === 'pause');
await click('#pauseResume');
check('resumed after photo', await waitFor(() => window.__meow.mode === 'play', 2000));

// ==================================================================== results: SHARE sheet + SAVE CLIP
await p.evaluate(() => window.__meow.dev.jump('meadow', 0.985));
await bot.playUntil((s) => s.mode === 'over', { maxMs: 30000 });
check('results', await waitFor(() => document.body.dataset.screen === 'results', 8000));
await p.waitForTimeout(1500);
check('results: SHARE + SAVE CLIP', (await visible('#ugcShare')) && (await visible('#ugcClip')));
const lay = await layout();
check('results layout: no overlap, nothing cut off', !lay.overlaps.length && !lay.cut.length && !lay.narrow.length, lay);
await S('results');
await click('#ugcShare');
check('name prompt', await waitFor(() => !!document.getElementById('shareNameInput'), 3000));
await p.fill('#shareNameInput', 'Zig');
await click('#shareNameOk');
check('share sheet', await waitFor(() => { const i = document.querySelector('.share-prev img'); return !!i && i.complete && i.naturalWidth === 1080; }, 8000));
await S('share-sheet');
await p.keyboard.press('Escape');
check('Esc closes the share sheet', await waitFor(() => !document.querySelector('.share-sheet') && document.body.dataset.screen === 'results', 2000));
await click('#ugcClip');
check('clip sheet renders', await waitFor(() => { const e = document.getElementById('clipDownload'); return !!e && e.getClientRects().length > 0; }, 25000));
await S('clip-sheet');
const dl2 = p.waitForEvent('download', { timeout: 8000 }).catch(() => null);
await click('#clipDownload');
const clip = await dl2;
check('DOWNLOAD saves a clip', !!clip && /meowrun-clip-.*\.(mp4|webm)$/.test(clip.suggestedFilename()), clip?.suggestedFilename());
check('ugcStats.clips = 1', await waitFor(() => window.__meow.dev.save().ugcStats.clips === 1, 2000));
await click('#clipClose');
check('clip sheet closed, results stay', (await p.evaluate(() => !document.querySelector('.clip-sheet'))) && (await scr()) === 'results');

// ==================================================================== a challenge link: the card, PLAY, the ghost
const code = await p.evaluate(async () => {
  const h = window.__meowUgc.share;
  const samples = [];
  for (let i = 0; i <= 6 * 60; i++) samples.push({ s: (21 * i) / 6, x: 1.4 * Math.sin(i / 8), y: 0, flags: 0 });
  return h.encode({ v: 1, stage: 'meadow', score: 512340, name: 'Mia', look: '3a0210', chain: 12, ghost: h.packGhost(samples, 6) });
});
const p2 = await ctx.newPage();
watch(p2);
await p2.goto(`${URL}?c=${code}`);
await boot(p2);
check('challenge card from ?c=', await waitFor(() => document.querySelector('.share-chal h2')?.textContent === 'Mia challenges you!', 5000, undefined, p2));
await S('challenge-card', p2);
await click('#shareChalPlay', p2);
check('challenge plays meadow', await waitFor(() => window.__meow.mode === 'play' && window.__meow.game.stage.id === 'meadow', 3000, undefined, p2));
await p2.evaluate(() => window.__meow.dev.invincible(true));
const bot2 = await createBot(p2, { mobile, W, H });
await bot2.install();
await bot2.playUntil(() => false, { maxMs: 6000 });
const g = await p2.evaluate(() => window.__meowUgc.share.ghost());
check('the ghost races, visible', g.active && g.visible, g);
check('the race pill', await p2.evaluate(() => /vs Mia/.test(document.getElementById('sharePill')?.textContent || '')));
await S('ghost', p2);
await p2.close();

// ==================================================================== Trail Maker: build, test, share, the link
await click('#resMenu');
await click('#selectBack');
check('results -> stages -> title', (await scr()) === 'title');
await click('#ugcTrails');
check('trail maker opens', (await scr()) === 'trails');
await click('#trailsNew');
for (const id of ['0', '4', 'a', '1', '5', '9']) await click(`.trails-blk[data-id="${id}"]`);
await p.waitForTimeout(300);
const tst = await p.evaluate(() => window.__meowUgc.trails.state());
check('6 blocks, valid', tst.draft?.blocks.length === 6 && tst.check?.ok, tst.check);
await p.evaluate(() => document.getElementById('trails').scrollTo(0, 0));
await S('trail-editor');
await click('#trailsTest');
check('TEST RUN plays the trail', await waitFor(() => window.__meow.mode === 'play' && window.__meow.game.stage?.id === 'trail', 5000));
check('no bell row on a trail', !(await visible('#bells')));
const tcode = await p.evaluate(() => window.__meowUgc.trails.current());
const tspecs = await p.evaluate(() => JSON.stringify(window.__meow.session.sessionInfo.specs.slice(0, 30).map((s) => [s.type, +s.s.toFixed(2)])));
await p.evaluate(() => window.__meow.dev.invincible(true));
await bot.playUntil((s) => s.screen === 'results', { maxMs: 150000 });
check('trail finished', (await scr()) === 'results');
await p.waitForTimeout(1200);
check('SHARE TRAIL + EDIT TRAIL', (await visible('#ugcTrailShare')) && (await visible('#ugcTrailEdit')));
const lay2 = await layout();
check('trail results layout: no overlap, nothing cut off', !lay2.overlaps.length && !lay2.cut.length && !lay2.narrow.length, lay2);
await S('trail-results');
const tlink = await p.evaluate(() => window.__meowUgc.trails.link());
check('trail link carries ?t=', typeof tlink === 'string' && new globalThis.URL(tlink).searchParams.get('t') === tcode, tlink);
const p3 = await ctx.newPage();
watch(p3);
await p3.goto(`${URL}?t=${encodeURIComponent(tcode)}`);
await boot(p3);
check('trail link overlay', await waitFor(() => !!document.getElementById('trailsLinkPlay'), 5000, undefined, p3));
await S('trail-link', p3);
await click('#trailsLinkPlay', p3);
check('trail link plays', await waitFor(() => window.__meow.mode === 'play' && window.__meow.game.stage?.id === 'trail', 4000, undefined, p3));
const tspecs2 = await p3.evaluate(() => JSON.stringify(window.__meow.session.sessionInfo.specs.slice(0, 30).map((s) => [s.type, +s.s.toFixed(2)])));
check('the link plays the same course', tspecs === tspecs2);
await p3.close();

// ==================================================================== settings: the replay rows
await click('#resMenu');
await click('#selectBack');
if ((await scr()) !== 'title') await p.evaluate(() => window.__meow.session.quit());
await p.waitForTimeout(300);
await click('#titleSettings');
check('settings: Replays + Vertical rows', (await visible('#setCapture')) && (await visible('#setClipVertical')));
await S('settings');
await click('#settingsDone');
check('settings back to the title', (await scr()) === 'title');

// ==================================================================== the Daily Run, to the results
check('title: DAILY shown once endless is open', await visible('#ugcDaily'));
await click('#ugcDaily');
check('daily plays', await waitFor(() => window.__meow.mode === 'play' && window.__meow.game.stage.id === 'daily', 3000));
check('daily is named', (await p.evaluate(() => window.__meow.game.stage.name)) === 'Daily Run');
await p.evaluate(() => window.__meow.dev.invincible(false));
await bot.playUntil(() => false, { maxMs: 6000 });
await S('daily');
await p.evaluate(() => (window.__meow.G.hearts = 1));
await bot.releaseAll();
await p.evaluate(() => (window.__botPassive = true));
await bot.playUntil((s) => s.mode === 'over', { maxMs: 90000 });
await p.evaluate(() => (window.__botPassive = false));
check('daily results', await waitFor(() => document.body.dataset.screen === 'results', 6000));
await p.waitForTimeout(1400);
const ds = await p.evaluate(() => ({ daily: window.__meow.dev.save().daily, plays: window.__meow.dev.save().ugcStats.dailyPlays }));
check('daily best saved', ds.daily.best > 0 && ds.plays === 1, ds);
await S('daily-results');

console.log('WARNINGS', warns.size, [...warns].slice(0, 6));
console.log('ERRORS', errs.length, errs.slice(0, 8));
console.log(fails.length || errs.length ? `UGC SMOKE FAILED: ${fails.join(', ')}` : 'UGC SMOKE OK');
await b.close();
process.exit(fails.length || errs.length ? 1 : 0);
