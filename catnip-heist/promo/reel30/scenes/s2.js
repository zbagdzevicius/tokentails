// s2: THE CREW (bars 3-4, 3.750-7.500 s). "Two cats. One heist." then the verbs, one per beat:
// SWAP, SNEAK, MEOW, CRACK THE VAULT, COLLECT CATNIP, DON'T GET SPOTTED, then everything is
// pulled into a slit leaning 12 degrees off vertical, that s3 reopens as its first level wipe.
//
// Beat map (global seconds, beat = 0.46875):
//   3.750 HEIST DROP  panels slam, TWO CATS.        4.219 clap  panels split, ONE HEIST. (h01)
//   4.688 SWAP        freeze + whip to cat 2         5.156 clap  diagonal wipe, SNEAK (h06)
//   5.625 MEOW        meow rings, zoom settle (h02)  6.094 clunk CRACK THE VAULT (h08), gold dust
//   6.563 riser       COLLECT CATNIP, sprigs -> counter (h05)
//   7.031 clap        red alert, DON'T GET SPOTTED   7.20-7.50 slit closes, fill-hit recap flashes

const T0 = 3.75;
const B = 0.46875;
const SLANT = (12 * Math.PI) / 180;
const CUT = [0, B, 2 * B, 3 * B, 4 * B, 5 * B, 6 * B, 7 * B]; // shot starts (lt)
const SLIT0 = 3.45; // lt where the slit starts closing (7.20 s)
const COUNTER = { x: 1920 - 190, y: 118 };
const NUNITO = '"Nunito", "Helvetica Neue", Arial, sans-serif';
const PASSION = '"Passion One", "Arial Black", Impact, sans-serif';

// file number n (1-based) of a 30 fps clip -> clip time, half a frame in so floor() never slips.
const ft = (n) => (n - 1 + 0.5) / 30;
// shot-local time sl played from file n0 at speed sp, clamped to [n0, n1]
const play = (sl, n0, sp, n1 = 1e9) => ft(Math.min(n1, n0 + Math.max(0, sl) * 30 * sp));

// Full-frame clip under a zoom whose focus point (fx, fy in source 0..1) lands on (sx, sy),
// clamped so the frame always covers the canvas. Returns a mapper source->screen.
function clipCam(c, E, name, ct, { zoom = 1, fx = 0.5, fy = 0.5, sx = E.W / 2, sy = E.H / 2, alpha = 1, blurDx = 0 } = {}) {
  const { W, H } = E;
  const z = Math.max(1, zoom);
  const tx = E.clamp(sx - fx * W * z, W - W * z, 0), ty = E.clamp(sy - fy * H * z, H - H * z, 0);
  const draw = (cc) => { cc.save(); cc.translate(tx, ty); cc.scale(z, z); E.drawClip(cc, name, ct, 0, 0, W, H, { alpha }); cc.restore(); };
  if (Math.abs(blurDx) > 2) E.dirBlur(c, draw, blurDx, 0, 5, 0.55); else draw(c);
  return (u, v) => [tx + u * W * z, ty + v * H * z];
}

// House headline: Cat Paw, cream, 6 px outline, hard plum drop.
function headline(c, E, str, x, y, size, o = {}) {
  return E.drawText(c, str, x, y, {
    size, color: o.color || 'cream', tracking: o.tracking ?? 0.02,
    stroke: o.stroke || 'outline', strokeWidth: o.strokeWidth ?? Math.max(6, size * 0.06),
    extrude: o.extrude === false ? undefined : { depth: o.depth ?? Math.round(size * 0.07), dx: 0, dy: 1, color: o.drop || 'plum', dark: 0.35 },
    shadow: o.shadow, glow: o.glow, alpha: o.alpha, perChar: o.perChar, align: o.align,
  });
}

function bg(c, E, a = 'grape', b = 'plum') {
  const g = c.createLinearGradient(0, 0, E.W, E.H);
  g.addColorStop(0, E.col(a)); g.addColorStop(1, E.col(b));
  c.fillStyle = g; c.fillRect(-40, -40, E.W + 80, E.H + 80);
}

// Diagonal half-plane polygon: everything left of a 12-degree edge whose centre is at x = ex.
function leftOf(c, E, ex, slant = SLANT) {
  const s = Math.tan(slant) * E.H;
  c.moveTo(-200, -10); c.lineTo(ex + s / 2, -10); c.lineTo(ex - s / 2, E.H + 10); c.lineTo(-200, E.H + 10); c.closePath();
}
function rightOf(c, E, ex, slant = SLANT) {
  const s = Math.tan(slant) * E.H;
  c.moveTo(ex + s / 2, -10); c.lineTo(E.W + 200, -10); c.lineTo(E.W + 200, E.H + 10); c.lineTo(ex - s / 2, E.H + 10); c.closePath();
}
function edgeLine(c, E, ex, color, width, alpha = 1, slant = SLANT) {
  const s = Math.tan(slant) * E.H;
  c.save(); c.globalAlpha *= alpha; c.strokeStyle = E.col(color); c.lineWidth = width; c.lineCap = 'butt';
  c.shadowColor = E.col(color); c.shadowBlur = width * 3;
  c.beginPath(); c.moveTo(ex + s / 2 + 2, -20); c.lineTo(ex - s / 2 - 2, E.H + 20); c.stroke(); c.restore();
}

// Pixel confetti squares (crisp, palette).
function confetti(c, E, t, t0, x, y, seed, count = 36, spread = [500, 1400]) {
  const cols = ['coin', 'pink', 'catnipGlow', 'cream', 'lavender'];
  for (const q of E.burst({ seed, count, t, t0, x, y, speed: spread, angle: [0, E.TAU], gravity: 1400, drag: 2.2, life: [0.5, 0.9], size: [8, 18], spin: 10 })) {
    c.save(); c.globalAlpha = E.clamp01(q.alpha * 1.4); c.fillStyle = E.col(cols[q.i % cols.length]);
    c.translate(q.x, q.y); c.rotate(Math.round(q.rot / (Math.PI / 4)) * (Math.PI / 4));
    const s = Math.round(q.size / 4) * 4; c.fillRect(-s / 2, -s / 2, s, s); c.restore();
  }
}

// Skewed tape behind a headline (12-degree parallelogram).
function tape(c, E, x, y, w, h, color, alpha) {
  if (w <= 1) return;
  const k = Math.tan(SLANT) * h / 2;
  c.save(); c.globalAlpha *= alpha; c.fillStyle = E.col(color);
  c.beginPath(); c.moveTo(x - w / 2 + k, y - h / 2); c.lineTo(x + w / 2 + k, y - h / 2); c.lineTo(x + w / 2 - k, y + h / 2); c.lineTo(x - w / 2 - k, y + h / 2); c.closePath(); c.fill();
  c.restore();
}

// ---------------------------------------------------------------- shot A: TWO CATS. (panels)
function panels(c, E, t, lt, split) {
  const { W, H } = E;
  const qL = E.anticipate(E.seg(lt, 0, 10 / 60)), qR = E.anticipate(E.seg(lt, 1 / 60, 11 / 60));
  // split (0..1): panels part along the slant, left one up-left, right one down-right
  const sp = split * 1.15;
  const ux = Math.sin(SLANT);
  const lx = -1100 * (1 - qL) - sp * 900 * ux - sp * 260;
  const rx = 1100 * (1 - qR) + sp * 900 * ux + sp * 260;
  const drift = 1 + 0.02 * E.seg(lt, 0, 2 * B);
  const side = (k) => {
    const isL = k === 0;
    const ox = isL ? lx : rx, oy = isL ? -sp * 820 : sp * 820;
    const draw = (cc) => {
      cc.save(); cc.translate(ox, oy);
      cc.beginPath(); if (isL) leftOf(cc, E, W / 2); else rightOf(cc, E, W / 2); cc.clip();
      bg(cc, E, isL ? 'grape' : 'violet', isL ? 'plum' : 'night');
      // inner glow behind the cat
      const gx = isL ? W * 0.27 : W * 0.73, gy = H * 0.58;
      const rg = cc.createRadialGradient(gx, gy, 20, gx, gy, 620);
      rg.addColorStop(0, E.rgba(isL ? 'rust' : 'lavender', 0.55)); rg.addColorStop(1, E.rgba('night', 0));
      cc.fillStyle = rg; cc.fillRect(0, 0, W, H);
      E.speedLinesDir(cc, t, { angle: isL ? 0 : Math.PI, count: 34, speed: 5200, length: [260, 900], width: [3, 9], color: 'cream', alpha: 0.22, seed: isL ? 11 : 12 });
      // giant outlined index behind (parallax 0.6)
      E.drawText(cc, isL ? '01' : '02', gx + (isL ? -40 : 40) - ox * 0.4, H * 0.42, { font: PASSION, weight: 700, size: 620, color: isL ? 'grape2' : 'plum', alpha: 0.85, stroke: isL ? 'lavender' : 'grape', strokeWidth: 6 });
      // floor shadow + hero sprite, running toward the centre
      cc.fillStyle = E.rgba('night', 0.45); cc.beginPath(); cc.ellipse(gx, H * 0.83, 260 * drift, 32, 0, 0, E.TAU); cc.fill();
      const bob = Math.round(Math.abs(Math.sin(t * 24)) * -10);
      E.drawSprite(cc, isL ? 'albertino' : 'oreo', 'RUNNING', E.spriteFrame(t, 14), gx, H * 0.84 + bob, 14, { anchor: 'feet', flip: !isL, tint: { color: '#fff', amount: E.env(lt, (isL ? 10 : 11) / 60, 0.06) } });
      cc.restore();
    };
    const v = 1 - (isL ? qL : qR);
    if (v > 0.02 && split === 0) E.dirBlur(c, draw, (isL ? -1 : 1) * 260 * v, 0, 5, 0.5); else draw(c);
  };
  side(0); side(1);
  // the seam: gold blade, flares on landing
  if (split < 1) {
    const land = E.env(lt, 11 / 60, 0.12);
    edgeLine(c, E, W / 2 + (lx + rx) / 2, 'coin', 10 + 16 * land, 1 - split);
    edgeLine(c, E, W / 2 + (lx + rx) / 2, 'cream', 3, 1 - split);
  }
}

function shotA(c, E, t, lt) {
  const { W, H } = E;
  c.fillStyle = E.col('night'); c.fillRect(-40, -40, W + 80, H + 80);
  panels(c, E, t, lt, 0);
  E.shockwave(c, W / 2, H / 2, E.seg(lt, 0.02, 0.5, 'expoOut'), { radius: 900, width: 40, color: 'pink', rings: 3, gap: 0.12 });
  confetti(c, E, t, T0 + 0.18, W / 2, H * 0.52, 21, 40);
  // TWO CATS. : elastic stamp 1.6 -> 1
  const s = (1.6 - 0.6 * E.elasticOut(E.seg(lt, 0.0, 0.55), 1, 0.35)) * (1 + 0.03 * E.seg(lt, 0.3, B));
  tape(c, E, W / 2, H * 0.5, 1180 * E.seg(lt, 0.0, 0.14, 'expoOut'), 200, 'night', 0.72);
  c.save(); c.translate(W / 2, H * 0.5); c.scale(s, s);
  headline(c, E, 'TWO CATS.', 0, 0, 150, { glow: { color: 'night', blur: 40 } });
  c.restore();
}

// ---------------------------------------------------------------- shot B: ONE HEIST. (h01 reveal)
function shotB(c, E, t, lt, sl) {
  const { W, H } = E;
  const z = 1.16 - 0.06 * E.seg(sl, 0, B, 'sineOut');
  clipCam(c, E, 'h01-plate-swap', play(sl, 1, 1.25, 19), { zoom: z, fx: 0.55, fy: 0.5 });
  panels(c, E, t, lt, E.seg(sl, 0, 0.26, 'expoIn') * 0.4 + E.seg(sl, 0.0, 0.3, 'expoOut') * 0.6);
  // text roll inside a band
  c.save(); c.beginPath(); c.rect(0, H * 0.5 - 130, W, 260); c.clip();
  const out = E.seg(sl, 0, 6 / 60, 'expoIn'), inn = E.seg(sl, 0.05, 0.32, (x) => E.backOut(x, 1.9));
  if (out < 1) headline(c, E, 'TWO CATS.', W / 2, H * 0.5 - 120 * out * 1.4, 150, { alpha: 1 - out * 0.6 });
  if (inn > 0) {
    c.save(); c.translate(W / 2, H * 0.5); const d = 1 + 0.04 * E.seg(sl, 0.3, B); c.scale(d, d);
    headline(c, E, 'ONE HEIST.', 0, 140 * (1 - inn), 150, { glow: { color: 'night', blur: 40 } });
    c.restore();
  }
  c.restore();
}

// ---------------------------------------------------------------- shot C: SWAP (h01 f19 -> f30)
const SW_A = [0.42, 0.58], SW_B = [0.81, 0.28], SW_C = [0.5, 0.45];
function swapCam(E, sl) {
  const w = E.snap(E.seg(sl, 0.03, 0.13));
  const n = sl < 0.16 ? 19 : Math.min(30, 19 + (sl - 0.16) * 30 * 1.2);
  const g = E.clamp01((n - 19) / 7);
  const f = sl < 0.16 ? E.lerpArr(SW_A, SW_B, w) : E.lerpArr(SW_B, SW_C, E.sineInOut(g));
  const zoom = 1.42 - 0.16 * E.seg(sl, 0.13, 0.6, 'sineOut');
  return { n, f, zoom, w };
}
function shotC(c, E, t, lt, sl) {
  const { W, H } = E;
  const cam = swapCam(E, sl);
  const v = E.vel((s) => (s < 0.16 ? E.lerp(SW_A[0], SW_B[0], E.snap(E.seg(s, 0.03, 0.13))) : SW_B[0]), sl) * W * cam.zoom;
  const map = clipCam(c, E, 'h01-plate-swap', ft(cam.n), { zoom: cam.zoom, fx: cam.f[0], fy: cam.f[1], blurDx: -v / 60 * 1.2 });
  // whip streaks
  const ws = E.envAD(sl, 0.08, 0.04, 0.08);
  if (ws > 0.01) E.speedLinesDir(c, t, { angle: Math.PI, count: 46, speed: 9000, length: [400, 1200], width: [2, 7], color: 'coin', alpha: 0.55 * ws, seed: 31 });
  // gold ring echoes: on the call (cat 1) and when the whip lands (cat 2)
  const [ax, ay] = map(...SW_A), [bx, by] = map(...(sl < 0.16 ? SW_B : E.lerpArr(SW_B, SW_C, E.sineInOut(E.clamp01((cam.n - 19) / 7)))));
  E.shockwave(c, ax, ay, E.seg(sl, 0, 0.22, 'expoOut'), { radius: 260, width: 14, color: 'coin', rings: 2, gap: 0.15 });
  E.shockwave(c, bx, by, E.seg(sl, 0.13, 0.46, 'expoOut'), { radius: 420, width: 22, color: 'coin', rings: 3, gap: 0.1 });
  // SWAP: letters 2-frame stagger, squash from the whip
  const vx = Math.abs(v);
  headline(c, E, 'SWAP', W / 2, H * 0.74, 260, {
    color: 'coin', drop: 'ember', tracking: 0.04, glow: { color: 'night', blur: 30 },
    perChar: ({ i, n }) => {
      const q = E.seg(sl, i * 2 / 60, i * 2 / 60 + 0.24, (x) => E.backOut(x, 2.2));
      if (q <= 0) return false;
      const st = Math.min(0.5, vx / 9000);
      return { y: (1 - q) * 160, scale: 0.4 + 0.6 * q, sx: 1 + st, sy: 1 - st * 0.5, rot: (i - (n - 1) / 2) * 0.03 * (1 - q) };
    },
  });
  swapChip(c, E, t, sl);
}
// little HUD chip: the two hero heads trade places on the swap
function swapChip(c, E, t, sl) {
  const q = E.seg(sl, 0, 0.18, (x) => E.backOut(x, 1.9)), sw = E.seg(sl, 0.04, 0.22, 'snap');
  const x0 = 110, y0 = 96, w = 300, h = 110;
  c.save(); c.translate(-(1 - q) * 420, 0);
  c.fillStyle = E.rgba('night', 0.78); c.strokeStyle = E.col('coin'); c.lineWidth = 4;
  c.beginPath(); c.roundRect(x0, y0, w, h, 55); c.fill(); c.stroke();
  const pa = [x0 + 70, y0 + h - 14], pb = [x0 + w - 70, y0 + h - 14];
  const arc = Math.sin(sw * Math.PI) * 34;
  E.drawSprite(c, 'albertino', 'IDLE', E.spriteFrame(t, 10), E.lerp(pa[0], pb[0], sw), pa[1] - arc, 3, { anchor: 'feet', flip: sw > 0.5 });
  E.drawSprite(c, 'oreo', 'IDLE', E.spriteFrame(t, 10), E.lerp(pb[0], pa[0], sw), pb[1] + arc * 0.3, 3, { anchor: 'feet', flip: sw < 0.5 });
  // arrows
  c.strokeStyle = E.col('coin'); c.lineWidth = 5; c.lineCap = 'round';
  c.beginPath(); c.moveTo(x0 + 128, y0 + 40); c.lineTo(x0 + 172, y0 + 40); c.lineTo(x0 + 162, y0 + 30); c.stroke();
  c.beginPath(); c.moveTo(x0 + 172, y0 + 70); c.lineTo(x0 + 128, y0 + 70); c.lineTo(x0 + 138, y0 + 80); c.stroke();
  c.restore();
}

// ---------------------------------------------------------------- shot D: SNEAK (h06 f60 -> f90)
function shotD(c, E, t, lt, sl) {
  const { W, H } = E;
  const z = 1.3 - 0.08 * E.seg(sl, 0, B + 0.2, 'sineOut');
  clipCam(c, E, 'h06-sneak-corridor', play(sl, 60, 2, 92), { zoom: z, fx: 0.47 + 0.03 * sl, fy: 0.47 });
  // stealth grade: cool, darker edges
  const rg = c.createRadialGradient(W / 2, H / 2, 200, W / 2, H / 2, 1100);
  rg.addColorStop(0, E.rgba('night', 0)); rg.addColorStop(1, E.rgba('night', 0.7));
  c.fillStyle = rg; c.fillRect(0, 0, W, H);
  // hollow word sliding past at 1.3x the footage (with a filled echo trailing)
  const x = W / 2 + 340 - 680 * E.seg(sl, 0, B + 0.12, (u) => E.lerp(u, E.sineInOut(u), 0.5));
  const ap = E.seg(sl, 0.02, 0.12);
  E.drawText(c, 'SNEAK', x + 70, H * 0.5 + 8, { size: 300, tracking: 0.12, color: 'grape', alpha: 0.35 * ap });
  E.drawText(c, 'SNEAK', x, H * 0.5, { size: 300, tracking: 0.12, stroke: 'night', strokeWidth: 20, strokeOnly: true, alpha: 0.55 * ap });
  E.drawText(c, 'SNEAK', x, H * 0.5, {
    size: 300, tracking: 0.12, stroke: 'lilac', strokeWidth: 8, strokeOnly: true, glow: { color: 'lavender', blur: 24 },
    perChar: ({ i }) => { const q = E.seg(sl, 0.02 + i * 0.025, 0.16 + i * 0.025, 'expoOut'); return q <= 0 ? false : { y: (1 - q) * -60, alpha: q }; },
  });
  // footstep dots under the word
  for (let k = 0; k < 6; k++) {
    const a = E.seg(sl, 0.06 + k * 0.05, 0.1 + k * 0.05);
    if (a <= 0) continue;
    E.drawImg(c, 'paw', x - 330 + k * 130, H * 0.5 + 200 + (k % 2) * 26, { w: 46, h: 46, alpha: a * 0.7, rot: Math.PI / 2 });
  }
}

// ---------------------------------------------------------------- shot E: MEOW (h02 f43 ->)
function shotE(c, E, t, lt, sl) {
  const { W, H } = E;
  const z = 1.0 + 0.15 * (1 - E.seg(sl, 0, 0.42, 'expoOut'));
  const map = clipCam(c, E, 'h02-meow-lure', play(sl, 43, 1.5, 70), { zoom: z, fx: 0.48, fy: 0.46 });
  const [cx, cy] = map(0.48, 0.46);
  for (let k = 0; k < 3; k++) {
    E.shockwave(c, cx, cy, E.seg(sl, k * 0.08, k * 0.08 + 0.5, 'expoOut'), { radius: 520 + k * 160, width: 26 - k * 6, color: k === 1 ? 'meowRing' : 'pink', rings: 1 });
  }
  const ring = E.seg(sl, 0, 0.5, 'expoOut');
  c.save(); c.translate(W / 2, H * 0.24); const d = 1 + 0.05 * E.seg(sl, 0.25, B); c.scale(d, d);
  headline(c, E, 'MEOW', 0, 0, 220, {
    color: 'pink', drop: 'plum', glow: { color: 'night', blur: 30 }, tracking: 0.05,
    perChar: ({ i, n, cx: ccx, width }) => {
      const q = E.elasticOut(E.seg(sl, i * 0.025, 0.45 + i * 0.025), 1, 0.32);
      const off = (ccx - width / 2) * 0.35 * (1 - q) * -1 + (ccx - width / 2) * 0.06 * Math.sin(ring * Math.PI);
      return { x: off, scale: 0.2 + 0.8 * q, y: (1 - q) * 30 };
    },
  });
  c.restore();
}

// ---------------------------------------------------------------- shot F: CRACK THE VAULT (h08 f16 ->)
function shotF(c, E, t, lt, sl) {
  const { W, H } = E;
  const punch = 0.08 * (1 - E.seg(sl, 0, 3 / 60, 'quadOut'));
  const z = 1.14 - 0.05 * E.seg(sl, 0, B + 0.1, 'sineOut') + punch;
  const map = clipCam(c, E, 'h08-vault-rescue', play(sl, 16, 1, 30), { zoom: z, fx: 0.5, fy: 0.5 });
  const [dx, dy] = map(0.47, 0.55);
  E.speedLines(c, t, { cx: dx, cy: dy, count: 60, inner: 160, outer: 1400, width: [2, 10], color: 'coin', alpha: 0.28 * (1 - E.seg(sl, 0.05, 0.4)) });
  // gold dust from the door
  for (const q of E.burst({ seed: 61, count: 46, t: sl, t0: 0, x: dx, y: dy, speed: [300, 1300], angle: [-Math.PI * 0.95, -Math.PI * 0.05], gravity: 1500, drag: 2, life: [0.35, 0.7], size: [6, 14] })) {
    c.save(); c.globalAlpha = q.alpha; c.fillStyle = E.col(q.i % 3 ? 'coin' : 'cream');
    const s = Math.round(q.size / 3) * 3; c.fillRect(Math.round(q.x - s / 2), Math.round(q.y - s / 2), s, s); c.restore();
  }
  E.shockwave(c, dx, dy, E.seg(sl, 0, 0.3, 'expoOut'), { radius: 340, width: 18, color: 'coin', rings: 2 });
  // type: CRACK THE / VAULT
  const q1 = E.seg(sl, 0, 0.22, 'punch'), q2 = E.seg(sl, 0.06, 0.3, 'punch');
  const d = 1 + 0.05 * E.seg(sl, 0.2, B);
  c.save(); c.translate(W / 2, H * 0.27); c.scale(d, d); c.translate(-W / 2, -H * 0.27);
  // round 2: kept inside the safe area (y >= 120 even at entry scale), lands as one readable phrase
  c.save(); c.translate(W / 2, H * 0.21); c.scale(1.35 - 0.35 * q1, 1.35 - 0.35 * q1); c.globalAlpha = E.clamp01(q1 * 3);
  headline(c, E, 'CRACK THE', 0, 0, 120, { glow: { color: 'night', blur: 30 } });
  c.restore();
  c.save(); c.translate(W / 2, H * 0.21 + 170); c.scale(1.8 - 0.8 * q2, 1.8 - 0.8 * q2); c.globalAlpha = E.clamp01(q2 * 3);
  headline(c, E, 'VAULT', 0, 0, 200, { color: 'coin', drop: 'ember', tracking: 0.06, glow: { color: 'coin', blur: 30 + 30 * E.env(sl, 0.06, 0.2) } });
  c.restore();
  c.restore();
}

// ---------------------------------------------------------------- shot G: COLLECT CATNIP (h05 f64 ->)
const PICKUPS = [0, (18 / 30) / 1.4]; // sl of the in-game pickups at f64 and f82
const FLY = 0.3;
function sprigs(E, sl) { // list of sprig flights {i, t0}
  const out = [];
  PICKUPS.forEach((p, k) => { for (let j = 0; j < 3; j++) out.push({ k, j, t0: p + j * 0.035 }); });
  return out;
}
function counterValue(E, lt) {
  const sl = lt - CUT[6];
  if (sl < 0) return 0;
  let n = 0; for (const f of sprigs(E, sl)) if (sl >= f.t0 + FLY) n++;
  return n;
}
function shotG(c, E, t, lt, sl) {
  const { W, H } = E;
  const rz = E.seg(sl, 0, B + 0.17, 'quadIn');
  const z = 1.0 + 0.35 * rz;
  const map = clipCam(c, E, 'h05-coin-run', play(sl, 64, 1.4, 90), { zoom: z, fx: 0.47, fy: 0.46 });
  E.speedLines(c, t, { count: 80, inner: 520 - 200 * rz, outer: 1500, width: [2, 9], color: 'cream', alpha: 0.08 + 0.3 * rz, seed: 71 });
  const [sx, sy] = map(0.47, 0.45);
  for (const f of sprigs(E, sl)) {
    const u = E.seg(sl, f.t0, f.t0 + FLY, 'cubicIn');
    if (u <= 0 || u >= 1) continue;
    const [px, py] = E.arcTo([sx + (f.j - 1) * 50, sy - 30], [COUNTER.x - 70, COUNTER.y], u, -260 - f.j * 80);
    E.drawImg(c, 'catnip', Math.round(px), Math.round(py), { w: 96, h: 96, pixel: true, rot: u * 4 * (f.j % 2 ? 1 : -1) });
    // sparkle trail
    for (let k = 1; k < 4; k++) {
      const u2 = Math.max(0, u - k * 0.06);
      const [tx, ty] = E.arcTo([sx + (f.j - 1) * 50, sy - 30], [COUNTER.x - 70, COUNTER.y], u2, -260 - f.j * 80);
      c.fillStyle = E.rgba('catnipGlow', 0.6 - k * 0.15); c.fillRect(Math.round(tx) - 6, Math.round(ty) - 6, 12, 12);
    }
  }
  for (const p of PICKUPS) E.shockwave(c, sx, sy, E.seg(sl, p, p + 0.3, 'expoOut'), { radius: 200, width: 12, color: 'catnipGlow', rings: 2 });
  const q = E.seg(sl, 0.05, 0.3, (x) => E.backOut(x, 1.9));
  headline(c, E, 'COLLECT CATNIP', W / 2, H * 0.8, 110, {
    color: 'catnipLight', stroke: 'catnipOutline', drop: 'catnipEmissive', glow: { color: 'night', blur: 30 },
    perChar: ({ i, n }) => { const k = E.seg(sl, 0.03 + i * 0.012, 0.25 + i * 0.012, (x) => E.backOut(x, 2)); return k <= 0 ? false : { y: (1 - k) * 90, scale: 0.6 + 0.4 * k }; },
  });
}

// Catnip counter (top right), alive from shot G through the slit.
function counter(c, E, t, lt) {
  const sl = lt - CUT[6];
  if (sl < 0) return;
  const q = E.seg(sl, 0, 0.22, (x) => E.backOut(x, 1.9));
  const n = counterValue(E, lt);
  let pop = 0; for (const f of sprigs(E, sl)) pop = Math.max(pop, E.env(sl, f.t0 + FLY, 0.1));
  const { x, y } = COUNTER;
  c.save(); c.translate(x + (1 - q) * 360, y); const s = 1 + 0.18 * pop; c.scale(s, s);
  c.fillStyle = E.rgba('night', 0.82); c.strokeStyle = E.col('catnip'); c.lineWidth = 5;
  c.beginPath(); c.roundRect(-140, -54, 260, 108, 54); c.fill(); c.stroke();
  E.drawImg(c, 'catnip', -76, -4, { w: 96, h: 96, pixel: true });
  E.drawText(c, `×${n}`, 40, 4, { font: PASSION, weight: 700, size: 78, color: pop > 0.5 ? 'catnipPale' : 'cream' });
  c.restore();
}

// ---------------------------------------------------------------- shot H: DON'T GET SPOTTED (h02 f104)
function shotH(c, E, t, lt, sl) {
  const { W, H } = E;
  const z = 1.18 + 0.1 * E.seg(sl, 0, 0.2, 'expoOut');
  clipCam(c, E, 'h02-spotted', play(sl, 104, 0.6, 107), { zoom: z, fx: 0.62, fy: 0.62 });
  c.save(); c.globalCompositeOperation = 'source-over';
  c.fillStyle = E.rgba('alertFlash', 0.4 * (0.6 + 0.4 * Math.cos(sl * 40))); c.fillRect(0, 0, W, H); c.restore();
  // hazard bars slide in top and bottom
  const hq = E.seg(sl, 0, 0.08, 'expoOut');
  for (const top of [true, false]) {
    const y = top ? -80 + 160 * hq - 80 : H - 80 * hq;
    c.save(); c.beginPath(); c.rect(0, y, W, 80); c.clip();
    c.fillStyle = E.col('night'); c.fillRect(0, y, W, 80);
    c.fillStyle = E.col('alertRed');
    const off = (sl * 600) % 120;
    for (let x = -200 + (top ? off : -off); x < W + 200; x += 120) { c.beginPath(); c.moveTo(x, y); c.lineTo(x + 60, y); c.lineTo(x + 20, y + 80); c.lineTo(x - 40, y + 80); c.fill(); }
    c.restore();
  }
  // the warning, flashing for 6 frames then steady
  const blink = sl < 0.1 ? ((Math.floor(sl * 60) % 2) ? 0.25 : 1) : 1;
  c.save(); c.globalAlpha = blink;
  const tw = E.measureText(c, "DON'T GET SPOTTED", { font: NUNITO, weight: 800, size: 64, tracking: 0.12 });
  c.fillStyle = E.col('night'); c.fillRect(W / 2 - tw / 2 - 40, H / 2 - 56, tw + 80, 112);
  E.drawText(c, "DON'T GET SPOTTED", W / 2, H / 2 + 2, { font: NUNITO, weight: 800, size: 64, tracking: 0.12, color: 'alertRed' });
  c.restore();
  headline(c, E, '!', W / 2, H / 2 - 330, 200 * (1.5 - 0.5 * E.seg(sl, 0, 0.12, 'backOut')), { color: 'alertRed', stroke: 'cream', strokeWidth: 10, drop: 'outline', alpha: blink });
}

// ---------------------------------------------------------------- recap flashes inside the slit
const RECAP = [
  ['h01-plate-swap', 24, 0.5, 0.45], ['h06-sneak-corridor', 80, 0.47, 0.47], ['h02-meow-lure', 50, 0.48, 0.46], ['h08-vault-rescue', 22, 0.5, 0.5],
];
const FILLS = [7.265625, 7.324219, 7.382813, 7.441406].map((x) => x - T0);

// ---------------------------------------------------------------- persistent chrome
// Round 2: the purpose, early. Lower-third kicker under TWO CATS / ONE HEIST (game copy:
// "Free a shelter cat." / "Free the shelter cat in a heist.").
function kicker(c, E, t, lt) {
  const a = 0.47, b = 1.85; // 4.22 -> 5.60 s
  if (lt < a - 0.02 || lt > b) return;
  const { W, H } = E;
  const q = E.seg(lt, a - 0.02, a + 0.14, (x) => E.backOut(x, 2)), out = E.seg(lt, b - 0.12, b, 'expoIn');
  const str = 'FREE THE SHELTER CAT';
  const o = { font: NUNITO, weight: 900, size: 40, tracking: 0.22, color: 'cream' };
  const tw = E.measureText(c, str, o) + 140;
  const y = H - 128 + 40 * out;
  c.save(); c.globalAlpha = 1 - out;
  c.translate(W / 2, y); c.scale(q, q);
  c.fillStyle = E.rgba('outline', 0.9); c.beginPath(); c.roundRect(-tw / 2 + 5, -34 + 7, tw, 68, 34); c.fill();
  c.fillStyle = E.col('pink'); c.beginPath(); c.roundRect(-tw / 2, -34, tw, 68, 34); c.fill();
  E.drawImg(c, 'heart', -tw / 2 + 42, 0, { w: 40 * (1 + 0.15 * E.cueEnv(t, 'kick', 0.1)), pixel: true });
  E.drawText(c, str, 22, 3, { ...o, color: 'outline' });
  c.restore();
}

function chrome(c, E, t, lt) {
  const { W, H } = E;
  // viewfinder corners, breathing on kicks
  const k = E.cueEnv(t, 'kick', 0.12);
  const m = 46 - 10 * k, L = 70;
  c.save(); c.strokeStyle = E.rgba('cream', 0.55 + 0.35 * k); c.lineWidth = 4;
  for (const [x, y, sx, sy] of [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]]) {
    c.beginPath(); c.moveTo(x, y + sy * L); c.lineTo(x, y); c.lineTo(x + sx * L, y); c.stroke();
  }
  // 8-pip beat rail, bottom centre
  const bi = Math.floor((lt + 1e-6) / B);
  for (let i = 0; i < 8; i++) {
    const on = i <= bi, cur = i === bi;
    const x = W / 2 - 7 * 26 + i * 52, y = H - 52;
    c.fillStyle = cur ? E.col('coin') : on ? E.rgba('cream', 0.85) : E.rgba('cream', 0.22);
    const s = cur ? 16 + 8 * E.env(lt, bi * B, 0.12) : 12;
    c.fillRect(Math.round(x - s / 2), Math.round(y - s / 2), s, s);
  }
  c.restore();
}

// ambient foreground sprigs drifting (depth layer), only over gameplay shots
function driftSprigs(c, E, t, lt, alpha) {
  if (alpha <= 0) return;
  const { W, H } = E;
  for (let i = 0; i < 7; i++) {
    const r = (k) => E.rand('s2drift', i, k);
    const sp = 140 + r(0) * 220;
    const x = E.mod(r(1) * W - lt * sp * (r(2) < 0.5 ? 1 : -1), W + 200) - 100;
    const y = E.mod(r(3) * H - lt * 60, H + 200) - 100;
    const sz = [48, 96, 144][Math.floor(r(4) * 3)];
    E.drawImg(c, 'catnip', Math.round(x), Math.round(y), { w: sz, h: sz, pixel: true, alpha: alpha * (sz > 100 ? 0.28 : 0.45), rot: Math.sin(lt * 2 + i) * 0.4 });
  }
}

function content(c, E, t, lt) {
  const { W, H } = E;
  const s = E.shot(lt, CUT);
  const sl = s.lt;
  switch (s.i) {
    case 0: shotA(c, E, t, lt); break;
    case 1: shotB(c, E, t, lt, sl); break;
    case 2: shotC(c, E, t, lt, sl); break;
    case 3: {
      // 12-degree wipe from SWAP into SNEAK, lavender edge with smear
      const p = E.seg(sl, 0, 9 / 60, 'expoOut');
      const ex = E.lerp(W + 300, -300, p);
      if (p < 1) { c.save(); c.beginPath(); leftOf(c, E, ex); c.clip(); shotC(c, E, t, lt, sl + B); c.restore(); }
      c.save(); c.beginPath(); rightOf(c, E, ex); c.clip(); shotD(c, E, t, lt, sl); c.restore();
      if (p < 1) { E.dirBlur(c, (cc) => edgeLine(cc, E, ex, 'lavender', 14), 160, 0, 5, 0.6); edgeLine(c, E, ex, 'cream', 4); }
      break;
    }
    case 4: shotE(c, E, t, lt, sl); break;
    case 5: shotF(c, E, t, lt, sl); break;
    case 6: shotG(c, E, t, lt, sl); break;
    default: {
      // shot H, and from SLIT0 the recap flashes on the snare fills
      let fi = -1; for (let i = 0; i < FILLS.length; i++) if (lt >= FILLS[i]) fi = i;
      if (fi < 0) shotH(c, E, t, lt, sl);
      else {
        const [name, n, fx, fy] = RECAP[fi], fl = lt - FILLS[fi];
        clipCam(c, E, name, ft(n + fl * 30), { zoom: 1.25 + 0.2 * fl * 10, fx, fy });
        c.fillStyle = E.rgba('night', 0.25); c.fillRect(0, 0, W, H);
        if (fl < 1 / 60) { c.fillStyle = E.rgba('cream', 0.3); c.fillRect(0, 0, W, H); }
        E.rgbSplit(c, 10 * (1 - E.seg(fl, 0, 0.05)), { opaque: true });
        headline(c, E, ['SWAP', 'SNEAK', 'MEOW', 'VAULT'][fi], W / 2, H / 2, 160, { color: ['coin', 'cream', 'pink', 'coin'][fi], alpha: 0.9 });
      }
    }
  }
  driftSprigs(c, E, t, lt, s.i >= 1 && s.i <= 6 ? 1 : 0);
  counter(c, E, t, lt);
  kicker(c, E, t, lt);
  chrome(c, E, t, lt);
}

async function loadFonts() {
  const list = [
    ['Passion One', 'assets/sprites/fonts/passion-one-latin-700-normal.woff2', { weight: '700' }],
    ['Passion One', 'assets/sprites/fonts/passion-one-latin-ext-700-normal.woff2', { weight: '700', unicodeRange: 'U+0100-024F, U+1E00-1EFF' }],
    ['Nunito', 'assets/sprites/fonts/nunito-latin-wght-normal.woff2', { weight: '200 1000' }],
    ['Nunito', 'assets/sprites/fonts/nunito-latin-ext-wght-normal.woff2', { weight: '200 1000', unicodeRange: 'U+0100-024F, U+1E00-1EFF' }],
  ];
  await Promise.all(list.map(async ([fam, url, d]) => {
    try { const f = new FontFace(fam, `url(${url})`, d); await f.load(); document.fonts.add(f); } catch (e) { /* engine falls back */ }
  }));
  await document.fonts.ready;
}

export default {
  start: 3.75, end: 7.5,
  async init(E) { await loadFonts(); },
  draw(ctx, t, lt, E) {
    const { W, H } = E;
    if (lt < SLIT0) { content(ctx, E, t, lt); }
    else {
      // the slit: a band leaning 12 degrees off vertical (same slant as the s2 seam and the s3
      // wipe), closing onto a gold line at 7.50 where s3 reopens it
      const p = E.seg(lt, SLIT0, 3.7333);
      const h = E.keys(lt, [[SLIT0, W * 1.25], [3.6, W * 0.5, 'sineIn'], [3.7333, 8, 'cubicIn']]);
      const cx = W / 2, cy = H / 2, ux = Math.sin(SLANT), uy = -Math.cos(SLANT), nx = Math.cos(SLANT), ny = Math.sin(SLANT), L = 1400;
      ctx.fillStyle = E.col('night'); ctx.fillRect(-40, -40, W + 80, H + 80);
      E.speedLinesDir(ctx, t, { angle: Math.atan2(uy, ux), count: 40, speed: 6000, length: [300, 900], width: [2, 5], color: 'lavender', alpha: 0.25 * p, seed: 81 });
      const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [cx + ux * L * a + nx * (h / 2) * b, cy + uy * L * a + ny * (h / 2) * b]);
      ctx.save(); ctx.beginPath(); E.path.poly(ctx, pts); ctx.clip();
      E.camera(ctx, { zoom: 1 + 0.25 * p }, (c) => content(c, E, t, lt));
      ctx.restore();
      for (const sgn of [-1, 1]) {
        const ox = nx * (h / 2) * sgn, oy = ny * (h / 2) * sgn;
        ctx.save(); ctx.strokeStyle = E.col('coin'); ctx.lineWidth = 6 + 6 * p; ctx.shadowColor = E.col('coin'); ctx.shadowBlur = 30;
        ctx.beginPath(); ctx.moveTo(cx - ux * L + ox, cy - uy * L + oy); ctx.lineTo(cx + ux * L + ox, cy + uy * L + oy); ctx.stroke(); ctx.restore();
      }
      // flare along the slit at 7.45
      const fl = 0.65 * E.envAD(lt, 3.70, 0.06, 0.1);
      if (fl > 0.01) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(cx, cy, 10, cx, cy, 900);
        g.addColorStop(0, E.rgba('rescueFlash', 0.9 * fl)); g.addColorStop(0.3, E.rgba('coin', 0.45 * fl)); g.addColorStop(1, E.rgba('pink', 0));
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.restore();
      }
    }
    // match-cut handoff from s1: zoom blur out of the centre (where the eyes were) for 3 frames
    if (lt < 3 / 60) E.zoomBlur(ctx, { cx: W / 2, cy: H / 2, strength: 0.3 * (1 - lt * 20), samples: 6 });
    E.lightLeak(ctx, t, { seed: 22, intensity: 0.1 + 0.25 * E.env(t, 3.75, 0.4) + 0.12 * E.env(t, 6.09375, 0.3), colors: ['#ff7aa2', '#ffc93c'] });
  },
  fx(t, lt, E) {
    const kick = E.cueEnv(t, 'kick', 0.1);
    const clap = E.cueEnv(t, 'snare', 0.08);
    const drop = E.env(t, 3.75, 0.18);
    const meow = E.env(t, 5.625, 0.15), clunk = E.env(t, 6.09375, 0.1), alert = E.env(t, 7.03125, 0.12);
    const whip = E.envAD(lt, 2 * B + 0.08, 0.04, 0.06);
    const mb = lt < 0.2 || (lt > 2 * B && lt < 2 * B + 0.16) || (lt > 3 * B && lt < 3 * B + 0.15) || lt > 3.55 ? 4 : 0;
    return {
      shake: 20 * drop + 4 * meow + 7 * clunk + 8 * alert,
      zoom: 1 + 0.015 * kick,
      aberration: 3 * clap + 8 * drop + 6 * whip + 6 * alert,
      flash: lt < 1 / 120 ? 1 : 0.3 * E.env(lt, 1 / 60, 0.04),
      flashColor: '#ffffff',
      glitch: Math.max(0.55 * E.env(t, 7.03125, 0.08), lt > 3.45 ? 0.3 * E.cueEnv(t, 'snare', 0.04) : 0),
      motionBlur: mb,
      grain: 0.035,
    };
  },
};
