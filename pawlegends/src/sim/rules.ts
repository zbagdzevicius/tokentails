/** The match's rules (data/bots.ts DIFFICULTY_RULES, or PVP_RULES in a PvP match), for sim modules. */
import type { DifficultyRules } from '../data/bots';
import type { MatchHandle } from './state';

/** Sim v16: cached on the match at createMatch (`m.rules`), so PvP can swap the row without touching PvE. */
export const rulesOf = (m: MatchHandle): DifficultyRules => m.rules;
