// s4: LEVEL ROLL-CALL 05-08 + MOSAIC (bars 7-8, 11.250-15.000 s, beats b24-b31).
// Grammar per level (2 beats): A beat = slanted wipe onto the level's wide map, giant outlined
// number stamp, decoding name, typed mechanic tag, star chip, HEIST N/8 rail. B beat = a tilted
// picture-in-picture insert of that level's signature mechanic, wide shot blurred + darkened.
// Each finished level flies into a 4x2 snake mosaic (level-select layout). 08 punches through
// from its slot on the 1.42 hit while the pinned tiles blast past camera; then a CRT power-down
// collapses everything to a point at (0.5, 0.55) where the s5 crate iris opens.
// All copy: README level table + level-select screen. No chain names anywhere.

const BEAT = 0.46875;
const T5 = 11.25, T6 = 12.1875, T7 = 13.125, T8 = 14.0625;
const PICKUP = 13.945313;     // kick "pickup" before the finale
const PD0 = 14.53125;         // power-down sweep start
const END = 15.0;
const LEAD = 7 / 60;          // wipe starts 7 frames before the hit, lands on it
const SLANT = -12 * Math.PI / 180; // s3 slants the other way; the flip marks the second half

const PF = '"Passion One", "Arial Black", sans-serif';
const NU = 'Nunito, "Helvetica Neue", sans-serif';

const LV = [
  { n: 5, t: T5, name: 'WATCHTOWER YARD', tag: 'SENTRIES THAT TURN ON A SCHEDULE', clip: 'lvl-05', off: 0, dir: 1,
    ins: { clip: 'h05-coin-run', f0: 124, kind: 'cone', fx: 0.55, fy: 0.5, zoom: 1.12 } },
  { n: 6, t: T6, name: 'CONVEYOR HALLS', tag: '1-TILE CORRIDORS', clip: 'lvl-06', off: 0, dir: -1,
    ins: { clip: 'h06-sneak-corridor', f0: 96, kind: 'wide', fx: 0.48, fy: 0.5, zoom: 1.5 } },
  { n: 7, t: T7, name: 'SPLIT SHIFT', tag: 'SPLIT UP: EACH WING OPENS THE OTHER', clip: 'lvl-07', off: 0, dir: 1,
    ins: { clip: 'h07-split-shift', f0: 15, kind: 'split', fx: 0.5, fy: 0.5, zoom: 1.0 } },
  { n: 8, t: T8, name: 'KIBBLE CORP HQ', tag: 'FINALE: ALL OF THE ABOVE', clip: 'h08-establish', off: 59 / 30, dir: -1, ins: null },
];
// previous level (end of s3), used as the underlay while the first wipe finishes
const L4 = { n: 4, t: T5 - 2 * BEAT, name: 'COUNTING HOUSE', clip: 'lvl-04', off: 0, dir: -1, ins: null, ghost: true };

// mosaic geometry: snake layout like the level-select screen (1-4 left->right, 5-8 right->left)
const TW = 150, TH = 84, GAP = 22;
const MX = 960 - (4 * TW + 3 * GAP) / 2, MY = 1080 - 44 - (2 * TH + GAP);
function slotRect(n) {
  const row = n <= 4 ? 0 : 1, colI = n <= 4 ? n - 1 : 8 - n;
  return { x: MX + colI * (TW + GAP), y: MY + row * (TH + GAP), w: TW, h: TH };
}
const slotC = (n) => { const r = slotRect(n); return [r.x + r.w / 2, r.y + r.h / 2]; };
// when each tile lands in its slot (1-3 are pre-pinned on entry)
const LAND = { 1: T5, 2: T5, 3: T5, 4: T5 + 0.34, 5: T6 + 0.34, 6: T7 + 0.34, 7: PICKUP + 0.1 };
const FLY = { 4: [T5, 0.34], 5: [T6, 0.34], 6: [T7, 0.34] }; // [start, dur]
// each finished level leaves from where its insert card sat (04: s3's frame, pushed right by the wipe)
const FLY_FROM = { 4: [1500, 640], 5: [1000, 700], 6: [1000, 720] };

const COUNTER = [1740, 96]; // same spot and design as s3's counter (s3 ends on 03)
const SPRIG_T = 11.484375;

export default {
  start: T5 - LEAD, end: END,

  async init() {
    const faces = [
      ['Passion One', 'assets/sprites/fonts/passion-one-latin-700-normal.woff2', { weight: '700' }],
      ['Passion One', 'assets/sprites/fonts/passion-one-latin-ext-700-normal.woff2', { weight: '700' }],
      ['Nunito', 'assets/sprites/fonts/nunito-latin-wght-normal.woff2', { weight: '200 1000' }],
      ['Nunito', 'assets/sprites/fonts/nunito-latin-ext-wght-normal.woff2', { weight: '200 1000' }],
    ];
    for (const [fam, url, d] of faces) {
      try { const f = new FontFace(fam, `url(${url})`, d); await f.load(); document.fonts.add(f); } catch (e) { /* fallback stack */ }
    }
    try { await document.fonts.load(`700 100px "Passion One"`); await document.fonts.load(`800 30px Nunito`); } catch (e) { /* ignore */ }
  },

  draw(ctx, t, lt, E) {
    const { W, H } = E;

    // ---------------- shots (with wipes) ----------------
    if (t < T8 - 0.075) {
      // which level owns the frame, and is a wipe in flight?
      let cur = 0;
      for (let i = 0; i < 3; i++) if (t >= LV[i].t - LEAD) cur = i;
      const L = LV[cur];
      const wp = E.seg(t, L.t - LEAD, L.t + 1 / 60, 'snap');
      if (wp < 1) {
        const prev = cur === 0 ? L4 : LV[cur - 1];
        if (!(cur === 0 && t < T5)) drawShot(ctx, E, prev, t, { pushBack: wp });
        wipeShot(ctx, E, L, t, wp);
      } else drawShot(ctx, E, L, t, {});
    } else {
      // finale: L7 holds until the slot-8 punch covers it
      if (t < T8) drawShot(ctx, E, LV[2], t, {});
      drawShot(ctx, E, LV[3], t, { punch: true });
    }

    // ---------------- mosaic + HUD ----------------
    const DBG = globalThis.__s4dbg || {};
    if (!DBG.nomosaic) drawMosaic(ctx, E, t);
    if (!DBG.nocounter) drawCounter(ctx, E, t);
    drawSprigFlight(ctx, E, t);
    if (t >= T8 - 0.08) drawFinaleFX(ctx, E, t);
    if (t >= T8 && t < PD0 + 0.5) drawLevelType(ctx, E, LV[3], t, t - T8, 0); // 08 title above the tile spray

    // light leaks breathe on top (pink/gold)
    if (!DBG.noleak) E.lightLeak(ctx, t, { seed: 41, intensity: 0.16 + 0.12 * E.cueEnv(t, 'kick', 0.2), colors: ['#ff7aa2', '#ffc93c', '#b896ea'], speed: 0.5 });

    // radial RGB on the hardest hit
    const rz = E.env(t, T8, 0.12);
    if (rz > 0.02) rgbZoomOut(ctx, E, 0.01 * rz);

    if (t >= PD0) powerDown(ctx, E, t);
  },

  fx(t, lt, E) {
    let shake = 0, ab = 0, flash = 0, mb = 0, glitch = 0;
    for (const L of LV) {
      const e = E.env(t, L.t, 0.12);
      shake += (L.n === 8 ? 22 : 14 * 0.54) * e;
      ab += (L.n === 8 ? 9 : 3) * e;
      flash = Math.max(flash, (L.n === 8 ? 0.35 : 0.1) * E.env(t, L.t, 0.06));
      if (L.n < 8 && t > L.t - LEAD && t < L.t + 0.03) mb = 5;
    }
    if (t > T8 - 0.06 && t < T8 + 0.3) mb = 5;
    if (t > FLY[4][0] && t < LAND[4]) mb = Math.max(mb, 3);
    const snare = E.cueEnv(t, 'snare', 0.09);
    ab += 3 * snare;
    const kick = E.cueEnv(t, 'kick', 0.1);
    const zoom = 1 + 0.015 * kick;
    // power-down: no shake, a little glitch on the sweep start
    // glitch only in the 2 frames BEFORE the power-down beat; the title is clean on the beat itself
    if (t >= PD0 - 2 / 60 && t < PD0) { glitch = 0.35; ab += 4; }
    if (t >= PD0) { shake = 0; mb = 0; }
    return { shake, aberration: ab, flash, motionBlur: mb, glitch, zoom, vignette: 0.35, grain: 0.035 };
  },
};

// =================================================================================================
// Shots
// =================================================================================================
function wipeX(dir, p, W) { return dir > 0 ? E_lerp(-W * 0.18, W * 1.18, p) : E_lerp(W * 1.18, -W * 0.18, p); }
function E_lerp(a, b, u) { return a + (b - a) * u; }
function wipePoly(c, X, dir, W, H) {
  const k = Math.tan(SLANT);
  const xT = X + (-60 - H / 2) * k, xB = X + (H + 60 - H / 2) * k;
  c.beginPath();
  if (dir > 0) { c.moveTo(-600, -60); c.lineTo(xT, -60); c.lineTo(xB, H + 60); c.lineTo(-600, H + 60); }
  else { c.moveTo(xT, -60); c.lineTo(W + 600, -60); c.lineTo(W + 600, H + 60); c.lineTo(xB, H + 60); }
  c.closePath();
  return [xT, xB];
}
function wipeShot(ctx, E, L, t, p) {
  const { W, H } = E;
  const X = wipeX(L.dir, p, W);
  ctx.save();
  const [xT, xB] = wipePoly(ctx, X, L.dir, W, H);
  ctx.clip();
  drawShot(ctx, E, L, t, {});
  ctx.restore();
  // glowing edge + trailing streaks (the smear of the whip)
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const back = -L.dir;
  for (let k = 0; k < 6; k++) {
    const off = back * (k * k * 9 + 4);
    ctx.globalAlpha = 0.5 * Math.pow(1 - k / 6, 1.6) * Math.sin(Math.PI * Math.min(1, p * 1.1));
    ctx.strokeStyle = k === 0 ? '#fff6dc' : (k % 2 ? '#ffc93c' : '#b6f36a');
    ctx.lineWidth = k === 0 ? 7 : 16 - k * 2;
    ctx.beginPath(); ctx.moveTo(xT + off, -60); ctx.lineTo(xB + off, H + 60); ctx.stroke();
  }
  // short horizontal speed streaks riding the edge
  for (let i = 0; i < 26; i++) {
    const y = E.rand('s4streak', L.n, i) * H;
    const xe = xT + (xB - xT) * ((y + 60) / (H + 120));
    const len = 120 + 380 * E.rand('s4sl', L.n, i);
    ctx.globalAlpha = 0.35 * E.rand('s4sa', L.n, i) * Math.sin(Math.PI * p);
    ctx.fillStyle = i % 3 ? '#fcecbb' : '#ffc93c';
    ctx.fillRect(back > 0 ? xe : xe - len, y, len, 2 + 3 * E.rand('s4sw', L.n, i));
  }
  ctx.restore();
}

// One level's full shot: wide map (sharp in A, blurred in B), insert card, level typography.
function drawShot(ctx, E, L, t, o) {
  const { W, H } = E;
  const lt = t - L.t; // may be negative during the wipe lead-in
  const ltc = Math.max(0, lt);
  const punch = o.punch;
  let rect = null;
  if (punch) {
    // slot 8 rect -> full frame, slamming on the hit
    const q = E.seg(t, T8 - 0.075, T8, 'expoIn');
    if (q <= 0) return;
    const s = slotRect(8);
    rect = { x: E.lerp(s.x, -8, q), y: E.lerp(s.y, -8, q), w: E.lerp(s.w, W + 16, q), h: E.lerp(s.h, H + 16, q) };
  }
  ctx.save();
  if (rect) { ctx.beginPath(); ctx.roundRect(rect.x, rect.y, rect.w, rect.h, E.lerp(10, 0, E.seg(t, T8 - 0.03, T8))); ctx.clip(); }
  // push-back while the next wipe passes over this shot
  if (o.pushBack) {
    const s = 1 - 0.14 * E.expoIn(o.pushBack);
    ctx.fillStyle = E.col('night'); ctx.fillRect(-40, -40, W + 80, H + 80);
    ctx.translate(W / 2, H / 2); ctx.scale(s, s); ctx.rotate(-L.dir * 0.03 * o.pushBack); ctx.translate(-W / 2, -H / 2);
  }

  // --- wide shot ---
  const hitPunch = 0.07 * E.env(t, L.t, 0.16);
  const push = 0.06 * E.sineOut(E.clamp01(ltc / (2 * BEAT)));
  const zoom = (L.n === 8 ? 1.1 : 1.15) + push + hitPunch + (punch ? 0.25 * (1 - E.seg(t, T8 - 0.075, T8, 'expoIn')) : 0);
  // round 2: each heist its own move - 05 crane down (cold), 06 lateral pan along the belts,
  // 07 6-degree dutch roll, 08 whip-pan in from its slot (the punch)
  const mv = E.sineInOut(E.clamp01(ltc / (2 * BEAT)));
  let fxp = 0.5 + 0.03 * L.dir * E.clamp01(ltc / (2 * BEAT)), fyp = 0.5, roll = 0, zx = 0;
  if (L.n === 5) { fyp = 0.3 + 0.4 * mv; zx = 0.08; }
  if (L.n === 6) { fxp = 0.5 + L.dir * (0.3 - 0.6 * mv); zx = 0.1; }
  if (L.n === 7) { roll = E.deg(6) * (1 - 0.5 * mv) * L.dir; zx = 0.16; }
  const ct = ltc + (L.ghost ? 2 * BEAT : 0);
  const clipOpts = { speed: 2, offset: L.off, zoom: zoom + zx, fx: fxp, fy: fyp };
  if (roll) { ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(roll); ctx.translate(-W / 2, -H / 2); }
  E.drawClip(ctx, L.clip, ct, roll ? -60 : 0, roll ? -60 : 0, roll ? W + 120 : W, roll ? H + 120 : H, clipOpts);
  if (roll) ctx.restore();
  const tint = { 5: ['#5aa0ff', 0.32], 6: ['#ffc93c', 0.12], 7: ['#b6f36a', 0.14] }[L.n];
  if (tint && !L.ghost) { ctx.save(); ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = tint[1]; ctx.fillStyle = tint[0]; ctx.fillRect(-40, -40, W + 80, H + 80); ctx.restore(); }
  // B beat: blur + darken 30 %
  const bq = L.ins ? E.seg(lt, BEAT - 0.04, BEAT + 0.06, 'quadOut') : (L.ghost ? 1 : 0);
  if (bq > 0) {
    const S = E.surface('s4blurA', 240, 135);
    E.drawClip(S.ctx, L.clip, ct, 0, 0, 240, 135, clipOpts);
    const S2 = E.surface('s4blurB', 480, 270);
    S2.ctx.imageSmoothingEnabled = true; S2.ctx.drawImage(S, 0, 0, 480, 270);
    ctx.save(); ctx.globalAlpha = bq; ctx.imageSmoothingEnabled = true; ctx.drawImage(S2, -10, -10, W + 20, H + 20); ctx.restore();
    ctx.fillStyle = `rgba(13,6,22,${0.32 * bq})`; ctx.fillRect(-40, -40, W + 80, H + 80);
  }
  // left-side legibility gradient behind the typography
  const gx0 = L.dir > 0 ? 0 : W, gx1 = L.dir > 0 ? 1000 : W - 1000;
  const g = ctx.createLinearGradient(gx0, 0, gx1, 0);
  g.addColorStop(0, 'rgba(13,6,22,0.78)'); g.addColorStop(0.55, 'rgba(13,6,22,0.38)'); g.addColorStop(1, 'rgba(13,6,22,0)');
  ctx.fillStyle = g; ctx.fillRect(-40, -40, W + 80, H + 80);
  const gb = ctx.createLinearGradient(0, H - 330, 0, H);
  gb.addColorStop(0, 'rgba(13,6,22,0)'); gb.addColorStop(1, 'rgba(13,6,22,0.6)');
  ctx.fillStyle = gb; ctx.fillRect(-40, H - 330, W + 80, 380);

  if (L.ghost) { ctx.restore(); return; }

  // --- insert card (B beat) ---
  if (L.ins && lt >= BEAT - 0.06) drawInsert(ctx, E, L, t, lt);

  // --- typography ---
  const next = LV.find((x) => x.n === L.n + 1);
  const exitP = next ? E.seg(t, next.t - 4 / 60, next.t, 'expoIn') : 0;
  if (L.n === 7) { /* L7 exits into the punch */ }
  // hit shockwave from the number (round 3: drawn UNDER the type; 08's ring kept smaller)
  if (lt >= 0) E.shockwave(ctx, numAnchor(L)[0], NUM_Y, E.seg(lt, 0, 0.55), { radius: L.n === 8 ? 620 : 520, width: L.n === 8 ? 40 : 26, color: L.n === 8 ? '#fff3d0' : '#ffc93c', rings: 2 });
  // round 3: 08's type is drawn after the finale FX (on top of the flying tiles), see draw()
  if (!(L.n === 8 && t >= T8)) drawLevelType(ctx, E, L, t, lt, exitP);
  ctx.restore();

  // punch border glow
  if (rect && t < T8 + 0.02) {
    ctx.save(); ctx.strokeStyle = '#ffc93c'; ctx.lineWidth = 6 + 20 * E.seg(t, T8 - 0.075, T8);
    ctx.shadowColor = '#ffc93c'; ctx.shadowBlur = 30;
    ctx.beginPath(); ctx.roundRect(rect.x, rect.y, rect.w, rect.h, 10); ctx.stroke(); ctx.restore();
  }
}

// -------------------------------------------------------------------------------------------------
// Typography: number stamp (parallax 0.6x), decoding name, typed tag, star chip
// -------------------------------------------------------------------------------------------------
// type side: +1 = left (wipe from the left), -1 = right; continues s3's alternation
const SIDE = (L) => L.dir;
const NUM_Y = 380;
const ACCENT = { 5: '#7ec8ff', 6: '#ffc93c', 7: '#b6f36a', 8: '#ff7aa2' }; // per-heist accent
const NUM_SIZE = 266; // round 2: 30% smaller than 380 and pushed to the edge so the map reads
function numAnchor(L) { return L.dir > 0 ? [72 + 122, NUM_Y] : [1920 - 72 - 122, NUM_Y]; }
function drawLevelType(ctx, E, L, t, lt, exitP) {
  if (lt < -0.06) return;
  const ey = -240 * exitP, ea = 1 - exitP;
  if (ea <= 0) return;
  const sd = SIDE(L), align = sd > 0 ? 'left' : 'right';
  const X = sd > 0 ? 108 : 1920 - 108;
  const XN = sd > 0 ? 72 : 1920 - 72;
  const drift = E.clamp01(lt / (2 * BEAT));
  const num = String(L.n).padStart(2, '0');
  // number: stamp from 2.4x with backOut(2.2); outlined; parallax drift 0.6x; full alpha on the hit frame
  // smears in with the wipe (clipped by its edge), 2.4x on the hit, settles with backOut(2.2)
  const pre = E.seg(lt, -0.06, 0, 'expoOut');
  const sp = E.seg(lt, 0, 0.2, (x) => E.backOut(x, 2.2));
  const sc = lt < 0 ? E.lerp(3.4, 2.4, pre) : E.lerp(2.4, 1, sp);
  const nx = XN + sd * 18 * 0.6 * drift, ny = NUM_Y + ey * 0.6;
  const [pcx] = numAnchor(L);
  ctx.save();
  ctx.globalAlpha = ea;
  ctx.translate(pcx, ny); ctx.scale(sc, sc); ctx.rotate(-0.06 * sd * (1 - sp)); ctx.translate(-pcx, -ny);
  E.drawText(ctx, num, nx + sd * 10, ny + 14, { font: PF, weight: 700, size: NUM_SIZE, align, color: 'rgba(42,15,31,0.6)', tracking: -0.02 });
  const acc = ACCENT[L.n] || '#ffc93c';
  E.drawText(ctx, num, nx, ny, { font: PF, weight: 700, size: NUM_SIZE, align, color: L.n === 8 ? acc : E.rgba(acc, 0.16), tracking: -0.02,
    stroke: acc, strokeWidth: 9, glow: { color: E.rgba(acc, 0.6), blur: 30 } });
  // white-hot fill on the impact frames
  const hot = E.env(lt, 0, 0.07);
  if (hot > 0.03) E.drawText(ctx, num, nx, ny, { font: PF, weight: 700, size: NUM_SIZE, align, color: `rgba(255,243,208,${0.9 * hot})`, tracking: -0.02 });
  ctx.restore();

  // kicker
  const kq = E.seg(lt, 0.04, 0.22, 'expoOut');
  E.drawText(ctx, `HEIST ${num}`, X + sd * (8 + 30 * (1 - kq)), 548 + ey, { font: NU, weight: 900, size: 26, align, color: ACCENT[L.n] || '#b6f36a', tracking: 0.32, alpha: ea * kq });

  // name: decode in 8 frames, letters drop with elastic
  const dp = E.seg(lt, -0.06, -1 / 60); // round 3: decodes in the lead-in, clean on the impact frame
  const nameStr = dp < 1 ? E.scramble(L.name, dp, L.n * 17) : L.name;
  let size = 96;
  const mw = E.measureText(ctx, L.name, { size, tracking: 0.02 });
  if (mw > 840) size = Math.floor(size * 840 / mw);
  E.drawText(ctx, nameStr, X + sd * (4 + 10 * drift), 610 + ey, {
    size, align, color: 'cream', tracking: 0.02, alpha: ea,
    extrude: { depth: 9, color: 'plum', dark: 0.5 },
    perChar: ({ i, n }) => {
      const k = sd > 0 ? i : n - 1 - i;
      const q = E.stagger(lt, k, n, { start: -0.06, spread: 0.03, dur: 0.1, e: (x) => E.backOut(x, 1.6) });
      return { y: (1 - q) * -60, scale: 0.7 + 0.3 * q, alpha: Math.min(1, q * 3), color: dp < 1 && E.rand('dc', L.n, i, E.frame >> 1) < 0.3 ? '#b6f36a' : undefined };
    },
  });

  // mechanic tag: dark pill + typewriter + cursor
  const tp = E.seg(lt, 0.1, 0.42);
  const tag = E.typewriter(L.tag, tp);
  const fopt = { font: NU, weight: 800, size: 28, tracking: 0.08 };
  const tw = E.measureText(ctx, L.tag, fopt);
  const pq = E.seg(lt, 0.06, 0.2, 'expoOut');
  const pw = (tw + 56) * pq, px = sd > 0 ? X - 4 : X + 4 - pw;
  ctx.save(); ctx.globalAlpha = ea * pq;
  ctx.fillStyle = 'rgba(13,6,22,0.82)';
  ctx.beginPath(); ctx.roundRect(px, 650 + ey, pw, 52, 26); ctx.fill();
  ctx.strokeStyle = 'rgba(153,102,204,0.9)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.restore();
  const tx = sd > 0 ? X + 24 : X - 24 - tw;
  E.drawText(ctx, tag, tx, 677 + ey, { ...fopt, align: 'left', color: '#d9b8f5', alpha: ea });
  if (tp > 0 && tp < 1 && (E.frame >> 2) % 2 === 0) {
    const cw = E.measureText(ctx, tag, fopt);
    ctx.fillStyle = '#b6f36a'; ctx.fillRect(tx + cw + 4, 659 + ey, 4, 34);
  }

  // star chip: three gold stars, one per 3 frames
  const cq = E.seg(lt, 0.14, 0.26, 'backOut');
  const chw = 176 * E.clamp01(cq), chx = sd > 0 ? X - 4 : X + 4 - chw;
  ctx.save(); ctx.globalAlpha = ea * E.clamp01(cq);
  ctx.fillStyle = 'rgba(48,25,52,0.9)';
  ctx.beginPath(); ctx.roundRect(chx, 718 + ey, chw, 58, 29); ctx.fill();
  ctx.restore();
  for (let s = 0; s < 3; s++) {
    const q = E.seg(lt, 0.18 + s * 3 / 60, 0.18 + s * 3 / 60 + 0.16, (x) => E.backOut(x, 2.6));
    if (q <= 0) continue;
    const wob = 0.08 * Math.sin(t * 5 + s);
    const sx = sd > 0 ? X + 36 + s * 50 : X - 36 - (2 - s) * 50;
    ctx.save(); ctx.globalAlpha = ea;
    E.star(ctx, sx, 747 + ey, 21 * q, { fill: 'coin', stroke: 'outline', lineWidth: 4, rot: -Math.PI / 2 + wob });
    ctx.restore();
    const sq = E.seg(lt, 0.18 + s * 3 / 60, 0.18 + s * 3 / 60 + 0.25);
    if (sq > 0 && sq < 1) sparkle(ctx, E, sx, 747 + ey, 40 * E.expoOut(sq), 1 - sq, '#fff3d0');
  }
}

// four-point sparkle
function sparkle(ctx, E, x, y, r, a, color) {
  if (a <= 0 || r <= 0) return;
  ctx.save(); ctx.globalAlpha *= a; ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r, y); ctx.quadraticCurveTo(x, y, x, y - r); ctx.fill();
  ctx.restore();
}

// -------------------------------------------------------------------------------------------------
// Insert cards (B beat)
// -------------------------------------------------------------------------------------------------
function drawInsert(ctx, E, L, t, lt) {
  const ins = L.ins;
  const blt = lt - BEAT; // time since the B beat
  const from = -L.dir; // slides in from the opposite edge of the wipe
  const inP = E.seg(blt, -0.06, 0.16, (x) => E.backOut(x, 1.9));
  // L7 card is sucked into slot 7 on the pickup kick
  const suck = L.n === 7 ? E.seg(t, PICKUP, PICKUP + 0.1, 'expoIn') : 0;
  const wide = ins.kind === 'wide';
  const cw = wide ? 1120 : 800, ch = wide ? 340 : 450;
  const cx0 = L.dir > 0 ? (wide ? 1190 : 1390) : (wide ? 660 : 530), cy0 = wide ? 330 : 400;
  const float = 6 * Math.sin(t * 3.1 + L.n);
  // wipe from the left (dir 1) -> card enters from the right, and vice versa
  let cx = cx0 + (1 - inP) * (from < 0 ? 1500 : -1500);
  let cy = cy0 + float;
  let rot = (4 + 10 * (1 - inP)) * Math.PI / 180 * (L.dir > 0 ? 1 : -1) * (wide ? 0.4 : 1) + 0.006 * Math.sin(t * 2.3);
  let sc = 1;
  if (suck > 0) {
    const [sx, sy] = slotC(7);
    const p = E.arcTo([cx, cy], [sx, sy], suck, -120);
    cx = p[0]; cy = p[1]; sc = E.lerp(1, TW / cw, suck); rot *= 1 - suck;
  }
  if (suck >= 1) return;
  const ict = (ins.f0 - 1) / 30 + Math.max(0, blt) * (ins.kind === 'wide' ? 0.55 : 1); // corridor: slowed so the swap stays framed

  // motion smear behind the card while it flies in
  const vel = 1 - E.seg(blt, 0.0, 0.12);
  if (vel > 0 && inP < 1.02) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let k = 1; k <= 3; k++) {
      ctx.globalAlpha = 0.18 * vel / k;
      ctx.fillStyle = k === 1 ? '#ffc93c' : '#9966cc';
      const dx = (L.dir > 0 ? 1 : -1) * k * 70 * vel;
      ctx.save(); ctx.translate(cx + dx, cy); ctx.rotate(rot);
      ctx.beginPath(); ctx.roundRect(-cw / 2, -ch / 2, cw, ch, 24); ctx.fill(); ctx.restore();
    }
    ctx.restore();
  }

  ctx.save();
  ctx.translate(cx, cy); ctx.rotate(rot); ctx.scale(sc, sc);
  if (ins.kind === 'split') drawSplitCard(ctx, E, L, t, blt, ict, cw, ch);
  else {
    // shadow
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 50; ctx.shadowOffsetY = 24;
    ctx.fillStyle = '#0d0616'; ctx.beginPath(); ctx.roundRect(-cw / 2, -ch / 2, cw, ch, 24); ctx.fill(); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.roundRect(-cw / 2, -ch / 2, cw, ch, 24); ctx.clip();
    const pz = 1 + 0.05 * E.seg(blt, 0, 0.5, 'sineOut') + 0.06 * E.env(blt, 0, 0.12);
    E.drawClip(ctx, ins.clip, ict, -cw / 2, -ch / 2, cw, ch, { zoom: ins.zoom * pz, fx: ins.fx, fy: ins.fy });
    if (ins.kind === 'cone') drawConeOverlay(ctx, E, blt, cw, ch);
    if (ins.kind === 'wide') drawCorridorOverlay(ctx, E, blt, cw, ch);
    // glass sheen sweep on entry
    const gs = E.seg(blt, 0.05, 0.35);
    if (gs > 0 && gs < 1) {
      const gx = E.lerp(-cw, cw, gs);
      const gg = ctx.createLinearGradient(gx - 120, 0, gx + 120, 0);
      gg.addColorStop(0, 'rgba(255,255,255,0)'); gg.addColorStop(0.5, 'rgba(255,255,255,0.22)'); gg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gg; ctx.fillRect(-cw / 2, -ch / 2, cw, ch);
    }
    ctx.restore();
    // coin rim + inner hairline
    ctx.strokeStyle = '#ffc93c'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.roundRect(-cw / 2, -ch / 2, cw, ch, 24); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,243,208,0.35)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(-cw / 2 + 8, -ch / 2 + 8, cw - 16, ch - 16, 18); ctx.stroke();
    cardChip(ctx, E, L, -cw / 2 + 22, -ch / 2 + 22, blt);
  }
  ctx.restore();
}

function cardChip(ctx, E, L, x, y, blt) {
  const q = E.seg(blt, 0.06, 0.2, 'backOut');
  if (q <= 0) return;
  ctx.save(); ctx.globalAlpha *= E.clamp01(q);
  ctx.fillStyle = '#ffc93c'; ctx.beginPath(); ctx.roundRect(x, y, 108 * E.clamp01(q), 36, 18); ctx.fill();
  ctx.restore();
  E.drawText(ctx, `HEIST ${String(L.n).padStart(2, '0')}`, x + 54, y + 19, { font: NU, weight: 900, size: 17, color: '#2a0f1f', tracking: 0.14, alpha: E.clamp01(q) });
}

// L5: sentry cone that turns on a schedule (ghost-cone telegraph, then a snap turn)
function drawConeOverlay(ctx, E, blt, cw, ch) {
  const ox = cw * 0.17, oy = ch * 0.08; // card space (centre origin)
  const a0 = Math.PI * 0.95, a1 = Math.PI * 0.45;
  const turn = E.seg(blt, 0.2, 0.3, (x) => E.backOut(x, 2.4));
  const ang = E.lerp(a0, a1, turn);
  // telegraph: dashed ghost of the next facing
  const gq = E.win(blt, 0.06, 0.3, 0.04, 0.04);
  if (gq > 0) {
    ctx.save(); ctx.globalAlpha = gq * (0.5 + 0.5 * ((E.frame >> 2) % 2));
    ctx.setLineDash([12, 10]); ctx.strokeStyle = '#ffe08a'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(ox, oy); ctx.arc(ox, oy, 260, a1 - 0.45, a1 + 0.45); ctx.closePath(); ctx.stroke(); ctx.restore();
  }
  E.cone(ctx, ox, oy, ang, 0.9, 280, { color: '#ffc62e', alpha: 0.32 + 0.25 * E.env(blt, 0.22, 0.12) });
  ctx.save(); ctx.strokeStyle = 'rgba(255,198,46,0.95)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(ox, oy); ctx.arc(ox, oy, 280, ang - 0.45, ang + 0.45); ctx.closePath(); ctx.stroke();
  // little clock dial: sentries turn on a schedule
  const r = 26, dx = ox, dy = oy - 48;
  ctx.fillStyle = 'rgba(13,6,22,0.85)'; ctx.beginPath(); ctx.arc(dx, dy, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#ffc93c'; ctx.lineWidth = 3; ctx.stroke();
  const hand = -Math.PI / 2 + blt * 9;
  ctx.beginPath(); ctx.moveTo(dx, dy); ctx.lineTo(dx + Math.cos(hand) * 18, dy + Math.sin(hand) * 18); ctx.stroke();
  ctx.restore();
  // catnip pickup sparkle at f124 (the insert's first frame)
  for (const q of E.burst({ seed: 'h5pick', count: 14, t: blt, t0: 0, x: -cw * 0.0, y: -ch * 0.18, speed: [160, 420], angle: [-Math.PI, 0], gravity: 500, life: [0.25, 0.45], size: [10, 22] }))
    sparkle(ctx, E, q.x, q.y, q.size, q.alpha, q.r(1) < 0.5 ? '#b6f36a' : '#fff3d0');
}

// L6: 1-tile corridor: dimension bracket + plate/swap ring echo
function drawCorridorOverlay(ctx, E, blt, cw, ch) {
  const q = E.seg(blt, 0.08, 0.24, 'expoOut');
  // horizontal scan line sweeping the corridor
  const sx = E.lerp(-cw / 2, cw / 2, E.fract(blt * 1.6));
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createLinearGradient(sx - 80, 0, sx + 10, 0);
  g.addColorStop(0, 'rgba(182,243,106,0)'); g.addColorStop(1, 'rgba(182,243,106,0.28)');
  ctx.fillStyle = g; ctx.fillRect(sx - 80, -ch / 2, 90, ch);
  ctx.restore();
  // letterbox bars breathing (emphasise the 3.5:1)
  ctx.fillStyle = 'rgba(13,6,22,0.55)';
  const bh = 22 * (1 - q) + 6;
  ctx.fillRect(-cw / 2, -ch / 2, cw, bh); ctx.fillRect(-cw / 2, ch / 2 - bh, cw, bh);
  // swap ring echo at f100 (0.133 s after f96)
  const sw = E.seg(blt, 0.133, 0.5);
  if (sw > 0 && sw < 1) E.shockwave(ctx, cw * 0.125, ch * 0.03, sw, { radius: 180, width: 12, color: '#ffc93c', rings: 3, gap: 0.18 });
}

// L7: two wings, split card; gold flash on the split line at swap f18
function drawSplitCard(ctx, E, L, t, blt, ict, cw, ch) {
  const ins = L.ins;
  const sp = E.seg(blt, 0.02, 0.16, (x) => E.backOut(x, 2));
  const gap = 34 * sp;
  const swapF = E.env(blt, 0.1, 0.12);
  const hw = cw / 2;
  for (const side of [-1, 1]) {
    ctx.save();
    const ox = side * (hw / 2 + gap / 2), oy = side * 10 * sp;
    ctx.translate(ox, oy); ctx.rotate(side * 0.025 * sp);
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 20;
    ctx.fillStyle = '#0d0616'; ctx.beginPath(); ctx.roundRect(-hw / 2, -ch / 2, hw, ch, 20); ctx.fill(); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.roundRect(-hw / 2, -ch / 2, hw, ch, 20); ctx.clip();
    const crop = side < 0 ? [0.08, 0.05, 0.42, 0.9] : [0.5, 0.05, 0.42, 0.9];
    E.drawClip(ctx, ins.clip, ict, -hw / 2, -ch / 2, hw, ch, { crop, zoom: 1.02 + 0.04 * E.seg(blt, 0, 0.5) });
    if (swapF > 0.02) { ctx.fillStyle = `rgba(255,201,60,${0.25 * swapF})`; ctx.fillRect(-hw / 2, -ch / 2, hw, ch); }
    ctx.restore();
    ctx.strokeStyle = '#ffc93c'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.roundRect(-hw / 2, -ch / 2, hw, ch, 20); ctx.stroke();
    ctx.restore();
  }
  // split line flash
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const la = 0.25 + 0.9 * swapF;
  ctx.globalAlpha = la; ctx.strokeStyle = '#ffc93c'; ctx.lineWidth = 4 + 14 * swapF; ctx.shadowColor = '#ffc93c'; ctx.shadowBlur = 30;
  ctx.beginPath(); ctx.moveTo(0, -ch / 2 - 40 * swapF - 20); ctx.lineTo(0, ch / 2 + 40 * swapF + 20); ctx.stroke();
  ctx.restore();
  // crossing arrows: each wing opens the other
  const aq = E.seg(blt, 0.12, 0.36, 'expoOut');
  if (aq > 0) {
    ctx.save(); ctx.strokeStyle = '#b6f36a'; ctx.fillStyle = '#b6f36a'; ctx.lineWidth = 6; ctx.lineCap = 'round';
    for (const side of [-1, 1]) {
      const y = side * 60 - ch / 2 - 46;
      const y2 = side < 0 ? -ch / 2 - 46 : ch / 2 + 46;
      const x0 = side * -hw * 0.45, x1 = side * hw * 0.45;
      const xe = E.lerp(x0, x1, aq);
      ctx.beginPath(); ctx.moveTo(x0, y2); ctx.quadraticCurveTo(0, y2 + (side < 0 ? -40 : 40), xe, y2); ctx.stroke();
      if (aq > 0.2) {
        const dirx = side > 0 ? -1 : 1;
        const tipx = xe, tipy = y2;
        ctx.beginPath(); ctx.moveTo(tipx + dirx * 16, tipy - 12); ctx.lineTo(tipx - dirx * 4, tipy); ctx.lineTo(tipx + dirx * 16, tipy + 12); ctx.closePath(); ctx.fill();
      }
      void y;
    }
    ctx.restore();
  }
  cardChip(ctx, E, L, -cw / 2 - gap / 2 + 18, -ch / 2 + 14, blt);
}

// =================================================================================================
// Mosaic (bottom-right): 4x2 snake like the level-select screen
// =================================================================================================
function tileFilled(n, t) { return LAND[n] != null && t >= LAND[n]; }
function drawTile(ctx, E, n, t, x, y, w, h, { alpha = 1, glow = 0, rot = 0, scale = 1 } = {}) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x + w / 2, y + h / 2); ctx.rotate(rot); ctx.scale(scale, scale);
  ctx.save(); ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2, w, h, 10); ctx.clip();
  E.drawClip(ctx, `lvl-0${n}`, t * 0.9 + n * 0.37, -w / 2, -h / 2, w, h, { loop: true, zoom: 1.35 });
  if (glow > 0) { ctx.fillStyle = `rgba(255,243,208,${0.6 * glow})`; ctx.fillRect(-w / 2, -h / 2, w, h); }
  ctx.restore();
  ctx.strokeStyle = glow > 0.05 ? '#fff3d0' : '#ffc93c'; ctx.lineWidth = 3 / scale + 3 * glow;
  ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2, w, h, 10); ctx.stroke();
  // number badge like the level-select card
  ctx.fillStyle = '#d5f4e5'; ctx.strokeStyle = '#2a0f1f'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(-w / 2 + 18, -h / 2 + 18, 14, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  E.drawText(ctx, String(n), -w / 2 + 18, -h / 2 + 19, { font: PF, weight: 700, size: 20, color: '#2a0f1f' });
  // three tiny stars
  for (let s = 0; s < 3; s++) E.star(ctx, w / 2 - 44 + s * 15, h / 2 - 12, 6, { fill: 'coin', stroke: 'outline', lineWidth: 1.5 });
  ctx.restore();
}

function drawMosaic(ctx, E, t) {
  if (t < T5) return;
  const blast = E.seg(t, T8, T8 + 0.5);
  if (blast >= 1) return;
  const enter = E.seg(t, T5, T5 + 0.28, (x) => E.backOut(x, 1.6));
  const lift = 10 * E.env(t, PICKUP, 0.1) + 2.5 * Math.sin(t * 2.4);
  const oy = (1 - enter) * 300 - lift;
  const panelA = blast > 0 ? 0 : 1;
  ctx.save();
  // panel (fades on the blast)
  if (panelA > 0) {
    ctx.save(); ctx.translate(0, oy);
    ctx.fillStyle = 'rgba(13,6,22,0.62)'; ctx.strokeStyle = 'rgba(153,102,204,0.55)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(MX - 22, MY - 52, 4 * TW + 3 * GAP + 44, 2 * TH + GAP + 74, 20); ctx.fill(); ctx.stroke();
    // progress header (takes over from s3's rail): HEIST NN / 08 with a number flip on every hit
    const cur = t >= T8 ? 8 : t >= T7 ? 7 : t >= T6 ? 6 : 5;
    const curT = { 5: T5, 6: T6, 7: T7, 8: T8 }[cur];
    E.drawText(ctx, 'HEIST', MX - 2, MY - 26, { font: NU, weight: 900, size: 20, align: 'left', color: 'lilac', tracking: 0.35 });
    const nx = MX + 104;
    E.mask(ctx, (c) => c.rect(nx - 4, MY - 54, 60, 54), (c) => {
      const fq = E.seg(t, curT, curT + 0.16, 'backOut');
      const prev = String(cur - 1).padStart(2, '0'), now = String(cur).padStart(2, '0');
      if (fq < 1) E.drawText(c, prev, nx, MY - 25 - 50 * fq, { size: 36, font: PF, weight: 700, color: 'coin', align: 'left' });
      E.drawText(c, now, nx, MY - 25 + 50 * (1 - fq), { size: 36, font: PF, weight: 700, color: 'coin', align: 'left' });
    });
    E.drawText(ctx, '/ 08', nx + 46, MY - 24, { size: 26, font: PF, weight: 700, color: 'lavender', align: 'left' });
    // star total chip like the level-select HUD (24 stars = 8 x 3, counts as tiles land)
    const filled = [1, 2, 3, 4, 5, 6, 7].filter((n) => tileFilled(n, t)).length + (t >= T8 ? 1 : 0);
    E.star(ctx, MX + 4 * TW + 3 * GAP - 76, MY - 28, 10, { fill: 'coin', stroke: 'outline', lineWidth: 2 });
    const sp = E.env(t, Math.max(...[1, 2, 3, 4, 5, 6, 7].map((n) => (tileFilled(n, t) ? LAND[n] : -9))), 0.15);
    E.drawText(ctx, `${filled * 3} / 24`, MX + 4 * TW + 3 * GAP, MY - 26, { font: PF, weight: 700, size: 24 * (1 + 0.3 * sp), align: 'right', color: '#fcecbb' });
    // snake connector dots
    for (let n = 1; n < 8; n++) {
      const a = slotC(n), b = slotC(n + 1);
      const lit = tileFilled(n + 1, t) || (n + 1 === 8 && t >= PICKUP);
      const ra = slotRect(n);
      let p0, p1;
      if (n === 4) { p0 = [a[0], ra.y + ra.h + 3]; p1 = [b[0], slotRect(5).y - 3]; }
      else { const s = Math.sign(b[0] - a[0]); p0 = [a[0] + s * (TW / 2 + 3), a[1]]; p1 = [b[0] - s * (TW / 2 + 3), b[1]]; }
      const k = 4;
      for (let d = 0; d < k; d++) {
        const u = (d + 0.5) / k;
        const x = E.lerp(p0[0], p1[0], u), y = E.lerp(p0[1], p1[1], u);
        const tw = 0.5 + 0.5 * Math.sin(t * 10 - n * 1.3 - d);
        ctx.fillStyle = lit ? E.rgba('#ffc93c', 0.6 + 0.4 * tw) : 'rgba(153,102,204,0.45)';
        ctx.beginPath(); ctx.arc(x, y, lit ? 3.4 : 2.6, 0, Math.PI * 2); ctx.fill();
      }
    }
    // slots
    for (let n = 1; n <= 8; n++) {
      const r = slotRect(n);
      const st = E.stagger(t - T5, n - 1, 8, { start: 0.02, spread: 0.16, dur: 0.24, e: (x) => E.backOut(x, 2) });
      if (st <= 0) continue;
      if (tileFilled(n, t)) {
        const land = E.env(t, LAND[n], 0.14);
        const s = n <= 3 ? st : 1 + 0.12 * land;
        drawTile(ctx, E, n, t, r.x, r.y, r.w, r.h, { glow: land, scale: s });
      } else {
        // empty slot: dashed outline, dim number; slot 8 primes on the pickup
        const prime = n === 8 ? E.seg(t, PICKUP, T8 - 0.075) : 0;
        ctx.save(); ctx.globalAlpha = st;
        ctx.setLineDash([8, 7]); ctx.lineDashOffset = -t * 40;
        ctx.strokeStyle = prime > 0 ? '#ffc93c' : 'rgba(153,102,204,0.75)'; ctx.lineWidth = 2 + 3 * prime;
        ctx.fillStyle = prime > 0 ? `rgba(255,201,60,${0.18 + 0.3 * prime})` : 'rgba(48,25,52,0.5)';
        ctx.beginPath(); ctx.roundRect(r.x, r.y, r.w, r.h, 10); ctx.fill(); ctx.stroke();
        ctx.restore();
        E.drawText(ctx, String(n), r.x + r.w / 2, r.y + r.h / 2 + 2, { font: PF, weight: 700, size: 40, color: prime > 0 ? '#fff3d0' : 'rgba(153,102,204,0.7)', alpha: st });
      }
      // landing ring
      if (LAND[n] && n > 3) {
        const lq = E.seg(t, LAND[n], LAND[n] + 0.4);
        if (lq > 0 && lq < 1) {
          E.shockwave(ctx, r.x + r.w / 2, r.y + r.h / 2, lq, { radius: 130, width: 8, color: '#ffc93c', rings: 2 });
          for (let s = 0; s < 4; s++) sparkle(ctx, E, r.x + (s % 2) * r.w, r.y + (s >> 1) * r.h, 18 * (1 - lq), 1 - lq, '#fff3d0');
        }
      }
    }
    ctx.restore();
  }

  // flying tiles: finished level -> its slot
  for (const nStr of Object.keys(FLY)) {
    const n = +nStr; const [t0, d] = FLY[n];
    const u = E.seg(t, t0, t0 + d);
    if (u <= 0 || u >= 1) continue;
    const eu = E.expoInOut ? E.expoInOut(u) : E.cubicInOut(u);
    const Lsrc = LV.find((x) => x.n === n + 1);
    const [startX, startY] = FLY_FROM[n];
    const r = slotRect(n);
    const p = E.arcTo([startX, startY], [r.x + r.w / 2, r.y + r.h / 2 + oy], eu, 120);
    const sc = E.lerp(2.6, 1, eu);
    const rot = (1 - eu) * 0.35 * (Lsrc.dir > 0 ? 1 : -1);
    // trail
    for (let k = 1; k <= 3; k++) {
      const pu = Math.max(0, eu - k * 0.06);
      const pp = E.arcTo([startX, startY], [r.x + r.w / 2, r.y + r.h / 2 + oy], pu, 120);
      ctx.save(); ctx.globalAlpha = 0.22 / k; ctx.fillStyle = '#ffc93c';
      ctx.translate(pp[0], pp[1]); ctx.rotate(rot); const s2 = E.lerp(2.6, 1, pu);
      ctx.beginPath(); ctx.roundRect(-TW * s2 / 2, -TH * s2 / 2, TW * s2, TH * s2, 10); ctx.fill(); ctx.restore();
    }
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 14;
    drawTile(ctx, E, n, t, p[0] - TW / 2, p[1] - TH / 2, TW, TH, { scale: sc, rot });
    ctx.restore();
  }
  ctx.restore();
}

// =================================================================================================
// HUD: progress rail (top centre) and catnip counter (top right)
// =================================================================================================
// Catnip counter: same pill as s3 (which exits on 03), drops back in on the 05 hit, ticks to 04.
const SPRIG_FLY = 0.24;
function drawCounter(ctx, E, t) {
  const [x0, y0] = COUNTER;
  const enter = E.backOut(E.seg(t, T5 - 0.05, T5 + 0.2), 1.9);
  if (enter <= 0) return;
  const land = SPRIG_T + SPRIG_FLY;
  const count = t >= land ? 10 : 9; // continues s2 (6) + s3 (3)
  const bump = t >= land ? E.elasticOut(E.seg(t, land, land + 0.4), 1, 0.3) : 1;
  const bs = 1 + 0.18 * (1 - bump) + 0.03 * E.cueEnv(t, 'kick', 0.1);
  const y = y0 - 160 * (1 - enter) + 2 * Math.sin(t * 2.7 + 1);
  ctx.save(); ctx.translate(x0, y); ctx.scale(bs, bs);
  const w = 230, h = 78;
  ctx.fillStyle = E.rgba('outline', 0.9); ctx.beginPath(); ctx.roundRect(-w / 2 + 4, -h / 2 + 6, w, h, h / 2); ctx.fill();
  ctx.fillStyle = E.rgba('night', 0.82); ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2, w, h, h / 2); ctx.fill();
  ctx.strokeStyle = E.col('catnip'); ctx.lineWidth = 4; ctx.stroke();
  E.drawImg(ctx, 'catnip16', -w / 2 + 44, 0, { w: 48, h: 48, pixel: true, rot: 0.06 * Math.sin(t * 4) });
  E.drawText(ctx, '×', -6, 2, { size: 34, font: NU, weight: 900, color: 'lavender' });
  // number rolls 03 -> 04
  const roll = E.seg(t, land, land + 0.14, 'backOut');
  E.mask(ctx, (c) => c.rect(20, -36, 80, 72), (c) => {
    if (t >= land && roll < 1) E.drawText(c, '09', 56, 4 - 60 * roll, { size: 54, font: PF, weight: 700, color: 'cream' });
    E.drawText(c, String(count).padStart(2, '0'), 56, 4 + (t >= land ? 60 * (1 - roll) : 0), { size: 54, font: PF, weight: 700, color: t >= land && roll < 1 ? '#b6f36a' : 'cream' });
  });
  ctx.restore();
  const a = t - land;
  if (a >= 0 && a < 0.5) {
    E.drawText(ctx, '+1', x0 + 20, y0 + 96 - 36 * E.expoOut(a / 0.5), { size: 40, font: PF, weight: 700, color: 'catnipGlow', stroke: 'outline', strokeWidth: 6, alpha: 1 - E.seg(a, 0.3, 0.5) });
    if (a < 0.3) E.shockwave(ctx, x0 - 70, y0, a / 0.3, { radius: 80, width: 8, color: 'catnipGlow' });
  }
}

function drawSprigFlight(ctx, E, t) {
  const t0 = SPRIG_T, d = SPRIG_FLY;
  const age = t - t0;
  if (age < -0.05 || age >= d) return;
  const start = [1010, 470], end = [COUNTER[0] - 70, COUNTER[1]];
  // anticipation: the sprig pops out of the map 3 frames early, squashes, then flies
  const pop = E.backOut(E.seg(age, -0.05, 0.05), 2.5);
  const u = E.cubicInOut(E.clamp01(age / d));
  const pos = (uu) => E.arcTo([start[0], start[1] - 50 * pop], end, uu, -180);
  for (let k = 3; k >= 0; k--) {
    const uu = E.cubicInOut(E.clamp01((age - k / 60) / d));
    const [px, py] = pos(uu);
    const s = 16 * 4 * (k === 0 ? pop : 0.8) * (age < 0 ? 1 : 1);
    E.drawImg(ctx, 'catnip16', Math.round(px), Math.round(py), { w: Math.round(s), h: Math.round(s), pixel: true, alpha: k === 0 ? 1 : 0.25 * (4 - k) / 3, rot: k === 0 ? u * 0.6 : 0 });
  }
  if (age >= 0 && age < 0.15) E.shockwave(ctx, start[0], start[1], age / 0.15, { radius: 90, width: 8, color: 'catnipGlow', rings: 2 });
  sparkle(ctx, E, start[0], start[1] - 30, 70 * E.env(t, t0, 0.1), E.env(t, t0, 0.1), '#eaffc0');
}

// =================================================================================================
// Finale: pinned tiles blast past camera, "8 HEISTS" stamp
// =================================================================================================
function drawFinaleFX(ctx, E, t) {
  const W = 1920, H = 1080;
  // tiles 1..7: lift off the grid into an orbit ring around the frame centre, then zoom past
  // camera (depth by index: far tiles first, near tiles last and biggest)
  const cx = W * 0.32, cy = H / 2; // round 3: orbit kept in the left 55% (08 title owns the right)
  const items = [];
  for (let n = 1; n <= 7; n++) {
    const d0 = T8 - 0.02 + (n - 1) * 0.022;
    const q = E.seg(t, d0, d0 + 0.4);
    if (q <= 0 || q >= 1) continue;
    items.push({ n, q });
  }
  items.sort((a, b) => a.q - b.q);
  for (const { n, q } of items) {
    const [sx, sy] = slotC(n);
    const a1 = Math.PI / 2 + 0.25 + (n - 1) * (Math.PI * 0.85 / 6);
    const ring = [cx + Math.cos(a1) * 470, cy + Math.sin(a1) * 300];
    const p1 = E.expoOut(E.seg(q, 0, 0.35));       // slot -> ring
    const p2 = E.cubicIn(E.seg(q, 0.26, 1));        // ring -> past camera
    const spin = 0.25 * p1 + 0.15 * p2;
    const ang = a1 + spin;
    const rad = E.lerp(1, 2.6, p2);
    let x = E.lerp(sx, cx + Math.cos(ang) * 420 * rad, p1);
    let y = E.lerp(sy, cy + Math.sin(ang) * 330 * rad, p1);
    void ring;
    const sc = E.lerp(1, 1.7, p1) * E.lerp(1, 3.2, p2);
    drawTile(ctx, E, n, t, x - TW / 2, y - TH / 2, TW, TH, { scale: sc, rot: (n % 2 ? 1 : -1) * (0.25 * p1 + 0.5 * p2), alpha: 1 - E.seg(q, 0.75, 1), glow: 0.35 * (1 - p1) });
  }
  // white-hot speed lines on the hit
  const hl = E.env(t, T8, 0.2);
  if (hl > 0.03) E.speedLines(ctx, t, { cx: W / 2, cy, count: 46, inner: 380, outer: 1300, color: '#fff3d0', alpha: 0.55 * hl, seed: 88 });

  // "8 HEISTS" stamp over the 08
  const st = T8 - 4 / 60; // round 2: enters 4 frames early (inside the punch) and lands ON the 08 hit (was 0.29 s late)
  const sq = E.seg(t, st, T8, (x) => E.backOut(x, 2.4));
  if (sq > 0) {
    const sc = E.lerp(2.2, 0.86, sq);
    const tw = E.measureText(ctx, '8 HEISTS', { font: PF, weight: 700, size: 168 }) + 90;
    const y = 236, x = 640;
    ctx.save(); ctx.translate(x, y); ctx.rotate(-0.07 + 0.01 * Math.sin(t * 4)); ctx.scale(sc, sc);
    ctx.globalAlpha = E.clamp01(sq * 2);
    ctx.fillStyle = '#ff2e22';
    ctx.beginPath(); ctx.roundRect(-tw / 2, -92, tw, 184, 26); ctx.fill();
    ctx.strokeStyle = '#fff3d0'; ctx.lineWidth = 8; ctx.beginPath(); ctx.roundRect(-tw / 2 + 12, -80, tw - 24, 160, 18); ctx.stroke();
    E.drawText(ctx, '8 HEISTS', 0, 6, { font: PF, weight: 700, size: 168, color: '#fff3d0', tracking: 0.0, shadow: { color: 'rgba(42,15,31,0.7)', blur: 0, x: 6, y: 8 } });
    ctx.restore();
    if (t < st + 0.5) E.shockwave(ctx, x, y, E.seg(t, st + 0.05, st + 0.5), { radius: 420, width: 22, color: '#ff7aa2', rings: 2 });
    for (const q of E.burst({ seed: 'stamp8', count: 20, t, t0: st + 0.06, x, y, speed: [300, 900], angle: [0, Math.PI * 2], drag: 3, life: [0.3, 0.6], size: [6, 14] }))
      sparkle(ctx, E, q.x, q.y, q.size, q.alpha, q.r(3) < 0.5 ? '#ffc93c' : '#fff3d0');
  }
}

// =================================================================================================
// Power-down: desaturate, CRT collapse to a line, then to a point at (0.5, 0.55)
// =================================================================================================
function powerDown(ctx, E, t) {
  const W = 1920, H = 1080;
  const px = W * 0.5, py = H * 0.5; // s5's iris opens at (960, 540)
  const desat = E.seg(t, PD0, PD0 + 0.16, 'quadOut');
  const sy = 1 - E.expoIn(E.seg(t, PD0 + 0.1, 14.86)) * 0.997;
  const sx = 1 - E.expoIn(E.seg(t, 14.84, 14.965)) * 0.999;
  const bright = E.seg(t, 14.7, 14.86);
  const S = E.snapshot(ctx, 's4pd');
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  ctx.filter = `saturate(${(1 - 0.92 * desat).toFixed(3)}) brightness(${(1 + 1.8 * bright).toFixed(3)}) contrast(${(1 + 0.4 * desat).toFixed(3)})`;
  const dw = W * sx, dh = Math.max(2, H * sy);
  if (sx > 0.004) ctx.drawImage(S, px - dw / 2 - (px - W / 2) * sx, py - dh / 2 - (py - H / 2) * sy, dw, dh);
  ctx.filter = 'none';
  // CRT bloom line once squeezed
  const lineA = E.seg(t, 14.76, 14.86);
  if (lineA > 0) {
    ctx.globalCompositeOperation = 'lighter';
    const lw = Math.max(4, W * sx);
    const g = ctx.createLinearGradient(px - lw / 2, 0, px + lw / 2, 0);
    g.addColorStop(0, 'rgba(255,243,208,0)'); g.addColorStop(0.5, `rgba(255,255,255,${0.9 * lineA})`); g.addColorStop(1, 'rgba(255,243,208,0)');
    ctx.fillStyle = g; ctx.fillRect(px - lw / 2, py - 3, lw, 6);
    ctx.fillStyle = `rgba(255,201,60,${0.25 * lineA})`; ctx.fillRect(px - lw / 2, py - 14, lw, 28);
  }
  // final point glint
  const pa = E.win(t, 14.9, 15.0, 0.03, 0.04);
  if (pa > 0) {
    ctx.globalCompositeOperation = 'lighter';
    const r = 70 * pa;
    const rg = ctx.createRadialGradient(px, py, 0, px, py, r);
    rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.25, 'rgba(255,243,208,0.8)'); rg.addColorStop(1, 'rgba(255,201,60,0)');
    ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = pa; sparkle(ctx, E, px, py, 120 * pa, 1, '#fff3d0');
  }
  ctx.restore();
}

// Radial RGB split where every channel scales >= 1 (no un-covered fringe at the frame border).
function rgbZoomOut(c, E, amount) {
  const W = 1920, H = 1080, cx = W / 2, cy = H / 2;
  const S = E.snapshot(c, 's4rgbsrc'); const C = E.surface('s4rgbch', W, H);
  c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
  for (const [cc, s] of [['#ff0000', 1 + 2 * amount], ['#00ff00', 1 + amount], ['#0000ff', 1]]) {
    C.ctx.globalCompositeOperation = 'source-over'; C.ctx.clearRect(0, 0, W, H);
    C.ctx.setTransform(s, 0, 0, s, cx - cx * s, cy - cy * s); C.ctx.drawImage(S, 0, 0); C.ctx.setTransform(1, 0, 0, 1, 0, 0);
    C.ctx.globalCompositeOperation = 'multiply'; C.ctx.fillStyle = cc; C.ctx.fillRect(0, 0, W, H);
    c.globalCompositeOperation = 'lighter'; c.drawImage(C, 0, 0);
  }
  c.restore();
}
