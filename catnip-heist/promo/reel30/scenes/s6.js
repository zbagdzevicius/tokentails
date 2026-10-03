// s6: COMMUNITY (bars 11-12, 18.750-22.500 s, b40-b47). STORYBOARD.md section 6.
// Real people and cats from the tokentails.com landing videos, the three landing reach stats landing
// one per crowd "hey", then the community wall quantises into a lattice that tilts into iso space
// (the s7 ledger blocks). All copy is from the STORYBOARD copy register (s6 rows).
//
// Shots (lt = t - 18.75):
//   A [0, b1)       tiles explode -> Paris crew (cropped), OUR COMMUNITY, confetti, coin shockwave
//   B [b1, b3)      12-degree split: phones-play | 540K+ card; b2 wipe -> cafe sign + kicker
//   C [b3, b5)      whip -> tilted phone strip of UGC reels, 180K+ sticker; b4 ribbon line
//   D [b5, end)     tile wall around the 40 card; b6 zoom-out to 6x4 + mint borders; b7 quantise,
//                   glitch + hex bleed; last 6 frames tilt the lattice into isometric space.

const S0 = 18.75;
const B = 0.46875;
const T = {
  hey1: B, b2: 2 * B, hey2: 3 * B, b4: 4 * B, hey3: 5 * B, b6: 6 * B,
  clap: 21.796875 - S0, hey4: 7 * B, g1: 22.265625 - S0, g2: 22.382813 - S0, end: 3.75,
};
const NUM = '"Passion One", Impact, "Arial Black", sans-serif';
const SMALL = '"Nunito", "Helvetica Neue", Arial, sans-serif';
const TAN12 = Math.tan((12 * Math.PI) / 180);

// Community footage hygiene (STORYBOARD section 0).
const CREW_CROP = [0, 0, 1, 0.58];
const GAME_NIGHT_REDACT = [
  { rect: [0.34, 0, 0.28, 0.17], mode: 'pixelate', cell: 16 },
  { rect: [0.83, 0.21, 0.17, 0.23], mode: 'pixelate', cell: 16 },
];
// clip time that shows 1-based-indexed file `n` (engine maps idx 0 -> 0001.jpg for every clip)
const ft = (n) => (n - 1 + 0.001) / 30;

// Tile sources. `from`/`to` are file numbers; `speed` keeps each one inside its safe window.
const TILE = {
  tux: { name: 'community/reel-tuxedo-characters', from: 45, to: 83, speed: 1 },
  night: { name: 'community/reel-game-night', from: 30, to: 83, speed: 1, redact: GAME_NIGHT_REDACT },
  tablet: { name: 'community/reel-cat-plays-tablet', from: 35, to: 60, speed: 0.55 },
  lounge: { name: 'community/paris-cat-lounge', from: 1, to: 20, speed: 0.45 },
  kitten: { name: 'community/ugc-kitten-recommend', from: 30, to: 74, speed: 1, fy: 0.5 },
  chat: { name: 'community/paris-chat', from: 30, to: 53, speed: 1 },
  king: { name: 'community/ugc-king-portrait', from: 20, to: 89, speed: 1, fy: 0.4 },
  ceo: { name: 'community/ugc-ceo-legends', from: 20, to: 74, speed: 1, fy: 0.42 },
  phones: { name: 'community/paris-phones-play', from: 20, to: 77, speed: 1 },
  sign: { name: 'community/paris-cafe-sign', from: 18, to: 41, speed: 1 },
  leap: { name: 'community/paris-cat-leap', from: 1, to: 24, speed: 1 },
  crew: { name: 'community/paris-crew', from: 22, to: 44, speed: 1, crop: CREW_CROP, fx: 0.42 },
};

let fontsReady = false;

export default {
  start: S0,
  end: 22.5,

  async init(E) {
    if (fontsReady || typeof FontFace === 'undefined') return;
    const faces = [
      ['Passion One', 'assets/sprites/fonts/passion-one-latin-700-normal.woff2', { weight: '700' }],
      ['Nunito', 'assets/sprites/fonts/nunito-latin-wght-normal.woff2', { weight: '200 1000' }],
    ];
    for (const [fam, url, desc] of faces) {
      try { const f = new FontFace(fam, `url(${url})`, desc); await f.load(); document.fonts.add(f); } catch { /* falls back */ }
    }
    await document.fonts.ready;
    fontsReady = true;
  },

  draw(ctx, t, lt, E) {
    const { W, H } = E;
    ctx.fillStyle = E.col('night');
    ctx.fillRect(0, 0, W, H);
    const kick = E.cueEnv(t, 'kick', 0.1);

    if (lt < T.hey1 + 0.02) shotA(ctx, t, lt, E, kick);
    if (lt >= T.hey1 - 0.12 && lt < T.hey2) {
      const w = E.snap(E.seg(lt, T.hey2 - 0.12, T.hey2));
      E.camera(ctx, { x: -W * 1.1 * w, rot: -0.03 * w }, () => shotB(ctx, t, lt, E, kick));
    }
    if (lt >= T.hey2 - 0.12 && lt < T.hey3) {
      const w = E.snap(E.seg(lt, T.hey2 - 0.12, T.hey2));
      E.camera(ctx, { x: W * 1.1 * (1 - w), rot: 0.03 * (1 - w) }, () => shotC(ctx, t, lt, E, kick));
    }
    if (lt >= T.hey3 - 0.15) shotD(ctx, t, lt, E, kick); // tiles + 40 card fly in over C's whip-out

    confetti(ctx, t, lt, E);

    // finish: pink/gold light leak breathing, peaking on the impact and the heys
    const hey = E.envs(lt, [0, T.hey1, T.hey2, T.hey3, T.hey4], 0.25);
    E.lightLeak(ctx, t, { seed: 61, intensity: lt < T.hey4 ? 0.08 + 0.14 * hey : 0.04, colors: [E.col('pink'), E.col('coin'), '#ff9a6a'], speed: 0.5 });
  },

  fx(t, lt, E) {
    const imp = E.env(lt, 0, 0.18);
    const snare = E.cueEnv(t, 'snare', 0.035);
    const g = Math.max(E.env(lt, T.g1, 0.05) * (lt < T.g1 + 0.06 ? 1 : 0), E.env(lt, T.g2, 0.07) * (lt < T.g2 + 0.1 ? 1 : 0));
    const whip = E.win(lt, T.hey2 - 0.12, T.hey2 + 0.02, 0.01, 0.01) + E.win(lt, T.hey3 - 0.1, T.hey3, 0.01, 0.01);
    return {
      shake: 18 * imp,
      aberration: 3 * snare + 8 * g + 4 * imp + 6 * E.env(lt, T.hey3, 0.06),
      flash: Math.max(0.4 * E.env(lt, 0, 0.05), 0.08 * E.env(lt, T.hey3, 0.03), 0.35 * E.seg(lt, 3.716, 3.75)),
      flashColor: lt > 3.7 ? E.col('mint') : '#ffffff',
      glitch: 0.55 * g,
      motionBlur: whip > 0.01 || lt < 0.07 ? 4 : 0,
      grain: 0.035 + 0.02 * E.seg(lt, T.hey4, T.end),
      vignette: 0.35,
    };
  },
};

// ------------------------------------------------------------------------------------------------
// shared bits
// ------------------------------------------------------------------------------------------------
function clipT(src, lt, t0) { // clip time for a tile source started at local time t0, clamped to its window
  const f = Math.min(src.to, src.from + Math.max(0, lt - t0) * 30 * (src.speed || 1));
  return ft(f);
}
function clipOpts(src, extra = {}) {
  return { crop: src.crop, fx: src.fx ?? 0.5, fy: src.fy ?? 0.5, redact: src.redact, ...extra };
}
function headline(ctx, E, str, x, y, size, o = {}) {
  return E.drawText(ctx, str, x, y, {
    size, color: 'cream', stroke: 'outline', strokeWidth: 6, tracking: 0.02,
    extrude: { depth: Math.round(size / 15), dx: 0, dy: 1, color: 'plum' }, ...o,
  });
}

// Stat card body: number (Passion One, coin, counts up in 10 frames), Cat Paw label, Nunito footnote.
function stat(ctx, E, lt, cx, cy, s) {
  const t0 = s.t0;
  const c0 = s.countT0 ?? t0;
    // round 3: no count-up at all - the true figure lands whole (interim values read as facts)
  void c0;
  const n = s.value;
  const str = s.fmt(n);
  const land = E.seg(lt, t0, t0 + 0.42);
  const sc = lt < t0 ? 0 : 1 + 0.55 * (1 - E.elasticOut(land, 1, 0.35)) + 0.05 * E.env(lt, s.bump ?? -9, 0.12);
  const glow = 0.4 + 0.6 * E.env(lt, t0 + 10 / 60, 0.3);
  const size = s.size || 240;
  E.camera(ctx, { cx, cy: cy + s.numY, zoom: Math.max(0.001, sc) }, () => {
    E.drawText(ctx, str, cx, cy + s.numY, {
      size, font: NUM, weight: 700, color: 'coin', stroke: 'outline', strokeWidth: 10, tracking: 0.01,
      extrude: { depth: 14, dx: 0.35, dy: 1, color: '#7a3d0a', dark: 0.5 },
      glow: { color: E.rgba('coin', 0.55 * glow), blur: 40 },
    });
  });
  // label: hard wipe in after the number lands
  E.wipeText(ctx, s.label, cx, cy + s.labelY, {
    size: s.labelSize || 56, color: 'cream', stroke: 'outline', strokeWidth: 6, tracking: 0.04,
    extrude: { depth: 4, dx: 0, dy: 1, color: 'plum' },
  }, E.snap(E.seg(lt, t0 + 0.06, t0 + 0.2)), { cursorColor: E.col('coin') });
  const fq = E.expoOut(E.seg(lt, t0 + 0.14, t0 + 0.34));
  E.drawText(ctx, s.foot, cx, cy + s.footY + (1 - fq) * 14, { size: 20, font: SMALL, weight: 700, color: 'cream', alpha: 0.7 * fq, tracking: 0.06 });
}

// pixel paw-print pattern (crisp), drifting
function pawField(ctx, E, t, x, y, w, h, { alpha = 0.07, step = 120, vx = -30, vy = -18, seed = 1, scale = 2 } = {}) {
  const ox = E.mod(t * vx, step), oy = E.mod(t * vy, step);
  for (let j = -1; j <= Math.ceil(h / step) + 1; j++) {
    for (let i = -1; i <= Math.ceil(w / step) + 1; i++) {
      const px = x + i * step + ox + (j % 2) * step * 0.5, py = y + j * step + oy;
      E.drawImg(ctx, 'paw', px, py, { w: 16 * scale, h: 16 * scale, alpha, pixel: true, rot: (E.rand(seed, i, j) - 0.5) * 0.8 });
    }
  }
}

// ------------------------------------------------------------------------------------------------
// A  18.750  COMMUNITY LIFT: tiles explode -> Paris crew + OUR COMMUNITY
// ------------------------------------------------------------------------------------------------
// s5's tile back faces (scenes/s5.js BACKS), so the explosion picks up exactly where its flip ended
const S5_BACKS = [
  ['paris-chat', 6], ['ugc-king-portrait', 20], ['paris-cafe-sign', 20], ['ugc-kitten-recommend', 10],
  ['paris-phones-play', 30], ['paris-crew', 20, CREW_CROP], ['paris-crew', 26, CREW_CROP], ['reel-tuxedo-characters', 4],
  ['ugc-ceo-legends', 12], ['paris-cat-leap', 4], ['paris-phones-play', 50], ['paris-cafe-sign', 34],
];

function shotA(ctx, t, lt, E, kick) {
  const { W, H } = E;
  // background: the crew, heart hands, 1x, 1 % push per beat + kick pulse
  const push = 1.04 + 0.022 * lt + 0.015 * kick;
  E.camera(ctx, { zoom: push, cx: W * 0.46, cy: H * 0.45 }, () => {
    E.drawClip(ctx, TILE.crew.name, clipT(TILE.crew, lt, 0), 0, 0, W, H, clipOpts(TILE.crew));
  });
  // bottom gradient for the title
  const g = ctx.createLinearGradient(0, H * 0.45, 0, H);
  g.addColorStop(0, 'rgba(13,6,22,0)'); g.addColorStop(1, 'rgba(13,6,22,0.88)');
  ctx.fillStyle = g; ctx.fillRect(0, H * 0.45, W, H * 0.55);

  // coin shockwave from the heart hands
  E.shockwave(ctx, W * 0.5, H * 0.62, E.seg(lt, 0, 0.55), { radius: 1150, width: 46, color: 'coin', rings: 3, gap: 0.12 });

  // title: OUR slides in, COMMUNITY 1.8 -> 1 elastic per letter. Exit: scale-up expoIn before hey1.
  const ex = E.expoIn(E.seg(lt, T.hey1 - 0.11, T.hey1));
  E.camera(ctx, { cx: W / 2, cy: 860, zoom: 1 + 0.9 * ex }, () => {
    const a = 1 - ex;
    const oq = E.backOut(E.seg(lt, 0.0, 0.22), 1.9);
    E.drawText(ctx, 'OUR', 960 - (1 - oq) * 500, 735, {
      size: 92, color: 'coin', stroke: 'outline', strokeWidth: 6, tracking: 0.3, alpha: a * E.clamp01(oq * 2),
      extrude: { depth: 6, dx: 0, dy: 1, color: 'plum' },
    });
    headline(ctx, E, 'COMMUNITY', 960, 880, 178, {
      alpha: a, tracking: 0.04,
      perChar: ({ i, n }) => {
        const q = E.seg(lt, 0.02 + i * 0.016, 0.02 + i * 0.016 + 0.38);
        if (q <= 0) return false;
        const s = 1.8 - 0.8 * E.elasticOut(q, 1, 0.35);
        return { scale: s, y: (1 - E.expoOut(q)) * -60, rot: (1 - E.expoOut(q)) * (i - n / 2) * 0.06, alpha: E.clamp01(q * 4) };
      },
    });
  });

  // the s5 tile grid (same 4x3 layout, gaps, back faces) explodes outward: tiles fly toward camera,
  // spin and smear (2 trailing ghosts)
  if (lt < 0.3) {
    const cols = 4, rows = 3, tw = W / cols, th = H / rows, shrink = 0.94, gap = 10;
    for (let k = 0; k < cols * rows; k++) {
      const i = k % cols, j = Math.floor(k / cols);
      const ox = (i - 1.5) * gap * 1.6 + E.randSigned('s5o', k) * 6, oy = (j - 1) * gap * 1.6 + E.randSigned('s5p', k) * 6;
      const cx = ((i + 0.5) * tw - W / 2) * shrink + W / 2 + ox, cy = ((j + 0.5) * th - H / 2) * shrink + H / 2 + oy;
      const rot0 = E.randSigned('s5r', k) * 0.012;
      const dx = cx - W / 2, dy = cy - H / 2, d = Math.hypot(dx, dy) || 1;
      const sp = 1200 + 700 * E.rand('s6x', k);
      const [name, f0, crop] = S5_BACKS[k];
      const drawAt = (age, alpha) => {
        const e = age * 2.0 + age * age * 7; // accelerating fly-off
        const x = cx + (dx / d) * sp * e, y = cy + (dy / d) * sp * e + 900 * age * age;
        const rot = rot0 + E.randSigned('s6r', k) * 4.2 * e;
        const sc = shrink * (1 + 0.9 * e);
        const a = alpha * (1 - E.seg(age, 0.12, 0.28));
        if (a <= 0.01) return;
        ctx.save();
        ctx.translate(x, y); ctx.rotate(rot); ctx.scale(sc, sc);
        ctx.globalAlpha = a;
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(-tw / 2 + 10, -th / 2 + 14, tw, th);
        ctx.save();
        ctx.beginPath(); ctx.rect(-tw / 2, -th / 2, tw, th); ctx.clip();
        E.drawClip(ctx, 'community/' + name, ft(f0 + 4 + age * 30), -tw / 2, -th / 2, tw, th, { crop, fy: 0.35 });
        ctx.globalCompositeOperation = 'soft-light'; ctx.fillStyle = 'rgba(255,170,150,0.35)'; ctx.fillRect(-tw / 2, -th / 2, tw, th);
        ctx.restore();
        ctx.strokeStyle = E.col('mint'); ctx.lineWidth = 6; ctx.strokeRect(-tw / 2 + 3, -th / 2 + 3, tw - 6, th - 6);
        ctx.restore();
      };
      if (lt > 0.01) { drawAt(Math.max(0, lt - 2 / 60), 0.25); drawAt(Math.max(0, lt - 1 / 60), 0.45); }
      drawAt(lt, 1);
    }
  }
}

// ------------------------------------------------------------------------------------------------
// B  19.219 hey1: split panel, 540K+ ; 19.688 wipe to the cafe sign + kicker
// ------------------------------------------------------------------------------------------------
function shotB(ctx, t, lt, E, kick) {
  const { W, H } = E;
  // right panel left edge: anticipation (pulls right), slams in, overshoots
  const pq = E.backOut(E.seg(lt, T.hey1 - 0.11, T.hey1 + 0.05), 1.9);
  const pre = E.win(lt, T.hey1 - 0.2, T.hey1 - 0.1, 0.05, 0.03);
  const xTop = 1110 + (1 - pq) * 1000 + 30 * pre + 6 * Math.sin(lt * 3);
  const edge = (y) => xTop - y * TAN12;

  // LEFT: clips, masked to the left of the slant
  ctx.save();
  ctx.beginPath(); ctx.moveTo(-60, -60); ctx.lineTo(edge(-60), -60); ctx.lineTo(edge(H + 60), H + 60); ctx.lineTo(-60, H + 60); ctx.closePath(); ctx.clip();
  const lw = xTop + 60;
  const push = 1.03 + 0.02 * (lt - T.hey1) + 0.015 * kick;
  // phones-play from hey1, wipe to cafe sign at b2 (same 12-degree slant, sweeping right)
  const wq = E.snap(E.seg(lt, T.b2 - 0.04, T.b2 + 0.07));
  if (lt >= T.hey1 && (lt < T.b2 + 0.08 || wq < 1)) {
    E.camera(ctx, { zoom: push, cx: lw * 0.5, cy: H / 2 }, () => {
      E.drawClip(ctx, TILE.phones.name, clipT({ ...TILE.phones, from: 30 }, lt, T.hey1), -40, 0, lw + 80, H, clipOpts(TILE.phones, { fx: 0.55 }));
    });
  }
  if (wq > 0) {
    ctx.save();
    const wx = -400 + (lw + 700) * wq;
    ctx.beginPath(); ctx.moveTo(-60, -60); ctx.lineTo(wx + 230, -60); ctx.lineTo(wx, H + 60); ctx.lineTo(-60, H + 60); ctx.closePath(); ctx.clip();
    const pan = (lt - T.b2) * 60; // our counter-move against the clip's truck
    E.camera(ctx, { zoom: 1.08 + 0.015 * kick, x: -pan, cx: lw * 0.5, cy: H / 2 }, () => {
      E.drawClip(ctx, TILE.sign.name, ft(10 + Math.max(0, lt - T.b2) * 30 * 2.1), -40, 0, lw + 160, H, clipOpts(TILE.sign, { fx: 0.5 }));
    });
    // parallax foreground paw prints, counter-moving
    pawField(ctx, E, lt - T.b2, -40, 0, lw + 80, H, { alpha: 0.1, step: 210, vx: 220, vy: 0, seed: 7, scale: 3 });
    ctx.restore();
    // wipe front
    if (wq < 1) { ctx.strokeStyle = E.col('coin'); ctx.lineWidth = 10; ctx.beginPath(); ctx.moveTo(wx + 230, -20); ctx.lineTo(wx, H + 20); ctx.stroke(); }
  }
  ctx.restore();

  // RIGHT: stat panel
  ctx.save();
  ctx.beginPath(); ctx.moveTo(edge(-60), -60); ctx.lineTo(W + 60, -60); ctx.lineTo(W + 60, H + 60); ctx.lineTo(edge(H + 60), H + 60); ctx.closePath();
  const g = ctx.createLinearGradient(edge(0), 0, W, H);
  g.addColorStop(0, E.col('plum')); g.addColorStop(1, E.col('night'));
  ctx.fillStyle = g; ctx.fill();
  ctx.clip();
  pawField(ctx, E, lt, edge(H), 0, W - edge(H) + 200, H, { alpha: 0.06, step: 130, vx: -40, vy: -26, seed: 3 });
  // diagonal speed streaks that ride in with the panel
  E.speedLinesDir(ctx, lt, { angle: Math.PI, count: 14, speed: 2400, length: 380, width: 4, color: 'lavender', alpha: 0.35 * (1 - E.seg(lt, T.hey1, T.hey1 + 0.3)), x: edge(H), y: 0, w: W, h: H });
  const cx = (edge(540) + W) / 2 + 10 + (1 - pq) * 1000;
  stat(ctx, E, lt, cx, 540, {
    t0: T.hey1, value: 540, fmt: (n) => `${n}K+`, label: 'REGISTERED PLAYERS', foot: 'All time · Apr 2026 · company-reported',
    numY: -30, labelY: 140, footY: 210, bump: T.b2,
  });
  ctx.restore();

  // round 3: the Paris pill is a lower third on the FOOTAGE side (it labels the cafe shot, not the 540K card)
  const kq = E.snap(E.seg(lt, T.b2, T.b2 + 0.16));
  if (kq > 0) {
    const kx = edge(960) * 0.46;
    ctx.save(); ctx.fillStyle = E.col('catnip'); ctx.globalAlpha = kq;
    const kw = 560 * kq;
    ctx.beginPath(); ctx.roundRect(kx - kw / 2, 934, kw, 56, 28); ctx.fill(); ctx.globalAlpha = 1;
    E.wipeText(ctx, 'A DAY AT A PARIS CAT CAFÉ', kx, 963, { size: 31, font: SMALL, weight: 800, color: 'night', tracking: 0.08 }, E.seg(lt, T.b2 + 0.04, T.b2 + 0.22), { cursor: false });
    ctx.restore();
  }

  // slant edge: gold bar + mint hairline
  ctx.save();
  ctx.lineCap = 'butt';
  ctx.strokeStyle = E.col('coin'); ctx.lineWidth = 14;
  ctx.beginPath(); ctx.moveTo(edge(-20), -20); ctx.lineTo(edge(H + 20), H + 20); ctx.stroke();
  ctx.strokeStyle = E.col('mint'); ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(edge(-20) + 22, -20); ctx.lineTo(edge(H + 20) + 22, H + 20); ctx.stroke();
  ctx.restore();
  // hey sparks off the edge
  for (const p of E.burst({ seed: 611, count: 26, t: lt, t0: T.hey1, x: edge(540), y: 540, speed: [500, 1400], angle: [Math.PI * 0.6, Math.PI * 1.4], gravity: 1600, drag: 1.2, life: [0.3, 0.6], size: [6, 14] })) {
    ctx.fillStyle = E.col(p.i % 3 ? 'coin' : 'cream'); ctx.globalAlpha = p.alpha;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;
}

// ------------------------------------------------------------------------------------------------
// C  20.156 hey2: tilted phone strip of UGC reels + 180K+ sticker ; 20.625 ribbon line
// ------------------------------------------------------------------------------------------------
const STRIP = [
  { src: 'king', from: 20 }, { src: 'kitten', from: 20 }, { src: 'ceo', from: 40 }, { src: 'king', from: 50 },
];

function shotC(ctx, t, lt, E, kick) {
  const { W, H } = E;
  const u = lt - T.hey2;
  // background
  const g = ctx.createRadialGradient(W * 0.6, H * 0.45, 80, W * 0.6, H * 0.45, 1300);
  g.addColorStop(0, E.col('grape2')); g.addColorStop(0.55, E.col('plum')); g.addColorStop(1, E.col('night'));
  ctx.fillStyle = g; ctx.fillRect(-200, -200, W + 400, H + 400);
  E.speedLinesDir(ctx, lt, { angle: Math.PI - 0.14, count: 26, speed: 900 + 2600 * E.env(u, 0, 0.25), length: 260, width: 3, color: 'lavender', alpha: 0.22, x: -100, y: -100, w: W + 200, h: H + 200 });

  // strip position: whip carry-in decaying to 420 px/s, then a whip-out before hey3
  const uu = Math.max(-0.12, u);
  const pos = 420 * uu + 3200 * 0.16 * (1 - Math.exp(-Math.max(0, uu) / 0.16)) + 2600 * E.expoIn(E.seg(lt, T.hey3 - 0.12, T.hey3));
  const ph = 660, pitch = ph * 9 / 16 + 70;
  const total = pitch * STRIP.length;
  const off = E.mod(pos + 300, total);
  ctx.save();
  ctx.translate(W * 0.5, H * 0.45); ctx.rotate(-0.14);
  const zs = 1 + 0.015 * kick;
  ctx.scale(zs, zs);
  for (let k = -5; k <= 6; k++) {
    const px = k * pitch - off + pitch * 0.5;
    if (px < -1400 || px > 1400) continue;
    const it = STRIP[E.mod(k, STRIP.length)];
    const src = TILE[it.src];
    const bob = 10 * Math.sin(lt * 4 + k * 1.7) + 14 * kick * (k % 2 ? 1 : -1); // jitter on every kick
    E.phoneClip(ctx, src.name, ft(Math.min(src.to, it.from + Math.max(0, u + 0.12) * 30)), px, bob, ph, {
      glare: 0.4, tilt: E.clamp(-px / 1600, -0.35, 0.35), shadow: { blur: 34, y: 18, alpha: 0.55 },
      clip: { fit: 'cover', fx: 0.5, fy: 0.5 },
    });
  }
  ctx.restore();

  // sticker card (pops on hey2)
  const sq = E.backOut(E.seg(lt, T.hey2, T.hey2 + 0.2), 1.9);
  if (sq > 0) {
    const wob = 0.06 * E.env(lt, T.b4, 0.18) * Math.sin((lt - T.b4) * 40);
    // round 2: the card steps 26 px right on every beat of the hold (backOut), parallax vs the strip
    let step = 0; for (let b = 1; b <= 3; b++) step += E.backOut(E.seg(lt, T.hey2 + b * B, T.hey2 + b * B + 0.16), 2);
    const scx = 470 + 26 * step, scy = 560 - 8 * step;
    E.camera(ctx, { cx: scx, cy: scy, zoom: Math.max(0.001, sq) * (1 + 0.012 * kick), rot: -0.07 + wob + 0.012 * Math.sin(lt * 2.5) }, () => {
      const w = 720, h = 500;
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.beginPath(); ctx.roundRect(scx - w / 2 + 14, scy - h / 2 + 22, w, h, 34); ctx.fill();
      ctx.fillStyle = E.col('outline'); ctx.beginPath(); ctx.roundRect(scx - w / 2 - 8, scy - h / 2 - 8, w + 16, h + 16, 40); ctx.fill();
      const cg = ctx.createLinearGradient(0, scy - h / 2, 0, scy + h / 2);
      cg.addColorStop(0, E.col('grape')); cg.addColorStop(1, E.col('plum'));
      ctx.fillStyle = cg; ctx.beginPath(); ctx.roundRect(scx - w / 2, scy - h / 2, w, h, 32); ctx.fill();
      ctx.strokeStyle = E.col('coin'); ctx.lineWidth = 6; ctx.beginPath(); ctx.roundRect(scx - w / 2 + 14, scy - h / 2 + 14, w - 28, h - 28, 22); ctx.stroke();
      ctx.save(); ctx.beginPath(); ctx.roundRect(scx - w / 2, scy - h / 2, w, h, 32); ctx.clip();
      pawField(ctx, E, lt, scx - w / 2, scy - h / 2, w, h, { alpha: 0.08, step: 110, seed: 9 });
      ctx.restore();
      stat(ctx, E, lt, scx, scy, {
        t0: T.hey2, value: 180, fmt: (n) => `${n}K+`, label: 'ON X', foot: 'Sep 2026',
        numY: -50, labelY: 110, footY: 175, bump: T.b4, labelSize: 64,
      });
    });
  }

  // b4: CAT INFLUENCERS + CREATORS on a gold ribbon, wipes L->R, exits right before hey3
  const rIn = E.snap(E.seg(lt, T.b4 - 0.03, T.b4 + 0.1));
  const rOut = E.expoIn(E.seg(lt, T.hey3 - 0.13, T.hey3));
  if (rIn > 0) {
    ctx.save();
    ctx.translate(W / 2 + rOut * 2200 + 50 * (lt - T.b4), 930); ctx.rotate(-0.035);
    const rw = 1500;
    ctx.beginPath(); ctx.rect(-W, -70, W * 2, 140); ctx.clip();
    ctx.fillStyle = E.col('outline'); ctx.fillRect(-rw / 2 - 2000 * (1 - rIn) - 8, -58, rw + 16, 116);
    ctx.fillStyle = E.col('coin'); ctx.fillRect(-rw / 2 - 2000 * (1 - rIn), -50, rw, 100);
    ctx.fillStyle = E.col('cream'); ctx.globalAlpha = 0.5; ctx.fillRect(-rw / 2 - 2000 * (1 - rIn), -50, rw, 8); ctx.globalAlpha = 1;
    E.wipeText(ctx, 'CAT INFLUENCERS + CREATORS', 0, 4, {
      size: 80, color: 'outline', tracking: 0.045, extrude: { depth: 4, dx: 0, dy: 1, color: '#b8860b' },
    }, E.snap(E.seg(lt, T.b4 + 0.02, T.b4 + 0.22)), { cursorColor: E.col('night') });
    ctx.restore();
  }
  for (const p of E.burst({ seed: 612, count: 30, t: lt, t0: T.hey2, x: 470, y: 560, speed: [600, 1500], angle: [0, Math.PI * 2], gravity: 1500, drag: 1.4, life: [0.35, 0.7], size: [8, 16] })) {
    ctx.fillStyle = E.col(['coin', 'pink', 'catnipGlow'][p.i % 3]); ctx.globalAlpha = p.alpha;
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2); ctx.restore();
  }
  ctx.globalAlpha = 1;
}

// ------------------------------------------------------------------------------------------------
// D  21.094 hey3 tile wall + 40 ; 21.5625 zoom-out 6x4, mint ; 22.031 quantise ; glitches ; iso tilt
// ------------------------------------------------------------------------------------------------
const P = 316, TS = 300;
const NAMED = [ // [col, row, tile] in the 6x4 lattice; the 40 card owns cols 2-3, rows 1-2
  [0, 1, 'tux'], [1, 1, 'night'], [1, 2, 'tablet'], [4, 1, 'lounge'], [4, 2, 'kitten'], [5, 2, 'chat'],
];
const FILL = ['king', 'phones', 'ceo', 'sign', 'leap', 'kitten', 'tux', 'chat', 'night', 'lounge', 'tablet', 'phones', 'ceo', 'king', 'crew', 'sign', 'leap', 'tux'];

function slotCenter(c, r) { return [960 + (c - 2.5) * P, 540 + (r - 1.5) * P]; }

function shotD(ctx, t, lt, E, kick) {
  const { W, H } = E;
  const u = lt - T.hey3;
  // background: deep purple (round 2: darker, graded toward the reel's purple, never grey)
  const preD = lt < T.hey3 - 1 / 120;
  if (!preD) { const bg = ctx.createRadialGradient(W / 2, H / 2, 100, W / 2, H / 2, 1200);
    bg.addColorStop(0, '#2a1248'); bg.addColorStop(1, '#0a0418');
    ctx.fillStyle = bg; ctx.fillRect(-300, -300, W + 600, H + 600); }

  // camera: slow push, then the b6 pull-back, then the iso tilt
  const zo = E.expoInOut(E.seg(lt, T.b6, T.b6 + 0.42));
  const zoom = (1.0 + 0.03 * E.seg(lt, T.hey3, T.b6)) * (1 - 0.22 * zo) * (1 + 0.012 * kick) * (1 - 0.06 * E.seg(lt, T.hey4, T.end));
  const iso = E.snap(E.seg(lt, 3.65, 3.75));
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.scale(zoom, zoom);
  ctx.rotate(0.01 * Math.sin(lt * 2) * (1 - iso));
  if (iso > 0) {
    // identity -> isometric (x-y)*cos30, (x+y)*sin30
    const a = E.lerp(1, 0.866, iso), b = E.lerp(0, 0.5, iso), c = E.lerp(0, -0.866, iso), d = E.lerp(1, 0.5, iso);
    ctx.transform(a, b, c, d, 0, 0);
  }
  ctx.translate(-W / 2, -H / 2);

  // lattice guides
  ctx.globalAlpha = preD ? 0 : 0.18 + 0.2 * zo;
  ctx.strokeStyle = E.col('mint'); ctx.lineWidth = 2;
  ctx.setLineDash([6, 10]);
  for (let c = 0; c < 6; c++) for (let r = 0; r < 4; r++) {
    const [x, y] = slotCenter(c, r);
    ctx.strokeRect(x - TS / 2, y - TS / 2, TS, TS);
  }
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;

  // quantise state (from hey4)
  const qz = E.seg(lt, T.hey4, 3.72);
  // round 3: the wall keeps its colour (no mint flatten, no hex overlay); only a light pixel quantise
  const cell = qz > 0 ? Math.max(1, Math.round(1 + 7 * E.cubicIn(Math.min(1, qz * 1.15)))) : 1;
  const flat = 0;
  const hexA = 0;
  const clipLt = qz > 0 ? E.stutter(lt, 12) : lt;
  const border = (dist) => E.mix(E.col('cream'), E.col('mint'), E.seg(lt, T.b6 + dist * 0.04, T.b6 + dist * 0.04 + 0.15));

  // collect tiles: named first, then the fill (radial order) at b6, then the 4 centre slots at hey4
  const tiles = [];
  // round 2: the wall starts building at ~20.95 with tiles flying in from the frame edges
  NAMED.forEach(([c, r, k], i) => tiles.push({ c, r, src: TILE[k], q: E.backOut(E.seg(lt, T.hey3 - 0.15 + i * 2 / 60, T.hey3 - 0.15 + i * 2 / 60 + 0.18), 1.9), fly: c < 3 ? -1 : 1, drop: true, seed: i, start: T.hey3 }));
  const rest = [];
  for (let c = 0; c < 6; c++) for (let r = 0; r < 4; r++) {
    if (NAMED.some(([nc, nr]) => nc === c && nr === r)) continue;
    const centre = c >= 2 && c <= 3 && r >= 1 && r <= 2;
    const [x, y] = slotCenter(c, r);
    rest.push({ c, r, centre, d: Math.hypot(x - 960, y - 540) });
  }
  rest.sort((a, b) => a.d - b.d || a.c - b.c);
  let fi = 0;
  rest.filter((s) => !s.centre).forEach((s, i, arr) => {
    const st = T.b6 + 0.03 + (i / arr.length) * 0.24;
    tiles.push({ c: s.c, r: s.r, src: TILE[FILL[fi++ % FILL.length]], q: E.backOut(E.seg(lt, st, st + 0.16), 1.9), seed: 20 + i, start: T.b6 - 0.5 * i * 0.1 });
  });
  rest.filter((s) => s.centre).forEach((s, i) => {
    const st = T.hey4 + 0.02 + i * 0.025;
    tiles.push({ c: s.c, r: s.r, src: TILE[['tux', 'king', 'lounge', 'phones'][i]], q: E.backOut(E.seg(lt, st, st + 0.14), 1.9), seed: 40 + i, start: T.hey4 });
  });

  // empty slots: dim quantised ghosts of the wall-to-come (depth while the wall is still small)
  if (lt < T.hey4 + 0.1 && !preD) {
    const popped = new Set(tiles.filter((x) => x.q > 0.6).map((x) => x.c + ',' + x.r));
    tiles.forEach((tl, i) => {
      if (popped.has(tl.c + ',' + tl.r)) return;
      const [gx, gy] = slotCenter(tl.c, tl.r);
      ctx.save(); ctx.globalAlpha = 0.09;
      ctx.beginPath(); ctx.roundRect(gx - TS / 2, gy - TS / 2, TS, TS, 18); ctx.clip();
      drawTileClip(ctx, E, tl.src, clipT(tl.src, E.stutter(lt, 8), T.hey3 - i * 0.2), gx - TS / 2, gy - TS / 2, TS, 15, 0.7);
      ctx.restore();
    });
  }
  const clapSweep = (d) => E.env(lt, T.clap + d * 0.00035, 0.12);
  for (const tl of tiles) {
    if (tl.q <= 0) continue;
    const [x0, y0] = slotCenter(tl.c, tl.r);
    const dist = Math.hypot(x0 - 960, y0 - 540);
    const y = y0 + (tl.drop ? -80 * (1 - tl.q) : 0);
    const s = tl.drop ? 0.9 + 0.1 * tl.q : tl.q;
    const fxo = tl.fly ? tl.fly * 1100 * (1 - Math.min(1, tl.q)) : 0;
    const ct = clipT(tl.src, clipLt, tl.start);
    ctx.save();
    ctx.translate(x0 + fxo, y); ctx.scale(s, s); ctx.rotate(tl.fly ? tl.fly * 0.3 * (1 - Math.min(1, tl.q)) : 0);
    ctx.globalAlpha = E.clamp01(tl.q * 3);
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.roundRect(-TS / 2 + 8, -TS / 2 + 12, TS, TS, 18); ctx.fill();
    ctx.save();
    ctx.beginPath(); ctx.roundRect(-TS / 2, -TS / 2, TS, TS, 18); ctx.clip();
    drawTileClip(ctx, E, tl.src, ct, -TS / 2, -TS / 2, TS, cell, flat);
    if (hexA > 0) {
      ctx.font = `700 22px ${E.FONTS.mono}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillStyle = E.col('mint');
      const fr = Math.floor(lt * 12);
      for (let k = 0; k < 9; k++) {
        ctx.globalAlpha = hexA * (0.35 + 0.5 * E.rand('hx', tl.seed, k, fr));
        ctx.fillText(E.hexStr(16, 's6', tl.seed, k, fr), -TS / 2 + 10, -TS / 2 + 8 + k * 32);
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    ctx.lineWidth = 6 + 4 * clapSweep(dist);
    ctx.strokeStyle = E.mix(border(dist / 316), '#ffffff', clapSweep(dist));
    ctx.beginPath(); ctx.roundRect(-TS / 2, -TS / 2, TS, TS, 18); ctx.stroke();
    ctx.restore();
  }

  // the 40 card in the centre slot (2x2), exits on hey4
  const cq = E.backOut(E.seg(lt, T.hey3 - 0.15, T.hey3 - 0.02), 1.9); // round 2: fully in ON the beat
  const cx = E.expoIn(E.seg(lt, T.hey4 - 0.02, T.hey4 + 0.1));
  if (cq > 0 && cx < 1) {
    const sc = cq * (1 - cx);
    E.camera(ctx, { cx: 960, cy: 540, zoom: Math.max(0.001, sc), rot: 0.25 * cx }, () => {
      const w = 2 * P - 16, h = 2 * P - 16;
      ctx.fillStyle = E.col('outline'); ctx.beginPath(); ctx.roundRect(960 - w / 2 - 8, 540 - h / 2 - 8, w + 16, h + 16, 34); ctx.fill();
      const g = ctx.createLinearGradient(0, 540 - h / 2, 0, 540 + h / 2);
      g.addColorStop(0, E.col('plum')); g.addColorStop(1, E.col('night'));
      ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(960 - w / 2, 540 - h / 2, w, h, 28); ctx.fill();
      ctx.strokeStyle = E.mix(E.col('coin'), E.col('mint'), zo); ctx.lineWidth = 7;
      ctx.beginPath(); ctx.roundRect(960 - w / 2 + 16, 540 - h / 2 + 16, w - 32, h - 32, 18); ctx.stroke();
      ctx.save(); ctx.beginPath(); ctx.roundRect(960 - w / 2, 540 - h / 2, w, h, 28); ctx.clip();
      pawField(ctx, E, lt, 960 - w / 2, 540 - h / 2, w, h, { alpha: 0.07, step: 100, seed: 11 });
      ctx.restore();
      // pixel heart above the number, beating on kicks
      E.drawImg(ctx, 'heart', 960, 318, { w: 88 * (1 + 0.12 * kick), h: 81 * (1 + 0.12 * kick), pixel: true });
      stat(ctx, E, lt, 960, 540, {
        t0: T.hey3 - 0.2, countT0: T.hey3 - 10 / 60, value: 40, fmt: (n) => `${n}`, label: 'INFLUENCER CATS', foot: 'Apr 2026 · company-reported',
        numY: -10, labelY: 150, footY: 216, bump: T.b6, labelSize: 52, size: 250,
      });
    });
  }
  if (cx > 0 && cx < 1) E.shockwave(ctx, 960, 540, E.seg(lt, T.hey4, T.hey4 + 0.4), { radius: 700, width: 26, color: 'mint', rings: 2 });
  if (u >= 0 && u < 0.45) E.shockwave(ctx, 960, 540, E.seg(u, 0, 0.45), { radius: 900, width: 30, color: 'coin', rings: 2 });
  ctx.restore();

  // hey3 card sparks
  for (const p of E.burst({ seed: 613, count: 34, t: lt, t0: T.hey3, x: 960, y: 540, speed: [700, 1700], angle: [0, Math.PI * 2], gravity: 1200, drag: 1.4, life: [0.35, 0.7], size: [8, 16] })) {
    ctx.fillStyle = E.col(['coin', 'mint', 'pink'][p.i % 3]); ctx.globalAlpha = p.alpha;
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2); ctx.restore();
  }
  ctx.globalAlpha = 1;
  // glitch stutters: RGB split on the whole grid (2 frames each)
  if ((lt >= T.g1 && lt < T.g1 + 2 / 60) || (lt >= T.g2 && lt < T.g2 + 2 / 60)) E.rgbSplit(ctx, 8);
  if (hexA > 0) E.scanlines(ctx, { alpha: 0.08 * hexA, spacing: 4 });
}

// one tile's footage: direct when clean, else rendered tiny and blown up crisp (pixelate) with the
// colours flattened toward mint / night.
function drawTileClip(ctx, E, src, ct, x, y, size, cell, flat) {
  if (cell <= 1 && flat <= 0) { E.drawClip(ctx, src.name, ct, x, y, size, size, clipOpts(src)); return; }
  const n = Math.max(2, Math.round(size / Math.max(1, cell)));
  const s = E.surface('s6px' + n, n, n);
  E.drawClip(s.ctx, src.name, ct, 0, 0, n, n, clipOpts(src));
  if (flat > 0) {
    s.ctx.globalCompositeOperation = 'color';
    s.ctx.globalAlpha = 0.85 * flat; s.ctx.fillStyle = E.col('mint'); s.ctx.fillRect(0, 0, n, n);
    s.ctx.globalCompositeOperation = 'multiply';
    s.ctx.globalAlpha = 0.6 * flat; s.ctx.fillStyle = '#3a6a78'; s.ctx.fillRect(0, 0, n, n);
    s.ctx.globalCompositeOperation = 'source-over'; s.ctx.globalAlpha = 1;
  }
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(s, 0, 0, n, n, x, y, size, size);
  ctx.restore();
}

// ------------------------------------------------------------------------------------------------
// confetti from the bottom edge on the lift; it keeps falling through B
// ------------------------------------------------------------------------------------------------
function confetti(ctx, t, lt, E) {
  if (lt > T.hey2 + 0.1) return;
  const cols = ['coin', 'pink', 'cream', 'catnipGlow', 'lavender'];
  for (const p of E.burst({ seed: 606, count: 110, t: lt, t0: 0, x: 960, y: 1130, speed: [1300, 2300], angle: [-Math.PI * 0.86, -Math.PI * 0.14], gravity: 1500, drag: 0.9, life: [1.1, 1.8], size: [12, 24], spin: 9, delay: 0.12 })) {
    const flutter = Math.cos(p.age * (8 + p.r(7) * 8) + p.r(8) * 6);
    ctx.save(); ctx.translate(p.x + Math.sin(p.age * 5 + p.i) * 20, p.y); ctx.rotate(p.rot);
    ctx.globalAlpha = Math.min(1, p.alpha * 2);
    if (p.i % 11 === 0) {
      if (p.i % 2) E.drawImg(ctx, 'heart', 0, 0, { w: 44, h: 41, pixel: true }); else E.drawImg(ctx, 'catnip', 0, 0, { w: 48, h: 48, pixel: true });
    } else {
      ctx.scale(1, flutter);
      ctx.fillStyle = E.col(cols[p.i % cols.length]);
      ctx.fillRect(-p.size / 2, -p.size * 0.3, p.size, p.size * 0.6);
    }
    ctx.restore();
  }
}
