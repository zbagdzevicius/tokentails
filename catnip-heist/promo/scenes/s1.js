// s1 — Bars 1-2 (0.000-3.750): COLD OPEN (security-cam boot) + THE CREW (cat slams, kinetic type, SWAP whip).
// Pure function of t. All timing is locked to the 128 BPM grid / cues.json.

const B = 0.46875;          // beat
const BAR = 1.875;          // bar
const T_TITLE = 0.46875;    // KIBBLE CORP title
const T_SWEEP = 0.703125;   // scan sweep start
const T_GRID = 0.9375;      // 4-cam monitor wall
const T_LOCK = 1.40625;     // CAM 04 punch-in + target lock
const T_DROP = 1.875;       // cat 1 slam
const T_CAT2 = 2.34375;     // cat 2 slam
const T_TWO = 2.8125;       // TWO CATS.
const T_ONE = 3.28125;      // ONE HEIST.
const T_WHIP = 3.60;        // whip-pan starts
const T_END = 3.75;         // handoff to s2
const FILLS = [3.515625, 3.574219, 3.632813, 3.662109, 3.691406, 3.720703];
const GLITCHES = [[0.46875, 0.09], [0.585938, 0.05], [0.820313, 0.07], [1.40625, 0.05]];
const CAT_A = 'bob', CAT_B = 'oreo', GUARD = 'brown'; // the two cats actually playing in every captured clip
const TICKS = [0.28, 0.40, 0.46875, 0.585938, 0.703125, 0.820313, 0.9375]; // fx ticks in cues.json
const SEC = { font: 'condensed', weight: '800' }; // secondary display face (security-stencil feel), used for all non-logo headlines
const TARGET = { x: 930, y: 470 }; // black cat in h02-spotted f90-100 (clip px)

let halftone = null;

function makeHalftone() {
  const s = 22, c = new OffscreenCanvas(s, s), g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,0.22)';
  g.beginPath(); g.arc(s / 4, s / 4, 3.4, 0, Math.PI * 2); g.arc((3 * s) / 4, (3 * s) / 4, 3.4, 0, Math.PI * 2); g.fill();
  return c;
}

// ---------- small local helpers ----------
function brackets(c, x, y, w, h, len, lw, color, alpha = 1) {
  c.save(); c.globalAlpha *= alpha; c.strokeStyle = color; c.lineWidth = lw; c.lineCap = 'square';
  c.beginPath();
  const l = Math.min(len, w / 2, h / 2);
  c.moveTo(x, y + l); c.lineTo(x, y); c.lineTo(x + l, y);
  c.moveTo(x + w - l, y); c.lineTo(x + w, y); c.lineTo(x + w, y + l);
  c.moveTo(x + w, y + h - l); c.lineTo(x + w, y + h); c.lineTo(x + w - l, y + h);
  c.moveTo(x + l, y + h); c.lineTo(x, y + h); c.lineTo(x, y + h - l);
  c.stroke(); c.restore();
}
function para(c, x0, x1, y0, y1, skew) { // parallelogram, right & left edges slanted by skew px
  c.beginPath(); c.moveTo(x0 + skew, y0); c.lineTo(x1 + skew, y0); c.lineTo(x1 - skew, y1); c.lineTo(x0 - skew, y1); c.closePath();
}
const mono = (c, E, str, x, y, o = {}) => E.drawText(c, str, x, y, { font: 'mono', size: 26, weight: '600', tracking: 0.18, align: 'left', color: 'cream', ...o });

// clip crop around a point for an exact zoom (keeps target mapping computable)
function camCrop(cx, cy, z) {
  const w = 1 / z, h = 1 / z;
  const x = Math.min(Math.max(cx / 1920 - w / 2, 0), 1 - w);
  const y = Math.min(Math.max(cy / 1080 - h / 2, 0), 1 - h);
  return [x, y, w, h];
}

// ============================================================================================
// BAR 1 — COLD OPEN
// ============================================================================================
function grade(c, E) {
  // cheap security-cam grade: partial desaturation + slight darken (composite ops, no filter)
  c.save(); c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalCompositeOperation = 'saturation'; c.fillStyle = 'rgba(128,128,128,0.32)'; c.fillRect(0, 0, E.W, E.H);
  c.globalCompositeOperation = 'screen'; c.fillStyle = 'rgba(70,52,110,0.30)'; c.fillRect(0, 0, E.W, E.H);
  c.restore();
}
function camFeed(c, t, E) {
  const { W, H } = E;
  c.fillStyle = E.col('night'); c.fillRect(0, 0, W, H);
  if (t < T_GRID) {
    // CAM 01 wide establishing, slow push
    const z = 1.02 + 0.07 * E.seg(t, 0, T_GRID, 'sineInOut');
    E.drawClip(c, 'h08-establish', 0.6 + t, 0, 0, W, H, { zoom: z, fx: 0.42, fy: 0.5 });
  } else if (t < T_LOCK) {
    // 4-cam monitor wall
    const lt = t - T_GRID;
    const gap = 14, cw = (W - gap * 3) / 2, ch = (H - gap * 3) / 2;
    const cams = [
      { clip: 'h08-establish', ct: 0.6 + t, id: '01', zone: 'HQ // ROOF', fx: 0.42 },
      { clip: 'h02-meow-lure', ct: 1.25 + lt, id: '02', zone: 'KENNEL ROW', fx: 0.4 },
      { clip: 'h05-coin-run', ct: 1.9 + lt, id: '03', zone: 'WATCHTOWER', fx: 0.5 },
      { clip: 'h02-spotted', ct: E.clipFrameTime('h02-spotted', 76) + lt, id: '04', zone: 'VAULT GATE', fx: 0.5 },
    ];
    for (let i = 0; i < 4; i++) {
      const cx = i % 2, cy = i >> 1;
      const tx = gap + cx * (cw + gap), ty = gap + cy * (ch + gap);
      // cell 0 shrinks from fullscreen; others pop in staggered
      let x, y, w, h, a = 1;
      if (i === 0) {
        const p = E.seg(lt, 0, 0.2, 'expoOut');
        x = E.lerp(0, tx, p); y = E.lerp(0, ty, p); w = E.lerp(W, cw, p); h = E.lerp(H, ch, p);
      } else {
        const p = E.seg(lt, 0.02 + i * 0.035, 0.2 + i * 0.035, 'backOut');
        const s = E.lerp(0.6, 1, p);
        w = cw * s; h = ch * s; x = tx + (cw - w) / 2; y = ty + (ch - h) / 2; a = E.clamp01(p * 3);
      }
      if (a <= 0) continue;
      c.save(); c.globalAlpha = a;
      c.beginPath(); c.rect(x, y, w, h); c.clip();
        E.drawClip(c, cams[i].clip, cams[i].ct, x, y, w, h, { zoom: 1.25, fx: cams[i].fx, fy: 0.5 });
        // cell pop flash
      const fl = i === 0 ? 0 : E.env(lt, 0.02 + i * 0.035, 0.05);
      if (fl > 0.01) { c.fillStyle = `rgba(255,255,255,${0.8 * fl})`; c.fillRect(x, y, w, h); }
      c.restore();
      // cell chrome
      c.save(); c.globalAlpha = a;
      c.strokeStyle = E.rgba('lavender', 0.55); c.lineWidth = 2; c.strokeRect(x + 1, y + 1, w - 2, h - 2);
      mono(c, E, `CAM ${cams[i].id}`, x + 26, y + 34, { size: 22, color: 'cream' });
      mono(c, E, cams[i].zone, x + 26, y + 62, { size: 16, color: 'lavender', tracking: 0.28 });
      // CAM 04 motion alert blinks on the offbeat
      if (i === 3 && lt > B * 0.5) {
        const on = Math.floor((lt - B * 0.5) * 16) % 2 === 0;
        if (on) {
          c.fillStyle = E.col('alertRed'); c.fillRect(x + w - 210, y + 20, 184, 34);
          mono(c, E, 'MOTION', x + w - 196, y + 38, { size: 20, color: 'night', tracking: 0.3 });
        }
        brackets(c, x + w * 0.38, y + h * 0.3, w * 0.22, h * 0.34, 26, 3, E.col('alertRed'), 0.8);
      }
      c.restore();
    }
  } else {
    // CAM 04 punch-in → target lock → crash-zoom
    const lt = t - T_LOCK;
    const pIn = E.seg(lt, 0, 0.16, 'expoOut');           // cell → fullscreen
    const pZoom = E.seg(lt, 0.12, B - 0.02, 'expoIn');   // crash zoom into the cat
    const gap = 14, cw = (W - gap * 3) / 2, ch = (H - gap * 3) / 2;
    const x = E.lerp(gap + cw + gap, 0, pIn), y = E.lerp(gap + ch + gap, 0, pIn);
    const w = E.lerp(cw, W, pIn), h = E.lerp(ch, H, pIn);
    const z = 1.5 + 0.5 * E.seg(lt, 0, B, 'sineInOut') + 2.6 * pZoom;
    const crop = camCrop(TARGET.x, TARGET.y, z);
    const ct = Math.min(E.clipFrameTime('h02-spotted', 76) + (t - T_GRID), E.clipFrameTime('h02-spotted', 102));
    c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
    E.drawClip(c, 'h02-spotted', ct, x, y, w, h, { fit: 'stretch', crop });
    c.restore();
    // red alert tint rising
    c.fillStyle = E.rgba('alertRed', 0.12 * E.seg(lt, 0.15, B, 'quadIn')); c.fillRect(0, 0, W, H);
  }
}

function lockOn(c, t, E) {
  if (t < T_LOCK) return;
  const { W, H } = E;
  const lt = t - T_LOCK;
  const pIn = E.seg(lt, 0, 0.16, 'expoOut');
  const pZoom = E.seg(lt, 0.12, B - 0.02, 'expoIn');
  const z = 1.5 + 0.5 * E.seg(lt, 0, B, 'sineInOut') + 2.6 * pZoom;
  const crop = camCrop(TARGET.x, TARGET.y, z);
  // target position on screen
  const sx = (TARGET.x / 1920 - crop[0]) / crop[2] * W;
  const sy = (TARGET.y / 1080 - crop[1]) / crop[3] * H;
  const pLock = E.seg(lt, 0.04, 0.24, 'expoOut');
  const size = E.lerp(900, 120, pLock) * (z / 1.5) * 0.9;
  const rot = E.lerp(-0.5, 0, pLock);
  const red = E.col('alertRed');
  c.save(); c.globalAlpha = pIn;
  c.translate(sx, sy); c.rotate(rot);
  brackets(c, -size / 2, -size / 2, size, size, size * 0.22, 6, red);
  // crosshair ticks
  c.strokeStyle = red; c.lineWidth = 3;
  c.beginPath();
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { c.moveTo(dx * size * 0.62, dy * size * 0.62); c.lineTo(dx * size * 0.8, dy * size * 0.8); }
  c.stroke();
  c.restore();
  // lock ping ring
  const ping = E.seg(lt, 0.24, 0.5, 'expoOut');
  if (ping > 0 && ping < 1) E.shockwave(c, sx, sy, ping, { radius: size * 1.4, width: 8, color: red, rings: 2, alpha: 0.9 });
  // label
  if (lt > 0.1) {
    const lx = sx + size * 0.55 + 20, ly = sy - size * 0.5 + 10;
    const txt = lt > 0.24 ? 'TARGET LOCKED' : 'ACQUIRING…';
    c.fillStyle = E.rgba('night', 0.8); c.fillRect(lx - 12, ly - 22, 340, 84);
    mono(c, E, E.scramble(txt, E.seg(lt, 0.1, 0.3), 41), lx, ly, { size: 26, color: lt > 0.24 ? 'alertRed' : 'cream' });
    mono(c, E, E.scramble('SUBJECT: FELINE x2', E.seg(lt, 0.16, 0.36), 42), lx, ly + 34, { size: 18, color: 'lavender', tracking: 0.26 });
  }
  // MOTION DETECTED banner (blinking)
  const bOn = Math.floor(lt * 10.667) % 2 === 0;
  if (bOn) {
    const bw = 620;
    c.fillStyle = red; c.fillRect(W / 2 - bw / 2, H - 190, bw, 64);
    E.drawText(c, 'MOTION DETECTED', W / 2, H - 157, { font: 'heavy', size: 40, tracking: 0.16, color: 'night' });
  }
}

function laserGrid(c, t, E) {
  const { W, H } = E;
  if (t < TICKS[0] || t > T_DROP) return;
  const lt = t - T_SWEEP;
  c.save();
  c.globalCompositeOperation = 'lighter';
  const ang = Math.atan2(1, 2); // iso diagonal 26.57°
  for (let k = 0; k < 7; k++) {
    // one beam SNAPS on per fx tick (0.28 .. 0.9375), full length in 3 frames, with an ignition flare
    const tk = TICKS[k];
    if (t < tk) continue;
    const off = (k - 3) * 230 + 60 * Math.sin(t * 2.2 + k);
    const flick = 0.75 + 0.25 * E.noise1(t * 30 + k * 7, 77);
    const reveal = E.seg(t, tk, tk + 0.05, 'expoOut');
    const ign = E.env(t, tk, 0.06);
    const len = 2600 * reveal;
    c.save();
    c.translate(W / 2, H / 2); c.rotate(k % 2 ? ang : -ang); c.translate(0, off);
    const x0 = -1300;
    const th = 1 + 2.5 * ign;
    c.globalAlpha = Math.min(1, (0.6 + 0.4 * ign) * flick);
    c.shadowColor = '#ff2e22'; c.shadowBlur = 18 + 30 * ign;
    c.fillStyle = '#ff2e22'; c.fillRect(x0, -2 * th, len, 4 * th);
    c.shadowBlur = 0; c.globalAlpha = Math.min(1, (0.9 + 0.1 * ign) * flick);
    c.fillStyle = ign > 0.4 ? '#ffffff' : '#ffb0a8'; c.fillRect(x0, -0.75 * th, len, 1.5 * th);
    // beam head spark
    if (reveal < 1) { c.fillStyle = '#fff'; c.beginPath(); c.arc(x0 + len, 0, 5, 0, Math.PI * 2); c.fill(); }
    c.restore();
  }
  // vertical scan bar L→R over ~0.94s
  const ps = E.seg(lt, 0, 0.9375, 'cubicInOut');
  if (ps > 0 && ps < 1) {
    const x = E.lerp(-120, W + 120, ps);
    const g = c.createLinearGradient(x - 160, 0, x + 20, 0);
    g.addColorStop(0, 'rgba(155,225,93,0)'); g.addColorStop(0.85, 'rgba(155,225,93,0.18)'); g.addColorStop(1, 'rgba(234,255,192,0.8)');
    c.globalAlpha = 1; c.fillStyle = g; c.fillRect(x - 160, 0, 180, H);
  }
  c.restore();
}

function guardCone(c, t, E) {
  if (t < T_SWEEP - 0.12 || t >= T_LOCK + 0.05) return;
  const { H } = E;
  const lt = t - (T_SWEEP - 0.12);
  // foreground guard slides in from bottom-left (parallax fg layer)
  const inP = E.seg(lt, 0, 0.22, 'expoOut');
  const outP = E.seg(t, T_LOCK - 0.08, T_LOCK + 0.05, 'expoIn');
  const gx = E.lerp(-300, 250, inP) - 600 * outP, gy = H - 96; // feet on a baseline inside the safe area
  const sweep = E.seg(t, T_SWEEP, T_SWEEP + 0.9375, 'sineInOut');
  const ang = E.lerp(-1.05, -0.12, sweep);
  const len = 2300;
  const ox = gx + 120, oy = gy - 170; // cone starts at the guard's eyes
  c.save();
  c.globalCompositeOperation = 'lighter';
  E.cone(c, ox, oy, ang, E.deg(34), len, { color: 'conePatrol', alpha: 0.5 * inP * (1 - outP), edge: 0.75 });
  // hard cone edges
  c.globalAlpha = 0.95 * inP * (1 - outP); c.strokeStyle = E.col('conePatrol'); c.lineWidth = 5;
  c.beginPath();
  for (const s of [-1, 1]) { const a = ang + s * E.deg(17); c.moveTo(ox, oy); c.lineTo(ox + Math.cos(a) * len, oy + Math.sin(a) * len); }
  c.stroke();
  c.restore();
  // the guard itself: dark backlit silhouette with rim
  E.drawSprite(c, GUARD, 'WALKING', E.spriteFrame(t, 12), gx, gy, 11, {
    anchor: 'feet', tint: { color: '#12071f', amount: 0.3 }, outline: { color: E.rgba('coneInvestigate', 0.95), px: 1 },
  });
}

function titleCard(c, t, E) {
  if (t < T_TITLE || t >= T_GRID + 0.14) return;
  const { W, H } = E;
  const lt = t - T_TITLE;
  // FULL-FRAME SLAM on 0.469: the band is already open on the beat frame (no wipe-in lag)
  const open = E.seg(lt, 0, 0.05, 'expoOut');
  const close = E.seg(t, T_GRID, T_GRID + 0.13, 'expoIn');
  const bandH = E.lerp(560, 470, open) * (1 - close);
  const cy = H / 2 - 10;
  if (bandH < 1) return;
  c.save();
  c.fillStyle = E.rgba('night', 0.9);
  c.fillRect(0, cy - bandH / 2, W, bandH);
  c.fillStyle = E.col('alertRed');
  c.fillRect(0, cy - bandH / 2, W, 8 * (1 - close)); c.fillRect(0, cy + bandH / 2 - 8, W, 8 * (1 - close));
  c.beginPath(); c.rect(0, cy - bandH / 2, W, bandH); c.clip();
  const sy = 1 - close;
  c.translate(0, cy); c.scale(1, sy); c.translate(0, -cy);
  // hazard ticker lines
  const tick = '▲ AUTHORIZED PERSONNEL ONLY ▲ KC-SEC SURVEILLANCE NETWORK ▲ ALL FELINES WILL BE DETAINED ';
  const off = -((t * 520) % 1400);
  for (let r = 0; r < 2; r++) mono(c, E, tick + tick, (r ? -off - 1400 : off), cy - 196 + r * 392, { size: 17, color: r ? 'lavender' : 'alertRed', tracking: 0.3, alpha: 0.9 });
  // KIBBLE CORP: whole word slams 1.5 -> 1 (readable on the beat frame), scramble resolves in 0.12s,
  // horizontal glitch slices tear it on each fx tick
  const slam = E.seg(lt, 0, 0.11, 'backOut');
  const sc = E.lerp(1.5, 1, slam);
  const main = E.scramble('KIBBLE CORP', E.seg(lt, 0, 0.12), 7);
  const size = 270;
  const tear = Math.max(E.env(t, T_TITLE, 0.06), E.env(t, 0.585938, 0.05), E.env(t, 0.703125, 0.05), E.env(t, 0.820313, 0.05));
  const ty = cy - 42;
  E.layer(c, (L) => {
    L.translate(W / 2, ty); L.scale(sc, sc); L.translate(-W / 2, -ty);
    E.drawText(L, main, W / 2, ty, { ...SEC, size, tracking: E.lerp(0.22, 0.06, E.seg(lt, 0, 0.3, 'expoOut')), color: 'cream',
      shadow: { color: E.rgba('alertRed', 0.9), blur: 0, x: 8, y: 8 } });
  }, { post: (lc) => { if (tear > 0.05) E.glitch(lc, { amount: 0.9 * tear, seed: E.frame, slices: 14, maxShift: 140 * tear }); } });
  // // RESTRICTED stamp: slams on the second glitch tick, overlapping the lower-right of the word
  if (t >= 0.585938) {
    const sp = E.seg(t, 0.585938, 0.585938 + 0.1, 'backOut');
    const sx = W / 2 + 330, ssc = E.lerp(2.2, 1, sp);
    c.save(); c.translate(sx, cy + 150); c.rotate(-0.07); c.scale(ssc, ssc);
    c.fillStyle = E.rgba('alertRed', 0.25 + 0.6 * E.env(t, 0.585938, 0.06)); c.fillRect(-300, -58, 600, 116);
    c.strokeStyle = E.col('alertRed'); c.lineWidth = 8; c.strokeRect(-300, -58, 600, 116);
    E.drawText(c, '// RESTRICTED', 0, 4, { ...SEC, size: 92, tracking: 0.08, color: 'alertRed' });
    c.restore();
    mono(c, E, E.scramble('ZONE 7 · CLEARANCE L5 · INTRUDERS KENNELED', E.seg(t, 0.62, 0.8), 55), W / 2 - 780, cy + 150, { size: 22, color: 'lavender', tracking: 0.22 });
  }
  c.restore();
}

function camHud(c, t, E, crt) {
  const { W, H } = E;
  const inP = E.seg(t, 0.1, 0.34, 'expoOut');
  const m = E.lerp(-40, 56, inP);
  const alertMode = t >= T_LOCK;
  const hudCol = alertMode ? E.col('alertRed') : E.col('cream');
  brackets(c, m, m, W - m * 2, H - m * 2, 90, 5, hudCol, 0.9 * inP);
  // REC dot: beeps at 0.28 / 0.40, then 2Hz blink
  // REC dot fires on every fx tick, then blinks on the 8th-note grid
  let rec = 0.25;
  const lastTick = TICKS.filter((k) => t + 1e-6 >= k).pop();
  if (lastTick != null && t - lastTick < 0.07) rec = 1;
  if (t >= T_GRID) rec = Math.max(rec, Math.floor(t / (B / 2) + 1e-6) % 2 === 0 ? 1 : 0.3);
  const rx = m + 60, ry = m + 56;
  if (t >= 0.28) {
    c.save(); c.fillStyle = E.col('alertRed'); c.globalAlpha = rec; c.shadowColor = E.col('alertRed'); c.shadowBlur = 24;
    c.beginPath(); c.arc(rx, ry, 15 * (1 + 0.6 * E.envs(t, TICKS, 0.05)), 0, Math.PI * 2); c.fill(); c.restore();
    mono(c, E, 'REC', rx + 32, ry + 2, { size: 30, weight: '700', tracking: 0.2, color: 'cream', alpha: inP });
  }
  if (inP > 0.01) {
    const camId = t < T_GRID ? 'CAM 01 · HQ ROOF' : t < T_LOCK ? 'MULTIVIEW 4×' : 'CAM 04 · VAULT GATE';
    mono(c, E, 'KIBBLE CORP · SEC-NET', W - m - 40, m + 46, { align: 'right', size: 22, color: 'lavender', alpha: inP, tracking: 0.26 });
    mono(c, E, camId, W - m - 40, m + 80, { align: 'right', size: 26, color: hudCol, alpha: inP });
    mono(c, E, E.timecode(t + 3 * 3600 + 14 * 60 + 7), rx - 15, ry + 50, { size: 30, color: 'cream', alpha: inP, tracking: 0.12 });
    mono(c, E, '1920×1080 · 60 · IR', rx - 15, ry + 82, { size: 16, color: 'lavender', alpha: inP, tracking: 0.3 });
    // threat meter rises with the riser
    const lvl = E.clamp01(E.seg(t, 0.6, BAR, 'quadIn'));
    const nb = 10, on = Math.ceil(lvl * nb);
    mono(c, E, 'THREAT', W - m - 40 - nb * 22 - 150, H - m - 44, { size: 20, color: 'lavender', alpha: inP, tracking: 0.3 });
    for (let i = 0; i < nb; i++) {
      c.fillStyle = i < on ? (i > 6 ? E.col('alertRed') : i > 3 ? E.col('coneInvestigate') : E.col('conePatrol')) : E.rgba('lavender', 0.25);
      c.globalAlpha = inP; c.fillRect(W - m - 40 - (nb - i) * 22, H - m - 60, 16, 30);
    }
    c.globalAlpha = 1;
  }
  // boot log in the centre before the title lands
  if (t > 0.1 && t < T_TITLE) {
    const lines = ['KC-SEC NET  v4.2', 'LINK ........ OK', 'IR SENSORS .. ARMED'];
    for (let i = 0; i < 3; i++) {
      const p = E.seg(t, 0.12 + i * 0.09, 0.24 + i * 0.09);
      if (p <= 0) continue;
      mono(c, E, E.typewriter(lines[i], p) + (p < 1 ? '▌' : ''), W / 2 - 190, H / 2 - 50 + i * 40, { size: 26, color: i === 2 ? 'catnip' : 'cream' });
    }
  }
  // centre crosshair (hidden during lock)
  if (t < T_LOCK && inP > 0) {
    c.save(); c.strokeStyle = E.rgba('cream', 0.5 * inP); c.lineWidth = 2; c.beginPath();
    c.moveTo(W / 2 - 30, H / 2); c.lineTo(W / 2 - 10, H / 2); c.moveTo(W / 2 + 10, H / 2); c.lineTo(W / 2 + 30, H / 2);
    c.moveTo(W / 2, H / 2 - 30); c.lineTo(W / 2, H / 2 - 10); c.moveTo(W / 2, H / 2 + 10); c.lineTo(W / 2, H / 2 + 30);
    c.stroke(); c.restore();
  }
}

function coldOpen(ctx, t, E) {
  const { W, H } = E;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  // CRT power-on: line grows horizontally, then opens vertically with overshoot
  const pw = E.seg(t, 0, 0.07, 'expoOut');
  const ph = E.seg(t, 0.06, 0.24, 'backOut');
  const vw = W * pw, vh = Math.max(3, H * ph);
  // pre-roll zoom into the lock target over the last 0.3s
  const lead = E.seg(t, BAR - 0.3, BAR, 'expoIn');
  ctx.save();
  ctx.beginPath(); ctx.rect((W - vw) / 2, (H - vh) / 2, vw, vh); ctx.clip();
  E.layer(ctx, (c) => {
    camFeed(c, t, E);
    grade(c, E);
    laserGrid(c, t, E);
    guardCone(c, t, E);
    lockOn(c, t, E);
    titleCard(c, t, E);
    camHud(c, t, E);
    E.crt(c, t, { scan: 0.14, roll: 0.07, flicker: 0.04, vignette: 0.32 });
  }, {
    post: (lc) => {
      // cue-driven glitches
      for (const [gt, d] of GLITCHES) {
        if (t >= gt && t < gt + d + 0.03) E.glitch(lc, { amount: 0.75 * (1 - (t - gt) / (d + 0.03)), seed: Math.floor(t * 60) });
      }
      E.rgbSplit(lc, 2.5 + 10 * lead);
      if (lead > 0) E.zoomBlur(lc, { cx: W / 2, cy: H / 2, strength: 0.18 * lead, samples: 6 });
    },
  });
  ctx.restore();
  // power-on white line
  const line = 1 - E.seg(t, 0.05, 0.16, 'quadOut');
  if (line > 0 && t > 0) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(255,255,255,${0.35 * line})`;
    ctx.fillRect((W - vw) / 2, (H - vh) / 2, vw, vh);
    ctx.shadowColor = '#fff'; ctx.shadowBlur = 40; ctx.fillStyle = `rgba(255,255,255,${line})`;
    const lh = E.lerp(6, 40, E.seg(t, 0.05, 0.16));
    ctx.fillRect((W - vw) / 2, H / 2 - lh / 2, vw, lh);
    ctx.restore();
  }
}

// ============================================================================================
// BAR 2 — THE CREW
// ============================================================================================
function slamCat(c, t, E, id, hit, x, feetY, scale, flip) {
  const lt = t - hit;
  const rec = E.seg(lt, 0, 0.34, 'elasticOut');
  const sx = E.lerp(1.45, 1, rec), sy = E.lerp(0.6, 1, rec);
  // fall smear trail above the cat (first frames)
  const trail = 1 - E.seg(lt, 0, 0.12, 'expoOut');
  if (trail > 0.02) {
    c.save(); c.globalCompositeOperation = 'lighter';
    const g = c.createLinearGradient(0, feetY - 1100, 0, feetY - 120);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, `rgba(252,236,187,${0.7 * trail})`);
    c.fillStyle = g;
    for (let k = -3; k <= 3; k++) c.fillRect(x + k * 34 - 6, feetY - 1100, 12 - Math.abs(k) * 1.4, 980);
    c.restore();
  }
  const row = lt < 0.5 ? 'IDLE' : 'IDLE';
  E.drawSprite(c, id, row, E.spriteFrame(Math.max(0, lt), 12), x, feetY, scale, {
    anchor: 'feet', flip, sx, sy, tint: { color: '#fff', amount: E.env(lt, 0, 0.05) }, outline: { color: '#fcecbb', px: 1 },
  });
  // dust — chunky pixel squares, ballistic
  const parts = E.burst({ seed: id.length * 13 + hit, count: 26, t, t0: hit, x, y: feetY - 6, speed: [500, 1500], angle: [-Math.PI + 0.12, -0.12], gravity: 2600, drag: 2.5, life: [0.3, 0.6], size: [8, 22] });
  for (const p of parts) {
    c.fillStyle = p.r(1) < 0.6 ? E.col('cream') : E.col('coin');
    c.globalAlpha = p.alpha; const s = Math.round(p.size * (1 - p.p * 0.5));
    c.fillRect(Math.round(p.x - s / 2), Math.round(p.y - s / 2), s, s);
  }
  c.globalAlpha = 1;
  E.shockwave(c, x, feetY, E.seg(lt, 0, 0.45), { radius: 520, width: 26, color: 'cream', rings: 2, alpha: 0.8 });
}

function namePlate(c, t, E, hit, x, y, name, tag, color, alpha = 1) {
  const lt = t - hit - 0.05;
  if (lt < 0 || alpha <= 0) return;
  c.save(); c.globalAlpha *= alpha;
  const pb = E.seg(lt, 0, 0.22, 'expoOut');
  const nw = E.measureText(c, name, { size: 96, tracking: 0.06 }) + 70;
  c.fillStyle = E.col('night');
  para(c, x - nw / 2 * pb, x + nw / 2 * pb, y - 58, y + 58, 16);
  c.fill();
  c.fillStyle = E.col(color); c.fillRect(x - nw / 2 * pb - 10, y + 52, nw * pb, 10);
  E.drawText(c, name, x, y + 4, {
    size: 96, tracking: 0.06, color: 'cream',
    perChar: ({ i, n }) => { const q = E.stagger(lt, i, n, { spread: 0.1, dur: 0.18, e: 'backOut' }); return { y: (1 - q) * 60, alpha: E.clamp01(q * 2), scale: E.lerp(0.4, 1, q) }; },
  });
  const tq = E.seg(lt, 0.08, 0.3);
  E.drawText(c, E.scramble(tag, tq, name.length), x, y - 92, { font: 'mono', size: 24, weight: '700', tracking: 0.34, color, alpha: E.clamp01(tq * 3) });
  c.restore();
}

function crewSplit(ctx, t, E) {
  const { W, H } = E;
  const lt = t - T_DROP;
  const two = t >= T_CAT2;
  const l2 = t - T_CAT2;
  // bg
  ctx.fillStyle = E.col('night'); ctx.fillRect(-100, -100, W + 200, H + 200);
  // continuous push + drift so the held split never freezes (3% over the shot, per-beat nudge)
  const drift = 1 + 0.035 * E.seg(lt, 0, 2 * B, 'sineOut') + 0.02 * E.env(t, T_CAT2, 0.12);
  ctx.translate(W / 2, H / 2); ctx.scale(drift, drift); ctx.rotate(0.012 * Math.sin(lt * 3.1)); ctx.translate(-W / 2, -H / 2);
  // iso floor grid drifting (bg parallax)
  E.isoGrid(ctx, { cx: W / 2 + lt * 60, cy: H * 0.78, tile: 160, cols: 14, rows: 14, color: 'grape', alpha: 0.35, lineWidth: 2 });
  // panel A (orange) — slams in, then retreats to the left half when cat 2 lands
  const pa = E.seg(lt, 0, 0.2, 'expoOut');
  const retreat = two ? E.seg(l2, 0, 0.2, 'expoOut') : 0;
  const aRight = E.lerp(E.lerp(-300, W + 300, pa), W * 0.5, retreat);
  ctx.save();
  para(ctx, -400, aRight, 0, H, 220);
  const ga = ctx.createLinearGradient(0, 0, 0, H);
  ga.addColorStop(0, E.col('rust')); ga.addColorStop(1, E.col('ember'));
  ctx.fillStyle = ga; ctx.fill();
  ctx.clip();
  if (halftone) { ctx.fillStyle = ctx.createPattern(halftone, 'repeat'); ctx.translate(E.mod(lt * 160, 22), E.mod(lt * 60, 22)); ctx.fillRect(-100, -40, W + 200, H + 80); }
  ctx.restore();
  // panel B (lavender/pink) from the right
  if (two) {
    const pb = E.seg(l2, 0, 0.2, 'expoOut');
    const bLeft = E.lerp(W + 400, W * 0.5, pb);
    ctx.save();
    para(ctx, bLeft, W + 400, 0, H, 220);
    const gb = ctx.createLinearGradient(0, 0, 0, H);
    gb.addColorStop(0, E.col('grape')); gb.addColorStop(1, E.col('violet'));
    ctx.fillStyle = gb; ctx.fill(); ctx.clip();
    if (halftone) { ctx.fillStyle = ctx.createPattern(halftone, 'repeat'); ctx.translate(-E.mod(l2 * 160, 22), E.mod(l2 * 60, 22)); ctx.fillRect(-100, -40, W + 200, H + 80); }
    ctx.restore();
    // glowing divider
    ctx.save(); ctx.strokeStyle = E.col('cream'); ctx.lineWidth = 8; ctx.shadowColor = E.col('coin'); ctx.shadowBlur = 30;
    ctx.beginPath(); ctx.moveTo(bLeft + 220, 0); ctx.lineTo(bLeft - 220, H); ctx.stroke(); ctx.restore();
  }
  // giant outlined numerals (deep bg)
  E.drawText(ctx, two ? '02' : '01', two ? W * 0.72 - l2 * 50 : W * 0.5 - lt * 60, H * 0.42, {
    font: 'heavy', size: 820, strokeOnly: true, stroke: 'cream', strokeWidth: 5, alpha: 0.22, blend: 'overlay',
  });
  // cats
  const feet = 760;
  const ax = E.lerp(W * 0.5, W * 0.27, retreat);
  slamCat(ctx, t, E, CAT_A, T_DROP, ax + 14 * Math.sin(lt * 5), feet, E.lerp(14, 12, retreat), false);
  namePlate(ctx, t, E, T_DROP, ax, 900, 'BOB', 'AGENT 01 · SHADOW OPS', 'coin');
  if (two) {
    slamCat(ctx, t, E, CAT_B, T_CAT2, W * 0.73 - 14 * Math.sin(l2 * 5), feet, 12, true);
    namePlate(ctx, t, E, T_CAT2, W * 0.73, 900, 'OREO', 'AGENT 02 · TUXEDO', 'pink');
  }
  // fg: catnip sparkles drifting (fast parallax)
  E.particles(9, 22, t, (p) => {
    const x = E.mod(p.r(1) * W * 1.4 - t * (300 + p.r(2) * 500), W + 200) - 100;
    const y = p.r(3) * H;
    const s = 6 + p.r(4) * 12;
    ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 12 + p.i);
    ctx.fillStyle = E.col(p.r(5) < 0.5 ? 'catnipGlow' : 'coin');
    ctx.fillRect(Math.round(x), Math.round(y), s, s / 3); ctx.fillRect(Math.round(x + s / 3), Math.round(y - s / 3), s / 3, s);
  });
  ctx.globalAlpha = 1;
  // letterbox bars snap in (cinematic)
  const lb = 60 * E.seg(lt, 0, 0.15, 'expoOut');
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, lb); ctx.fillRect(0, H - lb, W, lb);
}

function twoCats(ctx, t, E) {
  const { W, H } = E;
  const lt = t - T_TWO;
  ctx.fillStyle = E.col('coin'); ctx.fillRect(-100, -100, W + 200, H + 200);
  // rotating sunburst + drifting halftone so the card never holds still
  ctx.save(); ctx.translate(W / 2, H * 0.45); ctx.rotate(lt * 0.9);
  ctx.fillStyle = E.rgba('ember', 0.16);
  for (let i = 0; i < 16; i++) { ctx.rotate(E.TAU / 16); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(1500, -150); ctx.lineTo(1500, 150); ctx.fill(); }
  ctx.restore();
  if (halftone) { ctx.save(); ctx.globalAlpha = 0.6; ctx.fillStyle = ctx.createPattern(halftone, 'repeat'); ctx.translate(E.mod(-lt * 140, 22), E.mod(lt * 90, 22)); ctx.fillRect(-60, -60, W + 120, H + 120); ctx.restore(); }
  E.speedLines(ctx, t, { cx: W / 2, cy: H * 0.45, count: 70, inner: 380, outer: 1500, width: [3, 16], color: '#fff3d0', alpha: 0.7, seed: 11, fps: 24 });
  // stripes band
  ctx.save(); ctx.globalAlpha = 0.12; ctx.fillStyle = E.col('rust');
  for (let i = -4; i < 30; i++) { const x = i * 90 + E.mod(lt * 300, 90); para(ctx, x, x + 40, H * 0.72, H, 60); ctx.fill(); }
  ctx.restore();
  const push = 1 + 0.07 * E.seg(lt, 0, B, 'sineOut');
  ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(push, push); ctx.rotate(-0.015 + 0.03 * E.seg(lt, 0, B)); ctx.translate(-W / 2, -H / 2);
  // whole word is fully readable ON the beat frame: slam 1.4 -> 1 (backOut, 0.1s), letters only jitter
  const slam = E.seg(lt, 0, 0.1, 'backOut');
  const sm = 1 - E.seg(lt, 0, 0.05);
  if (sm > 0) E.drawText(ctx, 'TWO  CATS.', W / 2, H * 0.42 - 40, { size: 250 * E.lerp(1.4, 1, slam), tracking: 0.04, color: 'ember', alpha: 0.35 * sm, perChar: () => ({ sy: 1.35 }) });
  E.drawText(ctx, 'TWO  CATS.', W / 2, H * 0.42, {
    size: 250, tracking: 0.04, color: 'night', extrude: { depth: 16, dx: 0.6, dy: 1, color: 'ember', dark: 0.45 },
    perChar: ({ i }) => ({ scale: E.lerp(1.4, 1, slam) * (1 + 0.04 * Math.sin(t * 17 + i)), y: (1 - slam) * (i % 2 ? -30 : 30), rot: (1 - slam) * (i % 2 ? 0.12 : -0.12) }),
  });
  // cats face each other, bouncing on the 8ths
  const bob = (k) => -Math.abs(Math.sin((t - T_TWO) * Math.PI / (B / 2) + k)) * 22;
  const ci = E.seg(lt, 0.06, 0.22, 'backOut');
  E.drawSprite(ctx, CAT_A, 'IDLE', E.spriteFrame(t, 12), W / 2 - 250, 880 + bob(0) + (1 - ci) * 400, 8, { anchor: 'feet', outline: { color: '#0d0616', px: 1 } });
  E.drawSprite(ctx, CAT_B, 'IDLE', E.spriteFrame(t, 12), W / 2 + 250, 880 + bob(1.5) + (1 - ci) * 400, 8, { anchor: 'feet', flip: true, outline: { color: '#0d0616', px: 1 } });
  // heart pop between them
  const hp = E.seg(lt, 0.16, 0.36, 'elasticOut');
  if (hp > 0) E.drawImg(ctx, 'heart', W / 2, 760 - hp * 30, { w: 70 * hp, h: 70 * hp, smooth: false });
  ctx.restore();
}

function swapArrows(c, x, y, s, rot, color) {
  c.save(); c.translate(x, y); c.rotate(rot); c.scale(s, s);
  c.fillStyle = color;
  // two opposed pixel arrows
  c.beginPath(); c.moveTo(-40, -14); c.lineTo(20, -14); c.lineTo(20, -30); c.lineTo(46, -8); c.lineTo(20, 14); c.lineTo(20, -2); c.lineTo(-40, -2); c.closePath(); c.fill();
  c.beginPath(); c.moveTo(40, 10); c.lineTo(-20, 10); c.lineTo(-20, -6); c.lineTo(-46, 16); c.lineTo(-20, 38); c.lineTo(-20, 22); c.lineTo(40, 22); c.closePath(); c.fill();
  c.restore();
}

function oneHeist(ctx, t, E) {
  const { W, H } = E;
  const lt = t - T_ONE;
  const whip = E.seg(t, T_WHIP, T_END, 'expoIn');
  ctx.fillStyle = E.col('night'); ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate(-whip * W * 1.2, 0);
  // vault dial rings (bg)
  ctx.save(); ctx.translate(W / 2, H * 0.44);
  const rp = E.seg(lt, 0, 0.3, 'expoOut');
  for (let k = 0; k < 3; k++) {
    ctx.save(); ctx.rotate((k % 2 ? -1 : 1) * (lt * (0.6 + k * 0.4) + (1 - rp) * 1.2));
    ctx.strokeStyle = E.rgba(k === 1 ? 'catnip' : 'grape', 0.55); ctx.lineWidth = k === 1 ? 6 : 14;
    ctx.setLineDash(k === 1 ? [4, 22] : [60, 30]);
    ctx.beginPath(); ctx.arc(0, 0, (360 + k * 120) * E.lerp(0.5, 1, rp), 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
  // fill-snare jolts
  let jolt = 0; for (const f of FILLS) jolt += E.env(t, f, 0.03);
  const jx = E.randSigned('j', Math.floor(t * 120)) * 10 * jolt;
  // readable on the beat frame: whole-word slam 1.4 -> 1, letters settle from a small zig-zag
  const sl = E.seg(lt, 0, 0.1, 'backOut');
  const drift = 1 + 0.04 * E.seg(lt, 0, 0.32, 'sineOut');
  E.drawText(ctx, 'ONE HEIST.', W / 2 + jx, H * 0.42, {
    size: 250, tracking: 0.04, color: 'catnip', extrude: { depth: 18, dx: 0.6, dy: 1, color: 'catnipEmissive', dark: 0.6 },
    glow: { color: E.rgba('catnipGlow', 0.35), blur: 30 },
    perChar: ({ i }) => ({ y: (1 - sl) * (i % 2 ? -40 : 40), scale: E.lerp(1.4, 1, sl) * drift }),
  });
  // cats swap places on each fill hit
  const L = W / 2 - 330, R = W / 2 + 330, feet = 900;
  let n = 0, prog = 1;
  for (const f of FILLS) { if (t >= f) { n++; prog = E.seg(t, f, f + 0.045, 'cubicInOut'); } }
  const swapped = n % 2 === 1;
  const posA = (s) => (s ? R : L), posB = (s) => (s ? L : R);
  const prevS = n > 0 ? (n - 1) % 2 === 1 : false;
  const ax = E.lerp(posA(prevS), posA(swapped), n ? prog : 1);
  const bx = E.lerp(posB(prevS), posB(swapped), n ? prog : 1);
  const arc = n && prog < 1 ? Math.sin(prog * Math.PI) * 160 : 0;
  const ci = E.seg(lt, 0.04, 0.2, 'backOut');
  const dy = (1 - ci) * 400;
  E.drawSprite(ctx, CAT_A, n ? 'JUMPING' : 'IDLE', n ? 3 : E.spriteFrame(t, 12), ax, feet - arc + dy, 8, { anchor: 'feet', flip: ax > W / 2 });
  E.drawSprite(ctx, CAT_B, n ? 'JUMPING' : 'IDLE', n ? 3 : E.spriteFrame(t, 12), bx, feet - arc * 0.6 + dy, 8, { anchor: 'feet', flip: bx > W / 2 });
  // SWAP chip
  if (t >= FILLS[0]) {
    const sp = E.seg(t, FILLS[0], FILLS[0] + 0.12, 'backOut');
    const pulse = 1 + 0.18 * jolt;
    ctx.save(); ctx.translate(W / 2, feet - 110); ctx.scale(sp * pulse, sp * pulse);
    ctx.fillStyle = E.col('pink'); para(ctx, -150, 150, -46, 46, 14); ctx.fill();
    E.drawText(ctx, 'SWAP', 0, 4, { font: 'heavy', size: 58, tracking: 0.14, color: 'night' });
    ctx.restore();
    swapArrows(ctx, W / 2, feet + 20, 1.2 * sp, n * Math.PI, E.col('cream'));
  }
  ctx.restore();
  // catnip-tinted impact flash (a white flash would grey out the night bg)
  const cf = E.env(lt, 0, 0.06);
  if (cf > 0.01) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = E.rgba('catnip', 0.22 * cf); ctx.fillRect(0, 0, W, H); ctx.restore(); }
  // whip streaks
  if (whip > 0) {
    E.speedLinesDir(ctx, t, { angle: Math.PI, count: 60, speed: 9000, length: [300, 1200], width: [2, 10], color: '#fff', alpha: 0.8 * whip, seed: 21 });
  }
}

function crew(ctx, t, E) {
  if (t < T_TWO) crewSplit(ctx, t, E);
  else if (t < T_ONE) twoCats(ctx, t, E);
  else oneHeist(ctx, t, E);
}

export default {
  start: 0.0,
  end: 3.80, // 3.75-3.80: only the white-flash tail of the SWAP whip (fx), nothing drawn
  async init(E) { halftone = makeHalftone(); },
  draw(ctx, t, lt, E) {
    if (t >= T_END) return;
    if (t < T_DROP) coldOpen(ctx, t, E);
    else crew(ctx, t, E);
  },
  fx(t, lt, E) {
    const o = { shake: 0, aberration: 0, flash: 0, glitch: 0, zoom: 1, vignette: 0.35 };
    const F = 1 / 60;
    if (t < T_DROP) {
      // tension: handheld drift, a shake kick on every fx tick, full-frame title slam on 0.469
      o.shake = 2 + 10 * E.seg(t, 0.9375, BAR, 'quadIn') + 12 * E.env(t, T_LOCK, 0.08) + 5 * E.envs(t, TICKS, 0.05) + 10 * E.env(t, T_TITLE, 0.08);
      o.aberration = 6 * E.env(t, T_TITLE, 0.06);
      o.zoom = 1 + 0.03 * E.env(t, T_TITLE, 0.1);
      // anticipation: the last 3 frames before the drop dip to black (no fade-up)
      if (t >= T_DROP - 3 * F) { o.flash = 0.82; o.flashColor = '#07030c'; }
      o.vignette = 0.2;
      return o;
    }
    // bar 2 hits: hard cuts carry them (no white). 1.875 = one inverted frame.
    if (t < T_DROP + F) o.invert = 1;
    const hits = [[T_DROP, 36], [T_CAT2, 24], [T_TWO, 22], [T_ONE, 24]];
    for (const [h, s] of hits) { o.shake += s * E.env(t, h, 0.09); o.aberration += 10 * E.env(t, h, 0.06); }
    for (const f of FILLS) { o.shake += 7 * E.env(t, f, 0.03); o.aberration += 4 * E.env(t, f, 0.03); }
    o.zoom = 1 + 0.05 * E.env(t, T_DROP, 0.12) + 0.03 * E.env(t, T_CAT2, 0.1) + 0.05 * E.env(t, T_TWO, 0.1) + 0.05 * E.env(t, T_ONE, 0.1);
    // SWAP whip: streaks + smear build over the frames BEFORE the 3.75 cut; the cut frame itself is sharp
    const whip = E.seg(t, T_WHIP, T_END, 'expoIn');
    if (t < T_END) {
      o.motionBlur = whip > 0.02 ? 6 : 0;
      o.aberration += 18 * whip;
    } else {
      // 3.75 MONTAGE DROP: one of the three full-strength flashes, 0-frame attack, ~4 frame decay
      o.flash = 0.9 * E.env(t, T_END, 0.028);
      o.shake = 0; o.aberration = 0;
    }
    return o;
  },
};
