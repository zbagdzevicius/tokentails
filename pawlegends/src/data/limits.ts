/**
 * Replay limits, mirrored in shared/caps.ts (PAWLEGENDS_MAX_TICKS, PAWLEGENDS_MAX_INPUT_CHARS, POC.md §11.5) when
 * the monorepo touch points land (M2). Keep both copies equal.
 */
import { TIMELINE } from './timeline';

/** base64 command stream; the whole `/live` body must fit 64 KB. */
export const MAX_INPUT_CHARS = 40000;
/** 11:00 safety end. */
export const MAX_TICKS = TIMELINE.safetyEnd;

/** The binary stream behind MAX_INPUT_CHARS (base64: 4 characters per 3 bytes). */
export const MAX_INPUT_BYTES = 30000;

/**
 * Input gate (POC.md §11.3): the sim applies at most one `move` every MOVE_MIN_GAP ticks (a newer one waits and the
 * latest waiting move wins), and stops applying commands once the logged stream would exceed MAX_INPUT_BYTES. A
 * joystick at one move per 3 ticks for 11:00 then encodes to at most 39,600 characters.
 */
export const MOVE_MIN_GAP = 4;
