// s3: THE LEVELS, part 1 (bars 5-6, 7.500-11.250 s). Heists 01-04, two beats each.
// Beat A (level hit): slanted wipe reveals the level's wide shot; giant number slams, name decodes,
// mechanic tag pill, three stars. Beat B (clap): inset card with that level's signature mechanic.
// Persistent HUD: HEIST N / 08 progress rail with a hero cat walking it, catnip counter.
// Entry: diagonal slit opens (match to s2's slit). Exit: level 04 pushes out, bleeds 0.2 s under s4.

const B = 0.46875, LV = 2 * B, T0 = 7.5, T_END = 11.25;
const LT = (i) => T0 + i * LV;
const SLANT = Math.tan((12 * Math.PI) / 180); // "/" edge: x shifts right going up (12 deg = s2's closing slit, exact match cut)
const PASSION = '"Passion One", "Arial Black", Impact, sans-serif';
const NUNITO = '"Nunito", "Helvetica Neue", Helvetica, Arial, sans-serif';
// Round 2: each wipe now FINISHES 2 frames before its level hit (was +0.13 s after), and the type is
// led by LEAD so the first fully readable numeral sits on the impact frame.
const WIPE_DUR = 0.16, WIPE_PRE = WIPE_DUR + 2 / 60; // wipe edge crosses the frame in [hit - pre, hit - 2f]
const LEAD = 0.16;
const NUMCOL = ['coin', 'catnipGlow', 'pink', '#ff9a3c'];     // per-heist accent (number, rule, pill)
const TINT = [['#ffc93c', 0.3], ['#63e08d', 0.32], ['#ff7aa2', 0.32], ['#ff9a3c', 0.35]]; // round 3: per-heist accent grade at 30-35%

const LEVELS = [
  { name: 'KIBBLE CORP WAREHOUSE', tag: 'MOVE · SNEAK · SWAP · PLATE DOORS', bg: 'lvl-01', inset: 'h01-plate-swap', f0: 16, evtF: 19, fx: 0.3, fy: 0.62, zoom: 1.45, chip: 'SWAP', ring: 'coin', coin: { t: 7.734375, x: 980, y: 470 } },
  { name: 'KENNEL ROW', tag: 'MEOW TO LURE THE DOORMAN', bg: 'lvl-02', inset: 'h02-meow-lure', f0: 43, evtF: 43, fx: 0.5, fy: 0.62, zoom: 1.35, chip: 'MEOW', ring: 'meowRing', coin: { t: 8.4375 + 19 / 60, x: 1000, y: 560 } },
  { name: 'TWIN LOCKS', tag: 'CHAINED PLATE DOORS', bg: 'lvl-03', inset: 'h03-twin-locks', f0: 15, evtF: 18, fx: 0.5, fy: 0.45, zoom: 1.5, chip: 'SWAP', ring: 'coin', split: true },
  { name: 'COUNTING HOUSE', tag: 'KEY + VAULT', bg: 'lvl-04', inset: 'h04-key-doors', f0: 102, evtF: 103, speed: 0.6, fx: 0.5, fy: 0.47, zoom: 1.7, chip: 'KEY', ring: 'coin', key: true, coin: { t: 10.3125 + 23 / 60, x: 1000, y: 560 } },
];
// layout side of the type: 'L' for 01/03, 'R' for 02/04; the wipe comes from that side
const SIDE = (i) => (i % 2 === 0 ? 1 : -1); // +1 = type left, -1 = type right
// wipe travel direction into level j (+1 = left->right). j = 0 is the slit.
const WDIR = (j) => (j % 2 === 0 ? 1 : -1);

export default {
  start: T0 - 0.02, // the slit reopens from s2's hairline (7.483) so 7.50 lands on an open frame
  end: T_END + 0.2,
  async init() {
    const load = async (fam, url, desc) => { try { const f = new FontFace(fam, `url(${url})`, desc); await f.load(); document.fonts.add(f); } catch { /* falls back */ } };
    await Promise.all([
      load('Passion One', 'assets/sprites/fonts/passion-one-latin-700-normal.woff2', { weight: '700' }),
      load('Passion One', 'assets/sprites/fonts/passion-one-latin-ext-700-normal.woff2', { weight: '700', unicodeRange: 'U+0100-024F, U+1E00-1EFF' }),
      load('Nunito', 'assets/sprites/fonts/nunito-latin-wght-normal.woff2', { weight: '200 1000' }),
      load('Nunito', 'assets/sprites/fonts/nunito-latin-ext-wght-normal.woff2', { weight: '200 1000', unicodeRange: 'U+0100-024F, U+1E00-1EFF' }),
    ]);
  },

  draw(ctx, t, lt, E) {
    const { W, H } = E;
    ctx.fillStyle = E.col('night'); ctx.fillRect(0, 0, W, H);

    // ---- background stack: current level, with the next one wiping over it
    let cur = E.clamp(Math.floor((t - T0 + WIPE_PRE) / LV), 0, 3);
    const wipeP = (j) => E.seg(t, LT(j) - WIPE_PRE, LT(j) - WIPE_PRE + WIPE_DUR, 'snap');
    if (cur === 0) {
      drawSlit(ctx, t, E);
    } else {
      const p = wipeP(cur);
      if (p < 1) {
        drawLevel(ctx, cur - 1, t, E);
        const e = edgePos(p, WDIR(cur), E);
        E.mask(ctx, (c) => revealPoly(c, e, WDIR(cur), E), (c) => drawLevel(c, cur, t, E));
        drawEdge(ctx, e, WDIR(cur), t, E, 1);
      } else drawLevel(ctx, cur, t, E);
      edgeSparks(ctx, t, cur, E);
    }
    if (t >= T_END) return; // bleed under s4: background only

    // ---- persistent HUD
    drawDust(ctx, t, E);
    drawRail(ctx, t, E);
    drawCounter(ctx, t, E);
  },

  fx(t, lt, E) {
    if (t >= T_END || t < T0) return {};
    let shake = 0, ab = 0, flash = 0, mb = 0;
    for (let j = 0; j < 4; j++) {
      const hit = E.env(t, LT(j), 0.11);
      shake += 14 * (j === 0 ? 1.14 : 0.54) * hit + 6 * E.env(t, LT(j), 0.02); // + a hard 6 px kick on the impact frame
      flash = Math.max(flash, 0.3 * E.env(t, LT(j), 0.012)); // 1-frame flash on the impact frame
      ab += 4 * hit;
      flash = Math.max(flash, (j === 0 ? 0.28 : 0.16) * E.env(t, LT(j) + (j === 0 ? 0.035 : 0), j === 0 ? 0.06 : 0.045));
      if (j > 0 && t >= LT(j) - WIPE_PRE && t < LT(j) - WIPE_PRE + WIPE_DUR) mb = 3;
      // clap: inset card lands
      ab += 3 * E.env(t, LT(j) + B, 0.07);
      shake += 4 * E.env(t, LT(j) + B, 0.06);
    }
    // key grab sparkle flash
    flash = Math.max(flash, 0.22 * E.env(t, keyTime(), 0.06));
    // whoosh anticipation: the frame leans in a hair before each wipe
    let zoom = 1 + 0.015 * E.cueEnv(t, 'kick', 0.1);
    for (let j = 1; j <= 4; j++) zoom *= 1 + 0.025 * E.seg(t, LT(j) - 0.22, LT(j) - WIPE_PRE, 'expoIn') * (1 - E.seg(t, LT(j) - WIPE_PRE, LT(j) + 0.02));
    return { shake, aberration: ab, flash, flashColor: '#fff3d0', motionBlur: mb, zoom, grain: 0.035, vignette: 0.35 };
  },
};

const keyTime = () => LT(3) + B + (LEVELS[3].evtF - LEVELS[3].f0) / 30 / LEVELS[3].speed;

// ---------------------------------------------------------------------------------------------
// wipe geometry
// ---------------------------------------------------------------------------------------------
const edgeX = (e, y) => e - (y - 540) * SLANT;
function edgePos(p, dir, E) {
  const ext = 540 * SLANT + 140;
  return dir > 0 ? E.lerp(-ext, E.W + ext, p) : E.lerp(E.W + ext, -ext, p);
}
function revealPoly(c, e, dir, E) {
  const y0 = -120, y1 = E.H + 120, far = dir > 0 ? -400 : E.W + 400;
  E.path.poly(c, [[far, y0], [edgeX(e, y0), y0], [edgeX(e, y1), y1], [far, y1]]);
}
// band of the leading edge: hot white line, gold strip, catnip strip, all on the revealed side
function drawEdge(c, e, dir, t, E, a = 1) {
  const y0 = -120, y1 = E.H + 120;
  const strip = (o0, o1, color, alpha) => {
    c.save(); c.globalAlpha = alpha * a; c.fillStyle = E.col(color); c.beginPath();
    E.path.poly(c, [[edgeX(e - dir * o0, y0), y0], [edgeX(e - dir * o1, y0), y0], [edgeX(e - dir * o1, y1), y1], [edgeX(e - dir * o0, y1), y1]]);
    c.fill(); c.restore();
  };
  // soft glow ahead of the edge
  c.save(); c.globalCompositeOperation = 'lighter';
  const gx = edgeX(e, 540);
  const g = c.createLinearGradient(gx, 0, gx + dir * 260, 0);
  g.addColorStop(0, E.rgba('coin', 0.45 * a)); g.addColorStop(1, E.rgba('coin', 0));
  c.fillStyle = g; c.beginPath();
  E.path.poly(c, [[edgeX(e, y0), y0], [edgeX(e + dir * 260, y0), y0], [edgeX(e + dir * 260, y1), y1], [edgeX(e, y1), y1]]);
  c.fill(); c.restore();
  strip(0, 46, 'coin', 1);
  strip(46, 70, 'catnip', 1);
  strip(70, 80, 'outline', 0.8);
  strip(-3, 7, 'rescueFlash', 1);
}
// pixel shards kicked off the edge as it crosses
function edgeSparks(c, t, j, E) {
  const ts = LT(j) - WIPE_PRE, dir = WDIR(j);
  if (t < ts || t > ts + 0.9) return;
  const cols = ['coin', 'catnipGlow', 'cream', 'pink'];
  c.save();
  for (let i = 0; i < 46; i++) {
    const r = (k) => E.rand('s3spark', j, i, k);
    const u = r(0), born = ts + u * WIPE_DUR, age = t - born, life = 0.35 + 0.4 * r(1);
    if (age < 0 || age > life) continue;
    const y = 40 + r(2) * (E.H - 80);
    const x0 = edgeX(edgePos(E.snap(u), dir, E), y);
    const vx = dir * (500 + 900 * r(3)), vy = -300 - 500 * r(4);
    const [x, yy] = E.ballistic(x0, y, vx, vy, 1400, 2.2, age);
    const s = Math.round(4 + 8 * r(5)) * (1 - age / life);
    c.globalAlpha = 1 - age / life; c.fillStyle = E.col(cols[i % 4]);
    c.fillRect(Math.round(x), Math.round(yy), s, s);
  }
  c.restore();
}

// level 01 entrance: a slanted slit opens from a hairline (matches s2's slit close)
function drawSlit(c, t, E) {
  const { W, H } = E;
  const lt = t - T0;
  const p = E.seg(lt, -0.017, 0.11, 'expoOut'); // ~2/3 open on the 7.50 hit, fully open by 7.61
  if (p >= 1) { drawLevel(c, 0, t, E); return; }
  const hw = 4 + p * (W / 2 + 540 * SLANT + 160);
  const y0 = -120, y1 = H + 120;
  const polyFn = (cc) => E.path.poly(cc, [[edgeX(W / 2 - hw, y0), y0], [edgeX(W / 2 + hw, y0), y0], [edgeX(W / 2 + hw, y1), y1], [edgeX(W / 2 - hw, y1), y1]]);
  E.mask(c, polyFn, (cc) => drawLevel(cc, 0, t, E));
  drawEdge(c, W / 2 + hw, -1, t, E, 1);
  drawEdge(c, W / 2 - hw, 1, t, E, 1);
}

// ---------------------------------------------------------------------------------------------
// one level: background clip + grade + type + inset
// ---------------------------------------------------------------------------------------------
function drawLevel(c, i, t, E) {
  const { W, H } = E;
  const L = LEVELS[i], lt = t - LT(i), sd = SIDE(i);
  const nextHit = i < 3 ? LT(i + 1) : T_END;
  // pushed away while the next level wipes over it
  const push = E.seg(t, nextHit - WIPE_PRE, nextHit - WIPE_PRE + WIPE_DUR + 0.04, 'expoIn');
  const pushDir = i < 3 ? WDIR(i + 1) : -1;
  const lead = E.seg(t, nextHit - 0.22, nextHit - WIPE_PRE, 'expoIn');
  const zIn = E.expoOut(E.clamp01(Math.max(0, lt) / (LV + 0.2)));
  const mv = E.sineInOut(E.clamp01(Math.max(0, lt) / (LV + 0.1)));
  // each heist gets its own camera move: 01 push in, 02 lateral pan, 03 dutch roll, 04 crane down
  let z = 1.12 + 0.05 * lead + 0.012 * E.cueEnv(t, 'kick', 0.12), x = pushDir * 180 * push, y = 0, rot = 0;
  if (i === 0) z += 0.16 * zIn;
  else if (i === 1) { x += 260 - 420 * mv; z += 0.06; }
  else if (i === 2) { rot = E.deg(-6) * (1 - 0.6 * mv); z += 0.14; }
  else { y = 150 - 230 * mv; z += 0.1; }
  E.camera(c, { x, y, rot, zoom: z }, (cc) => {
    E.drawClip(cc, L.bg, Math.max(0, lt), -120, -70, W + 240, H + 140, { speed: 2 });
  });
  if (TINT[i]) {
    // round 3: duotone-ish accent grade (soft-light + a touch of colour) and an accent edge vignette
    c.save(); c.globalCompositeOperation = 'soft-light'; c.globalAlpha = TINT[i][1] * 1.6; c.fillStyle = TINT[i][0]; c.fillRect(-100, -100, W + 200, H + 200);
    c.globalCompositeOperation = 'color'; c.globalAlpha = TINT[i][1] * 0.45; c.fillRect(-100, -100, W + 200, H + 200);
    c.globalCompositeOperation = 'screen'; c.globalAlpha = 1;
    const vg = c.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, W * 0.62);
    vg.addColorStop(0, E.rgba(TINT[i][0], 0)); vg.addColorStop(1, E.rgba(TINT[i][0], 0.42));
    c.fillStyle = vg; c.fillRect(-100, -100, W + 200, H + 200);
    c.restore();
  }

  // grade: darken the type side and the rail band
  const gx0 = sd > 0 ? 0 : W, gx1 = sd > 0 ? 1050 : W - 1050;
  const g = c.createLinearGradient(gx0, 0, gx1, 0);
  g.addColorStop(0, E.rgba('night', 0.86)); g.addColorStop(0.55, E.rgba('night', 0.45)); g.addColorStop(1, E.rgba('night', 0));
  c.fillStyle = g; c.fillRect(-100, -100, W + 200, H + 200);
  const gb = c.createLinearGradient(0, H - 300, 0, H);
  gb.addColorStop(0, E.rgba('night', 0)); gb.addColorStop(1, E.rgba('night', 0.8));
  c.fillStyle = gb; c.fillRect(-100, H - 300, W + 200, 400);
  if (push > 0) { c.fillStyle = E.rgba('night', 0.55 * push); c.fillRect(-100, -100, W + 200, H + 200); }

  // light leak swell on the hit
  E.lightLeak(c, t, { seed: 30 + i, intensity: 0.07 + 0.22 * E.env(lt, 0, 0.4), colors: ['#ff7aa2', '#ffc93c', '#9966cc'], speed: 0.5 });

  // ghost numeral, far depth layer (moves faster than the type: parallax)
  const num = String(i + 1).padStart(2, '0');
  const gq = E.seg(lt, 0, 0.5, 'expoOut');
  E.drawText(c, num, (sd > 0 ? 1380 : 540) + sd * -160 * Math.max(0, lt) - sd * 260 * (1 - gq), 470, {
    size: 900, font: PASSION, weight: 700, strokeOnly: true, stroke: 'lilac', strokeWidth: 4, alpha: 0.12 * gq * (1 - push),
  });

  const exitP = E.seg(t, nextHit - WIPE_PRE - 0.07, nextHit - WIPE_PRE + 0.05, 'expoIn');
  drawType(c, i, lt + LEAD, exitP, E);
  drawInset(c, i, t, lt, exitP, E);
}

function drawType(c, i, lt, exitP, E) {
  const { W } = E;
  const L = LEVELS[i], sd = SIDE(i);
  const X0 = sd > 0 ? 140 : W - 140, align = sd > 0 ? 'left' : 'right';
  const exDir = -sd; // out toward the side it came from
  const kick = E.cueEnv(E.t, 'kick', 0.1);
  if (exitP >= 1) return;

  // "HEIST" kicker + rule
  const kq = E.seg(lt, 0.02, 0.18, 'expoOut');
  c.save(); c.globalAlpha = 1 - exitP;
  const kx = X0 + exDir * 300 * exitP;
  E.wipeText(c, 'HEIST', kx, 238, { size: 34, font: NUNITO, weight: 900, tracking: 0.55, color: 'catnipGlow', align }, kq, { cursor: kq < 1, cursorColor: 'coin' });
  c.fillStyle = E.col('catnipGlow');
  const rw = 220 * E.seg(lt, 0.06, 0.3, 'expoOut');
  c.fillRect(sd > 0 ? kx + 210 : kx - 210 - rw, 236, rw, 4);
  c.restore();

  // giant number with smear trail + lagging outline echo
  const num = String(i + 1).padStart(2, '0');
  const exAt = (tt) => E.seg(tt, LV + LEAD - WIPE_PRE - 0.07, LV + LEAD - WIPE_PRE + 0.05, 'expoIn');
  const drawNum = (tt, alphaMul, echo) => {
    const ex = exAt(tt);
    if (ex >= 1) return;
    const bump = 1 + 0.03 * E.elasticOut(E.seg(tt, B + LEAD, B + LEAD + 0.4)) * (1 - E.seg(tt, B + LEAD + 0.2, B + LEAD + 0.45)) + 0.015 * kick;
    E.drawText(c, num, X0 + sd * 14 * Math.max(0, tt) + exDir * 1100 * ex + (echo ? 18 : 0), 440 + (echo ? 18 : 0), {
      size: 360, font: PASSION, weight: 700, align, tracking: -0.02,
      color: echo ? 'catnip' : NUMCOL[i], strokeOnly: echo, stroke: echo ? 'catnip' : 'outline', strokeWidth: echo ? 5 : 12,
      extrude: echo ? null : { depth: 18, dx: 0.6, dy: 0.9, color: 'plum', dark: 0.6 },
      alpha: alphaMul * (1 - ex * ex),
      perChar: ({ i: k }) => {
        const q = E.seg(tt, k * 0.04, 0.22 + k * 0.04);
        if (q <= 0) return false;
        const e = E.backOut(q, 1.9);
        const s = E.lerp(1.6, 1, E.expoOut(q)) * bump;
        return { x: -sd * 460 * (1 - e), scale: s, sx: 1 + 0.9 * ex, sy: 1 - 0.25 * ex, alpha: E.clamp01(q * 5) };
      },
    });
  };
  // echo lags 0.06 s behind (spring depth)
  drawNum(lt - 0.06, 0.8, true);
  const fast = lt < 0.24 || exitP > 0;
  if (fast) { drawNum(lt - 2 / 60, 0.22, false); drawNum(lt - 1 / 60, 0.38, false); }
  drawNum(lt, 1, false);

  // level name: decodes in, letters drop with stagger
  const name = L.name;
  let size = 82;
  const mw = E.measureText(c, name, { size, font: 'display', tracking: 0.02 });
  if (mw > 1000) size = Math.floor((size * 1000) / mw);
  const dq = E.seg(lt, 0.0, LEAD - 1 / 60); // round 3: name decodes before the hit, clean on the impact frame
  const str = E.scramble(name, dq, 300 + i);
  const nx = X0 + exDir * 700 * exitP;
  E.drawText(c, str, nx, 650, {
    size, font: 'display', tracking: 0.02, align, color: 'cream', stroke: 'outline', strokeWidth: 9,
    extrude: { depth: 7, color: 'outline' }, alpha: 1 - exitP,
    perChar: ({ i: k, n }) => {
      const q = E.stagger(lt, k, n, { start: 0.0, spread: 0.06, dur: 0.1, e: 'backOut' });
      if (q <= 0) return false;
      const settled = str[k] === name[k];
      return { y: (1 - q) * 70 + 2 * Math.sin(E.t * 3 + k), alpha: E.clamp01(q * 3), color: settled ? 'cream' : 'catnipGlow' };
    },
  });
  // underline
  const uw = Math.min(1000, mw * (size / 82)) * E.seg(lt, 0.12, 0.38, 'expoOut');
  c.save(); c.globalAlpha = 1 - exitP; c.fillStyle = E.col(NUMCOL[i]);
  c.fillRect(sd > 0 ? nx : nx - uw, 704, uw, 7);
  c.fillStyle = E.col('coin'); c.fillRect(sd > 0 ? nx + uw - 30 : nx - uw, 704, Math.min(30, uw), 7);
  c.restore();

  // mechanic tag pill
  const tq = E.seg(lt, 0.14, 0.32, 'expoOut');
  if (tq > 0) {
    const ts = 28, tw = E.measureText(c, L.tag, { size: ts, font: NUNITO, weight: 900, tracking: 0.08 }) + 64, th = 58;
    const px = (sd > 0 ? X0 : X0 - tw) + exDir * 500 * exitP, py = 738;
    c.save(); c.globalAlpha = 1 - exitP;
    E.mask(c, (cc) => sd > 0 ? cc.rect(px - 10, py - 10, (tw + 20) * tq, th + 20) : cc.rect(px + tw + 10 - (tw + 20) * tq, py - 10, (tw + 20) * tq, th + 20), (cc) => {
      cc.fillStyle = E.col('outline'); cc.beginPath(); cc.roundRect(px + 5, py + 6, tw, th, th / 2); cc.fill();
      cc.fillStyle = E.col('catnipLight'); cc.beginPath(); cc.roundRect(px, py, tw, th, th / 2); cc.fill();
      E.drawText(cc, L.tag, px + tw / 2 + sd * -30 * (1 - tq), py + th / 2 + 2, { size: ts, font: NUNITO, weight: 900, tracking: 0.08, color: 'outline' });
    });
    c.restore();
  }

  // three stars, popping on the off-beat 8ths
  for (let k = 0; k < 3; k++) {
    const s0 = 0.2 + k * 0.06;
    const q = E.seg(lt, s0, s0 + 0.45);
    if (q <= 0) continue;
    const sc = E.elasticOut(q, 1, 0.35);
    const sx = X0 + sd * (38 + k * 88) + exDir * (420 + k * 60) * exitP, sy = 862 + Math.sin(E.t * 4 + k) * 3;
    const r = 34 * sc * (1 + 0.08 * kick);
    const rot = -Math.PI / 2 + (1 - E.expoOut(q)) * -2.4 * sd;
    c.save(); c.globalAlpha = 1 - exitP;
    E.star(c, sx + 4, sy + 6, r, { fill: 'outline', rot });
    E.star(c, sx, sy, r, { fill: 'coin', stroke: 'outline', lineWidth: 5, rot });
    E.star(c, sx - r * 0.12, sy - r * 0.12, r * 0.42, { fill: E.rgba('#ffffff', 0.55), rot });
    const fl = E.env(lt, s0, 0.06);
    if (fl > 0.02) E.star(c, sx, sy, r * 1.05, { fill: E.rgba('#ffffff', fl), rot });
    c.restore();
    // sparkle shards
    for (const p of E.burst({ seed: 70 + i * 3 + k, count: 7, t: lt, t0: s0, x: sx, y: sy, speed: [180, 420], gravity: 500, life: [0.25, 0.45], size: [5, 9] })) {
      c.save(); c.globalAlpha = p.alpha * (1 - exitP); c.fillStyle = E.col(p.i % 2 ? 'coin' : 'cream');
      c.fillRect(Math.round(p.x), Math.round(p.y), Math.round(p.size), Math.round(p.size)); c.restore();
    }
  }
}

// ---------------------------------------------------------------------------------------------
// inset card (beat B)
// ---------------------------------------------------------------------------------------------
function card(c, E, cx, cy, w, h, rot, scale, alpha, drawContent, { flash = 0, border = 'cream' } = {}) {
  c.save();
  c.translate(cx, cy); c.rotate(rot); c.scale(scale, scale);
  c.globalAlpha *= alpha;
  c.fillStyle = E.rgba('#000', 0.45); c.beginPath(); c.roundRect(-w / 2 + 16, -h / 2 + 22, w, h, 22); c.fill();
  c.fillStyle = E.col(border); c.beginPath(); c.roundRect(-w / 2 - 10, -h / 2 - 10, w + 20, h + 20, 26); c.fill();
  c.fillStyle = E.col('outline'); c.beginPath(); c.roundRect(-w / 2 - 2, -h / 2 - 2, w + 4, h + 4, 18); c.fill();
  E.mask(c, (cc) => cc.roundRect(-w / 2, -h / 2, w, h, 16), (cc) => {
    drawContent(cc, -w / 2, -h / 2, w, h);
    // inner vignette + top sheen
    const v = cc.createRadialGradient(0, 0, Math.min(w, h) * 0.3, 0, 0, Math.hypot(w, h) * 0.6);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(13,6,22,0.55)');
    cc.fillStyle = v; cc.fillRect(-w / 2, -h / 2, w, h);
    const s = cc.createLinearGradient(0, -h / 2, 0, -h / 2 + h * 0.35);
    s.addColorStop(0, 'rgba(255,255,255,0.14)'); s.addColorStop(1, 'rgba(255,255,255,0)');
    cc.fillStyle = s; cc.fillRect(-w / 2, -h / 2, w, h);
    if (flash > 0.01) { cc.fillStyle = `rgba(255,243,208,${flash})`; cc.fillRect(-w / 2, -h / 2, w, h); }
  });
  c.restore();
}
function chip(c, E, x, y, label, q, rot, color = 'coin') {
  if (q <= 0) return;
  const s = E.elasticOut(q, 1, 0.4);
  const w = E.measureText(c, label, { size: 44, font: 'display', tracking: 0.06 }) + 44;
  c.save(); c.translate(x, y); c.rotate(rot); c.scale(s, s);
  c.fillStyle = E.col('outline'); c.beginPath(); c.roundRect(-w / 2 + 5, -32 + 6, w, 64, 14); c.fill();
  c.fillStyle = E.col(color); c.beginPath(); c.roundRect(-w / 2, -32, w, 64, 14); c.fill();
  E.drawText(c, label, 0, 3, { size: 44, font: 'display', tracking: 0.06, color: 'outline' });
  c.restore();
}
function brackets(c, E, cx, cy, w, h, rot, m, alpha, color = 'coin') {
  if (alpha <= 0.01) return;
  c.save(); c.translate(cx, cy); c.rotate(rot); c.globalAlpha *= alpha;
  c.strokeStyle = E.col(color); c.lineWidth = 7; c.lineCap = 'square';
  const L = 46, x0 = -w / 2 - m, y0 = -h / 2 - m, x1 = w / 2 + m, y1 = h / 2 + m;
  c.beginPath();
  c.moveTo(x0, y0 + L); c.lineTo(x0, y0); c.lineTo(x0 + L, y0);
  c.moveTo(x1 - L, y0); c.lineTo(x1, y0); c.lineTo(x1, y0 + L);
  c.moveTo(x1, y1 - L); c.lineTo(x1, y1); c.lineTo(x1 - L, y1);
  c.moveTo(x0 + L, y1); c.lineTo(x0, y1); c.lineTo(x0, y1 - L);
  c.stroke(); c.restore();
}
function ringEcho(c, E, cx, cy, w, h, rot, p, color) {
  if (p <= 0 || p >= 1) return;
  const g = E.expoOut(p) * 90;
  c.save(); c.translate(cx, cy); c.rotate(rot);
  c.globalAlpha = Math.pow(1 - p, 1.3); c.strokeStyle = E.col(color); c.lineWidth = 12 * (1 - p) + 2;
  c.beginPath(); c.roundRect(-w / 2 - 10 - g, -h / 2 - 10 - g, w + 20 + 2 * g, h + 20 + 2 * g, 26 + g * 0.4); c.stroke();
  c.restore();
}

function drawInset(c, i, t, lt, exitP, E) {
  const { W } = E;
  const L = LEVELS[i], sd = SIDE(i);
  if (lt < B - 0.07 || exitP >= 1) return;
  const sp = L.speed || 1;
  const outDir = sd; // card sits opposite the type and leaves toward its own edge
  const q = E.seg(lt, B - 0.07, B + 0.15);
  const e = E.backOut(q, 1.9);
  const ex = exitP;
  const cx0 = sd > 0 ? 1430 : 490, cy0 = 360;
  const cx = cx0 + sd * 1250 * (1 - e) + outDir * 1300 * ex + sd * -10 * (lt - B);
  const cy = cy0 + 40 * (1 - e) - 6 * Math.sin((lt - B) * 5);
  const rot = sd * (-0.035 + 0.22 * (1 - e)) + outDir * 0.25 * ex;
  const sc = (0.94 + 0.06 * E.expoOut(q)) * (1 + 0.012 * E.cueEnv(t, 'kick', 0.1));
  const ct = (L.f0 - 1) / 30 + Math.max(0, lt - B) * sp;
  const evt = B + (L.evtF - L.f0) / 30 / sp;
  const land = E.env(lt, B, 0.03);
  const zDrift = 1 + 0.06 * E.seg(lt, B, LV + 0.2);

  // smear trail while it flies
  const flying = q < 0.55 || ex > 0;
  const big = L.split ? [560, 315] : [720, 405];
  if (flying) {
    for (let k = 3; k >= 1; k--) {
      const ox = sd * 1250 * (E.backOut(q, 1.9) - E.backOut(E.seg(lt - k / 60, B - 0.07, B + 0.15), 1.9)) - outDir * 1300 * (ex - E.seg(t - k / 60, t - lt + LV - 0.16, t - lt + LV - 0.04, 'expoIn'));
      c.save(); c.globalAlpha = 0.18 * (4 - k) / 3;
      c.fillStyle = E.col(k === 1 ? 'cream' : 'lavender');
      c.translate(cx + ox, cy); c.rotate(rot);
      c.beginPath(); c.roundRect(-big[0] / 2, -big[1] / 2, big[0], big[1], 22); c.fill(); c.restore();
    }
  }

  if (L.split) {
    // TWIN LOCKS: freeze-frame of the held plate, then the swap card springs out of it, linked
    const [w, h] = big;
    const ax = cx - 170, ay = cy - 60;
    const bq = E.seg(lt, evt - 0.02, evt + 0.2);
    const be = E.backOut(bq, 2.2);
    const bx = E.lerp(ax, cx + 120, be) + outDir * 600 * ex, by = E.lerp(ay, cy + 180, be);
    if (bq > 0) {
      E.chainLink(c, ax, ay, bx, by, E.seg(lt, evt, evt + 0.15, 'expoOut'), { color: 'coin', width: 7, links: 4, alpha: 1 - ex, pulse: E.fract((lt - evt) * 2.2), pulseColor: 'cream' });
    }
    card(c, E, ax, ay, w, h, rot - sd * 0.02, sc, 1, (cc, x, y, ww, hh) => {
      E.drawClip(cc, L.inset, (17 - 1) / 30, x, y, ww, hh, { fx: 0.47, fy: 0.46, zoom: 1.9 * zDrift });
    }, { flash: land * 0.5 });
    brackets(c, E, ax, ay, w, h, rot - sd * 0.02, 12 + 50 * (1 - E.expoOut(E.seg(lt, B, B + 0.16))), E.seg(lt, B, B + 0.05) * (1 - E.seg(lt, B + 0.3, B + 0.45)) * (1 - ex));
    chip(c, E, ax - w / 2 + 70, ay - h / 2 - 6, 'PLATE', E.seg(lt, B + 0.02, B + 0.4), -0.08 * sd, 'pink');
    if (bq > 0) {
      card(c, E, bx, by, w, h, rot + sd * 0.05, sc * E.lerp(0.7, 1, E.expoOut(bq)), E.clamp01(bq * 4), (cc, x, y, ww, hh) => {
        E.drawClip(cc, L.inset, ct, x, y, ww, hh, { fx: 0.5, fy: 0.42, zoom: 1.7 * zDrift });
      }, { flash: E.env(lt, evt + 0.06, 0.08) * 0.7, border: 'coin' });
      chip(c, E, bx + w / 2 - 60, by - h / 2 - 6, 'SWAP', E.seg(lt, evt + 0.06, evt + 0.45), 0.07 * sd);
      ringEcho(c, E, bx, by, w * sc, h * sc, rot + sd * 0.05, E.seg(lt, evt + 0.08, evt + 0.5), 'coin');
    }
    return;
  }

  const [w, h] = big;
  card(c, E, cx, cy, w, h, rot, sc, 1, (cc, x, y, ww, hh) => {
    E.drawClip(cc, L.inset, ct, x, y, ww, hh, { fx: L.fx, fy: L.fy, zoom: L.zoom * zDrift });
    // key moment inside the card
    const kp = E.seg(lt, evt, evt + 0.5);
    if (kp > 0 && kp < 1) E.shockwave(cc, 0, hh * (L.fy - 0.5) * 0.4, kp, { radius: 340, width: 22, color: L.ring, rings: 3, gap: 0.18 });
  }, { flash: land * 0.5 });
  brackets(c, E, cx, cy, w, h, rot, 12 + 60 * (1 - E.expoOut(E.seg(lt, B, B + 0.16))), E.seg(lt, B, B + 0.05) * (1 - E.seg(lt, B + 0.3, B + 0.45)) * (1 - ex));
  ringEcho(c, E, cx, cy, w * sc, h * sc, rot, E.seg(lt, evt + 0.02, evt + 0.45), L.ring);
  chip(c, E, cx - sd * (w / 2 - 80), cy - h / 2 - 8, L.chip, E.seg(lt, B + 0.03, B + 0.42), -0.07 * sd, L.ring === 'meowRing' ? 'catnipGlow' : 'coin');

  if (L.key) {
    // KEY grab: gold burst out of the card + sparkle stars
    const kt = evt;
    for (const p of E.burst({ seed: 911, count: 34, t: lt, t0: kt, x: cx, y: cy, speed: [500, 1300], gravity: 700, drag: 2.4, life: [0.35, 0.7], size: [8, 18] })) {
      c.save(); c.globalAlpha = p.alpha * (1 - ex);
      if (p.i % 5 === 0) E.star(c, p.x, p.y, p.size * 1.2, { fill: 'cream', rot: p.rot });
      else { c.fillStyle = E.col(p.i % 2 ? 'coin' : 'rescueFlash'); c.fillRect(Math.round(p.x), Math.round(p.y), Math.round(p.size * 0.7), Math.round(p.size * 0.7)); }
      c.restore();
    }
    E.shockwave(c, cx, cy, E.seg(lt, kt, kt + 0.45), { radius: 620, width: 26, color: 'coin', rings: 2, gap: 0.2 });
  }
}

// ---------------------------------------------------------------------------------------------
// HUD: progress rail with the hero cat, catnip counter, dust
// ---------------------------------------------------------------------------------------------
function levelAt(t) { return Math.max(0, Math.min(3, Math.floor((t - T0) / LV))); }

function drawRail(c, t, E) {
  const lt = t - T0;
  const enter = E.backOut(E.seg(lt, 0.04, 0.3), 1.9);
  const leave = E.seg(t, T_END - 0.14, T_END - 0.02, 'expoIn');
  const yOff = 150 * (1 - enter) + 150 * leave;
  const n = 8, sw = 86, gap = 12, total = n * sw + (n - 1) * gap, x0 = 960 - total / 2, y = 1004 + yOff, sh = 16;
  const cur = levelAt(t), lp = E.clamp01((t - LT(cur)) / LV);
  c.save(); c.globalAlpha = 1 - leave;
  // labels
  E.drawText(c, 'HEIST', x0 - 22, y + 2, { size: 24, font: NUNITO, weight: 900, tracking: 0.35, color: 'lilac', align: 'right' });
  // number flip
  const nx = x0 + total + 22;
  E.mask(c, (cc) => cc.rect(nx - 4, y - 34, 170, 70), (cc) => {
    const fq = E.seg(t, LT(cur), LT(cur) + 0.16, 'backOut');
    const prev = String(cur).padStart(2, '0'), now = String(cur + 1).padStart(2, '0');
    if (cur > 0 && fq < 1) E.drawText(cc, prev, nx, y + 2 - 60 * fq, { size: 46, font: PASSION, weight: 700, color: 'coin', align: 'left' });
    E.drawText(cc, now, nx, y + 2 + 60 * (1 - (cur === 0 ? 1 : fq)), { size: 46, font: PASSION, weight: 700, color: 'coin', align: 'left' });
  });
  E.drawText(c, '/ 08', nx + 58, y + 4, { size: 30, font: PASSION, weight: 700, color: 'lavender', align: 'left' });
  // segments
  for (let k = 0; k < n; k++) {
    const sx = x0 + k * (sw + gap);
    const st = E.seg(lt, 0.06 + k * 0.02, 0.26 + k * 0.02, 'expoOut');
    c.save(); c.globalAlpha *= st;
    c.fillStyle = E.rgba('outline', 0.85); c.beginPath(); c.roundRect(sx, y - sh / 2 + 4, sw, sh, 8); c.fill();
    c.fillStyle = E.rgba('plum', 0.9); c.beginPath(); c.roundRect(sx, y - sh / 2, sw, sh, 8); c.fill();
    c.strokeStyle = E.rgba('lavender', 0.6); c.lineWidth = 2; c.stroke();
    let f = 0, colr = 'catnip';
    if (k < cur) f = 1;
    else if (k === cur) { f = lp; colr = 'coin'; }
    if (f > 0) {
      c.fillStyle = E.col(colr); c.beginPath(); c.roundRect(sx, y - sh / 2, Math.max(sh, sw * f), sh, 8); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(sx + 6, y - sh / 2 + 3, Math.max(0, sw * f - 12), 3);
    }
    if (k === cur) {
      const gl = 0.35 + 0.35 * E.cueEnv(t, 'kick', 0.15);
      c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha *= gl;
      c.fillStyle = E.col('coin'); c.beginPath(); c.roundRect(sx - 4, y - sh / 2 - 4, sw * f + 8, sh + 8, 12); c.fill(); c.restore();
    }
    // completion pop
    if (k < cur) {
      const pp = E.seg(t, LT(k + 1), LT(k + 1) + 0.35);
      if (pp > 0 && pp < 1) E.shockwave(c, sx + sw, y, pp, { radius: 70, width: 6, color: 'catnipGlow', rings: 1 });
    }
    c.restore();
  }
  // hero cat walking the rail; hops on each level hit
  const cx = x0 + cur * (sw + gap) + sw * lp;
  const hopT = t - LT(cur);
  const hop = cur > 0 || hopT > 0.3 ? Math.max(0, Math.sin(Math.PI * E.clamp01(hopT / 0.26))) * 34 : 0;
  const row = hop > 2 ? 'JUMPING' : 'WALKING';
  const fr = hop > 2 ? Math.floor(E.clamp01(hopT / 0.26) * 6) : E.spriteFrame(t, 10);
  E.drawSprite(c, 'albertino', row, fr, Math.round(cx), Math.round(y - 6 - hop), 2, { anchor: 'feet', clamp: hop > 2 });
  if (cur > 0 && hopT >= 0.26 && hopT < 0.6) {
    for (const p of E.burst({ seed: 500 + cur, count: 8, t, t0: LT(cur) + 0.26, x: cx, y: y - 8, speed: [60, 180], angle: [Math.PI, Math.PI * 2], gravity: 200, life: [0.2, 0.35], size: [4, 7] })) {
      c.save(); c.globalAlpha *= p.alpha; c.fillStyle = E.col('lilac'); c.fillRect(Math.round(p.x), Math.round(p.y), Math.round(p.size), Math.round(p.size)); c.restore();
    }
  }
  c.restore();
}

const COUNTER = { x: 1740, y: 96 };
const S2_COUNT = 6; // s2 ends on x6: carry it on (06 -> 09) instead of resetting to 00
function flights() { return LEVELS.map((L, i) => (L.coin ? { ...L.coin, i } : null)).filter(Boolean); }
const FLY = 0.24;

function drawCounter(c, t, E) {
  const lt = t - T0;
  const enter = E.backOut(E.seg(lt, 0.08, 0.34), 1.9);
  const leave = E.seg(t, T_END - 0.14, T_END - 0.02, 'expoIn');
  const fl = flights();
  let count = 0, bumpT = -9;
  for (const f of fl) if (t >= f.t + FLY) { count++; bumpT = f.t + FLY; }
  const bump = E.elasticOut(E.seg(t, bumpT, bumpT + 0.4), 1, 0.3);
  const bs = 1 + 0.18 * (1 - bump) * (t >= bumpT ? 1 : 0);
  const x = COUNTER.x, y = COUNTER.y - 160 * (1 - enter) - 160 * leave;
  c.save(); c.globalAlpha = 1 - leave;
  c.translate(x, y); c.scale(bs, bs);
  const w = 230, h = 78;
  c.fillStyle = E.rgba('outline', 0.9); c.beginPath(); c.roundRect(-w / 2 + 4, -h / 2 + 6, w, h, h / 2); c.fill();
  c.fillStyle = E.rgba('night', 0.82); c.beginPath(); c.roundRect(-w / 2, -h / 2, w, h, h / 2); c.fill();
  c.strokeStyle = E.col('catnip'); c.lineWidth = 4; c.stroke();
  E.drawImg(c, 'catnip16', -w / 2 + 44, 0, { w: 48, h: 48, pixel: true });
  E.drawText(c, '×', -6, 2, { size: 34, font: NUNITO, weight: 900, color: 'lavender' });
  E.drawText(c, String(S2_COUNT + count).padStart(2, '0'), 56, 4, { size: 54, font: PASSION, weight: 700, color: 'cream' });
  c.restore();

  // flying sprigs
  for (const f of fl) {
    const age = t - f.t;
    if (age < 0) continue;
    if (age < FLY) {
      const u = E.cubicInOut(age / FLY);
      const pos = (uu) => E.arcTo([f.x, f.y], [COUNTER.x - 70, COUNTER.y], uu, -160);
      const pop = E.backOut(E.clamp01(age / 0.08), 2.5);
      for (let k = 3; k >= 0; k--) {
        const uu = E.cubicInOut(E.clamp01((age - k / 60) / FLY));
        const [px, py] = pos(uu);
        const s = 16 * 6 * (k === 0 ? pop : 0.8) * E.lerp(1, 0.6, uu);
        E.drawImg(c, 'catnip16', Math.round(px), Math.round(py), { w: s, h: s, pixel: true, alpha: k === 0 ? 1 : 0.25 * (4 - k) / 3 });
      }
      if (age < 0.15) E.shockwave(c, f.x, f.y, age / 0.15, { radius: 150, width: 10, color: 'catnipGlow', rings: 2 });
      void u;
    } else if (age < FLY + 0.5) {
      const a = age - FLY;
      E.drawText(c, '+1', COUNTER.x + 96, COUNTER.y + 78 - 26 * E.expoOut(a / 0.5), { size: 40, font: PASSION, weight: 700, color: 'catnipGlow', stroke: 'outline', strokeWidth: 6, alpha: 1 - E.seg(a, 0.3, 0.5) });
      if (a < 0.3) E.shockwave(c, COUNTER.x - 70, COUNTER.y, a / 0.3, { radius: 80, width: 8, color: 'catnipGlow' });
    }
  }
}

function drawDust(c, t, E) {
  // two parallax layers of soft motes drifting up and across
  c.save(); c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 34; i++) {
    const r = (k) => E.rand('s3dust', i, k);
    const depth = r(0) < 0.35 ? 2 : 1;
    const spd = depth === 2 ? 70 : 28;
    const x = E.mod(r(1) * 2200 - t * spd * (r(2) < 0.5 ? 1 : 0.6) * 1.4, 2200) - 140;
    const y = E.mod(r(3) * 1300 - t * spd, 1300) - 110;
    const rad = depth === 2 ? 6 + 10 * r(4) : 2 + 3 * r(4);
    const tw = 0.5 + 0.5 * Math.sin(t * (2 + 3 * r(5)) + r(6) * 6.28);
    const colr = r(7) < 0.5 ? '#ffc93c' : '#f0c5fd';
    const g = c.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, E.rgba(colr, (depth === 2 ? 0.22 : 0.45) * tw)); g.addColorStop(1, E.rgba(colr, 0));
    c.fillStyle = g; c.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  c.restore();
}
