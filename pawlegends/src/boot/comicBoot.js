/**
 * The boot loading screen (founder, Nov 18: "loading screen background image ... comics-like with captures of our
 * champs"): nine slanted comic panels of our champions behind the logo, with a progress bar and percentage.
 *
 * This file runs as a classic inline script at the top of index.html's <head> (vite.config.ts `comicBootPlugin` strips
 * `export` and wraps it): `comicStart` picks the panels and starts their pictures before any stylesheet or game script
 * is requested; a one-line script right after the #boot markup then calls `comicBoot` to build the panels.
 * The unit tests import it as a module (tests/unit/comic-boot.test.ts). Keep it plain ES2017, no imports.
 *
 * - The art: 12 square panels (6 cats, 6 dogs, every role; gemini, brand book v6 references) streamed from
 *   pawlegends.app (`pawlegends-web/public/pawlegends-art/loading/<hero>-640|1280.webp`, outside the game's 10 MB),
 *   so the native app and other hosts read them from https://pawlegends.app too. Bump COMIC_REV when a file changes.
 * - Every load shows 9 of them in a random order, cats and dogs alternating panel to panel.
 * - Before (or without, offline) the pictures, each panel is a brand-coloured CSS panel (rose for a cat, sky for a
 *   dog, halftone and a bolt); a picture fades in when it has loaded.
 * - The pictures must be on screen before the game's first heavy frame (a ~1.7 s main-thread block on a desktop, live
 *   check Nov 18: they arrived, but could not paint until the title was up). src/main.ts waits for `__plBootArt(cap)`
 *   (every picture loaded and faded in, or `cap` ms, then two frames) before it starts the app.
 * - Progress: eased towards 92 % over time, raised by the game (`window.__plBoot(pct)` from src/main.ts once the
 *   first-load JS ran), 100 % when the title is up (html[data-ready]); app.ts then fades the splash out and removes it.
 */

/** Cache key of the panel files on pawlegends.app (`?r=`): bump on every re-render of the art. */
export const COMIC_REV = 1;

/** The panels: hero id and side. File `loading/<id>-<640|1280>.webp`. */
export const COMIC_PANELS = [
  ['clem', 'cat'],
  ['sage', 'cat'],
  ['bengas', 'cat'],
  ['gabe', 'cat'],
  ['lambo', 'cat'],
  ['stilts', 'cat'],
  ['brutus', 'dog'],
  ['howler', 'dog'],
  ['chili', 'dog'],
  ['marshmallow', 'dog'],
  ['nugget', 'dog'],
  ['cacklejaw', 'dog'],
];

/**
 * Layouts in % of the screen. `lines`: the row borders, each [y at the left edge, y at the right edge]. `rows`: per row,
 * its inner cuts, each [x at the row's top, x at its bottom], and per panel its side pattern (`a` = the side drawn
 * first this load, `b` = the other), so neighbours differ. Outer edges bleed (no gutter at the screen edge).
 */
export const COMIC_LAYOUTS = {
  // landscape: five panels over four, the row border falling to the right behind the logo
  wide: {
    lines: [[0, 0], [55, 45], [100, 100]],
    rows: [
      { cuts: [[19, 23], [40, 36], [60, 64], [81, 77]], pattern: 'ababa' },
      { cuts: [[27, 23], [51, 47], [74, 78]], pattern: 'baba' },
    ],
  },
  // portrait (a phone before it turns, or a narrow window): three rows of three
  tall: {
    lines: [[0, 0], [35, 29], [68, 63], [100, 100]],
    rows: [
      { cuts: [[36, 32], [68, 64]], pattern: 'aba' },
      { cuts: [[30, 35], [64, 69]], pattern: 'bab' },
      { cuts: [[35, 31], [67, 64]], pattern: 'aba' },
    ],
  },
};

/** How many panels every layout has. */
export const COMIC_SLOTS = 9;

/** `pawlegends.app` itself reads the art same-origin; every other host (the app, previews, dev) reads it from there. */
export function comicRoot(host) {
  return host === 'pawlegends.app' || host === 'www.pawlegends.app' ? '/pawlegends-art/loading/' : 'https://pawlegends.app/pawlegends-art/loading/';
}

/** A panel picture's URL. */
export function comicUrl(root, id, size) {
  return root + id + '-' + size + '.webp?r=' + COMIC_REV;
}

/**
 * 640 px pictures unless a panel is drawn over ~760 device pixels (big screens, retina laptops; a phone's 3x counts as
 * 2x). Always 640 on a slow connection or with data saving on (`slow`): the 1280 set is ~1 MB, and on a slow 3G
 * desktop it arrived ~4 s after the 640 set and held the game's own files back (live check Nov 18).
 */
export function comicSize(w, h, dpr, slow) {
  if (slow) return 640;
  const wide = w >= h;
  const panelPx = Math.max(wide ? (w / 4) * 1.3 : w / 3, wide ? h / 2 : h / 3) * Math.min(dpr || 1, 2);
  return panelPx > 760 ? 1280 : 640;
}

function shuffle(list, rnd) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

/**
 * The 9 panels for one load, in slot order of `layout` (its side pattern): `a` sides get one side's panels, `b` the
 * other's, each side shuffled; which side is `a` is random too.
 */
export function pickComic(rnd, layout) {
  const r = rnd || Math.random;
  const pattern = (layout || COMIC_LAYOUTS.wide).rows.map((row) => row.pattern).join('');
  const cats = shuffle(COMIC_PANELS.filter((p) => p[1] === 'cat'), r);
  const dogs = shuffle(COMIC_PANELS.filter((p) => p[1] === 'dog'), r);
  const aIsCat = r() < 0.5;
  const out = [];
  for (let i = 0; i < pattern.length; i++) {
    const cat = (pattern[i] === 'a') === aIsCat;
    out.push((cat ? cats : dogs).shift());
  }
  return out.map((p) => ({ id: p[0], side: p[1] }));
}

const at = (line, x) => line[0] + ((line[1] - line[0]) * x) / 100;
const pt = (x, dx, y, dy) => (dx ? 'calc(' + x.toFixed(2) + '% ' + (dx > 0 ? '+' : '-') + ' var(--cm-g))' : x.toFixed(2) + '%') + ' ' + (dy ? 'calc(' + y.toFixed(2) + '% ' + (dy > 0 ? '+' : '-') + ' var(--cm-g))' : y.toFixed(2) + '%');

/**
 * The slots of a layout: per panel a CSS clip-path polygon (inset by `--cm-g`, half the gutter, on inner edges) and
 * the panel's bounding box in % (where its picture is drawn, cover-fitted).
 */
export function comicSlots(layout) {
  const slots = [];
  layout.rows.forEach((row, r) => {
    const top = layout.lines[r];
    const bot = layout.lines[r + 1];
    const innerTop = r > 0;
    const innerBot = r < layout.rows.length - 1;
    const cuts = [[0, 0]].concat(row.cuts, [[100, 100]]);
    for (let i = 0; i + 1 < cuts.length; i++) {
      const L = cuts[i];
      const R = cuts[i + 1];
      const innerL = i > 0;
      const innerR = i + 2 < cuts.length;
      const tl = [L[0], at(top, L[0])];
      const tr = [R[0], at(top, R[0])];
      const br = [R[1], at(bot, R[1])];
      const bl = [L[1], at(bot, L[1])];
      const clip =
        'polygon(' +
        [
          pt(tl[0], innerL ? 1 : 0, tl[1], innerTop ? 1 : 0),
          pt(tr[0], innerR ? -1 : 0, tr[1], innerTop ? 1 : 0),
          pt(br[0], innerR ? -1 : 0, br[1], innerBot ? -1 : 0),
          pt(bl[0], innerL ? 1 : 0, bl[1], innerBot ? -1 : 0),
        ].join(', ') +
        ')';
      const xs = [tl[0], tr[0], br[0], bl[0]];
      const ys = [tl[1], tr[1], br[1], bl[1]];
      const x0 = Math.min.apply(null, xs);
      const y0 = Math.min.apply(null, ys);
      slots.push({ clip, box: { left: x0, top: y0, width: Math.max.apply(null, xs) - x0, height: Math.max.apply(null, ys) - y0 } });
    }
  });
  return slots;
}

/** Progress shown at `ms` after start: eased towards 92 %, never below the floor the game reported. */
export function comicProgress(ms, floor) {
  return Math.min(100, Math.max(floor || 0, 92 * (1 - Math.exp(-ms / 2600))));
}

/** How long a picture's fade-in takes (index.html `#boot .cm img` transition). */
export const COMIC_FADE_MS = 250;

/**
 * Runs first, in <head>: picks this load's panels and starts their pictures (high priority). Returns the state
 * `comicBoot` builds from, also kept on `window.__plComic`.
 */
export function comicStart(win) {
  const tallMq = win.matchMedia ? win.matchMedia('(orientation: portrait)') : null;
  const picks = pickComic(Math.random, tallMq && tallMq.matches ? COMIC_LAYOUTS.tall : COMIC_LAYOUTS.wide);
  const base = comicRoot(win.location ? win.location.hostname : '');
  const net = win.navigator && win.navigator.connection;
  const slow = !!net && (net.saveData === true || /(^|-)(2g|3g)$/.test(net.effectiveType || ''));
  const size = comicSize(win.innerWidth || 1280, win.innerHeight || 720, win.devicePixelRatio || 1, slow);
  const state = { picks, tallMq, imgs: [], done: 0, lastIn: 0, onDone: [] };
  picks.forEach((p, i) => {
    const img = new win.Image();
    img.alt = '';
    img.decoding = 'async';
    img.setAttribute('fetchpriority', 'high');
    const settle = (ok) => {
      if (img.__settled) return;
      img.__settled = ok ? 'ok' : 'err';
      state.done++;
      state.onDone.forEach((f) => f(i, ok));
    };
    img.onload = () => settle(true);
    img.onerror = () => settle(false);
    img.src = comicUrl(base, p.id, size);
    state.imgs.push(img);
  });
  win.__plComic = state;
  return state;
}

/** Runs in the page right after the #boot markup: fills #boot's panels, shows the pictures, starts the progress. */
export function comicBoot(doc, win) {
  const root = doc.getElementById('boot');
  const stage = root && root.querySelector('.cm');
  if (!stage) return;
  const state = win.__plComic || comicStart(win);
  const tallMq = state.tallMq;
  const layoutNow = () => (tallMq && tallMq.matches ? COMIC_LAYOUTS.tall : COMIC_LAYOUTS.wide);
  const panels = state.picks.map((p, i) => {
    const b = doc.createElement('b');
    b.className = p.side + ' v' + (i % 3);
    // a slow ken-burns per panel, each drifting its own way (CSS: off with reduced motion)
    b.style.setProperty('--kx', ((i % 2 ? 1 : -1) * (1 + (i % 3))).toFixed(0) + '%');
    b.style.setProperty('--ky', ((i % 3) - 1).toFixed(0) + '%');
    b.style.setProperty('--kd', (-1.3 * i).toFixed(1) + 's');
    // the panel's own box (its fallback colours and its picture), inside the clipped full-screen layer
    const box = doc.createElement('s');
    box.appendChild(state.imgs[i]);
    b.appendChild(box);
    stage.appendChild(b);
    return b;
  });
  const show = (i, ok) => {
    if (!ok || !panels[i]) return;
    panels[i].classList.add('in');
    state.lastIn = Date.now();
  };
  state.imgs.forEach((img, i) => show(i, img.__settled === 'ok'));
  state.onDone.push(show);
  const place = () => {
    comicSlots(layoutNow()).forEach((s, i) => {
      const b = panels[i];
      if (!b) return;
      b.style.clipPath = s.clip;
      b.style.webkitClipPath = s.clip;
      const box = b.firstChild.style;
      box.left = s.box.left + '%';
      box.top = s.box.top + '%';
      box.width = s.box.width + '%';
      box.height = s.box.height + '%';
    });
  };
  place();
  if (tallMq) {
    if (tallMq.addEventListener) tallMq.addEventListener('change', place);
    else if (tallMq.addListener) tallMq.addListener(place);
  }

  // the game waits for this before its first heavy frame (src/main.ts): every picture settled and faded in, or `cap`
  // ms, then two frames so the pictures are painted
  win.__plBootArt = (cap) =>
    new Promise((resolve) => {
      const t = Date.now();
      // two frames, or 100 ms when frames do not come (a hidden tab must still boot)
      const frames = () => {
        win.setTimeout(resolve, 100);
        if (win.requestAnimationFrame) win.requestAnimationFrame(() => win.requestAnimationFrame(() => resolve()));
      };
      const check = () => {
        const now = Date.now();
        if (!root.isConnected || now - t >= (cap || 0) || (state.done >= state.imgs.length && now - state.lastIn >= COMIC_FADE_MS)) frames();
        else win.setTimeout(check, 30);
      };
      check();
    });

  // progress
  const fill = root.querySelector('.cm-bar u');
  const pct = root.querySelector('.cm-pct');
  const t0 = Date.now();
  let floor = 0;
  let shown = -1;
  const html = doc.documentElement;
  const draw = () => {
    const ready = html.getAttribute('data-ready') === '1';
    const p = Math.floor(ready ? 100 : comicProgress(Date.now() - t0, floor));
    if (p !== shown) {
      shown = p;
      if (fill) fill.style.transform = 'scaleX(' + p / 100 + ')';
      if (pct) pct.textContent = p + '%';
    }
    return ready || !root.isConnected;
  };
  win.__plBoot = (p) => {
    floor = Math.max(floor, Number(p) || 0);
    draw();
  };
  draw();
  const timer = win.setInterval(() => {
    if (draw()) win.clearInterval(timer);
  }, 120);
}
