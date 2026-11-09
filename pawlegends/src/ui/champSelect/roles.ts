/**
 * Champion select (docs/plans/moba/LANDING-PICK-UX.md §B2): the role filter's order, glyphs and names. The glyphs are
 * existing ability icons (ui/icons.ts), so no new art is needed; the names are the HERO_TEXT role labels. Words only:
 * the sim never reads this file.
 */
import { HERO_IDS, HEROES } from '../../data/heroes';
import type { HeroId, HeroRole, HeroSide } from '../../data/heroes/types';
import { HERO_TEXT, type IconId } from '../heroText';
import { SIM_VERSION } from '../../sim/version';

/** The role tabs, left to right (Wild Rift's order, ours: fighter first, support last). */
export const ROLE_ORDER: readonly HeroRole[] = Object.freeze(['fighter', 'marksman', 'tank', 'assassin', 'mage', 'support'] as HeroRole[]);

/** Each role's tab glyph. */
export const ROLE_ICON: Readonly<Record<HeroRole, IconId>> = Object.freeze({
  fighter: 'sword',
  marksman: 'arrows',
  tank: 'shield',
  assassin: 'slash',
  mage: 'spell',
  support: 'heart',
} as Record<HeroRole, IconId>);

/** "Marksman": the HERO_TEXT label of the first hero with that role. */
export const ROLE_NAME: Readonly<Record<HeroRole, string>> = Object.freeze(
  Object.fromEntries(ROLE_ORDER.map((r) => [r, HERO_TEXT[HERO_IDS.find((h) => HEROES[h].role === r) as HeroId]?.role ?? r])) as Record<HeroRole, string>,
);

/**
 * Sim v15 (DOGS-V15 §2): the sim version each newer hero shipped in. A tile is tagged New while its hero's version is
 * the live SIM_VERSION; the tag goes away in the next sim version.
 */
const HERO_SINCE: Readonly<Partial<Record<HeroId, number>>> = { rocket: 15, frankie: 15, domino: 15 };
export const isNewHero = (h: HeroId): boolean => HERO_SINCE[h] === SIM_VERSION;

/** The side tabs' and side badges' species colours: neutral, never an ally / enemy relation hue (side-colors.test).
 * The champion select draws them from here (`--side` on each tab and badge). */
export const SIDE_TAB_CSS: Readonly<Record<HeroSide, string>> = Object.freeze({ cat: '#f28bb0', dog: '#e8c27a' });
