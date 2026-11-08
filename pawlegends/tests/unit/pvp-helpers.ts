/** Sim v16 S-PvP test helpers (docs/plans/moba/V16.md §3.1): a PvP match with humans on both teams, flown by pilots. */
import type { Difficulty, PlayerProfile } from '../../src/data/bots';
import { HERO_IDS, HEROES } from '../../src/data/heroes';
import type { Command, HeroId, PartySeat, TrickId } from '../../src/sim/api';
import { createMatch, createPlayerBotFor, playerBotCommands, result, step, tickOf, type MatchHandle, type PlayerBot } from '../../src/sim/index';
import { fillPicksParty } from '../../src/sim/party';

export const CATS: readonly HeroId[] = HERO_IDS.filter((h) => HEROES[h].side === 'cat');
export const DOGS: readonly HeroId[] = HERO_IDS.filter((h) => HEROES[h].side === 'dog');
const TRICKS: readonly TrickId[] = ['pounce', 'snack', 'hiss', 'purrify'];

/**
 * Seats for `slots` (ascending, with 0 and 3): team 0 plays `side0`, team 1 the other species. Heroes are unique
 * within a team and drawn from the seed, so the same seed with the species swapped is the mirror line-up.
 */
export function pvpSeats(seed: number, slots: readonly number[], side0: 'cat' | 'dog' = 'cat'): PartySeat[] {
  const out: PartySeat[] = [];
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    const team = s < 3 ? 0 : 1;
    const pool = (team === 0) === (side0 === 'cat') ? CATS : DOGS;
    out.push({ slot: s, hero: pool[(seed + (s % 3) * 3) % pool.length], trick: TRICKS[(seed + s) % TRICKS.length] });
  }
  return out;
}

export function pvpMatch(seed: number, slots: readonly number[], side0: 'cat' | 'dog' = 'cat', fill: [Difficulty, Difficulty] = ['hard', 'hard']): MatchHandle {
  const seats = pvpSeats(seed, slots, side0);
  const { picks, tricks } = fillPicksParty(seed, seats);
  return createMatch({ seed, picks, tricks, difficulty: 'hard', humans: slots, mode: 'pvp', fillDifficulty: fill });
}

/** Commands of every slot for the tick about to be stepped, from `bots[slot]` (null = an idle seat or a bot). */
export function pvpTick(m: MatchHandle, bots: readonly (PlayerBot | null)[]): Command[][] {
  const out: Command[][] = [[], [], [], [], [], []];
  for (let s = 0; s < 6; s++) {
    const b = bots[s];
    if (b) out[s] = playerBotCommands(m, b);
  }
  return out;
}

export function playPvp(
  seed: number,
  slots: readonly number[],
  profiles: readonly (PlayerProfile | null)[],
  side0: 'cat' | 'dog' = 'cat',
  maxTicks = Infinity,
  fill: [Difficulty, Difficulty] = ['hard', 'hard'],
): MatchHandle {
  const m = pvpMatch(seed, slots, side0, fill);
  const bots = [0, 1, 2, 3, 4, 5].map((s) => (slots.includes(s) && profiles[s] ? createPlayerBotFor(m, profiles[s]!, s) : null));
  while (!result(m) && tickOf(m) < maxTicks) {
    const out = pvpTick(m, bots);
    step(m, out[0], out);
  }
  return m;
}
