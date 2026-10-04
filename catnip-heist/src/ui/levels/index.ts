/** Campaign UI: level select, results strip and the progress store. */
export { createLevelSelect, levelName, pathSlot, type LevelSelect, type LevelSelectOptions } from './LevelSelect';
export { decorateResults, type ResultsExtras } from './results';
export { rescueHudChip } from './rescue-view';
export { getLevelPreview, type LevelPreview } from './previews';
export {
  getRescueCat,
  getRescueCatCached,
  loadRescueCats,
  rescueName,
  rescueStatusLabel,
  withRescueName,
  RESCUE_SHELTER_LINE,
  RESCUE_SHELTER_NAME,
  type RescueCat,
} from './rescue-cats';
export {
  ProgressStore,
  PROGRESS_KEY,
  PROGRESS_VERSION,
  STAR_CLEAN,
  STAR_COINS,
  STAR_RULES,
  STAR_WIN,
  defaultStorage,
  parseProgress,
  runStars,
  starCount,
  type LevelRecord,
  type ProgressData,
  type RecordOutcome,
  type StorageLike,
} from './progress';
