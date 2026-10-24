// SHARE lane shots: challenge links with ghost racing, the share sheet + card, the Daily Run.
//   node shots/share-shots.mjs            desktop 1280x720, then phone 390x844
//   node shots/share-shots.mjs 390 844    one viewport
// MEOW_URL (default http://127.0.0.1:5183/). Exits 1 on a failed check or a page/console error from the SHARE lane or
// the core (errors pointing into another lane's folder are reported, not failed, while lanes work in parallel).
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { createBot } from './bot.mjs';

const URL = process.env.MEOW_URL || 'http://127.0.0.1:5183/';
const views = process.argv[2] ? [[+process.argv[2], +(process.argv[3] || 720)]] : [[1280, 720], [390, 844]];
const OTHER_LANES = /src\/(clip|photo|wardrobe|cat|style|juice|trails|stages|setpieces)\//;
const fails = [];
const foreign = [];

async function launch() {
  try {
    return await chromium.launch({ args: ['--use-angle=metal'] });
  } catch {
    return chromium.launch({ args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
  }
}

async function run(W, H) {
  const mobile = W < 600;
  const tag = mobile ? 'm' : 'd';
  const b = await launch();
  const ctx = await b.newContext({ viewport: { width: W, height: H }, hasTouch: mobile, isMobile: mobile });
  const errs = [];
  const watch = (p) => {
    p.on('pageerror', (e) => errs.push(`${e}\n${e.stack || ''}`));
    p.on('console', (m) => {
      if (m.type() === 'error') errs.push(`${m.text()} @ ${m.location()?.url || ''}`);
    });
  };
  const check = (name, ok, info) => {
    console.log(ok ? 'ok  ' : 'FAIL', `[${tag}]`, name, info === undefined ? '' : JSON.stringify(info));
    if (!ok) fails.push(`[${tag}] ${name}`);
  };
  let n = 0;
  const S = (p, name) => p.screenshot({ path: `shots/share-${tag}-${String(++n).padStart(2, '0')}-${name}.png` });
  const waitFor = async (p, fn, ms, arg) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      if (await p.evaluate(fn, arg).catch(() => false)) return true;
      await p.waitForTimeout(150);
    }
    return false;
  };
  const tapOrClick = async (p, sel) => {
    if (mobile) await p.tap(sel);
    else await p.click(sel);
    await p.waitForTimeout(250);
  };
  /** run fn() in the page (it returns a Blob) and write it to shots/ */
  const saveBlob = async (p, name, fn) => {
    const r = await p.evaluate(async (src) => {
      const b = await (0, eval)(src)();
      const buf = new Uint8Array(await b.arrayBuffer());
      let s = '';
      for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      return { type: b.type, size: b.size, b64: btoa(s) };
    }, fn.toString());
    writeFileSync(`shots/share-${tag}-${String(++n).padStart(2, '0')}-${name}.png`, Buffer.from(r.b64, 'base64'));
    return r;
  };
  const boot = async (p) => {
    await p.waitForFunction(() => window.__meow && window.__meow.dev && window.__meowUgc && window.__meowUgc.share, null, { timeout: 30000 });
    await p.waitForTimeout(1200);
  };

  // ------------------------------------------------------------------ 1. a synthetic challenge
  const a = await ctx.newPage();
  watch(a);
  await a.goto(URL);
  await a.evaluate(() => localStorage.clear());
  await a.reload();
  await boot(a);
  const made = await a.evaluate(async () => {
    const h = window.__meowUgc.share;
    const samples = [];
    // a clean 20 u/s run with a gentle weave, 2 minutes
    for (let i = 0; i <= 6 * 120; i++) samples.push({ s: (20 * i) / 6, x: 1.6 * Math.sin(i / 9), y: 0, flags: 0 });
    const code = await h.encode({ v: 1, stage: 'meadow', score: 512340, name: 'Mia', look: '3a0210', chain: 12, ghost: h.packGhost(samples, 6) });
    const back = await h.decode(code);
    return { code, len: code.length, name: back?.name, ghostLen: back?.ghost?.length ?? 0 };
  });
  console.log(`[${tag}] synthetic challenge code: ${made.len} chars (2 min ghost)`);
  check('synthetic challenge round-trips', made.name === 'Mia' && made.ghostLen > 1000, made);
  await a.close();

  // ------------------------------------------------------------------ 2. open the link in a fresh page
  const p = await ctx.newPage();
  watch(p);
  await p.goto(`${URL}?c=${made.code}`);
  await boot(p);
  check('challenge card shows', await waitFor(p, () => !!document.querySelector('.share-chal .card'), 5000));
  check('card text', await p.evaluate(() => document.querySelector('.share-chal h2')?.textContent === 'Mia challenges you!' && /512,340/.test(document.querySelector('.share-chal-beat')?.textContent || '')));
  check('?c= removed from the address bar', await p.evaluate(() => !location.search.includes('c=')));
  await S(p, 'challenge-card');
  // a broken link toasts
  await p.evaluate(() => window.__meowUgc.share.openLink('AAAAbroken'));
  check('broken link toast', await waitFor(p, () => /broken/.test(document.getElementById('ugc-toast')?.textContent || ''), 2000));

  await tapOrClick(p, '#shareChalPlay');
  check('PLAY starts meadow', await waitFor(p, () => window.__meow.mode === 'play' && window.__meow.game.stage.id === 'meadow', 3000));
  const bot = await createBot(p, { mobile, W, H });
  await bot.install();
  await p.evaluate(() => window.__meow.dev.invincible(true));
  await bot.playUntil(() => false, { maxMs: 6000 });
  const g1 = await p.evaluate(() => window.__meowUgc.share.ghost());
  check('ghost active after 6 s', g1.active && g1.samples > 100, g1);
  check('ghost visible near the player', g1.visible, g1);
  const pill = await p.evaluate(() => {
    const e = document.getElementById('sharePill');
    return { on: e?.classList.contains('on'), text: e?.textContent, shown: e ? getComputedStyle(e).display !== 'none' : false };
  });
  check('race pill shows "vs Mia"', pill.on && pill.shown && /vs Mia [+-][\d,]+ m/.test(pill.text), pill);
  check('ghost recorded too', g1.recorded > 20, g1.recorded);
  await S(p, 'race-ghost');

  // ------------------------------------------------------------------ 3. results banner
  await p.evaluate(() => window.__meow.dev.jump('meadow', 0.985));
  await bot.playUntil((st) => st.mode === 'over', { maxMs: 30000 });
  check('results shown', await waitFor(p, () => document.body.dataset.screen === 'results', 8000));
  const banner = await p.evaluate(() => document.querySelector('#results .share-banner')?.textContent || '');
  check('results banner (Mia wins)', /Mia wins by [\d,]+ - rematch\?/.test(banner), banner);
  check('SHARE button visible', await p.evaluate(() => !document.getElementById('ugcShare').classList.contains('hidden')));
  await p.waitForTimeout(1200);
  await S(p, 'results-banner');

  // ------------------------------------------------------------------ 4. share: name, sheet, card, link
  await p.evaluate(() => window.__meowUgc.share.devAllowPartial(true));
  await tapOrClick(p, '#ugcShare');
  check('name prompt', await waitFor(p, () => !!document.getElementById('shareNameInput'), 3000));
  await p.fill('#shareNameInput', 'Zig<script>');
  check('name sanitised live', (await p.inputValue('#shareNameInput')) === 'Zigscript', await p.inputValue('#shareNameInput'));
  await p.fill('#shareNameInput', 'Zig');
  await S(p, 'name');
  await tapOrClick(p, '#shareNameOk');
  check('sheet opens', await waitFor(p, () => !!document.querySelector('.share-sheet .card'), 3000));
  check('card preview ready', await waitFor(p, () => { const i = document.querySelector('.share-prev img'); return !!i && i.complete && i.naturalWidth === 1080; }, 8000));
  check('name saved', (await p.evaluate(() => window.__meow.dev.save().player.name)) === 'Zig');
  check('chip shows the name', (await p.evaluate(() => document.querySelector('.share-chip-name')?.textContent)) === 'Zig');
  check('CHALLENGE A FRIEND offered', await p.evaluate(() => !document.getElementById('shareChallenge').classList.contains('hidden')));
  await p.waitForTimeout(300);
  await S(p, 'sheet');
  const link = await p.evaluate(() => window.__meowUgc.share.link());
  const dec = await p.evaluate(async (l) => {
    const code = new URL(l).searchParams.get('c');
    const c = await window.__meowUgc.share.decode(code);
    const g = c ? window.__meowUgc.share.unpackGhost(c.ghost) : null;
    return c ? { name: c.name, stage: c.stage, score: c.score, ghost: c.ghost.length, g } : null;
  }, link || 'http://x/?c=');
  console.log(`[${tag}] send-back link: ${link?.length} chars`, JSON.stringify(dec));
  check('link < 3000 chars', !!link && link.length < 3000, link?.length);
  check('link decodes with name Zig and a ghost', dec?.name === 'Zig' && dec.ghost > 0 && dec.stage === 'meadow', dec);
  const card = await saveBlob(p, 'card', () => window.__meowUgc.share.cardBlob());
  if (!mobile) {
    await saveBlob(p, 'card-sample-won', () => window.__meowUgc.share.sampleCard({ sticker: 'BEAT MIA!', best: true, stars: [true, true, true] }));
    await saveBlob(p, 'card-sample-trail', () => window.__meowUgc.share.sampleCard({ kind: 'trail', trailName: 'Loopy Gorge', name: 'Žygimantas', score: 98765, style: { bestChain: 0, tricks: 0, stylePoints: 0, rank: '' } }));
  }
  check('card is a PNG > 100 KB', card.type === 'image/png' && card.size > 100000, card.size);
  // COPY LINK counts a share
  await p.context().grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
  await tapOrClick(p, '#shareCopy');
  check('copy counts a share', await waitFor(p, () => window.__meow.dev.save().ugcStats.shares >= 1, 3000));
  await tapOrClick(p, '#shareClose');
  check('sheet closed', await p.evaluate(() => !document.querySelector('.share-sheet')));
  await p.evaluate(() => window.__meowUgc.share.devAllowPartial(false));

  // ------------------------------------------------------------------ 5. Daily Run: same course twice
  await p.evaluate(() => window.__meow.dev.unlockAll());
  await tapOrClick(p, '#resMenu');
  check('DAILY RUN on the stage map', await p.evaluate(() => !document.getElementById('ugcDailyCard').classList.contains('hidden')));
  await S(p, 'select-daily');
  await tapOrClick(p, '#ugcDailyCard');
  check('daily playing', await waitFor(p, () => window.__meow.mode === 'play' && window.__meow.game.stage.id === 'daily', 3000));
  const name1 = await p.evaluate(() => window.__meow.game.stage.name);
  check('named Daily Run', name1 === 'Daily Run', name1);
  await bot.playUntil(() => false, { maxMs: 8000 });
  const specs = () => p.evaluate(() => window.__meow.session.sessionInfo.specs.slice(0, 25).map((s) => ({ type: s.type, s: Math.round(s.s * 100) / 100 })));
  const run1 = await specs();
  const theme1 = await p.evaluate(() => window.__meow.game.stage.theme);
  await S(p, 'daily-run');
  await p.evaluate(() => window.__meow.session.quit());
  await p.waitForTimeout(400);
  check('back on the title', (await p.evaluate(() => document.body.dataset.screen)) === 'title');
  check('DAILY on the title', await p.evaluate(() => !document.getElementById('ugcDaily').classList.contains('hidden')));
  await tapOrClick(p, '#ugcDaily');
  check('daily again', await waitFor(p, () => window.__meow.mode === 'play' && window.__meow.game.stage.id === 'daily', 3000));
  const run2 = await specs();
  const theme2 = await p.evaluate(() => window.__meow.game.stage.theme);
  check('same 25 specs both times', run1.length === 25 && JSON.stringify(run1) === JSON.stringify(run2), { a: run1.slice(0, 4), b: run2.slice(0, 4), n: run1.length });
  check('same landscape', theme1 === theme2, [theme1, theme2]);
  // let it end: hands off, no invincibility
  await p.evaluate(() => window.__meow.dev.invincible(false));
  check('daily run ends', await waitFor(p, () => window.__meow.mode === 'over', 150000));
  check('daily results', await waitFor(p, () => document.body.dataset.screen === 'results', 6000));
  await p.waitForTimeout(1300);
  const saved = await p.evaluate(() => { const s = window.__meow.dev.save(); return { daily: s.daily, plays: s.ugcStats.dailyPlays, today: window.__meowUgc.share.daily() }; });
  check('daily best saved', saved.daily.day === saved.today.day && saved.daily.best > 0 && saved.plays === 1, saved);
  await S(p, 'daily-results');
  await saveBlob(p, 'daily-card', () => window.__meowUgc.share.cardBlob());
  const dlink = await p.evaluate(() => window.__meowUgc.share.link());
  const ddec = await p.evaluate(async (l) => { const c = l && (await window.__meowUgc.share.decode(new URL(l).searchParams.get('c'))); return c ? { stage: c.stage, seed: c.seed, theme: c.theme, ghost: c.ghost.length } : null; }, dlink);
  console.log(`[${tag}] daily link: ${dlink?.length} chars`, JSON.stringify(ddec));
  check('daily link carries the seed and a ghost', ddec?.stage === 'daily' && ddec.seed === saved.today.seed && ddec.ghost > 0, ddec);
  await tapOrClick(p, '#ugcShare');
  check('daily sheet opens without asking the name again', await waitFor(p, () => !!document.querySelector('.share-sheet .card') && !document.getElementById('shareNameInput'), 3000));
  await waitFor(p, () => { const i = document.querySelector('.share-prev img'); return !!i && i.complete && i.naturalWidth > 0; }, 8000);
  await S(p, 'daily-sheet');
  await p.keyboard.press('Escape');
  check('Esc closes the sheet, results stay', await waitFor(p, () => !document.querySelector('.share-sheet') && document.body.dataset.screen === 'results', 2000));

  // ------------------------------------------------------------------ 6. an endless run becomes a replayable course
  if (!mobile) {
    await p.evaluate(() => window.__meow.dev.jump('endless', 0));
    await p.waitForTimeout(500);
    const e1 = await p.evaluate(() => ({ seed: window.__meow.G.seed, theme: window.__meow.game.stage.theme, specs: window.__meow.session.sessionInfo.specs.slice(0, 25).map((s) => ({ type: s.type, s: Math.round(s.s * 100) / 100 })) }));
    await p.evaluate(() => window.__meow.session.quit());
    const code = await p.evaluate((e) => window.__meowUgc.share.encode({ v: 1, stage: 'daily', seed: e.seed, theme: e.theme, score: 1234, name: 'Endless Ed', look: '000000', chain: 0, ghost: [] }), e1);
    await p.evaluate((c) => window.__meowUgc.share.openLink(c), code);
    check('endless challenge card', await waitFor(p, () => /Endless challenge/.test(document.querySelector('.share-chal-course')?.textContent || ''), 3000));
    await tapOrClick(p, '#shareChalPlay');
    await waitFor(p, () => window.__meow.mode === 'play' && window.__meow.game.stage.id === 'daily', 3000);
    const e2 = await p.evaluate(() => ({ name: window.__meow.game.stage.name, theme: window.__meow.game.stage.theme, specs: window.__meow.session.sessionInfo.specs.slice(0, 25).map((s) => ({ type: s.type, s: Math.round(s.s * 100) / 100 })) }));
    check('endless seed replays the same course', e2.name === 'Endless challenge' && e2.theme === e1.theme && JSON.stringify(e2.specs) === JSON.stringify(e1.specs), { seed: e1.seed, a: e1.specs.slice(0, 3), b: e2.specs.slice(0, 3) });
    await p.evaluate(() => window.__meow.session.quit());
  }

  for (const e of errs) (OTHER_LANES.test(e) ? foreign : fails).push(`[${tag}] ${OTHER_LANES.test(e) ? 'other lane: ' : 'error: '}${e.slice(0, 400)}`);
  await b.close();
}

for (const [W, H] of views) await run(W, H);
if (foreign.length) console.log(`\nOTHER LANES (reported, not failed):\n${foreign.join('\n')}`);
if (fails.length) {
  console.log(`\nSHARE SHOTS FAILED (${fails.length}):\n${fails.join('\n')}`);
  process.exit(1);
}
console.log('\nSHARE SHOTS OK');
