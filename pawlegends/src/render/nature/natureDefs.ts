/**
 * Cat "Nature": the element of the Token Tails card a hero wears (CatSkin.element, from the player's real roster via
 * the embed bridge), shown as a small ambient effect. One definition per element, shared by the lobby turntable
 * (render/nature/lobbyNature.ts, heavy), the hero in a match (render/nature/matchNature.ts, light) and the card faces
 * in the DOM (ui/nature/nature.css, keyed on `data-nature`).
 *
 * Cosmetic only: nothing here is sim input, nothing imports src/sim, and a hero's stats never depend on its Nature.
 * Pure data (no three.js import), so the lobby and the match can share it from a lazy chunk.
 *
 * | Element  | Lobby and card (heavy)                         | In a match, on the body (light)  |
 * |----------|------------------------------------------------|----------------------------------|
 * | FIRE     | rising embers, flicker                         | 1 ember every 0.5 s              |
 * | ICE      | frost shards drifting down                     | 1 shard every 0.6 s              |
 * | ELECTRIC | short sparks, a rare arc flash                 | 1 spark every 0.5 s              |
 * | GRASS    | spinning, drifting leaves                      | 1 leaf every 0.7 s               |
 * | FAIRY    | hearts and four-point twinkles                 | 1 twinkle every 0.6 s            |
 * | DARK     | violet wisps (not additive), slow swirl        | 1 wisp every 0.7 s               |
 * | WIND     | pale streaks                                   | 1 streak every 0.6 s             |
 * | WATER    | rising bubbles                                 | 1 bubble every 0.6 s             |
 * | SAND     | drifting grains                                | 1 grain every 0.5 s              |
 * | STELLAR  | five-point star twinkles                       | 1 star every 0.6 s               |
 */
import type { CatTier, Element } from '../../meta/roster';
import type { SfxName } from '../../audio/sfx';
import type { Look } from '../cosmetics';
import { getSkin, isCardSkinId } from '../skins/skinStore';

/** Particle shape ids (render/fx/Particles.js `SHAPE`; copied so this module stays free of three.js, tested equal). */
export const NSHAPE = Object.freeze({ SOFT: 0, PUFF: 1, STAR4: 2, STAR5: 3, RING: 4, SPARK: 5, HEART: 6, FEATHER: 7, DROPLET: 8, SHARD: 9, STAR8: 10 });
/** Alpha-over-life curves (render/fx/Particles.js `FADE`). */
export const NFADE = Object.freeze({ LINEAR: 0, POP: 1, HOLD: 2, TWINKLE: 3, IN_OUT: 4 });

export interface NatureDef {
  element: Element;
  /** Main and accent colours (hex); a mote picks one of them. */
  primary: number;
  secondary: number;
  /** Particle shape id (NSHAPE). */
  shape: number;
  /** A second shape mixed in (FAIRY hearts and stars, ICE shards and stars); -1 = none. */
  shape2: number;
  /** Additive blending (glows); false for smoke and leaves, which must darken or stay opaque. */
  additive: boolean;
  /** Start vertical speed (m/s): > 0 rises, < 0 falls. */
  rise: number;
  /** Constant vertical pull (m/s², Particles.js sign: > 0 pulls down); keeps embers rising or snow falling. */
  gravity: number;
  /** Horizontal drift speed (m/s, random direction). */
  drift: number;
  /** Spin (rad/s). */
  spin: number;
  /** Life range (s). */
  life: readonly [number, number];
  /** Size range (m) in the lobby; the match uses MATCH_SIZE of it. */
  size: readonly [number, number];
  /** Size at death as a multiple of the start size. */
  sizeEnd: number;
  /** Velocity stretch (> 1 draws a streak along the motion: sparks, wind). */
  stretch: number;
  /** Peak alpha. */
  alpha: number;
  /** Lobby motes per second at Legendary (lower rungs scale by RUNG_RATE). */
  rateLobby: number;
  /** In-match motes per second on the hero's body. */
  rateMatch: number;
  /** Alpha curve (NFADE). */
  fade: number;
  /** Where the lobby motes start: 'low' (around the feet, rising) or 'high' (above the head, falling). */
  from: 'low' | 'high';
  /** The equip sound (an existing PL_SFX name). */
  sfx: SfxName;
  /** The `data-nature` value the card CSS keys on (ui/nature/nature.css): the element id. */
  css: string;
}

/** The in-match mote size as a share of the lobby size (the body motes stay small: gameplay reads first). */
export const MATCH_SIZE = 1;
/** Lobby rate per rung: every card has a Nature, a rarer one shows more of it. */
export const RUNG_RATE: Readonly<Record<CatTier, number>> = Object.freeze({ COMMON: 0.45, RARE: 0.6, EPIC: 0.8, LEGENDARY: 1 });

/** Lobby live-mote caps (Med / High, Low). */
export const LOBBY_MAX = 60;
export const LOBBY_MAX_LOW = 24;
/** Low quality in the lobby: rates × this. */
export const LOBBY_LOW_RATE = 0.3;
/** In-match live-mote caps: the player's own hero, another hero, and the own hero on Low. */
export const MATCH_SELF_MAX = 10;
export const MATCH_OTHER_MAX = 6;
export const MATCH_LOW_MAX = 4;

const S = NSHAPE;
const F = NFADE;

function def(element: Element, d: Omit<NatureDef, 'element' | 'css'>): NatureDef {
  return Object.freeze({ ...d, element, css: element });
}

export const NATURE: Readonly<Record<Element, NatureDef>> = Object.freeze({
  FIRE: def('FIRE', { primary: 0xff7a2e, secondary: 0xffd27a, shape: S.SOFT, shape2: -1, additive: true, rise: 0.9, gravity: -0.3, drift: 0.18, spin: 0, life: [0.9, 1.4], size: [0.108, 0.198], sizeEnd: 0.2, stretch: 1, alpha: 1, rateLobby: 26, rateMatch: 2, fade: F.IN_OUT, from: 'low', sfx: 'poof' }),
  ICE: def('ICE', { primary: 0xbff2ff, secondary: 0xffffff, shape: S.SHARD, shape2: S.STAR4, additive: true, rise: -0.35, gravity: 0.05, drift: 0.2, spin: 1.6, life: [1.6, 2.4], size: [0.126, 0.216], sizeEnd: 0.6, stretch: 1, alpha: 0.85, rateLobby: 14, rateMatch: 1 / 0.6, fade: F.IN_OUT, from: 'high', sfx: 'coin' }),
  ELECTRIC: def('ELECTRIC', { primary: 0xfff07a, secondary: 0x9fdcff, shape: S.SPARK, shape2: -1, additive: true, rise: 0.4, gravity: 0, drift: 1.6, spin: 0, life: [0.12, 0.22], size: [0.09, 0.144], sizeEnd: 0.5, stretch: 3.2, alpha: 1, rateLobby: 18, rateMatch: 2, fade: F.POP, from: 'low', sfx: 'magic' }),
  GRASS: def('GRASS', { primary: 0x6fd36f, secondary: 0xb9f27a, shape: S.FEATHER, shape2: -1, additive: false, rise: -0.4, gravity: 0.04, drift: 0.35, spin: 3, life: [1.8, 2.6], size: [0.18, 0.27], sizeEnd: 0.9, stretch: 1, alpha: 0.9, rateLobby: 9, rateMatch: 1 / 0.7, fade: F.IN_OUT, from: 'high', sfx: 'swipe' }),
  FAIRY: def('FAIRY', { primary: 0xff9fd6, secondary: 0xfff1fb, shape: S.HEART, shape2: S.STAR4, additive: true, rise: 0.25, gravity: 0, drift: 0.2, spin: 1, life: [0.9, 1.4], size: [0.126, 0.216], sizeEnd: 0.6, stretch: 1, alpha: 0.9, rateLobby: 14, rateMatch: 1 / 0.6, fade: F.TWINKLE, from: 'low', sfx: 'levelup' }),
  DARK: def('DARK', { primary: 0x8a5cd6, secondary: 0x3c2a63, shape: S.PUFF, shape2: -1, additive: false, rise: 0.3, gravity: -0.05, drift: 0.25, spin: 0.8, life: [1.6, 2.2], size: [0.324, 0.504], sizeEnd: 1.8, stretch: 1, alpha: 0.42, rateLobby: 8, rateMatch: 1 / 0.7, fade: F.IN_OUT, from: 'low', sfx: 'poof' }),
  WIND: def('WIND', { primary: 0xe6fff0, secondary: 0xb6f0c8, shape: S.FEATHER, shape2: -1, additive: true, rise: 0.15, gravity: 0, drift: 1.4, spin: 0, life: [0.6, 0.9], size: [0.09, 0.144], sizeEnd: 0.6, stretch: 4, alpha: 0.7, rateLobby: 12, rateMatch: 1 / 0.6, fade: F.IN_OUT, from: 'low', sfx: 'dash' }),
  WATER: def('WATER', { primary: 0x7cc4ff, secondary: 0xd9f1ff, shape: S.RING, shape2: S.DROPLET, additive: true, rise: 0.5, gravity: -0.15, drift: 0.12, spin: 0, life: [1.2, 1.8], size: [0.108, 0.216], sizeEnd: 1.2, stretch: 1, alpha: 0.8, rateLobby: 14, rateMatch: 1 / 0.6, fade: F.HOLD, from: 'low', sfx: 'pickup' }),
  SAND: def('SAND', { primary: 0xe8c27a, secondary: 0xfff0c8, shape: S.SOFT, shape2: -1, additive: true, rise: 0.05, gravity: 0.02, drift: 0.6, spin: 0, life: [1.4, 2], size: [0.054, 0.09], sizeEnd: 0.8, stretch: 1, alpha: 0.85, rateLobby: 26, rateMatch: 2, fade: F.IN_OUT, from: 'low', sfx: 'swipe' }),
  STELLAR: def('STELLAR', { primary: 0xfff1a8, secondary: 0xc5bdff, shape: S.STAR5, shape2: S.STAR4, additive: true, rise: 0.12, gravity: 0, drift: 0.12, spin: 0.6, life: [0.9, 1.5], size: [0.144, 0.252], sizeEnd: 0.5, stretch: 1, alpha: 0.95, rateLobby: 12, rateMatch: 1 / 0.6, fade: F.TWINKLE, from: 'low', sfx: 'levelup' }),
});

/** The Nature a look shows: the worn card skin's element and rung, or null (no card, or a card not loaded). */
export function natureOfLook(look: Look | null | undefined): { element: Element; rung: CatTier } | null {
  const coat = look?.coat;
  if (!isCardSkinId(coat)) return null;
  const s = getSkin(coat);
  return s ? { element: s.element, rung: s.rung } : null;
}

/** Lobby motes per second for an element at a rung and quality (0 under reduced motion). */
export function lobbyRate(el: Element, rung: CatTier, low: boolean, reduced: boolean): number {
  if (reduced) return 0;
  return NATURE[el].rateLobby * RUNG_RATE[rung] * (low ? LOBBY_LOW_RATE : 1);
}

/** The in-match live-mote cap for one hero (0 = none): own hero always, others only on Med / High without reduced motion. */
export function matchCap(self: boolean, low: boolean, reduced: boolean): number {
  if (self) return low ? MATCH_LOW_MAX : MATCH_SELF_MAX;
  if (low || reduced) return 0;
  return MATCH_OTHER_MAX;
}
