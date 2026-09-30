// s3 — BARS 5-6 (7.500-11.250): STAKES & SCORE  +  BREEDS
//
//  lt (s)   global    event
//  0.000    7.500     STAKES impact: white flash, coin burst, plaque slams in, rays spin up
//  .117 ..  7.617 ..  7 hero coins land in the counter on 16ths (odometer rolls 000 -> 999)
//  .820     8.320     last coin: counter maxes at 999, glint sweep
//  0.9375   8.4375    8 HEISTS: hard cut, giant "8" filled with live heist footage (cuts on 16ths)
//  1.172/1.289/1.406  three stars pop (elastic) with sparkle bursts
//  1.641    9.1406    SPOTTED: red flash, real spotted frame, "!" bubble slam, glitch; whip out
//  1.875    9.375     BREEDS: whip-in onto albertino at 4.6x zoom, cells cascade in
//  2.109 .. 2.578     zoom steps out on every 8th, live "BREEDS FOUND" count in the vault panel
//  2.8125   10.3125   58 reveal: zoom lands at 1.0 w/ overshoot, "58" slam, stadium wave, burst
//  3.281    10.78125  clap: "58" punch, highlight bar, CAT YARD pill pops
//  3.52-3.75          push-through into the 58 with zoom blur, white flash handoff to s4

const B = 60 / 128;           // beat
const S16 = B / 4;            // 16th
const COIN_ARR = [1, 2, 3, 4, 5, 6, 7].map((k) => k * S16); // hero coin arrivals (lt)
const COUNTS = [0, 142, 285, 428, 571, 714, 857, 999];
const T_HEIST = 0.9375;
const T_STARS = [1.171875, 1.289063, 1.40625];
const T_ALERT = 1.640625;
const T_BREED = 1.875;
const T_REVEAL = 2.8125;
const T_CLAP2 = 3.28125;
const T_END = 3.75;

const HEIST_CLIPS = [
  ['h08-establish', 20], ['h02-meow-lure', 40], ['h04-key-doors', 18], ['h05-coin-run', 60],
  ['h07-split-shift', 10], ['h01-plate-swap', 14], ['h06-sneak-corridor', 95],
];

// ---------------------------------------------------------------- breed grid
const COLS = 13, ROWS = 6, CW = 1920 / COLS, CH = 180;
const FOCUS = { c: 1, r: 4 };
const inBlock = (c, r) => c >= 4 && c <= 8 && r >= 1 && r <= 4;
const BLOCK = { x: 4 * CW, y: CH, w: 5 * CW, h: 4 * CH };
let GRID = null; // built in init (static layout, not frame state)

function buildGrid(E) {
  const allIds = E.cats.map((c) => c.id);
  const specials = new Set(E.assets.sprites.specials || []);
  const ids = allIds.filter((i) => !specials.has(i)); // cats only on the "CATS TO COLLECT" wall
  const lead = ['bob', 'oreo', 'siamese', 'cheesy', 'sei', 'coco', 'mist', 'peachies', 'figaro', 'albertino', 'maine', 'grey'];
  const rest = ids.filter((i) => !lead.includes(i));
  rest.sort((a, b) => E.rand('ord', a) - E.rand('ord', b));
  const order = [...lead.filter((i) => ids.includes(i)), ...rest];
  const cells = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (inBlock(c, r)) continue;
    const d = Math.hypot(c - FOCUS.c, (r - FOCUS.r) * 1.15);
    cells.push({ c, r, d, x: (c + 0.5) * CW, y: (r + 0.5) * CH });
  }
  cells.sort((a, b) => a.d - b.d || a.r - b.r || a.c - b.c);
  const rows = ['IDLE', 'WALKING', 'SITTING', 'GROOMING', 'RUNNING', 'LOAF', 'IDLE', 'WALKING'];
  const big = new Set(['eldrem', 'amberclaw', 'solo-survivor']);
  cells.forEach((cell, k) => {
    cell.id = order[k % order.length];
    cell.no = allIds.indexOf(cell.id) + 1;
    cell.name = (E.cat(cell.id)?.name || cell.id).toUpperCase();
    cell.row = k === 0 ? 'WALKING' : k === 1 ? 'IDLE' : rows[Math.floor(E.rand('row', cell.id) * rows.length)];
    cell.phase = Math.floor(E.rand('ph', cell.id) * 20);
    cell.pop = (cell.d === 0 ? T_BREED - 0.1 : T_BREED + 0.02) + Math.min(0.83, Math.pow(cell.d, 0.92) * 0.085);
    cell.scale = big.has(cell.id) ? 2.5 : 3;
    cell.hue = E.rand('hue', cell.c, cell.r);
  });
  // locked "???" cards fill the centre block until the reveal, then collapse into the panel
  for (let r = 1; r <= 4; r++) for (let c = 4; c <= 8; c++) {
    const d = Math.hypot(c - FOCUS.c, (r - FOCUS.r) * 1.15);
    const dc = Math.hypot(c - 6, (r - 2.5) * 1.2);
    cells.push({
      c, r, d, x: (c + 0.5) * CW, y: (r + 0.5) * CH, block: true,
      id: order[(12 + (r - 1) * 5 + (c - 4)) % order.length], row: rows[(c + r) % rows.length], phase: (c * 7 + r * 3) % 20,
      no: 0, name: '',
      pop: T_BREED + 0.02 + Math.min(0.83, Math.pow(d, 0.92) * 0.085), scale: 3, hue: E.rand('hue', c, r),
      collapse: T_BREED + 0.8 + (2.2 - dc) * 0.02,
    });
  }
  return cells;
}

// ---------------------------------------------------------------- small helpers
const fitSize = (E, ctx, str, size, maxW, o = {}) => {
  const w = E.measureText(ctx, str, { size, ...o });
  return w > maxW ? (size * maxW) / w : size;
};

function coinFlip(E, ctx, x, y, size, spin, alpha = 1, rot = 0, minW = 0.12) {
  const sx = Math.max(minW, Math.abs(Math.cos(spin)));
  E.drawImg(ctx, 'coin', x, y, { w: size * sx, h: size, alpha, smooth: false, rot });
}

function rays(E, ctx, cx, cy, n, rot, r, color, alpha) {
  ctx.save();
  ctx.fillStyle = E.col(color); ctx.globalAlpha = alpha;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a0 = rot + (i / n) * E.TAU, a1 = a0 + (E.TAU / n) * 0.45;
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a0) * r, cy + Math.sin(a0) * r);
    ctx.lineTo(cx + Math.cos(a1) * r, cy + Math.sin(a1) * r);
    ctx.closePath();
  }
  ctx.fill();
  ctx.restore();
}

function sparkles(E, ctx, lt, t0, x, y, { seed = 1, count = 10, speed = [300, 800], color = 'coin', size = [10, 24], life = [0.25, 0.5] } = {}) {
  for (const p of E.burst({ seed, count, t: lt, t0, x, y, speed, gravity: 300, drag: 5, life, size })) {
    const r = p.size * (1 - p.p * 0.6);
    E.star(ctx, p.x, p.y, r, { inner: 0.38, points: 4, rot: p.rot, fill: p.r(7) < 0.35 ? '#ffffff' : color });
  }
}

function hazard(E, ctx, lt, a, b, off) {
  ctx.save();
  ctx.fillStyle = E.col(a); ctx.fillRect(0, 0, E.W, E.H);
  ctx.translate(E.W / 2, E.H / 2); ctx.rotate(E.deg(-28));
  ctx.fillStyle = E.col(b);
  const w = 90, span = 2400;
  const o = E.mod(off, w * 2);
  for (let x = -span; x < span; x += w * 2) ctx.fillRect(x + o, -span, w, span * 2);
  ctx.restore();
}

// ---------------------------------------------------------------- SHOT A: STAKES / SCORE
const PLAQ = { x: 960, y: 560, w: 820, h: 270 };
const PSC = 1.14; // plaque display scale
const ICON = { x: 960 - 250 * PSC, y: 560 };
const ICON_L = { x: 960 - 250, y: 560 }; // icon in plaque-local space
const BURST_O = { x: 960, y: 1130 };

function heroCoinPos(E, k, lt) {
  // ballistic out of the burst, then sucked into the counter icon exactly on its 16th
  const r = (q) => E.rand('hero', k, q);
  const ang = E.lerp(-Math.PI * 0.86, -Math.PI * 0.14, (k - 0.5 + (r(1) - 0.5) * 0.4) / 7);
  const sp = 1500 + r(2) * 700;
  const [bx, by] = E.ballistic(BURST_O.x, BURST_O.y, Math.cos(ang) * sp, Math.sin(ang) * sp, 2400, 2.2, Math.max(0, lt));
  const arr = COIN_ARR[k - 1];
  const det = Math.max(0.0, arr - 0.2);
  const u = E.seg(lt, det, arr);
  const e = u * u * u;
  return [E.lerp(bx, ICON.x, e), E.lerp(by, ICON.y, e), u];
}

function drawOdometer(E, ctx, lt, x, y, dh) {
  let k = 0; for (let i = 0; i < COIN_ARR.length; i++) if (lt + 1e-6 >= COIN_ARR[i]) k = i + 1;
  const e = k ? E.backOut(E.seg(lt, COIN_ARR[k - 1], COIN_ARR[k - 1] + 4 / 60), 1.6) : 1; // snaps in 4 frames on each coin cue, then holds
  const prev = COUNTS[Math.max(0, k - 1)], cur = COUNTS[k];
  const dw = 150;
  for (let p = 2; p >= 0; p--) {
    const pw = Math.pow(10, p);
    const a = Math.floor(prev / pw) % 10, bd = Math.floor(cur / pw) % 10;
    const b = a + E.mod(bd - a, 10) + (bd === a && prev !== cur && p === 0 ? 10 : 0);
    const pos = k ? E.lerp(a, b, e) : 0;
    const speed = k ? Math.abs(b - a) * Math.max(0, 1 - e) : 0;
    const sp = dh * 1.3;
    const cx = x + (2 - p - 1) * dw;
    ctx.save();
    ctx.beginPath(); ctx.rect(cx - dw / 2 + 6, y - dh * 0.56, dw - 12, dh * 1.12); ctx.clip();
    ctx.fillStyle = 'rgba(10,4,18,0.55)'; ctx.fillRect(cx - dw / 2, y - dh * 0.6, dw, dh * 1.2);
    const samples = speed > 0.6 ? 4 : 1;
    for (let s = samples - 1; s >= 0; s--) {
      const ps = pos - s * Math.min(0.35, speed * 0.05);
      const d0 = E.mod(Math.floor(ps), 10), fr = ps - Math.floor(ps);
      const al = s ? 0.22 : 1;
      for (const [d, oy] of [[E.mod(d0 - 1, 10), (-1 - fr) * sp], [d0, -fr * sp], [E.mod(d0 + 1, 10), (1 - fr) * sp]]) {
        E.drawText(ctx, String(d), cx, y + oy, { size: dh * 1.02, color: 'coin', alpha: al, extrude: s ? null : { depth: 10, dx: 0.4, dy: 1, color: '#7a3d00', dark: 0.5 } });
      }
    }
    // reel curvature: dark falloff at top and bottom of the slot
    const rg = ctx.createLinearGradient(0, y - dh * 0.56, 0, y + dh * 0.56);
    rg.addColorStop(0, 'rgba(10,4,18,0.95)'); rg.addColorStop(0.2, 'rgba(10,4,18,0)'); rg.addColorStop(0.8, 'rgba(10,4,18,0)'); rg.addColorStop(1, 'rgba(10,4,18,0.95)');
    ctx.fillStyle = rg; ctx.fillRect(cx - dw / 2, y - dh * 0.56, dw, dh * 1.12);
    ctx.restore();
  }
  return k;
}

function shotStakes(E, ctx, t, lt) {
  const { W, H } = E;
  // BG: coin-run footage, dimmed and graded, slow push
  const z = 1.12 + 0.1 * E.expoOut(E.seg(lt, 0, 0.94));
  E.drawClip(ctx, 'h05-coin-run', E.clipFrameTime('h05-coin-run', 58) + lt, 0, 0, W, H, { zoom: z, fx: 0.45, fy: 0.45 });
  ctx.fillStyle = E.rgba('night', 0.72); ctx.fillRect(0, 0, W, H);
  const g = ctx.createRadialGradient(PLAQ.x, PLAQ.y, 50, PLAQ.x, PLAQ.y, 1100);
  g.addColorStop(0, E.rgba('grape', 0.4)); g.addColorStop(0.6, E.rgba('violet', 0.18)); g.addColorStop(1, E.rgba('night', 0.55));
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  // rays
  const CLAP = COIN_ARR[3]; // 7.969 clap (also the 4th coin)
  rays(E, ctx, PLAQ.x, PLAQ.y, 20, lt * 0.6 + 0.2 + 0.25 * E.expoOut(E.seg(lt, 0, 0.3)), 1600, 'coin', 0.05 + 0.3 * E.env(lt, 0, 0.1) + 0.06 * E.envs(lt, COIN_ARR, 0.08) + 0.16 * E.env(lt, CLAP, 0.08));
  // the STAKES hit: additive gold bloom over the purple rays (not a flat tint), plus ring burst from the plaque
  const hitG = E.env(lt, 0, 0.07);
  if (hitG > 0.01) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const hg = ctx.createRadialGradient(PLAQ.x, PLAQ.y, 40, PLAQ.x, PLAQ.y, 1100);
    hg.addColorStop(0, `rgba(255,214,90,${0.95 * hitG})`); hg.addColorStop(0.35, `rgba(255,170,40,${0.45 * hitG})`); hg.addColorStop(1, 'rgba(255,150,30,0)');
    ctx.fillStyle = hg; ctx.fillRect(0, 0, W, H); ctx.restore();
  }
  E.shockwave(ctx, PLAQ.x, PLAQ.y, E.seg(lt, 0, 0.45), { radius: 1250, width: 46, color: 'coin', rings: 3, gap: 0.1 });

  // far parallax: small catnip leaves drifting up
  E.particles('s3leaf', 14, lt, (p) => {
    const x = p.r(1) * W + Math.sin(lt * 2 + p.i) * 20;
    const y = E.mod(p.r(2) * H * 1.3 - lt * (120 + p.r(3) * 200), H * 1.3) - H * 0.15;
    E.drawImg(ctx, 'catnip', x, y, { w: 28 + p.r(4) * 26, alpha: 0.25, rot: lt * (p.r(5) - 0.5) * 3, smooth: false });
  });

  // back coin burst (behind plaque)
  const burstO = { seed: 's3cb', t: lt, t0: 0, x: BURST_O.x, y: BURST_O.y, speed: [1300, 2500], angle: [-Math.PI * 0.95, -Math.PI * 0.05], gravity: 2400, drag: 1.4, life: [0.8, 1.25], size: [22, 50], spin: 14 };
  for (const p of E.burst({ ...burstO, count: 46 })) coinFlip(E, ctx, p.x, p.y, p.size, p.rot * 2, Math.min(1, (1 - p.p) * 2));

  // overline
  const ov = E.expoOut(E.seg(lt, 0, 0.3));
  const ovy = 318 - 20 * (1 - E.expoOut(E.seg(lt, 0, 10 / 60)));
  const ovs = E.lerp(1.4, 1, E.backOut(E.seg(lt, 0, 8 / 60), 1.6));
  E.drawText(ctx, 'THE STAKES', 960, ovy, {
    size: 56, font: 'condensed', weight: '800', color: lt < 2 / 60 ? '#ffffff' : 'cream', tracking: 0.35,
    perChar: () => ({ scale: ovs }),
  });
  ctx.fillStyle = E.col('coin');
  const lw = 280 * ov;
  ctx.fillRect(960 - 330 - lw, ovy - 3, lw, 6); ctx.fillRect(960 + 330, ovy - 3, lw, 6);

  // plaque slam
  const pin = E.seg(lt, 0, 10 / 60);
  const ps = E.lerp(1.4, 1, E.backOut(pin, 1.4)) * PSC * (1 + 0.06 * E.seg(lt, 0.2, T_HEIST, 'sineInOut'));
  // every coin cue lands with a 3% bump (4-frame backOut), the 7.969 clap adds a 6 px shake
  let punch = 0;
  for (const a of COIN_ARR) { const d = lt - a; if (d >= 0 && d < 0.2) punch += 0.03 * (d < 1 / 60 ? 1 : 1 - E.backOut(E.seg(d, 1 / 60, 0.15), 2)); }
  const cs = 6 * E.env(lt, CLAP, 0.1);
  const csx = E.randSigned('cs', E.frame) * cs, csy = E.randSigned('cs2', E.frame) * cs;
  ctx.save();
  ctx.translate(PLAQ.x + csx + 18 * Math.sin(lt * 3.2), PLAQ.y + csy + E.perlin1(lt * 2, 3) * 10);
  ctx.rotate(E.lerp(E.deg(-4), 0, E.expoOut(pin)) + E.deg(1.6) * Math.sin(lt * 4.1) + (lt < 1 / 60 ? 0 : 0));
  ctx.scale(ps * (1 + punch), ps * (1 + punch));
  ctx.translate(-PLAQ.x, -PLAQ.y);
  // body
  const x0 = PLAQ.x - PLAQ.w / 2, y0 = PLAQ.y - PLAQ.h / 2;
  ctx.fillStyle = E.col('outline'); ctx.beginPath(); ctx.roundRect(x0 - 14, y0 - 14 + 18, PLAQ.w + 28, PLAQ.h + 28, 46); ctx.fill();
  ctx.fillStyle = E.col('plum'); ctx.beginPath(); ctx.roundRect(x0, y0, PLAQ.w, PLAQ.h, 36); ctx.fill();
  const pg = ctx.createLinearGradient(0, y0, 0, y0 + PLAQ.h);
  pg.addColorStop(0, E.rgba('grape', 0.9)); pg.addColorStop(1, E.rgba('plum', 0.2));
  ctx.fillStyle = pg; ctx.beginPath(); ctx.roundRect(x0 + 10, y0 + 10, PLAQ.w - 20, PLAQ.h * 0.5, 28); ctx.fill();
  ctx.strokeStyle = E.col('coin'); ctx.lineWidth = 6; ctx.beginPath(); ctx.roundRect(x0 + 8, y0 + 8, PLAQ.w - 16, PLAQ.h - 16, 30); ctx.stroke();
  // digits
  ctx.save(); ctx.beginPath(); ctx.roundRect(x0 + 14, y0 + 14, PLAQ.w - 28, PLAQ.h - 28, 26); ctx.clip();
  drawOdometer(E, ctx, lt, 1070, PLAQ.y + 6, 205);
  // glint at max
  const gl = E.seg(lt, 0.83, 1.0, 'cubicInOut');
  if (gl > 0 && gl < 1) {
    ctx.globalCompositeOperation = 'lighter';
    const gx = E.lerp(x0 - 200, x0 + PLAQ.w + 200, gl);
    const gg = ctx.createLinearGradient(gx - 120, 0, gx + 120, 0);
    gg.addColorStop(0, 'rgba(255,255,255,0)'); gg.addColorStop(0.5, 'rgba(255,240,200,0.55)'); gg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gg; ctx.save(); ctx.translate(gx, PLAQ.y); ctx.transform(1, 0, -0.4, 1, 0, 0); ctx.translate(-gx, -PLAQ.y); ctx.fillRect(gx - 140, y0, 280, PLAQ.h); ctx.restore();
  }
  ctx.restore();
  // icon coin (spins faster on each hit)
  const spin = lt * 5 + E.envs(lt, COIN_ARR, 0.1) * 2.2;
  const ip = 1 + 0.25 * E.envs(lt, COIN_ARR, 0.06);
  ctx.save(); ctx.shadowColor = E.rgba('coin', 0.8); ctx.shadowBlur = 40;
  coinFlip(E, ctx, ICON_L.x, ICON_L.y, 170 * ip, spin, 1, 0, 0.4);
  ctx.restore();
  ctx.restore();


  // hero coins with smear trails
  for (let k = 1; k <= 7; k++) {
    const arr = COIN_ARR[k - 1];
    if (lt >= arr) {
      // impact sparkle + ring at the icon
      sparkles(E, ctx, lt, arr, ICON.x, ICON.y, { seed: 'hs' + k, count: 9, speed: [350, 900] });
      E.shockwave(ctx, ICON.x, ICON.y, E.seg(lt, arr, arr + 0.3), { radius: 190, width: 14, color: 'cream', rings: 1 });
      continue;
    }
    for (let s = 4; s >= 0; s--) {
      const tt = lt - s * 0.012;
      const [x, y, u] = heroCoinPos(E, k, tt);
      coinFlip(E, ctx, x, y, E.lerp(92, 60, u), tt * 14 + k, s ? 0.18 * (5 - s) / 5 : 1);
    }
  }

  // radial coin burst out of the plaque, drawn OVER it (already travelling on f450, smear streaks)
  {
    const rb = { seed: 's3rad', count: 34, t0: -0.09, x: PLAQ.x, y: PLAQ.y, speed: [2200, 4200], angle: [0, E.TAU], gravity: 900, drag: 1.8, life: [0.5, 0.85], size: [40, 80], spin: 16 };
    const now = E.burst({ ...rb, t: lt }), prev = E.burst({ ...rb, t: lt - 0.03 });
    const pm = new Map(prev.map((q) => [q.i, q]));
    ctx.save(); ctx.lineCap = 'round';
    for (const p of now) {
      const q = pm.get(p.i) || { x: PLAQ.x, y: PLAQ.y };
      if (Math.abs(p.x - PLAQ.x) < 500 && Math.abs(p.y - PLAQ.y) < 170) continue; // emerge from the plaque's edges, never over the digits
      ctx.strokeStyle = E.rgba('coin', 0.55 * (1 - p.p)); ctx.lineWidth = p.size * 0.5;
      ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(p.x, p.y); ctx.stroke();
      coinFlip(E, ctx, p.x, p.y, p.size, p.rot * 2, Math.min(1, (1 - p.p) * 2.5));
    }
    ctx.restore();
  }
  // label under plaque
  const lb = E.expoOut(E.seg(lt, 0.0, 0.2));
  E.drawText(ctx, 'CATNIP COINS', 960, 772 + (1 - lb) * 30, { size: 46, font: 'condensed', weight: '800', color: 'lilac', tracking: 0.42, alpha: lb });

  // near-camera foreground coins (fast parallax)
  for (const [sd, ang] of [['s3fgL', [-Math.PI * 0.99, -Math.PI * 0.8]], ['s3fgR', [-Math.PI * 0.2, -Math.PI * 0.01]]]) {
    for (const p of E.burst({ ...burstO, y: 1180, seed: sd, count: 3, speed: [1700, 2500], angle: ang, gravity: 1800, size: [170, 240], life: [0.7, 0.95] })) {
      coinFlip(E, ctx, p.x, p.y, p.size, p.rot * 1.4, 0.95);
    }
  }
  E.lightLeak(ctx, t, { seed: 7, intensity: 0.07, colors: ['#ffc93c', '#ff7aa2', '#9966cc'] });
}

// ---------------------------------------------------------------- SHOT B: 8 HEISTS
function shotHeists(E, ctx, t, lt) {
  const { W, H } = E;
  const u = lt - T_HEIST;
  hazard(E, ctx, u, 'night', '#190b2a', u * 260);
  const vg = ctx.createRadialGradient(560, 540, 100, 560, 540, 1100);
  vg.addColorStop(0, E.rgba('violet', 0.55)); vg.addColorStop(1, E.rgba('night', 0.0));
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);

  const push = 1 + 0.035 * E.sineOut(E.seg(u, 0, 0.72));
  ctx.save(); ctx.translate(960, 540); ctx.scale(push, push); ctx.translate(-960, -540);

  // --- giant 8 with footage inside
  const s8 = E.seg(u, 0, 0.2);
  const sc = E.lerp(2.8, 1, E.expoOut(s8)) * (1 + 0.04 * E.elasticOut(E.seg(u, 0.12, 0.7), 1, 0.35) - 0.04 * E.seg(u, 0.12, 0.7));
  const rot = E.lerp(E.deg(-16), E.deg(-4), E.expoOut(s8)) + 0.01 * Math.sin(u * 5);
  const cx = 560, cy = 560, size = 980;
  const draw8 = (c, fn) => { c.save(); c.translate(cx, cy); c.rotate(rot); c.scale(sc, sc); fn(c); c.restore(); };
  // extrusion + outline
  draw8(ctx, (c) => E.drawText(c, '8', 0, 0, { size, color: 'plum', extrude: { depth: 34, dx: 0.8, dy: 1, color: 'grape', dark: 0.75 }, stroke: 'outline', strokeWidth: 26 }));
  // footage fill
  const ci = Math.min(HEIST_CLIPS.length - 1, Math.floor(u / S16 + 1e-6));
  const [clip, f0] = HEIST_CLIPS[ci];
  E.layer(ctx, (L) => {
    draw8(L, (c) => {
      E.drawClip(c, clip, E.clipFrameTime(clip, f0) + (u - ci * S16), -560, -500, 1120, 1000, { zoom: 1.15 });
      c.globalCompositeOperation = 'source-atop';
      const gg = c.createLinearGradient(0, -450, 0, 450);
      gg.addColorStop(0, 'rgba(255,201,60,0.16)'); gg.addColorStop(0.5, 'rgba(0,0,0,0)'); gg.addColorStop(1, 'rgba(111,45,168,0.3)');
      c.fillStyle = gg; c.fillRect(-600, -520, 1200, 1040);
      c.globalCompositeOperation = 'destination-in';
      E.drawText(c, '8', 0, 0, { size, color: '#fff' });
    });
  });
  // cut flash inside glyph + inner stroke
  draw8(ctx, (c) => {
    const cf = E.env(u, ci * S16, 0.04);
    if (cf > 0.02) E.drawText(c, '8', 0, 0, { size, color: '#ffffff', alpha: cf * 0.7 });
    E.drawText(c, '8', 0, 0, { size, color: 'cream', strokeOnly: true, stroke: 'cream', strokeWidth: 8 });
  });
  // level tag riding the 8
  const tagA = E.seg(u, 0.1, 0.2);
  E.drawText(ctx, `HEIST ${(E.clipInfo(clip)?.level || '').replace('heist-', '')}`, cx, cy + 470, { size: 30, font: 'mono', weight: 'bold', color: 'coin', tracking: 0.35, alpha: tagA });

  // --- HEISTS word
  const hx = 1045, hy = 505;
  const hs = fitSize(E, ctx, 'HEISTS', 250, 770, { tracking: 0.02 });
  E.drawText(ctx, 'HEISTS', hx, hy, {
    size: hs, align: 'left', color: 'cream', tracking: 0.02, extrude: { depth: 16, dx: 0.6, dy: 1, color: 'grape', dark: 0.6 },
    perChar: ({ i }) => {
      const d = u - i / 60;                       // 1-frame stagger
      if (d < 0) return false;
      const q = E.seg(d, 0, 7 / 60);
      return { y: (1 - E.backOut(q, 1.8)) * -90, scale: E.lerp(1.35, 1, E.backOut(q, 1.8)), color: q < 0.5 ? 'coin' : 'cream' };
    },
  });
  // overline
  const ol = E.seg(u, 0.05, 0.35);
  E.wipeText(ctx, 'LEVELS 01 - 08', hx + 6, 318, { size: 34, font: 'mono', weight: 'bold', align: 'left', color: 'catnip', tracking: 0.28 }, E.expoOut(E.seg(u, 0.02, 0.14)));
  const bar = E.expoOut(E.seg(u, 0.08, 0.4));
  ctx.fillStyle = E.col('catnip'); ctx.fillRect(hx + 6, 350, 380 * bar, 5);

  // --- stars
  for (let i = 0; i < 3; i++) {
    const sx = hx + 110 + i * 205, sy = 745;
    const slot = E.backOut(E.seg(u, 0.1 + i * 0.04, 0.3 + i * 0.04));
    E.star(ctx, sx, sy, 86 * slot, { inner: 0.48, fill: '#1a0b2b', stroke: 'lavender', lineWidth: 7 });
    const ts = T_STARS[i] - T_HEIST;
    const q = E.seg(u, ts, ts + 0.5);
    if (q > 0) {
      const s = E.elasticOut(q, 1, 0.32);
      const r = 96 * s;
      E.shockwave(ctx, sx, sy, E.seg(u, ts, ts + 0.3), { radius: 170, width: 12, color: 'coin', rings: 1 });
      ctx.save(); ctx.shadowColor = E.rgba('coin', 0.9); ctx.shadowBlur = 36;
      E.star(ctx, sx, sy, r, { inner: 0.48, fill: 'coin', stroke: 'outline', lineWidth: 8, rot: -Math.PI / 2 + (1 - E.expoOut(q)) * -1.2 });
      ctx.restore();
      E.star(ctx, sx - r * 0.14, sy - r * 0.18, r * 0.42, { inner: 0.48, fill: '#fff3b0', rot: -Math.PI / 2 + (1 - E.expoOut(q)) * -1.2 });
      const wf = E.env(u, ts, 0.05);
      if (wf > 0.02) E.star(ctx, sx, sy, r * 1.05, { inner: 0.48, fill: E.rgba('#ffffff', wf) });
      sparkles(E, ctx, u, ts, sx, sy, { seed: 'st' + i, count: 12, speed: [400, 1000], size: [12, 26] });
    }
  }
  ctx.restore();
}

// ---------------------------------------------------------------- SHOT C: SPOTTED
function shotAlert(E, ctx, t, lt) {
  const { W, H } = E;
  const u = lt - T_ALERT;
  const whip = E.expoIn(E.seg(u, 0.12, 0.2344));
  ctx.save();
  const z = E.lerp(1.45, 1.28, E.expoOut(E.seg(u, 0, 0.23)));
  E.drawClip(ctx, 'h02-spotted', E.clipFrameTime('h02-spotted', 104) + u, 0, 0, W, H, { zoom: z, fx: 0.66, fy: 0.97 });
  ctx.fillStyle = E.rgba('alertFlash', 0.25 + 0.35 * E.env(u, 0, 0.08)); ctx.globalCompositeOperation = 'multiply'; ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'source-over';
  // tapes
  for (const [yy, dir, rotT] of [[120, 1, -0.05], [960, -1, 0.04]]) {
    ctx.save(); ctx.translate(960, yy); ctx.rotate(rotT);
    const tin = E.expoOut(E.seg(u, 0, 0.1));
    ctx.fillStyle = E.col('coneAlert'); ctx.fillRect(-1300, -48 * tin, 2600, 96 * tin);
    ctx.fillStyle = E.col('outline'); ctx.fillRect(-1300, -48 * tin, 2600, 8 * tin); ctx.fillRect(-1300, 40 * tin, 2600, 8 * tin);
    ctx.beginPath(); ctx.rect(-1300, -44, 2600, 88); ctx.clip();
    const off = E.mod(u * 1600 * dir, 520);
    for (let x = -1300 - 520; x < 1300; x += 520) E.drawText(ctx, 'SPOTTED  !', x + off, 3, { size: 68, font: 'condensed', weight: '800', align: 'left', color: 'cream', tracking: 0.12 });
    ctx.restore();
  }
  // the villain: a big guard dog on the left, red vision cone locked on the cat, "!" over its head
  const pin = E.expoOut(E.seg(u, 0, 0.08));
  const dogX = 470, feetY = 860;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  E.cone(ctx, dogX + 170, feetY - 250, -0.08, E.deg(30) * pin, 1150, { color: 'coneAlert', alpha: 0.55, edge: 0.7 });
  ctx.restore();
  ctx.save(); ctx.strokeStyle = E.col('alertRed'); ctx.lineWidth = 6; ctx.globalAlpha = pin; ctx.beginPath();
  for (const sgn of [-1, 1]) { const an = -0.08 + sgn * E.deg(15) * pin; ctx.moveTo(dogX + 170, feetY - 250); ctx.lineTo(dogX + 170 + Math.cos(an) * 1150, feetY - 250 + Math.sin(an) * 1150); }
  ctx.stroke(); ctx.restore();
  // the spotted cat, caught in the cone (recoils)
  E.drawSprite(ctx, 'bob', 'HIT', Math.min(6, Math.floor(u / 0.04)), 1420 + 30 * E.expoOut(E.seg(u, 0, 0.1)), feetY, 8, { anchor: 'feet', flip: true, clamp: true, outline: { color: '#fcecbb', px: 1 } });
  const dsc = 9.5 * E.lerp(1.12, 1, E.expoOut(E.seg(u, 0, 0.1)));
  E.drawSprite(ctx, 'brown', 'CROUCHED', E.spriteFrame(u, 12), dogX, feetY, dsc, { anchor: 'feet', outline: { color: '#ff2a1a', px: 1 } });
  // "!" bubble above the dog's head
  const bi = E.seg(u, 0, 0.1);
  const bs = E.backOut(bi, 3.2) * 0.72;
  const bx = dogX + 60, by = 330 + (1 - E.expoOut(bi)) * 80;
  ctx.save(); ctx.translate(bx, by); ctx.rotate(E.lerp(0.35, -0.06, E.expoOut(bi)) + Math.sin(u * 60) * 0.03 * (1 - bi)); ctx.scale(bs, bs);
  E.shockwave(ctx, 0, 0, E.seg(u, 0.02, 0.26), { radius: 520, width: 26, color: 'cream', rings: 2 });
  ctx.fillStyle = E.col('outline'); ctx.beginPath(); ctx.roundRect(-150, -165, 300, 330, 70); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-40, 150); ctx.lineTo(40, 150); ctx.lineTo(0, 230); ctx.closePath(); ctx.fill();
  ctx.fillStyle = E.col('alertRed'); ctx.beginPath(); ctx.roundRect(-132, -147, 264, 294, 56); ctx.fill();
  ctx.fillStyle = E.rgba('#ffffff', 0.25); ctx.beginPath(); ctx.roundRect(-112, -130, 224, 90, 40); ctx.fill();
  E.drawText(ctx, '!', 0, 8, { size: 270, font: 'heavy', color: '#ffffff', extrude: { depth: 8, dx: 0.5, dy: 1, color: 'ember', dark: 0.3 } });
  ctx.restore();
  if (whip > 0) E.speedLinesDir(ctx, t, { angle: 0, count: 50, speed: -9000, length: [400, 1200], width: [3, 10], color: 'cream', alpha: 0.7 * Math.min(1, whip * 3) });
  ctx.restore();
  E.scanlines(ctx, { alpha: 0.18, offset: t * 40 });
}

// ---------------------------------------------------------------- SHOT D: BREEDS
function breedCam(E, u) {
  // zoom steps on 8ths, landing at 1.0 with overshoot on the reveal
  const st = [0, 0.234375, 0.46875, 0.703125];
  const zs = [4.6, 3.3, 2.3, 1.65];
  let z = E.lerp(6.2, zs[0], E.expoOut(E.seg(u, 0, 0.2)));
  for (let i = 1; i < st.length; i++) z = E.lerp(z, zs[i], E.expoOut(E.seg(u, st[i], st[i] + 0.15)));
  // gentle drift inside each step so nothing holds
  z *= 1 - 0.035 * E.fract(Math.min(u, 0.9375) / 0.234375);
  const rv = E.seg(u, 0.9375, 0.9375 + 0.42);
  if (rv > 0) z = E.lerp(z, 1, E.backOut(rv, 2.4));
  // push-through starts no earlier than 11.13: short, sharp ramp into the 3 dark frames
  const out = E.expoIn(E.seg(u, 1.755, 1.875));
  z *= 1 + 2.2 * out;
  const rots = [0.07, -0.04, 0.025, -0.012];
  let rot = rots[0] * (1 - E.expoOut(E.seg(u, 0, 0.2))) + 0.03;
  for (let i = 1; i < st.length; i++) rot = E.lerp(rot, rots[i], E.expoOut(E.seg(u, st[i], st[i] + 0.15)));
  if (rv > 0) rot = E.lerp(rot, 0, E.backOut(rv));
  rot += out * 0.06;
  // pan from focus to centre as we pull out
  const m = E.clamp01((4.6 - Math.min(z, 4.6)) / 3.6);
  const fx = (FOCUS.c + 0.5) * CW, fy = (FOCUS.r + 0.5) * CH;
  const pm = m * m * m;
  let cx = E.lerp(fx, 960, pm), cy = E.lerp(fy, 540, pm);
  if (rv > 0 || out > 0) { cx = E.lerp(cx, 960, E.expoOut(rv)); cy = E.lerp(cy, 540, E.expoOut(rv)); }
  // whip-in offset
  return { z, rot, cx, cy, out };
}

function drawCell(E, ctx, t, u, cell, wave) {
  const pt = cell.pop - T_BREED;
  const q = E.seg(u, pt, pt + 0.28);
  if (q <= 0) return false;
  let s = E.backOut(q, 2.6);
  if (cell.block) {
    const k = E.seg(u, cell.collapse - T_BREED, cell.collapse - T_BREED + 0.1);
    if (k >= 1) return false;
    s *= 1 - E.expoIn(k);
  }
  const w = CW - 12, h = CH - 12;
  ctx.save();
  ctx.translate(cell.x, cell.y);
  ctx.rotate((1 - E.expoOut(q)) * (cell.hue - 0.5) * 0.9);
  ctx.scale(s, s);
  // tile
  const base = ['plum', 'grape2', 'violet', '#3b1a5c'][Math.floor(cell.hue * 4)];
  const flashC = E.env(u, pt, 0.06);
  const wv = wave.tile;
  ctx.fillStyle = E.col('outline'); ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2 + 6, w, h, 18); ctx.fill();
  ctx.fillStyle = E.mix(E.mix(base, 'grape', wv * 0.8), '#ffffff', flashC); ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2, w, h, 18); ctx.fill();
  const tg = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
  tg.addColorStop(0, 'rgba(255,255,255,0.10)'); tg.addColorStop(0.55, 'rgba(255,255,255,0)'); tg.addColorStop(1, 'rgba(0,0,0,0.25)');
  ctx.fillStyle = tg; ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2, w, h, 18); ctx.fill();
  // floor ellipse
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(0, 46, 44, 10, 0, 0, E.TAU); ctx.fill();
  // cat
  const row = wave.jump ? 'JUMPING' : cell.row;
  const fr = wave.jump ? wave.jf : E.spriteFrame(t, 11) + cell.phase;
  const drop = (1 - E.expoOut(E.seg(u, pt, pt + 0.22))) * -70;
  if (cell.locked) { // (kept for reference; the wall no longer uses locked cards)
    E.drawSprite(ctx, cell.id, 'SITTING', 0, 0, 48 + drop, cell.scale, { anchor: 'feet', silhouette: '#1a0a2a' });
    E.drawText(ctx, '?', 0, -8 + Math.sin(u * 9 + cell.c) * 4, { size: 54, font: 'heavy', color: 'lavender', alpha: 0.9 });
    E.drawText(ctx, 'LOCKED', 0, h / 2 - 16, { size: 14, font: 'mono', weight: 'bold', color: 'lavender', tracking: 0.3, alpha: 0.7 });
    ctx.restore();
    return true;
  }
  const idle = Math.abs(Math.sin(t * 7.2 + cell.phase)) * 5; // small living bob so the wall never goes flat
  E.drawSprite(ctx, cell.id, row, fr, 0, 40 + drop - wave.hop - idle, cell.scale, { anchor: 'feet', tint: flashC > 0.05 ? { color: '#fff', amount: flashC } : null, clamp: wave.jump });
  if (!cell.block) {
    // name tag
    ctx.fillStyle = E.rgba('night', 0.6); ctx.fillRect(-w / 2 + 8, -h / 2 + 8, 62, 28);
    E.drawText(ctx, String(cell.no).padStart(2, '0'), -w / 2 + 39, -h / 2 + 23, { size: 22, font: 'mono', weight: 'bold', color: 'coin' });
    ctx.fillStyle = E.rgba('night', 0.55); ctx.fillRect(-w / 2 + 6, h / 2 - 38, w - 12, 30);
    E.drawText(ctx, cell.name, 0, h / 2 - 23, { size: fitSize(E, ctx, cell.name, 21, w - 20, { font: 'condensed', weight: '800', tracking: 0.06 }), font: 'condensed', weight: '800', color: 'cream', tracking: 0.06 });
  }
  ctx.restore();
  return true;
}

function shotBreeds(E, ctx, t, lt) {
  const { W, H } = E;
  const u = lt - T_BREED;
  const cam = breedCam(E, u);
  // bg
  ctx.fillStyle = E.col('night'); ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate(960, 540); ctx.scale(cam.z, cam.z); ctx.rotate(cam.rot); ctx.translate(-cam.cx, -cam.cy);
  // world backdrop: slightly larger than the grid, subtle dot matrix
  ctx.fillStyle = '#12071f'; ctx.fillRect(-400, -300, W + 800, H + 600);
  ctx.fillStyle = E.rgba('lavender', 0.12);
  for (let y = -240; y < H + 300; y += 60) for (let x = -360; x < W + 400; x += 60) ctx.fillRect(x + (y % 120 ? 30 : 0), y, 4, 4);

  // drifting leaves live BEHIND the cards (never over faces or names)
  E.particles('s3fgl', 7, u, (p) => {
    const x = E.mod(p.r(1) * 2600 - u * (500 + p.r(2) * 400), 2600) - 340;
    const y = p.r(3) * H;
    E.drawImg(ctx, 'catnip', x, y, { w: 90 + p.r(4) * 70, rot: u * (p.r(5) - 0.5) * 4, alpha: 0.4, smooth: false });
  });
  const rvT = T_REVEAL - T_BREED;
  let popped = 0;
  // after the reveal the wall keeps moving to the cut: shrinks 1.0 -> 0.9 (expoOut, 10.31-11.18),
  // alternate rows scroll in opposite directions (40 px/s), a few cards flip on every 16th
  const wallZ = 1 - 0.1 * E.expoOut(E.seg(u, rvT, 1.805));
  ctx.save(); ctx.translate(960, 540); ctx.scale(wallZ, wallZ); ctx.translate(-960, -540);
  const scrollT = Math.max(0, u - rvT);
  const k16 = Math.floor((u - rvT) / S16);
  const f16 = u - rvT - k16 * S16;
  for (const cell0 of GRID) {
    const cell = cell0.block ? cell0 : { ...cell0, x: cell0.x + (cell0.r % 2 ? 40 : -40) * scrollT };
    let flipK = 1;
    if (u >= rvT && !cell.block && E.rand('flip', k16, cell.c, cell.r) < 0.09) flipK = Math.max(0.05, Math.abs(Math.cos(E.seg(f16, 0, 0.1, 'cubicInOut') * Math.PI)));
    if (flipK < 1) { ctx.save(); ctx.translate(cell.x, 0); ctx.scale(flipK, 1); ctx.translate(-cell.x, 0); }
    // stadium wave from centre on the reveal, second softer wave on the clap
    const dC = Math.hypot(cell.x - 960, (cell.y - 540) * 1.4);
    const w1 = (u - rvT) * 2300 - dC, w2 = (u - (T_CLAP2 - T_BREED)) * 2600 - dC;
    const band = (w) => (w > 0 && w < 380 ? Math.sin((w / 380) * Math.PI) : 0);
    const b1 = band(w1), b2 = band(w2);
    const wave = { tile: Math.max(b1, b2 * 0.6), hop: b1 * 34 + b2 * 18, jump: b1 > 0.02, jf: Math.floor((w1 / 380) * 7) };
    if (drawCell(E, ctx, t, u, cell, wave) && !cell.block) popped++;
    if (flipK < 1) ctx.restore();
  }
  ctx.restore();

  // reveal burst of catnip + coins (behind the panel, so it erupts from its edges)
  if (u >= rvT) {
    for (const p of E.burst({ seed: 's3rv', count: 40, t: u, t0: rvT, x: 960, y: 470, speed: [900, 2300], gravity: 1400, drag: 1.8, life: [0.7, 1.2], size: [30, 70], spin: 10 })) {
      if (p.r(8) < 0.5) coinFlip(E, ctx, p.x, p.y, p.size, p.rot * 2, Math.min(1, (1 - p.p) * 2));
      else E.drawImg(ctx, 'catnip', p.x, p.y, { w: p.size * 1.2, rot: p.rot, alpha: Math.min(1, (1 - p.p) * 2), smooth: false });
    }
  }
  // --- centre vault panel
  const bx = BLOCK.x + 8, by = BLOCK.y + 8, bw = BLOCK.w - 16, bh = BLOCK.h - 16;
  const pq = E.seg(u, 0.84, 1.02);
  if (pq > 0) {
    const ps = E.lerp(0.2, 1, E.backOut(pq, 1.8)) * (1 + 0.06 * E.env(u, T_CLAP2 - T_BREED, 0.1));
    ctx.save(); ctx.translate(960, 540); ctx.scale(ps, ps); ctx.translate(-960, -540);
    ctx.fillStyle = E.col('outline'); ctx.beginPath(); ctx.roundRect(bx - 6, by + 4, bw + 12, bh + 10, 30); ctx.fill();
    const rg = ctx.createRadialGradient(960, 520, 40, 960, 540, 520);
    const rvA = E.seg(u, rvT, rvT + 0.1);
    rg.addColorStop(0, E.mix('#241038', 'grape', rvA)); rg.addColorStop(1, '#10061c');
    ctx.fillStyle = rg; ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 26); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 26); ctx.clip();
    if (rvA > 0) rays(E, ctx, 960, 470, 16, u * 0.8, 900 * E.expoOut(rvA), 'coin', 0.1);
    // scanlines inside panel
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    for (let y = by + E.mod(u * 60, 6); y < by + bh; y += 6) ctx.fillRect(bx, y, bw, 2);
    ctx.restore();
    ctx.strokeStyle = E.col(rvA > 0 ? 'coin' : 'lavender'); ctx.lineWidth = 6; ctx.beginPath(); ctx.roundRect(bx + 10, by + 10, bw - 20, bh - 20, 20); ctx.stroke();

    if (u < rvT) {
      // decoding digits just before the slam
      const n = Math.min(58, Math.round(E.lerp(40, 58, E.expoOut(E.seg(u, 0.84, rvT)))));
      E.drawText(ctx, String(n), 960, 470, { size: 300, color: 'lavender', alpha: 0.75, extrude: { depth: 12, color: 'plum', dark: 0.4 } });
    } else {
      const v = u - rvT;
      const p2 = 0.08 * E.env(u, T_CLAP2 - T_BREED, 0.1);
      E.drawText(ctx, '58', 960, 470, {
        size: 380, color: 'coin', tracking: 0.02, extrude: { depth: 24, dx: 0.6, dy: 1, color: '#7a3d00', dark: 0.55 }, stroke: 'outline', strokeWidth: 16,
        perChar: ({ i }) => { const q = E.seg(v, i * 0.05, i * 0.05 + 0.22); return { scale: E.lerp(3.2, 1, E.expoOut(q)) * (1 + p2), alpha: q > 0 ? 1 : 0, rot: (1 - E.expoOut(q)) * (i ? 0.4 : -0.4) }; },
      });
      const cs = fitSize(E, ctx, 'CATS TO COLLECT', 84, bw - 90, { font: 'condensed', weight: '800', tracking: 0.08 });
      // highlight bar on the clap
      const hb = E.expoOut(E.seg(u, T_CLAP2 - T_BREED, T_CLAP2 - T_BREED + 0.2));
      if (hb > 0) { ctx.fillStyle = E.col('catnip'); ctx.fillRect(960 - (bw - 70) / 2, 700 - 44, (bw - 70) * hb, 88); }
      const barL = 960 - (bw - 70) / 2, barR = barL + (bw - 70) * hb;
      E.drawText(ctx, 'CATS TO COLLECT', 960, 702, {
        size: cs, font: 'condensed', weight: '800', tracking: 0.08, color: 'cream',
        perChar: ({ i, n, cx, width }) => {
          const q = E.stagger(v, i, n, { start: 0.1, spread: 0.18, dur: 0.2, e: 'backOut' });
          const under = hb > 0 && 960 - width / 2 + cx < barR;
          return { y: (1 - q) * 50, alpha: E.clamp01(q * 3), color: under ? 'night' : 'cream' };
        },
      });
      // pill
      const pl = E.seg(u, T_CLAP2 - T_BREED + 0.02, T_CLAP2 - T_BREED + 0.3);
      if (pl > 0) {
        const s = E.backOut(pl, 2.5);
        ctx.save(); ctx.translate(960, 812); ctx.scale(s, s);
        ctx.fillStyle = E.col('outline'); ctx.beginPath(); ctx.roundRect(-230, -30, 460, 66, 33); ctx.fill();
        ctx.fillStyle = E.col('coin'); ctx.beginPath(); ctx.roundRect(-230, -34, 460, 64, 32); ctx.fill();
        E.drawText(ctx, 'BUILD YOUR CAT YARD', 18, -1, { size: 34, font: 'condensed', weight: '800', color: 'outline', tracking: 0.08 });
        E.drawImg(ctx, 'paw', -196, -2, { w: 40, smooth: false });
        ctx.restore();
      }
      E.shockwave(ctx, 960, 470, E.seg(v, 0, 0.5), { radius: 1300, width: 24, color: 'coin', rings: 3, gap: 0.12 });
    }
    ctx.restore();
  }
  ctx.restore();

  // screen-space scanner HUD (pre-reveal)
  const hudA = E.seg(u, 0.12, 0.22) * (1 - E.seg(u, rvT - 0.06, rvT));
  if (hudA > 0) {
    ctx.save(); ctx.globalAlpha = hudA;
    const hx = 70, hy = 70;
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.beginPath(); ctx.roundRect(hx + 8, hy + 12, 430, 128, 14); ctx.fill();
    ctx.fillStyle = E.col('night'); ctx.beginPath(); ctx.roundRect(hx, hy, 430, 128, 14); ctx.fill();
    ctx.strokeStyle = E.col('catnip'); ctx.lineWidth = 4;
    for (const [x, y, dx, dy] of [[hx, hy, 1, 1], [hx + 430, hy, -1, 1], [hx, hy + 128, 1, -1], [hx + 430, hy + 128, -1, -1]]) {
      ctx.beginPath(); ctx.moveTo(x + dx * 26, y); ctx.lineTo(x, y); ctx.lineTo(x, y + dy * 26); ctx.stroke();
    }
    E.drawText(ctx, (Math.floor(u * 6) % 2 ? '● ' : '○ ') + 'BREEDS FOUND', hx + 28, hy + 36, { size: 24, font: 'mono', weight: 'bold', align: 'left', color: 'catnip', tracking: 0.2 });
    E.drawText(ctx, String(popped).padStart(2, '0'), hx + 28, hy + 88, { size: 64, font: 'mono', weight: 'bold', align: 'left', color: 'cream' });
    E.drawText(ctx, '/ 58', hx + 118, hy + 92, { size: 36, font: 'mono', weight: 'bold', align: 'left', color: 'lavender' });
    ctx.fillStyle = E.rgba('lavender', 0.3); ctx.fillRect(hx + 230, hy + 84, 170, 12);
    ctx.fillStyle = E.col('catnip'); ctx.fillRect(hx + 230, hy + 84, 170 * popped / 58, 12);
    ctx.restore();
  }
  // screen-space: speed lines on the whip in and the push-through
  const wIn = 1 - E.expoOut(E.seg(u, 0, 0.2));
  if (wIn > 0.02) E.speedLinesDir(ctx, t, { angle: 0, count: 40, speed: -8000, length: [300, 1000], width: [3, 9], color: 'lilac', alpha: 0.55 * wIn });
  if (cam.out > 0) {
    E.zoomBlur(ctx, { cx: 960, cy: 500, strength: 0.25 * cam.out, samples: 7 });
    E.speedLines(ctx, t, { cx: 960, cy: 500, count: 80, inner: 520 - 300 * cam.out, color: '#ffffff', alpha: 0.5 * cam.out });
  }
}

// ---------------------------------------------------------------- scene
export default {
  start: 7.5,
  end: 11.25,
  async init(E) { GRID = buildGrid(E); },
  draw(ctx, t, lt, E) {
    if (!GRID) GRID = buildGrid(E);
    if (lt < T_HEIST) shotStakes(E, ctx, t, lt);
    else if (lt < T_ALERT) shotHeists(E, ctx, t, lt);
    else if (lt < T_BREED) {
      const e = E.expoIn(E.seg(lt, T_BREED - 0.115, T_BREED));
      if (e > 0) { ctx.save(); ctx.translate(E.W * (1 - e), 0); shotBreeds(E, ctx, t, lt); ctx.restore(); }
      ctx.save(); ctx.translate(-E.W * e, 0); ctx.beginPath(); ctx.rect(0, 0, E.W, E.H); ctx.clip(); shotAlert(E, ctx, t, lt); ctx.restore();
    } else {
      const s = E.seg(lt, T_BREED, T_BREED + 0.32);
      ctx.save(); ctx.translate(-90 * Math.sin(Math.PI * s) * (1 - s), 0); shotBreeds(E, ctx, t, lt); ctx.restore();
    }
  },
  fx(t, lt, E) {
    const F = 1 / 60;
    const hits = (list, d) => list.reduce((s, h) => s + E.env(lt, h, d), 0);
    let shake = 0, ab = 0, flash = 0, flashColor = '#ffffff', glitch = 0, zoom = 1, mb = 0;
    // stakes (7.5): RGB split + a 2-frame gold hit instead of white
    shake += 28 * E.env(lt, 0, 0.12) + 5 * hits(COIN_ARR, 0.05);
    ab += 20 * E.env(lt, 0, 0.05) + 2 * hits(COIN_ARR, 0.04);
    shake += 8 * E.env(lt, COIN_ARR[3], 0.07);
    zoom *= (1 + 0.04 * E.env(lt, 0, 0.1)) * (1 + 0.012 * hits(COIN_ARR, 0.05));
    // 8 heists: shake + zoom punch, no flash
    shake += 32 * E.env(lt, T_HEIST, 0.12); ab += 12 * E.env(lt, T_HEIST, 0.07);
    zoom *= 1 + 0.06 * E.env(lt, T_HEIST, 0.1);
    shake += 9 * hits(T_STARS, 0.07); ab += 3 * hits(T_STARS, 0.05);
    // alert: red hit, capped, fast decay; 2-frame punch-in on the dog
    const al = E.env(lt, T_ALERT, 0.05);
    if (0.55 * al > flash) { flash = 0.55 * al; flashColor = '#ff2a1a'; }
    if (lt >= T_ALERT && lt < T_ALERT + 2 * F) zoom *= 1.08;
    shake += 24 * al; ab += 14 * al; glitch = Math.max(glitch, 0.55 * E.env(lt, T_ALERT, 0.05));
    // whip between alert and breeds (sharp on the 9.375 frame itself)
    if (lt > T_ALERT + 0.12 && lt < T_BREED + 0.12 && !(lt >= T_BREED && lt < T_BREED + 2 * F)) mb = 6;
    // breeds: no flash, the whip-in carries it
    const bf = E.env(lt, T_BREED, 0.06);
    shake += 18 * bf + 7 * hits([2.109375, 2.34375, 2.578125], 0.06);
    ab += 8 * bf + 3 * hits([2.34375], 0.06);
    // 58 reveal: ring burst + zoom punch, no white
    const rv = E.env(lt, T_REVEAL, 0.12);
    shake += 30 * rv; ab += 10 * rv; zoom *= 1 + 0.07 * E.env(lt, T_REVEAL, 0.09);
    shake += 12 * E.env(lt, T_CLAP2, 0.08); ab += 4 * E.env(lt, T_CLAP2, 0.06); zoom *= 1 + 0.03 * E.env(lt, T_CLAP2, 0.08);
    // push-through into s4: zoom/smear build, then 3 black frames before 11.25 (no fade-up)
    const out = E.seg(lt, T_END - 0.12, T_END, 'expoIn');
    if (out > 0) { ab += 12 * out; shake += 10 * out; }
    if (lt >= T_END - 3 * F) { flash = 0.85; flashColor = '#07030c'; }
    return { shake, aberration: ab, flash, flashColor, glitch, zoom, motionBlur: mb };
  },
};
