/** Party play test helpers (MULTIPLAYER.md §1): a party match driven by per-slot player-bot pilots. */
import type { Difficulty, PlayerProfile } from '../../src/data/bots';
import type { Command, HeroId, PartySeat, TrickId } from '../../src/sim/api';
import { createMatch, createPlayerBotFor, playerBotCommands, result, step, tickOf, type MatchHandle, type PlayerBot } from '../../src/sim/index';
import { fillPicksParty } from '../../src/sim/party';

export const SEAT_HEROES: readonly HeroId[] = ['clem', 'sage', 'gabe', 'brutus', 'pixel', 'aviete'];
export const SEAT_TRICKS: readonly TrickId[] = ['pounce', 'snack', 'hiss'];

/** Cat-side seats for `slots` (every human is on slot 0's side). */
export function seatsFor(seed: number, slots: readonly number[]): PartySeat[] {
  const cats: HeroId[] = ['clem', 'sage', 'gabe', 'meatball', 'duchess'];
  const out: PartySeat[] = [];
  for (let i = 0; i < slots.length; i++) out.push({ slot: slots[i], hero: cats[(seed + i * 2) % cats.length], trick: SEAT_TRICKS[(seed + i) % SEAT_TRICKS.length] });
  return out;
}

export function partyMatch(seed: number, slots: readonly number[], difficulty: Difficulty = 'normal'): MatchHandle {
  const seats = seatsFor(seed, slots);
  const { picks, tricks } = fillPicksParty(seed, seats);
  return createMatch({ seed, picks, tricks, difficulty, humans: slots });
}

/** Commands for every human slot of the tick about to be stepped, from `bots[slot]` (null = an idle human). */
export function pilotTick(m: MatchHandle, bots: readonly (PlayerBot | null)[]): { slot0: Command[]; others: Command[][] } {
  const out: Command[][] = [[], [], []];
  for (let s = 0; s < 3; s++) {
    const b = bots[s];
    if (b) out[s] = playerBotCommands(m, b);
  }
  return { slot0: out[0], others: out };
}

export function playParty(seed: number, slots: readonly number[], profiles: readonly (PlayerProfile | null)[], difficulty: Difficulty = 'normal', maxTicks = Infinity): MatchHandle {
  const m = partyMatch(seed, slots, difficulty);
  const bots = [0, 1, 2].map((s) => (profiles[s] ? createPlayerBotFor(m, profiles[s]!, s) : null));
  while (!result(m) && tickOf(m) < maxTicks) {
    const { slot0, others } = pilotTick(m, bots);
    step(m, slot0, others);
  }
  return m;
}
