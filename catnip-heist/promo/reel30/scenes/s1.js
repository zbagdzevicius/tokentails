// s1 — COLD OPEN: "security boot" (bars 1-2, 0.000-3.750 s)
// A Kibble Corp CCTV wall: the cats are the intruders. Boot line -> 4-cam wall -> dive into the HQ
// feed -> MOTION DETECTED -> red alert -> blackout, a cat's eyes blink closer on the snare fill.
// Pure function of t. Every time below is a cue from assets/audio/cues.json.

const T = {
  boot: 0, rec1: 0.28, rec2: 0.40, wall: 0.46875, sweep1: 0.703125, beat2: 0.9375, hop: 1.40625,
  pull: 1.640625, dive: 1.758, online: 1.875, sweep2: 2.34375, alert1: 2.8125, alert2: 3.046875,
  dark: 3.28125, collapse: 3.75 - 2 / 60, end: 3.75,
};
const GLITCHES = [[0.46875, 0.09], [0.585938, 0.05], [0.820313, 0.07], [1.40625, 0.05], [2.578125, 0.06], [2.929688, 0.08]];
const FILLS = [3.28125, 3.398438, 3.515625, 3.574219, 3.632813, 3.691406];
const EYE_SCALE = [16, 22, 30, 40, 54, 72]; // round 3: the eyes fill the frame by 3.69
const NUNITO = '"Nunito", "Helvetica Neue", Arial, sans-serif';
const PASSION = '"Passion One", "Arial Black", sans-serif';
const MONO = '"SF Mono", Menlo, Monaco, monospace';
const TEAL = '#39e6b4';

// 4-cam wall. Feeds per board: TL h08-establish, TR h05-coin-run, BL h06-sneak-corridor, BR h02-meow-lure.
const CAMS = [
  { clip: 'h08-establish', f0: 1, zone: 'KIBBLE CORP HQ', fx: 0.45, fy: 0.5 },
  { clip: 'h05-coin-run', f0: 1, hop: 70, zone: 'WATCHTOWER YARD', fx: 0.5, fy: 0.5 },
  { clip: 'h06-sneak-corridor', f0: 40, hop: 66, zone: 'CONVEYOR HALLS', fx: 0.5, fy: 0.45 },
  { clip: 'h02-meow-lure', f0: 1, hop: 43, zone: 'KENNEL ROW', fx: 0.55, fy: 0.5 },
];
const WALL = { m: 28, gap: 16 };
WALL.cw = (1920 - WALL.m * 2 - WALL.gap) / 2;
WALL.ch = (1080 - WALL.m * 2 - WALL.gap) / 2;
const camRect = (i) => ({ x: WALL.m + (i % 2) * (WALL.cw + WALL.gap), y: WALL.m + (i >> 1) * (WALL.ch + WALL.gap), w: WALL.cw, h: WALL.ch });

// h08-establish source positions (1920x1080 clip px), measured on files 40/47/54/61/68
const CAT_KEYS = [[40, 650, 595], [47, 675, 572], [54, 705, 551], [61, 745, 528], [68, 778, 505], [76, 812, 482]];
const DOGS = [ // [x40, y40, x68, y68]
  [790, 125, 765, 92], [850, 264, 840, 240], [640, 742, 618, 740], [765, 785, 600, 770], [1838, 662, 1832, 622],
];
// h02-spotted file 104: red cone centre and the guard that spotted the cat
const CONE = { x: 1100, y: 790 }, GUARD = { x: 1330, y: 800 };

let noiseTex = [];

// ---------------------------------------------------------------------------------------------
// local helpers
// ---------------------------------------------------------------------------------------------
function brackets(c, x, y, w, h, len, lw, color, alpha = 1) {
  c.save(); c.globalAlpha *= alpha; c.strokeStyle = color; c.lineWidth = lw; c.lineCap = 'square';
  const l = Math.min(len, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x, y + l); c.lineTo(x, y); c.lineTo(x + l, y);
  c.moveTo(x + w - l, y); c.lineTo(x + w, y); c.lineTo(x + w, y + l);
  c.moveTo(x + w, y + h - l); c.lineTo(x + w, y + h); c.lineTo(x + w - l, y + h);
  c.moveTo(x + l, y + h); c.lineTo(x, y + h); c.lineTo(x, y + h - l);
  c.stroke(); c.restore();
}
const small = (E, c, str, x, y, o = {}) => E.drawText(c, str, x, y, { font: NUNITO, weight: '800', size: 22, tracking: 0.16, align: 'left', color: 'cream', ...o });
const inGlitch = (t) => GLITCHES.some(([a, d]) => t >= a && t < a + d);
const glitchIdx = (t) => GLITCHES.findIndex(([a, d]) => t >= a && t < a + d);

// security-cam grade on a rect: partial desaturation + teal phosphor tint + lifted blacks
function grade(c, E, r, amt = 1) {
  c.save();
  c.beginPath(); c.rect(r.x, r.y, r.w, r.h); c.clip();
  c.globalCompositeOperation = 'saturation'; c.fillStyle = `rgba(128,128,128,${0.42 * amt})`; c.fillRect(r.x, r.y, r.w, r.h);
  c.globalCompositeOperation = 'soft-light'; c.fillStyle = E.rgba(TEAL, 0.55 * amt); c.fillRect(r.x, r.y, r.w, r.h);
  c.globalCompositeOperation = 'screen'; c.fillStyle = E.rgba('#0d3a33', 0.35 * amt); c.fillRect(r.x, r.y, r.w, r.h);
  c.restore();
}
function snow(c, E, r, alpha, key = 0) {
  if (alpha <= 0 || !noiseTex.length) return;
  const tex = noiseTex[E.mod(E.frame + key * 3, noiseTex.length)];
  c.save(); c.beginPath(); c.rect(r.x, r.y, r.w, r.h); c.clip();
  c.globalAlpha = alpha; c.imageSmoothingEnabled = false;
  const ox = E.rand('snx', E.frame, key) * 160, oy = E.rand('sny', E.frame, key) * 90;
  c.drawImage(tex, ox, oy, 320, 180, r.x, r.y, r.w, r.h);
  c.restore();
}
// source crop around a point for an exact zoom; returns crop + mapper from clip px to screen px
function camCrop(cx, cy, z, W = 1920, H = 1080) {
  const w = 1 / z, h = 1 / z;
  const x = Math.min(Math.max(cx / W - w / 2, 0), 1 - w);
  const y = Math.min(Math.max(cy / H - h / 2, 0), 1 - h);
  return { crop: [x, y, w, h], map: (px, py) => [(px / W - x) / w * W, (py / H - y) / h * H] };
}
function catAt(E, file) {
  const k = CAT_KEYS;
  if (file <= k[0][0]) return [k[0][1], k[0][2]];
  for (let i = 0; i < k.length - 1; i++) {
    if (file <= k[i + 1][0]) { const u = (file - k[i][0]) / (k[i + 1][0] - k[i][0]); return [E.lerp(k[i][1], k[i + 1][1], u), E.lerp(k[i][2], k[i + 1][2], u)]; }
  }
  return [k[k.length - 1][1], k[k.length - 1][2]];
}
function recDot(c, E, t, x, y, r = 11) {
  // blinks twice on the rec beeps, then a steady 2 Hz blink
  let s = 0;
  if (t >= T.rec1) {
    const p1 = E.punch(E.seg(t, T.rec1, T.rec1 + 0.08)), p2 = E.punch(E.seg(t, T.rec2, T.rec2 + 0.08));
    s = t < T.rec2 ? p1 * (t < T.rec1 + 0.07 ? 1 : 0.35) : p2;
    if (t > T.rec2 + 0.12) s = E.fract((t - T.rec2) * 2) < 0.62 ? 1 : 0.25;
  }
  if (s <= 0) return 0;
  c.save();
  const g = c.createRadialGradient(x, y, 0, x, y, r * 3.2);
  g.addColorStop(0, E.rgba('alertRed', 0.55 * s)); g.addColorStop(1, E.rgba('alertRed', 0));
  c.fillStyle = g; c.fillRect(x - r * 4, y - r * 4, r * 8, r * 8);
  c.fillStyle = E.col('alertRed'); c.globalAlpha = Math.min(1, 0.35 + s);
  c.beginPath(); c.arc(x, y, r * Math.min(1.25, Math.max(0.4, s)), 0, E.TAU); c.fill();
  c.restore();
  return s;
}
const tcode = (E, t) => E.timecode(Math.max(0, t - T.rec1) + 23 * 3600 + 47 * 60 + 12.4);

// ---------------------------------------------------------------------------------------------
// A. boot (0 - 0.469): CRT line snaps open onto signal acquisition
// ---------------------------------------------------------------------------------------------
function drawBoot(c, E, t) {
  const { W, H } = E;
  c.fillStyle = '#05030a'; c.fillRect(0, 0, W, H);
  // round 3: 6 frames of noise, then the 4-cam grid snaps in (frame 6 -> 8) under the reticle
  const SNAP = 6 / 60;
  if (t < SNAP) snow(c, E, { x: 0, y: 0, w: W, h: H }, 0.5);
  else {
    const sp = E.seg(t, SNAP, SNAP + 2 / 60, 'expoOut');
    const sc = E.lerp(1.12, 1, sp);
    c.save(); c.translate(960, 540); c.scale(sc, sc); c.translate(-960, -540);
    for (let i = 0; i < 4; i++) {
      const r = camRect(i), cam = CAMS[i];
      c.save(); c.fillStyle = '#07040c'; c.fillRect(r.x - 6, r.y - 6, r.w + 12, r.h + 12);
      c.beginPath(); c.rect(r.x, r.y, r.w, r.h); c.clip();
      E.drawClip(c, cam.clip, E.clipFrameTime(cam.clip, cam.f0) + Math.max(0, t - SNAP), r.x, r.y, r.w, r.h, { fx: cam.fx, fy: cam.fy, zoom: 1.02 });
      grade(c, E, r, 1);
      c.fillStyle = 'rgba(4,2,8,0.35)'; c.fillRect(r.x, r.y, r.w, r.h);
      c.restore();
      if (t < SNAP + 1 / 60) { c.fillStyle = 'rgba(234,255,246,0.8)'; c.fillRect(r.x, r.y, r.w, r.h); }
    }
    c.restore();
    snow(c, E, { x: 0, y: 0, w: W, h: H }, E.lerp(0.22, 0.08, E.seg(t, SNAP, T.wall)));
  }
  // calibration reticle (drifts, draws on)
  const draw = E.seg(t, 0.05, 0.3, 'expoOut');
  const out = E.seg(t, T.wall - 0.06, T.wall, 'expoIn');
  const cx = 960 + 6 * E.perlin1(t * 2, 3), cy = 540;
  c.save(); c.globalAlpha = (1 - out); c.strokeStyle = E.col('mint'); c.lineWidth = 3; c.shadowColor = E.rgba('mint', 0.9); c.shadowBlur = 16;
  c.beginPath(); c.arc(cx, cy, 150 + 30 * (1 - draw), -Math.PI / 2, -Math.PI / 2 + E.TAU * draw); c.stroke();
  c.lineWidth = 1.5; c.globalAlpha *= 0.6;
  c.beginPath(); c.arc(cx, cy, 230, -Math.PI / 2 + t * 3, -Math.PI / 2 + t * 3 + E.TAU * 0.7 * draw); c.stroke();
  c.beginPath();
  const L = 520 * draw;
  c.moveTo(cx - L, cy); c.lineTo(cx - 40, cy); c.moveTo(cx + 40, cy); c.lineTo(cx + L, cy);
  c.moveTo(cx, cy - L * 0.55); c.lineTo(cx, cy - 40); c.moveTo(cx, cy + 40); c.lineTo(cx, cy + L * 0.55);
  c.stroke();
  for (let i = -10; i <= 10; i++) { // ruler ticks
    if (Math.abs(i) / 10 > draw) continue;
    const x = cx + i * 48, h = i % 5 === 0 ? 18 : 9;
    c.moveTo(x, cy - h); c.lineTo(x, cy + h);
  }
  c.stroke(); c.restore();
  // rec-beep pings: a ring pulse from the reticle on each beep
  for (const h of [T.rec1, T.rec2]) E.shockwave(c, cx, cy, E.seg(t, h, h + 0.3), { radius: 420, width: 6, color: 'mint', rings: 2, gap: 0.12 });
  // boot progress: 4 segments light on the 16ths
  const bw = 66, gap = 10, bx = 960 - (4 * bw + 3 * gap) / 2, by = 820;
  for (let i = 0; i < 4; i++) {
    const on = E.seg(t, 0.117 * i + 0.02, 0.117 * i + 0.09, 'backOut');
    c.save(); c.globalAlpha = 1 - out;
    c.strokeStyle = E.rgba('mint', 0.5); c.lineWidth = 2; c.strokeRect(bx + i * (bw + gap), by, bw, 16);
    if (on > 0) {
      c.fillStyle = E.col(i === 3 ? 'alertRed' : 'mint');
      const hh = 16 * Math.min(1.3, on);
      c.fillRect(bx + i * (bw + gap) + 3, by + 8 - hh / 2 + 0, (bw - 6) * Math.min(1, on), hh - 6 > 0 ? hh - 6 : 0);
    }
    c.restore();
  }
}
function crtOpen(c, E, t) {
  // horizontal line snaps open over 7 frames: everything outside the band goes black
  const p = E.seg(t, 0, 7 / 60, 'expoOut');
  const { W, H } = E;
  const hh = Math.max(3, H * E.lerp(0.004, 1, p));
  const y0 = (H - hh) / 2;
  c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = '#000';
  c.fillRect(0, 0, W, y0); c.fillRect(0, y0 + hh, W, H - y0 - hh);
  // white bloom along the edges of the opening band
  const a = 1 - E.seg(t, 0.02, 0.22, 'quadOut');
  if (a > 0) {
    c.globalCompositeOperation = 'lighter';
    for (const yy of p < 0.98 ? [y0, y0 + hh] : [H / 2]) {
      const g = c.createLinearGradient(0, yy - 90, 0, yy + 90);
      g.addColorStop(0, 'rgba(200,255,235,0)'); g.addColorStop(0.5, `rgba(220,255,240,${0.9 * a})`); g.addColorStop(1, 'rgba(200,255,235,0)');
      c.fillStyle = g; c.fillRect(0, yy - 90, W, 180);
    }
    c.fillStyle = `rgba(255,255,255,${a})`; c.fillRect(0, H / 2 - 2, W, 4);
  }
  c.restore();
}

// ---------------------------------------------------------------------------------------------
// B. the wall (0.469 - 1.875)
// ---------------------------------------------------------------------------------------------
function camTime(E, i, t) {
  const cam = CAMS[i];
  if (i === 0) return E.clipFrameTime(cam.clip, 1) + E.clamp01((t - T.wall) / (T.online - T.wall)) * E.clipFrameTime(cam.clip, 40);
  const f0 = t >= T.hop ? cam.hop : cam.f0;
  const tl = t >= T.hop ? t - T.hop : t - T.wall;
  return E.clipFrameTime(cam.clip, f0) + Math.max(0, tl);
}
function drawMonitor(c, E, t, i, r, { reveal = null } = {}) {
  const cam = CAMS[i];
  const on = T.wall + i * (2 / 60);
  const dt = t - on;
  // bezel
  c.save();
  c.fillStyle = '#07040c'; c.fillRect(r.x - 6, r.y - 6, r.w + 12, r.h + 12);
  c.strokeStyle = '#2b2140'; c.lineWidth = 2; c.strokeRect(r.x - 5, r.y - 5, r.w + 10, r.h + 10);
  c.beginPath(); c.rect(r.x, r.y, r.w, r.h); c.clip();
  c.fillStyle = '#040208'; c.fillRect(r.x, r.y, r.w, r.h);
  if (dt < 0) { snow(c, E, r, 0.12, i); c.restore(); return; }
  // vertical-hold roll settling after power-on, and channel-hop roll at T.hop
  const hopDt = t - T.hop;
  const roll = (1 - E.expoOut(E.seg(dt, 0, 0.22))) * r.h * 0.35 + (hopDt >= 0 ? (1 - E.expoOut(E.seg(hopDt, 0, 0.18))) * r.h * 0.5 * (i % 2 ? 1 : -1) : 0);
  const drift = 1.02 + 0.03 * E.seg(t, T.wall, T.online, 'sineInOut') + 0.012 * E.perlin1(t * 1.3, i);
  const ct = camTime(E, i, t);
  const drawFeed = (cc, yoff) => E.drawClip(cc, cam.clip, ct, r.x, r.y + yoff, r.w, r.h, { fx: cam.fx, fy: cam.fy, zoom: i === 0 ? 1.08 : drift });
  drawFeed(c, roll); if (roll > 1) drawFeed(c, roll - r.h);
  grade(c, E, r, 1);
  // scan reveal: true colour + glow just behind the sweep line
  if (reveal) reveal(c, r, (cc) => { drawFeed(cc, roll); });
  // power-on: 1 white frame, 2 frames of snow, then the picture blooms down
  if (dt < 1 / 60) { c.fillStyle = '#eafff6'; c.fillRect(r.x, r.y, r.w, r.h); }
  else if (dt < 3 / 60) snow(c, E, r, 0.85, i);
  else { const b = E.env(dt, 3 / 60, 0.12); if (b > 0.01) { c.fillStyle = `rgba(220,255,240,${0.45 * b})`; c.fillRect(r.x, r.y, r.w, r.h); } }
  if (hopDt >= 0 && hopDt < 3 / 60) snow(c, E, r, 0.7, i + 9);
  snow(c, E, r, 0.06, i + 4);
  // HUD
  const k = E.seg(dt, 0.05, 0.25, 'expoOut');
  small(E, c, `CAM 0${i + 1}`, r.x + 22, r.y + 30, { size: 24, color: 'mint', alpha: k });
  small(E, c, cam.zone, r.x + 22, r.y + 58, { size: 16, color: 'mint', alpha: 0.7 * k, tracking: 0.22 });
  E.drawText(c, tcode(E, t), r.x + r.w - 22, r.y + r.h - 24, { font: MONO, weight: '600', size: 18, align: 'right', color: 'mint', alpha: 0.85 * k, tracking: 0.08 });
  const s = recDot(c, E, t, r.x + r.w - 92, r.y + 30, 7);
  if (s > 0) small(E, c, 'REC', r.x + r.w - 76, r.y + 31, { size: 18, color: 'alertRed', alpha: Math.min(1, 0.5 + s) * k });
  brackets(c, r.x + 12, r.y + 12, r.w - 24, r.h - 24, 34, 2, E.rgba('mint', 0.55 * k));
  c.restore();
  // alarm border pulse on beat 2
  const al = E.env(t, T.beat2 + i * 0.02, 0.14);
  if (al > 0.01) { c.save(); c.strokeStyle = E.rgba('alertRed', al); c.lineWidth = 6; c.strokeRect(r.x - 3, r.y - 3, r.w + 6, r.h + 6); c.restore(); }
}
function drawTitleBar(c, E, t) {
  const p = E.seg(t, T.wall, T.wall + 6 / 60); // round 3: resolves in 0.1 s
  if (t < T.wall) return;
  const str = 'KIBBLE CORP // RESTRICTED';
  const txt = E.scramble(str, p, 7, 'ABCDEFGHJKLMNOPRSTUVWXYZ0123456789/#');
  const stamp = E.seg(t, T.beat2, T.beat2 + 0.5);
  const bh = 104 + 26 * (1 - E.elasticOut(stamp, 1, 0.35)) * (t >= T.beat2 ? 1 : 0) - (t < T.wall + 0.1 ? 104 * (1 - E.expoOut(E.seg(t, T.wall, T.wall + 0.1))) : 0);
  const sc = t >= T.beat2 ? 1 + 0.14 * (1 - E.elasticOut(stamp, 1, 0.35)) : 1;
  const drift = 1 + 0.015 * E.seg(t, T.wall, T.online);
  const w = 1080 * drift;
  c.save();
  c.translate(960, 540); c.scale(sc * drift, sc * drift);
  c.fillStyle = 'rgba(4,2,8,0.92)'; c.fillRect(-w / 2, -bh / 2, w, bh);
  // hazard stripes at both ends, scrolling
  c.save(); c.beginPath(); c.rect(-w / 2, -bh / 2, 70, bh); c.rect(w / 2 - 70, -bh / 2, 70, bh); c.clip();
  c.fillStyle = E.col('alertRed');
  const off = E.mod(t * 120, 40);
  for (let x = -w / 2 - 80; x < w / 2 + 80; x += 40) { c.beginPath(); c.moveTo(x + off, -bh / 2); c.lineTo(x + off + 20, -bh / 2); c.lineTo(x + off - 20 + 20 - bh * 0.4, bh / 2); c.lineTo(x + off - bh * 0.4 - 20, bh / 2); c.closePath(); c.fill(); }
  c.restore();
  c.fillStyle = E.col('alertRed'); c.fillRect(-w / 2, -bh / 2, w, 4); c.fillRect(-w / 2, bh / 2 - 4, w, 4);
  const flick = inGlitch(t) ? 0.6 + 0.4 * E.rand('tf', E.frame) : 1;
  E.drawText(c, txt, 0, 4, { size: 64, color: 'alertRed', tracking: 0.06, alpha: flick, glow: { color: E.rgba('alertRed', 0.8), blur: 24 } });
  c.restore();
}
function sweepReveal(E, t, lineY, colorTint) {
  // returns a reveal fn for drawMonitor: true colour in a band trailing the sweep line
  return (c, r, drawFeed) => {
    const top = lineY - 300, bot = lineY + 8;
    if (bot < r.y || top > r.y + r.h) return;
    E.fadeMask(c, (lc) => {
      lc.save(); lc.beginPath(); lc.rect(r.x, r.y, r.w, r.h); lc.clip();
      drawFeed(lc);
      lc.globalCompositeOperation = 'overlay'; lc.fillStyle = E.rgba(colorTint, 0.55); lc.fillRect(r.x, r.y, r.w, r.h);
      lc.restore();
    }, { x0: 0, y0: bot, x1: 0, y1: top, stops: [[0, 0], [0.03, 1], [1, 0]] });
  };
}
function drawSweepLine(c, E, y, color, alpha = 1, invert = false) {
  c.save(); c.setTransform(1, 0, 0, 1, 0, 0);
  if (invert) { c.globalCompositeOperation = 'difference'; c.fillStyle = `rgba(255,255,255,${0.9 * alpha})`; c.fillRect(0, y - 26, E.W, 52); c.globalCompositeOperation = 'source-over'; }
  c.globalCompositeOperation = 'lighter';
  const g = c.createLinearGradient(0, y - 60, 0, y + 60);
  g.addColorStop(0, E.rgba(color, 0)); g.addColorStop(0.5, E.rgba(color, 0.55 * alpha)); g.addColorStop(1, E.rgba(color, 0));
  c.fillStyle = g; c.fillRect(0, y - 60, E.W, 120);
  c.fillStyle = E.rgba('#ffffff', 0.9 * alpha); c.fillRect(0, y - 1.5, E.W, 3);
  c.globalCompositeOperation = 'source-over';
  // edge ticks riding the line
  c.fillStyle = E.rgba(color, alpha);
  c.fillRect(0, y - 10, 26, 20); c.fillRect(E.W - 26, y - 10, 26, 20);
  E.drawText(c, String(Math.round(Math.max(0, y))).padStart(4, '0'), 40, y - 22, { font: MONO, weight: '700', size: 16, align: 'left', color, alpha });
  c.restore();
}
function drawWall(c, E, t) {
  const { W, H } = E;
  c.fillStyle = '#030106'; c.fillRect(0, 0, W, H);
  // wall camera: slow push, anticipation pull-back, then a dive into CAM 01
  const push = 1 + 0.05 * E.seg(t, T.wall, T.pull, 'sineInOut'); // round 2: 1.00 -> 1.05 grid push
  const pull = E.seg(t, T.pull, T.dive, 'quadOut');
  const dive = E.seg(t, T.dive, T.online, 'cubicIn');
  const r0 = camRect(0);
  const tl = { x: r0.x + r0.w / 2, y: r0.y + r0.h / 2 };
  const sFull = W / r0.w * 1.004;
  const s = E.lerp(push * (1 - 0.045 * pull), sFull, dive);
  const fx = E.lerp(960, tl.x, dive), fy = E.lerp(540, tl.y, dive);
  c.save();
  c.translate(960, 540); c.scale(s, s); c.translate(-fx, -fy);
  const sweepP = E.seg(t, T.sweep1, T.sweep1 + 0.4, 'sineInOut');
  const sweeping = t >= T.sweep1 && t < T.sweep1 + 0.75;
  const lineY = E.lerp(-40, H + 300, sweepP);
  // round 2: punch-zoom one feed on beat 2 (CAM 02) and on the hop (CAM 04): 1.0 -> 1.15 -> 1.0
  const PUNCH = [[1, T.beat2], [3, T.hop]];
  const punchOf = (i) => { let k = 0; for (const [j, h] of PUNCH) if (j === i) k = Math.max(k, E.envAD(t, h, 0.05, 0.16)); return k; };
  const order = [0, 1, 2, 3].sort((a, b) => punchOf(a) - punchOf(b));
  for (const i of order) {
    const r = camRect(i), k = punchOf(i);
    c.save();
    if (k > 0.002) {
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2, sc = 1 + 0.15 * k;
      c.translate(cx, cy); c.scale(sc, sc); c.translate(-cx, -cy);
      c.shadowColor = 'rgba(0,0,0,0.8)'; c.shadowBlur = 40 * k;
    }
    drawMonitor(c, E, t, i, r, { reveal: sweeping ? sweepReveal(E, t, lineY, 'conePatrol') : null });
    if (k > 0.02) brackets(c, r.x - 6, r.y - 6, r.w + 12, r.h + 12, 60, 6, E.col('coin'), k);
    c.restore();
  }
  // gold sweep fades in/out at its ends
  c.restore();
  if (t >= T.sweep1 && sweepP < 1) drawSweepLine(c, E, lineY, 'conePatrol', 1);
  c.save(); c.translate(960, 540); c.scale(s, s); c.translate(-fx, -fy);
  drawTitleBar(c, E, t);
  c.restore();
  // per-monitor tears on glitch cues
  const gi = glitchIdx(t);
  if (gi >= 0 && t < T.dive) {
    const which = gi === 3 ? [0, 1, 2, 3] : [E.randInt(0, 3, 'gm', gi), E.randInt(0, 3, 'gm2', gi)];
    for (const k of new Set(which)) {
      const r = camRect(k);
      const rr = { x: Math.round(960 + (r.x - fx) * s), y: Math.round(540 + (r.y - fy) * s), w: Math.round(r.w * s), h: Math.round(r.h * s) };
      rr.x = Math.max(0, rr.x); rr.y = Math.max(0, rr.y); rr.w = Math.min(W - rr.x, rr.w); rr.h = Math.min(H - rr.y, rr.h);
      if (rr.w > 4 && rr.h > 4) E.glitch(c, { amount: gi === 3 ? 0.9 : 0.7, seed: gi * 13 + k + (E.frame >> 1), slices: 7, maxShift: 60, region: rr });
    }
  }
  // dive smear: radial zoom blur toward CAM 01 in the last frames of the dive
  if (dive > 0) E.zoomBlur(c, { cx: 960, cy: 540, strength: 0.12 * dive, samples: 5 });
}

// ---------------------------------------------------------------------------------------------
// C. SECURITY ONLINE: full HQ feed (1.875 - 2.8125)
// ---------------------------------------------------------------------------------------------
function hqCam(E, t) {
  const u = E.seg(t, T.online, T.alert1, 'sineInOut');
  const pre = E.seg(t, T.alert1 - 6 / 60, T.alert1, 'expoIn');
  const z = 1.12 + 0.2 * u + 0.12 * pre;
  const file = 40 + (t - T.online) * 30;
  const [kx, ky] = catAt(E, file);
  const cx = E.lerp(930, kx + 60, u * 0.75 + pre * 0.25), cy = E.lerp(560, ky, u * 0.75 + pre * 0.25);
  return { ...camCrop(cx, cy, z), file };
}
function drawHQ(c, E, t) {
  const { W, H } = E;
  const cam = hqCam(E, t);
  const ct = E.clipFrameTime('h08-establish', 40) + (t - T.online);
  E.drawClip(c, 'h08-establish', ct, 0, 0, W, H, { crop: cam.crop });
  grade(c, E, { x: 0, y: 0, w: W, h: H }, 0.75);
  // riser: red creeps in toward the alert
  const risk = E.seg(t, T.sweep2, T.alert1, 'quadIn');
  if (risk > 0) { c.save(); c.globalCompositeOperation = 'overlay'; c.fillStyle = E.rgba('alertRed', 0.32 * risk); c.fillRect(0, 0, W, H); c.restore(); }
  // sweep 2, reverse coloured, bottom -> top
  const sp = E.seg(t, T.sweep2, T.sweep2 + 0.42, 'sineInOut');
  if (t >= T.sweep2 && sp < 1) {
    const y = E.lerp(H + 40, -60, sp);
    drawSweepLine(c, E, y, 'coneAlert', 1, true);
  }
  // dog reticles lock on, one per 16th (system-online beeps)
  for (let d = 0; d < DOGS.length; d++) {
    const t0 = T.online + 0.06 + d * 0.1171875;
    const q = E.seg(t, t0, t0 + 0.16, 'backOut');
    if (q <= 0) continue;
    const D = DOGS[d], u = E.clamp01((cam.file - 40) / 28);
    const [x, y] = cam.map(E.lerp(D[0], D[2], u), E.lerp(D[1], D[3], u) - 14);
    if (x < -80 || x > W + 80 || y < -80 || y > H + 80) continue;
    const sz = 46 * E.lerp(2.6, 1, q) * (1 + 0.06 * Math.sin(t * 14 + d));
    c.save(); c.translate(x, y); c.rotate(Math.PI / 4 + (1 - q) * 0.8);
    brackets(c, -sz / 2, -sz / 2, sz, sz, sz * 0.32, 3, E.col('conePatrol'), Math.min(1, q * 1.5));
    c.restore();
    E.shockwave(c, x, y, E.seg(t, t0, t0 + 0.35), { radius: 90, width: 5, color: 'conePatrol', rings: 1 });
    E.drawText(c, `0${d + 1}`, x + sz * 0.55, y - sz * 0.55, { font: MONO, weight: '700', size: 15, align: 'left', color: 'conePatrol', alpha: q });
  }
  // MOTION DETECTED: lock box on the moving cat
  if (t >= T.sweep2) {
    const [kx, ky] = catAt(E, cam.file);
    const [x, y] = cam.map(kx, ky - 16);
    const lk = E.seg(t, T.sweep2, T.sweep2 + 8 / 60, 'expoOut');
    const wob = 1 + 0.04 * Math.sin((t - T.sweep2) * 30) * (1 - E.seg(t, T.sweep2, T.sweep2 + 0.3));
    const bw = E.lerp(520, 150, lk) * wob, bh = E.lerp(420, 140, lk) * wob;
    const blink = E.fract((t - T.sweep2) * (t > T.alert1 - 0.2 ? 12 : 5)) < 0.6;
    const gj = inGlitch(t) ? E.randSigned('bj', E.frame) * 18 : 0;
    c.save(); c.translate(gj, 0);
    // crosshair lines to the frame edges
    c.strokeStyle = E.rgba('coneAlert', 0.45 * lk); c.lineWidth = 1.5; c.setLineDash([10, 8]); c.lineDashOffset = -t * 120;
    c.beginPath(); c.moveTo(0, y); c.lineTo(x - bw / 2, y); c.moveTo(x + bw / 2, y); c.lineTo(W, y); c.moveTo(x, 0); c.lineTo(x, y - bh / 2); c.moveTo(x, y + bh / 2); c.lineTo(x, H); c.stroke();
    c.setLineDash([14, 9]); c.strokeStyle = E.rgba('coneAlert', 0.9); c.lineWidth = 2.5;
    c.strokeRect(x - bw / 2, y - bh / 2, bw, bh);
    c.setLineDash([]);
    brackets(c, x - bw / 2 - 8, y - bh / 2 - 8, bw + 16, bh + 16, 30, 5, E.col(blink ? 'coneAlert' : 'cream'));
    // tag
    const tq = E.seg(t, T.sweep2 + 0.05, T.sweep2 + 0.2, 'backOut');
    if (tq > 0) {
      const tw = 268 * tq;
      c.fillStyle = E.col(blink ? 'coneAlert' : '#8a1410');
      c.fillRect(x - bw / 2 - 8, y - bh / 2 - 48, tw, 34);
      c.save(); c.beginPath(); c.rect(x - bw / 2 - 8, y - bh / 2 - 48, tw, 34); c.clip();
      small(E, c, 'MOTION DETECTED', x - bw / 2 + 4, y - bh / 2 - 30, { size: 22, color: 'cream', tracking: 0.08 });
      c.restore();
    }
    c.restore();
  }
  // HUD
  hud(c, E, t, 'KIBBLE CORP HQ');
  const so = E.seg(t, T.online, T.online + 0.28);
  const str = 'SECURITY ONLINE';
  const shown = E.typewriter(str, so);
  const caret = E.fract(t * 4) < 0.5 || so < 1 ? '_' : ' ';
  const pop = E.seg(t, T.online, T.online + 0.2, 'backOut');
  c.save(); c.translate(64, 150); c.scale(E.lerp(1.5, 1, pop), E.lerp(1.5, 1, pop));
  c.fillStyle = 'rgba(4,2,8,0.75)'; c.fillRect(-14, -26, 340, 52);
  c.fillStyle = E.col('mint'); c.fillRect(-14, -26, 5, 52);
  small(E, c, shown + caret, 6, 1, { size: 28, color: 'mint', tracking: 0.12, glow: { color: E.rgba('mint', 0.6), blur: 14 } });
  c.restore();
  // slam frame brackets
  const sb = E.seg(t, T.online, T.online + 0.3, 'backOut');
  const inset = E.lerp(-60, 36, sb);
  brackets(c, inset, inset, W - inset * 2, H - inset * 2, 70, 4, E.rgba('cream', 0.85));
}
function hud(c, E, t, zone) {
  const { W, H } = E;
  const s = recDot(c, E, t, 70, 70, 12);
  small(E, c, 'REC', 94, 72, { size: 28, color: 'alertRed', alpha: Math.min(1, 0.4 + s) });
  small(E, c, `CAM 01 · ${zone}`, 170, 72, { size: 24, color: 'mint', alpha: 0.9 });
  E.drawText(c, tcode(E, t), W - 66, 72, { font: MONO, weight: '700', size: 26, align: 'right', color: 'mint', tracking: 0.08 });
  // bottom-left signal meter on the 16ths
  for (let i = 0; i < 12; i++) {
    const lvl = 0.5 + 0.5 * E.noise1(t * 9 + i * 0.7, 5);
    c.fillStyle = E.rgba(i > 9 ? 'alertRed' : 'mint', 0.25 + 0.6 * (lvl > i / 12 ? 1 : 0));
    c.fillRect(66 + i * 14, H - 72, 9, 18);
  }
}

// ---------------------------------------------------------------------------------------------
// D. alert (2.8125 - 3.28)
// ---------------------------------------------------------------------------------------------
function drawAlert(c, E, t) {
  const { W, H } = E;
  const a2 = t >= T.alert2;
  const pz = E.seg(t, T.alert2, T.alert2 + 6 / 60, 'snap');
  const z = 1.08 + 0.04 * E.seg(t, T.alert1, T.dark) + 0.32 * pz;
  const fcx = E.lerp(1180, CONE.x + 40, pz), fcy = E.lerp(640, CONE.y - 40, pz);
  const cam = camCrop(fcx, fcy, z);
  // file 104/105 stutter (106 the game camera jumps to the checkpoint)
  const file = E.fract(t * 15) < 0.5 ? 104 : 105;
  E.drawClip(c, 'h02-spotted', E.clipFrameTime('h02-spotted', a2 ? 104 : file), 0, 0, W, H, { crop: cam.crop });
  grade(c, E, { x: 0, y: 0, w: W, h: H }, 0.35);
  // alertFlash overlay
  const fl = Math.max(E.env(t, T.alert1, 0.14), E.env(t, T.alert2, 0.12));
  c.save(); c.globalCompositeOperation = 'source-over'; c.fillStyle = E.rgba('alertFlash', 0.6 * fl + 0.12); c.fillRect(0, 0, W, H); c.restore();
  // rotating siren beams from the top corners
  c.save(); c.globalCompositeOperation = 'lighter';
  for (const [sx, dir] of [[0, 1], [W, -1]]) {
    const ang = Math.PI / 2 + dir * (0.6 + 0.55 * Math.sin((t - T.alert1) * 9));
    const g = c.createRadialGradient(sx, -40, 0, sx, -40, 1400);
    g.addColorStop(0, E.rgba('alertRed', 0.5)); g.addColorStop(1, E.rgba('alertRed', 0));
    c.fillStyle = g; c.beginPath(); c.moveTo(sx, -40); c.arc(sx, -40, 1400, ang - 0.16, ang + 0.16); c.closePath(); c.fill();
  }
  c.restore();
  // hazard frame
  const hz = E.seg(t, T.alert1, T.alert1 + 0.12, 'expoOut') * 30;
  if (hz > 0) {
    c.save(); c.beginPath(); c.rect(0, 0, W, H); c.rect(hz, hz, W - 2 * hz, H - 2 * hz); c.clip('evenodd');
    c.fillStyle = '#120204'; c.fillRect(0, 0, W, H);
    c.fillStyle = E.col('alertRed');
    const off = E.mod(t * 260, 60);
    for (let x = -120; x < W + 120; x += 60) { c.beginPath(); c.moveTo(x + off, 0); c.lineTo(x + off + 30, 0); c.lineTo(x + off - 1050, H); c.lineTo(x + off - 1080, H); c.closePath(); c.fill(); }
    c.restore();
  }
  // the "!" over the guard: 3 -> 1 backOut, doubled with an echo on the 2nd stab
  const [gx, gy] = cam.map(GUARD.x, GUARD.y - 230);
  const ex = E.seg(t, T.alert1, T.alert1 + 8 / 60, 'backOut');
  const sc = E.lerp(3, 1, ex) * (1 + 0.04 * Math.sin(t * 40));
  const mark = (x, y, s, color, alpha, rot) => E.drawText(c, '!', x, y, { size: 320 * s, color, alpha, rot, stroke: '#ffffff', strokeWidth: 10, extrude: { depth: 10, color: '#4a0306', dark: 0.4 } });
  const ox = E.clamp(gx, 260, W - 260), oy = E.clamp(gy, 260, H - 200);
  if (a2) {
    const e2 = E.seg(t, T.alert2, T.alert2 + 6 / 60, 'backOut');
    mark(ox + 20 + 150 * e2, oy + 20, E.lerp(2.2, 1.05, e2), 'coneAlert', 0.55, 0.12);
  }
  mark(ox, oy, sc, 'alertRed', Math.min(1, ex * 2), -0.06);
  hud(c, E, t, 'KENNEL ROW');
  if (a2) E.rgbSplit(c, 6 * E.env(t, T.alert2, 0.1) + 1.5, { opaque: true });
}

// ---------------------------------------------------------------------------------------------
// E. blackout: the eyes (3.28 - 3.75)
// ---------------------------------------------------------------------------------------------
function drawEyes(c, E, t) {
  const { W, H } = E;
  c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
  // phosphor afterimage of the alert frame collapsing
  const ghost = 1 - E.seg(t, T.dark, T.dark + 0.12, 'expoOut');
  if (ghost > 0) {
    c.save(); c.globalAlpha = 0.5 * ghost; c.translate(960, 540); c.scale(1, Math.max(0.01, ghost)); c.translate(-960, -540);
    c.fillStyle = E.col('alertRed'); c.globalCompositeOperation = 'lighter';
    const g = c.createRadialGradient(960, 540, 0, 960, 540, 900);
    g.addColorStop(0, E.rgba('alertRed', 0.6)); g.addColorStop(1, E.rgba('alertRed', 0));
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.restore();
  }
  const k = FILLS.reduce((n, f) => n + (t >= f ? 1 : 0), 0) - 1;
  if (k < 0) return;
  const hit = FILLS[k];
  const lt = t - hit;
  const s0 = EYE_SCALE[k];
  const kick = 1 + 0.08 * (1 - E.expoOut(E.seg(lt, 0, 0.06)));
  const punch = 1 + 0.03 * k; // round 3: 3% punch-in per fill
  const scale = s0 * kick * punch;
  // round 2: stutter-cut framing on every fill snare (the cat jumps around the dark), 1-frame blink
  const SX = [-300, 300, 0, -260, 260, 0], SY = [20, -30, 0, 20, -20, 0]; // round 3: left, right, centre
  const cx = 960 + SX[k] + 4 * E.perlin1(t * 3, 41), cy = 540 + SY[k] + 3 * E.perlin1(t * 3, 42);
  // sprite in silhouette, rim barely catching the eye light; anchored on the eyes
  const anchor = [30.5 / 48, 20 / 48];
  // round 3: purple/teal rim light (two offset silhouettes behind a dark body)
  const rimOff = Math.max(2, scale * 0.35);
  c.save();
  c.globalAlpha = 0.85; E.drawSprite(c, 'oreo', 'IDLE', 0, cx - rimOff, cy - rimOff * 0.4, scale, { anchor, silhouette: TEAL });
  c.globalAlpha = 0.9; E.drawSprite(c, 'oreo', 'IDLE', 0, cx + rimOff, cy - rimOff * 0.3, scale, { anchor, silhouette: '#9b5cff' });
  c.globalAlpha = 1; E.drawSprite(c, 'oreo', 'IDLE', 0, cx, cy, scale, { anchor, silhouette: '#0c0614' });
  c.restore();
  // eye glow
  let op = lt < 1 / 60 ? 0 : lt < 2 / 60 ? 0.5 : 1; // blink once per snare
  // round 3: the last close-up blinks shut into the drop (3.75)
  if (k === 5) { const shut = t - (T.end - 4 / 60); if (shut >= 0) op = shut < 2 / 60 ? 0.5 : 0; }
  const flick = 0.85 + 0.15 * E.noise1(t * 30, 7);
  const glowR = scale * 7;
  c.save(); c.globalCompositeOperation = 'lighter';
  for (const ex of [-2, 2]) {
    const x = cx + ex * scale, y = cy;
    const g = c.createRadialGradient(x, y, 0, x, y, glowR);
    g.addColorStop(0, E.rgba('catnipGlow', 0.55 * op * flick)); g.addColorStop(0.35, E.rgba('catnipGlow', 0.14 * op)); g.addColorStop(1, E.rgba('catnipGlow', 0));
    c.fillStyle = g; c.fillRect(x - glowR, y - glowR, glowR * 2, glowR * 2);
  }
  c.restore();
  // pixel eyes: 1x2 px each at sprite scale, open in 2 pixel steps (crisp)
  const rows = op >= 1 ? 2 : op > 0 ? 1 : 0;
  if (rows) {
    c.save(); c.fillStyle = E.col('catnipGlow');
    for (const ex of [-2.5, 1.5]) {
      const x = Math.round(cx + ex * scale), y0 = Math.round(cy - (rows / 2) * scale);
      c.fillRect(x, y0, Math.round(scale), Math.round(rows * scale));
      c.fillStyle = E.col('catnipPale'); c.fillRect(x, y0, Math.round(scale), Math.round(scale * 0.5)); c.fillStyle = E.col('catnipGlow');
    }
    c.restore();
  }
  // dust motes drifting through the eye light (depth)
  E.particles('s1dust', 40, t, (p) => {
    const x = cx + (p.r(1) - 0.5) * 900 + 30 * Math.sin(t * 0.7 + p.i);
    const y = cy + (p.r(2) - 0.5) * 520 - (t - T.dark) * (20 + 40 * p.r(3));
    const d = Math.hypot(x - cx, y - cy);
    const a = E.clamp01(1 - d / 420) * 0.5 * op;
    if (a <= 0.01) return;
    c.fillStyle = E.rgba('catnipPale', a); const sz = 2 + 3 * p.r(4); c.fillRect(x, y, sz, sz);
  });
}
function crtCollapse(c, E, t) {
  if (t < T.collapse) return;
  const { W, H } = E;
  const f = Math.floor((t - T.collapse) * 60 + 1e-4); // 0: line, 1: dot
  const S = E.snapshot(c, '__s1collapse');
  c.save(); c.setTransform(1, 0, 0, 1, 0, 0);
  c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
  const sx = f === 0 ? 1 : 0.035, sy = f === 0 ? 0.03 : 0.012;
  c.translate(960, 540); c.scale(sx, sy); c.translate(-960, -540);
  c.drawImage(S, 0, 0);
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalCompositeOperation = 'lighter';
  const g = c.createRadialGradient(960, 540, 0, 960, 540, f === 0 ? 900 : 160);
  g.addColorStop(0, 'rgba(240,255,230,0.95)'); g.addColorStop(0.2, E.rgba('catnipGlow', 0.5)); g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g;
  if (f === 0) { c.save(); c.translate(960, 540); c.scale(1, 0.03); c.translate(-960, -540); c.fillRect(0, 0, W, H); c.restore(); c.fillStyle = 'rgba(255,255,255,0.95)'; c.fillRect(0, 538, W, 4); }
  else { c.fillRect(800, 380, 320, 320); c.fillStyle = '#fff'; c.beginPath(); c.arc(960, 540, 10, 0, E.TAU); c.fill(); }
  c.restore();
}

// ---------------------------------------------------------------------------------------------
export default {
  start: 0.0,
  end: 3.75,
  async init(E) {
    // Nunito / Passion One for HUD and numbers (the engine only loads Cat Paw)
    const faces = [
      ['Nunito', 'assets/sprites/fonts/nunito-latin-wght-normal.woff2', { weight: '200 1000' }],
      ['Nunito', 'assets/sprites/fonts/nunito-latin-ext-wght-normal.woff2', { weight: '200 1000' }],
      ['Passion One', 'assets/sprites/fonts/passion-one-latin-700-normal.woff2', { weight: '700' }],
    ];
    await Promise.all(faces.map(async ([fam, url, d]) => {
      try { const ff = new FontFace(fam, `url(${url})`, d); await ff.load(); document.fonts.add(ff); } catch {}
    }));
    // make sure the faces are active for canvas text before the first frame (determinism)
    for (const f of ['800 24px "Nunito"', '600 24px "Nunito"', '700 24px "Passion One"']) { try { await document.fonts.load(f, 'REC CAM 01 · 0123456789'); } catch {} }
    try { const wc = new OffscreenCanvas(8, 8).getContext('2d'); for (const w of ['600', '800']) { wc.font = `${w} 24px ${NUNITO}`; wc.fillText('REC CAM', 0, 8); } } catch {}
    // seeded TV-snow tiles (2x size so we can pan a random window)
    noiseTex = [];
    for (let k = 0; k < 6; k++) {
      const cv = new OffscreenCanvas(480, 270), x = cv.getContext('2d');
      const id = x.createImageData(480, 270), r = E.rng('s1snow' + k);
      for (let i = 0; i < id.data.length; i += 4) {
        const v = Math.floor(r() * 255);
        id.data[i] = v * 0.8; id.data[i + 1] = v; id.data[i + 2] = v * 0.9; id.data[i + 3] = 255;
      }
      x.putImageData(id, 0, 0); noiseTex.push(cv);
    }
  },
  draw(ctx, t, lt, E) {
    if (t < T.wall) { drawBoot(ctx, E, t); }
    else if (t < T.online) { drawWall(ctx, E, t); }
    else if (t < T.alert1) { drawHQ(ctx, E, t); }
    else if (t < T.dark) { drawAlert(ctx, E, t); }
    else { drawEyes(ctx, E, t); }
    // boot HUD (REC + timecode appear on the beeps)
    if (t < T.wall && t >= T.rec1) {
      const s = recDot(ctx, E, t, 70, 70, 12);
      small(E, ctx, 'REC', 94, 72, { size: 28, color: 'alertRed', alpha: Math.min(1, 0.4 + s) });
      E.drawText(ctx, `CAM 01 · ${tcode(E, t)}`, E.W - 66, 72, { font: NUNITO, weight: '800', size: 26, align: 'right', color: 'mint', tracking: 0.08 });
    }
    // CRT finish while the feed is live
    if (t < T.dark) {
      E.scanlines(ctx, { alpha: 0.22, spacing: 4, thickness: 2, offset: t * 30 });
      const y = E.mod(t * 520, E.H + 300) - 150;
      const g = ctx.createLinearGradient(0, y - 120, 0, y + 120);
      g.addColorStop(0, 'rgba(200,255,235,0)'); g.addColorStop(0.5, 'rgba(200,255,235,0.05)'); g.addColorStop(1, 'rgba(200,255,235,0)');
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = g; ctx.fillRect(0, y - 120, E.W, 240); ctx.restore();
      E.flash(ctx, 0.04 * (0.5 + 0.5 * E.noise1(t * 40, 99)), '#000');
    }
    // light leaks: gold on the slam, red on the alerts
    const lk = E.env(t, T.online, 0.2);
    if (lk > 0.01) E.lightLeak(ctx, t, { seed: 4, intensity: 0.1 * lk, colors: ['#ffc93c', '#ff7aa2'] });
    const lr = Math.max(E.env(t, T.alert1, 0.3), E.env(t, T.alert2, 0.3)) * (t < T.dark ? 1 : 0);
    if (lr > 0.01) E.lightLeak(ctx, t, { seed: 9, intensity: 0.18 * lr, colors: ['#ff2e22', '#ff7aa2'] });
    if (t < 0.25) crtOpen(ctx, E, t);
    crtCollapse(ctx, E, t);
  },
  fx(t, lt, E) {
    const shake = 2.8 * E.env(t, 0, 0.18) + 6 * E.env(t, T.online, 0.18) + 8 * E.env(t, T.alert1, 0.18) + 8 * E.env(t, T.alert2, 0.18);
    let fill = 0;
    for (const f of FILLS) fill = Math.max(fill, E.env(t, f, 0.04));
    const g = inGlitch(t) ? 0.45 : 0;
    return {
      shake,
      aberration: 3 * fill + 5 * E.env(t, T.online, 0.1) + (g ? 3 : 0) + 4 * E.env(t, T.alert1, 0.08),
      glitch: t < T.online ? g * 0.6 : g,
      flash: Math.max(0.42 * E.env(t, T.online, 0.06), 0.25 * E.env(t, T.wall, 0.05), 0.18 * E.env(t, T.beat2, 0.03), 0.18 * E.env(t, T.hop, 0.03)),
      zoom: (1 + 0.045 * E.env(t, T.online, 0.12) + 0.03 * E.env(t, T.alert1, 0.1) + 0.012 * fill) * (t >= T.dark ? 1 + 0.08 * Math.max(0, FILLS.filter((f) => t >= f).length - 1) / 5 * 2 : 1),
      invert: FILLS.some((f, i) => i % 2 === 0 && t >= f && t < f + 1 / 60) ? 1 : 0, // round 3: 1-frame negative on alternate snares
      contrast: FILLS.some((f) => t >= f && t < f + 2 / 60) ? 0.6 : 0,
      grain: 0.035,
      vignette: 0.35,
    };
  },
};
