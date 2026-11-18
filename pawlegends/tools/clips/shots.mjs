/**
 * Clip spec → harness ShotSpec (tools/clips/harness.ts). Cameras, aspect framing, slow motion, HUD and looks.
 * Frames are OUTPUT frames at the spec's fps (30 by default). Director keys: `dist` × the game camera distance
 * (27.8 m), `pitch` degrees down, `yaw` degrees from the gameplay yaw (0 = looking north), `fov` vertical degrees.
 */

export const ASPECTS = {
  horizontal: { width: 1280, height: 720, dpr: 1.5 },
  vertical: { width: 540, height: 960, dpr: 2 },
};

/** Per aspect: a 9:16 frame gets a wider vertical FOV and a steeper look, so the fight spreads up the frame. */
const PRESET = {
  follow: { horizontal: { dist: 0.62, pitch: 40, fov: 40, lift: 1 }, vertical: { dist: 0.62, pitch: 52, fov: 56, lift: 1 } },
  high: { horizontal: { dist: 1.45, pitch: 62, fov: 40, lift: 0 }, vertical: { dist: 1.3, pitch: 68, fov: 60, lift: 0 } },
  low: { horizontal: { dist: 0.34, pitch: 13, fov: 46, lift: 1.3 }, vertical: { dist: 0.36, pitch: 16, fov: 64, lift: 1.4 } },
  orbit: { horizontal: { dist: 0.55, pitch: 30, fov: 42, lift: 1 }, vertical: { dist: 0.58, pitch: 36, fov: 58, lift: 1 } },
  push: { horizontal: { dist: 1.1, pitch: 52, fov: 40, lift: 0.6 }, vertical: { dist: 1.05, pitch: 58, fov: 58, lift: 0.6 } },
};

export const CAMERAS = ['game', 'follow', 'high', 'low', 'orbit', 'push', 'punch', 'cuts'];

/** Looks as a slot map: `{ "0": "coat.clem.snowpaw" }` or per team `[["coat.clem.snowpaw", null], [...]]`. */
function looksOf(spec, per) {
  const l = spec.looks;
  if (!l) return undefined;
  if (Array.isArray(l)) {
    const out = {};
    (l[0] ?? []).forEach((id, i) => id && (out[i] = id));
    (l[1] ?? []).forEach((id, i) => id && (out[per + i] = id));
    return out;
  }
  return l;
}

/** The camera target for a moment. */
function targetOf(spec, moment, focus, ctx = {}) {
  // target 'point': hold on the moment's fixed spot (e.g. a tower about to fall) instead of a drifting fight centre
  if (spec.target === 'point' && moment && (moment.x || moment.y)) return { point: [moment.x, moment.y], lift: 1 };
  if (spec.target === 'unit' || (spec.camera === 'follow' && spec.focus !== undefined)) return { unit: focus, lift: 1 };
  // victory: ride with the pushing heroes, then settle on the falling core 4 s before it breaks (a plain 'fight'
  // centre drifts after the heroes and can miss the core)
  if (moment?.type === 'victory' && ctx.evF !== undefined) {
    const e = ctx.evF;
    return { blend: [{ fight: [moment.x, moment.y], r: 18, lift: 1 }, { point: [moment.x, moment.y], lift: 1 }], f0: Math.max(0, e - Math.round(7 * ctx.fps)), f1: Math.max(1, e - Math.round(3 * ctx.fps)) };
  }
  if (moment && (moment.x || moment.y) && ['teamfight', 'ace', 'multikill', 'victory', 'tower', 'towerDive', 'objective', 'cannon', 'yarn', 'boing', 'chaos'].includes(moment.type)) {
    return { fight: [moment.x, moment.y], r: moment.type === 'victory' ? 16 : 12, focus: (moment.slots ?? []).slice(0, 2), lift: 1 };
  }
  return { unit: focus, lift: 1 };
}

function keysFor(name, aspect, N, evF) {
  const P = (n) => ({ ...PRESET[n][aspect] });
  switch (name) {
    case 'follow':
    case 'high':
    case 'low':
      return [{ f: 0, ...P(name) }, { f: N - 1, ...P(name), dist: P(name).dist * 0.92 }];
    case 'orbit':
      return [{ f: 0, ...P('orbit'), yaw: -60 }, { f: N - 1, ...P('orbit'), yaw: 75, ease: 'ease' }];
    case 'push': {
      const a = P('push');
      return [{ f: 0, ...a }, { f: N - 1, ...a, dist: a.dist * 0.48, pitch: a.pitch - 18, ease: 'ease' }];
    }
    case 'punch': {
      const a = P('follow');
      const e = Math.max(2, Math.min(N - 30, evF));
      return [
        { f: 0, ...a, dist: a.dist * 1.25 },
        { f: e - 1, ...a, dist: a.dist * 1.2 },
        { f: e + 4, ...a, dist: a.dist * 0.62, pitch: a.pitch - 6, ease: 'snap' },
        { f: e + 34, ...a, dist: a.dist * 0.58, pitch: a.pitch - 7 },
        { f: Math.min(N - 1, e + 70), ...a, dist: a.dist * 1.1, ease: 'ease' },
      ];
    }
    default:
      return [{ f: 0, ...P('follow') }];
  }
}

/** A cut list: wide → low → follow → orbit-ish, a hard cut every ~4-6 s, a slow drift inside each. */
function cutsFor(aspect, N, fps, target, focus, ctx = {}) {
  // toy chaos: each cut rides the toy moment (cannon shot, KABOOM, Boing launch, yarn kick) nearest its segment
  const toys = ctx.moment?.type === 'chaos' && ctx.scan
    ? ctx.scan.moments.filter((m) => ((m.type === 'cannon' && m.sub !== 'cannonPick') || m.type === 'boing' || m.type === 'yarn') && m.tick >= ctx.startTick && m.tick <= ctx.startTick + (N / fps) * 30)
    : [];
  const toyAt = (f) => {
    const tick = ctx.startTick + (f / fps) * 30;
    let bestM = null;
    for (const m of toys) if (!bestM || Math.abs(m.tick - tick - 45) < Math.abs(bestM.tick - tick - 45)) bestM = m;
    if (!bestM) return null;
    const pt = { point: [bestM.x, bestM.y], lift: 1 };
    return bestM.slots?.length ? { unit: bestM.slots[0], lift: 1, alt: pt } : pt;
  };
  const angles = [
    { ...PRESET.high[aspect], yaw: 0 },
    { ...PRESET.low[aspect], yaw: -35 },
    { ...PRESET.follow[aspect], yaw: 25 },
    { ...PRESET.orbit[aspect], yaw: 140 },
    { ...PRESET.low[aspect], yaw: 50 },
  ];
  const len = Math.max(Math.round(3.5 * fps), Math.round(N / Math.min(5, Math.max(3, Math.round(N / fps / 5)))));
  const keys = [];
  const cut = [];
  for (let s = 0, i = 0; s < N; s += len, i++) {
    const a = angles[i % angles.length];
    const end = Math.min(N - 1, s + len - 1);
    keys.push({ f: s, ...a, ease: 'hold' });
    keys.push({ f: end, ...a, dist: a.dist * 0.9, yaw: a.yaw + 12, ease: 'linear' });
    cut.push([s, toyAt(s) ?? (i % 3 === 2 ? { unit: focus, lift: 1, alt: target } : target)]);
  }
  return { keys, target: { cut } };
}

/**
 * spec: see README. ctx: { fps, N, take, moment, startTick, evF, check }.
 */
export function buildShot(spec, ctx) {
  const aspect = spec.aspect === 'vertical' ? 'vertical' : 'horizontal';
  const size = ASPECTS[aspect];
  const { fps, N } = ctx;
  const base = {
    id: spec.id,
    width: size.width,
    height: size.height,
    dpr: size.dpr,
    f0: 0,
    f1: N - 1,
    fps,
    uiOut: true,
    realFlash: true,
    popCull: true,
    heroNames: true,
    twinNames: true,
    xray: true,
    ghosts: true,
  };
  if (spec.mode === 'skins') return skinsShot(spec, ctx, base, aspect);
  const per = spec.mode === 'classic' ? 5 : 3;
  const focus = spec.focus ?? ctx.moment?.slots?.[0] ?? 0;
  const cam = spec.camera ?? 'game';
  const target = targetOf(spec, ctx.moment, focus, ctx);
  let shotCam = null;
  if (cam === 'game') {
    // the game's own camera (its follow, lead, fight pull-back and shake), its look point moved onto the subject;
    // in 9:16 a wider lens and a slightly steeper pitch
    const v = aspect === 'vertical';
    if (!v && focus === 0 && !spec.target) shotCam = null;
    else shotCam = { base: 'game', target, keys: [{ f: 0, dist: v ? 1.0 : 1, pitch: v ? 6 : 0, yaw: 0, fov: v ? 56 : 38, lift: 0, blend: 1 }] };
  } else if (cam === 'cuts') {
    const c = cutsFor(aspect, N, fps, target, focus, ctx);
    shotCam = { target: c.target, keys: c.keys, smooth: 0.18 };
  } else {
    shotCam = { target, keys: keysFor(cam, aspect, N, ctx.evF), smooth: cam === 'high' ? 0.35 : 0.22 };
  }
  // optional camAdjust { pitch: +deg, dist: x factor, fov: +deg, yaw: +deg } on every key of a directed camera
  // (e.g. a steeper orbit that clears tree canopies); additive, absent = unchanged
  if (shotCam && cam !== 'game' && spec.camAdjust) {
    const ca = spec.camAdjust;
    shotCam.keys = shotCam.keys.map((k) => ({
      ...k,
      ...(k.pitch !== undefined && ca.pitch ? { pitch: k.pitch + ca.pitch } : {}),
      ...(k.dist !== undefined && ca.dist ? { dist: k.dist * ca.dist } : {}),
      ...(k.fov !== undefined && ca.fov ? { fov: k.fov + ca.fov } : {}),
      ...(ca.yaw ? { yaw: (k.yaw ?? 0) + ca.yaw } : {}),
    }));
  }
  if (shotCam && aspect === 'vertical' && cam !== 'game' && spec.autoFit !== false) shotCam.autoFit = undefined;
  // slow motion: true = around the moment; { at (output s), dur (s), speed }
  let ramp = [];
  if (spec.slowmo) {
    const sm = spec.slowmo === true ? {} : spec.slowmo;
    const sp = sm.speed ?? 0.3;
    const a = sm.at !== undefined ? Math.round(sm.at * fps) : Math.max(6, ctx.evF - Math.round(0.3 * fps));
    const d = Math.round((sm.dur ?? 2.2) * fps);
    ramp = [[0, 1], [Math.max(0, a - 8), 1], [a, sp, 'ease'], [a + d, sp], [a + d + 12, 1, 'ease']];
  }
  const hud = spec.hud === true;
  const shot = {
    ...base,
    mode: 'match',
    preroll: 60,
    startTick: ctx.startTick,
    take: { ...ctx.take, look: looksOf(spec, per)?.[0] ?? null, looks: looksOf(spec, per), check: ctx.check },
    cam: shotCam,
    ramp,
    layers: hud ? ['hud'] : spec.pops === false ? [] : ['pops', 'banner', 'plates'],
    musicMin: spec.music ?? (['teamfight', 'ace', 'multikill', 'victory', 'towerDive'].includes(ctx.moment?.type) ? 2 : 1),
    popScale: aspect === 'vertical' ? 1.25 : 1,
    selfEdge: false,
    edgeArrows: false,
    ...(cam === 'game' && hud ? { gameLook: true } : {}),
    // the player's dead veil and respawn iris grey out the whole frame when slot 0 dies: only the HUD game look keeps them
    css: cam === 'game' && hud ? '' : '.pl-lc-dead, .pl-lc-iris { display: none !important; } html[data-pl-dead] #game-canvas, .pl-match.dead canvas { filter: none !important; transition: none !important; }',
    // tower moments: the harness x-ray ('hide') culls a standing structure at the look point too, so the tower that is
    // about to fall was invisible (only its HP bar and smoke showed); keep it drawn. `spec.xray` overrides either way.
    ...(spec.xray !== undefined ? { xray: !!spec.xray } : ctx.moment?.type === 'tower' ? { xray: false } : {}),
    ...(spec.shot ?? {}),
  };
  if (aspect === 'vertical' && shot.cam && cam !== 'game') shot.autoFit = spec.autoFit === false ? null : { maxK: 1.45, margin: 0.07 };
  return shot;
}

/**
 * Skins: the Home lobby stage. `style` 'turntable' (one hero, its coats swapped on a white wipe of sound every few
 * seconds while it turns) or 'lineup' (several heroes side by side, each in a coat, a slow push).
 */
/**
 * Lineup acts: one cheer/swing per hero early on (default); optional `actEvery` (s, batch-2 fix, additive) repeats
 * the round every that many seconds so a long lineup does not stand still after the first second.
 */
function lineupActs(n, N, spec, fps) {
  const acts = [];
  const every = spec.actEvery ? Math.round(spec.actEvery * fps) : 0;
  for (let r = 0, f0 = 20; f0 < N - 10; r++, f0 += every) {
    for (let i = 0; i < n; i++) {
      const f = f0 + i * 18;
      if (f < N - 10) acts.push({ f, stand: i, act: (i + r) % 2 ? 'swing' : 'cheer' });
    }
    if (!every) break;
  }
  return acts;
}

function skinsShot(spec, ctx, base, aspect) {
  const { N } = ctx;
  const v = aspect === 'vertical';
  // `zoom` (added, recorder 1): > 1 moves the camera closer (distance / zoom); default 1 = unchanged
  const zm = spec.zoom > 0 ? spec.zoom : 1;
  if ((spec.style ?? 'turntable') === 'lineup') {
    const heroes = spec.heroes ?? [];
    const looks = spec.looks ?? [];
    const gap = v ? 1.5 : 1.9;
    const stands = heroes.map((h, i) => ({ hero: h, card: looks[i] ?? null, x: (i - (heroes.length - 1) / 2) * gap, z: v ? -Math.abs(i - (heroes.length - 1) / 2) * 0.6 : 0, face: 0, spin: 0 }));
    return {
      ...base,
      mode: 'lobby',
      preroll: 90,
      lobby: { stands, ped: { scale: 0.62 }, fitH: 1.5, acts: lineupActs(heroes.length, N, spec, ctx.fps ?? 30) },
      // optional `zoom` (batch-2 fix, additive): > 1 brings the camera closer (a 2-hero lineup filled ~25 % of 16:9)
      cam: { target: { p3: [0, 0.8, 0] }, keys: [{ f: 0, dist: (v ? 0.62 : 0.36) / (spec.zoom ?? 1), pitch: 8, yaw: -10, fov: v ? 44 : 34, lift: 1 }, { f: N - 1, dist: (v ? 0.54 : 0.3) / (spec.zoom ?? 1), pitch: 6, yaw: 10, ease: 'ease' }] },
      layers: [],
      musicMin: spec.music ?? 2,
    };
  }
  const looks = spec.looks ?? [null];
  const each = Math.floor(N / looks.length);
  const swaps = looks.slice(1).map((card, i) => ({ f: (i + 1) * each, card }));
  // the lobby keeps its own hero's facing (it turns to the camera): the camera swings round it instead, one sweep
  // per coat, a hard reset on each swap (the swap's sting covers the cut)
  const d0 = (v ? 0.44 : 0.5) / zm;
  const d1 = (v ? 0.37 : 0.41) / zm;
  // sweep: the camera's yaw swing per coat (degrees). 9:16 at +-38 showed past the painted backdrop's edge (a dark
  // wedge in a bottom corner at each sweep's start), so vertical defaults to 24; `spec.sweep` overrides either.
  const sw = spec.sweep ?? (v ? 24 : 38);
  const keys = [];
  looks.forEach((_, i) => {
    const a = i * each;
    const b = Math.min(N - 1, (i + 1) * each - 1);
    const dir = i % 2 ? -1 : 1;
    keys.push({ f: a, dist: d0, pitch: 9, yaw: -sw * dir, fov: v ? 40 : 34, lift: 1, ease: 'hold' });
    keys.push({ f: b, dist: d1, pitch: 5, yaw: sw * dir, fov: v ? 40 : 34, lift: 1, ease: 'ease' });
  });
  return {
    ...base,
    mode: 'lobby',
    preroll: 120,
    lobby: {
      stands: [{ hero: spec.hero, card: looks[0] }],
      swaps,
      acts: looks.map((_, i) => ({ f: i * each + 10, stand: 0, act: i % 2 ? 'swing' : 'cheer' })),
    },
    musicMin: spec.music ?? 2,
    cam: { target: { p3: [0, 0.85, 0] }, keys },
    layers: [],
  };
}
