/**
 * Trailer 60 ("The Understudy", feat. Rocket) timeline, round 4: 60.000 s at 60 fps, 120 BPM (a beat is 30 frames, a
 * bar 120), every cut on the beat or half-beat grid. A segment is gameplay (`gp`: take frames from `in`, master-frame
 * aligned; `freeze: [at, len]` holds the take frame at segment frame `at` for `len` frames under an mg overlay;
 * `swap: { take, at }` match-cuts to another take of the same ticks at segment frame `at` (a coat change); `zoomOut:
 * [frames, zoom]` punches in on the frame centre over the last frames (the bridge into a comic panel); `ov` a
 * transparent mg overlay over the whole segment) or a full-frame motion-graphics segment (`mg`, drawn by mg.js).
 * An overlay item with `track: { hero, team }` follows that hero on screen (the take's per-frame QC boxes); round 3:
 * `colorTrack: 'cannon'` follows the cannon's spawn ring by its colour. `parts: [[from, n], ...]` plays take ranges
 * back to back (jump cuts) and `hold` pads with the last frame; `punch: [zoom, fx, fy]` crops into the 16:9 / 1:1 take.
 * Pure data: edit.mjs, score.mjs and the tests read it.
 */
export const FPS = 60;
export const BEAT = 30;
export const N = 3600;

/** Section starts (master frames), named after the shot list. */
export const CUTS = {
  hook: 0, iris: 60, title: 90, cannon: 180, aud1: 375, zzz: 525, aud2: 675, cut: 825, credits: 855, aud3: 1245, eye: 1365,
  costume: 1395, bush: 1515, act2: 1695, fight: 1755, flop: 2205, peek: 2325, payoff: 2355, score: 2625, victory: 2805, welcome: 2925,
  curtain: 2985, end: 3135, stinger: 3285, returns: 3465,
};

/**
 * The credits (S09), round 3 (review: five identical beats, the swaps hidden inside the ultimates' VFX, a coat that read
 * as a second burger): six cards, each NAME as Role in the base coat on a clean idle frame, the match cut into the store
 * coat at frame 21 (before the cast), then the ultimate in the coat. Each swap has its own sound; the sixth card is the
 * twist: Duchess refuses the coat (`refuse`, 1.5 s, COAT DECLINED.).
 */
export const CREDITS = [
  { take: 'r2-frankie', name: 'FRANKIE', as: 'Takeout', side: 'dog', coat: 'KEBAB KING', len: 60 },
  { take: 'r1-meatball', name: 'MEATBALL', as: 'A Bowling Ball', side: 'cat', coat: 'DRIVE-THRU DELUXE', len: 60 },
  { take: 'r4-domino', name: 'DOMINO', as: 'Extra Cheese', side: 'dog', coat: 'PIZZAIOLO', len: 60 },
  { take: 'r3-pixel', name: 'PIXEL', as: 'A Box', side: 'cat', coat: 'MOONWHISKER', len: 60 },
  { take: 'r6-nugget', name: 'NUGGET', as: 'Cleaning Up', side: 'dog', coat: 'ROBO-VAC', len: 60 },
  { take: 'r5-duchess', name: 'DUCHESS', as: 'Not Amused', side: 'cat', coat: 'BLUE POINT', len: 90, refuse: true },
];
/** Credit card starts (master frames). */
export const CREDIT_AT = CREDITS.map((_, i) => CUTS.credits + CREDITS.slice(0, i).reduce((a, c) => a + c.len, 0));
export const CREDIT_SWAP = 21;
/**
 * Round 4 (review: the swaps read only inside the ultimates' flashes): a before/after hold on every swap, the base coat's
 * last frame for 6 frames, then the new coat's first frame for 8 (the card keeps its length; the ultimate plays later).
 */
export const CREDIT_HOLD = [6, 8];
/** The segment frame the new coat appears on (the coat chip and the swap sound land here). */
export const CREDIT_SWAP_AT = CREDIT_SWAP + CREDIT_HOLD[0];

/**
 * Act II (S15), round 3 (review: Brutus idles 0.75 s, Ziggy is tiny, the tag and the lower third say the same name at
 * once): three hero moments of 2.5 s, each starting on the move (`in`), Ziggy punched in, the tag gone before the card.
 */
export const ACT2 = [
  { take: 'u-ziggy', hero: 'ziggy', team: 1, name: 'ZIGGY', ult: 'ZIGZAG STORM', side: 'cat', in: 20, punch: [1.3, 0.5, 0.46] },
  { take: 'u-brutus', hero: 'brutus', team: 0, name: 'SIR BRUTUS', ult: 'CHAMPION’S CHALLENGE', side: 'dog', in: 30 },
  { take: 'u-meatball', hero: 'meatball', team: 1, name: 'MEATBALL', ult: 'UNSTOPPABLE CHONK', side: 'cat', in: 20 },
];
export const ACT2_LEN = 150;
/** The take frame each Act II ultimate is cast on (the specs' lead 0.8 s). */
export const ACT2_CAST = 48;

/** The coats of the costume change (S12), one take per coat, the same sim ticks: match cuts on every beat. */
export const COATS = [
  { take: 'k-understudy', name: 'UNDERSTUDY' }, { take: 'k-harlequin', name: 'HARLEQUIN' }, { take: 'k-opera', name: 'OPERA' }, { take: 'k-night', name: 'OPENING NIGHT' },
];

/** Take in-points (take frames), set from the round 3 frame sheets. */
export const IN = {
  miss: 60, missFreeze: 128, aud1: 6, zzz: 6, zzzFreeze: 114, aud2: 6, credit: 12, aud3: 12, costume: 0,
  bush: 0, plant: 30, flop: 0, encore: 10, rocket: 24, core: 58, bow: 18, cc: 30, bowl: 0,
};
/**
 * The hook (round 3: the hit frames put a white Moonshot puff and a cyan sprite over his face): the pose (take frames
 * 24-53, before the Moonshot reaches the frame), a jump cut on the impact straight to the legs-up flop (100-121, the camera
 * already punched in), held 8 frames.
 */
export const HOOK = { parts: [[24, 30], [100, 22]], hold: 8, still: 121 };

const C = CUTS;
const tag = (text, opts = {}) => ({ mg: 'tag', text, ...opts });
const ROCKET = { hero: 'rocket', team: 0 };
const BRAVO = { hero: 'bravo', team: 0 };
/**
 * Round 3 (review: Bravo, the star, was a small brown figure in a ring of VFX in all three auditions): a bolt-yellow
 * BRAVO tag with THE STAR under it rides on him through every audition.
 */
const STAR = (out) => ({ mg: 'pointer', text: 'BRAVO', sub: 'THE STAR', side: 'star', track: BRAVO, at: 0, out });
/**
 * Round 4 (review: the auditions never show him failing, so CUT! and THAT'S IT. follow nothing the viewer can see): on the
 * steal his tag hands over to the thief's (who stole the scene) and a rubber stamp slams on the take.
 */
const STEAL = (at, len, thief, stamp) => [
  STAR(at - 2),
  { mg: 'pointer', ...thief, at, out: len - 1 },
  { mg: 'stamp', text: stamp, at: at + 8, out: len - 1 },
];
/** The curtain call (round 3: seven 0.5 s cuts read as filler): five lineups of 0.5 s, every champion named. */
const CC_N = 5;
const CC = Array.from({ length: CC_N }, (_, i) => ({ take: `cc${i + 1}`, f: C.curtain + i * 30, len: 30 }));
/** The lineups' champions left to right (specs.mjs LINEUP: two cats, then two dogs), as their name tags read. */
const CC_CATS = ['CLEM', 'SAGE', 'MEATBALL', 'PIXEL', 'DUCHESS', 'STILTS', 'AVIETĖ', 'BENGAS', 'GABE', 'LAMBO'];
const CC_DOGS = ['BRAVO', 'BRUTUS', 'CACKLEJAW', 'NUGGET', 'MARSHMALLOW', 'CHILI', 'DOMINO', 'FRANKIE', 'ROCKET', 'HOWLER'];
export const CC_NAMES = CC.map((_, i) => [CC_CATS[2 * i], CC_CATS[2 * i + 1], CC_DOGS[2 * i], CC_DOGS[2 * i + 1]]);

/** The edit. Every overlay word is in COPY below. */
export const EDL = [
  // S01 hook: the pose, a jump cut on the impact (a white flash) to the legs-up flop
  { f: C.hook, len: 60, gp: { take: 'h01-flop', parts: HOOK.parts, hold: HOOK.hold }, ov: { mg: 'multi', items: [{ mg: 'flash', at: 30, len: 3 }] } },
  { f: C.iris, len: 30, mg: 'iris', still: { take: 'h01-flop', at: HOOK.still }, text: 'STARRING: BRAVO' },
  // S02 the curtains close over the frozen frame: the title, held a full second once it is set (round 3: 3 frames)
  { f: C.title, len: 90, mg: 'title', still: { take: 'h01-flop', at: HOOK.still } },
  // S03-S04 the cannon (round 3: introduced over a shot without it): from the first frame it is on screen, a pointer
  // rides on it (THE CANNON, found by its spawn ring's colour); Rocket's name card; Sage takes it a step ahead: ROCKET 0
  {
    f: C.cannon, len: 195, gp: { take: 'c01-miss', in: IN.miss, freeze: [IN.missFreeze, 15] },
    ov: { mg: 'multi', items: [
      tag('ALSO STARRING:', { at: 4, out: 66, y: 0.62, size: 0.045, color: 'bolt' }), tag('ONE KIBBLE CANNON', { at: 10, out: 66, y: 0.74, size: 0.065 }),
      { mg: 'pointer', text: 'THE CANNON', side: 'star', colorTrack: 'cannon', below: 1, at: 2, out: 70 },
      { mg: 'pointer', text: 'ROCKET', sub: 'FASTEST DOG ALIVE', side: 'dog', track: ROCKET, at: 72, out: 100 },
      // round 4 (review: nobody could tell who took the cannon): Sage, tagged, gets there first
      { mg: 'pointer', text: 'SAGE', sub: 'GOT THERE FIRST', side: 'cat', track: { hero: 'sage', team: 1 }, at: 102, out: 170 },
      { mg: 'counter', who: 'ROCKET', score: '0', at: 130, out: 194 },
    ] },
  },
  // S05 audition #1: Sage's Moonshot from his spotlight (the steal at segment frame 58, then 1.5 s on the result)
  { f: C.aud1, len: 150, gp: { take: 'a01-sage', in: IN.aud1 }, ov: { mg: 'multi', items: [...STEAL(58, 150, { text: 'SAGE', sub: 'STEALS THE SHOW', side: 'cat', track: { hero: 'sage', team: 1 } }, 'UPSTAGED.'), { mg: 'slate', text: 'AUDITION #1', at: 0, out: 56 }] } },
  // S06 ZOOM... ZZZ (round 3: the Zs floated over the wrong unit, AND ASLEEP was tiny): Rocket tagged, he naps, the Zs
  // rise from him, the freeze holds 0.5 s under a big AND ASLEEP chip
  {
    f: C.zzz, len: 150, gp: { take: 'z01-nap', in: IN.zzz, freeze: [IN.zzzFreeze, 30] },
    ov: { mg: 'multi', items: [{ mg: 'pointer', text: 'ROCKET', side: 'dog', track: ROCKET, at: 0, out: 96 }, { mg: 'zzz', at: 104, out: 149, track: ROCKET }, { mg: 'counter', who: 'ROCKET', score: '0', sub: '(AND ASLEEP)', at: 114, out: 149 }] },
  },
  // S07 audition #2: Nova's ultimate lands on the stage; the camera punches in on him (the bridge into CUT!)
  { f: C.aud2, len: 150, gp: { take: 'a02-nova', in: IN.aud2, zoomOut: [14, 1.7] }, ov: { mg: 'multi', items: [...STEAL(50, 136, { text: 'NOVA', sub: 'STEALS THE SHOW', side: 'cat', track: { hero: 'nova', team: 1 } }, 'UPSTAGED. AGAIN.'), { mg: 'slate', text: 'AUDITION #2', at: 0, out: 48 }] } },
  // S08 CUT! (a hard cut in, round 3: the yellow wash read as a grading error)
  { f: C.cut, len: 30, mg: 'panel', img: 'cut', text: 'CUT!' },
  // S09 the credits: six mini gags, the coat swap on a clean frame before the ultimate; Duchess declines
  ...CREDITS.map((c, i) => ({
    f: CREDIT_AT[i], len: c.len, side: c.side,
    gp: c.refuse ? { take: `${c.take}-base`, in: IN.credit } : { take: `${c.take}-base`, in: IN.credit, swap: { take: c.take, at: CREDIT_SWAP, hold: CREDIT_HOLD } },
    ov: { mg: 'credit', ...c, swapAt: c.refuse ? CREDIT_SWAP : CREDIT_SWAP_AT },
  })),
  // S10 audition #3: his own teammate's KNOCKOUT!; the punch-in bridge into THAT'S IT.
  { f: C.aud3, len: 120, gp: { take: 'a03-champ', in: IN.aud3, zoomOut: [12, 1.7] }, ov: { mg: 'multi', items: [...STEAL(46, 108, { text: 'CHAMP', sub: 'HIS OWN TEAMMATE', side: 'dog', track: { hero: 'champ', team: 0 } }, 'UPSTAGED. BY HIS OWN TEAM.'), { mg: 'slate', text: 'AUDITION #3', at: 0, out: 44 }] } },
  // S11 THAT'S IT.
  { f: C.eye, len: 30, mg: 'panel', img: 'eye', text: 'THAT’S IT.', shake: 1 },
  // S12 the costume change: four coats, one take, a match cut and a bolt puff on every beat
  ...COATS.map((k, i) => ({ f: C.costume + i * 30, len: 30, gp: { take: k.take, in: IN.costume + i * 30 }, ov: { mg: 'coat', name: k.name, i } })),
  // S13 the bush: Ranger hides (the screen dims), Meatball (Mega Meal) sits in the same bush (the dim lifts)
  { f: C.bush, len: 180, gp: { take: 'b01-bush', in: IN.bush }, ov: { mg: 'bush', dimA: 18, dimB: 70 } },
  // S14 ACT II: Pixel carries the cannon to the dog tower
  { f: C.act2, len: 60, gp: { take: 'p01-plant', in: IN.plant }, ov: { mg: 'multi', items: [{ mg: 'slate', text: 'ACT II', at: 0, out: 58, big: 1 }] } },
  // S15 Act II: three hero moments, the hero tagged until the card names the ultimate
  ...ACT2.map((u, i) => ({
    f: C.fight + i * ACT2_LEN, len: ACT2_LEN, gp: { take: u.take, in: u.in, punch: u.punch }, side: u.side,
    ov: { mg: 'multi', items: [{ mg: 'pointer', text: u.name, side: u.side, track: { hero: u.hero, team: u.team }, at: 0, out: Math.max(14, ACT2_CAST - u.in - 4) }, { mg: 'ult', name: u.name, ult: u.ult, side: u.side, at: ACT2_CAST - u.in, out: ACT2_LEN - 6 }] },
  })),
  // S16 he plays dead in slow motion; nobody stops
  // round 4 (review: a flat yellow sprite by Bravo read as a render glitch; it is Ziggy's knockout ghost rising): both tagged,
  // the joke made plain, he plays dead, she is actually out
  {
    f: C.flop, len: 120, gp: { take: 'f02-flop', in: IN.flop },
    ov: { mg: 'multi', items: [{ mg: 'pointer', text: 'BRAVO', sub: 'PLAYING DEAD', side: 'star', track: BRAVO, at: 4, out: 114 }, { mg: 'pointer', text: 'ZIGGY', sub: 'ACTUALLY K.O.’D', side: 'cat', track: { hero: 'ziggy', team: 1 }, at: 62, out: 98 }] },
  },
  // S17 one eye opens (round 3: redrawn on-model, in the CUT! panel's style)
  { f: C.peek, len: 30, mg: 'panel', img: 'peek' },
  // S18 the payoff: Pixel winds up, Bravo bows (ENCORE!), she is charmed and fumbles; BRAVO! and roses; a rose BONK!
  // round 4 (review: BONK! had no visible cause and muddled who won): the carrier is tagged winding up, FUMBLE! names the
  // gag, no bonk
  {
    f: C.payoff, len: 270, gp: { take: 'p02-encore', in: IN.encore },
    ov: { mg: 'multi', items: [
      { mg: 'pointer', text: 'PIXEL', sub: 'WINDING UP THE CANNON', side: 'cat', track: { hero: 'pixel', team: 1 }, at: 6, out: 60 },
      { mg: 'bravo', at: 64, track: BRAVO }, tag('FUMBLE!', { at: 76, out: 150, y: 0.84, size: 0.08, color: 'cream' }),
    ] },
  },
  // S19 Rocket (tagged) fires the stolen cannon: KABOOM on Nova. ROCKET: 1
  {
    f: C.score, len: 180, gp: { take: 'p03-rocket', in: IN.rocket },
    ov: { mg: 'multi', items: [{ mg: 'pointer', text: 'ROCKET', sub: 'HAS THE CANNON!', side: 'dog', track: ROCKET, at: 0, out: 70 }, tag('KABOOM!', { at: 80, out: 118, y: 0.3, size: 0.09, color: 'bolt' }), { mg: 'counter', who: 'ROCKET', score: '1', at: 84, out: 179, win: 1 }] },
  },
  // S20 the cat core falls: VICTORY! (round 3: 2 s shorter, punched in on the core, the word low so the burst stays clear)
  { f: C.victory, len: 120, gp: { take: 'v01-core', in: IN.core, wideV: true, punch: [1.35, 0.42, 0.3] }, ov: { mg: 'multi', items: [{ mg: 'pointer', text: 'CAT CORE', sub: 'GOING DOWN', side: 'cat', anchor: [0.494, 0.2], at: 2, out: 36 }, tag('VICTORY!', { at: 50, out: 119, y: 0.84, size: 0.1, color: 'bolt' })] } },
  // S20b (round 3: the win had no Bravo in it) he takes the bow for it
  { f: C.welcome, len: 60, gp: { take: 'w01-bow', in: IN.bow }, ov: { mg: 'multi', items: [STAR(59), tag('“YOU’RE WELCOME.”', { at: 6, out: 59, y: 0.84, size: 0.07, color: 'cream' })] } },
  // S21 the curtain call: five lineups, every champion named
  ...CC.map((c, i) => ({ f: c.f, len: c.len, gp: { take: c.take, in: IN.cc, wideV: 'fit' }, ov: { mg: 'cast', i, f0: c.f - C.curtain, names: CC_NAMES[i] } })),
  // S22 the end card (round 3: 2.5 s)
  { f: C.end, len: 150, mg: 'end' },
  // S23 the stinger: Meatball rolls through his spotlight, he plays dead; freeze: Bravo will return. Then the logo and
  // the address (round 3: the last frame sells the game)
  { f: C.stinger, len: 180, gp: { take: 's01-bowl', in: IN.bowl } },
  { f: C.returns, len: 135, mg: 'returns', still: { take: 's01-bowl', at: IN.bowl + 179 } },
];

/** Designed hits (master frames) the score lands on. */
export const HIT = {
  hit: 30, flop: 34, missPick: C.cannon + 126, steal1: C.aud1 + 58, nap: C.zzz + 114, encoreFumble: C.payoff + 74, rocketFire: C.score + 66, kaboom: C.score + 80,
  coreBurst: C.victory + 33, bowl: C.stinger + 96, returnsLine: C.returns + 20, returnsLogo: C.returns + 54,
};

/**
 * Sound-off captions (9:16 only, round 2: the gags leaned on sound): the sound gags as bracketed captions, [from, to)
 * master frames, in a band at 77 % of the frame height (above the platforms' bottom UI). Round 3: none over the last
 * 2.25 s (the address bar sits there).
 */
export const CAPS = [
  [0, 30, '[DRAMATIC ORCHESTRA]'], [60, 90, '[RECORD SCRATCH]'], [90, 180, '[DRUMROLL]'], [306, 375, '[SQUEAKY TOY DEFLATES]'], [459, 525, '[SAD TROMBONE]'],
  [630, 675, '[SNORING]'], [741, 825, '[SLIDE WHISTLE]'], [825, 855, '[MEGAPHONE SQUEAL]'], [1155, 1245, '[RECORD SCRATCH]'], [1245, 1305, '[BOXING BELL]'], [1365, 1395, '[VIOLIN SCREECH]'],
  [1395, 1515, '[TA-DA!]'], [1525, 1585, '[SHHH…]'], [1585, 1635, '[SQUEAK]'], [1755, 1815, '[THE BAND KICKS IN]'], [2205, 2295, '[ANGELIC CHOIR]'], [2295, 2325, '[RECORD SCRATCH]'],
  [2425, 2525, '[CROWD CHEERS]'], [2691, 2755, '[KABOOM!]'], [2985, 3135, '[APPLAUSE]'], [3381, 3441, '[BOWLING STRIKE]'],
];

/** On-screen words (copy gate). */
export const COPY = [
  'STARRING: BRAVO', 'PAW LEGENDS', 'PRESENTS', 'BRAVO', 'IN', 'THE UNDERSTUDY', 'ALSO STARRING:', 'ONE KIBBLE CANNON', 'THE CANNON', 'ROCKET', 'FASTEST DOG ALIVE', '0', '1', '(AND ASLEEP)',
  'THE STAR', 'AUDITION #1', 'AUDITION #2', 'AUDITION #3', 'CUT!',
  ...CREDITS.flatMap((c) => [c.name, `as ${c.as}`, `${c.coat} COAT`]), 'COAT DECLINED.',
  'THAT’S IT.', ...COATS.map((k) => k.name), 'RANGER: TOTALLY INVISIBLE.', '…NOT ANYMORE.', 'ACT II', ...ACT2.flatMap((u) => [u.name, u.ult]), 'BRAVO!', 'FUMBLE!', 'VICTORY!', 'SAGE', 'GOT THERE FIRST', 'STEALS THE SHOW', 'UPSTAGED.', 'NOVA', 'UPSTAGED. AGAIN.', 'CHAMP', 'HIS OWN TEAMMATE',
  'UPSTAGED. BY HIS OWN TEAM.', 'PLAYING DEAD', 'ACTUALLY K.O.’D', 'PIXEL', 'WINDING UP THE CANNON', 'HAS THE CANNON!', 'KABOOM!', 'CAT CORE', 'GOING DOWN', '“YOU’RE WELCOME.”',
  'THE CAST OF PAW LEGENDS', ...CC_NAMES.flat(), 'CATS VS DOGS.', 'PICK A SIDE.', 'PLAY FREE', 'pawlegends.app', 'Bravo will return.',
];
