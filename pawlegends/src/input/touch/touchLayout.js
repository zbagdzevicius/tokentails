// Lifted from Pink Paw Knight (swordcat) at commit 7714dcb: src/ui/touchLayout.js
// Licence: all rights reserved, pending founder decision (POC.md §17, GDD §12 decision #3). Not MIT.
// Changes: relative imports rewritten by tools/lift-ppk.mjs; any later hand edit is marked "pawlegends:".
// src/ui/touchLayout.js  (owner: ui) — research/CONTROLS_SPEC.md §9 touch geometry and gesture rules, pure and
// unit-tested: the Wild Rift cluster (button centres / sizes for a viewport, touch size, orientation, mirror), the
// joystick zone, dead rings, and the free-area gesture classifier.
import { TOUCH, CAMERA } from '../../render/ppk/core/config.js';

/** Clamp the touch-size setting to the spec range (0.8–1.4). */
export const clampTs = (ts) => Math.max(0.8, Math.min(1.4, Number.isFinite(ts) ? ts : 1));

/** Placement priority: when a small screen can't fit every default button clear of her, the last ones go first. */
export const BUTTON_PRIORITY = Object.freeze(['attack', 'guard', 'dodge', 'ability', 'jump', 'trick', 'interact', 'milk', 'meow', 'golden']);

/**
 * TT3 Paw Trick ":3" button ([size, dx, dy] from the ⚔ centre, like TOUCH.buttons): laid out only when a trick is owned
 * (`computeLayout(w, h, { extra: TRICK_BUTTONS })`), so the cluster is unchanged before the first hand-over. Landscape:
 * above the kitten portrait; portrait: the right-hand column is full, so it sits left of her, above the joystick zone.
 */
export const TRICK_BUTTON = Object.freeze({ landscape: Object.freeze([60, -196, -212]), portrait: Object.freeze([60, -180, -460]) });

/**
 * Cluster layout for a viewport (CSS px). Returns { buttons: { name: { x, y, r, size } } (centres), dropped: [names],
 * anchor: { x, y }, portrait, scale, stickZone: { x0, y0, x1, y1 }, hudBottom, hero: { x, y }, cancel: { x, y, r } }.
 *   keepOut: screen rects { x0, y0, x1, y1 } (the HUD blocks, ❚❚) no default-placed button or the ✕ chip may overlap;
 *   noDrop: never drop a button that has no legal spot (the Edit-layout screen shows every button);
 *   hero: her screen point override (default heroPoint).
 * @param {number} w @param {number} h
 * @param {{ touchSize?: number, leftHanded?: boolean, safe?: { top?: number, right?: number, bottom?: number, left?: number },
 *   layout?: object|null, keepOut?: {x0:number,y0:number,x1:number,y1:number}[], noDrop?: boolean, hero?: {x:number,y:number},
 *   extra?: object }} [o]  extra: TT3 buttons laid out only when given (TRICK_BUTTON)
 */
export function computeLayout(w, h, o = {}) {
  const T = TOUCH, ts = clampTs(o.touchSize ?? 1), safe = o.safe ?? {};
  const portrait = h > w * 1.05;
  const k = ts * (portrait ? T.portraitScale : 1);
  const right = safe.right ?? 0, bottom = safe.bottom ?? 0, left = safe.left ?? 0, top = safe.top ?? 0;
  const mirror = !!o.leftHanded;
  const keep = Array.isArray(o.keepOut) ? o.keepOut.filter((r) => r && r.x1 > r.x0 && r.y1 > r.y0) : [];
  const ax = mirror ? left + T.anchor * Math.max(1, k) : w - right - T.anchor * Math.max(1, k);
  const ay = h - bottom - T.anchor * Math.max(1, k);
  const buttons = {};
  const table = portrait && T.buttonsPortrait ? T.buttonsPortrait : T.buttons;
  // TT3: extra buttons (the Paw Trick ":3") join the table only when asked for: { name: [size, dx, dy] } or
  // { name: { landscape: [...], portrait: [...] } }
  const rows = o.extra ? { ...table } : table;
  if (o.extra) for (const [n, v] of Object.entries(o.extra)) { const r = Array.isArray(v) ? v : (portrait ? v?.portrait : v?.landscape); if (Array.isArray(r) && r.length === 3) rows[n] = r; }
  for (const [name, [size, dx, dy]] of Object.entries(rows)) {
    const sz = Math.max(T.minBtn, size * k);
    let x = ax + (mirror ? -dx : dx) * k, y = ay + dy * k;
    // §9.2 Edit layout: settings.touchLayout offsets from the ⚔ anchor in unscaled, unmirrored px (portrait entries
    // are keyed `portrait:<name>`), so a custom layout follows touch size and the left-handed mirror
    const custom = o.layout?.[layoutKey(name, portrait)];
    if (Array.isArray(custom) && custom.length === 2 && custom.every(Number.isFinite)) { x = ax + (mirror ? -custom[0] : custom[0]) * k; y = ay + custom[1] * k; }
    buttons[name] = { x, y, r: sz / 2, size: sz };
  }
  // keep every button inside the viewport (and the Milk / Golden tops below the HUD strip)
  const hudBottom = h * 0.18 + top;
  for (const b of Object.values(buttons)) {
    b.x = Math.max(left + b.r + 4, Math.min(w - right - b.r - 4, b.x));
    b.y = Math.max(hudBottom + b.r, Math.min(h - bottom - b.r - 4, b.y));
  }
  const [zw, zh] = portrait ? T.stickZonePortrait : T.stickZone;
  const stickZone = mirror ? { x0: w * (1 - zw), x1: w, y0: h * (1 - zh), y1: h } : { x0: 0, x1: w * zw, y0: h * (1 - zh), y1: h };
  // hero clearance: no default-placed button (hit circle + dead ring) may reach into the disc around her on screen (or
  // a HUD keep-out), or taps on foes beside her land in a dead ring. Offenders slide to the nearest legal free spot,
  // shrink to the minimum size if none, and are dropped (lowest priority first) when even that fails. Custom
  // Edit-layout positions are the player's choice and stay put.
  const hero = o.hero ?? heroPoint(w, h, portrait);
  // the disc shrinks with the screen (heroClearR)
  const clearR = heroClearR(w, h), drop = heroDrop(w, h, portrait);
  const dropped = [];
  const isCustom = (name) => { const c = o.layout?.[layoutKey(name, portrait)]; return Array.isArray(c) && c.length === 2 && c.every(Number.isFinite); };
  const view = { w, h, left, right, bottom, top, yMin: hudBottom, hero, clearR, drop, ring: T.deadRing, zone: stickZone, keep };
  const prio = (n) => { const i = BUTTON_PRIORITY.indexOf(n); return i < 0 ? 99 : i; };
  const clearHero = () => {
    const all = Object.keys(buttons).sort((a, b) => prio(a) - prio(b));
    const bad = all.filter((n) => !isCustom(n) && !legal(buttons[n], buttons[n].r, view));
    const placed = all.filter((n) => !bad.includes(n));
    const queue = [...bad];
    while (queue.length) {
      const n = queue.shift(), b = buttons[n];
      const others = placed.map((m) => buttons[m]);
      let spot = freeSpot(b, b.r, others, view);
      if (!spot && b.r > T.minBtn / 2) { spot = freeSpot(b, T.minBtn / 2, others, view); if (spot) { b.r = T.minBtn / 2; b.size = T.minBtn; } }
      if (spot) { b.x = spot.x; b.y = spot.y; placed.push(n); continue; }
      if (o.noDrop || n === 'attack') { placed.push(n); continue; }
      // no room: a lower-priority default button gives up its spot (and re-queues), else this one is dropped
      const victim = placed.filter((m) => m !== 'attack' && !isCustom(m) && prio(m) > prio(n)).sort((a, c) => prio(c) - prio(a))[0];
      if (victim) {
        placed.splice(placed.indexOf(victim), 1);
        queue.unshift(n);
        queue.push(victim); queue.sort((a, c) => prio(a) - prio(c));
        continue;
      }
      delete buttons[n]; dropped.push(n);
    }
  };
  clearHero();
  // short screens at big touch sizes: the HUD clamp can squeeze the top row together; slide the smaller of an
  // overlapping pair sideways (away from the ⚔ side) until the 8 px gap holds
  const names = Object.keys(buttons);
  for (let it = 0; it < 8; it++) {
    let moved = false;
    for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
      const a = buttons[names[i]], b = buttons[names[j]];
      const gap = Math.hypot(a.x - b.x, a.y - b.y) - a.r - b.r;
      if (gap >= T.gap) continue;
      const m = a.r <= b.r ? a : b, o = m === a ? b : a;
      const dir = mirror ? 1 : -1;
      const dy = m.y - o.y, need = o.r + m.r + T.gap;
      const dxNeed = Math.sqrt(Math.max(0, need * need - dy * dy));
      m.x = o.x + dir * dxNeed;
      m.x = Math.max(left + m.r + 4, Math.min(w - right - m.r - 4, m.x));
      // pinned at the screen edge: slide it up instead
      if (Math.hypot(m.x - o.x, m.y - o.y) - m.r - o.r < T.gap) {
        const dx = m.x - o.x;
        m.y = Math.max(hudBottom + m.r, o.y - Math.sqrt(Math.max(0, need * need - dx * dx)));
      }
      moved = true;
    }
    if (!moved) break;
  }
  clearHero();                                                        // the squeeze may slide one back toward her
  // the ✕ chip (shown while aiming): its own free spot near the cluster's top corner, clear of every button, her and
  // the HUD keep-outs (it may sit in the HUD strip between them). It used to land on Milk.
  const cr = (T.cancelChip * Math.max(1, k)) / 2;
  const want = { x: mirror ? left + cr + 16 : w - right - cr - 16, y: hudBottom + cr + 8 };
  const chipView = { ...view, yMin: top + 4, ring: 0, clearR: Math.min(clearR, 60), zone: { x0: 0, x1: 0, y0: 0, y1: 0 } };
  const spot = freeSpot(want, cr, Object.values(buttons), chipView);
  const cancel = { x: spot?.x ?? want.x, y: spot?.y ?? want.y, r: cr };
  return { buttons, dropped, anchor: { x: ax, y: ay }, portrait, scale: k, stickZone, hudBottom, hero, clearR, drop, cancel };
}

/**
 * camera/IsoRig FRAME.herY: her focus height in a landscape view with no bottom inset (a touch view has none), so
 * IsoRig.isoFrameOffset(h, 0, false) = HER_Y − 0.5. Mirrored here (a unit test pins it to IsoRig) so the boot shell does
 * not import the camera rig (PERF §10.2).
 */
export const HER_Y = 0.48;

/** Hero clearance radius (CSS px) around her screen point that no button + dead ring may reach (TOUCH.heroClear). */
export const HERO_CLEAR = 120;

/** The hero disc radius for a viewport: HERO_CLEAR from a 430 px short side up, scaled down below it (she is drawn
 *  smaller on a short phone, and 9 buttons must still fit beside her: ≈ 105 px at 375, 89 px at 320). */
export function heroClearR(w, h) { return (TOUCH.heroClear ?? HERO_CLEAR) * Math.min(1, Math.min(w, h) / 430); }

/** How far (CSS px, at a 430 px short side) below the camera's rest point her chest can sit: AUTOCAM's lead-down lean
 *  draws her ≈ 25 px under `cam.heroScreen()` in landscape at rest (smoke ui:touch-cluster measured the Meow button's
 *  dead ring 3 px into her disc). The clearance disc is stretched down into a capsule by this much. */
export const HERO_DROP = 32;

/** The capsule's downward stretch for a viewport (scaled like heroClearR). Landscape only: in portrait her chest sits
 *  at (≈ 6 px above) the rest point, and a stretched disc there moved Golden Hour and the SafeFrame anchor with it. */
export function heroDrop(w, h, portrait = h > w * 1.05) { return portrait ? 0 : HERO_DROP * Math.min(1, Math.min(w, h) / 430); }

/** Distance (px) from (x, y) to her clearance axis: the rest point stretched `drop` px down. */
const heroDist = (x, y, hero, drop = 0) => Math.hypot(x - hero.x, y - Math.max(hero.y, Math.min(hero.y + drop, y)));

/**
 * Her focus on screen (CSS px) at rest (no lead), from the iso rig's own framing (camera/IsoRig.isoFrameOffset and
 * CAMERA.iso.frameOffsetTouchX, the numbers FollowCamera feeds setViewOffset on a touch device): landscape she sits
 * frameOffsetTouchX left of centre at FRAME.herY of the height (≈ 0.42 W, 0.48 H; a touch view has no bottom inset),
 * portrait centred, frameOffsetPortrait above the middle (≈ 0.40 H). Pure.
 */
export function heroPoint(w, h, portrait = h > w * 1.05) {
  const offY = portrait ? (CAMERA.iso?.frameOffsetPortrait ?? 0) : HER_Y - 0.5;
  const offX = portrait ? 0 : (CAMERA.iso?.frameOffsetTouchX ?? 0);
  return { x: w * (0.5 - offX), y: h * (0.5 + offY) };
}

/** Clearance (px) between a button's dead ring and the hero disc (a capsule `drop` px down, see heroDrop); < 0 = intrudes. */
export function heroGap(b, hero, clearR = HERO_CLEAR, drop = 0) {
  return heroDist(b.x, b.y, hero, drop) - b.r - TOUCH.deadRing - clearR;
}

/** Does a circle (x, y, r) overlap the rect? */
const hitsRect = (x, y, r, q) => {
  const nx = Math.max(q.x0, Math.min(q.x1, x)), ny = Math.max(q.y0, Math.min(q.y1, y));
  return Math.hypot(x - nx, y - ny) < r;
};

/** Is a centre legal for a circle of radius r: in the viewport, top edge at or below yMin, clear of her disc, the stick zone and the keep-outs. */
function legal(p, r, v) {
  const { x, y } = p;
  if (x - r < v.left + 4 - 1e-6 || x + r > v.w - v.right - 4 + 1e-6 || y - r < v.yMin - 1e-6 || y + r > v.h - v.bottom - 4 + 1e-6) return false;
  if (heroDist(x, y, v.hero, v.drop) - r - v.ring - v.clearR < -0.5) return false;
  const z = v.zone;
  if (z.x1 > z.x0 && x + r > z.x0 && x - r < z.x1 && y + r > z.y0 && y - r < z.y1) return false;
  return !v.keep.some((q) => hitsRect(x, y, r, q));
}

/** Nearest legal centre (4 px grid) to `b` for a circle of radius `r` among `others` (≥ TOUCH.gap from each). null when none. */
function freeSpot(b, r, others, v) {
  const x0 = v.left + r + 4, x1 = v.w - v.right - r - 4, y0 = Math.max(v.yMin + r, v.top + r + 4), y1 = v.h - v.bottom - r - 4;
  let best = null, bestD = Infinity;
  const p = { x: 0, y: 0 };
  for (let y = y0; y <= y1 + 1e-6; y += 4) {
    for (let x = x0; x <= x1 + 1e-6; x += 4) {
      const d = Math.hypot(x - b.x, y - b.y);
      if (d >= bestD) continue;
      p.x = x; p.y = y;
      if (!legal(p, r, v)) continue;
      if (others.some((q) => q !== b && Math.hypot(x - q.x, y - q.y) - r - q.r < TOUCH.gap)) continue;
      best = { x, y }; bestD = d;
    }
  }
  return best;
}

/** settings.touchLayout key for a button in an orientation. */
export function layoutKey(name, portrait) { return portrait ? `portrait:${name}` : name; }

/**
 * The stored offset for a button dropped at screen (x, y): unscaled, unmirrored px from the ⚔ anchor of `layout`
 * (the inverse of computeLayout's custom placement). Pure.
 * @param {ReturnType<typeof computeLayout>} layout @param {number} x @param {number} y @param {boolean} [mirror]
 * @returns {[number, number]}
 */
export function offsetFor(layout, x, y, mirror = false) {
  const k = layout.scale || 1;
  const dx = (x - layout.anchor.x) / k, dy = (y - layout.anchor.y) / k;
  return [Math.round(mirror ? -dx : dx), Math.round(dy)];
}

/**
 * Edit-layout validity: every pair of visible buttons keeps ≥ TOUCH.gap px apart and stays out of the HUD strip.
 * Returns the names of the buttons that break it (empty = OK). Pure.
 */
export function layoutConflicts(layout, names = Object.keys(layout.buttons)) {
  const bad = new Set();
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
    const a = layout.buttons[names[i]], b = layout.buttons[names[j]];
    if (!a || !b) continue;
    if (Math.hypot(a.x - b.x, a.y - b.y) - a.r - b.r < TOUCH.gap - 0.5) { bad.add(names[i]); bad.add(names[j]); }
  }
  return [...bad];
}

/** Smallest gap (px) between any two button hit circles of a layout (unit test: ≥ TOUCH.gap). */
export function minGap(layout, names = Object.keys(layout.buttons)) {
  let g = Infinity;
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
    const a = layout.buttons[names[i]], b = layout.buttons[names[j]];
    if (!a || !b) continue;
    g = Math.min(g, Math.hypot(a.x - b.x, a.y - b.y) - a.r - b.r);
  }
  return g;
}

/** The button whose circle contains (x, y), or null. */
export function buttonAt(layout, x, y, visible = null) {
  for (const [name, b] of Object.entries(layout.buttons)) {
    if (visible && !visible(name)) continue;
    if (Math.hypot(x - b.x, y - b.y) <= b.r) return name;
  }
  return null;
}

/** Is (x, y) inside a button's dead ring (taps there do nothing, §9.1)? */
export function inDeadRing(layout, x, y, visible = null) {
  for (const [name, b] of Object.entries(layout.buttons)) {
    if (visible && !visible(name)) continue;
    const d = Math.hypot(x - b.x, y - b.y);
    if (d > b.r && d <= b.r + TOUCH.deadRing) return true;
  }
  return false;
}

/** Is (x, y) inside the joystick zone? */
export function inStickZone(layout, x, y) {
  const z = layout.stickZone;
  return x >= z.x0 && x <= z.x1 && y >= z.y0 && y <= z.y1;
}

/**
 * Where the floating stick's base goes for a touch at (x, y): at least the stick radius (× touch size) plus a 4 px
 * margin inside the left, right and bottom edges (and the safe insets), so a thumb that lands near a corner can
 * still reach full deflection toward it. Pure.
 * @param {number} x @param {number} y @param {number} w @param {number} h @param {number} R stick radius (px)
 * @param {{ left?: number, right?: number, bottom?: number }} [safe]
 */
export function clampStickBase(x, y, w, h, R, safe = {}) {
  const m = R + 4;
  const x0 = (safe.left ?? 0) + m, x1 = w - (safe.right ?? 0) - m, y1 = h - (safe.bottom ?? 0) - m;
  return { x: x0 <= x1 ? Math.max(x0, Math.min(x1, x)) : w / 2, y: Math.min(y1, y) };
}

/**
 * §9.3 free-area gesture classifier for a single finished (or ongoing) pointer:
 *   'swipe' (≥ swipePx within swipeMs), 'tap' (≤ tapMs, ≤ tapPx, ≥ afterButton s after a cluster release),
 *   'long' (≥ longMs held, ≤ tapPx; reported while still down), or 'none'.
 * @param {{ dt: number, dist: number, up: boolean, sinceButton: number }} g  dt (s) since down, travel (px)
 */
export function classifyGesture(g) {
  const T = TOUCH;
  if (g.dist >= T.swipePx && g.dt <= T.swipeMs / 1000 + 1e-6) return 'swipe';
  if (g.dist <= T.tapPx) {
    if (!g.up && g.dt >= T.longMs / 1000) return 'long';
    if (g.up && g.dt <= T.tapMs / 1000 && g.sinceButton >= T.afterButton) return 'tap';
  }
  return 'none';
}

/** Floating joystick vector for a drag offset (px): { x, y (y+ = up/forward), kx, ky (knob px), follow } (§5.1). */
export function stickVector(dx, dy, R = TOUCH.stickR) {
  const L = Math.hypot(dx, dy);
  const k = L > R ? R / L : 1;
  const kx = dx * k, ky = dy * k;
  let x = kx / R, y = -ky / R;
  if (Math.hypot(x, y) < TOUCH.stickDead) { x = 0; y = 0; }
  return { x, y, kx, ky, follow: L > R * TOUCH.stickFollow ? L - R * TOUCH.stickFollow : 0 };
}
