// Capture-only page helper for trailer group A (context.addInitScript after clock-shim-a.js; never shipped with the
// game). It reads the game through the existing QA hooks (window.__fm.shell) and only changes render-side or
// harness state: simSpeed, the accumulator quantise, the camera's reduced-motion flag, the HUD, DOM visibility.
// The one sim-side change is the wall recipe (STORYBOARD 6.8): for the wall shots the player kart's input comes from
// a "player" that holds gas and steers onto the lane instead of the bot, the same input a person would give.
(() => {
  const DT = 1 / 60;
  const A = (window.__A = {});
  // the clock freezes on the first live frame with a race world (the race then waits at tick 0 or 1)
  window.__capAutoFreeze = () => !!(window.__fm && window.__fm.shell && window.__fm.shell.world);

  const wrap = (a) => {
    while (a > Math.PI) a -= 2 * Math.PI;
    while (a < -Math.PI) a += 2 * Math.PI;
    return a;
  };
  const sh = () => window.__fm.shell;
  const W = () => sh().world;
  const meIdx = () => W().cfg.humans[0];
  const piece = (t, kind) => t.pieces.find((q) => q.kind === kind);
  const into = (t, k, p) => ((k.si - p.i0 + t.n) % t.n) / Math.max(1, (p.i1 - p.i0 + t.n) % t.n);

  // ---- conditions (STORYBOARD 6.7) ------------------------------------------------------------------------------
  // each gets (k, t, w, S) where S is per-condition scratch; returns true on the anchor tick (edge-detected below)
  const COND = {
    LOOP_TOP: (k) => k.rail > 0 && k.su > 33 && k.su < 44,
    LOOP_IN: (k) => k.rail > 0,
    JUMP_MID: (k) => k.gapLaunch > 0 && k.airTicks > 22,
    JUMP_LAUNCH: (k) => k.gapLaunch > 0 && k.airTicks === 1,
    JUMP_LAND: (k, t, w, S) => {
      if (k.gapLaunch > 0 && k.airTicks === 1) S.launch = w.st.tick;
      const hit = !!S.gap && k.air === 0;
      S.gap = k.gapLaunch > 0 && k.air > 0;
      return hit;
    },
    TUNNEL_MID: (k, t) => {
      const p = piece(t, 'tunnel');
      if (!p || k.branch !== -1 || t.tunnelMask[k.si] !== 1) return false;
      const f = into(t, k, p);
      return f > 0.4 && f < 0.7;
    },
    WALL_ON: (k, t) => {
      const p = piece(t, 'wall');
      if (!p || k.air !== 0 || k.surface !== 6) return false;
      return into(t, k, p) <= 1;
    },
  };

  // ---- scores: how well an occurrence meets the shot's "want" -------------------------------------------------
  const rel = (k, o) => {
    const dx = o.x - k.x;
    const dz = o.z - k.z;
    const s = Math.sin(k.heading);
    const c = Math.cos(k.heading);
    return { f: dx * s + dz * c, lat: dx * c - dz * s, d: Math.hypot(dx, dz, o.y - k.y) };
  };
  const others = (w) => w.st.karts.filter((_, i) => i !== meIdx());
  const SCORE = {
    none: () => 1,
    // rivals in a forward cone (what the chase camera shows)
    rivalsAhead: (k, w) => {
      let n = 0;
      for (const o of others(w)) {
        const r = rel(k, o);
        if (r.f > 2 && r.f < 45 && Math.abs(r.lat) < r.f * 0.6 + 2) n++;
      }
      return n;
    },
    rivalsClose: (k, w) => {
      let n = 0;
      for (const o of others(w)) {
        const r = rel(k, o);
        if (r.f > -2 && r.f < 25 && Math.abs(r.lat) < r.f * 0.7 + 3) n++;
      }
      return n;
    },
    midGrid: (k, w) => {
      let l = 0;
      let r = 0;
      let a = 0;
      for (const o of others(w)) {
        const q = rel(k, o);
        if (Math.abs(q.f) < 6 && q.lat < -1) l++;
        if (Math.abs(q.f) < 6 && q.lat > 1) r++;
        if (q.f > 1 && q.f < 25) a++;
      }
      return Math.min(l, r) * 10 + a;
    },
    rivalAirNear: (k, w) => {
      let best = 0;
      for (const o of others(w)) {
        const q = rel(k, o);
        if (o.air > 0 && q.d < 12 && q.f > -3) best = Math.max(best, 13 - q.d);
      }
      return best;
    },
    rivalOnLoopAhead: (k, w) => {
      let best = 0;
      for (const o of others(w)) {
        const q = rel(k, o);
        if (o.rail > 0 && q.d < 30 && q.f > 0) best = Math.max(best, 31 - q.d);
      }
      return best;
    },
    kartsOnWheel: (k, w) => {
      let n = 0;
      for (const o of w.st.karts) if (o.rail > 0 && rel(k, o).d < 35) n++;
      return n;
    },
  };

  // ---- the tick hook ---------------------------------------------------------------------------------------------
  A.spec = null; // { cond | event, score, window, offset }
  A.occ = []; // { tick, score, lap }
  A.log = []; // per-tick player info while recording (optional)
  A.events = []; // events of me / race-wide, since the last frame read
  A.ticks = 0;
  let hooked = null;
  A.hook = (spec) => {
    A.spec = spec;
    const w = W();
    if (hooked === w) return;
    hooked = w;
    const orig = w.step.bind(w);
    const S = {};
    let prev = false;
    let since = 1e9;
    let evIdx = 0;
    const pending = [];
    w.step = (inputs) => {
      orig(inputs);
      A.ticks++;
      const sp = A.spec;
      const me = meIdx();
      const k = w.st.karts[me];
      const t = w.track;
      const ev = w.st.events;
      for (; evIdx < ev.length; evIdx++) {
        const e = ev[evIdx];
        if (e.kart === me || e.kart === -1 || e.b === me) A.events.push({ type: e.type, kart: e.kart, a: e.a, b: e.b, tick: e.tick, item: e.item });
        if (sp && sp.event && e.type === sp.event.type && (sp.event.anyKart ? true : e.kart === (sp.event.kart ?? me)) && (sp.event.a === undefined || e.a === sp.event.a)) {
          if (!sp.event.afterGo || w.st.tick > 180) pending.push({ tick: w.st.tick, score: -1, left: sp.window ?? 0, lap: k.lap });
        }
      }
      if (sp && sp.cond && !k.finished) {
        const now = !!COND[sp.cond](k, t, w, S);
        if (now && !prev && since > 30) pending.push({ tick: w.st.tick + (sp.offset ?? 0), score: -1, left: (sp.window ?? 0) + (sp.offset ?? 0), lap: k.lap, launch: S.launch });
        since = now ? 0 : since + 1;
        prev = now;
      }
      for (let i = pending.length - 1; i >= 0; i--) {
        const o = pending[i];
        if (sp && w.st.tick >= o.tick - (sp.scoreBefore ?? 0)) o.score = Math.max(o.score, SCORE[sp.score ?? 'none'](k, w));
        if (w.st.tick >= o.tick && o.left-- <= 0) {
          pending.splice(i, 1);
          A.occ.push(o);
        }
      }
    };
  };

  // ---- the wall recipe (STORYBOARD 6.8) -------------------------------------------------------------------------
  A.wall = null;
  A.installWall = () => {
    const s = sh();
    const w = W();
    const t = w.track;
    const p = piece(t, 'wall');
    if (!p) return false;
    const mid = (p.i0 + Math.floor(((p.i1 - p.i0 + t.n) % t.n) / 2)) % t.n;
    const side = t.laneR[mid] >= t.laneL[mid] ? 1 : -1;
    // sample spacing (m)
    let L = 0;
    for (let i = 0; i < t.n; i++) {
      const j = (i + 1) % t.n;
      L += Math.hypot(t.px[j] - t.px[i], t.pz[j] - t.pz[i]);
    }
    const ds = L / t.n;
    const st = { phase: 'idle', after: 0, side, ds, p, uses: 0 };
    A.wall = st;
    const orig = Object.getPrototypeOf(s).botDrive;
    s.botDrive = function () {
      const k = this.world.st.karts[this.me];
      const ahead = ((p.i0 - k.si + t.n) % t.n) * ds; // metres to the lane start
      const f = into(t, k, p);
      const inside = ((k.si - p.i0 + t.n) % t.n) <= ((p.i1 - p.i0 + t.n) % t.n);
      if (st.phase === 'idle' && k.branch === -1 && !k.rail && ahead > 0 && ahead <= 40 && this.world.st.tick > 180) st.phase = 'run';
      if (st.phase === 'run' && !inside && ahead > 60) {
        st.phase = 'after';
        st.after = 0;
      }
      if (st.phase === 'after' && ++st.after > 40) {
        st.phase = ahead > 80 ? 'idle' : 'after';
        if (st.phase === 'idle') st.uses++;
      }
      if (st.phase !== 'run') return orig.call(this);
      // a player who holds gas and steers for the lane centre (a point 10 m ahead), then just holds it there
      const j = (k.si + Math.max(2, Math.round(10 / ds))) % t.n;
      const lane = side > 0 ? t.laneR[j] : t.laneL[j];
      const d = side * (t.halfW[j] + Math.max(0, lane) * 0.5);
      const tx = t.px[j] - t.tz[j] * d;
      const tz = t.pz[j] + t.tx[j] * d;
      const want = Math.atan2(tx - k.x, tz - k.z);
      const face = k.driftDir !== 0 ? Math.atan2(k.vx, k.vz) : k.heading;
      const err = wrap(want - face);
      const lim = k.surface === 6 ? 3 : 7;
      const steer = Math.max(-lim, Math.min(lim, Math.round(Math.max(-1, Math.min(1, -err * 2.4)) * 7)));
      void f;
      return { steer, gas: true, brake: false, drift: false, item: false, itemBack: false };
    };
    return true;
  };

  // ---- setup, fast-forward, frame ---------------------------------------------------------------------------------
  A.setup = (opts) => {
    const s = sh();
    s.simSpeed = 0;
    try {
      s.updateSettings({ muted: true });
    } catch {
      /* ignore */
    }
    if (!opts.dom) {
      s.hud.setVisible(false);
      const st = document.createElement('style');
      st.textContent = 'body *:not(canvas){visibility:hidden!important} canvas{visibility:visible!important}';
      document.head.appendChild(st);
    }
    // pin the DPR (the capture clock always reads 60 fps; this only guards the live seconds before the freeze)
    const stage = s.stage;
    const want = Math.min(2, window.devicePixelRatio || 1);
    stage.govern = () => {
      if (Math.abs(stage.dpr - want) > 1e-3) {
        stage.dpr = want;
        stage.renderer.setPixelRatio(want);
        window.dispatchEvent(new Event('resize'));
      }
    };
    // render switch for the fast-forward
    const r = stage.renderer;
    if (!r.__capWrapped) {
      const draw = r.render.bind(r);
      r.__capWrapped = true;
      r.render = (sc, cam) => {
        if (A.noRender) return;
        draw(sc, cam);
      };
    }
    A.calls = 0;
    return { dpr: stage.dpr, tick: W().st.tick, w: r.domElement.width, h: r.domElement.height };
  };
  A.noRender = false;
  const quant = () => {
    const s = sh();
    s.acc = (Math.round((s.acc / DT) * 1e6) / 1e6) * DT + 1e-9;
  };
  /** Fast-forward (no render) until the race tick reaches `to` or `stop()` says so; at most `maxFrames` frames. */
  A.ff = (to, maxFrames = 400, speed = 24) => {
    const s = sh();
    A.noRender = true;
    for (let i = 0; i < maxFrames; i++) {
      const w = W();
      const left = to - w.st.tick;
      if (left <= 0) break;
      if (w.st.karts[meIdx()].finished && A.stopOnFinish) break;
      s.simSpeed = Math.min(speed, left);
      quant();
      window.__cap.step(1);
    }
    s.simSpeed = 1;
    A.noRender = false;
    return W().st.tick;
  };
  /** One recorded frame: schedule (simSpeed, camera flags) then exactly 1/60 s. */
  A.frame = (cfg) => {
    const s = sh();
    if (cfg.simSpeed !== undefined) s.simSpeed = cfg.simSpeed;
    if (cfg.tv !== undefined) s.camera.feel.reducedMotion = cfg.tv;
    if (cfg.resetAcc) s.acc = 1e-9;
    quant();
    const t0 = W().st.tick;
    A.events = [];
    window.__cap.step(1);
    const w = W();
    const k = w.st.karts[meIdx()];
    const calls = s.stage.renderer.info.render.calls;
    return {
      tick: w.st.tick,
      steps: w.st.tick - t0,
      si: k.si,
      rail: k.rail,
      air: k.air,
      surface: k.surface,
      lap: k.lap,
      place: k.place,
      finished: k.finished,
      cam: s.camera.mode,
      calls,
      events: A.events.map((e) => `${e.type}${e.a !== undefined ? ':' + e.a : ''}${e.kart === meIdx() ? '' : '@' + e.kart}`),
    };
  };
})();
