/**
 * Progress public API (GDD 8, 13.6): streak + Nine Lives, Rap Sheet (48+ stamps, weekly card), season track,
 * par paws, cosmetics earned, friends board, my rooms, days history and the save code. Every function takes
 * the Store, never throws, and works in memory when storage is blocked.
 * `progress` is the ready-made ProgressApi for GameServices.
 */
import type { ProgressApi, Store } from '../types';
import { recordRankedDay, streakDetail, streakStatus } from './streak';
import { crimes, rapSheet, recordCrimes, weekly } from './rapsheet';
import { addRunXp, claimTier, season } from './season';
import { parPaws } from './par';
import { friends, hideFriend, saveFriend } from './friends';
import { markMyRoomFeed, myRooms, saveMyRoom } from './rooms';
import { ownedCosmetics } from './cosmetics';
import { exportSaveCode, importSaveCode } from './savecode';

export {
  recordRankedDay,
  streakStatus,
  streakDetail,
  streakBadges,
  applyRankedDay,
  readStreak,
  weekOf,
  KEY_STREAK,
  KEY_PREVIEW_STREAK,
  FREE_FREEZES_PER_WEEK,
  CLUB_FREEZES_PER_WEEK,
  STREAK_BADGES,
  type Streak,
  type StreakData,
  type StreakOptions,
} from './streak';
export {
  recordCrimes,
  crimesIn,
  crimes,
  rapSheet,
  weekly,
  weeklyLine,
  crimeCatalog,
  crimeDef,
  crimeIdForKind,
  isCrimeKind,
  readRapSheet,
  rapRank,
  RAP_RANKS,
  SPECIAL_CRIMES,
  KEY_RAPSHEET,
  GOLD_AT,
  type RapSheet,
  type CrimeDef,
  type RecordCrimeOptions,
} from './rapsheet';
export {
  addRunXp,
  season,
  claimTier,
  claimableTiers,
  seasonFor,
  seasonTrack,
  readSeason,
  sanitizeSeasonData,
  tierFor,
  tierTitle,
  xpFor,
  KEY_SEASON,
  XP_PER_TIER,
  SEASON_TIERS,
  TIER_TITLES,
  type SeasonData,
  type TrackTier,
} from './season';
export { ownedCosmetics, ownedCosmeticDefs, grantCosmetic, cosmeticKey, cosmeticFromKey, KEY_COSMETICS, STREAK_COLLAR_DAYS, COSMETIC_SLOTS, readOwned, wearOwned } from './cosmetics';
export { parPaws, PAW_NAMES, type Par } from './par';
export { friends, saveFriend, hideFriend, readGhosts, ghostHash, KEY_GHOSTS, FRIENDS_CAP } from './friends';
export { myRooms, saveMyRoom, removeMyRoom, markMyRoomFeed, sanitizeClear, KEY_ROOMS, MY_ROOMS_CAP } from './rooms';
export { unlocksFor, FREE_SEASON_TIERS, STREAK_MILESTONES } from './unlocks';
export { recordRun, bestScore, readBest, dayHistory, KEY_BEST, type RunRecordResult } from './days';
export { exportSaveCode, importSaveCode, decodeSaveCode, collectSave, SAVE_CODE_PREFIX, SAVE_KEYS, type ImportResult } from './savecode';
export { DAY1, dayNoOf, dateOfDay, isoWeekId, mondayOf, weeklyReadyAt, weekdayRoom, ymd, WEEKLY_READY_HOUR } from './dates';

/** Save code text for "Move to another device". */
export function exportSave(store: Store): Promise<string> {
  return exportSaveCode(store);
}
/** Import a save code; true when it replaced this device's save. */
export async function importSave(store: Store, code: string): Promise<boolean> {
  return (await importSaveCode(store, code)).ok;
}

/** Every ProgressApi member, ready for GameServices.progress. */
export const progress: Required<ProgressApi> = {
  recordRankedDay,
  recordCrimes,
  streakStatus,
  streakDetail,
  rapSheet,
  crimes,
  weekly,
  addRunXp,
  season,
  claimTier,
  parPaws,
  friends,
  saveFriend,
  hideFriend,
  myRooms,
  saveMyRoom,
  markMyRoomFeed,
  ownedCosmetics,
};
