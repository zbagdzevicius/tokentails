// Lifted from Pink Paw Knight (swordcat) at commit 7714dcb: src/ui/messages.js
// Licence: all rights reserved, pending founder decision (POC.md §17, GDD §12 decision #3). Not MIT.
// Changes: relative imports rewritten by tools/lift-ppk.mjs; any later hand edit is marked "pawlegends:".
// src/ui/messages.js  (owner: ui, TOKENTAILS-PLAN §13.1 decision 1, TT5 package M): one place that decides where and
// when every in-game message shows. The renderers stay (toasts.js, celebrate.js, guide.js, offer.js, prompts.js,
// shelter/card.js); each asks this board for its slot.
//
//  • Levels: P0 modal (the shelter card, the results card, the Kitten-mode offer chips), P1 moment (friend, kitten and
//    ability cards), P2 toast, P3 tip (`tut.*` toasts, the lesson / hint card). A P0 hides P1 to P3. A new message never
//    covers an older one: it waits.
//  • Two slots only: the toast slot at the top (1 toast on phones, 2 on tablet and desktop; the hint card is its bottom
//    row) and the centre card slot under the top-centre column. The card is sized per viewport (ui.css `vp-*`) and placed
//    off the touch buttons, the HUD and Clem (`cardPlace`); when there is no room it docks smaller.
//  • While a centre card shows, Pearl's guide bubble folds to its chip and the offer waits; on phones the toasts and the
//    hint wait too (one box at a time). In combat a card becomes an icon toast (celebrate.js).
//  • Root classes (written on change only): `msg-p0`, `msg-card`, `msg-toast` (a toast is up or just left), `msg-phone`,
//    `vp-<kind>`. ui.css hides the lower layers with them.
//  • World speech bubbles (companions/Bubble.js) under a modal, and on phones under a centre card, wait hidden with
//    their clocks held (`bubbleHold`); on bigger screens they step off the card and the toasts (`bubbleBlocks`) and
//    the card is placed off the live bubbles (TT5 verify round: the kitten's thank-you line sat under her card).
// DOM reads: one rect per placed card, plus Clem's screen point, plus the card and toast boxes at 10 Hz while one is
// up. No per-frame allocation in `update`.
import { liveBubbleRects } from '../render/ppk/companions/Bubble.js';

/** Levels, timings and layout numbers (CSS px / seconds). */
export const MSG = Object.freeze({
  P0: 0, P1: 1, P2: 2, P3: 3,
  overlapMax: 0.04,           // a placed box may cover at most 4 % of itself or of the other box
  gutter: 12, gap: 8,
  cardTopVh: 0.12,            // the card slot starts at max(top-centre column bottom + gap, 12vh)
  toastLinger: 0.3,           // s the hint keeps waiting after the last toast has gone (no fade back over a leaving one)
  dockScales: Object.freeze([0.8, 0.66]),
  phoneMinScale: 0.8,         // a phone card never docks below this (at 0.66 its line was about 10 px)
  popOver: 0.04,              // half of the card's 8 % pop-in overshoot, kept inside the screen on each side
  blockRate: 0.1,             // s between two reads of the card / toast boxes the bubbles keep off
  clemH: 1.3,                 // m: her height for the screen box
  stickPad: 36,               // px: the camera thumb pad around the joystick zone (touch.js stickRest), not kept clear by the offer
});

/** Viewport classes the CSS sizes the card for. Pure. */
export function viewportKind(W, H, touch = false) {
  if (Math.min(W, H) < 500) return W > H ? 'phone-land' : 'phone-portrait';
  return touch || W < 1000 ? 'tablet' : 'desktop';
}

/** Overlap of two rects ({x, y, w, h}) as the larger fraction of either box (0..1). Pure. */
export function overlapFrac(a, b) {
  if (!a || !b) return 0;
  const ix = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), iy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (ix <= 0 || iy <= 0) return 0;
  const ov = ix * iy, aa = Math.max(1, a.w * a.h), ba = Math.max(1, b.w * b.h);
  return Math.max(ov / aa, ov / ba);
}

/**
 * Two lines say the same thing (case, glyph brackets, punctuation and spaces ignored; a line clipped with '…' matches
 * the full line it starts). Pure.
 */
export function sameLine(a, b) {
  const n = (s) => String(s ?? '').toLowerCase().replace(/\[[^\]]*\]|<[^>]*>/g, '').replace(/[^\p{L}\p{N}]+/gu, '');
  const x = n(a), y = n(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const clip = (s, t, u) => /…\s*$/.test(String(s ?? '')) && u.length >= 8 && t.startsWith(u);
  return clip(b, x, y) || clip(a, y, x);
}

/**
 * Where the centre card goes. Pure. Tries, in order: centred under `top`; the left column; the right column (both under
 * their HUD corner); centred under Clem; centred above her; then any free spot, nearest the top centre ('free'). The
 * first spot whose box covers no `avoid` rect and not Clem by more than MSG.overlapMax wins. With no free spot it docks
 * smaller (MSG.dockScales, not below `minScale`) and takes the best one.
 * @param {{ W: number, H: number, top: number, w: number, h: number, avoid?: {x:number,y:number,w:number,h:number}[],
 *   clem?: {x:number,y:number,w:number,h:number}|null, leftTop?: number, rightTop?: number, gutter?: number,
 *   full?: boolean, minScale?: number, keep?: {x:number,y:number,w:number,h:number,scale:number,spot:string}|null }} s
 *   `minScale`: the smallest dock scale tried (phones: MSG.phoneMinScale); `keep`: the card's current spot, kept while
 *   it is still free
 * @returns {{ x: number, y: number, w: number, h: number, scale: number, spot: string, score: number }}
 */
export function cardPlace(s) {
  const g = s.gutter ?? MSG.gutter, W = s.W, H = s.H, avoid = s.avoid ?? [], clem = s.clem ?? null;
  let best = null;
  const min = s.minScale ?? 0;
  // the spot it already has stays while it is still free (a card that hops at every re-place reads as a glitch)
  const k = s.keep;
  if (k && !s.full && Math.abs(k.w - Math.round(s.w * k.scale)) <= 1 && Math.abs(k.h - Math.round(s.h * k.scale)) <= 1
    && k.x >= 0 && k.y >= s.top - 0.5 && k.x + k.w <= W && k.y + k.h <= H) {
    let score = clem ? overlapFrac(k, clem) : 0;
    for (const r of avoid) { const f = overlapFrac(k, r); if (f > score) score = f; }
    if (score <= MSG.overlapMax) return { x: k.x, y: k.y, w: k.w, h: k.h, scale: k.scale, spot: k.spot, score };
  }
  for (const scale of s.full ? [1] : [1, ...MSG.dockScales.filter((k) => k >= min - 1e-9)]) {
    const w = Math.round(s.w * scale), h = Math.round(s.h * scale);
    const cx = Math.round((W - w) / 2);
    // the pop-in overshoots to 108 % (ui.css celPop): keep that inside the screen too (Golden Hour poked past a
    // tablet's right edge while it popped in the right column)
    const px = g + Math.ceil(w * MSG.popOver), py = g + Math.ceil(h * MSG.popOver);
    const spots = [
      ['centre', cx, s.top],
      ['left', px, Math.max(s.top, s.leftTop ?? s.top)],
      ['right', W - px - w, Math.max(s.top, s.rightTop ?? s.top)],
    ];
    if (clem) spots.push(['under', cx, clem.y + clem.h + MSG.gap], ['over', cx, clem.y - MSG.gap - h]);
    for (const [spot, x0, y0] of spots) {
      const x = Math.max(px, Math.min(W - px - w, x0)), y = Math.max(g, Math.min(H - py - h, y0));
      if (y < s.top - 0.5 && spot !== 'over') continue;
      const box = { x, y, w, h };
      let score = clem ? overlapFrac(box, clem) : 0;
      for (const r of avoid) { const f = overlapFrac(box, r); if (f > score) score = f; }
      const cand = { x, y, w, h, scale, spot, score };
      if (score <= MSG.overlapMax) return cand;
      if (!best || score < best.score - 1e-6) best = cand;
    }
    // no named spot is free: any free spot at this size, nearest the top-centre one (a landscape phone has room
    // between the HUD and the touch buttons that none of the named spots hits; the card sat on the pause button)
    const sx = Math.max(8, Math.round(W / 24)), sy = Math.max(8, Math.round(H / 24));
    let grid = null, cost = Infinity;
    for (let y = Math.max(g, s.top); y <= H - py - h; y += sy) {
      for (let x = px; x <= W - px - w; x += sx) {
        const c = Math.abs(y - s.top) + 0.5 * Math.abs(x - cx);
        if (c >= cost) continue;
        const box = { x, y, w, h };
        let score = clem ? overlapFrac(box, clem) : 0;
        if (score > MSG.overlapMax) continue;
        for (const r of avoid) { const f = overlapFrac(box, r); if (f > score) score = f; if (score > MSG.overlapMax) break; }
        if (score <= MSG.overlapMax) { cost = c; grid = { x, y, w, h, scale, spot: 'free', score }; }
      }
    }
    if (grid) return grid;
  }
  return best;
}

/**
 * The pure arbiter. Each renderer declares its message (`set(id, level, slot, on)`); `allows` says whether one may
 * show now. Rules: a P0 hides every lower level; two P0s: the older one shows, the newer waits; the card slot holds one
 * card (the older wins); on phones a toast or tip waits while a card is up.
 */
export class MessageBoard {
  constructor() { this.items = new Map(); this._seq = 0; }

  /** Declare (on) or retract (off) a message. Keeps its age while it stays declared. */
  set(id, level, slot, on = true) {
    const m = this.items.get(id);
    if (!on) { if (m) this.items.delete(id); return; }
    if (m) { m.level = level; m.slot = slot; return; }
    this.items.set(id, { id, level, slot, seq: ++this._seq });
  }

  has(id) { return this.items.has(id); }

  /** The highest priority (lowest level) declared, or Infinity. */
  top() { let t = Infinity; for (const m of this.items.values()) if (m.level < t) t = m.level; return t; }

  /**
   * May message `id` (`level`, `slot`) show now? An undeclared id is treated as the newest.
   * @param {string} id @param {number} level @param {string} slot @param {{ phone?: boolean }} [o]
   */
  allows(id, level, slot, o = {}) {
    const me = this.items.get(id), seq = me ? me.seq : Infinity;
    for (const m of this.items.values()) {
      if (m.id === id) continue;
      if (m.level === MSG.P0) {
        if (level > MSG.P0) return false;                   // a modal hides everything below it
        if (m.seq < seq) return false;                       // two modals: the newer one waits
      }
      if (slot === 'card' && m.slot === 'card' && m.level <= level && m.seq < seq) return false;
      if (o.phone && (slot === 'toast') && m.slot === 'card' && m.level === MSG.P1) return false;
    }
    return true;
  }

  clear() { this.items.clear(); }
}

const hasDom = () => typeof document !== 'undefined' && typeof innerWidth === 'number';

/** The DOM side: declares what is up each frame, writes the root classes, places the centre card. */
export class Messages {
  /** @param {any} ctx @param {any} ui the UI facade */
  constructor(ctx, ui) {
    this.ctx = ctx; this.ui = ui;
    this.board = new MessageBoard();
    this.kind = 'desktop'; this.phone = false;
    this.p0 = false; this.card = false; this.toast = false;
    this._toastT = 0;
    this._cls = new Map();
    this.placed = null;            // last card placement (tests / smoke)
    this._clem = { x: 0, y: 0, w: 0, h: 0 };
    this._avoid = [];
    this._bubbles = [];
    /** what world bubbles keep off (Bubble.js setBubbleBlockers): canvas CSS px */
    this.blocks = { w: 0, h: 0, rects: [] };
    this._blockT = 0;
    this._blockPool = [{ x: 0, y: 0, w: 0, h: 0 }, { x: 0, y: 0, w: 0, h: 0 }];
  }

  /** Per frame, before the renderers draw (UI.render). */
  update(dt) {
    const ui = this.ui, b = this.board;
    if (hasDom()) {
      const touch = (this.ctx.input?.device ?? 'kbm') === 'touch' || !!document.body?.classList?.contains('ui-touch');
      this.kind = viewportKind(innerWidth, innerHeight, touch);
      this.phone = this.kind.startsWith('phone');
    }
    b.set('shelter', MSG.P0, 'modal', !!ui.shelterCard?.open);
    b.set('results', MSG.P0, 'modal', !!ui.results?.open);
    b.set('offer', MSG.P0, 'modal', !!ui.offer?.open);
    const cur = ui.celebrations?.q?.cur;
    b.set('card', MSG.P1, 'card', !!cur && cur.started !== false && !cur.toast);
    const shown = ui.toasts?.q?.shown?.length ?? 0;
    b.set('toast', MSG.P2, 'toast', shown > 0);
    this._toastT = shown > 0 ? MSG.toastLinger : Math.max(0, this._toastT - dt);
    this.p0 = b.top() === MSG.P0;
    this.card = b.has('card');
    this.toast = this._toastT > 0;
    const root = ui.root;
    if (root) {
      this._flag(root, 'msg-p0', this.p0);
      this._flag(root, 'msg-card', this.card);
      this._flag(root, 'msg-toast', this.toast);
      this._flag(root, 'msg-phone', this.phone);
      this._flag(root, 'msg-shelter', b.has('shelter'));
      this._flag(root, 'msg-results', b.has('results'));
      this._flag(root, 'msg-offer', b.has('offer'));
      for (const k of ['phone-portrait', 'phone-land', 'tablet', 'desktop']) this._flag(root, `vp-${k}`, this.kind === k);
    }
    this._measureBlocks(dt);
  }

  /**
   * World bubbles wait (hidden, clocks held) under a modal, and on phones under a centre card, including the frame
   * between two queued cards (a line popped up for one frame there).
   */
  bubbleHold() {
    if (this.p0) return true;
    if (!this.phone) return false;
    const q = this.ui.celebrations?.q;
    return this.card || (!q?.cur && (q?.items?.length ?? 0) > 0);
  }

  /** The boxes world bubbles keep off: `{ w, h, rects }` in canvas CSS px (see _measureBlocks). */
  bubbleBlocks() { return this.blocks; }

  /** The centre card, the toast stack and (on touch) the on-screen buttons, re-read at 1 / MSG.blockRate Hz; else empty. */
  _measureBlocks(dt) {
    const b = this.blocks;
    // TT6 fix round: on touch the on-screen buttons count too (a "Psst" bubble's tail sat on the Shield button)
    const tl = (this.ctx.input?.device ?? 'kbm') === 'touch' ? this.ui.touch?.layout?.buttons : null;
    if (!this.card && !this.toast && !tl) { b.rects.length = 0; this._blockT = 0; return; }
    if ((this._blockT -= dt) > 0 || !hasDom()) return;
    this._blockT = MSG.blockRate;
    b.rects.length = 0;
    const cv = this.ctx.renderer?.domElement;
    const c = cv?.getBoundingClientRect?.() ?? { left: 0, top: 0, width: innerWidth, height: innerHeight };
    if (!(c.width > 0 && c.height > 0)) return;
    b.w = c.width; b.h = c.height;
    const add = (e) => {
      if (!e?.isConnected) return;
      const q = e.getBoundingClientRect();
      if (!(q.width > 0 && q.height > 0)) return;
      const cs = getComputedStyle(e);
      if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity < 0.05) return;
      const o = this._blockPool[b.rects.length] ?? (this._blockPool[b.rects.length] = { x: 0, y: 0, w: 0, h: 0 });
      o.x = q.left - c.left; o.y = q.top - c.top; o.w = q.width; o.h = q.height;
      b.rects.push(o);
    };
    if (this.card) add(this.ui.celebrations?.pop);
    if (tl) {
      for (const k in tl) {
        const t = tl[k];
        if (!(t?.r > 0)) continue;
        const o = this._blockPool[b.rects.length] ?? (this._blockPool[b.rects.length] = { x: 0, y: 0, w: 0, h: 0 });
        o.x = t.x - t.r - c.left; o.y = t.y - t.r - c.top; o.w = o.h = 2 * t.r;
        b.rects.push(o);
      }
    }
    // each toast on its own (the stack's box spans the whole top column on a desktop)
    const tr = this.ui.toasts?.root;
    if (this.toast && tr?.children) for (let i = 0; i < tr.children.length && i < 4; i++) add(tr.children[i]);
  }

  _flag(e, c, on) {
    if (this._cls.get(c) === on) return;
    this._cls.set(c, on);
    e.classList.toggle(c, on);
  }

  /** Toasts wait (hidden, clocks held) under a modal, and on phones while a card is up. */
  holdToasts() { return this.p0 || (this.phone && this.card); }

  /** A new card waits while a modal is up. */
  holdCards() { return this.p0; }

  /** May the modal `id` ('shelter' | 'offer') open now? Not over another modal, a card on screen or a waiting card. */
  modalMayOpen(id) {
    const cel = this.ui.celebrations;
    if (cel?.busy) return false;
    if (id !== 'shelter' && this.ui.shelterCard?.queue?.length) return false;   // a rescued cat card is next
    return this.board.allows(id, MSG.P0, 'modal');
  }

  /** Clem's screen box (CSS px) or null. */
  clemRect() {
    const p = this.ctx.player?.pos, cam = this.ctx.cam;
    if (!p || !cam?.worldToScreen) return null;
    const f = cam.worldToScreen({ x: p.x, y: p.y, z: p.z }), h = cam.worldToScreen({ x: p.x, y: p.y + MSG.clemH, z: p.z });
    if (!f || !h || !Number.isFinite(f.y) || !Number.isFinite(h.y)) return null;
    const hh = Math.max(20, f.y - h.y), r = this._clem;
    r.x = Math.round(f.x - hh * 0.4); r.y = Math.round(h.y); r.w = Math.round(hh * 0.8); r.h = Math.round(hh);
    return r;
  }

  /**
   * Place the centre card (celebrate.js calls it once per card, after its content is set). Writes `--cx` / `--cy` /
   * `--cs` on the card and the confetti box. Returns the placement.
   * @param {HTMLElement} card the `.cel-card` @param {HTMLElement} pop its `.cel-pop` box
   */
  placeCard(card, pop) {
    if (!hasDom() || !card || !pop) return null;
    for (const k of ['phone-portrait', 'phone-land', 'tablet', 'desktop']) card.classList.toggle(`vp-${k}`, this.kind === k);
    card.style.setProperty('--cs', '1');
    // the layout size, not the box on screen: during the pop-in (scale .4 to 1.08) the screen box is the wrong size,
    // which docked a card smaller on a landscape phone or sent it over Clem
    const r = pop.getBoundingClientRect();
    const w = pop.offsetWidth || r.width, h = pop.offsetHeight || r.height;
    if (!(w > 0)) return null;
    const cur = this.ui.celebrations?.q?.cur ?? null;
    const keep = cur && cur === this._placedFor ? this.placed : null;
    const at = this._place(Math.ceil(w), Math.ceil(h), false, keep);
    if (!at) return null;
    this._placedFor = cur;
    card.style.setProperty('--cx', `${Math.round(at.x + at.w / 2)}px`);
    card.style.setProperty('--cy', `${Math.round(at.y)}px`);
    card.style.setProperty('--cs', at.scale.toFixed(2));
    const conf = this.ui.celebrations?.confetti;
    if (conf) {
      conf.style.setProperty('--cfx', `${at.x}px`); conf.style.setProperty('--cfy', `${at.y}px`);
      conf.style.setProperty('--cfw', `${at.w}px`); conf.style.setProperty('--cfh', `${at.h}px`);
    }
    this.placed = at;
    return at;
  }

  /**
   * Place the Kitten-mode offer the same way (it sat over the HUD block on short landscape phones). Writes `--ofx` /
   * `--ofy` on its root (ui.css). Returns the placement.
   * @param {HTMLElement} root the `.ui-offer`
   */
  placeOffer(root) {
    if (!hasDom() || !root) return null;
    root.classList.remove('is-placed');
    const r = root.getBoundingClientRect();
    if (!(r.width > 0)) return null;
    const at = this._place(Math.ceil(r.width), Math.ceil(r.height), true);
    this.offerVer = this.ui.screenOccluders?.()?.version ?? 0;
    if (!at || at.scale !== 1) return null;           // no free spot at full size: keep the CSS place (chips stay 44 px)
    root.style.setProperty('--ofx', `${at.x}px`); root.style.setProperty('--ofy', `${at.y}px`);
    root.classList.add('is-placed');
    return at;
  }

  /** cardPlace for a w × h box with the live HUD / touch / Clem rects. */
  _place(w, h, full = false, keep = null) {
    const ui = this.ui, W = innerWidth, H = innerHeight;
    const rect = (e) => {
      if (!e || e.offsetParent === null) return null;
      const cs = getComputedStyle(e);
      if (cs.visibility === 'hidden' || +cs.opacity < 0.05) return null;
      const q = e.getBoundingClientRect(); return q.width > 0 && q.height > 0 ? q : null;
    };
    // the top: under the top-centre column (boss bar, objective), the objective line under the hearts on phones
    let top = Math.round(H * MSG.cardTopVh);
    const tc = rect(ui.hud?.tcEl);
    if (tc && tc.top < H * 0.4) top = Math.max(top, Math.ceil(tc.bottom + MSG.gap));
    const avoid = this._avoid; avoid.length = 0;
    // (the offer's `chip` rects are skipped: the offer is a modal and never shares the screen with a card, and the
    // occluder list is re-measured at 4 Hz, so a just-closed offer could still be in it)
    // measured now, not the 4 Hz cache: the offer can open on the frame play starts, before the HUD and the pause
    // button were measured (it then sat over them on landscape phones). For the offer the joystick zone counts without
    // its camera thumb pad (the stick itself is what a chip must not sit on).
    const occ = ui.occluders?.measure?.() ?? ui.screenOccluders?.();
    const pad = full ? MSG.stickPad : 0;
    for (const q of occ?.rects ?? []) {
      if (q.kind === 'chip') continue;
      const p = q.kind === 'stick' ? Math.min(pad, q.w / 4, q.h / 4) : 0;
      avoid.push({ x: q.x + p, y: q.y + p, w: q.w - 2 * p, h: q.h - 2 * p });
    }
    // the HUD corners and the pause button straight from the DOM too (the occluder list skips them while the HUD or
    // the touch layer is not in play mode)
    for (const e of [ui.hud?.tlEl, ui.hud?.trEl, ui.touch?.pauseBtn]) { const q = rect(e); if (q) avoid.push({ x: q.left, y: q.top, w: q.width, h: q.height }); }
    // each HUD part on its own as well (a box may clip a corner of the block by 2 % and still cover the Valor bar by
    // 7 %), faded or not: the calm HUD fades a part out and back in while the box stays up
    for (const e of [...(ui.hud?.tlParts ?? []), ...(ui.hud?.trParts ?? [])]) {
      if (!e?.isConnected || e.offsetParent === null) continue;
      const q = e.getBoundingClientRect(); if (q.width > 0 && q.height > 0) avoid.push({ x: q.left, y: q.top, w: q.width, h: q.height });
    }
    for (const e of [ui.hud?.guideEl, ui.hud?.bossEl, ui.prompts?.hintEl, ui.prompts?.guide?.root]) { const q = rect(e); if (q) avoid.push({ x: q.left, y: q.top, w: q.width, h: q.height }); }
    const chip = ui.skipChipRect?.();
    if (chip && chip.w > 0) avoid.push({ x: chip.x, y: chip.y, w: chip.w, h: chip.h });
    // phones keep the toasts back while the card shows; on bigger screens they stay in the top column, so stay off them
    // (a touch tablet keeps them in the left column: then they are a rect to stay off, not a floor)
    if (!this.phone) {
      const slot = ui.hud?.toastSlot, q = rect(slot);
      if (q && slot.classList.contains('is-phone')) avoid.push({ x: q.left, y: q.top, w: q.width, h: q.height });
      else if (q) top = Math.max(top, Math.ceil(q.bottom + MSG.gap));
    }
    // tablets and desktops: off the world bubbles that are up now (the kitten's thank-you line rises with her card); on
    // phones the bubbles wait under the card instead (bubbleHold)
    if (!this.phone && !full) {
      const cv = this.ctx.renderer?.domElement;
      const c = cv?.getBoundingClientRect?.() ?? { left: 0, top: 0, width: W, height: H };
      const bs = this._bubbles; bs.length = 0;
      if (c.width > 0) for (const q of liveBubbleRects(bs, c.width, c.height)) avoid.push({ x: q.x + c.left, y: q.y + c.top, w: q.w, h: q.h });
    }
    const tl = rect(ui.hud?.tlEl), tr = rect(ui.hud?.trEl);
    return cardPlace({ W, H, top, w, h, avoid, clem: this.clemRect(), full, keep, minScale: this.phone ? MSG.phoneMinScale : 0,
      leftTop: tl ? Math.ceil(tl.bottom + MSG.gap) : top, rightTop: tr ? Math.ceil(tr.bottom + MSG.gap) : top });
  }

  dispose() { this.board.clear(); }
}
