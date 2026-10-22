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
 *   shutter   the blurred frames' shutter (share of the frame integrated; 0.5 = 180°, 0.25 = 90° for rides)
 *   cullMinions / minionsOff   creeps between the lens and the subject are not drawn (render only)
 *
 * Redo after the v2 review: frame 0 is Lambo airborne side-on (X14's 5 m Belly Flop), the dead mid section (ping,
 * Pudding, tower dive) is one bar, the tower fall and the core fall play whole at hero height, COMEBACK lands on a
 * level-10 spike, bars 12-13 are three more teamfight beats, and the core fall and Victory are one continuous take
 * (no second collapse). The end card starts on f1650 (2.5 s).
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
    take: 'X14',
    // frame 0: Lambo mid-air in a 5 m Belly Flop (the take-off is drawn live in the lead frames), low against the sky;
    // he lands on three dogs on f25, held 3 frames, then the lens pulls back on the star ring
    lead: 30,
    anchor: { key: 'lamboE', frame: 0, offset: 3 },
    fits: [{ key: 'lamboE', offset: 8, frame: 25, seg: [0, 24] }],
    ramp: [[-30, 1], [-8, 1], [0, 0.3, 'out'], [22, 0.3], [24, 0.5, 'in'], [25, 0.5], [26, 0], [28, 0], [29, 0.8, 'out'], [49, 1]],
    cam: {
      target: { unit: '@lambo', lift: 1.3 },
      keys: [{ f: -30, dist: 0.5, pitch: 6, yaw: -60, fov: 36, lift: 1.8 }, { f: 0, dist: 0.48, pitch: 6, yaw: -60, lift: 1.8 }, { f: 24, dist: 0.4, pitch: 10, yaw: -66, lift: 1.3 }, { f: 25, dist: 0.36, ease: 'out' }, { f: 28, dist: 0.36 }, { f: 49, dist: 0.6, pitch: 22, yaw: -50, ease: 'out' }],
      smooth: 0.12,
    },
    blur: [[0, 23]],
    shutter: 0.3,
    popText: ['Takedown!'],
    dmgRadius: 3,
    cullHeroes: 2.5,
    cullMinions: 0.3,
    near: 5,
    // 9:16 frames 1.3x further: the banner pole between lens and dive is clipped by a farther near plane
    portrait: { near: 9 },
    xray: true,
  },
  {
    id: 'S02',
    f0: 50,
    f1: 74,
    take: 'X5',
    anchor: { key: 'cast', frame: 52 },
    ramp: [[50, 1], [52, 1], [53, 0], [55, 0], [56, 0.6], [68, 0.6], [69, 1]],
    cam: { target: { mid: ['@star', '@v1'], lift: 1.1 }, align: { a: '@star', b: '@v1' }, keys: [{ f: 50, dist: 0.46, pitch: 16, yaw: 70, fov: 40 }, ...punch(52, 0.46)], smooth: 0.1 },
    popText: ['Takedown!'],
    dmgRadius: 4,
    cullHeroes: 3,
    cullFront: 0.8,
    cullMinions: 0.4,
  },
  {
    id: 'S03',
    f0: 75,
    f1: 99,
    take: 'X3',
    // Sage's Moonshot point-blank through a dog (KO, shut down) on f78, side-on; then a whip-out into the title
    anchor: { key: 'hit', frame: 78 },
    ramp: [[75, 1], [78, 1], [79, 0], [81, 0], [82, 0.5], [95, 0.5], [96, 1.6, 'in'], [99, 1.6]],
    cam: {
      target: { mid: ['@star', '@v1'], lift: 1.2 },
      align: { a: '@star', b: '@v1' },
      keys: [{ f: 75, dist: 0.42, pitch: 10, yaw: 90, fov: 36 }, ...punch(78, 0.42), { f: 95, dist: 0.44, yaw: 90 }, { f: 99, dist: 0.52, yaw: 140, ease: 'in' }],
      smooth: 0.1,
    },
    blur: [[96, 99]],
    popText: ['Moonshot!', 'Takedown!'],
    dmgRadius: 4,
    cullHeroes: 2.5,
    cullFront: 0.6,
    cullMinions: 0.4,
  },
  // ---------------------------------------------------------------- bar 2, TITLE (f100-199)
  {
    id: 'S04',
    f0: 100,
    f1: 199,
    take: 'C',
    anchor: { key: 'clash', frame: 150 },
    cam: {
      // the clash under the lower two thirds; the title sits on the sky band above it
      target: { point: '@clash', lift: 2.2 },
      keys: [{ f: 100, dist: 1.0, pitch: 40, yaw: 0, fov: 40 }, { f: 175, dist: 0.62, pitch: 22, ease: 'out' }, { f: 193, yaw: 12, ease: 'ease' }, { f: 199, yaw: 57, ease: 'in' }],
      smooth: 0.4,
    },
    blur: [[194, 199]],
    popText: [],
    dmgRadius: 6,
    cullMinions: 3,
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
    cam: { target: { unit: '@clem', lift: 1 }, align: { a: '@clem', b: '@v1' }, keys: [{ f: 200, dist: 0.42, pitch: 14, yaw: 90, fov: 40 }, { f: 224, dist: 0.4 }], smooth: 0.12 },
    blur: [[203, 215]],
    popText: [],
    dmgRadius: 4,
    cullHeroes: 2.5,
    cullFront: 0.8,
    cullMinions: 0.4,
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
    cam: { target: { unit: '@star', lift: 1.3 }, align: { a: '@star', b: '@v1' }, keys: [{ f: 225, dist: 0.36, pitch: 8, yaw: -90, fov: 40 }, { f: 249, dist: 0.34 }], smooth: 0.12 },
    blur: [[230, 240]],
    popText: [],
    dmgRadius: 4,
    cullHeroes: 2.5,
    cullFront: 0.8,
    cullMinions: 0.4,
  },
  {
    id: 'S07',
    f0: 250,
    f1: 274,
    take: 'D',
    // Sir Brutus's Pug Charge, side-on
    anchor: { key: 'hit', frame: 262 },
    ramp: [[250, 1], [262, 1], [263, 0], [265, 0], [266, 1]],
    cam: { target: { mid: ['@hero', '@victim'], lift: 1.1 }, align: { a: '@hero', b: '@victim' }, keys: [{ f: 250, dist: 0.46, pitch: 18, yaw: -90, fov: 40 }, { f: 274, dist: 0.42 }], smooth: 0.1 },
    popText: [],
    dmgRadius: 4,
    cullHeroes: 3.5,
    cullFront: 0.8,
    cullMinions: 0.4,
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
    cam: { target: { unit: '@star', lift: 1 }, align: { a: '@v1', b: '@star' }, keys: [{ f: 275, dist: 0.5, pitch: 20, yaw: 90, fov: 40 }, { f: 299, dist: 0.46 }], smooth: 0.12 },
    blur: [[278, 286]],
    shutter: 0.35,
    popText: ['Takedown!'],
    dmgRadius: 4,
    cullHeroes: 2.5,
    cullMinions: 0.4,
  },
  {
    id: 'S09',
    f0: 300,
    f1: 324,
    take: 'E',
    // Aviete's Short Circuit: the axe-kick heel-down and the rebound backflip
    anchor: { key: 'cast', frame: 303 },
    ramp: [[300, 1], [303, 1], [304, 0], [305, 0], [306, 0.6], [318, 0.6], [319, 1]],
    cam: { target: { mid: ['@hero', '@target'], lift: 1.1 }, keys: [{ f: 300, dist: 0.44, pitch: 16, yaw: 0, fov: 40 }, { f: 324, dist: 0.42 }], smooth: 0.12 },
    blur: [[306, 318]],
    shutter: 0.35,
    popText: ['Short Circuit!'],
    dmgRadius: 4,
    cullHeroes: 3.5,
    cullFront: 0.8,
    cullMinions: 0.4,
  },
  {
    id: 'S10',
    f0: 325,
    f1: 349,
    take: 'X7',
    // Bengas's Striking Pose: spin-in, frozen vogue facing the lens, the camera-flash wedge (cast on f342)
    anchor: { key: 'windup', frame: 326 },
    ramp: [[325, 1], [342, 1], [343, 0.15], [346, 0.15], [347, 1]],
    cam: { target: { unit: '@star', lift: 1.1 }, align: { a: '@star', b: '@v1' }, keys: [{ f: 325, dist: 0.4, pitch: 12, yaw: 0, fov: 40 }, { f: 349, dist: 0.44 }], smooth: 0.12 },
    popText: ['Striking Pose!'],
    dmgRadius: 4,
    cullHeroes: 2.5,
    cullFront: 0.6,
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
    cam: { target: { unit: '@star', lift: 1.1 }, align: { a: '@star', b: '@v1' }, keys: [{ f: 350, dist: 0.45, pitch: 14, yaw: 90, fov: 40 }, { f: 374, dist: 0.42 }], smooth: 0.12 },
    blur: [[355, 365]],
    shutter: 0.35,
    popText: [],
    dmgRadius: 4,
    cullHeroes: 2.5,
    cullFront: 0.6,
    cullMinions: 0.4,
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
    cam: { target: { unit: '@star', lift: 1 }, keys: [{ f: 375, dist: 0.62, pitch: 34, yaw: 200, fov: 40 }, { f: 399, dist: 0.52, ease: 'in' }], smooth: 0.15 },
    popText: ['Tangled Lights!'],
    dmgRadius: 5,
    cullHeroes: 2.5,
    cullMinions: 0.4,
  },
  // ---------------------------------------------------------------- bar 5, 3V3 IN YOUR BROWSER (f400-499)
  {
    id: 'S13',
    f0: 400,
    f1: 499,
    take: 'X4',
    // the two teams side by side (the lambo -> dog line across the screen), the fight in the lower half under the type
    anchor: { key: 'bengasW', frame: 425 },
    cam: { target: { mid: ['@lambo', '@v1'], lift: 2.0 }, align: { a: '@lambo', b: '@v1' }, keys: [{ f: 400, dist: 0.72, pitch: 26, yaw: 90, fov: 40 }, { f: 499, dist: 0.66, yaw: 110, ease: 'linear' }], smooth: 0.4 },
    xray: true,
    popText: ['Takedown!', 'Pack Hunt!', 'Striking Pose!'],
    dmgRadius: 6,
    cullMinions: 1,
    wide: true,
  },
  // ---------------------------------------------------------------- bars 6-8, ULTS (f500-799)
  {
    id: 'S14',
    f0: 500,
    f1: 549,
    take: 'B',
    // Sage's Moonshot: the draw side-on, then the lens tracks the arrow itself (sharp, 90° shutter) to the bullseye on f541
    anchor: { key: 'release', frame: 525 },
    fits: [{ key: 'hit', frame: 541, seg: [526, 540] }],
    ramp: [[500, 1], [524, 1], [525, 2.0], [541, 2.0], [542, 0], [545, 0], [546, 0.4], [549, 0.4]],
    cam: {
      target: {
        cut: [
          [500, { unit: '@hero', lift: 1.4 }],
          [525, { proj: '@hero', from: 525, fallback: '@target', lift: 1.3 }],
          [539, { unit: '@target', lift: 1.2 }],
        ],
      },
      align: { a: '@hero', b: '@target' },
      keys: [
        { f: 500, dist: 0.32, pitch: 8, yaw: 120, fov: 40 },
        { f: 524, dist: 0.26, ease: 'out' },
        { f: 525, dist: 0.34, pitch: 8, yaw: 90, ease: 'hold' },
        { f: 538, dist: 0.34 },
        { f: 539, dist: 0.26, pitch: 8, yaw: 60, ease: 'hold' },
        { f: 549, dist: 0.3 },
      ],
      smooth: 0.02,
    },
    // the ride is sharp (no blur): the arrow stays readable in the centre while the world streams past
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
    // Bengas's Curtains Up!: the bow, then a crane up as the stage arms (cast + 18 ticks on f575)
    anchor: { key: 'cast', frame: 553 },
    fits: [{ key: 'cast', offset: 18, frame: 575, seg: [553, 574] }],
    ramp: [[550, 1], [575, 1], [576, 1.3], [599, 1.3]],
    cam: {
      target: { blend: [{ unit: '@hero', lift: 1 }, { point: '@stage', lift: 1 }], f0: 553, f1: 575 },
      keys: [{ f: 550, dist: 0.42, pitch: 14, yaw: 120, fov: 40 }, { f: 553, dist: 0.42, pitch: 14 }, { f: 575, dist: 0.78, pitch: 36, yaw: 130, ease: 'ease' }, { f: 599, yaw: 140 }],
      smooth: 0.12,
    },
    xray: true,
    popText: ['Curtains Up!'],
    dmgRadius: 6,
    cullHeroes: 3,
    cullFront: 0.6,
    cullMinions: 0.5,
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
    cam: { target: { unit: '@star', lift: 1.1 }, keys: [{ f: 600, dist: 0.38, pitch: 12, yaw: 30, fov: 40 }, { f: 621, dist: 0.38 }, { f: 622, dist: 0.64, pitch: 28, ease: 'out' }, { f: 649, dist: 0.6, yaw: 40 }], smooth: 0.12 },
    xray: true,
    popText: ['Under Her Spell!'],
    dmgRadius: 6,
    cullHeroes: 2.5,
    cullMinions: 0.5,
  },
  {
    id: 'S17',
    f0: 650,
    f1: 699,
    take: 'U3',
    // Sir Brutus's Champion's Challenge: sand obelisks erupt, seen from low under them
    anchor: { key: 'cast', frame: 655 },
    ramp: [[650, 1], [655, 1], [656, 0.6], [673, 0.6], [674, 1]],
    cam: { target: { unit: '@caster', lift: 1.5 }, keys: [{ f: 650, dist: 0.5, pitch: 10, yaw: -60, fov: 40 }, { f: 699, yaw: -20, ease: 'out' }], smooth: 0.1 },
    popText: ['Champion’s Challenge!', "Champion's Challenge!"],
    dmgRadius: 5,
    cullHeroes: 3,
    cullFront: 0.6,
    cullMinions: 0.5,
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
    cam: { target: { unit: '@star', lift: 1.1 }, keys: [{ f: 700, dist: 0.45, pitch: 22, yaw: 0, fov: 40 }, { f: 749, dist: 0.42, yaw: 15 }], smooth: 0.1 },
    xray: true,
    popText: ['Short Circuit!', 'Takedown!'],
    dmgRadius: 5,
    cullHeroes: 3,
    cullMinions: 0.5,
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
      keys: [{ f: 750, dist: 0.42, pitch: 6, yaw: -30, fov: 40, lift: 1.8 }, { f: 763, dist: 0.42, pitch: 6, lift: 1.8 }, { f: 764, dist: 0.55, pitch: 22, lift: 1.1, ease: 'out' }, { f: 799, yaw: -10, ease: 'linear' }],
      smooth: 0.1,
    },
    popText: ['Golden Hour!', 'Takedown!'],
    dmgRadius: 5,
    cullHeroes: 3,
    cullMinions: 0.5,
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
    cam: { target: { unit: '@star', lift: 1 }, keys: [{ f: 800, dist: 0.44, pitch: 24, yaw: 20, fov: 40 }, ...punch(825, 0.44), ...punch(850, 0.44), ...punch(875, 0.44), { f: 899, dist: 0.46, yaw: 35 }], smooth: 0.25 },
    blur: [[804, 824]],
    shutter: 0.35,
    xray: true,
    popText: ['Pack Hunt!', 'Takedown!', 'Combo x2', 'Combo x3'],
    dmgRadius: 5,
    cullHeroes: 2.5,
    cullMinions: 0.5,
  },
  // ---------------------------------------------------------------- bar 10 (f900-999): ping (1 beat), tower dive (2 beats), the ambush pounce (1 beat)
  {
    id: 'S21',
    f0: 900,
    f1: 924,
    take: 'J',
    // the wheel open on the hero for 12 frames, the ping lands on f912 and the ally answers (captioned large by mg)
    anchor: { key: 'ping1', frame: 912 },
    wheel: { open: 900, close: 912, at: [0.5, 0.5] },
    wheelScale: 2.6,
    cam: { target: { unit: '@hero', lift: 1 }, keys: [{ f: 900, dist: 0.5, pitch: 34, yaw: 0, fov: 40 }, { f: 924, dist: 0.46 }], smooth: 0.2 },
    layers: ['pops', 'wheel'],
    popText: [],
    dmgRadius: 4,
    cullMinions: 0.5,
  },
  {
    id: 'S23',
    f0: 925,
    f1: 974,
    take: 'X13',
    // Sir Brutus under the cat tower (its range ring and shots in frame): the takedown on f940, then the escape at speed
    anchor: { key: 'ko', frame: 940 },
    ramp: [[925, 1], [940, 1], [941, 0], [943, 0], [944, 0.5], [955, 0.5], [956, 1.4], [974, 1.4]],
    cam: {
      target: { mid: ['@star', '@tower'], lift: 1.6 },
      align: { a: '@tower', b: '@star' },
      keys: [{ f: 925, dist: 0.55, pitch: 22, yaw: 35, fov: 40 }, { f: 939, dist: 0.5 }, { f: 940, dist: 0.42, ease: 'out' }, { f: 974, dist: 0.5, yaw: 50 }],
      smooth: 0.15,
    },
    layers: ['pops'],
    popText: ['Takedown!'],
    dmgRadius: 6,
    cullHeroes: 3,
    cullMinions: 0.5,
  },
  {
    id: 'S22',
    f0: 975,
    f1: 999,
    take: 'G',
    // Cacklejaw's ambush pounce out of the bush: the leap on f978, both claws down on the cat on f991 (side-on, low)
    lead: 12,
    anchor: { key: 'leap', frame: 978 },
    fits: [{ key: 'hit', frame: 991, seg: [979, 990] }],
    ramp: [[963, 1], [978, 1], [979, 0.3], [990, 0.3], [991, 0.3], [992, 0], [994, 0], [995, 1], [999, 1]],
    cam: { target: { unit: '@hero', lift: 1.2 }, align: { a: '@hero', b: '@victim' }, keys: [{ f: 963, dist: 0.38, pitch: 8, yaw: 90, fov: 38 }, { f: 990, dist: 0.34 }, ...punch(991, 0.34), { f: 999, dist: 0.38 }], smooth: 0.1 },
    near: 5,
    blur: [[979, 990]],
    shutter: 0.3,
    popText: ['Takedown!'],
    dmgRadius: 4,
    cullHeroes: 2.5,
    cullFront: 0.6,
    cullMinions: 0.4,
  },
  // ---------------------------------------------------------------- bar 11 (f1000-1099): TOWER FALLS + COMEBACK
  {
    id: 'S24',
    f0: 1000,
    f1: 1049,
    take: 'T',
    // the dog tower falls whole (0.7 s at speed 1 after a 2-frame hold), low, the three cats at its foot
    anchor: { key: 'tower', frame: 1006 },
    ramp: [[1000, 1], [1006, 1], [1007, 0], [1009, 0], [1010, 1], [1049, 1]],
    cam: { target: { point: '@tower', lift: 2.6 }, keys: [{ f: 1000, dist: 0.6, pitch: 8, yaw: -135, fov: 40 }, ...punch(1006, 0.6), { f: 1049, dist: 0.66, pitch: 12, yaw: -125, ease: 'out' }], smooth: 0.15 },
    popText: [],
    dmgRadius: 8,
    cullHeroes: 2,
    cullMinions: 0.5,
    near: 2.5,
  },
  {
    id: 'S25',
    f0: 1050,
    f1: 1099,
    take: 'L',
    // COMEBACK (the game's banner fires on 13440, captioned large by mg): Aviete hits level 10 on the same tick, three
    // dogs on her heels; hero height, side-on
    anchor: { key: 'comeback', frame: 1056 },
    cam: { target: { mid: ['@aviete', '@cack'], lift: 1.2 }, align: { a: '@aviete', b: '@cack' }, keys: [{ f: 1050, dist: 0.55, pitch: 14, yaw: 90, fov: 40 }, { f: 1099, dist: 0.5, yaw: 100 }], smooth: 0.15 },
    popText: [],
    dmgRadius: 6,
    cullHeroes: 2.5,
    cullMinions: 0.5,
  },
  // ---------------------------------------------------------------- bar 12 (f1100-1199): a three-hero combo, card looks (1 beat), the real HUD (1 beat)
  {
    id: 'S25b',
    f0: 1100,
    f1: 1149,
    take: 'U4',
    // Bengas Q and Aviete E hit three dogs (f1112), then Lambo's Belly Flop lands on all three (f1125)
    lead: 30,
    anchor: { key: 'aviHit', frame: 1112 },
    fits: [{ key: 'lamboLand', frame: 1125, seg: [1113, 1124] }],
    ramp: [[1070, 1], [1112, 1], [1113, 0.35], [1124, 0.35], [1125, 0], [1127, 0], [1128, 0.8], [1149, 0.8]],
    cam: { target: { mid: ['@brutus', '@cack'], lift: 1.3 }, align: { a: '@lambo', b: '@brutus' }, keys: [{ f: 1070, dist: 0.5, pitch: 14, yaw: 90, fov: 40 }, { f: 1100, dist: 0.5 }, ...punch(1125, 0.5), { f: 1149, dist: 0.56, yaw: 105 }], smooth: 0.12 },
    blur: [[1113, 1124]],
    shutter: 0.3,
    popText: ['Takedown!'],
    dmgRadius: 5,
    cullHeroes: 2.5,
    cullFront: 0.6,
    cullMinions: 0.5,
    xray: true,
  },
  {
    id: 'S26',
    f0: 1150,
    f1: 1174,
    take: 'E',
    anchor: { key: 'cast', frame: 1162 },
    looks: [[1150, 'demo-ficus'], [1156, 'demo-pinkie'], [1162, 'demo-rascal'], [1168, 'demo-grey']],
    cam: { target: { mid: ['@hero', '@target'], lift: 1.1 }, keys: [{ f: 1150, dist: 0.36, pitch: 14, yaw: -20, fov: 40 }, { f: 1174, yaw: 20, ease: 'linear' }], smooth: 0.1 },
    popText: [],
    dmgRadius: 4,
    cullHeroes: 3.5,
    cullFront: 0.8,
    cullMinions: 0.4,
  },
  {
    id: 'S27',
    f0: 1175,
    f1: 1199,
    take: 'X14',
    // the real game: full HUD, the game's own follow camera, on Cacklejaw's E (the cooldown sweep on the HUD)
    anchor: { key: 'cackE', frame: 1182 },
    cam: null,
    layers: ['hud'],
    // 9:16: a phone in landscape (932x430 CSS px at DPR 2), shown whole as a band
    portrait: { width: 932, height: 430, dpr: 2, touch: true },
  },
  // ---------------------------------------------------------------- bar 13 (f1200-1299): two more fights at hero height
  {
    id: 'S27b',
    f0: 1200,
    f1: 1249,
    take: 'U5',
    // at the dog base: Clem's Q cuts three dogs (f1203), and again (f1228)
    anchor: { key: 'clemQ1', frame: 1203 },
    fits: [{ key: 'clemQ2', frame: 1228, seg: [1206, 1227] }],
    ramp: [[1200, 1], [1203, 1], [1204, 0], [1205, 0], [1206, 0.5], [1228, 0.5], [1229, 0], [1230, 0], [1231, 1], [1249, 1]],
    cam: { target: { unit: '@clem', lift: 1.1 }, align: { a: '@clem', b: '@brutus' }, keys: [{ f: 1200, dist: 0.46, pitch: 14, yaw: -90, fov: 40 }, ...punch(1203, 0.46), ...punch(1228, 0.46), { f: 1249, dist: 0.5, yaw: -110 }], smooth: 0.12 },
    popText: ['Takedown!'],
    dmgRadius: 4,
    cullHeroes: 2.5,
    cullFront: 0.6,
    cullMinions: 0.4,
    near: 5,
    xray: true,
  },
  {
    id: 'S27c',
    f0: 1250,
    f1: 1299,
    take: 'M',
    // Bengas finishes a dog: a takedown and a shut down on f1275
    anchor: { key: 'ko2', frame: 1275 },
    ramp: [[1250, 1], [1275, 1], [1276, 0], [1278, 0], [1279, 0.6], [1299, 0.6]],
    cam: { target: { mid: ['@bengas', '@victim'], lift: 1.1 }, align: { a: '@bengas', b: '@victim' }, keys: [{ f: 1250, dist: 0.48, pitch: 14, yaw: 90, fov: 40 }, ...punch(1275, 0.48), { f: 1299, dist: 0.52, yaw: 105 }], smooth: 0.12 },
    popText: ['Takedown!', 'Shut down!'],
    dmgRadius: 4,
    cullHeroes: 2.5,
    cullFront: 0.6,
    cullMinions: 0.4,
    xray: true,
  },
  // ---------------------------------------------------------------- bar 14, FINAL TEAMFIGHT (f1300-1399): eighth-note cuts on X14, all close
  ...[
    ['S28a', 1300, 1312, 'cackE', '@cacklejaw', { dist: 0.5, pitch: 16, yaw: -60 }, [[1300, 1.4]]],
    ['S28b', 1313, 1324, 'bengasR', '@bengas', { dist: 0.55, pitch: 30, yaw: 30 }],
    ['S28c', 1325, 1337, 'clemR', '@clem', { dist: 0.42, pitch: 8, yaw: -40, lift: 1.6 }],
    ['S28d', 1338, 1349, 'lamboR', '@lambo', { dist: 0.52, pitch: 28, yaw: 60 }],
    ['S28e', 1350, 1362, 'brutusR', '@brutus', { dist: 0.5, pitch: 10, yaw: -70 }],
    ['S28f', 1363, 1374, 'bengasW', '@bengas', { dist: 0.4, pitch: 12, yaw: 160 }],
    ['S28g', 1375, 1387, 'clemQ', '@clem', { dist: 0.42, pitch: 14, yaw: -90 }],
    ['S28h', 1388, 1399, 'cackR', '@cacklejaw', { dist: 0.46, pitch: 18, yaw: 200 }, null, [[1390, 1394]]],
  ].map(([id, f0, f1, key, unit, k, ramp, blur]) => ({
    id,
    f0,
    f1,
    take: 'X14',
    anchor: { key, frame: f0 + 2 },
    ...(ramp ? { ramp } : {}),
    ...(blur ? { blur, shutter: 0.25 } : {}),
    cam: { target: { unit, lift: 1.1 }, keys: [{ f: f0, fov: 40, ...k }, { f: f1, dist: k.dist * 0.92 }], smooth: 0.08 },
    xray: true,
    popText: [...ULTS, 'Takedown!'],
    dmgRadius: 4,
    cullHeroes: 2.5,
    cullFront: 0.6,
    cullMinions: 0.4,
    near: 3,
  })),
  // ---------------------------------------------------------------- bar 15, KILL + LEVEL 10, TOWER, TAKE THEIR CORE (f1400-1499)
  {
    id: 'S29',
    f0: 1400,
    f1: 1449,
    take: 'X14',
    // a takedown and Clem's level 10 on the same tick (f1406, tight on Clem), then a hard cut on the beat to cat tower
    // 46, low, as it falls (f1428; the take runs fast between the two)
    anchor: { key: 'ko', frame: 1406 },
    fits: [{ key: 'tower', frame: 1428, seg: [1410, 1427] }],
    ramp: [[1400, 1], [1406, 1], [1407, 0], [1409, 0], [1410, 1.5], [1428, 1.5], [1429, 1.4], [1449, 1.4]],
    cam: {
      target: { cut: [[1400, { unit: '@clem', lift: 1.1 }], [1425, { point: [34000, 51000], lift: 2.6 }]] },
      keys: [{ f: 1400, dist: 0.5, pitch: 16, yaw: 20, fov: 40 }, ...punch(1406, 0.5), { f: 1424, dist: 0.48 }, { f: 1425, dist: 0.6, pitch: 8, yaw: -30, ease: 'hold' }, { f: 1449, dist: 0.66, pitch: 12, yaw: -22, ease: 'out' }],
      smooth: 0.15,
    },
    popText: ['Takedown!', 'Level 10'],
    dmgRadius: 5,
    cullHeroes: 2.5,
    cullMinions: 0.5,
    near: 2.5,
  },
  {
    id: 'S30',
    f0: 1450,
    f1: 1499,
    take: 'N',
    // the cats march on the dog core, which fills the lower frame under the type; a tape-stop into the next bar
    anchor: { key: 'brawl', frame: 1450, offset: 15 },
    ramp: [[1450, 1], [1487, 1], [1499, 0.02]],
    cam: { target: { point: '@core', lift: 3.0 }, keys: [{ f: 1450, dist: 0.7, pitch: 16, yaw: -100, fov: 40 }, { f: 1499, dist: 0.5, ease: 'in' }], smooth: 0.2 },
    popText: [],
    dmgRadius: 6,
    cullHeroes: 2,
    cullMinions: 0,
    wide: true,
  },
  // ---------------------------------------------------------------- bars 16-17, THE CORE FALLS + Victory (f1500-1649): one continuous take
  {
    id: 'S31',
    f0: 1500,
    f1: 1649,
    take: 'N',
    // Lambo belly-flops the core (f1500), it bursts on f1525 (held 4 frames), falls whole at hero height; then a hard
    // cut on the beat (f1575) to the winners over the rubble, in the same take: the core never stands up again
    lead: 20,
    anchor: { key: 'flop', frame: 1500, offset: 0.5 },
    fits: [{ key: 'core', frame: 1525, seg: [1500, 1524] }],
    ramp: [[1480, 1], [1494, 1], [1500, 0.32, 'out'], [1525, 0.32], [1526, 0], [1529, 0], [1530, 2.4], [1574, 2.4], [1575, 1.2], [1649, 1.2]],
    cam: {
      target: { cut: [[1480, { point: '@core', lift: 1.7 }], [1575, { unit: '@hero', lift: 1.2 }]] },
      keys: [{ f: 1480, dist: 0.44, pitch: 8, yaw: -100, fov: 40 }, { f: 1500, dist: 0.44 }, ...punch(1525, 0.42), { f: 1574, dist: 0.52, ease: 'out' }, { f: 1575, dist: 0.5, pitch: 16, yaw: -60, ease: 'hold' }, { f: 1649, yaw: -30, ease: 'linear' }],
      smooth: 0.12,
    },
    blur: [[1500, 1524]],
    shutter: 0.3,
    popText: [],
    dmgRadius: 0.1,
    cullHeroes: 2,
    cullFront: 0.5,
    cullMinions: 0,
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
