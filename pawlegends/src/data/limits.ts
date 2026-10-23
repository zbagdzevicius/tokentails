/**
 * Replay limits, mirrored in shared/caps.ts (PAWLEGENDS_MAX_TICKS, PAWLEGENDS_MAX_INPUT_CHARS, POC.md §11.5) when
 * the monorepo touch points land (M2). Keep both copies equal.
 */
import { TIMELINE } from './timeline';

/**
 * base64 command stream; the whole `/live` body must fit 64 KB. Sim v10 (GAPS B1): 40,800 (40,000 before), so 60
 * command pings fit beside a joystick at the move gap for the whole 11:00 (shared/caps.ts and
 * backend/src/shared-contracts/caps.ts carry the same numbers; change all three in one commit).
 */
export const MAX_INPUT_CHARS = 40800;
/** 11:00 safety end. */
export const MAX_TICKS = TIMELINE.safetyEnd;

/** The binary stream behind MAX_INPUT_CHARS (base64: 4 characters per 3 bytes). Sim v10: +600 B for pings (30,000 before). */
export const MAX_INPUT_BYTES = 30600;

/**
 * Input gate (POC.md §11.3): the sim applies at most one `move` every MOVE_MIN_GAP ticks (a newer one waits and the
 * latest waiting move wins), and stops applying commands once the logged stream would exceed MAX_INPUT_BYTES. A
 * joystick at one move per 3 ticks for 11:00 then encodes to at most 39,600 characters.
 */
export const MOVE_MIN_GAP = 4;

/**
 * Sim v10 (GAPS B2): bytes of MAX_INPUT_BYTES only a forfeit may use (a varint tick delta is at most 3 bytes below
 * MAX_TICKS, plus its 1-byte opcode), so a player at the input budget can still forfeit and the replay still fits.
 */
export const FORFEIT_RESERVE_BYTES = 4;
