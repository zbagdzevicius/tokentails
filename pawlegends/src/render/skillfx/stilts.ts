/**
 * Stilts skill FX (sim v11; build spec docs/plans/moba/CATS-V11.md §2.4 "Moves and VFX"): every gameplay shape at the
 * sim's own numbers (FxCtx.abil).
 *
 * Phase 0 scaffold: the stub set (effects.ts's generic shape switch draws) until the FX land.
 */
import { stubFx } from '../anim/common';
import type { SkillFxSet } from '../anim/types';

export const SKILL_FX: SkillFxSet = stubFx('stilts');
