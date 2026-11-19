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
function slamWord(word, x, y, size, f, { color = C.cream, shadow = C.rose, per = 2, align = 'center', skew = -0.12, out = null, rise = 7 } = {}) {
  ctx.save();
  ctx.font = `900 italic ${size}px RubikD, Rubik, sans-serif`;
  ctx.textBaseline = 'middle';
  const widths = [...word].map((ch) => ctx.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + (word.length - 1) * size * 0.02;
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
    const s = t < 1 ? 2.2 - 1.2 * outBack(t, 2.2) : 1;
    const a = clamp(t * 3) * (1 - outT);
    const lx = cx + widths[i] / 2;
    ctx.save();
    ctx.translate(lx, y + (1 - outCubic(t)) * -size * 0.25 - outT * size * 0.6);
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

/** The two halves of a frame split along a polyline (16:9: top to bottom, left / right; 9:16: left to right, top / bottom). */
function halfPath(bolt, sideSign, v, dx = 0, dy = 0) {
  ctx.beginPath();
  if (!v) {
    ctx.moveTo((sideSign < 0 ? -W : 2 * W) + dx, -H + dy);
    ctx.lineTo(bolt[0][0] + dx, -H + dy);
    bolt.forEach(([x, y]) => ctx.lineTo(x + dx, y + dy));
    ctx.lineTo(bolt[bolt.length - 1][0] + dx, 2 * H + dy);
    ctx.lineTo((sideSign < 0 ? -W : 2 * W) + dx, 2 * H + dy);
  } else {
    ctx.moveTo(-W + dx, (sideSign < 0 ? -H : 2 * H) + dy);
    ctx.lineTo(-W + dx, bolt[0][1] + dy);
    bolt.forEach(([x, y]) => ctx.lineTo(x + dx, y + dy));
    ctx.lineTo(2 * W + dx, bolt[bolt.length - 1][1] + dy);
    ctx.lineTo(2 * W + dx, (sideSign < 0 ? -H : 2 * H) + dy);
  }
  ctx.closePath();
}

/**
 * The tear (48 frames): the gameplay frame rips along the bolt and both halves fly apart (each half carries its own
 * torn edge, so no rectangle of the old frame is ever left on the art), revealing Lambo vs Sir Brutus. CATS lands at
 * f2 and is set by f9; DOGS lands at f12 and is set by f19; both hold to the cut.
 */
SEG.vs = (f, p) => {
  const v = H > W;
  const stack = H >= W;
  const art = img[v ? 'vsTall' : 'vsWide'];
  const z = 1.02 + f * 0.0028;
  const [sx, sy] = shake(f, f < 6 ? 12 * S() : f >= 12 && f < 16 ? 9 * S() : 1.5 * S(), 5);
  ctx.fillStyle = C.night;
  ctx.fillRect(0, 0, W, H);
  cover(art, z * (1.04 + (f < 8 ? 0.06 * (1 - f / 8) : 0)), 0.5, 0.5, 0, 0, W, H, sx, sy);
  const bolt = v ? boltPts(-0.05 * W, 0.56 * H, 1.05 * W, 0.44 * H, 7, 0.06, 9) : boltPts(0.62 * W, -0.05 * H, 0.38 * W, 1.05 * H, 7, 0.07, 9);
  const t = clamp(f / 7);
  if (t < 1) {
    const e = t * t * (3 - 2 * t);
    const off = e * Math.max(W, H) * 0.9;
    for (const sideSign of [-1, 1]) {
      const dx = v ? sideSign * off * 0.12 : sideSign * off;
      const dy = v ? sideSign * off : sideSign * off * -0.18;
      // the half (its torn edge, its frame edges and the picture) moves and turns as one piece of paper
      ctx.save();
      ctx.translate(dx + W / 2, dy + H / 2);
      ctx.rotate(sideSign * e * 0.08);
      ctx.translate(-W / 2, -H / 2);
      ctx.save();
      halfPath(bolt, sideSign, v);
      ctx.clip();
      cover(img[p.still]);
      ctx.restore();
      strokeBolt(bolt, 14 * S(), C.cream, 0, 1 - t * 0.6);
      ctx.restore();
    }
    strokeBolt(bolt, 70 * S() * (1 - t), '#fff', 70, 1 - t);
  }
  strokeBolt(bolt, 12 * S(), C.bolt, 40 * S(), f < 10 ? 0.95 : 0.45 + 0.25 * Math.sin(f * 1.3));
  flash(f < 3 ? 0.85 - f * 0.28 : f === 12 ? 0.3 : 0);
  vignette(0.38);
  const sz = (stack ? 200 : 220) * S();
  const o = { per: 1, rise: 6 };
  if (!stack) {
    slamWord('CATS', W * 0.21, H * 0.8, sz, f - 2, { shadow: C.rose, ...o });
    slamWord('DOGS', W * 0.79, H * 0.8, sz, f - 12, { shadow: C.sky, ...o });
  } else {
    slamWord('CATS', W * 0.5, H * (v ? 0.14 : 0.15), sz, f - 2, { shadow: C.rose, ...o });
    slamWord('DOGS', W * 0.5, H * (v ? 0.87 : 0.86), sz, f - 12, { shadow: C.sky, ...o });
  }
};

/** Floating embers / dust: n particles drifting up, deterministic. */
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

/** War room: the cats' castle and the dogs' fort slide in along the bolt and keep drifting; PICK A SIDE. */
SEG.war = (f, p) => {
  const v = H >= W;
  ctx.fillStyle = C.night;
  ctx.fillRect(0, 0, W, H);
  const t = outCubic(clamp(f / 10));
  const z = 1.04 + f * 0.0018;
  const bolt = v ? boltPts(-0.05 * W, 0.53 * H, 1.05 * W, 0.47 * H, 6, 0.05, 4) : boltPts(0.56 * W, -0.05 * H, 0.44 * W, 1.05 * H, 6, 0.06, 4);
  for (const [k, sideSign] of [['warCats', -1], ['warDogs', 1]]) {
    ctx.save();
    halfPath(bolt, sideSign, v);
    ctx.clip();
    const off = (1 - t) * (v ? H * 0.6 : W * 0.6) * sideSign;
    // after landing both panels keep sliding apart along the bolt (parallax against the type)
    const drift = sideSign * (v ? H : W) * 0.03 * (f / 72);
    const dx = v ? 0 : off + drift;
    const dy = v ? off + drift : 0;
    if (!v) cover(img[k], z, sideSign < 0 ? 0.42 : 0.5, 0.45, sideSign < 0 ? 0 : W * 0.42, 0, W * 0.58, H, dx, dy);
    else cover(img[k], z, 0.5, 0.5, 0, sideSign < 0 ? 0 : H * 0.47, W, H * 0.53, dx, dy);
    ctx.restore();
  }
  embers(f, 40, 91, [C.bolt, C.cream, C.rose], 0.55, 1.2, 0.8);
  strokeBolt(bolt, 26 * S(), C.ink, 0, 1);
  strokeBolt(bolt, 12 * S(), C.bolt, 30 * S(), 0.75 + 0.25 * Math.sin(f * 0.9));
  vignette(0.42);
  flash(f < 3 ? 0.35 - f * 0.12 : 0);
  const sz = (v ? 150 : 150) * S();
  ctx.save();
  const pt = outCubic(clamp((f - 10) / 6));
  if (pt > 0) {
    ctx.fillStyle = 'rgba(18,9,31,0.84)';
    const pw = (v ? W * 0.94 : W * 0.6) * pt, ph = sz * 1.25;
    const py = v ? H * 0.5 : H * 0.84;
    ctx.translate(W / 2, py);
    ctx.transform(1, 0, -0.2, 1, 0, 0);
    ctx.fillRect(-pw / 2, -ph / 2, pw, ph);
  }
  ctx.restore();
  slamWord('PICK A SIDE.', W / 2, v ? H * 0.5 : H * 0.84, sz * (v ? 0.86 : 1), f - 12, { shadow: C.bolt, per: 1, rise: 6 });
};

/** NOT OUT.: Clem's eyes narrow, a bolt in each. */
SEG.eyes = (f, p) => {
  ctx.fillStyle = C.night;
  ctx.fillRect(0, 0, W, H);
  const v = H >= W;
  const im = img.eyes;
  const sh = im.height * 0.7, sy0 = im.height * 0.15;
  const bandH = v ? W * 0.62 : H * 0.62;
  const z = 1 + f * 0.0045 + (f < 4 ? 0.08 * (1 - f / 4) : 0);
  const bw = Math.max(W, (bandH * im.width) / sh) * z;
  const bh = (bw * sh) / im.width;
  const cy = v ? H * 0.42 : H * 0.44;
  const [sx, sy] = shake(f, f < 6 ? 8 * S() : 1.5 * S(), 7);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, cy - bandH / 2, W, bandH);
  ctx.clip();
  ctx.drawImage(im, 0, sy0, im.width, sh, W / 2 - bw / 2 + sx, cy - bh / 2 + sy, bw, bh);
  // the bolts in her eyes flare on the strike
  if (f >= 6 && f < 14) {
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.18 * (1 - (f - 6) / 8);
    ctx.fillStyle = C.bolt;
    ctx.fillRect(0, cy - bandH / 2, W, bandH);
  }
  ctx.restore();
  ctx.fillStyle = C.rose;
  ctx.fillRect(0, cy - bandH / 2 - 6 * S(), W, 6 * S());
  ctx.fillStyle = C.sky;
  ctx.fillRect(0, cy + bandH / 2, W, 6 * S());
  speedLines(W / 2, cy, 50, 31 + (f >> 2), 0.2 * clamp(1 - f / 30), C.cream, 0.4);
  embers(f, 24, 33, [C.bolt, C.rose], 0.5, 1.5, 0.7);
  flash(f < 3 ? 0.7 - f * 0.25 : 0);
  slamWord('NOT OUT.', W / 2, v ? H * 0.78 : H * 0.87, (v ? 150 : 140) * S(), f - 6, { shadow: C.rose, per: 1, rise: 6 });
};

/** The last gameplay frame flashes into painted key art of Clem; rays, embers and a push carry it to the burst. */
SEG.keyart = (f, p) => {
  const k = clamp((f - 4) / 8);
  cover(img[p.still], 1 + f * 0.004);
  if (k > 0) {
    ctx.save();
    ctx.globalAlpha = ease(k);
    cover(img.keyClem, 1.16 - 0.1 * ease(clamp(f / p.n)), 0.35, 0.5, 0, 0, W, H, -W * 0.02 * (f / p.n), 0);
    ctx.restore();
  }
  const ra = clamp((f - 6) / 8);
  if (ra > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.translate(W * 0.36, H * 0.42);
    ctx.rotate(f * 0.012);
    for (let i = 0; i < 18; i++) {
      ctx.rotate((Math.PI * 2) / 18);
      const g = ctx.createLinearGradient(0, 0, Math.hypot(W, H), 0);
      g.addColorStop(0, `rgba(255,210,31,${0.3 * ra})`);
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
  embers(f, 50, 57, [C.bolt, '#ffb347', C.cream], 0.7, 2.2, 0.9);
  flash(f >= 4 && f < 10 ? 0.6 * (1 - (f - 4) / 6) : 0, '#fff6d8');
  // the silence hole: the frame dims over its last 4 frames
  if (f >= p.n - 4) flash(0.35 * ((f - (p.n - 4) + 1) / 4), C.night);
  vignette(0.35);
};

/** A splash card: the in-game painted art in a skewed frame, team border and glow. (x, y) = card centre. */
function card(im, x, y, h, side, { skew = -0.08, alpha = 1, glow = 1, rot = 0 } = {}) {
  const w = (h * 2) / 3;
  const col = side === 'cat' ? C.rose : C.sky;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.transform(1, 0, skew, 1, 0, 0);
  const bw = Math.max(4, h * 0.03);
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
  ctx.drawImage(im, -(im.width * s) / 2, -(im.height * s) / 2, im.width * s, im.height * s);
  ctx.restore();
}

/** One line of type with an ink outline and a coloured offset shadow (no animation). */
function setLine(text, x, y, size, { font = 'RubikD', weight = 900, italic = true, color = C.cream, shadow = C.rose, align = 'left', outline = 0.16 } = {}) {
  ctx.save();
  ctx.font = `${weight} ${italic ? 'italic ' : ''}${size}px ${font}, sans-serif`;
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
function textW(text, size, font = 'RubikD', weight = 900, italic = true) {
  ctx.save();
  ctx.font = `${weight} ${italic ? 'italic ' : ''}${size}px ${font}, sans-serif`;
  const w = ctx.measureText(text).width;
  ctx.restore();
  return w;
}

/**
 * Overlay (transparent): the champion card of a montage shot. The splash card slides in from its team's side, the
 * name slams beside it and the ultimate's name sits under it in a bolt-yellow tag; all out by the cut.
 * p: { hero (splash key), name, ult, side }
 */
SEG.name = (f, p) => {
  const cat = p.side === 'cat';
  const v = H > W, sq = W === H;
  const im = img[`s_${p.hero}`];
  const inT = outBack(clamp(f / 8), 1.6);
  const outT = clamp((f - (p.n - 7)) / 6);
  const dir = cat ? -1 : 1;
  const slide = (1 - inT) * W * 0.5 * dir + outT * outT * W * 0.6 * dir;
  const ch = v ? H * 0.2 : sq ? H * 0.34 : H * 0.42;
  const cw = (ch * 2) / 3;
  const m = v ? W * 0.07 : W * 0.035;
  const cy = v ? H * 0.72 : H - ch / 2 - (sq ? H * 0.06 : H * 0.05);
  const cx = cat ? m + cw / 2 : W - m - cw / 2;
  // a team-coloured skewed band behind the type
  // the name shrinks to fit beside the card inside the safe area (MARSHMALLOW in 9:16)
  const ns0 = (v ? 104 : sq ? 96 : 132) * S();
  const room = W - cw - m * 2 - ns0 * 1.2;
  const ns = Math.min(ns0, (ns0 * room) / Math.max(1, textW(p.name.toUpperCase(), ns0)));
  const us = Math.min(ns0 * 0.42, ns * 0.5);
  const nameW = textW(p.name.toUpperCase(), ns);
  ctx.save();
  ctx.translate(slide * 1.15, 0);
  const bandH = ns * 1.9;
  const by = cy + ch * 0.12;
  const bx0 = cat ? cx : cx - (nameW + ns * 1.6 + cw / 2);
  const bw = nameW + ns * 1.6 + cw / 2;
  ctx.globalAlpha = 0.88;
  ctx.fillStyle = C.ink;
  ctx.save();
  ctx.translate(bx0 + bw / 2, by);
  ctx.transform(1, 0, -0.22, 1, 0, 0);
  ctx.fillRect(-bw / 2, -bandH / 2, bw, bandH);
  ctx.globalAlpha = 1;
  ctx.fillStyle = cat ? C.rose : C.sky;
  ctx.fillRect(-bw / 2, bandH / 2 - 8 * S(), bw, 8 * S());
  ctx.restore();
  ctx.globalAlpha = 1;
  const tx = cat ? cx + cw / 2 + ns * 0.45 : cx - cw / 2 - ns * 0.45;
  setLine(p.name.toUpperCase(), tx, by - ns * 0.28, ns, { shadow: cat ? C.rose : C.sky, align: cat ? 'left' : 'right' });
  // the ultimate's tag
  const tag = p.ult.toUpperCase();
  ctx.font = `700 ${us}px Fredoka, sans-serif`;
  const tw = ctx.measureText(tag).width + us * 1.2;
  const tagX = cat ? tx : tx - tw;
  const tagY = by + ns * 0.52;
  ctx.fillStyle = C.bolt;
  ctx.save();
  ctx.translate(tagX + tw / 2, tagY);
  ctx.transform(1, 0, -0.2, 1, 0, 0);
  ctx.fillRect(-tw / 2, -us * 0.75, tw, us * 1.5);
  ctx.restore();
  ctx.fillStyle = C.ink;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText(tag, tagX + tw / 2, tagY + us * 0.05);
  ctx.restore();
  // the card on top of the band's end
  card(im, cx + slide, cy, ch, p.side, { skew: cat ? -0.08 : 0.08, rot: (1 - inT) * 0.2 * dir });
};

/** Overlay: a mission line on a skewed ink plate (TOPPLE THEIR TOWERS. / TAKE THEIR CORE.). p: { text, color } */
SEG.caption = (f, p) => {
  const v = H > W;
  const size = (v ? 96 : W === H ? 84 : 104) * S();
  const y = v ? H * 0.8 : H * 0.85;
  const inT = outCubic(clamp((f - 2) / 6));
  const outT = clamp((f - (p.n - 6)) / 5);
  if (inT <= 0) return;
  const words = p.text;
  const tw = textW(words, size) * (v ? 1 : 1);
  const pw = Math.min(W * 0.96, tw + size * 1.4) * inT;
  ctx.save();
  ctx.globalAlpha = 1 - outT;
  ctx.translate(W / 2 + outT * W * 0.3, y);
  ctx.transform(1, 0, -0.2, 1, 0, 0);
  ctx.fillStyle = 'rgba(18,9,31,0.86)';
  ctx.fillRect(-pw / 2, -size * 0.72, pw, size * 1.44);
  ctx.fillStyle = p.color ?? C.bolt;
  ctx.fillRect(-pw / 2, size * 0.72 - 7 * S(), pw, 7 * S());
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = 1 - outT;
  ctx.translate(outT * W * 0.3, 0);
  const fitted = Math.min(size, (W * 0.9 * size) / (tw + 1));
  slamWord(words, W / 2, y, fitted, f - 4, { shadow: p.color ?? C.bolt, per: 1, rise: 5 });
  ctx.restore();
};

/** Overlay: the core burst. A flash, a bolt-yellow shockwave, gold rays, VICTORY! slammed in, confetti raining. */
SEG.victory = (f, p) => {
  const v = H > W;
  const cx = W / 2, cy = v ? H * 0.46 : H * 0.5;
  if (f < 3) flash(0.9 - f * 0.3);
  // shockwave rings
  for (const [d, col, wd] of [[0, C.bolt, 26], [4, C.cream, 12], [8, C.rose, 10]]) {
    const t = clamp((f - d) / 22);
    if (t <= 0 || t >= 1) continue;
    ctx.save();
    ctx.globalAlpha = (1 - t) * 0.9;
    ctx.strokeStyle = col;
    ctx.lineWidth = wd * S() * (1 - t * 0.6);
    ctx.shadowColor = col;
    ctx.shadowBlur = 24 * S();
    ctx.beginPath();
    ctx.ellipse(cx, cy, outCubic(t) * W * 0.75, outCubic(t) * W * 0.75 * 0.6, 0, 0, 7);
    ctx.stroke();
    ctx.restore();
  }
  // rays behind the word
  const ty = v ? H * 0.24 : H * 0.22;
  const ra = clamp((f - 4) / 8) * (1 - clamp((f - 110) / 20));
  if (ra > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.translate(W / 2, ty);
    ctx.rotate(f * 0.01);
    const R = Math.max(W, H) * 0.7;
    for (let i = 0; i < 16; i++) {
      ctx.rotate((Math.PI * 2) / 16);
      const g = ctx.createLinearGradient(0, 0, R, 0);
      g.addColorStop(0, `rgba(255,210,31,${0.4 * ra})`);
      g.addColorStop(1, 'rgba(255,210,31,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(R, -50 * S());
      ctx.lineTo(R, 50 * S());
      ctx.fill();
    }
    ctx.restore();
  }
  // confetti: a burst from the core, then a rain
  const r = rng(404);
  for (let i = 0; i < 220; i++) {
    const a = r() * Math.PI * 2, sp = 0.6 + r() * 1.4, spin = r() * 6, col = [C.rose, C.bolt, C.cream, C.sky, C.rose][i % 5];
    const t = Math.max(0, f - 2 - (i % 6)) / 60;
    if (f - 2 - (i % 6) < 0) continue;
    const x = cx + Math.cos(a) * sp * W * 0.42 * (1 - Math.exp(-t * 4)) + Math.sin(t * 5 + i) * 12 * S();
    const y = cy + Math.sin(a) * sp * H * 0.42 * (1 - Math.exp(-t * 4)) + t * t * H * 0.55;
    if (y > H + 20) continue;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(t * 8 * spin);
    ctx.scale(1, Math.cos(t * 10 + i));
    ctx.fillStyle = col;
    ctx.fillRect(-7 * S(), -3.5 * S(), 14 * S(), 7 * S());
    ctx.restore();
  }
  const size = (v ? 175 : W === H ? 170 : 210) * S();
  const outT = clamp((f - 120) / 10);
  ctx.save();
  ctx.globalAlpha = 1 - outT;
  slamWord('VICTORY!', W / 2, ty, size, f - 3, { shadow: C.rose, color: C.bolt, per: 1, rise: 6 });
  ctx.restore();
};

/**
 * Glory: both rosters as painted splash cards on two conveyors meeting at the bolt (cats rise on the left, dogs fall
 * on the right) over the night stadium; TEAM CAT and TEAM DOG over each side. Nothing stands still.
 */
SEG.glory = (f, p) => {
  const v = H > W, sq = W === H;
  const t = f / Math.max(1, p.n - 1);
  ctx.fillStyle = C.night;
  ctx.fillRect(0, 0, W, H);
  cover(img[v ? 'stadiumTall' : 'stadium'], 1.08 + 0.1 * t, 0.5, 0.45, 0, 0, W, H, 0, -H * 0.02 * t);
  ctx.fillStyle = 'rgba(18,9,31,0.42)';
  ctx.fillRect(0, 0, W, H);
  const enter = outCubic(clamp(f / 16));
  const cols = 2;
  const ch = v ? H * 0.2 : sq ? H * 0.36 : H * 0.46;
  const cw = (ch * 2) / 3;
  const gap = ch * 0.16;
  const step = ch + gap;
  const half = W * 0.5 - (v ? W * 0.03 : W * 0.04);
  const colW = half / cols;
  for (const [list, side, sign] of [[p.cats, 'cat', -1], [p.dogs, 'dog', 1]]) {
    ctx.save();
    // each half leans away from the bolt and is clipped to its side
    ctx.beginPath();
    ctx.rect(sign < 0 ? 0 : W / 2 + W * 0.012, 0, W / 2 - W * 0.012, H);
    ctx.clip();
    for (let c = 0; c < cols; c++) {
      const x = sign < 0 ? W / 2 - W * 0.03 - colW * (c + 0.5) : W / 2 + W * 0.03 + colW * (c + 0.5);
      const speed = (side === 'cat' ? -1 : 1) * (2.2 + c * 0.6) * S() * (v ? 1.3 : 1);
      const off = (f * speed + c * step * 0.5) % step;
      const n = Math.ceil(H / step) + 2;
      for (let k = -1; k < n; k++) {
        const idx = (((k + c * 3 + Math.floor((f * speed + c * step * 0.5) / step) * (side === 'cat' ? 1 : -1)) % list.length) + list.length * 4) % list.length;
        const im = img[`s_${list[idx]}`];
        if (!im) continue;
        const y = k * step + off + (1 - enter) * H * (sign < 0 ? 1 : -1) * (1 + c * 0.2);
        card(im, x + (1 - enter) * sign * W * 0.2, y, ch, side, { skew: sign * 0.06, glow: 0.7 });
      }
    }
    ctx.restore();
  }
  // the bolt down the middle
  const bolt = boltPts(W * 0.5, -0.05 * H, W * 0.5, H * 1.05, 8, 0.03, 12 + (f >> 3));
  strokeBolt(bolt, 46 * S(), C.ink, 0, 1);
  strokeBolt(bolt, 22 * S(), C.bolt, 60 * S(), 0.85 + 0.15 * Math.sin(f * 0.6));
  strokeBolt(bolt, 6 * S(), '#fff', 0, 0.9);
  embers(f, 60, 21, [C.bolt, C.cream, C.rose, C.sky], 0.7, 1.6, 1);
  vignette(0.5);
  // team headers
  const hs = (v ? 74 : sq ? 70 : 92) * S();
  const ht = clamp((f - 8) / 8);
  if (ht > 0) {
    const y = v ? H * 0.065 : H * 0.1;
    for (const [txt, x, sh, al] of [['TEAM CAT', v ? W * 0.25 : W * 0.25, C.rose, 'center'], ['TEAM DOG', v ? W * 0.75 : W * 0.75, C.sky, 'center']]) {
      ctx.save();
      ctx.globalAlpha = ht;
      const pw = textW(txt, hs) + hs * 0.9;
      ctx.translate(x, y);
      ctx.save();
      ctx.transform(1, 0, -0.2, 1, 0, 0);
      ctx.fillStyle = 'rgba(18,9,31,0.86)';
      ctx.fillRect(-pw / 2, -hs * 0.68, pw, hs * 1.36);
      ctx.fillStyle = sh;
      ctx.fillRect(-pw / 2, hs * 0.68 - 6 * S(), pw, 6 * S());
      ctx.restore();
      setLine(txt, 0, 0, hs, { shadow: sh, align: al });
      ctx.restore();
    }
  }
  flash(f < 3 ? 0.5 - f * 0.16 : 0);
  // the bolt flares white into the end card's strike
  if (f >= p.n - 6) flash(0.15 * (f - (p.n - 6)), '#fff6d8');
};

/** End card: the bolt strikes, the logo slams, the line and the call to action land; the roster keeps drifting behind. */
SEG.end = (f, p) => {
  const v = H > W, sq = W === H;
  ctx.fillStyle = C.night;
  ctx.fillRect(0, 0, W, H);
  // a slow diagonal drift of the roster cards, dim, behind everything
  if (p.cats) {
    ctx.save();
    ctx.globalAlpha = 0.16;
    const ch = (v ? H * 0.13 : H * 0.26), step = ch * 0.75;
    const all = [];
    for (let i = 0; i < Math.max(p.cats.length, p.dogs.length); i++) all.push(['cat', p.cats[i % p.cats.length]], ['dog', p.dogs[i % p.dogs.length]]);
    const rows = Math.ceil(H / ch) + 2;
    for (let r = -1; r < rows; r++) {
      const dir = r % 2 ? 1 : -1;
      const off = ((f * 1.6 * S() * dir) % step + step) % step;
      for (let k = -2; k < W / step + 2; k++) {
        const [side, h] = all[((k + r * 5) % all.length + all.length) % all.length];
        const im = img[`s_${h}`];
        if (im) card(im, k * step + off, r * ch * 1.08, ch, side, { skew: 0, glow: 0 });
      }
    }
    ctx.restore();
  }
  ctx.fillStyle = 'rgba(18,9,31,0.55)';
  ctx.fillRect(0, 0, W, H);
  for (const [x, col] of [[0, '255,61,154'], [W, '46,139,255']]) {
    const g = ctx.createRadialGradient(x, H * 0.5, 0, x, H * 0.5, Math.max(W, H) * 0.6);
    g.addColorStop(0, `rgba(${col},${0.34 + 0.06 * Math.sin(f * 0.08)})`);
    g.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  embers(f, 50, 61, [C.bolt, C.cream, C.rose, C.sky], 0.55, 1.2, 0.9);
  // the strike (f0-6): a bolt draws from the top to the logo, then a flash
  const bolt = boltPts(W * 0.56, -0.02 * H, W * 0.47, H * 0.42, 7, 0.08, 21);
  const st = clamp(f / 4);
  if (f < 14) {
    const k = Math.max(2, Math.round(st * bolt.length));
    strokeBolt(bolt.slice(0, k), 18 * S(), '#fff', 50 * S(), 1 - clamp((f - 6) / 8));
    strokeBolt(bolt.slice(0, k), 8 * S(), C.bolt, 0, 1 - clamp((f - 6) / 8));
  }
  flash(f >= 4 && f < 9 ? 0.85 * (1 - (f - 4) / 5) : 0);
  const cy = v ? H * 0.34 : sq ? H * 0.3 : H * 0.33;
  const lt = clamp((f - 4) / 10);
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
  // what it is: a small descriptor
  const dt = clamp((f - 44) / 8);
  if (dt > 0) {
    const ds = (v ? 42 : sq ? 38 : 42) * S();
    ctx.save();
    ctx.globalAlpha = dt;
    ctx.font = `700 ${ds}px Fredoka, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = C.cream;
    ctx.letterSpacing = `${ds * 0.12}px`;
    ctx.fillText('5V5 AND 3V3 TEAM BATTLES', W / 2, (v || sq ? ly + ts * 2.25 : ly + ts * 1.1) + (1 - dt) * 10 * S());
    ctx.restore();
  }
  // the call to action (f60): PLAY FREE IN YOUR BROWSER + pawlegends.app, inside the safe area
  const ct = outCubic(clamp((f - 60) / 10));
  if (ct > 0) {
    const fs = (v ? 54 : sq ? 46 : 58) * S();
    ctx.save();
    ctx.font = `700 ${fs}px Fredoka, sans-serif`;
    const a = 'PLAY FREE IN YOUR BROWSER', b = 'pawlegends.app';
    const wa = ctx.measureText(a).width + fs * 1.0;
    ctx.font = `700 ${fs * 1.25}px Fredoka, sans-serif`;
    const wb = ctx.measureText(b).width + fs * 1.2;
    const bh = fs * 1.7;
    const y0 = (v ? H * 0.71 : sq ? H * 0.75 : H * 0.8) + (1 - ct) * H * 0.12;
    ctx.globalAlpha = ct;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    const pulse = 1 + 0.02 * Math.sin(Math.max(0, f - 70) * 0.18);
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
      ctx.font = `700 ${fs * 1.25}px Fredoka, sans-serif`;
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
      ctx.font = `700 ${fs * 1.25}px Fredoka, sans-serif`;
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
