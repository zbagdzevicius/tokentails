/**
 * Runs one synthetic-player episode through the real sim (headless) and records what a playtest
 * observer would: outcome, time, spots (and where), quit point, stars. Deterministic per
 * (level, persona, seed).
 */
import { NO_INPUT, type Input, type LevelDef, type SimState } from '../../src/types';
import { atCenter, tileOf } from '../../src/sim/grid';
import { initSim, stepSim } from '../../src/sim/sim';
import { decodeInputs, type InputLog } from '../../src/sim/replay';
import { runStars } from '../../src/ui/levels/progress';
import { Bot, type BotStats, type Stage } from './bot';
import { PERSONAS, type PersonaId } from './personas';
import { Rng } from './rng';
import { steerDir } from './nav';
import { isSoftLocked } from './softlock';

export type Outcome = 'win' | 'quit-spots' | 'quit-stuck' | 'timeout';

export interface SpotRecord {
  tick: number;
  x: number;
  y: number;
  cat: number;
  guard: string;
}

export interface EpisodeResult {
  levelId: string;
  persona: PersonaId;
  seed: number;
  outcome: Outcome;
  won: boolean;
  /** Ticks of the final attempt (what the game times and stars). */
  ticks: number;
  /** Total play time including retried attempts. */
  sessionTicks: number;
  /** Pause > Retry restarts used. */
  retries: number;
  parTicks: number;
  /** Spots over the whole session (all attempts). */
  spotted: number;
  /** Spots in the final attempt (what the clean star sees). */
  spottedFinal: number;
  coins: number;
  coinsTotal: number;
  /** Star mask (src/ui/levels/progress.ts runStars): 1 win, 2 all coins, 4 clean and quick. */
  stars: number;
  score: number;
  stage: Stage;
  spots: SpotRecord[];
  /** Where and why the player gave up (null for a win). */
  quit: { tick: number; x: number; y: number; stage: Stage; why: string } | null;
  /** The run ended in a state no play could finish (only a restart helps), e.g. a cat respawned behind doors nobody can open. */
  softLocked: boolean;
  /** Attempts that were soft-locked when retried or abandoned. */
  softLocks: number;
  reaction: number;
  knownTiles: number;
  stats: BotStats;
  hash: number;
}

export interface EpisodeOptions {
  /** Hard cap (ticks). Default: 4x par, at most 12 minutes. */
  maxTicks?: number;
  catIds?: [string, string];
  /** Called after every tick (debug traces). */
  onTick?: (s: SimState, bot: Bot, input: Input) => void;
}

const CATS: [string, string] = ['bob', 'oreo'];

export function runEpisode(level: LevelDef, personaId: PersonaId, seed: number, opts: EpisodeOptions = {}): EpisodeResult {
  const persona = PERSONAS[personaId];
  const rng = new Rng(seed * 7919 + personaId.length * 104729 + hashStr(level.id));
  const bot = new Bot(level, persona, rng.fork(1));
  const delay = bot.params.reaction;
  const maxTicks = opts.maxTicks ?? Math.min(level.meta.parTicks * 4, 12 * 60 * 30);
  const catIds = opts.catIds ?? CATS;
  let s = initSim(level, seed, catIds);
  // Ring of past states for the reaction delay.
  let hist: SimState[] = new Array(delay + 1).fill(s);
  const spots: SpotRecord[] = [];
  let outcome: Outcome = 'timeout';
  let quitWhy = '';
  let spottedTotal = 0;
  let attemptStart = 0;
  let retries = 0;
  let softLocks = 0;
  // `tick` is session time (it keeps running across retries); the sim tick restarts with each attempt.
  for (let tick = 0; tick < maxTicks; tick++) {
    const seen = hist[(tick - attemptStart) % (delay + 1)];
    bot.perceive(tick, seen);
    const q = bot.quitReason(tick);
    if (q) {
      outcome = q;
      quitWhy = bot.lastWhy;
      break;
    }
    if (retries < persona.maxRetries && bot.wantsRetry(tick)) {
      if (isSoftLocked(level, s)) softLocks++;
      retries++;
      s = initSim(level, seed, catIds);
      hist = new Array(delay + 1).fill(s);
      attemptStart = tick + 1;
      bot.retry(tick);
      continue;
    }
    const input = bot.act(s);
    s = stepSim(level, s, input);
    opts.onTick?.(s, bot, input);
    for (const e of s.events)
      if (e.type === 'SPOTTED' && e.tile) {
        spottedTotal++;
        spots.push({ tick, x: e.tile.x, y: e.tile.y, cat: e.cat ?? -1, guard: e.id ?? '' });
      }
    // hist[k % (d+1)] holds the state from d ticks before attempt tick k once filled.
    hist[(tick - attemptStart + 1) % (delay + 1)] = s;
    if (delay === 0) hist[0] = s;
    if (s.won) {
      outcome = 'win';
      break;
    }
  }
  if (!s.won && outcome === 'timeout') quitWhy = bot.lastWhy;
  const a = tileOf(s.cats[s.activeIndex].pos);
  const stars = runStars({ coins: s.coinsCollected, ticks: s.tick, spottedCount: s.spottedCount }, s.won, level);
  return {
    levelId: level.id,
    persona: personaId,
    seed,
    outcome,
    won: s.won,
    ticks: s.tick,
    sessionTicks: s.won ? attemptStart + s.tick : Math.max(attemptStart + s.tick, 0),
    parTicks: level.meta.parTicks,
    spotted: spottedTotal,
    spottedFinal: s.spottedCount,
    retries,
    coins: s.coinsCollected,
    coinsTotal: level.coins.length,
    stars,
    score: s.score,
    stage: bot.stageOf(s),
    spots,
    quit: s.won ? null : { tick: s.tick, x: a.x, y: a.y, stage: bot.stageOf(s), why: quitWhy },
    softLocked: !s.won && isSoftLocked(level, s),
    softLocks: softLocks + (!s.won && isSoftLocked(level, s) ? 1 : 0),
    reaction: delay,
    knownTiles: bot.knownTiles,
    stats: bot.stats,
    hash: s.hash,
  };
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

// ---------------------------------------------------------------------------------------------
// Route following (harness validation)
// ---------------------------------------------------------------------------------------------

/** One step of a timed route: walk to a tile centre (starting no earlier than `at`), or press a button at tick `at`. */
export type RouteStep = { kind: 'move'; at: number; x: number; y: number } | { kind: 'swap' | 'interact' | 'meow'; at: number };

/**
 * Turns a recorded input log (e.g. the solver's solution) into a route a bot can follow: tile
 * targets with departure ticks and button presses. It reads only where the active cat went, not the
 * inputs themselves.
 */
export function routeFromLog(level: LevelDef, log: InputLog): RouteStep[] {
  const inputs = decodeInputs(log.runs);
  let s = initSim(level, log.seed, log.catIds);
  const out: RouteStep[] = [];
  let open: { kind: 'move'; at: number; x: number; y: number } | null = null;
  for (let k = 0; k < inputs.length && !s.won; k++) {
    const inp = inputs[k];
    const tick = s.tick;
    if (inp.swap) out.push({ kind: 'swap', at: tick });
    if (inp.interact) out.push({ kind: 'interact', at: tick });
    if (inp.meow) out.push({ kind: 'meow', at: tick });
    if ((inp.dx !== 0 || inp.dy !== 0) && !open) {
      open = { kind: 'move', at: tick, x: -1, y: -1 };
      out.push(open);
    }
    s = stepSim(level, s, inp);
    const c = s.cats[s.activeIndex];
    if (open && (atCenter(c.pos) || s.won)) {
      // A win can come before the cat reaches a tile centre (EXIT_SLOP): the target is the exit tile
      // it is walking onto, so a follower steering there wins on the same tick.
      let t = tileOf(c.pos);
      if (s.won && !atCenter(c.pos) && !level.exit.tiles.some((e) => e.x === t.x && e.y === t.y)) {
        t = tileOf({ x: c.pos.x + c.facing.x * 8, y: c.pos.y + c.facing.y * 8 });
      }
      open.x = t.x;
      open.y = t.y;
      open = null;
    }
  }
  return out;
}

/**
 * Follows a timed route with the same steering a bot uses (centre-seeking, grid directions) and no
 * human slop. Used to check that the harness's execution layer reproduces a known-good run.
 */
export function followRoute(level: LevelDef, route: RouteStep[], seed: number, catIds: [string, string] = CATS, maxTicks = 20000): SimState {
  let s = initSim(level, seed, catIds);
  let k = 0;
  for (let n = 0; n < maxTicks && !s.won; n++) {
    let input: Input = NO_INPUT;
    while (k < route.length) {
      const st = route[k];
      if (st.at > s.tick) break;
      if (st.kind !== 'move') {
        input = { ...input, swap: input.swap || st.kind === 'swap', interact: input.interact || st.kind === 'interact', meow: input.meow || st.kind === 'meow' };
        k++;
        continue;
      }
      const cat = s.cats[s.activeIndex];
      if (cat.pos.x === st.x * 16 + 8 && cat.pos.y === st.y * 16 + 8) {
        k++;
        continue;
      }
      const [sx, sy] = steerDir(cat.pos, st.x, st.y);
      input = { ...input, dx: sx, dy: sy };
      break;
    }
    s = stepSim(level, s, input);
  }
  return s;
}
