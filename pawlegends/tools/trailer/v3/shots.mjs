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
  // v3.2: the plates name every hero (the player's own too: the champion's name, not "You"), no off-screen enemy
  // discs at the frame edge (no HUD frames them), stray numbers culled (harness popCull, on with gameLook)
  selfName: true,
  edgeArrows: false,
  bannerOn: [],
};
/** v3.2 portrait capture: 540 x 960 CSS px at DPR 2 (1080 x 1920): the game's plates and banner at phone size. */
const P = { width: 540, height: 960, dpr: 2 };

/** The game's camera with deltas (dist multiple, pitch / yaw degrees added, blend toward `target`). */
const game = (keys, target = null) => ({ base: 'game', target, keys });

/** GAMECAM as a director preset on `target`, with the game's 4 m lead toward the dog core and 0.8 m south. */
const preset = (target, keys, off = [4, 0.8]) => ({ target, keys: keys.map((k) => ({ fov: 38, pitch: 48.8, yaw: 0, lift: 0, ...k })), smooth: 0.12, off });

/** GAMECAM-P (9:16): pitch 48.8, FOV 50, 1.2x the distance, no lead. `d` maps a landscape push (0.82 -> 1.14). */
const pd = (d) => Math.round(1200 * (d >= 1 ? d : 1 - (1 - d) * 0.35)) / 1000;
const portrait = (target, keys, o = {}) => ({
  ...P,
  cam: { target, keys: keys.map((k) => ({ fov: 50, pitch: 48.8, yaw: 0, lift: 0, ...k, ...(k.dist !== undefined && !k.abs ? { dist: pd(k.dist) * (o.wide ?? 1) } : {}) })), smooth: 0.12, off: o.off ?? [0, 0] },
});
/** Landscape game-relative keys as portrait preset keys on the hero (pitch / yaw deltas made absolute). */
const asPortrait = (keys, target = { unit: '@hero' }, o = {}) => portrait(target, keys.map((k) => ({ ...k, ...(k.pitch !== undefined ? { pitch: 48.8 + k.pitch } : {}) })), o);

export const SHOTS = [
  // ---------------------------------------------------------------- S01 HOOK + PREMISE (take V1: Clem's Golden Hour takes Sir Brutus)
  {
    // v3.2: the gameplay camera on Clem; Golden Hour, two swipes and the takedown on f25 (a 3-frame 0.35 hold), then
    // the crane up to the whole Crossing (the plates fade out as it leaves the gameplay height and stay off) and a
    // hold on the wide map to the hard cut on f150 (no descent back onto a pile)
    id: 'S01', ...V3, take: 'V1', f0: 0, f1: 149, lead: 8,
    anchor: { key: 'ko', frame: 25 },
    uiFade: [[29, 1], [38, 0]],
    ramp: [[0, 1], [24, 1], [25, 0.35], [28, 0.35], [34, 1, 'out']],
    cam: game([
      { f: 0, dist: 0.9, pitch: 0, blend: 0 },
      { f: 25, dist: 0.84, ease: 'out' },
      { f: 28, dist: 0.84, pitch: 0, blend: 0 },
      { f: 70, dist: 3.75, pitch: 11.2, blend: 1, ease: 'ease' },
      { f: 149, dist: 3.66, pitch: 11.2, blend: 1, ease: 'linear' },
    ], { point: [50000, 30000] }),
    portrait: {
      ...P,
      // the crane is keyed whole (no pull-back on the hook)
      autoFit: null,
      cam: {
        target: { blend: [{ unit: 0 }, { point: [50000, 30000] }], f0: 28, f1: 70 },
        keys: [
          { f: 0, dist: 1.12, pitch: 48.8, fov: 50, yaw: 0, lift: 0 },
          { f: 25, dist: 1.06, ease: 'out' },
          { f: 28, dist: 1.06, pitch: 48.8, yaw: 0 },
          { f: 70, dist: 2.9, pitch: 62, yaw: 0, ease: 'ease' },
          { f: 149, dist: 2.84, pitch: 62, yaw: 0, ease: 'linear' },
        ],
        smooth: 0.12,
        off: [0, 0],
      },
    },
  },
  // ---------------------------------------------------------------- S02 3V3: the real HUD on the gameplay camera (take V10)
  {
    // v3.2: the game exactly as the player sees it (every HUD layer, the real camera): the top bar's portraits, the
    // ability bar, the minimap and all six heroes with their plates (the dogs field two Sir Brutus: three dog slots,
    // two dog heroes). 9:16 shows the landscape frame as a band (the game is played in landscape)
    id: 'S02', ...V3, take: 'V10', f0: 150, f1: 249, cam: null, layers: ['hud'], selfName: false, edgeArrows: true,
    aspects: ['16x9'],
    // 0.86 speed: the clean stretch (all six on screen, no plate at the frame edge) is 88 frames long
    anchor: { key: 'six', offset: 6.5, frame: 150 },
    ramp: [[150, 0.86]],
  },
  // ---------------------------------------------------------------- S03-S06 THE RIVALRY (cats against dogs, one move each)
  {
    // Clem's Tumble at Sir Brutus by the dog tower (take V2)
    id: 'S03', ...V3, take: 'V2', f0: 250, f1: 299,
    anchor: { key: 'e', frame: 274 },
    cam: preset({ mid: ['@clem', '@brutus'] }, [{ f: 250, dist: 0.86 }, { f: 274, dist: 0.76, ease: 'in' }, { f: 299, dist: 0.8, ease: 'out' }], [0, 0]),
    portrait: portrait({ mid: ['@clem', '@brutus'] }, [{ f: 250, dist: 0.86 }, { f: 274, dist: 0.76, ease: 'in' }, { f: 299, dist: 0.8, ease: 'out' }], { wide: 1.1 }),
  },
  {
    // the dogs answer: Cacklejaw's Pack Hunt on Gabė at the river (take V3)
    id: 'S04', ...V3, take: 'V3', f0: 300, f1: 349,
    anchor: { key: 'cackR', frame: 324 },
    cam: preset({ mid: ['@cack', '@gabe'] }, [{ f: 300, dist: 0.86 }, { f: 324, dist: 0.76, ease: 'in' }, { f: 349, dist: 0.8, ease: 'out' }], [0, 0]),
    portrait: portrait({ mid: ['@cack', '@gabe'] }, [{ f: 300, dist: 0.86 }, { f: 324, dist: 0.76, ease: 'in' }, { f: 349, dist: 0.8, ease: 'out' }]),
  },
  {
    // Sage's Moonshot down the river at Sir Brutus (take V4)
    id: 'S05', ...V3, take: 'V4', f0: 350, f1: 399,
    anchor: { key: 'sageR', frame: 374 },
    cam: preset({ mid: ['@sage', '@brutus'] }, [{ f: 350, dist: 0.92 }, { f: 374, dist: 0.84, ease: 'ease' }, { f: 399, dist: 0.88, ease: 'ease' }], [0, 0]),
    portrait: portrait({ mid: ['@sage', '@brutus'] }, [{ f: 350, dist: 0.92 }, { f: 374, dist: 0.84, ease: 'ease' }, { f: 399, dist: 0.88, ease: 'ease' }]),
  },
  {
    // Sir Brutus's Champion's Challenge (take V5)
    id: 'S06', ...V3, take: 'V5', f0: 400, f1: 449,
    anchor: { key: 'brutusR', frame: 420 },
    cam: preset({ unit: '@brutus' }, [{ f: 400, dist: 0.96 }, { f: 420, dist: 0.86, ease: 'in' }, { f: 449, dist: 0.92, ease: 'out' }], [0, 0.8]),
    portrait: portrait({ unit: '@brutus' }, [{ f: 400, dist: 0.96 }, { f: 420, dist: 0.86, ease: 'in' }, { f: 449, dist: 0.92, ease: 'out' }], { wide: 0.85, off: [0, -1.5] }),
  },
  // ---------------------------------------------------------------- S07-S10 THE FOUR CHAMPIONS (each one's ultimate; plates name them)
  {
    // Avietė's Short Circuit takes Cacklejaw (take V6)
    id: 'S07', ...V3, take: 'V6', f0: 450, f1: 499, shockI: 0.6,
    anchor: { key: 'avieteR', frame: 474 },
    cam: preset({ point: [46500, 11200] }, [{ f: 450, dist: 0.86 }, { f: 499, dist: 0.78, ease: 'ease' }], [0, 0]),
    portrait: portrait({ point: [46500, 11200] }, [{ f: 450, dist: 0.86 }, { f: 499, dist: 0.78, ease: 'ease' }], { wide: 1.14 }),
  },
  {
    // Bengas's Striking Pose on the bridge (take V7, Bengas is the player)
    id: 'S08', ...V3, take: 'V7', f0: 500, f1: 549,
    anchor: { key: 'bengasR', frame: 524 },
    cam: preset({ mid: ['@bengas', '@cack'] }, [{ f: 500, dist: 0.86 }, { f: 524, dist: 0.78, ease: 'out' }, { f: 549, dist: 0.82, ease: 'ease' }], [0, 0]),
    portrait: portrait({ mid: ['@bengas', '@cack'] }, [{ f: 500, dist: 0.86 }, { f: 524, dist: 0.78, ease: 'out' }, { f: 549, dist: 0.82, ease: 'ease' }]),
  },
  {
    // Gabė's Under Her Spell from her side: the pink cone is her cast (take V8, Gabė is the player)
    id: 'S09', ...V3, take: 'V8', f0: 550, f1: 599,
    anchor: { key: 'gabeR', frame: 574 },
    cam: preset({ mid: ['@gabe', '@brutus'] }, [{ f: 550, dist: 0.88 }, { f: 599, dist: 0.8, ease: 'ease' }], [0, 0]),
    portrait: portrait({ mid: ['@gabe', '@brutus'] }, [{ f: 550, dist: 0.88 }, { f: 599, dist: 0.8, ease: 'ease' }]),
  },
  {
    // Lambo's ultimate (take V9)
    id: 'S10', ...V3, take: 'V9', f0: 600, f1: 649,
    anchor: { key: 'lamboR', frame: 628 },
    cam: preset({ mid: ['@lambo', '@brutus'] }, [{ f: 600, dist: 0.86 }, { f: 628, dist: 0.76, ease: 'in' }, { f: 649, dist: 0.8, ease: 'out' }], [0, 0]),
    portrait: portrait({ mid: ['@lambo', '@brutus'] }, [{ f: 600, dist: 0.86 }, { f: 628, dist: 0.76, ease: 'in' }, { f: 649, dist: 0.8, ease: 'out' }], { wide: 1.44, off: [-2.5, -6] }),
  },
  // ---------------------------------------------------------------- S11 THE MISSION 1: push your lane (take N)
  {
    id: 'S11', ...V3, take: 'N', f0: 650, f1: 699,
    anchor: { key: 'core', offset: 720 - 11086, frame: 650 },
    cam: preset({ point: [50000, 8000] }, [{ f: 650, dist: 1.05 }, { f: 699, dist: 0.97, ease: 'linear' }], [0, 0]),
    portrait: { ...P, ...portrait({ point: [50000, 8000] }, [{ f: 650, dist: 1.05 }, { f: 699, dist: 0.97, ease: 'linear' }]) },
  },
  // ---------------------------------------------------------------- S12 THE MISSION 2: calm Pudding (take V11)
  {
    // v3.2: Clem and Gabė hit Pudding (a dog closing in), Pudding is calmed on f724 and the game's own banner says so
    // ("We calmed Pudding!"); framed on a fixed point between Pudding and the cats (Pudding leaves: no camera jump)
    id: 'S12', ...V3, take: 'V11', f0: 700, f1: 749,
    anchor: { key: 'calm', frame: 724 },
    bannerOn: [[722, 749]],
    cam: preset({ point: [51600, 32300] }, [{ f: 700, dist: 0.84 }, { f: 749, dist: 0.8, ease: 'ease' }], [0, 0]),
    portrait: { bannerOn: [[722, 749]], ...portrait({ point: [48800, 32300] }, [{ f: 700, dist: 0.84 }, { f: 749, dist: 0.8, ease: 'ease' }], { wide: 1.29, off: [0, -6] }) },
  },
  // ---------------------------------------------------------------- S13 THE DOG TOWER FALLS (take V13)
  {
    // v3.2: Sage and Clem at the dog tower; it cracks on f790 at full speed, topples across the screen toward its own
    // base and hits the ground about f830; framed on a fixed point between the cats and the tower's fall line, a small
    // push on the fall that eases back by the cut. The game's own "Enemy tower down!" banner in 16:9 only (in 9:16
    // it is a smudge at the top edge: the trailer has no type here either)
    id: 'S13', ...V3, take: 'V13', f0: 750, f1: 849,
    // 9:16: the landscape frame as a band (a vertical frame cannot hold the cats, the tower and its whole fall line
    // at a gameplay distance: the tower left the frame or other heroes were cut at its edges)
    aspects: ['16x9'],
    anchor: { key: 'tower', frame: 790 },
    bannerOn: [[790, 849]],
    cam: preset({ point: [78500, 12600] }, [{ f: 750, dist: 0.98 }, { f: 790, dist: 0.98 }, { f: 822, dist: 0.9, ease: 'ease' }, { f: 849, dist: 0.95, ease: 'ease' }], [0, 0]),
    portrait: { ...portrait({ point: [78500, 12600] }, [{ f: 750, dist: 0.98 }, { f: 790, dist: 0.98 }, { f: 822, dist: 0.9, ease: 'ease' }, { f: 849, dist: 0.95, ease: 'ease' }]), bannerOn: [] },
  },
  // ---------------------------------------------------------------- S14 TEAMFIGHT: five clean cats-vs-dogs beats, one per half bar
  {
    id: 'S14', ...V3, take: 'V14', f0: 850, f1: 899,
    // 9:16: the landscape frame as a band (the six spread wider than a vertical frame at any gameplay distance)
    aspects: ['16x9'],
    anchor: { key: 'q', frame: 882 },
    cam: preset({ point: [56600, 33600] }, [{ f: 850, dist: 0.96 }, { f: 899, dist: 0.92, ease: 'ease' }], [0, 0]),
    portrait: portrait({ point: [56600, 33600] }, [{ f: 850, dist: 0.96 }, { f: 899, dist: 0.92, ease: 'ease' }], { wide: 1.3 }),
  },
  {
    id: 'S14b', ...V3, take: 'V15', f0: 900, f1: 949,
    anchor: { key: 'r', frame: 924 },
    cam: game([{ f: 900, dist: 0.96 }, { f: 924, dist: 0.88, ease: 'out' }, { f: 949, dist: 0.92, ease: 'ease' }]),
    portrait: asPortrait([{ f: 900, dist: 0.96 }, { f: 924, dist: 0.88, ease: 'out' }, { f: 949, dist: 0.92, ease: 'ease' }]),
  },
  {
    id: 'S14c', ...V3, take: 'V16', f0: 950, f1: 999,
    anchor: { key: 'r', frame: 974 },
    cam: game([{ f: 950, dist: 0.96 }, { f: 974, dist: 0.88, ease: 'out' }, { f: 999, dist: 0.92, ease: 'ease' }]),
    portrait: asPortrait([{ f: 950, dist: 0.96 }, { f: 974, dist: 0.88, ease: 'out' }, { f: 999, dist: 0.92, ease: 'ease' }], { unit: '@hero' }, { wide: 1.1, off: [3, 0] }),
  },
  {
    id: 'S14d', ...V3, take: 'V17', f0: 1000, f1: 1049,
    anchor: { key: 'r', frame: 1019 },
    cam: preset({ point: [52500, 11100] }, [{ f: 1000, dist: 0.96 }, { f: 1049, dist: 0.92, ease: 'ease' }], [0, 0]),
    portrait: portrait({ point: [52500, 11100] }, [{ f: 1000, dist: 0.96 }, { f: 1049, dist: 0.92, ease: 'ease' }], { wide: 1.5, off: [0, 1.5] }),
  },
  {
    id: 'S14e', ...V3, take: 'V18', f0: 1050, f1: 1099,
    anchor: { key: 'w', frame: 1056 },
    cam: preset({ point: [57100, 18900] }, [{ f: 1050, dist: 0.96 }, { f: 1099, dist: 0.92, ease: 'ease' }], [0, 0]),
    portrait: portrait({ point: [57100, 18900] }, [{ f: 1050, dist: 0.96 }, { f: 1099, dist: 0.92, ease: 'ease' }], { wide: 1.1 }),
  },
  // ---------------------------------------------------------------- S15 TAKE THEIR CORE: the cats win the dog base (take V12)
  {
    // v3.2: Bengas, Gabė and Sage have won the dog base (every dog down) and walk onto the doghouse; a fixed
    // gameplay-angle frame with a slow push
    id: 'S15', ...V3, take: 'V12', f0: 1100, f1: 1249,
    // v3.2: from just after Cacklejaw's takedown (the gank piled four bodies on him): the cats walk onto the core and
    // start on it, at 0.8 speed (60 ticks, ending where S16 picks up)
    anchor: { key: 'ko', offset: 2, frame: 1100 },
    ramp: [[1100, 0.8]],
    popText: ['Takedown!'],
    cam: preset({ point: [89500, 34200] }, [{ f: 1100, dist: 0.9 }, { f: 1249, dist: 0.84, ease: 'ease' }], [0, 0]),
    portrait: portrait({ point: [89500, 34200] }, [{ f: 1100, dist: 0.9 }, { f: 1249, dist: 0.84, ease: 'ease' }]),
  },
  // ---------------------------------------------------------------- S16 THE CORE FALLS (take V12)
  {
    // v3.2: the last hits on the doghouse, the killing blow on f1292 (the game's own victory slow motion follows),
    // the burst and the cave-in; a fixed gameplay-angle frame between the cats and the core (the game's own camera
    // swings onto the core at match end, which put the plates on the frame edge) with one push on the burst. The
    // shot ends on f1355, 57 frames after the last sim tick under the game's 0.25 slow motion (about 14 game frames):
    // no units held past the match
    id: 'S16', ...V3, take: 'V12', f0: 1250, f1: 1355,
    shockI: 0.45,
    popText: [],
    // the killing blow on f1298: the first chunks fly on f1299 and the shockwave ring opens on f1302, on the score's hit
    anchor: { key: 'core', frame: 1298 },
    cam: preset({ point: [90000, 32400] }, [{ f: 1250, dist: 0.96 }, { f: 1296, dist: 0.96 }, { f: 1310, dist: 0.86, ease: 'out' }, { f: 1355, dist: 0.84, ease: 'linear' }], [0, 0]),
    portrait: { ...P, ...portrait({ point: [90000, 32400] }, [{ f: 1250, dist: 0.96 }, { f: 1296, dist: 0.96 }, { f: 1310, dist: 0.86, ease: 'out' }, { f: 1355, dist: 0.84, ease: 'linear' }]) },
  },
  // ---------------------------------------------------------------- S18 THE REAL CATS: the game's own pick screen (lobby)
  {
    // v3.2: "Choose your legend" as the player sees it: Lambo, then Avietė, Bengas and Gabė tapped on the beat; the
    // detail panel reads "Inspired by <name>'s Token Tails card." for each (real UI, no trailer copy inside it)
    id: 'S18', f0: 1356, f1: 1449, size: [1280, 720], dpr: 1.5, layers: ['hud'], hide: ['.pl-pick-foot', '.row.tricks', '.trick-hint'],
    lobby: { stands: [{ hero: 'lambo' }], pick: { hero: 'lambo', side: 0.5, swaps: [{ f: 1375, hero: 'aviete' }, { f: 1400, hero: 'bengas' }, { f: 1425, hero: 'gabe' }] } },
    // 9:16: the landscape pick screen as a band (the phone-portrait layout hides the hero behind the panel)
    aspects: ['16x9'],
  },
  // ---------------------------------------------------------------- S17 LINE-UP, CALL, END CARD (lobby, static)
  {
    // v3.2: two champions against the two dog heroes, every hero the same height on screen (fitH), each pair centred
    // under its title, the same pedestal for all
    id: 'S17', f0: 1450, f1: 1799, size: [1280, 720], dpr: 1.5,
    lobby: {
      ped: { scale: 0.6, trim: ['#ff6f91', '#3e6ad8'] },
      fitH: 2.3,
      stands: [
        { hero: 'lambo', x: -5.6, z: 0.6, face: 20 },
        { hero: 'gabe', x: -2.4, z: 0.6, face: 20 },
        { hero: 'brutus', team: 1, x: 2.4, z: 0.6, face: -20 },
        { hero: 'cacklejaw', team: 1, x: 5.6, z: 0.6, face: -20 },
      ],
    },
    cam: { target: { p3: [0.4, 1.1, 0.6] }, keys: [{ f: 1450, dist: 0.66, pitch: 7, yaw: 0, fov: 38 }, { f: 1799, dist: 0.64, ease: 'linear' }] },
    portrait: {
      stands: [
        { hero: 'lambo', x: -1.9, z: -4.5, face: 14, fitK: 1.25 },
        { hero: 'gabe', x: 1.9, z: -4.5, face: -14, fitK: 1.25 },
        { hero: 'brutus', team: 1, x: -1.9, z: 3.0, face: 10 },
        { hero: 'cacklejaw', team: 1, x: 1.9, z: 3.0, face: -10 },
      ],
      cam: { target: { p3: [0, 0.6, -0.8] }, keys: [{ f: 1450, dist: 1.0, pitch: 30, yaw: 0, fov: 32 }, { f: 1799, dist: 0.98, ease: 'linear' }] },
    },
  },
];

/** Every portrait camera is a full `portrait.cam` (capture.mjs specFor); kept for the --shots-file contract. */
export function portraitKeys(shot) {
  return shot.portrait?.cam?.keys ?? shot.cam?.keys ?? [];
}
