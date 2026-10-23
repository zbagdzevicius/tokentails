/**
 * Trailer v3 ("Settle It on the Crossing") shot list: 30 s at 60 fps, 144 BPM (25 frames per beat). Every gameplay
 * shot is the game's own camera: either the real follow camera with the director's deltas on top (`cam.base: 'game'`,
 * harness.ts placeGameRel) or, when the subject is not the take's human, the same numbers as a director preset
 * (GAMECAM: 23.76 m, pitch 48.8, FOV 38, yaw 0, the ground 4 m ahead of the hero toward the enemy core). The moves on
 * top are push-ins, one crane (S01), small orbits on the tower and core falls, speed ramps; each settles back on the
 * gameplay view by the cut. `gameLook`: no render clean-up hack at all (no culled trees, banners, towers or bolts).
 *
 *   node tools/trailer/capture.mjs --shots-file tools/trailer/v3/shots.mjs --out <dir>/shots
 *
 * Landscape is captured at 1280x720 CSS px, DPR 1.5 (1920x1080 pixels): a laptop window, so the HUD, name plates and
 * pops are as big as a player sees them. Portrait (1080x1920, DPR 1) is GAMECAM-P: the same pitch, FOV 50 (the iso
 * rig's portrait FOV), 1.2x the distance, the look point centred on the subject (the game is not played in portrait).
 */

/** v3 render settings: the frame as the game draws it (storyboard §3). */
const V3 = {
  gameLook: true,
  xray: false,
  banners: true,
  ghosts: true,
  bolts: true,
  shockI: 1,
  realFlash: true,
  flashMax: 0.16,
  size: [1280, 720],
  dpr: 1.5,
  layers: ['pops', 'banner', 'plates'],
  // v3.1: the game's own words only where they tell the beat (the player's combo and XP pops piled up at the frame
  // edges and over the type): the takedown callout (CLANK! only where it is the beat: two at once drew over each other)
  popText: ['Takedown!'],
};

/** The game's camera with deltas (dist multiple, pitch / yaw degrees added, blend toward `target`). */
const game = (keys, target = null) => ({ base: 'game', target, keys });

/** GAMECAM as a director preset on `target`, with the game's 4 m lead toward the dog core and 0.8 m south. */
const preset = (target, keys, off = [4, 0.8]) => ({ target, keys: keys.map((k) => ({ fov: 38, pitch: 48.8, yaw: 0, lift: 0, ...k })), smooth: 0.12, off });

/** GAMECAM-P (9:16): pitch 48.8, FOV 50, 1.2x the distance, no lead. `d` maps a landscape push (0.82 -> 1.14). */
const pd = (d) => Math.round(1200 * (d >= 1 ? d : 1 - (1 - d) * 0.35)) / 1000;
const portrait = (target, keys, o = {}) => ({
  cam: { target, keys: keys.map((k) => ({ fov: 50, pitch: 48.8, yaw: 0, lift: 0, ...k, ...(k.dist !== undefined && !k.abs ? { dist: pd(k.dist) * (o.wide ?? 1) } : {}) })), smooth: 0.12, off: o.off ?? [0, 0] },
});
/** Landscape game-relative keys as portrait preset keys on the hero (pitch / yaw deltas made absolute). */
const asPortrait = (keys, target = { unit: '@hero' }, o = {}) => portrait(target, keys.map((k) => ({ ...k, ...(k.pitch !== undefined ? { pitch: 48.8 + k.pitch } : {}) })), o);

export const SHOTS = [
  // ---------------------------------------------------------------- S01 HOOK + PREMISE (take N, seed 645)
  {
    id: 'S01', ...V3, take: 'N', f0: 0, f1: 149,
    // tick 639 (the flop lands on Cacklejaw and Sir Brutus) on f25
    anchor: { key: 'core', offset: 639 - 11086, frame: 25 },
    // the plates fade as the camera cranes up (no cloud of tiny labels) and come back as it lands on the hero again
    uiFade: [[38, 1], [52, 0], [128, 0], [146, 1]],
    ramp: [[0, 1], [24, 1], [25, 0.35], [31, 0.35], [44, 1, 'out']],
    // v3.1: a short wide hold (both bases), then the crane comes back down to the gameplay camera before the cut
    cam: game([
      { f: 0, dist: 0.86, pitch: 0, blend: 0 },
      { f: 20, dist: 0.86 },
      { f: 25, dist: 0.8, ease: 'out' },
      { f: 36, dist: 0.8, pitch: 0, blend: 0 },
      { f: 82, dist: 3.75, pitch: 11.2, blend: 1, ease: 'ease' },
      { f: 122, dist: 3.64, pitch: 11.2, blend: 1, ease: 'linear' },
      { f: 149, dist: 1, pitch: 0, blend: 0, ease: 'ease' },
    ], { point: [50000, 30000] }),
    portrait: {
      cam: {
        // 9:16: the game's yaw 0 (cats left, dogs right), a pure distance and pitch crane over the river crossing
        target: { blend: [{ unit: 0 }, { point: [50000, 30000] }], f0: 36, f1: 82 },
        keys: [
          { f: 0, dist: 1.1, pitch: 48.8, fov: 50, yaw: 0, lift: 0 },
          { f: 20, dist: 1.1 },
          { f: 25, dist: 1.04, ease: 'out' },
          { f: 36, dist: 1.04, pitch: 48.8, yaw: 0 },
          { f: 82, dist: 2.9, pitch: 62, yaw: 0, ease: 'ease' },
          { f: 122, dist: 2.84, pitch: 62, yaw: 0, ease: 'linear' },
          { f: 149, dist: 1.2, pitch: 48.8, yaw: 0, ease: 'ease' },
        ],
        smooth: 0.12,
        off: [0, 0],
      },
    },
  },
  // ---------------------------------------------------------------- S02 3V3: all six heroes in one gameplay frame (take Z9)
  {
    // all six alive in one gameplay frame at the river (take Z9, Sage's match); v3.1: no HUD (its top bar shows the
    // player's two allies, so it read as 2v3), the six name plates are the proof
    id: 'S02', ...V3, take: 'Z9', f0: 150, f1: 249,
    anchor: { key: 'brutusW', frame: 166 },
    bannerOn: [],
    cam: game([{ f: 150, dist: 1.04 }, { f: 249, dist: 0.97, ease: 'ease' }]),
    portrait: asPortrait([{ f: 150, dist: 1.1 }, { f: 249, dist: 1.04, ease: 'ease' }], { mid: [0, 4] }, { wide: 1.2 }),
  },
  // ---------------------------------------------------------------- S03 RIVALRY 1: Clem vs Sir Brutus, CLANK (take A)
  {
    id: 'S03', ...V3, take: 'A', f0: 250, f1: 299,
    anchor: { key: 'clank', frame: 262 },
    bannerOn: [],
    popText: ['CLANK!', 'Takedown!'],
    ramp: [[250, 1], [262, 0.4], [268, 0.4], [276, 1]],
    cam: game([{ f: 250, dist: 1 }, { f: 262, dist: 0.82, ease: 'in' }, { f: 270, dist: 0.82 }, { f: 299, dist: 1, ease: 'out' }]),
    portrait: asPortrait([{ f: 250, dist: 1 }, { f: 262, dist: 0.82, ease: 'in' }, { f: 270, dist: 0.82 }, { f: 299, dist: 1, ease: 'out' }]),
  },
  // ---------------------------------------------------------------- S04 RIVALRY 2: the dogs answer, Pack Hunt (take Z1)
  {
    id: 'S04', ...V3, take: 'Z1', f0: 300, f1: 349,
    anchor: { key: 'cackR', frame: 312 },
    bannerOn: [],
    ramp: [[300, 1], [312, 0.5], [322, 1]],
    cam: preset({ unit: '@cack' }, [
      { f: 300, dist: 1, yaw: 0 },
      { f: 312, dist: 0.88, yaw: 0, ease: 'in' },
      { f: 330, dist: 0.88, yaw: -6, ease: 'ease' },
      { f: 349, dist: 1, yaw: 0, ease: 'ease' },
    ], [0, 0.8]),
    portrait: portrait({ unit: '@cack' }, [{ f: 300, dist: 1 }, { f: 312, dist: 0.88, ease: 'in' }, { f: 349, dist: 1, ease: 'ease' }]),
  },
  // ---------------------------------------------------------------- S05 RIVALRY 3: Sage's Moonshot (take Z3, top bridge)
  {
    id: 'S05', ...V3, take: 'Z3', f0: 350, f1: 399,
    anchor: { key: 'sageR', frame: 362 },
    bannerOn: [],
    cam: game([{ f: 350, dist: 1 }, { f: 372, dist: 0.9, ease: 'ease' }, { f: 399, dist: 1, ease: 'ease' }]),
    portrait: asPortrait([{ f: 350, dist: 1 }, { f: 372, dist: 0.9, ease: 'ease' }, { f: 399, dist: 1, ease: 'ease' }]),
  },
  // ---------------------------------------------------------------- S06 RIVALRY 4: Sir Brutus's Champion's Challenge (take Z4)
  {
    id: 'S06', ...V3, take: 'Z4', f0: 400, f1: 449,
    anchor: { key: 'brutusR', frame: 412 },
    bannerOn: [],
    ramp: [[400, 1], [412, 0.5], [422, 1]],
    cam: preset({ unit: '@brutus' }, [{ f: 400, dist: 1 }, { f: 412, dist: 0.86, ease: 'in' }, { f: 449, dist: 1, ease: 'out' }], [0, 0.8]),
    portrait: portrait({ unit: '@brutus' }, [{ f: 400, dist: 1 }, { f: 412, dist: 0.86, ease: 'in' }, { f: 449, dist: 1, ease: 'out' }]),
  },
  // ---------------------------------------------------------------- S07-S10 THE FOUR CHAMPIONS (each one's ultimate)
  {
    // her ultimate's rings at 0.6 (at full strength they put 6 % of the frame at white for the whole shot)
    id: 'S07', ...V3, take: 'Z5', f0: 450, f1: 499, shockI: 0.6,
    anchor: { key: 'avieteR', frame: 460 },
    bannerOn: [],
    cam: preset({ unit: '@aviete' }, [{ f: 450, dist: 0.95 }, { f: 499, dist: 0.86, ease: 'ease' }], [0, -3.4]),
    portrait: portrait({ unit: '@aviete' }, [{ f: 450, dist: 0.95 }, { f: 499, dist: 0.86, ease: 'ease' }]),
  },
  {
    id: 'S08', ...V3, take: 'Z6', f0: 500, f1: 549,
    anchor: { key: 'bengasR', frame: 510 },
    bannerOn: [],
    cam: preset({ unit: '@bengas' }, [{ f: 500, dist: 0.95 }, { f: 512, dist: 0.86, ease: 'out' }, { f: 549, dist: 0.95, ease: 'ease' }], [0, 0.6]),
    portrait: portrait({ unit: '@bengas' }, [{ f: 500, dist: 0.95 }, { f: 512, dist: 0.86, ease: 'out' }, { f: 549, dist: 0.95, ease: 'ease' }], { wide: 1.25, off: [1.5, 0] }),
  },
  {
    id: 'S09', ...V3, take: 'Z7', f0: 550, f1: 599,
    anchor: { key: 'gabeR', frame: 560 },
    bannerOn: [],
    cam: preset({ unit: '@gabe' }, [{ f: 550, dist: 0.95 }, { f: 599, dist: 0.86, ease: 'ease' }], [0, 0.6]),
    portrait: portrait({ unit: '@gabe' }, [{ f: 550, dist: 0.95 }, { f: 599, dist: 0.86, ease: 'ease' }], { wide: 1.25, off: [1.5, 0] }),
  },
  {
    id: 'S10', ...V3, take: 'Z8', f0: 600, f1: 649,
    anchor: { key: 'lamboR', frame: 610 },
    bannerOn: [],
    ramp: [[600, 1], [610, 0.6], [622, 1]],
    cam: preset({ unit: '@lambo' }, [{ f: 600, dist: 0.95 }, { f: 612, dist: 0.86, ease: 'in' }, { f: 649, dist: 0.95, ease: 'out' }], [0, 0.6]),
    portrait: portrait({ unit: '@lambo' }, [{ f: 600, dist: 0.95 }, { f: 612, dist: 0.86, ease: 'in' }, { f: 649, dist: 0.95, ease: 'out' }]),
  },
  // ---------------------------------------------------------------- S11 THE MISSION 1: push your lane (take N, 4 s after S01)
  {
    id: 'S11', ...V3, take: 'N', f0: 650, f1: 699,
    anchor: { key: 'core', offset: 720 - 11086, frame: 650 },
    bannerOn: [],
    cam: preset({ point: [50000, 8000] }, [{ f: 650, dist: 1.05 }, { f: 699, dist: 0.97, ease: 'linear' }], [0, 0]),
    portrait: portrait({ point: [50000, 8000] }, [{ f: 650, dist: 1.05 }, { f: 699, dist: 0.97, ease: 'linear' }]),
  },
  // ---------------------------------------------------------------- S12 THE MISSION 2: calm Pudding (take K)
  {
    // framed on Pudding and the calming cat (a mid point), the river hit and the calm both on screen; the game's
    // banner is left to the trailer type (CALM PUDDING.), never both
    id: 'S12', ...V3, take: 'K', f0: 700, f1: 749,
    anchor: { key: 'calm', frame: 712 },
    bannerOn: [],
    cam: preset({ mid: [0, '@pudding'] }, [{ f: 700, dist: 0.95 }, { f: 749, dist: 0.88, ease: 'ease' }], [0, 0.4]),
    portrait: portrait({ mid: [0, '@pudding'] }, [{ f: 700, dist: 0.95 }, { f: 749, dist: 0.88, ease: 'ease' }]),
  },
  // ---------------------------------------------------------------- S13 TOWER DIVE AND FALL (take T)
  {
    // v3.1: the tower event (crack and the banner) on f790 at full speed, so the topple and the ground hit (f830)
    // play inside the shot; a small push and orbit on the fall, back to the gameplay view by the cut
    id: 'S13', ...V3, take: 'T', f0: 750, f1: 849,
    anchor: { key: 'tower', frame: 790 },
    bannerOn: [[790, 849]],
    cam: preset({ point: '@tower' }, [
      { f: 750, dist: 1, pitch: 48.8, yaw: 0 },
      { f: 790, dist: 1, pitch: 48.8, yaw: 0 },
      { f: 818, dist: 0.9, pitch: 52, yaw: 6, ease: 'ease' },
      { f: 849, dist: 1, pitch: 48.8, yaw: 0, ease: 'ease' },
    ], [0, 0]),
    portrait: portrait({ point: '@tower' }, [
      { f: 750, dist: 1, pitch: 48.8, yaw: 0 },
      { f: 790, dist: 1, pitch: 48.8, yaw: 0 },
      { f: 818, dist: 0.9, pitch: 52, yaw: 6, ease: 'ease' },
      { f: 849, dist: 1, pitch: 48.8, yaw: 0, ease: 'ease' },
    ], { off: [0, -4] }),
  },
  // ---------------------------------------------------------------- S14 TEAMFIGHT, two beats (takes Y1, Z10)
  {
    // a river brawl from the gameplay camera: Clem's E, Bengas's Q, Cacklejaw's answer, Sir Brutus's ultimate
    id: 'S14', ...V3, take: 'Y1', f0: 850, f1: 974,
    anchor: { key: 'clemE', frame: 866 },
    bannerOn: [],
    cam: game([{ f: 850, dist: 1.02 }, { f: 866, dist: 0.92, ease: 'out' }, { f: 930, dist: 0.97, ease: 'ease' }, { f: 974, dist: 1, ease: 'ease' }]),
    portrait: asPortrait([{ f: 850, dist: 1.02 }, { f: 866, dist: 0.92, ease: 'out' }, { f: 930, dist: 0.97, ease: 'ease' }, { f: 974, dist: 1, ease: 'ease' }], { unit: '@hero' }, { wide: 1.1 }),
  },
  {
    // all six at the dog-side river bank: Clem's E into Gabė's ultimate (take Z10), the gameplay camera on Clem
    id: 'S14b', ...V3, take: 'Z10', f0: 975, f1: 1099,
    anchor: { key: 'clemE', frame: 992 },
    bannerOn: [],
    // GAMECAM framing between Clem and the brawl just north of her (the game's lead put the fight at the top-left edge)
    cam: preset({ unit: 0 }, [{ f: 975, dist: 1.02 }, { f: 992, dist: 0.9, ease: 'out' }, { f: 1040, dist: 0.97, ease: 'ease' }, { f: 1099, dist: 1, ease: 'ease' }], [0, -2.6]),
    portrait: asPortrait([{ f: 975, dist: 1.02 }, { f: 992, dist: 0.9, ease: 'out' }, { f: 1040, dist: 0.97, ease: 'ease' }, { f: 1099, dist: 1, ease: 'ease' }], { unit: '@hero' }, { wide: 1.1, off: [0, -2.6] }),
  },
  // ---------------------------------------------------------------- S15 DIVE THE DOG BASE (take X4)
  {
    id: 'S15', ...V3, take: 'X4', f0: 1100, f1: 1249,
    anchor: { key: 'land', frame: 1133 },
    bannerOn: [],
    // TAKE THEIR CORE. carries the beat: no game callout next to it
    popText: [],
    ramp: [[1100, 1], [1132, 1], [1133, 0.4], [1141, 1]],
    fits: [{ key: 'ko2', frame: 1229, seg: [1142, 1228] }],
    cam: game([{ f: 1100, dist: 1 }, { f: 1110, dist: 1 }, { f: 1133, dist: 0.85, ease: 'in' }, { f: 1150, dist: 0.85 }, { f: 1249, dist: 1, ease: 'ease' }]),
    portrait: asPortrait([{ f: 1100, dist: 1 }, { f: 1110, dist: 1 }, { f: 1133, dist: 0.85, ease: 'in' }, { f: 1150, dist: 0.85 }, { f: 1249, dist: 1, ease: 'ease' }]),
  },
  // ---------------------------------------------------------------- S16 THE CORE FALLS (take N: the match that opened)
  {
    // v3.1: the gameplay camera on the player (Lambo) with the core beside him; the burst on f1300, then slow motion
    // that keeps the render inside the match (the sim ends on the killing tick), a small push and orbit that eases
    // back to the gameplay view by f1400. The game's world "Victory!" pop is left to the trailer type (VICTORY!).
    id: 'S16', ...V3, take: 'N', f0: 1250, f1: 1449,
    shockI: 0.3,
    popText: [],
    bannerOn: [],
    // the killing blow on f1284 at full speed, so the render burst (65 ms of the fall, under the game's own 0.25
    // slow motion) lands on f1300 with the score's hit; then the slow motion
    anchor: { key: 'core', frame: 1284 },
    ramp: [[1250, 0.76], [1283, 0.76], [1284, 1], [1300, 1], [1301, 0.35], [1340, 0.35], [1370, 0.5]],
    cam: preset({ unit: 0 }, [
      { f: 1250, dist: 1, yaw: 0, pitch: 48.8 },
      { f: 1280, dist: 1 },
      { f: 1300, dist: 0.84, yaw: 0, pitch: 48.8, ease: 'in' },
      { f: 1330, dist: 0.84, yaw: -6, pitch: 52, ease: 'ease' },
      { f: 1400, dist: 1, yaw: 0, pitch: 48.8, ease: 'ease' },
    ], [0.5, -1.2]),
    portrait: portrait({ unit: 0 }, [
      { f: 1250, dist: 1, yaw: 0, pitch: 48.8 },
      { f: 1280, dist: 1 },
      { f: 1300, dist: 0.84, yaw: 0, pitch: 48.8, ease: 'in' },
      { f: 1330, dist: 0.84, yaw: -6, pitch: 52, ease: 'ease' },
      { f: 1400, dist: 1, yaw: 0, pitch: 48.8, ease: 'ease' },
    ]),
  },
  // ---------------------------------------------------------------- S17 + S18 LINE-UP, CALL, END CARD (lobby, static)
  {
    // v3.1: three cat champions against the two dog heroes, one row, the dogs a little larger so each side fills its
    // half; stands 3 m apart (no blade or ear crosses a neighbour), all on the game's own lobby stage
    id: 'S17', f0: 1450, f1: 1799, size: [1280, 720], dpr: 1.5,
    lobby: {
      ped: { scale: 0.6, trim: ['#ff6f91', '#3e6ad8'] },
      stands: [
        { hero: 'lambo', x: -8.4, z: 0.6, face: 20 },
        { hero: 'aviete', x: -5.2, z: 0.6, face: 20 },
        { hero: 'gabe', x: -2.0, z: 0.6, face: 20 },
        { hero: 'brutus', team: 1, x: 3.4, z: 0.6, face: -20, scale: 1.15 },
        { hero: 'cacklejaw', team: 1, x: 7.2, z: 0.6, face: -20, scale: 1.15 },
      ],
    },
    cam: { target: { p3: [-0.6, 1.3, 0.6] }, keys: [{ f: 1450, dist: 0.74, pitch: 7, yaw: 0, fov: 38 }, { f: 1799, dist: 0.72, ease: 'linear' }] },
    portrait: {
      stands: [
        { hero: 'lambo', x: -2.7, z: -8.2, face: 14 },
        { hero: 'aviete', x: 0, z: -8.2, face: 0 },
        { hero: 'gabe', x: 2.7, z: -8.2, face: -14 },
        { hero: 'brutus', team: 1, x: -1.9, z: 3.6, face: 10 },
        { hero: 'cacklejaw', team: 1, x: 1.9, z: 3.6, face: -10 },
      ],
      cam: { target: { p3: [0, 0.6, -1.9] }, keys: [{ f: 1450, dist: 1.12, pitch: 30, yaw: 0, fov: 32 }, { f: 1799, dist: 1.09, ease: 'linear' }] },
    },
  },
];

/** Every portrait camera is a full `portrait.cam` (capture.mjs specFor); kept for the --shots-file contract. */
export function portraitKeys(shot) {
  return shot.portrait?.cam?.keys ?? shot.cam?.keys ?? [];
}
