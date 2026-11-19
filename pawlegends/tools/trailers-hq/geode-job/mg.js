// The Geode Job motion graphics: one canvas, frame by frame. window.__mg.setup({ W, H, assets }) loads the art;
// window.__mg.frame(job, t) draws one frame of a job at cut time t (s) and returns a PNG data URL. Jobs: gem, end
// (opaque), overlay (words / flash / alarm over gameplay, transparent), split (the board half, gameplay half clear),
// freeze (clear while the take plays, a polaroid of the frozen frame after). Text is set here in the brand faces
// (Rubik Black Italic, Fredoka); the generated art never carries text.
const C = { night: '#12091F', plum: '#471F5D', rose: '#FF3D9A', sky: '#2E8BFF', bolt: '#FFD21F', cream: '#FFF3E3', ink: '#0B0612', red: '#FF2E4D' };
let W = 1920, H = 1080, cv, ctx;
const img = {};
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const outCubic = (t) => 1 - (1 - clamp(t)) ** 3;
const U = () => Math.min(W, H) / 1080;
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
async function load(name, src) {
  const im = new Image();
  im.src = src;
  await im.decode();
  img[name] = im;
}

/** Cover-draw an image zoomed `z` about its centre; returns the image->screen map for overlays drawn on the art. */
function cover(im, z = 1, fx = 0.5, fy = 0.5) {
  const s = Math.max(W / im.width, H / im.height) * z;
  const iw = im.width * s, ih = im.height * s;
  let ox = W / 2 - fx * iw, oy = H / 2 - fy * ih;
  ox = Math.min(0, Math.max(W - iw, ox));
  oy = Math.min(0, Math.max(H - ih, oy));
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(im, ox, oy, iw, ih);
  return (u, v) => [ox + u * iw, oy + v * ih];
}

// ------------------------------------------------------------------ type
function word(text, style, k, out) {
  // k: 0..1 slam-in progress, out: 0..1 exit progress
  const u = U();
  const title = style === 'title';
  const size = (title ? 132 : 210) * u * (W < H ? 0.92 : 1);
  ctx.save();
  ctx.font = `900 italic ${size}px Rubik`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const y = title ? H * (W < H ? 0.17 : 0.16) : H * (W < H ? 0.27 : 0.3);
  const sc = (1.45 - 0.45 * outCubic(k)) * (1 - 0.25 * out);
  ctx.globalAlpha = clamp(k * 3) * (1 - out);
  ctx.translate(W / 2, y);
  ctx.scale(sc, sc);
  ctx.rotate(-0.06);
  const fill = { title: C.rose, cat: C.rose, dog: C.sky, vs: C.bolt }[style];
  // fit the width
  const m = ctx.measureText(text).width;
  const maxW = W * 0.86;
  if (m > maxW) ctx.scale(maxW / m, maxW / m);
  ctx.lineJoin = 'round';
  ctx.lineWidth = size * 0.16;
  ctx.strokeStyle = C.ink;
  ctx.shadowColor = 'rgba(11,6,18,0.55)';
  ctx.shadowBlur = size * 0.12;
  ctx.shadowOffsetY = size * 0.05;
  ctx.strokeText(text, 0, 0);
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = fill;
  ctx.fillText(text, 0, 0);
  ctx.lineWidth = size * 0.035;
  ctx.strokeStyle = C.cream;
  ctx.globalAlpha *= 0.55;
  ctx.strokeText(text, 0, 0);
  if (title) {
    // the bolt underline wipes in under the title
    ctx.globalAlpha = clamp(k * 3) * (1 - out);
    const w = Math.min(m, maxW) * clamp((k - 0.2) / 0.6);
    const y0 = size * 0.62;
    ctx.fillStyle = C.ink;
    ctx.beginPath();
    boltPath(-m / 2 - 8, y0, -m / 2 + w + 8, y0, size * 0.2);
    ctx.fill();
    ctx.fillStyle = C.bolt;
    ctx.beginPath();
    boltPath(-m / 2, y0, -m / 2 + w, y0, size * 0.13);
    ctx.fill();
  }
  ctx.restore();
}
/** A flat zig-zag bolt bar from x0 to x1 at y (height h). */
function boltPath(x0, y, x1, _y1, h) {
  const n = 5, dx = (x1 - x0) / n;
  ctx.moveTo(x0, y - h / 2);
  for (let i = 1; i <= n; i++) ctx.lineTo(x0 + dx * i, y - h / 2 + (i % 2 ? h * 0.35 : 0));
  for (let i = n; i >= 0; i--) ctx.lineTo(x0 + dx * i, y + h / 2 + (i % 2 ? h * 0.35 : 0));
  ctx.closePath();
}
function drawWords(words, t) {
  for (const w of words) {
    if (t < w.at || t >= w.to) continue;
    const k = clamp((t - w.at) / 0.14);
    const out = clamp((t - (w.to - 0.12)) / 0.12);
    word(w.word, w.style, k, out);
  }
}

// ------------------------------------------------------------------ fx
function flash(t, at) {
  const d = t - at;
  if (d < 0 || d >= 2 / 60) return;
  ctx.fillStyle = 'rgba(255,255,255,0.72)';
  ctx.fillRect(0, 0, W, H);
}
function alarm(t, [a, b]) {
  if (t < a || t >= b) return;
  const p = (t - a) / (b - a);
  const pulse = Math.sin(p * Math.PI * 2) ** 2; // two pulses
  const col = p < 0.5 ? '255,46,77' : '46,139,255';
  const e = Math.min(W, H) * 0.22;
  for (const [x0, y0, x1, y1] of [[0, 0, 0, e], [0, H, 0, H - e], [0, 0, e, 0], [W, 0, W - e, 0]]) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, `rgba(${col},${0.75 * pulse})`);
    g.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
}

// ------------------------------------------------------------------ art extras
function yarn(map, pts, t0, t) {
  const [cx, cy] = pts.c;
  pts.p.forEach(([u, v], i) => {
    const k = clamp((t - t0 - i * 0.08) / 0.45);
    if (k <= 0) return;
    const [x0, y0] = map(u, v), [x1, y1] = map(cx, cy);
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2 + 40 * U();
    ctx.save();
    ctx.strokeStyle = C.rose;
    ctx.lineWidth = 7 * U();
    ctx.lineCap = 'round';
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 6 * U();
    ctx.shadowOffsetY = 3 * U();
    ctx.beginPath();
    const N = 30;
    for (let j = 0; j <= N * k; j++) {
      const s = j / N;
      const x = (1 - s) ** 2 * x0 + 2 * (1 - s) * s * mx + s * s * x1;
      const y = (1 - s) ** 2 * y0 + 2 * (1 - s) * s * my + s * s * y1;
      j ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  });
  // the bolt-yellow pin stabs the Geode
  const kp = clamp((t - t0 - 0.62) / 0.12);
  if (kp > 0) {
    const [x, y] = map(cx, cy);
    const r = 22 * U() * (1.6 - 0.6 * kp);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 10 * U();
    ctx.fillStyle = C.bolt;
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 5 * U();
    ctx.beginPath();
    ctx.arc(x, y - r * 0.4, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}
function particles(kind, t, a, b, seed) {
  const r = rng(seed);
  const n = kind === 'coins' ? 26 : 34;
  for (let i = 0; i < n; i++) {
    const x0 = r() * W, sp = 0.4 + r() * 0.8, ph = r(), sz = (8 + r() * 14) * U();
    const p = ((t - a) / (b - a) * sp + ph) % 1;
    ctx.save();
    if (kind === 'coins') {
      const y = -40 + p * (H + 80);
      ctx.translate(x0 + Math.sin(p * 9 + i) * 20, y);
      ctx.scale(Math.abs(Math.cos(p * 12 + i)) + 0.15, 1);
      ctx.fillStyle = C.bolt;
      ctx.strokeStyle = '#B8860B';
      ctx.lineWidth = 3 * U();
      ctx.beginPath();
      ctx.arc(0, 0, sz, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else {
      const y = r() * H;
      const tw = Math.max(0, Math.sin((p * 2 + i) * Math.PI));
      ctx.translate(x0, y);
      ctx.globalAlpha = tw;
      ctx.fillStyle = i % 3 ? C.cream : C.bolt;
      star(sz * 1.2 * tw);
    }
    ctx.restore();
  }
}
function star(s) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const rr = i % 2 ? s * 0.22 : s;
    const an = (i * Math.PI) / 4;
    ctx.lineTo(Math.cos(an) * rr, Math.sin(an) * rr);
  }
  ctx.closePath();
  ctx.fill();
}
function zzz(map, at, t, a) {
  const [x, y] = map(...at);
  for (let i = 0; i < 3; i++) {
    const p = ((t - a) * 0.7 + i / 3) % 1;
    const s = (26 + 30 * p) * U();
    ctx.save();
    ctx.translate(x + p * 120 * U() + Math.sin(p * 6) * 14 * U(), y - p * 230 * U());
    ctx.globalAlpha = Math.sin(p * Math.PI);
    ctx.strokeStyle = C.cream;
    ctx.lineWidth = 9 * U();
    ctx.lineJoin = 'round';
    ctx.shadowColor = C.sky;
    ctx.shadowBlur = 16 * U();
    ctx.beginPath();
    ctx.moveTo(-s / 2, -s / 2);
    ctx.lineTo(s / 2, -s / 2);
    ctx.lineTo(-s / 2, s / 2);
    ctx.lineTo(s / 2, s / 2);
    ctx.stroke();
    ctx.restore();
  }
}
function tunnel(map, t, a) {
  const pts = [[0.04, 0.93], [0.22, 0.86], [0.3, 0.95], [0.42, 0.84], [0.36, 0.74], [0.5, 0.68]];
  const k = clamp((t - a - 0.05) / 0.7);
  ctx.save();
  ctx.strokeStyle = C.sky;
  ctx.lineWidth = 11 * U();
  ctx.lineCap = 'round';
  ctx.setLineDash([2 * U(), 26 * U()]);
  ctx.shadowColor = C.sky;
  ctx.shadowBlur = 22 * U();
  ctx.beginPath();
  const seg = (pts.length - 1) * k;
  for (let i = 0; i <= Math.floor(seg); i++) {
    const [x, y] = map(...pts[i]);
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  if (seg < pts.length - 1) {
    const i = Math.floor(seg), f = seg - i;
    const [x0, y0] = map(...pts[i]), [x1, y1] = map(...pts[i + 1]);
    ctx.lineTo(x0 + (x1 - x0) * f, y0 + (y1 - y0) * f);
  }
  ctx.stroke();
  ctx.restore();
}

// ------------------------------------------------------------------ jobs
const YARN = {
  h: { p: [[0.13, 0.19], [0.78, 0.17], [0.17, 0.69], [0.78, 0.69]], c: [0.52, 0.47] },
  v: { p: [[0.15, 0.31], [0.85, 0.31], [0.15, 0.69], [0.82, 0.7]], c: [0.5, 0.51] },
};
function gem(job, t) {
  const im = img[`${job.gem}`];
  const p = clamp((t - job.a) / (job.b - job.a));
  const z = job.push[0] + (job.push[1] - job.push[0]) * ease(p);
  ctx.fillStyle = C.night;
  ctx.fillRect(0, 0, W, H);
  const map = cover(im, z);
  if (job.yarn) yarn(map, YARN[job.art], job.a + 0.05, t);
  if (job.coins) particles('coins', t, job.a, job.b, 7);
  if (job.sparkle) particles('sparkle', t, job.a, job.b, 9);
  if (job.zzz) zzz(map, job.art === 'v' ? [0.65, 0.5] : [0.36, 0.33], t, job.a);
  if (job.tunnel) tunnel(map, t, job.a);
  // a soft plum vignette ties the frames to the night palette
  const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
  g.addColorStop(0, 'rgba(18,9,31,0)');
  g.addColorStop(1, 'rgba(18,9,31,0.55)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function endCard(job, t) {
  const d = t - job.a;
  ctx.fillStyle = C.night;
  ctx.fillRect(0, 0, W, H);
  cover(img.D, 1.08 - 0.06 * ease(clamp(d / (job.b - job.a))));
  ctx.fillStyle = 'rgba(18,9,31,0.42)';
  ctx.fillRect(0, 0, W, H);
  const v = W < H, sq = W === H;
  const lw = W * (v ? 0.84 : sq ? 0.7 : 0.44);
  const lh = (lw * img.logo.height) / img.logo.width;
  const cy = H * (v ? 0.36 : 0.4);
  // the logo lands (scale 1.3 -> 1 over 8 frames) with a white pop
  const k = outCubic(clamp((d - 0.1) / 0.14));
  if (d >= 0.1) {
    const s = 1.3 - 0.3 * k;
    ctx.save();
    ctx.globalAlpha = clamp((d - 0.1) * 12);
    ctx.translate(W / 2, cy);
    ctx.scale(s, s);
    ctx.shadowColor = 'rgba(11,6,18,0.7)';
    ctx.shadowBlur = 40 * U();
    ctx.drawImage(img.logo, -lw / 2, -lh / 2, lw, lh);
    ctx.restore();
  }
  // a magenta yarn string ties under the logo, ending in a bow
  const ky = clamp((d - 0.3) / 0.5);
  if (ky > 0) {
    ctx.save();
    ctx.strokeStyle = C.rose;
    ctx.lineWidth = 8 * U();
    ctx.lineCap = 'round';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 8 * U();
    const y = cy + lh * 0.56, x0 = W / 2 - lw * 0.45, x1 = W / 2 + lw * 0.45;
    ctx.beginPath();
    for (let j = 0; j <= 40 * ky; j++) {
      const s = j / 40;
      ctx.lineTo(x0 + (x1 - x0) * s, y + Math.sin(s * Math.PI * 3) * 9 * U());
    }
    ctx.stroke();
    if (ky >= 1) {
      const bx = W / 2, r = 22 * U();
      ctx.beginPath();
      ctx.ellipse(bx - r, y, r, r * 0.6, 0.3, 0, Math.PI * 2);
      ctx.ellipse(bx + r, y, r, r * 0.6, -0.3, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
  const ty = cy + lh * 0.56 + 150 * U() * (v ? 1.1 : 1);
  const kp = clamp((d - 0.55) / 0.12);
  if (kp > 0) {
    ctx.save();
    ctx.translate(W / 2, ty);
    const s = 1.35 - 0.35 * outCubic(kp);
    ctx.scale(s, s);
    ctx.globalAlpha = clamp(kp * 3);
    ctx.font = `900 italic ${118 * U()}px Rubik`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 20 * U();
    ctx.strokeStyle = C.ink;
    ctx.strokeText('PLAY FREE', 0, 0);
    ctx.fillStyle = C.bolt;
    ctx.fillText('PLAY FREE', 0, 0);
    ctx.restore();
  }
  const ku = clamp((d - 0.8) / 0.2);
  if (ku > 0) {
    ctx.save();
    ctx.globalAlpha = ku;
    ctx.font = `700 ${62 * U()}px Fredoka`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 10 * U();
    ctx.lineJoin = 'round';
    ctx.strokeStyle = C.ink;
    ctx.strokeText('pawlegends.app', W / 2, ty + 115 * U());
    ctx.fillStyle = C.cream;
    ctx.fillText('pawlegends.app', W / 2, ty + 115 * U());
    ctx.restore();
  }
  // fade out over the last 4 frames into the button shot
  const fo = clamp((t - (job.b - 4 / 60)) / (4 / 60));
  if (fo > 0) {
    ctx.fillStyle = `rgba(18,9,31,${fo * 0.6})`;
    ctx.fillRect(0, 0, W, H);
  }
}

/** PLAN vs REALITY: the board half (left or top) with the sneak route; the bolt divider; the gameplay half clear. */
function split(job, t) {
  const v = W < H;
  const half = v ? { x: 0, y: 0, w: W, h: H / 2 } : { x: 0, y: 0, w: W / 2, h: H };
  ctx.save();
  ctx.beginPath();
  ctx.rect(half.x, half.y, half.w, half.h);
  ctx.clip();
  const im = img.A;
  const z = 1.05 + 0.05 * clamp((t - job.a) / (job.b - job.a));
  const s = Math.max(half.w / im.width, half.h / im.height) * z * (v ? 1.15 : 1.5);
  const iw = im.width * s, ih = im.height * s;
  // centred on the geode on the blueprint
  const c = YARN[job.art].c;
  const ox = half.x + half.w / 2 - c[0] * iw, oy = half.y + half.h / 2 - c[1] * ih;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(im, ox, oy, iw, ih);
  ctx.fillStyle = 'rgba(18,9,31,0.18)';
  ctx.fillRect(half.x, half.y, half.w, half.h);
  // the sneak route: a dotted magenta arrow that tiptoes round the edge
  const cx = half.x + half.w / 2, cy = half.y + half.h / 2;
  const R = Math.min(half.w, half.h) * 0.34;
  const k = clamp((t - job.a) / 0.5);
  ctx.strokeStyle = C.rose;
  ctx.lineWidth = 12 * U();
  ctx.lineCap = 'round';
  ctx.setLineDash([4 * U(), 24 * U()]);
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 8 * U();
  ctx.beginPath();
  const a0 = Math.PI * 0.95, a1 = a0 + Math.PI * 1.35 * k;
  ctx.arc(cx, cy, R, a0, a1);
  ctx.stroke();
  ctx.setLineDash([]);
  if (k > 0.05) {
    const ax = cx + Math.cos(a1) * R, ay = cy + Math.sin(a1) * R, dir = a1 + Math.PI / 2;
    ctx.fillStyle = C.rose;
    ctx.beginPath();
    ctx.moveTo(ax + Math.cos(dir) * 34 * U(), ay + Math.sin(dir) * 34 * U());
    ctx.lineTo(ax + Math.cos(dir + 2.4) * 26 * U(), ay + Math.sin(dir + 2.4) * 26 * U());
    ctx.lineTo(ax + Math.cos(dir - 2.4) * 26 * U(), ay + Math.sin(dir - 2.4) * 26 * U());
    ctx.fill();
  }
  // reality strikes: a red scribble cross over the plan as Meatball rolls in
  const kx = clamp((t - job.cross) / 0.16);
  if (kx > 0) {
    ctx.strokeStyle = C.red;
    ctx.lineWidth = 22 * U();
    ctx.shadowBlur = 0;
    const L = R * 1.05;
    for (const [sx, sy, ex, ey, kk] of [[-1, -1, 1, 1, clamp(kx * 2)], [1, -1, -1, 1, clamp(kx * 2 - 1)]]) {
      if (kk <= 0) continue;
      ctx.beginPath();
      ctx.moveTo(cx + sx * L, cy + sy * L);
      ctx.lineTo(cx + (sx + (ex - sx) * kk) * L, cy + (sy + (ey - sy) * kk) * L);
      ctx.stroke();
    }
  }
  ctx.restore();
  // the hard bolt divider (v6)
  ctx.save();
  ctx.fillStyle = C.ink;
  ctx.beginPath();
  divider(18 * U());
  ctx.fill();
  ctx.fillStyle = C.bolt;
  ctx.shadowColor = C.bolt;
  ctx.shadowBlur = 24 * U();
  ctx.beginPath();
  divider(9 * U());
  ctx.fill();
  ctx.restore();
}
function divider(w) {
  const v = W < H;
  const n = 6;
  const L = v ? W : H;
  const amp = 26 * U();
  const P = [];
  for (let i = 0; i <= n; i++) {
    const s = (i / n) * L;
    const o = i === 0 || i === n ? 0 : i % 2 ? amp : -amp;
    P.push(v ? [s, H / 2 + o] : [W / 2 + o, s]);
  }
  P.forEach(([x, y], i) => (i ? ctx.lineTo(v ? x : x + w, v ? y + w : y) : ctx.moveTo(v ? x : x + w, v ? y + w : y)));
  for (let i = P.length - 1; i >= 0; i--) {
    const [x, y] = P[i];
    ctx.lineTo(v ? x : x - w, v ? y - w : y);
  }
  ctx.closePath();
}

// pictogram stickers (no words): crown, wrench, ear, fist
function icon(kind, x, y, r) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(0.12);
  ctx.fillStyle = C.bolt;
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 6 * U();
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = C.plum;
  ctx.strokeStyle = C.plum;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const s = r * 0.55;
  ctx.beginPath();
  if (kind === 'crown') {
    ctx.moveTo(-s, s * 0.6);
    ctx.lineTo(-s, -s * 0.4);
    ctx.lineTo(-s * 0.45, s * 0.1);
    ctx.lineTo(0, -s * 0.7);
    ctx.lineTo(s * 0.45, s * 0.1);
    ctx.lineTo(s, -s * 0.4);
    ctx.lineTo(s, s * 0.6);
    ctx.closePath();
    ctx.fill();
  } else if (kind === 'wrench') {
    ctx.lineWidth = s * 0.42;
    ctx.moveTo(-s * 0.7, s * 0.7);
    ctx.lineTo(s * 0.25, -s * 0.25);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(s * 0.42, -s * 0.42, s * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = C.bolt;
    ctx.beginPath();
    ctx.arc(s * 0.62, -s * 0.62, s * 0.2, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === 'ear') {
    ctx.moveTo(-s * 0.8, s * 0.7);
    ctx.lineTo(-s * 0.2, -s * 0.9);
    ctx.lineTo(s * 0.8, s * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = C.rose;
    ctx.beginPath();
    ctx.moveTo(-s * 0.4, s * 0.45);
    ctx.lineTo(-s * 0.15, -s * 0.35);
    ctx.lineTo(s * 0.35, s * 0.45);
    ctx.closePath();
    ctx.fill();
  } else {
    // a paw fist: a pad and four toe beans
    ctx.ellipse(0, s * 0.3, s * 0.55, s * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.arc(-s * 0.6 + i * s * 0.4, -s * 0.35 - (i === 1 || i === 2 ? s * 0.12 : 0), s * 0.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** Crew freezes: each slot plays clear, then the frozen frame snaps into a tilted polaroid on plum. */
function freeze(job, t) {
  const n = job.crew.length;
  const slot = (job.b - job.a) / n;
  const i = Math.min(n - 1, Math.floor((t - job.a) / slot + 1e-6));
  const local = t - job.a - i * slot;
  const fz = slot * job.freezeAt;
  if (local < fz) return;
  const d = local - fz;
  const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.7);
  g.addColorStop(0, C.plum);
  g.addColorStop(1, C.night);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // halftone dots on the plum
  ctx.fillStyle = 'rgba(255,61,154,0.10)';
  const st = 26 * U();
  for (let y = 0; y < H; y += st) for (let x = (y / st) % 2 ? st / 2 : 0; x < W; x += st) {
    ctx.beginPath();
    ctx.arc(x, y, 3.2 * U(), 0, Math.PI * 2);
    ctx.fill();
  }
  const pic = img[job.crewKeys[i]];
  const v = W < H;
  const pw = W * (v ? 0.82 : W === H ? 0.76 : 0.6);
  const ph = (pw * pic.height) / pic.width;
  const border = pw * 0.035;
  const k = outCubic(clamp(d / 0.09));
  const s = 1.14 - 0.14 * k;
  const ang = ((i % 2 ? 4 : -4) * Math.PI) / 180;
  ctx.save();
  ctx.translate(W / 2, H / 2 - border * 1.5);
  ctx.rotate(ang * k);
  ctx.scale(s, s);
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 40 * U();
  ctx.shadowOffsetY = 14 * U();
  ctx.fillStyle = C.cream;
  ctx.fillRect(-pw / 2 - border, -ph / 2 - border, pw + 2 * border, ph + border * 4.5);
  ctx.shadowColor = 'transparent';
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(pic, -pw / 2, -ph / 2, pw, ph);
  const r = 58 * U();
  icon(job.crew[i][2], pw / 2 - r * 0.4, ph / 2 + border * 0.6, r * (1.3 - 0.3 * outCubic(clamp((d - 0.04) / 0.08))));
  ctx.restore();
  // the snap: a 2-frame white pop
  if (d < 2 / 60) {
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillRect(0, 0, W, H);
  }
}

window.__mg = {
  async setup(o) {
    W = o.W;
    H = o.H;
    cv = document.getElementById('c');
    cv.width = W;
    cv.height = H;
    ctx = cv.getContext('2d');
    await Promise.all(Object.entries(o.assets).map(([k, v]) => load(k, v)));
    await document.fonts.load('900 italic 100px Rubik');
    await document.fonts.load('700 100px Fredoka');
    return { rubik: document.fonts.check('900 italic 100px Rubik'), fredoka: document.fonts.check('700 100px Fredoka') };
  },
  frame(job, t) {
    ctx.clearRect(0, 0, W, H);
    if (job.kind === 'gem') gem(job, t);
    else if (job.kind === 'end') endCard(job, t);
    else if (job.kind === 'split') split(job, t);
    else if (job.kind === 'freeze') freeze(job, t);
    drawWords(job.words ?? [], t);
    for (const fx of job.fx ?? []) {
      if (fx.flash !== undefined) flash(t, fx.flash);
      if (fx.alarm) alarm(t, fx.alarm);
    }
    return cv.toDataURL('image/png');
  },
};
