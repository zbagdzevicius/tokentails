// Meow Run trailer shots (STORYBOARD.md). Each shot: { aspects, seed, run(o, L) } -> the L.record(...) result.
// Page side: window.__meow (the game's test hook) and window.__dir (page.js: bot, cam, camTune, finger).
// Track positions (s, u) come from `node tools/trailer/scout.mjs <stage>`. Takes are longer than their cut; edl.mjs
// picks the window.

const W16 = ['16x9'];
const P9 = ['9x16'];
const BOTH = ['16x9', '9x16'];
const portrait = (o) => o.aspectId === '9x16';
const setBot = (o, L, bot) => L.ev(o, (b) => void (window.__dir.bot = b), bot);
const setCam = (o, L, cam) => L.ev(o, (c) => void ((window.__dir.cam = c), (window.__dir.camState = null)), cam);
const setTune = (o, L, t) => L.ev(o, (t) => void (window.__dir.camTune = t), t);
const finger = (o, L, on) => L.ev(o, (on) => void (window.__dir.finger.on = on), on);

/**
 * A gameplay take: start `stage` at `s`, the bot plays, an optional camera (object or fn(o) -> object), warm up for
 * `warm` frames, record `frames`. Portrait takes show the fingertip overlay unless finger: false.
 */
function take(stage, s0, { frames = 240, warm = 20, bot = {}, cam = null, tune = null, setup, perFrame, aspects = W16, seed = 1, show, css, clean = false, fingerOn = true } = {}) {
  return {
    aspects,
    seed,
    async run(o, L) {
      const s = process.env.TRAILER_S ? Number(process.env.TRAILER_S) : s0;
      await L.jump(o, stage, s, { seed });
      if (clean) await L.clean(o);
      if (show) await L.show(o, show);
      const cs = typeof css === 'function' ? css(o) : css;
      if (cs) await L.css(o, cs);
      await setBot(o, L, bot);
      const c = process.env.TRAILER_CAM ? JSON.parse(process.env.TRAILER_CAM) : typeof cam === 'function' ? cam(o) : cam;
      if (c) await setCam(o, L, c);
      const t = typeof tune === 'function' ? tune(o) : tune;
      if (t) await setTune(o, L, t);
      if (portrait(o) && fingerOn && !clean) await finger(o, L, true);
      if (setup) await setup(o, L);
      if (warm) await L.sim(o, warm);
      return L.record(o, this.name, frames, { perFrame: perFrame && ((i) => perFrame(o, L, i)) });
    },
  };
}

// ---- cameras (track space around Mochi; page.js applyCam). ds: along the track from Mochi, dx: to her right, dy: up
/** low chase camera, a little to the side, looking past her down the path */
const chase = (o, { ds = -4.6, dx = 0.9, dy = 1.5, la = 5, ly = 0.9, fov = 62, ease = 7 } = {}) => ({ kind: 'track', ds, dx, dy, la, ly, fov, ease, follow: 0.5, yFollow: 0.5 });
/** ahead of her, looking back: whatever chases her looms behind */
/** beside her, a little ahead, low: vaults and leaps read side-on (side -1 = her left) */
const side = (o, { ds = -1, side: sd = -1, dist = 4.2, dy = 1.1, ly = 1, la = 1.5, fov = 56, ease = 5 } = {}) => ({ kind: 'track', ds, dx: sd * dist, dy, la, ly, fov, ease, yFollow: 0.6 });
/** ahead of Mochi and the dog on the far side of the path, looking back at both (dogSide mirrors it to the dog) */
const dogCam = () => ({ kind: 'track', ds: 10, dx: -2.6, dy: 1.7, la: 2.5, ly: 1.6, lookX: 1.2, fov: 50, ease: 6, follow: 0.3, yFollow: 0.4, dogSide: true });
const NO_POPS = '#popups{visibility:hidden!important}';
const front = (o, { ds = 4.2, dx = -1.6, dy = 1.4, ly = 1.2, la = -4, fov = 68, ease = 6 } = {}) => ({ kind: 'track', ds, dx, dy, la, ly, fov, ease, follow: 0.6, yFollow: 0.4 });

export const SHOTS = {
  // ---- hook: the River Gorge side canyon, a low side camera on the far rim: tail plant, pole vault, bell, landing
  hook: take('gorge', 2140, {
    frames: 230,
    warm: 10,
    aspects: BOTH,
    cam: (o) => (portrait(o) ? { kind: 'track', ds: 4.5, dx: 2.8, dy: 1.3, ly: 1, la: 0, fov: 58, ease: 5, yFollow: 0.6 } : side(o)),
    // the portrait cut slams the title over this shot: no score pops drifting over the logo
    css: (o) => (portrait(o) ? NO_POPS : ''),
  }),
  // ---- title: the dog bursts out of the bushes beside her; a 3/4 front camera ahead of both, on the far side of the
  // path, so the dog's face (eyes, tongue, collar) and Mochi read together, with clear sky top right for the logo
  title: take('gorge', 1452, { frames: 300, warm: 10, css: NO_POPS, cam: (o) => dogCam(o) }),
  // ---- Sunny Meadow: speed, the winding path, a fish wave and the first logs
  'm-run': take('meadow', 150, { frames: 260, warm: 10, cam: (o) => chase(o) }),
  'm-slide': take('meadow', 352, { frames: 220, warm: 10, cam: (o) => chase(o, { ds: -4, dx: 2.2, dy: 0.9, la: 4, ly: 0.6 }) }),
  'm-vault': take('meadow', 1012, { frames: 320, warm: 10, cam: (o) => side(o, { side: 1, dist: 4.6 }) }),
  'm-pounce': take('meadow', 1362, { frames: 170, warm: 10, cam: (o) => side(o, { dist: 4.6 }) }),
  // ---- River Gorge
  'g-wall': take('gorge', 362, { frames: 420, warm: 10, tune: { back: 5.6, height: 2.4 } }),
  // tight behind her on the banked wall (Mochi about a third of the frame height), only a little roll
  'g-wall2': take('gorge', 1946, { frames: 300, warm: 10, cam: (o) => ({ kind: 'track', ds: -3.2, dx: -1.3, dy: 1.1, la: 4, ly: 0.8, fov: 54, ease: 7, follow: 0.6, yFollow: 0.7, roll: 0.15 }) }),
  'g-river': take('gorge', 930, { frames: 330, warm: 10, cam: (o) => chase(o, { ds: -5.5, dx: 1.2, dy: 2.1, la: 6 }) }),
  // side tracking shot from the far side of the path: the whole dog in profile (face, open mouth) bounding and
  // snapping beside her; dogSide follows the dog when it hops sides
  'g-dog': take('gorge', 1560, { frames: 420, warm: 10, cam: (o) => ({ kind: 'track', ds: 4.5, dx: -6.5, dy: 1.7, la: 3, ly: 1.3, lookX: 0.5, fov: 52, ease: 5, follow: 0.3, yFollow: 0.4, dogSide: true }) }),
  'g-gap': take('gorge', 2522, { frames: 150, warm: 10, cam: (o) => side(o, { side: 1, ds: 1.5, dist: 4 }) }),
  // ---- Sunset Hills
  's-puff': take('sunset', 362, { frames: 220, warm: 10, cam: (o) => chase(o, { ds: -5, dx: 2.5, dy: 2, la: 6 }) }),
  's-cloud': take('sunset', 596, { frames: 330, warm: 10, cam: (o) => ({ kind: 'track', ds: -5.5, dx: 1.6, dy: 1.9, la: 6, ly: 0.9, fov: 62, ease: 6, follow: 0.6, yFollow: 0.9 }) }),
  's-bamboo': take('sunset', 900, { frames: 260, warm: 10, cam: (o) => chase(o, { ds: -3.8, dx: -1.2, dy: 0.95, la: 4, ly: 0.8 }) }),
  's-combo': take('sunset', 2744, { frames: 260, warm: 10, show: '#score,#mult', cam: (o) => chase(o, { ds: -5, dx: 0.4, dy: 1.8 }) }),
  's-yarn': take('sunset', 1384, { frames: 460, warm: 10, cam: (o) => front(o, { ds: 4.4, dx: -1.2, dy: 1.5 }) }),
  's-wall': take('sunset', 1890, { frames: 220, warm: 10, cam: (o) => ({ ...chase(o, { ds: -4.5, dx: 2.2, dy: 1.6, la: 5 }), roll: 0.4 }) }),
  // Endless: the distance counter (shown, enlarged) climbing through a giant yarn ball chunk ("CLOSE ONE!"), chase camera
  endless: take('endless', 5000, { frames: 260, warm: 30, show: '#distPill', cam: (o) => chase(o, { ds: -5, dx: 0.8, dy: 1.7 }), css: '#distPill{transform:translateX(-50%) scale(2.2)!important;transform-origin:50% 0}' }),
  // ---- the cottage: the last stretch of Sunset Hills into the ending cutscene ("Home for dinner!")
  cottage: {
    aspects: BOTH,
    seed: 5,
    async run(o, L) {
      await L.jump(o, 'sunset', 3070);
      await L.clean(o);
      // all 7 bells on the door: "Home for dinner!" (no "find the bells" line)
      await L.ev(o, () => window.__meow.G.bells.fill(true));
      await setBot(o, L, {});
      // run to the line, then hand over to the game: the cutscene starts after the run-out
      for (let i = 0; i < 1200; i += 20) {
        const m = await L.ev(o, () => ({ m: window.__meow.mode, cut: document.body.dataset.screen }));
        if (m.cut === 'cutscene' || m.m === 'over') break;
        await L.sim(o, 20);
      }
      return L.record(o, 'cottage', 780);
    },
  },
  // ---- end-card background: a clean sunset run, slow side orbit
  end: take('sunset', 2420, { frames: 360, warm: 10, clean: true, aspects: BOTH, cam: { kind: 'orbit', r: 7, y: 2.2, a0: 1.2, w: 0.25, ly: 1, fov: 55, ease: 0 } }),
  // ---- loop: a clean meadow run into the tail vault (1280x720 hub card)
  loop: take('meadow', 960, { frames: 620, warm: 10, clean: true, cam: (o) => chase(o, { ds: -5, dx: 1, dy: 1.7 }) }),

  // ---- how to play (portrait, the game camera and the touch HUD, the fingertip overlay)
  'p-steer': take('meadow', 150, { frames: 200, warm: 10, aspects: P9 }),
  'p-jump': take('meadow', 176, { frames: 200, warm: 10, aspects: P9 }),
  'p-slide': take('meadow', 340, { frames: 200, warm: 10, aspects: P9 }),
  'p-pounce': take('meadow', 1352, { frames: 170, warm: 10, aspects: P9 }),
  'p-vault': take('meadow', 1000, { frames: 320, warm: 10, aspects: P9 }),
  'p-wall': take('gorge', 362, { frames: 260, warm: 10, aspects: P9 }),
  'p-river': take('gorge', 960, { frames: 220, warm: 10, aspects: P9 }),
  'p-cloud': take('sunset', 352, { frames: 240, warm: 10, aspects: P9 }),
  'p-bells': take('meadow', 520, { frames: 180, warm: 10, aspects: P9 }),
  'p-fish': take('sunset', 2744, { frames: 220, warm: 10, aspects: P9 }),
  // the portrait dog bounds 8.5 u ahead of her (chase.ts dogLead): a camera far ahead of both, looking back, so the
  // dog's face (eyes, tongue, collar) fills the top and Mochi runs behind it; dogSide follows its side hops
  'p-dog': take('gorge', 1460, { frames: 300, warm: 10, aspects: P9, fingerOn: false, css: NO_POPS, cam: () => ({ kind: 'track', ds: 21, dx: -2.2, dy: 2.6, la: 6, ly: 1.6, lookX: 2.4, fov: 44, ease: 6, follow: 0.3, yFollow: 0.4, dogSide: true }) }),
  'p-yarn': take('sunset', 1384, { frames: 300, warm: 10, aspects: P9 }),
};
for (const [k, v] of Object.entries(SHOTS)) v.name = k;
