/**
 * Trailer v2 ("Big Plays") takes found by the moment scan (8 heroes x seeds 1-150, every slot) and checked in the
 * capture harness. They are fixed entries, not searches: `seed-search.mjs --fixed [--only X1,X2]` plays each one in
 * Node to its last key + 300 ticks (or the match end) and writes it to takes.json with its check hashes.
 *
 * Keys are sim ticks from the event log (cast / windup / death / levelup / tower). Roles are entity slots; heroes are
 * slots 0-5 (cats 0-2 when the human hero is a cat). Cast slots: 0 Q, 1 W, 2 E, 3 R.
 */
export const FIXED = {
  // Cacklejaw's Pack Hunt resets three times at the cat fountain (three takedowns)
  X2: { seed: 139, hero: 'cacklejaw', keys: { r: 9804, ko1: 9805, ko2: 9812, ko3: 9818 }, roles: { star: 0, v1: 4 } },
  // Aviete: Short Circuit -> Live Wire -> Spark Swipe, two takedowns
  X1: { seed: 143, hero: 'clem', keys: { r: 9803, e: 9809, q: 9815, ko2: 9853 }, roles: { star: 1, v1: 5, v2: 4 } },
  // Sage's Moonshot point-blank on three heroes (9:16 fallback only)
  X3: { seed: 3, hero: 'brutus', keys: { windup: 12553, cast: 12582, hit: 12583 }, roles: { star: 5, v1: 2 } },
  // seed 47: Clem's Tumble + Q chain on the bridge (W1), then the 3v3 at the dog base and Lambo's Belly Flop onto three dogs
  X4: {
    seed: 47,
    hero: 'lambo',
    keys: { e: 7462, q1: 7474, w: 7504, q2: 7510, q3: 7516, bengasW: 9841, cackR: 9867, cast: 9894, land: 9898, ko2: 9946 },
    roles: { lambo: 0, bengas: 1, clem: 2, v1: 3, star: 0 },
  },
  // Sir Brutus's Shield Slam, three cats hit
  X5: { seed: 52, hero: 'brutus', keys: { cast: 12730 }, roles: { star: 2, v1: 5 } },
  // Lambo's Tangled Lights hauls three heroes in
  X6: { seed: 57, hero: 'brutus', keys: { windup: 4676, cast: 4690 }, roles: { star: 4, v1: 1 } },
  // Bengas's Striking Pose, three stunned
  X7: { seed: 64, hero: 'brutus', keys: { windup: 11379, cast: 11387, hit: 11394, ko1: 11409 }, roles: { star: 3, v1: 2 } },
  // Gabe's Under Her Spell, three charmed
  X8: { seed: 41, hero: 'lambo', keys: { windup: 12898, cast: 12912, hit: 12931 }, roles: { star: 2, v1: 3 } },
  // Clem's Golden Hour, then one Q: a double takedown
  X9: { seed: 103, hero: 'sage', keys: { r: 9179, q: 9185 }, roles: { star: 1, v1: 4 } },
  // Cacklejaw's Jeer Slash through three cats, a takedown
  X10: { seed: 12, hero: 'brutus', keys: { cast: 7780, ko: 7784 }, roles: { star: 2, v1: 3 } },
  // Sage's Hop Back (a backflip)
  X11: { seed: 68, hero: 'sage', keys: { cast: 9066 }, roles: { star: 0, v1: 3 } },
  // Gabe's Chase the Wind (a gliding barrel roll)
  X12: { seed: 150, hero: 'sage', keys: { cast: 10469 }, roles: { star: 1, v1: 3 } },
  // Sir Brutus dives the cat tower, takes Gabe and walks out
  X13: { seed: 84, hero: 'brutus', keys: { ko: 1786 }, roles: { star: 0, v1: 3, tower: 50 } },
  // the finale: the dogs dive the cat base; Clem reaches level 10 on a takedown; cat tower 46 falls
  X14: {
    seed: 36,
    hero: 'cacklejaw',
    keys: { cackE: 11022, lamboE: 11023, lamboLand: 11031, bengasR: 11031, lamboRw: 11035, clemR: 11036, bengasWw: 11043, lamboR: 11049, brutusR: 11051, bengasW: 11051, clemQ: 11084, cackR: 11094, ko: 11119, tower: 11137 },
    roles: { cacklejaw: 0, brutus: 1, cack2: 2, bengas: 3, clem: 4, lambo: 5, tower: 46 },
  },
};
