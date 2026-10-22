/**
 * Trailer v3 shot list as data: 30.000 s, 144 BPM (25 frames per beat, 100 per bar), 60 fps. v1 ("Meet Gabe") is
 * shots-v1.mjs. capture.mjs turns each entry plus its take (takes.json) into a harness ShotSpec per aspect. Frames are
 * the master's output frames; cuts land on beats, contacts on the beat or beat + 3.
 *
 *   take      takes.json id; `anchor` puts a key tick (+ offset) on a frame; `fits: [{ key, frame, seg, offset? }]`
 *             stretch the ramp on each segment so that key is crossed ON its frame (solved in order)
 *   cam       director camera: target (roles from the take: '@clem' = its slot) and keys (director.ts); `align`
 *             turns the line a -> b to run down the screen (b nearest the lens) and the keys' yaw is added on top
 *   blur      [[a, b], ...]: frames rendered as 32 sub-frames (`shutter` share of the frame integrated)
 *   xray      a tower or core in front of the subject is not drawn (`xrayMode` 'hide', the v3 default)
 *   looks     [[fromFrame, card], ...]: the same frames once per card look (cosmetic only)
 *   wide      9:16 frames it 1.35x further and 6° steeper; close-ups 1.3x and a turned side-on yaw (portraitKeys)
 *   aspects   the masters a shot is captured for (default both); `portrait.f1` runs a take on in 9:16
 *
 * v3 (review of the v2 redo): every director shot drops the base banners and culls trees, rocks and props between
 * the lens and the subject (harness `cullLens` / `cullLos`, render only); x-ray hides a foreground structure instead
 * of a 28 % ghost; afterimages are off in close-ups. The title is one bar of three hits (a cat hit, the clash, a dog
 * hit); 3V3 is two close cuts (each side); Pack Hunt slows only round each takedown; the mid section is a ping, Pudding,
 * a full-bar tower dive and the tower toppling (the new render fall); bar 12 opens on COMEBACK at the base; the final
 * bar is Clem's level-10 takedown, the march, the core bursting under the flop and a 25-frame Victory; the end card
 * starts on the f1600 downbeat.
 */

/** A 4-frame lens punch on frame f: distance -0.05 on f+1, back by f+4. */
const punch = (f, dist) => [{ f, dist }, { f: f + 1, dist: dist - 0.05, ease: 'out' }, { f: f + 4, dist, ease: 'out' }];
const ULTS = ['Golden Hour!', 'Moonshot!', 'Champion’s Challenge!', "Champion's Challenge!", 'Short Circuit!', 'Pack Hunt!', 'Curtains Up!', 'Under Her Spell!', 'Tangled Lights!'];
/** Close-up clean-up shared by most shots. */
const CLOSE = { dmgRadius: 4, cullHeroes: 2.5, cullFront: 0.6, cullMinions: 0.4 };

export const SHOTS = [
  // ---------------------------------------------------------------- bar 1, HOOK (f0-99)
  {
    id: 'S01',
    f0: 0,
    f1: 49,
    take: 'X14',
    // frame 0: Lambo mid-air in the 5 m Belly Flop, side-on and low against the sky; contact f25 held 3 frames, then
    // the lens backs off so the star ring and the three dogs separate
    lead: 30,
    anchor: { key: 'lamboE', frame: 0, offset: 3 },
    fits: [{ key: 'lamboE', offset: 8, frame: 25, seg: [0, 24] }],
    ramp: [[-30, 1], [-8, 1], [0, 0.3, 'out'], [22, 0.3], [24, 0.5, 'in'], [25, 0.5], [26, 0], [28, 0], [29, 0.8, 'out'], [49, 1]],
    cam: {
      target: { unit: '@lambo', lift: 1.4 },
      align: { a: '@lambo', b: '@cacklejaw' },
      keys: [{ f: -30, dist: 0.5, pitch: 4, yaw: 90, fov: 36, lift: 1.9 }, { f: 0, dist: 0.5, pitch: 4, yaw: 90, lift: 1.9 }, { f: 24, dist: 0.46, pitch: 8, yaw: 90, lift: 1.4 }, { f: 25, dist: 0.5, pitch: 10, ease: 'out' }, { f: 28, dist: 0.5 }, { f: 49, dist: 0.66, pitch: 20, yaw: 80, ease: 'out' }],
      smooth: 0.12,
    },
    blur: [[0, 23]],
    shutter: 0.25,
    popText: ['Takedown!'],
    dmgRadius: 3,
    cullHeroes: 2.5,
    cullMinions: 0.3,
    xray: true,
  },
  {
    id: 'S02',
    f0: 50,
    f1: 74,
    take: 'X5',
    anchor: { key: 'cast', frame: 52 },
    ramp: [[50, 1], [52, 1], [53, 0], [55, 0], [56, 0.6], [68, 0.6], [69, 1]],
    cam: { target: { mid: ['@star', '@v1'], lift: 1.1 }, align: { a: '@star', b: '@v1' }, keys: [{ f: 50, dist: 0.46, pitch: 14, yaw: 70, fov: 40 }, ...punch(52, 0.46)], smooth: 0.1 },
    popText: ['Takedown!'],
    ...CLOSE,
    cullHeroes: 3,
    cullFront: 0.8,
    xray: true,
  },
  {
    id: 'S03',
    f0: 75,
    f1: 99,
    take: 'X3',
    // Sage's Moonshot point-blank through a dog (KO, shut down) on f78, side-on; a whip-out into the title
    anchor: { key: 'hit', frame: 78 },
    ramp: [[75, 1], [78, 1], [79, 0], [81, 0], [82, 0.5], [95, 0.5], [96, 1.6, 'in'], [99, 1.6]],
    cam: {
      target: { mid: ['@star', '@v1'], lift: 1.2 },
      align: { a: '@star', b: '@v1' },
      keys: [{ f: 75, dist: 0.44, pitch: 10, yaw: 90, fov: 36 }, ...punch(78, 0.44), { f: 95, dist: 0.46, yaw: 90 }, { f: 99, dist: 0.52, yaw: 140, ease: 'in' }],
      smooth: 0.1,
    },
    blur: [[96, 99]],
    popText: ['Moonshot!', 'Takedown!'],
    ...CLOSE,
    xray: true,
  },
  // ---------------------------------------------------------------- bar 2, TITLE (f100-199): CATS / VS / DOGS on three hits
  {
    id: 'T1',
    f0: 100,
    f1: 124,
    take: 'X4',
    // CATS: Clem's Q3 launcher and somersault, KO on the bridge (f103)
    anchor: { key: 'q3', frame: 103 },
    ramp: [[100, 1], [103, 1], [104, 0], [106, 0], [107, 0.5], [124, 0.5]],
    cam: { target: { unit: '@clem', lift: 1.1 }, align: { a: '@clem', b: '@v1' }, keys: [{ f: 100, dist: 0.42, pitch: 14, yaw: -90, fov: 38 }, ...punch(103, 0.42), { f: 124, dist: 0.44 }], smooth: 0.1 },
    blur: [[107, 118]],
    shutter: 0.3,
    popText: ['Takedown!'],
    ...CLOSE,
    near: 3,
  },
  {
    id: 'T2',
    f0: 125,
    f1: 149,
    take: 'C',
    // VS: both waves and teams meet at the river (f128), at hero height, side-on to the clash
    anchor: { key: 'clash', frame: 128 },
    ramp: [[125, 1.4], [128, 1.4], [129, 0], [130, 0], [131, 0.6], [149, 0.6]],
    cam: { target: { point: '@clash', lift: 1.3 }, keys: [{ f: 125, dist: 0.48, pitch: 8, yaw: 0, fov: 38 }, ...punch(128, 0.48), { f: 149, dist: 0.44, yaw: -10 }], smooth: 0.15 },
    popText: [],
    dmgRadius: 6,
    cullHeroes: 2.5,
    cullMinions: 1.5,
  },
  {
    id: 'T3',
    f0: 150,
    f1: 199,
    take: 'G',
    // DOGS: Cacklejaw's ambush pounce out of the bush, both claws down on the cat (f153); whip-out into the roll call
    lead: 14,
    anchor: { key: 'leap', frame: 140 },
    fits: [{ key: 'hit', frame: 153, seg: [141, 152] }],
    ramp: [[136, 1], [140, 1], [141, 0.3], [152, 0.3], [153, 0.3], [154, 0], [156, 0], [157, 0.6], [192, 0.6], [193, 1.6, 'in'], [199, 1.6]],
    cam: { target: { unit: '@hero', lift: 1.2 }, align: { a: '@hero', b: '@victim' }, keys: [{ f: 136, dist: 0.4, pitch: 3, yaw: 270, fov: 38 }, { f: 152, dist: 0.36 }, ...punch(153, 0.36), { f: 192, dist: 0.42 }, { f: 199, dist: 0.5, yaw: 320, ease: 'in' }], smooth: 0.1 },
    blur: [[141, 152], [193, 199]],
    shutter: 0.3,
    popText: ['Takedown!'],
    ...CLOSE,
  },
  // ---------------------------------------------------------------- bars 3-4, ROLL CALL (f200-399)
  {
    id: 'S05',
    f0: 200,
    f1: 224,
    take: 'X4',
    // Clem's Tumble: a forward roll over 4 m
    anchor: { key: 'e', frame: 203 },
    cam: { target: { unit: '@clem', lift: 1 }, align: { a: '@clem', b: '@v1' }, keys: [{ f: 200, dist: 0.42, pitch: 10, yaw: 90, fov: 40 }, { f: 224, dist: 0.4 }], smooth: 0.12 },
    blur: [[203, 215]],
    shutter: 0.35,
    popText: [],
    ...CLOSE,
    cullFront: 0.8,
    near: 3,
  },
  {
    id: 'S06',
    f0: 225,
    f1: 249,
    take: 'X11',
    // Sage's Hop Back: the backflip in silhouette, low against the sky (side-on to the hop)
    anchor: { key: 'cast', frame: 228 },
    ramp: [[225, 1], [230, 1], [231, 0.45], [241, 0.45], [242, 1]],
    cam: { target: { unit: '@star', lift: 1.5 }, align: { a: '@star', b: '@v1' }, keys: [{ f: 225, dist: 0.4, pitch: 2, yaw: 0, fov: 40, lift: 1.7 }, { f: 249, dist: 0.38 }], smooth: 0.12 },
    blur: [[231, 241]],
    shutter: 0.3,
    popText: [],
    ...CLOSE,
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
    cam: { target: { mid: ['@hero', '@victim'], lift: 1.1 }, align: { a: '@hero', b: '@victim' }, keys: [{ f: 250, dist: 0.48, pitch: 12, yaw: -90, fov: 40 }, { f: 274, dist: 0.44 }], smooth: 0.1 },
    popText: [],
    ...CLOSE,
    cullHeroes: 3.5,
    cullFront: 0.8,
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
    cam: { target: { unit: '@star', lift: 1 }, align: { a: '@v1', b: '@star' }, keys: [{ f: 275, dist: 0.5, pitch: 18, yaw: 70, fov: 40 }, { f: 299, dist: 0.46 }], smooth: 0.12 },
    blur: [[278, 286]],
    shutter: 0.35,
    popText: ['Takedown!'],
    ...CLOSE,
    cullFront: null,
    hidePudding: true,
  },
  {
    id: 'S09',
    f0: 300,
    f1: 324,
    take: 'E',
    // Aviete's Short Circuit: the axe-kick heel-down and the rebound backflip
    anchor: { key: 'cast', frame: 303 },
    ramp: [[300, 1], [303, 1], [304, 0], [305, 0], [306, 0.6], [318, 0.6], [319, 1]],
    cam: { target: { mid: ['@hero', '@target'], lift: 1.1 }, keys: [{ f: 300, dist: 0.44, pitch: 14, yaw: 0, fov: 40 }, { f: 324, dist: 0.42 }], smooth: 0.12 },
    blur: [[306, 318]],
    shutter: 0.35,
    popText: ['Short Circuit!'],
    ...CLOSE,
    cullHeroes: 3.5,
    cullFront: 0.8,
  },
  {
    id: 'S10',
    f0: 325,
    f1: 349,
    take: 'X7',
    // Bengas's Striking Pose: spin-in, frozen vogue, the camera-flash wedge over three stunned cats (front three-quarter)
    anchor: { key: 'windup', frame: 326 },
    ramp: [[325, 1], [342, 1], [343, 0.15], [346, 0.15], [347, 1]],
    cam: { target: { mid: ['@star', '@v1'], lift: 1.1 }, align: { a: '@star', b: '@v1' }, keys: [{ f: 325, dist: 0.52, pitch: 12, yaw: 80, fov: 40 }, { f: 349, dist: 0.5 }], smooth: 0.12 },
    popText: ['Striking Pose!'],
    dmgRadius: 5,
    cullHeroes: 2.5,
    cullMinions: 0.4,
  },
  {
    id: 'S11',
    f0: 350,
    f1: 374,
    take: 'X12',
    // Gabe's Chase the Wind: a gliding barrel roll, side-on
    anchor: { key: 'cast', frame: 353 },
    ramp: [[350, 1], [355, 0.7], [365, 0.7], [366, 1]],
    cam: { target: { unit: '@star', lift: 1.2 }, align: { a: '@star', b: '@v1' }, keys: [{ f: 350, dist: 0.45, pitch: 8, yaw: 90, fov: 40 }, { f: 374, dist: 0.42 }], smooth: 0.12 },
    blur: [[355, 365]],
    shutter: 0.35,
    popText: [],
    ...CLOSE,
  },
  {
    id: 'S12',
    f0: 375,
    f1: 399,
    take: 'X6',
    // Lambo's Tangled Lights: two accelerating spins, then the haul lands on f392 (from the side, Pudding not drawn)
    anchor: { key: 'windup', frame: 375 },
    fits: [{ key: 'cast', frame: 392, seg: [375, 391] }],
    ramp: [[375, 1], [392, 1], [393, 0.5], [399, 0.5]],
    cam: { target: { mid: ['@star', '@v1'], lift: 1.1 }, align: { a: '@star', b: '@v1' }, keys: [{ f: 375, dist: 0.55, pitch: 14, yaw: 270, fov: 40 }, { f: 399, dist: 0.5, ease: 'in' }], smooth: 0.15 },
    popText: ['Tangled Lights!'],
    dmgRadius: 5,
    cullHeroes: 2.5,
    cullMinions: 0.4,
    hidePudding: true,
  },
  // ---------------------------------------------------------------- bar 5, 3V3 IN YOUR BROWSER (f400-499): one cut per side
  {
    id: 'S13a',
    f0: 400,
    f1: 449,
    take: 'X4',
    // behind the three cats, the dogs facing them; Bengas's stun flash lands under IN YOUR BROWSER (f425)
    anchor: { key: 'bengasW', frame: 425 },
    cam: { target: { mid: ['@lambo', '@v1'], lift: 1.3 }, align: { a: '@v1', b: '@lambo' }, keys: [{ f: 400, dist: 0.56, pitch: 14, yaw: 28, fov: 40 }, { f: 449, dist: 0.52, yaw: 36, ease: 'linear' }], smooth: 0.3 },
    xray: true,
    popText: ['Striking Pose!'],
    dmgRadius: 6,
    cullMinions: 1,
  },
  {
    id: 'S13b',
    f0: 450,
    f1: 499,
    take: 'X4',
    // the reverse: behind the dogs, Cacklejaw's Pack Hunt leaps at the cats (f477)
    anchor: { key: 'cackR', frame: 477 },
    cam: { target: { mid: ['@lambo', '@v1'], lift: 1.3 }, align: { a: '@lambo', b: '@v1' }, keys: [{ f: 450, dist: 0.54, pitch: 14, yaw: -28, fov: 40 }, { f: 499, dist: 0.5, yaw: -36, ease: 'linear' }], smooth: 0.3 },
    xray: true,
    popText: ['Pack Hunt!', 'Takedown!'],
    dmgRadius: 6,
    cullMinions: 1,
  },
  // ---------------------------------------------------------------- bars 6-8, ULTS (f500-799)
  {
    id: 'S14',
    f0: 500,
    f1: 549,
    take: 'B',
    // Sage's Moonshot: the full draw facing the lens (f500-524), then a lens beside the target: the arrow streaks in
    // across the frame to the bullseye on f541
    anchor: { key: 'release', frame: 525 },
    fits: [{ key: 'hit', frame: 541, seg: [526, 540] }],
    ramp: [[500, 1], [524, 1], [525, 1.0], [541, 1.0], [542, 0], [545, 0], [546, 0.4], [549, 0.4]],
    cam: {
      target: { cut: [[500, { unit: '@hero', lift: 1.4 }], [525, { proj: '@hero', from: 525, fallback: '@target', lift: 1.3 }], [538, { unit: '@target', lift: 1.2 }]] },
      align: { a: '@hero', b: '@target' },
      keys: [
        { f: 500, dist: 0.34, pitch: 8, yaw: 150, fov: 40 },
        { f: 524, dist: 0.28, ease: 'out' },
        { f: 525, dist: 0.42, pitch: 8, yaw: 90, ease: 'hold' },
        { f: 537, dist: 0.42 },
        { f: 538, dist: 0.32, pitch: 6, yaw: 60, ease: 'hold' },
        { f: 540, dist: 0.32 },
        ...punch(541, 0.32),
        { f: 549, dist: 0.34 },
      ],
      smooth: 0.02,
    },
    bolts: true,
    popText: ['Moonshot!'],
    dmgRadius: 4,
    cullHeroes: 7,
    cullMinions: 0.5,
  },
  {
    id: 'S15',
    f0: 550,
    f1: 599,
    take: 'F',
    // Bengas's Curtains Up!: he steps out of the bush into the bow (cast f545, before the cut), then a crane up as the
    // stage arms (cast + 18 ticks on f575)
    lead: 10,
    anchor: { key: 'cast', frame: 545 },
    fits: [{ key: 'cast', offset: 18, frame: 575, seg: [546, 574] }],
    ramp: [[540, 1], [575, 1], [576, 1.3], [599, 1.3]],
    cam: {
      target: { blend: [{ unit: '@hero', lift: 1.1 }, { point: '@stage', lift: 1 }], f0: 560, f1: 575 },
      keys: [{ f: 540, dist: 0.46, pitch: 10, yaw: 300, fov: 40 }, { f: 556, dist: 0.46, pitch: 10 }, { f: 575, dist: 0.76, pitch: 30, yaw: 310, ease: 'ease' }, { f: 599, yaw: 320 }],
      smooth: 0.12,
    },
    xray: true,
    popText: ['Curtains Up!'],
    dmgRadius: 6,
    cullHeroes: 3,
    cullMinions: 0.5,
  },
  {
    id: 'S16',
    f0: 600,
    f1: 649,
    take: 'X8',
    // Gabe's Under Her Spell: the twirl (front three-quarter), then the heart wavefront charms three dogs (f622)
    anchor: { key: 'windup', frame: 600 },
    fits: [{ key: 'cast', frame: 622, seg: [600, 621] }],
    ramp: [[600, 1], [622, 1], [623, 0], [625, 0], [626, 1]],
    cam: { target: { cut: [[600, { unit: '@star', lift: 1.1 }], [622, { mid: ['@star', '@v1'], lift: 1.1 }]] }, align: { a: '@star', b: '@v1' }, keys: [{ f: 600, dist: 0.4, pitch: 10, yaw: 40, fov: 40 }, { f: 621, dist: 0.38 }, { f: 622, dist: 0.62, pitch: 18, yaw: 60, ease: 'hold' }, { f: 649, dist: 0.58, yaw: 70 }], smooth: 0.1 },
    xray: true,
    popText: ['Under Her Spell!'],
    dmgRadius: 6,
    cullHeroes: 3,
    cullMinions: 0.5,
  },
  {
    id: 'S17',
    f0: 650,
    f1: 699,
    take: 'U3',
    // Sir Brutus's Champion's Challenge: the sand obelisks rise past a low lens
    anchor: { key: 'cast', frame: 655 },
    ramp: [[650, 1], [655, 1], [656, 0.6], [673, 0.6], [674, 1]],
    cam: { target: { unit: '@caster', lift: 1.6 }, keys: [{ f: 650, dist: 0.5, pitch: 5, yaw: -60, fov: 42 }, { f: 699, dist: 0.54, yaw: -25, ease: 'out' }], smooth: 0.1 },
    popText: ['Champion’s Challenge!', "Champion's Challenge!"],
    ...CLOSE,
    cullHeroes: 3,
    xray: true,
  },
  {
    id: 'S18',
    f0: 700,
    f1: 749,
    take: 'X1',
    // Aviete: Short Circuit's axe-kick on one dog (f703), side-on and close; then the Spark Swipe takedown (f729)
    anchor: { key: 'r', frame: 703 },
    fits: [{ key: 'q', frame: 729, seg: [706, 728] }],
    ramp: [[700, 1], [703, 1], [704, 0], [706, 0], [707, 1], [729, 1], [730, 0], [732, 0], [733, 0.5], [749, 0.5]],
    cam: { target: { mid: ['@star', '@v1'], lift: 1.2 }, align: { a: '@star', b: '@v1' }, keys: [{ f: 700, dist: 0.42, pitch: 10, yaw: 90, fov: 40 }, ...punch(703, 0.42), { f: 749, dist: 0.46, yaw: 75 }], smooth: 0.1 },
    xray: true,
    popText: ['Short Circuit!', 'Takedown!'],
    ...CLOSE,
    cullHeroes: 3,
  },
  {
    id: 'S19',
    f0: 750,
    f1: 799,
    take: 'X9',
    // Clem's Golden Hour (the gold pillar, looking up), then one Q: a double takedown on f764
    anchor: { key: 'r', frame: 752 },
    fits: [{ key: 'q', frame: 764, seg: [753, 763] }],
    ramp: [[750, 1], [764, 1], [765, 0], [767, 0], [768, 0.5], [799, 0.5]],
    cam: {
      target: { unit: '@star', lift: 1 },
      keys: [{ f: 750, dist: 0.42, pitch: 6, yaw: -30, fov: 40, lift: 1.8 }, { f: 763, dist: 0.42, pitch: 6, lift: 1.8 }, { f: 764, dist: 0.55, pitch: 20, lift: 1.1, ease: 'out' }, { f: 799, yaw: -10, ease: 'linear' }],
      smooth: 0.1,
    },
    popText: ['Golden Hour!', 'Takedown!'],
    ...CLOSE,
    cullHeroes: 3,
    xray: true,
  },
  // ---------------------------------------------------------------- bar 9, PACK HUNT (f800-899): three takedowns on three beats
  {
    id: 'S20',
    f0: 800,
    f1: 899,
    take: 'X2',
    // front three-quarter on Cacklejaw; the clock runs at 0.35 between the takedowns and drops to 0.1 only round each
    anchor: { key: 'r', frame: 803 },
    fits: [{ key: 'ko1', frame: 825, seg: [804, 824] }, { key: 'ko2', frame: 850, seg: [829, 849] }, { key: 'ko3', frame: 875, seg: [854, 874] }],
    ramp: [[800, 1], [803, 1], [804, 0.35], [819, 0.35], [822, 0.12, 'in'], [825, 0.12], [826, 0], [828, 0], [829, 0.6], [844, 0.6], [847, 0.12, 'in'], [850, 0.12], [851, 0], [853, 0], [854, 0.6], [869, 0.6], [872, 0.12, 'in'], [875, 0.12], [876, 0], [878, 0], [879, 1], [899, 1]],
    cam: { target: { mid: ['@star', '@v1'], lift: 1.1 }, align: { a: '@star', b: '@v1' }, keys: [{ f: 800, dist: 0.44, pitch: 14, yaw: -40, fov: 40 }, ...punch(825, 0.42), ...punch(850, 0.42), ...punch(875, 0.42), { f: 899, dist: 0.46, yaw: -30 }], smooth: 0.2 },
    blur: [[804, 822]],
    shutter: 0.3,
    xray: true,
    popText: ['Pack Hunt!', 'Takedown!', 'Combo x2', 'Combo x3'],
    dmgRadius: 5,
    cullHeroes: 2.5,
    cullMinions: 0.5,
  },
  // ---------------------------------------------------------------- bar 10 (f900-949): ping (half a beat), Pudding
  {
    id: 'S21',
    f0: 900,
    f1: 912,
    take: 'J',
    // the wheel opens on the hero and the ping lands on f906 (the ally's answer is captioned large by mg)
    anchor: { key: 'ping1', frame: 906 },
    wheel: { open: 900, close: 906, at: [0.5, 0.5] },
    wheelScale: 2.6,
    cam: { target: { unit: '@hero', lift: 1 }, keys: [{ f: 900, dist: 0.48, pitch: 30, yaw: 0, fov: 40 }, { f: 912, dist: 0.44 }], smooth: 0.2 },
    layers: ['pops', 'wheel'],
    popText: [],
    dmgRadius: 4,
    cullMinions: 0.5,
  },
  {
    id: 'S22',
    f0: 913,
    f1: 949,
    take: 'K',
    // Pudding bounces (f925): the subject, low and close, a punch on the boing
    anchor: { key: 'bounce', frame: 925 },
    ramp: [[913, 1], [925, 1], [926, 0.5], [949, 0.5]],
    cam: { target: { unit: '@pudding', lift: 1.4 }, keys: [{ f: 913, dist: 0.46, pitch: 10, yaw: 340, fov: 40 }, ...punch(925, 0.46), { f: 949, dist: 0.48, yaw: 330 }], smooth: 0.12 },
    popText: [],
    dmgRadius: 5,
    cullHeroes: 3,
    cullFront: 0.5,
    cullMinions: 0.5,
  },
  // ---------------------------------------------------------------- f950-1049: the tower dive, a full bar
  {
    id: 'S23',
    f0: 950,
    f1: 1049,
    take: 'X13',
    // behind Sir Brutus under the cat tower: its range ring and its shots in frame, the takedown on f1003, the walk-out
    anchor: { key: 'ko', frame: 1003 },
    ramp: [[950, 1], [1003, 1], [1004, 0], [1006, 0], [1007, 0.5], [1020, 0.5], [1021, 1.3], [1049, 1.3]],
    cam: {
      target: { mid: ['@star', '@tower'], lift: 1.8 },
      align: { a: '@tower', b: '@star' },
      keys: [{ f: 950, dist: 0.62, pitch: 18, yaw: 20, fov: 40 }, { f: 1002, dist: 0.55 }, ...punch(1003, 0.52), { f: 1049, dist: 0.6, yaw: 35 }],
      smooth: 0.15,
    },
    layers: ['pops'],
    xray: false,
    bolts: true,
    popText: ['Takedown!'],
    dmgRadius: 6,
    cullHeroes: 3,
    cullMinions: 0.5,
  },
  // ---------------------------------------------------------------- f1050-1099: the dog tower topples (the new render fall)
  {
    id: 'S24',
    f0: 1050,
    f1: 1099,
    take: 'T',
    // low, side-on to the fall, the cats at its foot: the crack, the topple, the ground impact on f1078 (slowed)
    lead: 30,
    anchor: { key: 'tower', frame: 1044 },
    ramp: [[1020, 1], [1066, 1], [1068, 0.45, 'in'], [1086, 0.45], [1088, 1, 'out'], [1099, 1]],
    cam: { target: { point: '@tower', lift: 2.2 }, keys: [{ f: 1020, dist: 0.62, pitch: 6, yaw: -150, fov: 40 }, { f: 1099, dist: 0.68, pitch: 9, yaw: -140, ease: 'out' }], smooth: 0.15 },
    xray: false,
    popText: [],
    dmgRadius: 8,
    cullHeroes: 2,
    cullMinions: 0.5,
    hidePudding: true,
  },
  // ---------------------------------------------------------------- bars 12-13: COMEBACK, three fights, card looks, the HUD
  {
    id: 'S25',
    f0: 1100,
    f1: 1124,
    take: 'E2',
    // COMEBACK (the underdog waves start on 13440): Lambo answers at his own base with a hit on the diving Brutus
    anchor: { key: 'comeback', frame: 1100 },
    cam: { target: { mid: ['@lambo', '@brutus2'], lift: 1.2 }, align: { a: '@lambo', b: '@brutus2' }, keys: [{ f: 1100, dist: 0.38, pitch: 10, yaw: 80, fov: 40 }, { f: 1124, dist: 0.34, yaw: 95 }], smooth: 0.12 },
    popText: [],
    ...CLOSE,
  },
  {
    id: 'S25b',
    f0: 1125,
    f1: 1174,
    take: 'U4',
    // Bengas Q and Aviete E hit three dogs (f1137), then Lambo's Belly Flop lands on all three (f1150)
    lead: 30,
    anchor: { key: 'aviHit', frame: 1137 },
    fits: [{ key: 'lamboLand', frame: 1150, seg: [1138, 1149] }],
    ramp: [[1095, 1], [1137, 1], [1138, 0.35], [1149, 0.35], [1150, 0], [1152, 0], [1153, 0.8], [1174, 0.8]],
    cam: { target: { mid: ['@brutus', '@cack'], lift: 1.3 }, align: { a: '@lambo', b: '@brutus' }, keys: [{ f: 1095, dist: 0.52, pitch: 12, yaw: 90, fov: 40 }, { f: 1125, dist: 0.52 }, ...punch(1150, 0.52), { f: 1174, dist: 0.58, yaw: 105 }], smooth: 0.12 },
    blur: [[1138, 1149]],
    shutter: 0.3,
    popText: ['Takedown!'],
    ...CLOSE,
    xray: true,
  },
  {
    id: 'S27b',
    f0: 1175,
    f1: 1224,
    take: 'U5',
    // at the dog base: Clem's Q cuts three dogs (f1178), and again (f1203)
    anchor: { key: 'clemQ1', frame: 1178 },
    fits: [{ key: 'clemQ2', frame: 1203, seg: [1181, 1202] }],
    ramp: [[1175, 1], [1178, 1], [1179, 0], [1180, 0], [1181, 0.5], [1203, 0.5], [1204, 0], [1205, 0], [1206, 1], [1224, 1]],
    cam: { target: { unit: '@clem', lift: 1.1 }, align: { a: '@clem', b: '@brutus' }, keys: [{ f: 1175, dist: 0.46, pitch: 12, yaw: -90, fov: 40 }, ...punch(1178, 0.46), ...punch(1203, 0.46), { f: 1224, dist: 0.5, yaw: -110 }], smooth: 0.12 },
    popText: ['Takedown!'],
    ...CLOSE,
    xray: true,
  },
  {
    id: 'S27c',
    f0: 1225,
    f1: 1249,
    take: 'M',
    // Bengas finishes a dog: a takedown and a shut down on f1228
    anchor: { key: 'ko2', frame: 1228 },
    ramp: [[1225, 1], [1228, 1], [1229, 0], [1231, 0], [1232, 0.6], [1249, 0.6]],
    cam: { target: { mid: ['@bengas', '@victim'], lift: 1.1 }, align: { a: '@bengas', b: '@victim' }, keys: [{ f: 1225, dist: 0.46, pitch: 12, yaw: 90, fov: 40 }, ...punch(1228, 0.46), { f: 1249, dist: 0.5, yaw: 100 }], smooth: 0.12 },
    popText: ['Takedown!', 'Shut down!'],
    ...CLOSE,
    xray: true,
  },
  {
    id: 'S26',
    f0: 1250,
    f1: 1274,
    take: 'E',
    // one beat of card looks: Aviete's axe-kick, a locked mid shot, three looks on hard cuts (the wipe is the edit's)
    anchor: { key: 'cast', frame: 1262 },
    looks: [[1250, 'demo-ficus'], [1258, 'demo-pinkie'], [1266, 'demo-rascal']],
    cam: { target: { unit: '@hero', lift: 1.1 }, keys: [{ f: 1250, dist: 0.24, pitch: 8, yaw: -30, fov: 40 }], smooth: 0.15 },
    popText: [],
    ...CLOSE,
    cullHeroes: 3.5,
    cullFront: 0.4,
    // 9:16 leaves the landscape HUD out: the last look runs on to the double-time bar
    portrait: { f1: 1299 },
  },
  {
    id: 'S27',
    f0: 1275,
    f1: 1299,
    take: 'X14',
    // the real game: full HUD, the game's own follow camera, on Cacklejaw's E (the cooldown sweep on the HUD); 16:9 only
    anchor: { key: 'cackE', frame: 1282 },
    cam: null,
    layers: ['hud'],
    aspects: ['16x9'],
  },
  // ---------------------------------------------------------------- bar 14, FINAL TEAMFIGHT (f1300-1399): eighth-note cuts on X14
  ...[
    ['S28a', 1300, 1312, 'lamboE', '@lambo', { dist: 0.5, pitch: 10, yaw: 90 }, [[1300, 1.2]], null, { a: '@lambo', b: '@cacklejaw' }],
    ['S28b', 1313, 1324, 'bengasR', '@bengas', { dist: 0.6, pitch: 26, yaw: 30 }],
    ['S28c', 1325, 1337, 'clemR', '@clem', { dist: 0.42, pitch: 6, yaw: -40, lift: 1.7 }],
    ['S28d', 1338, 1349, 'lamboR', '@lambo', { dist: 0.62, pitch: 20, yaw: 100 }],
    ['S28e', 1350, 1362, 'brutusR', '@brutus', { dist: 0.5, pitch: 6, yaw: -70 }],
    ['S28f', 1363, 1374, 'bengasW', '@bengas', { dist: 0.5, pitch: 10, yaw: 140 }],
    ['S28g', 1375, 1387, 'clemQ', '@clem', { dist: 0.42, pitch: 10, yaw: -90 }],
    ['S28h', 1388, 1399, 'cackR', '@cacklejaw', { dist: 0.46, pitch: 14, yaw: 200 }, null, [[1390, 1394]]],
  ].map(([id, f0, f1, key, unit, k, ramp, blur, align]) => ({
    id,
    f0,
    f1,
    take: 'X14',
    anchor: { key, frame: f0 + 2 },
    ...(ramp ? { ramp } : {}),
    ...(blur ? { blur, shutter: 0.25 } : {}),
    cam: { target: { unit, lift: k.lift ?? 1.1 }, ...(align ? { align } : {}), keys: [{ f: f0, fov: 40, ...k }, { f: f1, dist: k.dist * 0.92 }], smooth: 0.08 },
    xray: true,
    popText: [...ULTS, 'Takedown!'],
    ...CLOSE,
    near: 3,
  })),
  // ---------------------------------------------------------------- bar 15 (f1400-1499): KO + LEVEL 10, TAKE THEIR CORE
  {
    id: 'S29',
    f0: 1400,
    f1: 1449,
    take: 'X14',
    // a takedown and Clem's level 10 on the same tick (f1403), tight on Clem as the level pillar rises
    anchor: { key: 'ko', frame: 1403 },
    ramp: [[1400, 1], [1403, 1], [1404, 0], [1406, 0], [1407, 0.5], [1430, 0.5], [1431, 1], [1449, 1]],
    cam: { target: { unit: '@clem', lift: 1.3 }, keys: [{ f: 1400, dist: 0.42, pitch: 8, yaw: 20, fov: 40 }, ...punch(1403, 0.42), { f: 1449, dist: 0.48, pitch: 12, yaw: 45, ease: 'out' }], smooth: 0.12 },
    popText: ['Takedown!', 'Level 10'],
    ...CLOSE,
    xray: true,
  },
  {
    id: 'S30',
    f0: 1450,
    f1: 1499,
    take: 'N',
    // the cats march on the dog core (seen whole, no x-ray), which fills the lower frame under the type; tape-stop
    anchor: { key: 'brawl', frame: 1450, offset: 15 },
    ramp: [[1450, 1], [1487, 1], [1499, 0.02]],
    cam: { target: { point: '@core', lift: 2.6 }, keys: [{ f: 1450, dist: 0.7, pitch: 10, yaw: 165, fov: 40 }, { f: 1499, dist: 0.55, ease: 'in' }], smooth: 0.2 },
    xray: false,
    popText: [],
    dmgRadius: 6,
    cullHeroes: 2,
    cullMinions: 0,
    wide: true,
  },
  // ---------------------------------------------------------------- bar 16 (f1500-1599): THE CORE FALLS, Victory
  {
    id: 'S31',
    f0: 1500,
    f1: 1574,
    take: 'N',
    // Lambo's flop lands beside the doghouse (low, wide: Lambo's arc and the whole core in frame) and the core bursts on
    // the same tick; the burst shows on f1528 (CORE_HIT, held 3 frames); the chunks fly, the core caves in, the game's own slow motion runs over it
    lead: 20,
    anchor: { key: 'core', frame: 1519 },
    ramp: [[1480, 1], [1500, 0.6], [1519, 0.6], [1520, 1], [1528, 1], [1529, 0], [1531, 0], [1532, 1], [1574, 1]],
    cam: { target: { point: '@core', lift: 2.1 }, keys: [{ f: 1480, dist: 0.56, pitch: 5, yaw: 140, fov: 42 }, { f: 1527, dist: 0.54 }, ...punch(1528, 0.54), { f: 1574, dist: 0.64, pitch: 8, yaw: 135, ease: 'out' }], smooth: 0.12 },
    blur: [[1506, 1519]],
    shutter: 0.3,
    xray: false,
    popText: [],
    dmgRadius: 0.1,
    cullHeroes: 1.5,
    cullMinions: 0,
  },
  {
    id: 'S32',
    f0: 1575,
    f1: 1599,
    take: 'N',
    // Victory: the winners over the rubble, a fast orbit (the same take: the core never stands up again)
    anchor: { key: 'core', frame: 1575, offset: 40 },
    ramp: [[1575, 1.2], [1599, 1.2]],
    cam: { target: { unit: '@hero', lift: 1.2 }, keys: [{ f: 1575, dist: 0.48, pitch: 10, yaw: 200, fov: 40 }, { f: 1599, dist: 0.44, yaw: 160, ease: 'linear' }], smooth: 0.1 },
    xray: false,
    popText: [],
    dmgRadius: 0.1,
    cullHeroes: 2,
    cullMinions: 0,
  },
  // ---------------------------------------------------------------- end card (f1600-1799): the eight heroes on a key colour
  {
    id: 'S40',
    f0: 1600,
    f1: 1799,
    // the whole cast in one line-up (idle loops, a slow push), laid by the end card under the logo; 9:16: two rows of four
    lobby: {
      key: '#00ff00',
      stands: [
        { hero: 'clem', x: -7, z: 0.6, face: 20 },
        { hero: 'brutus', team: 1, x: -5, z: -0.4, face: 15 },
        { hero: 'sage', x: -3, z: 0.6, face: 10 },
        { hero: 'aviete', x: -1, z: -0.4, face: 5 },
        { hero: 'gabe', x: 1, z: 0.6, face: -5 },
        { hero: 'cacklejaw', team: 1, x: 3, z: -0.4, face: -10 },
        { hero: 'lambo', x: 5, z: 0.6, face: -15 },
        { hero: 'bengas', x: 7, z: -0.4, face: -20 },
      ],
    },
    cam: { target: { p3: [0, 5.3, 0] }, keys: [{ f: 1600, dist: 0.68, pitch: 6, yaw: 0, fov: 40 }, { f: 1799, dist: 0.65, yaw: 0, ease: 'linear' }] },
    portrait: {
      stands: [
        { hero: 'clem', x: -2.7, z: -4.2, face: 15 },
        { hero: 'brutus', team: 1, x: -0.9, z: -4.2, face: 5 },
        { hero: 'sage', x: 0.9, z: -4.2, face: -5 },
        { hero: 'aviete', x: 2.7, z: -4.2, face: -15 },
        { hero: 'gabe', x: -2.7, z: 0.8, face: 15 },
        { hero: 'cacklejaw', team: 1, x: -0.9, z: 0.8, face: 5 },
        { hero: 'lambo', x: 0.9, z: 0.8, face: -5 },
        { hero: 'bengas', x: 2.7, z: 0.8, face: -15 },
      ],
      keys: [{ f: 1600, dist: 0.9, pitch: 18, yaw: 0, fov: 40 }, { f: 1799, dist: 0.87, yaw: 0, ease: 'linear' }],
      target: { p3: [0, 6.3, 0] },
    },
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
