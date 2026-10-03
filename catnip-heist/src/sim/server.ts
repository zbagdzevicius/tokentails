/**
 * Server entry of the sim (plan G2 layer 2, F6): what `POST /user/catbassadors/live` needs to verify
 * a Heist run by replaying it. `scripts/vendor-sim.mjs` bundles this file (and only what it imports)
 * into `backend/src/vendor/heist-sim/`; CI fails when the vendored copy drifts from this source.
 *
 * Everything here is pure and deterministic. No DOM, no Date, no randomness, nothing from the UI.
 *
 * `verifyRun` replays an input log from tick 0 and accepts it only when it is a won campaign run
 * that ends on the winning tick:
 * - structure: known level, current `SIM_VERSION`, the campaign seed, two different known cat ids,
 *   integer runs `[dx, dy, flags, count]` with `dx, dy` in {-1, 0, 1}, flags 0..7, `count >= 1`,
 *   counts summing exactly to `ticks`;
 * - work bound: `ticks` at most the level's `tickCap` (`min(4 x parTicks, 18000)`), checked before
 *   any simulation, and the replay stops at that cap whatever the log says;
 * - outcome: won, and won on the last tick (`HEIST_TRAILING_INPUT` when input follows the win).
 *
 * Unlike `replay()` it keeps no per-tick hash list, so its memory use does not grow with the log.
 */
import { cats as manifestCats } from '../../public/assets/manifest.json';
import { LEVEL_IDS, getLevel } from '../levels';
import { SIM_VERSION, TICK_HZ, type LevelDef } from '../types';
import { inputFromRun, type InputRun } from './replay';
import { computeStars } from './score';
import { initSim, stepSim } from './sim';

export { SIM_VERSION, TICK_HZ };
export { computeStars, starCount, STAR_ALL, STAR_CLEAN, STAR_COINS, STAR_RULES, STAR_WIN } from './score';
export type { InputRun };

/** The only seed campaign runs use (embed mode forces it, plan G2 layer 1). */
export const CAMPAIGN_SEED = 1;

/** Absolute replay bound: 10 minutes at 30 Hz. Same as `HEIST_MAX_TICKS` in shared/caps.ts. */
export const MAX_REPLAY_TICKS = TICK_HZ * 600;

/** Points for freeing the shelter cat; each catnip coin is worth 10 (`computeScore` in sim.ts). */
const RESCUE_POINTS = 50;
const COIN_POINTS = 10;

export interface HeistLevelInfo {
  id: string;
  /** 0-based campaign index: the slot of `heistScore` / `heistStars` on a user. */
  index: number;
  /** Display name of the level. */
  name: string;
  parTicks: number;
  coins: number;
  /** Highest score a won run can reach: every coin, the rescue, no time penalty. */
  maxScore: number;
  /** Most ticks a replay of this level may have: `min(4 x parTicks, MAX_REPLAY_TICKS)`. */
  tickCap: number;
}

function levelInfo(level: LevelDef, index: number): HeistLevelInfo {
  const coins = level.coins.length;
  return Object.freeze({
    id: level.id,
    index,
    name: level.meta.name ?? level.meta.title,
    parTicks: level.meta.parTicks,
    coins,
    maxScore: coins * COIN_POINTS + RESCUE_POINTS,
    tickCap: Math.min(4 * level.meta.parTicks, MAX_REPLAY_TICKS),
  });
}

/** The campaign levels in play order. */
export const LEVELS: readonly HeistLevelInfo[] = Object.freeze(LEVEL_IDS.map((id, index) => levelInfo(getLevel(id), index)));

/** Ids of the cats the crew picker offers (`public/assets/manifest.json`). */
export const CAT_IDS: readonly string[] = Object.freeze(manifestCats.map((cat) => cat.id));

export type VerifyCode = 'HEIST_REPLAY_INVALID' | 'HEIST_NOT_WON' | 'HEIST_TRAILING_INPUT' | 'HEIST_SIM_VERSION';

/** The log fields `verifyRun` reads. Extra fields (finalHash, score, runId...) are ignored. */
export interface RunLogInput {
  levelId: string;
  simVersion: number;
  seed: number;
  catIds: readonly string[];
  ticks: number;
  runs: readonly (readonly number[])[];
}

export interface VerifiedRun {
  ok: true;
  levelId: string;
  levelIndex: number;
  ticks: number;
  /** Server score of the run (the sim's own `score` on the winning tick). */
  score: number;
  /** STAR_* bitmask this run earns. */
  stars: number;
  coins: number;
  spottedCount: number;
  finalHash: number;
  /** The run with adjacent identical inputs merged (what `canonicalLogKey` hashes). */
  runs: InputRun[];
}

export interface RejectedRun {
  ok: false;
  code: VerifyCode;
  reason: string;
}

export type VerifyResult = VerifiedRun | RejectedRun;

const reject = (code: VerifyCode, reason: string): RejectedRun => ({ ok: false, code, reason });
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const AXIS = [-1, 0, 1];
const MAX_FLAGS = 7;

/** The level of `levelId`, or undefined. */
export function levelById(levelId: unknown): HeistLevelInfo | undefined {
  return LEVELS.find((level) => level.id === levelId);
}

/**
 * Merges adjacent runs with the same `[dx, dy, flags]`. Two logs that press the same keys on the same
 * ticks have the same canonical runs, however the recorder split them. Assumes valid runs.
 */
export function canonicalRuns(runs: readonly (readonly number[])[]): InputRun[] {
  const out: InputRun[] = [];
  for (const r of runs) {
    const last = out[out.length - 1];
    if (last && last[0] === r[0] && last[1] === r[1] && last[2] === r[2]) last[3] += r[3];
    else out.push([r[0], r[1], r[2], r[3]]);
  }
  return out;
}

/**
 * Stable text of a run for the backend's `replayDigest` (it hashes this string). Covers what the
 * sim reads: sim version, level, seed, tick count and the canonical inputs. The cat ids are left
 * out on purpose: they do not change the simulation, so swapping the crew must not turn one log
 * into a "new" run.
 */
export function canonicalLogKey(log: Pick<RunLogInput, 'levelId' | 'simVersion' | 'seed' | 'ticks' | 'runs'>): string {
  const runs = canonicalRuns(log.runs)
    .map((r) => r.join(','))
    .join(';');
  return `heist|v${log.simVersion}|${log.levelId}|s${log.seed}|t${log.ticks}|${runs}`;
}

/** Structural checks only (no simulation). Returns the level, or the rejection. */
export function checkRunLog(value: unknown): HeistLevelInfo | RejectedRun {
  if (!value || typeof value !== 'object') return reject('HEIST_REPLAY_INVALID', 'log is not an object');
  const log = value as Partial<Record<keyof RunLogInput, unknown>>;
  const level = levelById(log.levelId);
  if (!level) return reject('HEIST_REPLAY_INVALID', 'unknown level');
  if (log.simVersion !== SIM_VERSION) return reject('HEIST_SIM_VERSION', `sim version must be ${SIM_VERSION}`);
  if (log.seed !== CAMPAIGN_SEED) return reject('HEIST_REPLAY_INVALID', `seed must be ${CAMPAIGN_SEED}`);
  const catIds = log.catIds;
  if (
    !Array.isArray(catIds) ||
    catIds.length !== 2 ||
    !catIds.every((id) => typeof id === 'string' && CAT_IDS.includes(id)) ||
    catIds[0] === catIds[1]
  ) {
    return reject('HEIST_REPLAY_INVALID', 'catIds must be two different known cats');
  }
  const ticks = log.ticks;
  if (!isInt(ticks) || ticks < 1) return reject('HEIST_REPLAY_INVALID', 'ticks must be a positive integer');
  if (ticks > level.tickCap) return reject('HEIST_REPLAY_INVALID', `ticks over the ${level.tickCap} cap of ${level.id}`);
  const runs = log.runs;
  if (!Array.isArray(runs) || runs.length < 1 || runs.length > ticks) return reject('HEIST_REPLAY_INVALID', 'bad run list');
  let total = 0;
  for (const run of runs as unknown[]) {
    if (!Array.isArray(run) || run.length !== 4) return reject('HEIST_REPLAY_INVALID', 'a run is not [dx, dy, flags, count]');
    const [dx, dy, flags, count] = run as unknown[];
    if (!AXIS.includes(dx as number) || !AXIS.includes(dy as number)) return reject('HEIST_REPLAY_INVALID', 'dx and dy must be -1, 0 or 1');
    if (!isInt(flags) || flags < 0 || flags > MAX_FLAGS) return reject('HEIST_REPLAY_INVALID', 'flags must be 0 to 7');
    if (!isInt(count) || count < 1) return reject('HEIST_REPLAY_INVALID', 'counts must be positive integers');
    total += count;
    if (total > ticks) return reject('HEIST_REPLAY_INVALID', 'run counts exceed ticks');
  }
  if (total !== ticks) return reject('HEIST_REPLAY_INVALID', 'run counts must sum to ticks');
  return level;
}

/**
 * Replays `value` and returns the server's view of the run, or why it is refused. Never throws on
 * bad input; a sim error on a well-formed log is reported as `HEIST_REPLAY_INVALID`.
 */
export function verifyRun(value: unknown): VerifyResult {
  const checked = checkRunLog(value);
  if ('ok' in checked) return checked;
  const info = checked;
  const log = value as RunLogInput;
  const level = getLevel(info.id);
  try {
    let s = initSim(level, CAMPAIGN_SEED, [log.catIds[0], log.catIds[1]]);
    let n = 0;
    for (const run of log.runs) {
      const input = inputFromRun(run as InputRun);
      for (let k = 0; k < run[3]; k++) {
        if (s.won) return reject('HEIST_TRAILING_INPUT', `input continues after the win on tick ${s.tick}`);
        // Belt and braces: the structural check already bounds ticks by the cap.
        if (n++ >= info.tickCap) return reject('HEIST_REPLAY_INVALID', 'tick cap reached');
        s = stepSim(level, s, input);
      }
    }
    if (!s.won) return reject('HEIST_NOT_WON', 'the run does not win the level');
    return {
      ok: true,
      levelId: info.id,
      levelIndex: info.index,
      ticks: s.tick,
      score: s.score,
      stars: computeStars({ coins: s.coinsCollected, ticks: s.tick, spottedCount: s.spottedCount }, true, level),
      coins: s.coinsCollected,
      spottedCount: s.spottedCount,
      finalHash: s.hash,
      runs: canonicalRuns(log.runs),
    };
  } catch (error) {
    return reject('HEIST_REPLAY_INVALID', `replay failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
