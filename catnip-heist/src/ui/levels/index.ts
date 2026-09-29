/** Campaign UI: level select, results strip and the progress store. */
export { createLevelSelect, levelName, pathSlot, type LevelSelect, type LevelSelectOptions } from './LevelSelect';
export { decorateResults, type ResultsExtras } from './results';
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
