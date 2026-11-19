#!/usr/bin/env node
// Trailer 60 ("The Understudy", feat. Rocket): the gameplay takes as clip-engine specs (tools/clips/record.mjs), one per
// shot and aspect. Every match take is Cannon Chaos on the Crossing (3v3, the Kibble Cannon from 0:15). The story set
// (A) scripts the dogs' three seats (tools/clips/clip-script.ts): Bravo holds ENCORE! for the cannon carrier's windup
// and poses in Center Stage when an ultimate lands near him, Rocket sprints at the carrier (ZOOM… ZZZ) and runs for a
// dropped cannon; the cats are the game's own bots. Every moment below was found by tools/trailer60/search.mjs.
// node tools/trailer60/specs.mjs > specs.json
const FPS = 60;

const SETS = {
  // the story: dogs Bravo, Rocket, Champ (scripted seats) vs cats Pixel, Sage, Nova
  A: {
    variant: 'coop',
    teams: [['bravo', 'rocket', 'champ'], ['pixel', 'sage', 'nova']],
    script: [
      { slot: 0, do: 'encore' }, { slot: 0, do: 'avoid' }, { slot: 0, do: 'stage', heroes: ['sage', 'nova', 'champ'] },
      { slot: 1, do: 'zzz' }, { slot: 1, do: 'cannon' }, { slot: 2, do: 'avoid' },
    ],
  },
  // Act II and the dogs' win: Bravo poses whenever a cat comes close
  B: { variant: 'bots', teams: [['bravo', 'brutus', 'chili'], ['meatball', 'aviete', 'ziggy']], script: [{ slot: 0, do: 'stage', fight: 5000 }] },
  // the bush, the bowling stinger
  C: { variant: 'bots', teams: [['ranger', 'barkula', 'bravo'], ['meatball', 'stilts', 'aviete']] },
  // the credits in food coats
  D: { variant: 'bots', teams: [['frankie', 'domino', 'nugget'], ['meatball', 'pixel', 'duchess']] },
  E: { variant: 'bots', teams: [['howler', 'bravo', 'rocket'], ['gabe', 'nova', 'sage']] },
};
const slotOf = (set, hero) => SETS[set].teams.flat().indexOf(hero);

const BRAVO = { understudy: 'coat.bravo.understudy', harlequin: 'coat.bravo.store_harlequin', opera: 'coat.bravo.opera', night: 'coat.bravo.s1_opening_night' };
const MEGA = 'coat.meatball.store_mega_meal';
const CHAIR = 'coat.brutus.store_chairman';
const looksA = (bravo) => [[bravo, null, null], [null, null, null]];
const LOOKS = {
  B: [[BRAVO.night, CHAIR, null], [MEGA, null, null]],
  C: [[null, null, BRAVO.night], [MEGA, null, null]],
  D: [['coat.frankie.store_kebab_king', 'coat.domino.store_pizzaiolo', 'coat.nugget.store_robo_vac'], ['coat.meatball.store_drive_thru', 'coat.pixel.store_moonwhisker', 'coat.duchess.store_blue_point']],
  E: [[null, BRAVO.night, null], [null, null, null]],
};

/**
 * id, set, seed, t (game s of the moment), lead (s before it), dur (output s), unit (hero followed) | point, dist (x the
 * game distance), push (dist factor at the end), slow: [[atOutS, speed, rampFrames], ...], looks.
 */
const SHOTS = [
  // S01 hook (round 2: the flop read as a blur of stars on a tiny body): the camera punches in on the flop (0.42 to
  // 0.24 of the game distance over 10 frames) and holds, so the legs-up pose fills the frame before the iris
  { id: 'h01-flop', set: 'A', seed: 26, t: 185.17, lead: 1.1, dur: 2.2, unit: 'bravo', dist: 0.42, keys: [[0, 1], [60, 0.95], [72, 0.58, 'out'], [131, 0.55]], looks: looksA(BRAVO.night) },
  // S03-S04 the cannon spawns; Rocket and Sage race for it side by side, Sage takes it 0.8 m ahead of him (seed 68,
  // 142.2); round 2 follows Rocket (the race and the miss are his) so his name tag can ride on him
  { id: 'c01-miss', set: 'A', seed: 68, t: 142.2, lead: 3.0, dur: 4.2, unit: 'rocket', dist: 0.7, push: 0.85, looks: looksA(BRAVO.understudy) },
  // S05 audition #1: Sage's Moonshot leaves from his spotlight (seed 37, 297.43)
  { id: 'a01-sage', set: 'A', seed: 37, t: 297.43, lead: 0.5, dur: 2.6, unit: 'bravo', dist: 0.6, push: 0.9, looks: looksA(BRAVO.understudy) },
  // S06 Rocket's ZOOM... ZZZ past Pixel and the cannon, a nap 0.4 m from her (seed 55, nap 68.53)
  { id: 'z01-nap', set: 'A', seed: 55, t: 68.53, lead: 1.3, dur: 2.6, unit: 'rocket', dist: 0.6, push: 0.9, looks: looksA(BRAVO.understudy) },
  // S07 audition #2: Nova's ultimate on the spotlight (seed 24, 81.4)
  { id: 'a02-nova', set: 'A', seed: 24, t: 81.4, lead: 0.5, dur: 2.6, unit: 'bravo', dist: 0.6, push: 0.9, looks: looksA(BRAVO.understudy) },
  // S10 audition #3: his own Champ's KNOCKOUT! (seed 17, 133.6)
  { id: 'a03-champ', set: 'A', seed: 17, t: 133.6, lead: 0.5, dur: 2.2, unit: 'bravo', dist: 0.6, push: 0.9, looks: looksA(BRAVO.understudy) },
  // S12 the costume change (round 2: Center Stage's white bloom hid the coats, and a dog stood blurred in the
    // foreground, on the pale tower ground): seed 26 in the fountain, 2 s before the hook's footage, Bravo in the clear
  ...['understudy', 'harlequin', 'opera', 'night'].map((k) => ({ id: `k-${k}`, set: 'A', seed: 26, t: 184.0, lead: 2.6, dur: 2.4, unit: 'bravo', dist: 0.42, push: 0.9, looks: looksA(BRAVO[k]) })),
  // S13 the bush: Ranger hides, Meatball (Mega Meal) sits in the same bush (seed 47, 169.93)
  { id: 'b01-bush', set: 'C', seed: 47, t: 169.93, lead: 1.1, dur: 3.4, point: [39500, 45500], dist: 0.55, push: 0.92 },
  // S14 + S18 the payoff (seed 43): Pixel carries it to the dog tower and winds up, Bravo bows (ENCORE!), she fumbles
  { id: 'p01-plant', set: 'A', seed: 43, t: 201.2, lead: 2.8, dur: 2.0, unit: 'pixel', dist: 0.6, push: 0.9, looks: looksA(BRAVO.night) },
  { id: 'p02-encore', set: 'A', seed: 43, t: 201.2, lead: 1.4, dur: 5.6, unit: 'bravo', dist: 0.5, push: 0.9, looks: looksA(BRAVO.night) },
  // S19 Rocket steals the cannon Bravo's ENCORE! knocked loose (seed 2: Sage fumbles on 194.37, Rocket takes it on
  // 196.3) and fires: KABOOM on Nova on 197.33. Round 2 follows Rocket (a viewer could not tell who scored)
  { id: 'p03-rocket', set: 'A', seed: 2, t: 197.1, lead: 1.5, dur: 3.4, unit: 'rocket', dist: 0.62, push: 0.9, looks: looksA(BRAVO.night) },
  // S15 Act II (round 2: seven 1 s cuts read as clutter): three hero moments, cast > hit > result, 0.8x on the cast
  { id: 'u-ziggy', set: 'B', seed: 1, t: 171.67, lead: 0.8, dur: 3.0, unit: 'ziggy', dist: 0.6, push: 0.88, slow: [[0.7, 0.8, 8], [1.9, 1, 10]] },
  { id: 'u-brutus', set: 'B', seed: 9, t: 274.17, lead: 0.8, dur: 3.0, unit: 'brutus', dist: 0.6, push: 0.88, slow: [[0.7, 0.8, 8], [1.9, 1, 10]] },
  { id: 'u-meatball', set: 'B', seed: 5, t: 268.1, lead: 0.8, dur: 3.0, unit: 'meatball', dist: 0.6, push: 0.88, slow: [[0.7, 0.8, 8], [1.9, 1, 10]] },
  // S16 Bravo plays dead in slow motion (a Ziggy hit, seed 3, 87.27)
  { id: 'f02-flop', set: 'B', seed: 3, t: 87.27, lead: 0.7, dur: 2.2, unit: 'bravo', dist: 0.45, push: 0.9, slow: [[0.7, 0.3, 6]] },
  // S20 the cat core falls (round 1: B seed 29, 239.8). Round 2: seed 40, Brutus (Chairman) and Meatball in the shot; (review: the burning core's dark smoke column drew a black blob
  // over the top of the frame): the look point 7 m toward the camera (-y), so the core sits high and the smoke rises out
  // of the frame, and the dogs pushing it stand in the lower half (the 9:16 cut frames this landscape take: edit.mjs wideV)
  { id: 'v01-core', set: 'B', seed: 40, t: 226.17, lead: 1.2, dur: 4.4, point: [90000, 30000], off: [0, -1], dist: 0.85, push: 0.9 },
  // S23 the stinger: Meatball rolls through Bravo in his spotlight; he plays dead (C seed 74, 192.43)
  { id: 's01-bowl', set: 'C', seed: 74, t: 192.43, lead: 1.6, dur: 3.0, unit: 'bravo', dist: 0.45, push: 0.9 },
  // S09 the credits, round 2: five ultimates, each shot twice (the base coat, then the store coat: a match cut on the
  // half beat; looks never reach the sim, so both takes play the same ticks)
  ...[
    ['r1-meatball', 19, 200.3, 'meatball'], ['r2-frankie', 13, 163.17, 'frankie'], ['r3-pixel', 2, 208.07, 'pixel'], ['r4-domino', 17, 218.73, 'domino'], ['r5-duchess', 19, 200.5, 'duchess'],
  ].flatMap(([id, seed, t, unit]) => [
    { id, set: 'D', seed, t, lead: 0.3, dur: 1.5, unit, dist: 0.5, push: 0.9 },
    { id: `${id}-base`, set: 'D', seed, t, lead: 0.3, dur: 1.5, unit, dist: 0.5, push: 0.9, looks: [[null, null, null], [null, null, null]] },
  ]),
  // Gemini references: Bravo in the game's own render, close (the comic panels stay on-model)
  { id: 'ref-bravo', set: 'A', seed: 26, t: 183.9, lead: 0, dur: 0.3, unit: 'bravo', dist: 0.2, push: 1, looks: looksA(BRAVO.night) },
];

// The game's fixed play camera (src/render/camera/frame.ts): pitch 52, FOV 36, yaw 0; takes keep that angle and lens
// and only come closer, centred on their subject. 9:16: the portrait lens, a little steeper.
const GAMECAM = { horizontal: { pitch: 52, fov: 36 }, vertical: { pitch: 56, fov: 54 } };

function camFor(s, aspect) {
  const v = aspect === 'vertical';
  const N = Math.round(s.dur * FPS);
  // round 2: `off` [x, y] metres moves a point target (sim mm; +y is away from the camera at yaw 0)
  const off = s.off;
  const pt = s.point && off ? [s.point[0] + off[0] * 1000 * (s.offM ?? 7), s.point[1] + off[1] * 1000 * (s.offM ?? 7)] : s.point;
  const target = s.unit ? { unit: slotOf(s.set, s.unit), lift: 1 } : { point: pt, lift: 1 };
  const k = { ...GAMECAM[aspect], yaw: 0, lift: 1 };
  const d = s.dist * (v ? 0.9 : 1);
  // round 2: `keys` [[frame, dist factor, ease]] for a punch-in (the hook)
  if (s.keys) return { target, smooth: 0.2, keys: s.keys.map(([f, m, e]) => ({ f: Math.min(f, N - 1), dist: d * m, ...k, ...(e ? { ease: e } : {}) })) };
  return { target, smooth: 0.2, keys: [{ f: 0, dist: d, ...k }, { f: N - 1, dist: d * (s.push ?? 1), ...k, ease: 'ease' }] };
}

function rampFor(s) {
  if (!s.slow) return [];
  const r = [[0, 1]];
  let prev = 1;
  for (const [at, sp, k] of s.slow) {
    const f = Math.round(at * FPS);
    r.push([Math.max(0, f - k), prev], [f, sp, 'ease']);
    prev = sp;
  }
  return r;
}

// S21 the curtain call: all 28 champions on the lobby stage, cats then dogs (two lineups of 14; 9:16 four of 7)
const CATS = ['clem', 'sage', 'meatball', 'pixel', 'duchess', 'stilts', 'aviete', 'bengas', 'gabe', 'lambo', 'nova', 'ziggy', 'mochi', 'dusty'];
const DOGS = ['bravo', 'brutus', 'cacklejaw', 'nugget', 'marshmallow', 'chili', 'domino', 'frankie', 'rocket', 'howler', 'barkula', 'biscuit', 'champ', 'ranger'];
// (14 on one stage left them a few pixels tall and showed the backdrop's edge: four lineups of 7)
// round 2 (review: 3.4 s of near-static lineups of 7, tiny with jaggy outlines): seven quick lineups of four, two cats
// and two dogs each, closer, every hero acting; the edit cuts them on the half beat
const LINEUP = Array.from({ length: 7 }, (_, i) => [`cc${i + 1}`, [CATS[2 * i], CATS[2 * i + 1], DOGS[2 * i], DOGS[2 * i + 1]]]);
const LINEUPS = { horizontal: LINEUP, vertical: LINEUP };
const CC_LOOKS = { bravo: BRAVO.night, meatball: MEGA, brutus: CHAIR, frankie: 'coat.frankie.store_kebab_king', domino: 'coat.domino.store_pizzaiolo', pixel: 'coat.pixel.store_moonwhisker', duchess: 'coat.duchess.store_blue_point', nugget: 'coat.nugget.store_robo_vac' };

const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1].split(',') : null;
const out = [];
for (const aspect of ['horizontal', 'vertical']) {
  for (const s of SHOTS) {
    if (only && !only.includes(s.id)) continue;
    const set = SETS[s.set];
    out.push({
      id: `${s.id}-${aspect === 'vertical' ? 'v' : 'h'}`,
      mode: 'cannon',
      variant: set.variant,
      seed: s.seed,
      teams: set.teams,
      ...(set.script ? { script: set.script } : {}),
      looks: s.looks ?? LOOKS[s.set] ?? undefined,
      start: { at: +(s.t - s.lead).toFixed(2) },
      duration: s.dur,
      fps: FPS,
      aspect,
      camera: 'follow',
      focus: s.unit ? slotOf(s.set, s.unit) : 0,
      music: 2,
      xray: false,
      autoFit: false,
      // a clean frame: no nameplates, HP bars, damage numbers or banners (the edit sets every word)
      shot: { cam: camFor(s, aspect), ramp: rampFor(s), autoFit: null, twinNames: false, preroll: 90, layers: [], uiFade: [[0, 0]], plates: false, edgeArrows: false },
      caption: `trailer60 ${s.id}: ${s.set} seed ${s.seed} t ${s.t}`,
    });
  }
  for (const [id, heroes] of LINEUPS[aspect]) {
    if (only && !only.includes(id)) continue;
    out.push({ id: `${id}-${aspect === 'vertical' ? 'v' : 'h'}`, mode: 'skins', style: 'lineup', heroes, looks: heroes.map((h) => CC_LOOKS[h] ?? null), duration: 1.2, fps: FPS, aspect, music: 2, zoom: aspect === 'vertical' ? 0.9 : 1.1, actEvery: 0.35, caption: `trailer60 curtain call ${id}` });
  }
}
process.stdout.write(JSON.stringify(out, null, 1) + '\n');
