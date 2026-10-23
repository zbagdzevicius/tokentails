// Capture-only director for the Meow Run trailer (added with context.addInitScript after clock-shim.js; never shipped
// with the game, nothing in src/ changes). After `await __dir.init()` it drives the running game through the same
// modules main.ts loaded (imported by their dev-server URLs, so they are the same instances):
//   __dir.bot      per-frame player: the shots/bot.mjs brain (frame-exact, no input latency), acting through
//                  __meow.press and input.botSteer; a shot can hold a lane, force actions or stop playing
//   __dir.cam      optional camera override, applied in a frame hook after the game camera, before render
//   __dir.camTune  optional tweaks of the game camera itself (CAM.back, height, lookAhead, baseFov)
//   __dir.log      game events with the take frame they happened on (the audio is built from them)
//   __dir.frame(n) advance n virtual frames (bot, then one 1/60 s clock step each, then the touch overlay)
(() => {
  if (window.__dir) return;
  const D = {
    f: 0, // frame of the current take
    log: [],
    bot: null,
    cam: null,
    camState: null,
    camTune: null,
    M: {},
    dpr: 2,
    finger: { on: false, gesture: '', g0: -99, steer: 0 },
  };
  window.__dir = D;
  const url = (s) => performance.getEntriesByType('resource').map((e) => e.name).find((n) => n.includes(s));
  const imp = (s) => import(/* @vite-ignore */ url(s) ?? s);
  const U = () => window.__meow;

  D.init = async () => {
    const [events, loop, engine, track, camera] = await Promise.all([imp('/src/core/events.ts'), imp('/src/core/loop.ts'), imp('/src/core/engine.ts'), imp('/src/core/track.ts'), imp('/src/core/camera.ts')]);
    Object.assign(D.M, { events, loop, engine, track, camera });
    D.CAM0 = { ...camera.CAM };
    D.fr = track.newFrame();
    D.fr2 = track.newFrame();
    const names = ['jump', 'pounce', 'land', 'slide', 'fastFall', 'surface', 'abilityPress', 'abilityStart', 'abilityEnd', 'hit', 'fall', 'boost', 'wet', 'pickup', 'bell', 'mult', 'nearMiss', 'chase', 'setPiece', 'callout', 'checkpoint', 'finishLine', 'stageEnd', 'bigHit'];
    for (const n of names)
      events.events.on(n, (e) => {
        const o = { f: D.f, e: n };
        if (e) for (const k of ['air', 'impact', 'on', 'kind', 'prev', 'id', 'label', 'hearts', 'mul', 'points', 'index', 'count', 'value', 'text', 'tone', 'phase', 'strength', 'consumed']) if (e[k] !== undefined && typeof e[k] !== 'object') o[k] = e[k];
        D.log.push(o);
      });
    loop.addFrameHook((dt) => D.applyCam(dt));
    // the finger overlay of the how-to-play cut (portrait): a fingertip that swipes, drags and taps with the bot
    const el = document.createElement('div');
    el.id = '__finger';
    el.innerHTML = '<div class="tip"></div><div class="trail"></div><div class="ring"></div>';
    const st = document.createElement('style');
    st.textContent = `#__finger{position:fixed;left:0;top:0;width:0;height:0;z-index:50;pointer-events:none;display:none}
#__finger .tip{position:absolute;width:62px;height:62px;margin:-31px 0 0 -31px;border-radius:50%;background:rgba(255,247,234,.92);
border:4px solid #2a1c14;box-shadow:0 5px 0 rgba(42,28,20,.55)}
#__finger .trail{position:absolute;width:20px;margin-left:-10px;border-radius:10px;background:linear-gradient(rgba(255,247,234,0),rgba(255,247,234,.75))}
#__finger .ring{position:absolute;width:62px;height:62px;margin:-31px 0 0 -31px;border-radius:50%;border:5px solid #fff7ea;opacity:0}`;
    document.head.appendChild(st);
    document.body.appendChild(el);
    D.fingerEl = el;
    return true;
  };

  /** keep the render at the capture resolution (the engine caps the pixel ratio at 2 and at 1 on LOW) */
  D.fixRes = () => {
    const r = D.M.engine.renderer;
    if (Math.abs(r.getPixelRatio() - D.dpr) > 0.01) {
      r.setPixelRatio(D.dpr);
      r.setSize(innerWidth, innerHeight);
    }
  };

  // ---------------------------------------------------------------------------------------------------- start
  const finishCache = {};
  /** start `stage` at track s (u), or at fraction s when frac; resets the game camera tweaks and the bot memory */
  D.start = (stage, s, frac) => {
    const m = U();
    let at = s;
    if (!frac) {
      if (stage === 'endless') at = s / 2000;
      else {
        if (!finishCache[stage]) {
          m.session.prepareStage(stage);
          finishCache[stage] = m.G.finishS;
        }
        at = s / finishCache[stage];
      }
    }
    Object.assign(D.M.camera.CAM, D.CAM0);
    D.camTune = null;
    window.__brainState = null;
    m.input.botSteer = null;
    // Endless seeds its chunks from Date.now(): pin it for the jump so every take replays the same run
    const dn = Date.now;
    if (stage === 'endless') Date.now = () => 1790000000000;
    try {
      m.dev.jump(stage, at);
    } finally {
      Date.now = dn;
    }
    m.dev.invincible(false);
    D.fixRes();
    return { s: m.P.s, finishS: m.G.finishS };
  };

  // ---------------------------------------------------------------------------------------------------- bot
  // The brain of shots/bot.mjs with lead = 0 (a frame-exact player). bot = { lane: x | fn(P) (hold this lateral
  // offset unless dodging), noSeek (ignore pickups), passive (no actions), act: { frame: action }, each(i) }.
  D.brain = (b) => {
    const M = U();
    const P = M.P;
    const B = (window.__brainState ||= { lastJump: -9, lastSlide: -9, lastAbility: -9 });
    const now = M.clock.sim;
    const out = { steer: 0, act: null };
    if (M.mode !== 'play') return out;
    const track = M.game.track;
    const v = Math.max(1, P.speed);
    const lane = typeof b.lane === 'function' ? b.lane(P, M) : b.lane;
    let steer = lane != null ? (lane - P.x) * 0.6 : -P.x * 0.25;
    let best = 1e9;
    let dodge = 0;
    let want = null;
    for (const c of M.colliders()) {
      if (!c.enabled) continue;
      const ds = c.s - P.s;
      if (!b.noSeek && c.kind === 'trigger' && ds > 2 && ds < 22 && ds < best && c.label !== 'puddle' && c.label !== 'rapid') {
        best = ds;
        steer = (c.x - P.x) * 0.6;
      }
      if (c.kind !== 'hurt') continue;
      const half = c.shape === 'sphere' ? c.r : c.hx;
      const lateral = Math.abs(c.x - P.x) - half - 0.4;
      const tall = c.shape === 'sphere' ? c.r > 1.3 || c.label === 'dog' : c.h > 3;
      if ((tall || c.label === 'rock') && ds > -3 && ds < 16 && lateral < 0.9) dodge += (P.x >= c.x ? 1 : -1) * (1.5 - Math.min(1.4, Math.max(0, lateral)));
      const near = 1.2;
      if (ds < near || ds > near + v * 0.18 || lateral > 0.15 || tall) continue;
      if (c.y > 0.5) {
        if (!P.sliding) want = 'slide';
      } else if (P.grounded && want !== 'slide') want = 'jump';
    }
    if (dodge !== 0) steer = Math.sign(dodge);
    const pr = M.hud.prompt;
    if (!want && (P.grounded || P.mode === 'ride') && now - B.lastJump > 0.45) {
      for (const c of M.colliders()) {
        if (!c.enabled || c.label !== 'bell') continue;
        const up = c.y - P.y;
        if (up < 1.4 || up > 3.4 || Math.abs(c.x - P.x) > 1.2) continue;
        const ds = c.s - P.s;
        const tt = up < 2.2 ? 0.17 : 0.27;
        if (ds > v * (tt - 0.05) && ds < v * (tt + 0.12)) want = 'jump';
      }
    }
    if (pr && pr.action === 'ability' && now - B.lastAbility > 0.3) want = 'ability';
    const ahead = track.kindAt(P.s + v * 0.2);
    if (!want && P.grounded && P.mode === 'run' && ahead === 'gap' && !(pr && pr.action === 'ability')) want = 'jump';
    if (!want && !P.grounded && P.mode === 'run' && track.kindAt(P.s) === 'gap' && P.vy < 0 && P.sincePounce > 5 && now - B.lastJump > 0.15) want = 'jump';
    if (!want && pr && pr.action === 'jump' && pr.text.includes('RAPIDS') && P.grounded) {
      for (const c of M.colliders()) if (c.label === 'rapid' && c.s - P.s > 1 && c.s - P.s < 1.5 + v * 0.15) want = 'jump';
    }
    if (want === 'jump' && now - B.lastJump < 0.22) want = null;
    if (want === 'slide' && now - B.lastSlide < 0.3) want = null;
    if (want === 'jump') B.lastJump = now;
    if (want === 'slide') B.lastSlide = now;
    if (want === 'ability') B.lastAbility = now;
    out.act = want;
    out.steer = Math.max(-1, Math.min(1, steer));
    return out;
  };
  D.botStep = () => {
    const b = D.bot;
    const m = U();
    if (!b || m.mode !== 'play') {
      if (m) m.input.botSteer = b && b.hold != null ? b.hold : m.input.botSteer;
      return;
    }
    const o = b.passive ? { steer: 0, act: null } : D.brain(b);
    let act = o.act;
    if (b.act && b.act[D.f]) act = b.act[D.f];
    if (b.noAct && act && b.noAct.includes(act)) act = null;
    m.input.botSteer = b.steer != null ? b.steer : o.steer;
    if (act) {
      m.press(act);
      D.finger.gesture = act;
      D.finger.g0 = D.f;
    }
    D.finger.steer = m.input.botSteer;
    if (b.each) b.each(D.f, m);
  };

  // ---------------------------------------------------------------------------------------------------- camera
  // cam = { kind: 'track' | 'fixed' | 'orbit', ... } in track space around Mochi; smoothed with `ease` (0 = snap).
  //   track: eye at track(P.s + ds) + right * dx + up * dy, looking at Mochi + up * ly + fwd * la
  //   fixed: eye pinned where `track` would put it on the first frame (or at {s, x, y}), looking at Mochi
  //   orbit: circles Mochi at radius r, height y, angle a0 + w * t (0 = behind her)
  const V = () => ({ x: 0, y: 0, z: 0 });
  const P0 = V();
  const L0 = V();
  let pinned = null;
  D.applyCam = (dt) => {
    D.fixRes();
    const tune = D.camTune;
    if (tune) Object.assign(D.M.camera.CAM, D.CAM0, tune);
    const c = D.cam;
    if (!c) {
      D.camState = null;
      pinned = null;
      return;
    }
    const m = U();
    const cam = m.camera;
    const P = m.P;
    const track = m.game.track;
    if (!track) return;
    const t = D.f / 60;
    const me = P.world.pos;
    const f = track.sample(P.s, D.fr);
    const tp = V();
    const tl = V();
    // dogSide: mirror dx / lookX to the dog's side of the path (the dog hops sides), smoothed so the swing reads
    let sx = 1;
    if (c.dogSide) {
      const d = m.colliders().find((k) => k.label === 'dog' && k.s > -900);
      const want = d && d.x < 0 ? -1 : 1;
      D.dogSx = D.dogSx == null || !D.camState ? want : D.dogSx + (want - D.dogSx) * Math.min(1, dt * 2.5);
      sx = D.dogSx;
    }
    tl.x = me.x + f.up.x * (c.ly ?? 0.8) + f.fwd.x * (c.la ?? 0);
    tl.y = me.y + f.up.y * (c.ly ?? 0.8) + f.fwd.y * (c.la ?? 0);
    tl.z = me.z + f.up.z * (c.ly ?? 0.8) + f.fwd.z * (c.la ?? 0);
    if (c.lookX) {
      tl.x += f.right.x * c.lookX * sx;
      tl.z += f.right.z * c.lookX * sx;
    }
    if (c.kind === 'track' || c.kind === 'fixed') {
      if (c.kind === 'fixed' && pinned) Object.assign(tp, pinned);
      else {
        const ds = (c.ds ?? -8) + (c.dolly ?? 0) * t;
        const g = track.sample(c.at?.s ?? P.s + ds, D.fr2);
        const dx = (c.at?.x ?? (c.dx ?? 0) * sx) + (c.follow ? P.x * c.follow : 0);
        const dy = (c.at?.y ?? c.dy ?? 3) + (c.rise ?? 0) * t + (c.yFollow ? P.y * c.yFollow : 0);
        const up = c.worldUp ? { x: 0, y: 1, z: 0 } : g.up;
        tp.x = g.pos.x + g.right.x * dx + up.x * dy;
        tp.y = g.pos.y + g.right.y * dx + up.y * dy;
        tp.z = g.pos.z + g.right.z * dx + up.z * dy;
        if (c.kind === 'fixed') pinned = { ...tp };
      }
    } else if (c.kind === 'orbit') {
      const a = (c.a0 ?? 0) + (c.w ?? 0.3) * t;
      const r = c.r ?? 8;
      // a = 0: behind her (against fwd); + swings to her right
      const bx = -Math.cos(a) * f.fwd.x + Math.sin(a) * f.right.x;
      const bz = -Math.cos(a) * f.fwd.z + Math.sin(a) * f.right.z;
      const l = Math.hypot(bx, bz) || 1;
      tp.x = me.x + (bx / l) * r;
      tp.z = me.z + (bz / l) * r;
      tp.y = me.y + (c.y ?? 2.5);
    }
    if (c.fn) c.fn(tp, tl, t, m);
    const k = !D.camState || !c.ease ? 1 : Math.min(1, dt * c.ease);
    if (!D.camState) D.camState = true;
    // smoothed relative to Mochi (she moves 25 u/s: smoothing world positions would leave her behind the frame),
    // except a pinned camera
    const rel = c.kind !== 'fixed';
    if (rel) for (const ax of ['x', 'y', 'z']) (tp[ax] -= me[ax]), (tl[ax] -= me[ax]);
    if (k >= 1) {
      Object.assign(P0, tp);
      Object.assign(L0, tl);
    } else {
      for (const ax of ['x', 'y', 'z']) {
        P0[ax] += (tp[ax] - P0[ax]) * k;
        L0[ax] += (tl[ax] - L0[ax]) * k;
      }
    }
    const ox = rel ? me.x : 0;
    const oy = rel ? me.y : 0;
    const oz = rel ? me.z : 0;
    cam.position.set(P0.x + ox, P0.y + oy, P0.z + oz);
    cam.up.set(0, 1, 0);
    if (c.roll) {
      // lean with the track (wall-runs): blend world up towards the banked surface normal
      cam.up.set(c.roll * f.up.x, 1 - c.roll + c.roll * f.up.y, c.roll * f.up.z).normalize();
    }
    cam.lookAt(L0.x + ox, L0.y + oy, L0.z + oz);
    const fov = (c.fov ?? 60) * (cam.aspect < 1 ? (c.portraitK ?? 1.38) : 1);
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
  };

  // ---------------------------------------------------------------------------------------------------- finger
  D.touchLook = () => {
    const el = D.fingerEl;
    if (!el) return;
    const F = D.finger;
    el.style.display = F.on ? 'block' : 'none';
    if (!F.on) return;
    const W = innerWidth;
    const H = innerHeight;
    const tip = el.children[0];
    const trail = el.children[1];
    const ring = el.children[2];
    const l = D.f - F.g0;
    let x = W / 2 + Math.max(-1, Math.min(1, F.steer || 0)) * W * 0.16;
    // above Mochi (she sits at ~0.75 H in the portrait game camera), below the prompts
    const Y0 = H * 0.6;
    let y = Y0;
    let tipO = 0.85;
    trail.style.height = '0px';
    ring.style.opacity = '0';
    const g = l < 16 ? F.gesture : '';
    if (g === 'jump' || g === 'slide') {
      const dir = g === 'jump' ? -1 : 1;
      const k = Math.min(1, l / 9);
      const e = 1 - Math.pow(1 - k, 3);
      const len = H * 0.13 * e;
      y = Y0 + dir * len;
      trail.style.left = x + 'px';
      trail.style.top = (dir < 0 ? y : Y0) + 'px';
      trail.style.height = len + 'px';
      trail.style.transform = dir < 0 ? 'rotate(180deg)' : '';
      trail.style.transformOrigin = 'center center';
      tipO = l > 11 ? 0.85 * (1 - (l - 11) / 5) : 0.95;
    } else if (g === 'ability') {
      const k = l / 16;
      ring.style.left = x + 'px';
      ring.style.top = y + 'px';
      ring.style.opacity = String(1 - k);
      ring.style.transform = `scale(${1 + k * 1.6})`;
      tip.style.transform = `scale(${l < 4 ? 0.82 : 1})`;
    } else tip.style.transform = '';
    tip.style.left = x + 'px';
    tip.style.top = y + 'px';
    tip.style.opacity = String(tipO);
  };

  /** Advance n frames: bot, one virtual 1/60 s step, finger overlay. */
  D.frame = (n = 1) => {
    for (let i = 0; i < n; i++) {
      D.botStep();
      window.__cap.step(1);
      D.touchLook();
      D.f++;
    }
    return D.f;
  };
})();
