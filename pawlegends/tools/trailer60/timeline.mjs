/**
 * Trailer 60 ("The Understudy", feat. Rocket) timeline, round 2: 60.000 s at 60 fps, 120 BPM (a beat is 30 frames, a
 * bar 120), every cut on the beat or half-beat grid. A segment is gameplay (`gp`: take frames from `in`, master-frame
 * aligned; `freeze: [at, len]` holds the take frame at segment frame `at` for `len` frames under an mg overlay;
 * `swap: { take, at }` match-cuts to another take of the same ticks at segment frame `at` (a coat change); `zoomOut:
 * [frames, zoom]` punches in on the frame centre over the last frames (the bridge into a comic panel); `ov` a
 * transparent mg overlay over the whole segment) or a full-frame motion-graphics segment (`mg`, drawn by mg.js).
 * An overlay item with `track: { hero, team }` follows that hero on screen (the take's per-frame QC boxes).
 * Pure data: edit.mjs, score.mjs and the tests read it.
 */
export const FPS = 60;
export const BEAT = 30;
export const N = 3600;

/** Section starts (master frames), named after the shot list. */
export const CUTS = {
  hook: 0, iris: 75, title: 105, cannon: 150, aud1: 390, zzz: 510, aud2: 630, cut: 750, credits: 780, aud3: 1080, eye: 1170,
  costume: 1200, bush: 1320, act2: 1500, fight: 1560, flop: 2100, peek: 2220, payoff: 2250, score: 2490, victory: 2670, curtain: 2850, end: 3030, stinger: 3300, returns: 3480,
};

/**
 * The credits (S09), round 2 (review: eight static lower thirds with unreadable sublines): five cards of one second,
 * each a mini gag: NAME as Role, the ultimate in the base coat, then a match cut on the half beat into the store coat
 * (a bolt puff and the coat's name).
 */
export const CREDITS = [
  { take: 'r1-meatball', name: 'MEATBALL', as: 'A Bowling Ball', side: 'cat', coat: 'DRIVE-THRU DELUXE' },
  { take: 'r2-frankie', name: 'FRANKIE', as: 'A Very Long Dog', side: 'dog', coat: 'KEBAB KING' },
  { take: 'r3-pixel', name: 'PIXEL', as: 'A Box', side: 'cat', coat: 'MOONWHISKER' },
  { take: 'r4-domino', name: 'DOMINO', as: 'Extra Cheese', side: 'dog', coat: 'PIZZAIOLO' },
  { take: 'r5-duchess', name: 'DUCHESS', as: 'Not Amused', side: 'cat', coat: 'BLUE POINT' },
];

/** Act II (S15), round 2 (review: seven 1 s cuts of clutter): three hero moments, 3 s each, the cast at 0.8x. */
export const ACT2 = [
  { take: 'u-ziggy', hero: 'ziggy', team: 1, name: 'ZIGGY', ult: 'ZIGZAG STORM', side: 'cat' },
  { take: 'u-brutus', hero: 'brutus', team: 0, name: 'SIR BRUTUS', ult: 'CHAMPION’S CHALLENGE', side: 'dog' },
  { take: 'u-meatball', hero: 'meatball', team: 1, name: 'MEATBALL', ult: 'UNSTOPPABLE CHONK', side: 'cat' },
];

/** The coats of the costume change (S12), one take per coat, the same sim ticks: match cuts on every beat. */
export const COATS = [
  { take: 'k-understudy', name: 'UNDERSTUDY' }, { take: 'k-harlequin', name: 'HARLEQUIN' }, { take: 'k-opera', name: 'OPERA' }, { take: 'k-night', name: 'OPENING NIGHT' },
];

/** Take in-points (take frames), set from the round 2 frame sheets. */
export const IN = {
  hook: 45, miss: 0, missFreeze: 188, aud1: 24, zzz: 36, zzzFreeze: 90, aud2: 6, credit: 10, aud3: 30, costume: 0,
  bush: 0, plant: 30, act2: 0, flop: 0, encore: 10, rocket: 24, core: 84, cc: 30, bowl: 0,
};

const C = CUTS;
const tag = (text, opts = {}) => ({ mg: 'tag', text, ...opts });
const ROCKET = { hero: 'rocket', team: 0 };
const BRAVO = { hero: 'bravo', team: 0 };
/** The seven curtain-call lineups: five on the half beat, the last two on the quarter (an accelerando into the logo). */
const CC_LEN = [30, 30, 30, 30, 30, 15, 15];
const CC = CC_LEN.map((len, i) => ({ take: `cc${i + 1}`, f: C.curtain + CC_LEN.slice(0, i).reduce((a, b) => a + b, 0), len }));

/** The edit. Every overlay word is in COPY below. */
export const EDL = [
  // S01 hook (round 2: the flop was too small to read): the pose, the hit, the camera punches in on the flop (legs up
  // from master frame ~55, held 20 frames), then a 0.5 s iris freeze
  { f: C.hook, len: 75, gp: { take: 'h01-flop', in: IN.hook } },
  { f: C.iris, len: 30, mg: 'iris', still: { take: 'h01-flop', at: IN.hook + 74 }, text: 'STARRING: BRAVO' },
  // S02 the curtains close over the frozen frame: the title
  { f: C.title, len: 45, mg: 'title', still: { take: 'h01-flop', at: IN.hook + 74 } },
  // S03-S04 the cannon race, the camera on Rocket: ALSO STARRING, then (round 2: nobody could tell who Rocket was) his
  // name card rides on him; Sage takes the cannon a step ahead of him: freeze, ROCKET: 0 (the digit drops into its box)
  {
    f: C.cannon, len: 240, gp: { take: 'c01-miss', in: IN.miss, freeze: [IN.missFreeze, 15] },
    ov: { mg: 'multi', items: [
      tag('ALSO STARRING:', { at: 6, out: 80, y: 0.09, size: 0.045, color: 'bolt' }), tag('ONE KIBBLE CANNON', { at: 12, out: 80, y: 0.21, size: 0.065 }),
      { mg: 'pointer', text: 'ROCKET', sub: 'FASTEST DOG ALIVE', side: 'dog', track: ROCKET, at: 86, out: 186 },
      { mg: 'counter', who: 'ROCKET', score: '0', at: 190, out: 239 },
    ] },
  },
  // S05 audition #1: Sage's Moonshot from his spotlight, the fight steals it
  { f: C.aud1, len: 120, gp: { take: 'a01-sage', in: IN.aud1 }, ov: { mg: 'multi', items: [{ mg: 'slate', text: 'AUDITION #1', at: 0, out: 70 }] } },
  // S06 ZOOM... ZZZ: Rocket (tagged) sprints past the carrier and naps next to her; freeze, ROCKET: 0 (AND ASLEEP)
  {
    f: C.zzz, len: 120, gp: { take: 'z01-nap', in: IN.zzz, freeze: [IN.zzzFreeze, 15] },
    ov: { mg: 'multi', items: [{ mg: 'pointer', text: 'ROCKET', side: 'dog', track: ROCKET, at: 0, out: 60 }, { mg: 'counter', who: 'ROCKET', score: '0', sub: '(AND ASLEEP)', at: 90, out: 119 }, { mg: 'zzz', at: 84, out: 119 }] },
  },
  // S07 audition #2: Nova's ultimate lands on the stage; the camera punches in on him (the bridge into CUT!)
  { f: C.aud2, len: 120, gp: { take: 'a02-nova', in: IN.aud2, zoomOut: [14, 1.7] }, ov: { mg: 'multi', items: [{ mg: 'slate', text: 'AUDITION #2', at: 0, out: 70 }] } },
  // S08 CUT!
  { f: C.cut, len: 30, mg: 'panel', img: 'cut', text: 'CUT!' },
  // S09 the credits: five mini gags, the coat swap on the half beat
  ...CREDITS.map((c, i) => ({ f: C.credits + i * 60, len: 60, gp: { take: `${c.take}-base`, in: IN.credit, swap: { take: c.take, at: 30 } }, side: c.side, ov: { mg: 'credit', ...c, swapAt: 30 } })),
  // S10 audition #3: his own teammate's KNOCKOUT!; the punch-in bridge into THAT'S IT.
  { f: C.aud3, len: 90, gp: { take: 'a03-champ', in: IN.aud3, zoomOut: [12, 1.7] }, ov: { mg: 'multi', items: [{ mg: 'slate', text: 'AUDITION #3', at: 0, out: 60 }] } },
  // S11 THAT'S IT.
  { f: C.eye, len: 30, mg: 'panel', img: 'eye', text: 'THAT’S IT.', shake: 1 },
  // S12 the costume change: four coats, one take, a match cut and a bolt puff on every beat
  ...COATS.map((k, i) => ({ f: C.costume + i * 30, len: 30, gp: { take: k.take, in: IN.costume + i * 30 }, ov: { mg: 'coat', name: k.name, i } })),
  // S13 the bush: Ranger hides (the screen dims), Meatball (Mega Meal) sits in the same bush (the dim lifts)
  { f: C.bush, len: 180, gp: { take: 'b01-bush', in: IN.bush }, ov: { mg: 'bush', dimA: 18, dimB: 70 } },
  // S14 ACT II: Pixel carries the cannon to the dog tower
  { f: C.act2, len: 60, gp: { take: 'p01-plant', in: IN.plant }, ov: { mg: 'multi', items: [{ mg: 'slate', text: 'ACT II', at: 0, out: 58, big: 1 }] } },
  // S15 Act II: three hero moments, the hero tagged, the ultimate named
  ...ACT2.map((u, i) => ({
    f: C.fight + i * 180, len: 180, gp: { take: u.take, in: IN.act2 }, side: u.side,
    ov: { mg: 'multi', items: [{ mg: 'pointer', text: u.name, side: u.side, track: { hero: u.hero, team: u.team }, at: 4, out: 66 }, { mg: 'ult', name: u.name, ult: u.ult, side: u.side, at: 34, out: 172 }] },
  })),
  // S16 he plays dead in slow motion; nobody stops
  { f: C.flop, len: 120, gp: { take: 'f02-flop', in: IN.flop } },
  // S17 one eye opens
  { f: C.peek, len: 30, mg: 'panel', img: 'peek' },
  // S18 the payoff (round 2: trimmed by 1 s, no static tail): Pixel winds up the shot, Bravo bows (ENCORE!), she is
  // charmed and fumbles the cannon; BRAVO! and roses; the button: one last rose bonks him on the head
  { f: C.payoff, len: 240, gp: { take: 'p02-encore', in: IN.encore }, ov: { mg: 'bravo', at: 64, bonk: 196, track: BRAVO } },
  // S19 Rocket (tagged) fires the stolen cannon: KABOOM on Nova. ROCKET: 1
  {
    f: C.score, len: 180, gp: { take: 'p03-rocket', in: IN.rocket },
    ov: { mg: 'multi', items: [{ mg: 'pointer', text: 'ROCKET', side: 'dog', track: ROCKET, at: 0, out: 84 }, { mg: 'counter', who: 'ROCKET', score: '1', at: 84, out: 179, win: 1 }] },
  },
  // S20 the cat core falls: VICTORY! (Brutus in the Chairman coat)
  { f: C.victory, len: 180, gp: { take: 'v01-core', in: IN.core, wideV: true }, ov: { mg: 'multi', items: [tag('VICTORY!', { at: 40, out: 176, y: 0.2, size: 0.11, color: 'bolt' })] } },
  // S21 the curtain call (round 2: one 3.4 s static lineup of sprites): seven quick lineups, two cats and two dogs each
  ...CC.map((c, i) => ({ f: c.f, len: c.len, gp: { take: c.take, in: IN.cc }, ov: { mg: 'cast', i, f0: c.f - C.curtain } })),
  // S22 the end card
  { f: C.end, len: 270, mg: 'end' },
  // S23 the stinger: Meatball rolls through his spotlight, he plays dead; freeze: Bravo will return. (rimshot)
  { f: C.stinger, len: 180, gp: { take: 's01-bowl', in: IN.bowl } },
  { f: C.returns, len: 120, mg: 'returns', still: { take: 's01-bowl', at: IN.bowl + 179 } },
];

/** Designed hits (master frames) the score lands on. */
export const HIT = {
  flop: 57, missPick: C.cannon + 186, nap: C.zzz + 84, encoreFumble: C.payoff + 74, bonk: C.payoff + 196, rocketFire: C.score + 66, kaboom: C.score + 80,
  coreBurst: C.victory + 7, bowl: C.stinger + 96, returnsLine: C.returns + 60,
};

/**
 * Sound-off captions (9:16 only, round 2: the gags leaned on sound): the sound gags as bracketed captions, [from, to)
 * master frames, in a band at 77 % of the frame height (above the platforms' bottom UI).
 */
export const CAPS = [
  [0, 60, '[DRAMATIC ORCHESTRA]'], [60, 105, '[RECORD SCRATCH]'], [105, 150, '[DRUMROLL]'], [330, 390, '[SQUEAKY TOY DEFLATES]'], [450, 510, '[SAD TROMBONE]'],
  [585, 630, '[SNORING]'], [690, 750, '[SLIDE WHISTLE]'], [750, 780, '[MEGAPHONE SQUEAL]'], [1080, 1140, '[BOXING BELL]'], [1170, 1200, '[VIOLIN SCREECH]'],
  [1200, 1320, '[TA-DA!]'], [1330, 1390, '[SHHH…]'], [1390, 1440, '[SQUEAK]'], [1560, 1620, '[THE BAND KICKS IN]'], [2100, 2190, '[ANGELIC CHOIR]'], [2190, 2220, '[RECORD SCRATCH]'],
  [2320, 2420, '[CROWD CHEERS]'], [2440, 2490, '[BONK]'], [2556, 2620, '[KABOOM!]'], [2850, 3030, '[APPLAUSE]'], [3390, 3460, '[BOWLING STRIKE]'], [3560, 3600, '[RIMSHOT]'],
];

/** On-screen words (copy gate). */
export const COPY = [
  'STARRING: BRAVO', 'PAW LEGENDS', 'PRESENTS', 'BRAVO', 'IN', 'THE UNDERSTUDY', 'ALSO STARRING:', 'ONE KIBBLE CANNON', 'ROCKET', 'FASTEST DOG ALIVE', '0', '1', '(AND ASLEEP)', 'AUDITION #1', 'AUDITION #2', 'AUDITION #3', 'CUT!',
  ...CREDITS.flatMap((c) => [c.name, `as ${c.as}`, `${c.coat} COAT`]),
  'THAT’S IT.', ...COATS.map((k) => k.name), 'RANGER: TOTALLY INVISIBLE.', '…NOT ANYMORE.', 'ACT II', ...ACT2.flatMap((u) => [u.name, u.ult]), 'BRAVO!', 'BONK!', 'VICTORY!', 'THE CAST OF PAW LEGENDS',
  'CATS VS DOGS.', 'PICK A SIDE.', 'PLAY FREE', 'pawlegends.app', 'Bravo will return.',
];
