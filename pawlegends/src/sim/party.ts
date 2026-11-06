/**
 * Party play (docs/plans/moba/MULTIPLAYER.md §1): co-op against bots, 1 to 3 humans on slot 0's team.
 *
 * MERGE NOTE (§1): sim v12 shipped without party code, so party play rides SIM_VERSION 13 (v12 is frozen). Party code
 * leaves single-player output byte-identical to v12 (tests/unit/party-identity.test.ts). PARTY_SINCE is the first
 * SIM_VERSION that ships to production with party code. The dogs branch (feat/pawlegends-dogs) also targets v13 and
 * merges on top into the same version.
 *
 * Determinism rule (§1.4): a client's sim only ever applies the decoded TURN bytes, its own commands included.
 * A human slot is a command source like slot 0: `step(m, slot0, others)`. A pilot (the relay's bot for a dropped
 * human) is `createPlayerBotFor` and its output is ordinary stream commands for that slot.
 */
import { HERO_IDS } from '../data/heroes';
import { DIFFICULTIES } from '../data/bots';
import { MAX_INPUT_CHARS, MAX_TICKS } from '../data/limits';
import { TRICK_IDS } from '../data/tricks';
import { MUTATORS, type Command, type HeroId, type MatchResult, type PartyReplayRecord, type PartySeat, type TimedCommand, type TrickId, type VerifyCode, type VerifyResult } from './api';
import { DecodeError, decodeStream, encodeStream, fromBase64, toBase64 } from './commands';
import { isHumanSlot } from './humans';
import { createMatch, fillPicks, hashTrail, result, step, tickOf } from './index';
import type { MatchHandle } from './state';
import { SIM_VERSION } from './version';

export { applyPartyInputs, createPartyState, validateHumans } from './party-inputs';
export { createPlayerBotFor } from './bots';
export { humanMask, isHumanSlot } from './humans';

/** The first SIM_VERSION with party code (see the merge warning above). The backend refuses older party results. */
export const PARTY_SINCE = 13; // lint-sim: allow (a version number, not tuning)

/** Is hero slot `slot` a human's in match `m`? Slot 0 always; slots 1 and 2 only in a party. */
export const isHuman = (m: MatchHandle, slot: number): boolean => isHumanSlot(m.world, slot);

/**
 * Picks for a party: the bots exactly as `fillPicks(seed, humans[0].hero, humans[0].trick)` draws them, then each
 * human seat overwrites its slot. Invariant: `fillPicksParty(s, [h0])` deep-equals `fillPicks(s, h0.hero, h0.trick)`.
 */
export function fillPicksParty(seed: number, humans: readonly PartySeat[]): { picks: HeroId[]; tricks: TrickId[] } {
  const lead = humans[0];
  const out = fillPicks(seed, lead.hero, lead.trick);
  for (let i = 1; i < humans.length; i++) {
    out.picks[humans[i].slot] = humans[i].hero;
    out.tricks[humans[i].slot] = humans[i].trick;
  }
  return out;
}

/** The post-gate command log of human slot `slot` (slot 0: the match log). */
export function partyLog(m: MatchHandle, slot: number): readonly TimedCommand[] {
  if (slot === 0) return m.log;
  return m.party?.logs[slot] ?? [];
}

/** Party replay of an ended party match, or null while it runs. */
export function partyReplayRecord(m: MatchHandle): PartyReplayRecord | null {
  if (!m.ended) return null;
  const slots = m.config.humans ?? [0];
  const humans: PartySeat[] = [];
  const inputs: string[] = [];
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    humans.push({ slot: s, hero: m.config.picks[s], trick: m.config.tricks[s] });
    inputs.push(toBase64(encodeStream(partyLog(m, s))));
  }
  return {
    v: 2,
    simVersion: SIM_VERSION,
    seed: m.config.seed >>> 0,
    difficulty: m.config.difficulty,
    humans,
    picks: m.config.picks.slice(),
    tricks: m.config.tricks.slice(),
    ticks: m.ended.ticks,
    inputs,
    outcome: m.ended.outcome,
    finalHash: m.ended.finalHash,
    mutator: 'none',
  };
}

export interface PartyReplayRun {
  result: MatchResult | null;
  trail: number[];
  ticks: number;
}

/** Re-simulate a party replay (shape already checked). Throws DecodeError on a malformed stream. */
export function runPartyReplay(r: Pick<PartyReplayRecord, 'seed' | 'difficulty' | 'humans' | 'ticks' | 'inputs'>): PartyReplayRun {
  const limit = Math.min(r.ticks, MAX_TICKS);
  const streams: TimedCommand[][] = [];
  for (let i = 0; i < r.inputs.length; i++) streams.push(decodeStream(fromBase64(r.inputs[i]), limit - 1));
  const { picks, tricks } = fillPicksParty(r.seed, r.humans);
  const humans: number[] = [];
  for (let i = 0; i < r.humans.length; i++) humans.push(r.humans[i].slot);
  const m = createMatch({ seed: r.seed, picks, tricks, difficulty: r.difficulty, humans });
  const at: number[] = [];
  for (let i = 0; i < streams.length; i++) at.push(0);
  const slot0: Command[] = [];
  const others: Command[][] = [[], [], []];
  for (let t = 0; t < limit && result(m) === null; t++) {
    slot0.length = 0;
    others[1].length = 0;
    others[2].length = 0;
    for (let i = 0; i < streams.length; i++) {
      const s = r.humans[i].slot;
      const list = s === 0 ? slot0 : others[s];
      const st = streams[i];
      while (at[i] < st.length && st[at[i]].tick === t) list.push(st[at[i]++].cmd);
    }
    step(m, slot0, others);
  }
  return { result: result(m), trail: hashTrail(m).slice(), ticks: tickOf(m) };
}

const HEX = '0123456789abcdef';
const isHex8 = (s: unknown): boolean => typeof s === 'string' && s.length === 8 && s.split('').every((c) => HEX.includes(c));
const fail = (code: VerifyCode, message: string): VerifyResult => ({ ok: false, code, message });

/** Structural check of a PartyReplayRecord (no simulation). Null when well-formed. */
export function checkPartyShape(r: unknown): VerifyResult | null {
  if (!r || typeof r !== 'object') return fail('PAWLEGENDS_REPLAY_INVALID', 'not an object');
  const x = r as Record<string, unknown>;
  if (x.v !== 2) return fail('PAWLEGENDS_REPLAY_INVALID', 'v must be 2');
  if (typeof x.simVersion !== 'number' || x.simVersion !== SIM_VERSION) return fail('PAWLEGENDS_SIM_VERSION', `simVersion ${String(x.simVersion)} is not ${SIM_VERSION}`);
  if (x.simVersion < PARTY_SINCE) return fail('PAWLEGENDS_SIM_VERSION', `party play needs simVersion ${PARTY_SINCE}`);
  if (typeof x.seed !== 'number' || !Number.isInteger(x.seed) || x.seed < 0 || x.seed > 0xffffffff) return fail('PAWLEGENDS_REPLAY_INVALID', 'seed must be a uint32');
  if (typeof x.difficulty !== 'string' || !(DIFFICULTIES as readonly string[]).includes(x.difficulty)) return fail('PAWLEGENDS_REPLAY_INVALID', 'unknown difficulty');
  if (!Array.isArray(x.humans) || x.humans.length < 1 || x.humans.length > 3) return fail('PAWLEGENDS_REPLAY_INVALID', 'humans must list 1 to 3 seats');
  let last = -1;
  for (let i = 0; i < x.humans.length; i++) {
    const h = x.humans[i] as Record<string, unknown> | null;
    if (!h || typeof h !== 'object') return fail('PAWLEGENDS_REPLAY_INVALID', 'bad seat');
    const s = h.slot;
    if (typeof s !== 'number' || !Number.isInteger(s) || s < 0 || s > 2) return fail('PAWLEGENDS_REPLAY_INVALID', 'seat slot must be 0, 1 or 2');
    if (i === 0 && s !== 0) return fail('PAWLEGENDS_REPLAY_INVALID', 'the first seat must be slot 0');
    if (s <= last) return fail('PAWLEGENDS_REPLAY_INVALID', 'seat slots must be ascending and unique');
    last = s;
    if (typeof h.hero !== 'string' || !(HERO_IDS as readonly string[]).includes(h.hero)) return fail('PAWLEGENDS_REPLAY_INVALID', 'unknown hero');
    if (typeof h.trick !== 'string' || !(TRICK_IDS as readonly string[]).includes(h.trick)) return fail('PAWLEGENDS_REPLAY_INVALID', 'unknown trick');
  }
  if (!Array.isArray(x.picks) || x.picks.length !== 6 || !Array.isArray(x.tricks) || x.tricks.length !== 6) return fail('PAWLEGENDS_REPLAY_INVALID', 'picks and tricks need 6 slots');
  if (typeof x.ticks !== 'number' || !Number.isInteger(x.ticks) || x.ticks < 1) return fail('PAWLEGENDS_REPLAY_INVALID', 'ticks must be a positive integer');
  if (x.ticks > MAX_TICKS) return fail('PAWLEGENDS_TOO_LONG', `ticks over ${MAX_TICKS}`);
  if (!Array.isArray(x.inputs) || x.inputs.length !== x.humans.length) return fail('PAWLEGENDS_REPLAY_INVALID', 'one input stream per seat');
  for (let i = 0; i < x.inputs.length; i++) {
    if (typeof x.inputs[i] !== 'string') return fail('PAWLEGENDS_REPLAY_INVALID', 'inputs must be strings');
    if ((x.inputs[i] as string).length > MAX_INPUT_CHARS) return fail('PAWLEGENDS_TOO_LONG', `inputs over ${MAX_INPUT_CHARS} characters`);
  }
  if (x.outcome !== 'won' && x.outcome !== 'lost') return fail('PAWLEGENDS_REPLAY_INVALID', 'outcome must be won or lost');
  if (!isHex8(x.finalHash)) return fail('PAWLEGENDS_REPLAY_INVALID', 'finalHash must be 8 hex digits');
  if (x.mutator !== undefined && !(MUTATORS as readonly unknown[]).includes(x.mutator)) return fail('PAWLEGENDS_REPLAY_INVALID', "mutator must be 'none'");
  const want = fillPicksParty(x.seed, x.humans as PartySeat[]);
  for (let s = 0; s < 6; s++) {
    if (x.picks[s] !== want.picks[s] || x.tricks[s] !== want.tricks[s]) return fail('PAWLEGENDS_REPLAY_INVALID', 'picks do not match the seed and seats');
  }
  return null;
}

/** Verify a party replay: shape, then a full re-sim; accepted only when it ends on `ticks` with the outcome and hash. */
export function verifyPartyReplay(record: unknown): VerifyResult {
  const bad = checkPartyShape(record);
  if (bad) return bad;
  const r = record as PartyReplayRecord;
  let run: PartyReplayRun;
  try {
    run = runPartyReplay(r);
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
