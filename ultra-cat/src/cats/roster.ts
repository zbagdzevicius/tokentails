// Pure roster data (no three, no DOM): names, blurbs, voices, UI colours and base stats per GDD.md "Cat roster".
// defs.ts adds the model builders, ULTRA abilities and passive hooks. Owned by the CATS lane.
import { CAT_ORDER, type CatId, type CatStats } from '../core/types';
import { CAT_COSTS } from './economy';
import { TABBY_STATS } from './stats';

export interface CatInfo {
  id: CatId;
  name: string;
  blurb: string;
  ultraName: string;
  voice: number;
  color: string;
  cost: number;
  base: CatStats;
  passive: string; // one line for the cat-select card
}

const S = (o: Partial<CatStats>): CatStats => ({ ...TABBY_STATS, ...o });

export const ROSTER: Record<CatId, CatInfo> = {
  tabby: {
    id: 'tabby',
    name: 'Marmalade',
    blurb: 'Orange tabby. One brain cell, two laser eyes.',
    ultraName: 'LASER',
    voice: 1,
    color: '#ff8a2a',
    cost: CAT_COSTS.tabby,
    base: S({}),
    passive: 'Lasers lock on to helicopters.',
  },
  chonk: {
    id: 'chonk',
    name: 'Big Biscuit',
    blurb: 'A loaf of pure mass. Every swat is a small earthquake.',
    ultraName: 'FLOP',
    voice: 0.7,
    color: '#ffb35a',
    cost: CAT_COSTS.chonk,
    base: S({ walk: 28, zoom: 52, turn: 5.5, radius: 16, headY: 56, scale: 1.25, swatCd: 0.4, swatRadius: 20, swatPower: 1.25, pounceCd: 2.4, pounceR: 44, patienceMax: 130, wetResist: 0.8, stunResist: 1.2, ultraCharge: 0.9, ultraTime: 5 }),
    passive: 'Swats shake the ground.',
  },
  shadow: {
    id: 'shadow',
    name: 'Midnight',
    blurb: 'Black cat. Bad luck for buildings. Gone before the water lands.',
    ultraName: 'DASH',
    voice: 1.1,
    color: '#a98bff',
    cost: CAT_COSTS.shadow,
    base: S({ walk: 40, zoom: 74, turn: 9, radius: 12, swatCd: 0.26, swatRadius: 15, swatPower: 0.9, pounceCd: 1.6, patienceMax: 85, wetResist: 1.1, stunResist: 0.7, ultraCharge: 1.15, ultraTime: 6 }),
    passive: 'Every swat is a tiny lunge.',
  },
  siamese: {
    id: 'siamese',
    name: 'Duchess',
    blurb: 'Siamese. Has opinions. Shares them at 140 decibels.',
    ultraName: 'YOWL',
    voice: 1.3,
    color: '#7fe3ff',
    cost: CAT_COSTS.siamese,
    base: S({ walk: 36, zoom: 64, turn: 7.5, swatCd: 0.3, swatReach: 28, stunResist: 0.5, ultraCharge: 1.1, ultraTime: 6 }),
    passive: 'People scatter twice as far.',
  },
};

export const ROSTER_LIST: CatInfo[] = CAT_ORDER.map((id) => ROSTER[id]);
