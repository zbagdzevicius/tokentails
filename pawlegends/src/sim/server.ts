/**
 * Server entry of the sim: the only export the backend uses (pattern: catnip-heist/src/sim/server.ts).
 * `tools/vendor-sim.mjs` bundles this file and what it imports into backend/src/vendor/pawlegends-sim/.
 *
 * `verifyReplay` checks the record's structure and bounds before any simulation (work bound: ticks <= MAX_TICKS,
 * inputs <= MAX_INPUT_CHARS), re-simulates it and accepts it only when the match ends on exactly `ticks` with the
 * reported outcome and final hash. Pure and deterministic: no DOM, no Date, no randomness.
 */
import { DIFFICULTIES } from '../data/bots';
import { HERO_IDS } from '../data/heroes';
import { MAX_TICKS } from '../data/limits';
import { TRICK_IDS } from '../data/tricks';
import { MAX_INPUT_CHARS, MUTATORS, type ReplayRecord, type VerifyCode, type VerifyResult } from './api';
import { DecodeError } from './commands';
import { runReplay } from './replay';
import { SIM_VERSION } from './version';

export { SIM_VERSION, MAX_TICKS, MAX_INPUT_CHARS };
export type { ReplayRecord, VerifyResult, VerifyCode };

const HEX = '0123456789abcdef';
const HASH_LEN = 8;
const isHex8 = (s: string): boolean => s.length === HASH_LEN && s.split('').every((c) => HEX.includes(c));

const fail = (code: VerifyCode, message: string): VerifyResult => ({ ok: false, code, message });

/** Structural check only (no simulation). Null when the record is well-formed. */
export function checkReplayShape(r: unknown): VerifyResult | null {
  if (!r || typeof r !== 'object') return fail('PAWLEGENDS_REPLAY_INVALID', 'not an object');
  const x = r as Record<string, unknown>;
  if (x.v !== 1) return fail('PAWLEGENDS_REPLAY_INVALID', 'v must be 1');
  if (x.simVersion !== SIM_VERSION) return fail('PAWLEGENDS_SIM_VERSION', `simVersion ${String(x.simVersion)} is not ${SIM_VERSION}`);
  if (typeof x.seed !== 'number' || !Number.isInteger(x.seed) || x.seed < 0 || x.seed > 0xffffffff)
    return fail('PAWLEGENDS_REPLAY_INVALID', 'seed must be a uint32');
  if (typeof x.difficulty !== 'string' || !(DIFFICULTIES as readonly string[]).includes(x.difficulty))
    return fail('PAWLEGENDS_REPLAY_INVALID', 'unknown difficulty');
  if (typeof x.hero !== 'string' || !(HERO_IDS as readonly string[]).includes(x.hero)) return fail('PAWLEGENDS_REPLAY_INVALID', 'unknown hero');
  if (typeof x.trick !== 'string' || !(TRICK_IDS as readonly string[]).includes(x.trick)) return fail('PAWLEGENDS_REPLAY_INVALID', 'unknown trick');
  if (typeof x.ticks !== 'number' || !Number.isInteger(x.ticks) || x.ticks < 1) return fail('PAWLEGENDS_REPLAY_INVALID', 'ticks must be a positive integer');
  if (x.ticks > MAX_TICKS) return fail('PAWLEGENDS_TOO_LONG', `ticks over ${MAX_TICKS}`);
  if (typeof x.inputs !== 'string') return fail('PAWLEGENDS_REPLAY_INVALID', 'inputs must be a string');
  if (x.inputs.length > MAX_INPUT_CHARS) return fail('PAWLEGENDS_TOO_LONG', `inputs over ${MAX_INPUT_CHARS} characters`);
  if (x.outcome !== 'won' && x.outcome !== 'lost') return fail('PAWLEGENDS_REPLAY_INVALID', 'outcome must be won or lost');
  if (typeof x.finalHash !== 'string' || !isHex8(x.finalHash)) return fail('PAWLEGENDS_REPLAY_INVALID', 'finalHash must be 8 hex digits');
  // Sim v10: no field or 'none' (the only mutator in v10).
  if (x.mutator !== undefined && !(MUTATORS as readonly unknown[]).includes(x.mutator)) return fail('PAWLEGENDS_REPLAY_INVALID', "mutator must be 'none'");
  return null;
}

export function verifyReplay(record: unknown): VerifyResult {
  const bad = checkReplayShape(record);
  if (bad) return bad;
  const r = record as ReplayRecord;
  let run;
  try {
    run = runReplay(r);
  } catch (e) {
    if (e instanceof DecodeError) return fail('PAWLEGENDS_REPLAY_INVALID', `inputs: ${e.message}`);
    throw e;
  }
  const res = run.result;
  if (!res || res.ticks !== r.ticks) return fail('PAWLEGENDS_NOT_ENDED', 'the match does not end on the reported tick');
  if (res.outcome !== r.outcome) return fail('PAWLEGENDS_OUTCOME_MISMATCH', `re-sim outcome is ${res.outcome}`);
  if (res.finalHash !== r.finalHash) return fail('PAWLEGENDS_HASH_MISMATCH', 'final hash differs');
  return { ok: true, outcome: res.outcome, finalHash: res.finalHash, ticks: res.ticks, stats: res.stats, reason: res.reason };
}
