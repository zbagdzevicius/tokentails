/**
 * Sim v18 (docs/plans/moba/MAP-5V5.md §7): the 5v5 Hearthwood gates' match runners, bundled for Node by
 * tools/hearth-gates.mjs and used by tests/unit/hearthwood.test.ts.
 *
 * - hearthSoloPlay / hearthPartyPlay / hearthPvpPlay (G2 determinism): a full match with player-bot pilots and random
 *   stretches of random input, recorded, then re-simulated from the record alone; trails and results must match.
 * - hearthSymmetryPair (G5, G6): one seed played twice in PvP with ten `normal` pilots, cats on team 0 and then the
 *   same line-up with the sides swapped, so a side bias and a species bias show apart.
 */
import { Op, type Command, type HeroId, type MatchConfig, type TrickId } from '../../src/sim/api';
import { createMatch, createPlayerBotFor, fillPicks, hashTrail, playerBotCommands, replayRecord, result, step, tickOf, type MatchHandle } from '../../src/sim/index';
import { fillPicksParty, partyReplayRecord, pvpReplayRecord, runPartyReplay, runPvpReplay } from '../../src/sim/party';
import { runReplay } from '../../src/sim/replay';
import { Rng } from '../../src/sim/rng';
import { randomCommand } from '../../tests/unit/helpers';

const CAT_IDS: readonly HeroId[] = ['clem', 'sage', 'gabe', 'meatball', 'duchess', 'aviete', 'bengas', 'lambo', 'pixel', 'stilts'];
const DOG_IDS: readonly HeroId[] = ['brutus', 'cacklejaw', 'nugget', 'marshmallow', 'bravo', 'chili', 'howler', 'rocket', 'frankie', 'domino'];
const TRICKS: readonly TrickId[] = ['pounce', 'snack', 'hiss', 'purrify'];
const MAP = 'hearthwood' as const;

function fold(trail: readonly number[]): string {
  let h = 0x811c9dc5;
  for (const v of trail) {
    for (let k = 0; k < 4; k++) {
      h ^= (v >>> (k * 8)) & 0xff;
      h = Math.imul(h, 0x01000193);
    }
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Drive `humans` with pilots (sometimes random input instead) until the match ends. */
function drive(m: MatchHandle, humans: readonly number[], r: Rng): void {
  const pilots = humans.map((s) => createPlayerBotFor(m, s === 0 || s === 5 ? 'pinger' : 'normal', s));
  const piloted = humans.map(() => true);
  while (!result(m)) {
    if (tickOf(m) % 2 === 0 && r.int(400) === 0) {
      const k = r.int(humans.length);
      piloted[k] = !piloted[k];
    }
    const out: Command[][] = [];
    for (let s = 0; s < 10; s++) out.push([]);
    for (let k = 0; k < humans.length; k++) {
      const cmds = playerBotCommands(m, pilots[k]);
      if (piloted[k]) out[humans[k]] = cmds;
      else {
        const c = randomCommand(r, 900);
        if (c) out[humans[k]].push(c);
        if (r.int(700) === 0) out[humans[k]].push({ op: Op.Ping, kind: r.int(12), x: r.range(0, 128000), y: r.range(0, 128000), id: r.int(3) ? r.int(10) : 255 });
      }
    }
    step(m, out[0], out);
  }
}

/** G2: a solo 5v5 match (slot 0 piloted), its v:1 record and the re-sim. */
export function hearthSoloPlay(seed: number): { ok: boolean; finalHash: string; trail: string; ticks: number } {
  const r = new Rng(seed ^ 0x5a5a);
  const { picks, tricks } = fillPicks(seed, CAT_IDS[r.int(10)], TRICKS[r.int(4)], MAP);
  const m = createMatch({ seed, picks, tricks, difficulty: (['easy', 'normal', 'hard'] as const)[r.int(3)], map: MAP });
  drive(m, [0], r);
  const res = result(m)!;
  const rec = replayRecord(m)!;
  const run = runReplay(rec);
  const trail = fold(hashTrail(m));
  return { ok: run.result !== null && run.result.finalHash === res.finalHash && fold(run.trail) === trail && rec.map === MAP, finalHash: res.finalHash, trail, ticks: res.ticks };
}

/** G2: a 5v5 party (slots 0, 1, 3 human), its v:2 record and the re-sim. */
export function hearthPartyPlay(seed: number): { ok: boolean; finalHash: string; trail: string; ticks: number } {
  const r = new Rng(seed ^ 0x7a7a);
  const humans = [0, 1, 3];
  const seats = humans.map((slot, k) => ({ slot, hero: DOG_IDS[(r.int(10) + k * 3) % 10], trick: TRICKS[r.int(4)] }));
  const { picks, tricks } = fillPicksParty(seed, seats, MAP);
  const m = createMatch({ seed, picks, tricks, difficulty: 'normal', humans, map: MAP });
  drive(m, humans, r);
  const res = result(m)!;
  const rec = partyReplayRecord(m)!;
  const run = runPartyReplay(rec);
  const trail = fold(hashTrail(m));
  return { ok: run.result !== null && run.result.finalHash === res.finalHash && fold(run.trail) === trail, finalHash: res.finalHash, trail, ticks: res.ticks };
}

/** G2: a 5v5 PvP (slots 0, 1 and 5, 6 human), its v:3 record and the re-sim. */
export function hearthPvpPlay(seed: number): { ok: boolean; finalHash: string; trail: string; ticks: number; winner: number } {
  const r = new Rng(seed ^ 0x3c3c);
  const humans = [0, 1, 5, 6];
  const seats = humans.map((slot) => ({ slot, hero: (slot < 5 ? CAT_IDS : DOG_IDS)[(r.int(10) + slot) % 10], trick: TRICKS[r.int(4)] }));
  // Two humans a team must be distinct heroes of the team's species.
  if (seats[1].hero === seats[0].hero) seats[1] = { ...seats[1], hero: CAT_IDS[(CAT_IDS.indexOf(seats[0].hero) + 1) % 10] };
  if (seats[3].hero === seats[2].hero) seats[3] = { ...seats[3], hero: DOG_IDS[(DOG_IDS.indexOf(seats[2].hero) + 1) % 10] };
  const { picks, tricks } = fillPicksParty(seed, seats, MAP);
  const m = createMatch({ seed, picks, tricks, difficulty: 'hard', humans, mode: 'pvp', map: MAP });
  drive(m, humans, r);
  const res = result(m)!;
  const rec = pvpReplayRecord(m)!;
  const run = runPvpReplay(rec);
  const trail = fold(hashTrail(m));
  return { ok: run.result !== null && run.result.finalHash === res.finalHash && fold(run.trail) === trail, finalHash: res.finalHash, trail, ticks: res.ticks, winner: res.winner };
}

export interface HearthPair {
  seed: number;
  cats: HeroId[];
  dogs: HeroId[];
  /** Winner (team) of the cats-left match, then of the dogs-left match. */
  catsLeftWinner: number;
  dogsLeftWinner: number;
  ticks: [number, number];
  reasons: [string, string];
  /** First Grizzlechop take (tick, −1 none) and Great Pudding calms per match. */
  grizz: [number, number];
  pudding: [number, number];
}

/** G5 / G6: seed `seed` played twice in 5v5 PvP with ten `normal` pilots, cats on team 0 then dogs on team 0. */
export function hearthSymmetryPair(seed: number): HearthPair {
  const r = new Rng(seed).fork('hearth-symmetry');
  const draw = (pool: readonly HeroId[]): HeroId[] => {
    const left = pool.slice();
    const out: HeroId[] = [];
    for (let k = 0; k < 5; k++) out.push(left.splice(r.int(left.length), 1)[0]);
    return out;
  };
  const cats = draw(CAT_IDS);
  const dogs = draw(DOG_IDS);
  const catTricks = [0, 1, 2, 3, 4].map(() => TRICKS[r.int(TRICKS.length)]);
  const dogTricks = [0, 1, 2, 3, 4].map(() => TRICKS[r.int(TRICKS.length)]);
  const slots = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  const play = (catsLeft: boolean) => {
    const seats = slots.map((slot) => {
      const cat = slot < 5 === catsLeft;
      return { slot, hero: (cat ? cats : dogs)[slot % 5], trick: (cat ? catTricks : dogTricks)[slot % 5] };
    });
    const { picks, tricks } = fillPicksParty(seed, seats, MAP);
    const config: MatchConfig = { seed, picks, tricks, difficulty: 'hard', humans: slots, mode: 'pvp', map: MAP };
    const m = createMatch(config);
    const pilots = slots.map((s) => createPlayerBotFor(m, 'normal', s));
    let grizz = -1;
    let pud = 0;
    while (!result(m)) {
      const out = pilots.map((p) => playerBotCommands(m, p));
      step(m, out[0], out);
      for (const e of m.events) {
        if (e.type === 'objective' && e.kind === 'grizzlechop' && grizz < 0) grizz = e.tick;
        if (e.type === 'objective' && e.kind === 'pudding') pud++;
      }
    }
    return { res: result(m)!, grizz, pud };
  };
  const x = play(true);
  const y = play(false);
  return {
    seed,
    cats,
    dogs,
    catsLeftWinner: x.res.winner,
    dogsLeftWinner: y.res.winner,
    ticks: [x.res.ticks, y.res.ticks],
    reasons: [x.res.reason, y.res.reason],
    grizz: [x.grizz, y.grizz],
    pudding: [x.pud, y.pud],
  };
}
