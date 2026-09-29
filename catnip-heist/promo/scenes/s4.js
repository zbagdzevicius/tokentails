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
  probe.font = font;
  const m = probe.measureText(str);
  const w = Math.ceil(m.width + pad * 2), h = Math.ceil(lo * 1.35 + depth + pad);
  const cv = new OffscreenCanvas(w, h), c = cv.getContext('2d');
  c.font = font; c.textAlign = 'center'; c.textBaseline = 'middle';
  const x = w / 2, y = lo * 0.62 + pad * 0.5;
  // voxel extrude: stacked copies stepping down, darkening towards the back
  for (let k = depth; k >= 1; k--) {
    c.lineJoin = 'round'; c.lineWidth = Math.max(2, lo * 0.09); c.strokeStyle = outline;
    c.strokeText(str, x, y + k);
    c.fillStyle = E.shade(depthCol, -0.5 * (k / depth));
    c.fillText(str, x, y + k);
  }
  c.lineJoin = 'round'; c.lineWidth = Math.max(2, lo * 0.09); c.strokeStyle = outline;
  c.strokeText(str, x, y);
  const g = c.createLinearGradient(0, y - lo * 0.45, 0, y + lo * 0.4);
  for (const [o, cc] of stops) g.addColorStop(o, cc);
  c.fillStyle = g; c.fillText(str, x, y);
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
const BARS_X = [-17, -7, 4, 14];
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
  E.drawSprite(c, 'white', catRow, catFrame, 0, -5, 1, { anchor: 'feet' });
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
    const e = Math.exp(-a / 0.075), amp = 0.5 + i * 0.18;
    rot += 0.07 * amp * e * Math.sin(a * 70 + i);
    hop += 6 * amp * Math.max(0, Math.sin(Math.min(1, a / 0.11) * Math.PI)) * (a < 0.11 ? 1 : 0);
    sq += 0.12 * amp * Math.exp(-Math.max(0, a - 0.1) / 0.05) * (a > 0.1 ? 1 : 0);
  });
  // continuous tremble grows with the riser
  const build = E.seg(t, 11.9, T_BURST, 'expoIn');
  rot += 0.02 * build * E.noise1(t * 60, 3);
  return { rot, hop, sq, k };
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
function drawRescue(ctx, t, E) {
  const { W, H } = E;
  const ab = t - T_BURST; // time after burst
  const burst = ab >= 0;

  // swirl camera (portal pulls everything in)
  const sw = E.seg(t, 12.78, T_GAP, 'expoIn');
  const camZoomPush = (1 + 0.16 * E.seg(t, START, T_BURST, 'cubicIn')) * (1 + 0.14 * (1 - E.expoOut(E.seg(t, START, START + 0.45))));
  const burstPunch = burst ? 0.14 * Math.exp(-ab / 0.12) : 0;
  const zoom = camZoomPush * (1 + burstPunch) * (1 + 3.2 * sw);
  const rot = 2.4 * sw + (burst ? 0.02 * E.env(t, T_BURST, 0.1) : 0);

  ctx.fillStyle = E.col('night'); ctx.fillRect(0, 0, W, H);
  E.camera(ctx, { zoom, rot, cx: PORTAL[0], cy: PORTAL[1] }, (c) => {
    // ---- BG: real game footage, dim security feed with slower parallax push ----
    const bgT = burst ? E.clipFrameTime('h08-vault-rescue', 113) + ab : E.clipFrameTime('h08-vault-rescue', 70) + (t - START);
    E.camera(c, { zoom: 1.12 - 0.07 * (1 - E.seg(t, START, T_BURST)) + (burst ? 0.1 * E.expoOut(E.seg(ab, 0, 0.45)) : 0), cx: CX, cy: 540 }, (cc) => {
      E.drawClip(cc, 'h08-vault-rescue', bgT, -200, -120, W + 400, H + 240, { fx: 0.62, fy: 0.42 });
    });
    const dim = burst ? E.lerp(0.25, 0.6, E.seg(ab, 0, 0.35)) : 0.72 - 0.12 * E.seg(t, START, T_BURST, 'expoIn');
    c.fillStyle = E.rgba('night', dim); c.fillRect(-200, -200, W + 400, H + 400);
    c.save(); c.globalCompositeOperation = 'color'; c.fillStyle = E.rgba('violet', 0.35); c.fillRect(-200, -200, W + 400, H + 400); c.restore();

    // ---- god rays / backlight that swells with the riser ----
    const riser = E.seg(t, START, T_BURST, 'quadIn');
    c.save(); c.globalCompositeOperation = 'lighter';
    glowBlob(c, CX, 520, 520 + 260 * riser, rgbaStr(E, 'grape'), 0.35 + 0.4 * riser);
    glowBlob(c, CX, 540, 260 + 120 * riser, rgbaStr(E, 'catnipGlow'), 0.08 + 0.25 * riser * riser);
    const rays = 14, ra = t * 0.35;
    c.globalAlpha = 0.05 + 0.12 * riser;
    c.fillStyle = E.col('lilac');
    for (let i = 0; i < rays; i++) {
      const a = ra + (i / rays) * E.TAU, wdt = 0.07;
      c.beginPath(); c.moveTo(CX, 540);
      c.lineTo(CX + Math.cos(a - wdt) * 1800, 540 + Math.sin(a - wdt) * 1800);
      c.lineTo(CX + Math.cos(a + wdt) * 1800, 540 + Math.sin(a + wdt) * 1800); c.fill();
    }
    c.restore();

    // ---- speed lines ramp into the burst ----
    const sl = E.seg(t, 12.05, T_BURST, 'expoIn');
    if (sl > 0 && !burst) E.speedLines(c, t, { cx: CX, cy: 560, count: 110, inner: 620 - 260 * sl, outer: 1500, width: [2, 10], color: 'lilac', alpha: 0.18 + 0.5 * sl, seed: 44, fps: 30 });

    // ---- portal (after burst) ----
    if (burst) {
      const R = 560 * E.backOut(E.seg(ab, 0.02, 0.32)) + 140 * sw;
      drawPortal(c, E, t, R, 1);
    }

    // ---- floor shadow ----
    c.save(); c.fillStyle = 'rgba(0,0,0,0.45)';
    c.beginPath(); c.ellipse(CX + 20, BY + 6, 330, 34, 0, 0, E.TAU); c.fill(); c.restore();

    // ---- heroes clawing at the crate / leaping away on the burst ----
    const heroFrame = E.spriteFrame(t, 14);
    [['albertino', -1], ['oreo', 1]].forEach(([id, side], hi) => {
      const baseX = CX + side * 372, enter = E.seg(t, START, START + 0.28, 'backOut');
      let x = baseX + side * (1 - enter) * 700, y = BY + 2, row = 'DIGGING', f = heroFrame, sc = S;
      let flip = side > 0;
      if (burst) {
        const j = E.seg(ab, 0, 0.42);
        row = 'JUMPING'; f = Math.min(6, Math.floor(j * 7));
        x = baseX + side * 170 * E.expoOut(j);
        y = BY + 2 - 240 * Math.sin(Math.min(1, j) * Math.PI) * (1 - 0.3 * j);
        sc = S * (1 + 0.25 * E.expoOut(j));
      }
      const hit = !burst && E.envs(t, RATTLES, 0.06);
      E.drawSprite(c, id, row, f, x, y, sc, { anchor: 'feet', flip, clamp: burst, sy: burst ? 1 : 1 - 0.08 * hit, sx: burst ? 1 : 1 + 0.08 * hit });
    });

    // ---- crate ----
    const rs = rattleState(E, t);
    if (!burst) {
      c.save();
      const drop = (1 - E.bounceOut(E.seg(t, START, START + 0.26))) * 720;
      c.translate(CX, BY - rs.hop * S - drop);
      c.rotate(rs.rot);
      c.scale(S * (1 + rs.sq), S * (1 - rs.sq));
      const near = RATTLES.some((tc) => t >= tc && t - tc < 0.1);
      crateWhole(c, E, t, near ? 'HIT' : 'SITTING', near ? 2 : E.spriteFrame(t, 8));
      c.restore();
      // white tint pop on each rattle
      const flashA = E.envs(t, RATTLES, 0.035) * 0.55;
      if (flashA > 0.02) {
        c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = flashA;
        glowBlob(c, CX, BY - 200, 420, 'rgba(255,243,208,A)', 0.6); c.restore();
      }
      // dust puffs on every landing (and the initial drop)
      [START + 0.1, ...RATTLES].forEach((tc0, i0) => { const tc = i0 === 0 ? tc0 : tc0; const i = i0 + 10;
        for (const p of E.burst({ seed: 700 + i, count: i === 10 ? 26 : 14, t, t0: i === 10 ? tc : tc + 0.1, x: CX + (E.rand(i, 'dx') - 0.5) * 300, y: BY, speed: [120, 420], angle: [-Math.PI, 0], gravity: -60, drag: 3, life: [0.3, 0.55], size: [8, 22] })) {
          c.fillStyle = E.rgba('lilac', 0.45 * p.alpha); const s = p.size * (1 + p.p);
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

    // ---- freed shelter cat pops up and hovers in front of the portal ----
    if (burst) {
      const j = E.seg(ab, 0, 0.3, 'backOut');
      const pull = E.seg(t, 12.9, T_GAP, 'expoIn');
      const cy = E.lerp(BY - 5 * S, PORTAL[1] + 120, j) + 10 * Math.sin(ab * 9);
      const sc = S * (1 + 0.55 * j) * (1 - 0.9 * pull);
      const row = ab < 0.35 ? 'JUMPING' : 'IDLE';
      const fr = ab < 0.35 ? Math.min(6, Math.floor(ab / 0.05)) : E.spriteFrame(t, 12);
      E.drawSprite(c, 'white', row, fr, CX, cy, sc, { anchor: 'feet', clamp: ab < 0.35, rot: pull * 3, outline: { color: '#fff3d0', px: 1 }, tint: { color: '#ffffff', amount: E.env(ab, 0, 0.09) } });
      // hearts rise
      for (const p of E.burst({ seed: 51, count: 12, t, t0: T_BURST + 0.05, x: CX, y: cy - 180, speed: [160, 420], angle: [-Math.PI * 0.85, -Math.PI * 0.15], gravity: -200, drag: 2, life: [0.5, 0.9], size: [34, 58], delay: 0.15 })) {
        E.drawImg(c, 'heart', p.x, p.y, { w: p.size * (0.6 + 0.4 * E.backOut(Math.min(1, p.age / 0.12))), alpha: Math.min(1, p.alpha * 2), rot: Math.sin(p.age * 8 + p.i) * 0.2 });
      }
    }

    // ---- confetti ----
    if (burst) {
      const cols = ['#ff7aa2', '#ffc93c', '#9be15d', '#f0c5fd', '#c4e2fc', '#fcecbb'];
      for (const p of E.burst({ seed: 90, count: 170, t, t0: T_BURST, x: CX, y: BY - 200, speed: [500, 1700], angle: [0, E.TAU], gravity: 1500, drag: 1.4, life: [0.6, 1.1], size: [10, 22], spin: 14 })) {
        c.save(); c.translate(p.x, p.y); c.rotate(p.rot);
        c.fillStyle = cols[p.i % cols.length];
        const s = p.size;
        c.fillRect(-s / 2, (-s / 4) * Math.abs(Math.cos(p.age * 12 + p.i)), s, (s / 2) * Math.abs(Math.cos(p.age * 12 + p.i)) + 2);
        c.restore();
      }
      ring(E, c, CX, BY - 200, E.seg(ab, 0, 0.5), { radius: 900, width: 40, color: 'rescueFlash', rings: 2, gap: 0.14 });
    }

    // ---- kinetic copy ----
    drawRescueType(c, E, t);
  });

  // ---- security-cam HUD (screen space, glitches out on the burst) ----
  if (t < T_BURST + 0.08) {
    const hudA = E.seg(t, START, START + 0.08) * (burst ? 1 - E.seg(ab, 0, 0.08) : 1);
    ctx.save(); ctx.globalAlpha = hudA;
    const blink = E.beatPhase(t) < 0.5;
    ctx.fillStyle = E.col('alertRed');
    if (blink) { ctx.beginPath(); ctx.arc(86, 78, 12, 0, E.TAU); ctx.fill(); }
    E.drawText(ctx, 'REC', 110, 79, { size: 26, font: 'mono', weight: 'bold', align: 'left', color: 'alertRed', tracking: 0.2 });
    E.drawText(ctx, 'CAM 08 // VAULT B', 190, 79, { size: 26, font: 'mono', align: 'left', color: 'cream', tracking: 0.2, alpha: 0.85 });
    E.drawText(ctx, E.timecode(t), W - 70, 79, { size: 26, font: 'mono', align: 'right', color: 'cream', tracking: 0.15, alpha: 0.85 });
    E.drawText(ctx, 'KIBBLE CORP SECURITY  //  MOTION DETECTED', 70, H - 64, { size: 22, font: 'mono', align: 'left', color: 'lavender', tracking: 0.25, alpha: 0.6 + 0.4 * E.envs(t, RATTLES, 0.1) });
    // corner brackets
    ctx.strokeStyle = E.rgba('cream', 0.7); ctx.lineWidth = 4;
    for (const [x, y, sx, sy] of [[46, 40, 1, 1], [W - 46, 40, -1, 1], [46, H - 40, 1, -1], [W - 46, H - 40, -1, -1]]) {
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

function drawRescueType(c, E, t) {
  const ab = t - T_BURST;
  // Line 1: LOCKED UP.   (rattle 1 .. rattle 3)
  if (t >= RATTLES[0] - 0.02 && t < RATTLES[2] + 0.01) {
    const lt = t - RATTLES[0], out = E.seg(t, RATTLES[2] - 0.08, RATTLES[2] + 0.01, 'expoIn');
    E.drawText(c, 'LOCKED UP.', 960, 272 - out * 60, {
      size: 150, color: 'cream', tracking: 0.04, extrude: { depth: 12, color: 'grape', dark: 0.6 }, alpha: 1 - out,
      perChar: ({ i, n }) => {
        const q = E.stagger(lt, i, n, { spread: 0.1, dur: 0.22, e: 'backOut' });
        const sh = E.envs(t, RATTLES, 0.05);
        return { y: (1 - q) * -110 + E.randSigned('lk', i, E.frame >> 1) * 7 * sh, rot: (1 - q) * 0.4 * (i % 2 ? 1 : -1), alpha: Math.min(1, q * 3), sx: 1 + out * 0.6, sy: 1 - out * 0.5 };
      },
    });
  }
  // Line 2: BUST IT OPEN — word by word on rattles 3, 4, 5
  if (t >= RATTLES[2] && t < T_BURST + 0.14) {
    const words = [['BUST', RATTLES[2]], ['IT', RATTLES[3]], ['OPEN', RATTLES[4]]];
    const sizes = [150, 150, 200];
    const gap = 40;
    const ws = words.map(([w], k) => E.measureText(c, w, { size: sizes[k], tracking: 0.03 }));
    const total = ws.reduce((a, b) => a + b, 0) + gap * 2;
    let x = 960 - total / 2;
    const exp = E.seg(ab, 0, 0.14, 'expoOut');
    words.forEach(([w, tw], k) => {
      const q = E.seg(t, tw, tw + 0.1, 'backOut');
      if (q > 0) {
        const hit = E.env(t, tw, 0.06);
        const cx = x + ws[k] / 2;
        E.drawText(c, w, cx + (cx - 960) * exp * 1.2, 272 - exp * 80, {
          size: sizes[k], color: k === 2 ? 'coin' : 'cream', tracking: 0.03, alpha: 1 - exp,
          extrude: { depth: k === 2 ? 16 : 12, color: k === 2 ? 'rust' : 'grape', dark: 0.6 },
          perChar: ({ i }) => ({ scale: (2.2 - 1.2 * q) * (1 + 0.3 * exp), alpha: Math.min(1, q * 2.5), y: E.randSigned('bo', k, i, E.frame >> 1) * 10 * hit + (1 - q) * 20, color: hit > 0.5 ? '#ffffff' : undefined }),
        });
      }
      x += ws[k] + gap;
    });
  }
  // case file label (scramble decode)
  if (t < T_BURST + 0.05) {
    const p = E.seg(t, START + 0.02, START + 0.4);
    const a = 1 - E.seg(ab, 0, 0.05);
    E.drawText(c, E.scramble('SHELTER CAT #08  //  "CLOVER"  //  STATUS: CAGED', p, 81), 960, 150, { size: 26, font: 'mono', weight: 'bold', color: 'catnip', tracking: 0.28, alpha: a * (t < START + 0.02 ? 0 : 1) });
    const bw = E.measureText(c, 'SHELTER CAT #08  //  "CLOVER"  //  STATUS: CAGED', { size: 26, font: 'mono', weight: 'bold', tracking: 0.28 });
    c.fillStyle = E.rgba('catnip', 0.8 * a); c.fillRect(960 - bw / 2 * E.expoOut(p), 172, bw * E.expoOut(p), 3);
  }
  // FREED! slam on the burst
  if (ab >= 0 && t < T_GAP) {
    const q = E.seg(ab, 0, 0.16, 'backOut');
    const pull = E.seg(t, 12.88, T_GAP, 'expoIn');
    E.drawText(c, 'FREED!', 960, 250, {
      size: 230, color: 'cream', tracking: 0.05, extrude: { depth: 18, color: 'pink', dark: 0.65 },
      glow: { color: 'pink', blur: 30 },
      perChar: ({ i, n }) => {
        const qi = E.stagger(ab, i, n, { spread: 0.06, dur: 0.16, e: 'backOut' });
        return { scale: (0.2 + 0.8 * qi) * (1 - 0.8 * pull), y: (1 - qi) * 80 + Math.sin(ab * 14 + i) * 6, rot: (1 - qi) * (i % 2 ? 0.5 : -0.5) + pull * 1.5, alpha: Math.min(1, qi * 2) * (1 - pull), color: ab < 0.05 ? '#ffffff' : undefined };
      },
    });
    void q;
  }
}

// ------------------------------------------------------------------------------------------
// BAR 8: LOGO SLAM
// ------------------------------------------------------------------------------------------
const LAY = { logoY: 104, catnipY: 392, heistY: 590, tagY: 770, btnY: 892, footY: 1026 };

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

function drawLogo(ctx, t, E) {
  const { W, H } = E;
  const ls = t - T_SLAM; // time since slam
  const slammed = ls >= 0;
  const fin = t - T_FINAL;

  // ---- background ----
  ctx.fillStyle = E.col('night'); ctx.fillRect(0, 0, W, H);
  if (slammed) {
    const bz = 1.22 - 0.16 * E.expoOut(E.seg(ls, 0, 1.6)) + (fin >= 0 ? 0.03 * Math.exp(-fin / 0.2) : 0);
    const drift = E.lerp(-20, 20, E.seg(t, T_SLAM, END, 'sineInOut'));
    E.camera(ctx, { zoom: bz, x: drift, cx: 960, cy: 520 }, (c) => {
      if (STILL) { c.imageSmoothingEnabled = true; c.drawImage(STILL, -40, -40, W + 80, H + 80); }
    });
    ctx.fillStyle = E.rgba('night', 0.58); ctx.fillRect(0, 0, W, H);
    const rg = ctx.createRadialGradient(960, 470, 100, 960, 470, 1100);
    rg.addColorStop(0, 'rgba(75,0,130,0.0)'); rg.addColorStop(1, 'rgba(13,6,22,0.85)');
    ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);

    // god rays
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const rays = 18, ra = t * 0.25 + 0.4 * E.expoOut(E.seg(ls, 0, 0.6));
    ctx.globalAlpha = 0.07 + 0.06 * Math.exp(-ls / 0.3) + (fin >= 0 ? 0.1 * Math.exp(-fin / 0.25) : 0);
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
    for (let d = 0; d < 3; d++) {
      const n = [16, 10, 6][d], sz = [18, 30, 54][d], sp = [30, 60, 110][d], a = [0.35, 0.55, 0.8][d];
      for (let i = 0; i < n; i++) {
        const r = (k) => E.rand('leaf', d, i, k);
        const y = E.mod(r(1) * (H + 200) - (t - T_SLAM) * sp - 100, H + 200) - 100;
        const x = r(2) * W + Math.sin(t * (0.8 + r(3)) + i) * 30;
        E.drawImg(ctx, 'catnip', x, y, { w: sz, alpha: a * E.seg(ls, 0.05, 0.4), rot: Math.sin(t * 1.5 + i) * 0.5 });
      }
    }
    for (let i = 0; i < 40; i++) {
      const r = (k) => E.rand('spk', i, k);
      const tw = 0.5 + 0.5 * Math.sin(t * (3 + r(1) * 5) + r(2) * 9);
      ctx.fillStyle = E.rgba(i % 3 ? 'cream' : 'catnipGlow', 0.6 * tw * E.seg(ls, 0.1, 0.4));
      const s = 3 + Math.round(r(3) * 3);
      ctx.fillRect(Math.round(r(4) * W), Math.round(r(5) * H), s, s);
    }
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
  const { catnip, heist } = TITLE;
  const finHit = fin >= 0 ? Math.exp(-fin / 0.07) : 0;
  const finPunch = fin >= 0 ? 0.06 * Math.exp(-fin / 0.14) * Math.cos(fin * 30) : 0;
  const breathe = 1 + 0.008 * Math.sin((t - T_SLAM) * 4);

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
      glintWord(E, ctx, catnip, 960, LAY.catnipY, E.seg(fin, 0.04, 0.4, 'cubicInOut'));
    }
  }

  if (!slammed) return;

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
    const str = 'SNEAK.  SWAP.  RESCUE.';
    const starts = [T_TAG, T_TAG + 0.1171875, T_TAG + 0.234375];
    const wordOf = (i) => (i < 6 ? 0 : i < 13 ? 1 : 2);
    E.drawText(ctx, str, 960, LAY.tagY, {
      size: 58, font: 'heavy', color: 'cream', tracking: 0.12,
      shadow: { color: '#12071f', blur: 0, x: 0, y: 6 },
      perChar: ({ ch, i }) => {
        const k = wordOf(i), ts = starts[k];
        const q = E.seg(t, ts, ts + 0.16, 'backOut');
        if (q <= 0) return false;
        const h = E.env(t, ts, 0.05);
        return { y: (1 - q) * 50 - (fin >= 0 ? 8 * finHit : 0), scale: 0.4 + 0.6 * q, alpha: Math.min(1, q * 2), color: ch === '.' ? 'catnip' : h > 0.4 ? '#ffffff' : k === 2 ? 'pink' : 'cream' };
      },
    });
    // underline sweep
    const u = E.seg(t, T_TAG + 0.23, T_TAG + 0.5, 'expoOut');
    if (u > 0) { ctx.fillStyle = E.rgba('catnip', 0.85); const w = 640 * u; ctx.fillRect(960 - w / 2, LAY.tagY + 44, w, 4); }
  }

  // ---- PLAY NOW button ----
  {
    const q = E.seg(t, T_PLAY, T_PLAY + 0.4, 'elasticOut');
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

  // ---- paw cursor taps PLAY on the final hit ----
  {
    const inP = E.seg(t, 14.18, 14.414, 'expoOut');
    if (inP > 0) {
      const wind = E.seg(t, 14.414, 14.5, 'quadOut') - E.seg(t, 14.5, T_FINAL, 'expoIn');
      const press = fin >= 0 ? Math.exp(-fin / 0.08) : 0;
      const leave = E.seg(t, 14.66, 14.98, 'backIn');
      const x = E.lerp(1560, 1222, inP) + 260 * leave;
      const y = E.lerp(1180, LAY.btnY + 52, inP) - 40 * wind + 18 * press + 280 * leave;
      const sc = 1 + 0.12 * wind - 0.12 * press;
      E.drawImg(ctx, 'paw', x, y, { w: 96 * sc, rot: -0.55 + 0.1 * wind });
    }
  }

  // ---- footer ----
  {
    const q = E.seg(t, T_PLAY + 0.06, T_PLAY + 0.4, 'expoOut');
    if (q > 0) E.drawText(ctx, '8 HEISTS   ·   58 CATS   ·   EVERY HEIST HELPS REAL SHELTER CATS', 960, LAY.footY + (1 - q) * 30, { size: 22, font: 'ui', weight: 'bold', color: 'lilac', tracking: 0.3 * q + 0.05, alpha: 0.85 * q });
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

  // light leak + gentle vignette over the end card
  E.lightLeak(ctx, t, { seed: 17, intensity: 0.1 + 0.12 * Math.exp(-ls / 0.3) + 0.15 * finHit, colors: ['#ff7aa2', '#ffc93c', '#9966cc'], speed: 0.5 });
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
    const f = { shake: 0, aberration: 0, flash: 0, glitch: 0, zoom: 1, motionBlur: 0 };
    // handoff flash in
    f.flash = Math.max(f.flash, 0.85 * E.env(t, START, 0.09));
    f.shake += 10 * E.env(t, START, 0.12);
    // rattles
    const r = E.envs(t, RATTLES, 0.07);
    f.shake += 9 * r * (1 + E.seg(t, START, T_BURST) * 1.5);
    f.aberration += 3 * r + (t < T_BURST ? 7 * E.seg(t, 12.0, T_BURST, 'expoIn') : 0);
    f.zoom *= 1 + 0.015 * r;
    // burst
    const b = E.env(t, T_BURST, 0.14);
    f.flash = Math.max(f.flash, 0.95 * E.env(t, T_BURST, 0.06));
    f.flashColor = '#fff3d0';
    f.shake += 34 * b; f.aberration += 14 * b; f.glitch = Math.max(f.glitch, 0.35 * E.env(t, T_BURST, 0.06));
    // swirl: motion blur while the portal pulls
    if (t > 12.8 && t < T_GAP) f.motionBlur = 5;
    // slam
    const s = E.env(t, T_SLAM, 0.22);
    if (t >= T_SLAM) {
      f.flash = Math.max(f.flash, E.env(t, T_SLAM, 0.035));
      f.shake += 46 * s; f.aberration += 12 * E.env(t, T_SLAM, 0.1); f.zoom *= 1 + 0.07 * E.env(t, T_SLAM, 0.16);
      f.glitch = Math.max(f.glitch, 0.25 * E.env(t, T_SLAM, 0.05));
    }
    if (t >= T_GAP && t < T_SLAM) f.aberration += 10 * E.seg(t, T_GAP, T_SLAM);
    // secondary hits
    for (const h of [T_SLAM + 0.3516, T_LOGO, T_TAG, T_PLAY]) f.shake += 6 * E.env(t, h, 0.08);
    f.aberration += 3 * E.envs(t, [T_TAG, T_TAG + 0.117, T_TAG + 0.234, T_PLAY], 0.06);
    // final hit
    const fh = E.env(t, T_FINAL, 0.18);
    f.flash = Math.max(f.flash, 0.75 * E.env(t, T_FINAL, 0.045));
    f.shake += 28 * fh; f.aberration += 10 * fh; f.zoom *= 1 + 0.045 * E.env(t, T_FINAL, 0.15);
    if (t >= T_SLAM) { f.flashColor = t >= T_FINAL - 0.001 ? '#fff3d0' : '#ffffff'; f.vignette = 0.45; }
    return f;
  },
};
