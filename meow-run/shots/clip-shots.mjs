// CLIP lane shots (ITERATION2.md 6.1): node shots/clip-shots.mjs [d|m|both]   (MEOW_URL, default http://127.0.0.1:5181/)
// 1. gorge, 14 s of bot play, pause -> SAVE CLIP -> the sheet renders (size, type, time, segments) -> close stays paused
// 2. meadow near the finish -> results -> SAVE CLIP 9:16 -> the file at 1 s (watermark, crop) and the end card;
//    DOWNLOAD bumps ugcStats.clips
// 3. Settings: Replays OFF -> no recorder, no SAVE CLIP -> back to AUTO records again
// 4. fps on 390x844 LOW with capture on vs off (clock.frame over 5 s)
// Exits 1 on a failed check or a page/console error (errors from other lanes' folders are reported, not failed).
import { chromium } from '@playwright/test';
import { createBot } from './bot.mjs';

const URL = process.env.MEOW_URL || 'http://127.0.0.1:5181/';
const which = process.argv[2] || 'both';
const gpu = process.env.MEOW_SWIFT ? ['--use-gl=angle', '--enable-unsafe-swiftshader'] : ['--use-angle=metal'];
const OTHER = /src\/(photo|share|style|trails|wardrobe|juice|stages|setpieces|cat)\//;
const fails = [];
const report = [];

async function run(mobile) {
  const W = mobile ? 390 : 1280, H = mobile ? 844 : 720;
  const tag = mobile ? 'm' : 'd';
  const b = await chromium.launch({ args: gpu });
  const ctx = await b.newContext({ viewport: { width: W, height: H }, hasTouch: mobile, isMobile: mobile, acceptDownloads: true });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => (OTHER.test(String(e.stack || e)) ? report.push(`[other lane] ${e}`) : errs.push(String(e))));
  p.on('console', (m) => {
    if (m.type() !== 'error') return;
    const where = `${m.text()} ${m.location()?.url ?? ''}`;
    if (OTHER.test(where)) report.push(`[other lane] ${m.text()}`);
    else { errs.push(m.text()); console.log("CONSOLE-ERROR at step", n, m.text().slice(0, 80)); }
  });
  let n = 0;
  const S = (name) => p.screenshot({ path: `shots/clip-${tag}-${String(++n).padStart(2, '0')}-${name}.png` });
  const check = (name, ok, info) => {
    console.log(ok ? 'ok  ' : 'FAIL', `[${tag}]`, name, info === undefined ? '' : JSON.stringify(info));
    if (!ok) fails.push(`[${tag}] ${name}`);
  };
  const click = async (sel) => { if (mobile) await p.tap(sel); else await p.click(sel); await p.waitForTimeout(250); };
  const waitFor = async (fn, ms, arg) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await p.evaluate(fn, arg).catch(() => false)) return true; await p.waitForTimeout(150); } return false; };
  const st = () => p.evaluate(() => ({ ...window.__meowUgc.clip.state(), ready: window.__meowUgc.clip.ready(), mode: window.__meow.mode, screen: document.body.dataset.screen }));
  const visible = (sel) => p.evaluate((s) => { const e = document.querySelector(s); return !!e && !e.classList.contains('hidden') && e.getBoundingClientRect().height > 0; }, sel);
  const pause = async () => { if (mobile) await click('#pauseBtn'); else { await p.keyboard.press('Escape'); await p.waitForTimeout(300); } };
  const bot = await createBot(p, { mobile, W, H });

  await p.goto(URL);
  await p.evaluate(() => localStorage.clear());
  await p.reload();
  await p.waitForFunction(() => window.__meow && window.__meow.dev && window.__meowUgc?.clip, null, { timeout: 30000 });
  await p.waitForTimeout(1200);
  await bot.install();
  const s0 = await st();
  check('capture enabled on AUTO', s0.enabled === true, s0);
  report.push(`[${tag}] recording mime: ${s0.mime}`);
  check('idle on the title: no recorder', s0.recording === false, s0);

  // ---------------------------------------------------------------- 1. pause -> SAVE CLIP
  await p.evaluate(() => window.__meow.dev.unlockAll());
  await click('#play');
  await click('.stage[data-id="gorge"]'); // a real gesture: the audio context starts
  await p.evaluate(() => { window.__meow.dev.invincible(true); window.__meow.dev.jump('gorge', 0.1); });
  await p.waitForTimeout(300);
  check('recording during play', (await st()).recording === true, await st());
  await bot.playUntil(() => false, { maxMs: 14000 });
  await pause();
  check('paused', (await st()).mode === 'paused', await st());
  check('#ugcClipPause visible', await visible('#ugcClipPause'));
  await S('pause-card');
  await click('#ugcClipPause');
  check('sheet open', await visible('.clip-sheet'));
  await p.waitForTimeout(4000);
  await S('sheet-rendering');
  check('live preview canvas while rendering', await p.evaluate(() => !!document.querySelector('.clip-stage canvas')));
  const done1 = await waitFor(() => window.__meowUgc.clip.sheet().state !== 'rendering', 35000);
  const info1 = await p.evaluate(() => window.__meowUgc.clip.sheet());
  const s1 = await st();
  check('render finished', done1 && info1.state === 'done', info1);
  check('clip > 50 KB', info1.size > 50 * 1024, info1.size);
  check('video type', /^video\/(mp4|webm)/.test(info1.type), info1.type);
  check('render under 20 s', info1.ms > 0 && info1.ms < 20000, info1.ms);
  check('ring held >= 2 segments', s1.segments >= 2, s1);
  report.push(`[${tag}] pause clip: ${(info1.size / 1024).toFixed(0)} KB ${info1.type} ${info1.aspect} in ${info1.ms} ms; ring ${s1.segments} segments ${s1.seconds}s ${(s1.bytes / 1048576).toFixed(1)} MB`);
  await p.waitForTimeout(600);
  await S('sheet-done');
  if (mobile) await click('#clipClose'); else { await p.keyboard.press('Escape'); await p.waitForTimeout(300); }
  check('sheet closed', !(await visible('.clip-sheet')));
  const s1b = await st();
  check('still paused after closing', s1b.mode === 'paused' && s1b.screen === 'pause', s1b);
  await click('#pauseResume');
  check('resumed', (await st()).mode === 'play');
  await p.waitForTimeout(800);
  check('recording again after resume', (await st()).recording === true, await st());

  // ---------------------------------------------------------------- 2. results -> SAVE CLIP vertical
  await p.evaluate(() => window.__meow.dev.jump('meadow', 0.97));
  await bot.playUntil((x) => x.mode === 'over', { maxMs: 30000 });
  check('results shown', await waitFor(() => document.body.dataset.screen === 'results', 6000), await st());
  check('#ugcClip visible on results', await visible('#ugcClip'));
  await S('results');
  await click('#ugcClip');
  if (!mobile) {
    await p.waitForTimeout(300);
    await click('.clip-aspect button[data-a="9:16"]');
  } else check('portrait phone: 9:16 only (toggle hidden)', !(await visible('.clip-aspect')));
  const done2 = await waitFor(() => window.__meowUgc.clip.sheet().state !== 'rendering', 35000);
  const info2 = await p.evaluate(() => window.__meowUgc.clip.sheet());
  check('vertical clip done', done2 && info2.state === 'done' && info2.aspect === '9:16', info2);
  report.push(`[${tag}] results clip: ${(info2.size / 1024).toFixed(0)} KB ${info2.type} ${info2.aspect} in ${info2.ms} ms`);
  if (!mobile) check('vertical choice saved', (await p.evaluate(() => window.__meow.dev.save().settings.clipVertical)) === true);
  await p.waitForTimeout(500);
  await S('results-sheet-vertical');
  // the file itself at 1 s and on the end card
  const meta = await p.evaluate(async () => {
    const src = document.querySelector('.clip-stage video')?.src;
    const v = document.createElement('video');
    v.id = 'clipCheck';
    v.muted = true;
    v.playsInline = true;
    v.style.cssText = 'position:fixed;inset:0;margin:auto;height:100%;max-width:100%;z-index:999;background:#000';
    document.body.appendChild(v);
    v.src = src;
    await new Promise((r) => (v.onloadeddata = r));
    await new Promise((r) => { v.onseeked = r; v.currentTime = 1; });
    return { w: v.videoWidth, h: v.videoHeight, dur: v.duration };
  });
  check('clip is 9:16', meta.h > meta.w && Math.abs(meta.w / meta.h - 9 / 16) < 0.02, meta);
  check('clip length 3..15 s', meta.dur > 3 && meta.dur < 15, meta);
  await p.waitForTimeout(200);
  await S('file-1s');
  await p.evaluate(async () => { const v = document.getElementById('clipCheck'); await new Promise((r) => { v.onseeked = r; v.currentTime = Math.max(0, v.duration - 0.25); }); });
  await p.waitForTimeout(200);
  await S('file-endcard');
  await p.evaluate(() => document.getElementById('clipCheck').remove());
  const clips0 = await p.evaluate(() => window.__meow.dev.save().ugcStats.clips);
  const dl = p.waitForEvent('download', { timeout: 5000 }).catch(() => null);
  await click('#clipDownload');
  const d = await dl;
  check('DOWNLOAD gives a file', !!d && /^meowrun-clip-.*\.(mp4|webm)$/.test(d.suggestedFilename()), d?.suggestedFilename());
  check('ugcStats.clips bumped', (await p.evaluate(() => window.__meow.dev.save().ugcStats.clips)) === clips0 + 1);
  await p.waitForTimeout(200);
  await S('toast');
  await click('#clipClose');
  check('results still shown', (await st()).screen === 'results');

  // ---------------------------------------------------------------- 3. Replays OFF
  await p.evaluate(() => window.__meow.dev.jump('meadow', 0.2));
  await p.waitForTimeout(400);
  await pause();
  await click('#pauseSettings');
  check('Replays row in settings', await visible('#setCapture') && await visible('#setClipVertical'));
  await click('#setCapture button[data-c="off"]');
  await S('settings-off');
  check('setting saved off', (await p.evaluate(() => window.__meow.dev.save().settings.capture)) === 'off');
  await click('#settingsDone');
  await click('#pauseResume');
  await bot.playUntil(() => false, { maxMs: 5000 });
  const s3 = await st();
  check('OFF: no recorder, not ready', s3.recording === false && s3.ready === false && s3.enabled === false && s3.segments === 0, s3);
  await pause();
  check('OFF: no SAVE CLIP on pause', !(await visible('#ugcClipPause')));
  await click('#pauseSettings');
  await click('#setCapture button[data-c="auto"]');
  await click('#settingsDone');
  await click('#pauseResume');
  await p.waitForTimeout(1500);
  check('AUTO again: recording', (await st()).recording === true, await st());

  // ---------------------------------------------------------------- 4. fps capture on vs off (phones, LOW)
  if (mobile) {
    await p.evaluate(() => { window.__meow.quality.set('low'); window.__botPassive = true; });
    const fps = async () => {
      await p.evaluate(() => window.__meow.dev.jump('meadow', 0.05));
      await p.waitForTimeout(1500);
      return p.evaluate(() => new Promise((r) => { const f0 = window.__meow.clock.frame, t0 = performance.now(); setTimeout(() => r(((window.__meow.clock.frame - f0) * 1000) / (performance.now() - t0)), 5000); }));
    };
    const on = [], off = [];
    for (let i = 0; i < 2; i++) {
      await p.evaluate(() => window.__meowUgc.clip.setMode('auto'));
      on.push(await fps());
      check('fps run records', (await st()).recording === true);
      await p.evaluate(() => window.__meowUgc.clip.setMode('off'));
      off.push(await fps());
    }
    const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    const fOn = avg(on), fOff = avg(off);
    report.push(`[m] fps 390x844 LOW: capture on ${fOn.toFixed(1)} (${on.map((x) => x.toFixed(1)).join(', ')}), off ${fOff.toFixed(1)} (${off.map((x) => x.toFixed(1)).join(', ')})`);
    check('fps with capture within 5% of off', fOn >= fOff * 0.95, { fOn, fOff });
    await p.evaluate(() => { window.__meowUgc.clip.setMode('auto'); window.__botPassive = false; });
  }

  check('no page/console errors', errs.length === 0, errs.slice(0, 5));
  await b.close();
}

if (which === 'd' || which === 'both') await run(false);
if (which === 'm' || which === 'both') await run(true);
console.log('\n' + report.join('\n'));
if (fails.length) {
  console.log('\nCLIP SHOTS FAILED:', fails.join('; '));
  process.exit(1);
}
console.log('\nCLIP SHOTS OK');
