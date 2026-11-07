/** Render palette: team colours, hero coats, relation colours (render only). */
import { COLOR_CSS as MEATBALL_CSS } from './chars/heroes/meatball';
import { COLOR_CSS as PIXEL_CSS } from './chars/heroes/pixel';
import { COLOR_CSS as DUCHESS_CSS } from './chars/heroes/duchess';
import { COLOR_CSS as STILTS_CSS } from './chars/heroes/stilts';
import { COLOR_CSS as NUGGET_CSS } from './chars/heroes/nugget';
import { COLOR_CSS as MARSHMALLOW_CSS } from './chars/heroes/marshmallow';
import { COLOR_CSS as BRAVO_CSS } from './chars/heroes/bravo';
import { COLOR_CSS as CHILI_CSS } from './chars/heroes/chili';
import { COLOR_CSS as HOWLER_CSS } from './chars/heroes/howler';
import { COLOR_CSS as ROCKET_CSS } from './chars/heroes/rocket';
import { COLOR_CSS as FRANKIE_CSS } from './chars/heroes/frankie';
import { COLOR_CSS as DOMINO_CSS } from './chars/heroes/domino';

export const TEAM = Object.freeze({
  /** Purrhaven: cream and rose. */
  0: Object.freeze({ main: 0xff6f91, second: 0xfff3dc, deep: 0xc94a72, name: 'Purrhaven' }),
  /**
   * Woof: ochre mustard and brown (audit GFX-01: the old navy 0x3d5a9e sat next to RELATION.ally blue, so enemy dog
   * towers read as ours; blue and red stay the relation colours only). The main stays just under the gold "you" hue
   * family (skins/registry.ts isGoldFamily, 35-62°).
   */
  1: Object.freeze({ main: 0xb5762b, second: 0x5b3a1e, deep: 0x6e4520, name: 'Woof' }),
  /** Neutral (rats, Pudding). */
  2: Object.freeze({ main: 0xb8a27a, second: 0xf0e2c0, deep: 0x7d6b4c, name: 'Wild' }),
});

/**
 * Relation colours, ONE encoding everywhere (rings, nameplates, bars, minimap, towers, kill feed), the MOBA convention:
 * our team blue, the enemy red, yellow only for "you", whichever species the human plays (team cloth, bases and minions
 * still wear their species' style: TEAM, dressTeam). `danger` is a hotter red for threats that are not a team read
 * (wind-up telegraphs, tower range).
 */
export const RELATION: { readonly self: number; readonly ally: number; readonly enemy: number; readonly neutral: number; readonly danger: number } = {
  self: 0xffd34d,
  ally: 0x3d8bff,
  enemy: 0xe8414b,
  neutral: 0xf0c27a,
  danger: 0xff4d5e,
};

export const RELATION_CSS: { readonly self: string; readonly ally: string; readonly enemy: string; readonly neutral: string; readonly danger: string } = {
  self: '#ffd34d',
  ally: '#4da0ff',
  enemy: '#ff4f58',
  neutral: '#f0c27a',
  danger: '#ff4d5e',
};

/** Minion bars: the relation hue, paler and thinner than a hero's (a minion bar never reads as a hero). */
export const MINION_BAR_CSS: { readonly ally: string; readonly enemy: string } = { ally: '#9cc9ff', enemy: '#ff9ea3' };

let sideSwap = false;

/** True while our team is the dogs (round 2: the human picked a dog). */
export function sidesSwapped(): boolean {
  return sideSwap;
}

/**
 * Cats vs dogs: the cats always wear rose, the dogs Woof ochre and brown (cloth, bases, minions: dressTeam). The
 * relation colours (ally blue, enemy red: rings, bars, score, the minimap's marks and base tint) never swap. Render only.
 */
export function setSideSwap(on: boolean): void {
  sideSwap = on;
  if (typeof document !== 'undefined' && document.documentElement) document.documentElement.dataset.sides = on ? 'dogs' : 'cats';
}

export const HERO_COLOR_CSS = Object.freeze({
  clem: '#ff9f6b',
  sage: '#8fb7d9',
  brutus: '#d6a36a',
  cacklejaw: '#9a7ac2',
  lambo: '#a8b0bc',
  aviete: '#ffe24d',
  bengas: '#ff8a5c',
  gabe: '#8fd0ff',
  // sim v11 original cats (their render modules own the colour)
  meatball: MEATBALL_CSS,
  pixel: PIXEL_CSS,
  duchess: DUCHESS_CSS,
  stilts: STILTS_CSS,
  // sim v14 original dogs (their render modules own the colour)
  nugget: NUGGET_CSS,
  marshmallow: MARSHMALLOW_CSS,
  bravo: BRAVO_CSS,
  chili: CHILI_CSS,
  howler: HOWLER_CSS,
  // sim v15 dogs
  rocket: ROCKET_CSS,
  frankie: FRANKIE_CSS,
  domino: DOMINO_CSS,
});

let team0Dogs = false;

/** Round 2: team 0 (slot 0's team) are the dogs. Team-coloured things (cloth, bolts, banners) follow the species. */
export function setTeam0Dogs(on: boolean): void {
  team0Dogs = on;
}

/** The TEAM[] style a sim team wears: the cat rose for the cats, the Woof ochre for the dogs, whichever slot they play. */
export function dressTeam(team: number): 0 | 1 {
  const t = (team === 1 ? 1 : 0) as 0 | 1;
  return (team0Dogs ? 1 - t : t) as 0 | 1;
}
