/**
 * Trailer 60 ("The Understudy", feat. Rocket) timeline: 60.000 s at 60 fps, 120 BPM (a beat is 30 frames, a bar 120),
 * every cut on the beat or half-beat grid. A segment is gameplay (`gp`: take frames from `in`, master-frame aligned;
 * `freeze: [at, len]` holds the take frame at segment frame `at` for `len` frames under an mg overlay; `ov` a
 * transparent mg overlay over the whole segment) or a full-frame motion-graphics segment (`mg`, drawn by mg.js).
 * Pure data: edit.mjs, score.mjs and the tests read it.
 */
export const FPS = 60;
export const BEAT = 30;
export const N = 3600;

/** Section starts (master frames), named after the shot list. */
export const CUTS = {
  hook: 0, title: 90, cannon: 150, miss: 240, aud1: 360, zzz: 480, aud2: 600, cut: 720, credits: 750, aud3: 1230, eye: 1320,
  costume: 1350, bush: 1470, act2: 1620, fight: 1680, flop: 2100, peek: 2220, payoff: 2250, score: 2550, victory: 2700, curtain: 2850, end: 3060, stinger: 3330,
};

/** The credits (S09): take, name, the joke role, the ultimate, side, coat. */
export const CREDITS = [
  { take: 'r1-meatball', name: 'MEATBALL', as: 'A Bowling Ball', ult: 'Unstoppable Chonk', side: 'cat', coat: 'Drive-Thru Deluxe' },
  { take: 'r2-frankie', name: 'FRANKIE', as: 'A Very Long Dog', ult: 'FOOTLONG!', side: 'dog', coat: 'Kebab King' },
  { take: 'r3-pixel', name: 'PIXEL', as: 'A Box', ult: 'BOXBOT MK II', side: 'cat', coat: 'Moonwhisker' },
  { take: 'r4-domino', name: 'DOMINO', as: 'Extra Cheese', ult: 'CONNECT THE DOTS!', side: 'dog', coat: 'Pizzaiolo' },
  { take: 'r5-duchess', name: 'DUCHESS', as: 'Not Amused', ult: 'Royal Decree', side: 'cat', coat: 'Blue Point' },
  { take: 'r6-nugget', name: 'NUGGET', as: 'Cleaning Up', ult: 'Herding Time', side: 'dog', coat: 'Robo-Vac' },
  { take: 'r7-gabe', name: 'GABBY', as: 'Adorable (Dangerously)', ult: 'Under Her Spell', side: 'cat', coat: null },
  { take: 'r8-howler', name: 'HOWLER', as: 'Loud', ult: 'THE SCREAM', side: 'dog', coat: null },
];

/** Act II (S15): seven ultimates, one per beat pair. */
export const ACT2 = [
  { take: 'u-brutus', side: 'dog' }, { take: 'u-aviete', side: 'cat' }, { take: 'u-barkula', side: 'dog' }, { take: 'u-ziggy', side: 'cat' },
  { take: 'u-stilts', side: 'cat' }, { take: 'u-chili', side: 'dog' }, { take: 'u-meatball', side: 'cat' },
];

/** The coats of the costume change (S12), one take per coat, the same sim ticks: match cuts on every beat. */
export const COATS = [
  { take: 'k-understudy', name: 'UNDERSTUDY' }, { take: 'k-harlequin', name: 'HARLEQUIN' }, { take: 'k-opera', name: 'OPERA' }, { take: 'k-night', name: 'OPENING NIGHT' },
];

/** Take in-points (take frames), set from the round 1 frame sheets. */
export const IN = {
  hook: 28, hookFreeze: 60, miss: 0, missFreeze: 142, aud1: 24, zzz: 36, zzzFreeze: 90, aud2: 6, credit: 10, aud3: 30, costume: 0,
  bush: 0, plant: 30, act2: 12, flop: 0, encore: 10, rocket: 45, core: 0, cc: 20, bowl: 0,
};

const C = CUTS;
const tag = (text, opts = {}) => ({ mg: 'tag', text, ...opts });
/**
 * The edit. Every overlay word is in COPY below.
 */
export const EDL = [
  // S01 hook: the pose, the hit, he flops (legs up on frame 60), a 0.5 s spotlight-iris freeze: STARRING: BRAVO
  { f: 0, len: 60, gp: { take: 'h01-flop', in: IN.hook } },
  { f: 60, len: 30, mg: 'iris', still: { take: 'h01-flop', at: IN.hook + 60 }, text: 'STARRING: BRAVO' },
  // S02 the curtains close over the frozen frame: the title
  { f: C.title, len: 60, mg: 'title', still: { take: 'h01-flop', at: IN.hook + 60 } },
  // S03-S04 the cannon race; Sage takes it a step ahead of Rocket: freeze, ROCKET: 0
  { f: C.cannon, len: 210, gp: { take: 'c01-miss', in: IN.miss, freeze: [IN.missFreeze, 15] }, ov: { mg: 'multi', items: [tag('ALSO STARRING:', { at: 6, out: 84, y: 0.09, size: 0.045, color: 'bolt' }), tag('ONE KIBBLE CANNON', { at: 12, out: 84, y: 0.21, size: 0.065 }), { mg: 'counter', who: 'ROCKET', score: '0', at: 142, out: 209 }] } },
  // S05 audition #1: Sage's Moonshot from his spotlight, the fight steals it
  { f: C.aud1, len: 120, gp: { take: 'a01-sage', in: IN.aud1 }, ov: { mg: 'multi', items: [{ mg: 'slate', text: 'AUDITION #1', at: 0, out: 70 }] } },
  // S06 ZOOM... ZZZ: he naps beside the carrier; freeze, ROCKET: 0 (AND ASLEEP)
  { f: C.zzz, len: 120, gp: { take: 'z01-nap', in: IN.zzz, freeze: [IN.zzzFreeze, 15] }, ov: { mg: 'multi', items: [{ mg: 'counter', who: 'ROCKET', score: '0', sub: '(AND ASLEEP)', at: 90, out: 119 }, { mg: 'zzz', at: 84, out: 119 }] } },
  // S07 audition #2: Nova's ultimate lands on the stage
  { f: C.aud2, len: 120, gp: { take: 'a02-nova', in: IN.aud2 }, ov: { mg: 'multi', items: [{ mg: 'slate', text: 'AUDITION #2', at: 0, out: 70 }] } },
  // S08 CUT!
  { f: C.cut, len: 30, mg: 'panel', img: 'cut', text: 'CUT!' },
  // S09 the credits: eight ultimates in coats, a name on every downbeat
  ...CREDITS.map((c, i) => ({ f: C.credits + i * 60, len: 60, gp: { take: c.take, in: IN.credit }, side: c.side, ov: { mg: 'credit', ...c } })),
  // S10 audition #3: his own teammate's KNOCKOUT!
  { f: C.aud3, len: 90, gp: { take: 'a03-champ', in: IN.aud3 }, ov: { mg: 'multi', items: [{ mg: 'slate', text: 'AUDITION #3', at: 0, out: 60 }] } },
  // S11 THAT'S IT.
  { f: C.eye, len: 30, mg: 'panel', img: 'eye', text: 'THAT’S IT.', shake: 1 },
  // S12 the costume change: four coats, one take, a match cut and a bolt puff on every beat
  ...COATS.map((k, i) => ({ f: C.costume + i * 30, len: 30, gp: { take: k.take, in: IN.costume + i * 30 }, ov: { mg: 'coat', name: k.name, i } })),
  // S13 the bush: Ranger hides (the screen dims), Meatball sits in the same bush (the dim lifts)
  { f: C.bush, len: 150, gp: { take: 'b01-bush', in: IN.bush }, ov: { mg: 'bush', dimA: 18, dimB: 70 } },
  // S14 ACT II: Pixel carries the cannon to the dog tower
  { f: C.act2, len: 60, gp: { take: 'p01-plant', in: IN.plant }, ov: { mg: 'multi', items: [{ mg: 'slate', text: 'ACT II', at: 0, out: 58, big: 1 }] } },
  // S15 the Act II fight: seven ultimates
  ...ACT2.map((u, i) => ({ f: C.fight + i * 60, len: 60, gp: { take: u.take, in: IN.act2 }, side: u.side })),
  // S16 he plays dead in slow motion; nobody stops
  { f: C.flop, len: 120, gp: { take: 'f02-flop', in: IN.flop } },
  // S17 one eye opens
  { f: C.peek, len: 30, mg: 'panel', img: 'peek' },
  // S18 the payoff: Pixel winds up the shot, Bravo bows (ENCORE!), she is charmed and fumbles the cannon
  { f: C.payoff, len: 300, gp: { take: 'p02-encore', in: IN.encore }, ov: { mg: 'bravo', at: 64 } },
  // S19 Rocket fires the stolen cannon: KABOOM on Nova. ROCKET: 1
  { f: C.score, len: 150, gp: { take: 'p03-rocket', in: IN.rocket }, ov: { mg: 'multi', items: [{ mg: 'counter', who: 'ROCKET', score: '1', at: 56, out: 149, win: 1 }] } },
  // S20 the cat core falls: VICTORY (Brutus in the Chairman coat)
  { f: C.victory, len: 150, gp: { take: 'v01-core', in: IN.core } },
  // S21 the curtain call: all 28 on the lobby stage
  ...['cc-cats1', 'cc-dogs1', 'cc-cats2', 'cc-dogs2'].map((t, i) => ({ f: C.curtain + i * 52 + (i ? 1 : 0) * 0, len: i === 3 ? 210 - 3 * 52 : 52, gp: { take: t, in: IN.cc }, ov: { mg: 'cast', i } })),
  // S22 the end card
  { f: C.end, len: 270, mg: 'end' },
  // S23 the stinger: Meatball rolls through his spotlight, he plays dead; freeze: Bravo will return.
  { f: C.stinger, len: 180, gp: { take: 's01-bowl', in: IN.bowl } },
  { f: C.stinger + 180, len: 90, mg: 'returns', still: { take: 's01-bowl', at: IN.bowl + 179 } },
];

/** Designed hits (master frames) the score lands on. */
export const HIT = {
  flop: 50, missPick: C.cannon + 136, nap: C.zzz + 84, encoreFumble: C.payoff + 74, rocketFire: C.score + 45, kaboom: C.score + 59, coreBurst: C.victory + 60, bowl: C.stinger + 96,
};

/** On-screen words (copy gate). */
export const COPY = [
  'STARRING: BRAVO', 'PAW LEGENDS', 'PRESENTS', 'BRAVO', 'IN', 'THE UNDERSTUDY', 'ALSO STARRING:', 'ONE KIBBLE CANNON', 'ROCKET', '0', '1', '(AND ASLEEP)', 'AUDITION #1', 'AUDITION #2', 'AUDITION #3', 'CUT!',
  ...CREDITS.flatMap((c) => [c.name, `as ${c.as}`, c.ult, c.coat ? `${c.coat} coat` : '']).filter(Boolean),
  'THAT’S IT.', ...COATS.map((k) => k.name), 'RANGER: TOTALLY INVISIBLE.', '…NOT ANYMORE.', 'ACT II', 'BRAVO!', 'THE CAST OF PAW LEGENDS',
  'CATS VS DOGS.', 'PICK A SIDE.', 'PLAY FREE', 'pawlegends.app', 'Bravo will return.',
];
