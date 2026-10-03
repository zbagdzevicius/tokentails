// s8: LOGO SLAM + CTA (bars 15-16, 26.250-30.000 s).
// Block #8 cracks open (light fissures bleed in from 26.10), four iso faces fly out, white frame,
// the Token Tails logo + CATNIP HEIST slam from 3.2x. Eight catnip sprigs burst out on the coin
// cues and settle into a halo. 27.1875 the lock-up pushes up and the PLAY pill springs in with
// three win stars; the two hero cats hop in (meow, then the final hit); 28.125 the URL + PLAY TO
// SAVE. stamp. Living hold, then a cosine fade to black with a few catnip motes.
// Copy (all sourced, see STORYBOARD §10): CATNIP HEIST · PLAY CATNIP HEIST NOW · NO SIGN-UP ·
// TOKENTAILS.COM/HEIST · PLAY TO SAVE.

const T0 = 26.25;                       // logo slam (impact 2.64)
const COIN = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => 26.25 + i * 0.1171875); // 8 coin cues
const CLAP1 = 26.71875;
const CTA = 27.1875;                    // PLAY NOW, star-pop 1
const STARS = [27.1875, 27.421875, 27.65625];
const MEOW = 27.773438;
const CLAP3 = 28.007813;
const FINAL = 28.125;                   // final hit (1.98)
const HOLD_BEATS = [28.59375, 29.0625, 29.53125]; // living hold: pill squash, a cat hop, URL underline wipe
const POP = 29.53125;                   // last hold beat: catnip sprigs pop
const FADE0 = 29.766, FADE1 = 29.93;    // fast cosine to black (reads as a cut), black from 29.93

const CONFETTI = ['#ffc93c', '#ff7aa2', '#b6f36a', '#f0c5fd', '#c4e2fc', '#fcecbb', '#63b98d'];
const PASSION = '"Passion One", "Arial Black", sans-serif';
const NUNITO = 'Nunito, "Helvetica Neue", sans-serif';

// ---------------------------------------------------------------- layout (A = slam, B = lock-up)
// Round 2: the lock-up slides up at the CTA and keeps >= 90% of its size (logo 600 -> 540, title
// 180 -> 164) instead of shrinking to ~62%. The logo rests at exactly 1:1 (600 px) in A so it is crisp.
const LAY = {
  A: { logoY: 340, logoW: 600, titleY: 700, titleMax: 200, haloCx: 960, haloCy: 470, rx: 850, ry: 405 },
  B: { logoY: 186, logoW: 540, titleY: 432, titleMax: 164, haloCx: 960, haloCy: 540, rx: 870, ry: 470 },
};
const STAR_Y = 560, PILL_Y = 662, PILL_H = 104, NOSIGN_Y = 752, URL_Y = 814, SAVE_Y = 888, CHAIN_Y = 946; // round 3: on-chain line inside title-safe

function loadFont(family, url, weight) {
  try { const f = new FontFace(family, `url(${url})`, { weight }); return f.load().then((ff) => { document.fonts.add(ff); }).catch(() => {}); }
  catch { return Promise.resolve(); }
}

export default {
  start: 26.1, end: 30.0,
  async init() {
    await Promise.all([
      loadFont('Passion One', 'assets/sprites/fonts/passion-one-latin-700-normal.woff2', '700'),
      loadFont('Passion One', 'assets/sprites/fonts/passion-one-latin-ext-700-normal.woff2', '700'),
      loadFont('Nunito', 'assets/sprites/fonts/nunito-latin-wght-normal.woff2', '200 1000'),
      loadFont('Nunito', 'assets/sprites/fonts/nunito-latin-ext-wght-normal.woff2', '200 1000'),
    ]);
    try { await document.fonts.load(`700 64px ${PASSION}`); await document.fonts.load(`800 30px ${NUNITO}`); } catch {}
  },

  draw(ctx, t, lt, E) {
    const { W, H } = E;
    if (t < T0) { // crack + the lock-up already flying in out of the white-hot cube, so T0 is readable
      drawCrack(ctx, t, E);
      if (t >= T0 - SLAM_IN) { drawLogo(ctx, t, t - T0, E, LAY.A); drawTitle(ctx, t, t - T0, E, LAY.A); }
      return;
    }
    const u = t - T0; // local time from the slam

    // ---- push-up blend A -> B (anticipation dip, then expo settle)
    const kAB = E.seg(t, CTA - 0.02, CTA + 0.42, 'expoOut');
    const dip = -Math.sin(Math.PI * E.seg(t, CTA - 0.09, CTA - 0.01)) * 0.6;
    const L = blend(LAY.A, LAY.B, kAB);
    const holdPush = 1 + 0.03 * E.smootherstep(FINAL + 0.3, 30, t);
    const preHit = 1 - 0.025 * Math.sin(Math.PI * E.seg(t, CLAP3 - 0.03, FINAL + 0.02)); // anticipation squash before the final hit

    drawBackground(ctx, t, u, E);
    drawRays(ctx, t, u, E, L);

    // whole lock-up gets the slow hold push (around frame centre)
    ctx.save();
    const gs = holdPush * preHit;
    ctx.translate(W / 2, H / 2); ctx.scale(gs, gs); ctx.translate(-W / 2, -H / 2 + dip * 10);

    drawShards(ctx, t, u, E);
    drawSlamFx(ctx, t, u, E, L);
    drawSprigs(ctx, t, u, E, kAB, false);
    drawLogo(ctx, t, u, E, L);
    drawTitle(ctx, t, u, E, L);
    drawSprigs(ctx, t, u, E, kAB, true);
    if (t >= CTA - 0.02) {
      drawStars(ctx, t, E);
      drawPill(ctx, t, E);
    }
    drawCats(ctx, t, E);
    if (t >= FINAL - 0.02) drawFinal(ctx, t, E);
    ctx.restore();

    drawConfetti(ctx, t, E);
    // light leaks breathe (pink / gold)
    E.lightLeak(ctx, t, { seed: 81, intensity: Math.min(0.15, 0.1 + 0.05 * E.env(t, FINAL, 0.5) + 0.03 * Math.sin(t * 2.1)), colors: ['#ff7aa2', '#ffc93c', '#ff7a1a'], speed: 0.3 });

    // ---- cosine fade to black, a few catnip-glow motes stay alive
    if (t > FADE0) {
      const f = 0.5 - 0.5 * Math.cos(Math.PI * E.seg(t, FADE0, FADE1));
      E.flash(ctx, t >= FADE1 ? 1 : f, '#000');
      if (t < FADE1) drawMotes(ctx, t, E, f);
    }
  },

  fx(t, lt, E) {
    const slam = t >= T0 ? E.env(t, T0, 0.2) : 0;
    const fin = E.env(t, FINAL, 0.16);
    const clap = E.envs(t, [CLAP1, STARS[2], CLAP3], 0.07);
    const kick = E.envs(t, [T0, CLAP1, CTA, STARS[2], FINAL], 0.09);
    const preWhite = 0; // round 3: no white tint before the slam (frame 1574 was muddy)
    const hold = E.envs(t, HOLD_BEATS, 0.1);
    const blur = (t >= T0 + 0.05 && t < T0 + 0.22) || (t >= CTA - 0.02 && t < CTA + 0.12) || (t >= FINAL + 2 / 60 && t < FINAL + 0.12);
    return {
      shake: 28 * slam + 16 * fin + 4 * E.env(t, CTA, 0.1) + 3 * E.env(t, MEOW + 0.0, 0.08) + 5 * hold,
      aberration: (t >= T0 + 1 / 60 ? 8 * Math.max(0, 1 - (t - T0) / 0.2) : 0) + 3.5 * clap + 6 * fin + 3 * hold,
      // flash budget: <= 0.4 before the hit, 0.16 on f1575 decaying by f1576 (2 frames); the logo reads through it
      flash: 0.22 * E.env(t, FINAL + 1 / 60, 0.05),
      contrast: 0.7 * E.env(t, T0, 0.06) + 0.5 * E.env(t, FINAL, 0.06), // round 3: hit frames get a saturation/contrast lift, not a grey veil
      flashColor: '#fff8e8',
      zoom: 1 + 0.015 * kick + 0.04 * E.env(t, T0, 0.12) + 0.012 * hold,
      motionBlur: blur ? 4 : 0,
      grain: 0.035,
      vignette: t < CTA ? 0.18 : 0.3 + 0.06 * Math.sin(t * 3.3) * (t > FINAL ? 1 : 0),
    };
  },
};

// ------------------------------------------------------------------------------------ helpers
function blend(a, b, k) { const o = {}; for (const key in a) o[key] = a[key] + (b[key] - a[key]) * k; return o; }

// Bleed (26.10-26.25): light fissures race out of the imploded block #8 at frame centre.
function drawCrack(ctx, t, E) {
  const { W, H } = E;
  const p = 0.25 + 0.75 * E.seg(t, 26.1, 26.25, 'quadIn');
  const cx = W / 2, cy = H / 2;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 120 + 520 * p);
  g.addColorStop(0, E.rgba('#fff3d0', 0.9 * p)); g.addColorStop(0.35, E.rgba('#ffc93c', 0.45 * p)); g.addColorStop(1, E.rgba('#ff7aa2', 0));
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (let i = 0; i < 9; i++) {
    const a0 = (i / 9) * E.TAU + E.rand('ck', i) * 0.5;
    const len = (260 + 900 * E.rand('ckl', i)) * p;
    ctx.strokeStyle = E.rgba(i % 3 ? '#fff3d0' : '#b6f36a', 0.95);
    ctx.lineWidth = 2 + 7 * p * (1 - (i % 3) * 0.25);
    ctx.shadowColor = '#ffc93c'; ctx.shadowBlur = 24;
    ctx.beginPath(); ctx.moveTo(cx, cy);
    let x = cx, y = cy;
    const segs = 5;
    for (let s = 1; s <= segs; s++) {
      const a = a0 + E.randSigned('cks', i, s) * 0.35;
      x = cx + Math.cos(a) * len * (s / segs); y = cy + Math.sin(a) * len * (s / segs) * 0.75;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

// Background: HQ win celebration, blurred via downsample, darkened, drifting; kick pulses.
function drawBackground(ctx, t, u, E) {
  const { W, H } = E;
  ctx.fillStyle = E.col('night'); ctx.fillRect(0, 0, W, H);
  const S = E.surface('s8bg', 240, 135);
  const ct = E.clipFrameTime('h03-rescue-exit', 54) + u * 0.58;
  const zoom = 1.12 - 0.06 * E.seg(u, 0, 3.75, 'sineInOut') + 0.015 * E.envs(t, [T0, CLAP1, CTA, STARS[2], FINAL], 0.12);
  E.drawClip(S.ctx, 'h03-rescue-exit', ct, 0, 0, 240, 135, { fx: 0.5 + 0.03 * Math.sin(u * 0.7), fy: 0.4, zoom });
  ctx.save();
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  const dx = 22 * Math.sin(u * 0.5), dy = 14 * Math.cos(u * 0.4);
  ctx.globalAlpha = E.seg(u, 0, 0.12);
  ctx.drawImage(S, -40 + dx, -24 + dy, W + 80, H + 48);
  ctx.restore();
  // darken 50 % + plum base so the lock-up reads
  ctx.fillStyle = E.rgba('#0d0616', 0.52); ctx.fillRect(0, 0, W, H);
  const g = ctx.createRadialGradient(W / 2, H * 0.45, 100, W / 2, H * 0.5, W * 0.7);
  g.addColorStop(0, E.rgba('#4b0082', 0.28)); g.addColorStop(0.6, E.rgba('#301934', 0.2)); g.addColorStop(1, E.rgba('#07030e', 0.75));
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

// Rotating god rays behind the logo, brighter on the slam / hits.
function drawRays(ctx, t, u, E, L) {
  const { W } = E;
  const cx = W / 2, cy = L.logoY + 30;
  const n = 18;
  const pop = E.seg(u, 0, 0.35, 'expoOut');
  const bright = 0.1 + 0.09 * E.env(t, T0 + 0.1, 0.5) + 0.08 * E.env(t, CLAP1, 0.25) + 0.08 * E.env(t, CTA, 0.3) + 0.1 * E.env(t, FINAL, 0.4) + 0.025 * Math.sin(t * E.TAU / 0.9375);
  const R = 1500 * pop;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.translate(cx, cy); ctx.rotate(u * 0.16);
  const g = ctx.createRadialGradient(0, 0, 40, 0, 0, R);
  g.addColorStop(0, E.rgba('#ffc93c', bright * 1.6)); g.addColorStop(0.4, E.rgba('#ff7aa2', bright * 0.7)); g.addColorStop(1, E.rgba('#9966cc', 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * E.TAU, w = (E.TAU / n) * 0.36;
    ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a - w) * R, Math.sin(a - w) * R); ctx.lineTo(Math.cos(a + w) * R, Math.sin(a + w) * R); ctx.closePath();
  }
  ctx.fill();
  ctx.restore();
  // halo glow
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const hg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 520);
  hg.addColorStop(0, E.rgba('#fcecbb', 0.18 + 0.12 * E.env(t, T0 + 0.08, 0.3))); hg.addColorStop(1, E.rgba('#fcecbb', 0));
  ctx.fillStyle = hg; ctx.fillRect(cx - 520, cy - 520, 1040, 1040);
  ctx.restore();
}

// Block #8's four iso faces fly out of the crack (continuity with s7), with a 2-sample smear.
function drawShards(ctx, t, u, E) {
  if (u > 0.55) return;
  const { W, H } = E;
  const cx = W / 2, cy = H / 2, s = 150;
  // iso cube faces (local coords around the cube centre)
  const faces = [
    { pts: [[0, -s], [s * 0.87, -s * 0.5], [0, 0], [-s * 0.87, -s * 0.5]], fill: '#9966cc', dir: [0, -1] },
    { pts: [[-s * 0.87, -s * 0.5], [0, 0], [0, s], [-s * 0.87, s * 0.5]], fill: '#4b0082', dir: [-1, 0.35] },
    { pts: [[s * 0.87, -s * 0.5], [0, 0], [0, s], [s * 0.87, s * 0.5]], fill: '#6f2da8', dir: [1, 0.35] },
    { pts: [[-s * 0.6, s * 0.2], [s * 0.6, s * 0.2], [0, s * 0.9]], fill: '#5a2190', dir: [0.15, 1] },
  ];
  E.smear(ctx, u, (c, tt) => {
    if (tt < 0) return;
    const p = E.expoOut(E.clamp01(tt / 0.5));
    faces.forEach((f, i) => {
      const d = 1300 * p, sc = 1 + 0.9 * p;
      const x = cx + f.dir[0] * d, y = cy + f.dir[1] * d * 0.8;
      c.save(); c.translate(x, y); c.rotate((i % 2 ? 1 : -1) * p * 2.2); c.scale(sc, sc);
      c.globalAlpha *= 1 - E.seg(tt, 0.3, 0.55);
      c.beginPath(); f.pts.forEach(([px, py], k) => (k ? c.lineTo(px, py) : c.moveTo(px, py))); c.closePath();
      c.fillStyle = f.fill; c.fill();
      c.lineWidth = 6; c.strokeStyle = '#fcecbb'; c.lineJoin = 'round'; c.stroke();
      // hex glyph texture on the face
      c.font = '700 18px "SF Mono", Menlo, monospace'; c.fillStyle = E.rgba('#b6f36a', 0.6); c.textAlign = 'center';
      c.fillText(E.hexStr(4, 's8shard', i), 0, f.pts[0][1] * 0.25 + 18);
      c.restore();
    });
  }, { dt: 1 / 40, samples: 3, alpha: 0.5 });
}

// Slam: triple shockwave, radial speed lines, gold dust; small ring on clap 1.
function drawSlamFx(ctx, t, u, E, L) {
  const { W } = E;
  const cx = W / 2, cy = LAY.A.logoY + 60;
  const sl = E.seg(u, 0, 0.6) * (1 - E.seg(u, 0.35, 0.7));
  if (sl > 0) E.speedLines(ctx, t, { cx, cy, inner: 430 + 300 * E.seg(u, 0, 0.6, 'expoOut'), outer: 1700, count: 110, width: [2, 12], color: '#fcecbb', alpha: 0.55 * sl, seed: 88, fps: 30 });
  const cols = ['#fcecbb', '#ff7aa2', '#ffc93c'];
  cols.forEach((c, k) => E.shockwave(ctx, cx, cy, E.seg(u, k * 0.05, 0.7 + k * 0.08), { radius: 900 + k * 260, width: 46 - k * 10, color: c }));
  E.shockwave(ctx, W / 2, L.titleY, E.seg(t, CLAP1, CLAP1 + 0.5), { radius: 820, width: 18, color: '#b6f36a', rings: 2, gap: 0.2 });
  // gold dust burst
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (const q of E.burst({ seed: 8101, count: 70, t, t0: T0, x: cx, y: cy, speed: [500, 1700], angle: [0, E.TAU], gravity: 500, drag: 2.4, life: [0.6, 1.3], size: [3, 9] })) {
    ctx.globalAlpha = q.alpha; ctx.fillStyle = q.r(7) < 0.6 ? '#ffc93c' : '#fff3d0';
    ctx.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
  }
  ctx.restore();
}

// Slam: from `from`x at T0-0.10 accelerating to 0.94 ON the hit frame (f1575, fully formed and
// readable), then 0.94 -> 1.0 with backOut over 0.08 s. u = t - T0.
const SLAM_IN = 2 / 60; // round 3: 2-frame slam-in (was 0.10 s, peaked 5 frames early)
function slamScale(u, from) {
  if (u < -SLAM_IN) return from;
  if (u < 0) { const p = (u + SLAM_IN) / SLAM_IN; return from + (0.94 - from) * p * p; }
  // round 3: 0.94 on the hit -> overshoot 1.08 two frames later -> damped settle to 1.0
  const o = 2 / 60;
  if (u < o) return 0.94 + (1.08 - 0.94) * (u / o);
  const v = u - o;
  return 1 + 0.08 * Math.exp(-v * 22) * Math.cos(v * 26);
}
const slamAlpha = (u) => Math.max(0, Math.min(1, (u + SLAM_IN) / 0.04));
function logoScaleAt(u) { return slamScale(u, 3.2); }
function drawLogo(ctx, t, u, E, L) {
  const { W } = E;
  const bob = 4 * Math.sin(t * E.TAU / 1.875) + 6 * E.env(t, CTA, 0.18) * -1;
  const beat = 1 + 0.018 * E.envs(t, [CLAP1, CTA, STARS[2], FINAL, ...HOLD_BEATS], 0.12);
  const draw = (c, uu) => {
    const s = logoScaleAt(uu) * beat;
    const w = L.logoW * s;
    const white = uu < 0 ? 0.45 : uu < 0.035 ? 0.3 : 0; // hot white only through the hit's 2 frames
    const a = slamAlpha(uu);
    if (a <= 0) return;
    const crisp = Math.abs(w - 600) < 1.5; // rests at exactly 1:1 in layout A: draw unsmoothed
    const rot = 0.03 * Math.sin(t * 1.3) * (uu > 0.3 ? 1 : 0) * (crisp ? 0 : 1);
    c.save(); c.globalAlpha *= a;
    E.drawImg(c, 'logo', crisp ? Math.round(W / 2 - 300) + 300 : W / 2, crisp ? Math.round(L.logoY + bob - 168.5) + 168.5 : L.logoY + bob, { w: crisp ? 600 : w, smooth: !crisp, rot });
    c.restore();
    if (white > 0) {
      E.layer(c, (lc) => {
        E.drawImg(lc, 'logo', W / 2, L.logoY + bob, { w, smooth: true });
        lc.globalCompositeOperation = 'source-atop'; lc.fillStyle = '#fff8e8'; lc.globalAlpha = white;
        lc.setTransform(1, 0, 0, 1, 0, 0); lc.fillRect(0, 0, lc.canvas.width, lc.canvas.height);
      });
    }
  };
  // drop shadow
  ctx.save(); ctx.globalAlpha = 0.45 * E.seg(u, 0.05, 0.25);
  ctx.filter = 'blur(14px) brightness(0)';
  E.drawImg(ctx, 'logo', W / 2 + 10, L.logoY + bob + 26, { w: L.logoW * logoScaleAt(u) * beat });
  ctx.restore();
  if (u >= 2 / 60 && u < 0.2) E.smear(ctx, u, (c, uu) => draw(c, uu), { dt: 1 / 30, samples: 3, alpha: 0.55 }); // round 3: hit frames are clean (no ghost)
  else draw(ctx, u);
}

// CATNIP HEIST: per-letter slam cascade (2.6x -> 1, backOut), two colours, voxel extrude,
// sheen sweeps on CLAP1 and later, letters bob as a wave in the hold.
function drawTitle(ctx, t, u, E, L) {
  const { W } = E;
  const str = 'CATNIP HEIST';
  const base = { font: 'display', tracking: 0.04 };
  const w1 = E.measureText(ctx, str, { ...base, size: 100 });
  const sz = Math.min(L.titleMax, (1720 / w1) * 100);
  const opts = (extra) => ({
    ...base, size: sz, color: '#fcecbb', stroke: '#2a0f1f', strokeWidth: sz * 0.09,
    extrude: { depth: Math.round(sz * 0.07), color: '#2a0f1f', dark: 0.2 },
    shadow: { color: 'rgba(0,0,0,0.5)', blur: 30, y: 14 },
    perChar: ({ i, n }) => {
      // the word has landed whole on the hit; the coin cues now ripple a per-letter bounce through it
      const tb = COIN[1] + i * 0.04;
      const hop = Math.sin(Math.PI * E.seg(t, tb, tb + 0.16)) * (t < tb + 0.16 ? 1 : 0);
      const wave = u > 1.1 ? 5 * Math.sin(t * 5.2 - i * 0.55) : 0;
      const pop = 0.08 * E.env(t, CLAP1 + i * 0.012, 0.12) + 0.06 * E.env(t, FINAL + i * 0.01, 0.12) + 0.05 * E.envs(t, HOLD_BEATS.map((b) => b + i * 0.012), 0.1);
      return {
        x: (i <= 4 ? -1 : 1) * sz * 0.04, // round 3: open the I-P pair (the I's curled foot touched the P and read as L)
        y: -30 * hop + wave, scale: 1 + 0.12 * hop + pop, rot: hop * (i % 2 ? 0.08 : -0.08),
        color: i < 6 ? (i % 2 ? '#63b98d' : '#5fbf3a') : '#ffc93c',
      };
    },
    ...extra,
  });
  const ss = slamScale(u, 2.6), sa = slamAlpha(u);
  if (sa <= 0) return;
  ctx.save(); ctx.globalAlpha *= sa;
  ctx.translate(W / 2, L.titleY); ctx.scale(ss, ss); ctx.translate(-W / 2, -L.titleY);
  E.drawText(ctx, str, W / 2, L.titleY, opts());
  ctx.restore();
  if (u < 0.15) return;
  // sheen: a pale diagonal band masked to the face
  const sweeps = [COIN[3], CTA + 0.47, FINAL + 0.47, FINAL + 1.41];
  for (const s0 of sweeps) {
    const p = E.seg(t, s0, s0 + 0.42, 'quadInOut');
    if (p <= 0 || p >= 1) continue;
    E.layer(ctx, (lc) => {
      // round 3: no sheen on the I and P (the band made CATNIP read as CATNLP)
      const base = opts();
      E.drawText(lc, str, W / 2, L.titleY, opts({ stroke: null, strokeWidth: 0, extrude: null, shadow: null, color: '#fff', perChar: (a) => (a.i === 4 || a.i === 5 ? false : { ...base.perChar(a), color: '#fff' }) }));
      lc.globalCompositeOperation = 'source-in';
      lc.setTransform(1, 0, 0, 1, 0, 0);
      const x = -400 + p * (W + 800);
      const g = lc.createLinearGradient(x - 160, 0, x + 160, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,240,0.85)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      lc.fillStyle = g; lc.fillRect(0, 0, lc.canvas.width, lc.canvas.height);
    }, { blend: 'lighter', alpha: 0.7 });
  }
}

// 8 catnip sprigs: each leaves the logo on its own coin cue, arcs to a halo slot, lands with a
// sparkle; at the CTA the halo widens to frame the whole lock-up. Pixel-crisp (32 px art, 3x+).
function haloSlot(i, L) {
  const a = -Math.PI / 2 + (i + 0.5) * (Math.PI / 4);
  // round 3: in the lock-up the two bottom sprigs sit outside the URL / on-chain text band
  if (L === LAY.B && (i === 2 || i === 3)) return [960 + (i === 2 ? 1 : -1) * 475, 900];
  return [L.haloCx + Math.cos(a) * L.rx, L.haloCy + Math.sin(a) * L.ry];
}
function drawSprigs(ctx, t, u, E, kAB, front) {
  for (let i = 0; i < 8; i++) {
    const t0 = COIN[i], fl = 0.3;
    if (t < t0) continue;
    // back layer = sprigs in flight that pass behind the logo early on; front = landed
    const inFlight = t < t0 + fl;
    if (front === inFlight) continue;
    const A = haloSlot(i, LAY.A);
    const kI = E.seg(t, CTA - 0.02 + i * 0.015, CTA + 0.45 + i * 0.015, 'expoInOut');
    const B = haloSlot(i, LAY.B);
    const slot = [A[0] + (B[0] - A[0]) * kI, A[1] + (B[1] - A[1]) * kI];
    const sway = E.perlin1(t * 0.9, 300 + i) * 0.105;
    const bobY = 7 * Math.sin(t * 2.4 + i * 0.8);
    let x, y, k, rot;
    if (inFlight) {
      const p = (t - t0) / fl;
      const e = E.cubicOut(p);
      [x, y] = E.arcTo([960, LAY.A.logoY], slot, e, -220 - 60 * (i % 3));
      k = Math.round(6 - 3 * e);  // 6x -> 3x of the 32 px art
      rot = (1 - e) * (i % 2 ? 1 : -1) * 3.2;
      // speed trail
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let s = 1; s <= 4; s++) {
        const ee = E.cubicOut(Math.max(0, p - s * 0.06));
        const [tx, ty] = E.arcTo([960, LAY.A.logoY], slot, ee, -220 - 60 * (i % 3));
        ctx.globalAlpha = 0.35 * (1 - s / 5); ctx.fillStyle = '#b6f36a';
        ctx.beginPath(); ctx.arc(tx, ty, 26 - s * 4, 0, E.TAU); ctx.fill();
      }
      ctx.restore();
    } else {
      x = slot[0]; y = slot[1] + bobY;
      const land = t - t0 - fl;
      k = 3; rot = sway;
      const sq = E.env(land, 0, 0.12);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const gr = ctx.createRadialGradient(x, y, 0, x, y, 110);
      gr.addColorStop(0, E.rgba('#b6f36a', 0.28 + 0.4 * sq + 0.1 * E.env(t, FINAL, 0.3) + 0.35 * E.envs(t, HOLD_BEATS.map((b) => b + i * 0.03), 0.18))); gr.addColorStop(1, E.rgba('#b6f36a', 0));
      ctx.fillStyle = gr; ctx.fillRect(x - 110, y - 110, 220, 220);
      ctx.restore();
      // landing sparkle
      if (land < 0.4) {
        const sp = E.seg(land, 0, 0.4);
        E.star(ctx, x + 46, y - 46, 26 * Math.sin(Math.PI * sp), { points: 4, inner: 0.22, fill: '#fff3d0', rot: sp * 1.5 });
        E.shockwave(ctx, x, y, sp, { radius: 110, width: 8, color: '#b6f36a' });
      }
      const pop = E.env(t, POP + i * 0.02, 0.14);
      if (pop > 0.05 && t < POP + 0.5) E.shockwave(ctx, x, y, E.seg(t, POP + i * 0.02, POP + 0.4 + i * 0.02), { radius: 140, width: 10, color: '#fff3d0' });
      const kk = pop > 0.4 ? 5 : pop > 0.15 ? 4 : 3; // integer scales only: stays pixel-crisp
      ctx.save(); ctx.translate(x, y); ctx.scale(1 + 0.25 * sq, 1 - 0.18 * sq); ctx.translate(-x, -y);
      E.drawImg(ctx, 'catnip', x, y, { w: 32 * kk, h: 32 * kk, rot, pixel: true });
      ctx.restore();
      continue;
    }
    E.drawImg(ctx, 'catnip', x, y, { w: 32 * k, h: 32 * k, rot, pixel: true });
  }
}

// Three win stars pop on the star-pop cues: 0 -> 1.3 -> 1, 20 deg spin, sparkle burst.
function drawStars(ctx, t, E) {
  const xs = [960 - 132, 960, 960 + 132];
  for (let i = 0; i < 3; i++) {
    const t0 = STARS[i];
    if (t < t0) {
      // empty socket so the slots read before they fill
      const q = E.seg(t, CTA, CTA + 0.15, 'backOut');
      E.star(ctx, xs[i], STAR_Y - (i === 1 ? 14 : 0), (i === 1 ? 44 : 36) * q, { fill: 'rgba(42,15,31,0.65)', stroke: '#9966cc', lineWidth: 5, inner: 0.5 });
      continue;
    }
    const p = E.seg(t, t0, t0 + 0.28);
    const s = p < 0.55 ? E.backOut(p / 0.55, 2.5) * 1.3 : 1.3 - 0.3 * E.cubicOut((p - 0.55) / 0.45);
    const twinkle = 1 + 0.06 * Math.sin(t * 7 + i * 2) * (t > FINAL ? 1 : 0) + 0.12 * E.env(t, FINAL + i * 0.05, 0.15);
    const r = (i === 1 ? 44 : 36) * s * twinkle;
    const y = STAR_Y - (i === 1 ? 14 : 0);
    const rot = -Math.PI / 2 + (1 - E.cubicOut(p)) * E.deg(20) * (i % 2 ? -1 : 1);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(xs[i], y, 0, xs[i], y, r * 2.4);
    g.addColorStop(0, E.rgba('#ffc93c', 0.45 * (0.6 + E.env(t, t0, 0.25)))); g.addColorStop(1, E.rgba('#ffc93c', 0));
    ctx.fillStyle = g; ctx.fillRect(xs[i] - r * 2.4, y - r * 2.4, r * 4.8, r * 4.8);
    ctx.restore();
    E.star(ctx, xs[i], y + 5, r, { fill: '#2a0f1f', rot, inner: 0.5 });
    E.star(ctx, xs[i], y, r, { fill: '#ffc93c', stroke: '#2a0f1f', lineWidth: 7, rot, inner: 0.5 });
    E.star(ctx, xs[i] - r * 0.08, y - r * 0.1, r * 0.55, { fill: '#ffe08a', rot, inner: 0.5 });
    if (p < 1) E.shockwave(ctx, xs[i], y, p, { radius: 120, width: 10, color: '#fcecbb' });
    for (const q of E.burst({ seed: 8200 + i, count: 14, t, t0, x: xs[i], y, speed: [260, 620], angle: [0, E.TAU], gravity: 700, drag: 2, life: [0.35, 0.6] })) {
      E.star(ctx, q.x, q.y, 9 * q.alpha + 2, { points: 4, inner: 0.25, fill: q.r(7) < 0.5 ? '#fff3d0' : '#ffc93c', rot: q.rot });
    }
  }
}

// CTA pill: gold, outline stroke, 3D lip, elasticOut scale-in; sheen sweeps on beats.
function drawPill(ctx, t, E) {
  const { W } = E;
  const label = 'PLAY CATNIP HEIST NOW';
  const fs = 70;
  const tw = E.measureText(ctx, label, { font: 'display', size: fs, tracking: 0.03 });
  const pw = tw + 150 + 42, ph = PILL_H;
  const p = E.seg(t, CTA, CTA + 0.7);
  const s = p <= 0 ? 0 : E.elasticOut(p, 1, 0.4);
  const breathe = 1 + 0.012 * Math.sin(t * E.TAU / 0.9375) * (t > FINAL ? 1 : 0) + 0.03 * E.env(t, FINAL, 0.12);
  let sq = 0; // hold beats: squash 1.04 x 0.96, springing back (backOut feel)
  for (const hb of HOLD_BEATS) if (t >= hb) { const a = t - hb; sq += Math.exp(-a * 14) * Math.cos(a * 30); }
  const sx = s * breathe * (1 + 0.15 * E.env(t, CTA, 0.08) + 0.04 * sq), sy = s * breathe * (1 - 0.1 * E.env(t, CTA, 0.08) - 0.04 * sq);
  if (s <= 0.001) return;
  const x0 = W / 2, y0 = PILL_Y;
  ctx.save();
  ctx.translate(x0, y0); ctx.scale(sx, sy);
  const r = ph / 2;
  // drop + lip
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); E.path.roundRect(ctx, -pw / 2 + 6, -ph / 2 + 22, pw, ph, r); ctx.fill();
  ctx.fillStyle = '#b8761a'; ctx.beginPath(); E.path.roundRect(ctx, -pw / 2, -ph / 2 + 12, pw, ph, r); ctx.fill();
  const g = ctx.createLinearGradient(0, -ph / 2, 0, ph / 2);
  g.addColorStop(0, '#ffe08a'); g.addColorStop(0.55, '#ffc93c'); g.addColorStop(1, '#f5a623');
  ctx.fillStyle = g; ctx.beginPath(); E.path.roundRect(ctx, -pw / 2, -ph / 2, pw, ph, r); ctx.fill();
  ctx.lineWidth = 8; ctx.strokeStyle = '#2a0f1f';
  ctx.beginPath(); E.path.roundRect(ctx, -pw / 2, -ph / 2, pw, ph + 12, r); ctx.stroke();
  // top gloss
  ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.beginPath(); E.path.roundRect(ctx, -pw / 2 + 26, -ph / 2 + 10, pw - 52, ph * 0.28, ph * 0.14); ctx.fill();
  // sheen sweep (clipped to the pill)
  const sweeps = [STARS[2], FINAL + 0.24, FINAL + 1.17, FINAL + 2.11];
  for (const s0 of sweeps) {
    const q = E.seg(t, s0, s0 + 0.38, 'quadInOut');
    if (q <= 0 || q >= 1) continue;
    ctx.save(); ctx.beginPath(); E.path.roundRect(ctx, -pw / 2, -ph / 2, pw, ph, r); ctx.clip();
    const sx0 = -pw / 2 - 200 + q * (pw + 400);
    ctx.fillStyle = 'rgba(255,255,240,0.55)';
    ctx.beginPath(); ctx.moveTo(sx0, -ph); ctx.lineTo(sx0 + 70, -ph); ctx.lineTo(sx0 - 10, ph); ctx.lineTo(sx0 - 80, ph); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,240,0.3)';
    ctx.beginPath(); ctx.moveTo(sx0 + 100, -ph); ctx.lineTo(sx0 + 125, -ph); ctx.lineTo(sx0 + 45, ph); ctx.lineTo(sx0 + 20, ph); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  E.drawText(ctx, label, 0, 4, {
    font: 'display', size: fs, tracking: 0.03, color: '#2a0f1f',
    shadow: { color: 'rgba(255,240,200,0.7)', blur: 0, y: 3 },
    perChar: ({ i, n }) => { const q = E.seg(t, CTA + 0.04 + i * 0.012, CTA + 0.24 + i * 0.012, 'backOut'); const gap = (i > 4 ? 1 : 0) + (i > 11 ? 1 : 0) + (i > 17 ? 1 : 0) - 1.5; return { x: gap * 14, scale: q, alpha: E.clamp01(q * 2), y: (1 - q) * 18 + (t > FINAL + 0.3 ? 2.5 * Math.sin(t * 6 - i * 0.5) : 0) }; },
  });
  ctx.restore();
  // NO SIGN-UP (Nunito 800), wipes in on star-pop 2 with a cursor bar
  const wp = E.seg(t, STARS[1], STARS[1] + 0.28, 'cubicOut');
  if (wp > 0) {
    E.wipeText(ctx, 'NO SIGN-UP', W / 2, NOSIGN_Y + 3 * Math.sin(t * 2.2), { font: NUNITO, weight: 800, size: 32, tracking: 0.32, color: '#fcecbb', shadow: { color: 'rgba(0,0,0,0.6)', blur: 10, y: 3 } }, wp, { cursorColor: '#b6f36a' });
    // tiny catnip-green rules either side
    const rw = 90 * wp;
    ctx.fillStyle = '#b6f36a';
    ctx.fillRect(W / 2 - 200 - rw, NOSIGN_Y - 2, rw, 4); ctx.fillRect(W / 2 + 200, NOSIGN_Y - 2, rw, 4);
  }
}

// Hero cats: oreo hops in from the bottom right on the meow (ring), albertino from the bottom
// left landing on the final hit. JUMPING through the arc, squash on landing, then SITTING/IDLE.
function drawCats(ctx, t, E) {
  const cats = [
    { id: 'oreo', t0: MEOW - 0.24, land: MEOW, x0: 1800, x1: 1640, flip: true, ring: MEOW },
    { id: 'albertino', t0: FINAL - 0.24, land: FINAL, x0: 120, x1: 280, flip: false, ring: FINAL + 0.05 },
  ];
  const yFeet = PILL_Y + 86, sc = 7;
  for (const c of cats) {
    if (t < c.t0) continue;
    let x, y, row, fr, sx = 1, sy = 1;
    if (t < c.land) {
      const p = (t - c.t0) / (c.land - c.t0);
      x = c.x0 + (c.x1 - c.x0) * p;
      y = yFeet + 380 * (1 - p) - 300 * Math.sin(Math.PI * p) * 1.0 + 0;
      // vertical: start below frame, peak above the landing, land
      y = (yFeet + 360) + (yFeet - (yFeet + 360)) * p - 260 * Math.sin(Math.PI * p);
      row = 'JUMPING'; fr = 2 + Math.floor(p * 3);
      const vy = -360 / 0.24 + -260 * Math.PI * Math.cos(Math.PI * p) / 0.24;
      sy = 1 + Math.min(0.25, Math.abs(vy) * 0.00012); sx = 1 / sy;
    } else {
      const a = t - c.land;
      x = c.x1; y = yFeet;
      const sq = E.env(a, 0, 0.1);
      sx = 1 + 0.3 * sq; sy = 1 - 0.25 * sq;
      if (a < 0.12) { row = 'JUMPING'; fr = 5 + Math.floor(a / 0.06); }
      else { row = 'IDLE'; fr = E.spriteFrame(t - c.land, 8); }
      sy *= 1 + 0.02 * Math.sin(t * 5);
      // living hold: oreo hops on hold beat 1, albertino on 2, both on 3
      HOLD_BEATS.forEach((hb, k) => {
        if (k < 2 && (k === 0) !== (c.id === 'oreo')) return;
        const hp = E.seg(t, hb - 0.04, hb + 0.26);
        if (hp <= 0 || hp >= 1) return;
        y -= 70 * Math.sin(Math.PI * hp); row = 'JUMPING'; fr = 2 + Math.floor(hp * 4);
      });
      { const l2 = HOLD_BEATS.reduce((m, hb) => Math.max(m, E.env(t, hb + 0.26, 0.08)), 0); sx *= 1 + 0.2 * l2; sy *= 1 - 0.18 * l2; }
    }
    // contact shadow
    ctx.save(); ctx.fillStyle = 'rgba(0,0,0,0.35)';
    const sh = E.clamp01(1 - (yFeet - y) / 300);
    ctx.beginPath(); ctx.ellipse(c.x1, yFeet + 4, 90 * sh, 16 * sh, 0, 0, E.TAU); ctx.fill(); ctx.restore();
    E.drawSprite(ctx, c.id, row, fr, Math.round(x), Math.round(y), sc, { anchor: 'feet', flip: c.flip, sx, sy, clamp: row === 'JUMPING', outline: { color: '#2a0f1f', px: 1 } });
    // meow ring (2 rings) from the head
    const rp = E.seg(t, c.ring, c.ring + 0.55);
    if (rp > 0 && rp < 1) E.shockwave(ctx, c.x1 + (c.flip ? -30 : 30), yFeet - 150, rp, { radius: 190, width: 14, color: '#b6f36a', rings: 2, gap: 0.3 });
    if (rp > 0 && rp < 1 && c.id === 'oreo') {
      // tiny pixel "meow" glyph bubble: three rising notes as squares
      for (let k = 0; k < 3; k++) {
        const q = E.seg(t, c.ring + k * 0.08, c.ring + 0.45 + k * 0.08, 'cubicOut');
        if (q <= 0 || q >= 1) continue;
        ctx.fillStyle = E.rgba('#b6f36a', 1 - q);
        const bx = c.x1 - 70 - k * 34, by = yFeet - 200 - q * 120;
        ctx.fillRect(Math.round(bx), Math.round(by), 14, 14);
      }
    }
  }
}

// Final hit: URL stamp (Passion One), PLAY TO SAVE. (Cat Paw, pink) with a beating heart.
function drawFinal(ctx, t, E) {
  const { W } = E;
  const p = E.seg(t, FINAL, FINAL + 0.22);
  const s = 1.4 + (1 - 1.4) * E.punch(p);
  const a = E.clamp01(p * 4);
  const drift = t > FINAL + 0.3 ? 3 * Math.sin(t * 2.0) : 0;
  E.shockwave(ctx, W / 2, URL_Y, E.seg(t, FINAL, FINAL + 0.6), { radius: 1100, width: 34, color: '#fcecbb', rings: 2, gap: 0.12 });
  ctx.save(); ctx.translate(W / 2, URL_Y + drift); ctx.scale(s, s); ctx.globalAlpha = a;
  E.drawText(ctx, 'TOKENTAILS.COM/HEIST', 0, 0, {
    font: PASSION, weight: 700, size: 76, tracking: 0.03, color: '#fcecbb', stroke: '#2a0f1f', strokeWidth: 10,
    extrude: { depth: 6, color: '#2a0f1f' }, shadow: { color: 'rgba(0,0,0,0.5)', blur: 20, y: 8 },
  });
  ctx.restore();
  // living-hold beats: gold ring off the pill + pink ring off the heart, so every beat lands
  for (const hb of HOLD_BEATS) {
    const q = E.seg(t, hb, hb + 0.6);
    if (q <= 0 || q >= 1) continue;
    E.shockwave(ctx, W / 2, PILL_Y, q, { radius: 760, width: 12, color: '#ffc93c', alpha: 0.55 });
    E.shockwave(ctx, W / 2 + 40 - 260, SAVE_Y, E.seg(t, hb + 0.05, hb + 0.55), { radius: 60, width: 6, color: '#ff7aa2', rings: 2, gap: 0.25 });
  }
  // hold beats: an underline wipes under the URL (left to right, then retracts right)
  const uw = E.measureText(ctx, 'TOKENTAILS.COM/HEIST', { font: PASSION, weight: 700, size: 76, tracking: 0.03 });
  HOLD_BEATS.forEach((hb, k) => {
    const a0 = E.seg(t, hb - 0.02, hb + 0.14, 'expoOut'), a1 = E.seg(t, hb + 0.22, hb + 0.44, 'expoIn');
    if (a0 <= 0 || a1 >= 1) return;
    const x0 = W / 2 - uw / 2, x1 = x0 + uw;
    ctx.fillStyle = k % 2 ? '#b6f36a' : '#ffc93c';
    ctx.fillRect(x0 + (x1 - x0) * a1, URL_Y + 46 + drift, (x1 - x0) * (a0 - a1), 7);
  });
  // the on-chain line (site copy: "every payout is public", "PUBLIC, ON-CHAIN")
  const pc = E.seg(t, FINAL + 0.24, FINAL + 0.5, 'expoOut');
  if (pc > 0) { // round 3: 34 px white + green ON-CHAIN on a 50% dark pill; rules measured, never through the text
    const str = 'EVERY PAYOUT PUBLIC, ON-CHAIN';
    const fo = { font: NUNITO, weight: 900, size: 34, tracking: 0.14 };
    const tw = E.measureText(ctx, str, fo);
    ctx.save(); ctx.globalAlpha = pc; ctx.fillStyle = 'rgba(10,4,20,0.5)';
    ctx.beginPath(); ctx.roundRect(W / 2 - tw / 2 - 30, CHAIN_Y - 28, tw + 60, 56, 28); ctx.fill(); ctx.restore();
    E.drawText(ctx, str, W / 2, CHAIN_Y, {
      ...fo, color: '#ffffff', alpha: pc, shadow: { color: 'rgba(0,0,0,0.7)', blur: 10, y: 3 },
      perChar: ({ i }) => ({ color: i >= str.indexOf('ON-CHAIN') ? '#b6f36a' : undefined }),
    });
    const rw = 70 * pc + 30 * E.envs(t, HOLD_BEATS, 0.15), gx = tw / 2 + 30 + 24;
    ctx.fillStyle = '#ffc93c';
    ctx.fillRect(W / 2 - gx - rw, CHAIN_Y - 2, rw, 4); ctx.fillRect(W / 2 + gx, CHAIN_Y - 2, rw, 4);
  }
  // PLAY TO SAVE. lands a frame later
  const p2 = E.seg(t, FINAL + 0.06, FINAL + 0.32);
  if (p2 > 0) {
    const s2 = 1.5 + (1 - 1.5) * E.punch(p2);
    const tw = E.measureText(ctx, 'PLAY TO SAVE.', { font: 'display', size: 56, tracking: 0.05 });
    ctx.save(); ctx.translate(W / 2 + 40, SAVE_Y - drift); ctx.scale(s2, s2); ctx.globalAlpha = E.clamp01(p2 * 4);
    E.drawText(ctx, 'PLAY TO SAVE.', 0, 0, { font: 'display', size: 56, tracking: 0.05, color: '#ff7aa2', stroke: '#2a0f1f', strokeWidth: 8, extrude: { depth: 4, color: '#2a0f1f' } });
    // heart: beats once on the hit, then on the beat grid
    const beat = E.env(t, FINAL + 0.06, 0.16) * 0.5 + 0.14 * E.pulse(t, { every: E.BEAT, offset: 0, decay: 0.12 });
    const hs = 74 * (1 + beat);
    ctx.globalAlpha = 1;
    E.drawImg(ctx, 'heart', -tw / 2 - 64, -2, { w: hs, rot: -0.12 + 0.05 * Math.sin(t * 3) });
    ctx.restore();
    // pink heart sparks on the hit
    for (const q of E.burst({ seed: 8300, count: 18, t, t0: FINAL + 0.06, x: W / 2 + 40 - tw / 2 - 64, y: SAVE_Y, speed: [200, 520], angle: [-Math.PI, 0], gravity: 600, drag: 2, life: [0.5, 0.9] })) {
      ctx.globalAlpha = q.alpha; ctx.fillStyle = q.r(7) < 0.5 ? '#ff7aa2' : '#fcecbb';
      ctx.fillRect(Math.round(q.x), Math.round(q.y), 8, 8);
    }
    ctx.globalAlpha = 1;
  }
}

// Confetti: slam burst, final-hit side cannons, gentle continuous fall through the hold.
function drawConfetti(ctx, t, E) {
  const { W, H } = E;
  const pieces = [];
  pieces.push(...E.burst({ seed: 8401, count: 90, t, t0: T0, x: W / 2, y: 420, speed: [700, 1800], angle: [-Math.PI * 0.95, -Math.PI * 0.05], gravity: 1300, drag: 1.6, life: [1.6, 2.6], size: [10, 20], spin: 9 }));
  pieces.push(...E.burst({ seed: 8402, count: 60, t, t0: FINAL, x: -20, y: H + 20, speed: [1300, 2200], angle: [-Math.PI * 0.42, -Math.PI * 0.22], gravity: 1200, drag: 1.4, life: [1.6, 2.4], size: [10, 18], spin: 10 }));
  pieces.push(...E.burst({ seed: 8403, count: 60, t, t0: FINAL, x: W + 20, y: H + 20, speed: [1300, 2200], angle: [-Math.PI * 0.78, -Math.PI * 0.58], gravity: 1200, drag: 1.4, life: [1.6, 2.4], size: [10, 18], spin: 10 }));
  const fall = E.stream({ seed: 8404, rate: 26, t, t0: T0 + 0.6, t1: 30, life: [2.5, 3.5], spawn: (r) => ({ x: r(2) * W, y: -30, vx: (r(3) - 0.5) * 80, vy: 220 + r(4) * 160 }) });
  ctx.save();
  for (const q of [...pieces, ...fall]) {
    const sz = q.size || 8 + 8 * q.r(4);
    const flip = Math.abs(Math.sin((q.age || 0) * (6 + 6 * q.r(5)) + q.r(6) * 6));
    const sway = q.vx !== undefined && q.size === undefined ? 40 * Math.sin(q.age * 2.5 + q.r(6) * 6) : 0;
    ctx.save();
    ctx.translate(q.x + sway, q.y); ctx.rotate(q.rot ?? q.age * 3 + q.r(5) * 6);
    ctx.globalAlpha = Math.min(1, (q.alpha ?? 1) * 1.6);
    ctx.fillStyle = CONFETTI[Math.floor(q.r(7) * CONFETTI.length)];
    ctx.fillRect(-sz / 2, (-sz / 2) * 0.6 * flip, sz, sz * 0.6 * flip + 1);
    ctx.restore();
  }
  ctx.restore();
}

// Fade tail: a few catnip-glow motes drift up through the black.
function drawMotes(ctx, t, E, f) {
  const { W, H } = E;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 9; i++) {
    const x = W * (0.2 + 0.6 * E.rand('mote', i)) + 30 * Math.sin(t * 1.3 + i);
    const y = H * (0.35 + 0.5 * E.rand('motey', i)) - (t - FADE0) * (40 + 40 * E.rand('motev', i));
    const r = 5 + 6 * E.rand('moter', i);
    const a = (0.45 + 0.35 * Math.sin(t * 4 + i * 1.7)) * Math.min(1, f * 1.5) * (1 - E.seg(t, 29.93, 30));
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 5);
    g.addColorStop(0, E.rgba('#b6f36a', a)); g.addColorStop(0.3, E.rgba('#63b98d', a * 0.4)); g.addColorStop(1, E.rgba('#63b98d', 0));
    ctx.fillStyle = g; ctx.fillRect(x - r * 5, y - r * 5, r * 10, r * 10);
  }
  ctx.restore();
}
