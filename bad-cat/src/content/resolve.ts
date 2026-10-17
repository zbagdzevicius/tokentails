/**
 * Bundle a room with its shell and routine(s). Unknown shell/routine indices (hand-made links) fall back to the
 * Kitchen and Chef Dad; `validate` reports a size mismatch. Daily rooms carry the weekday telegraph
 * (RoomDef.telegraph, GDD 4.3), applied here to copies of both routines. FTUE pins the room event at tick 450
 * (GDD 8) and moves the spawn next to the quickest target (`ftueSpawn`); the run length and the first turn at
 * tick 240 are the sim's job.
 */
import { RANK_PCT_BY_SHELL, SIM_VERSION, rankMinsFromBot, type PlayableRoom, type RoomDef, type RoutineDef, type RunMode } from '../types';
import { FTUE_EVENT_TICK, ROUTINES } from './routines';
import { SHELLS } from './shells';
import { ftueSpawn } from './validate';
import rankBot from './rank-bot.json';

/** Planner-bot scores per room id (content/rank-bot.json), only when written for the current SIM_VERSION. */
const BOT_SCORES: Readonly<Record<string, number>> = (rankBot as { version: number }).version === SIM_VERSION ? ((rankBot as { rooms: Record<string, number> }).rooms ?? {}) : {};

/** The room's planner-bot score, undefined for rooms without one (player rooms, days past the table). */
export function botScore(roomId: string): number | undefined {
  const v = BOT_SCORES[roomId];
  return typeof v === 'number' && v > 0 ? v : undefined;
}

/** Telegraph ticks a routine keeps above the weekday value (Grandma's long, polite warning). */
function slowness(r: RoutineDef): number {
  return Math.max(0, r.telegraph[0] - 24);
}

/** Weekday telegraph applied to a routine copy (the routine itself is never mutated). */
export function withTelegraph(r: RoutineDef, ticks: number): RoutineDef {
  const t = ticks + slowness(r);
  return { ...r, telegraph: [t, t] };
}

function validTelegraph(t: unknown): number | undefined {
  return typeof t === 'number' && Number.isInteger(t) && t >= 1 && t <= 31 ? t : undefined;
}

export function resolve(room: RoomDef, mode: RunMode, dayNo?: number): PlayableRoom {
  const shell = SHELLS[room.shell] ?? SHELLS[0];
  const tele = validTelegraph(room.telegraph);
  const prep = (base: RoutineDef): RoutineDef => {
    let r = tele !== undefined ? withTelegraph(base, tele) : base;
    if (mode === 'ftue') r = { ...r, eventTick: FTUE_EVENT_TICK };
    return r;
  };
  const play: PlayableRoom = { room, shell, routine: prep(ROUTINES[room.routine] ?? ROUTINES[0]), mode };
  const rankPct = RANK_PCT_BY_SHELL[shell.id];
  if (rankPct !== undefined && rankPct !== 100) play.rankPct = rankPct;
  // QA round 3: titles from the room's own planner-bot score (the first heist keeps the shell table: a 40 s run)
  const bot = mode === 'ftue' ? undefined : botScore(room.id);
  if (bot !== undefined) play.rankMins = rankMinsFromBot(bot);
  if (room.routine2 !== undefined && shell.humanSpot2) play.routine2 = prep(ROUTINES[room.routine2] ?? ROUTINES[0]);
  // FTUE: start right by the quickest Must-Wreck target so a first-timer scores in seconds (GDD 8).
  if (mode === 'ftue') play.room = { ...room, spawn: ftueSpawn(play) };
  if (dayNo !== undefined) play.dayNo = dayNo;
  return play;
}
