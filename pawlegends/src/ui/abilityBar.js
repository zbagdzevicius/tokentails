// Lifted from Pink Paw Knight (swordcat) at commit 7714dcb: src/ui/abilityBar.js
// Licence: all rights reserved, pending founder decision (POC.md §17, GDD §12 decision #3). Not MIT.
// Changes: relative imports rewritten by tools/lift-ppk.mjs; any later hand edit is marked "pawlegends:".
// src/ui/abilityBar.js  (owner: ui) — research/CONTROLS_SPEC.md §10.1 the LoL-style ability bar (desktop and pad; the
// touch cluster shows the same states). The §10.2 cursors are in cursor.js.
//
//   [Stand + 3 Grit pips] [Tumble] [Jump] [Kitten portrait] [Golden Hour] | [Milk ×n] [Meow] [Interact]
// Bottom centre, candy skin (WA §4.2: cream slots, 3 px cocoa border, a cocoa lip; geometry unchanged, X22): 56 px
// slots (48 under 900 px width). Key glyphs (white pill keycaps) follow the preset / device.
// Cooldowns [X21]: a clockwise lilac sweep (55 %) run as ONE CSS animation per cooldown start (`@property --cd`,
// `animation-duration` = the time left), never per-frame style writes; whole seconds when ≥ 1 s is left (written on
// whole-second changes only); on ready a scale 1.12 pop + a white shine stripe + a soft tick (ui/glass_001 at −20 dB)
// for cooldowns ≥ 2 s. Hover a slot: a cream tooltip with the move's one-line rule (`bar.*` strings).
// The companion portrait and the Milk bottles live here on desktop / pad (the HUD hides its own copies).
// Clicking a slot fires it (the `mouseOnly` preset relies on it; harmless elsewhere).
// Data: player.abilityState(out), companions.cooldownLeft / readiness / canCast.
import { E } from '../render/ppk/core/events.js';
import { SIGNATURE } from '../render/ppk/characters/palette.js';
import { el, flag, setVar, setText, pulse } from '../render/ppk/ui/dom.js';
import { tx, actionGlyph, codeLabel, preferredCode, glyphHtml, glyphWords, ACTION_LABEL } from '../render/ppk/ui/text.js';
import { portraitSVG } from '../render/ppk/stubs/ui/portraits.js';
import { companionJoined } from '../render/ppk/ui/reveal.js';
import * as I from '../render/ppk/ui/icons.js';

/** Slot rows: action, icon, divider before. */
const SLOTS = [
  { id: 'guard', icon: () => I.pawShield('ready'), tip: 'bar.guard' },
  { id: 'dodge', icon: () => I.tumble(), tip: 'bar.dodge' },
  { id: 'jump', icon: () => I.jump(), tip: 'bar.jump' },
  { id: 'ability', icon: () => '', tip: 'bar.ability' },
  { id: 'golden', icon: () => I.sun(), tip: 'bar.golden' },
  { id: 'milk', icon: () => I.milkBottle(true), tip: 'bar.milk', sep: true },
  { id: 'meow', icon: () => I.meowFace(), tip: 'bar.meow' },
  { id: 'interact', icon: () => I.paw('#6B4A2B'), tip: 'bar.interact' },
];

export { codeLabel };

/** A slot that shows nothing to press (veiled by the practice reveal, empty, locked): clicks pass to the world. */
export function slotInert(e) {
  const c = e?.classList;
  return !!c && (c.contains('is-veiled') || c.contains('is-empty') || c.contains('is-locked') || c.contains('is-hidden'));
}

/**
 * Re-send a pointer press that landed on the bar to the game canvas as the mousedown Input listens for (the release
 * reaches Input's window mouseup by itself). No-op without a canvas.
 * @param {any} ctx @param {PointerEvent} ev
 */
export function passToWorld(ctx, ev) {
  const cv = ctx?.renderer?.domElement;
  if (!cv?.dispatchEvent || typeof MouseEvent !== 'function') return false;
  cv.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: ev.button, buttons: ev.buttons, clientX: ev.clientX, clientY: ev.clientY,
    ctrlKey: ev.ctrlKey, shiftKey: ev.shiftKey, altKey: ev.altKey, metaKey: ev.metaKey }));
  return true;
}

/** The glyph shown for `action` (active preset bindings on KBM; pad glyphs on pad). */
export function slotGlyph(input, action) {
  const dev = input?.device ?? 'kbm';
  if (dev === 'pad') return actionGlyph(action, 'pad');
  const key = preferredCode(action, input?.codesFor?.(action) ?? []);
  return key ? codeLabel(key) : actionGlyph(action, 'kbm');
}

/** TT6: the slot's corner glyph as an icon (a mouse with the right button lit, a pad bumper, a keycap letter). */
export function slotGlyphHtml(input, action) {
  const dev = input?.device === 'pad' ? 'pad' : 'kbm';
  return glyphHtml(slotGlyph(input, action), dev, { ps: dev === 'pad' && input?.padKind === 'ps', compact: true });
}

/** TT6: plain words for the slot's input ("Right mouse button"), for aria labels. */
export function slotGlyphWords(input, action) {
  const dev = input?.device === 'pad' ? 'pad' : 'kbm';
  return glyphWords(slotGlyph(input, action), dev, dev === 'pad' && input?.padKind === 'ps');
}

/**
 * TT6 the Shield slot's look: 'ready' | 'active' (held) | 'parry' (the parry window is open) | 'lockout' (a whiffed
 * tap, 0.3 s) | 'broken' (no Grit); `cracks` = Grit lost (0..2). Pure on abilityState.
 * @param {{ guard?: boolean, parryOpen?: boolean, lockout?: boolean, grit?: number, gritMax?: number }} s
 */
export function shieldSlotState(s) {
  const max = s?.gritMax ?? 3, g = Math.max(0, s?.grit ?? max);
  const state = g <= 0 ? 'broken' : s?.lockout ? 'lockout' : s?.guard ? (s.parryOpen ? 'parry' : 'active') : 'ready';
  return { state, cracks: Math.max(0, Math.min(2, max - g)) };
}

/**
 * [X21] Should a cooldown sweep (re)start this frame? Pure on the slot record `sl` ({ wasCd, lastCd }): a cooldown
 * that just began, or one that jumped up (re-triggered), returns { deg, dur } (the sweep's start angle and the
 * seconds left); otherwise null (the running CSS animation carries on by itself).
 * @param {{ wasCd?: boolean, lastCd?: number }} sl @param {number} cd seconds left @param {number} max full length
 */
export function cooldownStart(sl, cd, max) {
  if (!(cd > 0.02)) return null;
  if (sl.wasCd && !(cd > (sl.lastCd ?? 0) + 0.05)) return null;
  const f = max > 0 ? Math.max(0, Math.min(1, cd / max)) : 1;
  return { deg: +(f * 360).toFixed(1), dur: +cd.toFixed(2) };
}

/** Tick volume: −20 dB. */

export class AbilityBar {
  /** @param {any} ctx @param {HTMLElement} parent the ui root */
  constructor(ctx, parent) {
    this.ctx = ctx;
    this.root = el('div', 'ability-bar', { parent });
    this.slots = new Map();
    for (const s of SLOTS) {
      if (s.sep) el('div', 'ab-sep', { parent: this.root });
      const e = el('div', `ab-slot ab-${s.id}`, { parent: this.root, html: `<span class="ab-ico">${s.icon()}</span><span class="ab-sweep"></span><span class="ab-num"></span><span class="ab-key"></span>` });
      e.dataset.action = s.id;
      this.slots.set(s.id, { el: e, ico: e.querySelector('.ab-ico'), sweep: e.querySelector('.ab-sweep'), num: e.querySelector('.ab-num'), key: e.querySelector('.ab-key'), wasCd: false });
      // only the slots catch the pointer (the panel and its gutters pass clicks to the world, ui.css); a right click on
      // a slot does nothing (it must never fire an ability by accident)
      // TOKENTAILS-PLAN §10.2.8: a right / middle click is not for the bar: it goes on to the world as a canvas
      // mousedown, so a move order below Clem is never dropped (veiled slots and the gutters pass natively, ui.css);
      // a left click on an empty / locked slot does nothing
      e.addEventListener('pointerdown', (ev) => {
        ev.stopPropagation(); ev.preventDefault();
        if (ev.button === 0) { if (!slotInert(e)) this._fire(s.id, true); }
        else if (ev.pointerType !== 'touch') passToWorld(this.ctx, ev);
      });
      e.addEventListener('contextmenu', (ev) => ev.preventDefault());
      for (const t of ['pointerup', 'pointerleave', 'pointercancel']) e.addEventListener(t, () => this._fire(s.id, false));
    }
    // §10.1 hover tooltip (cream candy card, one line)
    this.tip = el('div', 'ab-tip', { parent: this.root });
    for (const [id, sl] of this.slots) {
      const def = SLOTS.find((d) => d.id === id);
      sl.el.addEventListener('pointerenter', (ev) => { if (ev.pointerType !== 'touch') this._showTip(id, def.tip); });
      sl.el.addEventListener('pointerleave', () => this._showTip(null));
    }
    /** TT3 the Paw Trick slot: built the first time a trick is owned (the bar keeps its 8 slots before that) */
    this.trickSlot = null;
    const g = this.slots.get('guard');
    this.gritPips = el('span', 'ab-grit', { parent: g.el });
    this.milkN = el('span', 'ab-count', { parent: this.slots.get('milk').el });
    this.state = {};
    this.interactOn = false;
    this._offs = [
      ctx.bus.on(E.INTERACT_AVAILABLE, () => { this.interactOn = true; }),
      ctx.bus.on(E.INTERACT_CLEAR, () => { this.interactOn = false; }),
      ctx.bus.on(E.PLAYER_PARRY, () => pulse(g.el, 'is-flash')),
    ];
    this._held = new Set();
    /** viewport y (CSS px) of the bar's top edge while it is shown, else null (the camera's safe rect, §2.4) */
    this.topY = null;
    /** CSS px of the canvas bottom the bar covers (kept while a dialogue hides it; 0 on touch); the camera frames above it */
    this.insetBottom = 0;
    this._measT = 0;
  }

  /**
   * Bottom safe inset: CSS px of `rect` (the canvas rect) the bar covers from the bottom; 0 while it is hidden.
   * The bar is re-measured at 4 Hz in render (one layout read), so this is cheap to call every frame.
   * @param {{top:number, height:number}} rect
   */
  safeInset(rect) {
    if (this.topY == null || !rect) return 0;
    return Math.max(0, rect.top + rect.height - this.topY);
  }

  _showTip(id, key) {
    if (!id) { flag(this.tip, 'is-on', false); this._tipId = null; return; }
    this._tipId = id;
    const raw = tx(this.ctx, key), i = raw.indexOf(' · ');
    const head = i > 0 ? raw.slice(0, i) : raw, body = i > 0 ? raw.slice(i + 3) : '';
    const key2 = slotGlyphHtml(this.ctx.input, id);
    this.tip.innerHTML = '';
    el('b', 'ab-tip-h', { parent: this.tip, text: head });
    if (key2) el('span', 'ab-tip-k', { parent: this.tip, html: key2 });
    if (body) el('span', 'ab-tip-b', { parent: this.tip, text: body });
    const sl = this.slots.get(id).el;
    setVar(this.tip, '--x', `${sl.offsetLeft + sl.offsetWidth / 2}px`);
    flag(this.tip, 'is-on', true);
  }

  /** A slot click: hold / release the action's virtual source (mouseOnly fires abilities by clicking). */
  _fire(action, on) {
    const inp = this.ctx.input;
    if (!inp?.setVirtual) return;
    if (on) { this._held.add(action); inp._press?.(action, 'bar'); }
    else if (this._held.has(action)) { this._held.delete(action); inp._release?.(action, 'bar'); }
  }

  /** @param {number} dt @param {boolean} visible */
  render(dt, visible) {
    const ctx = this.ctx, input = ctx.input;
    const on = visible && input?.device !== 'touch' && ctx.cam?.isIso !== false;
    flag(this.root, 'is-on', on);
    if (typeof document !== 'undefined') flag(document.body, 'ui-bar', on);
    if (!on) {
      // the reserve stays while a dialogue / menu hides the bar on KBM / pad (no framing jump); 0 on touch / classic
      this.topY = null; this._measT = 0;
      if (input?.device === 'touch' || ctx.cam?.isIso === false) this.insetBottom = 0;
      return;
    }
    // the safe inset: the top of the bar's box (the hover tooltip excluded; the 12 px enter slide included)
    if ((this._measT -= dt) <= 0 || this.topY == null) {
      this._measT = 0.25;
      // shrink to fit a viewport narrower than the bar (offsetWidth ignores the transform; 8 px gutters each side)
      const bw = this.root.offsetWidth, vw = typeof innerWidth !== 'undefined' ? innerWidth : 0;
      const fit = bw > 0 && vw > 0 ? Math.min(1, (vw - 16) / bw) : 1;
      if (fit !== this._fit) { this._fit = fit; setVar(this.root, '--fit', fit.toFixed(3)); }
      const r = this.root.getBoundingClientRect?.();
      this.topY = r && r.height > 0 ? r.top : null;
      const cv = ctx.renderer?.domElement?.getBoundingClientRect?.();
      this.insetBottom = this.safeInset(cv && cv.height > 0 ? cv : { top: 0, height: typeof innerHeight !== 'undefined' ? innerHeight : 720 });
    }
    const p = ctx.player, s = p?.abilityState ? p.abilityState(this.state) : null;
    if (!s) return;
    // WA §7.5 progressive reveal: in Morning Practice only the keycaps of lessons already started show (visibility only:
    // the bar keeps its geometry, X22); the panel itself steps back until practice is over
    const rv = ctx.ui?.reveal;
    flag(this.root, 'is-practice', !!rv?.practice);
    for (const [id, sl] of this.slots) {
      flag(sl.el, 'is-veiled', !!rv && rv[id] === false);
      if (!rv?.practice) flag(sl.el, 'is-reveal', false);         // its ::after is the cooldown shine's again
    }
    const small = typeof innerWidth !== 'undefined' && innerWidth < 900;
    flag(this.root, 'is-small', small);
    flag(this.root, 'is-pad', input?.device === 'pad');
    flag(this.root, 'is-mouse-only', input?.preset === 'mouseOnly' || ctx.state?.settings?.controlPreset === 'mouseOnly');
    this._keysDue = (this._keyT = (this._keyT ?? 0) - dt) <= 0;
    if (this._keysDue) this._keyT = 0.5;
    const gd = this._set('guard', 0, 0);
    flag(gd, 'is-active', !!s.guard); flag(gd, 'is-broken', (s.grit ?? 1) <= 0); flag(gd, 'is-holy', !!s.holyReady);
    // TT6: the Shield icon shows its state (the same paw shield Clem holds up in the world)
    const ss = shieldSlotState(s), sk = `${ss.state}|${ss.cracks}`;
    if (this._shieldK !== sk) {
      this._shieldK = sk;
      this.slots.get('guard').ico.innerHTML = I.pawShield(ss.state, { cracks: ss.cracks });
      gd.dataset.shield = ss.state;
      flag(gd, 'is-parry', ss.state === 'parry'); flag(gd, 'is-lockout', ss.state === 'lockout');
    }
    this._set('dodge', s.dodgeCd, s.dodgeMax);
    this._set('jump', 0, 0);
    this._set('meow', s.meowCd, s.meowMax);
    const go = this._set('golden', 0, 0);
    flag(go, 'is-ready', !!s.goldenReady); flag(go, 'is-locked', !s.goldenReady && s.golden < 1);
    setVar(go, '--fill', (s.golden ?? 0).toFixed(2));
    flag(this._set('milk', 0, 0), 'is-empty', (s.milk ?? 0) <= 0);
    const mn = s.milk ?? 0;
    if (this._milk !== mn) { this._milk = mn; setText(this.milkN, `×${mn}`); }
    flag(this._set('interact', 0, 0), 'is-lit', this.interactOn);
    // grit pips
    const gk = `${s.grit}/${s.gritMax}`;
    if (this.gritPips._k !== gk) {
      this.gritPips._k = gk;
      let h = '';
      // TT6 fix round: mini paw shields like the HUD pips (grey squares read as missing-character boxes)
      for (let i = 0; i < (s.gritMax ?? 3); i++) h += I.gritShield(i < (s.grit ?? 0) ? 'full' : 'empty');
      this.gritPips.innerHTML = h;
    }
    // kitten slot: portrait, cooldown, zzz
    const comp = ctx.companions, c0 = comp?.active?.[0];
    // the slot stays empty until the kitten has joined (no portrait of Mochi before D-01 sets meadow.mochi)
    const c = c0 && companionJoined(ctx, c0.kittenId ?? c0.id) ? c0 : null;
    const ks = this.slots.get('ability');
    flag(ks.el, 'is-empty', !c);
    if (c) {
      const id = c.kittenId ?? c.id;
      if (ks._id !== id) { ks._id = id; ks.ico.innerHTML = portraitSVG(id, { expression: 'happy' }); setVar(ks.el, '--sig', SIGNATURE[id] ?? '#D9B26A'); }
      const left = comp.cooldownLeft?.() ?? 0, r = comp.readiness?.() ?? 1;
      const max = left > 0 && r < 1 ? left / Math.max(1e-3, 1 - r) : 0;
      flag(this._set('ability', left, max), 'is-nap', (c.napT ?? 0) > 0);
      if ((c.napT ?? 0) > 0) setText(ks.num, 'zzz');
    } else this._set('ability', 0, 0);
    this._trick(s.trick);
  }

  /**
   * TT3 Paw Trick slot (§11.3): after Golden Hour, shown once a trick is owned. The icon follows the equipped trick
   * (the ":3" coin / the catnip pouch), the sweep runs its cooldown, a thrown coin dims it until it is back.
   */
  _trick(t) {
    if (!t?.any || !t.equipped) { if (this.trickSlot) flag(this.trickSlot.el, 'is-hidden', true); return; }
    if (!this.trickSlot) this._buildTrickSlot();
    const sl = this.trickSlot;
    flag(sl.el, 'is-hidden', false);
    if (sl.eq !== t.equipped) {
      sl.eq = t.equipped;
      sl.ico.innerHTML = t.equipped === 'cloud' ? I.catnipPouch() : I.ttCoin(40);
      sl.el.dataset.trick = t.equipped;
      pulse(sl.el, 'is-reveal');
    }
    this._set('trick', t.cd, t.cdMax);
    flag(sl.el, 'is-out', !!t.coinOut);
    flag(sl.el, 'is-aiming', !!t.aiming);
    flag(sl.el, 'is-ready', !!t.ready);
  }

  _buildTrickSlot() {
    const before = this.slots.get('golden')?.el?.nextSibling ?? null;
    const e = el('div', 'ab-slot ab-trick', { html: '<span class="ab-ico"></span><span class="ab-sweep"></span><span class="ab-num"></span><span class="ab-key"></span>' });
    this.root.insertBefore(e, before);
    e.dataset.action = 'trick';
    const sl = { el: e, ico: e.querySelector('.ab-ico'), sweep: e.querySelector('.ab-sweep'), num: e.querySelector('.ab-num'), key: e.querySelector('.ab-key'), wasCd: false, eq: null };
    this.slots.set('trick', sl);
    this.trickSlot = sl;
    e.addEventListener('pointerdown', (ev) => {
      ev.stopPropagation(); ev.preventDefault();
      if (ev.button === 0) { if (!slotInert(e)) this._fire('trick', true); }
      else if (ev.pointerType !== 'touch') passToWorld(this.ctx, ev);
    });
    e.addEventListener('contextmenu', (ev) => ev.preventDefault());
    for (const t of ['pointerup', 'pointerleave', 'pointercancel']) e.addEventListener(t, () => this._fire('trick', false));
    e.addEventListener('pointerenter', (ev) => { if (ev.pointerType !== 'touch') this._showTrickTip(); });
    e.addEventListener('pointerleave', () => this._showTip(null));
    pulse(e, 'is-reveal');
  }

  /** The trick slot's tooltip: its name and hint (strings when story has them, else the plan's text). */
  _showTrickTip() {
    const tr = this.ctx.player?.tricks, id = tr?.equipped;
    if (!id) return;
    this._tipId = 'trick';
    const head = tr.text(`trick.${id}.name`), body = String(tr.text(`trick.${id}.hint`)).replace(/\[[A-Za-z]+\]\s*/g, '');
    const key2 = slotGlyphHtml(this.ctx.input, 'trick');
    this.tip.innerHTML = '';
    el('b', 'ab-tip-h', { parent: this.tip, text: head });
    if (key2) el('span', 'ab-tip-k', { parent: this.tip, html: key2 });
    el('span', 'ab-tip-b', { parent: this.tip, text: body });
    const sl = this.trickSlot.el;
    setVar(this.tip, '--x', `${sl.offsetLeft + sl.offsetWidth / 2}px`);
    flag(this.tip, 'is-on', true);
  }

  /**
   * One slot's cooldown state. [X21] A cooldown that starts (or jumps up) launches one CSS sweep animation from the
   * current fraction to 0 over the time left; nothing is written per frame after that. Returns the slot element.
   */
  _set(id, cd, max) {
    const sl = this.slots.get(id), on = cd > 0.02;
    if (on) {
      const st = cooldownStart(sl, cd, max);
      if (st) { setVar(sl.sweep, '--cd0', `${st.deg}deg`); setVar(sl.sweep, '--cdd', `${st.dur}s`); pulse(sl.sweep, 'is-run'); }
      sl.maxSeen = Math.max(sl.maxSeen ?? 0, max);
    } else if (sl.wasCd) {
      flag(sl.sweep, 'is-run', false);
      if ((sl.maxSeen ?? 0) >= 2) { pulse(sl.el, 'is-flash-ready'); try { this.ctx.audio?.play2D?.('ui.ready'); } catch { /* audio optional */ } }
      sl.maxSeen = 0;
    }
    flag(sl.el, 'is-cd', on);
    sl.wasCd = on;
    sl.lastCd = on ? cd : 0;
    const n = cd >= 1 ? Math.ceil(cd) : 0;                       // the label on whole seconds only
    if (sl.n !== n) { sl.n = n; setText(sl.num, n ? String(n) : ''); }
    if (this._keysDue) {                                         // key glyphs re-read at 2 Hz (no per-frame strings)
      const k = `${this.ctx.input?.device}|${this.ctx.input?.padKind}|${slotGlyph(this.ctx.input, id)}`;
      if (sl.keyK !== k) {
        sl.keyK = k;
        sl.key.innerHTML = slotGlyphHtml(this.ctx.input, id);
        sl.el.setAttribute?.('aria-label', `${ACTION_LABEL[id] ?? id}: ${slotGlyphWords(this.ctx.input, id)}`);
      }
    }
    return sl.el;
  }

  /** WA §7.5: a lesson starts: its slot appears with the touch button's pop + 3-ring pulse. */
  reveal(action) {
    const sl = this.slots.get(action);
    if (sl) pulse(sl.el, 'is-reveal');
  }

  dispose() {
    for (const off of this._offs) off();
    this.root.remove();
  }
}

// §10.2 cursors live in cursor.js (re-exported for older callers)
export { CURSORS, cursorFor } from '../render/ppk/ui/cursor.js';
