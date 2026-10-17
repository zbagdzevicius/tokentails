/**
 * Meta screens (W2-META, GDD 8): archive, Rap Sheet, season track, settings, friends board, weekly card,
 * consent banner and my rooms. Pure DOM driven by props; every mount returns an unmount that removes its nodes
 * and every document listener it added.
 */
import './meta.css';
import type { MetaApi } from '../types';
import { mountArchive } from './archive';
import { mountBoard } from './board';
import { mountFeed } from './feed';
import { mountConsent } from './consent';
import { mountFriends } from './friends';
import { mountRapSheet } from './rapsheet';
import { mountMyRooms } from './rooms';
import { mountSeason } from './season';
import { mountSettings } from './settings';
import { mountWeekly } from './weekly';

export const meta: MetaApi = {
  board: mountBoard,
  feed: mountFeed,
  archive: mountArchive,
  rapSheet: mountRapSheet,
  season: mountSeason,
  settings: mountSettings,
  friends: mountFriends,
  weekly: mountWeekly,
  consent: mountConsent,
  myRooms: mountMyRooms,
};

export { archiveLocked } from './archive';
export { bragLine } from './rapsheet';
export { tierState, type TierState } from './season';
export { replayOnly } from './friends';
export { weeklySentence } from './weekly';
export { parPaws } from './shared';
export default meta;
