// Trailer 60 motion graphics (helpers from trailer30): every story / type / logo segment drawn on one canvas, frame by frame.
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
 * Kinetic type: letters slam in one after another (1.45x down to 1x, never smaller, full opacity from the first frame:
 * round 2's overshoot shrank letters below size and faded them, which read as a font fallback), cream fill, ink
 * outline, a coloured offset shadow. f = frames since the word started.
 */
function slamWord(word, x, y, size, f, { color = C.cream, shadow = C.rose, per = 1, align = 'center', skew = -0.12, out = null, rise = 4 } = {}) {
  ctx.save();
  ctx.font = `900 italic ${size}px RubikD, Rubik, sans-serif`;
  ctx.textBaseline = 'middle';
  const widths = [...word].map((ch) => ctx.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + (word.length - 1) * size * 0.02;
  // trailer 60: never wider than 92 % of the frame (1:1 clipped long lines)
  if (total > W * 0.92) {
    ctx.restore();
    return slamWord(word, x, y, size * ((W * 0.92) / total), f, { color, shadow, per, align, skew, out, rise });
  }
  let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  const outT = out !== null ? clamp((f - out) / 6) : 0;
  // the caller's alpha (a fade) multiplies each letter's own
  const base = ctx.globalAlpha;
  [...word].forEach((ch, i) => {
    const t = clamp((f - i * per) / rise);
    if (t <= 0) {
      cx += widths[i] + size * 0.02;
      return;
    }
    const s = 1 + 0.45 * (1 - outCubic(t));
    const a = 1 - outT;
    const lx = cx + widths[i] / 2;
    ctx.save();
    ctx.translate(lx, y + (1 - outCubic(t)) * -size * 0.18 - outT * size * 0.6);
    ctx.transform(1, 0, skew, 1, 0, 0);
    ctx.scale(s, s);
    ctx.globalAlpha = a * base;
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

function embers(f, n, seed, colors, alpha = 0.8, speed = 1, size = 1) {
  const r = rng(seed);
  ctx.save();
  for (let i = 0; i < n; i++) {
    const x0 = r() * W, y0 = r() * H, sp = (0.5 + r()) * speed, sz = (2 + r() * 5) * S() * size, ph = r() * 6.28;
    const y = (((y0 - f * 4 * sp * S()) % (H * 1.1)) + H * 1.1) % (H * 1.1) - H * 0.05;
    const x = x0 + Math.sin(f * 0.05 * sp + ph) * 22 * S();
    ctx.globalAlpha = alpha * (0.5 + 0.5 * Math.sin(f * 0.2 + ph));
    ctx.fillStyle = colors[i % colors.length];
    ctx.shadowColor = colors[i % colors.length];
    ctx.shadowBlur = 10 * S();
    ctx.beginPath();
    ctx.arc(x, y, sz, 0, 7);
    ctx.fill();
  }
  ctx.restore();
}
function card(im, x, y, h, side, { skew = -0.08, alpha = 1, glow = 1, rot = 0, ar = 0.8, fy = 0.42 } = {}) {
  const w = h * ar;
  const col = side === 'cat' ? C.rose : C.sky;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.transform(1, 0, skew, 1, 0, 0);
  const bw = Math.max(4, h * 0.028);
  ctx.shadowColor = col;
  ctx.shadowBlur = 30 * S() * glow;
  ctx.fillStyle = C.ink;
  ctx.fillRect(-w / 2 - bw * 2, -h / 2 - bw * 2, w + bw * 4, h + bw * 4);
  ctx.shadowBlur = 0;
  ctx.fillStyle = col;
  ctx.fillRect(-w / 2 - bw, -h / 2 - bw, w + bw * 2, h + bw * 2);
  ctx.beginPath();
  ctx.rect(-w / 2, -h / 2, w, h);
  ctx.clip();
  const s = Math.max(w / im.width, h / im.height);
  const iw = im.width * s, ih = im.height * s;
  ctx.drawImage(im, -iw / 2, Math.min(-h / 2, Math.max(h / 2 - ih, -fy * ih)), iw, ih);
  ctx.restore();
}
function setLine(text, x, y, size, { font = 'RubikD', weight = 900, italic = true, color = C.cream, shadow = C.rose, align = 'left', outline = 0.16 } = {}) {
  ctx.save();
  ctx.font = `${weight} ${italic ? 'italic ' : ''}${size}px ${font}, sans-serif`;
  // trailer 60: fit the line inside the frame (5 % margins) from its anchor
  const room = align === 'center' ? Math.min(x, W - x) * 2 : align === 'right' ? x : W - x;
  const mw = ctx.measureText(text).width;
  if (mw > room - W * 0.05) {
    size *= Math.max(0.3, (room - W * 0.05) / mw);
    ctx.font = `${weight} ${italic ? 'italic ' : ''}${size}px ${font}, sans-serif`;
  }
  ctx.textBaseline = 'middle';
  ctx.textAlign = align;
  ctx.lineJoin = 'round';
  ctx.lineWidth = size * outline;
  ctx.strokeStyle = C.ink;
  if (shadow) {
    ctx.fillStyle = shadow;
    ctx.strokeText(text, x + size * 0.05, y + size * 0.06);
    ctx.fillText(text, x + size * 0.05, y + size * 0.06);
  }
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  const w = ctx.measureText(text).width;
  ctx.restore();
  return w;
}

// ---------------------------------------------------------------- trailer 60 segments ("The Understudy")

const SEG = {};
const V = () => H > W;
const SQ = () => W === H;
const COL = { bolt: C.bolt, cream: C.cream, rose: C.rose, sky: C.sky };

/** A spotlight pool: darkens everything outside a soft circle at (cx, cy) of radius r. */
function spotlight(cx, cy, r, a = 0.82, soft = 0.25) {
  const g = ctx.createRadialGradient(cx, cy, r * (1 - soft), cx, cy, r);
  g.addColorStop(0, 'rgba(18,9,31,0)');
  g.addColorStop(1, `rgba(18,9,31,${a})`);
  ctx.save();
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.fill();
  ctx.restore();
}
function cone(cx, top, r, a = 0.18) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createLinearGradient(0, top, 0, H);
  g.addColorStop(0, `rgba(255,236,170,0)`);
  g.addColorStop(1, `rgba(255,236,170,${a})`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.18, top);
  ctx.lineTo(cx + r * 0.18, top);
  ctx.lineTo(cx + r, H);
  ctx.lineTo(cx - r, H);
  ctx.fill();
  ctx.restore();
}
/** A chip of type: ink box, coloured fill, text; returns its width. */
function chip(text, x, y, size, { fill = C.bolt, color = C.ink, font = 'RubikD', weight = 900, italic = true, align = 'left', pad = 0.42 } = {}) {
  ctx.save();
  ctx.font = `${weight} ${italic ? 'italic ' : ''}${size}px ${font}, sans-serif`;
  const w = ctx.measureText(text).width + size * pad * 2;
  const h = size * 1.32;
  const x0 = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
  ctx.fillStyle = C.ink;
  ctx.fillRect(x0 - size * 0.09, y - h / 2 - size * 0.09, w + size * 0.18, h + size * 0.18);
  ctx.fillStyle = fill;
  ctx.fillRect(x0, y - h / 2, w, h);
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText(text, x0 + w / 2, y + size * 0.05);
  ctx.restore();
  return w;
}
/** In/out envelope for an overlay item: 0 before `at`, punch-in over 5 frames, gone after `out` (2 frames). */
const env = (f, at, out) => (f < at || (out !== undefined && f > out) ? 0 : clamp((f - at) / 5));
const popScale = (f, at) => 1 + 0.35 * (1 - outCubic(clamp((f - at) / 6)));

/** S01: the frame freezes, a spotlight iris closes on him, STARRING: BRAVO. */
SEG.iris = (f, p) => {
  const t = outCubic(clamp(f / 10));
  const z = 1 + 0.04 * t;
  cover(img[p.still], z);
  const r = Math.hypot(W, H) * (0.75 - 0.5 * t);
  spotlight(W / 2, H / 2, Math.max(r, Math.min(W, H) * 0.24), 0.86, 0.18);
  halftone(C.night, 0.25 * t, 12 * S(), -0.6, 0.5);
  flash(f < 2 ? 0.35 : 0, C.bolt);
  const size = (V() ? 96 : 110) * S();
  slamWord(p.text, W / 2, V() ? H * 0.78 : H * 0.84, size, f - 2, { shadow: C.sky, per: 0.6, rise: 4 });
};

/** S02: two curtains (magenta, blue) close over the frozen hook frame; the logo PRESENTS, BRAVO, IN THE UNDERSTUDY. */
SEG.title = (f, p) => {
  cover(img[p.still], 1.04);
  spotlight(W / 2, H / 2, Math.min(W, H) * 0.24, 0.86, 0.18);
  const cur = img[V() ? 'curtainTall' : 'curtainWide'];
  const t = outCubic(clamp(f / 12));
  // each half of the painted curtain slides in from its side and meets at the bolt seam
  for (const side of [0, 1]) {
    ctx.save();
    ctx.beginPath();
    const off = (1 - t) * (W / 2) * (side ? 1 : -1);
    ctx.rect(side ? W / 2 + off : off, 0, W / 2, H);
    ctx.clip();
    ctx.translate(off, 0);
    cover(cur, 1);
    ctx.restore();
  }
  if (f >= 11 && f < 14) flash(0.3, C.bolt);
  const [sx, sy] = shake(f, f >= 11 && f < 17 ? 8 * S() : 0, 7);
  ctx.save();
  ctx.translate(sx, sy);
  ctx.fillStyle = 'rgba(18,9,31,0.35)';
  if (f >= 12) ctx.fillRect(0, 0, W, H);
  const L = img.logo;
  const lt = clamp((f - 12) / 6);
  const v = V();
  if (lt > 0) {
    const lw = (v ? W * 0.62 : W * 0.3) * (1.3 - 0.3 * outBack(lt, 2));
    const lh = (lw * L.height) / L.width;
    ctx.globalAlpha = clamp(lt * 3);
    ctx.drawImage(L, W / 2 - lw / 2, (v ? H * 0.2 : H * 0.15) - lh / 2, lw, lh);
    ctx.globalAlpha = 1;
    setLine('PRESENTS', W / 2, (v ? H * 0.2 : H * 0.15) + lh * 0.5 + 40 * S(), (v ? 60 : 54) * S(), { font: 'Fredoka', weight: 700, italic: false, shadow: C.plum, align: 'center', outline: 0.2 });
  }
  slamWord('BRAVO', W / 2, v ? H * 0.47 : H * 0.52, (v ? 210 : 230) * S(), f - 20, { shadow: C.sky, per: 1, rise: 4 });
  const it = clamp((f - 30) / 5);
  if (it > 0) {
    ctx.globalAlpha = it;
    setLine('IN', W / 2, v ? H * 0.585 : H * 0.665, (v ? 60 : 56) * S(), { font: 'Fredoka', weight: 700, italic: false, shadow: C.plum, align: 'center', outline: 0.2 });
    ctx.globalAlpha = 1;
  }
  slamWord('THE UNDERSTUDY', W / 2, v ? H * 0.67 : H * 0.78, (v ? 104 : 112) * S(), f - 34, { shadow: C.rose, color: C.bolt, per: 0.6, rise: 4 });
  ctx.restore();
  vignette(0.3);
};

/** Overlay items over gameplay (transparent): kinetic tags, the ROCKET scoreboard, the audition slate, zzz. */
const ITEM = {};
ITEM.tag = (f, it) => {
  const a = env(f, it.at, it.out);
  if (!a) return;
  ctx.save();
  ctx.globalAlpha = f > it.out - 3 ? clamp((it.out - f) / 3) : 1;
  slamWord(it.text, W / 2, H * it.y, it.size * Math.min(W, H) * (V() ? 1.25 : 1.6), f - it.at, { color: COL[it.color ?? 'cream'], shadow: it.color === 'bolt' ? C.plum : C.rose, per: 0.5, rise: 4 });
  ctx.restore();
};
/** A sports scoreboard chip, top right: ROCKET | 0, the sub line under it; `win` flips the digit with a burst. */
ITEM.counter = (f, it) => {
  const a = env(f, it.at, it.out);
  if (!a) return;
  const s = (V() ? 64 : 70) * S();
  const x = V() ? W * 0.5 : W * 0.95, y = V() ? H * 0.16 : H * 0.14;
  const k = popScale(f, it.at);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  ctx.translate(-x, -y);
  ctx.font = `900 italic ${s}px RubikD, sans-serif`;
  const wn = ctx.measureText(it.who).width + s * 0.84;
  const wd = s * 1.4;
  const tot = wn + wd;
  const x0 = V() ? x - tot / 2 : x - tot;
  chip(it.who, x0, y, s, { fill: C.sky, color: C.cream });
  const flip = it.win ? clamp((f - it.at - 8) / 6) : 1;
  const digit = it.win && flip < 0.5 ? '0' : it.score;
  ctx.save();
  ctx.translate(x0 + wn + wd / 2, y);
  ctx.scale(1, it.win ? Math.abs(Math.cos(flip * Math.PI)) * 0.85 + 0.15 : 1);
  chip(digit, -wd / 2, 0, s, { fill: it.win && flip >= 0.5 ? C.bolt : C.cream, color: C.ink, pad: 0.42 });
  ctx.restore();
  if (it.win && f - it.at >= 11) {
    const g = f - it.at - 11;
    ctx.save();
    const r = rng(9);
    for (let i = 0; i < 26; i++) {
      const ang = r() * 6.28, sp = (4 + r() * 10) * S();
      ctx.fillStyle = [C.bolt, C.rose, C.sky, C.cream][i % 4];
      ctx.globalAlpha = clamp(1 - g / 40);
      ctx.fillRect(x0 + wn + wd / 2 + Math.cos(ang) * sp * g, y + Math.sin(ang) * sp * g + 0.4 * g * g * S(), 9 * S(), 14 * S());
    }
    ctx.restore();
  }
  if (it.sub) {
    const st = clamp((f - it.at - 6) / 5);
    ctx.globalAlpha = st;
    setLine(it.sub, V() ? x : x - tot / 2, y + s * 1.25, s * 0.62, { font: 'Fredoka', weight: 700, italic: false, shadow: C.plum, align: 'center', outline: 0.2 });
  }
  ctx.restore();
};
/** The audition slate: a little clapperboard chip top left (ACT II: big, centred). */
ITEM.slate = (f, it) => {
  const a = env(f, it.at, it.out);
  if (!a) return;
  const fade = f > it.out - 4 ? clamp((it.out - f) / 4) : 1;
  ctx.save();
  ctx.globalAlpha = fade;
  if (it.big) {
    const s = (V() ? 150 : 170) * S();
    ctx.fillStyle = 'rgba(18,9,31,0.35)';
    ctx.fillRect(0, H * 0.5 - s * 0.75, W, s * 1.5);
    slamWord(it.text, W / 2, H / 2, s, f - it.at, { color: C.bolt, shadow: C.rose, per: 1, rise: 4 });
    ctx.restore();
    return;
  }
  const s = (V() ? 58 : 60) * S();
  const x = V() ? W * 0.06 : W * 0.045, y = V() ? H * 0.14 : H * 0.12;
  const k = popScale(f, it.at);
  ctx.translate(x, y);
  ctx.scale(k, k);
  ctx.rotate(-0.04);
  // the clapper stripes, snapping shut on frame 3
  const shut = clamp((f - it.at) / 3);
  ctx.font = `900 italic ${s}px RubikD, sans-serif`;
  const w = ctx.measureText(it.text).width + s * 0.9;
  ctx.save();
  ctx.translate(0, -s * 0.78);
  ctx.rotate(-0.35 * (1 - shut));
  ctx.fillStyle = C.ink;
  ctx.fillRect(-s * 0.06, -s * 0.36, w + s * 0.12, s * 0.42);
  for (let i = 0; i * s * 0.5 < w; i++) {
    ctx.fillStyle = i % 2 ? C.cream : C.ink;
    ctx.beginPath();
    ctx.moveTo(i * s * 0.5, -s * 0.3);
    ctx.lineTo(i * s * 0.5 + s * 0.3, -s * 0.3);
    ctx.lineTo(i * s * 0.5 + s * 0.15, 0);
    ctx.lineTo(i * s * 0.5 - s * 0.15, 0);
    ctx.fill();
  }
  ctx.restore();
  chip(it.text, 0, 0, s, { fill: C.ink, color: C.cream });
  ctx.restore();
};
ITEM.zzz = (f, it) => {
  if (f < it.at || f > it.out) return;
  const g = f - it.at;
  ctx.save();
  for (let i = 0; i < 3; i++) {
    const t = g - i * 6;
    if (t < 0) continue;
    const s = (52 + i * 22) * S();
    ctx.globalAlpha = clamp(t / 4);
    setLine('Z', W * 0.5 + (30 + i * 46 + Math.sin(t * 0.2) * 10) * S(), H * 0.44 - (i * 58 + t * 1.2) * S(), s, { color: C.cream, shadow: C.sky, align: 'center' });
  }
  ctx.restore();
};
SEG.multi = (f, p) => {
  for (const it of p.items) ITEM[it.mg](f, it);
};
SEG.tag = (f, p) => ITEM.tag(f, p);

/** A Gemini story panel, punched in (hides the panel's paper border), big type on it. */
SEG.panel = (f, p) => {
  const v = V();
  const im = img[`${p.img}${v ? 'Tall' : 'Wide'}`];
  const t = f / p.n;
  const [sx, sy] = shake(f, p.shake ? 7 * S() : f < 5 ? 10 * S() : 0, 11);
  cover(im, 1.1 + 0.05 * t, 0.5, 0.5, 0, 0, W, H, sx, sy);
  if (f < 2) flash(0.4, C.bolt);
  if (p.text) {
    const s = (v ? 190 : 210) * S();
    slamWord(p.text, W / 2 + sx, (p.img === 'eye' ? (v ? H * 0.86 : H * 0.84) : v ? H * 0.12 : H * 0.17) + sy, p.img === 'eye' ? s * 0.6 : s, f, { color: p.img === 'eye' ? C.cream : C.bolt, shadow: C.rose, per: 0.5, rise: 3 });
  }
  vignette(0.25);
};

/** S09 credit lower third: side bar, NAME as Role, the ultimate (and coat) small. */
SEG.credit = (f, p) => {
  const v = V() || SQ();
  const col = p.side === 'cat' ? C.rose : C.sky;
  const t = outCubic(clamp(f / 6));
  const out = clamp((f - (p.n - 6)) / 5);
  const s = (v ? 92 : 96) * S();
  const x = v ? W * 0.07 : W * 0.06, y = v ? H * 0.72 : H * 0.74;
  ctx.save();
  ctx.globalAlpha = 1 - out;
  ctx.translate((1 - t) * -W * 0.4, 0);
  // the bar
  ctx.fillStyle = C.ink;
  ctx.fillRect(0, y - s * 0.95, x + s * 0.22, s * 2.6);
  ctx.fillStyle = col;
  ctx.fillRect(0, y - s * 0.86, x + s * 0.12, s * 2.42);
  const nw = setLine(p.name, x + s * 0.4, y, s, { color: C.cream, shadow: col, align: 'left' });
  const as = `as ${p.as}`;
  const aw = clamp((f - 4) / 5);
  ctx.globalAlpha = (1 - out) * aw;
  setLine(as, x + s * 0.4 + (v ? 0 : nw + s * 0.35), v ? y + s * 0.95 : y + s * 0.08, s * (v ? 0.58 : 0.55), { font: 'Fredoka', weight: 700, italic: false, color: C.bolt, shadow: C.ink, align: 'left', outline: 0.22 });
  const small = p.coat ? `${p.ult}  ·  ${p.coat} coat` : p.ult;
  ctx.globalAlpha = (1 - out) * clamp((f - 8) / 5);
  setLine(small, x + s * 0.4, v ? y + s * 1.62 : y + s * 1.05, s * 0.5, { font: 'Fredoka', weight: 700, italic: false, color: C.cream, shadow: null, align: 'left', outline: 0.25 });
  ctx.restore();
};

/** S12 the coat name on every beat and a bolt-yellow puff on the swap (2 frames). */
SEG.coat = (f, p) => {
  const v = V();
  if (p.i > 0 && f < 3) {
    ctx.save();
    const a = f < 2 ? 0.75 : 0.3;
    const g = ctx.createRadialGradient(W / 2, H * 0.52, 0, W / 2, H * 0.52, Math.min(W, H) * 0.42);
    g.addColorStop(0, `rgba(255,210,31,${a})`);
    g.addColorStop(0.6, `rgba(255,236,170,${a * 0.6})`);
    g.addColorStop(1, 'rgba(255,210,31,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    const r = rng(40 + p.i);
    ctx.fillStyle = `rgba(255,243,227,${a})`;
    for (let i = 0; i < 14; i++) {
      const ang = r() * 6.28, d = (0.12 + r() * 0.2) * Math.min(W, H);
      ctx.beginPath();
      ctx.arc(W / 2 + Math.cos(ang) * d, H * 0.52 + Math.sin(ang) * d, (20 + r() * 40) * S(), 0, 7);
      ctx.fill();
    }
    ctx.restore();
  }
  const s = (v ? 80 : 84) * S();
  const k = popScale(f, 0);
  ctx.save();
  ctx.translate(W / 2, v ? H * 0.8 : H * 0.85);
  ctx.scale(k, k);
  chip(p.name, 0, 0, s, { fill: p.i === 3 ? C.bolt : C.cream, color: C.ink, align: 'center' });
  ctx.restore();
};

/** S13 the bush: the screen dims while Ranger hides; Meatball sits down in the same bush and the dim lifts. */
SEG.bush = (f, p) => {
  const v = V();
  const dim = f < p.dimA ? clamp((f - p.dimA + 4) / 4) : f < p.dimB ? 1 : 1 - clamp((f - p.dimB) / 4);
  if (dim > 0) {
    ctx.fillStyle = `rgba(18,9,31,${0.5 * dim})`;
    ctx.fillRect(0, 0, W, H);
    spotlight(W / 2, H / 2, Math.min(W, H) * 0.7, 0.35 * dim, 0.6);
  }
  const s = (v ? 70 : 76) * S();
  if (f >= p.dimA && f < p.dimB) slamWord('RANGER: TOTALLY INVISIBLE.', W / 2, v ? H * 0.82 : H * 0.86, v ? s * 0.8 : s, f - p.dimA, { color: C.cream, shadow: C.sky, per: 0.4, rise: 3 });
  if (f >= p.dimB + 4) slamWord('…NOT ANYMORE.', W / 2, v ? H * 0.82 : H * 0.86, s * 1.15, f - p.dimB - 4, { color: C.bolt, shadow: C.rose, per: 0.6, rise: 3 });
};

/** S18 the curtain call type and roses falling once the charm lands. */
SEG.bravo = (f, p) => {
  const v = V();
  const g = f - p.at;
  if (g < 0) return;
  const out = g > 170 ? clamp((g - 170) / 8) : 0;
  ctx.save();
  ctx.globalAlpha = 1 - out;
  const r = rng(77);
  for (let i = 0; i < 22; i++) {
    const x0 = r() * W, d = r() * 30, sp = (5 + r() * 5) * S(), rot = r() * 6.28;
    const t = g - d;
    if (t < 0) continue;
    const x = x0 + Math.sin(t * 0.08 + i) * 30 * S(), y = -60 * S() + t * sp;
    if (y > H + 80 * S()) continue;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot + t * 0.05);
    ctx.strokeStyle = '#2E9E4A';
    ctx.lineWidth = 7 * S();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, 70 * S());
    ctx.stroke();
    ctx.fillStyle = C.ink;
    ctx.beginPath();
    ctx.arc(0, 0, 25 * S(), 0, 7);
    ctx.fill();
    ctx.fillStyle = '#E8304A';
    ctx.beginPath();
    ctx.arc(0, 0, 21 * S(), 0, 7);
    ctx.fill();
    ctx.strokeStyle = '#8A1426';
    ctx.lineWidth = 3 * S();
    ctx.beginPath();
    ctx.arc(-3 * S(), -2 * S(), 11 * S(), 0.3, 5.2);
    ctx.stroke();
    ctx.restore();
  }
  const s = (v ? 210 : 240) * S();
  slamWord('BRAVO!', W / 2, v ? H * 0.2 : H * 0.22, s, g, { color: C.bolt, shadow: C.rose, per: 1, rise: 4 });
  ctx.restore();
};

/** S21 the cast line over the four lineups (continuous across them). */
SEG.cast = (f0, p) => {
  const f = f0 + p.i * 52;
  const v = V();
  const s = (v ? 78 : 92) * S();
  if (v) {
    slamWord('THE CAST OF', W / 2, H * 0.16, s, f - 4, { color: C.cream, shadow: C.plum, per: 0.5, rise: 4 });
    slamWord('PAW LEGENDS', W / 2, H * 0.16 + s * 1.15, s * 1.2, f - 10, { color: C.bolt, shadow: C.rose, per: 0.5, rise: 4 });
  } else slamWord('THE CAST OF PAW LEGENDS', W / 2, H * 0.13, s, f - 4, { color: C.bolt, shadow: C.rose, per: 0.4, rise: 4 });
  // a flash on each lineup cut
  if (p.i > 0 && f0 < 2) flash(0.2, C.bolt);
};

/** S23 the stinger's last frame: a spotlight freeze, the logo in the corner, Bravo will return. */
SEG.returns = (f, p) => {
  const v = V();
  cover(img[p.still], 1 + 0.03 * outCubic(clamp(f / 20)));
  const t = outCubic(clamp(f / 8));
  spotlight(W / 2, H / 2, Math.min(W, H) * (0.9 - 0.55 * t), 0.88, 0.2);
  if (f < 2) flash(0.3, C.bolt);
  const L = img.logo;
  const lw = v ? W * 0.42 : W * 0.17;
  ctx.globalAlpha = clamp((f - 4) / 6);
  ctx.drawImage(L, v ? W / 2 - lw / 2 : W - lw - W * 0.03, v ? H * 0.06 : H * 0.05, lw, (lw * L.height) / L.width);
  ctx.globalAlpha = clamp((f - 8) / 8);
  setLine('Bravo will return.', W / 2, v ? H * 0.8 : H * 0.85, (v ? 80 : 84) * S(), { font: 'Fredoka', weight: 700, italic: false, color: C.cream, shadow: C.plum, align: 'center', outline: 0.18 });
  ctx.globalAlpha = 1;
  if (f >= p.n - 8) flash(((f - (p.n - 8)) / 8) * 0.9, C.night);
};
SEG.end = (f, p) => {
  const v = H > W, sq = W === H;
  ctx.fillStyle = C.night;
  ctx.fillRect(0, 0, W, H);
  // a slow diagonal drift of the roster cards, dim, behind everything
  if (p.cats) {
    ctx.save();
    ctx.globalAlpha = 0.1;
    const ch = (v ? H * 0.13 : H * 0.26), step = ch * 0.85;
    const all = [];
    for (let i = 0; i < Math.max(p.cats.length, p.dogs.length); i++) all.push(['cat', p.cats[i % p.cats.length]], ['dog', p.dogs[i % p.dogs.length]]);
    const rows = Math.ceil(H / ch) + 2;
    for (let r = -1; r < rows; r++) {
      const dir = r % 2 ? 1 : -1;
      const off = ((f * 1.6 * S() * dir) % step + step) % step;
      for (let k = -2; k < W / step + 2; k++) {
        const [side, h] = all[((k + r * 5) % all.length + all.length) % all.length];
        const im = img[`l_${h}`];
        if (im) card(im, k * step + off, r * ch * 1.08, ch, side, { skew: 0, glow: 0 });
      }
    }
    ctx.restore();
  }
  ctx.fillStyle = 'rgba(18,9,31,0.62)';
  ctx.fillRect(0, 0, W, H);
  for (const [x, col] of [[0, '255,61,154'], [W, '46,139,255']]) {
    const g = ctx.createRadialGradient(x, H * 0.5, 0, x, H * 0.5, Math.max(W, H) * 0.6);
    g.addColorStop(0, `rgba(${col},${0.34 + 0.06 * Math.sin(f * 0.08)})`);
    g.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  embers(f, 50, 61, [C.bolt, C.cream, C.rose, C.sky], 0.55, 1.2, 0.9);
  // the strike: a full-height bolt is there on frame 0 and the logo lands on it (round 2 opened on 4 dim frames with a
  // small bolt squiggle); it settles to a glowing seam behind the logo
  const bolt = boltPts(W * 0.57, -0.03 * H, W * 0.43, H * 1.03, 8, 0.07, 21);
  const bk = 1 - clamp((f - 4) / 14);
  strokeBolt(bolt, (30 + 30 * bk) * S(), C.ink, 0, 0.9);
  strokeBolt(bolt, (12 + 22 * bk) * S(), C.bolt, (30 + 50 * bk) * S(), 0.55 + 0.45 * bk);
  strokeBolt(bolt, (4 + 8 * bk) * S(), '#fff', 0, 0.5 + 0.5 * bk);
  const cy = v ? H * 0.34 : sq ? H * 0.3 : H * 0.33;
  const lt = clamp((f - 1) / 9);
  let lh = 0;
  if (lt > 0) {
    const L = img.logo;
    const lw = (v ? W * 0.86 : sq ? W * 0.66 : W * 0.5) * (lt < 1 ? 1.5 - 0.5 * outBack(lt, 2.4) : 1 + 0.03 * ((f - 14) / 154) + 0.008 * Math.sin((f - 14) * 0.08));
    lh = (lw * L.height) / L.width;
    const [sx, sy] = shake(f, f >= 13 && f < 20 ? 9 * S() : 0, 3);
    ctx.save();
    ctx.globalAlpha = clamp(lt * 4);
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 30 * S();
    ctx.drawImage(L, W / 2 - lw / 2 + sx, cy - lh / 2 + sy, lw, lh);
    ctx.restore();
    // a shine sweeping across the logo once
    const sw = clamp((f - 34) / 18);
    if (sw > 0 && sw < 1) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.35 * Math.sin(sw * Math.PI);
      const gx = W / 2 - lw / 2 + sw * lw * 1.3 - lw * 0.15;
      const g = ctx.createLinearGradient(gx - lw * 0.08, 0, gx + lw * 0.08, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.5, 'rgba(255,255,255,1)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.rect(W / 2 - lw / 2, cy - lh / 2, lw, lh);
      ctx.fill();
      ctx.restore();
    }
  }
  // the line: CATS VS DOGS. PICK A SIDE.
  const ts = (v ? 76 : sq ? 68 : 84) * S();
  const ly = v ? H * 0.53 : sq ? H * 0.55 : H * 0.63;
  if (v || sq) {
    slamWord('CATS VS DOGS.', W / 2, ly, ts, f - 24, { shadow: C.rose, per: 1, rise: 5 });
    slamWord('PICK A SIDE.', W / 2, ly + ts * 1.2, ts, f - 32, { shadow: C.sky, per: 1, rise: 5 });
  } else slamWord('CATS VS DOGS. PICK A SIDE.', W / 2, ly, ts, f - 24, { shadow: C.rose, per: 1, rise: 5 });
  // the call to action (f60): PLAY FREE IN YOUR BROWSER + pawlegends.app, inside the safe area
  const ct = outCubic(clamp((f - 44) / 10));
  if (ct > 0) {
    const fs = (v ? 62 : sq ? 50 : 62) * S();
    ctx.save();
    ctx.font = `700 ${fs}px Fredoka, sans-serif`;
    const a = 'PLAY FREE', b = 'pawlegends.app';
    const wa = ctx.measureText(a).width + fs * 1.0;
    ctx.font = `700 ${fs * 1.4}px Fredoka, sans-serif`;
    const wb = ctx.measureText(b).width + fs * 1.3;
    const bh = fs * 1.85;
    const y0 = (v ? H * 0.71 : sq ? H * 0.75 : H * 0.8) + (1 - ct) * H * 0.12;
    ctx.globalAlpha = ct;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    const pulse = 1 + 0.02 * Math.sin(Math.max(0, f - 54) * 0.18);
    if (v || sq) {
      // stacked: the chip, then the address on its own bar
      const wmax = Math.max(wa, wb);
      ctx.translate(W / 2, y0);
      ctx.scale(pulse, pulse);
      ctx.fillStyle = C.ink;
      ctx.fillRect(-wmax / 2 - 6 * S(), -6 * S(), wmax + 12 * S(), bh * 2.15 + 12 * S());
      ctx.fillStyle = C.bolt;
      ctx.fillRect(-wa / 2, 0, wa, bh);
      ctx.fillStyle = C.cream;
      ctx.fillRect(-wb / 2, bh * 1.15, wb, bh);
      ctx.fillStyle = C.ink;
      ctx.font = `700 ${fs}px Fredoka, sans-serif`;
      ctx.fillText(a, 0, bh / 2 + fs * 0.04);
      ctx.fillStyle = C.plum;
      ctx.font = `700 ${fs * 1.4}px Fredoka, sans-serif`;
      ctx.fillText(b, 0, bh * 1.65 + fs * 0.04);
    } else {
      const tot = wa + wb;
      ctx.translate(W / 2, y0 + bh / 2);
      ctx.scale(pulse, pulse);
      ctx.translate(-tot / 2, -bh / 2);
      ctx.fillStyle = C.ink;
      ctx.fillRect(-6 * S(), -6 * S(), tot + 12 * S(), bh + 12 * S());
      ctx.fillStyle = C.bolt;
      ctx.fillRect(0, 0, wa, bh);
      ctx.fillStyle = C.cream;
      ctx.fillRect(wa, 0, wb, bh);
      ctx.fillStyle = C.ink;
      ctx.font = `700 ${fs}px Fredoka, sans-serif`;
      ctx.fillText(a, wa / 2, bh / 2 + fs * 0.04);
      ctx.fillStyle = C.plum;
      ctx.font = `700 ${fs * 1.4}px Fredoka, sans-serif`;
      ctx.fillText(b, wa + wb / 2, bh / 2 + fs * 0.04);
    }
    ctx.restore();
  }
  vignette(0.35);
  // the ring-out: the last 10 frames dip a touch (the audio fades with it)
  if (f >= p.n - 10) flash(0.25 * ((f - (p.n - 10)) / 10), C.night);
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
  /** Overlay segments are drawn on a transparent page. */
  transparent(on) {
    document.documentElement.style.background = on ? 'transparent' : '#12091F';
    document.body.style.background = on ? 'transparent' : '#12091F';
  },
  /** Glyph check: every character of `text` is in the display face (not a fallback). */
  glyphs(text) {
    const miss = [];
    for (const ch of new Set(text.replace(/\s/g, ''))) {
      ctx.font = '900 italic 100px RubikD, monospace';
      const a = ctx.measureText(ch).width;
      ctx.font = '900 italic 100px RubikD, serif';
      if (a !== ctx.measureText(ch).width) miss.push(ch);
    }
    return miss;
  },
  draw(seg, f, p) {
    ctx.save();
    ctx.clearRect(0, 0, W, H);
    SEG[seg](f, p ?? {});
    ctx.restore();
    return true;
  },
};

