/**
 * Replay record → result (pattern: catnip-heist/src/sim/replay.ts). `runReplay` rebuilds the match from the record
 * (bot picks from the seed), feeds the decoded command stream tick by tick and returns the result and the hash trail.
 */
import { MAX_TICKS } from '../data/limits';
import type { MatchResult, ReplayRecord, TimedCommand } from './api';
import { decodeStream, fromBase64 } from './commands';
import { createMatch, fillPicks, hashTrail, result, step, tickOf, type MatchHandle } from './index';
import { bindMap, mapIndex } from './map/runtime';

export interface ReplayRun {
  result: MatchResult | null;
  /** hash() every 30 ticks, as the live match recorded it. */
  trail: number[];
  ticks: number;
}

/** Decode `record.inputs`; throws DecodeError on a malformed stream or a command at or after `ticks` (trailing input). */
export function replayCommands(record: Pick<ReplayRecord, 'inputs' | 'ticks' | 'map'>): TimedCommand[] {
  // Sim v19: decoded against the record's map (its bounds and limits).
  bindMap(mapIndex(record.map));
  return decodeStream(fromBase64(record.inputs), Math.min(record.ticks, MAX_TICKS) - 1);
}

/** Re-simulate a replay. Stops at the match end or at `record.ticks` (never beyond MAX_TICKS). */
export function runReplay(record: Pick<ReplayRecord, 'seed' | 'difficulty' | 'hero' | 'trick' | 'inputs' | 'ticks' | 'map' | 'mutator'>): ReplayRun {
  const commands = replayCommands(record);
  const { picks, tricks } = fillPicks(record.seed, record.hero, record.trick, record.map);
  const match: MatchHandle = createMatch({ seed: record.seed, picks, tricks, difficulty: record.difficulty, ...(record.map === undefined ? {} : { map: record.map }), ...(record.mutator === undefined || record.mutator === 'none' ? {} : { mutator: record.mutator }) });
  const limit = Math.min(record.ticks, MAX_TICKS);
  let ci = 0;
  const batch: TimedCommand['cmd'][] = [];
  for (let t = 0; t < limit && result(match) === null; t++) {
    batch.length = 0;
    while (ci < commands.length && commands[ci].tick === t) batch.push(commands[ci++].cmd);
    step(match, batch);
  }
  return { result: result(match), trail: hashTrail(match).slice(), ticks: tickOf(match) };
}
