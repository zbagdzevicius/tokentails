// s4.js  BARS 7-8 (11.250 - 15.000): THE RESCUE + LOGO SLAM
//
// Bar 7  11.250  breakdown: white-flash handoff, security-cam push on the shelter crate
//        11.484 .. 12.539  six crate rattles (escalating), heroes clawing at the crate
//        12.656  CRATE BURST: planks fly, confetti, shockwave, "FREED!" slam, portal opens
//        12.75 .. 13.065  portal swirl pulls the whole frame in (rot + zoom + motion blur)
//        13.065 .. 13.125 suck-out gap: black, collapsing ring, title rushing at camera
// Bar 8  13.125  LOGO SLAM (CATNIP), shockwave, catnip burst
//        13.19 .. 13.45   HEIST assembles from flying voxels
//        13.359  Token Tails logo drops in
//        13.594 / 13.711 / 13.828  SNEAK. SWAP. RESCUE.
//        14.0625 PLAY NOW button + footer
//        14.414 / 14.473 claps: pre-hit anticipation (paw cursor wind-up)
//        14.531  FINAL HIT: paw presses PLAY, flash, confetti cannons, title glint
//        14.53 .. 15.0   living tail (drift, rays, particles, button breathe)

const START = 11.25, END = 15.0;
const T_BURST = 12.65625, T_SLAM = 13.125, T_GAP = 13.065, T_LOGO = 13.359375;
const T_TAG = 13.59375, T_PLAY = 14.0625, T_FINAL = 14.53125;
const RATTLES = [11.484375, 11.835938, 12.070313, 12.304688, 12.421875, 12.539063];
const ACCENTS = [11.71875, 12.1875]; // snare-roll accents between rattles: crate strobe + headline word
const SHELTER = 'siamese';            // reads clearly different from both heroes (bob / oreo)

// crate grid: 1 art px = S screen px, same density as the sprites drawn beside it
const S = 7, CX = 960, BY = 772;
const PORTAL = [960, 560];

const C = {
  wood: '#9b6235', woodL: '#c98a4b', woodD: '#6b3d1e', woodDD: '#4a2912',
  out: '#2a0f1f', bar: '#9c90c4', barL: '#d9d0f5', barD: '#5e5487', inside: '#160a20',
};

let STILL = null;            // title-clean.jpg backdrop
let TITLE = null;            // prebuilt word canvases

// ------------------------------------------------------------------------------------------
// init: title art is pre-rendered once (pixel-quantised voxel type)
// ------------------------------------------------------------------------------------------
const PXQ = 3; // title pixel size (screen px per title "voxel")

function buildWord(E, str, size, stops, depthCol, depth, outline) {
  const lo = size / PXQ, pad = Math.ceil(lo * 0.25);
  const probe = new OffscreenCanvas(8, 8).getContext('2d');
  const font = `${lo}px ${E.FONTS.display}`;
  probe.font = font; probe.textBaseline = 'middle';
  // per-glyph layout: Cat Paw's "I" has a hook that reads as "l" next to N/P ("CATNLP"), so the I is
  // drawn as a custom serif I with its own breathing room (+0.1em each side)
  const capM = probe.measureText('N');
  const capTop = -capM.actualBoundingBoxAscent, capBot = capM.actualBoundingBoxDescent;
  const iW = lo * 0.24, iGap = lo * 0.1;
  // the I gets extra room on its right: Cat Paw's P has a bottom-left swash that otherwise tucks under
  // the I and turns it into an "L"
  const iGapR = lo * 0.3;
  const glyphs = [...str].map((ch, k, arr) => {
    if (ch !== 'I') return { ch, w: probe.measureText(ch).width, off: 0.5 };
    const gr = arr[k + 1] === 'P' ? iGapR : iGap, w = iW + iGap + gr;
    return { ch, w, off: (iGap + iW / 2) / w };
  });
  const tw = glyphs.reduce((s2, g) => s2 + g.w, 0);
  const w = Math.ceil(tw + pad * 2), h = Math.ceil(lo * 1.35 + depth + pad);
  const cv = new OffscreenCanvas(w, h), c = cv.getContext('2d');
  c.font = font; c.textAlign = 'center'; c.textBaseline = 'middle';
  const x0 = w / 2 - tw / 2, y = lo * 0.62 + pad * 0.5;
  const iPath = (cx, yy) => {
    const top = yy + capTop, bot = yy + capBot, st = lo * 0.19, sh = lo * 0.14, r = lo * 0.06;
    // plain vertical bar: no serifs, so it can never read as an L next to N / P
    c.beginPath();
    c.roundRect(cx - st / 2, top, st, bot - top, r);
    void sh; void iW;
  };
  const run = (yy, mode) => {
    let x = x0;
    for (const g of glyphs) {
      const cx = x + g.w * g.off;
      if (g.ch === 'I') { iPath(cx, yy); if (mode === 'stroke') c.stroke(); else c.fill(); }
      else if (mode === 'stroke') c.strokeText(g.ch, cx, yy); else c.fillText(g.ch, cx, yy);
      x += g.w;
    }
  };
  // voxel extrude: stacked copies stepping down, darkening towards the back
  for (let k = depth; k >= 1; k--) {
    c.lineJoin = 'round'; c.lineWidth = Math.max(2, lo * 0.09); c.strokeStyle = outline;
    run(y + k, 'stroke');
    c.fillStyle = E.shade(depthCol, -0.5 * (k / depth));
    run(y + k, 'fill');
  }
  c.lineJoin = 'round'; c.lineWidth = Math.max(2, lo * 0.09); c.strokeStyle = outline;
  run(y, 'stroke');
  const g = c.createLinearGradient(0, y - lo * 0.45, 0, y + lo * 0.4);
  for (const [o, cc] of stops) g.addColorStop(o, cc);
  c.fillStyle = g; run(y, 'fill');
  // paw dot on the custom I (matches the paw prints inside the other letters)
  { let x = x0; for (const gl of glyphs) { if (gl.ch === 'I') { c.fillStyle = outline; c.beginPath(); c.arc(x + gl.w * gl.off, y + (capTop + capBot) / 2, lo * 0.045, 0, Math.PI * 2); c.fill(); } x += gl.w; } }
  // hard alpha (pixel crisp)
  const id = c.getImageData(0, 0, w, h), d = id.data;
  for (let i = 3; i < d.length; i += 4) d[i] = d[i] > 110 ? 255 : 0;
  c.putImageData(id, 0, 0);
  // white silhouette for hit flashes
  const wh = new OffscreenCanvas(w, h), wc = wh.getContext('2d');
  wc.drawImage(cv, 0, 0); wc.globalCompositeOperation = 'source-in'; wc.fillStyle = '#fff'; wc.fillRect(0, 0, w, h);
  // voxel cells (non-empty) for assemble
  const CELL = 4, cells = [];
  for (let cy = 0; cy < h; cy += CELL) for (let cx = 0; cx < w; cx += CELL) {
    let any = false;
    for (let yy = cy; yy < Math.min(h, cy + CELL) && !any; yy++)
      for (let xx = cx; xx < Math.min(w, cx + CELL); xx++) if (d[(yy * w + xx) * 4 + 3]) { any = true; break; }
    if (any) cells.push([cx, cy]);
  }
  return { cv, wh, w, h, W: w * PXQ, H: h * PXQ, cells, CELL, faceY: y * PXQ };
}

// ------------------------------------------------------------------------------------------
// crate (pixel art, art-px coordinates, origin = bottom centre)
// ------------------------------------------------------------------------------------------
function plank(c, x, y, w, h, seed) {
  c.fillStyle = C.out; c.fillRect(x - 1, y - 1, w + 2, h + 2);
  c.fillStyle = C.wood; c.fillRect(x, y, w, h);
  c.fillStyle = C.woodL; c.fillRect(x, y, w, 1);
  c.fillStyle = C.woodD; c.fillRect(x, y + h - 1, w, 1);
  c.fillStyle = C.woodD;
  if (w > h) { for (let i = 0; i < 3; i++) c.fillRect(x + 4 + ((seed * 13 + i * 19) % Math.max(1, w - 12)), y + 2, 5, 1); }
  else { for (let i = 0; i < 3; i++) c.fillRect(x + 2, y + 5 + ((seed * 11 + i * 13) % Math.max(1, h - 10)), 1, 5); }
  c.fillStyle = '#e8d2a8';
  if (w > h) { c.fillRect(x + 1, y + 2, 1, 1); c.fillRect(x + w - 2, y + 2, 1, 1); }
  else { c.fillRect(x + 2, y + 2, 1, 1); c.fillRect(x + 2, y + h - 3, 1, 1); }
}
function barPiece(c, x) {
  c.fillStyle = C.out; c.fillRect(x - 1, -41, 5, 36);
  c.fillStyle = C.bar; c.fillRect(x, -41, 3, 36);
  c.fillStyle = C.barL; c.fillRect(x, -41, 1, 36);
  c.fillStyle = C.barD; c.fillRect(x + 2, -41, 1, 36);
}
function topFace(c) {
  c.fillStyle = C.out; c.beginPath(); c.moveTo(-31, -46); c.lineTo(31, -46); c.lineTo(40, -55); c.lineTo(-22, -55); c.closePath(); c.fill();
  c.fillStyle = C.woodL; c.beginPath(); c.moveTo(-29, -47); c.lineTo(30, -47); c.lineTo(38, -54); c.lineTo(-21, -54); c.closePath(); c.fill();
  c.fillStyle = C.wood; for (let i = 0; i < 3; i++) c.fillRect(-26 + i * 3, -50 - i * 2, 58, 1);
}
function sideFace(c) {
  c.fillStyle = C.out; c.beginPath(); c.moveTo(30, -47); c.lineTo(40, -56); c.lineTo(40, -9); c.lineTo(30, 1); c.closePath(); c.fill();
  c.fillStyle = C.woodD; c.beginPath(); c.moveTo(31, -46); c.lineTo(39, -54); c.lineTo(39, -9); c.lineTo(31, -1); c.closePath(); c.fill();
  c.fillStyle = C.woodDD; c.fillRect(34, -40, 1, 30); c.fillRect(36, -44, 1, 30);
}
function heartSticker(c) {
  const P = ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'];
  for (let j = 0; j < P.length; j++) for (let i = 0; i < 7; i++) if (P[j][i] === 'X') {
    c.fillStyle = j === 0 || (j === 1 && i < 2) ? '#ffc1d4' : '#ff7aa2'; c.fillRect(-3 + i, -52 + j, 1, 1);
  }
}
const BARS_X = [-22, -14, -6, 18]; // gap over the caged cat's face
// pieces for the explosion: centre + draw
const PIECES = [
  { cx: -27.5, cy: -23, draw: (c) => plank(c, -30, -46, 5, 46, 1) },
  { cx: 27.5, cy: -23, draw: (c) => plank(c, 25, -46, 5, 46, 2) },
  { cx: 0, cy: -43.5, draw: (c) => plank(c, -30, -46, 60, 5, 3) },
  { cx: 0, cy: -2.5, draw: (c) => plank(c, -30, -5, 60, 5, 4) },
  { cx: 5, cy: -50, draw: (c) => { topFace(c); heartSticker(c); } },
  { cx: 35, cy: -28, draw: sideFace },
  ...BARS_X.map((x) => ({ cx: x + 1.5, cy: -23, draw: (c) => barPiece(c, x) })),
];

function crateWhole(c, E, t, catRow, catFrame) {
  c.fillStyle = C.out; c.fillRect(-27, -43, 54, 40);
  const g = c.createLinearGradient(0, -42, 0, -4);
  g.addColorStop(0, '#0b0512'); g.addColorStop(1, '#2a1238');
  c.fillStyle = g; c.fillRect(-26, -42, 52, 38);
  E.drawSprite(c, SHELTER, catRow, catFrame, -2, -5, 1.3, { anchor: 'feet' });
  for (const x of BARS_X) barPiece(c, x);
  plank(c, -30, -46, 5, 46, 1); plank(c, 25, -46, 5, 46, 2);
  plank(c, -30, -46, 60, 5, 3); plank(c, -30, -5, 60, 5, 4);
  sideFace(c); topFace(c); heartSticker(c);
}

// ------------------------------------------------------------------------------------------
// helpers
// ------------------------------------------------------------------------------------------
function rattleState(E, t) {
  let rot = 0, hop = 0, sq = 0, k = -1;
  RATTLES.forEach((tc, i) => {
    const a = t - tc; if (a < 0) return;
    k = i;
    const e = Math.exp(-a / 0.075), amp = 1.0 + i * 0.3;
    rot += 0.07 * amp * e * Math.sin(a * 70 + i);
    hop += 6 * amp * Math.max(0, Math.sin(Math.min(1, a / 0.11) * Math.PI)) * (a < 0.11 ? 1 : 0);
    sq += 0.12 * amp * Math.exp(-Math.max(0, a - 0.1) / 0.05) * (a > 0.1 ? 1 : 0);
  });
  // continuous tremble grows steadily with the riser: 2 -> 24 px (expoIn), plus a rotational shiver
  const build = E.seg(t, 11.3, T_BURST, 'expoIn');
  const amp = E.lerp(2, 24, build);
  const fr = E.frame;
  const tx = amp * E.randSigned('trx', fr), ty = amp * 0.6 * E.randSigned('try', fr);
  rot += (0.004 + 0.07 * build) * E.randSigned('trr', fr);
  return { rot, hop, sq, k, tx, ty, build };
}
function glowBlob(c, x, y, r, color, a) {
  if (a <= 0) return;
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color.replace('A', a)); g.addColorStop(0.45, color.replace('A', a * 0.35)); g.addColorStop(1, color.replace('A', 0));
  c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
}
// shockwave ring that never collapses into a solid disc near its origin
function ring(E, c, x, y, p, { radius = 900, width = 40, color = '#fff', rings = 1, gap = 0.14, alpha = 1 } = {}) {
  for (let k = 0; k < rings; k++) {
    const q = E.clamp01((p - k * gap) / (1 - k * gap));
    if (q <= 0 || q >= 1) continue;
    const r = E.expoOut(q) * radius * (1 - k * 0.12);
    const lw = Math.min(width * Math.pow(1 - q, 1.5), r * 0.1);
    if (lw < 0.5) continue;
    c.save(); c.globalAlpha = alpha * Math.pow(1 - q, 1.2); c.strokeStyle = E.col(color); c.lineWidth = lw;
    c.beginPath(); c.arc(x, y, r, 0, E.TAU); c.stroke(); c.restore();
  }
}
function rgbaStr(E, hex) { const [r, g, b] = E.hexToRgb(E.col(hex)); return `rgba(${r},${g},${b},A)`; }

function drawPortal(c, E, t, R, alpha) {
  if (R <= 1 || alpha <= 0) return;
  const [px, py] = PORTAL;
  const a0 = t - T_BURST;
  const spin = 4 * a0 + 16 * a0 * a0;
  c.save();
  c.globalAlpha = alpha;
  glowBlob(c, px, py, R * 1.25, 'rgba(111,45,168,A)', 0.9);
  c.globalCompositeOperation = 'lighter';
  const cols = ['#6f2da8', '#9966cc', '#b6f36a', '#f0c5fd', '#9966cc', '#5fbf3a'];
  const arms = 6;
  for (let k = 0; k < arms; k++) {
    c.strokeStyle = cols[k % cols.length];
    for (let seg = 0; seg < 26; seg++) {
      const u0 = seg / 26, u1 = (seg + 1) / 26;
      const ang = (u) => spin + (k / arms) * E.TAU + u * 5.2;
      const rr = (u) => R * (0.08 + 0.92 * u);
      c.globalAlpha = alpha * (0.15 + 0.6 * u0) * (1 - u0 * 0.5);
      c.lineWidth = 2 + 26 * u0 * (R / 520);
      c.beginPath();
      c.moveTo(px + Math.cos(ang(u0)) * rr(u0), py + Math.sin(ang(u0)) * rr(u0) * 0.62);
      c.lineTo(px + Math.cos(ang(u1)) * rr(u1), py + Math.sin(ang(u1)) * rr(u1) * 0.62);
      c.stroke();
    }
  }
  c.globalCompositeOperation = 'source-over';
  c.globalAlpha = alpha;
  glowBlob(c, px, py, R * 0.35, 'rgba(255,243,208,A)', 0.95);
  c.restore();
}

// ------------------------------------------------------------------------------------------
// BAR 7: THE RESCUE
// ------------------------------------------------------------------------------------------
const ROLL = [12.304688, 12.421875, 12.539063];   // snare-roll hits: red strobe + alternating Dutch tilt
const F1 = 1 / 60;
// camera: steady push 1.0 -> 1.35 (quadIn) + a 4% punch per rattle that ADDS UP (each settles to +4%, never resets)
function rescueZoom(E, t) {
  const push = 1 + 0.35 * E.quadIn(E.seg(t, 11.3, T_BURST));
  let steps = 0;
  for (const tc of RATTLES) {
    const a = t - tc; if (a < 0) continue;
    steps += 0.04 * (a < 0.03 ? 1.6 * E.expoOut(a / 0.03) : 1 + 0.6 * Math.exp(-(a - 0.03) / 0.05));
  }
  return push + steps;
}
// hero reaction to the last rattle: crouch -> hop -> land, sprite frames + squash 0.9 / 1.08
function heroHop(E, t, delay) {
  let last = -1; for (const tc of RATTLES) if (t >= tc + delay) last = tc + delay;
  const a = last < 0 ? 9 : t - last;
  if (a < 0.035) return { row: 'JUMPING', f: 0, y: 0, sx: 1.08, sy: 0.9 };
  if (a < 0.15) { const u = (a - 0.035) / 0.115; return { row: 'JUMPING', f: 1 + Math.floor(u * 4), y: -80 * Math.sin(u * Math.PI), sx: 0.94, sy: 1.08 }; }
  if (a < 0.2) return { row: 'JUMPING', f: 6, y: 0, sx: 1.08, sy: 0.9 };
  return null;
}

function drawRescue(ctx, t, E) {
  const { W, H } = E;
  const ab = t - T_BURST; // time after burst
  const burst = ab >= 0;

  // swirl camera (portal pulls everything in)
  const sw = E.seg(t, 12.78, T_GAP, 'expoIn');
  const zPre = rescueZoom(E, Math.min(t, T_BURST - 1e-4));
  const intro = 1 + 0.12 * (1 - E.expoOut(E.seg(t, START, START + 8 / 60)));   // match-cut settle out of the 58 card
  const zBase = burst ? E.lerp(zPre, 1.12, E.expoOut(E.seg(ab, 0, 0.3))) : zPre * intro; // burst releases the push
  const burstPunch = burst ? 0.14 * Math.exp(-ab / 0.12) : 0;
  const zoom = zBase * (1 + burstPunch) * (1 + 3.2 * sw);
  const rot = 2.4 * sw + (burst ? 0.02 * E.env(t, T_BURST, 0.1) : 0);
  const rs = rattleState(E, t);

  ctx.fillStyle = E.col('night'); ctx.fillRect(0, 0, W, H);
  E.camera(ctx, { zoom, rot, cx: PORTAL[0], cy: PORTAL[1] }, (c) => {
    // ---- BG: real game footage, dim security feed with slower parallax push ----
    const bgT = burst ? E.clipFrameTime('h08-vault-rescue', 113) + ab : E.clipFrameTime('h08-vault-rescue', 70) + (t - START);
    E.camera(c, { zoom: 1.12 - 0.07 * (1 - E.seg(t, START, T_BURST)) + (burst ? 0.1 * E.expoOut(E.seg(ab, 0, 0.45)) : 0), cx: CX, cy: 540, x: burst ? 0 : rs.tx * 0.3, y: burst ? 0 : rs.ty * 0.3 }, (cc) => {
      E.drawClip(cc, 'h08-vault-rescue', bgT, -200, -120, W + 400, H + 240, { fx: 0.62, fy: 0.42 });
    });
    const dim = burst ? E.lerp(0.25, 0.6, E.seg(ab, 0, 0.35)) : 0.66 - 0.16 * E.seg(t, START, T_BURST, 'expoIn');
    c.fillStyle = E.rgba('night', dim); c.fillRect(-400, -400, W + 800, H + 800);
    c.save(); c.globalCompositeOperation = 'color'; c.fillStyle = E.rgba('violet', 0.35); c.fillRect(-400, -400, W + 800, H + 800); c.restore();

    // ---- god rays / backlight that swells with the riser ----
    const riser = E.seg(t, START, T_BURST, 'quadIn');
    c.save(); c.globalCompositeOperation = 'lighter';
    glowBlob(c, CX, 520, 520 + 260 * riser, rgbaStr(E, 'grape'), 0.35 + 0.4 * riser);
    glowBlob(c, CX, 540, 260 + 120 * riser, rgbaStr(E, 'catnipGlow'), 0.08 + 0.25 * riser * riser);
    const rays = 14, ra = t * (0.35 + 1.4 * riser);
    c.globalAlpha = 0.06 + 0.16 * riser;
    c.fillStyle = E.col('lilac');
    for (let i = 0; i < rays; i++) {
      const a = ra + (i / rays) * E.TAU, wdt = 0.07;
      c.beginPath(); c.moveTo(CX, 540);
      c.lineTo(CX + Math.cos(a - wdt) * 1800, 540 + Math.sin(a - wdt) * 1800);
      c.lineTo(CX + Math.cos(a + wdt) * 1800, 540 + Math.sin(a + wdt) * 1800); c.fill();
    }
    c.restore();

    // ---- speed lines: twice as many, alpha 0.15 -> 0.8 through the build ----
    const sl = E.seg(t, 11.3, T_BURST, 'quadIn');
    if (!burst) E.speedLines(c, t, { cx: CX, cy: 560, count: 220, inner: 640 - 300 * sl, outer: 1600, width: [2, 10 + 6 * sl], color: 'lilac', alpha: 0.15 + 0.65 * sl, seed: 44, fps: 30 });

    // ---- portal (after burst): only the swirl gets a time smear, never the sprites ----
    if (burst) {
      const R = 560 * E.backOut(E.seg(ab, 0.02, 0.32)) + 140 * sw;
      if (sw > 0) { drawPortal(c, E, t - 0.024, R, 0.25); drawPortal(c, E, t - 0.012, R, 0.4); }
      drawPortal(c, E, t, R, 1);
    }

    // ---- floor shadow ----
    c.save(); c.fillStyle = 'rgba(0,0,0,0.45)';
    c.beginPath(); c.ellipse(CX + 20, BY + 6, 330, 34, 0, 0, E.TAU); c.fill(); c.restore();

    // ---- gold match-cut: the 58 card's frame collapses onto the crate outline ----
    const mc = E.seg(t, START, START + 8 / 60, 'expoOut');
    const mcA = 1 - E.seg(t, START + 8 / 60, START + 16 / 60);
    if (mcA > 0) {
      const r0 = [-120, -140, W + 240, H + 280], r1 = [CX - 31 * S - 14, BY - 56 * S - 14, 71 * S + 28, 57 * S + 28];
      const rr = r0.map((v, i) => E.lerp(v, r1[i], mc));
      c.save(); c.globalAlpha = mcA; c.strokeStyle = E.col('coin'); c.lineWidth = E.lerp(34, 10, mc);
      c.shadowColor = E.col('coin'); c.shadowBlur = 30;
      c.beginPath(); c.roundRect(rr[0], rr[1], rr[2], rr[3], E.lerp(60, 18, mc)); c.stroke(); c.restore();
    }

    // ---- heroes: claw at the crate, hop on every rattle, leap away on the burst, then get sucked into the portal ----
    const heroFrame = E.spriteFrame(t, 14);
    const pullS = E.seg(t, 12.8, 12.95, 'expoIn');
    [['bob', -1, 0], ['oreo', 1, 1 / 60]].forEach(([id, side, delay]) => {
      const baseX = CX + side * 372, enter = E.seg(t, START, START + 0.16, 'backOut');
      let x = baseX + side * (1 - enter) * 700, y = BY + 2, row = 'DIGGING', f = heroFrame, sc = S, sx = 1, sy = 1, clamp = false;
      const flip = side > 0;
      if (burst) {
        const j = E.seg(ab, 0, 0.42);
        row = 'JUMPING'; f = Math.min(6, Math.floor(j * 7)); clamp = true;
        x = baseX + side * 170 * E.expoOut(j);
        y = BY + 2 - 240 * Math.sin(Math.min(1, j) * Math.PI) * (1 - 0.3 * j);
        sc = S * (1 + 0.25 * E.expoOut(j));
        if (pullS > 0) { x = E.lerp(x, PORTAL[0], pullS); y = E.lerp(y, PORTAL[1] + 60, pullS); sc *= 1 - pullS; }
      } else {
        const hh = heroHop(E, t, delay);
        if (hh) { row = hh.row; f = hh.f; y += hh.y; sx = hh.sx; sy = hh.sy; clamp = true; }
      }
      if (sc > 0.2) E.drawSprite(c, id, row, f, x, y, sc, { anchor: 'feet', flip, clamp, sx, sy });
    });

    // ---- crate ----
    if (!burst) {
      c.save();
      const cs = E.lerp(1.12, 1, mc);
      c.translate(CX + rs.tx, BY - rs.hop * S + rs.ty);
      c.rotate(rs.rot);
      c.scale(S * cs * (1 + rs.sq), S * cs * (1 - rs.sq));
      const near = RATTLES.some((tc) => t >= tc && t - tc < 0.1);
      crateWhole(c, E, t, near ? 'HIT' : 'SITTING', near ? 2 : E.spriteFrame(t, 8));
      c.restore();
      // accent strobe (11.719 / 12.188): red security light snaps across the crate
      const st = E.envs(t, ACCENTS, 0.05);
      if (st > 0.02) {
        c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = st;
        glowBlob(c, CX, BY - 230, 560, 'rgba(255,60,40,A)', 0.8);
        c.fillStyle = E.rgba('alertRed', 0.5 * st);
        for (const tc of ACCENTS) { const q = E.seg(t, tc, tc + 0.1); if (q > 0 && q < 1) { const x = E.lerp(CX - 700, CX + 700, q); c.fillRect(x - 60, -200, 120, 1480); } }
        c.restore();
      }
      // white tint pop on each rattle
      const flashA = E.envs(t, RATTLES, 0.035) * 0.55;
      if (flashA > 0.02) {
        c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = flashA;
        glowBlob(c, CX, BY - 200, 420, 'rgba(255,243,208,A)', 0.6); c.restore();
      }
      // dust puffs on every landing
      RATTLES.forEach((tc, i0) => { const i = i0 + 11;
        for (const p of E.burst({ seed: 700 + i, count: 14 + i0 * 3, t, t0: tc + 0.1, x: CX + (E.rand(i, 'dx') - 0.5) * 300, y: BY, speed: [160, 520], angle: [-Math.PI, 0], gravity: -60, drag: 3, life: [0.3, 0.55], size: [8, 22] })) {
          c.fillStyle = E.rgba('lilac', 0.5 * p.alpha); const s = p.size * (1 + p.p);
          c.fillRect(Math.round(p.x - s / 2), Math.round(p.y - s / 2), s, s);
        }
      });
    } else {
      // explosion: planks + bars with ballistic arcs and onion-skin trails
      PIECES.forEach((pc, i) => {
        const r = (k) => E.rand('pc', i, k);
        const dx = pc.cx, dy = pc.cy + 25, len = Math.hypot(dx, dy) || 1;
        const sp = 230 + 160 * r(1);
        const vx = (dx / len) * sp + (r(2) - 0.5) * 120, vy = (dy / len) * sp - 180 - 140 * r(3);
        const spin = (r(4) - 0.5) * 22;
        for (let k = 3; k >= 0; k--) {
          const a = Math.max(0, ab - k * 0.012);
          const [ox, oy] = E.ballistic(0, 0, vx, vy, 520, 0.6, a);
          c.save();
          c.globalAlpha = k === 0 ? 1 : 0.22 * (1 - k / 4);
          c.translate(CX, BY); c.scale(S, S);
          c.translate(pc.cx + ox, pc.cy + oy); c.rotate(spin * a); c.translate(-pc.cx, -pc.cy);
          pc.draw(c);
          c.restore();
        }
      });
    }

    if (burst) {
      // hearts rise from BESIDE the freed cat (never over its head), gone before the portal pull
      const hA = 1 - E.seg(t, 12.84, 12.92);
      for (const side of [-1, 1]) {
        for (const p of E.burst({ seed: side > 0 ? 51 : 52, count: 6, t, t0: T_BURST + 0.05, x: CX + side * 250, y: PORTAL[1] + 20, speed: [200, 420], angle: side > 0 ? [-Math.PI * 0.45, -Math.PI * 0.1] : [-Math.PI * 0.9, -Math.PI * 0.55], gravity: -200, drag: 2, life: [0.5, 0.8], size: [34, 58], delay: 0.12 })) {
          E.drawImg(c, 'heart', p.x, p.y, { w: p.size * (0.6 + 0.4 * E.backOut(Math.min(1, p.age / 0.12))), alpha: Math.min(1, p.alpha * 2) * hA, rot: Math.sin(p.age * 8 + p.i) * 0.2 });
        }
      }
      // confetti (clears out before the portal pull so nothing lingers on the freed cat)
      const cA = 1 - E.seg(t, 12.78, 12.88);
      const cols = ['#ff7aa2', '#ffc93c', '#9be15d', '#f0c5fd', '#c4e2fc', '#fcecbb'];
      if (cA > 0) for (const p of E.burst({ seed: 90, count: 170, t, t0: T_BURST, x: CX, y: BY - 200, speed: [500, 1700], angle: [0, E.TAU], gravity: 1500, drag: 1.4, life: [0.6, 1.1], size: [10, 22], spin: 14 })) {
        c.save(); c.translate(p.x, p.y); c.rotate(p.rot); c.globalAlpha = cA;
        c.fillStyle = cols[p.i % cols.length];
        const s = p.size;
        c.fillRect(-s / 2, (-s / 4) * Math.abs(Math.cos(p.age * 12 + p.i)), s, (s / 2) * Math.abs(Math.cos(p.age * 12 + p.i)) + 2);
        c.restore();
      }
      ring(E, c, CX, BY - 200, E.seg(ab, 0, 0.5), { radius: 900, width: 40, color: 'rescueFlash', rings: 2, gap: 0.14 });
    }
  });

  // ---- snare roll: red strobe on 12.305 / 12.422 / 12.539 (the tilt is in fx) ----
  if (!burst) {
    const rs2 = E.envs(t, ROLL, 0.03);
    if (rs2 > 0.02) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(255,40,30,${0.42 * rs2})`; ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
  }

  // ---- kinetic copy (screen space, so the push never crops it) ----
  drawRescueType(ctx, E, t);
  drawFreedCat(ctx, t, E);

  // ---- security-cam HUD (screen space, glitches out on the burst) ----
  if (t < T_BURST + 0.08) {
    const hudA = burst ? 1 - E.seg(ab, 0, 0.08) : 1;
    ctx.save(); ctx.globalAlpha = hudA;
    const blink = E.beatPhase(t) < 0.5;
    ctx.fillStyle = E.col('alertRed');
    if (blink) { ctx.beginPath(); ctx.arc(86, 78, 12, 0, E.TAU); ctx.fill(); }
    E.drawText(ctx, 'REC', 110, 79, { size: 26, font: 'mono', weight: 'bold', align: 'left', color: 'alertRed', tracking: 0.2 });
    E.drawText(ctx, 'CAM 08 // VAULT B', 190, 79, { size: 26, font: 'mono', align: 'left', color: 'cream', tracking: 0.2, alpha: 0.85 });
    E.drawText(ctx, E.timecode(t), W - 70, 79, { size: 26, font: 'mono', align: 'right', color: 'cream', tracking: 0.15, alpha: 0.85 });
    E.drawText(ctx, 'KIBBLE CORP SECURITY  //  MOTION DETECTED', 70, H - 64, { size: 22, font: 'mono', align: 'left', color: 'lavender', tracking: 0.25, alpha: 0.6 + 0.4 * E.envs(t, RATTLES, 0.1) });
    // corner brackets pinch in with the build
    const bi = 46 + 30 * rs.build;
    ctx.strokeStyle = E.rgba('cream', 0.7); ctx.lineWidth = 4;
    for (const [x, y, sx, sy] of [[bi, bi - 6, 1, 1], [W - bi, bi - 6, -1, 1], [bi, H - bi + 6, 1, -1], [W - bi, H - bi + 6, -1, -1]]) {
      ctx.beginPath(); ctx.moveTo(x, y + sy * 50); ctx.lineTo(x, y); ctx.lineTo(x + sx * 50, y); ctx.stroke();
    }
    ctx.restore();
    E.scanlines(ctx, { alpha: 0.14 * (burst ? 1 - E.seg(ab, 0, 0.1) : 1), spacing: 4, thickness: 2, offset: t * 30 });
  }

  // ---- iris closes into the portal core (suck-out) ----
  const ir = E.seg(t, 12.9, T_GAP, 'quadIn');
  if (ir > 0) {
    const r = E.lerp(1250, 0, ir);
    E.mask(ctx, (c) => E.path.circle(c, PORTAL[0], PORTAL[1], r), (c) => { c.fillStyle = E.col('night'); c.fillRect(0, 0, W, H); }, { invert: true });
    ctx.save(); ctx.strokeStyle = E.col('lilac'); ctx.lineWidth = 4 + 14 * ir; ctx.globalAlpha = 0.9;
    ctx.beginPath(); ctx.arc(PORTAL[0], PORTAL[1], r + 4, 0, E.TAU); ctx.stroke();
    ctx.strokeStyle = E.col('catnipGlow'); ctx.lineWidth = 3; ctx.globalAlpha = 0.7;
    ctx.beginPath(); ctx.arc(PORTAL[0], PORTAL[1], r + 22 + 30 * ir, 0, E.TAU); ctx.stroke();
    ctx.restore();
  }
}

// Freed cat: clean hero moment in screen space (no swirl rotation, no blur), jump 0.16s -> clean IDLE pose
// with rim outline held until 12.93, then it shrinks into the portal core with the suck-out.
function drawFreedCat(ctx, t, E) {
  const ab = t - T_BURST;
  if (ab < 0 || t >= T_GAP) return;
  const j = E.seg(ab, 0, 0.16, 'backOut');
  const pull = E.seg(t, 12.93, T_GAP, 'expoIn');
  const y0 = E.lerp(BY - 5 * S, PORTAL[1] + 150, j) + 6 * Math.sin(ab * 9) * (1 - pull);
  const y = E.lerp(y0, PORTAL[1] + 40, pull);
  const sc = S * 1.3 * (1 + 0.35 * j) * (1 - 0.92 * pull);
  const jumping = ab < 0.16;
  const fr = jumping ? Math.min(6, Math.floor(ab / 0.025)) : E.spriteFrame(t, 12);
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; glowBlob(ctx, CX, y - 110 * (1 - pull), 300 * (1 - pull), 'rgba(255,243,208,A)', 0.3 * (1 - pull)); ctx.restore();
  E.drawSprite(ctx, SHELTER, jumping ? 'JUMPING' : 'IDLE', fr, CX, y, sc, { anchor: 'feet', clamp: jumping, rot: pull * 2.5, outline: { color: '#fff3d0', px: 1 }, tint: { color: '#ffffff', amount: E.env(ab, 0, 0.03) } });
  if (!jumping && pull === 0) E.drawText(ctx, 'MOCHI', CX, y + 60, { size: 30, font: 'mono', weight: 'bold', color: 'cream', tracking: 0.35, alpha: E.seg(ab, 0.16, 0.22) });
}

// headline word: enters at 1.6x -> 1 (backOut, 8 frames) with a 3-frame smear, fully legible on its cue frame
function slamWord(c, E, t, w, tw, x, y, o, extra = {}) {
  const a = t - tw; if (a < 0) return;
  const q = E.backOut(E.seg(a, 0, 8 / 60), 1.8);
  const sc = E.lerp(1.6, 1, q) * (extra.scale ?? 1);
  const sm = 1 - E.seg(a, 0, 3 / 60);
  if (sm > 0) for (let g = 2; g >= 1; g--) E.drawText(c, w, x, y, { ...o, extrude: null, stroke: null, alpha: (o.alpha ?? 1) * 0.3 * sm / g, perChar: () => ({ scale: sc * (1 + 0.18 * g * sm), sy: 1 + 0.25 * sm }) });
  E.drawText(c, w, x + (extra.x || 0), y + (extra.y || 0), {
    ...o,
    perChar: ({ i }) => ({ scale: sc, rot: (1 - q) * (i % 2 ? 0.08 : -0.08), y: E.randSigned('wj', w, i, E.frame >> 1) * 8 * (extra.jit || 0), color: a < 2 / 60 ? '#ffffff' : undefined }),
  });
}

function drawRescueType(c, E, t) {
  const ab = t - T_BURST;
  const LY = 262;
  const jit = E.envs(t, [...RATTLES, ...ACCENTS], 0.05);
  // Line 1: LOCKED (11.25 downbeat, present from f675) UP. (rattle 1, 11.484)
  if (t >= START && t < RATTLES[2]) {
    const out = E.seg(t, RATTLES[2] - 3 / 60, RATTLES[2], 'expoIn');
    const words = [['LOCKED', START, 'cream'], ['UP.', RATTLES[0], 'alertRed']];
    const size = 160, gap = 46;
    const ws = words.map(([w]) => E.measureText(c, w, { size, tracking: 0.04 }));
    let x = 960 - (ws[0] + ws[1] + gap) / 2;
    const acc = 0.05 * E.envs(t, [ACCENTS[0], RATTLES[1]], 0.07); // accent + rattle 2 bump the line
    words.forEach(([w, tw, col], k) => {
      slamWord(c, E, t, w, tw, x + ws[k] / 2, LY - out * 50, { size, color: col, tracking: 0.04, extrude: { depth: 12, color: 'grape', dark: 0.6 }, alpha: 1 - out }, { scale: (1 + acc) * (1 + 0.4 * out), jit });
      x += ws[k] + gap;
    });
  }
  // Line 2: BUST (12.070) IT (12.188 accent) OPEN (12.305), pumping on 12.422 / 12.539
  if (t >= RATTLES[2] && t < T_BURST + 0.14) {
    const words = [['BUST', RATTLES[2]], ['IT', ACCENTS[1]], ['OPEN', RATTLES[3]]];
    const sizes = [150, 150, 200];
    const gap = 40;
    const ws = words.map(([w], k) => E.measureText(c, w, { size: sizes[k], tracking: 0.03 }));
    const total = ws.reduce((a, b) => a + b, 0) + gap * 2;
    let x = 960 - total / 2;
    const exp = E.seg(t - T_BURST, 0, 0.14, 'expoOut');
    const pump = 0.1 * E.envs(t, [RATTLES[4], RATTLES[5]], 0.06);
    words.forEach(([w, tw], k) => {
      const cx = x + ws[k] / 2;
      slamWord(c, E, t, w, tw, cx + (cx - 960) * exp * 1.2, LY - exp * 80, {
        size: sizes[k], color: k === 2 ? 'coin' : 'cream', tracking: 0.03, alpha: 1 - exp,
        extrude: { depth: k === 2 ? 16 : 12, color: k === 2 ? 'rust' : 'grape', dark: 0.6 },
      }, { scale: 1 + 0.3 * exp + pump, jit });
      x += ws[k] + gap;
    });
  }
  // case file label: clean wipe-on (no scramble), done by f687
  if (t < RATTLES[3]) {
    const LBL = 'SHELTER CAT  //  "MOCHI"  //  STATUS: CAGED';
    const p = E.seg(t, START, START + 0.2, 'expoOut');
    const a = 1 - E.seg(t, RATTLES[3] - 3 / 60, RATTLES[3]); // clears before OPEN slams into its space
    const o = { size: 26, font: 'mono', weight: 'bold', color: 'catnip', tracking: 0.28, alpha: a };
    E.wipeText(c, LBL, 960, 122, o, p);
    const bw = E.measureText(c, LBL, o);
    c.fillStyle = E.rgba('catnip', 0.8 * a); c.fillRect(960 - bw / 2 * p, 144, bw * p, 3);
  }
  // FREED! slam on the burst (screen space, top of the letters at y >= 60)
  if (ab >= 0 && t < T_GAP) {
    const pull = E.seg(t, 12.88, T_GAP, 'expoIn');
    E.drawText(c, 'FREED!', 960, 215, {
      size: 210, color: 'cream', tracking: 0.05, extrude: { depth: 18, color: 'pink', dark: 0.65 },
      glow: { color: 'pink', blur: 30 },
      perChar: ({ i, n }) => {
        const qi = E.stagger(ab, i, n, { spread: 0.06, dur: 0.16, e: 'backOut' });
        return { scale: (0.2 + 0.8 * qi) * (1 - 0.8 * pull), y: (1 - qi) * 80 + Math.sin(ab * 14 + i) * 6, rot: (1 - qi) * (i % 2 ? 0.5 : -0.5) + pull * 1.5, alpha: Math.min(1, qi * 2) * (1 - pull), color: ab < 0.05 ? '#ffffff' : undefined };
      },
    });
  }
}

// ------------------------------------------------------------------------------------------
// ------------------------------------------------------------------------------------------
// BAR 8: LOGO SLAM
// ------------------------------------------------------------------------------------------
const LAY = { logoY: 128, catnipY: 396, heistY: 652, tagY: 812, btnY: 924 };
// end-card groove: 8th-note grid anchored on the slam; each pulse = 5% scale kick + alternating 1.5 deg tilt,
// decaying with backOut over 0.1 s (so it undershoots a hair before settling)
const E8 = 0.234375;
function grooveAt(E, t) {
  if (t < T_LOGO) return { s: 1, r: 0, e: 0 };
  const k = Math.floor((t - T_SLAM) / E8 + 1e-6), a = t - (T_SLAM + k * E8);
  const u = E.seg(a, 0, 0.2);
  const e = Math.pow(1 - u, 1.6) * Math.cos(u * Math.PI * 0.6) - 0.12 * Math.sin(u * Math.PI) * u; // kick, slight undershoot, settle
  return { s: 1 + 0.05 * e, r: E.deg(1.5) * e * (k % 2 ? 1 : -1), e };
}
const halfBob = (t) => 6 * Math.sin(((t - T_SLAM) / 0.9375) * Math.PI * 2);

function drawWordImg(c, word, cx, cy, sc, o = {}) {
  const w = word.W * sc * (o.sx ?? 1), h = word.H * sc * (o.sy ?? 1);
  c.save();
  c.imageSmoothingEnabled = false;
  c.globalAlpha *= o.alpha ?? 1;
  c.translate(cx, cy);
  if (o.rot) c.rotate(o.rot);
  c.drawImage(o.white ? word.wh : word.cv, -w / 2, -h / 2, w, h);
  c.restore();
}
function glintWord(E, c, word, cx, cy, p) {
  if (p <= 0 || p >= 1) return;
  const L = E.surface('s4glint', word.w, word.h);
  const lc = L.ctx;
  lc.drawImage(word.wh, 0, 0);
  lc.globalCompositeOperation = 'source-in';
  const x = E.lerp(-word.w * 0.3, word.w * 1.3, p);
  const g = lc.createLinearGradient(x - 40, 0, x + 40, word.h * 0.3);
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,0.95)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  lc.fillStyle = g; lc.fillRect(0, 0, word.w, word.h);
  c.save(); c.imageSmoothingEnabled = false; c.globalCompositeOperation = 'lighter';
  c.drawImage(L, cx - word.W / 2, cy - word.H / 2, word.W, word.H); c.restore();
}

// continuous camera push over the end card (1.00 -> 1.06, expoInOut 13.30-14.53, slow drift after),
// applied per layer at different rates for parallax: rays 0.6, title 1.0, particles 1.4
const pushAt = (E, t) => 0.12 * E.sineInOut(E.seg(t, 13.25, T_FINAL)) + 0.03 * E.seg(t, T_FINAL, END);
function pushLayer(ctx, E, t, k, base = 1) { const z = base + k * pushAt(E, t); ctx.translate(960, 540); ctx.scale(z, z); ctx.translate(-960, -540); }
function drawLogo(ctx, t, E) {
  const { W, H } = E;
  const ls = t - T_SLAM; // time since slam
  const slammed = ls >= 0;
  const fin = t - T_FINAL;

  // ---- background ----
  ctx.fillStyle = E.col('night'); ctx.fillRect(0, 0, W, H);
  if (slammed) {
    const bz = 1.22 - 0.16 * E.expoOut(E.seg(ls, 0, 1.6)) + (fin >= 0 ? 0.03 * Math.exp(-fin / 0.2) : 0);
    const drift = E.lerp(-70, 70, E.seg(t, T_SLAM, END, 'sineInOut'));
    E.camera(ctx, { zoom: bz, x: drift, cx: 960, cy: 520 }, (c) => {
      if (STILL) { c.imageSmoothingEnabled = true; c.drawImage(STILL, -40, -40, W + 80, H + 80); }
    });
    ctx.fillStyle = E.rgba('night', 0.58); ctx.fillRect(0, 0, W, H);
    const rg = ctx.createRadialGradient(960, 470, 100, 960, 470, 1100);
    rg.addColorStop(0, 'rgba(75,0,130,0.0)'); rg.addColorStop(1, 'rgba(13,6,22,0.85)');
    ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);

    // god rays
    ctx.save(); pushLayer(ctx, E, t, 0.4); ctx.globalCompositeOperation = 'lighter';
    const rays = 18, ra = t * E.deg(20) + 0.4 * E.expoOut(E.seg(ls, 0, 0.6)); // constant 20 deg/s spin
    ctx.globalAlpha = 0.15 + 0.06 * Math.exp(-ls / 0.3) + (fin >= 0 ? 0.1 * Math.exp(-fin / 0.25) : 0) + 0.06 * grooveAt(E, t).e;
    ctx.fillStyle = E.col('coin');
    for (let i = 0; i < rays; i++) {
      const a = ra + (i / rays) * E.TAU, wdt = 0.05 + 0.03 * Math.sin(i * 2.3);
      ctx.beginPath(); ctx.moveTo(960 + Math.cos(a - wdt * 0.3) * 150, 470 + Math.sin(a - wdt * 0.3) * 150);
      ctx.lineTo(960 + Math.cos(a - wdt) * 1900, 470 + Math.sin(a - wdt) * 1900);
      ctx.lineTo(960 + Math.cos(a + wdt) * 1900, 470 + Math.sin(a + wdt) * 1900);
      ctx.lineTo(960 + Math.cos(a + wdt * 0.3) * 150, 470 + Math.sin(a + wdt * 0.3) * 150); ctx.fill();
    }
    ctx.globalAlpha = 1;
    glowBlob(ctx, 960, 470, 700, rgbaStr(E, 'grape'), 0.4);
    ctx.restore();

    // drifting catnip leaves & sparkles, 3 parallax depths
    ctx.save(); pushLayer(ctx, E, t, 1.4);
    for (let d = 0; d < 3; d++) {
      const n = [26, 16, 9][d], sz = [18, 30, 54][d], sp = [70, 110, 170][d], a = [0.35, 0.55, 0.8][d];
      for (let i = 0; i < n; i++) {
        const r = (k) => E.rand('leaf', d, i, k);
        const y = E.mod(r(1) * (H + 200) - (t - T_SLAM) * sp - 100, H + 200) - 100;
        const x = E.mod(r(2) * (W + 200) + (t - T_SLAM) * sp * 0.35 * (r(6) < 0.5 ? -1 : 1), W + 200) - 100 + Math.sin(t * (0.8 + r(3)) + i) * 30;
        E.drawImg(ctx, 'catnip', x, y, { w: sz, alpha: a * E.seg(ls, 0.05, 0.4), rot: Math.sin(t * 1.5 + i) * 0.5 });
      }
    }
    for (let i = 0; i < 80; i++) {
      const r = (k) => E.rand('spk', i, k);
      const tw = 0.5 + 0.5 * Math.sin(t * (3 + r(1) * 5) + r(2) * 9);
      ctx.fillStyle = E.rgba(i % 3 ? 'cream' : 'catnipGlow', 0.6 * tw * E.seg(ls, 0.1, 0.4));
      const s = 3 + Math.round(r(3) * 3);
      ctx.fillRect(Math.round(E.mod(r(4) * W + (t - T_SLAM) * (60 + 60 * r(6)), W)), Math.round(E.mod(r(5) * H - (t - T_SLAM) * 70, H)), s, s);
    }
    ctx.restore();
  } else {
    // suck-out gap: pinpoint + anamorphic flare stretching out before the slam
    const g = E.seg(t, T_GAP, T_SLAM, 'expoIn');
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const fy = E.lerp(PORTAL[1], LAY.catnipY + 40, g);
    const fl = ctx.createLinearGradient(0, 0, W, 0);
    fl.addColorStop(0, 'rgba(240,197,253,0)'); fl.addColorStop(0.5, 'rgba(255,243,208,0.95)'); fl.addColorStop(1, 'rgba(240,197,253,0)');
    ctx.fillStyle = fl; const fw = 200 + 1700 * g;
    ctx.fillRect(960 - fw / 2, fy - 3 - 3 * g, fw, 6 + 6 * g);
    glowBlob(ctx, 960, fy, 40 + 160 * g, 'rgba(255,243,208,A)', 1);
    ctx.restore();
  }

  if (!TITLE) return;
  ctx.save(); pushLayer(ctx, E, t, 1, 0.94); // lockup pushes 0.94 -> 1.06 (a 12% push that stays title-safe)
  drawTitleGroup(ctx, t, E, ls, slammed, fin);
  ctx.restore();
  // light leak + gentle vignette over the end card
  if (slammed) E.lightLeak(ctx, t, { seed: 17, intensity: 0.1 + 0.12 * Math.exp(-ls / 0.3) + 0.15 * (fin >= 0 ? Math.exp(-fin / 0.07) : 0), colors: ['#ff7aa2', '#ffc93c', '#9966cc'], speed: 0.5 });
}

function drawTitleGroup(ctx, t, E, ls, slammed, fin) {
  const { W, H } = E;
  const { catnip, heist } = TITLE;
  const finHit = fin >= 0 ? Math.exp(-fin / 0.07) : 0;
  const finPunch = fin >= 0 ? 0.06 * Math.exp(-fin / 0.14) * Math.cos(fin * 30) : 0;
  // end card grooves on the 8th-note grid so the lockup never sits still
  const gv = grooveAt(E, t);
  const breathe = (1 + 0.008 * Math.sin((t - T_SLAM) * 4)) * gv.s;
  const bobY = t >= T_LOGO ? halfBob(t) * E.seg(t, T_LOGO, T_LOGO + 0.2) : 0;
  ctx.save(); ctx.translate(960, 520 + bobY); ctx.rotate(gv.r); ctx.translate(-960, -520);

  // ---- CATNIP: rushes at the camera in the gap, slams, squash & spring ----
  {
    let sc, sx = 1, sy = 1, alpha = 1;
    if (!slammed) {
      const u = E.seg(t, T_GAP, T_SLAM, 'cubicIn');
      sc = E.lerp(1.85, 1.04, u); alpha = E.seg(t, T_GAP, T_GAP + 0.035, 'quadOut');
      // zoom trail
      for (let k = 1; k <= 3; k++) drawWordImg(ctx, catnip, 960, LAY.catnipY, sc * (1 + k * 0.12), { alpha: 0.2 * alpha });
    } else {
      const sp = E.spring(E.seg(ls, 0, 0.5), 3, 6);
      sc = (1.14 - 0.14 * sp) * breathe + finPunch;
      const sq = 0.16 * Math.exp(-ls / 0.07);
      sx = 1 + sq; sy = 1 - sq;
    }
    // drop shadow
    if (slammed) drawWordImg(ctx, catnip, 960 + 10, LAY.catnipY + 22, sc, { sx, sy, alpha: 0.5, white: false });
    ctx.save(); if (slammed) { ctx.globalCompositeOperation = 'source-over'; }
    drawWordImg(ctx, catnip, 960, LAY.catnipY, sc, { sx, sy, alpha });
    ctx.restore();
    const wA = slammed ? Math.max(Math.exp(-ls / 0.035), finHit * 0.7) : 0.25 * alpha;
    if (wA > 0.01) drawWordImg(ctx, catnip, 960, LAY.catnipY, sc, { sx, sy, alpha: wA, white: true });
    if (slammed) {
      glintWord(E, ctx, catnip, 960, LAY.catnipY, E.seg(ls, 0.3, 0.75, 'cubicInOut'));
      glintWord(E, ctx, catnip, 960, LAY.catnipY, E.seg(t, 13.85, 14.4, 'cubicInOut'));
      glintWord(E, ctx, catnip, 960, LAY.catnipY, E.seg(fin, 0.04, 0.4, 'cubicInOut'));
    }
  }

  if (!slammed) { ctx.restore(); return; }

  // ---- shockwaves + catnip burst on the slam ----
  ring(E, ctx, 960, LAY.catnipY + 40, E.seg(ls, 0, 0.55), { radius: 1150, width: 44, color: 'cream', rings: 2, gap: 0.12 });
  ring(E, ctx, 960, LAY.catnipY + 40, E.seg(ls, 0.03, 0.7), { radius: 800, width: 26, color: 'catnip', rings: 1 });
  for (const p of E.burst({ seed: 131, count: 46, t, t0: T_SLAM, x: 960, y: LAY.catnipY + 40, speed: [700, 2100], angle: [0, E.TAU], gravity: 700, drag: 2.2, life: [0.6, 1.2], size: [26, 58], spin: 10 }))
    E.drawImg(ctx, p.i % 4 === 0 ? 'coin' : 'catnip', p.x, p.y, { w: p.size, rot: p.rot, alpha: Math.min(1, p.alpha * 1.8) });

  // ---- HEIST: voxels fly in and lock (left to right sweep) ----
  {
    const hx = 960 - heist.W / 2, hy = LAY.heistY - heist.H / 2;
    const assembleEnd = 0.3516;
    const hsc = breathe + finPunch * 0.8;
    if (ls < assembleEnd + 0.02) {
      ctx.save(); ctx.imageSmoothingEnabled = false;
      const Q = PXQ, CELL = heist.CELL;
      for (let i = 0; i < heist.cells.length; i++) {
        const [cx, cy] = heist.cells[i];
        const r = (k) => E.rand('hv', i, k);
        const d0 = 0.04 + (cx / heist.w) * 0.14 + r(1) * 0.05;
        const q = E.seg(ls, d0, d0 + 0.12, 'expoOut');
        if (q <= 0) continue;
        const ang = Math.PI / 2 + (r(2) - 0.5) * 0.9, dist = (1 - q) * (260 + 520 * r(3));
        const tx = hx + cx * Q + Math.cos(ang) * dist, ty = hy + cy * Q + Math.sin(ang) * dist;
        const s = CELL * Q * (1 + (1 - q) * 1.5);
        ctx.globalAlpha = Math.min(1, q * 3);
        ctx.drawImage(heist.cv, cx, cy, CELL, CELL, tx, ty, s, s);
      }
      ctx.restore();
    } else {
      const lock = E.seg(ls, assembleEnd, assembleEnd + 0.25);
      const pop = 1 + 0.08 * Math.exp(-(ls - assembleEnd) / 0.06) * Math.cos((ls - assembleEnd) * 30);
      drawWordImg(ctx, heist, 960 + 8, LAY.heistY + 18, hsc * pop, { alpha: 0.45 });
      drawWordImg(ctx, heist, 960, LAY.heistY, hsc * pop);
      const wA = Math.max(Math.exp(-(ls - assembleEnd) / 0.05) * 0.9, finHit * 0.8);
      if (wA > 0.01) drawWordImg(ctx, heist, 960, LAY.heistY, hsc * pop, { alpha: wA, white: true });
      glintWord(E, ctx, heist, 960, LAY.heistY, E.seg(t, 13.95, 14.45, 'cubicInOut'));
      glintWord(E, ctx, heist, 960, LAY.heistY, E.seg(fin, 0.1, 0.45, 'cubicInOut'));
      void lock;
    }
  }

  // ---- Token Tails logo drops in ----
  {
    const q = E.seg(t, T_LOGO, T_LOGO + 0.32, 'backOut');
    if (q > 0) {
      const sw = E.spring(E.seg(t, T_LOGO, T_LOGO + 0.8), 2.5, 5);
      const y = E.lerp(-180, LAY.logoY, q) - (fin >= 0 ? 10 * Math.exp(-fin / 0.15) : 0);
      E.drawImg(ctx, 'logo', 960, y, { w: 300 * (1 + finPunch), rot: (1 - sw) * 0.25, alpha: Math.min(1, q * 3) });
    }
  }

  // ---- tagline: SNEAK. SWAP. RESCUE. ----
  {
    const words = ['SNEAK.', 'SWAP.', 'RESCUE.'];
    const starts = [T_TAG, T_TAG + 0.1171875, T_TAG + 0.234375];
    const TS = { font: 'condensed', weight: '800', size: 74, tracking: 0.1 };
    const gapW = 60;
    const ws = words.map((w) => E.measureText(ctx, w, TS));
    let x = 960 - (ws.reduce((a, b) => a + b, 0) + gapW * 2) / 2;
    words.forEach((w, k) => {
      const ts = starts[k], cx = x + ws[k] / 2; x += ws[k] + gapW;
      if (t < ts) return;
      const q = E.backOut(E.seg(t, ts, ts + 0.12), 2);
      const sc = E.lerp(1.35, 1, q) * (1 + 0.05 * (fin >= 0 ? Math.exp(-fin / 0.07) : 0));
      const col = k === 2 ? 'pink' : 'cream';
      // 3-frame vertical smear
      const sm = 1 - E.seg(t, ts, ts + 3 / 60);
      for (let g = 2; g >= 1 && sm > 0; g--) E.drawText(ctx, w, cx, LAY.tagY - g * 26 * sm, { ...TS, size: TS.size * sc, color: col, alpha: 0.28 * sm / g, perChar: () => ({ sy: 1 + 0.4 * sm }) });
      E.drawText(ctx, w, cx, LAY.tagY, {
        ...TS, size: TS.size * sc, color: E.env(t, ts, 0.04) > 0.5 ? '#ffffff' : col,
        shadow: { color: '#12071f', blur: 0, x: 0, y: 6 },
        perChar: ({ ch }) => (ch === '.' ? { color: 'catnip' } : {}),
      });
    });
    // underline sweep
    const u = E.seg(t, T_TAG + 0.23, T_TAG + 0.5, 'expoOut');
    if (u > 0) { ctx.fillStyle = E.rgba('catnip', 0.85); const w = 640 * u; ctx.fillRect(960 - w / 2, LAY.tagY + 44, w, 4); }
  }

  // ---- PLAY NOW button ----
  {
    const q = E.seg(t, T_PLAY, T_PLAY + 0.4, 'elasticOut');
    if (t >= T_PLAY) ring(E, ctx, 960, LAY.btnY, E.seg(t, T_PLAY, T_PLAY + 0.45), { radius: 700, width: 30, color: 'coin', rings: 2, gap: 0.15 });
    if (q > 0) {
      const press = fin >= 0 ? Math.exp(-fin / 0.07) : 0;
      const anticip = E.seg(t, 14.414, T_FINAL, 'quadIn');
      const bsc = q * (1 + 0.02 * Math.sin((t - T_PLAY) * 7)) * (1 + 0.04 * anticip - 0.05 * press) * (1 + 0.1 * finHit);
      const bw = 470, bh = 108, depth = 12;
      ctx.save();
      ctx.translate(960, LAY.btnY); ctx.scale(bsc, bsc);
      // glow
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; glowBlob(ctx, 0, 0, 420, rgbaStr(E, 'coin'), 0.22 + 0.25 * finHit); ctx.restore();
      const dy = press * depth;
      ctx.fillStyle = '#2a0f1f'; ctx.beginPath(); ctx.roundRect(-bw / 2 - 6, -bh / 2 - 6 + dy, bw + 12, bh + depth + 12 - dy, 30); ctx.fill();
      ctx.fillStyle = '#b7741a'; ctx.beginPath(); ctx.roundRect(-bw / 2, -bh / 2 + depth, bw, bh, 24); ctx.fill();
      const g = ctx.createLinearGradient(0, -bh / 2 + dy, 0, bh / 2 + dy);
      g.addColorStop(0, '#ffe98f'); g.addColorStop(0.5, '#ffc93c'); g.addColorStop(1, '#f2a91f');
      ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(-bw / 2, -bh / 2 + dy, bw, bh, 24); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.beginPath(); ctx.roundRect(-bw / 2 + 16, -bh / 2 + 8 + dy, bw - 32, 14, 7); ctx.fill();
      // shine sweep
      const sp = E.seg(t, T_PLAY + 0.2, T_PLAY + 0.6, 'cubicInOut');
      if (sp > 0 && sp < 1) {
        ctx.save(); ctx.beginPath(); ctx.roundRect(-bw / 2, -bh / 2 + dy, bw, bh, 24); ctx.clip();
        const x = E.lerp(-bw, bw, sp);
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.beginPath(); ctx.moveTo(x - 30, -bh); ctx.lineTo(x + 20, -bh); ctx.lineTo(x - 30, bh); ctx.lineTo(x - 80, bh); ctx.fill();
        ctx.restore();
      }
      E.drawImg(ctx, 'paw', -178, dy + 2, { w: 64, rot: Math.sin((t - T_PLAY) * 8) * 0.12 });
      E.drawText(ctx, 'PLAY NOW', 42, dy + 4, { size: 70, color: '#2a0f1f', tracking: 0.04 });
      ctx.restore();
    }
  }

  // ---- paw cursor: flies in, winds UP on 14.414 / 14.473 (big travel), slams the button's paw icon on 14.531 ----
  {
    const inP = E.seg(t, 14.16, 14.40, 'expoOut');
    if (inP > 0) {
      const tx = 960 - 196, ty = LAY.btnY + 34;           // the paw icon on the button, left of the text
      const w1 = E.seg(t, 14.414063, 14.414063 + 0.05, 'expoOut'), w2 = E.seg(t, 14.472656, 14.472656 + 0.05, 'expoOut');
      const strike = E.seg(t, 14.50, T_FINAL, 'expoIn');
      const press = fin >= 0 ? Math.exp(-fin / 0.08) : 0;
      const leave = E.seg(t, 14.62, 14.82, 'expoOut');
      let x = E.lerp(220, tx - 120, inP), y = E.lerp(1250, ty + 150, inP);
      x -= 90 * w1 + 90 * w2; y += 80 * w1 + 90 * w2;       // wind-up: >= 170 px back and down-left
      x = E.lerp(x, tx, strike); y = E.lerp(y, ty, strike);
      if (fin >= 0) { x = tx; y = ty + 14 * press; }
      x = E.lerp(x, 1330 + 8 * Math.sin(t * 5), leave); y = E.lerp(y, LAY.btnY + 30 + 6 * Math.sin(t * 7), leave);
      const sc = (1 + 0.12 * (w1 + w2) * (1 - strike)) * (1 - 0.14 * press);
      E.drawImg(ctx, 'paw', x, y, { w: 124 * sc, rot: 0.5 - 0.15 * (w1 + w2) + 0.3 * strike });
    }
  }

  // ---- footer ----
  {
    const q = E.seg(t, T_PLAY + 0.06, T_PLAY + 0.4, 'expoOut');
    void q; // footer dropped: it sat outside title-safe and was unreadable at 22 px
  }

  // ---- final hit: confetti cannons + rings ----
  if (fin >= 0) {
    ring(E, ctx, 960, LAY.btnY, E.seg(fin, 0, 0.55), { radius: 1300, width: 50, color: 'coin', rings: 2, gap: 0.12 });
    const cols = ['#ff7aa2', '#ffc93c', '#9be15d', '#f0c5fd', '#c4e2fc', '#fcecbb'];
    for (const side of [-1, 1]) {
      for (const p of E.burst({ seed: side > 0 ? 301 : 302, count: 90, t, t0: T_FINAL, x: side > 0 ? W + 20 : -20, y: H + 20, speed: [1300, 2500], angle: side > 0 ? [-Math.PI * 0.82, -Math.PI * 0.6] : [-Math.PI * 0.4, -Math.PI * 0.18], gravity: 1500, drag: 1.3, life: [0.9, 1.4], size: [10, 22], spin: 12 })) {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = cols[p.i % cols.length];
        const fl = Math.abs(Math.cos(p.age * 11 + p.i));
        ctx.fillRect(-p.size / 2, (-p.size / 4) * fl, p.size, (p.size / 2) * fl + 2);
        ctx.restore();
      }
    }
    // sparkle spray out of the button's flanks
    for (const p of E.burst({ seed: 333, count: 22, t, t0: T_FINAL, x: 960 + 250, y: LAY.btnY, speed: [600, 1400], angle: [-0.35, 0.35], gravity: 200, drag: 3, life: [0.3, 0.6], size: [10, 22] })) {
      const x = p.i % 2 ? 1920 - p.x : p.x;
      E.star(ctx, x, p.y, p.size * (1 - p.p), { points: 4, inner: 0.3, rot: p.rot, fill: p.i % 3 ? 'coin' : 'cream' });
    }
  }
  ctx.restore();
}

// ------------------------------------------------------------------------------------------
export default {
  start: START,
  end: END,
  async init(E) {
    try {
      const u = new URL('../assets/clips/stills/title-clean.jpg', import.meta.url);
      const r = await fetch(u); if (r.ok) STILL = await createImageBitmap(await r.blob());
    } catch { STILL = null; }
    await document.fonts.load(`100px ${E.FONTS.display}`);
    TITLE = {
      catnip: buildWord(E, 'CATNIP', 300, [[0, '#fff6c2'], [0.35, '#ffd95a'], [0.7, '#ffb52e'], [1, '#ee7a1f']], '#b0406e', 7, '#2a0f1f'),
      heist: buildWord(E, 'HEIST', 222, [[0, '#ffe1ec'], [0.4, '#ff9cc0'], [1, '#e0508a']], '#6f2da8', 6, '#2a0f1f'),
    };
  },
  draw(ctx, t, lt, E) {
    if (t < T_GAP) drawRescue(ctx, t, E);
    else drawLogo(ctx, t, E);
  },
  fx(t, lt, E) {
    const F = 1 / 60;
    const f = { shake: 0, aberration: 0, flash: 0, glitch: 0, zoom: 1, motionBlur: 0 };
    // 11.25 handoff: cream hit capped at 0.45 + RGB split, ~3 frame decay
    f.flash = lt < F ? 0.2 : lt < 2 * F ? 0.07 : 0; f.flashColor = '#fff3d0'; // capped at 2 frames
    f.shake += 12 * E.env(t, START, 0.1); f.aberration += 10 * E.env(t, START, 0.04);
    // rattles + accents
    const r = E.envs(t, RATTLES, 0.07);
    f.shake += 12 * r * (1 + E.seg(t, START, T_BURST) * 1.5) + 10 * E.envs(t, ACCENTS, 0.05);
    f.aberration += 3 * r + 5 * E.envs(t, ACCENTS, 0.05) + (t < T_BURST ? 7 * E.seg(t, 12.0, T_BURST, 'expoIn') : 0);
    // burst: capped flash, tau 0.05 (baseline within ~6 frames); no glitch on the freed cat
    const b = E.env(t, T_BURST, 0.14);
    f.flash = Math.max(f.flash, 0.6 * E.env(t, T_BURST, 0.05));
    f.shake += 34 * b; f.aberration += 12 * E.env(t, T_BURST, 0.04);
    // (no global motion blur on the swirl: only the portal gets its own time smear, sprites stay crisp)
    // snare roll 12.305 / 12.422 / 12.539: alternating +-3 deg Dutch tilt snapped on each hit (backOut, 3 frames)
    if (t < T_BURST) {
      let k = -1; for (let i = 0; i < ROLL.length; i++) if (t >= ROLL[i]) k = i;
      if (k >= 0) {
        const q = E.backOut(E.seg(t, ROLL[k], ROLL[k] + 3 * F), 2);
        const prev = k === 0 ? 0 : (k - 1) % 2 ? -1 : 1, cur = k % 2 ? -1 : 1;
        f.rot = E.deg(3) * E.lerp(prev, cur, q);
      }
      // build: shake + split rise steadily with the riser
      const bld = E.seg(t, 11.3, T_BURST, 'expoIn');
      f.shake += 10 * bld;
    }
    // slam (full white, the big one)
    const s = E.env(t, T_SLAM, 0.22);
    if (t >= T_SLAM) {
      f.flash = Math.max(f.flash, E.env(t, T_SLAM, 0.035)); f.flashColor = '#ffffff';
      f.shake += 46 * s; f.aberration += 12 * E.env(t, T_SLAM, 0.1); f.zoom *= 1 + 0.07 * E.env(t, T_SLAM, 0.16);
      f.glitch = Math.max(f.glitch, 0.25 * E.env(t, T_SLAM, 0.05));
      f.vignette = 0.45;
    }
    if (t >= T_GAP && t < T_SLAM) f.aberration += 10 * E.seg(t, T_GAP, T_SLAM);
    // secondary hits: tagline ticks (shake 12 on the frame after each), PLAY NOW (18)
    for (const h of [T_SLAM + 0.3516, T_LOGO]) f.shake += 6 * E.env(t, h, 0.08);
    for (const h of [T_TAG, T_TAG + 0.1171875, T_TAG + 0.234375]) f.shake += 12 * E.env(t, h + F, 0.05);
    f.shake += 18 * E.env(t, T_PLAY, 0.07);
    f.aberration += 4 * E.envs(t, [T_TAG, T_TAG + 0.117, T_TAG + 0.234, T_PLAY], 0.05);
    f.zoom *= 1 + 0.03 * E.env(t, T_PLAY, 0.08);
    // anticipation "suck" on 14.414 / 14.473: the frame contracts in two steps (0.97, then 0.94), released on 14.531
    if (t >= 14.414063 && t < T_FINAL) {
      const k1 = E.expoOut(E.seg(t, 14.414063, 14.414063 + 4 * F)), k2 = E.expoOut(E.seg(t, 14.472656, 14.472656 + 4 * F));
      f.zoom *= 1 - 0.03 * k1 - 0.03 * k2; f.flash = Math.max(f.flash, 0.1 + 0.08 * k2); f.flashColor = '#07030c';
      f.shake += 6 * E.envs(t, [14.414063, 14.472656], 0.04);
    }
    // final hit on the last downbeat: cream, 0-frame attack, short
    const fh = E.env(t, T_FINAL, 0.18);
    if (t >= T_FINAL) { f.flash = Math.max(f.flash, 0.6 * E.env(t, T_FINAL, 0.04)); f.flashColor = '#fff3d0'; }
    f.shake += 28 * fh; f.aberration += 10 * fh; f.zoom *= 1 + 0.045 * E.env(t, T_FINAL, 0.15);
    // living tail: a tiny breathing shake so the last 0.3s never freezes
    if (t > 14.7) f.shake += 1.5;
    return f;
  },
};
