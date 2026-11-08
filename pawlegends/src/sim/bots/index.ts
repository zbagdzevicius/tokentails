/**
 * Bots inside the sim (POC.md §4.3 step 2, §7.2): slots 1..5 think every TIMELINE.botThinkEvery ticks, staggered
 * by slot, and their commands go through the same quantise-and-order path as the human's. The match difficulty
 * sets the enemy (Woof) bots; the human's allies play at BOT_TEAMS.allies (data/bots.ts).
 *
 * Outside player-bots (`createPlayerBot`) drive slot 0 in headless runs and tests: they keep their memory and RNG
 * outside the world and return commands for the caller to pass to `step`, so a match they play records and
 * replays like a human one.
 */
import { BOTS, BOT_TEAMS, FEEDER, PARKED, ROOKIE_ALLIES, type BotParams, type Difficulty, type PlayerProfile } from '../../data/bots';
import { TIMELINE } from '../../data/timeline';
import { HUMAN_SLOT, Op, PVP_LEAD1, SLOT_COUNT, teamOfSlot, type Command } from '../api';
import { quantize } from '../commands';
import { Rng } from '../rng';
import type { MatchHandle } from '../state';
import { G, RANGE, TALENT_TIERS } from '../world';
import { botTalentChoice, botTalentMode, unlockedTiers } from '../heroes/talents';
import { applyOrder } from '../units/hero';
import { think } from './brain';
import { createMem, worldMem, type BotMem } from './mem';
import { noviceThink } from './novice';
import { stepLaneSwap } from './orders';
import { createPingerMem, pingerPing, type PingerMem } from './pinger';
import { naiveThink } from './naive';
import { isHumanSlot } from '../humans';

export { pushLane } from './brain';
export { applyPing, laneRole, orderOf } from './orders';

/**
 * The human's allies: BOT_TEAMS.allies, except that they group when the enemy team does (the enemy difficulty's
 * groupAt), so they never leave the lanes to an enemy that is still spread out in them.
 */
const ALLIES: Readonly<Record<Difficulty, Readonly<BotParams>>> = Object.freeze({
  // Rookie (v4): the allies play at Easy (they carry, peel and leave kills to the human, bots/brain.ts), so the
  // human's own play decides the match: an idle human loses most of them.
  rookie: Object.freeze({ ...BOTS.easy, ...ROOKIE_ALLIES, groupAt: BOTS.rookie.groupAt }),
  easy: Object.freeze({ ...BOTS[BOT_TEAMS.allies], groupAt: BOTS.easy.groupAt }),
  normal: Object.freeze({ ...BOTS[BOT_TEAMS.allies], groupAt: BOTS.normal.groupAt }),
  // Sim v8 (playtest round 2: "Hard tests how much you can carry"): Hard is a mirror, the allies play at Hard too.
  hard: BOTS.hard,
});

/** Default fill-bot profile of each PvP team (MatchConfig.fillDifficulty omitted). */
export const PVP_FILL_DEFAULT: readonly [Difficulty, Difficulty] = Object.freeze(['hard', 'hard'] as [Difficulty, Difficulty]);

/**
 * Difficulty parameters of the bot in `slot`. Sim v16 PvP: both teams' bots are a human's allies, so each plays the
 * ALLIES profile of its own team's `fillDifficulty` (they obey their lead's pings like co-op allies).
 */
export function botParams(m: MatchHandle, slot: number): BotParams {
  if (m.pvp) return ALLIES[(m.config.fillDifficulty ?? PVP_FILL_DEFAULT)[teamOfSlot(slot)]];
  return teamOfSlot(slot) === teamOfSlot(HUMAN_SLOT) ? ALLIES[m.config.difficulty] : BOTS[m.config.difficulty];
}

const thinksNow = (tick: number, slot: number): boolean => (tick + slot) % TIMELINE.botThinkEvery === 0;

/** Step 2: the in-sim bots think and act. */
export function stepBots(m: MatchHandle): void {
  const w = m.world;
  // Sim v10 (GAPS B1): the lane swap follows the human every tick.
  stepLaneSwap(w);
  if (w.globals[G.BotsOff] !== 0) return;
  const tick = w.globals[G.Tick];
  let mem: BotMem | null = null;
  for (let slot = RANGE.heroes; slot < RANGE.minions; slot++) {
    // Party play: a human's slot (slot 0, and slots 1 and 2 in a party) is never driven from inside the sim.
    if (isHumanSlot(w, slot) || !thinksNow(tick, slot)) continue;
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
  /** Sim v10: the `pinger` profile's ping memory. */
  readonly pings: PingerMem;
}

export function createPlayerBot(m: MatchHandle, profile: PlayerProfile): PlayerBot {
  return createPlayerBotFor(m, profile, HUMAN_SLOT);
}

/**
 * Party play (MULTIPLAYER.md §1.1, D5): an outside bot for human slot `slot` (0, 1 or 2), the relay's pilot. Its RNG
 * forks from the root seed only: `player-bot:<profile>` for slot 0 (unchanged), `player-bot:<profile>:s<slot>`
 * otherwise. Every pilot keeps its own memory and its own SelfOrder (`pings.mine`), so it never writes hashed bot
 * state (B1). The `pinger` profile is slot 0's only (pings come from slot 0).
 */
export function createPlayerBotFor(m: MatchHandle, profile: PlayerProfile, slot: number): PlayerBot {
  // Sim v16 PvP: a pilot may drive any of the six slots, and the pinger drives either lead (0 or 3).
  const max = m.pvp ? SLOT_COUNT : 3;
  if (!Number.isInteger(slot) || slot < 0 || slot >= max) throw new RangeError(`player-bot slot ${String(slot)} is not 0 to ${max - 1}`);
  if (profile === 'pinger' && slot !== HUMAN_SLOT && !(m.pvp && slot === PVP_LEAD1)) throw new RangeError('the pinger profile drives a lead slot only');
  const name = profile === 'pinger' ? 'normal' : profile;
  const fork = slot === HUMAN_SLOT ? `player-bot:${name}` : `player-bot:${name}:s${slot}`;
  return { profile, slot, mem: createMem(), rng: new Rng(m.config.seed >>> 0).fork(fork), pings: createPingerMem() };
}

/**
 * The player-bot's commands for the tick about to be stepped (empty most ticks). Call it right before
 * `step(match, commands)`.
 */
export function playerBotCommands(m: MatchHandle, bot: PlayerBot): Command[] {
  const w = m.world;
  if (bot.profile === 'idle' || m.ended || !thinksNow(w.globals[G.Tick], bot.slot)) return [];
  // Slot 0 gets no automatic talent: choose like the in-sim bots (sim v10: the seeded rule, or the headless mode).
  if (w.alive[bot.slot] === 1) {
    for (let t = 0; t < unlockedTiers(w, bot.slot); t++) {
      if (w.talents[bot.slot * TALENT_TIERS + t] < 0) {
        return [{ op: Op.Talent, tier: t as 0 | 1 | 2, choice: botTalentChoice(m.config.seed, bot.slot, t, botTalentMode(m)) }];
      }
    }
  }
  if (bot.profile === 'parked') {
    // One move at PARKED.at, then nothing (it keeps standing where it got to).
    const t = w.globals[G.Tick];
    return t >= PARKED.at && t < PARKED.at + TIMELINE.botThinkEvery && w.alive[bot.slot] === 1 ? [{ op: Op.Move, x: PARKED.x, y: PARKED.y }] : [];
  }
  const cmd =
    bot.profile === 'novice'
      ? noviceThink(m, bot.slot, bot.mem, bot.rng)
      : bot.profile === 'naive' || bot.profile === 'feeder'
        ? naiveThink(m, bot.slot, bot.mem, bot.rng, bot.profile === 'feeder' ? FEEDER : undefined)
        : think(m, bot.slot, BOTS[bot.profile === 'pinger' ? 'normal' : bot.profile], bot.mem, bot.rng, bot.pings.mine);
  // The pinger plays like `normal` and may ping in the same tick (a ping shares its tick with one other command).
  const ping = bot.profile === 'pinger' ? pingerPing(m, bot.pings, bot.slot) : null;
  const out: Command[] = [];
  if (ping) out.push(ping);
  if (cmd) out.push(cmd);
  return out;
}
