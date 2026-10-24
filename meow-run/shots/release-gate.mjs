// Iteration 2 release gate: node shots/release-gate.mjs   (dev server: MEOW_URL, default http://127.0.0.1:5178/)
// End-to-end checks of what players make and share, each from a REAL run (no synthetic codes), across fresh contexts:
//   1. an old v1 save migrates to v2 without losing progress;
//   2. a Wardrobe look picked in the UI persists across a reload (save, equipped look, the runner rig);
//   3. a full Sunny Meadow run (bot, invincible): PHOTO from pause saves a real PNG; SAVE CLIP downloads a file that
//      ffprobe decodes with a video AND an audio stream; SHARE gives a compact ?c= link;
//   4. that ?c= link in a fresh context: the challenge card, PLAY, the ghost races, finishing shows the result banner;
//   5. a Trail Maker trail: TEST RUN to the finish, SHARE TRAIL link; the ?t= link in a fresh context round-trips to
//      the same code and course, and is finishable;
//   6. the Daily Run: same seed, landscape and course in two separate contexts.
// Files land in shots/gate-*. Exits 1 on any failed check, page error or console error.
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createBot } from './bot.mjs';

const W = 1280, H = 720;
const URL = process.env.MEOW_URL || 'http://127.0.0.1:5178/';
const gpu = process.env.MEOW_GPU || (process.platform === 'darwin' && !process.env.MEOW_SWIFT);
const b = await chromium.launch({ args: gpu ? ['--use-angle=metal'] : ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
const errs = [];
const fails = [];
const check = (name, ok, info) => {
  console.log(ok ? 'ok  ' : 'FAIL', name, info === undefined ? '' : JSON.stringify(info));
  if (!ok) fails.push(name);
};
const watch = (pg, tag) => {
  pg.on('pageerror', (e) => errs.push(`${tag}: ${String(e.stack || e).slice(0, 300)}`));
  pg.on('console', (m) => { if (m.type() === 'error') errs.push(`${tag}: ${m.text().slice(0, 300)}`); });
};
async function newCtx(tag) {
  const ctx = await b.newContext({ viewport: { width: W, height: H }, acceptDownloads: true });
  const p = await ctx.newPage();
  watch(p, tag);
  return { ctx, p };
}
const boot = async (p) => {
  await p.waitForFunction(() => window.__meow?.dev && window.__meowUgc?.share && window.__meowUgc?.trails && window.__meowUgc?.wardrobe, null, { timeout: 30000 });
  await p.waitForTimeout(1200);
};
const waitFor = async (p, fn, ms, arg) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await p.evaluate(fn, arg).catch(() => false)) return true;
    await p.waitForTimeout(150);
  }
  return false;
};
const scr = (p) => p.evaluate(() => document.body.dataset.screen);
const click = async (p, sel) => { await p.click(sel); await p.waitForTimeout(250); };
const specs = (p) => p.evaluate(() => JSON.stringify(window.__meow.session.sessionInfo.specs.slice(0, 40).map((s) => [s.type, +s.s.toFixed(2)])));
const S = (p, name) => p.screenshot({ path: `shots/gate-${name}.png` });

// ================================================================ A: migration, wardrobe, a full run, clip, photo, link
const A = await newCtx('A');
let p = A.p;
await p.goto(URL);
const v1 = {
  v: 1,
  stages: { meadow: { stars: [true, false, true], best: 412345, bestBells: 5, plays: 3, finished: true } },
  endlessBest: { score: 0, distance: 0 },
  unlockAll: false,
  settings: { master: 0.8, music: 0.5, sfx: 1, quality: 'high', reducedMotion: false, shake: 1 },
  tutorialDone: true,
  endingSeen: false,
  totals: { runs: 3, fish: 120, distance: 2100 },
};
await p.evaluate((s) => { localStorage.clear(); localStorage.setItem('meowrun.save', JSON.stringify(s)); }, v1);
await p.reload();
await boot(p);
const mig = await p.evaluate(() => window.__meow.dev.save());
check('v1 save migrates to v2', mig.v === 2, { v: mig.v });
check('v1 progress kept', mig.stages.meadow?.best === 412345 && mig.stages.meadow.finished && mig.stages.meadow.stars.join() === 'true,false,true' && mig.totals.runs === 3 && mig.settings.master === 0.8 && mig.tutorialDone, mig.stages.meadow);
check('v2 fields defaulted', mig.wardrobe.look === '000000' && mig.player.name === '' && mig.trails.mine.length === 0 && mig.settings.capture === 'auto' && mig.ugcStats.clips === 0, { w: mig.wardrobe, s: mig.settings });
check('migrated save shows DAILY (meadow finished)', await p.evaluate(() => { const e = document.getElementById('ugcDaily'); return !!e && e.getClientRects().length > 0; }));

// wardrobe through the UI: a free hat and a free colour if there is one
await click(p, '#ugcWardrobe');
check('wardrobe opens', (await scr(p)) === 'wardrobe');
const picks = await p.evaluate(() => {
  const c = window.__meowUgc.wardrobe.catalog;
  const out = {};
  for (const slot of Object.keys(c)) {
    const it = c[slot].find((i) => i.index > 0 && i.unlock.kind === 'free');
    if (it) out[slot] = it.index;
  }
  return out;
});
check('free wardrobe items exist', Object.keys(picks).length >= 1, picks);
for (const [slot, i] of Object.entries(picks).slice(0, 3)) {
  await p.evaluate(([s, n]) => { window.__meowUgc.wardrobe.tab(s); window.__meowUgc.wardrobe.pick(s, n); }, [slot, i]);
  await p.waitForTimeout(300);
}
await click(p, '#wardrobe [data-act="done"]');
const lookBefore = await p.evaluate(() => window.__meow.dev.save().wardrobe.look);
check('look saved', lookBefore !== '000000', lookBefore);
await p.reload();
await boot(p);
const lookAfter = await p.evaluate(() => ({ save: window.__meow.dev.save().wardrobe.look, eq: window.__meowUgc.wardrobe.look(), rig: window.__meowUgc.wardrobe.runner()?.look }));
check('look persists across reload (save, equipped, runner rig)', lookAfter.save === lookBefore && lookAfter.eq === lookBefore && lookAfter.rig === lookBefore, lookAfter);

// daily seed in context A
const dailyA = await p.evaluate(() => window.__meowUgc.share.daily());

// a full meadow run with the real-input bot, invincible
const bot = await createBot(p, { mobile: false, W, H });
await bot.install();
await p.evaluate(() => { window.__meow.dev.invincible(true); window.__meow.dev.jump('meadow', 0); });
await p.waitForTimeout(800);
const meadowSpecs = await specs(p);
await bot.playUntil(() => false, { maxMs: 20000 });
// photo from pause
await p.keyboard.press('Escape');
await p.waitForTimeout(350);
check('paused mid-run', (await scr(p)) === 'pause');
await click(p, '#ugcPhoto');
check('photo mode', (await scr(p)) === 'photo');
await click(p, '.photo-shutter');
await waitFor(p, () => !!document.getElementById('photoSave'), 5000);
const dlP = p.waitForEvent('download', { timeout: 10000 }).catch(() => null);
await click(p, '#photoSave');
const photo = await dlP;
if (photo) await photo.saveAs('shots/gate-photo.png');
const pngOk = !!photo && readFileSync('shots/gate-photo.png').subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
let pngDims = '';
try { pngDims = execFileSync('file', ['shots/gate-photo.png']).toString().trim(); } catch { /* */ }
check('photo PNG saved and valid', pngOk && /PNG image data, \d+ x \d+/.test(pngDims), { name: photo?.suggestedFilename(), pngDims });
await click(p, '#photoPreviewBack');
await click(p, '.photo-back');
await click(p, '#pauseResume');
check('resumed', await waitFor(p, () => window.__meow.mode === 'play', 3000));
const run = await bot.playUntil((s) => s.mode === 'over', { maxMs: 160000 });
check('meadow finished from the start', await waitFor(p, () => document.body.dataset.screen === 'results', 10000), run && { mode: run.mode });
await p.waitForTimeout(1500);
await S(p, 'results');
// clip: the real SAVE CLIP button, then ffprobe
await click(p, '#ugcClip');
// the first clip asks for the player's name once (it goes on the end card)
if (await waitFor(p, () => !!document.getElementById('shareNameInput'), 3000)) {
  await p.fill('#shareNameInput', 'Gatekeeper');
  await click(p, '#shareNameOk');
}
check('clip sheet renders', await waitFor(p, () => { const e = document.getElementById('clipDownload'); return !!e && e.getClientRects().length > 0; }, 30000));
// the buttons stay disabled while the clip re-encodes in real time (~13 s)
check('clip rendered', await waitFor(p, () => window.__meowUgc.clip.sheet().state === 'done', 40000), await p.evaluate(() => window.__meowUgc.clip.sheet()));
const dlC = p.waitForEvent('download', { timeout: 10000 }).catch(() => null);
await click(p, '#clipDownload');
const clip = await dlC;
const clipName = clip?.suggestedFilename() ?? '';
const clipPath = `shots/gate-clip.${clipName.split('.').pop() || 'bin'}`;
if (clip) await clip.saveAs(clipPath);
let probe = null;
try {
  probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,width,height:format=duration', '-of', 'json', clipPath]).toString());
} catch (e) { probe = { error: String(e).slice(0, 200) }; }
const streams = probe?.streams ?? [];
const vid = streams.find((s) => s.codec_type === 'video');
const aud = streams.find((s) => s.codec_type === 'audio');
// decode every frame (catches a file whose header is fine but whose data is broken)
let decodeErr = '';
try { execFileSync('ffmpeg', ['-v', 'error', '-i', clipPath, '-f', 'null', '-'], { stdio: ['ignore', 'ignore', 'pipe'] }); } catch (e) { decodeErr = String(e.stderr || e).slice(0, 200); }
check('clip decodes with video + audio', !!vid && !!aud && !decodeErr && +probe.format?.duration > 2, { clipName, vid, aud, dur: probe?.format?.duration, decodeErr });
await click(p, '#clipClose');
// share: name, then the compact link
await click(p, '#ugcShare');
if (await waitFor(p, () => !!document.getElementById('shareNameInput'), 3000)) {
  await p.fill('#shareNameInput', 'Gatekeeper');
  await click(p, '#shareNameOk');
}
await waitFor(p, () => !!document.querySelector('.share-sheet'), 5000);
const link = await p.evaluate(() => window.__meowUgc.share.link());
check('challenge link from the real run', typeof link === 'string' && /\?c=/.test(link) && link.length < 2100, { len: link?.length });
await p.keyboard.press('Escape');
await p.waitForTimeout(400);

// ================================================================ B: the challenge link in a fresh context
const B = await newCtx('B');
const q = new globalThis.URL(link).search;
await B.p.goto(URL + q);
await boot(B.p);
check('challenge card in a fresh context', await waitFor(B.p, () => document.querySelector('.share-chal h2')?.textContent === 'Gatekeeper challenges you!', 6000));
check('the address bar drops ?c=', !(await B.p.evaluate(() => location.search.includes('c='))));
await S(B.p, 'challenge-card');
await click(B.p, '#shareChalPlay');
check('the challenge plays meadow', await waitFor(B.p, () => window.__meow.mode === 'play' && window.__meow.game.stage?.id === 'meadow', 4000));
check('same course as the challenger', (await specs(B.p)) === meadowSpecs);
const botB = await createBot(B.p, { mobile: false, W, H });
await botB.install();
await B.p.evaluate(() => window.__meow.dev.invincible(true));
await botB.playUntil(() => false, { maxMs: 6000 });
const g = await B.p.evaluate(() => window.__meowUgc.share.ghost());
check('the ghost races and is visible', g.active && g.visible && g.samples > 100, g);
check('race pill vs the challenger', await B.p.evaluate(() => /Gatekeeper/.test(document.getElementById('sharePill')?.textContent || '')));
await S(B.p, 'ghost');
await botB.playUntil((s) => s.mode === 'over', { maxMs: 160000 });
check('challenge results', await waitFor(B.p, () => document.body.dataset.screen === 'results', 10000));
await B.p.waitForTimeout(1500);
const banner = await B.p.evaluate(() => ({ cls: document.querySelector('.share-banner')?.className || '', txt: document.querySelector('.share-banner')?.textContent || '' }));
check('the result banner names the challenger', /share-banner (won|lost)/.test(banner.cls) && /Gatekeeper/.test(banner.txt), banner);
await S(B.p, 'challenge-results');
const dailyB = await B.p.evaluate(() => window.__meowUgc.share.daily());

// ================================================================ the Daily Run: same course in A and B
check('daily seed + landscape identical across contexts', dailyA.seed === dailyB.seed && dailyA.theme === dailyB.theme && dailyA.day === dailyB.day, { a: [dailyA.seed, dailyA.theme, dailyA.day], b: [dailyB.seed, dailyB.theme, dailyB.day] });
const dailySpecs = async (pg) => {
  await pg.evaluate(() => { window.__meow.dev.unlockAll(); window.__meowUgc.share.startDaily(); });
  await waitFor(pg, () => window.__meow.mode === 'play' && window.__meow.game.stage?.id === 'daily', 4000);
  await pg.waitForTimeout(600);
  const s = await specs(pg);
  await pg.evaluate(() => window.__meow.session.quit());
  await pg.waitForTimeout(400);
  return s;
};
await click(p, '#resMenu').catch(() => {});
const dsA = await dailySpecs(p);
const dsB = await dailySpecs(B.p);
check('daily course identical across contexts', dsA === dsB && dsA.length > 20, { len: dsA.length });

// ================================================================ C: a trail, TEST RUN, SHARE TRAIL, the ?t= link
await p.evaluate(() => { if (window.__meow.game.stage && window.__meow.mode !== 'menu') window.__meow.session.quit(); });
await p.waitForTimeout(400);
await p.evaluate(() => window.__meowUgc.trails.open());
await p.waitForTimeout(500);
check('trail maker opens', (await scr(p)) === 'trails');
await click(p, '#trailsNew');
for (const id of ['0', '4', 'a', '1', '5', '9']) await click(p, `.trails-blk[data-id="${id}"]`);
const tst = await p.evaluate(() => window.__meowUgc.trails.state());
check('a 6-block trail validates', tst.draft?.blocks.length === 6 && tst.check?.ok, tst.check);
await click(p, '#trailsTest');
check('TEST RUN plays', await waitFor(p, () => window.__meow.mode === 'play' && window.__meow.game.stage?.id === 'trail', 5000));
const tcode = await p.evaluate(() => window.__meowUgc.trails.current());
const tspecs = await specs(p);
await p.evaluate(() => window.__meow.dev.invincible(true));
await bot.playUntil((s) => s.screen === 'results', { maxMs: 150000 });
check('the maker finished the trail', (await scr(p)) === 'results');
await p.waitForTimeout(1200);
check('SHARE TRAIL shown', await p.evaluate(() => { const e = document.getElementById('ugcTrailShare'); return !!e && e.getClientRects().length > 0; }));
const tlink = await p.evaluate(() => window.__meowUgc.trails.link());
check('trail link carries ?t=', new globalThis.URL(tlink).searchParams.get('t') === tcode, { len: tlink.length });
const C = await newCtx('C');
await C.p.goto(URL + new globalThis.URL(tlink).search);
await boot(C.p);
check('trail overlay in a fresh context', await waitFor(C.p, () => !!document.getElementById('trailsLinkPlay'), 6000));
await S(C.p, 'trail-link');
await click(C.p, '#trailsLinkPlay');
check('the trail link plays', await waitFor(C.p, () => window.__meow.mode === 'play' && window.__meow.game.stage?.id === 'trail', 4000));
check('round-trip: same code', (await C.p.evaluate(() => window.__meowUgc.trails.current())) === tcode);
check('round-trip: same course', (await specs(C.p)) === tspecs);
const botC = await createBot(C.p, { mobile: false, W, H });
await botC.install();
await botC.playUntil((s) => s.screen === 'results', { maxMs: 150000 });
const tres = await C.p.evaluate(() => ({ screen: document.body.dataset.screen, hearts: window.__meow.G.hearts, s: Math.round(window.__meow.P.s) }));
check('the shared trail is finishable (not invincible)', tres.screen === 'results' && tres.hearts > 0, tres);
await S(C.p, 'trail-results');

console.log('ERRORS', errs.length, errs.slice(0, 8));
console.log(fails.length || errs.length ? `RELEASE GATE FAILED: ${fails.join(', ')}` : 'RELEASE GATE OK');
await b.close();
process.exit(fails.length || errs.length ? 1 : 0);
