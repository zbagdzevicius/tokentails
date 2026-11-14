/**
 * Determinism fuzz (POC.md §15 item 1): one seed → a full match with a random human command stream (the in-sim bots
 * play the other five slots), recorded, then replayed from the record alone. The two hash trails (one hash every 30
 * ticks) and the results must be identical. Bundled for Node by tools/determinism.mjs and tests/unit/determinism.test.ts.
 */
import { Op, type Command, type Difficulty, type HeroId, type MapId, type Mutator, type TrickId } from '../../src/sim/api';
import { createMatch, createPlayerBotFor, fillPicks, hashTrail, playerBotCommands, replayRecord, result, step, tickOf } from '../../src/sim/index';
import { fillPicksParty, partyReplayRecord, pvpReplayRecord, runPartyReplay, runPvpReplay } from '../../src/sim/party';
import { runReplay } from '../../src/sim/replay';
import { Rng } from '../../src/sim/rng';
import { randomCommand } from '../../tests/unit/helpers';

const HEROES: readonly HeroId[] = ['clem', 'sage', 'brutus', 'cacklejaw', 'lambo', 'aviete', 'bengas', 'gabe', 'meatball', 'pixel', 'duchess', 'stilts', 'nugget', 'marshmallow', 'bravo', 'chili', 'howler', 'rocket', 'frankie', 'domino'];
const TRICKS: readonly TrickId[] = ['pounce', 'snack', 'hiss', 'purrify'];
const LEVELS: readonly Difficulty[] = ['easy', 'normal', 'hard'];

/** The i-th fuzz seed: spread over the whole uint32 range; i = 0 is 0 and i = 1 is 0xffffffff. */
export const fuzzSeed = (i: number): number => (i === 0 ? 0 : i === 1 ? 0xffffffff : Math.imul(i, 0x9e3779b1) >>> 0);

/** fuzzSeed's inverse (0x0e8b2f51 is 0x9e3779b1's inverse mod 2^32): the hero cycles with it, so any HEROES.length
 *  consecutive fuzz seeds cover every hero (sim v11: 12 heroes in 24 seeds). */
export const fuzzIndex = (seed: number): number => (seed >>> 0 === 0xffffffff ? 1 : Math.imul(seed, 0x0e8b2f51) >>> 0);

export interface FuzzResult {
  seed: number;
  hero: HeroId;
  difficulty: Difficulty;
  ticks: number;
  commands: number;
  ok: boolean;
  /** Index of the first differing hash in the trail, or −1. */
  firstDiff: number;
  finalHash: string;
  inputChars: number;
}

/**
 * Sim v22: the match variant a fuzz seed plays (default: a plain Crossing match, unchanged since v10). 'blitz' is the
 * Blitz mutator on Crossing; 'hearthwood' the 5v5 Classic map (tools/determinism.mjs runs both beside the plain one).
 */
export type FuzzVariant = 'plain' | 'blitz' | 'hearthwood' | 'onelane' | 'duel' | 'boss';
const VARIANT_CONFIG: Readonly<Record<FuzzVariant, { map?: MapId; mutator?: Mutator }>> = {
  plain: {},
  blitz: { mutator: 'blitz' },
  hearthwood: { map: 'hearthwood' },
  // sim v28 (V28.md §5): the Sunny Lane strip modes
  onelane: { mutator: 'onelane' },
  duel: { mutator: 'duel' },
  boss: { mutator: 'boss' },
};

/** Play one fuzz match (no replay). `trail` folds the whole hash trail (one hash every 30 ticks) into one hex. */
export function fuzzPlay(seed: number, variant: FuzzVariant = 'plain') {
  const r = new Rng(seed ^ 0x5eed);
  r.int(HEROES.length); // the draw that used to pick the hero: kept, so the rest of the seed's stream does not move
  const hero = HEROES[fuzzIndex(seed) % HEROES.length];
  const trick = TRICKS[r.int(TRICKS.length)];
  const difficulty = LEVELS[r.int(LEVELS.length)];
  // Command rate per tick from 2% to 40%, and some ticks with two commands (the latest wins).
  const rateBp = 200 + r.int(3800);
  const pingEvery = 20 + r.int(400);
  const cfg = VARIANT_CONFIG[variant];
  const { picks, tricks } = fillPicks(seed, hero, trick, cfg.map);
  const m = createMatch({ seed, picks, tricks, difficulty, ...cfg });
  // Sim v10 (GAPS B2): a quarter of the seeds try to forfeit, some before the difficulty allows it (dropped). Its own
  // stream, so the other commands of a seed do not move.
  const fr = new Rng(seed ^ 0xf0f7);
  const forfeitAt = fr.int(4) === 0 ? 3000 + fr.int(9000) : -1;
  let commands = 0;
  while (!result(m)) {
    const list: Command[] = [];
    const c = randomCommand(r, rateBp);
    if (c) list.push(c);
    if (c && r.int(10) === 0) list.push(randomCommand(r, 10000) ?? { op: Op.Stop });
    if (r.int(4000) === 0) list.push({ op: Op.Trick, x: r.range(0, 100000), y: r.range(0, 60000) });
    // Sim v10 (GAPS B1): pings, sometimes sharing the tick with another command, often inside the sim's ping gap.
    if (r.int(pingEvery) === 0) list.push({ op: Op.Ping, kind: r.int(8), x: r.range(0, 100000), y: r.range(0, 60000), id: r.int(3) ? 3 + r.int(3) : 255 });
    if (forfeitAt >= 0 && (tickOf(m) === forfeitAt || tickOf(m) === forfeitAt - 1500)) list.push({ op: Op.Forfeit });
    commands += list.length;
    step(m, list);
  }
  return { match: m, hero, difficulty, commands, result: result(m)!, trail: foldTrail(hashTrail(m)) };
}

/** FNV-1a over the hash trail, as 8 hex digits. */
export function foldTrail(trail: readonly number[]): string {
  let h = 0x811c9dc5;
  for (const v of trail) {
    for (let k = 0; k < 4; k++) {
      h ^= (v >>> (k * 8)) & 0xff;
      h = Math.imul(h, 0x01000193);
    }
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Final hash and folded trail of a fuzz match: what tests/e2e/determinism-browser.spec.ts compares across engines. */
export function fuzzFinal(seed: number): { seed: number; finalHash: string; trail: string; ticks: number } {
  const p = fuzzPlay(seed);
  return { seed, finalHash: p.result.finalHash, trail: p.trail, ticks: p.result.ticks };
}

export function fuzzMatch(seed: number, variant: FuzzVariant = 'plain'): FuzzResult {
  const { match: m, hero, difficulty, commands, result: res } = fuzzPlay(seed, variant);
  const rec = replayRecord(m)!;
  const run = runReplay(rec);
  const a = hashTrail(m);
  const b = run.trail;
  let firstDiff = -1;
  for (let i = 0; i < Math.max(a.length, b.length) && firstDiff < 0; i++) if (a[i] !== b[i]) firstDiff = i;
  const same = run.result !== null && JSON.stringify(run.result) === JSON.stringify(res);
  return { seed, hero, difficulty, ticks: res.ticks, commands, ok: firstDiff < 0 && same, firstDiff, finalHash: res.finalHash, inputChars: rec.inputs.length };
}

// ---------------------------------------------------------------------------------------------------------------
// Party play mode-flip fuzz (docs/plans/moba/MULTIPLAYER.md §1.5): humans [0, 1, 2]; each slot switches between a
// pilot (createPlayerBotFor, as the relay's referee flies a dropped human) and a random "human" stream at random
// turns (2 ticks). Recorded as a PartyReplayRecord and replayed from it; trails must match. Node vs the browser
// Worker and the inline path compare `fuzzPartyFinal` (tests/e2e/determinism-browser.spec.ts).

export interface PartyFuzzOptions {
  party: true;
  flips: boolean;
}

export function fuzzPartyPlay(seed: number, opts: PartyFuzzOptions = { party: true, flips: true }) {
  const r = new Rng(seed ^ 0x9a27);
  const difficulty = LEVELS[r.int(LEVELS.length)];
  const cats: HeroId[] = ['clem', 'sage', 'gabe', 'meatball', 'duchess'];
  const seats = [0, 1, 2].map((slot) => ({ slot, hero: cats[(fuzzIndex(seed) + slot * 2) % cats.length], trick: TRICKS[r.int(TRICKS.length)] }));
  const { picks, tricks } = fillPicksParty(seed, seats);
  const m = createMatch({ seed, picks, tricks, difficulty, humans: [0, 1, 2] });
  const profiles = ['normal', 'normal', 'easy'] as const;
  const pilots = [0, 1, 2].map((s) => createPlayerBotFor(m, profiles[s], s));
  const piloted = [r.int(2) === 0, r.int(2) === 0, r.int(2) === 0];
  let flips = 0;
  while (!result(m)) {
    const t = tickOf(m);
    if (opts.flips && t % 2 === 0 && r.int(300) === 0) {
      const s = r.int(3);
      piloted[s] = !piloted[s];
      flips++;
    }
    const out: Command[][] = [[], [], []];
    for (let s = 0; s < 3; s++) {
      // A pilot must be asked every tick it runs, so its memory follows the match (the relay does the same).
      const cmds = playerBotCommands(m, pilots[s]);
      if (piloted[s]) out[s] = cmds;
      else {
        const c = randomCommand(r, 900);
        if (c) out[s].push(c);
      }
    }
    step(m, out[0], out);
  }
  return { match: m, flips, result: result(m)!, trail: foldTrail(hashTrail(m)) };
}

export function fuzzPartyFinal(seed: number): { seed: number; finalHash: string; trail: string; ticks: number; flips: number } {
  const p = fuzzPartyPlay(seed);
  return { seed, finalHash: p.result.finalHash, trail: p.trail, ticks: p.result.ticks, flips: p.flips };
}

/** Play, record, replay: true when the trails and results match. */
export function fuzzPartyMatch(seed: number): { seed: number; ok: boolean; finalHash: string; flips: number } {
  const p = fuzzPartyPlay(seed);
  const rec = partyReplayRecord(p.match)!;
  const run = runPartyReplay(rec);
  const ok = run.result !== null && run.result.finalHash === p.result.finalHash && foldTrail(run.trail) === p.trail;
  return { seed, ok, finalHash: p.result.finalHash, flips: p.flips };
}

// ---------------------------------------------------------------------------------------------------------------
// Sim v16 S-PvP fuzz (docs/plans/moba/V16.md §1.4, §3.3): humans [0, 1, 3, 4] on both teams with bot fill, each seat
// flipping between a pilot and a random stream; both leads send pings and forfeits (some before 4:00, dropped).
// Recorded as a PvpReplayRecord and replayed from it; trails must match.

const CAT_IDS: readonly HeroId[] = ['clem', 'sage', 'gabe', 'meatball', 'duchess', 'aviete', 'bengas', 'lambo', 'pixel', 'stilts'];
const DOG_IDS: readonly HeroId[] = ['brutus', 'cacklejaw', 'nugget', 'marshmallow', 'bravo', 'chili', 'howler', 'rocket', 'frankie', 'domino'];
const PVP_HUMANS: readonly number[] = [0, 1, 3, 4];

export function fuzzPvpPlay(seed: number) {
  const r = new Rng(seed ^ 0x9f9f);
  const side0 = r.int(2) === 0 ? CAT_IDS : DOG_IDS;
  const side1 = side0 === CAT_IDS ? DOG_IDS : CAT_IDS;
  const seats = PVP_HUMANS.map((slot) => ({ slot, hero: (slot < 3 ? side0 : side1)[(fuzzIndex(seed) + (slot % 3) * 3) % 10], trick: TRICKS[r.int(TRICKS.length)] }));
  const fill: [Difficulty, Difficulty] = [LEVELS[r.int(LEVELS.length)], LEVELS[r.int(LEVELS.length)]];
  const { picks, tricks } = fillPicksParty(seed, seats);
  const m = createMatch({ seed, picks, tricks, difficulty: 'hard', humans: PVP_HUMANS, mode: 'pvp', fillDifficulty: fill });
  const pilots = PVP_HUMANS.map((s) => createPlayerBotFor(m, s === 0 || s === 3 ? 'pinger' : 'normal', s));
  const piloted = PVP_HUMANS.map(() => r.int(2) === 0);
  const ff = r.int(3) === 0 ? 3000 + r.int(9000) : -1;
  const ffSlot = r.int(2) === 0 ? 0 : 3;
  let flips = 0;
  while (!result(m)) {
    const t = tickOf(m);
    if (t % 2 === 0 && r.int(300) === 0) {
      const k = r.int(PVP_HUMANS.length);
      piloted[k] = !piloted[k];
      flips++;
    }
    const out: Command[][] = [[], [], [], [], [], []];
    for (let k = 0; k < PVP_HUMANS.length; k++) {
      const s = PVP_HUMANS[k];
      const cmds = playerBotCommands(m, pilots[k]);
      if (piloted[k]) out[s] = cmds;
      else {
        const c = randomCommand(r, 900);
        if (c) out[s].push(c);
        if (r.int(600) === 0) out[s].push({ op: Op.Ping, kind: r.int(8), x: r.range(0, 100000), y: r.range(0, 60000), id: r.int(3) ? r.int(6) : 255 });
      }
    }
    if (ff >= 0 && (t === ff || t === ff - 1500)) out[ffSlot].push({ op: Op.Forfeit });
    step(m, out[0], out);
  }
  return { match: m, flips, result: result(m)!, trail: foldTrail(hashTrail(m)) };
}

export function fuzzPvpFinal(seed: number): { seed: number; finalHash: string; trail: string; ticks: number; flips: number } {
  const p = fuzzPvpPlay(seed);
  return { seed, finalHash: p.result.finalHash, trail: p.trail, ticks: p.result.ticks, flips: p.flips };
}

/** Play, record (v3), replay: true when the trails and results match. */
export function fuzzPvpMatch(seed: number): { seed: number; ok: boolean; finalHash: string; flips: number; winner: number } {
  const p = fuzzPvpPlay(seed);
  const rec = pvpReplayRecord(p.match)!;
  const run = runPvpReplay(rec);
  const ok = run.result !== null && run.result.finalHash === p.result.finalHash && foldTrail(run.trail) === p.trail;
  return { seed, ok, finalHash: p.result.finalHash, flips: p.flips, winner: p.result.winner };
}

// ---------------------------------------------------------------------------------------------------------------
// Sim v16 pvp-symmetry (V16.md §3.1.9): seed `seed` played twice, team 0 cats then team 0 dogs (the same line-up
// with the sides swapped), six `normal` pilots. Tools: tools/pvp-symmetry.mjs; test: tests/unit/pvp-symmetry.test.ts.

export function pvpSymmetryPair(seed: number): { seed: number; catsLeftWinner: number; dogsLeftWinner: number; ticks: [number, number] } {
  // Line-ups from the seed (like the balance gate's random picks): three distinct cats, three distinct dogs, and a
  // trick per seat; the swapped match keeps every hero, trick and team slot and only changes the side.
  const r = new Rng(seed).fork('pvp-symmetry');
  const draw = (pool: readonly HeroId[]): HeroId[] => {
    const left = pool.slice();
    const out: HeroId[] = [];
    for (let k = 0; k < 3; k++) out.push(left.splice(r.int(left.length), 1)[0]);
    return out;
  };
  const cats = draw(CAT_IDS);
  const dogs = draw(DOG_IDS);
  const catTricks = [0, 1, 2].map(() => TRICKS[r.int(TRICKS.length)]);
  const dogTricks = [0, 1, 2].map(() => TRICKS[r.int(TRICKS.length)]);
  const play = (catsLeft: boolean) => {
    const seats = [0, 1, 2, 3, 4, 5].map((slot) => {
      const cat = slot < 3 === catsLeft;
      return { slot, hero: (cat ? cats : dogs)[slot % 3], trick: (cat ? catTricks : dogTricks)[slot % 3] };
    });
    const { picks, tricks } = fillPicksParty(seed, seats);
    const m = createMatch({ seed, picks, tricks, difficulty: 'hard', humans: [0, 1, 2, 3, 4, 5], mode: 'pvp' });
    const pilots = [0, 1, 2, 3, 4, 5].map((s) => createPlayerBotFor(m, 'normal', s));
    while (!result(m)) {
      const out = pilots.map((p) => playerBotCommands(m, p));
      step(m, out[0], out);
    }
    return result(m)!;
  };
  const x = play(true);
  const y = play(false);
  return { seed, catsLeftWinner: x.winner, dogsLeftWinner: y.winner, ticks: [x.ticks, y.ticks] };
}
