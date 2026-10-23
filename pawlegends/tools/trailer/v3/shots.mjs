/**
 * Trailer v3.3 ("Settle It on the Crossing", review of v3.2: "full of bugs, from above like real gameplay, sell cats
 * vs dogs and the mission") shot list: 30 s at 60 fps, 144 BPM (25 frames per beat). Every gameplay shot is the
 * game's own camera at its own distance: the real follow camera on the take's human (`cam.base: 'game'`, harness.ts
 * placeGameRel: its lead toward the enemy core and its fight pull-back) with the director's deltas on top, or, when
 * the subject is not the human, the same numbers as a preset (GAMECAM: pitch 48.8, FOV 38, the game's 4 m lead and
 * 0.8 m south). v3.3: every shot starts and ends at the gameplay distance (1.0); a push (to 0.9 at most) or the hook's
 * crane (to 1.3 at most) happens only round its beat. `gameLook`: no render clean-up hack.
 *
 *   node tools/trailer/capture.mjs --shots-file tools/trailer/v3/shots.mjs --aspect 16x9 --out <dir>/shots-l
 *
 * Landscape: 1280x720 CSS px at DPR 1.5 (1920x1080). Portrait: 540x960 CSS px at DPR 2 (1080x1920) with GAMECAM-P
 * (pitch 48.8, FOV 50, 1.2x the distance) on the subject: every 9:16 shot is captured natively (no landscape band).
 * Windows come from a QC scan of each take (capture.mjs --qc): no frame with bodies overlapping or in contact, a minion
 * inside a hero, a hero in a structure, a twin hero side by side, text at the edge or a stale number.
 */

/** v3 render settings: the frame as the game draws it. */
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
  popText: ['Takedown!'],
  selfName: true,
  edgeArrows: false,
  bannerOn: [],
  // v3.3: 10 frames through the real frame path before f0 (no units holding still on the cut)
  lead: 10,
};
const P = { width: 540, height: 960, dpr: 2 };

/** The game's camera with deltas (dist multiple, pitch / yaw degrees added). */
const game = (keys, target = null) => ({ base: 'game', target, keys });
/** GAMECAM as a director preset on `target`, with the game's 4 m lead toward the dog core and 0.8 m south. */
const preset = (target, keys, off = [4, 0.8]) => ({ target, keys: keys.map((k) => ({ fov: 38, pitch: 48.8, yaw: 0, lift: 0, ...k })), smooth: 0.12, off });
/** GAMECAM-P (9:16): pitch 48.8, FOV 50, 1.2x the distance, the subject centred. */
const portrait = (target, keys, o = {}) => ({
  ...P,
  cam: { target, keys: keys.map((k) => ({ fov: 50, pitch: 48.8, yaw: 0, lift: 0, ...k, dist: Math.round(1200 * (k.dist ?? 1) * (o.wide ?? 1)) / 1000 })), smooth: 0.12, off: o.off ?? [0, 0] },
  ...(o.extra ?? {}),
});
/** A push round the beat: gameplay distance before and after, `d` on the beat (frames a, beat, b). */
const push = (a, beat, b, d = 0.9) => [{ f: a, dist: 1 }, { f: beat, dist: d, ease: 'ease' }, { f: b, dist: 1, ease: 'ease' }];

export const SHOTS = [
  // ---------------------------------------------------------------- S01 HOOK + CATS VS DOGS (take V1, Clem is the player)
  {
    // Clem's Golden Hour on Sir Brutus at the river (Bengas with her, Cacklejaw on the bridge): f0 is the cast with
    // Brutus standing, the slow motion only round the hit, the takedown and his fall at full speed, then a crane to
    // 1.3x the gameplay height for CATS VS DOGS and back down to the gameplay view by the cut
    id: 'S01', ...V3, take: 'V1', f0: 0, f1: 149,
    anchor: { key: 'r', offset: 1, frame: 0 },
    ramp: [[0, 1], [8, 1], [12, 0.4, 'out'], [26, 0.4], [34, 1, 'ease']],
    cam: game([
      { f: 0, dist: 1, blend: 0 },
      { f: 12, dist: 0.9, ease: 'out' },
      { f: 40, dist: 0.92, ease: 'ease' },
      { f: 62, dist: 1, blend: 0, ease: 'ease' },
      { f: 92, dist: 1.3, pitch: 5, blend: 0, ease: 'ease' },
      { f: 118, dist: 1.3, pitch: 5, blend: 0, ease: 'linear' },
      { f: 149, dist: 1, pitch: 0, blend: 0, ease: 'ease' },
    ]),
    portrait: portrait({ unit: 0 }, [{ f: 0, dist: 1.05 }, { f: 12, dist: 1.02, ease: 'out' }, { f: 62, dist: 1.05, ease: 'ease' }, { f: 92, dist: 1.3, pitch: 53.8, ease: 'ease' }, { f: 118, dist: 1.3, pitch: 53.8 }, { f: 149, dist: 1, ease: 'ease' }]),
  },
  // ---------------------------------------------------------------- S02 3V3: the real HUD on the gameplay camera (take W5, Lambo)
  {
    // all six heroes in the player's own frame: Sir Brutus's Champion's Challenge on the cats, Sage's Moonshot back
    // (f210); 9:16 the same window on GAMECAM-P (no HUD: the game is played in landscape)
    id: 'S02', ...V3, take: 'W5', f0: 150, f1: 299, layers: ['hud'], selfName: false, edgeArrows: true,
    anchor: { key: 'sageR', frame: 232 },
    cam: game([{ f: 150, dist: 1 }, { f: 299, dist: 1 }]),
    portrait: portrait({ unit: 0 }, [{ f: 150, dist: 1.3 }, { f: 299, dist: 1.3 }], { extra: { layers: ['pops', 'banner', 'plates'] } }),
  },
  // ---------------------------------------------------------------- S03-S06 THE RIVALRY (cat, dog, dog; v3.3: Sage's Moonshot dropped, its beam read as a white bar)
  {
    // Clem's Tumble at Sir Brutus by the dog tower (take V2, Clem is the player)
    id: 'S03', ...V3, take: 'V2', f0: 300, f1: 349,
    anchor: { key: 'e', frame: 324 },
    cam: game(push(300, 324, 349)),
    portrait: portrait({ mid: ['@clem', '@brutus'] }, push(300, 324, 349), { wide: 1.1 }),
  },
  {
    // the dogs answer: Cacklejaw's Pack Hunt bounds out of the brawl at Pudding onto Avietė (take Z1): it lands at
    // range (v3.2's landed inside Gabė)
    id: 'S04', ...V3, take: 'Z1', f0: 350, f1: 399,
    anchor: { key: 'cackR', frame: 366 },
    cam: preset({ unit: '@cack' }, push(350, 366, 399, 0.92), [-4, 0.8]),
    portrait: portrait({ unit: '@cack' }, push(350, 366, 399, 0.92), { wide: 1.1 }),
  },
  {
    // Sir Brutus's Champion's Challenge (take V5): no push (its ring is large and pale)
    id: 'S06', ...V3, take: 'V5', f0: 400, f1: 449,
    anchor: { key: 'brutusR', frame: 420 },
    cam: preset({ unit: '@brutus' }, [{ f: 400, dist: 1 }, { f: 449, dist: 1 }], [-4, 0.8]),
    portrait: portrait({ unit: '@brutus' }, [{ f: 400, dist: 1.05 }, { f: 449, dist: 1.05 }]),
  },
  // ---------------------------------------------------------------- S07-S10 THE FOUR CHAMPIONS (each one's ultimate)
  {
    // Avietė's Short Circuit (take V6): from the cast (before it she lay on a cadet pile), 0.88 speed
    id: 'S07', ...V3, take: 'V6', f0: 450, f1: 499,
    anchor: { key: 'avieteR', frame: 451 },
    ramp: [[450, 0.88]],
    cam: preset({ unit: '@aviete' }, push(450, 470, 499, 0.92)),
    portrait: portrait({ unit: '@aviete' }, push(450, 470, 499, 0.92), { wide: 1.1 }),
  },
  {
    // Bengas's Striking Pose on the bridge (take V7, Bengas is the player)
    id: 'S08', ...V3, take: 'V7', f0: 500, f1: 549,
    anchor: { key: 'bengasR', frame: 524 },
    cam: game(push(500, 524, 549)),
    portrait: portrait({ mid: ['@bengas', '@cack'] }, push(500, 524, 549)),
  },
  {
    // Gabė's Under Her Spell (take V8, Gabė is the player)
    id: 'S09', ...V3, take: 'V8', f0: 550, f1: 599,
    anchor: { key: 'gabeR', frame: 577 },
    // the pair framed whole (the follow camera on Gabė left Sir Brutus and Bengas on the frame's bottom-left edge)
    cam: preset({ mid: ['@gabe', '@brutus'] }, push(550, 577, 599), [0, 0.8]),
    portrait: portrait({ mid: ['@gabe', '@brutus'] }, push(550, 577, 599)),
  },
  {
    // Lambo's Tangled Lights (take V9): the shot ends as the lights land (before the haul pulls the bodies together)
    id: 'S10', ...V3, take: 'V9', f0: 600, f1: 649,
    anchor: { key: 'lamboR', frame: 645 },
    cam: preset({ unit: '@lambo' }, [{ f: 600, dist: 1 }, { f: 645, dist: 0.94, ease: 'ease' }, { f: 649, dist: 0.95 }]),
    portrait: portrait({ unit: '@lambo' }, [{ f: 600, dist: 1 }, { f: 645, dist: 0.9, ease: 'ease' }, { f: 649, dist: 0.9 }], { wide: 1.2 }),
  },
  // ---------------------------------------------------------------- S11 THE MISSION 1: PUSH YOUR LANE. (take N)
  {
    // the first two waves march at each other over the Puddle Lane bridge, Clem leading the cats and Sir Brutus the
    // dogs, and meet at the end of the shot; PUSH YOUR LANE. over the open meadow below
    id: 'S11', ...V3, take: 'N', f0: 650, f1: 799,
    anchor: { key: 'core', offset: 566 - 11086, frame: 650 },
    cam: preset({ point: [50000, 8000] }, [{ f: 650, dist: 1 }, { f: 799, dist: 0.95, ease: 'linear' }], [0, 0]),
    // 9:16: a slow push from wider in (the waves are small in a vertical frame; the push keeps the picture moving)
    portrait: portrait({ point: [50000, 8000] }, [{ f: 650, dist: 1.3 }, { f: 799, dist: 0.95, ease: 'linear' }]),
  },
  // ---------------------------------------------------------------- S13 THE MISSION 2: TOPPLE THEIR TOWERS. (take V13)
  {
    // Sage and Clem at the dog tower; it cracks on f862 and topples across the screen; the game's banner stays off
    // (it came up before the tower moved; the trailer line carries the beat)
    id: 'S13', ...V3, take: 'V13', f0: 800, f1: 949,
    anchor: { key: 'tower', frame: 862 },
    // a slow push while the cats work the tower down, the crack, then back out to the gameplay distance as it falls
    cam: preset({ point: [78500, 12600] }, [{ f: 800, dist: 1 }, { f: 862, dist: 0.92, ease: 'ease' }, { f: 892, dist: 0.95, ease: 'ease' }, { f: 935, dist: 1, ease: 'ease' }, { f: 949, dist: 1 }], [0, 0]),
    portrait: portrait({ point: [78500, 12600] }, [{ f: 800, dist: 1.25 }, { f: 862, dist: 1.16, ease: 'ease' }, { f: 935, dist: 1.25, ease: 'ease' }, { f: 949, dist: 1.25 }]),
  },
  // ---------------------------------------------------------------- S14 TEAMFIGHT: one continuous take (W1, Gabė is the player)
  {
    // Cacklejaw's Pack Hunt into the cats, then Gabė's Under Her Spell back (slowed round the cast), on the player's
    // own camera from start to end
    id: 'S14', ...V3, take: 'W1', f0: 950, f1: 1149,
    // the clean stretch of the brawl (Cacklejaw's Pack Hunt into the cats and the cats' answer) is 58 ticks long: the
    // whole shot runs at 0.58 speed (a slowed teamfight, not one frozen beat)
    anchor: { key: 'cackR', frame: 1015 },
    ramp: [[950, 0.58]],
    // framed on Gabė and Sir Brutus together (the follow camera left Gabė and Lambo on the bottom edge while the brawl
    // ran at the top), at the game's pitch, a touch wider than its distance (1.1)
    cam: preset({ mid: [0, 4] }, [{ f: 950, dist: 1.1 }, { f: 1015, dist: 1.02, ease: 'ease' }, { f: 1149, dist: 1.1, ease: 'ease' }], [0, 0]),
    portrait: portrait({ mid: [0, 4] }, [{ f: 950, dist: 1.2 }, { f: 1149, dist: 1.2 }]),
  },
  // ---------------------------------------------------------------- S15 THE MISSION 3: TAKE THEIR CORE. (take V12, Bengas)
  {
    // one continuous shot on the player's own camera: the cats win the dog base, walk onto the doghouse and knock it
    // over (the killing blow on f1326), the game's victory slow motion to the cut (no frame more than 8 ticks past the
    // match end); a small push on the burst that eases back
    id: 'S15', ...V3, take: 'V12', f0: 1150, f1: 1389,
    shockI: 0.45,
    popText: ['Takedown!'],
    anchor: { key: 'core', frame: 1327 },
    // the gameplay framing as a preset on Bengas (the game's own camera swings onto the core at match end: a jump)
    // (the lead toward the doghouse, south-west of the cats, so the pile and the core share the middle of the frame)
    // a slow push while the cats pound the doghouse (it carries the two seconds they stand at it), a kick on the burst
    cam: preset({ unit: 0 }, [{ f: 1150, dist: 1 }, { f: 1205, dist: 1 }, { f: 1320, dist: 0.88, ease: 'ease' }, { f: 1338, dist: 0.84, ease: 'out' }, { f: 1389, dist: 0.97, ease: 'ease' }], [-1.5, 2.4]),
    portrait: portrait({ unit: 0 }, [{ f: 1150, dist: 1.1 }, { f: 1205, dist: 1.1 }, { f: 1320, dist: 1.0, ease: 'ease' }, { f: 1338, dist: 0.96, ease: 'out' }, { f: 1389, dist: 1.02, ease: 'ease' }], { off: [-1.5, 2.4] }),
  },
  // ---------------------------------------------------------------- S18 THE REAL CATS: the game's own pick screen (lobby)
  {
    // "Choose your legend" as the player sees it: Lambo, Avietė, Bengas, Gabė tapped on the beats; each stands at full
    // size on its cut (no grow-in); the detail panel ends after the "Inspired by <name>'s Token Tails card." line and
    // the flavour line (the ability list and the footer are not drawn: the panel shrinks to its content)
    id: 'S18', f0: 1390, f1: 1499, size: [1280, 720], dpr: 2, layers: ['hud'],
    hide: ['.pl-pick-foot', '.row.tricks', '.trick-hint', '.pl-pick .kit', '.pl-pick .lane-hint', '.pl-pick .wardrobe', '.pl-pick .pvp'],
    lobby: { stands: [{ hero: 'lambo' }], pick: { hero: 'lambo', side: 0.5, swaps: [{ f: 1415, hero: 'aviete' }, { f: 1440, hero: 'bengas' }, { f: 1465, hero: 'gabe' }] } },
    // 9:16: composed by the edit from this capture (the pedestal above, the panel's lines below)
    aspects: ['16x9'],
  },
  // ---------------------------------------------------------------- S17 LINE-UP (lobby): TEAM CAT OR TEAM DOG?
  {
    // two champions against the two dog heroes at one height, framed low and tight, idling; then the end card
    id: 'S17', f0: 1500, f1: 1799, size: [1280, 720], dpr: 1.5,
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
    cam: { target: { p3: [0.4, 0.62, 0.6] }, keys: [{ f: 1500, dist: 0.5, pitch: 7, yaw: 0, fov: 38 }, { f: 1799, dist: 0.485, ease: 'linear' }] },
    portrait: {
      stands: [
        { hero: 'lambo', x: -1.9, z: -3.4, face: 14, fitK: 1.2 },
        { hero: 'gabe', x: 1.9, z: -3.4, face: -14, fitK: 1.2 },
        { hero: 'brutus', team: 1, x: -1.9, z: 3.0, face: 10 },
        { hero: 'cacklejaw', team: 1, x: 1.9, z: 3.0, face: -10 },
      ],
      cam: { target: { p3: [0, 1.0, -0.2] }, keys: [{ f: 1500, dist: 0.92, pitch: 30, yaw: 0, fov: 32 }, { f: 1799, dist: 0.9, ease: 'linear' }] },
    },
  },
];

/** Every portrait camera is a full `portrait.cam` (capture.mjs specFor); kept for the --shots-file contract. */
export function portraitKeys(shot) {
  return shot.portrait?.cam?.keys ?? shot.cam?.keys ?? [];
}
