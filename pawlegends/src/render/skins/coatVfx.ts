/**
 * The signature of each Epic and Legendary coat (gaps2 coats-models), data only so the store can read it cheaply:
 * - `glow` / `accent`: the colours the coat's idle sparkles, motifs, cast and hit tints and Legendary bursts take in a
 *   match, picked from the coat's painted art (skins library, brandbook v6) instead of the palette's most colourful
 *   swatch. Another player's hero still draws them team-safe (effectKit `safe`: never gold, never the opposing hue).
 * - `parts`: the pieces the coat adds to the model (built in render/chars/coatParts.ts), for the store line.
 * Render only.
 */
import { S1_PLUS_COAT } from '../../money/catalog';

export interface CoatSig {
  /** The coat glow (effectKit SkinFxProfile.tint: sparkles, motifs, ability tints, the paw stamp). */
  glow: number;
  /** The second colour (SkinFxProfile.accent). */
  accent: number;
  /** What the coat adds to the model, in words (render/chars/coatParts.ts builds them). */
  parts: readonly string[];
}

export const COAT_VFX: Readonly<Record<string, CoatSig>> = Object.freeze({
  // Thunderpaw: the yellow lightning on the shield and the storm-blue crackle round it
  'coat.brutus.store_thunderpaw': { glow: 0xffe24d, accent: 0x8fd8ff, parts: ['a lightning shield', 'lightning helmet crests', 'a bolt emblem on his cape', 'a bolt on his blade'] },
  // Sunforged: the sunrise behind her and her magenta cape
  'coat.clem.s1_sunforged': { glow: 0xffb347, accent: 0xff6f91, parts: ['a sun halo', 'a sun medallion', 'sun-ray pauldrons', 'a magenta battle skirt'] },
  // Bloomtail: pink petals and new leaves
  'coat.sage.store_bloomtail': { glow: 0xff8fc8, accent: 0x9be07a, parts: ['a flower crown', 'leaf pauldrons', 'a bloom on her tail'] },
  // Eclipse: the violet corona and the gold ring of the eclipse
  [S1_PLUS_COAT]: { glow: 0xa98aff, accent: 0xffd34d, parts: ['an eclipse orb at her shoulder', 'an amethyst tiara crest', 'a rose brooch'] },
  // Moonwhisker: lavender night and the moon's pale gold
  'coat.pixel.store_moonwhisker': { glow: 0xb9a8ff, accent: 0xfff1a8, parts: ['a crescent moon antenna', 'gold stars on her box', 'a star on her tail'] },
  // Frostbell: ice blue snow and the mustard knit beanie
  'coat.marshmallow.store_frostbell': { glow: 0x9fe8ff, accent: 0xe8b04a, parts: ['a mustard knit cuff', 'a snowflake pin', 'a frost bell', 'an ice crystal on her tail'] },
  // Club Sandwich (gaps4): cheese gold and lettuce green
  'coat.clem.store_club_sandwich': { glow: 0xffcf3a, accent: 0x7ccf4a, parts: ['a club sandwich hat with a toothpick flag', 'a lettuce ruff', 'toast pauldrons', 'a pickle on her blade'] },
  // Kebab King (gaps4): grill flame orange and a king's gold
  'coat.frankie.store_kebab_king': { glow: 0xff8a3a, accent: 0xffd34d, parts: ['a gold kebab crown', 'a kebab skewer along his back', 'a pepper on his tail'] },
  // gaps5 skins v2: pepperoni red and basil; bumper cyan and dock white; cheese and pickle; lantern red and festival
  // gold; strawberry pink and sprinkle blue
  'coat.domino.store_pizzaiolo': { glow: 0xff5a3a, accent: 0xffd34d, parts: ['a chef hat', 'pepperoni spots', 'a pizza cutter', 'cheese strings'] },
  'coat.nugget.store_robo_vac': { glow: 0x3fd8ff, accent: 0xf4f8ff, parts: ['a robot vacuum he rides', 'aviator goggles', 'a dock antenna'] },
  'coat.meatball.store_drive_thru': { glow: 0xffcf3a, accent: 0x7ccf4a, parts: ['a sesame bun hat', 'a patty, tomato, lettuce and melting cheese', 'pickle shoulder pads', 'a paper takeout bag'] },
  'coat.frankie.store_paper_parade': { glow: 0xff4a3a, accent: 0xffd34d, parts: ['a paper dragon mask with antlers and a mane', 'paper lanterns', 'a parade dragon body that grows during the match'] },
  // gaps6 coat drop: boardroom gold and power-tie red; ketchup and mustard; golden tray and cheddar
  'coat.brutus.store_chairman': { glow: 0xffc83a, accent: 0xe8304a, parts: ['a gold helmet band (the plume stays)', 'a power tie and a gold pen', 'a stock-chart arrow and a gold office-chair mech that grow during the match'] },
  'coat.meatball.store_double_stack': { glow: 0xe8302a, accent: 0xffc83a, parts: ['a sesame bun helmet', 'a bun shell over his belly', 'a cheese-slice collar', 'a lettuce cape', 'a ketchup trail'] },
  'coat.meatball.store_mega_meal': { glow: 0xffcf3a, accent: 0xe8304a, parts: ['a slider bun hat', 'a burger tower that stacks to five patties during the match', 'a golden tray'] },
  'coat.marshmallow.store_soft_serve': { glow: 0xff8fc8, accent: 0x8fd8ff, parts: ['a soft serve swirl with a cherry', 'rainbow sprinkles', 'a waffle cone collar'] },
});

export const coatSig = (coatId: string | null | undefined): CoatSig | null => (coatId ? (COAT_VFX[coatId] ?? null) : null);

/** The store's words for what a coat adds to the model ("a sun halo, a sun medallion and …"), or ''. */
export function coatPartsLine(coatId: string | null | undefined): string {
  const p = coatSig(coatId)?.parts ?? [];
  return p.length < 2 ? (p[0] ?? '') : `${p.slice(0, -1).join(', ')} and ${p[p.length - 1]}`;
}
