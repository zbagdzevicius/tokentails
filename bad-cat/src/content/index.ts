/** Content public API (GDD 3.4, 3.5, 4.1, 4.3, 6.4, 8, 13.7, Appendix A/B). */
import type { ContentApi } from '../types';
import { archive, dailyEntry, dailyRoom, dayNoFor, glassRoom, pickerRooms, roomLabel } from './daily';
import { resolve } from './resolve';
import { ROUTINES } from './routines';
import { SHELLS } from './shells';
import { validate } from './validate';

export {
  DAY1,
  dayNoFor,
  dailyRoom,
  glassRoom,
  pickerRooms,
  dateOfDay,
  dayLabel,
  isPreviewDay,
  variantIndexForDay,
  KITCHEN_VARIANTS,
  DAILY_ROOMS,
  dailyEntry,
  entryFor,
  archive,
  roomLabel,
  roomForDay,
  PICKER_PAST_DAYS,
  communityRoom,
  placeSponsor,
  scheduleHand,
  type HandFields,
} from './daily';
export { weekdayOf, seasonOf, isXmasDay, planForDay, recipeForDay, generateRoom, AUTHORED_DAYS, INDEX_DAYS, FIRST_COMMUNITY_DAY, shellLabel, type DayPlan } from './schedule';
export { SHELLS, SHELL, KITCHEN, shellLevel, parseLevelMap, DECOR_FURNITURE } from './shells';
export { ROUTINES, ROUTINE, FTUE_EVENT_TICK, FTUE_FIRST_TURN_TICK } from './routines';
export { WEEKDAY_TELEGRAPH, buildDailyRoom, type DailyRecipe } from './authoring';
export { resolve, withTelegraph } from './resolve';
export {
  validate,
  ftueSpawn,
  targetVisible,
  VISIBLE_TARGETS_MIN,
  travelTicks,
  wreckTicks,
  wreckTicksFor,
  wishReachable,
  chaosBudget,
  isLegacyRoom,
  PROP_MIN,
  PROP_MAX,
  BOSS_PROP_MAX,
  MAKER_PROP_MAX,
  MAKER_BUDGET,
  DAILY_BUDGET,
  BOSS_BUDGET,
  TARGETS_PER_ROOM,
  FIRST_TARGET_MAX_TICKS,
  ROOM_SIZES,
} from './validate';
export { KIND, WRECKABLE_KINDS, GRABBABLE_KINDS, isTargetable, kindBySlug, PROP_KINDS, propKind } from './props-catalog';

export const content: ContentApi = {
  dayNoFor,
  dailyRoom,
  glassRoom,
  pickerRooms,
  resolve,
  validate,
  dailyEntry,
  archive,
  roomLabel,
  shells: SHELLS,
  routines: ROUTINES,
};
