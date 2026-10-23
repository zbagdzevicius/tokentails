// Capture-only director for the Ultra Cat trailer (added with context.addInitScript after clock-shim.js; never shipped
// with the game, nothing in src/ changes). After `await __dir.init()` it drives the running game through the same
// modules main.ts loaded (imported by their dev-server URLs, so they are the same instances):
//   __dir.bot      per-frame scripted player: walk to targets, swat, pounce, zoomies, ULTRA
//   __dir.cam      optional camera override, applied in a frame hook after the game camera, before render
//   __dir.log      game events with the take frame they happened on (the audio is built from them)
//   __dir.frame(n) advance n virtual frames (bot, then one 1/60 s clock step each)
(() => {
  if (window.__dir) return;
  const D = {
    f: 0, // frame of the current take
    log: [],
    bot: null,
    cam: null,
    camState: null,
    M: {},
    press: {}, // touch button -> frames left of the pressed look
  };
  window.__dir = D;
  const url = (s) => performance.getEntriesByType('resource').map((e) => e.name).find((n) => n.includes(s));
  const imp = (s) => import(/* @vite-ignore */ url(s) ?? s);

  D.init = async () => {
    const [events, loop, engine, world, state, input, rb, dog, fish, threats, hud, wanted] = await Promise.all([
      imp('/src/core/events.ts'),
      imp('/src/core/loop.ts'),
      imp('/src/core/engine.ts'),
      imp('/src/core/world.ts'),
      imp('/src/core/state.ts'),
      imp('/src/core/input.ts'),
      imp('/src/enemies/roomba-prime.ts'),
      imp('/src/enemies/mecha-dog.ts'),
      imp('/src/world/fish.ts'),
      imp('/src/enemies/threats.ts'),
      imp('/src/core/hud.ts'),
      imp('/src/world/wanted.ts'),
    ]);
    Object.assign(D.M, { events, loop, engine, world, state, input, rb, dog, fish, threats, hud, wanted });
    const names = ['swat', 'pounce', 'pounceLand', 'damage', 'ultraStart', 'ultraEnd', 'bossSpawn', 'bossPhase', 'bossDefeated', 'bossHp', 'enemyKilled', 'landmarkToppled', 'buildingWrecked', 'frenzy', 'bigHit', 'startled', 'zoomies', 'levelEnd', 'heliSwatted'];
    for (const n of names)
      events.events.on(n, (e) => {
        const o = { f: D.f, e: n };
        if (e) for (const k of ['amount', 'label', 'hit', 'money', 'ability', 'type', 'phase', 'name', 'strength', 'on', 'hp', 'maxHp', 'boss', 'count']) if (e[k] !== undefined) o[k] = e[k];
        D.log.push(o);
        const btn = { swat: 'tbSwat', pounce: 'tbPounce', ultraStart: 'tbUltra' }[n];
        if (btn) D.press[btn] = 9;
      });
    loop.addFrameHook((dt) => {
      if (D.hideFish) for (const fh of fish.fishTrucks) fh.g.visible = false;
      if (D.noWanted) {
        state.W.next = 999;
        if (state.W.bi >= 0) wanted.clearWanted();
      }
      // the WANTED announcement repeats every 20 s: not trailer copy
      const bn = document.getElementById('banner');
      if (bn) bn.style.setProperty('visibility', /WANTED/.test(bn.textContent) ? 'hidden' : '', 'important');
      if (!D.heliGroups?.length || D.f % 20 === 0)
        D.heliGroups = engine.scene.children.filter((g) => g.isGroup && g.children[0]?.material?.color?.getHex?.() === 0xd8342c && g.children[0].geometry?.type === 'SphereGeometry');
      D.applyCam(dt);
    });
    // helicopter groups (heli.ts keeps its pool private): red sphere body as the first child, refreshed above
    return true;
  };

  // ---------------------------------------------------------------------------------------------------- helpers
  const U = () => window.__ultra;
  D.cat = () => U().C;
  /** Put the cat at (x, z) facing `heading` and snap the game camera behind it. */
  D.place = (x, z, heading) => {
    const { C, game } = U();
    C.pos.set(x, 0, z);
    C.heading = heading;
    C.vel.set(0, 0, 0);
    C.speed = 0;
    game.camYaw = heading;
    game.intro = 1;
    if (game.rig) {
      game.rig.root.position.set(x, 0, z);
      game.rig.root.rotation.y = heading;
    }
  };
  /** Buildings sorted by standing height (tallest first) within [dMin, dMax] of (x, z). */
  D.towers = (x, z, dMin = 0, dMax = 1e9, n = 8) => {
    const city = U().city;
    const out = [];
    for (let i = 0; i < city.buildings.length; i++) {
      const b = city.buildings[i];
      const d = Math.hypot(b.x - x, b.z - z);
      if (d < dMin || d > dMax) continue;
      out.push({ i, x: b.x, z: b.z, hx: b.hx, hz: b.hz, h: city.standing(b), d });
    }
    return out.sort((a, b) => b.h - a.h).slice(0, n);
  };
  /** Stand `gap` units from building bi's face, on the side facing (fromX, fromZ), facing it. */
  D.faceBuilding = (bi, gap = 20, fromX = 0, fromZ = 0) => {
    const b = U().city.buildings[bi];
    const ax = fromX - b.x;
    const az = fromZ - b.z;
    let x = b.x;
    let z = b.z;
    if (Math.abs(ax) * b.hz > Math.abs(az) * b.hx) x = b.x + Math.sign(ax || 1) * (b.hx + gap);
    else z = b.z + Math.sign(az || 1) * (b.hz + gap);
    D.place(x, z, Math.atan2(b.x - x, b.z - z));
    return { x, z };
  };

  // ---------------------------------------------------------------------------------------------------- bot
  // bot = { target: 'tall' | 'boss' | {x, z} | null, swat: every n frames, pounce: every n frames, ultra: frame (or
  // true = as soon as full), zoom: bool, near: stop distance, walk: bool, spin: rad per frame of heading drift }
  const KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft'];
  D.botStep = () => {
    const b = D.bot;
    const u = U();
    if (!b || u.mode !== 'play') return;
    const { C, G, game, keys, city } = u;
    for (const k of KEYS) keys.delete(k);
    if (D.god !== false) G.patience = Math.max(G.patience, 55); // never TOO WET mid-take
    let tx = null;
    let tz = null;
    let tgt = typeof b.target === 'function' ? b.target() : b.target;
    if (tgt === 'heli' && !(D.heliGroups ?? []).some((g) => g.visible && g.position.y > 5)) tgt = b.fallback ?? null;
    if (tgt === 'tall') {
      let best = 1e9;
      for (let i = 0; i < city.buildings.length; i++) {
        const bd = city.buildings[i];
        const h = city.standing(bd);
        if (h <= (b.minH ?? 7)) continue;
        const s = Math.hypot(bd.x - C.pos.x, bd.z - C.pos.z) - h * (b.tallBias ?? 0.3);
        if (s < best) {
          best = s;
          tx = bd.x;
          tz = bd.z;
        }
      }
    } else if (tgt === 'boss') {
      const v = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } };
      if (D.M.rb.roombaTarget(v) || D.M.dog.dogTarget(v)) {
        tx = v.x;
        tz = v.z;
      }
    } else if (tgt === 'threat' || tgt === 'heli') {
      let best = 1e9;
      if (tgt === 'heli' || true)
        for (const g of D.heliGroups ?? []) {
          if (!g.visible) continue;
          const dd = Math.hypot(g.position.x - C.pos.x, g.position.z - C.pos.z);
          if (dd < best && g.position.y > 5) {
            best = dd;
            tx = g.position.x;
            tz = g.position.z;
          }
        }
      if (tgt === 'threat') {
        const v = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }, copy(o) { this.x = o.x; this.y = o.y; this.z = o.z; return this; } };
        const tmp = { ...v, set: v.set, copy: v.copy };
        if (D.M.threats.mainThreat(C.pos.x, C.pos.z, 600, v, tmp)) {
          const dd = Math.hypot(v.x - C.pos.x, v.z - C.pos.z);
          if (dd < best) {
            tx = v.x;
            tz = v.z;
          }
        }
      }
    } else if (tgt && typeof tgt === 'object') {
      tx = tgt.x;
      tz = tgt.z;
    }
    let d = 0;
    if (tx !== null) {
      d = Math.hypot(tx - C.pos.x, tz - C.pos.z);
      let rel = Math.atan2(tx - C.pos.x, tz - C.pos.z) - game.camYaw;
      rel = Math.atan2(Math.sin(rel), Math.cos(rel));
      const f = Math.cos(rel);
      const r = -Math.sin(rel);
      if (d > (b.near ?? 22) && b.walk !== false) {
        if (f > 0.38) keys.add('KeyW');
        else if (f < -0.38) keys.add('KeyS');
        if (r > 0.38) keys.add('KeyD');
        else if (r < -0.38) keys.add('KeyA');
      }
    } else if (b.walk) keys.add('KeyW');
    if (b.keys) for (const k of b.keys) keys.add(k);
    if (b.zoom) keys.add('ShiftLeft');
    D.press.tbZoom = keys.has('ShiftLeft') ? 2 : 0;
    D.moving = keys.has('KeyW') || keys.has('KeyA') || keys.has('KeyS') || keys.has('KeyD');
    const i = D.f;
    const inReach = tx === null || d < (b.reach ?? (tgt === 'boss' ? 80 : 70));
    if (b.swat && i % b.swat === 0 && inReach) u.doSwipe();
    if (b.pounce && i % b.pounce === (b.pounceOff ?? 0) && (b.pounceAny || inReach)) u.doPounce();
    if (b.ultra === true && G.ultra >= 100) u.doUltra();
    else if (typeof b.ultra === 'number' && i >= b.ultra && G.ultraT <= 0 && !b.ultraDone) {
      G.ultra = 100;
      u.doUltra();
      b.ultraDone = true;
    }
    if (b.each) b.each(i);
  };

  // ---------------------------------------------------------------------------------------------------- camera
  // cam = { kind: 'hero' | 'orbit' | 'fixed' | 'follow', ... }; positions are smoothed with `ease` (0 = snap).
  const P = { x: 0, y: 0, z: 0 };
  const L = { x: 0, y: 0, z: 0 };
  D.applyCam = (dt) => {
    const c = D.cam;
    if (!c) {
      D.camState = null;
      return;
    }
    const u = U();
    const cam = u.camera;
    const { C, G } = u;
    const t = D.f / 60;
    const tp = { x: 0, y: 0, z: 0 };
    const tl = { x: 0, y: 0, z: 0 };
    const h = c.heading ?? C.heading;
    const sx = Math.sin(h);
    const cz = Math.cos(h);
    if (c.kind === 'hero') {
      // beside and in front of the cat, low, looking at a point (default: ahead of the cat, mid height)
      const side = c.side ?? 1;
      const a = (c.back ?? -40) + (c.dolly ?? 0) * t;
      tp.x = C.pos.x + sx * a + cz * side * (c.out ?? 90);
      tp.z = C.pos.z + cz * a - sx * side * (c.out ?? 90);
      tp.y = (c.y ?? 14) + (c.rise ?? 0) * t;
      const la = c.look ?? { ahead: 30, y: 60 };
      tl.x = la.x ?? C.pos.x + sx * la.ahead;
      tl.z = la.z ?? C.pos.z + cz * la.ahead;
      tl.y = la.y;
    } else if (c.kind === 'orbit') {
      const cx = c.cx ?? C.pos.x;
      const czz = c.cz ?? C.pos.z;
      const ang = (c.a0 ?? h + Math.PI) + (c.w ?? 0.25) * t;
      tp.x = cx + Math.sin(ang) * (c.r ?? 160);
      tp.z = czz + Math.cos(ang) * (c.r ?? 160);
      tp.y = c.y ?? 90;
      tl.x = cx;
      tl.z = czz;
      tl.y = c.ly ?? 35;
    } else if (c.kind === 'fixed') {
      Object.assign(tp, c.pos);
      if (c.follow) {
        tl.x = C.pos.x + (c.lookOff?.x ?? 0);
        tl.y = 30 + C.y * 0.5 + (c.lookOff?.y ?? 0);
        tl.z = C.pos.z + (c.lookOff?.z ?? 0);
      } else Object.assign(tl, c.look);
    } else if (c.kind === 'follow') {
      // like the game camera, but a free distance/height/side angle
      const a = h + (c.yaw ?? 0.5);
      tp.x = C.pos.x - Math.sin(a) * (c.back ?? 150);
      tp.z = C.pos.z - Math.cos(a) * (c.back ?? 150);
      tp.y = (c.y ?? 110) + C.y * 0.5;
      tl.x = C.pos.x + sx * (c.ahead ?? 60);
      tl.z = C.pos.z + cz * (c.ahead ?? 60);
      tl.y = (c.ly ?? 30) + C.y * 0.5;
    } else if (c.kind === 'two') {
      // two-shot: the cat and the boss both in frame, the camera off the line between them, pulled back with the gap
      const v = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } };
      const has = D.M.rb.roombaTarget(v) || D.M.dog.dogTarget(v);
      const bx = has ? v.x : C.pos.x + sx * 60;
      const bz = has ? v.z : C.pos.z + cz * 60;
      const mx = (C.pos.x + bx) / 2;
      const mz = (C.pos.z + bz) / 2;
      const sep = Math.hypot(bx - C.pos.x, bz - C.pos.z);
      const ang = Math.atan2(bx - C.pos.x, bz - C.pos.z) + (c.yaw ?? 1.2);
      const r = (c.r ?? 90) + sep * (c.k ?? 0.7);
      tp.x = mx - Math.sin(ang) * r;
      tp.z = mz - Math.cos(ang) * r;
      tp.y = (c.y ?? 60) + sep * (c.ky ?? 0.25);
      tl.x = mx;
      tl.z = mz;
      tl.y = c.ly ?? 25;
    }
    if (c.fn) c.fn(tp, tl, t);
    const k = !D.camState || !c.ease ? 1 : Math.min(1, dt * c.ease);
    if (!D.camState) D.camState = true;
    if (k >= 1) {
      Object.assign(P, tp);
      Object.assign(L, tl);
    } else {
      for (const ax of ['x', 'y', 'z']) {
        P[ax] += (tp[ax] - P[ax]) * k;
        L[ax] += (tl[ax] - L[ax]) * k;
      }
    }
    const tr = G.trauma * G.trauma * (c.shake ?? 1) * 5;
    cam.position.set(P.x + (Math.random() - 0.5) * tr, P.y + (Math.random() - 0.5) * tr, P.z + (Math.random() - 0.5) * tr);
    cam.lookAt(L.x, L.y, L.z);
    if (c.fov) {
      cam.fov = c.fov;
      cam.updateProjectionMatrix();
    }
  };

  // ---------------------------------------------------------------------------------------------------- touch look
  D.touchLook = () => {
    for (const id of ['tbSwat', 'tbPounce', 'tbUltra', 'tbZoom']) {
      const el = document.getElementById(id);
      if (!el) continue;
      const on = (D.press[id] ?? 0) > 0;
      el.style.transform = on ? 'scale(0.86)' : '';
      el.style.filter = on ? 'brightness(1.35)' : '';
      if (D.press[id] > 0 && id !== 'tbZoom') D.press[id]--;
    }
    const knob = document.getElementById('knob');
    const stick = document.getElementById('stick');
    if (knob && stick && document.body.classList.contains('touch')) {
      const u = U();
      if (D.moving && u.mode === 'play') {
        const r = stick.getBoundingClientRect();
        const ox = r.left + r.width * 0.42;
        const oy = r.height * 0.55;
        knob.style.display = 'block';
        knob.style.left = ox + 'px';
        knob.style.top = oy + 'px';
        let x = 0;
        let y = 0;
        const k = u.keys;
        if (k.has('KeyW')) y -= 1;
        if (k.has('KeyS')) y += 1;
        if (k.has('KeyA')) x -= 1;
        if (k.has('KeyD')) x += 1;
        const l = Math.hypot(x, y) || 1;
        knob.firstElementChild.style.transform = `translate(${(x / l) * 35}px, ${(y / l) * 35}px)`;
      } else knob.style.display = 'none';
    }
  };

  /** Advance n frames: bot, one virtual 1/60 s step, touch look. */
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
