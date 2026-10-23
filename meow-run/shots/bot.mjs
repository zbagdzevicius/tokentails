// Shared playtest bot for shots/*.mjs. The bot "sees" the game through window.__meow (colliders, prompts, track
// kinds), but it acts ONLY through real browser input: Playwright keyboard events on desktop (A/D held to steer,
// Space jump, S slide, E ability) or CDP touch events on phones (finger drag to steer, swipe up/down, tap).
// No __meow.press / input.botSteer calls.
//
//   const bot = await createBot(page, { mobile, W, H });
//   await bot.install();               // after every page load
//   const r = await bot.playUntil(() => mode === 'over', { maxMs })   // drives until the stage ends

// The in-page brain: returns the controls a player would use right now. `lead` (s) is the measured input latency,
// so the timing windows open early by that much.
function brainSource() {
  window.__brain = (lead) => {
    const M = window.__meow;
    const P = M.P;
    const B = (window.__brainState ||= { lastJump: -9, lastSlide: -9, lastAbility: -9, pounces: 0 });
    const now = M.clock.sim;
    const out = { mode: M.mode, screen: document.body.dataset.screen, steer: 0, act: null, s: P.s, x: P.x };
    if (M.mode !== 'play') return out;
    if (window.__botPassive) return out;
    const track = M.game.track;
    const v = Math.max(1, P.speed);
    const L = Math.max(0, lead);
    let steer = -P.x * 0.25;
    let best = 1e9;
    let dodge = 0;
    let want = null;
    for (const c of M.colliders()) {
      if (!c.enabled) continue;
      const ds = c.s - P.s;
      if (c.kind === 'trigger' && ds > 2 && ds < 22 && ds < best && c.label !== 'puddle' && c.label !== 'rapid') {
        best = ds;
        steer = Math.max(-1, Math.min(1, (c.x - P.x) * 0.6));
      }
      if (c.kind !== 'hurt') continue;
      const half = c.shape === 'sphere' ? c.r : c.hx;
      const lateral = Math.abs(c.x - P.x) - half - 0.4;
      const tall = c.shape === 'sphere' ? c.r > 1.3 || c.label === 'dog' : c.h > 3;
      if ((tall || c.label === 'rock') && ds > -3 && ds < 16 + v * L && lateral < 0.9) dodge += (P.x >= c.x ? 1 : -1) * (1.5 - Math.min(1.4, Math.max(0, lateral)));
      const near = 1.2 + v * L;
      if (ds < near || ds > near + v * 0.18 || lateral > 0.15 || tall) continue;
      if (c.y > 0.5) { if (!P.sliding) want = 'slide'; }
      else if (P.grounded && want !== 'slide') want = 'jump';
    }
    if (dodge !== 0) steer = Math.sign(dodge);
    const pr = M.hud.prompt;
    if (pr) (B.prompts ||= {})[pr.text] = 1;
    // air bells: hop so the head meets the bell (a jump reaches 2 u in ~0.16 s and peaks at 2.6 u in ~0.32 s)
    if (!want && (P.grounded || P.mode === 'ride') && now - B.lastJump > 0.45) {
      for (const c of M.colliders()) {
        if (!c.enabled || c.label !== 'bell') continue;
        const up = c.y - P.y;
        if (up < 1.4 || up > 3.4 || Math.abs(c.x - P.x) > 1.2) continue;
        const ds = c.s - P.s;
        const tt = up < 2.2 ? 0.17 : 0.27;
        if (ds > v * (tt - 0.05 + L) && ds < v * (tt + 0.12 + L)) want = 'jump';
      }
    }
    if (pr && pr.action === 'ability' && now - B.lastAbility > 0.3) want = 'ability';
    const ahead = track.kindAt(P.s + v * (0.2 + L));
    if (!want && P.grounded && P.mode === 'run' && ahead === 'gap' && !(pr && pr.action === 'ability')) want = 'jump';
    // over a gap without an arc: pounce once on the way down
    if (!want && !P.grounded && P.mode === 'run' && track.kindAt(P.s) === 'gap' && P.vy < 0 && P.sincePounce > 5 && now - B.lastJump > 0.15) want = 'jump';
    if (!want && pr && pr.action === 'jump' && pr.text.includes('RAPIDS') && P.grounded) {
      for (const c of M.colliders()) if (c.label === 'rapid' && c.s - P.s > 1 + v * L && c.s - P.s < 1.5 + v * (0.15 + L)) want = 'jump';
    }
    // debounce: one press per decision, as a player would
    if (want === 'jump' && now - B.lastJump < 0.22) want = null;
    if (want === 'slide' && now - B.lastSlide < 0.3) want = null;
    if (want === 'jump') B.lastJump = now;
    if (want === 'slide') B.lastSlide = now;
    if (want === 'ability') B.lastAbility = now;
    out.act = want;
    out.steer = Math.max(-1, Math.min(1, steer));
    return out;
  };
}

export async function createBot(p, { mobile, W, H }) {
  const cdp = mobile ? await p.context().newCDPSession(p) : null;
  const stats = { jumps: 0, slides: 0, abilities: 0, polls: 0, latency: 0.03, actLatency: mobile ? 0.03 : 0 };
  let held = 0; // desktop: -1 (A held), 0, 1 (D held)
  let finger = null; // phone: { x0, y0, x }
  const fx = W / 2, fy = Math.round(H * 0.58);

  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((q, i) => ({ x: q.x, y: q.y, id: q.id ?? i + 1, radiusX: 8, radiusY: 8, force: 1 })) });
  const releaseFinger = async () => {
    if (!finger) return;
    finger = null;
    await touch('touchEnd', []);
  };
  const setSteer = async (s) => {
    if (!mobile) {
      const want = s > 0.3 ? 1 : s < -0.3 ? -1 : 0;
      if (want === held) return;
      if (held === 1) await p.keyboard.up('KeyD');
      if (held === -1) await p.keyboard.up('KeyA');
      if (want === 1) await p.keyboard.down('KeyD');
      if (want === -1) await p.keyboard.down('KeyA');
      held = want;
      return;
    }
    // phone: drag a finger sideways from where it went down (60 px = full steer)
    const dx = Math.abs(s) < 0.12 ? 0 : Math.round(s * 60);
    if (!finger) {
      if (dx === 0) return;
      finger = { x0: fx, y0: fy, x: fx };
      await touch('touchStart', [{ x: fx, y: fy }]);
      // past the tap/steer threshold sideways first, so it never reads as a vertical swipe
      finger.x = fx + Math.sign(dx) * 20;
      await touch('touchMove', [{ x: finger.x, y: fy }]);
    }
    const x = fx + dx;
    if (x !== finger.x) {
      finger.x = x;
      await touch('touchMove', [{ x, y: fy }]);
    }
  };
  const act = async (a) => {
    if (!mobile) {
      if (a === 'jump') await p.keyboard.press('Space');
      else if (a === 'slide') await p.keyboard.press('KeyS');
      else if (a === 'ability') await p.keyboard.press('KeyE');
    } else {
      const t0 = Date.now();
      await releaseFinger();
      const x = fx, y = fy;
      if (a === 'ability') {
        await touch('touchStart', [{ x, y }]);
        await touch('touchEnd', []);
      } else {
        // one decisive move: a vertical swipe fires on the first move past 38 px
        const dir = a === 'jump' ? -1 : 1;
        await touch('touchStart', [{ x, y }]);
        await touch('touchMove', [{ x, y: y + dir * 60 }]);
      }
      stats.actLatency = stats.actLatency * 0.8 + ((Date.now() - t0) / 1000) * 0.2;
      if (a !== 'ability') await touch('touchEnd', []);
    }
    if (a === 'jump') stats.jumps++;
    else if (a === 'slide') stats.slides++;
    else if (a === 'ability') stats.abilities++;
  };
  const releaseAll = async () => {
    await setSteer(0);
    await releaseFinger();
  };

  return {
    stats,
    install: () => p.evaluate(`(${brainSource.toString()})()`),
    releaseAll,
    act,
    swipe: act,
    /** drive with real input until stop(state) is true or maxMs passes; returns the last brain state */
    async playUntil(stop, { maxMs = 240000, onTick } = {}) {
      const t0 = Date.now();
      let last = null;
      while (Date.now() - t0 < maxMs) {
        const a = Date.now();
        last = await p.evaluate((lead) => window.__brain(lead), stats.latency + stats.actLatency).catch(() => null);
        stats.latency = stats.latency * 0.9 + ((Date.now() - a) / 1000 + 0.012) * 0.1;
        stats.polls++;
        if (!last) { await p.waitForTimeout(100); continue; }
        if (stop(last)) break;
        if (last.mode !== 'play') { await releaseAll(); await p.waitForTimeout(60); continue; }
        if (last.act) await act(last.act);
        await setSteer(last.steer);
        if (onTick) await onTick(last);
        await p.waitForTimeout(8);
      }
      await releaseAll();
      return last;
    },
  };
}
