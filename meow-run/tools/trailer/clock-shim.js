// Capture-only virtual clock for the Meow Run trailer (from ultra-cat/tools/trailer/clock-shim.js; added with
// context.addInitScript, never shipped with the game). Also swaps Math.random for a seeded PRNG (__cap.seed(n)) so a
// re-shoot replays the same debris, people and enemy choices.
// Live mode: time runs with the real clock (loading, menus, clicks). `__cap.freeze()` stops it; `__cap.step(n)` then
// advances exactly 1000/60 ms per step: due timers fire, the rAF queue is flushed once with the virtual timestamp,
// and every CSS/Web animation moves on by one frame. performance.now, Date.now, rAF and timers all read this clock.
(() => {
  if (window.__cap) return;
  // a hair over 1/60 s: the game's 120 Hz accumulator then always runs exactly two steps per frame (an exact 1/60 s
  // drifts below 2 x 1/120 by float error and alternates 1 and 3 steps, a visible stutter)
  const FRAME = 1000 / 60 + 1e-6;
  // phones render without MSAA (core/engine.ts asks for antialias only off touch); the portrait capture emulates
  // touch for the real touch HUD, so ask WebGL for MSAA anyway
  const realGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, attrs) {
    if (type === 'webgl2' || type === 'webgl') attrs = { ...(attrs || {}), antialias: true };
    return realGetContext.call(this, type, attrs);
  };
  let seed = 1;
  Math.random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const realNow = performance.now.bind(performance);
  const realRaf = window.requestAnimationFrame.bind(window);
  const realSetTimeout = window.setTimeout.bind(window);
  const realClearTimeout = window.clearTimeout.bind(window);
  const RealDate = Date;
  const dateBase = RealDate.now();
  const perfBase = realNow();
  let frozen = false;
  let offset = 0;
  let vt = 0;
  const now = () => (frozen ? vt : realNow() + offset);

  // --- rAF ---------------------------------------------------------------------------------------------------------
  let rafId = 0;
  let rafQ = new Map();
  const flushRaf = (t) => {
    const q = rafQ;
    rafQ = new Map();
    for (const fn of q.values()) {
      try {
        fn(t);
      } catch (e) {
        console.error(e);
      }
    }
  };
  window.requestAnimationFrame = (fn) => {
    rafQ.set(++rafId, fn);
    return rafId;
  };
  window.cancelAnimationFrame = (id) => {
    rafQ.delete(id);
  };

  // --- timers ------------------------------------------------------------------------------------------------------
  let timerId = 0;
  const timers = new Map(); // id -> { at, fn, args, every }
  window.setTimeout = (fn, ms = 0, ...args) => {
    if (typeof fn !== 'function') return realSetTimeout(fn, ms, ...args);
    const id = ++timerId + 1e6;
    timers.set(id, { at: now() + Math.max(0, +ms || 0), fn, args, every: 0 });
    if (!frozen) kick();
    return id;
  };
  window.setInterval = (fn, ms = 0, ...args) => {
    const id = ++timerId + 1e6;
    const every = Math.max(1, +ms || 0);
    timers.set(id, { at: now() + every, fn, args, every });
    return id;
  };
  window.clearTimeout = window.clearInterval = (id) => {
    if (!timers.delete(id)) realClearTimeout(id);
  };
  const runTimers = (limit) => {
    for (let guard = 0; guard < 10000; guard++) {
      let best = null;
      let bestId = 0;
      for (const [id, t] of timers) if (t.at <= limit && (!best || t.at < best.at)) (best = t), (bestId = id);
      if (!best) return;
      if (best.every) best.at += best.every;
      else timers.delete(bestId);
      try {
        best.fn(...best.args);
      } catch (e) {
        console.error(e);
      }
    }
  };
  // live mode: short timers fire on the next real tick (not just on the next frame), so loading stays fast
  let kicked = false;
  const kick = () => {
    if (kicked) return;
    kicked = true;
    realSetTimeout(() => {
      kicked = false;
      if (!frozen) runTimers(now());
      if (!frozen && [...timers.values()].some((t) => t.at <= now() + 4)) kick();
    }, 1);
  };

  // --- clocks ------------------------------------------------------------------------------------------------------
  performance.now = () => now();
  const vDateNow = () => dateBase + (now() - perfBase);
  class VDate extends RealDate {
    constructor(...a) {
      if (a.length === 0) super(vDateNow());
      else super(...a);
    }
    static now() {
      return vDateNow();
    }
  }
  window.Date = VDate;

  // --- the pump (live mode) ----------------------------------------------------------------------------------------
  const pump = () => {
    realRaf(pump);
    if (frozen) return;
    const t = now();
    runTimers(t);
    flushRaf(t);
  };
  realRaf(pump);

  // --- animations --------------------------------------------------------------------------------------------------
  const seen = new WeakSet();
  const stepAnimations = (ms) => {
    let list = [];
    try {
      list = document.getAnimations();
    } catch {
      return;
    }
    for (const a of list) {
      try {
        if (!seen.has(a)) {
          seen.add(a);
          a.pause();
          continue; // a new animation starts at its current time this frame
        }
        if (a.playState !== 'paused') a.pause();
        const ct = a.currentTime ?? 0;
        a.currentTime = ct + ms;
      } catch {
        /* finished or detached */
      }
    }
  };

  window.__cap = {
    seed(n) {
      seed = n | 0;
    },
    get frozen() {
      return frozen;
    },
    now,
    freeze() {
      if (frozen) return vt;
      vt = now();
      frozen = true;
      return vt;
    },
    thaw() {
      if (!frozen) return;
      offset = vt - realNow();
      frozen = false;
      kick();
    },
    /** advance n frames of 1/60 s; `before(i)` runs before each frame (e.g. the accumulator quantise) */
    step(n = 1, before) {
      if (!frozen) this.freeze();
      for (let i = 0; i < n; i++) {
        if (before) before(i);
        vt += FRAME;
        runTimers(vt);
        stepAnimations(FRAME);
        flushRaf(vt);
      }
      return vt;
    },
  };
})();
