// Lifted from Pink Paw Knight (swordcat) at commit 7714dcb: src/core/Input.js
// Licence: all rights reserved, pending founder decision (POC.md §17, GDD §12 decision #3). Not MIT.
// Changes: relative imports rewritten by tools/lift-ppk.mjs; any later hand edit is marked "pawlegends:".
// src/core/Input.js  (owner: core) — keyboard/mouse/gamepad + touch hooks → actions.
// tech.md §7 + GAME_DESIGN §15 + research/CONTROLS_SPEC.md §6 (iso: no pointer lock, pointer model, click / tap
// queue, zoom, pad aim stick, touch drag-aim, KBM presets + rebinding, haptics; `?cam=classic` keeps the M1/M2
// orbit table: RMB guard, Space jump, R3 recenter, pointer lock).
//
// TOKENTAILS-PLAN §11.2 (TT3): a keydown that carries Ctrl or Meta never sets an action (Ctrl+W, Ctrl+D, Meta+W stay
// the browser's); `sprint` is derived (the `dodge` input held INPUT.sprintAfter s); `golden` is also the chord
// `guard` + `attack` within INPUT.goldenChord s; on a pad, RT (`trick`) held + D-pad ← → ↑ presses `trick1..3`
// instead of the D-pad's own action; Shift+Tab presses `lockPrev`; a right-click over the HUD still reaches the
// actions bound to RMB (the Stand).
//
// Edge semantics (tech.md §6): `pressed`/`released` are latched from DOM events until the FIRST fixed step
// consumes them (Game calls endStep() after each non-hitstop step), so edges are never lost or doubled.
// `heldTime(a)` counts fixed-step (sim) seconds while held; on the step a button is released it still
// returns the final hold duration (for charge release), then resets.
//
// The constructor touches no DOM (node-safe); `attach(canvas)` adds the listeners.
import { INPUT, AIM, HAPTICS, CAMERA } from '../render/ppk/core/config.js';
import { E } from '../render/ppk/core/events.js';

/** @typedef {{ sources: Set<string>, down: boolean, pressed: boolean, released: boolean, held: number }} ActionState */

const EDITABLE = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

export class Input {
  constructor(ctx = null) {
    this.ctx = ctx;
    /** @type {Map<string, ActionState>} */
    this.actions = new Map();
    for (const a of INPUT.actions) this.actions.set(a, { sources: new Set(), down: false, pressed: false, released: false, held: 0 });
    /** Movement intent, y+ = forward (camera-relative mapping is the player's job). Length ≤ 1. */
    this.move = { x: 0, y: 0 };
    /** Look deltas (radians, sensitivity applied) accumulated since the last consumeLook(). */
    this.look = { x: 0, y: 0 };
    /** Raw mouse pixel deltas since the last consumeLook() (camera flick detection). */
    this.lookPx = { x: 0, y: 0 };
    this._consumed = { x: 0, y: 0, px: 0, py: 0 };
    this.keys = new Set();
    this.keyMove = { x: 0, y: 0 }; this.padMove = { x: 0, y: 0 }; this.virtualMove = { x: 0, y: 0 };
    this.padLook = { x: 0, y: 0 };
    /** 'kbm' | 'pad' | 'touch' — last used device (E.INPUT_DEVICE on change). */
    this.device = 'kbm';
    /**
     * CONTROLS_SPEC §6.1: the iso controls (default) never capture the mouse; `?cam=classic` keeps the M1/M2 orbit
     * camera, its binding table and pointer lock.
     */
    this.iso = ctx?.params?.cam !== 'classic';
    this.pointerLocked = false;
    this.pointerLockEnabled = !this.iso;     // Game turns this off in ?test
    /** Re-capture the mouse when the pause menu closes (set once the lock was ever held). */
    this.relockOnResume = false;
    this._lockLost = false;
    this.padConnected = false;
    /** TT6: 'xbox' | 'ps' (from Gamepad.id; ui draws PlayStation shapes for 'ps') */
    this.padKind = 'xbox'; this._padId = null;
    /** Seconds (sim) since any input activity / any look input (Meme Cam idle, camera auto-follow). */
    this.idleTime = 0; this.lookIdleTime = 0;
    this._activity = false; this._lookActivity = false;
    /**
     * PERF §11 A5 (C14): precomputed pad bindings ({action, idx, src}) and numeric prev state per binding. Pads are
     * read every frame only while one is live (after `gamepadconnected` or a probe found one); otherwise
     * `navigator.getGamepads()` (a sync IPC) runs every PAD_PROBE_FRAMES-th frame as a probe.
     */
    this._padBind = [];
    this._padPrev = new Uint8Array(0);
    this._padLive = false; this._padProbe = 0;
    this._wheelCooldown = 0;
    /** TT3: wall-clock ms of the last `guard` / `attack` press edges (the golden chord) */
    this._chordT = { guard: -Infinity, attack: -Infinity };
    /** TT3: pad D-pad buttons currently redirected to `trick1..3` (RT held when they went down) */
    this._padPick = new Uint8Array(20);
    /** TT3: actions used as a modifier during their current hold (RT + D-pad picked a trick): `usedAsModifier(a)` */
    this._modUsed = new Set();
    /** sim seconds advanced by update(dt) (the chord window counts game time, like Player's own combo window) */
    this._simT = 0;
    /** the chord clock in ms (sim time; injectable for unit tests) */
    this.now = () => this._simT * 1000;
    this._listeners = [];
    this.canvas = null;

    // ---- CONTROLS_SPEC §6.1 pointer model (CSS px; ndc relative to the canvas)
    /** @type {{x:number, y:number, ndcX:number, ndcY:number, inside:boolean, movedPx:number, speed:number, lastMoveT:number}} */
    this.pointer = { x: 0, y: 0, ndcX: 0, ndcY: 0, inside: false, movedPx: 0, speed: 0, lastMoveT: -Infinity };
    /** Recent pointer samples {t, x, y} (ms, CSS px) for the windowed speed (§6.1). */
    this._ptrHist = [];
    /** The canvas rect, cached (a layout read per mousemove is a forced reflow); null = re-read on next use. */
    this._rect = null;
    /** Pointer position when the Meme Cam started: only a move of ≥ CAMERA.iso.meme.exitPx from it is activity (§2.7). */
    this._memeMark = null;
    /** clicks / taps queued for the next consumer: { button, x, y, down, t, mods: {ctrl, shift, alt}, kind? } */
    this._clicks = [];
    this._zoom = 0;
    /** pad right stick (§6.3 aim; dead zone AIM.padDead), y+ = up on the stick */
    this.aimStick = { x: 0, y: 0 };
    /** touch drag-aim (§9.4): screen-space vector, y+ = up, `active` while a button is being dragged */
    this.virtualAim = { x: 0, y: 0, active: false };
    /** mouse buttons whose press was queued as a click (their release is queued too, wherever it lands) */
    this._clickDown = new Set();
    this._touchT = -Infinity;
    /** active KBM preset (§6.2) and its flags */
    this.preset = 'hybrid';
    this.wasd = true; this.lmbMoves = false;

    // code → actions lookup
    /** @type {Map<string, string[]>} */
    this._bind = new Map();
    this._moveCodes = new Set();
    this._quietRebind = true;
    this.rebind();
    this._quietRebind = false;
  }

  /**
   * (Re)build the code → actions table: `INPUT.keys`, then the active preset's keys (or the classic table with
   * `?cam=classic`), then `settings.bindings` ({action: [codes]}) on top. Emits E.INPUT_SCHEME when the preset changed.
   * @param {string} [preset] defaults to settings.controlPreset
   */
  rebind(preset) {
    const st = this.ctx?.state?.settings;
    const name = preset ?? st?.controlPreset ?? 'hybrid';
    const P = INPUT.presets?.[name] ?? INPUT.presets?.hybrid ?? { keys: {} };
    const table = { ...INPUT.keys, ...(this.iso ? P.keys : INPUT.classicKeys) };
    const over = st?.bindings;
    // TT3: a stored binding never holds a modifier, an F-key or Esc (INPUT.unbindable), whatever the save says
    const bad = INPUT.unbindable;
    if (over && typeof over === 'object') {
      for (const [a, codes] of Object.entries(over)) if (Array.isArray(codes) && table[a]) table[a] = codes.filter((c) => typeof c === 'string' && !bad?.test(c));
      // Esc always pauses and goes back (the rebinding screen never moves it)
      for (const a of ['pause', 'back']) if (table[a] && !table[a].includes('Escape') && (INPUT.keys[a] ?? []).includes('Escape')) table[a] = [...table[a], 'Escape'];
    }
    this.keyTable = table;
    this._bind.clear();
    for (const [action, codes] of Object.entries(table)) for (const c of codes ?? []) {
      if (!this._bind.has(c)) this._bind.set(c, []);
      this._bind.get(c).push(action);
    }
    this.wasd = !this.iso || P.wasd !== false;
    this.lmbMoves = this.iso && !!P.lmbMoves;
    this._moveCodes = new Set(this.wasd ? Object.values(INPUT.move).flat() : []);
    this.padTable = this.iso ? INPUT.pad : { ...INPUT.pad, ...INPUT.classicPad };
    this._buildPadBindings();
    const next = this.iso ? (INPUT.presets?.[name] ? name : 'hybrid') : 'classic';
    const changed = next !== this.preset;
    this.preset = next;
    if (changed && !this._quietRebind) this.ctx?.bus?.emit?.(E.INPUT_SCHEME, { preset: this.preset });
    return this.preset;
  }

  /** The codes bound to `action` right now (preset + rebinding aware; ui glyphs). */
  codesFor(action) { return this.keyTable?.[action] ?? []; }

  // ------------------------------------------------------------------ system contract
  async init() {
    const bus = this.ctx?.bus;
    if (bus?.on) {
      this._offScheme = bus.on(E.SETTINGS_CHANGED, (p) => { if (p?.key === 'controlPreset' || p?.key === 'bindings' || p?.key == null) this.rebind(); });
      this._offHaptics = this._wireHaptics(bus);
    }
    this.rebind();
  }

  /**
   * §10.6: the gameplay moments that buzz a phone. The pad already rumbles from combat / player (JUICE), so these
   * only vibrate on touch; `haptic(kind)` called directly still routes to the pad rumble.
   * @returns {() => void} unsubscribe
   */
  _wireHaptics(bus) {
    const offs = [];
    const on = (ev, fn) => { if (ev) { const off = bus.on(ev, fn); if (typeof off === 'function') offs.push(off); } };
    const buzz = (kind) => { if (this.device === 'touch') this.haptic(kind); };
    const isPlayer = (a) => !!a && a === this.ctx?.player;
    on(E.PLAYER_PARRY, () => buzz('parry'));
    on(E.PLAYER_PERFECT_DODGE, () => buzz('perfectDodge'));
    on(E.PLAYER_DAMAGED, (p) => { if (!(p?.amount > 0)) return; buzz('hurt'); });
    on(E.PLAYER_HOLY, () => buzz('holy'));
    on(E.PLAYER_GOLDEN, (p) => { if (p?.on) buzz('golden'); });
    on(E.KITTEN_RESCUED, () => buzz('kitten'));
    on(E.PLAYER_ORDER, (p) => { if (p && p.valid === false) buzz('orderRejected'); });
    let broken = false;
    on(E.PLAYER_GRIT, (p) => { const b = !!p?.broken; if (b && !broken) buzz('guardBreak'); broken = b; });
    on(E.HIT, (p) => {
      if (!p || p.parried) return;
      if (isPlayer(p.target) && p.blocked) buzz('block');
      else if (isPlayer(p.attacker) && (p.killed || p.crit)) buzz('hitHeavy');
    });
    return () => { for (const off of offs) off(); };
  }
  /** Fixed step: advance hold timers + idle timers. */
  update(dt) {
    this._resolveLockLoss();
    for (const s of this.actions.values()) if (s.down) s.held += dt;
    this._simT += dt;
    // TT3 §11.2: `sprint` = the dodge input still held INPUT.sprintAfter s after it went down (Zoomies speed at once)
    const d = this.actions.get('dodge'), sp = this.actions.get('sprint');
    if (d && sp) {
      if (d.down && d.held >= (INPUT.sprintAfter ?? 0.18) && !sp.sources.has('dodge')) this._press('sprint', 'dodge');
      else if (!d.down && sp.sources.has('dodge')) this._release('sprint', 'dodge');
    }
    if (this._activity) { this.idleTime = 0; this._activity = false; } else this.idleTime += dt;
    if (this._memeMark && this.ctx?.game?.mode !== 'memecam') this._memeMark = null;   // the next Meme Cam re-marks
    if (this._lookActivity) { this.lookIdleTime = 0; this._lookActivity = false; } else this.lookIdleTime += dt;
  }
  render() {}
  dispose() { this.detach(); this._offScheme?.(); this._offHaptics?.(); }

  // ------------------------------------------------------------------ queries
  down(a) { return this.actions.get(a)?.down ?? false; }
  pressed(a) { return this.actions.get(a)?.pressed ?? false; }
  released(a) { return this.actions.get(a)?.released ?? false; }
  /** Seconds held (sim time). On the release step: the final duration. 0 otherwise. */
  heldTime(a) { return this.actions.get(a)?.held ?? 0; }
  /**
   * TT3: true when `a` (the pad's RT / `trick`) was used as a modifier during its current or just-released hold (RT +
   * D-pad picked a Paw Trick), so its release is not a tap-cast. Cleared on its next press.
   */
  usedAsModifier(a) { return this._modUsed.has(a); }
  /** True if any action edge or movement happened this step. */
  anyActivity() {
    if (Math.abs(this.move.x) + Math.abs(this.move.y) > 0.1) return true;
    for (const s of this.actions.values()) if (s.pressed || s.down) return true;
    return false;
  }

  /**
   * Returns look deltas since the previous call ({x, y} radians, {px, py} raw mouse px) and resets them.
   * CONTROLS_SPEC C2: zeros in iso (the fixed-yaw camera is never steered), unless the mouse is captured
   * (Photo Mode); `?cam=classic` keeps the orbit look.
   */
  consumeLook() {
    const o = this._consumed;
    const live = !this.iso || this.pointerLocked;
    o.x = live ? this.look.x : 0; o.y = live ? this.look.y : 0; o.px = live ? this.lookPx.x : 0; o.py = live ? this.lookPx.y : 0;
    this.look.x = this.look.y = this.lookPx.x = this.lookPx.y = 0;
    return o;
  }

  /** Clears pressed/released edges; resets hold time of released actions. Called by Game after a step. */
  endStep() {
    for (const s of this.actions.values()) {
      s.pressed = false; s.released = false;
      if (!s.down) s.held = 0;
    }
  }

  // ------------------------------------------------------------------ sources
  _press(action, src) {
    const s = this.actions.get(action); if (!s) return;
    const was = s.sources.size > 0;
    s.sources.add(src);
    if (!was) {
      s.down = true; s.pressed = true; s.held = 0;
      if (this._modUsed.size) this._modUsed.delete(action);
      if (action === 'guard' || action === 'attack') this._chord(action);
    }
    this._activity = true;
  }

  _release(action, src) {
    const s = this.actions.get(action); if (!s) return;
    if (!s.sources.delete(src)) return;
    if (s.sources.size === 0) {
      s.down = false; s.released = true;
      if (action === 'guard' || action === 'attack') this._release('golden', 'chord');
    }
  }

  /**
   * TT3 §11.2: a `guard` or `attack` press edge within INPUT.goldenChord s of the other one presses `golden` (source
   * 'chord'; released with either). Works for every device: RMB / Q + LMB, LB / RB + X, 🛡 + ⚔.
   */
  _chord(action) {
    const t = this.now(), other = action === 'guard' ? 'attack' : 'guard';
    this._chordT[action] = t;
    const win = (INPUT.goldenChord ?? 0.1) * 1000;
    if (this.actions.get(other)?.down && t - this._chordT[other] <= win + 1e-6) {
      this._chordT.guard = this._chordT.attack = -Infinity;
      this._press('golden', 'chord');
    }
  }

  /** A one-step edge with no hold (wheel ticks). */
  pulse(action) {
    const s = this.actions.get(action); if (!s) return;
    s.pressed = true; s.released = true; this._activity = true;
  }

  /** Release everything (window blur, mode switches). */
  releaseAll() {
    for (const s of this.actions.values()) {
      if (s.sources.size) { s.sources.clear(); s.down = false; s.released = true; }
    }
    this.keys.clear(); this.keyMove.x = this.keyMove.y = 0;
    // a held mouse order button (hold-to-follow) ends on blur too: queue its release
    for (const button of this._clickDown) this._queueClick({ button, x: this.pointer.x, y: this.pointer.y, down: false, t: nowMs(), mods: NO_MODS });
    this._clickDown.clear();
    this.virtualMove.x = this.virtualMove.y = 0;
    this.virtualAim.active = false; this.virtualAim.x = this.virtualAim.y = 0;
    this._composeMove();
  }

  setDevice(d) {
    if (this.device === d) return;
    this.device = d;
    this.ctx?.bus?.emit(E.INPUT_DEVICE, { device: d });
  }

  get sensitivity() { return this.ctx?.state?.settings?.sensitivity ?? 1; }

  // ------------------------------------------------------------------ touch hooks (ui/touch.js)
  /** Hold / release an action from an on-screen button. */
  setVirtual(action, on) {
    if (on) this._press(action, 'v'); else this._release(action, 'v');
    this.setDevice('touch');
  }
  /** Virtual joystick, x/y in [-1, 1], y+ = forward. */
  setVirtualMove(x, y) {
    this.virtualMove.x = x; this.virtualMove.y = y;
    if (x || y) this._activity = true;
    this.setDevice('touch'); this._composeMove();
  }
  /**
   * §9.4 touch drag-aim: the drag vector in screen space (CSS px or normalised; y+ = up) while a cluster button is
   * dragged. `active` false clears it.
   */
  setVirtualAim(x, y, active = true) {
    const a = this.virtualAim;
    a.active = !!active; a.x = active ? +x || 0 : 0; a.y = active ? +y || 0 : 0;
    if (active) { this._activity = true; this.setDevice('touch'); }
  }

  /**
   * §6.1 ui touch: a tap / long-press on the free area at CSS px (x, y). `kind`: 'tap' | 'long' | 'longEnd' | 'move'
   * (a long-press drag). Queued with the mouse clicks (`takeClick`, button 'tap').
   */
  addTap(x, y, kind = 'tap') {
    this._queueClick({ button: 'tap', kind, x, y, down: kind !== 'longEnd', t: nowMs(), mods: NO_MODS });
    this._activity = true;
    this.setDevice('touch');
  }

  /** The next queued click / tap edge (FIFO, max INPUT.pointer.clickQueue) or null. */
  takeClick() { return this._clicks.length ? this._clicks.shift() : null; }
  /** Look at the next click without taking it. */
  peekClick() { return this._clicks[0] ?? null; }
  /** Drop every queued click (mode changes, level loads). */
  clearClicks() { this._clicks.length = 0; }
  _queueClick(c) {
    const q = this._clicks, max = INPUT.pointer?.clickQueue ?? 8;
    q.push(c);
    while (q.length > max) q.shift();
  }

  /** §2.3 zoom steps: + = zoom in (closer), − = out. Wheel ticks, pinch (ui) and R3 add here; the camera consumes. */
  addZoom(k) { if (Number.isFinite(k) && k) { this._zoom += k; this._activity = true; } }
  consumeZoom() { const z = this._zoom; this._zoom = 0; return z; }

  /**
   * §10.6 haptics: `navigator.vibrate` on touch, the pad rumble on pad, scaled by settings.haptics (default 1 on touch).
   * Never in menus. Silently ignored where unsupported.
   * @param {string} kind a HAPTICS key
   */
  haptic(kind) {
    const pat = HAPTICS[kind];
    if (pat == null) return false;
    const st = this.ctx?.state?.settings, scale = st?.haptics ?? 1;
    if (!(scale > 0) || this.ctx?.game?.mode === 'menu') return false;
    if (kind === 'button' && !st?.hapticTaps) return false;
    if (this.device === 'pad') {
      const ms = Array.isArray(pat) ? pat.reduce((a, b) => a + b, 0) : pat;
      this.rumble(0.35 * scale, 0.5 * scale, ms);
      return true;
    }
    if (this.device !== 'touch') return false;
    const nav = typeof navigator !== 'undefined' ? navigator : null;
    if (!nav?.vibrate) return false;
    const p = Array.isArray(pat) ? pat.map((v, i) => (i % 2 ? v : Math.round(v * scale))) : Math.round(pat * scale);
    try { return nav.vibrate(p); } catch { return false; }
  }

  /** Add look in radians (touch drag already scaled by INPUT.touchLookSens). */
  addLook(dx, dy) {
    const k = this.sensitivity;
    this.look.x += dx * k; this.look.y += dy * k;
    if (dx || dy) { this._activity = true; this._lookActivity = true; }
  }

  // ------------------------------------------------------------------ per-frame poll (gamepads)
  /** Flatten `padTable` into `_padBind` (one entry per action × button) with a numeric prev-state slot each. */
  _buildPadBindings() {
    const prev = new Map();
    for (let k = 0; k < this._padBind.length; k++) prev.set(this._padBind[k].src + this._padBind[k].action, this._padPrev[k]);
    const out = [];
    for (const action of Object.keys(this.padTable ?? INPUT.pad)) {
      for (const idx of this.padTable[action] ?? []) out.push({ action, idx, src: PAD_SRC[idx] ?? ('p' + idx) });
    }
    this._padBind = out;
    this._padPrev = new Uint8Array(out.length);
    for (let k = 0; k < out.length; k++) this._padPrev[k] = prev.get(out[k].src + out[k].action) ?? 0;
  }

  /** Called once per rendered frame before the fixed steps. */
  poll(frameDt) {
    if (this._wheelCooldown > 0) this._wheelCooldown -= frameDt;
    const nav = typeof navigator !== 'undefined' ? navigator : null;
    // pads: every frame while one is live, else a probe every PAD_PROBE_FRAMES frames (stub pads, missed events)
    const probe = !this._padLive && (++this._padProbe >= PAD_PROBE_FRAMES);
    if (probe) this._padProbe = 0;
    const pads = (this._padLive || probe) && nav?.getGamepads ? nav.getGamepads() : null;
    if (!pads && !this._padLive && !this.padConnected) { this._padIdle(); return; }
    let any = false;
    const merged = this._mergedButtons || (this._mergedButtons = new Array(20).fill(false));
    merged.fill(false);
    let lx = 0, ly = 0, rx = 0, ry = 0;
    if (pads) {
      for (const p of pads) {
        if (!p || !p.connected) continue;
        any = true;
        // TT6 input glyphs: PlayStation pads get their own button shapes (cross, circle, square, triangle, L1 / R1)
        if (p.id !== this._padId) { this._padId = p.id; this.padKind = /playstation|dualshock|dualsense|sony|054c/i.test(String(p.id ?? '')) ? 'ps' : 'xbox'; }
        for (let i = 0; i < p.buttons.length && i < merged.length; i++) {
          const b = p.buttons[i];
          if (b.pressed || b.value > INPUT.triggerThreshold) merged[i] = true;
        }
        const ax = p.axes;
        if (Math.abs(ax[0] ?? 0) > Math.abs(lx)) lx = ax[0] ?? 0;
        if (Math.abs(ax[1] ?? 0) > Math.abs(ly)) ly = ax[1] ?? 0;
        if (Math.abs(ax[2] ?? 0) > Math.abs(rx)) rx = ax[2] ?? 0;
        if (Math.abs(ax[3] ?? 0) > Math.abs(ry)) ry = ax[3] ?? 0;
      }
    }
    if (pads) { this.padConnected = any; this._padLive = any; }
    let padUsed = false;
    padUsed = this._padTrickPick(merged) || padUsed;
    const B = this._padBind, P = this._padPrev, pick = this._padPick;
    for (let k = 0; k < B.length; k++) {
      const b = B[k], now = merged[b.idx] && !pick[b.idx] ? 1 : 0, prev = P[k];
      if (now && !prev) { this._press(b.action, b.src); padUsed = true; }
      else if (!now && prev) this._release(b.action, b.src);
      P[k] = now;
    }
    const ls = deadZone(lx, ly, INPUT.deadZone, _dz), mx = ls.x, my = ls.y;
    this.padMove.x = mx; this.padMove.y = -my;
    if (this.iso) {
      // §6.3: the right stick aims (a ground reticle); it never turns the fixed-yaw camera
      const as = deadZone(rx, ry, AIM.padDead ?? 0.25, _dz);
      this.aimStick.x = as.x; this.aimStick.y = -as.y;
      if (as.x || as.y) { this._activity = true; padUsed = true; }
      if (mx || my) { this._activity = true; padUsed = true; }
      if (padUsed) this.setDevice('pad');
      this._composeMove();
      return;
    }
    const rs = deadZone(rx, ry, INPUT.deadZone, _dz), lkx = rs.x, lky = rs.y;
    if (lkx || lky) {
      const k = INPUT.padLookSpeed * this.sensitivity * frameDt;
      this.look.x += lkx * k; this.look.y += lky * k;
      this._activity = true; this._lookActivity = true; padUsed = true;
    }
    if (mx || my) { this._activity = true; padUsed = true; }
    if (padUsed) this.setDevice('pad');
    this._composeMove();
  }

  /**
   * TT3 §11.2: while RT (`padTable.trick`) is held, a D-pad press listed in INPUT.padTrickPick presses `trick1..3`
   * (source 'pk<idx>') instead of the D-pad's own action until that button is released. Returns true if one fired.
   */
  _padTrickPick(merged) {
    const map = INPUT.padTrickPick, pick = this._padPick;
    if (!map || !this.iso) return false;
    let rt = false;
    for (const i of this.padTable?.trick ?? []) if (merged[i]) rt = true;
    let used = false;
    for (const key in map) {
      const idx = +key, on = !!merged[idx];
      if (on && !pick[idx] && rt && !this._padRawPrev?.[idx]) {
        pick[idx] = 1; this._press(map[key], PICK_SRC[idx]); this._modUsed.add('trick'); used = true;
      } else if (!on && pick[idx]) { pick[idx] = 0; this._release(map[key], PICK_SRC[idx]); }
    }
    (this._padRawPrev ??= new Uint8Array(20));
    for (const key in map) this._padRawPrev[+key] = merged[+key] ? 1 : 0;
    return used;
  }

  /** No pad and no probe this frame: keep the pad contributions at zero and compose the keyboard / touch move. */
  _padIdle() {
    if (this.padMove.x || this.padMove.y) { this.padMove.x = 0; this.padMove.y = 0; }
    if (this.iso && (this.aimStick.x || this.aimStick.y)) { this.aimStick.x = 0; this.aimStick.y = 0; }
    this._composeMove();
  }

  _composeMove() {
    let x = this.keyMove.x + this.padMove.x + this.virtualMove.x;
    let y = this.keyMove.y + this.padMove.y + this.virtualMove.y;
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    this.move.x = x; this.move.y = y;
  }

  _updateKeyMove() {
    const k = this.keys, M = INPUT.move;
    const has = (arr) => arr.some((c) => k.has(c));
    let x = (has(M.right) ? 1 : 0) - (has(M.left) ? 1 : 0);
    let y = (has(M.up) ? 1 : 0) - (has(M.down) ? 1 : 0);
    if (x && y) { x *= Math.SQRT1_2; y *= Math.SQRT1_2; }
    this.keyMove.x = x; this.keyMove.y = y;
    this._composeMove();
  }

  // ------------------------------------------------------------------ DOM
  /** Add DOM listeners. `canvas` receives mouse buttons, pointer lock and wheel. */
  attach(canvas) {
    this.canvas = canvas;
    this._rect = null;
    const on = (t, type, fn, opts) => { t.addEventListener(type, fn, opts); this._listeners.push(() => t.removeEventListener(type, fn, opts)); };
    const stale = () => { this._rect = null; };
    on(window, 'resize', stale);
    on(window, 'scroll', stale, { capture: true, passive: true });
    on(window, 'orientationchange', stale);
    if (typeof ResizeObserver !== 'undefined' && canvas) {
      const ro = new ResizeObserver(stale); ro.observe(canvas); this._listeners.push(() => ro.disconnect());
    }

    on(window, 'keydown', (e) => this._keyDown(e));
    on(window, 'keyup', (e) => this._keyUp(e));
    on(window, 'blur', () => this.releaseAll());
    on(document, 'visibilitychange', () => { if (document.hidden) this.releaseAll(); });

    on(canvas, 'mousedown', (e) => {
      if (this._touchT > nowMs() - 800) return;   // the compatibility mouse event of a touch: ui's touch layer owns it
      this.setDevice('kbm');
      const mode = this.ctx?.game?.mode ?? 'play';
      if (this.pointerLockEnabled && !this.pointerLocked && e.button === 0 && (mode === 'play' || mode === 'memecam')) {
        this.requestPointerLock();
        return;                                   // the click that captures the mouse does not attack
      }
      this._pointerAt(e.clientX, e.clientY, false);
      if (this.iso) { this._queueClick({ button: e.button, x: e.clientX, y: e.clientY, down: true, t: nowMs(), mods: { ctrl: e.ctrlKey, shift: e.shiftKey, alt: e.altKey } }); this._clickDown.add(e.button); }
      const code = 'Mouse' + e.button;
      for (const a of this._bind.get(code) ?? []) this._press(a, 'm:' + code);
      if (e.button === 1 || e.button === 3 || e.button === 4) e.preventDefault();      // no autoscroll / history navigation
      this._activity = true;
    });
    on(window, 'mouseup', (e) => {
      const code = 'Mouse' + e.button;
      // the release of a queued press is queued wherever it lands (over the HUD too), so hold-to-follow always ends
      if (this.iso && this._clickDown.delete(e.button)) this._queueClick({ button: e.button, x: e.clientX, y: e.clientY, down: false, t: nowMs(), mods: { ctrl: e.ctrlKey, shift: e.shiftKey, alt: e.altKey } });
      for (const a of this._bind.get(code) ?? []) this._release(a, 'm:' + code);
      // TT4: Chrome and Firefox go Back / Forward on the side buttons' release, so their mouseup is held too (Mouse3 Tumbles)
      if (e.button === 3 || e.button === 4) e.preventDefault();
    });
    on(canvas, 'contextmenu', (e) => e.preventDefault());
    // TT3 §11.5 K2: a right-click over the HUD (Pearl's bubble, the objective line, a toast) still reaches the actions
    // bound to RMB (the Stand), without a click order. Buttons, menus and form fields keep their own clicks.
    on(window, 'mousedown', (e) => {
      if (e.button !== 2 || e.target === canvas || !this._overHud(e.target)) return;
      if (this._touchT > nowMs() - 800) return;
      this.setDevice('kbm');
      for (const a of this._bind.get('Mouse2') ?? []) if (a !== 'move') this._press(a, 'm:Mouse2');
      this._activity = true;
    }, { capture: true });
    on(window, 'contextmenu', (e) => { if (e.target !== canvas && this._overHud(e.target)) e.preventDefault(); });
    on(window, 'mousemove', (e) => {
      if (!this.pointerLocked) { if (this._touchT < nowMs() - 800) this._pointerAt(e.clientX, e.clientY, true); return; }
      const k = INPUT.mouseSens * this.sensitivity;
      this.look.x += e.movementX * k; this.look.y += e.movementY * k;
      this.lookPx.x += e.movementX; this.lookPx.y += e.movementY;
      if (e.movementX || e.movementY) { this._activity = true; this._lookActivity = true; }
    });
    on(canvas, 'mouseleave', () => { this.pointer.inside = false; });
    on(canvas, 'wheel', (e) => {
      if (!e.deltaY) return;
      if (this.iso) {
        // §2.3: one wheel tick = one zoom step (no target switching: Tab cycles)
        if (e.cancelable) e.preventDefault();
        this.addZoom(e.deltaY > 0 ? -1 : 1);
        this.pulse(e.deltaY > 0 ? 'zoomOut' : 'zoomIn');
        return;
      }
      if (this._wheelCooldown > 0) return;
      this._wheelCooldown = INPUT.wheelRepeat;
      this.pulse(e.deltaY > 0 ? 'lockNext' : 'lockPrev');
    }, { passive: !this.iso });
    on(window, 'auxclick', (e) => { if (e.button === 1 || e.button === 3 || e.button === 4) e.preventDefault(); });
    on(document, 'pointerlockchange', () => this._onPointerLockChange(document.pointerLockElement === canvas));
    on(window, 'touchstart', () => this.noteTouch(), { passive: true });
    on(window, 'gamepadconnected', () => { this.padConnected = true; this._padLive = true; });
    on(window, 'gamepaddisconnected', () => this.releaseAll());
  }

  /**
   * A keydown (window listener; also called directly by tests). TT3 §11.2: a key pressed with Ctrl or Meta held sets
   * no action and no move (Ctrl+W / Ctrl+D / Meta+W belong to the browser); Shift+Tab presses `lockPrev` instead of
   * `lockon`.
   */
  _keyDown(e) {
    if (EDITABLE.has(e.target?.tagName)) return;
    if (e.ctrlKey || e.metaKey) return;
    if (INPUT.preventDefault.includes(e.code)) e.preventDefault?.();
    if (e.repeat) return;
    this.keys.add(e.code);
    this.setDevice('kbm');
    const acts = this._bind.get(e.code) ?? [];
    const backTab = e.code === 'Tab' && e.shiftKey && acts.includes('lockon');
    for (const a of acts) this._press(backTab && a === 'lockon' ? 'lockPrev' : a, 'k:' + e.code);
    if (this._moveCodes.has(e.code)) this._updateKeyMove();
    this._activity = true;
  }

  /** A key went up: releases whatever its keydown pressed (lockPrev for a Shift+Tab). */
  _keyUp(e) {
    this.keys.delete(e.code);
    for (const a of this._bind.get(e.code) ?? []) { this._release(a, 'k:' + e.code); if (a === 'lockon') this._release('lockPrev', 'k:' + e.code); }
    if (this._moveCodes.has(e.code)) this._updateKeyMove();
  }

  detach() {
    for (const off of this._listeners) off();
    this._listeners.length = 0;
    if (typeof document !== 'undefined' && document.pointerLockElement === this.canvas) document.exitPointerLock?.();
  }

  /** A touch began (on window, or on a DOM layer that stops propagation, such as the shelter card). */
  noteTouch() { this._touchT = nowMs(); this.setDevice('touch'); }

  /**
   * Track the mouse (CSS px): ndc relative to the canvas, travel and speed. §6.1: speed is the NET displacement over
   * the last INPUT.pointer.speedWindow s (divided by the full window), so a resting hand's jitter (which cancels out) and a slow drift under
   * INPUT.pointer.idlePxPerSec are not activity. §2.7: while the Meme Cam runs, a move only counts once the cursor is
   * CAMERA.iso.meme.exitPx from where it was when the Meme Cam started.
   */
  _pointerAt(x, y, moved) {
    const P = this.pointer, r = this._canvasRect();
    const w = r?.width || (typeof innerWidth !== 'undefined' ? innerWidth : 1), h = r?.height || (typeof innerHeight !== 'undefined' ? innerHeight : 1);
    const left = r?.left ?? 0, top = r?.top ?? 0;
    const t = nowMs();
    if (moved) {
      const d = Math.hypot(x - P.x, y - P.y);
      P.movedPx += d;
      const win = (INPUT.pointer?.speedWindow ?? 0.25) * 1000, H = this._ptrHist;
      // drop samples older than the window, keeping one at/before its start as the baseline
      while (H.length > 1 && H[1].t <= t - win) H.shift();
      const base = H[0] ?? { x: P.x, y: P.y };
      P.speed = Math.hypot(x - base.x, y - base.y) / (win / 1000);   // net px over the window: jitter cancels out
      H.push({ t, x, y });
      if (H.length > 64) H.shift();
      if (d > 0) {
        P.lastMoveT = t;
        if (P.speed >= (INPUT.pointer?.idlePxPerSec ?? 24) && this._memeAllows(x, y)) this._activity = true;
        if (this.device === 'touch' && d > 2) this.setDevice('kbm');
      }
    }
    P._t = t;
    P.x = x; P.y = y;
    P.ndcX = ((x - left) / w) * 2 - 1; P.ndcY = -(((y - top) / h) * 2 - 1);
    P.inside = x >= left && x <= left + w && y >= top && y <= top + h;
  }

  /** A HUD element of the game's ui root that is not a control (TT3: RMB there still guards). */
  _overHud(t) {
    if (!t?.closest) return false;
    if (!t.closest('.ui-root')) return false;
    if (t.closest('button, a, input, select, textarea, label, [role="button"], .menu, .menu-screen, .tbtn, .touch-root, .ab-slot')) return false;
    const mode = this.ctx?.game?.mode ?? 'play';
    return mode === 'play' || mode === 'memecam';
  }

  /** The canvas bounding rect, cached until a resize / scroll / canvas resize. */
  _canvasRect() {
    if (!this.canvas?.getBoundingClientRect) return null;
    return (this._rect ??= this.canvas.getBoundingClientRect());
  }

  /** §2.7: in the Meme Cam, pointer motion is activity only past CAMERA.iso.meme.exitPx from the mark. */
  _memeAllows(x, y) {
    if ((this.ctx?.game?.mode ?? 'play') !== 'memecam') { this._memeMark = null; return true; }
    this._memeMark ??= this.pointerMark();      // called before pointer.x/y take (x, y): the mark is where the cursor rested
    return Math.hypot(x - this._memeMark.x, y - this._memeMark.y) >= (CAMERA.iso?.meme?.exitPx ?? 40);
  }

  /** A mark of the current cursor position, for pointerSince(mark). */
  pointerMark() { return { x: this.pointer.x, y: this.pointer.y }; }
  /** CSS px (straight line) the cursor is from `mark` (jitter around a resting point stays ~0). */
  pointerSince(mark) { return mark ? Math.hypot(this.pointer.x - mark.x, this.pointer.y - mark.y) : 0; }

  /** Seconds since the mouse last moved (KBM aim freshness, §7.1 "pointer moved within the last 3 s"). */
  pointerIdle() { return (nowMs() - this.pointer.lastMoveT) / 1000; }

  requestPointerLock() {
    const c = this.canvas;
    if (!c?.requestPointerLock) return;
    try {
      const r = c.requestPointerLock({ unadjustedMovement: true });
      if (r && typeof r.catch === 'function') r.catch(() => { try { c.requestPointerLock()?.catch?.(() => {}); } catch { /* ignore */ } });
    } catch { /* ignore: unsupported */ }
  }

  exitPointerLock() { if (typeof document !== 'undefined' && document.pointerLockElement) document.exitPointerLock(); }

  /**
   * Pointer lock gained / lost. Browsers spend the player's Esc on leaving the lock (Chrome does not even
   * deliver that keydown), so a lock lost mid-play is treated as a pause request: it is latched here and
   * resolved in the next fixed step (`_resolveLockLoss`), where mode / ui / story state is consistent.
   * @param {boolean} locked
   */
  _onPointerLockChange(locked) {
    const was = this.pointerLocked;
    this.pointerLocked = locked;
    if (locked) { this.relockOnResume = true; this._lockLost = false; }
    else {
      for (const a of ['attack', 'guard', 'lockon']) {
        const s = this.actions.get(a);
        for (const src of [...s.sources]) if (src.startsWith('m:')) this._release(a, src);
      }
      if (was && this.pointerLockEnabled) this._lockLost = true;
    }
    if (was !== locked) this.ctx?.bus?.emit(E.INPUT_POINTER_LOCK, { locked });
  }

  /** Fixed step: a pointer lock lost during play / memecam opens the pause menu (unless a screen, scene or load owns the moment). */
  _resolveLockLoss() {
    if (!this._lockLost) return;
    this._lockLost = false;
    const ctx = this.ctx, mode = ctx?.game?.mode;
    if (mode !== 'play' && mode !== 'memecam') return;           // menu (our own exit), cutscene, dialog: nothing to do
    if (ctx.levels?.loading || ctx.ui?.busy || typeof ctx.ui?.pause !== 'function') return;
    ctx.ui.pause();
    // the Esc that broke the lock may still arrive as a key edge this step: don't let it close the menu again
    const p = this.actions.get('pause');
    if (p) p.pressed = false;
  }

  /** Called by Game when leaving the pause menu back to play: re-capture the mouse if it was captured before. */
  relock() {
    if (!this.pointerLockEnabled || this.pointerLocked || !this.relockOnResume || this.device !== 'kbm') return;
    this.requestPointerLock();
  }

  /** Gamepad rumble (GAME_DESIGN §8.2: [weak, strong, ms]); silently ignored where unsupported. */
  rumble(weak, strong, ms) {
    const nav = typeof navigator !== 'undefined' ? navigator : null;
    if (!nav?.getGamepads || this.device !== 'pad') return;
    const scale = this.ctx?.state?.settings?.shake ?? 1;
    for (const p of nav.getGamepads()) {
      const act = p?.vibrationActuator;
      if (!act?.playEffect) continue;
      act.playEffect('dual-rumble', { duration: ms, weakMagnitude: Math.min(1, weak * scale), strongMagnitude: Math.min(1, strong * scale) }).catch?.(() => {});
    }
  }
}

const _dz = { x: 0, y: 0 };
/** Frames between `getGamepads()` probes while no pad is live (≈ 4 Hz at 60 fps). */
const PAD_PROBE_FRAMES = 15;
/** Precomputed pad source keys ('p0' … 'p19'): no string building per frame. */
const PAD_SRC = Array.from({ length: 20 }, (_, i) => 'p' + i);
/** TT3: source keys of the RT + D-pad trick picks ('pk12' …). */
const PICK_SRC = Array.from({ length: 20 }, (_, i) => 'pk' + i);
const NO_MODS = Object.freeze({ ctrl: false, shift: false, alt: false });
const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
/** Radial dead zone with rescale, written into `out` ({x, y}). */
export function deadZone(x, y, dz, out = { x: 0, y: 0 }) {
  const l = Math.hypot(x, y);
  if (l < dz) { out.x = 0; out.y = 0; return out; }
  const s = Math.min(1, (l - dz) / (1 - dz)) / l;
  out.x = x * s; out.y = y * s;
  return out;
}
