// Trailer capture, group B (STORYBOARD section 8, group B): flyovers, drift and items, modes, editor, dare, end card.
//   node review/trailer/capture-b.mjs [S14 S16 ...] [--aspect 16x9|9x16]
// Needs the game build served on TRAILER_B_PORT (default 6212):
//   vite build --outDir review/trailer/build/dist-B --emptyOutDir
//   vite preview --outDir review/trailer/build/dist-B --host 127.0.0.1 --port 6212 --strictPort
// Every take is frame-stepped on a virtual clock (clock-shim-b.js): one sim step per 1/60 s frame, a CDP screenshot per
// frame, piped to H.264 (CRF 10) at build/footage/B/<shot>-<aspect>.mp4, with a per-frame manifest (<shot>-<aspect>.json:
// tick, player si/rail/air/surface, the frame's race events). Anchors (seed, tick) were found by probe sweeps at 8 sim
// steps per frame (build/tmp/*.mjs during the session); they are fixed below so a re-run gives the same takes.
import fs from 'node:fs';
import path from 'node:path';
import { openPage, waitWorld, hideDom, fullRes, record, closeBrowser, Q, OUT_B, BUILD, writeAnchor } from './capture-lib-b.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const H = 60; // handle frames before the cut window

/**
 * Race shots: `start` = first recorded tick (= anchor tick - `at` - H), `frames` recorded, `gives` = items handed to the
 * player at an exact tick (as e2e/items.spec.ts; the bot fires at once), `after` = page code run once at `start`.
 */
const RACE = {
  // seed 2: drift tier 1 @411, tier 2 @431, tier 3 (pink) @459, release (miniTurbo a=3) @478
  S14: { url: `/?track=kitchen&bot=1&cls=2&seed=2${Q}`, anchor: 459, at: 30, frames: 170, note: 'driftTier a=3' },
  S15: { url: `/?track=kitchen&bot=1&cls=2&seed=2${Q}`, anchor: 478, at: 6, frames: 170, note: 'miniTurbo a=3 (same take as S14)' },
  // seed 1: hairball given @996 (thrown at once), hits kart 6 @1008, we overtake it @1028
  S16: { url: `/?track=rooftops&bot=1&cls=2&seed=1${Q}`, anchor: 1008, at: 30, frames: 170, gives: [[996, 'hairball']], note: 'hit b=me' },
  // seed 2: zoomies given @570 (boost @570), rams kart 1 @575, passes @582, rams kart 7 @591
  S17: { url: `/?track=rooftops&bot=1&cls=2&seed=2${Q}`, anchor: 570, at: 4, frames: 145, gives: [[570, 'zoomies']], note: 'boost (zoomies)' },
  // seed 1: box given @593 with a rival just ahead
  S18: { url: `/?track=cafe&bot=1&cls=2&seed=1${Q}`, anchor: 593, at: 0, frames: 145, gives: [[593, 'box']], note: 'box on the kart' },
  // seed 7 (arena = Balloon Battle): we pop kart 1's balloon @786, the yellow kart right beside us (4 m ahead)
  S22: { url: `/?track=rug&bot=1&seed=7${Q}`, anchor: 786, at: 40, frames: 195, note: 'balloonPop b=me' },
};

// probe overrides while choosing takes: TRAILER_OVERRIDE='S22:7:786' (shot:seed:anchor)
for (const o of (process.env.TRAILER_OVERRIDE ?? '').split(',').filter(Boolean)) {
  const [id, seed, anchor] = o.split(':');
  RACE[id] = { ...RACE[id], url: RACE[id].url.replace(/seed=\d+/, `seed=${seed}`), anchor: Number(anchor) };
}

const FLY = { S08: 'kitchen', S09: 'rooftops', S10: 'laundry', S11: 'yarn', S12: 'cafe', S13: 'shelter' };

async function freezeMute(page) {
  await page.evaluate(() => {
    window.__cap.freeze();
    const s = window.__fm?.shell;
    if (s) s.audio.muted = true;
  });
}

async function raceShot(id, aspect) {
  const r = RACE[id];
  const o = await openPage(aspect, r.url);
  await waitWorld(o.page);
  await freezeMute(o.page);
  await fullRes(o.page);
  await hideDom(o.page);
  const start = r.anchor - r.at - H;
  // item gives: hooked on the world's step, so they land on the exact tick in the fast-forward as in the take
  if (r.gives?.length)
    await o.page.evaluate((gives) => {
      window.__capB.onTick((w) => {
        for (const [t, item] of gives)
          if (w.st.tick === t) {
            const k = w.st.karts[w.cfg.humans[0]];
            k.item = item;
            k.itemCount = 1;
            k.rouletteTicks = 0;
          }
      });
    }, r.gives);
  const got = await o.page.evaluate((T) => window.__capB.toTick(T), start);
  if (got !== start) throw new Error(`${id}: reached tick ${got}, wanted ${start}`);
  const file = path.join(OUT_B, `${id}-${aspect}.mp4`);
  const m = await record(o, file, r.frames);
  const me = await o.page.evaluate(() => window.__fm.shell.world.cfg.humans[0]);
  // the frame that steps the anchor tick (take f0 steps tick start -> start + 1) shows the anchor event
  const anchorFrame = m.findIndex((f) => f.tick === r.anchor + 1);
  writeAnchor(id, { url: r.url, anchor: r.anchor, cutAt: r.at, takeStartTick: start, anchorTakeFrame: anchorFrame, cutStartTakeFrame: anchorFrame - r.at, note: r.note, me });
  await o.close();
  return { file, frames: m.length, errors: o.errors, check: checkSteps(m) };
}

/** frames that ran 0 or 2+ sim steps (hit-stop frames are expected to be 0) */
function checkSteps(m) {
  const bad = m.filter((f, i) => i > 0 && f.d !== 1).map((f) => `${f.f}:${f.d}`);
  return bad.length ? `non-1 step frames ${bad.slice(0, 12).join(' ')}${bad.length > 12 ? '…' : ''}` : 'ok';
}

async function flyShot(id, aspect) {
  const track = FLY[id];
  const url = `/?track=${track}&seed=3${Q}`;
  const o = await openPage(aspect, url);
  await waitWorld(o.page);
  await freezeMute(o.page);
  await fullRes(o.page);
  await hideDom(o.page);
  // restart the game's own intro flyover on the virtual clock (it began while the page loaded in real time)
  const ok = await o.page.evaluate(() => {
    const c = window.__fm.shell.camera;
    if (c.mode !== 'flyover') return c.mode;
    c.setMode('flyover', c.params);
    return 'flyover';
  });
  if (ok !== 'flyover') throw new Error(`${id}: camera mode ${ok} at freeze`);
  const file = path.join(OUT_B, `${id}-${aspect}.mp4`);
  const times = [];
  const m = await record(o, file, 360, {
    perFrame: async () => {
      times.push(await o.page.evaluate(() => window.__fm.shell.camera.modeTime));
    },
  });
  // default pick: modeTime 1.2 s to 1.62 s = take frames 72..97 (modeTime is read before each frame steps)
  writeAnchor(id, { url, flyover: true, cutStartTakeFrame: 72, note: 'whole flyover from modeTime 0; default cut = take f72-97 (modeTime 1.2-1.62 s)' });
  await o.close();
  return { file, frames: m.length, errors: o.errors, check: 'flyover' };
}

async function podiumShot(id, aspect) {
  const url = `/?track=kitchen&bot=1&seed=7${Q}`;
  const o = await openPage(aspect, url);
  await waitWorld(o.page);
  await freezeMute(o.page);
  await fullRes(o.page);
  await hideDom(o.page);
  // capture-only framing: the podium screen frames the plinths beside its results panel (left of it in landscape,
  // above it in portrait); with the DOM hidden the trailer centres them instead (same orbit, no side / lift offset,
  // 15 % closer in landscape). The game's own camera code runs first; this only moves the camera just before the draw.
  await o.page.evaluate(() => {
    const s = window.__fm.shell;
    const r = s.stage.renderer;
    const orig = r.render.bind(r);
    r.render = (scene, cam) => {
      const sr = window.__fmModes.showroom;
      if (sr && sr.active && sr.kind === 'podium' && scene !== s.stage.scene) {
        const aspect = cam.aspect;
        const tanH = Math.tan((cam.fov * Math.PI) / 360);
        const portrait = aspect < 1;
        const dist = (portrait ? Math.max(12, 4.3 / (tanH * Math.max(0.3, aspect))) : 12.5 * 0.85);
        const ang = Math.sin(sr.time * 0.25) * 0.3;
        cam.position.set(Math.sin(ang) * dist, 3.2, Math.cos(ang) * dist);
        cam.lookAt(0, 2.0, 0);
        cam.updateMatrixWorld();
      }
      return orig(scene, cam);
    };
  });
  await o.page.evaluate(() => {
    const s = window.__fm.shell;
    const top3 = s.racers.slice(0, 3).map((r) => ({ ...r }));
    s.leaveRace();
    window.__fmModes.podiumScene(top3, 1);
  });
  // the showroom chunk loads (network, not timers): wait for it to go active, still frozen
  for (let i = 0; i < 200; i++) {
    const on = await o.page.evaluate(() => {
      const sr = window.__fmModes.showroom;
      return !!sr && sr.active && sr.kind === 'podium';
    });
    if (on) break;
    await sleep(50);
  }
  const file = path.join(OUT_B, `${id}-${aspect}.mp4`);
  const m = await record(o, file, 195, { stepFn: 'window.__cap.step(1)' });
  writeAnchor(id, { url, podium: true, confettiTakeFrame: 21, cutStartTakeFrame: 9, note: 'take f0 = podium scene start; confetti burst at take f21 (350 ms); default cut f9-84' });
  await o.close();
  return { file, frames: m.length, errors: o.errors, check: 'podium' };
}

async function ttShot(id, aspect) {
  const url = `/?track=kitchen&bot=1&seed=7${Q}`;
  const o = await openPage(aspect, url);
  await waitWorld(o.page);
  await o.page.evaluate(() => {
    window.__fm.shell.audio.muted = true;
    void window.__fmModes.startTt('kitchen', 2, 'pb');
  });
  // live clock while the dev ghost is computed and the time trial starts
  await o.page.waitForFunction(() => window.__fm?.shell.world?.cfg.mode === 'tt' && window.__fmModes.ttGhost.live, null, { timeout: 120_000 });
  await freezeMute(o.page);
  await fullRes(o.page);
  await hideDom(o.page);
  const label = await o.page.evaluate(() => window.__fmModes.ttGhost.label);
  // probe in this page: the time trial has no seed to replay from a URL, so fast-forward to just before, then search
  const probe = await o.page.evaluate(() => {
    const s = window.__fm.shell;
    const g = window.__fmModes.ttGhost;
    const out = [];
    let guard = 0;
    while (guard++ < 4000) {
      window.__capB.frame();
      const w = s.world;
      if (!w || !g.world) break;
      const t = w.st.tick;
      const ah = g.world.st.karts[0].dist - w.st.karts[w.cfg.humans[0]].dist;
      if (t > 180 + 240 && ah >= 5 && ah <= 15) return { tick: t, ahead: ah };
      if (t > 3000) break;
      out.push(ah);
    }
    return { tick: -1, last: out.slice(-5) };
  });
  if (probe.tick < 0) throw new Error(`${id}: ghost never 5-15 m ahead ${JSON.stringify(probe)}`);
  await o.close();
  // record in a fresh page: the same time trial (fixed TT seed, the bot) reaches the same tick
  const r = await openPage(aspect, url);
  await waitWorld(r.page);
  await r.page.evaluate(() => {
    window.__fm.shell.audio.muted = true;
    void window.__fmModes.startTt('kitchen', 2, 'pb');
  });
  await r.page.waitForFunction(() => window.__fm?.shell.world?.cfg.mode === 'tt' && window.__fmModes.ttGhost.live, null, { timeout: 120_000 });
  await freezeMute(r.page);
  await fullRes(r.page);
  await hideDom(r.page);
  const start = probe.tick - 10 - H;
  const got = await r.page.evaluate((T) => window.__capB.toTick(T), start);
  if (got !== start) throw new Error(`${id}: reached ${got}, wanted ${start}`);
  const file = path.join(OUT_B, `${id}-${aspect}.mp4`);
  const m = await record(r, file, 170);
  writeAnchor(id, { url: url + ' + __fmModes.startTt(kitchen, 2, pb)', ghost: label, anchor: probe.tick, ahead: probe.ahead, cutAt: 10, takeStartTick: start, cutStartTakeFrame: H });
  await r.close();
  return { file, frames: m.length, errors: [...o.errors, ...r.errors], check: checkSteps(m) };
}

// ------------------------------------------------------------------------------------------------ editor (S23, S24)
/** the v3 stadium() stroke, as points in page coordinates */
async function stadiumPts(page) {
  const box = await page.locator('.fm-ed-canvas').boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const r = box.width * 0.2;
  const h = box.height * 0.36;
  const pts = [];
  for (let i = 0; i <= 4; i++) pts.push([cx + r, cy + h - (2 * h * i) / 4]);
  for (let i = 1; i <= 6; i++) pts.push([cx + r * Math.cos((Math.PI * i) / 6), cy - h - r * Math.sin((Math.PI * i) / 6)]);
  for (let i = 1; i <= 4; i++) pts.push([cx - r, cy - h + (2 * h * i) / 4]);
  for (let i = 1; i <= 5; i++) pts.push([cx - r * Math.cos((Math.PI * i) / 6), cy + h + r * Math.sin((Math.PI * i) / 6)]);
  pts.push([cx + r * 0.995, cy + h + 2]);
  return pts;
}
/** resample a polyline into n+1 points evenly by arc length, eased (smoothstep) */
function along(pts, n) {
  const seg = [];
  let L = 0;
  for (let i = 1; i < pts.length; i++) {
    const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    seg.push(l);
    L += l;
  }
  const out = [];
  for (let k = 0; k <= n; k++) {
    const u = k / n;
    const e = u * u * (3 - 2 * u) * 0.5 + u * 0.5; // half eased: no stall at the ends
    let d = e * L;
    let i = 0;
    while (i < seg.length - 1 && d > seg[i]) d -= seg[i++];
    const t = Math.min(1, d / (seg[i] || 1));
    out.push([pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t]);
  }
  return out;
}

async function editorShot(id, aspect) {
  const url = '/?make&seed=4';
  const o = await openPage(aspect, url, { editor: true });
  await o.page.locator('.fm-ed-canvas').waitFor({ timeout: 60_000 });
  await o.page.waitForTimeout(800);
  await o.page.evaluate(() => window.__cap.freeze());
  await o.page.addStyleTag({ content: 'body{cursor:none!important} *{caret-color:transparent!important}' });
  const pts = along(await stadiumPts(o.page), 60);
  const mouse = o.page.mouse;
  let stunt = null;
  let status = '';
  const file = path.join(OUT_B, `${id}-${aspect}.mp4`);
  const events = {};
  const m = await record(o, file, 160, {
    stepFn: 'window.__cap.step(1)',
    perFrame: async (f) => {
      if (f === 0) {
        await mouse.move(pts[0][0], pts[0][1]);
        await mouse.down();
      } else if (f <= 60) {
        await mouse.move(pts[f][0], pts[f][1]);
        if (f === 60) {
          await mouse.up();
          events.strokeUp = f;
        }
      } else if (f === 61) {
        status = (await o.page.locator('.fm-ed-status').textContent()) ?? '';
        await o.page.locator('.fm-ed-tab[data-tab="stickers"]').click();
        events.stickersTab = f;
      } else if (f === 62) {
        const b = await o.page.locator('.fm-ed-stunt[data-piece="loop"]').boundingBox();
        const to = await o.page.evaluate(() => window.__fmDoodle.qa(-1));
        stunt = { from: [b.x + b.width / 2, b.y + b.height / 2], to: [to.x, to.y] };
        await mouse.move(stunt.from[0], stunt.from[1]);
        await mouse.down();
      } else if (f > 62 && f <= 75) {
        const k = (f - 62) / 13;
        const e = 1 - (1 - k) * (1 - k);
        await mouse.move(stunt.from[0] + (stunt.to[0] - stunt.from[0]) * e, stunt.from[1] + (stunt.to[1] - stunt.from[1]) * e);
        if (f === 75) {
          await mouse.up();
          events.loopDrop = f;
        }
      } else if (f === 76) {
        await mouse.move(-10, -10);
      }
    },
  });
  // let the stunt test-drive finish, then press "Race it" and keep the share URL for S24
  await o.page.evaluate(() => window.__cap.thaw());
  await o.page.waitForFunction(() => window.__fmDoodle?.qa(0)?.pieces.length === 1 && window.__fmDoodle.qa(0).driving === false, null, { timeout: 60_000 });
  const pieces = await o.page.evaluate(() => window.__fmDoodle.qa(0).pieces);
  const finalStatus = await o.page.locator('.fm-ed-status').textContent();
  await o.page.locator('.fm-ed-actions .primary').click();
  await o.page.locator('.fm-ed').waitFor({ state: 'detached', timeout: 30_000 });
  const share = o.page.url().replace(/^https?:\/\/[^/]+/, '');
  writeAnchor(`${id}-${aspect}`, { url, statusAfterStroke: status, finalStatus, pieces, share, events, cutStartTakeFrame: 0 });
  await o.close();
  return { file, frames: m.length, errors: o.errors, check: `pieces ${JSON.stringify(pieces)} status "${status}"`, share };
}

async function doodleRaceShot(id, aspect) {
  const a = JSON.parse(fs.readFileSync(path.join(BUILD, 'anchors-B.json'), 'utf8'))[`S23-${aspect}`];
  if (!a?.share) throw new Error('S24 needs S23 first (the share URL)');
  const url = a.share + (a.share.includes('?') ? '&' : '?') + `bot=1${Q}`;
  // probe: the first LOOP_TOP on the doodled loop
  const p = await openPage(aspect, url);
  await waitWorld(p.page);
  await freezeMute(p.page);
  const anchor = await p.page.evaluate(() => {
    let found = -1;
    window.__capB.onTick((w) => {
      const k = w.st.karts[w.cfg.humans[0]];
      if (found < 0 && k.rail > 0 && k.su > 33 && k.su < 44) found = w.st.tick;
    });
    let guard = 0;
    while (found < 0 && guard++ < 1500) window.__capB.toTick(window.__capB.tick() + 8);
    return found;
  });
  await p.close();
  if (anchor < 0) throw new Error(`${id}: no LOOP_TOP on the doodled track`);
  const o = await openPage(aspect, url);
  await waitWorld(o.page);
  await freezeMute(o.page);
  await fullRes(o.page);
  await hideDom(o.page);
  const start = anchor - 30 - H;
  const got = await o.page.evaluate((T) => window.__capB.toTick(T), start);
  if (got !== start) throw new Error(`${id}: reached ${got}, wanted ${start}`);
  const file = path.join(OUT_B, `${id}-${aspect}.mp4`);
  const m = await record(o, file, 170);
  writeAnchor(`${id}-${aspect}`, { url, anchor, cutAt: 30, takeStartTick: start, cutStartTakeFrame: H, note: 'LOOP_TOP on the doodled loop' });
  await o.close();
  return { file, frames: m.length, errors: [...p.errors, ...o.errors], check: checkSteps(m) };
}

// ------------------------------------------------------------------------------------------------ dare (S25)
// the current SIM_VERSION's dare (an older stamp opens as a target-time race without Mia's ghost)
const DARE = (() => {
  const src = fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'v3-legacy-codes.ts'), 'utf8');
  return /"dare10":\s*"([^"]+)"/.exec(src)[1];
})();

async function dareShot(id, aspect) {
  const url = `/?bot=1${Q}#g=${DARE}&n=Mia`;
  const o = await openPage(aspect, url);
  // the banner and Mia's ghost appear while loading (live clock); freeze the moment both are there
  await o.page.waitForFunction(() => !!document.querySelector('.fm-dare-banner') && !!window.__fm?.shell.stage.scene.getObjectByName('kart-Mia'), null, { timeout: 30_000, polling: 16 });
  await freezeMute(o.page);
  await fullRes(o.page);
  await o.page.addStyleTag({ content: '.fm-menu-btn{visibility:hidden!important} body{cursor:none!important}' });
  await o.page.evaluate(() => window.__fm.shell.hud.setVisible(false));
  // which other DOM is up (toasts, prompts)? hide everything except the canvas and the banner
  await o.page.addStyleTag({ content: 'body *:not(.fm-canvas):not(.fm-dare-banner){visibility:hidden!important} .fm-canvas,.fm-dare-banner{visibility:visible!important}' });
  const t0 = await o.page.evaluate(() => window.__capB.tick());
  const file = path.join(OUT_B, `${id}-${aspect}.mp4`);
  const m = await record(o, file, 300);
  const go = m.findIndex((f) => (f.ev ?? []).some((e) => e[0] === 'go'));
  const banner = await o.page.evaluate(() => !!document.querySelector('.fm-dare-banner'));
  writeAnchor(id, { url: '/?bot=1+Q#g=<LEGACY.dare10>&n=Mia', takeStartTick: t0, goTakeFrame: go, cutStartTakeFrame: Math.max(0, go - 40), bannerStillUpAtEnd: banner, note: 'banner is up from take f0; default cut = GO at cut f40' });
  await o.close();
  return { file, frames: m.length, errors: o.errors, check: `go at take f${go}, ${checkSteps(m)}` };
}

// ------------------------------------------------------------------------------------------------ end card bg (S36)
async function endShot(id, aspect) {
  // cafe seed 1 at 200cc-class 2: our bot finishes 1st at tick 4058 (sweep); attract orbit from finish + 3 s
  const url = `/?track=cafe&bot=1&cls=2&seed=1${Q}`;
  const o = await openPage(aspect, url);
  await waitWorld(o.page);
  await freezeMute(o.page);
  await fullRes(o.page);
  await hideDom(o.page);
  const fin = 4058;
  const got = await o.page.evaluate((T) => window.__capB.toTick(T), fin + 180);
  await o.page.evaluate(() => window.__fm.shell.camera.setMode('attract'));
  const file = path.join(OUT_B, `${id}-${aspect}.mp4`);
  const m = await record(o, file, 260);
  writeAnchor(id, { url, finishTick: fin, attractFromTick: got, cutStartTakeFrame: 30, note: 'attract orbit from take f0; any 200 f' });
  await o.close();
  return { file, frames: m.length, errors: o.errors, check: checkSteps(m) };
}

const RUN = {
  ...Object.fromEntries(Object.keys(RACE).map((k) => [k, raceShot])),
  ...Object.fromEntries(Object.keys(FLY).map((k) => [k, flyShot])),
  S20: podiumShot,
  S21: ttShot,
  S23: editorShot,
  S24: doodleRaceShot,
  S25: dareShot,
  S36: endShot,
};
export const SHOTS_B = Object.keys(RUN).sort();

export async function main(argv) {
  const ai = argv.indexOf('--aspect');
  const aspects = ai >= 0 ? [argv[ai + 1]] : ['16x9', '9x16'];
  const ids = argv.filter((a, i) => /^S\d\d$/.test(a) && argv[i - 1] !== '--aspect');
  const list = ids.length ? ids : SHOTS_B;
  fs.mkdirSync(OUT_B, { recursive: true });
  const log = [];
  for (const id of list) {
    for (const aspect of aspects) {
      const t = Date.now();
      try {
        const r = await RUN[id](id, aspect);
        const line = `${id} ${aspect}: ${r.frames} f, ${((Date.now() - t) / 1000).toFixed(0)} s, ${r.check}${r.errors.length ? ' ERRORS ' + r.errors.slice(0, 3).join(' | ') : ''}`;
        console.log(line);
        log.push(line);
      } catch (e) {
        console.log(`${id} ${aspect}: FAILED ${e.message}`);
        log.push(`${id} ${aspect}: FAILED ${e.message}`);
      }
    }
  }
  fs.appendFileSync(path.join(BUILD, 'capture-B.log'), log.join('\n') + '\n');
  await closeBrowser();
}

if (import.meta.url === `file://${process.argv[1]}`) await main(process.argv.slice(2));
