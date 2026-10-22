/**
 * Virtual clock for the trailer harness (a classic script, loaded before any module): performance.now, Date.now,
 * setTimeout / setInterval, requestAnimationFrame, Math.random and every CSS animation run on a clock that moves only
 * when the harness says so. Each captured frame advances it by exactly 1/60 s × the shot's speed ramp, so a capture
 * never drops or repeats a frame and two runs of a shot draw the same pixels. Dev only: never part of a build.
 *
 *   __vclock.advance(ms)   move the clock, fire due timers in order, run one round of rAF callbacks, sync CSS
 *   __vclock.free(on)      while loading: let the clock follow real time (timers fire as usual)
 *   __vclock.seed(n)       reseed Math.random (mulberry32)
 */
(() => {
  const realNow = performance.now.bind(performance);
  const realSetTimeout = window.setTimeout.bind(window);
  const realClearTimeout = window.clearTimeout.bind(window);
  const EPOCH = Date.UTC(2026, 10, 12, 12, 0, 0);
  let now = 0;
  let free = true;
  let freeBase = realNow();
  let freeFrom = 0;
  let nextId = 1;
  /** id → { at, fn, args, every } */
  const timers = new Map();
  let rafs = new Map();
  let seedState = 0x2f6b9a1d;
  /** CSS / Web animations: when the clock first saw each one, and its local time then. */
  const seen = new WeakMap();

  const clock = () => {
    if (free) now = Math.max(now, freeFrom + (realNow() - freeBase));
    return now;
  };

  performance.now = () => clock();
  Date.now = () => EPOCH + Math.floor(clock());
  const RealDate = Date;
  // `new Date()` with no argument reads the virtual clock too
  window.Date = class extends RealDate {
    constructor(...a) {
      if (a.length === 0) super(EPOCH + Math.floor(clock()));
      else super(...a);
    }
    static now() {
      return EPOCH + Math.floor(clock());
    }
  };

  const add = (fn, ms, args, every) => {
    const id = nextId++;
    timers.set(id, { at: clock() + Math.max(0, Number(ms) || 0), fn, args, every, seq: id });
    if (free) pump();
    return id;
  };
  window.setTimeout = (fn, ms, ...args) => add(fn, ms, args, 0);
  window.setInterval = (fn, ms, ...args) => add(fn, ms, args, Math.max(1, Number(ms) || 1));
  window.clearTimeout = (id) => void timers.delete(id);
  window.clearInterval = (id) => void timers.delete(id);
  window.requestAnimationFrame = (fn) => {
    const id = nextId++;
    rafs.set(id, fn);
    return id;
  };
  window.cancelAnimationFrame = (id) => void rafs.delete(id);

  Math.random = () => {
    seedState = (seedState + 0x6d2b79f5) | 0;
    let t = seedState;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  /** Fire every timer due by the clock, earliest first (ties in creation order). */
  function fire() {
    for (let guard = 0; guard < 10000; guard++) {
      let pick = null;
      let pickId = 0;
      for (const [id, t] of timers) {
        if (t.at > now) continue;
        if (!pick || t.at < pick.at || (t.at === pick.at && t.seq < pick.seq)) {
          pick = t;
          pickId = id;
        }
      }
      if (!pick) return;
      if (pick.every) {
        pick.at += pick.every;
        pick.seq = nextId++;
      } else timers.delete(pickId);
      try {
        if (typeof pick.fn === 'function') pick.fn(...(pick.args ?? []));
      } catch (e) {
        console.error('vclock timer', e);
      }
    }
  }

  function runRaf() {
    const list = rafs;
    rafs = new Map();
    for (const fn of list.values()) {
      try {
        fn(now);
      } catch (e) {
        console.error('vclock raf', e);
      }
    }
  }

  /** Hold every CSS animation and transition at the virtual clock. */
  function syncAnimations() {
    if (!document.getAnimations) return;
    for (const a of document.getAnimations()) {
      let s = seen.get(a);
      if (!s) {
        s = { at: now, local: Number(a.currentTime) || 0 };
        seen.set(a, s);
      }
      const t = s.local + (now - s.at) * (a.playbackRate || 1);
      const timing = a.effect?.getComputedTiming?.();
      const end = timing ? Number(timing.endTime) : Infinity;
      try {
        if (Number.isFinite(end) && t >= end) {
          a.finish();
        } else {
          if (a.playState === 'running') a.pause();
          a.currentTime = t;
        }
      } catch {
        /* an animation that finished or was removed this frame */
      }
    }
  }

  let pumping = false;
  /** Free mode: follow real time with a timer of our own. */
  function pump() {
    if (pumping || !free) return;
    pumping = true;
    realSetTimeout(function loop() {
      if (!free) {
        pumping = false;
        return;
      }
      clock();
      fire();
      runRaf();
      realSetTimeout(loop, 8);
    }, 8);
  }

  window.__vclock = {
    now: () => clock(),
    free(on) {
      if (on && !free) {
        free = true;
        freeBase = realNow();
        freeFrom = now;
        pump();
      } else if (!on && free) {
        clock();
        free = false;
      }
    },
    /** Jump the clock forward to at least `ms` (frozen mode). */
    jump(ms) {
      now = Math.max(now, ms);
    },
    advance(ms) {
      if (free) this.free(false);
      const target = now + Math.max(0, ms);
      // fire timers at their own due times, so a 1.3 s pop removal lands inside the frame it belongs to
      for (let guard = 0; guard < 10000; guard++) {
        let due = Infinity;
        for (const t of timers.values()) if (t.at < due) due = t.at;
        if (due > target) break;
        now = Math.max(now, due);
        fire();
      }
      now = target;
      fire();
      runRaf();
      syncAnimations();
    },
    sync: syncAnimations,
    seed(n) {
      seedState = n | 0;
    },
    pending: () => ({ timers: timers.size, rafs: rafs.size }),
    realNow,
  };
  pump();
})();
