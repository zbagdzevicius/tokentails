// Lifted from Pink Paw Knight (swordcat) at commit 7714dcb: src/characters/palette.js
// Licence: all rights reserved, pending founder decision (POC.md §17, GDD §12 decision #3). Not MIT.
// Changes: relative imports rewritten by tools/lift-ppk.mjs; any later hand edit is marked "pawlegends:".
// Palette tokens for every procedural character (research/art.md §6.2, §7, §11; GAME_DESIGN §3, §13.5, §18.3).
// Pure data: safe to import in node tests.

/**
 * art.md §6.2 game palette (Swordcat + shared), with the ART_WARM_SPEC §2.6 "hero lifts" applied (warmer, brighter,
 * never 90s-dark): ginger, cream, steel, mail, brass, cape, bow and leather all moved up the value ladder.
 */
export const PAL = Object.freeze({
  // Swordcat
  furGinger: '#E89A55', furGingerLight: '#FFD3A0', furGingerDeep: '#C66E32', furCream: '#FFF3E2', furCreamShade: '#D9C8B2',
  earInner: '#EBB0A6', nose: '#C97F7A', mouth: '#5A3A34', irisInner: '#8DB3C2', irisOuter: '#3F6170', irisRing: '#1B262C',
  pupil: '#0D1114', eyeLine: '#2A1E18',
  bow: '#FF9EC0', bowLight: '#FFD2DE', bowShade: '#D9668A', bowKnot: '#F28AAE', whisker: '#F5EEE6',
  steel: '#C9D0D8', steelDark: '#8E96A2', mail: '#7C8494', brass: '#E8C27A', brassDeep: '#B88E46',
  leather: '#8A5A36', leatherDark: '#6A4430', capeRed: '#D9323F', capeLining: '#9A1F3A', capeSheen: '#F06A72',
  capeCream: '#E2D6C0', capeCreamHem: '#CDBB9C', blade: '#B6BCC4',
  holyCore: '#FFF6DA', holy: '#FFE3A3', holyEdge: '#E8A95A', holyRim: '#FFD98A', sparkle: '#FFF1C4', sparkleWarm: '#FFD57A',
  tuftRoot: '#EFE3D2', tuftTip: '#FFF6EA',
  // armour variants
  rust: '#8E5A3A', rustyPlate: '#8C8F93', ironDark: '#2E3036', bloodTrim: '#8E1B22', potMetal: '#8C8F88',
  // misc cloth / wood / food
  wood: '#8A6440', woodDark: '#5A3E2B', straw: '#D9BC6A', milk: '#F7F4EC', paper: '#EFE2C4', paperOld: '#D8C49A',
  waxRed: '#A3202C', tunic: '#9C7B57', linen: '#E9E2D2',
  // Token Tails look (docs/TOKENTAILS-PLAN.md §2.1 / §2.2): Clementine's ivory coat, crimson eyes, gold trim and the
  // gold ':3' coin. New keys only: the ginger keys above stay for the other cats (Sir Marmalade, villagers).
  furIvory: '#F3EEE6', furIvoryLight: '#FFFFFF', furIvoryShade: '#DCD3C8', earInnerSalmon: '#F2A08C', noseTT: '#F08C9A',
  irisCrimson: '#B3212F', irisCrimsonDeep: '#5E0E18', irisCrimsonInner: '#E0525C', irisCrimsonRing: '#2E070C',
  trimGold: '#E2C05A', goldHi: '#FFCC55', coinGold: '#E2C05A', coinGoldDeep: '#B8902E', coinInk: '#5E0E18',
});

/** Cape colours (GAME_DESIGN §13.5; §13.3 shop capes). id → { color, lining, sheen, hem }. */
export const CAPES = Object.freeze({
  cream:     { color: '#CDBB98', lining: '#A08C68', sheen: '#EADCC0', hem: '#B09A72' },   // Marmalade's faded cape
  red:       { color: '#D9323F', lining: '#B8505C', sheen: '#EC7A80', hem: '#E2C05A' },      // royal red, Token Tails gold trim (PAL.trimGold); TT3: a rosy lining (the #9A1F3A maroon read as a dark band); TT4: a lining of the same hue, and Cape.js shades the back rounder with soft folds (it read flat and loud)
  memeWhite: { color: '#FFF3E2', lining: '#F2DCC8', sheen: '#FFFFFF', hem: '#FF9EC0' },      // id kept (save / shop / unlock); ivory + pink hem stripe
  blue:      { color: '#3F6FB5', lining: '#25426E', sheen: '#8DB0E8', hem: '#D9B26A' },
  green:     { color: '#5E7F3E', lining: '#3A4F26', sheen: '#A9C57E', hem: '#D9B26A' },
  midnight:  { color: '#3A3F5E', lining: '#2A2E48', sheen: '#7C84B8', hem: '#C9CED8' },   // §13.3 Midnight, lifted (no near-black, ART §2.3)
  gold:      { color: '#D9B26A', lining: '#A87C32', sheen: '#FFE9B0', hem: '#FFF1C4' },
  pilgrim:   { color: '#E2D6C0', lining: '#C4B497', sheen: '#FFF6E6', hem: '#CDBB9C' },
  black:     { color: '#4A3A5E', lining: '#3A2E4A', sheen: '#7A6890', hem: '#C2353B' },   // villains' capes: soft plum
  rust:      { color: '#7A3B22', lining: '#4D2414', sheen: '#B5714E', hem: '#C9A26A' },
});

/** Companion signature colours (GAME_DESIGN §3.3, art.md §13 HUD). */
export const SIGNATURE = Object.freeze({ mochi: '#3F6FB5', sage: '#5E7F3E', clover: '#F6F1E8', earlgrey: '#5C4A9C', pip: '#C2353B' });

/** Villager coat presets (art.md §7: ginger, cream, grey, black, white, brown tabby, tortie, bicolour). */
export const VILLAGER_COATS = Object.freeze({
  ginger:     { pattern: 'mackerel', base: '#D08A4E', deep: '#A65E2E', light: '#F0C08F', cream: '#EFE3D2', stripe: 0.35 },
  cream:      { pattern: 'tabby', base: '#E3C9A2', deep: '#C9A47A', light: '#F6E6CC', cream: '#F4ECE0', stripe: 0.2 },
  grey:       { pattern: 'mackerel', base: '#8D8F93', deep: '#4C4E52', light: '#C3C5C8', cream: '#E4E2DE', stripe: 0.4 },
  black:      { pattern: 'solid', base: '#1E1F24', deep: '#121317', light: '#3A3C44', cream: '#2A2B31', stripe: 0 },
  white:      { pattern: 'solid', base: '#E6E1D8', deep: '#CFC8BC', light: '#F2EEE8', cream: '#EAE6DF', stripe: 0 },
  brownTabby: { pattern: 'mackerel', base: '#8A6A4A', deep: '#3E2C1E', light: '#C4A27E', cream: '#E8DCCB', stripe: 0.5 },
  tortie:     { pattern: 'calico', base: '#3A2C26', deep: '#1E1714', light: '#6B4B3A', cream: '#4A3A30', patches: ['#C9783A', '#E2A060'], white: null, stripe: 0 },
  bicolour:   { pattern: 'tuxedo', base: '#4A4C52', deep: '#2A2B30', light: '#7A7D84', cream: '#E4DFD6', white: '#E4DFD6', stripe: 0 },
});

/** Accessory colour pool for villagers. */
export const VILLAGER_CLOTH = Object.freeze(['#B0503C', '#3F6FB5', '#5E7F3E', '#D9B26A', '#7A5C9C', '#C2353B', '#E9E2D2', '#8C6A4A', '#4E8C8A']);

/**
 * Mischief family (ART_WARM_SPEC §2.6, mirrored from enemies/props.js ENEMY_PAL for the beast heads): cute-menacing
 * plums and slates, top colours (mustard, teal) that read from above, nothing darker than luma 0.12 except pupils.
 */
export const MISCHIEF = Object.freeze({
  mischiefPlum: '#6E5A86', mischiefPlumLight: '#9C88B4', slate: '#5D6C88', slateLight: '#8E9CB8', mustard: '#E0B043',
  teal: '#3FA59A', olive: '#8C9A48', oliveTop: '#B7C46A', cork: '#C99A6A', bossCrown: '#F2D06B', cream: '#F6EFE4', peach: '#D9A494',
});
/** Phase W looks (WARM_ADVENTURE_SPEC §2, §8): Squeakybone bone + red rubber knob, Sir Sacky, the Big Squeaky Bone. */
export const WARM_LOOKS = Object.freeze({
  squeakyBone: '#F3E6C8', squeakyKnob: '#E46A5A', sirSacky: '#E8A46B', sirSackyStitch: '#A8643A', wobbleSmile: '#4A2A1F',
});
