/**
 * Meatball move set (sim v11; build spec docs/plans/moba/CATS-V11.md §2.1 "Moves and VFX", ANIM-SPEC §14 brief to come).
 * MoveCtx.form / MoveCtx.channel carry the snapshot's alternate-state bits.
 *
 * Phase 0 scaffold: the stub set (the director falls back to the legacy swing / cast) until the clips land.
 */
import { stubMoves } from '../anim/common';
import type { MoveSet } from '../anim/types';

export const MOVES: MoveSet = stubMoves('meatball');
