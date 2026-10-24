// node tools/trailer/capture.mjs --shots-file tools/trailer/v3/hub-shots.mjs --aspect 16x9 --only L1 --out <dir>/l
// node tools/trailer/capture.mjs --shots-file tools/trailer/v3/hub-shots.mjs --aspect 9x16 --only L1,M1,M3 --out <dir>/p
// Encodes: docs/CLIENT.md, Pawlegends, the home page games hub.
// Home hub clips (loop 16:9, mode 9:16): pure gameplay, no screen layers (no HUD, plates, pops, banners).
// Same render settings as v3/shots.mjs V3, layers [] and no world tags.
const V3 = {
  gameLook: true, xray: false, banners: true, ghosts: true, bolts: true, shockI: 1, realFlash: true, flashMax: 0.16,
  size: [1280, 720], dpr: 1.5, layers: [], popText: [], selfName: false, twinNames: true, edgeArrows: false,
  bannerOn: [], tags: false, minionBars: false, lead: 10,
};
const P = { width: 540, height: 960, dpr: 2 };
const NONE = { layers: [] };
const game = (keys, target = null) => ({ base: 'game', target, keys });
const portrait = (target, keys, o = {}) => ({
  ...P,
  cam: { target, keys: keys.map((k) => ({ fov: 50, pitch: 48.8, yaw: 0, lift: 0, ...k, dist: Math.round(1200 * (k.dist ?? 1) * (o.wide ?? 1)) / 1000 })), smooth: 0.12, off: o.off ?? [0, -2.2] },
  ...NONE,
});
const DOG_CORE = [90000, 30000];
export const SHOTS = [
  // LOOP (16:9): take V13, the game camera on Sage; Clem hits the dog tower and it topples, the fight goes on.
  {
    id: 'L1', ...V3, take: 'V13', f0: 725, f1: 1250,
    anchor: { key: 'tower', offset: -18, frame: 799 },
    ramp: [[725, 1]],
    cam: game([{ f: 725, dist: 1 }, { f: 1250, dist: 1 }]),
    portrait: portrait({ mid: [0, 1] }, [{ f: 725, dist: 1.1 }, { f: 1250, dist: 1.1 }], { off: [2, -2.5] }),
  },
  // MODE (9:16) 1: take W9, all six heroes meet on the bridge (Bengas the player).
  {
    id: 'M1', ...V3, take: 'W9', f0: 0, f1: 419,
    anchor: { key: 'six', frame: 120 },
    ramp: [[0, 1]],
    cam: game([{ f: 0, dist: 1 }, { f: 419, dist: 1 }]),
    portrait: portrait({ mid: [0, 1, 2, 3, 4, 5] }, [{ f: 0, dist: 1.05 }, { f: 419, dist: 1.05 }], { off: [0, -2.2] }),
  },
  // MODE 3: take V12, the cats push the dog base and the doghouse falls (Bengas the player).
  {
    id: 'M3', ...V3, take: 'V12', f0: 560, f1: 1139, shockI: 0.45,
    anchor: { key: 'core', frame: 1067 },
    ramp: [[560, 1]],
    cam: game([{ f: 560, dist: 1 }, { f: 1139, dist: 1 }]),
    portrait: portrait({ blend: [{ mid: [0, 1, 2] }, { point: DOG_CORE }], f0: 950, f1: 1060 }, [{ f: 560, dist: 1.0 }, { f: 1139, dist: 1.0 }], { off: [-2, -5] }),
  },
];
export function portraitKeys(shot) {
  return shot.portrait?.cam?.keys ?? shot.cam?.keys ?? [];
}
