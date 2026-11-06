/**
 * Marshmallow's skill FX (sim v13; ANIM-SPEC §14). PLACEHOLDER (LANE SIM compile stub): owns nothing, so effects.ts's
 * generic shape switch draws every cast until the RENDER lane writes the real FX.
 */
import { stubFx } from '../anim/common';
import type { SkillFxSet } from '../anim/types';

export const SKILL_FX: SkillFxSet = stubFx('marshmallow');
