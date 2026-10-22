/**
 * Trailer v2 ("Big Plays") shot list as data: 30.000 s, 144 BPM (25 frames per beat, 100 per bar), 60 fps. The v1
 * list ("Meet Gabe", 120 BPM) is shots-v1.mjs. capture.mjs turns each entry plus its take (takes.json) into a harness
 * ShotSpec per aspect. Frames are the master's output frames; cuts land on beats, contacts on the beat or beat + 3.
 *
 *   take      takes.json id; `anchor` puts a key tick (+ offset) on a frame; `fits: [{ key, frame, seg, offset? }]`
 *             stretch the ramp on each segment so that key is crossed ON its frame (solved in order). A hit-stop that
 *             follows a fitted key starts one frame after it (a frame at ramp 0 cannot cross anything).
 *   cam       director camera: target (roles from the take: '@clem' = its slot) and keys (director.ts); `align`
 *             turns the line a -> b to run down the screen (b nearest the lens) and the keys' yaw is added on top
 *   blur      [[a, b], ...]: frames rendered as 32 sub-frames with a 180° shutter (acrobatic peaks, whips)
 *   xray      a tower or core between the lens and the look point fades (base fights)
 *   looks     [[fromFrame, card], ...]: the same frames once per card look (cosmetic only)
 *   wide      9:16 frames it 1.35x further and 6° steeper; close-ups get 1.3x and a turned side-on yaw (portraitKeys)
 */

/** A 4-frame lens punch on frame f: distance -0.05 on f+1, back by f+4. */
const punch = (f, dist) => [{ f, dist }, { f: f + 1, dist: dist - 0.05, ease: 'out' }, { f: f + 4, dist, ease: 'out' }];
const ULTS = ['Golden Hour!', 'Moonshot!', 'Champion’s Challenge!', "Champion's Challenge!", 'Short Circuit!', 'Pack Hunt!', 'Curtains Up!', 'Under Her Spell!', 'Tangled Lights!'];

export const SHOTS = [
  // ---------------------------------------------------------------- bar 1, HOOK (f0-99)
  {
    id: 'S01',
    f0: 0,
    f1: 49,
    take: 'X4',
    // Lambo already airborne on frame 0 (thumbnail), the Belly Flop lands on the first beat + 0 (f25), held 3 frames
    anchor: { key: 'cast', frame: 0, offset: 1.6 },
    fits: [{ key: 'land', frame: 25, seg: [0, 24] }],
    ramp: [[0, 0.12], [22, 0.12], [24, 0.5, 'in'], [25, 0.5], [26, 0], [28, 0], [29, 1, 'out'], [49, 1]],
    cam: {
      // the doghouse (the dog fountain) stays behind the brawl at this yaw; the lens pushes in through the dive
      target: { mid: ['@lambo', '@v1'], lift: 1.1 },
      align: { a: '@lambo', b: '@v1' },
      keys: [{ f: 0, dist: 0.52, pitch: 18, yaw: 40, fov: 34 }, { f: 24, dist: 0.44, ease: 'in' }, { f: 25, dist: 0.4, ease: 'out' }, { f: 28, dist: 0.4 }, { f: 49, dist: 0.6, pitch: 28, yaw: 30, ease: 'out' }],
      smooth: 0.08,
    },
    blur: [[0, 24]],
    popText: ['Takedown!'],
    dmgRadius: 6,
    cullHeroes: 2.5,
    cullFront: 0.6,
  },
  {
    id: 'S02',
    f0: 50,
    f1: 74,
    take: 'X5',
    anchor: { key: 'cast', frame: 52 },
    ramp: [[50, 1], [52, 1], [53, 0], [55, 0], [56, 0.6], [68, 0.6], [69, 1]],
    cam: { target: { mid: ['@star', '@v1'], lift: 1.1 }, align: { a: '@star', b: '@v1' }, keys: [{ f: 50, dist: 0.46, pitch: 20, yaw: 70, fov: 40 }, ...punch(52, 0.46)], smooth: 0.1 },
    popText: ['Takedown!'],
    dmgRadius: 6,
    cullHeroes: 3,
    cullFront: 0.8,
  },
  {
    id: 'S03',
    f0: 75,
    f1: 99,
    take: 'X4',
    // Clem's Q3 launcher on the bridge (the W1 look: tight and low), then a whip-out
    anchor: { key: 'q3', frame: 78 },
    ramp: [[75, 1], [78, 1], [79, 0], [81, 0], [82, 0.45], [95, 0.45], [96, 1.6, 'in'], [99, 1.6]],
    cam: {
      target: { unit: '@clem', lift: 1.1 },
      align: { a: '@clem', b: '@v1' },
      keys: [{ f: 75, dist: 0.38, pitch: 16, yaw: -90, fov: 34 }, { f: 95, dist: 0.38, yaw: -90 }, { f: 99, dist: 0.5, yaw: -50, ease: 'in' }],
      smooth: 0.1,
    },
    blur: [[82, 99]],
    popText: ['Takedown!', 'CLANK!'],
    dmgRadius: 6,
    cullHeroes: 2.5,
    cullFront: 0.8,
  },
  // ---------------------------------------------------------------- bar 2, TITLE (f100-199)
  {
    id: 'S04',
    f0: 100,
    f1: 199,
    take: 'C',
    anchor: { key: 'clash', frame: 150 },
    cam: {
      target: { point: '@clash', lift: 1 },
      keys: [{ f: 100, dist: 1.7, pitch: 70, yaw: 0, fov: 40 }, { f: 175, dist: 0.7, pitch: 38, ease: 'out' }, { f: 193, yaw: 12, ease: 'ease' }, { f: 199, yaw: 57, ease: 'in' }],
      smooth: 0.4,
    },
    blur: [[194, 199]],
    popText: [],
    dmgRadius: 8,
    wide: true,
  },
  // ---------------------------------------------------------------- bars 3-4, ROLL CALL (f200-399)
  {
    id: 'S05',
    f0: 200,
    f1: 224,
    take: 'X4',
    // Clem's Tumble: a forward roll over 4 m
    anchor: { key: 'e', frame: 203 },
    cam: { target: { unit: '@clem', lift: 1 }, align: { a: '@clem', b: '@v1' }, keys: [{ f: 200, dist: 0.42, pitch: 18, yaw: 90, fov: 40 }, { f: 224, dist: 0.4 }], smooth: 0.12 },
    blur: [[203, 215]],
    popText: [],
    dmgRadius: 6,
    cullHeroes: 2.5,
    cullFront: 0.8,
    near: 3,
  },
  {
    id: 'S06',
    f0: 225,
    f1: 249,
    take: 'X11',
    // Sage's Hop Back: a backflip, seen low so the shadow separates
    anchor: { key: 'cast', frame: 228 },
    ramp: [[225, 1], [230, 1], [231, 0.5], [240, 0.5], [241, 1]],
    cam: { target: { unit: '@star', lift: 1.3 }, align: { a: '@star', b: '@v1' }, keys: [{ f: 225, dist: 0.36, pitch: 10, yaw: -90, fov: 40 }, { f: 249, dist: 0.34 }], smooth: 0.12 },
    blur: [[230, 240]],
    popText: [],
    dmgRadius: 6,
    cullHeroes: 2.5,
    cullFront: 0.8,
  },
  {
    id: 'S07',
    f0: 250,
    f1: 274,
    take: 'D',
    // Sir Brutus's Pug Charge, side-on
    anchor: { key: 'hit', frame: 262 },
    ramp: [[250, 1], [262, 1], [263, 0], [265, 0], [266, 1]],
    cam: { target: { mid: ['@hero', '@victim'], lift: 1.1 }, align: { a: '@hero', b: '@victim' }, keys: [{ f: 250, dist: 0.46, pitch: 22, yaw: -90, fov: 40 }, { f: 274, dist: 0.42 }], smooth: 0.1 },
    popText: [],
    dmgRadius: 6,
    cullHeroes: 3.5,
    cullFront: 0.8,
    near: 2,
    xray: true,
  },
  {
    id: 'S08',
    f0: 275,
    f1: 299,
    take: 'X10',
    // Cacklejaw's Jeer Slash: the corkscrew sprint through three cats, from behind the dash
    anchor: { key: 'cast', frame: 278 },
    ramp: [[275, 1], [286, 1], [287, 0], [288, 0], [289, 1]],
    cam: { target: { unit: '@star', lift: 1 }, align: { a: '@v1', b: '@star' }, keys: [{ f: 275, dist: 0.5, pitch: 22, yaw: 90, fov: 40 }, { f: 299, dist: 0.46 }], smooth: 0.12 },
    blur: [[278, 286]],
    popText: ['Takedown!'],
    dmgRadius: 6,
    cullHeroes: 2.5,
  },
  {
    id: 'S09',
    f0: 300,
    f1: 324,
    take: 'E',
    // Aviete's Short Circuit: the axe-kick heel-down and the rebound backflip
    anchor: { key: 'cast', frame: 303 },
    ramp: [[300, 1], [303, 1], [304, 0], [305, 0], [306, 0.6], [318, 0.6], [319, 1]],
    cam: { target: { mid: ['@hero', '@target'], lift: 1.1 }, keys: [{ f: 300, dist: 0.44, pitch: 18, yaw: 0, fov: 40 }, { f: 324, dist: 0.42 }], smooth: 0.12 },
    blur: [[306, 318]],
    popText: ['Short Circuit!'],
    dmgRadius: 6,
    cullHeroes: 3.5,
    cullFront: 0.8,
  },
  {
    id: 'S10',
    f0: 325,
    f1: 349,
    take: 'X7',
    // Bengas's Striking Pose: spin-in, frozen vogue facing the lens, the camera-flash wedge (cast on f342)
    anchor: { key: 'windup', frame: 326 },
    ramp: [[325, 1], [342, 1], [343, 0.15], [346, 0.15], [347, 1]],
    cam: { target: { unit: '@star', lift: 1.1 }, align: { a: '@star', b: '@v1' }, keys: [{ f: 325, dist: 0.4, pitch: 14, yaw: 0, fov: 40 }, { f: 349, dist: 0.44 }], smooth: 0.12 },
    popText: ['Striking Pose!'],
    dmgRadius: 6,
    cullHeroes: 2.5,
    cullFront: 0.6,
  },
  {
    id: 'S11',
    f0: 350,
    f1: 374,
    take: 'X12',
    // Gabe's Chase the Wind: a gliding barrel roll, side-on
    anchor: { key: 'cast', frame: 353 },
    ramp: [[350, 1], [355, 0.7], [365, 0.7], [366, 1]],
    cam: { target: { unit: '@star', lift: 1.1 }, align: { a: '@star', b: '@v1' }, keys: [{ f: 350, dist: 0.45, pitch: 18, yaw: 90, fov: 40 }, { f: 374, dist: 0.42 }], smooth: 0.12 },
    blur: [[355, 365]],
    popText: [],
    dmgRadius: 6,
    cullHeroes: 2.5,
    cullFront: 0.6,
  },
  {
    id: 'S12',
    f0: 375,
    f1: 399,
    take: 'X6',
    // Lambo's Tangled Lights: two accelerating spins, then the haul lands on f392
    anchor: { key: 'windup', frame: 375 },
    fits: [{ key: 'cast', frame: 392, seg: [375, 391] }],
    ramp: [[375, 1], [392, 1], [393, 0.5], [399, 0.5]],
    cam: { target: { unit: '@star', lift: 1 }, keys: [{ f: 375, dist: 0.7, pitch: 40, yaw: 200, fov: 40 }, { f: 399, dist: 0.56, ease: 'in' }], smooth: 0.15 },
    popText: ['Tangled Lights!'],
    dmgRadius: 7,
    cullHeroes: 2.5,
  },
  // ---------------------------------------------------------------- bar 5, 3V3 IN YOUR BROWSER (f400-499)
  {
    id: 'S13',
    f0: 400,
    f1: 499,
    take: 'X4',
    anchor: { key: 'bengasW', frame: 425 },
    cam: { target: { mid: ['@lambo', '@v1'], lift: 1 }, keys: [{ f: 400, dist: 0.8, pitch: 40, yaw: 20, fov: 40 }, { f: 499, dist: 0.72, yaw: 60, ease: 'linear' }], smooth: 0.4 },
    xray: true,
    popText: ['Takedown!', 'Pack Hunt!', 'Striking Pose!'],
    dmgRadius: 10,
    wide: true,
  },
  // ---------------------------------------------------------------- bars 6-8, ULTS (f500-799)
  {
    id: 'S14',
    f0: 500,
    f1: 549,
    take: 'B',
    // Sage's Moonshot: the full draw, then the camera rides the arrow to the bullseye on f541
    anchor: { key: 'release', frame: 525 },
    fits: [{ key: 'hit', frame: 541, seg: [526, 540] }],
    ramp: [[500, 1], [524, 1], [525, 2.0], [541, 2.0], [542, 0], [544, 0], [545, 0.4], [549, 0.4]],
    cam: {
      target: {
        cut: [
          [500, { unit: '@hero', lift: 1.4 }],
          [525, { blend: [{ unit: '@hero', lift: 1.4 }, { unit: '@target', lift: 1.2 }], f0: 525, f1: 538 }],
          [539, { unit: '@target', lift: 1.2 }],
        ],
      },
      keys: [
        { f: 500, dist: 0.3, pitch: 10, yaw: 70, fov: 40 },
        { f: 524, dist: 0.24, ease: 'out' },
        { f: 525, dist: 0.6, pitch: 20, yaw: 10, ease: 'hold' },
        { f: 538, dist: 0.6 },
        { f: 539, dist: 0.3, pitch: 12, yaw: -45, ease: 'hold' },
        { f: 549, dist: 0.34 },
      ],
      smooth: 0.08,
    },
    blur: [[525, 540]],
    popText: ['Moonshot!'],
    dmgRadius: 7,
    cullHeroes: 7,
  },
  {
    id: 'S15',
    f0: 550,
    f1: 599,
    take: 'F',
    // Bengas's Curtains Up!: the bow, then a crane up as the stage arms (cast + 18 ticks on f575)
    anchor: { key: 'cast', frame: 553 },
    fits: [{ key: 'cast', offset: 18, frame: 575, seg: [553, 574] }],
    ramp: [[550, 1], [575, 1], [576, 1.3], [599, 1.3]],
    cam: {
      target: { blend: [{ unit: '@hero', lift: 1 }, { point: '@stage', lift: 1 }], f0: 553, f1: 575 },
      keys: [{ f: 550, dist: 0.5, pitch: 22, yaw: 120, fov: 40 }, { f: 553, dist: 0.5, pitch: 22 }, { f: 575, dist: 0.95, pitch: 52, yaw: 130, ease: 'ease' }, { f: 599, yaw: 140 }],
      smooth: 0.12,
    },
    xray: true,
    popText: ['Curtains Up!'],
    dmgRadius: 9,
    cullHeroes: 3,
    cullFront: 0.6,
  },
  {
    id: 'S16',
    f0: 600,
    f1: 649,
    take: 'X8',
    // Gabe's Under Her Spell: the twirl, then the heart wavefront charms three dogs (f622)
    anchor: { key: 'windup', frame: 600 },
    fits: [{ key: 'cast', frame: 622, seg: [600, 621] }],
    ramp: [[600, 1], [622, 1], [623, 0], [625, 0], [626, 1]],
    cam: { target: { unit: '@star', lift: 1.1 }, keys: [{ f: 600, dist: 0.38, pitch: 14, yaw: 30, fov: 40 }, { f: 621, dist: 0.38 }, { f: 622, dist: 0.8, pitch: 40, ease: 'out' }, { f: 649, dist: 0.76, yaw: 40 }], smooth: 0.12 },
    xray: true,
    popText: ['Under Her Spell!'],
    dmgRadius: 8,
    cullHeroes: 2.5,
  },
  {
    id: 'S17',
    f0: 650,
    f1: 699,
    take: 'U3',
    // Sir Brutus's Champion's Challenge: sand obelisks erupt, seen from low under them
    anchor: { key: 'cast', frame: 655 },
    ramp: [[650, 1], [655, 1], [656, 0.6], [673, 0.6], [674, 1]],
    cam: { target: { unit: '@caster', lift: 1.5 }, keys: [{ f: 650, dist: 0.55, pitch: 14, yaw: -60, fov: 40 }, { f: 699, yaw: -20, ease: 'out' }], smooth: 0.1 },
    popText: ['Champion’s Challenge!', "Champion's Challenge!"],
    dmgRadius: 7,
    cullHeroes: 3,
    cullFront: 0.6,
    near: 4,
  },
  {
    id: 'S18',
    f0: 700,
    f1: 749,
    take: 'X1',
    // Aviete's chain: Short Circuit (f703) -> Live Wire blink -> Spark Swipe (f729), two takedowns
    anchor: { key: 'r', frame: 703 },
    fits: [{ key: 'q', frame: 729, seg: [706, 728] }],
    ramp: [[700, 1], [703, 1], [704, 0], [705, 0], [706, 1], [729, 1], [730, 0], [732, 0], [733, 0.5], [749, 0.5]],
    cam: { target: { unit: '@star', lift: 1 }, keys: [{ f: 700, dist: 0.55, pitch: 34, yaw: 0, fov: 40 }, { f: 749, dist: 0.5, yaw: 15 }], smooth: 0.1 },
    xray: true,
    popText: ['Short Circuit!', 'Takedown!'],
    dmgRadius: 8,
    cullHeroes: 3,
  },
  {
    id: 'S19',
    f0: 750,
    f1: 799,
    take: 'X9',
    // Clem's Golden Hour (the 6 m gold pillar, looking up), then one Q: a double takedown on f764
    anchor: { key: 'r', frame: 752 },
    fits: [{ key: 'q', frame: 764, seg: [753, 763] }],
    ramp: [[750, 1], [764, 1], [765, 0], [767, 0], [768, 0.5], [799, 0.5]],
    cam: {
      target: { unit: '@star', lift: 1 },
      keys: [{ f: 750, dist: 0.4, pitch: 8, yaw: -30, fov: 40, lift: 2.0 }, { f: 763, dist: 0.4, pitch: 8, lift: 2.0 }, { f: 764, dist: 0.6, pitch: 30, lift: 1.1, ease: 'out' }, { f: 799, yaw: -10, ease: 'linear' }],
      smooth: 0.1,
    },
    popText: ['Golden Hour!', 'Takedown!'],
    dmgRadius: 8,
    cullHeroes: 3,
    xray: true,
  },
  // ---------------------------------------------------------------- bar 9, PACK HUNT (f800-899): three takedowns on three beats
  {
    id: 'S20',
    f0: 800,
    f1: 899,
    take: 'X2',
    anchor: { key: 'r', frame: 803 },
    fits: [{ key: 'ko1', frame: 825, seg: [804, 824] }, { key: 'ko2', frame: 850, seg: [828, 849] }, { key: 'ko3', frame: 875, seg: [853, 874] }],
    ramp: [[800, 1], [803, 1], [804, 0.12], [825, 0.12], [826, 0], [827, 0], [828, 0.55], [850, 0.55], [851, 0], [852, 0], [853, 0.48], [875, 0.48], [876, 0], [877, 0], [878, 1], [899, 1]],
    cam: { target: { unit: '@star', lift: 1 }, keys: [{ f: 800, dist: 0.44, pitch: 28, yaw: 20, fov: 40 }, ...punch(825, 0.44), ...punch(850, 0.44), ...punch(875, 0.44), { f: 899, dist: 0.46, yaw: 35 }], smooth: 0.25 },
    blur: [[804, 824]],
    xray: true,
    popText: ['Pack Hunt!', 'Takedown!', 'Combo x2', 'Combo x3'],
    dmgRadius: 8,
    cullHeroes: 2.5,
  },
  // ---------------------------------------------------------------- bar 10, PING + PUDDING (f900-999)
  {
    id: 'S21',
    f0: 900,
    f1: 949,
    take: 'J',
    anchor: { key: 'ping1', frame: 912 },
    wheel: { open: 900, close: 912 },
    wheelScale: 2.2,
    cam: { target: { unit: '@hero', lift: 1 }, keys: [{ f: 900, dist: 0.9, pitch: 50, yaw: 0, fov: 40 }, { f: 949, dist: 0.82 }], smooth: 0.2 },
    layers: ['pops', 'wheel'],
    popText: ['Coming to you!'],
    dmgRadius: 8,
    wide: true,
  },
  {
    id: 'S22',
    f0: 950,
    f1: 999,
    take: 'K',
    anchor: { key: 'bounce', frame: 962 },
    ramp: [[950, 1], [962, 1], [964, 0.5], [990, 0.5], [999, 1]],
    cam: { target: { unit: '@pudding', lift: 0.8 }, keys: [{ f: 950, dist: 0.6, pitch: 24, yaw: 60, fov: 40 }, ...punch(962, 0.6), { f: 999, dist: 0.55 }], smooth: 0.3 },
    popText: [],
    dmgRadius: 9,
    cullHeroes: 3,
    cullFront: 0.5,
  },
  // ---------------------------------------------------------------- bar 11, TOWER DIVE (f1000-1099)
  {
    id: 'S23',
    f0: 1000,
    f1: 1099,
    take: 'X13',
    anchor: { key: 'ko', frame: 1050 },
    ramp: [[1000, 1], [1050, 1], [1051, 0], [1053, 0], [1054, 0.5], [1074, 0.5], [1075, 1.3], [1099, 1.3]],
    cam: {
      target: { mid: ['@star', '@tower'], lift: 1.5 },
      align: { a: '@tower', b: '@star' },
      keys: [{ f: 1000, dist: 0.6, pitch: 28, yaw: 0, fov: 40 }, { f: 1049, dist: 0.55 }, { f: 1050, dist: 0.45, ease: 'out' }, { f: 1099, dist: 0.5, yaw: 15 }],
      smooth: 0.2,
    },
    layers: ['pops'],
    popText: ['Takedown!'],
    dmgRadius: 9,
    cullHeroes: 3,
  },
  // ---------------------------------------------------------------- bar 12, TOWER FALLS + COMEBACK (f1100-1199)
  {
    id: 'S24',
    f0: 1100,
    f1: 1149,
    take: 'T',
    anchor: { key: 'tower', frame: 1125 },
    ramp: [[1100, 1], [1125, 1], [1126, 0.4], [1149, 0.4]],
    cam: { target: { point: '@tower', lift: 2.2 }, keys: [{ f: 1100, dist: 0.7, pitch: 18, yaw: 130, fov: 40 }, { f: 1149, dist: 0.74, yaw: 140, ease: 'out' }], smooth: 0.15 },
    popText: [],
    dmgRadius: 12,
    cullHeroes: 3,
    near: 5,
  },
  {
    id: 'S25',
    f0: 1150,
    f1: 1199,
    take: 'L',
    anchor: { key: 'comeback', frame: 1150, banner: 'COMEBACK!' },
    preroll: 480,
    cam: { target: { wave: 0, near: '@hero', r: 16, lift: 1 }, keys: [{ f: 1150, dist: 0.32, pitch: 10, yaw: 180, fov: 40 }, { f: 1199, dist: 0.28, yaw: 188 }], smooth: 0.3 },
    layers: ['pops', 'banner'],
    popText: [],
    dmgRadius: 10,
    near: 2.5,
  },
  // ---------------------------------------------------------------- bar 13, SKINS (1 beat) + REAL HUD (f1200-1299)
  {
    id: 'S26',
    f0: 1200,
    f1: 1224,
    take: 'E',
    anchor: { key: 'cast', frame: 1212 },
    looks: [[1200, 'demo-ficus'], [1206, 'demo-pinkie'], [1212, 'demo-rascal'], [1218, 'demo-grey']],
    cam: { target: { mid: ['@hero', '@target'], lift: 1.1 }, keys: [{ f: 1200, dist: 0.36, pitch: 16, yaw: -20, fov: 40 }, { f: 1224, yaw: 20, ease: 'linear' }], smooth: 0.1 },
    popText: [],
    dmgRadius: 6,
    cullHeroes: 3.5,
    cullFront: 0.8,
  },
  {
    id: 'S27',
    f0: 1225,
    f1: 1299,
    take: 'X14',
    // the real game: full HUD, the game's own follow camera on slot 0
    anchor: { key: 'cackE', frame: 1290 },
    cam: null,
    layers: ['hud'],
    // 9:16: a phone in landscape (932x430 CSS px at DPR 2), shown whole as a band
    portrait: { width: 932, height: 430, dpr: 2, touch: true },
  },
  // ---------------------------------------------------------------- bar 14, FINAL TEAMFIGHT (f1300-1399): eighth-note cuts on X14
  ...[
    ['S28a', 1300, 1312, 'lamboE', '@lambo', { dist: 0.55, pitch: 20, yaw: -60 }, [[1300, 1.6]]],
    ['S28b', 1313, 1324, 'bengasR', '@bengas', { dist: 0.85, pitch: 55, yaw: 30 }],
    ['S28c', 1325, 1337, 'clemR', '@clem', { dist: 0.4, pitch: 8, yaw: -40, lift: 2 }],
    ['S28d', 1338, 1349, 'lamboR', '@lambo', { dist: 0.7, pitch: 45, yaw: 60 }],
    ['S28e', 1350, 1362, 'brutusR', '@brutus', { dist: 0.55, pitch: 12, yaw: -70 }],
    ['S28f', 1363, 1374, 'bengasW', '@bengas', { dist: 0.4, pitch: 14, yaw: 160 }],
    ['S28g', 1375, 1387, 'clemQ', '@clem', { dist: 0.42, pitch: 18, yaw: -90 }],
    ['S28h', 1388, 1399, 'cackR', '@cacklejaw', { dist: 0.5, pitch: 24, yaw: 200 }, null, [[1390, 1399]]],
  ].map(([id, f0, f1, key, unit, k, ramp, blur]) => ({
    id,
    f0,
    f1,
    take: 'X14',
    anchor: { key, frame: f0 + 2 },
    ...(ramp ? { ramp } : {}),
    ...(blur ? { blur } : {}),
    cam: { target: { unit, lift: 1.1 }, keys: [{ f: f0, fov: 40, ...k }, { f: f1, dist: k.dist * 0.92 }], smooth: 0.08 },
    xray: true,
    popText: [...ULTS, 'Takedown!'],
    dmgRadius: 6,
    cullHeroes: 2.5,
    cullFront: 0.6,
    near: 3,
  })),
  // ---------------------------------------------------------------- bar 15, KILL + LEVEL 10, TOWER, TAKE THEIR CORE (f1400-1499)
  {
    id: 'S29',
    f0: 1400,
    f1: 1449,
    take: 'X14',
    // a takedown and Clem's level 10 on the same tick (f1406), then cat tower 46 falls (f1442)
    anchor: { key: 'ko', frame: 1406 },
    fits: [{ key: 'tower', frame: 1442, seg: [1407, 1441] }],
    ramp: [[1400, 1], [1449, 1]],
    cam: {
      // a hard cut on the beat (f1425) to cat tower 46 up the lane (34, 51 m), whole until it falls on f1442
      target: { cut: [[1400, { mid: ['@clem', '@cacklejaw'], lift: 1 }], [1425, { point: [34000, 51000], lift: 2.4 }]] },
      keys: [{ f: 1400, dist: 1.1, pitch: 50, yaw: 0, fov: 40 }, ...punch(1406, 1.1), { f: 1424, dist: 1.05 }, { f: 1425, dist: 0.62, pitch: 20, yaw: -30, ease: 'hold' }, { f: 1449, dist: 0.7, yaw: -22, ease: 'out' }],
      smooth: 0.25,
    },
    popText: ['Takedown!', 'Level 10'],
    dmgRadius: 10,
    wide: true,
  },
  {
    id: 'S30',
    f0: 1450,
    f1: 1499,
    take: 'N',
    // the cats march on the dog core, the doghouse ahead of the lens; a tape-stop into the next bar
    anchor: { key: 'brawl', frame: 1450, offset: 15 },
    ramp: [[1450, 1], [1487, 1], [1499, 0.02]],
    cam: { target: { point: '@brawl', lift: 2 }, keys: [{ f: 1450, dist: 0.9, pitch: 30, yaw: -100, fov: 40 }, { f: 1499, dist: 0.6, ease: 'in' }], smooth: 0.2 },
    popText: [],
    dmgRadius: 10,
    cullHeroes: 2,
    wide: true,
  },
  // ---------------------------------------------------------------- bar 16, THE CORE FALLS (f1500-1599)
  {
    id: 'S31',
    f0: 1500,
    f1: 1549,
    take: 'N',
    // Lambo belly-flops the core (f1500), the core bursts on the beat + 0 (f1525)
    anchor: { key: 'flop', frame: 1500 },
    fits: [{ key: 'core', frame: 1525, seg: [1500, 1524] }],
    // after the hold the ramp runs fast: the game's own core slow motion (0.25x for 1.2 s) runs on top of it
    ramp: [[1500, 0.32], [1525, 0.32], [1526, 0], [1528, 0], [1529, 3.2], [1549, 2.4]],
    cam: { target: { point: '@core', lift: 2 }, keys: [{ f: 1500, dist: 0.6, pitch: 14, yaw: -100, fov: 40 }, ...punch(1525, 0.6), { f: 1549, dist: 0.7, ease: 'out' }], smooth: 0.15 },
    blur: [[1500, 1524]],
    popText: [],
    dmgRadius: 8,
    cullHeroes: 2,
    cullFront: 0.5,
  },
  {
    id: 'S32',
    f0: 1550,
    f1: 1599,
    take: 'N',
    anchor: { key: 'core', frame: 1556, banner: 'Victory!' },
    preroll: 300,
    ramp: [[1550, 2], [1599, 1.6]],
    cam: { target: { unit: '@hero', lift: 1.2 }, keys: [{ f: 1550, dist: 0.55, pitch: 20, yaw: -120, fov: 40 }, { f: 1599, yaw: -90, ease: 'linear' }], smooth: 0.3 },
    layers: ['pops', 'banner'],
    popText: [],
    dmgRadius: 8,
    cullHeroes: 2,
    cullFront: 0.5,
  },
];

/**
 * The 9:16 version of a shot's camera keys (storyboard §7): `portrait.keys` when given; wide shots 1.35x further and
 * 6° steeper; close-ups 1.3x further, and a side-on two-shot (|yaw| near 90 on an `align`) turned to a 40° diagonal
 * so both heroes stay in the narrow frame.
 */
export function portraitKeys(shot) {
  if (shot.portrait?.keys) return shot.portrait.keys;
  const keys = shot.cam?.keys ?? [];
  return keys.map((k) => {
    const o = { ...k };
    if (o.dist !== undefined) o.dist = Math.round(o.dist * (shot.wide ? 135 : 130)) / 100;
    if (shot.wide && o.pitch !== undefined) o.pitch = Math.min(80, o.pitch + 6);
    if (!shot.wide && shot.cam?.align && o.yaw !== undefined && Math.abs(Math.abs(o.yaw) - 90) < 45) o.yaw = Math.sign(o.yaw) * 40;
    return o;
  });
}
