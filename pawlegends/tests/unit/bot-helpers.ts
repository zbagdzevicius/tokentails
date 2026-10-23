/** Helpers for bot tests: a full match with the in-sim bots and a player-bot in slot 0. */
import { HERO_IDS } from '../../src/data/heroes';
import type { Difficulty, PlayerProfile } from '../../src/data/bots';
import type { HeroId, MatchResult, ReplayRecord, TrickId } from '../../src/sim/api';
import { createMatch, createPlayerBot, fillPicks, playerBotCommands, replayRecord, result, step, type MatchHandle } from '../../src/sim/index';

const HEROES: readonly HeroId[] = HERO_IDS;
const TRICKS: readonly TrickId[] = ['pounce', 'snack', 'hiss'];

/** Slot 0's hero and trick for a seed (the same draw as `npm run match -- --hero random --trick random`). */
export const heroFor = (seed: number): HeroId => HEROES[(Math.imul(seed ^ 0x51, 0x9e3779b1) >>> 0) % HEROES.length];
export const trickFor = (seed: number): TrickId => TRICKS[(Math.imul(seed ^ 0x7a, 0x9e3779b1) >>> 0) % TRICKS.length];

export interface Played {
  match: MatchHandle;
  result: MatchResult;
  replay: ReplayRecord;
}

/** Play one whole match: slot 0 by `profile`, slots 1..5 by the in-sim bots. */
export function playBots(seed: number, profile: PlayerProfile, difficulty: Difficulty, prepare?: (m: MatchHandle) => void): Played {
  const { picks, tricks } = fillPicks(seed, heroFor(seed), trickFor(seed));
  const m = createMatch({ seed, picks, tricks, difficulty });
  prepare?.(m);
  const bot = createPlayerBot(m, profile);
  while (!result(m)) step(m, playerBotCommands(m, bot));
  return { match: m, result: result(m)!, replay: replayRecord(m)! };
}

/** Win rate (0..100) of the human's side over `seeds` matches, and the results. */
export function winRate(from: number, n: number, profile: PlayerProfile, difficulty: Difficulty): { rate: number; results: MatchResult[] } {
  const results: MatchResult[] = [];
  for (let s = from; s < from + n; s++) results.push(playBots(s, profile, difficulty).result);
  return { rate: (100 * results.filter((r) => r.outcome === 'won').length) / n, results };
}

/** Is the env flag for the long balance runs set (`PAWLEGENDS_NIGHTLY=1 npx vitest run`)? */
export const NIGHTLY = typeof process !== 'undefined' && process.env.PAWLEGENDS_NIGHTLY === '1';
