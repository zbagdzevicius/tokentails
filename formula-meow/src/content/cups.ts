/**
 * Grand Prix cups (iteration 2; the modes lane owns this file). Ids are frozen in ids.ts. Each race is a track id
 * plus modifiers; points per place 15/12/10/8/6/4/2/1, ties broken by the better place in the last race.
 */
import { Modifier } from '../types';
import type { CupId, TrackId } from './ids';

export interface CupRace {
  track: TrackId;
  modifiers: number;
}

export interface CupDef {
  id: CupId;
  name: string;
  races: readonly CupRace[];
}

export const CUP_POINTS: readonly number[] = [15, 12, 10, 8, 6, 4, 2, 1];

export const CUPS: readonly CupDef[] = [
  {
    id: 'kibble',
    name: 'Kibble Cup',
    races: [
      { track: 'kitchen', modifiers: 0 },
      { track: 'laundry', modifiers: 0 },
      { track: 'rooftops', modifiers: 0 },
      { track: 'yarn', modifiers: 0 },
    ],
  },
  {
    id: 'catnip',
    name: 'Catnip Cup',
    races: [
      { track: 'cafe', modifiers: 0 },
      { track: 'shelter', modifiers: 0 },
      { track: 'kitchen', modifiers: Modifier.Mirror },
      { track: 'yarn', modifiers: Modifier.Mirror },
    ],
  },
];

export function cupById(id: string): CupDef | undefined {
  return CUPS.find((c) => c.id === id);
}
