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
});

export const coatSig = (coatId: string | null | undefined): CoatSig | null => (coatId ? (COAT_VFX[coatId] ?? null) : null);

/** The store's words for what a coat adds to the model ("a sun halo, a sun medallion and …"), or ''. */
export function coatPartsLine(coatId: string | null | undefined): string {
  const p = coatSig(coatId)?.parts ?? [];
  return p.length < 2 ? (p[0] ?? '') : `${p.slice(0, -1).join(', ')} and ${p[p.length - 1]}`;
}
