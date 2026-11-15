/**
 * The coats' signature effect themes and their words (gaps3 coat-fx), data only so the store and the Heroes browser
 * read them without three.js. The drawing is render/skins/coatFx.ts.
 */
import type { CatTier } from '../../meta/roster';
import { S1_PLUS_COAT } from '../../money/catalog';

export type CoatFxKind = 'ult' | 'recall' | 'takedown';
export type CoatTheme = 'thunder' | 'sun' | 'bloom' | 'eclipse' | 'moon' | 'frost' | 'deli' | 'grill' | 'pizza' | 'vac' | 'burger' | 'parade' | 'softserve';

/** Each themed coat: its theme, and the words the store and the Heroes browser show (looks only, never a number). */
export interface CoatThemeDef {
  theme: CoatTheme;
  ult: string;
  recall: string;
  takedown: string;
}

export const COAT_THEMES: Readonly<Record<string, CoatThemeDef>> = Object.freeze({
  'coat.brutus.store_thunderpaw': { theme: 'thunder', ult: 'Three lightning bolts strike the ring', recall: 'Storm crackle, and a bolt brings him home', takedown: 'A bolt strikes the fallen' },
  'coat.clem.s1_sunforged': { theme: 'sun', ult: 'A sun rises and its rays sweep out', recall: 'A sun halo, and a sunrise where she lands', takedown: 'A sunburst over the fallen' },
  'coat.sage.store_bloomtail': { theme: 'bloom', ult: 'A petal storm round an opening bloom', recall: 'Petals drift down, and a bloom where she lands', takedown: 'A flower opens over the fallen' },
  [S1_PLUS_COAT]: { theme: 'eclipse', ult: 'A violet corona and a gold eclipse ring', recall: 'An eclipse orb circles, then the ring', takedown: 'A dark ring and gold motes' },
  'coat.pixel.store_moonwhisker': { theme: 'moon', ult: 'A star shower under a pale moon', recall: 'Stars twinkle round her, then fall', takedown: 'Stars fall on the fallen' },
  'coat.marshmallow.store_frostbell': { theme: 'frost', ult: 'Ice shards, snow and the frost bell', recall: 'Snow falls round her, then a frost ring', takedown: 'Shards burst and the bell rings' },
  'coat.clem.store_club_sandwich': { theme: 'deli', ult: 'A giant club sandwich stacks up, crumbs fly', recall: 'Crumbs drift down, and a sandwich lands with her', takedown: 'A toothpick flag pins the fallen' },
  'coat.frankie.store_kebab_king': { theme: 'grill', ult: 'A ring of sizzling skewers and grill flames', recall: 'Steam rises from the grill, then a flame ring', takedown: 'A skewer drops on the fallen, spice flies' },
  // gaps5 skins v2 (the gallery's top five)
  'coat.domino.store_pizzaiolo': { theme: 'pizza', ult: 'Stretchy cheese strings and a pepperoni storm', recall: 'He spins pizza dough overhead, then lands on a pizza', takedown: 'A pizza box drops on the fallen' },
  'coat.nugget.store_robo_vac': { theme: 'vac', ult: 'The vacuum whirls and sucks up dust in a spiral', recall: 'He parks on the charging dock, then zooms home', takedown: 'A dust bunny poofs off the fallen' },
  'coat.meatball.store_drive_thru': { theme: 'burger', ult: 'A burst of fries and a sizzling patty', recall: 'A drive-thru window, ding, order up', takedown: 'Fries burst from the fallen' },
  'coat.frankie.store_paper_parade': { theme: 'parade', ult: 'The paper dragon stretches to twelve lanterns, fireworks pop', recall: 'Paper lanterns rise, then fireworks where he lands', takedown: 'A firework bursts over the fallen' },
  'coat.marshmallow.store_soft_serve': { theme: 'softserve', ult: 'A brain-freeze swirl of rainbow sprinkles', recall: 'Sprinkles fall, then a melty puddle where she lands', takedown: 'A scoop drops on the fallen' },
});

/** The shared Rare set's words. */
export const RARE_SET: Readonly<{ ult: string; recall: string; takedown: string }> = Object.freeze({
  ult: 'A ring of motifs in the coat colour',
  recall: 'A motif ring at the nap, and one where it lands',
  takedown: 'A three-motif stamp in the coat pattern',
});

export const coatTheme = (coatId: string | null | undefined): CoatThemeDef | null => (coatId ? (COAT_THEMES[coatId] ?? null) : null);

/** The words for a coat's three effects at its rung (null below Rare). */
export function coatFxWords(coatId: string | null | undefined, rung: CatTier | null | undefined): { ult: string; recall: string; takedown: string } | null {
  const t = coatTheme(coatId);
  if (t && (rung === 'EPIC' || rung === 'LEGENDARY')) return t;
  if (rung === 'RARE' || rung === 'EPIC' || rung === 'LEGENDARY') return RARE_SET;
  return null;
}
