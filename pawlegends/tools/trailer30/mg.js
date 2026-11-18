// Trailer 30 motion graphics: every story / type / logo segment drawn on one canvas, frame by frame.
// window.__mg.setup({ W, H, assets }) then window.__mg.draw(segment, localFrame, params). Text is set here in the
// brand faces (Rubik Italic display, Fredoka); generated art never carries text.
const C = { night: '#12091F', plum: '#471F5D', rose: '#FF3D9A', sky: '#2E8BFF', bolt: '#FFD21F', cream: '#FFF3E3', ink: '#0B0612' };
let W = 1920, H = 1080, ctx, cv;
const img = {};

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const outBack = (t, k = 1.7) => 1 + (k + 1) * (t - 1) ** 3 + k * (t - 1) ** 2;
const outCubic = (t) => 1 - (1 - t) ** 3;
const S = () => Math.min(W, H) / 1080; // type scale unit

async function load(name, src) {
  const im = new Image();
  im.src = src;
  await im.decode();
  img[name] = im;
}

/** Draw an image to cover a rect, zoomed about a focal point (fx, fy in 0..1 of the image). */
function cover(im, z = 1, fx = 0.5, fy = 0.5, x = 0, y = 0, w = W, h = H, dx = 0, dy = 0) {
  const s = Math.max(w / im.width, h / im.height) * z;
  const iw = im.width * s, ih = im.height * s;
  let ox = x + w / 2 - fx * iw + dx, oy = y + h / 2 - fy * ih + dy;
  ox = Math.min(x, Math.max(x + w - iw, ox));
  oy = Math.min(y, Math.max(y + h - ih, oy));
  ctx.drawImage(im, ox, oy, iw, ih);
}

/** A jagged bolt polyline from (x0,y0) to (x1,y1). */
function boltPts(x0, y0, x1, y1, n = 7, amp = 0.09, seed = 3) {
  const r = rng(seed);
  const pts = [];
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy), nx = -dy / L, ny = dx / L;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const o = i === 0 || i === n ? 0 : (i % 2 ? 1 : -1) * amp * L * (0.5 + r() * 0.6);
    pts.push([x0 + dx * t + nx * o, y0 + dy * t + ny * o]);
  }
  return pts;
}
function strokeBolt(pts, width, color, glow = 0, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineJoin = 'miter';
  ctx.lineCap = 'round';
  if (glow) {
    ctx.shadowColor = color;
    ctx.shadowBlur = glow;
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();
  ctx.restore();
}
/** Fat comic bolt shape (filled polygon) along a polyline. */
function fillBolt(pts, wid, color, outline = C.ink, glow = 0) {
  const left = [], right = [];
  pts.forEach(([x, y], i) => {
    const [ax, ay] = pts[Math.max(0, i - 1)], [bx, by] = pts[Math.min(pts.length - 1, i + 1)];
    const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1;
    const w = wid * (1 - 0.75 * (i / (pts.length - 1)));
    left.push([x - (dy / L) * w, y + (dx / L) * w]);
    right.push([x + (dy / L) * w, y - (dx / L) * w]);
  });
  ctx.save();
  if (glow) {
    ctx.shadowColor = color;
    ctx.shadowBlur = glow;
  }
  ctx.beginPath();
  [...left, ...right.reverse()].forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = Math.max(3, wid * 0.18);
  ctx.strokeStyle = outline;
  ctx.stroke();
  ctx.restore();
}

function flash(a, color = '#fff') {
  if (a <= 0) return;
  ctx.save();
  ctx.globalAlpha = clamp(a);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

function speedLines(cx, cy, n, seed, alpha, color = '#fff', inner = 0.35) {
  const r = rng(seed);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  const R = Math.hypot(W, H);
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, w = 0.004 + r() * 0.012, r0 = R * (inner + r() * 0.25);
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    ctx.lineTo(cx + Math.cos(a - w) * R, cy + Math.sin(a - w) * R);
    ctx.lineTo(cx + Math.cos(a + w) * R, cy + Math.sin(a + w) * R);
    ctx.fill();
  }
  ctx.restore();
}

function halftone(color, alpha, step = 14, bias = 0, angle = 0.4) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.translate(W / 2, H / 2);
  ctx.rotate(angle);
  const R = Math.hypot(W, H) / 2;
  for (let y = -R; y < R; y += step) {
    for (let x = -R; x < R; x += step) {
      const g = clamp((x / R + 1) / 2 + bias);
      const rad = step * 0.5 * g;
      if (rad < 0.6) continue;
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, 7);
      ctx.fill();
    }
  }
  ctx.restore();
}

function vignette(a = 0.45, color = '0,0,0') {
  const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.hypot(W, H) * 0.6);
  g.addColorStop(0, `rgba(${color},0)`);
  g.addColorStop(1, `rgba(${color},${a})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

/**
 * Kinetic type: letters slam in one after another (2.2x, drop, overshoot, settle), cream fill, ink outline, a
 * coloured offset shadow. f = frames since the word started.
 */
function slamWord(word, x, y, size, f, { color = C.cream, shadow = C.rose, per = 2, align = 'center', skew = -0.12, out = null } = {}) {
  ctx.save();
  ctx.font = `900 italic ${size}px RubikD, Rubik, sans-serif`;
  ctx.textBaseline = 'middle';
  const widths = [...word].map((ch) => ctx.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + (word.length - 1) * size * 0.02;
  let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  const outT = out !== null ? clamp((f - out) / 6) : 0;
  [...word].forEach((ch, i) => {
    const t = clamp((f - i * per) / 7);
    if (t <= 0) {
      cx += widths[i] + size * 0.02;
      return;
    }
    const s = t < 1 ? 2.2 - 1.2 * outBack(t, 2.2) : 1;
    const a = clamp(t * 3) * (1 - outT);
    const lx = cx + widths[i] / 2;
    ctx.save();
    ctx.translate(lx, y + (1 - outCubic(t)) * -size * 0.25 - outT * size * 0.6);
    ctx.transform(1, 0, skew, 1, 0, 0);
    ctx.scale(s, s);
    ctx.globalAlpha = a;
    ctx.lineJoin = 'round';
    ctx.textAlign = 'center';
    ctx.lineWidth = size * 0.16;
    ctx.strokeStyle = C.ink;
    ctx.fillStyle = shadow;
    ctx.strokeText(ch, size * 0.06, size * 0.07);
    ctx.fillText(ch, size * 0.06, size * 0.07);
    ctx.strokeText(ch, 0, 0);
    ctx.fillStyle = color;
    ctx.fillText(ch, 0, 0);
    ctx.restore();
    cx += widths[i] + size * 0.02;
  });
  ctx.restore();
}

function shake(f, amp, seed = 1) {
  const r = rng(seed * 997 + f * 13);
  return [(r() - 0.5) * 2 * amp, (r() - 0.5) * 2 * amp];
}

// ---------------------------------------------------------------- segments

const SEG = {};

/** Ink impact frame: the gameplay frame as two-ink silhouettes on plum (magenta left of the bolt, blue right). */
SEG.impact = (f, p) => {
  cover(img[p.still]);
  const d = ctx.getImageData(0, 0, W, H);
  const a = d.data;
  const inv = f === 1;
  for (let i = 0; i < a.length; i += 4) {
    const px = (i / 4) % W, py = (i / 4 / W) | 0;
    const l = 0.3 * a[i] + 0.59 * a[i + 1] + 0.11 * a[i + 2];
    const side = px / W + (py / H) * 0.35 < 0.68;
    let c;
    if (l > 200) c = inv ? [18, 9, 31] : [255, 243, 227];
    else if (l > 120) c = side ? [255, 61, 154] : [46, 139, 255];
    else c = inv ? [255, 243, 227] : [18, 9, 31];
    a[i] = c[0];
    a[i + 1] = c[1];
    a[i + 2] = c[2];
  }
  ctx.putImageData(d, 0, 0);
  speedLines(W / 2, H / 2, 70, 11 + f, 0.5, inv ? C.night : C.cream, 0.28);
};

/** Montage hit freeze: the frame held, a team-coloured halftone wash and speed lines, a small zoom. */
SEG.freeze = (f, p) => {
  const z = 1.04 + f * 0.015;
  cover(img[p.still], z, 0.5, 0.5);
  const col = p.side === 'cat' ? C.rose : C.sky;
  // a team-coloured duotone: the frame multiplied by the team colour, ink halftone in the shadows
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = col;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1;
  halftone(C.night, 0.55, 11 * S(), -0.35, 0.5);
  ctx.restore();
  // a radial burst of speed lines and a thin team-colour frame
  speedLines(W / 2, H / 2, 70, 21 + f, 0.55, C.cream, 0.36);
  ctx.save();
  ctx.strokeStyle = col;
  ctx.lineWidth = 18 * S();
  ctx.strokeRect(9 * S(), 9 * S(), W - 18 * S(), H - 18 * S());
  ctx.restore();
  flash(f === 0 ? 0.18 : 0);
};

/** The tear: the gameplay frame splits along the bolt diagonal into the Lambo vs Sir Brutus comic split. */
SEG.vs = (f, p) => {
  const v = H > W; // the tall art and its horizontal bolt (9:16 only)
  const stack = H >= W; // CATS above, DOGS below (9:16 and 1:1)
  const art = img[v ? 'vsTall' : 'vsWide'];
  const z = 1.0 + f * 0.0035;
  const [sx, sy] = shake(f, f < 6 ? 10 * S() : f >= 12 && f < 16 ? 8 * S() : 2 * S(), 5);
  ctx.fillStyle = C.night;
  ctx.fillRect(0, 0, W, H);
  cover(art, z * (1.04 + (f < 6 ? 0.05 * (1 - f / 6) : 0)), 0.5, 0.5, 0, 0, W, H, sx, sy);
  // the bolt the art carries, as a line from top-right to bottom-left (16:9) / left to right (9:16)
  const bolt = v ? boltPts(-0.05 * W, 0.56 * H, 1.05 * W, 0.44 * H, 7, 0.06, 9) : boltPts(0.62 * W, -0.05 * H, 0.38 * W, 1.05 * H, 7, 0.07, 9);
  // tear-away halves of the gameplay frame (f0-7)
  const t = clamp(f / 5);
  if (t < 1) {
    const e = outCubic(t);
    const off = e * Math.max(W, H) * 0.75;
    for (const sideSign of [-1, 1]) {
      ctx.save();
      ctx.beginPath();
      if (!v) {
        ctx.moveTo(sideSign < 0 ? -10 : W + 10, -10);
        bolt.forEach(([x, y]) => ctx.lineTo(x, y));
        ctx.lineTo(sideSign < 0 ? -10 : W + 10, H + 10);
      } else {
        ctx.moveTo(-10, sideSign < 0 ? -10 : H + 10);
        bolt.forEach(([x, y]) => ctx.lineTo(x, y));
        ctx.lineTo(W + 10, sideSign < 0 ? -10 : H + 10);
      }
      ctx.closePath();
      if (!v) ctx.translate(sideSign * off, sideSign * off * -0.2);
      else ctx.translate(sideSign * off * 0.15, sideSign * off);
      ctx.clip();
      cover(img[p.still]);
      ctx.restore();
    }
    strokeBolt(bolt, 60 * S() * (1 - t), '#fff', 60, 1 - t);
  }
  strokeBolt(bolt, 10 * S(), C.bolt, 40 * S(), f < 8 ? 0.9 : 0.35 + 0.25 * Math.sin(f * 1.3));
  flash(f < 2 ? 0.8 - f * 0.4 : f === 12 ? 0.25 : 0);
  vignette(0.35);
  // CATS on the cat side (f0), DOGS on the dog side (f12)
  const sz = (stack ? 190 : 210) * S();
  if (!stack) {
    slamWord('CATS', W * 0.2, H * 0.8, sz, f, { shadow: C.rose });
    slamWord('DOGS', W * 0.8, H * 0.8, sz, f - 12, { shadow: C.sky });
  } else {
    slamWord('CATS', W * 0.5, H * 0.13, sz, f, { shadow: C.rose });
    slamWord('DOGS', W * 0.5, H * 0.88, sz, f - 12, { shadow: C.sky });
  }
};

/** War room: the cats' castle and the dogs' fort slide in along the bolt; PICK A SIDE. */
SEG.war = (f, p) => {
  const v = H >= W;
  ctx.fillStyle = C.night;
  ctx.fillRect(0, 0, W, H);
  const t = outCubic(clamp(f / 12));
  const z = 1.03 + f * 0.0012;
  const bolt = v ? boltPts(-0.05 * W, 0.53 * H, 1.05 * W, 0.47 * H, 6, 0.05, 4) : boltPts(0.56 * W, -0.05 * H, 0.44 * W, 1.05 * H, 6, 0.06, 4);
  for (const [k, sideSign] of [['warCats', -1], ['warDogs', 1]]) {
    ctx.save();
    ctx.beginPath();
    if (!v) {
      ctx.moveTo(sideSign < 0 ? -10 : W + 10, -10);
      bolt.forEach(([x, y]) => ctx.lineTo(x, y));
      ctx.lineTo(sideSign < 0 ? -10 : W + 10, H + 10);
    } else {
      ctx.moveTo(-10, sideSign < 0 ? -10 : H + 10);
      bolt.forEach(([x, y]) => ctx.lineTo(x, y));
      ctx.lineTo(W + 10, sideSign < 0 ? -10 : H + 10);
    }
    ctx.closePath();
    ctx.clip();
    const off = (1 - t) * (v ? H * 0.6 : W * 0.6) * sideSign;
    const dx = v ? 0 : off + sideSign * W * 0.04 * (1 - f / 72);
    const dy = v ? off : 0;
    if (!v) cover(img[k], z, sideSign < 0 ? 0.42 : 0.5, 0.45, sideSign < 0 ? 0 : W * 0.42, 0, W * 0.58, H, dx, dy);
    else cover(img[k], z, 0.5, 0.5, 0, sideSign < 0 ? 0 : H * 0.47, W, H * 0.53, dx, dy);
    ctx.restore();
  }
  strokeBolt(bolt, 26 * S(), C.ink, 0, 1);
  strokeBolt(bolt, 12 * S(), C.bolt, 30 * S(), 0.9);
  vignette(0.4);
  const sz = (v ? 150 : 150) * S();
  ctx.save();
  // a dark skewed plate under the line
  const pt = outCubic(clamp((f - 16) / 6));
  if (pt > 0) {
    ctx.fillStyle = 'rgba(18,9,31,0.82)';
    const pw = (v ? W * 0.92 : W * 0.6) * pt, ph = sz * 1.25;
    const py = v ? H * 0.5 : H * 0.84;
    ctx.translate(W / 2, py);
    ctx.transform(1, 0, -0.2, 1, 0, 0);
    ctx.fillRect(-pw / 2, -ph / 2, pw, ph);
  }
  ctx.restore();
  slamWord('PICK A SIDE.', W / 2, v ? H * 0.5 : H * 0.84, sz * (v ? 0.95 : 1), f - 18, { shadow: C.bolt, per: 1 });
};

/** NOT OUT.: Clem's eyes narrow, a bolt in each. */
SEG.eyes = (f, p) => {
  ctx.fillStyle = C.night;
  ctx.fillRect(0, 0, W, H);
  const v = H >= W;
  const im = img.eyes;
  // the strip without its own letterbox (the image's middle ~70 %)
  const sh = im.height * 0.7, sy0 = im.height * 0.15;
  const bandH = v ? W * 0.62 : H * 0.62;
  const z = 1 + f * 0.0028 + (f < 4 ? 0.06 * (1 - f / 4) : 0);
  const bw = Math.max(W, (bandH * im.width) / sh) * z;
  const bh = (bw * sh) / im.width;
  const cy = v ? H * 0.42 : H * 0.44;
  const [sx, sy] = shake(f, f < 6 ? 8 * S() : 1.5 * S(), 7);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, cy - bandH / 2, W, bandH);
  ctx.clip();
  ctx.drawImage(im, 0, sy0, im.width, sh, W / 2 - bw / 2 + sx, cy - bh / 2 + sy, bw, bh);
  ctx.restore();
  // band edges
  ctx.fillStyle = C.rose;
  ctx.fillRect(0, cy - bandH / 2 - 6 * S(), W, 6 * S());
  ctx.fillStyle = C.sky;
  ctx.fillRect(0, cy + bandH / 2, W, 6 * S());
  speedLines(W / 2, cy, 50, 31, 0.18 * clamp(1 - f / 20), C.cream, 0.4);
  flash(f < 3 ? 0.7 - f * 0.25 : 0);
  slamWord('NOT OUT.', W / 2, v ? H * 0.78 : H * 0.86, (v ? 150 : 140) * S(), f - 6, { shadow: C.rose, per: 2 });
};

/** The last gameplay frame holds, then turns into painted key art of the same moment, light rays. */
SEG.keyart = (f, p) => {
  const k = clamp((f - 10) / 14);
  const z0 = 1 + f * 0.0016;
  cover(img[p.still], z0);
  if (k > 0) {
    ctx.save();
    ctx.globalAlpha = ease(k);
    cover(img.keyClem, 1.12 - 0.06 * ease(clamp(f / 72)), 0.35, 0.5);
    ctx.restore();
  }
  // light rays from the blade
  const ra = clamp((f - 14) / 10) * (1 - clamp((f - 66) / 6));
  if (ra > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.translate(W * 0.36, H * 0.42);
    ctx.rotate(f * 0.006);
    for (let i = 0; i < 18; i++) {
      ctx.rotate((Math.PI * 2) / 18);
      const g = ctx.createLinearGradient(0, 0, Math.hypot(W, H), 0);
      g.addColorStop(0, `rgba(255,210,31,${0.28 * ra})`);
      g.addColorStop(1, 'rgba(255,210,31,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.hypot(W, H), -40 * S());
      ctx.lineTo(Math.hypot(W, H), 40 * S());
      ctx.fill();
    }
    ctx.restore();
  }
  flash(f >= 10 && f < 16 ? 0.5 * (1 - (f - 10) / 6) : 0, '#fff6d8');
  // the silence hole: the frame dims 4 frames before the burst
  if (f >= p.n - 4) flash(0.35 * ((f - (p.n - 4) + 1) / 4), C.night);
  vignette(0.35);
};

/** Glory: both rosters across the bolt in a night stadium, three depth rows with parallax. */
SEG.glory = (f, p) => {
  const v = H >= W;
  const t = f / Math.max(1, p.n - 1);
  cover(img[H > W ? 'stadiumTall' : 'stadium'], 1.06 + 0.05 * t, 0.5, 0.45, 0, 0, W, H, 0, -H * 0.01 * t);
  // the bolt down the middle pulses
  const bolt = boltPts(W * 0.5, -0.05 * H, W * 0.5, H * 1.05, 6, 0.04, 12);
  strokeBolt(bolt, 22 * S(), C.bolt, 60 * S(), 0.35 + 0.15 * Math.sin(f * 0.5));
  const rows = p.rows; // [{ cats: [...], dogs: [...], y, h, par }]
  rows.forEach((row, ri) => {
    const drift = (t - 0.5) * row.par * W;
    for (const [list, sideSign] of [[row.cats, -1], [row.dogs, 1]]) {
      list.forEach((name, i) => {
        const im = img[`r_${name}`];
        if (!im) return;
        const n = list.length;
        const enter = outBack(clamp((f - (ri * 6 + i * 2)) / 14), 1.4);
        const hh = row.h * H;
        const ww = (hh * im.width) / im.height;
        const span = v ? W * 0.5 : W * 0.44;
        const x0 = W / 2 + sideSign * (W * (v ? 0.04 : 0.05) + (span * (i + 0.5)) / n);
        const x = x0 + drift * sideSign * -0.3;
        const y = row.y * H + (1 - enter) * H * 0.5;
        ctx.save();
        ctx.translate(x, y);
        if (sideSign > 0) ctx.scale(-1, 1); // dogs face the cats
        ctx.shadowColor = sideSign < 0 ? C.rose : C.sky;
        ctx.shadowBlur = 24 * S();
        ctx.drawImage(im, -ww / 2, -hh, ww, hh);
        ctx.restore();
      });
    }
  });
  // floor glow and confetti
  const r = rng(77);
  for (let i = 0; i < 140; i++) {
    const x = r() * W, sp = 0.4 + r();
    const y = ((r() * H + f * 6 * sp * S()) % (H * 1.1)) - H * 0.05;
    ctx.fillStyle = [C.rose, C.sky, C.bolt, C.cream][i % 4];
    ctx.globalAlpha = 0.8;
    ctx.save();
    ctx.translate(x + Math.sin(f * 0.1 + i) * 10, y);
    ctx.rotate(f * 0.1 * sp + i);
    ctx.fillRect(-5 * S(), -2.5 * S(), 10 * S(), 5 * S());
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  vignette(0.5);
  flash(f < 3 ? 0.4 - f * 0.13 : 0);
};

/** End card: the bolt strikes, the logo slams on night plum, the CTA bar slides up. */
SEG.end = (f, p) => {
  const v = H >= W;
  ctx.fillStyle = C.night;
  ctx.fillRect(0, 0, W, H);
  // team glows on the two sides
  for (const [x, col] of [[0, '255,61,154'], [W, '46,139,255']]) {
    const g = ctx.createRadialGradient(x, H * 0.5, 0, x, H * 0.5, Math.max(W, H) * 0.6);
    g.addColorStop(0, `rgba(${col},0.32)`);
    g.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  halftone('#ffffff', 0.08, 16 * S(), -0.5, 0.6);
  ctx.restore();
  // the strike (f0-6): a bolt draws from the top to the logo, then a flash
  const bolt = boltPts(W * 0.56, -0.02 * H, W * 0.47, H * 0.5, 7, 0.08, 21);
  const st = clamp(f / 4);
  if (f < 14) {
    const k = Math.max(2, Math.round(st * bolt.length));
    strokeBolt(bolt.slice(0, k), 18 * S(), '#fff', 50 * S(), 1 - clamp((f - 6) / 8));
    strokeBolt(bolt.slice(0, k), 8 * S(), C.bolt, 0, 1 - clamp((f - 6) / 8));
  }
  flash(f >= 4 && f < 9 ? 0.85 * (1 - (f - 4) / 5) : 0);
  // logo slam (f4): 1.5x -> 1, overshoot, a slow breath after
  const lt = clamp((f - 4) / 10);
  if (lt > 0) {
    const L = img.logo;
    const lw = (v ? W * 0.84 : W * 0.5) * (lt < 1 ? 1.5 - 0.5 * outBack(lt, 2.4) : 1 + 0.012 * Math.sin((f - 14) * 0.05));
    const lh = (lw * L.height) / L.width;
    const [sx, sy] = shake(f, f >= 13 && f < 20 ? 9 * S() : 0, 3);
    const cy = v ? H * 0.42 : H * 0.42;
    ctx.save();
    ctx.globalAlpha = clamp(lt * 4);
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 30 * S();
    ctx.drawImage(L, W / 2 - lw / 2 + sx, cy - lh / 2 + sy, lw, lh);
    ctx.restore();
  }
  // the CTA bar (f72): PLAY FREE chip + pawlegends.app
  const ct = outCubic(clamp((f - 72) / 12));
  if (ct > 0) {
    const fs = (H > W ? 70 : W === H ? 46 : 64) * S();
    ctx.save();
    ctx.font = `700 ${fs}px Fredoka, sans-serif`;
    const a = 'PLAY FREE', b = 'pawlegends.app';
    const wa = ctx.measureText(a).width + fs * 1.0, wb = ctx.measureText(b).width + fs * 1.2;
    const tot = wa + wb, bh = fs * 1.7;
    const x0 = W / 2 - tot / 2, y0 = (v ? H * 0.66 : H * 0.76) + (1 - ct) * H * 0.18;
    ctx.globalAlpha = ct;
    ctx.fillStyle = C.ink;
    ctx.fillRect(x0 - 6 * S(), y0 - 6 * S(), tot + 12 * S(), bh + 12 * S());
    ctx.fillStyle = C.bolt;
    ctx.fillRect(x0, y0, wa, bh);
    ctx.fillStyle = C.cream;
    ctx.fillRect(x0 + wa, y0, wb, bh);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillStyle = C.ink;
    ctx.fillText(a, x0 + wa / 2, y0 + bh / 2 + fs * 0.04);
    ctx.fillStyle = C.plum;
    ctx.fillText(b, x0 + wa + wb / 2, y0 + bh / 2 + fs * 0.04);
    ctx.restore();
  }
};

window.__mg = {
  async setup(o) {
    W = o.W;
    H = o.H;
    cv = document.getElementById('c');
    cv.width = W;
    cv.height = H;
    cv.style.width = `${W}px`;
    cv.style.height = `${H}px`;
    ctx = cv.getContext('2d', { willReadFrequently: true });
    const faces = [new FontFace('RubikD', `url(${o.fonts.rubik})`, { style: 'italic', weight: '100 900' }), new FontFace('Fredoka', `url(${o.fonts.fredoka})`, { weight: '300 700' })];
    for (const fc of faces) document.fonts.add(await fc.load());
    await Promise.all(Object.entries(o.assets).map(([k, v]) => load(k, v)));
    return Object.keys(img).length;
  },
  async still(name, src) {
    await load(name, src);
  },
  draw(seg, f, p) {
    ctx.save();
    ctx.clearRect(0, 0, W, H);
    SEG[seg](f, p ?? {});
    ctx.restore();
    return true;
  },
};
