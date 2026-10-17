/**
 * Phase 2 (GDD 10, 13.4, 17.3): the pure entry the backend vendors (`npm run vendor-sim` writes
 * backend/src/vendor/badcat-sim/). `POST /user/catbassadors/live` with `type: 'BAD_CAT'` replays a ranked run with
 * exactly this code, and the room feed (`POST /badcat/room`) checks a player room and replays its maker's clear run.
 *
 * Rules for this file: no browser API, no `Date.now()`/`Math.random` (the caller passes the time), no import of
 * render, audio, UI or platform code. The bundle check in tools/vendor-sim.mjs refuses browser globals, web storage,
 * the module meta object and dynamic imports.
 */
import {
  BOSS_TICKS,
  CUDDLE_TICKS,
  MIN_REPLAY_SIM_VERSION,
  RUN_TICKS,
  SIM_VERSION,
  TICK_HZ,
  type CatSpec,
  type RoomDef,
  type TickInput,
} from '../types';
import { decodeInputs, runToEnd, type InputRun } from '../sim';
import { content, dailyRoom, roomLabel } from '../content';
import { DAY1_UTC } from '../content/schedule';
import { decodeCat, decodeCatOrDefault, decodeRoom, filterName, filterTitle, isBlocked, roomGameplayHash } from '../codec';
import { check } from '../editor/check';
import { CLEAR_MIN_TARGETS, budgetCapFor } from '../editor/budget';

export { SIM_VERSION, MIN_REPLAY_SIM_VERSION, TICK_HZ, RUN_TICKS, BOSS_TICKS };

/** Most ticks any run can play: a 90 s boss room, the 2.5 s cuddle and the two-tick slack of runToEnd. */
export const MAX_RUN_TICKS = BOSS_TICKS + CUDDLE_TICKS + 2;
/** Most input runs a log may carry (a run changes input at most once a tick). */
export const MAX_RUNS = MAX_RUN_TICKS;
const MS_DAY = 86_400_000;

export type BadcatVerifyCode = 'BADCAT_REPLAY_INVALID' | 'BADCAT_SIM_VERSION' | 'BADCAT_TRAILING_INPUT' | 'BADCAT_NO_SCORE';

/** The ranked-run log a client posts (`LiveGameDto.badcat`). `runs` = encodeInputs of RunResult.inputs. */
export interface BadcatRunLog {
  dayNo: number;
  simVersion: number;
  runs: readonly (readonly number[])[];
  /** What the client's own sim said; compared, never trusted. */
  finalHash?: number;
  score?: number;
}

export interface BadcatVerifiedRun {
  ok: true;
  dayNo: number;
  roomId: string;
  label: string;
  score: number;
  stamp: 'perfect' | 'clean' | 'caught';
  rank: string;
  caught: boolean;
  ticks: number;
  maxCombo: number;
  targets: number;
  finalHash: number;
  /** The client's finalHash matched the server's (absent = the client sent none). */
  hashMatch?: boolean;
  runs: InputRun[];
}

export interface BadcatRejectedRun {
  ok: false;
  code: BadcatVerifyCode;
  reason: string;
}

export type BadcatVerifyResult = BadcatVerifiedRun | BadcatRejectedRun;

const reject = (code: BadcatVerifyCode, reason: string): BadcatRejectedRun => ({ ok: false, code, reason });
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

/** The game's day number for a UTC instant (the server has no local date: UTC calendar day). */
export function dayNoUtc(ms: number): number {
  if (!Number.isFinite(ms)) return 0;
  const day = Math.floor(ms / MS_DAY) * MS_DAY;
  return Math.round((day - DAY1_UTC) / MS_DAY) + 1;
}

/** "Kitchen #18", "Boss: Birthday Party #6". */
export function dayTitle(dayNo: number): string {
  return roomLabel(dayNo);
}

/**
 * Checks and canonicalises the input runs: every run `[dir 0..8, speed 0..2, buttons 0..7, count >= 1]`, adjacent
 * equal runs merged, trailing idle runs dropped (the sim reads a missing tick as no input). Returns null when bad.
 */
export function canonicalRuns(raw: unknown): InputRun[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_RUNS) return null;
  const out: InputRun[] = [];
  let total = 0;
  for (const r of raw) {
    if (!Array.isArray(r) || r.length !== 4) return null;
    const [dir, speed, buttons, count] = r as unknown[];
    if (!isInt(dir) || dir < 0 || dir > 8) return null;
    if (!isInt(speed) || speed < 0 || speed > 2) return null;
    if (!isInt(buttons) || buttons < 0 || buttons > 7) return null;
    if (!isInt(count) || count < 1 || count > MAX_RUN_TICKS) return null;
    total += count;
    if (total > MAX_RUN_TICKS) return null;
    const last = out[out.length - 1];
    if (last && last[0] === dir && last[1] === speed && last[2] === buttons) last[3] += count;
    else out.push([dir, speed, buttons, count]);
  }
  while (out.length && out[out.length - 1][0] === 0 && out[out.length - 1][1] === 0 && out[out.length - 1][2] === 0) out.pop();
  return out;
}

/** The string the backend hashes (sha256) into `Game.replayDigest`: one log saves once, from any account. */
export function canonicalLogKey(log: Pick<BadcatRunLog, 'dayNo' | 'simVersion' | 'runs'>): string {
  const runs = canonicalRuns(log.runs) ?? [];
  return `badcat|v${log.simVersion}|d${log.dayNo}|${runs.map((r) => r.join('.')).join(',')}`;
}

/** A neutral cat: the sim never reads the cat (looks only), so verification does not depend on the player's cat. */
const SERVER_CAT: CatSpec = decodeCatOrDefault(null);

/**
 * Replays a ranked daily run. Ranked saves need the current SIM_VERSION (older ghosts are "replay only"), a known day,
 * valid runs, no input after the run ended, and a score above 0 (an idle run is identical for everyone).
 */
export function verifyRanked(raw: unknown): BadcatVerifyResult {
  if (!raw || typeof raw !== 'object') return reject('BADCAT_REPLAY_INVALID', 'log must be an object');
  const log = raw as Partial<BadcatRunLog>;
  if (log.simVersion !== SIM_VERSION) return reject('BADCAT_SIM_VERSION', `ranked runs need sim ${SIM_VERSION}`);
  if (!isInt(log.dayNo) || log.dayNo < -400 || log.dayNo > 100_000) return reject('BADCAT_REPLAY_INVALID', 'dayNo out of range');
  const runs = canonicalRuns(log.runs);
  if (!runs) return reject('BADCAT_REPLAY_INVALID', 'runs must be [dir 0..8, speed 0..2, buttons 0..7, count >= 1] and fit one run');
  const dayNo = log.dayNo;
  let room: RoomDef;
  try {
    room = dailyRoom(dayNo);
  } catch {
    return reject('BADCAT_REPLAY_INVALID', 'unknown day');
  }
  const play = content.resolve(room, 'ranked', dayNo);
  const inputs: TickInput[] = decodeInputs(runs);
  const r = runToEnd(play, SERVER_CAT, inputs, { simVersion: SIM_VERSION });
  if (inputs.length > r.ticks) return reject('BADCAT_TRAILING_INPUT', `input continues after the run ended at tick ${r.ticks}`);
  if (r.score <= 0) return reject('BADCAT_NO_SCORE', 'a run without a score is not saved');
  const caught = r.stamp === 'caught';
  return {
    ok: true,
    dayNo,
    roomId: room.id,
    label: roomLabel(dayNo),
    score: r.score,
    stamp: r.stamp,
    rank: r.rank,
    caught,
    ticks: r.ticks,
    maxCombo: r.maxCombo,
    targets: r.targets,
    finalHash: r.finalHash >>> 0,
    ...(isInt(log.finalHash) ? { hashMatch: (log.finalHash >>> 0) === (r.finalHash >>> 0) } : {}),
    runs,
  };
}

// ---------------------------------------------------------------------------------------------
// Player rooms (room feed, short room links)
// ---------------------------------------------------------------------------------------------

export interface RoomCheck {
  ok: boolean;
  errors: string[];
  /** Present when the payload decoded. */
  room?: {
    id: string;
    title: string;
    author: string;
    shell: number;
    props: number;
    ancestors: string[];
    gameplayHash: number;
    boss: boolean;
  };
  /** The maker's clear run, replayed: targets wrecked (absent when no run was sent). */
  clear?: { ok: boolean; targets: number; score: number };
}

/**
 * Decodes a room code and runs the Room Maker's own rules (props, budget, 3 targets, reachability, sight lines).
 * With `clearRuns` (the maker's playtest inputs) it also replays the room and requires CLEAR_MIN_TARGETS targets:
 * "clear to publish" checked on the server. Text (title, author, ancestors) goes through the game's name filter.
 */
export function checkRoom(code: unknown, clearRuns?: unknown): RoomCheck {
  if (typeof code !== 'string') return { ok: false, errors: ['room code must be a string'] };
  const room = decodeRoom(code);
  if (!room) return { ok: false, errors: ['room code does not decode'] };
  const errors: string[] = [];
  const title = filterTitle(room.title ?? '');
  const author = filterName(room.author ?? '');
  if (room.title && isBlocked(room.title)) errors.push('title is not allowed');
  if (room.author && isBlocked(room.author)) errors.push('author name is not allowed');
  const ancestors = (room.ancestors ?? []).map((a) => filterName(a)).filter(Boolean);
  let res;
  try {
    res = check(room, content, { maxBudget: budgetCapFor(room.ancestors?.length ? room : null) });
  } catch {
    return { ok: false, errors: ['room does not load'] };
  }
  errors.push(...res.errors);
  const out: RoomCheck = {
    ok: false,
    errors,
    room: {
      id: room.id,
      title: title || 'A player room',
      author,
      shell: room.shell,
      props: room.props.length,
      ancestors,
      gameplayHash: roomGameplayHash(room) >>> 0,
      boss: !!room.boss,
    },
  };
  if (clearRuns !== undefined) {
    const runs = canonicalRuns(clearRuns);
    if (!runs) {
      errors.push('clear run is not a valid input log');
    } else {
      const play = content.resolve(room, 'practice');
      const r = runToEnd(play, SERVER_CAT, decodeInputs(runs), { simVersion: SIM_VERSION });
      const ok = r.targets >= CLEAR_MIN_TARGETS;
      out.clear = { ok, targets: r.targets, score: r.score };
      if (!ok) errors.push(`the maker's run wrecked ${r.targets} targets, ${CLEAR_MIN_TARGETS} needed`);
    }
  }
  out.ok = errors.length === 0;
  return out;
}

/** A cat code from a link or a board row: true when it decodes. */
export function catCodeOk(code: unknown): boolean {
  return typeof code === 'string' && decodeCat(code) !== null;
}

/** The game's own name filter (12 chars, blocked words removed). '' when nothing is left. */
export function cleanName(raw: unknown, max = 12): string {
  if (typeof raw !== 'string') return '';
  if (isBlocked(raw)) return '';
  return filterName(raw, max);
}

/** Room titles (24 chars). */
export function cleanTitle(raw: unknown, max = 24): string {
  if (typeof raw !== 'string') return '';
  if (isBlocked(raw)) return '';
  return filterTitle(raw, max);
}

/** Build info the backend serves at GET /badcat/sim (the deploy compares it with its own build). */
export const SERVER_INFO = { simVersion: SIM_VERSION, minReplaySimVersion: MIN_REPLAY_SIM_VERSION, tickHz: TICK_HZ, runTicks: RUN_TICKS, maxRunTicks: MAX_RUN_TICKS };
