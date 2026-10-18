/** The match's difficulty rules (data/bots.ts DIFFICULTY_RULES), for sim modules. */
import { DIFFICULTY_RULES, type DifficultyRules } from '../data/bots';
import type { MatchHandle } from './state';

export const rulesOf = (m: MatchHandle): DifficultyRules => DIFFICULTY_RULES[m.config.difficulty];
