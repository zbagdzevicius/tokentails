/**
 * Trailer v4 shot list as data: 30.000 s, 144 BPM (25 frames per beat, 100 per bar), 60 fps. v1 ("Meet Gabe") is
 * shots-v1.mjs. capture.mjs turns each entry plus its take (takes.json) into a harness ShotSpec per aspect. Frames are
 * the master's output frames; cuts land on beats (or the triplet grid in the second teamfight bar), contacts on the
 * beat or beat + 3.
 *
 *   take      takes.json id; `anchor` puts a key tick (+ offset) on a frame; `fits: [{ key, frame, seg, offset? }]`
 *             stretch the ramp on each segment so that key is crossed ON its frame (solved in order)
 *   cam       director camera: target (roles from the take: '@clem' = its slot) and keys (director.ts); `align`
 *             turns the line a -> b to run down the screen (b nearest the lens) and the keys' yaw is added on top
 *   blur      [[a, b], ...]: frames rendered as 32 sub-frames (`shutter` share of the frame integrated); v4: never on a
 *             held frame, and only the sub-frames after a hero snap (knockback, blink) are kept
 *   xray      a tower or core in front of the subject is not drawn (`xrayMode` 'hide', the default)
 *   looks     [[fromFrame, card], ...]: the same frames once per card look (cosmetic only)
 *   hideIds   heroes not involved in the beat, not drawn (v4)
 *   popScale  the game's own pops and callouts drawn larger (v4)
 *   wide      9:16 frames it 1.35x further and 6° steeper; close-ups 1.3x and a turned side-on yaw (portraitKeys)
 *   aspects   the masters a shot is captured for (default both); `portrait.f1` runs a take on in 9:16
 *
 * v4 (review of v3): the hook is one clean side-on Belly Flop against dark trees (take H), held on the contact; the
 * roll call puts each hero's acrobatic apex mid-shot with a short slow-motion hold; 3V3 is one high orbit over all six;
 * the ults are framed on their vertical parts (the moon over Sage, the flame curtains, the sand obelisks); Pack Hunt is
 * shot from the front three-quarter with the game's own takedown pops large; the middle is a full-beat ping, Pudding's
 * bounce, a two-beat dive and the tower falling; COMEBACK! lands on a triple hit; two teamfight bars (a wide three-ult
 * brawl, then six triplet cuts of moves not seen before); Victory gets two beats; the end card starts on f1625.
 */

/** A 4-frame lens punch on frame f: distance -0.05 on f+1, back by f+4. */
const punch = (f, dist, by = 0.05) => [{ f, dist }, { f: f + 1, dist: dist - by, ease: 'out' }, { f: f + 4, dist, ease: 'out' }];
const ULTS = ['Golden Hour!', 'Moonshot!', 'Champion’s Challenge!', "Champion's Challenge!", 'Short Circuit!', 'Pack Hunt!', 'Curtains Up!', 'Under Her Spell!', 'Tangled Lights!'];
/** Close-up clean-up shared by most shots. */
const CLOSE = { dmgRadius: 4, cullHeroes: 2.5, cullFront: 0.6, cullMinions: 0.4, shockI: 0.35 };

/** A roll-call beat (25 f): the move's key on `at`, a slow-motion hold round the apex [a, b] at `slow`. */
const roll = (id, f0, take, key, at, apex, slow, cam, o = {}) => ({
  id,
  f0,
  f1: f0 + 24,
  take,
  anchor: { key, frame: at, offset: o.offset ?? 0 },
  ramp: [[f0, o.speed ?? 1], [apex[0] - 1, o.speed ?? 1], [apex[0], slow, 'in'], [apex[1], slow], [apex[1] + 1, 1, 'out'], [f0 + 24, 1]],
  cam,
  blur: o.blur ?? [[apex[0], apex[1]]],
  shutter: o.shutter ?? 0.3,
  popText: o.popText ?? [],
  popScale: 1.7,
  ...CLOSE,
  cullFront: 0.8,
  ...(o.extra ?? {}),
});

export const SHOTS = [
  // ---------------------------------------------------------------- bar 1, HOOK (f0-99)
  {
    id: 'S01',
    f0: 0,
    f1: 49,
    take: 'H',
    // frame 0: Lambo at the top of the Belly Flop, side-on against the dark tree line, nobody else near him; contact on
    // f25 held 5 frames (the white flash is the edit's), then the ring blooms out before the cut
    lead: 30,
    anchor: { key: 'flop', frame: -6, offset: 2 },
    fits: [{ key: 'land', frame: 25, seg: [0, 24] }],
    ramp: [[-30, 1], [-8, 1], [0, 0.22, 'out'], [22, 0.22], [24, 0.5, 'in'], [25, 0.5], [26, 0], [30, 0], [31, 0.6, 'out'], [49, 0.6]],
    cam: {
      target: { unit: '@hero', lift: 1.5 },
      align: { a: '@hero', b: '@victim' },
      keys: [{ f: -30, dist: 0.32, pitch: 3, yaw: -84, fov: 34, lift: 1.9 }, { f: 0, dist: 0.32, pitch: 3, yaw: -84, lift: 1.9 }, { f: 24, dist: 0.34, pitch: 6, yaw: -84, lift: 1.4 }, ...punch(25, 0.36, 0.06), { f: 30, dist: 0.36 }, { f: 49, dist: 0.46, pitch: 12, yaw: -78, ease: 'out' }],
      smooth: 0.12,
    },
    blur: [[8, 23]],
    shutter: 0.25,
    popText: ['Takedown!'],
    dmgRadius: 3,
    cullHeroes: 2.5,
    cullFront: 0.3,
    cullMinions: 0.3,
    shockI: 0.6,
    // 9:16 keeps the side-on silhouette (the default portrait turn to 40° would crop Lambo)
    portrait: { keys: [{ f: -30, dist: 0.8, pitch: 3, yaw: -96, fov: 34, lift: 1.7 }, { f: 0, dist: 0.8, pitch: 3, yaw: -96, lift: 1.7 }, { f: 24, dist: 0.72, pitch: 6, yaw: -84, lift: 1.4 }, { f: 25, dist: 0.64 }, { f: 26, dist: 0.57, ease: 'out' }, { f: 29, dist: 0.64, ease: 'out' }, { f: 30, dist: 0.64 }, { f: 49, dist: 0.76, pitch: 12, yaw: -78, ease: 'out' }] },
  },
  {
    id: 'S02',
    f0: 50,
    f1: 74,
    take: 'X5',
    anchor: { key: 'cast', frame: 53 },
    ramp: [[50, 1], [53, 1], [54, 0], [56, 0], [57, 0.6], [69, 0.6], [70, 1]],
    cam: { target: { mid: ['@star', '@v1'], lift: 1.1 }, align: { a: '@star', b: '@v1' }, keys: [{ f: 50, dist: 0.4, pitch: 10, yaw: 60, fov: 38 }, ...punch(53, 0.4)], smooth: 0.1 },
    popText: ['Takedown!'],
    ...CLOSE,
    cullHeroes: 3,
    cullFront: 0.8,
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
      keys: [{ f: 75, dist: 0.4, pitch: 8, yaw: 90, fov: 36 }, ...punch(78, 0.4), { f: 95, dist: 0.42, yaw: 90 }, { f: 99, dist: 0.5, yaw: 140, ease: 'in' }],
      smooth: 0.1,
    },
    blur: [[96, 99]],
    popText: ['Moonshot!', 'Takedown!'],
    popScale: 1.6,
    ...CLOSE,
  },
  // ---------------------------------------------------------------- bar 2, TITLE (f100-199): CATS / VS / DOGS on three hits
  {
    id: 'T1',
    f0: 100,
    f1: 124,
    take: 'X4',
    // CATS: Clem's Q3 launcher and front somersault, KO on the bridge (f106), side-on from above the rail
    anchor: { key: 'q3', frame: 106 },
    ramp: [[100, 0.8], [106, 0.8], [107, 0], [109, 0], [110, 0.5], [124, 0.5]],
    cam: { target: { unit: '@clem', lift: 1.2 }, align: { a: '@clem', b: '@v1' }, keys: [{ f: 100, dist: 0.42, pitch: 22, yaw: -90, fov: 38 }, ...punch(106, 0.42), { f: 124, dist: 0.44 }], smooth: 0.1 },
    blur: [[110, 120]],
    shutter: 0.3,
    popText: ['Takedown!'],
    popScale: 1.6,
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
    cam: { target: { point: '@clash', lift: 1.3 }, keys: [{ f: 125, dist: 0.44, pitch: 8, yaw: 0, fov: 38 }, ...punch(128, 0.44), { f: 149, dist: 0.4, yaw: -10 }], smooth: 0.15 },
    popText: [],
    dmgRadius: 6,
    cullHeroes: 2.5,
    cullMinions: 1.5,
    shockI: 0.3,
  },
  {
    id: 'T3',
    f0: 150,
    f1: 199,
    take: 'G',
    // DOGS: Cacklejaw's ambush pounce out of the bush, both claws down on the cat (f153); whip-out into the roll call.
    // v4: the lens a little higher (trees behind, not the bright floor) and the shockwave walls at a quarter
    lead: 14,
    anchor: { key: 'leap', frame: 140 },
    fits: [{ key: 'hit', frame: 153, seg: [141, 152] }],
    ramp: [[136, 1], [140, 1], [141, 0.3], [152, 0.3], [153, 0.3], [154, 0], [156, 0], [157, 0.6], [192, 0.6], [193, 1.6, 'in'], [199, 1.6]],
    cam: { target: { unit: '@hero', lift: 1.4 }, align: { a: '@hero', b: '@victim' }, keys: [{ f: 136, dist: 0.32, pitch: 4, yaw: 230, fov: 38, lift: 1.6 }, { f: 152, dist: 0.3 }, ...punch(153, 0.3), { f: 192, dist: 0.36 }, { f: 199, dist: 0.46, yaw: 280, ease: 'in' }], smooth: 0.1 },
    blur: [[141, 152], [193, 199]],
    shutter: 0.3,
    popText: ['Takedown!'],
    popScale: 1.6,
    ...CLOSE,
    shockI: 0.2,
  },
  // ---------------------------------------------------------------- bars 3-4, ROLL CALL (f200-399): apex mid-shot, held
  roll('S05', 200, 'X4', 'e', 205, [209, 214], 0.3, { target: { unit: '@clem', lift: 1 }, align: { a: '@clem', b: '@v1' }, keys: [{ f: 200, dist: 0.4, pitch: 10, yaw: 55, fov: 40 }, { f: 224, dist: 0.37 }], smooth: 0.12 }, { extra: { near: 3 } }),
  roll('S06', 225, 'X11', 'cast', 229, [233, 239], 0.3, { target: { unit: '@star', lift: 1.5 }, align: { a: '@star', b: '@v1' }, keys: [{ f: 225, dist: 0.3, pitch: 2, yaw: 90, fov: 40, lift: 1.6 }, { f: 249, dist: 0.28 }], smooth: 0.12 }),
  roll('S07', 250, 'D', 'hit', 262, [262, 266], 0, { target: { mid: ['@hero', '@victim'], lift: 1.1 }, align: { a: '@hero', b: '@victim' }, keys: [{ f: 250, dist: 0.44, pitch: 12, yaw: -60, fov: 40 }, ...punch(262, 0.42), { f: 274, dist: 0.42 }], smooth: 0.1 }, { blur: [], extra: { cullHeroes: 3.5, xray: true } }),
  roll('S08', 275, 'X10', 'cast', 279, [283, 289], 0.35, { target: { unit: '@star', lift: 1.1 }, align: { a: '@v1', b: '@star' }, keys: [{ f: 275, dist: 0.34, pitch: 10, yaw: 60, fov: 40 }, { f: 299, dist: 0.32 }], smooth: 0.12 }, { popText: ['Takedown!'], extra: { cullFront: 0.4, hidePudding: true } }),
  roll('S09', 300, 'E', 'hit', 311, [311, 317], 0.3, { target: { mid: ['@hero', '@target'], lift: 1.2 }, keys: [{ f: 300, dist: 0.36, pitch: 6, yaw: 90, fov: 40 }, ...punch(311, 0.36), { f: 324, dist: 0.34 }], smooth: 0.12 }, { popText: ['Short Circuit!'], extra: { cullHeroes: 3.5 } }),
  roll('S10', 325, 'X7', 'cast', 336, [336, 341], 0.15, { target: { mid: ['@star', '@v1'], lift: 1.2 }, align: { a: '@star', b: '@v1' }, keys: [{ f: 325, dist: 0.44, pitch: 8, yaw: 30, fov: 40 }, ...punch(336, 0.44), { f: 349, dist: 0.42 }], smooth: 0.12 }, { blur: [], popText: ['Striking Pose!'], extra: { cullFront: 0.6 } }),
  roll('S11', 350, 'X12', 'cast', 354, [357, 364], 0.35, { target: { unit: '@star', lift: 1.3 }, align: { a: '@star', b: '@v1' }, keys: [{ f: 350, dist: 0.4, pitch: 6, yaw: 90, fov: 40 }, { f: 374, dist: 0.37 }], smooth: 0.12 }),
  {
    id: 'S12',
    f0: 375,
    f1: 399,
    take: 'X6',
    // Lambo's Tangled Lights: two accelerating spins, then the haul lands on f390 (front three-quarter, Pudding not drawn)
    anchor: { key: 'windup', frame: 375 },
    fits: [{ key: 'cast', frame: 390, seg: [375, 389] }],
    ramp: [[375, 1], [390, 1], [391, 0], [393, 0], [394, 0.5], [399, 0.5]],
    cam: { target: { mid: ['@star', '@v1'], lift: 1.2 }, align: { a: '@star', b: '@v1' }, keys: [{ f: 375, dist: 0.5, pitch: 10, yaw: 300, fov: 40 }, ...punch(390, 0.48), { f: 399, dist: 0.46, ease: 'in' }], smooth: 0.15 },
    popText: ['Tangled Lights!'],
    popScale: 1.7,
    dmgRadius: 5,
    cullHeroes: 2.5,
    cullMinions: 0.4,
    shockI: 0.35,
    hidePudding: true,
  },
  // ---------------------------------------------------------------- bar 5, 3V3 IN YOUR BROWSER (f400-499): one high orbit
  {
    id: 'S13',
    f0: 400,
    f1: 499,
    take: 'X4',
    // all six heroes from above (both team colours read), a slow orbit through the Bengas stun (f425) and the Pack Hunt
    // leap (f477); structures in front not drawn
    anchor: { key: 'bengasW', frame: 425 },
    cam: { target: { mid: ['@lambo', '@v1'], lift: 1 }, align: { a: '@v1', b: '@lambo' }, keys: [{ f: 400, dist: 0.52, pitch: 36, yaw: 60, fov: 40 }, { f: 499, dist: 0.48, pitch: 32, yaw: 115, ease: 'linear' }], smooth: 0.3 },
    xray: true,
    popText: ['Striking Pose!', 'Pack Hunt!', 'Takedown!'],
    popScale: 1.4,
    dmgRadius: 6,
    cullMinions: 1,
    shockI: 0.3,
  },
  // ---------------------------------------------------------------- bars 6-8, ULTS (f500-799): the vertical part of each
  {
    id: 'S14',
    f0: 500,
    f1: 549,
    take: 'B',
    // Sage's Moonshot: the full draw facing the lens with the moon forming over her head (f500-527), then a lens beside
    // the target: the arrow streaks in to the bullseye on f541, held, the moonlight burst on the hold
    anchor: { key: 'release', frame: 528 },
    fits: [{ key: 'hit', frame: 541, seg: [529, 540] }],
    ramp: [[500, 1], [527, 1], [528, 1.0], [541, 1.0], [542, 0], [545, 0], [546, 0.35], [549, 0.35]],
    cam: {
      target: { cut: [[500, { unit: '@hero', lift: 2.15 }], [528, { proj: '@hero', from: 528, fallback: '@target', lift: 1.3 }], [538, { unit: '@target', lift: 1.3 }]] },
      align: { a: '@hero', b: '@target' },
      keys: [
        { f: 500, dist: 0.22, pitch: -2, yaw: 20, fov: 40 },
        { f: 527, dist: 0.19, ease: 'out' },
        { f: 528, dist: 0.42, pitch: 6, yaw: 90, ease: 'hold' },
        { f: 537, dist: 0.42 },
        { f: 538, dist: 0.3, pitch: 4, yaw: 60, ease: 'hold' },
        { f: 540, dist: 0.3 },
        ...punch(541, 0.3),
        { f: 549, dist: 0.32 },
      ],
      smooth: 0.02,
    },
    bolts: true,
    popText: ['Moonshot!'],
    popScale: 1.6,
    dmgRadius: 4,
    cullHeroes: 7,
    cullMinions: 0.5,
    shockI: 0.35,
  },
  {
    id: 'S15',
    f0: 550,
    f1: 624,
    take: 'F',
    // Bengas's Curtains Up!: low and close on the stage rim while the flame curtains stand (cast + 2 on f553 to the arm,
    // cast + 18, on f578), then the burning stage and a pulse: the four flame pillars (cast + 33 on f593)
    anchor: { key: 'cast', frame: 553, offset: 2 },
    fits: [{ key: 'cast', offset: 18, frame: 578, seg: [554, 577] }],
    ramp: [[550, 1], [578, 1], [579, 0.8], [624, 0.8]],
    cam: {
      target: { point: '@stage', lift: 1.1 },
      keys: [{ f: 550, dist: 0.5, pitch: 7, yaw: 300, fov: 40 }, { f: 578, dist: 0.46, pitch: 8, yaw: 306 }, { f: 624, dist: 0.52, pitch: 14, yaw: 320 }],
      smooth: 0.12,
    },
    xray: true,
    popText: ['Curtains Up!'],
    popScale: 1.6,
    dmgRadius: 6,
    cullHeroes: 3,
    cullFront: 0.5,
    cullMinions: 0.5,
    shockI: 0.35,
  },
  {
    id: 'S16',
    f0: 625,
    f1: 699,
    take: 'X8',
    // Gabe's Under Her Spell: the twirl (front three-quarter), then the heart wavefront charms three dogs (f647) and they walk to her
    anchor: { key: 'windup', frame: 625 },
    fits: [{ key: 'cast', frame: 647, seg: [625, 646] }],
    ramp: [[625, 1], [647, 1], [648, 0], [650, 0], [651, 0.7], [699, 0.7]],
    cam: { target: { cut: [[625, { unit: '@star', lift: 1.2 }], [647, { mid: ['@star', '@v1'], lift: 1.2 }]] }, align: { a: '@star', b: '@v1' }, keys: [{ f: 625, dist: 0.36, pitch: 8, yaw: 40, fov: 40 }, { f: 646, dist: 0.34 }, { f: 647, dist: 0.52, pitch: 12, yaw: 60, ease: 'hold' }, { f: 699, dist: 0.44, yaw: 80 }], smooth: 0.1 },
    xray: true,
    popText: ['Under Her Spell!'],
    popScale: 1.6,
    dmgRadius: 6,
    cullHeroes: 3,
    cullFront: 0.5,
    cullMinions: 0.5,
    shockI: 0.35,
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
    cam: { target: { mid: ['@star', '@v1'], lift: 1.2 }, align: { a: '@star', b: '@v1' }, keys: [{ f: 700, dist: 0.36, pitch: 6, yaw: 110, fov: 40 }, ...punch(703, 0.36), { f: 749, dist: 0.4, yaw: 100 }], smooth: 0.1 },
    xray: true,
    popText: ['Short Circuit!', 'Takedown!'],
    popScale: 1.6,
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
      keys: [{ f: 750, dist: 0.4, pitch: 2, yaw: -30, fov: 40, lift: 1.9 }, { f: 763, dist: 0.4, pitch: 4, lift: 1.9 }, { f: 764, dist: 0.5, pitch: 16, lift: 1.2, ease: 'out' }, { f: 799, yaw: -10, ease: 'linear' }],
      smooth: 0.1,
    },
    popText: ['Golden Hour!', 'Takedown!'],
    popScale: 1.6,
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
    // front three-quarter on Cacklejaw, facing the victims; the clock runs at 0.35 between the takedowns and drops to
    // 0.1 only round each; the game's own Takedown! / Combo pops drawn large
    anchor: { key: 'r', frame: 803 },
    fits: [{ key: 'ko1', frame: 825, seg: [804, 824] }, { key: 'ko2', frame: 850, seg: [829, 849] }, { key: 'ko3', frame: 875, seg: [854, 874] }],
    ramp: [[800, 1], [803, 1], [804, 0.35], [819, 0.35], [822, 0.12, 'in'], [825, 0.12], [826, 0], [829, 0], [830, 0.6], [844, 0.6], [847, 0.12, 'in'], [850, 0.12], [851, 0], [854, 0], [855, 0.6], [869, 0.6], [872, 0.12, 'in'], [875, 0.12], [876, 0], [880, 0], [881, 1], [899, 1]],
    cam: { target: { unit: '@star', lift: 1.2 }, align: { a: '@star', b: '@v1' }, keys: [{ f: 800, dist: 0.42, pitch: 16, yaw: -140, fov: 40 }, ...punch(825, 0.4, 0.06), ...punch(850, 0.4, 0.06), ...punch(875, 0.4, 0.07), { f: 899, dist: 0.44, yaw: -150 }], smooth: 0.2 },
    blur: [[804, 821]],
    shutter: 0.3,
    xray: true,
    popText: ['Pack Hunt!', 'Takedown!', 'Combo x2'],
    popScale: 1.9,
    dmgRadius: 5,
    cullHeroes: 3,
    cullFront: 1,
    cullMinions: 0.5,
    shockI: 0.35,
  },
  // ---------------------------------------------------------------- bar 10 (f900-999): ping (a beat), Pudding, the dive
  {
    id: 'S21',
    f0: 900,
    f1: 924,
    take: 'X4',
    // the 3V3 fight again, low: a cat takedown (ko2 on f906) and the fire burst over the pile
    anchor: { key: 'ko2', frame: 906 },
    ramp: [[900, 1], [924, 1]],
    cam: { target: { mid: ['@lambo', '@v1'], lift: 1.2 }, align: { a: '@lambo', b: '@v1' }, keys: [{ f: 900, dist: 0.4, pitch: 8, yaw: 60, fov: 40 }, { f: 924, dist: 0.37 }], smooth: 0.15 },
    popText: ['Takedown!'],
    popScale: 1.6,
    ...CLOSE,
    xray: true,
  },
  {
    id: 'S22',
    f0: 925,
    f1: 949,
    take: 'M',
    // a dog takedown at the base (ko1 on f931), the dog's KO knock-up close
    anchor: { key: 'ko1', frame: 931 },
    ramp: [[925, 1], [931, 1], [932, 0], [934, 0], [935, 0.6], [949, 0.6]],
    cam: { target: { unit: '@victim1', lift: 1.2 }, keys: [{ f: 925, dist: 0.38, pitch: 8, yaw: 60, fov: 40 }, ...punch(931, 0.38, 0.06), { f: 949, dist: 0.36 }], smooth: 0.12 },
    popText: ['Takedown!', 'Shut down!'],
    popScale: 1.8,
    ...CLOSE,
    xray: true,
  },
  {
    id: 'S23',
    f0: 950,
    f1: 999,
    take: 'X13',
    // the tower dive, two beats at hero height: behind Sir Brutus under the cat tower, its shots hitting him, the
    // takedown on f978 (beat + 3), the walk-out
    anchor: { key: 'ko', frame: 978 },
    ramp: [[950, 1], [978, 1], [979, 0], [981, 0], [982, 0.6], [999, 0.6]],
    cam: {
      target: { mid: ['@star', '@tower'], lift: 1.8 },
      align: { a: '@tower', b: '@star' },
      keys: [{ f: 950, dist: 0.44, pitch: 10, yaw: 30, fov: 40 }, { f: 977, dist: 0.4 }, ...punch(978, 0.4), { f: 999, dist: 0.44, yaw: 40 }],
      smooth: 0.15,
    },
    layers: ['pops'],
    xray: false,
    bolts: true,
    popText: ['Takedown!'],
    popScale: 2,
    dmgRadius: 6,
    cullHeroes: 3,
    cullMinions: 0.5,
  },
  // ---------------------------------------------------------------- f1000-1049: the dog tower topples (the render fall)
  {
    id: 'S24',
    f0: 1000,
    f1: 1049,
    take: 'T',
    // low, side-on to the fall, the cats at its foot: the crack, the topple, the ground impact on f1028 (slowed)
    lead: 30,
    anchor: { key: 'tower', frame: 994 },
    ramp: [[970, 1], [1016, 1], [1018, 0.45, 'in'], [1036, 0.45], [1038, 1, 'out'], [1049, 1]],
    cam: { target: { point: '@tower', lift: 2.2 }, keys: [{ f: 970, dist: 0.56, pitch: 6, yaw: -150, fov: 40 }, { f: 1049, dist: 0.62, pitch: 9, yaw: -140, ease: 'out' }], smooth: 0.15 },
    xray: false,
    popText: [],
    dmgRadius: 8,
    cullHeroes: 2,
    cullMinions: 0.5,
  },
  // ---------------------------------------------------------------- f1050-1199: COMEBACK on a triple hit, the push, fights
  {
    id: 'S25',
    f0: 1050,
    f1: 1074,
    take: 'U4',
    // COMEBACK!: Bengas Q and Aviete E land on three dogs on f1053 (the banner slams on the same frame)
    anchor: { key: 'aviHit', frame: 1053 },
    ramp: [[1050, 1], [1053, 1], [1054, 0], [1056, 0], [1057, 0.5], [1074, 0.5]],
    cam: { target: { mid: ['@brutus', '@cack'], lift: 1.2 }, align: { a: '@aviete', b: '@brutus' }, keys: [{ f: 1050, dist: 0.4, pitch: 3, yaw: 40, fov: 40 }, ...punch(1053, 0.4), { f: 1074, dist: 0.44, yaw: 55 }], smooth: 0.12 },
    popText: ['Takedown!'],
    popScale: 1.6,
    ...CLOSE,
    shockI: 0.2,
    xray: true,
  },
  {
    id: 'S25w',
    f0: 1075,
    f1: 1099,
    take: 'L',
    // the comeback (13440): the underdog push, a shockwave and chunks flying over the lane
    anchor: { key: 'comeback', frame: 1075, offset: 2 },
    ramp: [[1075, 1], [1099, 1]],
    cam: { target: { wave: 0, near: '@clem', r: 40, lift: 1 }, keys: [{ f: 1075, dist: 0.46, pitch: 12, yaw: 30, fov: 40 }, { f: 1099, dist: 0.42 }], smooth: 0.2 },
    popText: [],
    dmgRadius: 5,
    cullHeroes: 2,
    shockI: 0.3,
  },
  {
    id: 'S27b',
    f0: 1100,
    f1: 1149,
    take: 'U5',
    // at the dog base: Clem's Q cuts three dogs (f1103), and again (f1128)
    anchor: { key: 'clemQ1', frame: 1103 },
    fits: [{ key: 'clemQ2', frame: 1128, seg: [1106, 1127] }],
    ramp: [[1100, 1], [1103, 1], [1104, 0], [1105, 0], [1106, 0.5], [1128, 0.5], [1129, 0], [1130, 0], [1131, 1], [1149, 1]],
    cam: { target: { unit: '@clem', lift: 1.2 }, align: { a: '@clem', b: '@brutus' }, keys: [{ f: 1100, dist: 0.44, pitch: 10, yaw: -60, fov: 40 }, ...punch(1103, 0.44), ...punch(1128, 0.44), { f: 1149, dist: 0.48, yaw: -80 }], smooth: 0.12 },
    popText: ['Takedown!'],
    popScale: 1.6,
    ...CLOSE,
    xray: true,
    // 9:16 leaves the landscape HUD beat out: this take runs on over it
    portrait: { f1: 1174 },
  },
  {
    id: 'S27',
    f0: 1150,
    f1: 1174,
    take: 'X14',
    // the real game: full HUD, the game's own follow camera, on Cacklejaw's E (the cooldown sweep on the HUD); 16:9 only
    anchor: { key: 'cackE', frame: 1157 },
    cam: null,
    layers: ['hud'],
    aspects: ['16x9'],
  },
  {
    id: 'S26',
    f0: 1175,
    f1: 1199,
    take: 'E',
    // one beat of card looks: Aviete frozen at the top of the axe-kick (the clock held), a dark tree line behind; three
    // looks on the eighth notes with the edit's white wipe between them
    anchor: { key: 'hit', frame: 1175, offset: -3 },
    ramp: [[1175, 0], [1199, 0]],
    looks: [[1175, 'demo-ficus'], [1183, 'demo-pinkie'], [1191, 'demo-rascal']],
    cam: { target: { unit: '@hero', lift: 1.3 }, keys: [{ f: 1175, dist: 0.26, pitch: 1, yaw: 140, fov: 40 }, { f: 1199, dist: 0.24, ease: 'linear' }], smooth: 0 },
    popText: [],
    ...CLOSE,
    cullHeroes: 3.5,
    cullFront: 0.4,
  },
  // ---------------------------------------------------------------- bar 13, TEAMFIGHT A (f1200-1299): the wide brawl, the obelisks
  {
    id: 'S28',
    f0: 1200,
    f1: 1249,
    take: 'X14',
    // all six from three-quarter height: Curtains Up (f1203), then Tangled Lights and Champion's Challenge in one shot
    anchor: { key: 'bengasR', frame: 1203 },
    ramp: [[1200, 1], [1249, 1]],
    cam: { target: { mid: ['@lambo', '@brutus'], lift: 1.2 }, align: { a: '@lambo', b: '@brutus' }, keys: [{ f: 1200, dist: 0.6, pitch: 30, yaw: 100, fov: 40 }, { f: 1249, dist: 0.52, pitch: 26, yaw: 130, ease: 'linear' }], smooth: 0.2 },
    xray: true,
    popText: ULTS,
    popScale: 1.4,
    dmgRadius: 6,
    cullMinions: 1,
    shockI: 0.3,
  },
  {
    id: 'S28o',
    f0: 1250,
    f1: 1299,
    take: 'X14',
    // the reverse angle, closer, from the cats' side: Champion's Challenge lands (brutusR f1262) in the middle of the
    // brawl, Clem and Lambo answering
    anchor: { key: 'brutusR', frame: 1262 },
    ramp: [[1250, 1], [1262, 1], [1263, 0], [1265, 0], [1266, 0.7], [1299, 0.7]],
    cam: { target: { mid: ['@lambo', '@brutus'], lift: 1.3 }, align: { a: '@brutus', b: '@lambo' }, keys: [{ f: 1250, dist: 0.44, pitch: 12, yaw: -50, fov: 40 }, ...punch(1262, 0.44), { f: 1299, dist: 0.4, pitch: 10, yaw: -70 }], smooth: 0.15 },
    xray: true,
    popText: ULTS,
    popScale: 1.5,
    ...CLOSE,
    cullHeroes: 3,
  },
  // ---------------------------------------------------------------- bar 14, TEAMFIGHT B (f1300-1399): six triplet cuts, six moves
  ...[
    ['S29a', 1300, 1316, 'X14', 'cackR', '@cacklejaw', 1302, { dist: 0.4, pitch: 8, yaw: 160 }, { a: '@cacklejaw', b: '@clem' }],
    ['S29b', 1317, 1332, 'X1', 'e', '@star', 1319, { dist: 0.38, pitch: 6, yaw: 60 }, { a: '@star', b: '@v1' }],
    ['S29c', 1333, 1349, 'X7', 'ko1', '@star', 1336, { dist: 0.4, pitch: 8, yaw: 40 }, { a: '@star', b: '@v1' }],
    ['S29d', 1350, 1366, 'X14', 'lamboR', '@lambo', 1352, { dist: 0.38, pitch: 6, yaw: 200 }, { a: '@lambo', b: '@cacklejaw' }],
    ['S29e', 1367, 1382, 'X14', 'clemQ', '@clem', 1369, { dist: 0.38, pitch: 8, yaw: 40 }, { a: '@clem', b: '@brutus' }],
    ['S29f', 1383, 1399, 'X2', 'ko3', '@star', 1386, { dist: 0.42, pitch: 10, yaw: 120 }, { a: '@star', b: '@v1' }],
  ].map(([id, f0, f1, take, key, unit, at, k, align]) => ({
    id,
    f0,
    f1,
    take,
    anchor: { key, frame: at },
    ramp: [[f0, 1], [at, 1], [at + 1, 0.4], [f1, 0.4]],
    cam: { target: { unit, lift: 1.3 }, align, keys: [{ f: f0, fov: 40, ...k }, ...punch(at, k.dist, 0.04), { f: f1, dist: k.dist * 0.94 }], smooth: 0.08 },
    xray: true,
    popText: [...ULTS, 'Takedown!'],
    popScale: 1.5,
    ...CLOSE,
    near: 3,
  })),
  // ---------------------------------------------------------------- bar 15 (f1400-1499): KO + LEVEL 10, TAKE THEIR CORE
  {
    id: 'S30k',
    f0: 1400,
    f1: 1449,
    take: 'X14',
    // a takedown and Clem's level 10 on the same tick (f1403), tight on Clem as the level pillar rises
    anchor: { key: 'ko', frame: 1403 },
    ramp: [[1400, 1], [1403, 1], [1404, 0], [1406, 0], [1407, 0.5], [1430, 0.5], [1431, 1], [1449, 1]],
    cam: { target: { unit: '@clem', lift: 1.4 }, keys: [{ f: 1400, dist: 0.4, pitch: 4, yaw: 20, fov: 40 }, ...punch(1403, 0.4), { f: 1449, dist: 0.46, pitch: 8, yaw: 45, ease: 'out' }], smooth: 0.12 },
    popText: ['Takedown!', 'Level 10'],
    popScale: 1.8,
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
    cam: { target: { point: '@core', lift: 2.6 }, keys: [{ f: 1450, dist: 0.66, pitch: 8, yaw: 165, fov: 40 }, { f: 1499, dist: 0.52, ease: 'in' }], smooth: 0.2 },
    xray: false,
    popText: [],
    dmgRadius: 6,
    cullHeroes: 2,
    cullMinions: 0,
    wide: true,
  },
  // ---------------------------------------------------------------- bar 16 (f1500-1624): THE CORE FALLS, Victory (two beats)
  {
    id: 'S31',
    f0: 1500,
    f1: 1574,
    take: 'N',
    // Lambo's flop lands beside the doghouse (the pile to the right, the core clear) and the core bursts on the same
    // tick: the first broken frame is f1528 (CORE_HIT), then slowed to 0.45 while the chunks fly, the core caves in, the game's own slow motion runs over it
    lead: 20,
    anchor: { key: 'core', frame: 1523 },
    ramp: [[1480, 1], [1500, 0.6], [1519, 0.6], [1520, 1], [1528, 1], [1529, 0.45], [1542, 0.45], [1543, 1], [1574, 1]],
    cam: { target: { point: '@core', lift: 2.1 }, keys: [{ f: 1480, dist: 0.46, pitch: 5, yaw: 90, fov: 42 }, { f: 1527, dist: 0.43 }, ...punch(1528, 0.43, 0.07), { f: 1574, dist: 0.54, pitch: 8, yaw: 85, ease: 'out' }], smooth: 0.12 },
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
    f1: 1624,
    take: 'N',
    // Victory: the winners celebrating over the rubble, a slow orbit (the same take: the core never stands up again)
    anchor: { key: 'core', frame: 1575, offset: 70 },
    ramp: [[1575, 1], [1624, 1]],
    cam: { target: { unit: '@hero', lift: 1.2 }, keys: [{ f: 1575, dist: 0.42, pitch: 8, yaw: 20, fov: 40 }, { f: 1624, dist: 0.38, yaw: -25, ease: 'linear' }], smooth: 0.1 },
    xray: false,
    popText: [],
    dmgRadius: 0.1,
    cullHeroes: 2,
    cullMinions: 0,
  },
  // ---------------------------------------------------------------- end card (f1625-1799): the eight heroes, each on its beat
  {
    id: 'S40',
    f0: 1625,
    f1: 1799,
    // the whole cast in one line-up, laid by the end card under the logo; each hero hops into a pose on its own
    // eighth note (the compositor's hop, the lobby's idle under it); 9:16: two rows of four
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
    cam: { target: { p3: [0, 5.3, 0] }, keys: [{ f: 1625, dist: 0.68, pitch: 6, yaw: 0, fov: 40 }, { f: 1799, dist: 0.65, yaw: 0, ease: 'linear' }] },
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
      keys: [{ f: 1625, dist: 0.9, pitch: 18, yaw: 0, fov: 40 }, { f: 1799, dist: 0.87, yaw: 0, ease: 'linear' }],
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
