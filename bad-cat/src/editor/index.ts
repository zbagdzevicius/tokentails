/**
 * Room Maker public API (GDD 6.4). Loaded lazily by the shell: `GameServices.loadEditor = () => import('./editor')
 * .then((m) => m.editor)`. Nothing here touches the DOM, WebGL or WebAudio at module top level.
 */
import type { ContentApi, EditorApi, RoomDef, RoomMakerOptions, RoomMakerResult } from '../types';
import { check as checkRoom, type CheckOptions, type CheckResult } from './check';
import { openRoomMaker, type RoomMakerOptionsX } from './RoomMaker';
import './editor.css';

export async function open(host: HTMLElement, opts: RoomMakerOptions | RoomMakerOptionsX): Promise<RoomMakerResult> {
  return openRoomMaker(host, opts);
}

/** Pure: GDD 6.4 limits plus the content validator. `bad` (extra) lists the offending cells. */
export function check(room: RoomDef, content: ContentApi, opts?: CheckOptions): CheckResult {
  return checkRoom(room, content, opts);
}

export const editor: EditorApi = { open, check };
export default editor;

export type { CheckOptions, CheckResult } from './check';
export type { RoomMakerOptionsX, RoomMakerDebug, MakerStep } from './RoomMaker';
export { shellThumb } from './RoomMaker';
export { History, HISTORY_LIMIT } from './history';
export { MAKER_MAX_PROPS, MAKER_MAX_BUDGET, MAKER_TARGETS, CLEAR_MIN_TARGETS, ADMIN_MAX_PROPS, propCost, roomBudget, budgetMeter, fitsBudget } from './budget';
export { PALETTE_TABS, EXCLUDED_KINDS, tabOf, kindsForTab, placeableKinds, isPlaceable, kindIcon, kindHint, type PaletteTab } from './palette';
export {
  DRAFT_ID,
  newDraft,
  switchShell,
  editableCopy,
  placeProp,
  moveProp,
  rotateProp,
  deleteProp,
  resizeCloth,
  toggleTarget,
  canTarget,
  targetCount,
  setSpawn,
  defaultSpawn,
  propAt,
  reservedReason,
  routineChoices,
  gameplayKey,
  type EditResult,
} from './placement';
export {
  TITLE_MAX,
  AUTHOR_MAX,
  ANCESTORS_MAX,
  UNTITLED,
  ANON,
  CARD_W,
  CARD_H,
  CARD_TAGLINE,
  SPEED_BUILD_MS,
  cleanTitle,
  cleanAuthor,
  remixAncestors,
  remixLine,
  formatBuildTime,
  speedClock,
  speedBadge,
  finalizeRoom,
  makeRoomCard,
  exportJson,
} from './publish';
