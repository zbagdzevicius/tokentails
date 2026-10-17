/**
 * Bots inside the sim (POC.md §4.3 step 2, §7.2): slots 1..5 think every TIMELINE.botThinkEvery ticks, staggered
 * by slot, and their commands go through the same quantise-and-order path as the human's. The match difficulty
 * sets the enemy (Woof) bots; the human's allies play at BOT_TEAMS.allies (data/bots.ts).
 *
 * Outside player-bots (`createPlayerBot`) drive slot 0 in headless runs and tests: they keep their memory and RNG
 * outside the world and return commands for the caller to pass to `step`, so a match they play records and
 * replays like a human one.
 */
import { BOTS, BOT_TEAMS, type BotParams, type Difficulty, type PlayerProfile } from '../../data/bots';
import { TIMELINE } from '../../data/timeline';
import { HUMAN_SLOT, Op, teamOfSlot, type Command } from '../api';
import { quantize } from '../commands';
import { Rng } from '../rng';
import type { MatchHandle } from '../state';
import { G, RANGE, TALENT_TIERS } from '../world';
import { unlockedTiers } from '../heroes/talents';
import { applyOrder } from '../units/hero';
import { think } from './brain';
import { createMem, worldMem, type BotMem } from './mem';
import { noviceThink } from './novice';

export { pushLane } from './brain';

/**
 * The human's allies: BOT_TEAMS.allies, except that they group when the enemy team does (the enemy difficulty's
 * groupAt), so they never leave the lanes to an enemy that is still spread out in them.
 */
const ALLIES: Readonly<Record<Difficulty, Readonly<BotParams>>> = Object.freeze({
  easy: Object.freeze({ ...BOTS[BOT_TEAMS.allies], groupAt: BOTS.easy.groupAt }),
  normal: Object.freeze({ ...BOTS[BOT_TEAMS.allies], groupAt: BOTS.normal.groupAt }),
});

/** Difficulty parameters of the bot in `slot`. */
export function botParams(m: MatchHandle, slot: number): BotParams {
  return teamOfSlot(slot) === teamOfSlot(HUMAN_SLOT) ? ALLIES[m.config.difficulty] : BOTS[m.config.difficulty];
}

const thinksNow = (tick: number, slot: number): boolean => (tick + slot) % TIMELINE.botThinkEvery === 0;

/** Step 2: the in-sim bots think and act. */
export function stepBots(m: MatchHandle): void {
  const w = m.world;
  if (w.globals[G.BotsOff] !== 0) return;
  const tick = w.globals[G.Tick];
  let mem: BotMem | null = null;
  for (let slot = RANGE.heroes; slot < RANGE.minions; slot++) {
    if (slot === HUMAN_SLOT || !thinksNow(tick, slot)) continue;
    mem ??= worldMem(w);
    const cmd = think(m, slot, botParams(m, slot), mem, w.rng);
    if (cmd) applyOrder(m, slot, quantize(cmd));
  }
}

/** An outside bot for slot 0 (headless runs, tests). */
export interface PlayerBot {
  readonly profile: PlayerProfile;
  readonly slot: number;
  readonly mem: BotMem;
  readonly rng: Rng;
}

export function createPlayerBot(m: MatchHandle, profile: PlayerProfile): PlayerBot {
  return { profile, slot: HUMAN_SLOT, mem: createMem(), rng: new Rng(m.config.seed >>> 0).fork(`player-bot:${profile}`) };
}

/**
 * The player-bot's commands for the tick about to be stepped (empty most ticks). Call it right before
 * `step(match, commands)`.
 */
export function playerBotCommands(m: MatchHandle, bot: PlayerBot): Command[] {
  const w = m.world;
  if (bot.profile === 'idle' || m.ended || !thinksNow(w.globals[G.Tick], bot.slot)) return [];
  // Slot 0 gets no automatic talent: take the first option, like the in-sim bots.
  if (w.alive[bot.slot] === 1) {
    for (let t = 0; t < unlockedTiers(w, bot.slot); t++) {
      if (w.talents[bot.slot * TALENT_TIERS + t] < 0) return [{ op: Op.Talent, tier: t as 0 | 1 | 2, choice: 0 }];
    }
  }
  const cmd = bot.profile === 'novice' ? noviceThink(m, bot.slot, bot.mem, bot.rng) : think(m, bot.slot, BOTS[bot.profile], bot.mem, bot.rng);
  return cmd ? [cmd] : [];
}
