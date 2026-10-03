// s5: THE REAL MISSION (bars 9-10, 15.000-18.750 s).
// Breakdown: warm, intimate, no shake. Heartbeat cues drive a pink inner-glow pulse.
//   A 15.000  iris out of the s4 CRT point onto the heist-01 crate      FREE THE SHELTER CAT
//   B 15.469  meow: rescue flash, our pixel heart rises out of the crate, confetti
//   C 15.586  match cut: the heart becomes a window onto a real cat     CAT LOVERS, / MEET REAL SHELTER CATS.
//   D 16.875  cut to the lounge cat, one continuous shot to the crack;  lower third: CATS IN THE GAME COME FROM
//             MIL BIGOTES / PUPPY KITTY NYC / ROŽINĖ PĖDUTĖ (staggered 0.12 s, backOut)
//   E 17.8125 same shot                                                READY TO PLAY. / READY TO SAVE.
//   F 18.281  the stare cracks into a 4x3 grid; tiles flip on the claps to community footage (pre-echo s6)

const T0 = 15.0, T1 = 18.75;
const B = 0.46875;
const HB = [15.0, 15.9375, 16.875, 17.8125]; // heartbeat cues
// Round 2: the real cat arrives a 16th after the meow (was 15.9375), the pink names card is gone
// (names are a lower third over the footage), and from T_CARD one continuous real shot (lounge, push
// 1.00 -> 1.06) carries the names and READY TO PLAY / READY TO SAVE through to the crack.
const T_MEOW = 15.46875, T_CUT = 15.46875 + 0.1171875, T_L2 = 16.171875, T_CARD = 16.875, T_SEP = 17.34375;
const T_STARE = 17.8125, T_SAVE = 18.046875, T_CRACK = 18.28125;
const FLIPS = [18.28125, 18.3984375, 18.515625, 18.6328125];
const CX = 960, HEART_Y = 470;
const NUNITO = '"S5 Nunito", "Nunito", "Helvetica Neue", Arial, sans-serif';

// community clips: manifest index i is file i+1 (file 0000 is never addressed), same as gameplay.
const ft = (n) => (Math.max(1, n) - 1 + 0.001) / 30;

// cover-fit focus that puts source point (u, v) at normalized screen point (sx, sy) for a same-aspect clip
function focusFor(u, v, sx, sy, zoom) {
  const vw = 1 / zoom;
  const fx = (u - sx * vw) / Math.max(1e-6, 1 - vw);
  const fy = (v - sy * vw) / Math.max(1e-6, 1 - vw);
  return { fx: Math.min(1, Math.max(0, fx)), fy: Math.min(1, Math.max(0, fy)) };
}

// lub-dub heartbeat envelope (two hits 0.14 s apart)
function heartEnv(E, t) {
  let v = 0;
  for (const h of HB) v += E.env(t, h, 0.1) + 0.6 * E.env(t, h + 0.14, 0.12);
  return Math.min(1.3, v);
}

// per-char colors for accent words
function accentIdx(str, words) {
  const set = new Set();
  for (const w of words) { const k = str.indexOf(w); if (k >= 0) for (let i = k; i < k + w.length; i++) set.add(i); }
  return set;
}

// kinetic headline: anticipation dip, per-letter elastic pop, accent words in pink
function headline(ctx, E, str, x, y, lt, o = {}) {
  const acc = accentIdx(str, o.accent || []);
  const spread = o.spread ?? 0.16, dur = o.dur ?? 0.42;
  return E.drawText(ctx, str, x, y, {
    size: o.size || 120, color: o.color || 'cream', tracking: o.tracking ?? 0.03, align: o.align || 'center',
    extrude: { depth: o.depth ?? 9, color: o.ex || 'outline', dark: 0.35 },
    shadow: { color: 'rgba(20,4,24,0.55)', blur: 28, y: 10 },
    alpha: o.alpha,
    perChar: ({ i, n }) => {
      const s0 = (i / Math.max(1, n - 1)) * spread;
      const q = E.clamp01((lt - s0) / dur);
      if (q <= 0) return false;
      const e = E.elasticOut(q, 1, 0.42);
      const a = E.clamp01(q * 5);
      const wob = o.wobble ? Math.sin((lt + i * 0.13) * 5.2) * o.wobble : 0;
      return { y: (1 - e) * (o.rise ?? 90) + wob, scale: 0.55 + 0.45 * e, rot: (1 - e) * 0.25 * (i % 2 ? 1 : -1), alpha: a, color: acc.has(i) ? (o.accentColor || 'pink') : undefined };
    },
  });
}

// pixel confetti
function confetti(ctx, E, t, t0, x, y, seed, count, spread = 1) {
  const cols = ['#ff7aa2', '#fcecbb', '#ffc93c', '#f0c5fd', '#ffffff'];
  const ps = E.burst({ seed, count, t, t0, x, y, speed: [500 * spread, 1500 * spread], angle: [-Math.PI * 0.95, -Math.PI * 0.05], gravity: 1500, drag: 1.6, life: [0.7, 1.3], size: [8, 18], spin: 14 });
  ctx.save();
  for (const p of ps) {
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
    const flip = Math.abs(Math.cos(p.age * 9 + p.r(7) * 6));
    ctx.globalAlpha = Math.min(1, p.alpha * 1.6);
    ctx.fillStyle = cols[Math.floor(p.r(8) * cols.length)];
    const s = p.size;
    if (p.r(11) < 0.22) E.drawImg(ctx, 'heart', 0, 0, { w: s * 1.8, pixel: true });
    else ctx.fillRect(-s / 2, -s * flip / 2, s, Math.max(1, s * flip * 0.7));
    ctx.restore();
  }
  ctx.restore();
}

// floating dust with 3 parallax layers; px/py = camera drift in px
function dust(ctx, E, t, { px = 0, py = 0, alpha = 1, color = '#fff3d0', seed = 51 } = {}) {
  ctx.save(); ctx.globalCompositeOperation = 'screen';
  for (let layer = 0; layer < 3; layer++) {
    const depth = 0.4 + layer * 0.6, n = 9 - layer * 2; // halved in round 2
    for (let i = 0; i < n; i++) {
      const r = (k) => E.rand(seed, layer, i, k);
      const x = E.mod(r(1) * 2200 + t * (14 + r(2) * 30) * depth + px * depth, 2200) - 140;
      const y = E.mod(r(3) * 1300 - t * (20 + r(4) * 26) * depth + py * depth + Math.sin(t * 1.3 + r(5) * 9) * 18, 1300) - 110;
      const s = (2 + r(6) * 3) * depth * 1.6;
      const tw = 0.55 + 0.45 * Math.sin(t * 3 + r(7) * 12);
      const g = ctx.createRadialGradient(x, y, 0, x, y, s * 3);
      g.addColorStop(0, E.rgba(color, 0.55 * alpha * tw)); g.addColorStop(1, E.rgba(color, 0));
      ctx.fillStyle = g; ctx.fillRect(x - s * 3, y - s * 3, s * 6, s * 6);
    }
  }
  ctx.restore();
}

// warm grade: tint footage toward cream/pink; amt 0..1
function warmGrade(ctx, E, amt, { night = 0 } = {}) {
  const { W, H } = E;
  ctx.save();
  if (night > 0) { ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = night; ctx.fillStyle = '#4b2a7a'; ctx.fillRect(0, 0, W, H); }
  if (amt > 0) {
    ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = amt;
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#ffb38a'); g.addColorStop(0.55, '#ff7aa2'); g.addColorStop(1, '#ffc93c');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
}

// Paris footage grade (round 2): highlights down ~10%, +15% contrast, purple lift in the shadows, so
// the blown-out pink/beige cafe sits in the reel's palette. drawFn draws the clip.
function parisGrade(ctx, E, drawFn) {
  const { W, H } = E;
  // round 3: blacks crushed back to 0 (no lighten lift); warmth only in the midtones via soft-light
  ctx.save(); ctx.filter = 'contrast(1.22) brightness(0.88) saturate(1.12)'; drawFn(ctx); ctx.restore();
  ctx.save();
  ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = 0.22; ctx.fillStyle = '#ff9a6a'; ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = 0.08; ctx.fillStyle = '#7a4aa8'; ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

// soft pink inner glow ring that breathes on heartbeats
function heartGlow(ctx, E, t, base = 0.18) {
  const { W, H } = E;
  const h = heartEnv(E, t);
  const sc = 1 + 0.04 * h;
  const inner = Math.min(W, H) * (0.42 - 0.08 * h) * sc;
  ctx.save(); ctx.globalCompositeOperation = 'screen';
  const g = ctx.createRadialGradient(W / 2, H / 2, inner, W / 2, H / 2, Math.hypot(W, H) / 2);
  g.addColorStop(0, 'rgba(255,122,162,0)');
  g.addColorStop(0.6, `rgba(255,122,162,${(base + 0.32 * h) * 0.55})`);
  g.addColorStop(1, `rgba(255,90,140,${base + 0.32 * h})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

// bottom / top darkening for legible type over bright footage
function scrim(ctx, E, y0, y1, a, color = '#1a0820') {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, E.rgba(color, 0)); g.addColorStop(1, E.rgba(color, a));
  ctx.save(); ctx.fillStyle = g; ctx.fillRect(0, Math.min(y0, y1), E.W, Math.abs(y1 - y0)); ctx.restore();
  const ext = y1 > y0 ? [y1, E.H] : [0, y1];
  ctx.save(); ctx.fillStyle = E.rgba(color, a); ctx.fillRect(0, ext[0], E.W, ext[1] - ext[0]); ctx.restore();
}

// ---------------------------------------------------------------------------------------------
// A + B: crate close-up, rescue, heart
// ---------------------------------------------------------------------------------------------
function crateFile(t) {
  // file 14 -> 26 lands the RESCUE frame on the meow cue, then 0.75x
  if (t < T_MEOW) return 14 + (t - T0) / (T_MEOW - T0) * 12;
  return 26 + (t - T_MEOW) * 30 * 0.75;
}
// crate centre in source pixels per file (tracked by eye from the clip; the game camera drifts)
const CRATE_TRACK = [[14, 1110, 486], [20, 1035, 496], [26, 980, 508], [30, 1030, 506], [34, 1120, 486], [40, 1150, 480]];
function crateAt(E, f) { return E.keys(f, CRATE_TRACK.map(([n, x, y]) => [n, [x / 1920, y / 1080], 'sineInOut'])); }

function drawCrate(ctx, E, t, { heartOut = 0 } = {}) {
  const { W, H } = E;
  const f = crateFile(t);
  const lt = t - T0;
  const zoom = 2.2 * (1 + 0.02 * E.seg(lt, 0, 0.94)) * (1 + 0.012 * heartEnv(E, t));
  const [u, v] = crateAt(E, f);
  const fo = focusFor(u, v, 0.5, 0.56, zoom);
  ctx.fillStyle = E.col('night'); ctx.fillRect(0, 0, W, H);
  E.drawClip(ctx, 'h01-rescue', ft(f), 0, 0, W, H, { zoom, fx: fo.fx, fy: fo.fy });
  warmGrade(ctx, E, 0.12 + 0.25 * E.seg(t, T_MEOW, T_CUT), { night: 0.18 * (1 - E.seg(t, T0, T_MEOW)) });
  dust(ctx, E, t, { px: -lt * 40, py: lt * 10, alpha: 0.9 });
}

function drawHeart(ctx, E, t) {
  if (t < T_MEOW) return;
  const lt = t - T_MEOW;
  // rise out of the crate (screen ~ 960, 600) to the eye line, 0 -> 1.4 -> 1
  const rise = E.seg(lt, 0, 0.32, 'backOut');
  const y = E.lerp(530, HEART_Y, rise);
  const grow = E.elasticOut(E.seg(lt, 0, 0.3), 1, 0.45) * 1.4;
  const settle = E.seg(lt, 0.26, 0.44, 'backOut');
  let s = E.lerp(grow, 1, settle);
  // anticipation: lub-dub squash before the cut
  const pre = E.seg(t, T_CUT - 0.14, T_CUT - 0.02, 'quadIn');
  const sq = 1 - 0.1 * Math.sin(pre * Math.PI);
  const beat = 1 + 0.05 * Math.sin(Math.min(1, lt / 0.2) * Math.PI) * (lt < 0.2 ? 0 : 1);
  s *= beat;
  const w = 420 * s;
  // glow + rings
  ctx.save(); ctx.globalCompositeOperation = 'screen';
  const g = ctx.createRadialGradient(CX, y, 0, CX, y, w * 1.3);
  g.addColorStop(0, 'rgba(255,122,162,0.55)'); g.addColorStop(1, 'rgba(255,122,162,0)');
  ctx.fillStyle = g; ctx.fillRect(CX - w * 1.4, y - w * 1.4, w * 2.8, w * 2.8);
  ctx.restore();
  E.shockwave(ctx, CX, 520, E.seg(lt, 0, 0.55), { radius: 620, width: 22, color: 'meowRing', rings: 2, gap: 0.14, alpha: 0.8 });
  E.shockwave(ctx, CX, y, E.seg(lt, 0.08, 0.6), { radius: 900, width: 12, color: 'pink', rings: 1, alpha: 0.7 });
  // smear on the fast rise (2 trailing ghosts)
  if (lt < 0.12) {
    for (let k = 2; k >= 1; k--) {
      const lk = Math.max(0, lt - k / 60);
      const yk = E.lerp(530, HEART_Y, E.seg(lk, 0, 0.32, 'backOut'));
      const sk = E.elasticOut(E.seg(lk, 0, 0.3), 1, 0.45) * 1.4;
      E.drawImg(ctx, 'heart', CX, yk, { w: 420 * sk, h: 420 * sk * (324 / 351) * 1.25, pixel: true, alpha: 0.25 / k });
    }
  }
  E.drawImg(ctx, 'heart', CX, y, { w: w / sq, h: w * (324 / 351) * sq, pixel: true });
  // white hit flash on the sprite
  const hit = E.env(lt, 0, 0.06);
  if (hit > 0.02) {
    E.layer(ctx, (L) => {
      E.drawImg(L, 'heart', CX, y, { w: w / sq, h: w * (324 / 351) * sq, pixel: true });
      L.globalCompositeOperation = 'source-atop'; L.fillStyle = '#fff3d0'; L.globalAlpha = hit; L.fillRect(0, 0, E.W, E.H);
    });
  }
  confetti(ctx, E, t, T_MEOW + 0.02, CX, 520, 505, 32, 1);
  // pixel sparkles orbiting
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * E.TAU + lt * 1.6;
    const rr = w * (0.75 + 0.08 * Math.sin(lt * 6 + i));
    const q = E.seg(lt, 0.1 + i * 0.02, 0.3 + i * 0.02, 'backOut');
    if (q <= 0) continue;
    E.star(ctx, CX + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.8, 10 * q * (0.7 + 0.3 * Math.sin(lt * 9 + i)), { points: 4, inner: 0.3, fill: i % 2 ? 'cream' : 'coin' });
  }
}

// ---------------------------------------------------------------------------------------------
// C: heart window -> real cat (paris-cat-leap)
// ---------------------------------------------------------------------------------------------
function leapFile(t) { return Math.min(24, 1 + (t - T_CUT) * 30 * 0.6); } // 25-frame clip stretched over the 1.29 s hold
function drawLeap(ctx, E, t, zoomExtra = 1) {
  const { W, H } = E;
  const lt = t - T_CUT;
  const zoom = Math.max(1, 1.24 * zoomExtra) * (1 + 0.03 * E.seg(lt, 0, 0.94)) * (1 + 0.01 * heartEnv(E, t));
  // eyes: f1 ~ (0.47, 0.44) drifting as the cat moves along the shelf
  const u = E.lerp(0.47, 0.5, E.seg(lt, 0, 0.9)), v = E.lerp(0.44, 0.43, E.seg(lt, 0, 0.9));
  const fo = focusFor(u, v, 0.5, HEART_Y / H, zoom);
  parisGrade(ctx, E, (c) => E.drawClip(c, 'community/paris-cat-leap', ft(leapFile(t)), 0, 0, W, H, { zoom, fx: fo.fx, fy: fo.fy }));
  warmGrade(ctx, E, 0.14);
}

function drawHeartWindow(ctx, E, t) {
  const { W, H } = E;
  const lt = t - T_CUT;
  const g = E.seg(lt, 0.05, 0.3, 'expoInOut');
  const w = E.lerp(420 * 1.05, 9200, g);
  const counter = E.lerp(0.81, 1, g); // window starts wide on the face, pushes in as it opens
  if (w > 8600) { drawLeap(ctx, E, t, counter); return; }
  // what was behind: the warm crate frame, dimmed
  drawCrate(ctx, E, t);
  ctx.save(); ctx.fillStyle = 'rgba(40,8,40,0.45)'; ctx.fillRect(0, 0, W, H); ctx.restore();
  // pink rim (the sprite) then the footage masked by an inset heart
  const hRatio = 324 / 351;
  const pop = 1 + 0.08 * E.env(lt, 0, 0.12);
  E.drawImg(ctx, 'heart', CX, HEART_Y, { w: w * 1.1 * pop, h: w * 1.1 * hRatio * pop, pixel: true });
  E.layer(ctx, (L) => {
    drawLeap(L, E, t, counter);
    L.globalCompositeOperation = 'destination-in';
    E.drawImg(L, 'heart', CX, HEART_Y + w * 0.012, { w: w * 0.9 * pop, h: w * 0.9 * hRatio * pop, pixel: true });
  });
  const rq = E.seg(lt, 0, 0.4);
  if (rq < 1) { ctx.save(); ctx.globalAlpha = Math.pow(1 - rq, 1.3); ctx.strokeStyle = E.col('cream'); ctx.lineWidth = 18 * (1 - rq) + 2;
    ctx.beginPath(); E.path.circle(ctx, CX, HEART_Y, w * 0.62 + 700 * E.expoOut(rq)); ctx.stroke(); ctx.restore(); }
}

function drawLeapText(ctx, E, t) {
  const lt = t - T_CUT;
  scrim(ctx, E, 560, 980, 0.62);
  const up = E.seg(t, T_L2, T_L2 + 0.28, 'backOut');
  const y1 = E.lerp(840, 740, up);
  // round 3: the same 40% dark band as READY TO PLAY sits behind the caption (cream on cream fur)
  const bq = E.seg(lt, 0.0, 0.12, 'expoOut');
  const bTop = E.lerp(740, 650, up);
  ctx.save(); ctx.fillStyle = 'rgba(16,6,26,0.5)'; ctx.fillRect(CX - 820 * bq, bTop, 1640 * bq, 1000 - bTop); ctx.restore();
  headline(ctx, E, 'CAT LOVERS,', CX, y1 + Math.sin(lt * 2.1) * 4, lt - 0.06, { size: 120, wobble: 2 });
  if (t >= T_L2) {
    // line 2 rises from behind a mask line
    const p = E.seg(t, T_L2, T_L2 + 0.3, 'expoOut');
    const yLine = 912;
    E.mask(ctx, (c) => c.rect(0, 0, E.W, yLine + 70), (c) => {
      headline(c, E, 'MEET REAL SHELTER CATS.', CX, E.lerp(yLine + 150, yLine - 16, p) + Math.sin(lt * 2.3 + 1) * 3, 1, { size: 108, accent: ['REAL', 'SHELTER'], spread: 0, dur: 0.001 });
    });
    // the mask line itself: a gold rule that flicks out
    const rw = E.seg(t, T_L2 - 0.02, T_L2 + 0.18, 'expoOut') * 1300 * (1 - E.seg(t, T_L2 + 0.26, T_L2 + 0.4, 'expoIn'));
    ctx.save(); ctx.fillStyle = E.col('coin'); ctx.fillRect(CX - rw / 2, yLine + 70, rw, 5); ctx.restore();
  }
}

// ---------------------------------------------------------------------------------------------
// D: pink shelter card
// ---------------------------------------------------------------------------------------------
const NAMES = ['MIL BIGOTES', 'PUPPY KITTY NYC', 'ROŽINĖ PĖDUTĖ'];
function drawName(ctx, E, name, x, y, size, o = {}) {
  // Cat Paw has no Ė: draw E and add the dot accent by hand, matched to the face colour
  const plain = name.replace(/Ė/g, 'E');
  const opts = { size, color: 'cream', tracking: 0.02, align: 'left', extrude: { depth: 7, color: 'outline', dark: 0.3 }, ...o };
  const r = E.drawText(ctx, plain, x, y, opts);
  const tr = (opts.tracking || 0) * size;
  for (let i = 0; i < name.length; i++) {
    if (name[i] !== 'Ė') continue;
    const pre = E.measureText(ctx, plain.slice(0, i), opts) + (i > 0 ? tr : 0);
    const cw = E.measureText(ctx, 'E', opts);
    const dx = x + pre + cw / 2, dy = y - size * 0.6, d = size * 0.15;
    for (let k = 7; k >= 1; k--) { ctx.fillStyle = E.shade(E.col('outline'), -0.3 * k / 7); ctx.fillRect(dx - d / 2 + 0.7 * k, dy - d / 2 + k, d, d); }
    ctx.fillStyle = E.col(opts.color); ctx.fillRect(dx - d / 2, dy - d / 2, d, d);
  }
  return r;
}

function drawCard(ctx, E, t) {
  const { W, H } = E;
  const lt = t - T_CARD;
  const breathe = 1 + 0.02 * E.seg(lt, 0, 0.94) + 0.006 * heartEnv(E, t);
  E.camera(ctx, { zoom: breathe, rot: -0.004 + 0.008 * E.seg(lt, 0, 0.94), cx: W / 2, cy: H / 2 }, (c) => {
    const g = c.createLinearGradient(0, -200, W * 0.6, H + 300);
    g.addColorStop(0, '#ff8fb3'); g.addColorStop(0.5, '#e0648f'); g.addColorStop(1, E.col('plum'));
    c.fillStyle = g; c.fillRect(-100, -100, W + 200, H + 200);
    // diagonal halftone of tiny hearts drifting
    c.save(); c.globalAlpha = 0.09;
    for (let j = -1; j < 10; j++) for (let i = -1; i < 16; i++) {
      const x = i * 140 + (j % 2) * 70 + lt * 40, y = j * 130 - lt * 24;
      E.drawImg(c, 'heart', x, y, { w: 34, pixel: true });
    }
    c.restore();
    // soft light from top-left
    c.save(); c.globalCompositeOperation = 'screen';
    const rg = c.createRadialGradient(W * 0.3, H * 0.2, 0, W * 0.3, H * 0.2, W * 0.8);
    rg.addColorStop(0, 'rgba(255,230,200,0.35)'); rg.addColorStop(1, 'rgba(255,230,200,0)');
    c.fillStyle = rg; c.fillRect(0, 0, W, H); c.restore();

    // big soft heart watermark that beats
    E.drawImg(c, 'heart', W / 2, 560, { w: 1100 * (1 + 0.035 * heartEnv(E, t)) * (0.9 + 0.1 * E.seg(lt, 0, 0.3, 'backOut')), pixel: true, alpha: 0.1 });
    // paw prints walking along the bottom, one every 16th, alternating feet
    for (let k = 0; k < 10; k++) {
      const tk = T_CARD + k * (B / 4);
      const q = E.seg(t, tk, tk + 0.09, 'backOut');
      if (q <= 0) continue;
      const u = k / 9;
      const px = E.lerp(90, 1830, u), py = E.lerp(985, 900, u) + (k % 2 ? -40 : 40);
      const fade = 1 - E.seg(t, tk + 0.55, tk + 0.8);
      E.drawImg(c, 'paw', px, py, { w: 104 * q, rot: Math.PI / 2 - 0.05 + (k % 2 ? 0.12 : -0.12), pixel: true, alpha: 0.9 * fade });
    }

    // kicker types on with a cursor
    const kick = 'CATS IN THE GAME COME FROM';
    const kp = E.seg(t, T_CARD + 0.06, T_CARD + 0.3);
    const ks = E.typewriter(kick, kp);
    if (ks.length) {
      const opts = { size: 40, font: NUNITO, weight: 800, color: 'cream', tracking: 0.24, align: 'left', shadow: { color: 'rgba(60,10,40,0.4)', blur: 10, y: 3 } };
      const full = E.measureText(c, kick, opts);
      const lx = W / 2 - full / 2;
      E.drawText(c, ks, lx, 300, opts);
      if (kp < 1 || E.fract(lt * 3) < 0.5) {
        const cw = E.measureText(c, ks, opts);
        c.fillStyle = E.col('cream'); c.fillRect(lx + cw + 10, 281, 18, 38);
      }
      // little heart medallion above
      const hq = E.seg(t, T_CARD + 0.02, T_CARD + 0.24, 'backOut');
      E.drawImg(c, 'heart', W / 2, 205 - 4 * heartEnv(E, t), { w: 66 * hq * (1 + 0.12 * heartEnv(E, t)), pixel: true });
    }

    // the three names, stacked, pixel hearts as separators
    const size = 100;
    const ys = [430, 572, 714];
    let maxW = 0;
    for (let i = 0; i < 3; i++) {
      const wN = E.measureText(c, NAMES[i].replace(/Ė/g, 'E'), { size, tracking: 0.02 });
      maxW = Math.max(maxW, wN);
      const tn = T_CARD + 0.16 + i * 4 / 60;
      const q = E.seg(t, tn, tn + 0.3);
      if (q <= 0) continue;
      const e = E.backOut(q, 1.9);
      const side = i === 1 ? 1 : -1;
      const drift = Math.sin((t - tn) * 1.7 + i) * 4;
      c.save();
      c.translate(W / 2 + (1 - e) * 220 * side, ys[i] + (1 - e) * 40 + drift);
      c.rotate((1 - e) * side * 0.06);
      c.scale(0.7 + 0.3 * e + 0.015 * heartEnv(E, t), 0.7 + 0.3 * e + 0.015 * heartEnv(E, t));
      c.globalAlpha = E.clamp01(q * 4);
      drawName(c, E, NAMES[i], -wN / 2, 0, size);
      const glint = E.seg(t, T_SEP + 0.1 + i * 0.06, T_SEP + 0.42 + i * 0.06);
      if (glint > 0 && glint < 1) {
        E.layer(c, (L) => {
          drawName(L, E, NAMES[i], -wN / 2, 0, size, { extrude: null, color: '#ffffff' });
          L.globalCompositeOperation = 'destination-in';
          const gx = E.lerp(-wN / 2 - 160, wN / 2 + 160, glint);
          const gg = L.createLinearGradient(gx - 90, -60, gx + 90, 60);
          gg.addColorStop(0, 'rgba(255,255,255,0)'); gg.addColorStop(0.5, 'rgba(255,255,255,1)'); gg.addColorStop(1, 'rgba(255,255,255,0)');
          L.fillStyle = gg; L.fillRect(-wN, -size, wN * 2, size * 2);
        }, { blend: 'screen', alpha: 0.9 });
      }
      c.restore();
    }
    // heart bullets flanking each name: pre-pop with the name, full pop on the off-beat
    for (let i = 0; i < 3; i++) {
      const wN = E.measureText(c, NAMES[i].replace(/Ė/g, 'E'), { size, tracking: 0.02 });
      const tn = T_CARD + 0.22 + i * 4 / 60;
      const pre = E.seg(t, tn, tn + 0.2, 'backOut') * 0.55;
      const ts = T_SEP + i * 0.05;
      const sq = E.seg(t, ts, ts + 0.32);
      const sc = sq > 0 ? 0.55 + 0.45 * E.elasticOut(sq, 1, 0.35) + 0.35 * E.env(t, ts, 0.1) : pre;
      if (sc <= 0) continue;
      for (const dx of [-1, 1]) {
        const hx = W / 2 + dx * (wN / 2 + 64), hy = ys[i] - 6;
        E.drawImg(c, 'heart', hx, hy, { w: 52 * sc * (1 + 0.1 * heartEnv(E, t)), pixel: true, rot: dx * 0.12 * (1 - E.clamp01(sq)) });
        if (sq > 0) E.shockwave(c, hx, hy, E.seg(t, ts, ts + 0.4), { radius: 100, width: 6, color: 'cream', rings: 1 });
      }
    }
    // rule under the names draws out from centre on the off-beat
    const rw = E.seg(t, T_SEP, T_SEP + 0.3, 'expoOut') * maxW * 1.1;
    c.fillStyle = E.rgba('outline', 0.3); c.fillRect(W / 2 - rw / 2 + 3, ys[2] + 84, rw, 5);
    c.fillStyle = E.rgba('cream', 0.9); c.fillRect(W / 2 - rw / 2, ys[2] + 80, rw, 5);
  });
}

// ---------------------------------------------------------------------------------------------
// E + F: hero stare (paris-cat-lounge, never past file 0032) and the tile crack
// ---------------------------------------------------------------------------------------------
function loungeFile(t) { return Math.min(32, 8 + Math.max(0, t - T_CARD) * 17); } // one shot T_CARD -> crack
const LOUNGE_TRACK = [[8, 0.46, 0.29], [14, 0.49, 0.29], [20, 0.5, 0.3], [24, 0.51, 0.33], [28, 0.52, 0.42], [32, 0.53, 0.51]];
function drawLounge(ctx, E, t, x = 0, y = 0, w = E.W, h = E.H) {
  const f = loungeFile(t);
  const zoom = 1.12 * (1 + 0.06 * E.seg(t, T_CARD, T_CRACK, 'sineInOut')) * (1 + 0.006 * heartEnv(E, t));
  const [u, v] = E.keys(f, LOUNGE_TRACK.map(([n, a, b]) => [n, [a, b], 'sineInOut']));
  const fo = focusFor(u, v, 0.5, 0.52, zoom);
  parisGrade(ctx, E, (c) => E.drawClip(c, 'community/paris-cat-lounge', ft(f), x, y, w, h, { zoom, fx: fo.fx, fy: fo.fy }));
}
function drawStare(ctx, E, t, noText = false) {
  const { W, H } = E;
  const lt = t - T_STARE;
  drawLounge(ctx, E, t);
  warmGrade(ctx, E, 0.16);
  scrim(ctx, E, 520, 80, 0.6);
  if (!noText) drawReady(ctx, E, t, 0);
  dust(ctx, E, t, { px: -lt * 30, alpha: 0.6, seed: 77 });
}
// round 3: each line drops word by word and is fully readable ON its clap (PLAY 17.8125, SAVE 18.047)
const READY_IN = [[T_STARE - 0.1125, 'READY TO PLAY.', 170, []], [T_SAVE - 0.1075, 'READY TO SAVE.', 320, ['SAVE']]];
function wordDrop(ctx, E, str, x, y, lt, o = {}) {
  const words = str.split(' ');
  const wIdx = []; words.forEach((w, k) => { for (let i = 0; i < w.length; i++) wIdx.push(k); if (k < words.length - 1) wIdx.push(k); });
  const acc = accentIdx(str, o.accent || []);
  return E.drawText(ctx, str, x, y, {
    size: o.size || 130, color: 'cream', tracking: 0.03, align: 'center',
    extrude: { depth: 9, color: 'outline', dark: 0.35 }, shadow: { color: 'rgba(20,4,24,0.55)', blur: 28, y: 10 },
    perChar: ({ i }) => {
      const k = wIdx[i] ?? 0;
      const q = E.seg(lt, k * 0.032, k * 0.032 + 0.045);
      if (q <= 0) return false;
      const e = E.backOut(q, 2.4);
      const sp = o.split || 0; // exit: words fly apart from the centre
      return { y: (1 - e) * -120 + sp * 40, x: sp * (k - (words.length - 1) / 2) * 420, scale: 1.25 - 0.25 * e, alpha: E.clamp01(q * 4) * (1 - sp), color: acc.has(i) ? 'pink' : undefined };
    },
  });
}
function drawReady(ctx, E, t, split) {
  const lt = t - T_STARE;
  const bq = E.seg(t, READY_IN[0][0] - 0.03, READY_IN[0][0] + 0.06, 'expoOut') * (1 - split);
  if (bq > 0) { ctx.save(); ctx.fillStyle = 'rgba(16,6,26,0.45)'; ctx.fillRect(CX - 760 * bq, 82, 1520 * bq, 330); ctx.restore(); }
  for (const [t0, str, y, accent] of READY_IN) {
    if (t < t0) continue;
    const ly = y + Math.sin(lt * 2 + (y > 200 ? 1 : 0)) * 3;
    wordDrop(ctx, E, str, CX, ly, t - t0, { accent, split });
  }
}

// Names as a lower third over the continuous lounge shot (replaces the round-1 full-frame pink card).
function drawNamesLower(ctx, E, t) {
  const { W } = E;
  const lt = t - T_CARD;
  const out = E.seg(t, T_STARE - 0.2, T_STARE - 0.1125, 'expoIn');
  scrim(ctx, E, 700, 930, 0.72);
  // kicker types on with a cursor
  const kick = 'CATS IN THE GAME COME FROM';
  const kp = E.seg(lt, 0.0, 0.16);
  const ks = E.typewriter(kick, kp);
  const kopts = { size: 34, font: NUNITO, weight: 900, color: 'pink', tracking: 0.26, shadow: { color: 'rgba(0,0,0,0.6)', blur: 10, y: 3 }, alpha: 1 - out };
  if (ks.length) E.drawText(ctx, ks, CX, 836 - out * 20, kopts);
  // three names in a row, hearts between, staggered 0.12 s with backOut
  const size = 70, gapH = 110;
  const ws = NAMES.map((n) => E.measureText(ctx, n.replace(/Ė/g, 'E'), { size, tracking: 0.02 }));
  const total = ws.reduce((a, b) => a + b, 0) + gapH * 2;
  let x = W / 2 - total / 2;
  for (let i = 0; i < 3; i++) {
    const tn = T_CARD + 0.06 + i * 0.12;
    const q = E.seg(t, tn, tn + 0.24);
    if (q > 0) {
      const e = E.backOut(q, 2.2);
      ctx.save();
      ctx.translate(x + ws[i] / 2, 932 + (1 - e) * 60 - out * 30);
      ctx.scale(0.6 + 0.4 * e + 0.015 * heartEnv(E, t), 0.6 + 0.4 * e + 0.015 * heartEnv(E, t));
      ctx.globalAlpha = E.clamp01(q * 4) * (1 - out);
      drawName(ctx, E, NAMES[i], -ws[i] / 2, 0, size);
      const glint = E.seg(t, T_SEP + 0.1 + i * 0.06, T_SEP + 0.42 + i * 0.06);
      if (glint > 0 && glint < 1) {
        E.layer(ctx, (L) => {
          drawName(L, E, NAMES[i], -ws[i] / 2, 0, size, { extrude: null, color: '#ffffff' });
          L.globalCompositeOperation = 'destination-in';
          const gx = E.lerp(-ws[i] / 2 - 160, ws[i] / 2 + 160, glint);
          const gg = L.createLinearGradient(gx - 90, -60, gx + 90, 60);
          gg.addColorStop(0, 'rgba(255,255,255,0)'); gg.addColorStop(0.5, 'rgba(255,255,255,1)'); gg.addColorStop(1, 'rgba(255,255,255,0)');
          L.fillStyle = gg; L.fillRect(-ws[i], -size, ws[i] * 2, size * 2);
        }, { blend: 'screen', alpha: 0.9 });
      }
      ctx.restore();
    }
    x += ws[i];
    if (i < 2) { // heart separator pops on the off-beat
      const ts = T_SEP + i * 0.05;
      const pre = E.seg(t, tn + 0.08, tn + 0.28, 'backOut') * 0.6;
      const sq = E.seg(t, ts, ts + 0.32);
      const sc = (sq > 0 ? 0.6 + 0.4 * E.elasticOut(sq, 1, 0.35) + 0.3 * E.env(t, ts, 0.1) : pre) * (1 - out);
      if (sc > 0) E.drawImg(ctx, 'heart', x + gapH / 2, 926, { w: 44 * sc * (1 + 0.1 * heartEnv(E, t)), pixel: true });
      x += gapH;
    }
  }
}

// back faces for the tile flip: first frames of the s6 community clips
const BACKS = [
  ['paris-chat', 6], ['ugc-king-portrait', 20], ['paris-cafe-sign', 20], ['ugc-kitten-recommend', 10],
  ['paris-phones-play', 30], ['paris-crew', 20, [0, 0, 1, 0.58]], ['paris-crew', 26, [0, 0, 1, 0.58]], ['reel-tuxedo-characters', 4],
  ['ugc-ceo-legends', 12], ['paris-cat-leap', 4], ['paris-phones-play', 50], ['ugc-king-portrait', 75],
];
function drawCrack(ctx, E, t) {
  const { W, H } = E;
  const cols = 4, rows = 3, tw = W / cols, th = H / rows;
  const lt = t - T_CRACK;
  // stare frame rendered once into a surface (it is the tiles' front face)
  const S = E.surface('s5stare', W, H);
  drawStare(S.ctx, E, t, true);
  ctx.fillStyle = E.col('night'); ctx.fillRect(0, 0, W, H);
  // radial order -> flip group
  const tiles = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const d = Math.hypot(i - 1.5, (j - 1) * 1.0);
    tiles.push({ i, j, d });
  }
  const ds = [...new Set(tiles.map((q) => q.d.toFixed(3)))].sort((a, b) => a - b);
  const sep = E.seg(lt, 0, 0.16, 'backOut');
  const gap = 10 * sep;
  const shrink = 1 - 0.06 * E.seg(lt, 0, 0.47, 'sineInOut');
  for (const tl of tiles) {
    const g = ds.indexOf(tl.d.toFixed(3));
    const tf = FLIPS[Math.min(g, FLIPS.length - 1)];
    const p = E.seg(t, tf, tf + 0.11, 'sineInOut');
    const k = tl.j * cols + tl.i;
    const ox = (tl.i - 1.5) * gap * 1.6 + E.randSigned('s5o', k) * 6 * sep, oy = (tl.j - 1) * gap * 1.6 + E.randSigned('s5p', k) * 6 * sep;
    const cx = (tl.i + 0.5) * tw, cy = (tl.j + 0.5) * th;
    const sx = (cx - W / 2) * shrink + W / 2 + ox, sy = (cy - H / 2) * shrink + H / 2 + oy;
    const flipX = Math.abs(Math.cos(p * Math.PI));
    const lift = 1 + 0.08 * Math.sin(p * Math.PI);
    const rot = E.randSigned('s5r', k) * 0.012 * sep;
    const back = p >= 0.5;
    ctx.save();
    ctx.translate(sx, sy); ctx.rotate(rot); ctx.scale(Math.max(0.001, flipX) * lift * shrink, lift * shrink);
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(-tw / 2 + 10, -th / 2 + 14, tw, th);
    ctx.beginPath(); ctx.rect(-tw / 2, -th / 2, tw, th); ctx.clip();
    if (!back) {
      ctx.drawImage(S, tl.i * tw, tl.j * th, tw, th, -tw / 2, -th / 2, tw, th);
    } else {
      const [name, f0, crop] = BACKS[k];
      const fi = f0 + Math.max(0, t - (tf + 0.055)) * 30;
      E.drawClip(ctx, 'community/' + name, ft(fi), -tw / 2, -th / 2, tw, th, { crop, fy: 0.35 });
      ctx.globalCompositeOperation = 'soft-light'; ctx.fillStyle = 'rgba(255,170,150,0.15)'; ctx.fillRect(-tw / 2, -th / 2, tw, th);
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = E.col('mint'); ctx.lineWidth = 6; ctx.strokeRect(-tw / 2 + 3, -th / 2 + 3, tw - 6, th - 6);
    }
    // edge-on shading + spec flash
    const edge = 1 - flipX;
    if (edge > 0.02) { ctx.fillStyle = `rgba(20,4,30,${0.7 * edge})`; ctx.fillRect(-tw / 2, -th / 2, tw, th); }
    const spec = E.env(t, tf + 0.055, 0.08);
    if (spec > 0.02) { ctx.fillStyle = `rgba(255,243,208,${0.5 * spec})`; ctx.fillRect(-tw / 2, -th / 2, tw, th); }
    ctx.restore();
  }
  // crack: bright seams flash on the clap
  const flashA = E.env(lt, 0, 0.09);
  if (flashA > 0.02) {
    ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.strokeStyle = `rgba(255,243,208,${flashA})`; ctx.lineWidth = 4 + 10 * flashA;
    ctx.shadowColor = '#ff7aa2'; ctx.shadowBlur = 30;
    ctx.beginPath();
    for (let i = 1; i < cols; i++) { ctx.moveTo(i * tw, 0); ctx.lineTo(i * tw, H); }
    for (let j = 1; j < rows; j++) { ctx.moveTo(0, j * th); ctx.lineTo(W, j * th); }
    ctx.stroke(); ctx.restore();
  }
}

function rimLight(ctx, E, a) {
  if (a <= 0.01) return;
  const { W, H } = E;
  ctx.save(); ctx.globalCompositeOperation = 'screen';
  for (const [w, al] of [[90, 0.35], [36, 0.6], [10, 1]]) {
    ctx.strokeStyle = `rgba(255,248,235,${a * al})`; ctx.lineWidth = w;
    ctx.shadowColor = 'rgba(255,200,220,1)'; ctx.shadowBlur = w;
    ctx.strokeRect(0, 0, W, H);
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------------------------
export default {
  start: T0, end: T1,
  async init() {
    try {
      const base = 'assets/sprites/fonts/';
      const a = new FontFace('S5 Nunito', `url(${base}nunito-latin-wght-normal.woff2)`, { weight: '200 1000' });
      const b = new FontFace('S5 Nunito', `url(${base}nunito-latin-ext-wght-normal.woff2)`, { weight: '200 1000', unicodeRange: 'U+0100-024F, U+1E00-1EFF' });
      await Promise.all([a.load(), b.load()]);
      document.fonts.add(a); document.fonts.add(b);
    } catch (e) { /* falls back to Helvetica Neue */ }
  },
  draw(ctx, t, lt, E) {
    const { W, H } = E;
    if (t < T_CUT) {
      // A/B: iris out of the s4 CRT point
      const ip = E.seg(lt, 0, 14 / 60, 'expoOut');
      ctx.fillStyle = '#05020a'; ctx.fillRect(0, 0, W, H);
      if (ip < 1) {
        // the bright point/ring at the iris edge
        E.iris(ctx, ip, (c) => drawCrate(c, E, t), { cx: CX, cy: 540, r: Math.hypot(W, H) * 0.62 });
        const r = ip * Math.hypot(W, H) * 0.62;
        ctx.save(); ctx.strokeStyle = E.rgba('cream', 0.9 * (1 - ip)); ctx.lineWidth = 6 + 20 * (1 - ip);
        ctx.shadowColor = '#ff7aa2'; ctx.shadowBlur = 40; ctx.beginPath(); E.path.circle(ctx, CX, 540, Math.max(2, r)); ctx.stroke(); ctx.restore();
      } else drawCrate(ctx, E, t);
      heartGlow(ctx, E, t, 0.06);
      drawHeart(ctx, E, t);
      return; // round 2: no headline here; the copy is CAT LOVERS + READY TO PLAY / SAVE only
    }
    if (t < T_CARD) {
      // C: heart window -> real cat
      drawHeartWindow(ctx, E, t);
      heartGlow(ctx, E, t, 0.1);
      drawLeapText(ctx, E, t);
      dust(ctx, E, t, { px: -(t - T_CUT) * 50, alpha: 0.5, seed: 61 });
      // pre-roll of the card wipe (anticipation edge peeks at the frame corner)
      return;
    }
    if (t < READY_IN[0][0]) {
      // D: hard cut on the beat to the lounge cat (one continuous shot to the crack); names lower third
      drawLounge(ctx, E, t);
      warmGrade(ctx, E, 0.16);
      dust(ctx, E, t, { px: -(t - T_CARD) * 30, alpha: 0.5, seed: 77 });
      // CAT LOVERS headline carries over the cut for 2 frames, then drops away
      // round 3: CAT LOVERS hard-cuts out with the shot at T_CARD (no fade over the new shot)
      drawNamesLower(ctx, E, t);
      heartGlow(ctx, E, t, 0.06);
      return;
    }
    // E/F: hero stare, then the crack
    if (t < T_CRACK) drawStare(ctx, E, t);
    else {
      drawCrack(ctx, E, t);
      // round 3: the text band stays above the shards until the end of the scene, splitting apart at the very end
      drawReady(ctx, E, t, E.seg(t, T1 - 0.1, T1, 'expoIn'));
    }
    E.lightLeak(ctx, t, { seed: 5, intensity: 0.08 + 0.2 * E.seg(t, T_STARE, T1, 'quadIn'), colors: ['#ff7aa2', '#ffc93c', '#ffb38a'], speed: 0.5 });
    heartGlow(ctx, E, t, t < T_CRACK ? 0.08 : 0.03);
    rimLight(ctx, E, E.seg(t, T_CRACK - 0.05, T1, 'quadIn') * 0.5 * (1 - 0.3 * E.seg(t, T1 - 0.04, T1)));
  },
  fx(t, lt, E) {
    const meow = E.env(t, T_MEOW, 0.09);
    const cut = E.env(t, T_CUT, 0.06);
    const clap = E.cueEnv(t, 'snare', 0.07);
    const imp = E.env(t, T0, 0.12);
    return {
      flash: Math.max(0.5 * meow, 0.22 * cut, 0.16 * E.env(t, T_CARD, 0.05), 0.12 * E.env(t, T_STARE, 0.06)),
      flashColor: meow > cut ? '#fff3d0' : '#ffd6e4',
      aberration: 3 * clap + 2.5 * cut + 2 * imp + 3 * E.env(t, T_CRACK, 0.08),
      zoom: 1 + 0.03 * imp + 0.02 * E.env(t, T_STARE, 0.1) + 0.012 * E.env(t, T_CARD, 0.1),
      grain: 0.035,
      vignette: 0.3,
    };
  },
};
