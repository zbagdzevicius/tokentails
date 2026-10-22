/**
 * The storyboard's shot list as data ("Meet Gabė", 30.000 s, 120 BPM, 60 fps: STORYBOARD.md §3, §6). capture.mjs turns
 * each entry plus its take (takes.json) into a harness ShotSpec per aspect. Frames are the master's output frames.
 *
 *   take      takes.json id; `anchor` puts the take's key tick on a frame, `fit` stretches the ramp on `seg` so a
 *             second key lands on its frame too (the timing probe measures both, game hit-stops and slow-mo included)
 *   cam       director camera: target (roles from the take: '@brutus' = its slot) and keys (director.ts)
 *   layers    'pops' (CLANK!, numbers, callouts, barks), 'banner' (announcer), 'wheel', 'hud' (the full HUD)
 *   whip      frames rendered as 8 sub-frames with a 180° shutter (motion blur)
 *   parts     one continuous take split into the storyboard's shots
 *   portrait  9:16 overrides (§6): wide shots ×1.35 distance, close-ups re-targeted
 */

/** Wide shots get 1.35× the distance in 9:16 (§6). */
const wide = (keys) => keys.map((k) => (k.dist !== undefined ? { ...k, dist: Math.round(k.dist * 135) / 100 } : k));

export const SHOTS = [
  {
    id: 'S01',
    f0: 0,
    f1: 29,
    take: 'A',
    // one tick after the contact: frame 0 already holds the slash, the spark and CLANK! (thumbnails, autoplay)
    anchor: { key: 'clank', frame: 0, offset: 0.5 },
    // tight on the contact (the two heroes fill about half the frame height), then a push through the recoil
    cam: { target: { mid: ['@hero', '@brutus'], lift: 1.0 }, keys: [{ f: 0, dist: 0.36, pitch: 22, yaw: -35, fov: 34 }, { f: 4, dist: 0.36 }, { f: 29, dist: 0.29, yaw: -28, ease: 'out' }] },
    ramp: [[0, 0], [3, 0], [4, 0.2], [29, 1, 'out']],
    layers: ['pops'],
    dmgRadius: 6,
    popText: [],
    portrait: { keys: [{ f: 0, dist: 0.52, pitch: 22, yaw: -35, fov: 34 }, { f: 4, dist: 0.52 }, { f: 29, dist: 0.44, yaw: -28, ease: 'out' }] },
  },
  {
    id: 'S02',
    f0: 30,
    f1: 119,
    parts: [
      { id: 'S02', f0: 30, f1: 74 },
      { id: 'S03', f0: 75, f1: 119 },
    ],
    take: 'B',
    anchor: { key: 'release', frame: 52 },
    fit: { key: 'hit', frame: 89, seg: [52, 88] },
    cam: {
      target: {
        cut: [
          [30, { unit: '@hero', lift: 1.4 }],
          // rides the shot: the look point travels from Sage to the target
          [52, { blend: [{ unit: '@hero', lift: 1.4 }, { unit: '@target', lift: 1.2 }], f0: 52, f1: 74 }],
          // the Bullseye, three-quarter front: Cacklejaw walks toward Sage (screen left), the Moonshot flies in from the left
          [75, { unit: '@target', lift: 1.2 }],
        ],
      },
      keys: [
        // the draw: a fast push onto Sage and her aim line, orbiting round to her bow side
        { f: 30, dist: 0.36, pitch: 10, yaw: 70, fov: 40 },
        { f: 51, dist: 0.22, yaw: 96, ease: 'out' },
        { f: 52, dist: 0.6, pitch: 18, yaw: 60, ease: 'hold' },
        { f: 60, yaw: 10, pitch: 24, ease: 'in' },
        { f: 74, dist: 0.6, yaw: 10, pitch: 24 },
        { f: 75, dist: 0.28, pitch: 12, yaw: -45, ease: 'hold' },
        { f: 89, dist: 0.25 },
        { f: 119, dist: 0.3, ease: 'out' },
      ],
      smooth: 0.08,
    },
    // the arrow's last metres at 0.35x; the sim hit crosses on f89, so its flash and spark are drawn on the beat (f90),
    // then a 3-frame hit-stop holds them
    ramp: [[30, 1.2], [51, 1.2], [52, 2.0], [74, 2.0], [75, 1.0], [82, 1.0], [84, 0.35], [90, 0.35], [91, 0], [93, 0], [94, 0.3], [102, 0.3], [107, 1.0]],
    whip: [52, 77],
    layers: ['pops'],
    // an ally standing between the lens and Sage is not drawn; far numbers and screen pops are hidden
    cullHeroes: 7,
    dmgRadius: 7,
    popText: [],
    portrait: {
      keys: [
        { f: 30, dist: 0.42, pitch: 10, yaw: 70, fov: 40 },
        { f: 51, dist: 0.28, yaw: 96, ease: 'out' },
        { f: 52, dist: 0.6, pitch: 30, yaw: 150, ease: 'hold' },
        { f: 60, yaw: 100, ease: 'in' },
        { f: 74, dist: 0.6, yaw: 100 },
        { f: 75, dist: 0.38, pitch: 12, yaw: -45, ease: 'hold' },
        { f: 89, dist: 0.35 },
        { f: 119, dist: 0.4, ease: 'out' },
      ],
    },
  },
  {
    id: 'S05',
    f0: 180,
    f1: 239,
    // Gabė's champion on a flat key colour (the backdrop disc and pedestal hidden): the edit lays her over the same
    // blurred world as the photo card, so the match cut keeps the background and only the cat changes. Her eyes on
    // f186 land where the photo's eyes end (GABE.screenEyes); a slow push and orbit, her stand turning, through f239
    lobby: { key: '#00ff00', stands: [{ hero: 'gabe', spin: 0.22, spinFrom: 180 }] },
    cam: { target: { p3: [0, 1.95, 0] }, keys: [{ f: 180, dist: 0.165, pitch: 4, yaw: -8, fov: 40 }, { f: 239, dist: 0.13, yaw: 8, ease: 'linear' }] },
    portrait: { target: { p3: [0, 2.3, 0] }, keys: [{ f: 180, dist: 0.25, pitch: 4, yaw: -8, fov: 40 }, { f: 239, dist: 0.2, yaw: 8, ease: 'linear' }] },
  },
  {
    id: 'S06',
    f0: 240,
    f1: 359,
    take: 'C',
    anchor: { key: 'clash', frame: 240 },
    cam: {
      target: { point: '@clash', lift: 1 },
      // the clash fills the centre third on the drop, then the crane settles in
      // a crane down onto the clash on the drop: high and wide on f240, settling low by f299 (dist 1.6 -> 0.6)
      keys: [{ f: 240, dist: 1.6, pitch: 68, yaw: 0, fov: 40 }, { f: 299, dist: 0.6, pitch: 36, ease: 'out' }, { f: 300, yaw: 0 }, { f: 359, yaw: 12, ease: 'ease' }],
      smooth: 0.4,
    },
    layers: ['pops'],
    portrait: { keys: [{ f: 240, dist: 2.0, pitch: 68, yaw: 0, fov: 40 }, { f: 299, dist: 0.78, pitch: 36, ease: 'out' }, { f: 300, yaw: 0 }, { f: 359, yaw: 12, ease: 'ease' }] },
  },
  {
    id: 'S07',
    f0: 360,
    f1: 389,
    take: 'D',
    anchor: { key: 'hit', frame: 372 },
    // side-on to the charge (Sir Brutus runs across the screen at the cat he knocks back), tracking him; heroes that
    // would stand between the lens and the pair are not drawn, and no other hero's callout is up
    cam: { target: { mid: ['@hero', '@victim'], lift: 1.1 }, align: { a: '@hero', b: '@victim' }, keys: [{ f: 360, dist: 0.46, pitch: 22, yaw: -90, fov: 40 }, { f: 389, dist: 0.42 }], smooth: 0.1 },
    ramp: [[360, 1], [372, 1], [373, 0], [375, 0], [376, 1]],
    layers: ['pops'],
    popText: [],
    dmgRadius: 6,
    cullHeroes: 3.5,
    cullFront: 0.8,
    portrait: { keys: [{ f: 360, dist: 0.62, pitch: 22, yaw: -90, fov: 40 }, { f: 389, dist: 0.56 }] },
    near: 2,
  },
  {
    id: 'S08',
    f0: 390,
    f1: 419,
    take: 'E',
    look: 'demo-ficus',
    anchor: { key: 'hit', frame: 398 },
    // Avietė's Short Circuit on Sir Brutus (Ficus card): only her own ultimate callout
    cam: { target: { mid: ['@hero', '@target'], lift: 1.1 }, keys: [{ f: 390, dist: 0.5, pitch: 30, yaw: 0, fov: 40 }, { f: 419, dist: 0.44 }], smooth: 0.12 },
    ramp: [[390, 1], [398, 1], [399, 0], [400, 0], [401, 1]],
    layers: ['pops'],
    popText: ['Short Circuit!'],
    dmgRadius: 6,
    cullHeroes: 3.5,
    cullFront: 0.8,
  },
  {
    id: 'S09',
    f0: 420,
    f1: 449,
    take: 'F',
    // the cut lands three ticks after the cast, once she has stepped clear of the cats' yarn core: the stage is lit
    anchor: { key: 'cast', frame: 420, offset: 3 },
    // Bengas centred on her burning stage
    cam: { target: { unit: '@hero', lift: 1 }, keys: [{ f: 420, dist: 0.46, pitch: 46, yaw: 120, fov: 40 }, { f: 449, dist: 0.41, yaw: 134 }], smooth: 0.12 },
    layers: ['pops'],
    popText: ['Curtains Up!'],
    dmgRadius: 7,
    cullHeroes: 3.5,
    cullFront: 0.8,
  },
  {
    id: 'S10',
    f0: 450,
    f1: 479,
    take: 'G',
    anchor: { key: 'leap', frame: 462 },
    cam: { target: { unit: '@hero', lift: 1 }, keys: [{ f: 450, dist: 0.5, pitch: 16, yaw: 150, fov: 40 }], smooth: 0.12 },
    ramp: [[450, 1], [462, 1], [466, 0.3], [474, 0.3], [476, 1.5], [479, 1.5]],
    layers: ['pops'],
    popText: ['Pack Hunt!'],
    dmgRadius: 6,
    cullHeroes: 3.5,
    cullFront: 0.6,
  },
  {
    id: 'S11',
    f0: 480,
    f1: 539,
    take: 'H',
    anchor: { key: 'pull', frame: 480 },
    fit: { key: 'land', frame: 512, seg: [480, 511] },
    cam: { target: { unit: '@hero', lift: 1 }, keys: [{ f: 480, dist: 0.7, pitch: 40, yaw: -20, fov: 40 }, { f: 539, dist: 0.6 }], smooth: 0.15 },
    ramp: [[480, 1], [510, 1], [512, 0.6], [530, 0.6], [531, 1]],
    layers: ['pops'],
  },
  {
    id: 'S12',
    f0: 540,
    f1: 593,
    take: 'I',
    anchor: { key: 'spell', frame: 540 },
    fit: { key: 'pop', frame: 580, seg: [540, 579] },
    // a side-on two-shot: Gabė and Sir Brutus on one horizontal line (the align yaw + 90°), Brutus walking across to her
    cam: { target: { mid: ['@hero', '@target'], lift: 1 }, align: { a: '@target', b: '@hero' }, keys: [{ f: 540, dist: 0.5, pitch: 34, yaw: 90, fov: 40 }, { f: 593, dist: 0.445 }], smooth: 0.25 },
    layers: ['pops'],
    // only the shot's own words: other heroes' ability names and far numbers stay out
    popText: [],
    dmgRadius: 6,
    cullHeroes: 2.5,
    // 9:16: a vertical two-shot, Gabė low in frame and Sir Brutus walking down-screen toward her, under L4
    portrait: { align: { a: '@target', b: '@hero' }, target: { mid: ['@hero', '@target'], lift: 2.2 }, keys: [{ f: 540, dist: 0.62, pitch: 40, yaw: 0, fov: 40 }, { f: 593, dist: 0.565 }] },
  },
  {
    id: 'S13',
    f0: 594,
    f1: 659,
    take: 'J',
    // the real ping wheel over Clem for 0.3 s (drawn 4x: a punch-in on that one layer, about 40 % of the frame height),
    // Group on me sent on f611; then a cut to the two allies far down the lane, seen from Clem's side: they answer
    // ("Coming to you!", the trailer caption by the ally; the game's own small bark stack is hidden) and run at the
    // lens, toward her. The same cat refuses in S14.
    anchor: { key: 'ping1', frame: 611 },
    wheel: { open: 594, close: 611, at: [0.5, 0.5] },
    wheelScale: 4,
    cam: {
      target: { cut: [[594, { unit: '@hero', lift: 1 }], [612, { mid: [1, '@healer'], lift: 1.1 }]] },
      align: { a: '@healer', b: '@hero' },
      keys: [{ f: 594, dist: 0.44, pitch: 36, yaw: 0, fov: 40 }, { f: 611, dist: 0.38, ease: 'out' }, { f: 612, dist: 0.36, pitch: 20, yaw: 0, ease: 'hold' }, { f: 659, dist: 0.29 }],
      smooth: 0.1,
    },
    layers: ['pops', 'wheel'],
    popText: [],
    dmgRadius: 6,
    cullHeroes: 3,
    portrait: { keys: [{ f: 594, dist: 0.52, pitch: 36, yaw: 0, fov: 40 }, { f: 611, dist: 0.46, ease: 'out' }, { f: 612, dist: 0.5, pitch: 22, yaw: 0, ease: 'hold' }, { f: 659, dist: 0.42 }] },
  },
  {
    id: 'S14',
    f0: 660,
    f1: 719,
    take: 'J',
    anchor: { key: 'bark2', frame: 664 },
    // she turns and walks: a touch faster than real time so the walk reads in one second
    ramp: [[660, 1], [672, 1], [680, 1.4]],
    // the same ally turns for home (west): the camera waits ahead of her, so she walks toward it, out of the fight
    cam: { target: { unit: '@healer', lift: 1.0 }, keys: [{ f: 660, dist: 0.32, pitch: 14, yaw: -90, fov: 40 }, { f: 719, dist: 0.3 }], smooth: 0.15 },
    portrait: { keys: [{ f: 660, dist: 0.42, pitch: 16, yaw: -90, fov: 40 }, { f: 719, dist: 0.4 }] },
    layers: ['pops'],
    popText: [],
    dmgRadius: 6,
    cullHeroes: 3,
  },
  {
    id: 'S15',
    f0: 720,
    f1: 779,
    take: 'K',
    // the hop lands on the slam (f720): four heroes in his ring are shoved 1.2-1.5 m outward over 6 ticks (the game's
    // knockback); the shove plays at 0.45x over the half second after the slam, seen close and low so it reads
    anchor: { key: 'bounce', frame: 720 },
    cam: { target: { unit: '@pudding', lift: 1.3 }, keys: [{ f: 720, dist: 0.5, pitch: 20, yaw: 90, fov: 40 }, { f: 779, dist: 0.46 }], smooth: 0.3 },
    cullFront: 0.5,
    ramp: [[720, 1], [722, 0.45], [752, 0.45], [762, 1]],
    layers: ['pops'],
    popText: [],
    dmgRadius: 9,
    cullHeroes: 3,
    portrait: { keys: [{ f: 720, dist: 0.66, pitch: 24, yaw: 90, fov: 40 }, { f: 779, dist: 0.6 }] },
  },
  // S16: calmed, Pudding walks with the cats' next wave (units/pudding.ts) to a dog tower: low and close behind him,
  // the cats and the tower beyond (take T, half a second before S17's angle on the same push)
  {
    id: 'S16',
    f0: 780,
    f1: 839,
    take: 'T',
    anchor: { key: 'tower', frame: 839, offset: -30 },
    cam: { target: { unit: '@pudding', lift: 1.6 }, keys: [{ f: 780, dist: 0.36, pitch: 12, yaw: -100, fov: 40 }, { f: 839, dist: 0.31, yaw: -84 }], smooth: 0.2 },
    layers: ['pops'],
    popText: [],
    dmgRadius: 9,
    cullHeroes: 3,
    cullFront: 0.5,
    near: 1.5,
    portrait: { keys: [{ f: 780, dist: 0.48, pitch: 12, yaw: -100, fov: 40 }, { f: 839, dist: 0.42, yaw: -84 }] },
  },
  {
    id: 'S17',
    f0: 840,
    f1: 959,
    parts: [
      { id: 'S17', f0: 840, f1: 914 },
      { id: 'S17b', f0: 915, f1: 959 },
    ],
    take: 'T',
    // seen from the south: the cats, Pudding and their wave on the left, the dog tower on the right, nobody between it
    // and the lens; the push rides the riser. The tower is whole on f899 (its hit flash) and gone on the beat (f900):
    // the game's structure burst (rings, shards, stars, dust, rubble), a 3-frame hit-stop, then the burst at 0.6x
    // easing to 0.35x; f915 cuts low and close to the rubble and the dust with the cats behind it
    anchor: { key: 'tower', frame: 899 },
    cam: {
      target: { cut: [[840, { point: [77500, 11500], lift: 2.0 }], [915, { point: '@tower', lift: 1.4 }]] },
      keys: [
        { f: 840, dist: 0.66, pitch: 34, yaw: 0, fov: 40 },
        { f: 899, dist: 0.5, ease: 'in' },
        { f: 914, dist: 0.56, ease: 'out' },
        { f: 915, dist: 0.34, pitch: 14, yaw: 60, ease: 'hold' },
        { f: 959, dist: 0.3, yaw: 70 },
      ],
      smooth: 0.15,
    },
    ramp: [[840, 1], [900, 1], [901, 0], [903, 0], [904, 0.6], [914, 0.35], [959, 0.35]],
    layers: ['pops'],
    popText: [],
    dmgRadius: 12,
    cullHeroes: 3,
    // the lane-side bushes nearer than 4 m stay out of the low close-up
    near: 4,
    portrait: {
      keys: [
        { f: 840, dist: 0.9, pitch: 36, yaw: 0, fov: 40 },
        { f: 899, dist: 0.7, ease: 'in' },
        { f: 914, dist: 0.76, ease: 'out' },
        // 9:16: from further round, so the tree beside the lane stays out of the narrow frame
        { f: 915, dist: 0.46, pitch: 16, yaw: 20, ease: 'hold' },
        { f: 959, dist: 0.42, yaw: 30 },
      ],
    },
  },
  {
    id: 'S18',
    f0: 960,
    f1: 989,
    take: 'L',
    // half a second, close: the cats' tower is whole, falls on f964 (hit-stop), its dust in slow motion
    anchor: { key: 'towerLost', frame: 964 },
    cam: { target: { point: '@tower', lift: 2.2 }, keys: [{ f: 960, dist: 0.44, pitch: 24, yaw: 30, fov: 40 }, { f: 989, dist: 0.5, ease: 'out' }] },
    ramp: [[960, 1], [964, 1], [965, 0], [967, 0], [968, 0.5], [989, 0.4]],
    layers: ['pops'],
    popText: [],
    dmgRadius: 8,
    cullHeroes: 3,
    portrait: { keys: [{ f: 960, dist: 0.6, pitch: 24, yaw: 30, fov: 40 }, { f: 989, dist: 0.66, ease: 'out' }] },
  },
  {
    id: 'S19',
    f0: 990,
    f1: 1079,
    take: 'L',
    // the real player view, full HUD: Purr-ify lands in the second half
    anchor: { key: 'purrify', frame: 1052 },
    cam: null,
    layers: ['hud'],
    // the "We lost a tower" banner (still up from S18) would sit over the name plates: hidden, the rest of the HUD as is
    hide: ['.pl-banner'],
    // 9:16: a phone held upright (360x640 CSS px at DPR 3) with the touch HUD: the buttons, joystick and ATK read
    portrait: { width: 360, height: 640, dpr: 3, touch: true },
  },
  {
    id: 'S20',
    f0: 1080,
    f1: 1139,
    take: 'L',
    // the COMEBACK! banner's first frame on f1080 (it can queue behind another banner)
    anchor: { key: 'comeback', frame: 1080, banner: 'COMEBACK!' },
    // the queue ahead of it plays out at full rate before f1080 (a seek would rush it)
    preroll: 480,
    // the cats' next wave marching out at the lens (the camera dollies back with it), Pudding behind them
    cam: { target: { wave: 0, near: '@hero', r: 16, lift: 0.6 }, keys: [{ f: 1080, dist: 0.28, pitch: 9, yaw: 180, fov: 40 }, { f: 1139, dist: 0.25, yaw: 188 }], smooth: 0.3 },
    // the trailer type repeats the banner's words large; the game's own small banner is hidden (never both)
    layers: ['pops'],
    dmgRadius: 10,
    popText: [],
    near: 2.5,
    portrait: { keys: [{ f: 1080, dist: 0.42, pitch: 13, yaw: 180, fov: 40 }, { f: 1139, dist: 0.38, yaw: 188 }] },
  },
  {
    id: 'S21',
    f0: 1140,
    f1: 1199,
    take: 'M',
    // the "Shut down!" banner up on f1150 (it can queue behind the first knockout's); the caption repeats it
    anchor: { key: 'ko2', frame: 1150, banner: 'Shut down!' },
    preroll: 300,
    cam: { target: { mid: ['@hero', '@victim'], lift: 1 }, keys: [{ f: 1140, dist: 0.62, pitch: 30, yaw: -15, fov: 40 }, { f: 1199, dist: 0.5, yaw: 15, ease: 'ease' }], smooth: 0.2 },
    ramp: [[1140, 1], [1148, 1], [1150, 0.5], [1166, 0.5], [1170, 1]],
    layers: ['pops'],
    dmgRadius: 10,
    popText: [],
    portraitWide: true,
  },
  // S22: one pass per card (a lobby re-spawn would pop the hero in from small): hard cuts on the beat, the camera and
  // the turntable continuous across them
  ...[
    ['S22a', 1200, 1229, 'demo-pickles'],
    ['S22b', 1230, 1259, 'demo-rascal'],
    ['S22c', 1260, 1289, 'demo-pinkie'],
    ['S22d', 1290, 1319, 'demo-ficus'],
  ].map(([id, f0, f1, card]) => ({
    id,
    f0,
    f1,
    lobby: { stands: [{ hero: 'lambo', card, face: -20, spin: 0.35, spinFrom: 1200 }] },
    preroll: 150,
    cam: { target: { p3: [0, 1.2, 2.9] }, keys: [{ f: 1200, dist: 0.3, pitch: 10, yaw: 0, fov: 40 }, { f: 1319, dist: 0.26 }] },
    // 9:16: the hero in the lower part of the frame, L5 above her head
    portrait: { target: { p3: [0, 2.1, 0] }, keys: [{ f: 1200, dist: 0.36, pitch: 10, yaw: 0, fov: 40 }, { f: 1319, dist: 0.32 }] },
  })),
  // S23: ultimates on the eighths, one take per hero (U1..U6), each cut lands its cast 3 frames in. Every cut is tight
  // on the caster (the effect at the centre of the frame) with only that hero's own ultimate callout; the screen
  // direction alternates left/right per cut
  ...[
    ['S23a', 'U1', 1320, 30, 60],
    ['S23b', 'U2', 1335, 26, 30],
    ['S23c', 'U3', 1350, 30, -30],
    ['S23d', 'U4', 1365, 26, 30],
    ['S23e', 'U5', 1380, 30, 150],
    ['S23f', 'U6', 1395, 26, -150],
  ].map(([id, take, f0, pitch, yaw]) => ({
    id,
    f0,
    f1: f0 + 14,
    take,
    anchor: { key: 'cast', frame: f0 + 3 },
    cam: { target: { unit: '@caster', lift: 1.1 }, keys: [{ f: f0, dist: 0.46, pitch, yaw, fov: 40 }, { f: f0 + 14, dist: 0.41 }], smooth: 0.08 },
    layers: ['pops'],
    popText: ['Golden Hour!', 'Moonshot!', 'Champion’s Challenge!', 'Short Circuit!', 'Pack Hunt!', 'Curtains Up!'],
    dmgRadius: 5,
    cullHeroes: 3,
    cullFront: 0.6,
    near: 3,
    portrait: { keys: [{ f: f0, dist: 0.58, pitch, yaw, fov: 40 }, { f: f0 + 14, dist: 0.52 }] },
  })),
  {
    id: 'S24',
    f0: 1410,
    f1: 1436,
    take: 'N',
    // the hang: Lambo launches his Belly Flop at the dog core (in the game the flop is a fast ground hop, no vertical
    // arc, so nothing is faked into the air): a low lens with the sky behind him, time all but stopped at 0.06x while
    // the camera keeps orbiting and pushing in (a held breath, not a stalled frame)
    anchor: { key: 'flop', frame: 1414, offset: 0.5 },
    cam: { target: { unit: '@hero', lift: 1.7 }, keys: [{ f: 1410, dist: 0.22, pitch: 9, yaw: 75, fov: 42 }, { f: 1416, dist: 0.22, yaw: 75 }, { f: 1436, dist: 0.176, yaw: 97, ease: 'out' }], smooth: 0.08 },
    ramp: [[1410, 1], [1414, 1], [1418, 0.06], [1436, 0.06]],
    layers: ['pops'],
    popText: [],
    dmgRadius: 4,
    cullHeroes: 4,
    cullFront: 0.6,
    near: 1.2,
    portrait: { keys: [{ f: 1410, dist: 0.3, pitch: 9, yaw: 75, fov: 42 }, { f: 1416, dist: 0.3, yaw: 75 }, { f: 1436, dist: 0.24, yaw: 97, ease: 'out' }] },
  },
  {
    id: 'S25',
    f0: 1437,
    f1: 1559,
    parts: [
      { id: 'S25', f0: 1437, f1: 1499 },
      { id: 'S26', f0: 1500, f1: 1559 },
    ],
    take: 'N',
    // The dog core, whole, as Lambo lands on it (f1437), its white hit flash on f1439, and on the beat (f1440) the
    // first frame without it: the game's structure burst (shockwave rings, shards, stars, dust, rubble). A 3-frame
    // hit-stop holds the break, then the burst plays out at 0.7x easing to 0.25x while the game's own
    // slowmo(1200, 0.25) holds the sim. The lens is on the dog side (south of the core, looking back at the cats), so
    // no hero stands between it and the core. Victory! (f1500): the cats from the front, over the settling dust.
    anchor: { key: 'core', frame: 1439 },
    cam: {
      target: {
        cut: [
          [1437, { point: '@core', lift: 2.4 }],
          [1500, { mid: ['@hero', 1], lift: 1.5 }],
        ],
      },
      keys: [
        { f: 1437, dist: 0.48, pitch: 28, yaw: 15, fov: 40 },
        { f: 1440, dist: 0.48 },
        { f: 1499, dist: 0.67, ease: 'out' },
        { f: 1500, dist: 0.36, pitch: 24, yaw: 10, ease: 'hold' },
        { f: 1559, dist: 0.32, yaw: 16 },
      ],
      smooth: 0.15,
    },
    ramp: [[1437, 1], [1440, 1], [1441, 0], [1443, 0], [1444, 0.7], [1456, 0.4], [1470, 0.25], [1499, 0.25], [1500, 1]],
    layers: ['pops'],
    popText: [],
    dmgRadius: 8,
    cullHeroes: 3,
    portrait: {
      keys: [
        { f: 1437, dist: 0.62, pitch: 28, yaw: 15, fov: 40 },
        { f: 1440, dist: 0.62 },
        { f: 1499, dist: 0.85, ease: 'out' },
        { f: 1500, dist: 0.46, pitch: 24, yaw: 10, ease: 'hold' },
        { f: 1559, dist: 0.42, yaw: 16 },
      ],
    },
  },
  {
    id: 'S27',
    f0: 1560,
    f1: 1799,
    // Clem and Sir Brutus on their stands, on a key colour (the lobby's glow disc gone): the end card lays them,
    // blurred and darkened, over its own background. Their idle animations run and the camera drifts (push + orbit)
    // so the card stays alive; both stands sit inside the 5 % action-safe margin
    lobby: { key: '#00ff00', keepStage: true, stands: [{ hero: 'clem', x: -3.3, z: 1.2, face: 35 }, { hero: 'brutus', team: 1, x: 3.3, z: 1.2, face: -35 }] },
    cam: { target: { p3: [0, 3.1, 0] }, keys: [{ f: 1560, dist: 0.47, pitch: 8, yaw: -5, fov: 40 }, { f: 1799, dist: 0.42, yaw: 5, ease: 'linear' }] },
    portrait: {
      // Clem's stand at the back (top of the frame, above the logo), Sir Brutus's in front, low in the frame
      stands: [{ hero: 'clem', x: 0, z: -9, face: 20 }, { hero: 'brutus', team: 1, x: 0, z: 9, face: -20 }],
      keys: [{ f: 1560, dist: 9, pitch: 30, yaw: -3, fov: 4.0 }, { f: 1799, dist: 8.7, yaw: 3, ease: 'linear' }],
      target: { p3: [0, 2.4, 2.4] },
    },
  },
];

/** The 9:16 version of a shot's camera keys. */
export function portraitKeys(shot) {
  if (shot.portrait?.keys) return shot.portrait.keys;
  return shot.portraitWide ? wide(shot.cam?.keys ?? []) : (shot.cam?.keys ?? []);
}
