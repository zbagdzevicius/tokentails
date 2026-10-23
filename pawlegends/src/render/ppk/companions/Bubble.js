// Lifted from Pink Paw Knight (swordcat) at commit 7714dcb: src/companions/Bubble.js
// Licence: all rights reserved, pending founder decision (POC.md §17, GDD §12 decision #3). Not MIT.
// Changes: relative imports rewritten by tools/lift-ppk.mjs; any later hand edit is marked "pawlegends:".
// src/companions/Bubble.js  (owner: companions) — world-space speech bubbles (§6: "a small speech bubble over the
// speaker for 1.6 s") and the napping "zzz" (§9.1), as screen-sized sprites with CanvasTexture text.
// Parchment + ink look per art.md §13 (cute medieval parchment, pink accent). No DOM at import: canvases are
// created on first use and the whole thing is a no-op where `document` is missing (node unit tests).
// TOKENTAILS-PLAN §10.2.9: a bubble whose speaker is off screen (or behind the lens) is pinned to the screen edge on
// the speaker's side (where the guide's coin arrow points), `pinned` true; the tail then points at that edge.
import * as THREE from 'three';
import { easeOutBack, clamp01 } from '../core/math.js';

const HAS_DOM = () => typeof document !== 'undefined' && typeof document.createElement === 'function';
// TOKENTAILS-PLAN §10.4 (G1): Token Tails' Nunito (700 text, 800 zzz) on the canvas, rounded system faces until it loads
const FONT = '"Nunito", "Segoe UI Rounded", "SF Pro Rounded", "Trebuchet MS", "Segoe UI", sans-serif';
export const BUBBLE_FONT = FONT;
export const BUBBLE_WEIGHT = Object.freeze({ text: 700, zzz: 800 });
const INK = '#3B2A20', PAPER = '#F7EFDD', PAPER_EDGE = '#E2D2B0', PINK = '#F2A2B8';

/** Word-wrap `text` to at most `maxChars` per line (3 lines max, ellipsis after). */
export function wrapText(text, maxChars = 24, maxLines = 3) {
  const words = String(text ?? '').split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if (!cur) cur = w;
    else if ((cur + ' ' + w).length <= maxChars) cur += ' ' + w;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = lines[maxLines - 1].replace(/\W*$/, '') + '…'; }
  return lines.length ? lines : [''];
}

/** Screen-edge margin for speech bubbles, in CSS px (review r2: barks were clipped by the screen edge). */
export const BUBBLE_MARGIN_PX = 16;

/**
 * The HUD's safe insets (CSS px from each canvas edge, plus the canvas size they were measured against: {top, bottom,
 * w, h}) — `ctx.ui.safeInsets` (UI._measureSafe: the ability bar at the bottom, the boss plate at the top). Bubbles are
 * kept clear of them so an iso-view bark near the bottom edge never slides under the ability bar. Set once by the
 * CompanionManager (every TextSprite — companions, NPCs, story/enemy barks — shares it); null = screen margins only.
 * @type {null | (() => ({top?: number, bottom?: number, h?: number} | null | undefined))}
 */
let safeInsetsOf = null;
/** @param {null | (() => ({top?: number, bottom?: number, h?: number} | null | undefined))} fn */
export function setBubbleSafeInsets(fn) { safeInsetsOf = typeof fn === 'function' ? fn : null; }

/**
 * TT5: true while a modal message is up (`ctx.ui.messages.p0`: the shelter card, the results, the Kitten-mode offer).
 * World bubbles are canvas sprites, so the UI's CSS cannot hide them; they draw fully transparent instead and come
 * back as they were when the modal closes. Set once by the CompanionManager; null = never hushed.
 * @type {null | (() => boolean)}
 */
let hushOf = null;
/** @param {null | (() => boolean)} fn */
export function setBubbleHush(fn) { hushOf = typeof fn === 'function' ? fn : null; }
/** @returns {boolean} */
export function bubblesHushed() { try { return !!hushOf?.(); } catch { return false; } }

/**
 * TT5 verify round: screen boxes no world bubble may sit on (the centre card and the toast stack on tablets and
 * desktops; on phones a card hushes the bubbles instead, `setBubbleHush`). The function returns `{ w, h, rects }`:
 * `rects` in CSS px of the canvas, measured on a `w` × `h` canvas (null = none). Set once by the CompanionManager.
 * @type {null | (() => ({ w: number, h: number, rects: {x:number,y:number,w:number,h:number}[] } | null | undefined))}
 */
let blocksOf = null;
/** @param {null | (() => ({ w: number, h: number, rects: {x:number,y:number,w:number,h:number}[] } | null | undefined))} fn */
export function setBubbleBlockers(fn) { blocksOf = typeof fn === 'function' ? fn : null; }
/** NDC boxes of the blockers, reused (no per-frame allocation). */
const BLOCK_NDC = [];
/** @returns {number} how many BLOCK_NDC entries are filled */
function blockerBoxes() {
  let b = null;
  try { b = blocksOf?.(); } catch { b = null; }
  const n = b?.w > 0 && b?.h > 0 && Array.isArray(b.rects) ? b.rects.length : 0;
  for (let i = 0; i < n; i++) {
    const r = b.rects[i], o = BLOCK_NDC[i] ?? (BLOCK_NDC[i] = { x0: 0, x1: 0, y0: 0, y1: 0 });
    o.x0 = (r.x / b.w) * 2 - 1; o.x1 = ((r.x + r.w) / b.w) * 2 - 1;
    o.y1 = 1 - (r.y / b.h) * 2; o.y0 = 1 - ((r.y + r.h) / b.h) * 2;
  }
  return n;
}

/**
 * The showing bubbles' last screen boxes, in CSS px of a `w` × `h` canvas (the centre card stays off them on tablets
 * and desktops, ui/messages.js). Hushed or faded bubbles are left out. Pushes into `out` and returns it.
 * @param {{x:number,y:number,w:number,h:number}[]} out @param {number} w @param {number} h
 */
export function liveBubbleRects(out, w, h) {
  if (bubblesHushed()) return out;
  for (const o of LIVE) {
    const n = o.ndc;
    if (!n.ok || !o.sprite?.visible || o.opacity < 0.05) continue;
    out.push({ x: ((n.x0 + 1) / 2) * w, y: ((1 - n.y1) / 2) * h, w: ((n.x1 - n.x0) / 2) * w, h: ((n.y1 - n.y0) / 2) * h });
  }
  return out;
}

/**
 * Pure clamp: how far (in NDC) to shift a bubble so its rect stays inside the screen minus a margin.
 * The rect is given relative to the anchor (the speaker's projected point): x from ax+l to ax+r, y from ay+b to ay+t.
 * A rect larger than the usable span is centred in it. Returns {dx, dy}.
 * @param {number} ax @param {number} ay @param {number} l @param {number} r @param {number} b @param {number} t
 * @param {number} mx margin in NDC x @param {number} my margin in NDC y
 * @param {number} [myLo] bottom margin in NDC (defaults to `my`; the HUD-safe bottom) @param {number} [myHi] top margin
 */
export function clampShift(ax, ay, l, r, b, t, mx, my, myLo = my, myHi = my) {
  const axis = (a, lo, hi, mLo, mHi) => {
    const min = -1 + mLo, max = 1 - mHi;
    if (hi - lo >= max - min) return (min + max) / 2 - (a + (lo + hi) / 2); // too big: centre it in the usable span
    if (a + lo < min) return min - (a + lo);
    if (a + hi > max) return max - (a + hi);
    return 0;
  };
  return { dx: axis(ax, l, r, mx, mx), dy: axis(ay, b, t, myLo, myHi) };
}

/**
 * TT5 (founder: "banners overlap too much"): two bubbles never cover each other, and a bubble that is not hers never
 * covers Clem. Her own bubble keeps its place over her head; every other bubble steps out of the way of hers and of
 * the older ones (the nearest free spot above, below or beside them); an older one never moves for a newer one.
 * `setBubblePlayer` (CompanionManager) gives her `{ object3d, pos, height }`.
 * @type {null | (() => any)}
 */
let playerOf = null;
/** @param {null | (() => any)} fn */
export function setBubblePlayer(fn) { playerOf = typeof fn === 'function' ? fn : null; }
/** Bubbles that are showing (TextSprite, kind 'bubble'); each keeps its last screen rect in NDC. */
const LIVE = new Set();
let showSeq = 0;
/** NDC gap kept between two stacked boxes (about 6 px on a 720 px screen). */
const STACK_GAP = 0.016;
/** Extra cost of moving a bubble down (its tail then points away from the speaker), in NDC screen units. */
export const DOWN_BIAS = 0.3;

/**
 * Pure: where box `me` ({x0, x1, y0, y1}, NDC) goes so it covers none of `obs`. Candidates: where it is, and just
 * above, below, left and right of each box; those inside `lim` ({top, bottom, left, right}) are kept. The nearest free
 * one wins (distance in screen units: `aspect` = width / height; above beats below beats beside on a tie). With no free
 * spot it stays where it is. Returns `{ dx, dy }`.
 * @param {{x0:number,x1:number,y0:number,y1:number}} me @param {{x0:number,x1:number,y0:number,y1:number}[]} obs
 * @param {{top:number,bottom:number,left:number,right:number}} lim @param {number} [aspect] @param {number} [gap]
 */
export function stackPlace(me, obs, lim, aspect = 1, gap = STACK_GAP) {
  const gx = gap / Math.max(0.2, aspect);
  const free = (dx, dy) => {
    const x0 = me.x0 + dx, x1 = me.x1 + dx, y0 = me.y0 + dy, y1 = me.y1 + dy;
    if (y1 > lim.top + 1e-9 || y0 < lim.bottom - 1e-9 || x0 < lim.left - 1e-9 || x1 > lim.right + 1e-9) return false;
    for (const o of obs) {
      if (Math.min(x1, o.x1 + gx * 0.5) - Math.max(x0, o.x0 - gx * 0.5) > 0 && Math.min(y1, o.y1 + gap * 0.5) - Math.max(y0, o.y0 - gap * 0.5) > 0) return false;
    }
    return true;
  };
  const out = { dx: 0, dy: 0 };
  if (free(0, 0)) return out;
  let best = Infinity;
  const consider = (dx, dy, bias) => {
    const cost = Math.hypot(dx * aspect, dy) + bias;
    if (cost < best && free(dx, dy)) { best = cost; out.dx = dx; out.dy = dy; }
  };
  // A box moved below its anchor has its tail pointing down, away from the speaker: only when nothing above or
  // beside is near (DOWN_BIAS in screen units).
  for (const o of obs) {
    consider(0, o.y1 + gap - me.y0, 0);
    consider(0, o.y0 - gap - me.y1, DOWN_BIAS);
    consider(o.x0 - gx - me.x1, 0, 2e-6);
    consider(o.x1 + gx - me.x0, 0, 2e-6);
  }
  return out;
}

const _anchor = new THREE.Vector3();
const _pv = new THREE.Vector3();
const _size = new THREE.Vector2();
const _sx = new THREE.Vector3(), _sy = new THREE.Vector3();

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y);
  g.closePath();
}

/**
 * One reusable text sprite (speech bubble or zzz). `object` is added under the speaker's object3d.
 */
export class TextSprite {
  /** @param {{kind?: 'bubble'|'zzz', y?: number, scale?: number}} [o] */
  constructor({ kind = 'bubble', y = 1.2, scale = kind === 'zzz' ? 0.05 : 0.125 } = {}) {
    this.kind = kind; this.y = y; this.baseScale = scale;
    this.object = new THREE.Group(); this.object.name = 'bubble:' + kind;
    this.object.position.y = y;
    this.t = 0; this.dur = 0; this.on = false; this.text = '';
    /** the speaker is off screen: the bubble is pinned to the screen edge (§10.2.9) */
    this.pinned = false;
    this.sprite = null; this.canvas = null; this.tex = null; this.aspect = 1;
    /** TT5: show order (older bubbles keep their place) and the last drawn body rect in NDC (stacking) */
    this.seq = 0; this.rank = 1; this.ndc = { x0: 0, x1: 0, y0: 0, y1: 0, ok: false };
    if (!HAS_DOM()) return;
    this.canvas = document.createElement('canvas');
    this.canvas.width = 512; this.canvas.height = kind === 'zzz' ? 256 : 256;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.minFilter = THREE.LinearFilter; this.tex.generateMipmaps = false;
    // colour 0.85: the paper stays under the bloom threshold (RENDER.bloom 0.85), so the ink stays crisp
    const mat = new THREE.SpriteMaterial({ map: this.tex, color: new THREE.Color(0.85, 0.85, 0.85), transparent: true, depthTest: false,
      depthWrite: false, fog: false, toneMapped: false, sizeAttenuation: false });
    this.sprite = new THREE.Sprite(mat);
    this.sprite.center.set(0.5, 0);
    this.sprite.renderOrder = 999;
    this.sprite.visible = false;
    /** tail tip x on the canvas (px) the texture was last drawn with; bubble body rect (canvas px) */
    this.tailX = 256; this.body = null;
    /** opacity the animation wants; the render hook applies it, or 0 while a modal hushes bubbles (TT5) */
    this.opacity = 1;
    this.sprite.onBeforeRender = (renderer, _scene, camera) => {
      this.sprite.material.opacity = bubblesHushed() ? 0 : this.opacity;
      if (this.kind === 'bubble') this._clampToScreen(renderer, camera);
    };
    this.object.add(this.sprite);
  }

  /** Show `text` for `dur` seconds (Infinity = until hide()). */
  show(text, dur = 1.6) {
    if (!this.on || text !== this.text) this.seq = ++showSeq;
    this.on = true; this.t = 0; this.dur = dur; this.opacity = 1;
    if (this.kind === 'bubble') { this.ndc.ok = false; LIVE.add(this); }
    if (this.sprite && text !== this.text) { this.sprite.center.set(0.5, 0); this._draw(text, this.canvas.width / 2); }
    this.text = text;
    if (this.sprite) this.sprite.visible = true;
  }

  hide() { this.on = false; this.t = 0; if (this.sprite) this.sprite.visible = false; LIVE.delete(this); this.ndc.ok = false; }

  get visible() { return this.on; }

  /**
   * Keep the bubble's body inside the viewport (BUBBLE_MARGIN_PX) and off the HUD (setBubbleSafeInsets) by sliding the sprite around its anchor
   * (sprite.center), and redraw the tail so its tip still sits on the speaker. Runs right before the sprite renders,
   * with the rendering camera, so it works for any camera/viewport. Exposed for tests.
   * @param {{getSize: (v: THREE.Vector2) => THREE.Vector2}} renderer @param {THREE.Camera} camera
   */
  _clampToScreen(renderer, camera) {
    const sp = this.sprite, body = this.body;
    if (!sp || !body || !camera?.projectionMatrix) return;
    renderer?.getSize?.(_size);
    const pw = _size.x > 0 ? _size.x : 1280, ph = _size.y > 0 ? _size.y : 720;
    _anchor.setFromMatrixPosition(sp.matrixWorld);
    _anchor.applyMatrix4(camera.matrixWorldInverse);
    const behind = camera.isPerspectiveCamera && _anchor.z >= 0;
    _anchor.applyMatrix4(camera.projectionMatrix);
    // behind the lens: mirror it so it pins to the edge on the speaker's side (a guide line must stay readable)
    if (behind) { _anchor.x = -_anchor.x * 4; _anchor.y = -_anchor.y * 4; if (Math.abs(_anchor.x) + Math.abs(_anchor.y) < 1e-3) _anchor.y = -2; }
    this.pinned = behind || Math.abs(_anchor.x) > 1 || Math.abs(_anchor.y) > 1;
    // sizeAttenuation:false sprite → its NDC size is worldScale × P00 / P11 regardless of depth
    const e = camera.projectionMatrix.elements;
    const W = _sx.setFromMatrixColumn(sp.matrixWorld, 0).length() * e[0];
    const H = _sy.setFromMatrixColumn(sp.matrixWorld, 1).length() * e[5];
    if (!(W > 0 && H > 0)) return;
    const cw = this.canvas.width, ch = this.canvas.height;
    // body rect relative to the anchor at the default centre (0.5, 0): x right, y up (the tail tip is the bottom)
    const l = (body.x / cw - 0.5) * W, r = ((body.x + body.w) / cw - 0.5) * W;
    const t = (1 - body.y / ch) * H, b = 0;
    // HUD-safe insets (CSS px of the canvas rect they were measured on → this viewport's px), on top of the margin
    let si = null;
    try { si = safeInsetsOf?.(); } catch { si = null; }
    const k = si?.h > 0 ? ph / si.h : 1;
    const insB = Math.min(ph * 0.45, Math.max(0, (si?.bottom ?? 0) * k)), insT = Math.min(ph * 0.45, Math.max(0, (si?.bubbleTop ?? si?.top ?? 0) * k));
    const myLo = ((insB + BUBBLE_MARGIN_PX) * 2) / ph, myHi = ((insT + BUBBLE_MARGIN_PX) * 2) / ph;
    let { dx, dy } = clampShift(_anchor.x, _anchor.y, l, r, b, t, (BUBBLE_MARGIN_PX * 2) / pw, (BUBBLE_MARGIN_PX * 2) / ph, myLo, myHi);
    // TT5: off her own bubble, the older bubbles and Clem herself (her own bubble only keeps off her other one)
    const me = this.ndc, own = this._own();
    this.rank = own ? 0 : 1;
    me.x0 = _anchor.x + dx + l; me.x1 = _anchor.x + dx + r; me.y0 = _anchor.y + dy + b; me.y1 = _anchor.y + dy + t;
    const obs = this._obs ?? (this._obs = []);
    obs.length = 0;
    for (const o of LIVE) {
      if (o === this || !o.ndc.ok || !o.sprite?.visible || o.opacity < 0.05) continue;
      if (o.rank > this.rank || (o.rank === this.rank && o.seq > this.seq)) continue;
      obs.push(o.ndc);
    }
    const pb = own ? null : this._playerBox(camera, pw, ph);
    if (pb) obs.push(pb);
    // the centre card and the toasts (tablet / desktop; a phone hushes bubbles under a card instead)
    const nb = blockerBoxes();
    for (let i = 0; i < nb; i++) obs.push(BLOCK_NDC[i]);
    if (obs.length) {
      const mx = (BUBBLE_MARGIN_PX * 2) / pw, lim = this._lim ?? (this._lim = { top: 0, bottom: 0, left: 0, right: 0 });
      lim.top = 1 - myHi; lim.bottom = -1 + myLo; lim.left = -1 + mx; lim.right = 1 - mx;
      const at = stackPlace(me, obs, lim, pw / ph);
      if (at.dx || at.dy) { dx += at.dx; dy += at.dy; me.x0 += at.dx; me.x1 += at.dx; me.y0 += at.dy; me.y1 += at.dy; }
    }
    me.ok = true;
    sp.center.set(0.5 - dx / W, -dy / H);
    // tail tip stays on the speaker (canvas u = center.x), kept inside the body's rounded corners
    const want = Math.round(Math.min(body.x + body.w - 34, Math.max(body.x + 34, sp.center.x * cw)) / 4) * 4;
    if (want !== this.tailX) this._draw(this.text, want);
  }

  /** Is this Clem's own bubble (parented under her)? */
  _own() {
    let pl = null;
    try { pl = playerOf?.(); } catch { pl = null; }
    const o3 = pl?.object3d;
    if (!o3) return false;
    for (let n = this.object.parent; n; n = n.parent) if (n === o3) return true;
    return false;
  }

  /** Clem's body box in NDC (feet to just over her ears), or null (no player, a pinned bubble). */
  _playerBox(camera, pw, ph) {
    let pl = null;
    try { pl = playerOf?.(); } catch { pl = null; }
    const pos = pl?.pos;
    if (!pos || this.pinned) return null;
    const box = this._pbox ?? (this._pbox = { x0: 0, x1: 0, y0: 0, y1: 0 });
    _pv.set(pos.x, pos.y, pos.z).project(camera);
    if (!(Math.abs(_pv.z) <= 1)) return null;
    const fx = _pv.x, fy = _pv.y;
    _pv.set(pos.x, pos.y + (pl.height ?? 1) * 1.05, pos.z).project(camera);
    const hy = _pv.y, hNdc = Math.abs(hy - fy);
    if (!(hNdc > 0)) return null;
    const half = hNdc * 0.45 * (ph / pw);
    box.x0 = fx - half; box.x1 = fx + half; box.y0 = Math.min(fy, hy); box.y1 = Math.max(fy, hy);
    return box;
  }

  _draw(text, tailX = this.canvas.width / 2) {
    const c = this.canvas, g = c?.getContext?.('2d');
    if (!g) return;
    // drawn before Nunito arrived (a fallback face): redraw once the document's fonts are ready
    const fonts = typeof document !== 'undefined' ? document.fonts : null;
    if (fonts && !this._fontWait && typeof fonts.check === 'function' && !fonts.check(`${BUBBLE_WEIGHT.text} 40px "Nunito"`)) {
      this._fontWait = true;
      Promise.resolve(fonts.ready).then(() => { if (this.canvas && this.text) this._draw(this.text, this.tailX); }).catch(() => {});
    }
    g.clearRect(0, 0, c.width, c.height);
    if (this.kind === 'zzz') {
      g.font = `${BUBBLE_WEIGHT.zzz} 88px ${FONT}`; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
      g.lineJoin = 'round'; g.lineWidth = 14; g.strokeStyle = 'rgba(59,42,32,0.85)'; g.fillStyle = '#EAF2FF';
      const parts = [['z', 40, 220, 64], ['Z', 150, 160, 88], ['z', 280, 96, 64]];
      for (const [s, x, y, size] of parts) { g.font = `${BUBBLE_WEIGHT.zzz} ${size}px ${FONT}`; g.strokeText(s, x, y); g.fillText(s, x, y); }
      this.aspect = c.width / c.height;
    } else {
      const lines = wrapText(text, 24, 3);
      const fs = 40, lh = 48, padX = 26, padY = 18, tail = 26;
      g.font = `${BUBBLE_WEIGHT.text} ${fs}px ${FONT}`;
      let w = 0; for (const l of lines) w = Math.max(w, g.measureText(l).width);
      const bw = Math.min(c.width - 8, Math.ceil(w + padX * 2)), bh = lines.length * lh + padY * 2;
      // fixed 512 × 256 canvas (a CanvasTexture can't change size once uploaded): the bubble sits on the bottom edge,
      // its tail tip at the sprite's anchor; 3 lines (bh 180 + tail) still fit
      const x = (c.width - bw) / 2, y = Math.max(4, c.height - 6 - tail - bh);
      const tx = Math.min(x + bw - 34, Math.max(x + 34, tailX));
      this.body = { x, y, w: bw, h: bh }; this.tailX = tailX;
      g.fillStyle = 'rgba(40,28,20,0.25)'; roundRect(g, x + 4, y + 6, bw, bh, 22); g.fill();
      g.fillStyle = PAPER; g.strokeStyle = INK; g.lineWidth = 5;
      roundRect(g, x, y, bw, bh, 22); g.fill();
      // tail
      g.beginPath(); g.moveTo(tx - 16, y + bh - 3); g.lineTo(tailX, y + bh + tail); g.lineTo(tx + 16, y + bh - 3); g.closePath(); g.fill();
      roundRect(g, x, y, bw, bh, 22); g.stroke();
      g.beginPath(); g.moveTo(tx - 16, y + bh); g.lineTo(tailX, y + bh + tail); g.lineTo(tx + 16, y + bh); g.stroke();
      g.fillStyle = PAPER; g.fillRect(tx - 13, y + bh - 6, 26, 7);
      g.strokeStyle = PAPER_EDGE; g.lineWidth = 2; roundRect(g, x + 7, y + 7, bw - 14, bh - 14, 16); g.stroke();
      g.fillStyle = PINK; g.beginPath(); g.arc(x + 14, y + 14, 5, 0, Math.PI * 2); g.fill();
      g.fillStyle = INK; g.textAlign = 'center'; g.textBaseline = 'middle';
      lines.forEach((l, i) => g.fillText(l, c.width / 2, y + padY + lh * (i + 0.5)));
      this.aspect = c.width / c.height;
    }
    this.tex.needsUpdate = true;
  }

  /** Per rendered frame (visual only). */
  update(dt) {
    if (!this.on || !this.sprite) return;
    // TT5 verify round: a hushed line waits with its clock held (under a modal, and on phones under a centre card), so
    // the kitten's "You're safe now" still shows in full once the card has gone
    const held = this.kind === 'bubble' && this.dur !== Infinity && bubblesHushed();
    if (!held) this.t += dt;
    if (this.t >= this.dur) { this.hide(); return; }
    const s = this.baseScale;
    if (this.kind === 'zzz') {
      const k = 0.75 + 0.25 * Math.sin(this.t * 2.2);
      this.sprite.scale.set(s * this.aspect * k, s * k, 1);
      this.sprite.position.y = 0.08 * Math.sin(this.t * 1.6);
      this.sprite.position.x = 0.12;
      this.opacity = 0.65 + 0.35 * Math.sin(this.t * 2.2 + 1);
      this.sprite.material.opacity = bubblesHushed() ? 0 : this.opacity;
    } else {
      const pop = easeOutBack(clamp01(this.t / 0.16));
      const fade = this.dur === Infinity ? 1 : clamp01((this.dur - this.t) / 0.25);
      this.sprite.scale.set(s * this.aspect * pop, s * pop, 1);
      this.opacity = fade;
      this.sprite.material.opacity = bubblesHushed() ? 0 : fade;
    }
  }

  dispose() {
    LIVE.delete(this);
    this.object.removeFromParent();
    this.tex?.dispose(); this.sprite?.material.dispose();
    this.sprite = null; this.canvas = null;
  }
}
