// s2 — BARS 3-4 (3.750-7.500): GAMEPLAY MONTAGE
// Four 2-beat chapters, each opened by a callout hit and re-cut on the clap:
//   SNEAK (3.750)  -> clap 4.219: iso-diamond punch into a sneak-past-the-guard shot
//   SWAP  (4.6875) -> clap 5.156: split-screen panels literally trade places
//   MEOW  (5.625)  -> clap 6.094: shockwave rings, diamond inset tracks the lured guard
//   HOLD THE DOOR (6.5625) -> clap 7.031: hazard doors slide apart, then an 8th-note tile
//   cascade + riser that zoom-blurs into a white flash handing off to the STAKES bar at 7.500.
// Everything is a pure function of t.

const START = 3.75, END = 7.5;
const B = 0.46875;          // beat
const CH = 2 * B;            // chapter length
const CW = 1920, CHH = 1080; // captured clip size

// ---------------------------------------------------------------------------------------------
// local helpers
// ---------------------------------------------------------------------------------------------
// Map a normalized clip point (u, v) to screen for a cover-fit clip drawn into (dx,dy,dw,dh).
function clipPt(E, u, v, dx, dy, dw, dh, fx, fy, zoom) {
  const s = E.cover(CW, CHH, dw, dh, fx, fy, zoom);
  return [dx + ((u * CW - s.sx) / s.sw) * dw, dy + ((v * CHH - s.sy) / s.sh) * dh];
}
const ft = (E, name, fileNo) => E.clipFrameTime(name, fileNo);

// Background: deep night gradient, drifting iso floor grid (parallax back layer), beat-pulsed.
function drawBg(ctx, t, E, tint = 'plum') {
  const { W, H } = E;
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, E.col('skyTop')); g.addColorStop(0.55, E.col('skyMid')); g.addColorStop(1, E.col(tint));
  ctx.fillStyle = g; ctx.fillRect(-60, -60, W + 120, H + 120);
  const k = E.cueEnv(t, 'kick', 0.14);
  const drift = E.mod(t * 70, 120);
  E.isoGrid(ctx, { cx: W / 2 + drift, cy: H / 2 + drift * 0.5, tile: 120, cols: 26, rows: 26, color: 'grape', alpha: 0.28 + 0.25 * k, lineWidth: 2 });
  // slow diagonal light bands
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 3; i++) {
    const x = E.mod(t * 240 + i * 700, W + 1200) - 600;
    const lg = ctx.createLinearGradient(x - 200, 0, x + 200, 0);
    lg.addColorStop(0, 'rgba(111,45,168,0)'); lg.addColorStop(0.5, E.rgba('grape', 0.18)); lg.addColorStop(1, 'rgba(111,45,168,0)');
    ctx.fillStyle = lg;
    ctx.setTransform(ctx.getTransform().multiply(new DOMMatrix().skewXSelf(-25)));
    ctx.fillRect(x - 200, -100, 400, H + 200);
  }
  ctx.restore();
}

// Thin panel frame with a security-cam label.
function panelFrame(ctx, E, pts, { color = 'cream', lw = 4, alpha = 1 } = {}) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.lineJoin = 'miter';
  ctx.beginPath(); E.path.poly(ctx, pts);
  ctx.strokeStyle = E.col('outline'); ctx.lineWidth = lw + 6; ctx.stroke();
  ctx.strokeStyle = E.col(color); ctx.lineWidth = lw; ctx.stroke();
  ctx.restore();
}

// Callout: reticle on the target, elbow leader line, big kinetic word + mono sub-line on a slab.
// a = seconds since the callout hit.
function callout(ctx, E, t, a, o) {
  const { tx, ty, lx, ly, word, sub, color = 'catnip', size = 170, side = 1, idx = '01', subT = a } = o;
  const subSize = 30;
  const subStr = `${idx} // ${sub}`;
  const subW = E.measureText(ctx, subStr, { size: subSize, font: 'mono', tracking: 0.18, weight: 700 }) + 70;
  if (a < 0) return;
  // --- reticle
  const rp = E.seg(a, 0, 0.22, 'backOut');
  const rr = E.lerp(170, 64, rp) + 6 * Math.sin(t * 18) * E.seg(a, 0.22, 0.4);
  const rot = E.lerp(E.PI / 2, 0, E.seg(a, 0, 0.26, 'expoOut'));
  ctx.save();
  ctx.translate(tx, ty); ctx.rotate(rot);
  ctx.globalAlpha = E.seg(a, 0, 0.05);
  ctx.lineWidth = 6; ctx.lineCap = 'square';
  for (let q = 0; q < 4; q++) {
    ctx.save(); ctx.rotate((q * E.PI) / 2);
    ctx.strokeStyle = E.col('outline'); ctx.lineWidth = 12;
    ctx.beginPath(); ctx.moveTo(rr, rr - 26); ctx.lineTo(rr, rr); ctx.lineTo(rr - 26, rr); ctx.stroke();
    ctx.strokeStyle = E.col(color); ctx.lineWidth = 6; ctx.stroke();
    ctx.restore();
  }
  // center pip, pulsing
  const pip = 7 + 5 * E.env(a, 0, 0.2);
  ctx.fillStyle = E.col(color); ctx.beginPath(); E.path.diamond(ctx, 0, 0, pip * 2, pip * 2); ctx.fill();
  ctx.restore();
  // ring ping on hit
  E.shockwave(ctx, tx, ty, E.seg(a, 0, 0.45), { radius: 190, width: 10, color, rings: 2, gap: 0.2 });

  // --- leader line: target -> elbow -> label
  const ey = ly + 70;
  const endX = side > 0 ? lx + subW + 16 : lx - subW - 16;
  const dir = Math.sign(endX - tx) || 1;
  const ex = tx + dir * Math.min(160, Math.abs(endX - tx) * 0.4);
  const segs = [[tx + dir * rr * 0.72, ty + rr * 0.72 * Math.sign(ey - ty || -1)], [ex, ey], [endX, ey]];
  const lp = E.seg(a, 0.04, 0.26, 'expoOut');
  const L1 = Math.hypot(segs[1][0] - segs[0][0], segs[1][1] - segs[0][1]);
  const L2 = Math.abs(segs[2][0] - segs[1][0]);
  let rem = lp * (L1 + L2);
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const pathLine = () => {
    ctx.beginPath(); ctx.moveTo(segs[0][0], segs[0][1]);
    const f1 = Math.min(1, rem / L1);
    const p1 = [E.lerp(segs[0][0], segs[1][0], f1), E.lerp(segs[0][1], segs[1][1], f1)];
    ctx.lineTo(p1[0], p1[1]);
    let tip = p1;
    if (rem > L1) { const f2 = Math.min(1, (rem - L1) / L2); tip = [E.lerp(segs[1][0], segs[2][0], f2), ey]; ctx.lineTo(tip[0], tip[1]); }
    return tip;
  };
  ctx.strokeStyle = E.col('outline'); ctx.lineWidth = 11; pathLine(); ctx.stroke();
  ctx.strokeStyle = E.col(color); ctx.lineWidth = 5; const tip = pathLine(); ctx.stroke();
  if (lp > 0.01) { ctx.fillStyle = E.col('cream'); ctx.beginPath(); E.path.circle(ctx, tip[0], tip[1], 9); ctx.fill(); }
  ctx.restore();

  // --- slab + sub-line
  const align = side > 0 ? 'left' : 'right';
  const sp = E.seg(a, 0.0, 0.12, 'expoOut');
  const sx0 = side > 0 ? lx : lx - subW * sp;
  ctx.save();
  ctx.translate(0, ly + 70);
  ctx.transform(1, 0, -0.25, 1, 0, 0);
  ctx.fillStyle = E.col(color);
  ctx.fillRect(sx0 + 12, -26, subW * sp, 52);
  ctx.fillStyle = E.col('outline');
  ctx.fillRect(sx0 + 12 + (side > 0 ? 0 : subW * sp - 10), -26, 10, 52);
  ctx.restore();
  if (sp > 0.3) {
    // clean mask wipe riding the slab (no scrambled glyphs on the hit frames)
    E.wipeText(ctx, `${idx} // ${sub}`, lx + side * 44, ly + 71, {
      size: subSize, font: 'mono', weight: 700, color: 'night', align, tracking: 0.18,
    }, E.seg(subT, 0, 0.1, 'expoOut'), { cursor: false });
  }

  // --- word: per-letter slam with overshoot, extruded
  E.drawText(ctx, word, lx, ly - 32, {
    size, align, color: 'cream', tracking: 0.04,
    extrude: { depth: 12, dx: 0.6, dy: 1, color: 'plum', dark: 0.6 },
    stroke: 'outline', strokeWidth: 10,
    perChar: ({ i, n }) => {
      const k = side > 0 ? i : n - 1 - i;
      const q = E.seg(a, k * 0.008, k * 0.008 + 0.1);
      const e = E.backOut(q, 2.4);
      const hit = E.env(a, 0, 0.05);
      return { y: (1 - e) * -40, scale: E.lerp(1.5, 1, e), sy: 1 + 0.2 * (1 - q), rot: (1 - e) * 0.12 * (k % 2 ? 1 : -1), color: hit > 0.5 ? '#ffffff' : null };
    },
  });
}

// Security-cam HUD overlay (foreground layer shared by every chapter).
function hud(ctx, t, lt, E, camId, chapter) {
  const { W, H } = E;
  const m = 44, L = 70;
  const k = E.cueEnv(t, 'kick', 0.1);
  ctx.save();
  ctx.strokeStyle = E.rgba('cream', 0.85); ctx.lineWidth = 4;
  const o = 6 * k;
  for (const [x, y, sx, sy] of [[m - o, m - o, 1, 1], [W - m + o, m - o, -1, 1], [m - o, H - m + o, 1, -1], [W - m + o, H - m + o, -1, -1]]) {
    ctx.beginPath(); ctx.moveTo(x, y + sy * L); ctx.lineTo(x, y); ctx.lineTo(x + sx * L, y); ctx.stroke();
  }
  ctx.restore();
  // REC + cam id
  const blink = Math.floor(t * 4) % 2 === 0;
  ctx.save();
  ctx.fillStyle = E.col('alertRed'); ctx.globalAlpha = blink ? 1 : 0.35;
  ctx.beginPath(); E.path.circle(ctx, m + 40, m + 44, 11); ctx.fill();
  ctx.restore();
  E.drawText(ctx, 'REC', m + 62, m + 45, { size: 26, font: 'mono', weight: 700, color: 'cream', align: 'left', tracking: 0.2 });
  E.drawText(ctx, camId, m + 150, m + 45, { size: 26, font: 'mono', weight: 700, color: 'catnip', align: 'left', tracking: 0.2 });
  E.drawText(ctx, E.timecode(t + 3600 * 2 + 60 * 17), W - m - 30, m + 45, { size: 26, font: 'mono', weight: 700, color: 'cream', align: 'right', tracking: 0.12 });
  E.drawText(ctx, 'KIBBLE CORP // SEC-NET', W - m - 30, m + 80, { size: 18, font: 'mono', weight: 700, color: 'lavender', align: 'right', tracking: 0.3 });

  // chapter strip: four ticks, active one fills & pops
  const names = ['SNEAK', 'SWAP', 'MEOW', 'HOLD'];
  const y = H - m - 40, x0 = W / 2 - 3 * 150;
  for (let i = 0; i < 4; i++) {
    const on = i === chapter, done = i < chapter;
    const pa = on ? E.seg(lt - i * CH, 0, 0.18, 'backOut') : 0;
    const x = x0 + i * 300;
    ctx.save();
    ctx.fillStyle = E.col(done ? 'grape' : on ? 'catnip' : 'plum');
    ctx.globalAlpha = on ? 1 : 0.8;
    const w = 250 * (on ? (lt - i * CH) / CH : done ? 1 : 0);
    ctx.fillRect(x - 125, y + 18, 250, 6);
    ctx.fillStyle = E.col(on ? 'catnip' : 'lavender');
    ctx.fillRect(x - 125, y + 18, Math.max(0, w), 6);
    ctx.restore();
    E.drawText(ctx, names[i], x, y - 4 - 8 * pa * (1 - E.seg(lt - i * CH, 0.18, 0.4)), {
      size: 22 + 6 * pa, font: 'mono', weight: 700, color: on ? 'cream' : done ? 'lavender' : 'grape', tracking: 0.35,
    });
  }
}

// Foreground parallax: out-of-focus catnip leaves & dust drifting (nearest layer).
function fgParticles(ctx, t, E, amt = 1) {
  const { W, H } = E;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 26; i++) {
    const r = (k) => E.rand('s2fg', i, k);
    const depth = 0.3 + r(1) * 0.7;
    const x = E.mod(r(2) * W - t * (120 + 520 * depth), W + 200) - 100;
    const y = E.mod(r(3) * H + Math.sin(t * (1 + r(4)) + i) * 40 - t * 60 * depth, H + 200) - 100;
    const s = 3 + depth * 9;
    ctx.globalAlpha = amt * (0.15 + 0.35 * depth);
    ctx.fillStyle = E.col(r(5) > 0.6 ? 'catnipGlow' : r(5) > 0.3 ? 'coin' : 'lilac');
    ctx.fillRect(Math.round(x), Math.round(y), s, s);
  }
  ctx.restore();
}

function heroChip(ctx, E, t, id, x, y, scale, { ring = 0, label = '', color = 'coin', flip = false } = {}) {
  ctx.save();
  ctx.fillStyle = E.rgba('night', 0.82);
  ctx.beginPath(); E.path.diamond(ctx, x, y, 210, 210); ctx.fill();
  ctx.strokeStyle = E.col(color); ctx.lineWidth = 6; ctx.stroke();
  ctx.restore();
  if (ring > 0) E.shockwave(ctx, x, y, 1 - ring, { radius: 170, width: 14, color, rings: 1 });
  E.drawSprite(ctx, id, 'IDLE', E.spriteFrame(t, 12), x, y + 6, scale, { flip, outline: { color: '#2a0f1f', px: 1 } });
  if (label) E.drawText(ctx, label, x, y + 128, { size: 22, font: 'mono', weight: 700, color: 'cream', tracking: 0.3 });
}

// ---------------------------------------------------------------------------------------------
// Chapter 1: SNEAK  (lt 0 .. CH)
// ---------------------------------------------------------------------------------------------
function chSneak(ctx, t, a, E) {
  const { W, H } = E;
  // Shot A (beat 0): h05 coin run, sentry cones turning. 3 diagonal slices slam in, whip-settle.
  const clipA = 'h05-coin-run';
  const ctA = ft(E, clipA, 52) + a;
  const zA = E.lerp(1.55, 1.22, E.seg(a, 0, 0.9, 'expoOut'));
  const fx = 0.48, fy = 0.46;
  const sl = E.slices(3, { angle: E.deg(-14), gap: 22 });
  drawBg(ctx, t, E);
  // slices land staggered; each carries a slightly different punch so the seams read as cuts,
  // and they converge to one zoom by the clap (the "shatter" heals into a single shot)
  const heal = E.seg(a, 0.18, B, 'expoInOut');
  sl.forEach((s, i) => {
    const p = E.seg(a, i * 0.04, i * 0.04 + 0.2, 'expoOut');
    const dy = (1 - p) * (i % 2 ? -1 : 1) * 1200;
    const zi = zA * E.lerp([1.0, 1.18, 0.9][i], 1, heal);
    ctx.save(); ctx.translate(0, dy);
    E.mask(ctx, (c) => E.path.poly(c, s.pts), (c) => {
      E.drawClip(c, clipA, ctA - [0, 0.07, 0.14][i] * (1 - heal), 0, -dy, W, H, { fx, fy, zoom: zi });
      const fl = E.env(a, i * 0.04 + 0.2, 0.07);
      if (fl > 0.01) { c.fillStyle = E.rgba('cream', 0.5 * fl); c.fillRect(0, 0, W, H); }
    });
    panelFrame(ctx, E, s.pts, { color: i === 1 ? 'conePatrol' : 'cream', lw: 4, alpha: 1 - 0.5 * heal });
    ctx.restore();
  });
  // seams glow in after landing
  const cat = [fx * W, fy * H];

  // Shot B (clap): iso diamond window punches open onto the sneak-past-the-guard moment.
  const b = a - B;
  if (b >= 0) {
    const clipB = 'h02-meow-lure';
    const ctB = ft(E, clipB, 84) + b;
    const dp = E.seg(b, 0, 0.24, 'backOut');
    const cx = W * 0.5, cy = H * 0.5;
    // darken + desaturate the outer shot
    ctx.save(); ctx.fillStyle = E.rgba('night', 0.55 * E.seg(b, 0, 0.1)); ctx.fillRect(0, 0, W, H); ctx.restore();
    const dw = 1500 * dp, dh = 900 * dp;
    const fxB = E.lerp(0.74, 0.76, E.seg(b, 0, 0.47)), fyB = 0.44;
    var zB = E.lerp(2.1, 1.7, E.seg(b, 0, 0.47, 'expoOut'));
    var dogPt = clipPt(E, 0.766, 0.475, 0, 0, W, H, fxB, fyB, zB);
    E.mask(ctx, (c) => E.path.diamond(c, cx, cy, dw, dh), (c) => {
      E.drawClip(c, clipB, ctB, 0, 0, W, H, { fx: fxB, fy: fyB, zoom: zB });
    });
    ctx.save(); ctx.beginPath(); E.path.diamond(ctx, cx, cy, dw, dh);
    ctx.strokeStyle = E.col('outline'); ctx.lineWidth = 14; ctx.stroke();
    ctx.strokeStyle = E.col('conePatrol'); ctx.lineWidth = 6; ctx.stroke(); ctx.restore();
    // echo diamond
    ctx.save(); ctx.globalAlpha = 1 - E.seg(b, 0, 0.35); ctx.beginPath();
    E.path.diamond(ctx, cx, cy, dw * (1 + 0.3 * E.seg(b, 0, 0.35, 'expoOut')), dh * (1 + 0.3 * E.seg(b, 0, 0.35, 'expoOut')));
    ctx.strokeStyle = E.col('cream'); ctx.lineWidth = 4; ctx.stroke(); ctx.restore();
  }
  const tgt = b >= 0 ? dogPt : cat;
  callout(ctx, E, t, a, {
    tx: tgt[0], ty: tgt[1], lx: 130, ly: 300, word: 'SNEAK', sub: b >= 0 ? 'SLIP PAST THE DOGS' : 'STAY OUT OF THE CONES', subT: b >= 0 ? b + 0.12 : a, idx: '01', color: 'conePatrol', side: 1,
  });
}

// ---------------------------------------------------------------------------------------------
// Chapter 2: SWAP  — split screen; on the clap the panels trade sides
// ---------------------------------------------------------------------------------------------
function chSwap(ctx, t, a, E) {
  const { W, H } = E;
  drawBg(ctx, t, E, 'violet');
  const b = a - B;
  const sw = E.seg(b, 0, 0.2, 'snap');           // 0 -> 1 swap progress on the clap
  const inP = E.seg(a, 0, 0.22, 'expoOut');       // entry
  const gap = 64;
  const skew = Math.tan(E.deg(12)) * H;
  // two panels, each a parallelogram half; left/right positions
  const panelPts = (side, off) => {
    const hw = W / 2;
    const x0 = side < 0 ? -skew : hw + gap / 2;
    const x1 = side < 0 ? hw - gap / 2 : W + skew;
    return [[x0 + skew / 2 + off, 0], [x1 + skew / 2 + off, 0], [x1 - skew / 2 + off, H], [x0 - skew / 2 + off, H]];
  };
  const clips = [
    { name: 'h04-key-doors', ct: ft(E, 'h04-key-doors', 24) + a - 0.06, fx: 0.52, fy: 0.42, hero: 'bob', col: 'coin' },
    { name: 'h07-split-shift', ct: ft(E, 'h07-split-shift', 16) + b - 0.04, fx: 0.52, fy: 0.46, hero: 'oreo', col: 'pink' },
  ];
  // entry: left comes from the left, right from the right
  const entryOff = [(1 - inP) * -W * 0.6, (1 - inP) * W * 0.6];
  // swap slide: panel0 moves from left half to right half and vice versa
  const slide = W / 2 + gap / 2;
  const offs = [entryOff[0] + sw * slide, entryOff[1] - sw * slide];
  const mbAmt = Math.sin(sw * E.PI);
  for (let i = 0; i < 2; i++) {
    const c = clips[i];
    const pts = panelPts(i === 0 ? -1 : 1, 0).map(([x, y]) => [x + offs[i], y]);
    // vertical nudge crossing so panels pass each other (one drops, one lifts)
    const dy = mbAmt * (i === 0 ? 70 : -70);
    const P = pts.map(([x, y]) => [x, y + dy]);
    const cx = (P[0][0] + P[2][0]) / 2;
    const pw = W / 2 + skew;
    E.mask(ctx, (cc) => E.path.poly(cc, P), (cc) => {
      E.drawClip(cc, c.name, c.ct, cx - pw / 2, dy, pw, H, { fx: c.fx, fy: c.fy, zoom: 1.5 + 0.12 * E.seg(a, 0, CH, 'sineInOut') + 0.2 * E.env(b, 0, 0.18) });
      // tint on swap
      if (mbAmt > 0) { cc.fillStyle = E.rgba(c.col, 0.25 * mbAmt); cc.fillRect(0, 0, W, H); }
    });
    panelFrame(ctx, E, P, { color: c.col, lw: 5 });
  }
  // glowing divider band along the seam (moves with the swap: pulses at mid-swap)
  {
    const glow = 0.6 + 0.4 * Math.sin(t * 20) * 0.3 + mbAmt;
    const mx = W / 2;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = E.rgba('coin', 0.55 * glow); ctx.lineWidth = 26 + 30 * mbAmt;
    ctx.beginPath(); ctx.moveTo(mx + skew / 2, -20); ctx.lineTo(mx - skew / 2, H + 20); ctx.stroke();
    ctx.strokeStyle = E.col('cream'); ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(mx + skew / 2, -20); ctx.lineTo(mx - skew / 2, H + 20); ctx.stroke();
    ctx.restore();
  }
  // panel number tags
  for (let i = 0; i < 2; i++) {
    const side = (i === 0 ? -1 : 1) * (1 - 2 * sw);
    const x = W / 2 + side * 520 + offs[i] * 0, y = H - 190;
    const tp = E.seg(a, 0.1 + i * 0.05, 0.3 + i * 0.05, 'backOut');
    E.drawText(ctx, String(i + 1), x, y, { size: 150 * tp, color: clips[i].col, extrude: { depth: 10, color: 'outline' }, stroke: 'outline', strokeWidth: 10 });
  }
  // center seam: hero chips swap along an arc, gold ring pulse on each swap
  const cy = H * 0.5;
  const chipP = E.seg(a, 0.05, 0.3, 'backOut');
  for (let i = 0; i < 2; i++) {
    const baseX = i === 0 ? W * 0.5 - 150 : W * 0.5 + 150;
    const targX = i === 0 ? W * 0.5 + 150 : W * 0.5 - 150;
    const x = E.lerp(baseX, targX, sw);
    const y = cy + 250 + Math.sin(sw * E.PI) * (i === 0 ? -170 : 170);
    const ring = i === 0 ? 1 - E.seg(a, 0, 0.4) : 1 - E.seg(b, 0, 0.4);
    ctx.save(); ctx.translate(x, y); ctx.scale(chipP, chipP); ctx.translate(-x, -y);
    heroChip(ctx, E, t, clips[i].hero, x, y, 3.2, { ring: b >= 0 || i === 0 ? ring : 0, label: i === 0 ? 'CAT 1' : 'CAT 2', color: clips[i].col, flip: i === 1 });
    ctx.restore();
  }
  // swap arrows circling between chips
  const ar = E.seg(a, 0.08, 0.3, 'expoOut');
  const spin = E.lerp(0, E.PI, E.seg(b, 0, 0.25, 'backOut')) + t * 0.6;
  ctx.save(); ctx.translate(W / 2, cy + 250); ctx.rotate(spin); ctx.globalAlpha = ar;
  ctx.strokeStyle = E.col('cream'); ctx.lineWidth = 8; ctx.lineCap = 'round';
  for (let k = 0; k < 2; k++) {
    ctx.rotate(E.PI);
    ctx.beginPath(); ctx.arc(0, 0, 70, -0.3, E.PI * 0.75); ctx.stroke();
    const ax = Math.cos(E.PI * 0.75) * 70, ay = Math.sin(E.PI * 0.75) * 70;
    ctx.fillStyle = E.col('cream'); ctx.beginPath();
    ctx.moveTo(ax - 18, ay - 4); ctx.lineTo(ax + 10, ay - 22); ctx.lineTo(ax + 8, ay + 14); ctx.closePath(); ctx.fill();
  }
  ctx.restore();

  // SWAP word — centered, flips vertically on the clap (squash through 0)
  const flip = b >= 0 ? Math.cos(E.seg(b, 0, 0.2, 'expoOut') * E.PI) : 1; // 1 -> -1
  const sy = b >= 0 ? Math.abs(flip) * (1 + 0.15 * E.env(b, 0.2, 0.1)) : 1;
  const wordCol = b >= 0 && E.seg(b, 0, 0.2) > 0.5 ? 'pink' : 'coin';
  E.drawText(ctx, 'SWAP', W / 2, H * 0.3, {
    size: 230, color: 'cream', tracking: 0.08,
    extrude: { depth: 14, dx: 0.5, dy: 1, color: wordCol, dark: 0.7 }, stroke: 'outline', strokeWidth: 12,
    perChar: ({ i, n }) => {
      // whole, un-offset glyphs from the cue frame on: the overshoot lives in scale only
      const q = E.seg(a, 0, 0.22);
      const e = E.elasticOut(q, 1, 0.45);
      const dir = i % 2 ? 1 : -1;
      return { y: (1 - e) * dir * 14, scale: E.lerp(1.5, 1, e), sy: Math.max(0.02, sy), rot: (1 - e) * dir * 0.05 };
    },
  });
  const subP = E.seg(a, 0.0, 0.14, 'expoOut');
  E.wipeText(ctx, '02 // CONTROL BOTH CATS', W / 2, H * 0.3 + 150, {
    size: 30, font: 'mono', weight: 700, color: 'cream', tracking: 0.18,
  }, E.seg(a, 0, 0.1, 'expoOut'), { cursorColor: 'coin' });
}

// ---------------------------------------------------------------------------------------------
// Chapter 3: MEOW — lure the guard with a shockwave
// ---------------------------------------------------------------------------------------------
function chMeow(ctx, t, a, E) {
  const { W, H } = E;
  const clip = 'h02-meow-lure';
  const ct = ft(E, clip, 43) + a;
  const fx = 0.485, fy = 0.46;
  const z = E.lerp(2.3, 1.18, E.seg(a, 0, 0.55, 'expoOut')) + 0.35 * E.env(a - B, 0, 0.2);
  // subtle radial wobble: draw clip twice (sound-wave pulse), second pass slightly scaled with lighter blend
  E.drawClip(ctx, clip, ct, 0, 0, W, H, { fx, fy, zoom: z });
  const cat = [fx * W, fy * H];
  const pulseA = E.env(a, 0, 0.25);
  if (pulseA > 0.02) {
    ctx.save(); ctx.globalAlpha = 0.2 * pulseA; ctx.globalCompositeOperation = 'lighter';
    E.drawClip(ctx, clip, ct, 0, 0, W, H, { fx, fy, zoom: z * (1 + 0.06 * (1 - pulseA)) });
    ctx.restore();
  }
  // pink tint wash that decays
  ctx.save(); ctx.fillStyle = E.rgba('pink', 0.14 * E.env(a, 0, 0.2)); ctx.globalCompositeOperation = 'screen'; ctx.fillRect(0, 0, W, H); ctx.restore();
  // big shockwave rings (graphic, over the game's own rings)
  for (let k = 0; k < 4; k++) {
    const p = E.seg(a, k * 0.09, k * 0.09 + 0.7);
    E.shockwave(ctx, cat[0], cat[1], p, { radius: 1300, width: 36 - k * 6, color: k % 2 ? 'pink' : 'catnipGlow', rings: 1, ease: 'expoOut' });
  }
  // sound bars radiating (equalizer spikes around the cat)
  ctx.save(); ctx.translate(cat[0], cat[1]);
  const barsOn = E.win(a, 0, 0.9, 0.04, 0.2);
  for (let i = 0; i < 28; i++) {
    const ang = (i / 28) * E.TAU + 0.1;
    const amp = (0.4 + 0.6 * Math.abs(E.noise1(t * 14 + i * 1.7, 5))) * barsOn * (0.4 + 0.6 * E.env(a, 0, 0.35));
    const r0 = 120 + 60 * E.seg(a, 0, 0.3, 'expoOut');
    ctx.save(); ctx.rotate(ang);
    ctx.fillStyle = E.col(i % 2 ? 'pink' : 'cream');
    ctx.fillRect(r0, -5, 30 + 150 * amp, 10);
    ctx.restore();
  }
  ctx.restore();

  // Clap: diamond inset tracks the lured guard ("?")
  const b = a - B;
  if (b >= 0) {
    const gp = E.seg(b, 0, 0.22, 'backOut');
    const ix = W * 0.76, iy = H * 0.6, s = 560 * gp;
    // guard focus (normalized) drifting as it walks off its post
    const gq = E.seg(b, 0, 0.47);
    const gu = E.lerp(0.66, 0.72, gq), gv = E.lerp(0.67, 0.59, gq) - 0.03;
    const cz = E.lerp(0.26, 0.32, E.seg(b, 0, 0.47, 'expoOut'));
    E.mask(ctx, (c) => E.path.diamond(c, ix, iy, s * 1.3, s), (c) => {
      c.fillStyle = E.col('night'); c.fillRect(0, 0, W, H);
      E.drawClip(c, clip, ct, ix - 420, iy - 240, 840, 480, { crop: [gu - cz / 2, gv - cz / 2, cz, cz], fit: 'stretch' });
    });
    ctx.save(); ctx.beginPath(); E.path.diamond(ctx, ix, iy, s * 1.3, s);
    ctx.strokeStyle = E.col('outline'); ctx.lineWidth = 14; ctx.stroke();
    ctx.strokeStyle = E.col('coneInvestigate'); ctx.lineWidth = 6; ctx.stroke(); ctx.restore();
    // "?" pop
    const qp = E.seg(b, 0.06, 0.28, 'elasticOut');
    E.drawText(ctx, '?', ix + 250 * gp, iy - 250 * gp, {
      size: 150 * qp, color: 'coneInvestigate', extrude: { depth: 8, color: 'outline' }, stroke: 'outline', strokeWidth: 10,
      perChar: () => ({ rot: Math.sin(t * 12) * 0.12 }),
    });
    E.wipeText(ctx, 'GUARD LURED', ix, iy + s * 0.5 + 34, {
      size: 26, font: 'mono', weight: 700, color: 'coneInvestigate', tracking: 0.35,
    }, E.seg(b, 0.02, 0.1, 'expoOut'));
  }
  // MEOW word: letters ride a sine "sound wave"
  E.drawText(ctx, 'MEOW', W * 0.27, H * 0.7, {
    size: 250, color: 'cream', tracking: 0.02,
    extrude: { depth: 14, dx: 0.6, dy: 1, color: 'pink', dark: 0.65 }, stroke: 'outline', strokeWidth: 12,
    perChar: ({ i }) => {
      const q = E.seg(a, i * 0.01, i * 0.01 + 0.12);
      const e = E.backOut(q, 3);
      const wave = Math.sin(t * 16 - i * 1.1) * 22 * (0.4 + E.env(a, 0, 0.4));
      return { y: wave + (1 - e) * 60, scale: E.lerp(1.5, 1, e) + 0.1 * E.env(a, 0.12, 0.1), rot: Math.sin(t * 9 + i) * 0.05 };
    },
  });
  const subP = E.seg(a, 0.0, 0.12, 'expoOut');
  ctx.save(); ctx.globalAlpha = subP;
  ctx.translate(W * 0.27, H * 0.7 + 160); ctx.transform(1, 0, -0.25, 1, 0, 0);
  ctx.fillStyle = E.col('pink'); const sw = 520 * subP; ctx.fillRect(-sw / 2, -26, sw, 52);
  ctx.restore();
  E.wipeText(ctx, '03 // DISTRACT THE GUARD', W * 0.27, H * 0.7 + 161, { size: 28, font: 'mono', weight: 700, color: 'night', tracking: 0.16 }, subP, { cursor: false });
}

// ---------------------------------------------------------------------------------------------
// Chapter 4: HOLD THE DOOR — hazard doors slide apart; clap -> tile cascade + riser -> flash
// ---------------------------------------------------------------------------------------------
function hazard(ctx, E, x, y, w, h, off) {
  E.mask(ctx, (c) => E.path.rect(c, x, y, w, h), (c) => {
    c.fillStyle = E.col('outline'); c.fillRect(x, y, w, h);
    c.fillStyle = E.col('conePatrol');
    for (let k = -8; k < (w + h) / 40 + 8; k++) {
      const sx = x + k * 80 + E.mod(off, 80);
      c.beginPath(); c.moveTo(sx, y); c.lineTo(sx + 40, y); c.lineTo(sx + 40 - h, y + h); c.lineTo(sx - h, y + h); c.closePath(); c.fill();
    }
  });
}
function chDoor(ctx, t, a, E) {
  const { W, H } = E;
  const clip = 'h01-plate-swap';
  const b = a - B;
  drawBg(ctx, t, E, 'grape');
  // Base shot: h01, plate pressed exactly on the downbeat (f16), then played at 0.45x so the swap
  // glide to cat 2 (f19-f22) reads as a held, dramatic beat. Continues (darkened) under the cascade.
  const FX = 0.64, FY = 0.36; // plate + held door, not the skyline
  const ct = ft(E, clip, 16) + Math.min(a, B) * 0.45 + Math.max(0, b) * 1.0;
  const z = E.lerp(1.7, 1.4, E.seg(a, 0, B, 'expoOut')) + (b > 0 ? 0.25 * E.seg(b, 0, B, 'expoIn') : 0);
  E.drawClip(ctx, clip, ct, 0, 0, W, H, { fx: FX, fy: FY, zoom: z });
  if (b < 0) {
    // shutters: top and bottom pull apart with overshoot and settle "held" open
    const hold = E.keys(a, [[0, 0], [0.16, 1.06, 'expoOut'], [0.3, 0.93, 'sineInOut'], [0.47, 0.97, 'sineInOut']]);
    const gapH = hold * H * 0.43;
    const topH = H / 2 - gapH;
    hazard(ctx, E, -40, -40, W + 80, topH + 40, t * 300);
    hazard(ctx, E, -40, H / 2 + gapH, W + 80, H / 2 - gapH + 40, -t * 300);
    ctx.save(); ctx.fillStyle = E.col('cream');
    ctx.fillRect(-40, topH - 6, W + 80, 6); ctx.fillRect(-40, H / 2 + gapH, W + 80, 6); ctx.restore();
    // plate-cat track (clip-normalized, measured from frames f16/f19/f22 at 0.45x speed)
    const fno = Math.floor(ct * 30 + 1e-6) + 1; // file number actually on screen
    const pu = E.keys(fno, [[16, 0.51], [18, 0.505], [19, 0.425], [22, 0.2], [26, 0.075]]);
    const pv = E.keys(fno, [[16, 0.48], [18, 0.485], [19, 0.555], [22, 0.655], [26, 0.7]]);
    const [px, py] = clipPt(E, pu, pv, 0, 0, W, H, FX, FY, z);
    callout(ctx, E, t, a, { tx: px, ty: py, lx: W - 130, ly: H * 0.3, word: 'HOLD', sub: 'PRESSURE PLATE', idx: '04', color: 'conePatrol', side: -1, size: 150 });
    E.drawText(ctx, 'THE DOOR', W - 130, H * 0.3 + 172, {
      size: 100, align: 'right', color: 'conePatrol', tracking: 0.06, extrude: { depth: 8, color: 'outline' }, stroke: 'outline', strokeWidth: 8,
      perChar: ({ i, n }) => {
        const q = E.seg(a, (n - 1 - i) * 0.006, (n - 1 - i) * 0.006 + 0.1);
        return { x: (1 - E.backOut(q)) * 60, scale: E.lerp(1.4, 1, E.backOut(q)) };
      },
    });
    return;
  }
  // clap (7.031) + riser: tiles slam onto the running shot on 16th-note-ish steps, camera pushes,
  // coins stream to center, zoom-blur and white flash into the STAKES bar.
  ctx.save(); ctx.fillStyle = E.rgba('night', 0.45 + 0.25 * E.seg(b, 0, B)); ctx.fillRect(0, 0, W, H); ctx.restore();
  const cuts = [0, 0.117, 0.234, 0.3515];         // 7.031, 7.148, 7.266, 7.383 (pickup kick)
  const tiles = [
    { name: 'h01-plate-swap', ct: ft(E, 'h01-plate-swap', 23) + b, fx: 0.58, fy: 0.42, z: 1.6, col: 'conePatrol', lab: 'CAT 2 SLIPS THROUGH' },
    { name: 'h07-split-shift', ct: ft(E, 'h07-split-shift', 12) + b, fx: 0.5, fy: 0.46, z: 1.7, col: 'pink', lab: 'DOOR OPEN' },
    { name: 'h04-key-doors', ct: ft(E, 'h04-key-doors', 99) + b, fx: 0.55, fy: 0.46, z: 1.8, col: 'coin', lab: 'KEY GET' },
    { name: 'h05-coin-run', ct: ft(E, 'h05-coin-run', 61) + b, fx: 0.49, fy: 0.46, z: 1.9, col: 'catnip', lab: '+ CATNIP' },
  ];
  const push = 1 + 0.1 * E.seg(b, 0, B, 'expoIn');
  const gap = 22, tw = (W - gap * 3) / 2, th = (H - gap * 3) / 2;
  ctx.save();
  ctx.translate(W / 2, H / 2); ctx.scale(push, push); ctx.rotate(0.03 * E.seg(b, 0, B, 'expoIn')); ctx.translate(-W / 2, -H / 2);
  tiles.forEach((tl, i) => {
    const c0 = cuts[i];
    const q = E.seg(b, c0, c0 + 0.09);
    if (q <= 0) return;
    const p = E.backOut(q, 2.2);
    const col = i % 2, row = i >> 1;
    const x = gap + col * (tw + gap), y = gap + row * (th + gap);
    const cx = x + tw / 2, cy = y + th / 2;
    const sc = E.lerp(1.45, 1, p);
    ctx.save();
    ctx.globalAlpha = E.clamp01(q * 3);
    ctx.translate(cx, cy); ctx.scale(sc, sc); ctx.rotate((1 - p) * (i % 2 ? 0.12 : -0.12)); ctx.translate(-cx, -cy);
    ctx.fillStyle = E.rgba('#000', 0.5); ctx.fillRect(x + 14, y + 18, tw, th);
    E.mask(ctx, (c) => E.path.rect(c, x, y, tw, th), (c) => {
      E.drawClip(c, tl.name, tl.ct, x, y, tw, th, { fx: tl.fx, fy: tl.fy, zoom: tl.z + 0.3 * E.env(b, c0, 0.12) });
      const fl = E.env(b, c0 + 0.03, 0.06);
      if (fl > 0.01) { c.fillStyle = E.rgba('#ffffff', 0.6 * fl); c.fillRect(x, y, tw, th); }
    });
    ctx.strokeStyle = E.col('outline'); ctx.lineWidth = 12; ctx.strokeRect(x, y, tw, th);
    ctx.strokeStyle = E.col(tl.col); ctx.lineWidth = 6; ctx.strokeRect(x, y, tw, th);
    const lp = E.seg(b, c0 + 0.02, c0 + 0.1, 'expoOut');
    const lw = E.measureText(ctx, tl.lab, { size: 28, font: 'mono', weight: 700, tracking: 0.2 }) + 48;
    const ly = row === 0 ? y + th - 50 : y;   // labels hug the center seam, clear of the HUD
    ctx.fillStyle = E.col(tl.col); ctx.fillRect(x, ly, lw * lp, 50);
    if (lp > 0.5) E.drawText(ctx, tl.lab, x + 24, ly + 26, { size: 28, font: 'mono', weight: 700, color: 'night', align: 'left', tracking: 0.2 });
    ctx.restore();
  });
  ctx.restore();
  const rp = E.seg(b, 0.05, B, 'expoIn');
  E.speedLines(ctx, t, { cx: W / 2, cy: H / 2, count: 80, inner: E.lerp(1000, 240, rp), outer: 1500, color: 'cream', alpha: 0.15 + 0.6 * rp, seed: 11, fps: 30 });
  // coins stream into center (sets up the STAKES coin counter)
  for (let i = 0; i < 22; i++) {
    const s0 = 0.04 + E.rand('s2coin', i) * 0.3;
    const u = E.seg(b, s0, s0 + 0.14, 'expoIn');
    if (u <= 0 || u >= 1) continue;
    const ang = E.rand('s2coinA', i) * E.TAU;
    const R = 1150 * (1 - u);
    E.drawImg(ctx, 'coin', W / 2 + Math.cos(ang) * R, H / 2 + Math.sin(ang) * R * 0.62, { w: 64 - 30 * u, h: 64 - 30 * u, rot: u * 6, smooth: false });
  }
  // center core glow building to the hand-off
  const core = E.seg(b, 0.2, B, 'expoIn');
  if (core > 0) {
    const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, 200 + 900 * core);
    g.addColorStop(0, E.rgba('coin', 0.4 * core)); g.addColorStop(0.4, E.rgba('coin', 0.18 * core)); g.addColorStop(1, E.rgba('coin', 0));
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.restore();
  }
  if (b > 0.28) E.zoomBlur(ctx, { cx: W / 2, cy: H / 2, strength: 0.28 * E.seg(b, 0.28, B, 'expoIn'), samples: 8 });
}

// ---------------------------------------------------------------------------------------------
const CAMS = ['CAM-05 YARD', 'CAM-04 VAULT', 'CAM-02 KENNEL', 'CAM-01 DOCK'];
export default {
  start: START,
  end: END,
  draw(ctx, t, lt, E) {
    const { W, H } = E;
    const ci = Math.min(3, Math.floor(lt / CH + 1e-9));
    const a = lt - ci * CH;
    // whip-in from s1's SWAP whip: content slides in from the right, settling in 0.14s
    const whip = (1 - E.seg(lt, 0, 0.14, 'expoOut')) * 520;
    // chapter cuts get a small whip settle too (opposite directions)
    const cutWhip = ci > 0 ? (1 - E.seg(a, 0, 0.09, 'expoOut')) * (ci % 2 ? -160 : 160) : 0;
    ctx.save();
    ctx.translate(whip + cutWhip, 0);
    if (ci === 0) chSneak(ctx, t, a, E);
    else if (ci === 1) chSwap(ctx, t, a, E);
    else if (ci === 2) chMeow(ctx, t, a, E);
    else chDoor(ctx, t, a, E);
    ctx.restore();
    // +15% exposure on the footage (color-dodge by 0.15 grey keeps blacks black)
    ctx.save(); ctx.globalCompositeOperation = 'color-dodge'; ctx.fillStyle = 'rgb(38,38,38)'; ctx.fillRect(-100, -100, W + 200, H + 200); ctx.restore();
    fgParticles(ctx, t, E, ci === 3 ? 0.5 : 1);
    E.crt(ctx, t, { scan: 0.05, roll: 0.04, flicker: 0.015, vignette: 0.2 });
    hud(ctx, t, lt, E, CAMS[ci], ci);
  },
  fx(t, lt, E) {
    const F = 1 / 60;
    const ci = Math.min(3, Math.floor(lt / CH + 1e-9));
    const a = lt - ci * CH, b = a - B;
    const hit = E.env(a, 0, 0.1);           // chapter downbeat
    const clap = E.env(b, 0, 0.08);
    const kick = E.cueEnv(t, 'kick', 0.07);
    // offbeat punch-in (4.453, 5.391, 6.328, 7.266): 1 -> 1.12 expoOut in 0.08s, cubic ease back
    const ob = a - 1.5 * B;
    const punch = ob < 0 ? 0 : ob < 0.08 ? E.expoOut(ob / 0.08) : 1 - E.cubicInOut(E.clamp01((ob - 0.08) / 0.28));
    const eighth = E.pulse(t, { every: B / 2, decay: 0.05 });
    const fx = {
      shake: 22 * hit + 14 * clap + 5 * kick + 2 + 3 * eighth + 10 * E.env(ob, 0, 0.06),
      aberration: 8 * hit + 5 * clap + 4 * E.env(ob, 0, 0.05),
      zoom: (1 + 0.05 * hit + 0.035 * clap) * (1 + (ci === 3 && b >= 0 ? 0.5 : 1) * 0.12 * punch),
      flash: 0,
      // no sub-frame blur on the whip-in: it smeared the SNEAK callout into slices on f226-228
      motionBlur: 0,
    };
    // glitch only on the way OUT of a chapter (last 5 frames before the next cut), never on a hit frame
    if (a > CH - 5 * F && ci < 3) fx.glitch = 0.45 * E.seg(a, CH - 5 * F, CH - F);
    if (ci === 1 && b >= 2 * F && b < 0.22) { fx.motionBlur = 6; fx.aberration += 10 * Math.sin((b / 0.22) * Math.PI); }
    if (ci === 2) { fx.shake += 14 * E.env(a, 0, 0.3); fx.aberration += 3 * E.env(a, 0, 0.3); }
    if (ci === 3 && b >= 0) {
      const r = E.seg(b, 0, 0.469, 'expoIn');
      fx.shake += 16 * r;
      fx.aberration += 12 * r;
      fx.zoom *= 1 + 0.08 * r;
      // anticipation: 3 dark frames before the STAKES downbeat (7.5 peaks exactly on f450)
      if (t >= END - 3 * F) { fx.flash = 0.8; fx.flashColor = '#07030c'; }
    }
    return fx;
  },
};
