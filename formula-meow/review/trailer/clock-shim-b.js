// Capture-only virtual clock (trailer group B; added with context.addInitScript, never shipped with the game).
// Live mode: time runs with the real clock (loading, menus, clicks). `__cap.freeze()` stops it; `__cap.step(n)` then
// advances exactly 1000/60 ms per step: due timers fire, the rAF queue is flushed once with the virtual timestamp,
// and every CSS/Web animation moves on by one frame. performance.now, Date.now, rAF and timers all read this clock.
(() => {
  if (window.__cap) return;
  const FRAME = 1000 / 60;
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
