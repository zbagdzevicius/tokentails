// Trailer "Wild Rivals": the takes (one seeded match each, tools/clips/clip-driver.ts) and the script rules that make
// each "natural behaviour" happen the way a player's hands would (tools/clips/clip-script.ts `gag`: hold the ability,
// cast it on a trigger). Only the scripted seats change; every other seat is the game's own bot and every game rule is
// untouched. `pvp` scripts one seat per team (slots 0 and 3, 0 and 5 in 5v5), `coop` team 0's three seats.
// `search` is what tools/wildrivals/search.mjs lists for that take.

const C = {
  chili: 'coat.chili.store_red_brindle', meatball: 'coat.meatball.store_siamese', bravo: 'coat.bravo.store_harlequin', clem: 'coat.clem.store_calico',
  cacklejaw: 'coat.cacklejaw.store_starry', stilts: 'coat.stilts.store_bengal', howler: 'coat.howler.store_sable', marshmallow: 'coat.marshmallow.store_frostbell',
  pixelMoon: 'coat.pixel.store_moonwhisker', brutusThunder: 'coat.brutus.store_thunderpaw', duchess: 'coat.duchess.store_blue_point', domino: 'coat.domino.store_pizzaiolo',
  nugget: 'coat.nugget.store_robo_vac', pixelLeo: 'coat.pixel.store_leopard', rocket: 'coat.rocket.store_tiger', frankie: 'coat.frankie.store_paper_parade',
  sage: 'coat.sage.store_bloomtail', mega: 'coat.meatball.store_mega_meal', sunforged: 'coat.clem.s1_sunforged', chairman: 'coat.brutus.store_chairman',
};
export const COATS = C;

const gag = (slot, key, when, o = {}) => ({ slot, do: 'gag', key, when, ...o });

export const TAKES = {
  // 01 / 21a: Chili hides in the purse as Nova's meteors land round him (Crossing, spring)
  purse: {
    map: 'crossing', scheme: 'bloom', mode: 'skirmish', variant: 'pvp',
    teams: [['nova', 'clem', 'sage'], ['chili', 'brutus', 'bravo']],
    looks: [[null, null, null], [C.chili, null, null]],
    script: [gag(0, 3, 'foes', { hero: 'chili', range: 12000, chase: 'chili', chaseR: 10000 }), gag(3, 2, 'cast', { hero: 'nova', trigKey: 3, near: 16000, delay: 32, aim: 'self', still: true })],
    search: '--casts nova:3,chili:2',
  },
  // 03: the hibernating loaf charms two dogs into him, then the Bowling Roll (Thicket, spring)
  loaf: {
    map: 'thicket', scheme: 'bloom', mode: 'skirmish', variant: 'bots',
    teams: [['meatball', 'clem', 'sage'], ['champ', 'howler', 'rocket']],
    looks: [[C.meatball, null, null], [null, C.howler, null]],
    script: [gag(0, 1, 'foes', { foes: 2, range: 3000, aim: 'self' }), gag(0, 0, 'cast', { hero: 'meatball', trigKey: 1, near: 100, delay: 40, aim: 'foe', range: 7000 })],
    search: '--casts meatball:1,meatball:0',
  },
  // 04: the possum plays dead (Dramatic Flop), Clem walks off, Stage Dive lands on her (Ridge, summer)
  flop: {
    map: 'ridge', scheme: 'native', mode: 'skirmish', variant: 'bots',
    teams: [['bravo', 'brutus', 'chili'], ['clem', 'sage', 'meatball']],
    looks: [[C.bravo, null, null], [C.clem, null, null]],
    script: [gag(0, 2, 'clip', { clip: 'flop', delay: 36, aim: 'foe', hero: 'clem', range: 5200 })],
    search: '--casts bravo:2 --clips flop',
  },
  // 05: the stalk: Cacklejaw and Ranger slink through the bushes; Stilts swivels her ears, then the High Leap (Thicket, summer)
  stalk: {
    map: 'thicket', scheme: 'native', mode: 'skirmish', variant: 'bots',
    teams: [['stilts', 'lambo', 'sage'], ['cacklejaw', 'ranger', 'brutus']],
    looks: [[C.stilts, null, null], [C.cacklejaw, null, null]],
    script: [gag(0, 1, 'foes', { range: 6500, aim: 'self' }), gag(0, 0, 'cast', { hero: 'stilts', trigKey: 1, near: 100, delay: 24, aim: 'foe', range: 8000 })],
    search: '--casts stilts:1,stilts:0,cacklejaw:2,ranger:2',
  },
  // 06 / 11: the grooming ritual: Big Hug and Purr Wave vs the Sploot (Crossing, autumn)
  groom: {
    map: 'crossing', scheme: 'harvest', mode: 'skirmish', variant: 'coop',
    teams: [['lambo', 'mochi', 'clem'], ['nugget', 'biscuit', 'champ']],
    script: [gag(0, 1, 'foes', { range: 3500, aim: 'foe' }), gag(1, 2, 'cast', { hero: 'lambo', trigKey: 1, near: 9000, delay: 12, aim: 'self', range: 6000 })],
    search: '--casts lambo:1,mochi:2,nugget:2',
  },
  // 07 / 13: the call: Howler's AWOO, Barkula's RED MOON answers over the cats (Ridge, autumn)
  howl: {
    map: 'ridge', scheme: 'harvest', mode: 'skirmish', variant: 'coop',
    teams: [['howler', 'barkula', 'champ'], ['clem', 'mochi', 'stilts']],
    looks: [[C.howler, null, null], [null, null, null]],
    script: [gag(0, 0, 'foes', { foes: 2, range: 6000, aim: 'centre' }), gag(1, 3, 'cast', { hero: 'howler', trigKey: 0, near: 12000, delay: 18, aim: 'centre', range: 10000 })],
    search: '--casts howler:0,barkula:3',
  },
  // 05 (60 s): nesting: Mochi's Cuddle Bubble on Lambo; Nugget (Robo-Vac) Herding Time (Crossing, spring)
  nest: {
    map: 'crossing', scheme: 'bloom', mode: 'skirmish', variant: 'pvp',
    teams: [['mochi', 'lambo', 'sage'], ['nugget', 'champ', 'biscuit']],
    looks: [[null, null, null], [C.nugget, null, null]],
    script: [gag(3, 3, 'foes', { foes: 2, range: 6000, aim: 'centre' })],
    search: '--casts nugget:3,mochi:1',
  },
  // 09 (60 s): the observer: Pixel (Leopard) ducks into her box while Rocket (Tiger Brindle) sniffs round, then Cap Cannon (Quarry, summer)
  box: {
    map: 'quarry', scheme: 'verdant', mode: 'skirmish', variant: 'pvp',
    teams: [['pixel', 'clem', 'sage'], ['rocket', 'brutus', 'champ']],
    looks: [[C.pixelLeo, null, null], [C.rocket, null, null]],
    script: [gag(0, 2, 'foes', { hero: 'rocket', range: 4000, aim: 'self' }), gag(0, 0, 'cast', { hero: 'pixel', trigKey: 2, near: 100, delay: 45, aim: 'foe', range: 9000 }), gag(3, 0, 'foes', { hero: 'pixel', range: 9000, chase: 'pixel', chaseR: 3000 })],
    search: '--casts pixel:2,pixel:0,rocket:0',
  },
  // 12 (60 s): Domino (Pizzaiolo) shakes off the water onto Duchess (Blue Point); she is Not Amused (Park, autumn)
  shake: {
    map: 'pitch', scheme: 'harvest', mode: 'skirmish', variant: 'pvp',
    teams: [['duchess', 'clem', 'sage'], ['domino', 'brutus', 'champ']],
    looks: [[C.duchess, null, null], [C.domino, null, null]],
    script: [gag(0, 1, 'cast', { hero: 'domino', trigKey: 2, near: 6000, delay: 14, aim: 'foe', range: 7000 }), gag(3, 2, 'foes', { hero: 'duchess', range: 3000, aim: 'foe', chase: 'duchess', chaseR: 2500 })],
    search: '--casts domino:2,duchess:1',
  },
  // first snow: the ultimate salvo, two scripted casters per take, each on 2+ enemy heroes
  uQuarry: {
    map: 'quarry', scheme: 'frost', mode: 'skirmish', variant: 'pvp',
    teams: [['ziggy', 'clem', 'sage'], ['marshmallow', 'brutus', 'champ']],
    looks: [[null, null, null], [C.marshmallow, null, null]],
    script: [gag(0, 3, 'foes', { foes: 2, range: 5000, aim: 'centre' }), gag(3, 3, 'foes', { foes: 2, range: 6000, aim: 'centre' })],
    search: '--casts ziggy:3,marshmallow:3,marshmallow:2',
  },
  uCrossing: {
    map: 'crossing', scheme: 'frost', mode: 'skirmish', variant: 'coop',
    teams: [['pixel', 'dusty', 'sage'], ['brutus', 'chili', 'howler']],
    looks: [[C.pixelMoon, null, null], [null, null, null]],
    script: [gag(0, 3, 'foes', { foes: 2, range: 6000, aim: 'centre' }), gag(1, 3, 'foes', { foes: 1, range: 9000, aim: 'foe' })],
    search: '--casts pixel:3,dusty:3',
  },
  uThicket: {
    map: 'thicket', scheme: 'frost', mode: 'skirmish', variant: 'pvp',
    teams: [['mochi', 'clem', 'sage'], ['brutus', 'chili', 'howler']],
    looks: [[null, null, null], [C.brutusThunder, null, null]],
    script: [gag(0, 3, 'foes', { foes: 2, range: 5000, aim: 'centre' }), gag(3, 3, 'foes', { foes: 2, range: 5000, aim: 'foe' })],
    search: '--casts mochi:3,brutus:3',
  },
  uRidge: {
    map: 'ridge', scheme: 'frost', mode: 'skirmish', variant: 'pvp',
    teams: [['duchess', 'clem', 'sage'], ['domino', 'brutus', 'champ']],
    looks: [[C.duchess, null, null], [C.domino, null, null]],
    script: [gag(0, 3, 'foes', { foes: 2, range: 6000, aim: 'centre' }), gag(3, 3, 'foes', { foes: 2, range: 6000, aim: 'centre' })],
    search: '--casts duchess:3,domino:3',
  },
  uPitch: {
    map: 'pitch', scheme: 'frost', mode: 'skirmish', variant: 'pvp',
    teams: [['sage', 'clem', 'meatball'], ['frankie', 'brutus', 'chili']],
    looks: [[C.sage, null, null], [C.frankie, null, null]],
    script: [gag(0, 3, 'foes', { foes: 2, range: 9000, aim: 'centre' }), gag(3, 3, 'foes', { foes: 2, range: 6000, aim: 'centre' })],
    search: '--casts sage:3,frankie:3',
  },
  // 18 / 19 / 10: the great migration: Classic 5v5 on Hearthwood in first snow
  herd: {
    map: 'hearthwood', scheme: 'frost', mode: 'classic', variant: 'pvp',
    teams: [['meatball', 'clem', 'sage', 'lambo', 'pixel'], ['brutus', 'chili', 'bravo', 'howler', 'nugget']],
    looks: [[C.mega, C.sunforged, null, null, null], [C.chairman, null, null, null, null]],
    script: [gag(0, 3, 'foes', { foes: 3, range: 7000, aim: 'centre' }), gag(5, 3, 'cast', { hero: 'meatball', trigKey: 3, near: 12000, delay: 20, aim: 'foe', range: 6000 })],
    search: '--casts meatball:3,brutus:3,clem:3 --victory',
  },
  // 21 (60 s button): Chili in the purse again; Meatball's Bowling Roll arrives as it pops (Crossing, spring)
  button: {
    map: 'crossing', scheme: 'bloom', mode: 'skirmish', variant: 'pvp',
    teams: [['meatball', 'clem', 'sage'], ['chili', 'brutus', 'bravo']],
    looks: [[null, null, null], [C.chili, null, null]],
    script: [gag(0, 0, 'cast', { hero: 'chili', trigKey: 2, near: 7000, delay: 14, aim: 'foe', range: 7000 }), gag(3, 2, 'foes', { hero: 'meatball', range: 5000, aim: 'self' })],
    search: '--casts chili:2,meatball:0',
  },
};

/** The take object the clip engine plays (mode, map, variant, teams, script) for a take key and seed. */
export const takeSpec = (key, seed) => {
  const t = TAKES[key];
  return { mode: t.mode, map: t.map, variant: t.variant, seed, teams: t.teams, ...(t.script ? { script: t.script } : {}) };
};
