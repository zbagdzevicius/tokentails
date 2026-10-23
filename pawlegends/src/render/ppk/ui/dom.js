// Lifted from Pink Paw Knight (swordcat) at commit 7714dcb: src/ui/dom.js
// Licence: all rights reserved, pending founder decision (POC.md §17, GDD §12 decision #3). Not MIT.
// Changes: relative imports rewritten by tools/lift-ppk.mjs; any later hand edit is marked "pawlegends:".
// src/ui/dom.js  (owner: ui) — tiny DOM helpers shared by the ui modules. Functions only touch the DOM when called
// (never at import), so every ui module stays node-importable.

/**
 * Create an element. `cls` is a class string; `html` sets innerHTML (trusted, built from escaped strings / our SVG).
 * @param {string} tag @param {string} [cls] @param {{html?: string, text?: string, attrs?: Record<string,string>, parent?: Element}} [o]
 * @returns {HTMLElement}
 */
export function el(tag, cls = '', o = {}) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (o.html != null) e.innerHTML = o.html;
  else if (o.text != null) e.textContent = o.text;
  if (o.attrs) for (const [k, v] of Object.entries(o.attrs)) e.setAttribute(k, v);
  if (o.parent) o.parent.appendChild(e);
  return e;
}

/** Set textContent only when it changed (avoids layout work). */
export function setText(e, s) {
  if (!e) return;
  const v = String(s ?? '');
  if (e._t !== v) { e._t = v; e.textContent = v; }
}

/** Set innerHTML only when it changed. */
export function setHtml(e, s) {
  if (!e) return;
  const v = String(s ?? '');
  if (e._h !== v) { e._h = v; e.innerHTML = v; }
}

/** Toggle a class only when it changed. Shares its cache with `pulse`, so a pulsed class can be flagged off again. */
export function flag(e, cls, on) {
  if (!e) return;
  const k = '_c_' + cls;
  if (!on) _pulseQ?.get(e)?.delete(cls);         // a pending pulse restart must not re-add a class flagged off
  if (e[k] === !!on) return;
  e[k] = !!on;
  e.classList.toggle(cls, !!on);
}

/** Set a CSS custom property only when it changed. */
export function setVar(e, name, v) {
  if (!e) return;
  const k = '_v_' + name, s = String(v);
  if (e[k] === s) return;
  e[k] = s;
  e.style.setProperty(name, s);
}

/** Remove a CSS custom property set with setVar, cache included (a bare removeProperty left the cache saying the value
 *  was still there, so the next identical setVar was skipped: the hearts lost --heart-w every other fit and wrapped). */
export function clearVar(e, name) {
  if (!e) return;
  delete e['_v_' + name];
  e.style.removeProperty(name);
}

/** Pending pulse restarts: element -> Set of classes to re-add (see pulse). */
let _pulseQ = null;
const _nextFrame = (fn) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(fn) : setTimeout(fn, 16));

/**
 * Restart a CSS animation class WITHOUT a forced reflow (pulses fire from bus handlers inside Game.step, where a
 * synchronous layout costs ms on exactly the hit / hitstop frames). Not set yet: the class is just added. Already set:
 * it is removed now and re-added two frames later (one rendered frame without it restarts the animation); every pulse
 * queued in between shares one rAF chain.
 */
export function pulse(e, cls) {
  if (!e) return;
  e['_c_' + cls] = true;                         // keep flag()'s cache honest: flag(e, cls, false) must remove it later
  if (!e.classList.contains(cls)) {
    if (_pulseQ?.get(e)?.has(cls)) return;      // already queued to restart
    e.classList.add(cls);
    return;
  }
  e.classList.remove(cls);
  if (!_pulseQ) {
    _pulseQ = new Map();
    _nextFrame(() => _nextFrame(() => {
      const q = _pulseQ; _pulseQ = null;
      for (const [node, set] of q) for (const c of set) node.classList.add(c);
    }));
  }
  let set = _pulseQ.get(e);
  if (!set) _pulseQ.set(e, (set = new Set()));
  set.add(cls);
}

/** Translate an absolutely positioned element (px), skipping unchanged writes. */
export function place(e, x, y, extra = '') {
  if (!e) return;
  const s = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)${extra}`;
  if (e._tr !== s) { e._tr = s; e.style.transform = s; }
}

/** Show / hide via the `is-on` class. */
export function show(e, on) { flag(e, 'is-on', on); }

/** Is a DOM available? */
export const hasDom = () => typeof document !== 'undefined' && typeof window !== 'undefined';
