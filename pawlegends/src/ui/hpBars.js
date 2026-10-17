// Lifted from Pink Paw Knight (swordcat) at commit 7714dcb: src/ui/hpBars.js
// Licence: all rights reserved, pending founder decision (POC.md §17, GDD §12 decision #3). Not MIT.
// Changes: relative imports rewritten by tools/lift-ppk.mjs; any later hand edit is marked "pawlegends:".
// src/ui/hpBars.js  (owner: ui) — research/CONTROLS_SPEC.md §10.4 / §10.5 world-space bars for the iso camera:
//
//  • Enemy HP bars: a 36 × 5 px pill (touch 44 × 6) at the actor's y + height + 0.3 m, shown while it is damaged
//    (fading 3 s after the last hit), selected (cam.lockTarget) or hovered (cam.hover). A white chip trail shows the
//    last chunk of damage. Pool of 12; the boss keeps its top bar (no world pill). Replaces the classic lock reticle's
//    HP pips (C8: the centre-screen reticle DOM is gone in iso; fx draws the selection ring on the ground).
//  • The Grit arc: a small three-segment arc above her head while she holds the Stand (§10.5: "keeps the eye on her").
//
// `barAlpha` / `pickBars` are pure and node-tested; `HpBars` owns the DOM (one transform per bar per frame).
import * as THREE from 'three';
import { E } from '../render/ppk/core/events.js';
import { el, flag, setVar } from '../render/ppk/ui/dom.js';

/**
 * The canvas rect in CSS px (one layout read; the viewport when the canvas is not laid out). Same as camera/Picker's
 * canvasRect, kept local so the boot shell does not pull the picker (and physics' Pathfind) in (PERF §10.2).
 * @param {any} ctx
 */
export function canvasRect(ctx) {
  const r = ctx.renderer?.domElement?.getBoundingClientRect?.();
  if (r && r.width > 0) return r;
  return VIEWPORT_RECT(typeof innerWidth !== 'undefined' ? innerWidth : 1280, typeof innerHeight !== 'undefined' ? innerHeight : 720);
}
const _vr = { left: 0, top: 0, width: 1280, height: 720 };
const VIEWPORT_RECT = (w, h) => { _vr.width = w; _vr.height = h; return _vr; };

export const HPBAR = Object.freeze({
  pool: 12, w: 36, h: 5, wTouch: 44, hTouch: 6, up: 0.3,
  /** seconds a hit keeps the bar up, then the fade length */
  hold: 3.0, fade: 0.4,
  /** chip trail: hold, then drain rate (fraction / s) */
  chipHold: 0.35, chipRate: 1.6,
  /** the Grit arc: metres above her head */
  gritUp: 0.42,
});

/**
 * Bar opacity for one enemy. Pure. Selected / hovered → 1; otherwise 1 for `hold` s after the last hit, then a
 * `fade` s ramp to 0. Never-hit and not selected / hovered → 0.
 * @param {number} sinceHit seconds since the player's last hit on it (Infinity = never)
 * @param {boolean} selected @param {boolean} hovered
 */
export function barAlpha(sinceHit, selected, hovered) {
  if (selected || hovered) return 1;
  if (!(sinceHit >= 0) || sinceHit === Infinity) return 0;
  if (sinceHit <= HPBAR.hold) return 1;
  return Math.max(0, 1 - (sinceHit - HPBAR.hold) / HPBAR.fade);
}

/**
 * Which enemies get a pill this frame: alpha > 0, alive, not the boss; the selection and the hover first, then the most
 * recently hit; at most `max`. Pure, and allocation-free on the hot path: the returned array and its entries are module
 * scratch, valid until the next call (copy them to keep them).
 * @param {{ actor: any, sinceHit: number }[]} tracked @param {any} selected @param {any} hovered @param {any} boss
 * @returns {{ actor: any, alpha: number }[]}
 */
export function pickBars(tracked, selected, hovered, boss, max = HPBAR.pool) {
  _pickOut.length = 0;
  _pickSeen.clear();
  if (selected) pickPush(selected, sinceOf(tracked, selected), selected, hovered, boss, max);
  if (hovered) pickPush(hovered, sinceOf(tracked, hovered), selected, hovered, boss, max);
  // then the most recently hit: a selection pass (track ≤ 24, out ≤ 12) — no filter / sort / slice copies; ties keep order
  while (_pickOut.length < max) {
    let best = null;
    for (let i = 0; i < tracked.length; i++) {
      const t = tracked[i];
      if (!_pickSeen.has(t.actor) && (!best || t.sinceHit < best.sinceHit)) best = t;
    }
    if (!best) break;
    _pickSeen.add(best.actor);                                  // considered (kept or rejected), never again
    pickPush(best.actor, best.sinceHit, selected, hovered, boss, max, true);
  }
  return _pickOut;
}

const _pickOut = [], _pickPool = [], _pickSeen = new Set();
const pickAlive = (a) => a && a.alive !== false && !a.dead && (a.hp ?? 1) > 0;
function sinceOf(tracked, a) {
  for (let i = 0; i < tracked.length; i++) if (tracked[i].actor === a) return tracked[i].sinceHit;
  return Infinity;
}
function pickPush(a, since, selected, hovered, boss, max, marked = false) {
  if (_pickOut.length >= max || !pickAlive(a) || a === boss || (!marked && _pickSeen.has(a))) return;
  const al = barAlpha(since, a === selected, a === hovered);
  if (al <= 0) return;
  _pickSeen.add(a);
  const n = _pickOut.length;
  const o = _pickPool[n] ?? (_pickPool[n] = { actor: null, alpha: 0 });
  o.actor = a; o.alpha = al;
  _pickOut.push(o);
}

const isEnemy = (a) => !!a && (a.tags?.has?.('enemy') || a.faction === 'enemy');
const _v = new THREE.Vector3(), _f = new THREE.Vector3(), _d = new THREE.Vector3();

export class HpBars {
  /** @param {any} ctx @param {HTMLElement} parent the ui root */
  constructor(ctx, parent) {
    this.ctx = ctx;
    this.root = el('div', 'hp-bars', { parent });
    /** enemy → { actor, sinceHit, chip, hold } (persistent: render hands these same objects to pickBars) */
    this.track = new Map();
    this.bars = [];
    for (let i = 0; i < HPBAR.pool; i++) {
      const b = el('div', 'hpb', { parent: this.root, html: '<i class="hpb-chip"></i><i class="hpb-fill"></i>' });
      // q*: last written quantised values (fill / chip per-mille, alpha %, x / y in 0.1 px): DOM writes only on change
      this.bars.push({ el: b, chip: b.firstChild, fill: b.lastChild, actor: null, qf: -1, qc: -1, qa: -1, qx: NaN, qy: NaN });
    }
    this.grit = el('div', 'grit-arc', { parent: this.root, html: gritSvg() });
    this.gritSegs = [...this.grit.querySelectorAll('.ga-seg')];
    this._tracked = [];
    this.boss = null;
    const bus = ctx.bus;
    this._offs = [
      bus.on(E.HIT, (h) => this._onHit(h)),
      bus.on(E.BOSS_START, (p) => { this.boss = p?.boss ?? null; }),
      bus.on(E.BOSS_DEFEATED, () => { this.boss = null; }),
      bus.on(E.LEVEL_LOADING, () => { this.track.clear(); this.boss = null; }),
    ].filter(Boolean);
  }

  _onHit(h) {
    if (!h?.target || h.blocked) return;
    const p = this.ctx.player, att = h.attacker, tgt = h.target;
    const byPlayer = att && (att === p || att.faction === 'player' || att.owner === p);
    if (!byPlayer || tgt === p || !isEnemy(tgt)) return;
    const t = this.track.get(tgt);
    if (t) { t.sinceHit = 0; t.hold = HPBAR.chipHold; }
    else this.track.set(tgt, { actor: tgt, sinceHit: 0, chip: frac(tgt) + (h.damage ?? 0) / Math.max(1, tgt.maxHp ?? 1), hold: HPBAR.chipHold });
    if (this.track.size > 24) this.track.delete(this.track.keys().next().value);
  }

  /** @param {number} dt @param {boolean} visible (play, HUD on, not Photo Cam) */
  render(dt, visible) {
    const ctx = this.ctx, cam = ctx.camera, iso = ctx.cam?.isIso === true;
    const on = visible && iso && !!cam;
    flag(this.root, 'is-on', on);
    const tracked = this._tracked; tracked.length = 0;
    for (const [a, t] of this.track) {
      t.sinceHit += dt;
      if (t.sinceHit > HPBAR.hold + HPBAR.fade + 0.5 || a.alive === false || a.dead || (a.hp ?? 1) <= 0) { this.track.delete(a); continue; }
      tracked.push(t);
    }
    if (!on) { for (const b of this.bars) if (b.actor) { b.actor = null; flag(b.el, 'is-on', false); } flag(this.grit, 'is-on', false); return; }
    const R = canvasRect(ctx);                                   // one layout read per frame (Picker's canvas rect)
    const sel = ctx.cam?.lockTarget ?? null;
    const hov = ctx.cam?.hover?.kind === 'enemy' ? ctx.cam.hover.actor : null;
    const list = pickBars(tracked, isEnemy(sel) ? sel : null, hov, this.boss);
    const touch = ctx.input?.device === 'touch';
    flag(this.root, 'is-touch', touch);
    let i = 0;
    for (let n = 0; n < list.length; n++) {
      if (i >= this.bars.length) break;
      const a = list[n].actor, alpha = list[n].alpha;
      const sp = project(cam, a.pos, (a.height ?? 1) + HPBAR.up, R);
      if (!sp) continue;
      const b = this.bars[i++];
      b.actor = a;
      flag(b.el, 'is-on', true);
      flag(b.el, 'is-sel', a === sel);
      const f = frac(a);
      const t = this.track.get(a);
      let chip = f;                                              // never hit (selected / hovered only): no trail
      if (t) {
        // chip trail: holds, then drains toward the fill
        if (t.chip > f) { if (t.hold > 0) t.hold -= dt; else t.chip = Math.max(f, t.chip - HPBAR.chipRate * dt); } else t.chip = f;
        chip = t.chip;
      }
      const qf = Math.round(f * 1000), qc = Math.round(Math.min(1, chip) * 1000), qa = Math.round(alpha * 100);
      if (qf !== b.qf) { b.qf = qf; setVar(b.fill, '--f', qf / 1000); }
      if (qc !== b.qc) { b.qc = qc; setVar(b.chip, '--f', qc / 1000); }
      if (qa !== b.qa) { b.qa = qa; setVar(b.el, '--a', qa / 100); }
      const qx = Math.round(sp.x * 10), qy = Math.round(sp.y * 10);
      if (qx !== b.qx || qy !== b.qy) { b.qx = qx; b.qy = qy; b.el.style.transform = `translate(${qx / 10}px, ${qy / 10}px)`; }
    }
    for (; i < this.bars.length; i++) { const b = this.bars[i]; b.actor = null; flag(b.el, 'is-on', false); }
    // the Grit arc above her head while guarding
    const p = ctx.player;
    const guarding = !!p && (p.guarding || p.stateName === 'guard' || p.state === 'guard');
    flag(this.grit, 'is-on', guarding);
    if (guarding) {
      const sp = project(cam, p.pos, (p.height ?? 0.9) + HPBAR.gritUp, R);
      if (sp) {
        const qx = Math.round(sp.x * 10), qy = Math.round(sp.y * 10);
        if (qx !== this.grit._qx || qy !== this.grit._qy) {
          this.grit._qx = qx; this.grit._qy = qy;
          this.grit.style.transform = `translate(${qx / 10}px, ${qy / 10}px)`;
        }
      }
      const g = Math.max(0, p.grit ?? 0), gm = Math.max(1, p.gritMax ?? 3);
      const k = `${Math.ceil(g)}/${gm}`;
      if (this.grit._k !== k) {
        this.grit._k = k;
        this.gritSegs.forEach((s, j) => { s.classList.toggle('f', j < Math.ceil(g)); s.style.display = j < gm ? '' : 'none'; });
      }
      flag(this.grit, 'is-broken', g <= 0);
    }
  }

  dispose() { for (const off of this._offs) off?.(); this.root.remove(); }
}

function frac(a) { return Math.max(0, Math.min(1, (a.hp ?? 0) / Math.max(1, a.maxHp ?? 1))); }

/** World point (feet + up) → viewport CSS px inside the canvas rect `R` (the #ui-world layer is fixed at inset 0), or
 *  null when behind the lens / far off screen. Returns module scratch. */
const _sp = { x: 0, y: 0 };
function project(cam, pos, up, R) {
  _v.copy(pos); _v.y += up;
  _d.copy(_v).sub(cam.position);
  if (_d.dot(cam.getWorldDirection(_f)) <= 0) return null;
  _v.project(cam);
  if (Math.abs(_v.x) > 1.05 || Math.abs(_v.y) > 1.05) return null;
  _sp.x = R.left + (_v.x * 0.5 + 0.5) * R.width;
  _sp.y = R.top + (-_v.y * 0.5 + 0.5) * R.height;
  return _sp;
}

/** Three arc segments over a 40 × 16 box (the Grit arc). */
function gritSvg() {
  const seg = (a0, a1) => {
    const r = 16, cx = 20, cy = 20;
    const p = (a) => `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy - r * Math.sin(a)).toFixed(2)}`;
    const d = `M${p(a0)} A${r} ${r} 0 0 1 ${p(a1)}`;
    return `<g class="ga-seg"><path class="ga-o" d="${d}"/><path class="ga-f" d="${d}"/></g>`;
  };
  const gap = 0.14, a = Math.PI * 0.84, b = Math.PI * 0.16, step = (a - b) / 3;
  let h = '';
  for (let i = 0; i < 3; i++) h += seg(a - i * step - (i > 0 ? gap / 2 : 0), a - (i + 1) * step + (i < 2 ? gap / 2 : 0));
  return `<svg viewBox="0 0 40 18" width="40" height="18" aria-hidden="true"><g fill="none" stroke-linecap="round">${h}</g></svg>`;
}
