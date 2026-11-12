/**
 * Party play (docs/plans/moba/MULTIPLAYER.md §1): co-op against bots, 1 to 3 humans on slot 0's team.
 *
 * MERGE NOTE (§1): sim v12 shipped without party code, so party play rides SIM_VERSION 13 (v12 is frozen). Party code
 * leaves single-player output byte-identical to the sim without it (tests/unit/party-identity.test.ts). PARTY_SINCE is
 * the first SIM_VERSION that shipped to production with party code. v13 (party, no dogs) shipped and is frozen; the
 * five dogs (docs/plans/moba/DOGS-V13.md) ride SIM_VERSION 14, and party play keeps working on it.
 *
 * Determinism rule (§1.4): a client's sim only ever applies the decoded TURN bytes, its own commands included.
 * A human slot is a command source like slot 0: `step(m, slot0, others)`. A pilot (the relay's bot for a dropped
 * human) is `createPlayerBotFor` and its output is ordinary stream commands for that slot.
 */
import { HERO_IDS, HEROES } from '../data/heroes';
import { DIFFICULTIES, type Difficulty } from '../data/bots';
import { MAX_INPUT_CHARS, MAX_TICKS } from '../data/limits';
import { TRICK_IDS } from '../data/tricks';
import {
  MAP_IDS,
  PVP_LEAD1,
  type MapId,
  SLOTS_PER_TEAM,
  SLOT_COUNT,
  type Command,
  type HeroId,
  type MatchResult,
  type PartyReplayRecord,
  type PartySeat,
  type PvpReplayRecord,
  type TimedCommand,
  type TrickId,
  type VerifyCode,
  type VerifyResult,
} from './api';
import { PVP_FILL_DEFAULT } from './bots';
import { DecodeError, decodeStream, encodeStream, fromBase64, toBase64 } from './commands';
import { isHumanSlot } from './humans';
import { createMatch, fillPicks, hashTrail, result, step, tickOf } from './index';
import { bindMap, mapIndex } from './map/runtime';
import type { MatchHandle } from './state';
import { SIM_VERSION } from './version';
import { mutatorOf, mutatorProblem } from './mutator';

export { applyPartyInputs, createPartyState, validateHumans } from './party-inputs';
export { createPlayerBotFor } from './bots';
export { humanMask, isHumanSlot } from './humans';

/** The first SIM_VERSION with party code (see the merge warning above). The backend refuses older party results. */
export const PARTY_SINCE = 13; // lint-sim: allow (a version number, not tuning)
/**
 * Sim v16 S-PvP (docs/plans/moba/V16.md §3.1.7): the first SIM_VERSION with PvP (humans on both teams). The backend
 * offers the casual queue only when it verifies a version >= PVP_SINCE, and refuses an older PvP record.
 */
export const PVP_SINCE = 16; // lint-sim: allow (a version number, not tuning)

/** Is hero slot `slot` a human's in match `m`? Slot 0 always; slots 1 and 2 only in a party. */
export const isHuman = (m: MatchHandle, slot: number): boolean => isHumanSlot(m.world, slot);

/**
 * Picks for a party: the bots exactly as `fillPicks(seed, humans[0].hero, humans[0].trick)` draws them, then each
 * human seat overwrites its slot. Invariant: `fillPicksParty(s, [h0])` deep-equals `fillPicks(s, h0.hero, h0.trick)`.
 * Sim v16 PvP uses the same rule: team 0 is slot 0's species, team 1 the other (`fillPicks`); every seat on team 1
 * must be of that other species (checkPvpShape refuses a mixed team), so a pick list never mixes species in a team.
 */
export function fillPicksParty(seed: number, humans: readonly PartySeat[], map: MapId = 'crossing'): { picks: HeroId[]; tricks: TrickId[] } {
  const lead = humans[0];
  const out = fillPicks(seed, lead.hero, lead.trick, map);
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

/** Party replay of an ended party match, or null while it runs (and for a PvP match: see pvpReplayRecord). */
export function partyReplayRecord(m: MatchHandle): PartyReplayRecord | null {
  if (!m.ended || m.pvp) return null;
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
    mutator: mutatorOf(m.world),
    ...(m.world.map !== 0 ? { map: MAP_IDS[m.world.map] } : {}),
  };
}

/** Sim v16 S-PvP: the replay of an ended PvP match, or null (still running, or not a PvP match). */
export function pvpReplayRecord(m: MatchHandle): PvpReplayRecord | null {
  if (!m.ended || !m.pvp) return null;
  const slots = m.config.humans ?? [0];
  const humans: PartySeat[] = [];
  const inputs: string[] = [];
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    humans.push({ slot: s, hero: m.config.picks[s], trick: m.config.tricks[s] });
    inputs.push(toBase64(encodeStream(partyLog(m, s))));
  }
  const fill = m.config.fillDifficulty ?? PVP_FILL_DEFAULT;
  return {
    v: 3,
    mode: 'pvp',
    simVersion: SIM_VERSION,
    seed: m.config.seed >>> 0,
    difficulty: m.config.difficulty,
    fillDifficulty: [fill[0], fill[1]],
    humans,
    picks: m.config.picks.slice(),
    tricks: m.config.tricks.slice(),
    ticks: m.ended.ticks,
    inputs,
    outcome: m.ended.outcome,
    finalHash: m.ended.finalHash,
    mutator: 'none',
    ...(m.world.map !== 0 ? { map: MAP_IDS[m.world.map] } : {}),
  };
}

export interface PartyReplayRun {
  result: MatchResult | null;
  trail: number[];
  ticks: number;
}

/** Re-simulate a party replay (shape already checked). Throws DecodeError on a malformed stream. */
export function runPartyReplay(r: Pick<PartyReplayRecord, 'seed' | 'difficulty' | 'humans' | 'ticks' | 'inputs' | 'map' | 'mutator'>): PartyReplayRun {
  return runSeats(r, undefined);
}

/** Sim v16 S-PvP: re-simulate a PvP replay (shape already checked). Throws DecodeError on a malformed stream. */
export function runPvpReplay(r: Pick<PvpReplayRecord, 'seed' | 'difficulty' | 'humans' | 'ticks' | 'inputs' | 'fillDifficulty' | 'map'>): PartyReplayRun {
  return runSeats(r, [r.fillDifficulty[0], r.fillDifficulty[1]]);
}

function runSeats(r: Pick<PartyReplayRecord, 'seed' | 'difficulty' | 'humans' | 'ticks' | 'inputs' | 'map' | 'mutator'>, fill: [Difficulty, Difficulty] | undefined): PartyReplayRun {
  // Sim v19: the record's map first (the stream bounds and the limits are per map).
  bindMap(mapIndex(r.map));
  const map = r.map === undefined ? {} : { map: r.map };
  // Sim v22: a party record may carry a mutator (Blitz); PvP never does (checkPvpShape).
  const mut = r.mutator === undefined || r.mutator === 'none' ? {} : { mutator: r.mutator };
  const limit = Math.min(r.ticks, MAX_TICKS);
  const streams: TimedCommand[][] = [];
  for (let i = 0; i < r.inputs.length; i++) streams.push(decodeStream(fromBase64(r.inputs[i]), limit - 1));
  const { picks, tricks } = fillPicksParty(r.seed, r.humans, r.map);
  const humans: number[] = [];
  for (let i = 0; i < r.humans.length; i++) humans.push(r.humans[i].slot);
  const m = fill
    ? createMatch({ seed: r.seed, picks, tricks, difficulty: r.difficulty, humans, mode: 'pvp', fillDifficulty: fill, ...map })
    : createMatch({ seed: r.seed, picks, tricks, difficulty: r.difficulty, humans, ...map, ...mut });
  const at: number[] = [];
  for (let i = 0; i < streams.length; i++) at.push(0);
  const slot0: Command[] = [];
  const others: Command[][] = [];
  for (let s = 0; s < SLOT_COUNT; s++) others.push([]);
  for (let t = 0; t < limit && result(m) === null; t++) {
    slot0.length = 0;
    for (let s = 1; s < SLOT_COUNT; s++) others[s].length = 0;
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
  // Sim v19: the map (omitted: Crossing); every bound below is that map's.
  if (x.map !== undefined && !(MAP_IDS as readonly unknown[]).includes(x.map)) return fail('PAWLEGENDS_REPLAY_INVALID', 'unknown map');
  bindMap(mapIndex(x.map as MapId | undefined));
  if (!Array.isArray(x.humans) || x.humans.length < 1 || x.humans.length > SLOTS_PER_TEAM) return fail('PAWLEGENDS_REPLAY_INVALID', `humans must list 1 to ${SLOTS_PER_TEAM} seats`);
  let last = -1;
  for (let i = 0; i < x.humans.length; i++) {
    const h = x.humans[i] as Record<string, unknown> | null;
    if (!h || typeof h !== 'object') return fail('PAWLEGENDS_REPLAY_INVALID', 'bad seat');
    const s = h.slot;
    if (typeof s !== 'number' || !Number.isInteger(s) || s < 0 || s >= SLOTS_PER_TEAM) return fail('PAWLEGENDS_REPLAY_INVALID', SLOTS_PER_TEAM === 3 ? 'seat slot must be 0, 1 or 2' : `seat slot must be 0 to ${SLOTS_PER_TEAM - 1}`);
    if (i === 0 && s !== 0) return fail('PAWLEGENDS_REPLAY_INVALID', 'the first seat must be slot 0');
    if (s <= last) return fail('PAWLEGENDS_REPLAY_INVALID', 'seat slots must be ascending and unique');
    last = s;
    if (typeof h.hero !== 'string' || !(HERO_IDS as readonly string[]).includes(h.hero)) return fail('PAWLEGENDS_REPLAY_INVALID', 'unknown hero');
    if (typeof h.trick !== 'string' || !(TRICK_IDS as readonly string[]).includes(h.trick)) return fail('PAWLEGENDS_REPLAY_INVALID', 'unknown trick');
  }
  if (!Array.isArray(x.picks) || x.picks.length !== SLOT_COUNT || !Array.isArray(x.tricks) || x.tricks.length !== SLOT_COUNT) return fail('PAWLEGENDS_REPLAY_INVALID', `picks and tricks need ${SLOT_COUNT} slots`);
  if (typeof x.ticks !== 'number' || !Number.isInteger(x.ticks) || x.ticks < 1) return fail('PAWLEGENDS_REPLAY_INVALID', 'ticks must be a positive integer');
  if (x.ticks > MAX_TICKS) return fail('PAWLEGENDS_TOO_LONG', `ticks over ${MAX_TICKS}`);
  if (!Array.isArray(x.inputs) || x.inputs.length !== x.humans.length) return fail('PAWLEGENDS_REPLAY_INVALID', 'one input stream per seat');
  for (let i = 0; i < x.inputs.length; i++) {
    if (typeof x.inputs[i] !== 'string') return fail('PAWLEGENDS_REPLAY_INVALID', 'inputs must be strings');
    if ((x.inputs[i] as string).length > MAX_INPUT_CHARS) return fail('PAWLEGENDS_TOO_LONG', `inputs over ${MAX_INPUT_CHARS} characters`);
  }
  if (x.outcome !== 'won' && x.outcome !== 'lost') return fail('PAWLEGENDS_REPLAY_INVALID', 'outcome must be won or lost');
  if (!isHex8(x.finalHash)) return fail('PAWLEGENDS_REPLAY_INVALID', 'finalHash must be 8 hex digits');
  const mutBad = mutatorProblem(x.mutator, x.map, false);
  if (mutBad) return fail('PAWLEGENDS_REPLAY_INVALID', mutBad);
  const want = fillPicksParty(x.seed, x.humans as PartySeat[], x.map as MapId | undefined);
  for (let s = 0; s < SLOT_COUNT; s++) {
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
  return { ok: true, outcome: res.outcome, finalHash: res.finalHash, ticks: res.ticks, stats: res.stats, reason: res.reason, winner: res.winner, ...(res.draw ? { draw: true as const } : {}) };
}

// ---------------------------------------------------------------------------------------------------------------
// Sim v16 S-PvP (docs/plans/moba/V16.md §3.1.7): the PvP record's shape check and verifier.

/** The species ('cat' | 'dog') of a hero id. */
const sideOf = (hero: string): string => (HEROES as Readonly<Record<string, { side: string }>>)[hero].side;

/** Structural check of a PvpReplayRecord (no simulation). Null when well-formed. */
export function checkPvpShape(r: unknown): VerifyResult | null {
  if (!r || typeof r !== 'object') return fail('PAWLEGENDS_REPLAY_INVALID', 'not an object');
  const x = r as Record<string, unknown>;
  if (x.v !== 3 || x.mode !== 'pvp') return fail('PAWLEGENDS_REPLAY_INVALID', "a pvp record has v 3 and mode 'pvp'");
  if (typeof x.simVersion !== 'number' || x.simVersion !== SIM_VERSION) return fail('PAWLEGENDS_SIM_VERSION', `simVersion ${String(x.simVersion)} is not ${SIM_VERSION}`);
  if (x.simVersion < PVP_SINCE) return fail('PAWLEGENDS_SIM_VERSION', `pvp needs simVersion ${PVP_SINCE}`);
  if (typeof x.seed !== 'number' || !Number.isInteger(x.seed) || x.seed < 0 || x.seed > 0xffffffff) return fail('PAWLEGENDS_REPLAY_INVALID', 'seed must be a uint32');
  if (x.difficulty !== 'hard') return fail('PAWLEGENDS_REPLAY_INVALID', 'a pvp match is played at difficulty hard');
  const fill = x.fillDifficulty;
  if (!Array.isArray(fill) || fill.length !== 2 || !fill.every((d) => typeof d === 'string' && (DIFFICULTIES as readonly string[]).includes(d))) {
    return fail('PAWLEGENDS_REPLAY_INVALID', 'fillDifficulty needs two difficulties');
  }
  // Sim v19: the map (omitted: Crossing); every bound below is that map's.
  if (x.map !== undefined && !(MAP_IDS as readonly unknown[]).includes(x.map)) return fail('PAWLEGENDS_REPLAY_INVALID', 'unknown map');
  bindMap(mapIndex(x.map as MapId | undefined));
  if (!Array.isArray(x.humans) || x.humans.length < 2 || x.humans.length > SLOT_COUNT) return fail('PAWLEGENDS_REPLAY_INVALID', `pvp humans must list 2 to ${SLOT_COUNT} seats`);
  let last = -1;
  let lead1 = false;
  for (let i = 0; i < x.humans.length; i++) {
    const h = x.humans[i] as Record<string, unknown> | null;
    if (!h || typeof h !== 'object') return fail('PAWLEGENDS_REPLAY_INVALID', 'bad seat');
    const s = h.slot;
    if (typeof s !== 'number' || !Number.isInteger(s) || s < 0 || s >= SLOT_COUNT) return fail('PAWLEGENDS_REPLAY_INVALID', `seat slot must be 0 to ${SLOT_COUNT - 1}`);
    if (i === 0 && s !== 0) return fail('PAWLEGENDS_REPLAY_INVALID', 'the first seat must be slot 0');
    if (s <= last) return fail('PAWLEGENDS_REPLAY_INVALID', 'seat slots must be ascending and unique');
    last = s;
    if (s === PVP_LEAD1) lead1 = true;
    if (typeof h.hero !== 'string' || !(HERO_IDS as readonly string[]).includes(h.hero)) return fail('PAWLEGENDS_REPLAY_INVALID', 'unknown hero');
    if (typeof h.trick !== 'string' || !(TRICK_IDS as readonly string[]).includes(h.trick)) return fail('PAWLEGENDS_REPLAY_INVALID', 'unknown trick');
  }
  if (!lead1) return fail('PAWLEGENDS_REPLAY_INVALID', `slot ${PVP_LEAD1} (team 1 lead) must be a seat`);
  // One species per team: team 0 is slot 0's, team 1 the other.
  const seats = x.humans as PartySeat[];
  const side0 = sideOf(seats[0].hero);
  for (let i = 1; i < seats.length; i++) {
    const own = sideOf(seats[i].hero) === side0;
    if ((seats[i].slot < SLOTS_PER_TEAM) !== own) return fail('PAWLEGENDS_REPLAY_INVALID', 'a team mixes species');
  }
  if (!Array.isArray(x.picks) || x.picks.length !== SLOT_COUNT || !Array.isArray(x.tricks) || x.tricks.length !== SLOT_COUNT) return fail('PAWLEGENDS_REPLAY_INVALID', `picks and tricks need ${SLOT_COUNT} slots`);
  if (typeof x.ticks !== 'number' || !Number.isInteger(x.ticks) || x.ticks < 1) return fail('PAWLEGENDS_REPLAY_INVALID', 'ticks must be a positive integer');
  if (x.ticks > MAX_TICKS) return fail('PAWLEGENDS_TOO_LONG', `ticks over ${MAX_TICKS}`);
  if (!Array.isArray(x.inputs) || x.inputs.length !== x.humans.length) return fail('PAWLEGENDS_REPLAY_INVALID', 'one input stream per seat');
  for (let i = 0; i < x.inputs.length; i++) {
    if (typeof x.inputs[i] !== 'string') return fail('PAWLEGENDS_REPLAY_INVALID', 'inputs must be strings');
    if ((x.inputs[i] as string).length > MAX_INPUT_CHARS) return fail('PAWLEGENDS_TOO_LONG', `inputs over ${MAX_INPUT_CHARS} characters`);
  }
  if (x.outcome !== 'won' && x.outcome !== 'lost') return fail('PAWLEGENDS_REPLAY_INVALID', 'outcome must be won or lost');
  if (!isHex8(x.finalHash)) return fail('PAWLEGENDS_REPLAY_INVALID', 'finalHash must be 8 hex digits');
  const mutBad = mutatorProblem(x.mutator, x.map, true);
  if (mutBad) return fail('PAWLEGENDS_REPLAY_INVALID', mutBad);
  const want = fillPicksParty(x.seed, seats, x.map as MapId | undefined);
  for (let s = 0; s < SLOT_COUNT; s++) {
    if (x.picks[s] !== want.picks[s] || x.tricks[s] !== want.tricks[s]) return fail('PAWLEGENDS_REPLAY_INVALID', 'picks do not match the seed and seats');
  }
  return null;
}

/**
 * Verify a PvP replay: shape, then a full re-sim; accepted only when it ends on `ticks` with the outcome (team 0's
 * view) and hash. The verdict carries `winner`, from which the backend derives each slot's own result.
 */
export function verifyPvpReplay(record: unknown): VerifyResult {
  const bad = checkPvpShape(record);
  if (bad) return bad;
  const r = record as PvpReplayRecord;
  let run: PartyReplayRun;
  try {
    run = runPvpReplay(r);
  } catch (e) {
    if (e instanceof DecodeError) return fail('PAWLEGENDS_REPLAY_INVALID', `inputs: ${e.message}`);
    throw e;
  }
  const res = run.result;
  if (!res || res.ticks !== r.ticks) return fail('PAWLEGENDS_NOT_ENDED', 'the match does not end on the reported tick');
  if (res.outcome !== r.outcome) return fail('PAWLEGENDS_OUTCOME_MISMATCH', `re-sim outcome is ${res.outcome}`);
  if (res.finalHash !== r.finalHash) return fail('PAWLEGENDS_HASH_MISMATCH', 'final hash differs');
  return { ok: true, outcome: res.outcome, finalHash: res.finalHash, ticks: res.ticks, stats: res.stats, reason: res.reason, winner: res.winner };
}
