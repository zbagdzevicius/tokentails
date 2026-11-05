/**
 * Determinism fuzz (POC.md §15 item 1): one seed → a full match with a random human command stream (the in-sim bots
 * play the other five slots), recorded, then replayed from the record alone. The two hash trails (one hash every 30
 * ticks) and the results must be identical. Bundled for Node by tools/determinism.mjs and tests/unit/determinism.test.ts.
 */
import { Op, type Command, type Difficulty, type HeroId, type TrickId } from '../../src/sim/api';
import { createMatch, createPlayerBotFor, fillPicks, hashTrail, playerBotCommands, replayRecord, result, step, tickOf } from '../../src/sim/index';
import { fillPicksParty, partyReplayRecord, runPartyReplay } from '../../src/sim/party';
import { runReplay } from '../../src/sim/replay';
import { Rng } from '../../src/sim/rng';
import { randomCommand } from '../../tests/unit/helpers';

const HEROES: readonly HeroId[] = ['clem', 'sage', 'brutus', 'cacklejaw', 'lambo', 'aviete', 'bengas', 'gabe', 'meatball', 'pixel', 'duchess', 'stilts'];
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

/** Play one fuzz match (no replay). `trail` folds the whole hash trail (one hash every 30 ticks) into one hex. */
export function fuzzPlay(seed: number) {
  const r = new Rng(seed ^ 0x5eed);
  r.int(HEROES.length); // the draw that used to pick the hero: kept, so the rest of the seed's stream does not move
  const hero = HEROES[fuzzIndex(seed) % HEROES.length];
  const trick = TRICKS[r.int(TRICKS.length)];
  const difficulty = LEVELS[r.int(LEVELS.length)];
  // Command rate per tick from 2% to 40%, and some ticks with two commands (the latest wins).
  const rateBp = 200 + r.int(3800);
  const pingEvery = 20 + r.int(400);
  const { picks, tricks } = fillPicks(seed, hero, trick);
  const m = createMatch({ seed, picks, tricks, difficulty });
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

export function fuzzMatch(seed: number): FuzzResult {
  const { match: m, hero, difficulty, commands, result: res } = fuzzPlay(seed);
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
