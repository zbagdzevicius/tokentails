/**
 * Trailer v3.4 (review of v3.3: 38 defects; the user's verdict still "full of bugs, from above like real gameplay, sell
 * cats vs dogs and the mission"). v3.4: the hook is a two-sided exchange (take H1: Sir Brutus charges Clem, Clem
 * answers) that cranes up to the whole Crossing (both bases, CATS over the cat side, DOGS over the dog side) and back
 * down to the gameplay view; 3V3 is take W9 (all six, the cats 13-6 up, the twin dogs on their own persona plates);
 * the tower falls along an open lane (take T1); the gameplay-camera shots carry the real score bar and minimap
 * ('hudlite'). Earlier notes (v3.3) follow.
 *
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
  // v3.4: a hero picked twice by the dogs keeps the game's persona plate ("Duke the Brutus", "Bolt the Brutus")
  twinNames: true,
  edgeArrows: false,
  bannerOn: [],
  // v3.3: 10 frames through the real frame path before f0 (no units holding still on the cut)
  lead: 10,
};
const P = { width: 540, height: 960, dpr: 2 };
/** v3.4: the real HUD's score bar and minimap on the gameplay-camera shots (landscape; 9:16 keeps the clean frame). */
const LITE = { layers: ['pops', 'banner', 'plates', 'hudlite'] };
const NOHUD = { layers: ['pops', 'banner', 'plates'] };
/** The whole Crossing: the map centre (Pudding's pad), sim mm. */
const CENTRE = [50000, 30000];

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

/** v3.4 S14 + S16 (frames 900-1149): the teamfight at the dog base, then Pudding calmed (the mission's middle beat). */
const TEAMFIGHT_SHOTS = [
  {
    // Sage is the player: Bengas takes Cacklejaw down at the dog base, the cats' cart rolls up, Sir Brutus walks in
    id: 'S14', ...V3, ...LITE, take: 'F1', f0: 900, f1: 1024,
    anchor: { key: 'ko', frame: 906 },
    cam: game([{ f: 900, dist: 1 }, { f: 912, dist: 0.93, ease: 'out' }, { f: 950, dist: 0.97, ease: 'ease' }, { f: 1024, dist: 1, ease: 'ease' }]),
    portrait: portrait({ mid: [0, 2] }, [{ f: 900, dist: 1.38 }, { f: 912, dist: 1.3, ease: 'out' }, { f: 1024, dist: 1.38, ease: 'ease' }], { off: [-4, 0], extra: NOHUD }),
  },
  {
    // Clem and Gabė calm Pudding on his pad (the calm on f1120, his hop and shrink after it); CALM PUDDING. over it
    id: 'S16', ...V3, ...LITE, take: 'V11', f0: 1025, f1: 1149,
    anchor: { key: 'calm', frame: 1120 },
    cam: game([{ f: 1025, dist: 1 }, { f: 1120, dist: 0.92, ease: 'ease' }, { f: 1149, dist: 0.95, ease: 'ease' }]),
    portrait: portrait({ point: [50000, 30000] }, [{ f: 1025, dist: 1.2 }, { f: 1120, dist: 1.1, ease: 'ease' }, { f: 1149, dist: 1.12 }], { extra: NOHUD }),
  },
];

export const SHOTS = [
  // ---------------------------------------------------------------- S01 HOOK + CATS VS DOGS (take H1, Clem is the player)
  {
    // the gameplay camera on Clem in the river by Pudding's pad: Sir Brutus charges in and hits her (the dog swing, a
    // short slow-motion dip), Clem answers; then a crane up to the whole Crossing (the yarn core left, the bone
    // doghouse right; v3.5: up in 24 frames, f38-62, mirroring the descent) for CATS VS DOGS, and (v3.5) back down
    // into the real gameplay camera inside the shot: the descent starts on the half-beat f112 (the words wipe on
    // f115) and lands, eased, on the next half-beat (f137), held on the gameplay view to the downbeat cut. While the map is wide (every hero a speck) the clock runs at 4.2x, so
    // the camera lands about 370 frames of real time after f0, as Clem's Q settles and the dogs fall back (Sir Brutus
    // and the second Cacklejaw out on the right, Gabė and Clem with Muffin in the river), every body apart: the clean
    // window of the take is 324-387 (v3.4's descent landed on the Clem / Sir Brutus pile at 200-320, where the melee
    // keeps their swings touching). The plates and the HUD fade out on the way up and back in on the way down.
    id: 'S01', ...V3, ...LITE, take: 'H1', f0: 0, f1: 149,
    anchor: { key: 'charge', frame: 22 },
    ramp: [[0, 1], [18, 1], [22, 0.55, 'out'], [30, 0.55], [38, 1, 'ease'], [62, 4.2, 'ease'], [112, 4.2], [137, 1, 'ease']],
    uiFade: [[38, 1], [48, 0], [124, 0], [137, 1]],
    hudFade: [[38, 1], [48, 0], [124, 0], [137, 1]],
    cam: game([
      { f: 0, dist: 1, pitch: 0, blend: 0 },
      { f: 22, dist: 0.92, ease: 'out' },
      { f: 38, dist: 0.95, pitch: 0, blend: 0, ease: 'ease' },
      { f: 62, dist: 3.75, pitch: 11.2, blend: 1, ease: 'ease' },
      { f: 112, dist: 3.5, pitch: 11.2, blend: 1, ease: 'linear' },
      { f: 137, dist: 1, pitch: 0, blend: 0, ease: 'ease' },
      { f: 149, dist: 1, pitch: 0, blend: 0 },
    ], { point: CENTRE }),
    // 9:16: the same crane with a quarter orbit, so the Crossing runs down the tall frame (the yarn core at the top,
    // the doghouse at the bottom), and the orbit turned back to the gameplay yaw on the way down, landing between Clem
    // and Gabė (on Clem alone the river side cut Muffin the Cacklejaw's plate at the frame edge)
    portrait: {
      ...P, ...NOHUD,
      cam: {
        target: { blend: [{ blend: [{ unit: 0 }, { point: CENTRE }], f0: 38, f1: 62 }, { mid: [0, 1] }], f0: 112, f1: 137 },
        keys: [
          { f: 0, dist: 1.05, pitch: 48.8, fov: 50, yaw: 0, lift: 0 },
          { f: 22, dist: 0.98, ease: 'out' },
          { f: 38, dist: 1.0, pitch: 48.8, yaw: 0, ease: 'ease' },
          { f: 62, dist: 4.2, pitch: 60, yaw: 90, ease: 'ease' },
          { f: 112, dist: 3.95, pitch: 60, yaw: 90, ease: 'linear' },
          { f: 137, dist: 1.05, pitch: 48.8, yaw: 0, ease: 'ease' },
          { f: 149, dist: 1.05, pitch: 48.8, yaw: 0 },
        ],
        smooth: 0.12,
        off: [0, 0],
      },
    },
  },
  // ---------------------------------------------------------------- S02 3V3: the real HUD on the gameplay camera (take W9, Bengas)
  {
    // all six heroes round Pudding's pad, the cats 13-6 up: Bengas, Sage and Gabė trade with the two Sir Brutus
    // ("Duke" and "Bolt", the game's own persona plates) and Cacklejaw; the full HUD as a player sees it
    id: 'S02', ...V3, take: 'W9', f0: 150, f1: 299, layers: ['hud'], selfName: false, edgeArrows: true,
    anchor: { key: 'six', frame: 150 },
    cam: game([{ f: 150, dist: 1 }, { f: 225, dist: 0.96, ease: 'ease' }, { f: 299, dist: 1, ease: 'ease' }]),
    // 9:16: centred on the six (Gabė at the left end, Cacklejaw at the right), pulled out so all of them fit
    portrait: portrait({ mid: [2, 3] }, [{ f: 150, dist: 1.22, pitch: 55 }, { f: 299, dist: 1.18, pitch: 55, ease: 'linear' }], { extra: NOHUD }),
  },
  // ---------------------------------------------------------------- S03-S06 THE RIVALRY (cat, dog, dog)
  {
    // Clem's Tumble at Sir Brutus by the dog tower (take V2, Clem is the player)
    id: 'S03', ...V3, ...LITE, take: 'V2', f0: 300, f1: 349,
    anchor: { key: 'e', frame: 324 },
    cam: game(push(300, 324, 349)),
    portrait: portrait({ mid: ['@clem', '@brutus'] }, push(300, 324, 349), { wide: 1.1, extra: NOHUD }),
  },
  {
    // the dogs answer: Cacklejaw's Pack Hunt on Gabė at the cat-side bridge (take V3; v3.3's Z1 window had Lambo's
    // flop snap through him)
    id: 'S04', ...V3, take: 'V3', f0: 350, f1: 399,
    anchor: { key: 'cackR', frame: 360 },
    cam: preset({ mid: ['@cack', '@gabe'] }, push(350, 366, 399, 0.94), [0, 0.8]),
    portrait: portrait({ mid: ['@cack', '@gabe'] }, push(350, 366, 399, 0.94), { wide: 1.1 }),
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
    id: 'S08', ...V3, ...LITE, take: 'V7', f0: 500, f1: 549,
    anchor: { key: 'bengasR', frame: 524 },
    cam: game(push(500, 524, 549)),
    portrait: portrait({ mid: ['@bengas', '@cack'] }, push(500, 524, 549), { extra: NOHUD }),
  },
  {
    // Gabė's Under Her Spell (take V8, Gabė is the player): v3.4 the cast lands late in the shot and the cut comes
    // before the charmed Sir Brutus walks into the pile with Bengas and a cadet
    id: 'S09', ...V3, take: 'V8', f0: 550, f1: 599,
    anchor: { key: 'gabeR', frame: 590 },
    cam: preset({ mid: ['@gabe', '@brutus'] }, push(550, 590, 599), [0, 0.8]),
    portrait: portrait({ mid: ['@gabe', '@brutus'] }, push(550, 590, 599)),
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
    // v3.4: 100 frames: the first two waves cross the Puddle Lane bridge at each other, Clem leading the cats and a Sir
    // Brutus the dogs, under a slow push; the cut lands as Clem leaps in (before the two heroes collide in the pile)
    id: 'S11', ...V3, ...LITE, take: 'N', f0: 650, f1: 749,
    anchor: { key: 'core', offset: 593 - 11086, frame: 650 },
    cam: preset({ point: [50000, 8000] }, [{ f: 650, dist: 1 }, { f: 725, dist: 0.9, ease: 'ease' }, { f: 749, dist: 0.95, ease: 'ease' }], [0, 0]),
    // 9:16: from wider in (both waves inside the tall frame), pushing in as they meet on the bridge
    portrait: portrait({ point: [50000, 8000] }, [{ f: 650, dist: 1.45 }, { f: 749, dist: 1.1, ease: 'ease' }], { extra: NOHUD }),
  },
  // ---------------------------------------------------------------- S13 THE MISSION 2: TOPPLE THEIR TOWERS. (take T1, Clem)
  {
    // Clem takes down Cacklejaw at the dog's Sunny outer tower, her cadets bring it down, and it topples east along the
    // open lane (no unit in its fall line); the game camera on the player, a push on the crack that eases back
    id: 'S13', ...V3, ...LITE, take: 'T1', f0: 750, f1: 899,
    anchor: { key: 'tower', frame: 855 },
    cam: game([{ f: 750, dist: 1, blend: 0 }, { f: 800, dist: 1, blend: 0.45, ease: 'ease' }, { f: 855, dist: 0.92, blend: 0.45, ease: 'ease' }, { f: 899, dist: 1, blend: 0.45, ease: 'ease' }], { point: [68500, 51000] }),
    // 9:16: on Clem, the look point 3.5 m toward the tower (Clem and the tower share the tall frame)
    portrait: portrait({ unit: 0 }, [{ f: 750, dist: 1.3 }, { f: 855, dist: 1.05, ease: 'ease' }, { f: 899, dist: 1.15, ease: 'ease' }], { off: [3.5, 0], extra: NOHUD }),
  },
  // ---------------------------------------------------------------- S14 TEAMFIGHT and S16 CALM PUDDING. (v3.4)
  ...TEAMFIGHT_SHOTS,
  // ---------------------------------------------------------------- S15 THE MISSION 3: TAKE THEIR CORE. (take V12, Bengas)
  {
    // one continuous shot: the cats win the dog base and knock the doghouse over; v3.4 the killing blow on f1318, so
    // the doghouse caves in on f1331 (CORE_HIT, the boom and VICTORY!); the bodies keep idling after the match ends
    // (heroView END_IDLE) and the camera eases on to the last frame
    id: 'S15', ...V3, ...LITE, take: 'V12', f0: 1150, f1: 1389,
    shockI: 0.45,
    popText: ['Takedown!'],
    anchor: { key: 'core', frame: 1318 },
    cam: preset({ unit: 0 }, [{ f: 1150, dist: 1 }, { f: 1205, dist: 1 }, { f: 1318, dist: 0.88, ease: 'ease' }, { f: 1338, dist: 0.84, ease: 'out' }, { f: 1389, dist: 0.95, ease: 'ease' }], [-1.5, 2.4]),
    portrait: portrait({ unit: 0 }, [{ f: 1150, dist: 1.1 }, { f: 1205, dist: 1.1 }, { f: 1318, dist: 1.0, ease: 'ease' }, { f: 1338, dist: 0.96, ease: 'out' }, { f: 1389, dist: 1.04, ease: 'ease' }], { off: [-1.5, 2.4], extra: NOHUD }),
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
    // v3.4: the two champions against the two dog heroes, Sir Brutus the dog lead (larger, nearer the centre), centred
    // with matching margins; each hero flourishes on its beat (TEAM CAT: the cats, TEAM DOG?: the dogs) under a slow
    // dolly-in; then the end card
    id: 'S17', f0: 1500, f1: 1799, size: [1280, 720], dpr: 1.5,
    lobby: {
      ped: { scale: 0.6, trim: ['#ff6f91', '#3e6ad8'] },
      fitH: 2.2,
      stands: [
        { hero: 'lambo', x: -5.0, z: 0.6, face: 20 },
        { hero: 'gabe', x: -2.1, z: 0.6, face: 20 },
        { hero: 'brutus', team: 1, x: 2.2, z: 0.9, face: -20, fitK: 1.14 },
        { hero: 'cacklejaw', team: 1, x: 5.1, z: 0.6, face: -20 },
      ],
      acts: [
        { f: 1505, stand: 0, act: 'swing' }, { f: 1509, stand: 1, act: 'swing' },
        { f: 1518, stand: 2, act: 'swing' }, { f: 1522, stand: 3, act: 'swing' },
        { f: 1550, stand: 1, act: 'cheer' }, { f: 1556, stand: 0, act: 'cheer' },
        { f: 1575, stand: 3, act: 'cheer' }, { f: 1580, stand: 2, act: 'cheer' },
      ],
    },
    cam: { target: { p3: [0.05, 0.85, 0.6] }, keys: [{ f: 1500, dist: 0.53, pitch: 7, yaw: 0, fov: 38 }, { f: 1600, dist: 0.5, ease: 'linear' }, { f: 1799, dist: 0.49, ease: 'linear' }] },
    portrait: {
      stands: [
        { hero: 'lambo', x: -1.9, z: -3.4, face: 14, fitK: 1.2 },
        { hero: 'gabe', x: 1.9, z: -3.4, face: -14, fitK: 1.2 },
        { hero: 'brutus', team: 1, x: -1.9, z: 3.0, face: 10, fitK: 1.08 },
        { hero: 'cacklejaw', team: 1, x: 1.9, z: 3.0, face: -10 },
      ],
      cam: { target: { p3: [0, 1.0, -0.2] }, keys: [{ f: 1500, dist: 0.96, pitch: 30, yaw: 0, fov: 32 }, { f: 1600, dist: 0.92, ease: 'linear' }, { f: 1799, dist: 0.9, ease: 'linear' }] },
    },
  },
];

/** Every portrait camera is a full `portrait.cam` (capture.mjs specFor); kept for the --shots-file contract. */
export function portraitKeys(shot) {
  return shot.portrait?.cam?.keys ?? shot.cam?.keys ?? [];
}
