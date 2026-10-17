/**
 * L1 Sim public API (LANES.md). Implementation: sim.ts (core loop), cat.ts, human.ts, props.ts, cone.ts,
 * scoring.ts, events.ts.
 */
import type { PlayableRoom, RoombaState, SimApi, SimState } from '../types';
import { initSim, stepSim, runToEnd, hashState } from './sim';
import { coneCellsOf, shortConeCells } from './cone';
import { findSwatTarget, type SwatTarget } from './cat';
import { mirrorHuman, webcamOn, webcamOver } from './v5';

export { seedRng, nextRng, rngInt } from './rng';
export { FNV_OFFSET, fnvInt, fnvInts } from './hash';
export { encodeInputs, decodeInputs, type InputRun } from './replay';
export { lineOfSight, inBounds, cellIndex, isOccluding } from './grid';
export { initSim, stepSim, runToEnd, hashState };
export { canStep, canJump, stepTicksFor } from './cat';
export { CONE_OFFSETS, CONE_RANGE, NEAR_RANGE, inConeOffset, looksAt, seesCell } from './cone';
export { propPoints, finalizeScore, rankFor, stackPoints } from './scoring';
export { FIRST_TURN_TICK, FTUE_EVENT_TICK, SECOND_HUMAN_LAG_TICKS, routineOf } from './human';
// ----- v5 (SIM_VERSION 5) -----
export { rulesFor, type SimOpts } from './sim';
export { rulesOf, isV5 } from './events';
export type { SwatTarget } from './cat';
export {
  ROOMBA_BLOCK_PAUSE,
  ROOMBA_CRASH_PAUSE,
  NOISE_NEAR,
  CLOTH_MAX_PULLS,
  KNOCK_TICKS,
  puddleAt,
  clothCovers,
  cableCell,
  mirrorHuman,
  mirrorPhase,
  frameableMess,
  webcamOn,
  type MirrorPhase,
} from './v5';
export { inShortCone, shortConeSees } from './cone';

/** Cells of human `human`'s current cone after occlusion (TELEGRAPH: the coming look; LOOK: live), for render. */
export function coneCells(s: SimState, human: number): Int16Array {
  return coneCellsOf(s, human);
}

/**
 * The prop the SWAT button would act on now (auto-assist), -1 none; grab = show the GRAB icon (or drop while carrying).
 * v5: `pull` is set when the swat would pull a cloth or a lamp cable (prop = the cloth / the lamp).
 */
export function swatTarget(s: SimState): SwatTarget {
  return findSwatTarget(s);
}

/** v5: cells of the mirror's cone while it is live (its human BUSY), else empty. For render. */
export function mirrorConeCells(s: SimState, play: PlayableRoom): Int16Array {
  const m = play.shell.mirror;
  if (!m || mirrorHuman(s, play) < 0) return new Int16Array(0);
  return shortConeCells(s, m.x, m.z, m.facing);
}

/** v5: cells the webcam sees (Thursday +ON_CAMERA_PCT %), empty when the room has no live webcam. */
export function webcamCells(s: SimState, play: PlayableRoom): Int16Array {
  const w = play.shell.webcam;
  if (!w || !webcamOn(s, play)) return new Int16Array(0);
  return shortConeCells(s, w.x, w.z, w.facing, webcamOver(s, w.x, w.z));
}

/** v5: the Roomba's state (render lerps fromX/fromZ → x/z by stepProgress / ROOMBA_STEP_TICKS), null when none. */
export function roombaOf(s: SimState): RoombaState | null {
  return s.roomba ?? null;
}

/** v5: the napper's noise meter 0..NOISE.max (0 without a napper). */
export function noiseOf(s: SimState): number {
  return s.noise ?? 0;
}

export const sim: SimApi = { initSim, stepSim, runToEnd, hashState };
