// Ultra Cat trailer shots (STORYBOARD.md). Each shot: { aspects, seed, run(o, L) } -> the L.record(...) result.
// Page side: window.__ultra (the game's test hook) and window.__dir (page.js: bot, cam, place, towers, faceBuilding).
// Takes are longer than their cut; edl.mjs picks the window.

const BOTH = ['16x9', '9x16'];

/** Face the tallest building within range of the cat; returns the tower {i, x, z, h}. */
function faceTallest(o, L, { dMin = 0, dMax = 400, gap = 14, pick = 0 } = {}) {
  return L.ev(
    o,
    ({ dMin, dMax, gap, pick }) => {
      const D = window.__dir;
      const C = window.__ultra.C;
      const t = D.towers(C.pos.x, C.pos.z, dMin, dMax, 8)[pick];
      D.faceBuilding(t.i, gap, C.pos.x, C.pos.z);
      return t;
    },
    { dMin, dMax, gap, pick },
  );
}
const setBot = (o, L, bot) => L.ev(o, (b) => void (window.__dir.bot = b), bot);
const setCam = (o, L, cam) => L.ev(o, (c) => void (window.__dir.cam = c), cam);
const G = (o, L, patch) => L.ev(o, (p) => void Object.assign(window.__ultra.G, p), patch);
const hideFish = (o, L, on = true) => L.ev(o, (on) => void (window.__dir.hideFish = on), on);
const noWanted = (o, L) => L.ev(o, () => void (window.__dir.noWanted = true));
const portrait = (o) => o.aspectId === '9x16';

/** Plain gameplay take: jump, warm up with the bot for `warm` frames, record `frames`. */
function play(level, cat, { frames = 150, warm = 30, bot = { target: 'tall', swat: 7, pounce: 55 }, patch, seed = 1, cam = null, setup, perFrame, aspects = ['16x9'], fish = true, tower } = {}) {
  return {
    aspects,
    seed,
    async run(o, L) {
      await L.jump(o, level, cat, { seed });
      if (!fish) await hideFish(o, L);
      if (tower) await faceTallest(o, L, tower);
      if (patch) await G(o, L, patch);
      if (setup) await setup(o, L);
      // the ULTRA fires at a frame of the recorded take, not of the warm-up
      const { ultra, ...warmBot } = bot;
      await setBot(o, L, typeof ultra === 'number' ? warmBot : bot);
      if (cam) await setCam(o, L, typeof cam === 'function' ? cam(o) : cam);
      if (warm) await L.sim(o, warm);
      if (typeof ultra === 'number') await setBot(o, L, bot);
      return L.record(o, this.name, frames, { perFrame: perFrame && ((i) => perFrame(o, L, i)) });
    },
  };
}

export const SHOTS = {
  // ---- hook: Purrburbia, a 3/4 front camera so the tabby's face, its LASER EYES and the apartment block all read
  // (Meowhattan's towers hid the cat and the collapse from every low angle); then swats and a pounce into the rubble
  hook: {
    aspects: BOTH,
    async run(o, L) {
      await L.jump(o, 'suburbia', 'tabby');
      await hideFish(o, L);
      await noWanted(o, L);
      await faceTallest(o, L, { gap: 12 });
      await setBot(o, L, { target: null, walk: false });
      const cam = process.env.TRAILER_CAM
        ? JSON.parse(process.env.TRAILER_CAM)
        : portrait(o)
          ? { kind: 'follow', yaw: 2.6, back: 150, y: 95, ahead: 0, ly: 40, fov: 62 }
          : { kind: 'follow', yaw: 2.6, back: 120, y: 80, ahead: 0, ly: 30, fov: 55 };
      await setCam(o, L, cam);
      await L.sim(o, 6);
      return L.record(o, 'hook', 170, {
        perFrame: async (i) => {
          if (i === 2) await L.ev(o, () => { window.__ultra.G.ultra = 100; window.__ultra.doUltra(); });
          if (i === 40 || i === 58 || i === 76) await L.ev(o, () => window.__ultra.doSwipe());
          if (i === 100) await L.ev(o, () => window.__ultra.doPounce());
        },
      });
    },
  },
  // ---- downtown rampage with the HUD: combo climbs
  title: play('meowhattan', 'tabby', { frames: 160, warm: 10, seed: 3, bot: { target: 'tall', swat: 6, pounce: 40 }, aspects: BOTH }),
  combo: play('meowhattan', 'tabby', { frames: 260, warm: 240, seed: 4, bot: { target: 'tall', swat: 5, pounce: 36, zoom: false }, aspects: BOTH }),
  // ---- the city fights back
  heli: play('meowhattan', 'tabby', {
    setup: (o, L) => noWanted(o, L),
    frames: 300,
    warm: 900,
    seed: 5,
    patch: { elapsed: 45 },
    bot: { target: 'heli', fallback: 'tall', swat: 5, near: 40, reach: 90 },
    // 16:9 sits closer: from the portrait distance the helicopters and their spray read as specks
    cam: (o) => (portrait(o) ? { kind: 'follow', yaw: 0.45, back: 150, y: 95, ahead: 40, ly: 55, fov: 60, ease: 4 } : { kind: 'follow', yaw: 0.45, back: 105, y: 72, ahead: 40, ly: 55, fov: 58, ease: 4 }),
    aspects: BOTH,
  }),
  truck: play('docks', 'tabby', { frames: 200, warm: 150, seed: 6, patch: { elapsed: 32 }, bot: { target: 'threat', swat: 6, pounce: 50, near: 60, reach: 75 } }),
  vacuum: play('suburbia', 'tabby', { frames: 200, warm: 150, seed: 7, patch: { elapsed: 30 }, bot: { target: 'threat', swat: 6, pounce: 45, near: 30, reach: 60 } }),
  // ---- 4 cats, 4 ULTRAs
  'u-tabby': play('nekotown', 'tabby', { frames: 220, warm: 60, seed: 8, bot: { target: 'tall', swat: 9, ultra: 4 }, aspects: BOTH }),
  'u-chonk': play('suburbia', 'chonk', { frames: 240, warm: 60, seed: 9, bot: { target: 'tall', swat: 9, ultra: 4, walk: true }, aspects: BOTH }),
  'u-shadow': play('docks', 'shadow', { frames: 200, warm: 60, seed: 10, bot: { target: 'tall', swat: 9, ultra: 4, tallBias: 0 }, aspects: BOTH }),
  'u-siamese': play('base', 'siamese', { frames: 200, warm: 60, seed: 11, bot: { target: 'tall', swat: 9, ultra: 4 }, aspects: BOTH }),
  // ---- the five cities, one hit each
  'c-meow': play('meowhattan', 'tabby', { frames: 110, warm: 40, seed: 12, bot: { target: 'tall', swat: 7, pounce: 30, pounceOff: 20 } }),
  'c-docks': play('docks', 'chonk', { frames: 110, warm: 40, seed: 13, bot: { target: 'tall', swat: 7, pounce: 30, pounceOff: 20 } }),
  'c-sub': play('suburbia', 'tabby', { frames: 110, warm: 40, seed: 14, bot: { target: 'tall', swat: 7, pounce: 30, pounceOff: 20, minH: 3 } }),
  'c-neko': play('nekotown', 'tabby', { frames: 110, warm: 40, seed: 15, bot: { target: 'tall', swat: 7, pounce: 30, pounceOff: 20 } }),
  'c-base': play('base', 'siamese', { frames: 110, warm: 40, seed: 16, bot: { target: 'tall', swat: 7, pounce: 30, pounceOff: 20, minH: 3 } }),
  // ---- WANTED landmark topple
  wanted: {
    aspects: ['16x9'],
    seed: 17,
    async run(o, L) {
      await L.jump(o, 'meowhattan', 'tabby', { seed: 17 });
      await L.ev(o, () => void (window.__dir.M.state.W.next = 0));
      await L.sim(o, 3);
      await L.ev(o, () => {
        const D = window.__dir;
        const bi = D.M.state.W.bi;
        D.faceBuilding(bi, 10, window.__ultra.C.pos.x, window.__ultra.C.pos.z);
        D.bot = { target: null, walk: false };
        D.wbi = bi;
      });
      await hideFish(o, L);
      await setCam(o, L, { kind: 'follow', yaw: 1.2, back: 130, y: 110, ahead: 10, ly: 50, fov: 52 });
      await L.sim(o, 10);
      return L.record(o, 'wanted', 150, {
        perFrame: async (i) => {
          if (i % 20 === 4 && i < 90) await L.ev(o, () => window.__ultra.doSwipe());
          if (i === 70) await L.ev(o, () => window.__ultra.doPounce());
        },
      });
    },
  },
  // ---- Mecha-Dog (Purrburbia mini-boss)
  dog: {
    aspects: ['16x9'],
    seed: 18,
    async run(o, L) {
      await L.jump(o, 'suburbia', 'tabby', { seed: 18 });
      await noWanted(o, L);
      await L.ev(o, () => window.__ultra.dev.boss());
      await L.sim(o, 200);
      // stand 90 from the dog, facing it
      await L.ev(o, () => {
        const d = window.__dir.M.dog.dogState();
        const C = window.__ultra.C;
        const a = Math.atan2(C.pos.x - d.x, C.pos.z - d.z);
        window.__dir.place(d.x + Math.sin(a) * 90, d.z + Math.cos(a) * 90, a + Math.PI);
      });
      await setBot(o, L, { target: 'boss', swat: 6, pounce: 40, near: 45, reach: 90 });
      // two-shot: the game camera kept the dog a speck in the middle of the town
      await setCam(o, L, { kind: 'two', yaw: 1.0, r: 140, k: 0.5, y: 80, ky: 0.2, ly: 25, fov: 50, ease: 3 });
      await L.sim(o, 40);
      return L.record(o, 'dog', 420, {
        perFrame: async (i) => {
          if (i % 60 === 0) await G(o, L, { patience: 100 });
          if (i === 160) await L.ev(o, () => window.__dir.M.dog.debugDog(0.45));
          if (i === 340) await L.ev(o, () => window.__dir.M.dog.debugDog(0.04));
        },
      });
    },
  },
  // ---- Roomba Prime (Fort Fluffington final boss), all three phases to BOSS DOWN
  roomba: {
    aspects: BOTH,
    seed: 19,
    async run(o, L) {
      await L.jump(o, 'base', 'chonk', { seed: 19 });
      await L.ev(o, () => window.__ultra.dev.boss());
      await setBot(o, L, { target: 'boss', swat: 6, pounce: 40, near: 50, reach: 100 });
      // 16:9: the game's "ROOMBA PRIME: UNPLUGGED!" banner is this beat's headline (no trailer card over it)
      if (!portrait(o)) await L.show(o, '#banner');
      await L.sim(o, 260);
      return L.record(o, 'roomba', 760, {
        perFrame: async (i) => {
          if (i % 60 === 0) await G(o, L, { patience: 100 });
          if (i === 150) await L.ev(o, () => window.__dir.M.rb.debugRoomba(0.69));
          if (i === 200) await L.ev(o, () => window.__dir.M.rb.debugRoombaState('spin'));
          if (i === 330) await L.ev(o, () => window.__dir.M.rb.debugRoombaState('dizzy'));
          if (i === 420) await L.ev(o, () => window.__dir.M.rb.debugRoomba(0.4));
          if (i === 560) await L.ev(o, () => window.__dir.M.rb.debugRoomba(0.05));
          if (i === 560) await L.ev(o, () => { window.__ultra.G.ultra = 100; window.__ultra.doUltra(); });
        },
      });
    },
  },
  // ---- final frenzy in Nekotown: x2, faster paws, billions on the counter
  // (16:9 keeps only the combo burst: the x10 is the point; the boosted damage counter stays hidden)
  frenzy: play('nekotown', 'tabby', { frames: 330, warm: 30, seed: 20, patch: { time: 10.6, elapsed: 80, damage: 1650, combo: 40 }, bot: { target: 'tall', swat: 4, pounce: 26, ultra: 40 }, aspects: BOTH, setup: (o, L) => !portrait(o) && L.show(o, '#combo,#cbar') }),
  // ---- end-card background: slow orbit over a wrecked Meowhattan, no HUD
  end: {
    aspects: BOTH,
    seed: 21,
    async run(o, L) {
      await L.jump(o, 'meowhattan', 'tabby', { seed: 21 });
      await noWanted(o, L);
      await setBot(o, L, { target: 'tall', swat: 5, pounce: 30 });
      await L.sim(o, 400);
      await L.clean(o);
      await setBot(o, L, { target: 'tall', swat: 12 });
      await setCam(o, L, { kind: 'orbit', r: 230, y: 130, ly: 30, w: 0.12 });
      return L.record(o, 'end', 320);
    },
  },
  // ---- how-to-play basics (portrait with the touch controls; also usable in 16:9)
  'p-move': play('meowhattan', 'tabby', { frames: 140, warm: 10, seed: 22, bot: { target: 'tall', minH: 60, near: 40 }, aspects: BOTH }),
  'p-swat': play('meowhattan', 'tabby', { frames: 140, warm: 10, seed: 23, bot: { target: 'tall', swat: 14, near: 30 }, aspects: BOTH, fish: false }),
  'p-pounce': play('docks', 'tabby', { frames: 160, warm: 10, seed: 24, bot: { target: 'tall', pounce: 50, pounceOff: 10, near: 25, pounceAny: true }, aspects: BOTH }),
  'p-zoom': play('nekotown', 'tabby', { frames: 140, warm: 10, seed: 25, bot: { target: { x: 400, z: 300 }, zoom: true }, aspects: BOTH }),
  // ---- loop: the tabby wrecking Meowhattan with laser eyes, no HUD (1280x720 hub card)
  loop: {
    aspects: ['16x9'],
    seed: 26,
    async run(o, L) {
      await L.jump(o, 'meowhattan', 'tabby', { seed: 26 });
      await L.clean(o);
      await setBot(o, L, { target: 'tall', swat: 7, pounce: 45, ultra: 150 });
      await L.sim(o, 30);
      return L.record(o, 'loop', 600);
    },
  },
};
for (const [k, v] of Object.entries(SHOTS)) v.name = k;
