/* Trailer "Wild Rivals" motion graphics, one canvas frame per call (edit.mjs drives it in a headless browser and
 * composites the transparent frames over the gameplay). Draws: the story frames (Gemini stills with their moves, the
 * sketchbook reveal, the seasons wheel, snow, the end card), the plum documentary matte (2.39:1 on 16:9, top and bottom
 * bands on 9:16 and 1:1), the lower-third field cards (cat / dog silhouette glyphs and a season glyph, no words), the
 * six words, white flashes and wipes. Brand v6 Lightning Rivalry colours. Every element is a pure function of time. */
(() => {
  const C = { rose: '#FF3D9A', sky: '#2E8BFF', bolt: '#FFD21F', plum: '#471F5D', night: '#12091F', cream: '#FFF3E3', paper: '#F4EAD8', matte: '#2A1137', ink: '#3A1748' };
  const cv = document.getElementById('c');
  const g = cv.getContext('2d');
  let W = 1920, H = 1080, A = 'h', cut = null, img = {}, FPS = 60;
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const ease = (x) => { x = clamp(x); return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2; };
  const out3 = (x) => 1 - (1 - clamp(x)) ** 3;
  const back = (x) => { x = clamp(x); const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2; };
  const rnd = (i) => { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  const U = () => Math.min(W, H) / 1080; // type scale unit

  async function load(src) {
    const im = new Image();
    im.src = src;
    await im.decode();
    return im;
  }

  window.__mg = {
    async setup(o) {
      W = o.W; H = o.H; A = o.aspect; cut = o.cut; FPS = o.fps ?? 60;
      cv.width = W; cv.height = H;
      for (const [k, v] of Object.entries(o.assets)) img[k] = await load(v);
      for (const f of o.fonts) {
        const ff = new FontFace(f.family, `url(${f.src})`, { weight: f.weight ?? '400', style: f.style ?? 'normal' });
        document.fonts.add(await ff.load());
      }
      await document.fonts.ready;
      return { ok: true, fonts: [...document.fonts].map((f) => `${f.family} ${f.weight} ${f.style} ${f.status}`) };
    },
    /** Glyphs a face is missing for the copy (a fallback face would show on screen). */
    check(text, font) {
      g.font = font;
      return document.fonts.check(font, text);
    },
    draw(t) {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, W, H);
      const seg = cut.segs.find((s) => t >= s.t0 - 1e-6 && t < s.t1 - 1e-6) ?? cut.segs[cut.segs.length - 1];
      const idx = cut.segs.indexOf(seg);
      if (seg.gem) drawGem(seg, t);
      if (seg.wipe) wipe(t - seg.t0);
      if (seg.card && !seg.gem) fieldCard(seg, idx, t);
      for (const tx of cut.text) if (t >= tx.t0 && t < tx.t1) word(tx, t);
      for (const f of cut.flashes) if (t >= f.t - 1e-6 && t < f.t + f.frames / FPS - 1e-6) { g.fillStyle = 'rgba(255,255,255,0.92)'; g.fillRect(0, 0, W, H); }
      if (seg.end) endCard(seg, t);
      return true;
    },
  };

  // ------------------------------------------------------------------ stills
  function cover(im, s = 1, ox = 0, oy = 0) {
    const k = Math.max(W / im.width, H / im.height) * s;
    const w = im.width * k, h = im.height * k;
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(im, (W - w) / 2 + ox * W, (H - h) / 2 + oy * H, w, h);
  }
  function drawGem(seg, t) {
    const p = (t - seg.t0) / (seg.t1 - seg.t0);
    const im = img[seg.gem];
    if (seg.wheel) return wheel(seg, t, p);
    if (seg.move === 'pan') cover(im, 1.1 - 0.03 * p, 0.035 - 0.07 * ease(p), 0);
    else if (seg.move === 'parallax') cover(im, 1.08 + 0.06 * ease(p), -0.012 * p, 0.008 * p);
    else if (seg.end) cover(im, 1.08 + 0.05 * out3((t - seg.t0) / 3.0)); // the end card settles by +3 s
    else cover(im, 1.08 + 0.05 * out3(p));
    if (seg.reveal) reveal(t - seg.t0);
    if (seg.snow) snow(t - seg.t0, 1);
  }
  /** The sketchbook draws itself: paper over the page is erased by a pencil edge sweeping left to right (0.75 s). */
  function reveal(dt) {
    const p = out3(dt / 0.75);
    if (p >= 1) return;
    const x0 = -0.1 * W + p * 1.25 * W;
    g.save();
    g.beginPath();
    g.moveTo(W, 0);
    g.lineTo(x0, 0);
    for (let y = 0; y <= H; y += H / 24) g.lineTo(x0 + (rnd(y + 3) - 0.5) * 0.05 * W + Math.sin(y / H * 9) * 0.02 * W, y);
    g.lineTo(W, H);
    g.closePath();
    g.fillStyle = C.paper;
    g.fill();
    // a few pencil hatch lines at the edge
    g.strokeStyle = 'rgba(58,23,72,0.55)';
    g.lineWidth = 2.2 * U();
    g.lineCap = 'round';
    for (let i = 0; i < 14; i++) {
      const y = rnd(i * 7.1) * H;
      const x = x0 + (rnd(y + 3) - 0.5) * 0.05 * W;
      g.beginPath();
      g.moveTo(x - 0.03 * W, y);
      g.lineTo(x + 0.02 * W, y - 0.03 * H);
      g.stroke();
    }
    g.restore();
  }
  function snow(dt, a) {
    g.save();
    g.fillStyle = `rgba(255,255,255,${0.85 * a})`;
    for (let i = 0; i < 160; i++) {
      const sp = 0.05 + rnd(i) * 0.12;
      const x = ((rnd(i * 3.3) + Math.sin(dt * 1.3 + i) * 0.01) * W) % W;
      const y = ((rnd(i * 5.7) + dt * sp) % 1) * H;
      const r = (1.2 + rnd(i * 9.1) * 3.2) * U();
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }
  /** The seasons wheel: the painted ring with the four season glyphs on it; the wheel turns the season to the right. */
  const RING = { h: [0.484, 0.476, 0.385, 'h'], v: [0.5, 0.476, 0.38, 'w'], s: [0.5, 0.466, 0.345, 'h'] };
  const SEASONS = ['bloom', 'sun', 'leaf', 'frost'];
  function wheel(seg, t, p) {
    cover(img.D, 1.0 + 0.02 * p);
    const [cx, cy, rr, by] = RING[A];
    const R = rr * (by === 'w' ? W : H);
    const k = SEASONS.indexOf(seg.wheel);
    const turn = ease(clamp((t - seg.t0) / 0.45));
    // the active season turns to 3 o'clock (12 o'clock sits under the 16:9 matte)
    const ang = -(k - 1 + turn) * (Math.PI / 2);
    for (let i = 0; i < 4; i++) {
      const a = ang + i * (Math.PI / 2);
      const x = cx * W + Math.cos(a) * R, y = cy * H + Math.sin(a) * R;
      const on = i === k ? turn : 0;
      const s = (by === 'w' ? W : H) * 0.075 * (1 + 0.35 * on);
      g.save();
      g.translate(x, y);
      g.fillStyle = C.paper;
      g.globalAlpha = 0.92;
      g.beginPath();
      g.arc(0, 0, s * 0.72, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 1;
      if (on > 0) {
        g.strokeStyle = C.bolt;
        g.lineWidth = s * 0.08;
        g.beginPath();
        g.arc(0, 0, s * 0.72, 0, Math.PI * 2 * on);
        g.stroke();
      }
      seasonGlyph(SEASONS[i], s, i === k ? C.ink : 'rgba(58,23,72,0.55)');
      g.restore();
    }
  }

  // ------------------------------------------------------------------ glyphs (no words)
  function seasonGlyph(which, s, col) {
    g.save();
    g.fillStyle = col;
    g.strokeStyle = col;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    if (which === 'bloom') {
      for (let i = 0; i < 5; i++) {
        g.save();
        g.rotate((i * 2 * Math.PI) / 5);
        g.beginPath();
        g.ellipse(0, -s * 0.2, s * 0.13, s * 0.2, 0, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }
      g.fillStyle = C.bolt;
      g.beginPath();
      g.arc(0, 0, s * 0.09, 0, Math.PI * 2);
      g.fill();
    } else if (which === 'sun') {
      g.beginPath();
      g.arc(0, 0, s * 0.17, 0, Math.PI * 2);
      g.fill();
      g.lineWidth = s * 0.07;
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        g.beginPath();
        g.moveTo(Math.cos(a) * s * 0.27, Math.sin(a) * s * 0.27);
        g.lineTo(Math.cos(a) * s * 0.4, Math.sin(a) * s * 0.4);
        g.stroke();
      }
    } else if (which === 'leaf') {
      g.rotate(-0.6);
      g.beginPath();
      g.moveTo(0, -s * 0.4);
      g.quadraticCurveTo(s * 0.32, -s * 0.05, 0, s * 0.33);
      g.quadraticCurveTo(-s * 0.32, -s * 0.05, 0, -s * 0.4);
      g.fill();
      g.strokeStyle = C.paper;
      g.lineWidth = s * 0.04;
      g.beginPath();
      g.moveTo(0, -s * 0.3);
      g.lineTo(0, s * 0.42);
      g.stroke();
    } else if (which === 'frost') {
      g.lineWidth = s * 0.065;
      for (let i = 0; i < 6; i++) {
        g.save();
        g.rotate((i * Math.PI) / 3);
        g.beginPath();
        g.moveTo(0, 0);
        g.lineTo(0, -s * 0.4);
        g.moveTo(0, -s * 0.25);
        g.lineTo(s * 0.1, -s * 0.34);
        g.moveTo(0, -s * 0.25);
        g.lineTo(-s * 0.1, -s * 0.34);
        g.stroke();
        g.restore();
      }
    } else if (which === 'moon') {
      g.beginPath();
      g.arc(0, 0, s * 0.32, 0, Math.PI * 2);
      g.fill();
      g.globalCompositeOperation = 'destination-out';
      g.beginPath();
      g.arc(s * 0.14, -s * 0.1, s * 0.27, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }
  /** Sitting cat (pointed ears, tail curled up) or dog (floppy ears, tail up) silhouette, `s` tall, centred. */
  function speciesGlyph(sp, s, col) {
    g.save();
    g.fillStyle = col;
    g.scale(s / 100, s / 100);
    g.translate(-50, -50);
    g.beginPath();
    if (sp === 'cat') {
      g.moveTo(30, 98); // body
      g.bezierCurveTo(18, 70, 28, 44, 44, 40);
      g.lineTo(56, 40);
      g.bezierCurveTo(72, 44, 82, 70, 70, 98);
      g.closePath();
      g.moveTo(50, 46); // head
      g.arc(50, 30, 17, 0, Math.PI * 2);
      g.moveTo(35, 24); g.lineTo(34, 2); g.lineTo(48, 15); g.closePath(); // ears
      g.moveTo(65, 24); g.lineTo(66, 2); g.lineTo(52, 15); g.closePath();
      g.fill();
      g.lineWidth = 7; g.lineCap = 'round'; g.strokeStyle = col; // tail
      g.beginPath(); g.moveTo(70, 92); g.bezierCurveTo(96, 92, 98, 60, 86, 52); g.stroke();
    } else {
      g.moveTo(28, 98);
      g.bezierCurveTo(18, 72, 28, 46, 44, 42);
      g.lineTo(58, 42);
      g.bezierCurveTo(74, 46, 82, 72, 72, 98);
      g.closePath();
      g.moveTo(68, 30);
      g.ellipse(50, 30, 18, 16, 0, 0, Math.PI * 2);
      g.moveTo(62, 40); g.ellipse(58, 38, 13, 8, 0.1, 0, Math.PI * 2); // muzzle
      g.fill();
      g.beginPath(); // floppy ears
      g.ellipse(32, 30, 7, 15, 0.35, 0, Math.PI * 2);
      g.ellipse(68, 30, 7, 15, -0.35, 0, Math.PI * 2);
      g.fill();
      g.lineWidth = 7; g.lineCap = 'round'; g.strokeStyle = col;
      g.beginPath(); g.moveTo(72, 80); g.quadraticCurveTo(92, 70, 90, 48); g.stroke();
    }
    g.restore();
  }

  // ------------------------------------------------------------------ matte, cards, type
  function barH() {
    return 0; // v2: no documentary matte, gameplay is full frame
  }
  function matteK(t) {
    let k = ease(t / (10 / FPS));
    if (cut.matteOpen !== undefined && t >= cut.matteOpen) k = 1 - ease((t - cut.matteOpen) / (14 / FPS));
    if (cut.matteBack !== undefined && t >= cut.matteBack) k = ease((t - cut.matteBack) / (10 / FPS));
    return t <= 0 ? 1 : k; // frame 0 already carries the matte (it slides in over the first 10 frames from a sliver)
  }
  function matte(t) {
    const k = t < 10 / FPS ? 0.35 + 0.65 * ease(t / (10 / FPS)) : matteK(t);
    if (k <= 0.001) return;
    const h = barH() * k;
    g.fillStyle = C.matte;
    g.fillRect(0, 0, W, h);
    g.fillRect(0, H - h, W, h);
  }
  function fieldCard(seg, idx, t) {
    const prev = cut.segs[idx - 1];
    const same = prev && prev.card && !prev.gem && JSON.stringify(prev.card) === JSON.stringify(seg.card);
    // the card slides in on each new card, stays through same-card cuts (the salvo), and leaves 6 frames before a cut
    // to a story frame
    let t0 = seg.t0;
    for (let j = idx; j > 0 && cut.segs[j - 1].card && !cut.segs[j - 1].gem && JSON.stringify(cut.segs[j - 1].card) === JSON.stringify(seg.card); j--) t0 = cut.segs[j - 1].t0;
    const title = cut.text.find((x) => x.style === 'title');
    if (title && t0 < title.t1 + 0.15 && seg.t1 > title.t0) t0 = Math.max(t0, title.t1 + 0.15);
    if (t < t0) return;
    const kin = clamp((t - t0) / (10 / FPS));
    const next = cut.segs[idx + 1];
    const leaving = !next || next.gem || !next.card || JSON.stringify(next.card) !== JSON.stringify(seg.card);
    const kout = leaving ? 1 - ease((t - (seg.t1 - 7 / FPS)) / (6 / FPS)) : 1;
    const a = clamp(Math.min(kin, kout));
    if (a <= 0) return;
    const u = U();
    const gs = (A === "v" ? 92 : 84) * u;
    const n = seg.card.sp.length + 1 + (seg.card.moon ? 1 : 0);
    const pad = 18 * u;
    const w = pad * 2 + n * gs + (n - 1) * 14 * u + 10 * u;
    const h = gs + pad * 1.4;
    const bh = barH();
    // bottom-left inside the title-safe area (no matte any more): fades and pops in place, so no frame ever shows
    // a half-cut card at the frame edge
    const x = (A === 'h' ? 0.04 : 0.06) * W;
    const y = H - h - (A === 'v' ? 0.085 : 0.06) * H;
    const sc = 0.9 + 0.1 * back(kin);
    g.save();
    g.translate(x, y + h);
    g.scale(sc, sc);
    g.translate(-x, -(y + h));
    g.globalAlpha = clamp(a);
    g.fillStyle = C.cream;
    rr(x, y, w, h, 14 * u);
    g.fill();
    g.lineWidth = 4 * u;
    g.strokeStyle = C.plum;
    g.stroke();
    let cx = x + pad + gs / 2;
    const cy = y + h / 2;
    for (const sp of seg.card.sp) {
      g.save(); g.translate(cx, cy); speciesGlyph(sp, gs * 0.92, sp === 'cat' ? C.rose : C.sky); g.restore();
      cx += gs + 14 * u;
    }
    g.fillStyle = C.plum;
    g.fillRect(cx - gs / 2 - 9 * u, cy - gs * 0.36, 3 * u, gs * 0.72);
    cx += 10 * u;
    g.save(); g.translate(cx, cy); seasonGlyph(seg.card.season, gs, C.plum); g.restore();
    if (seg.card.moon) { cx += gs + 14 * u; g.save(); g.translate(cx, cy); seasonGlyph('moon', gs, C.plum); g.restore(); }
    g.restore();
  }
  function rr(x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  function bolt(x, y, s, col) {
    g.save();
    g.translate(x, y);
    g.scale(s / 100, s / 100);
    g.beginPath();
    g.moveTo(12, -50); g.lineTo(-22, 6); g.lineTo(0, 6); g.lineTo(-12, 50); g.lineTo(24, -10); g.lineTo(2, -10); g.lineTo(16, -50);
    g.closePath();
    g.fillStyle = col;
    g.fill();
    g.restore();
  }
  function word(tx, t) {
    const u = U();
    const dt = t - tx.t0;
    const left = tx.t1 - t;
    const a = clamp(Math.min(dt / (5 / FPS), left / (5 / FPS)));
    g.save();
    g.globalAlpha = a;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (tx.style === 'title') {
      // WILD (cat rose) / RIVALS (dog blue) in the brand display face (Rubik Black Italic, as 3V3 and PLAY FREE), night
      // stroke, upper third so the fight under it stays readable; the bolt sits in a measured gap, never under a letter
      const s = (A === 'h' ? 190 : 165) * u;
      const y = H * (A === 'v' ? 0.25 : 0.27);
      const sc = 1.12 - 0.12 * out3(dt / (9 / FPS));
      // a soft plum glow behind the words for contrast on bright maps
      const grd = g.createRadialGradient(W / 2, y, 0, W / 2, y, (A === 'h' ? 0.42 : 0.62) * W);
      grd.addColorStop(0, 'rgba(18,9,31,0.5)');
      grd.addColorStop(1, 'rgba(18,9,31,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, W, H);
      g.translate(W / 2, y);
      g.scale(sc, sc);
      g.font = `italic 900 ${s}px Rubik`;
      g.lineJoin = 'round';
      const wW = g.measureText('WILD').width, wR = g.measureText('RIVALS').width;
      const ink = (txt, x0, yy, col) => { g.lineWidth = s * 0.17; g.strokeStyle = C.night; g.strokeText(txt, x0, yy); g.fillStyle = col; g.fillText(txt, x0, yy); };
      const bk = back(clamp((dt - 0.12) / 0.3));
      if (A === 'h') {
        const gap = s * 0.78;
        const total = wW + gap + wR;
        const x0 = -total / 2;
        ink('WILD', x0 + wW / 2, 0, C.rose);
        ink('RIVALS', x0 + wW + gap + wR / 2, 0, C.sky);
        if (bk > 0) { bolt(x0 + wW + gap / 2, 0, s * 1.3 * bk, C.night); bolt(x0 + wW + gap / 2, 0, s * 1.12 * bk, C.bolt); }
      } else {
        const lh = s * 1.02;
        ink('WILD', 0, -lh / 2, C.rose);
        ink('RIVALS', 0, lh / 2, C.sky);
        // the bolt beside WILD, in the empty space right of the shorter word
        if (bk > 0) { const bx = wW / 2 + s * 0.45; bolt(bx, -lh / 2, s * 1.0 * bk, C.night); bolt(bx, -lh / 2, s * 0.86 * bk, C.bolt); }
      }
    } else if (tx.style === 'big') {
      // 3V3: a quick slam in the upper third, off the team fight in the centre
      const s = (A === 'v' ? 200 : 210) * u;
      const k = 1.5 - 0.5 * out3(dt / (8 / FPS));
      g.translate(W / 2, H * (A === 'v' ? 0.2 : 0.2));
      g.rotate(-0.04);
      g.scale(k, k);
      g.font = `italic 900 ${s}px Rubik`;
      g.lineJoin = 'round';
      g.lineWidth = s * 0.16;
      g.strokeStyle = C.night;
      g.strokeText(tx.word, 0, 0);
      g.fillStyle = C.bolt;
      g.fillText(tx.word, 0, 0);
    } else {
      // CATS / VS / DOGS: big supers in the upper third (under the score bar), off the champions
      const s = (A === 'h' ? 170 : 150) * u;
      const k = 1.3 - 0.3 * out3(dt / (7 / FPS));
      g.translate(W / 2, H * (A === 'v' ? 0.2 : 0.21));
      g.rotate(tx.style === 'cat' ? -0.05 : tx.style === 'dog' ? 0.05 : 0);
      g.scale(k, k);
      g.font = `italic 900 ${s}px Rubik`;
      g.lineJoin = 'round';
      if (tx.style === 'vs') {
        bolt(0, 0, s * 1.6, C.night);
        bolt(0, 0, s * 1.4, C.bolt);
        g.lineWidth = s * 0.16;
        g.strokeStyle = C.night;
        g.strokeText('VS', 0, 0);
        g.fillStyle = C.cream;
        g.fillText('VS', 0, 0);
      } else {
        g.lineWidth = s * 0.16;
        g.strokeStyle = C.night;
        g.strokeText(tx.word, 0, 0);
        g.fillStyle = tx.style === 'cat' ? C.rose : C.sky;
        g.fillText(tx.word, 0, 0);
      }
    }
    g.restore();
  }
  function wipe(dt) {
    const n = 6 / FPS;
    if (dt >= n) return;
    const p = dt / n;
    g.save();
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.beginPath();
    const x = -0.3 * W + p * 1.6 * W;
    g.moveTo(x - 0.25 * W, 0); g.lineTo(x + 0.05 * W, 0); g.lineTo(x - 0.05 * W, H); g.lineTo(x - 0.35 * W, H);
    g.closePath();
    g.fill();
    g.restore();
  }
  /** End card: the logo lands on a full-height bolt, PLAY FREE, pawlegends.app; a pencil paw print draws itself in. */
  function endCard(seg, t) {
    const dt = t - seg.t0;
    const u = U();
    // plum wash at the top for the lockup
    const grd = g.createLinearGradient(0, 0, 0, H * 0.75);
    grd.addColorStop(0, 'rgba(18,9,31,0.55)');
    grd.addColorStop(1, 'rgba(18,9,31,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, W, H);
    const lk = back((dt - 0.15) / 0.4);
    const logo = img.logo;
    const lw = (A === 'h' ? 0.36 * W : 0.72 * W) * (A === 's' ? 0.85 : 1);
    const lh = (lw * logo.height) / logo.width;
    const ly = A === 'h' ? 0.27 * H : A === 'v' ? 0.2 * H : 0.27 * H;
    // the bolt behind the logo
    const bk = out3(dt / 0.25);
    g.save();
    g.globalAlpha = 0.95 * bk;
    bolt(W / 2, ly, lh * 1.55 * bk, C.bolt);
    g.restore();
    if (lk > 0) {
      g.save();
      g.translate(W / 2, ly);
      const sc = 0.6 + 0.4 * lk;
      g.scale(sc, sc);
      g.globalAlpha = clamp(lk * 2);
      g.drawImage(logo, -lw / 2, -lh / 2, lw, lh);
      g.restore();
    }
    const tk = out3((dt - 0.6) / 0.35);
    if (tk > 0) {
      g.save();
      g.globalAlpha = tk;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const s1 = (A === 'h' ? 92 : 96) * u;
      const py = ly + lh * 0.62 + s1 * 0.9;
      g.font = `italic 900 ${s1}px Rubik`;
      g.lineJoin = 'round';
      g.lineWidth = s1 * 0.16;
      g.strokeStyle = C.night;
      g.strokeText('PLAY FREE', W / 2, py + (1 - tk) * 20 * u);
      g.fillStyle = C.cream;
      g.fillText('PLAY FREE', W / 2, py + (1 - tk) * 20 * u);
      const s2 = s1 * 0.55;
      g.font = `700 ${s2}px Fredoka`;
      g.lineWidth = s2 * 0.2;
      g.strokeText('pawlegends.app', W / 2, py + s1 * 0.95);
      g.fillStyle = C.bolt;
      g.fillText('pawlegends.app', W / 2, py + s1 * 0.95);
      // the pencil paw print beside the address
      const pk = clamp((dt - 1.0) / 0.8);
      const px = W / 2 + g.measureText('pawlegends.app').width / 2 + s2 * 1.1;
      paw(px, py + s1 * 0.95, s2 * 1.1, pk);
      g.restore();
    }
  }
  function paw(x, y, s, p) {
    if (p <= 0) return;
    g.save();
    g.translate(x, y);
    g.rotate(0.25);
    g.strokeStyle = C.cream;
    g.lineWidth = s * 0.08;
    g.lineCap = 'round';
    const pads = [[0, 0.18, 0.32, 0.26], [-0.32, -0.18, 0.12, 0.15], [-0.11, -0.36, 0.12, 0.15], [0.11, -0.36, 0.12, 0.15], [0.32, -0.18, 0.12, 0.15]];
    pads.forEach(([px, py, rx, ry], i) => {
      const q = clamp(p * 5 - i);
      if (q <= 0) return;
      g.beginPath();
      g.ellipse(px * s, py * s, rx * s, ry * s, 0, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * q);
      g.stroke();
    });
    g.restore();
  }
})();
