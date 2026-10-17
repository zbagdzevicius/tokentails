// Lifted from Pink Paw Knight (swordcat) at commit 7714dcb: src/fx/DamageNumbers.js
// Licence: all rights reserved, pending founder decision (POC.md §17, GDD §12 decision #3). Not MIT.
// Changes: relative imports rewritten by tools/lift-ppk.mjs; any later hand edit is marked "pawlegends:".
// src/fx/DamageNumbers.js  (owner: fx) — GAME_DESIGN §8.3 / art.md §13, upgraded by WARM_ADVENTURE_SPEC §5.2–5.3
// ("Damage numbers v2" + words and comic pops; WA9: DOM, 0 draws). Fredoka 700 with a cocoa #4A2A1F stroke:
//   numbers  overshoot 0 → 1.35 (0.06 s) → 0.95 (0.14 s) → 1.0, out 1 → 0.7 + fade over the last 0.25 s; an arc that
//            rises 0.6 m and drifts ±0.25 m sideways (alternating per hit); colours normal white, heavy cream, crit gold,
//            heal mint, hurt-to-her pink; hits on one target within 0.35 s MERGE into one node (bump ×1.15, count up);
//   words    her combo / skill words ("Snip!", "Snap!", "Swoosh!", "Shine!", "Bonk!" …): #FFF6DA, 30 px, a pink
//            under-stroke, skewed −4°, 0.25 m above HER head, at most one per 0.25 s, off with settings.hitWords false;
//   pops     comic pops over the TARGET ("BONK!", "PARRY!", "CLANK!", "BOING!"): butter fill, cocoa stroke, 40 px,
//            scale 0 → 1.2 → 1 in 180 ms, rise 0.6 m, faded by 0.7 s.
// TT5 (TOKENTAILS-PLAN §13.1): at most DAMAGE_FX.wordCap words and pops on screen at once (a new one retires the
// oldest), and her words alternate between two lanes either side of her head so they never stack on each other.
// One pool of 20 DOM nodes (pointer-events: none, created in init(), never at import); per frame only `transform` and
// `opacity` are written (PERF §10.5). The pool works without a DOM (node tests count nodes; nothing is drawn).
import * as THREE from 'three';

export const DAMAGE_STYLE = Object.freeze({
  normal: { color: '#FFFFFF', size: 26 },
  heavy: { color: '#FFF1C4', size: 32 },
  crit: { color: '#FFD34D', size: 36 },
  heal: { color: '#9BE3C4', size: 28 },
  hurt: { color: '#FF8FB1', size: 24 },
  info: { color: '#F4E7C9', size: 22 },
  word: { color: '#FFF6DA', size: 30, under: '#FF9EC0', every: 0.25 },
  pop: { color: '#FFE066', fill: '#FFE066', stroke: '#4A2A1F', size: 40 },
});

/** WA §5.2 / §5.3 timing and motion (s, m). */
export const DAMAGE_FX = Object.freeze({ mergeWindow: 0.35, bump: 1.15, life: 0.95, lifeCrit: 1.2, rise: 0.6, dx: 0.25,
  t1: 0.06, s1: 1.35, t2: 0.14, s2: 0.95, t3: 0.2, outScale: 0.7, fade: 0.25, wordLift: 0.25, wordLife: 0.8, popLife: 0.7, popIn: 0.18, popPeak: 1.2,
  wordCap: 2, wordLane: 0.35 });

/** WA §5.3 words (display text; story may override through ctx.strings `word.<id>`). */
export const WORDS = Object.freeze({ slash1: 'Snip!', slash2: 'Snap!', slash3: 'Swoosh!', bright: 'Shine!', holy: 'Sunburst!', parry: 'Ting!',
  perfectDodge: 'Whoosh!', riposte: 'Riposte!', finalBlow: 'Bonk!' });
/** WA §5.3 comic pops (display text; `pop.<id>` string overrides). */
export const POPS = Object.freeze({ bonk: 'BONK!', parry: 'PARRY!', clank: 'CLANK!', boing: 'BOING!' });

const MAX = 20;
/**
 * CONTROLS_SPEC §10.4 iso camera: numbers scale with the camera distance (× ref / distance, so zooming out shrinks
 * them like the world) and never drop below 18 px.
 */
export const DAMAGE_ISO = Object.freeze({ rise: 0.6, riseHeal: 0.5, refDist: 12.4, minPx: 18, maxMul: 1.3 });

/** Iso size multiplier for a number of base `size` px at camera distance `dist` (pure; unit-tested). */
export function isoNumberScale(size, dist, D = DAMAGE_ISO) {
  const k = dist > 0 ? Math.min(D.maxMul, D.refDist / dist) : 1;
  return Math.max(D.minPx / size, k);
}

/**
 * WA §5.2 number curve at `t` of a `life` s number (pure; unit-tested): scale 0 → 1.35 (0.06 s) → 0.95 (0.14 s) →
 * 1.0 (0.2 s), then 1 → 0.7 with the alpha fading over the last 0.25 s.
 */
export function numberCurve(t, life, F = DAMAGE_FX) {
  let scale;
  if (t < F.t1) scale = F.s1 * (t / F.t1);
  else if (t < F.t2) scale = F.s1 + (F.s2 - F.s1) * ((t - F.t1) / (F.t2 - F.t1));
  else if (t < F.t3) scale = F.s2 + (1 - F.s2) * ((t - F.t2) / (F.t3 - F.t2));
  else scale = 1;
  const out = Math.max(0, Math.min(1, (t - (life - F.fade)) / F.fade));
  if (out > 0) scale *= 1 - (1 - F.outScale) * out;
  return { scale, alpha: 1 - out };
}

/** WA §5.3 pop curve: 0 → 1.2 → 1 in 0.18 s, faded by 0.7 s (pure). */
export function popCurve(t, F = DAMAGE_FX) {
  const half = F.popIn * 0.6;
  const scale = t < half ? F.popPeak * (t / half) : t < F.popIn ? F.popPeak + (1 - F.popPeak) * ((t - half) / (F.popIn - half)) : 1;
  const alpha = t < F.popLife - 0.2 ? 1 : Math.max(0, (F.popLife - t) / 0.2);
  return { scale, alpha };
}

const _p = new THREE.Vector3(), _r = new THREE.Vector3();

/**
 * Text and style for a hit (pure; unit-tested). Damage is shown rounded on the ×10 scale; nothing for blocked or 0 damage.
 * @param {{damage?: number, crit?: boolean, blocked?: boolean, heavy?: boolean}} h
 * @returns {{text: string, style: keyof DAMAGE_STYLE, value: number} | null}
 */
export function formatDamage(h) {
  if (!h || h.blocked) return null;
  const d = Math.round(h.damage ?? 0);
  if (!(d > 0)) return null;
  return { text: String(d), style: h.crit ? 'crit' : h.heavy ? 'heavy' : 'normal', value: d };
}

/** Heal text ("+4"). */
export function formatHeal(amount) {
  const a = Math.round(amount ?? 0);
  return a > 0 ? { text: '+' + a, style: 'heal', value: a } : null;
}

const NUMERIC = new Set(['normal', 'heavy', 'crit']);
const RANK = { normal: 0, heavy: 1, crit: 2 };

const CSS = `
.fx-dmg-layer{position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:8;contain:strict}
.fx-dmg{position:absolute;left:0;top:0;will-change:transform,opacity;white-space:nowrap;
  font-family:'Fredoka','SwordcatFredoka',system-ui,sans-serif;font-weight:700;line-height:1;letter-spacing:.01em;
  color:#fff;-webkit-text-stroke:5px #4A2A1F;paint-order:stroke fill;text-shadow:0 3px 0 #4A2A1F;opacity:0}
.fx-dmg.crit::after{content:'\\2726';position:absolute;right:-.62em;top:-.42em;font-size:.62em;color:#FFF1C4;
  -webkit-text-stroke:3px #A87C32;animation:fxdmgtw .3s ease-in-out infinite alternate}
.fx-dmg.word{-webkit-text-stroke:4px #4A2A1F;text-shadow:0 4px 0 #FF9EC0}
.fx-dmg.pop{-webkit-text-stroke:6px #4A2A1F;text-shadow:0 4px 0 #4A2A1F;letter-spacing:.03em}
@keyframes fxdmgtw{from{transform:scale(.7) rotate(-12deg)}to{transform:scale(1.15) rotate(12deg)}}`;

export class DamageNumbers {
  /** @param {any} ctx */
  constructor(ctx) {
    this.ctx = ctx;
    this.layer = null;
    /**
     * @type {{el: HTMLElement|null, t: number, life: number, pos: THREE.Vector3, dx: number, rise: number, size: number,
     *   style: string, kind: 'num'|'word'|'pop', key: any, value: number, shownValue: number, bump: number, hitT: number, active: boolean}[]}
     */
    this.pool = [];
    for (let i = 0; i < MAX; i++) {
      this.pool.push({ el: null, t: 0, life: DAMAGE_FX.life, pos: new THREE.Vector3(), dx: 0, rise: DAMAGE_FX.rise, size: 26, style: 'normal',
        kind: 'num', key: null, value: 0, shownValue: 0, bump: 0, hitT: 0, active: false });
    }
    this._next = 0;
    this._side = 1;
    this._wordAt = -Infinity;
    this.shown = 0;          // total numbers / words / pops shown (smoke/tests)
    this.merged = 0;         // hits merged into a live number (tests)
    this.words = 0; this.pops = 0;
    this._lane = 1;
    this._style = null;
  }

  init() {
    if (typeof document === 'undefined') return;
    const host = document.getElementById('app') ?? document.body;
    this._style = document.createElement('style');
    this._style.textContent = CSS;
    document.head.appendChild(this._style);
    this.layer = document.createElement('div');
    this.layer.className = 'fx-dmg-layer';
    host.appendChild(this.layer);
    for (const n of this.pool) {
      const el = document.createElement('div');
      el.className = 'fx-dmg';
      this.layer.appendChild(el);
      n.el = el;
    }
    this._loadFont();
  }

  /** Make sure Fredoka is available even if the ui area's stylesheet has not declared it yet. */
  _loadFont() {
    try {
      if (typeof FontFace === 'undefined' || !document.fonts) return;
      for (const f of document.fonts) if (/fredoka/i.test(f.family)) return;
      const url = this.ctx.assets?.url?.('fonts/Fredoka-Latin.woff2');            // ui's PERF I2 subset (same file, cached)
      if (!url) return;
      const face = new FontFace('Fredoka', `url("${url}") format("woff2")`, { weight: '300 700', display: 'swap' });
      face.load().then((f) => document.fonts.add(f)).catch((e) => console.warn('[fx] damage-number font', e?.message ?? e));
    } catch (e) { console.warn('[fx] damage-number font', e?.message ?? e); }
  }

  /** Seconds clock for merge windows / word rate (real time, so hitstop never stretches a merge). */
  _now() { return this.ctx.game?.realTime ?? 0; }

  /** The oldest free node, or the oldest live one. */
  _take() {
    for (let k = 0; k < this.pool.length; k++) {
      const n = this.pool[(this._next + k) % this.pool.length];
      if (!n.active) { this._next = (this._next + k + 1) % this.pool.length; return n; }
    }
    const n = this.pool[this._next % this.pool.length];
    this._next = (this._next + 1) % this.pool.length;
    return n;
  }

  _paint(n, text, style) {
    const el = n.el;
    if (!el) return;
    const st = DAMAGE_STYLE[style] ?? DAMAGE_STYLE.normal;
    el.textContent = text;
    el.className = style === 'crit' ? 'fx-dmg crit' : style === 'word' ? 'fx-dmg word' : style === 'pop' ? 'fx-dmg pop' : 'fx-dmg';
    el.style.color = st.color;
    el.style.fontSize = st.size + 'px';
  }

  /**
   * Show a number at a world position. `style` ∈ DAMAGE_STYLE keys. With a `key` (the target) and a numeric `value`,
   * a hit within 0.35 s of the last one on the same target merges into its node (summed, bumped ×1.15).
   * @param {THREE.Vector3} pos @param {string} text @param {keyof DAMAGE_STYLE} [style] @param {any} [key] @param {number} [value]
   */
  show(pos, text, style = 'normal', key = null, value = NaN) {
    const now = this._now();
    if (key != null && NUMERIC.has(style) && Number.isFinite(value)) {
      for (const n of this.pool) {
        if (!n.active || n.kind !== 'num' || n.key !== key || now - n.hitT > DAMAGE_FX.mergeWindow) continue;
        n.value += value; n.hitT = now; n.bump = 1;
        n.t = Math.min(n.t, DAMAGE_FX.t3);                 // keep it alive and big
        if ((RANK[style] ?? 0) > (RANK[n.style] ?? 0)) { n.style = style; n.size = DAMAGE_STYLE[style].size; this._paint(n, String(Math.round(n.shownValue)), style); }
        this.merged++;
        return n;
      }
    }
    this.shown++;
    const n = this._take();
    const iso = this._iso();
    n.pos.copy(pos); n.t = 0; n.kind = 'num'; n.active = true; n.key = key; n.style = style;
    n.life = style === 'crit' ? DAMAGE_FX.lifeCrit : DAMAGE_FX.life;
    n.value = Number.isFinite(value) ? value : NaN; n.shownValue = n.value; n.hitT = now; n.bump = 0;
    this._side = -this._side;
    n.dx = DAMAGE_FX.dx * this._side;
    // pawlegends: numbers still rising on the same target stack upward instead of on top of each other.
    n.stack = key == null ? 0 : this.pool.reduce((c, o) => c + (o !== n && o.active && o.kind === 'num' && o.key === key ? 1 : 0), 0) % 4;
    n.rise = iso && style === 'heal' ? DAMAGE_ISO.riseHeal : DAMAGE_FX.rise;
    n.size = (DAMAGE_STYLE[style] ?? DAMAGE_STYLE.normal).size;
    this._paint(n, text, style);
    return n;
  }

  /**
   * WA §5.3 a word over her head (`id` a WORDS key or literal text): at most one per 0.25 s; nothing when
   * settings.hitWords is false. Returns true when shown.
   */
  word(id, pos, opts = null) {
    if (this.ctx.state?.settings?.hitWords === false) return false;
    const now = this._now();
    if (!opts?.force && now - this._wordAt < DAMAGE_STYLE.word.every) return false;
    const text = opts?.text ?? this._str(`word.${id}`) ?? WORDS[id] ?? String(id);
    if (!text) return false;
    this._wordAt = now;
    this.shown++; this.words++;
    this._capTexts();
    const n = this._take();
    n.pos.copy(pos); if (!opts?.lifted) n.pos.y += DAMAGE_FX.wordLift;
    // two lanes either side of her head (screen-right in world space), alternating
    const cam = this.ctx.camera;
    if (cam?.matrixWorld) { this._lane = -this._lane; _r.setFromMatrixColumn(cam.matrixWorld, 0); n.pos.addScaledVector(_r, DAMAGE_FX.wordLane * this._lane); }
    n.t = 0; n.kind = 'word'; n.active = true; n.key = null; n.style = 'word'; n.life = DAMAGE_FX.wordLife; n.dx = 0; n.rise = 0.35;
    n.size = DAMAGE_STYLE.word.size; n.value = NaN; n.bump = 0;
    this._paint(n, text, 'word');
    return true;
  }

  /** WA §5.3 a comic pop over a target (`id` a POPS key or literal text). */
  pop(id, pos) {
    const text = this._str(`pop.${id}`) ?? POPS[id] ?? String(id);
    if (!text) return false;
    this.shown++; this.pops++;
    this._capTexts();
    const n = this._take();
    n.pos.copy(pos); n.t = 0; n.kind = 'pop'; n.active = true; n.key = null; n.style = 'pop'; n.life = DAMAGE_FX.popLife; n.dx = 0; n.rise = DAMAGE_FX.rise;
    n.size = DAMAGE_STYLE.pop.size; n.value = NaN; n.bump = 0;
    this._paint(n, text, 'pop');
    return true;
  }

  /** Words and pops on screen now. */
  get texts() { let k = 0; for (const n of this.pool) if (n.active && (n.kind === 'word' || n.kind === 'pop')) k++; return k; }

  /** TT5: make room for one more word / pop (retire the oldest while DAMAGE_FX.wordCap are up). */
  _capTexts() {
    for (let guard = 0; guard < MAX && this.texts >= DAMAGE_FX.wordCap; guard++) {
      let old = null;
      for (const n of this.pool) if (n.active && (n.kind === 'word' || n.kind === 'pop') && (!old || n.t > old.t)) old = n;
      if (!old) break;
      old.active = false; if (old.el) old.el.style.opacity = '0';
    }
  }

  /** A strings row when story defines it (ctx.strings.t returns the key itself for a missing row). */
  _str(key) { const S = this.ctx.strings; return S?.has?.(key) ? S.t(key) : null; }

  /** The iso play camera (not classic). */
  _iso() { const c = this.ctx?.cam; return !!c?.isIso && this.ctx?.params?.cam !== 'classic'; }

  get active() { let k = 0; for (const n of this.pool) if (n.active) k++; return k; }

  _any() { for (const n of this.pool) if (n.active) return true; return false; }

  /** Per frame: project and animate (dt = visual dt; frozen in the pause menu). */
  render(dt) {
    if (!this._any()) return;
    const cam = this.ctx.camera, hasDom = !!this.layer;
    const w = hasDom ? window.innerWidth : 1, h = hasDom ? window.innerHeight : 1;
    const iso = this._iso(), dist = iso ? (this.ctx.cam?.distance ?? cam.position.distanceTo(this.ctx.cam?.focus ?? cam.position)) : 0;
    if (cam) _r.setFromMatrixColumn(cam.matrixWorld, 0);     // screen-right in world space (the ±0.25 m drift)
    for (const n of this.pool) {
      if (!n.active) continue;
      n.t += dt;
      if (n.t >= n.life) { n.active = false; if (n.el) n.el.style.opacity = '0'; continue; }
      // count up toward a merged sum (0.12 s)
      if (n.kind === 'num' && Number.isFinite(n.value) && n.shownValue !== n.value) {
        const prev = Math.round(n.shownValue);
        n.shownValue = n.shownValue + (n.value - n.shownValue) * Math.min(1, dt / 0.12 + 0.2);
        if (Math.abs(n.value - n.shownValue) < 0.5) n.shownValue = n.value;
        const now = Math.round(n.shownValue);
        if (now !== prev && n.el) n.el.textContent = String(now);
      }
      if (n.bump > 0) n.bump = Math.max(0, n.bump - dt / 0.15);
      if (!hasDom || !cam) continue;
      const u = n.t / n.life;
      const c = n.kind === 'pop' ? popCurve(n.t) : n.kind === 'word' ? numberCurve(n.t, n.life) : numberCurve(n.t, n.life);
      const rise = n.rise * (1 - (1 - u) * (1 - u));
      _p.copy(n.pos); _p.y += rise + (n.kind === 'num' ? (n.stack ?? 0) * 0.34 : 0); // pawlegends: stack offset
      if (n.dx) _p.addScaledVector(_r, n.dx * u);
      _p.project(cam);
      if (_p.z > 1 || _p.z < -1) { n.el.style.opacity = '0'; continue; }
      // pawlegends: kept inside the screen (a word at the edge was cut in half on a phone).
      const x = Math.min(w - 56, Math.max(56, (_p.x * 0.5 + 0.5) * w)), y = Math.min(h - 24, Math.max(24, (-_p.y * 0.5 + 0.5) * h));
      const s = c.scale * (1 + (DAMAGE_FX.bump - 1) * n.bump) * (iso ? isoNumberScale(n.size ?? 26, dist) : 1);
      n.el.style.opacity = c.alpha.toFixed(3);
      n.el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) translate(-50%,-50%) scale(${s.toFixed(3)})${n.kind === 'word' ? ' skewX(-4deg)' : ''}`;
    }
  }

  clear() { for (const n of this.pool) { n.active = false; if (n.el) n.el.style.opacity = '0'; } }

  dispose() {
    this.layer?.remove(); this._style?.remove();
    this.layer = null;
    for (const n of this.pool) n.el = null;
  }
}
