/**
 * Cosmetics (POC.md §3 render/cosmetics.ts, §6.8, §8.1, §11.1): coats, skins, chromas, frames, titles and
 * Companion Kitten coats, as palette and part swaps on the procedural models (render/views/models.ts). Render
 * only: the sim never reads any of it and none of it is in the replay or the hash.
 *
 * Sources of an item:
 * - purchases (entitlement token): `skin.clem.pink_bow`, `skin.clem.dawnblade`, `coat.founder.<hero>`,
 *   `frame.founder`, `frame.legend`, `title.founder` (none in app builds)
 * - free unlocks by playing (local profile): `coat.brutus.biscuit` (first win, POC.md §12)
 * - owned Token Tails cats (roster): element chromas, tier frames, breed coats on the cat heroes, Companion Kittens
 * - the shelter champions (sim v9) wear their card's coat and chromas only; owning the card adds a badge (ui/screens.ts)
 * - card skins (GDD §7.2): every owned cat on every champion, look `{coat: 'cat.<id>', chroma: null}`, built by
 *   render/skins/registry.ts (never the chroma path)
 */
import type { HeroId } from '../sim/api';
import { ELEMENT_NAME, ELEMENTS, type CatTier, type Element, type RosterCosmetics, type StarterBreed, type TierFrame } from '../meta/roster';
import { isCardSkinId, skinRev } from './skins/skinStore';
import { LOOP_PALETTES, LOOP_REWARDS, TRACK_TITLES } from '../meta/treats';
import { SHELTER_CHAMPIONS } from '../data/heroes/shelter';
import { EFFECT_COATS, S1_PLUS_COAT, SEASONS, STORE_COATS, STORE_FRAMES, SEASON_ITEM_NAMES } from '../money/catalog';
import { chromaPalette, chromasEarned, isChromaKey } from './skins/coatChromas';

const SHELTER_NAME = Object.fromEntries(SHELTER_CHAMPIONS.map((c) => [c.hero, c.name])) as Record<'lambo' | 'aviete' | 'bengas' | 'gabe', string>;

export interface Coat {
  base: number;
  light: number;
  dark: number;
  accent: number;
  /**
   * Store and pass coats (STORE-PASS.md): the fur pattern drawn over the palette (render/chars/chibi.ts CoatSpec).
   * Absent: the hero's own pattern (every free coat is palette-only, so paid coats look clearly different).
   */
  pattern?: 'solid' | 'tabby' | 'points' | 'spots' | 'tuxedo' | 'calico';
  /** Calico's third colour. */
  patch?: number;
}

/** What one hero wears. `coat` is an item id from `wardrobe()` (null = default); `chroma` an owned element. */
export interface Look {
  coat: string | null;
  chroma: Element | null;
  /**
   * gaps4: the coat's chroma (render/skins/coatChromas.ts CHROMAS key, earned by playing in the coat), null or absent
   * for the coat's own colours. Belongs to `coat`: a new coat starts in its own colours.
   */
  dye?: string | null;
}

export const DEFAULT_LOOK: Look = Object.freeze({ coat: null, chroma: null }) as Look;

/**
 * The cache key of a look (geometry, portraits, the lobby): `coat|chroma`, and for a card skin (GDD §7.2)
 * `cat.<id>@<rev>|chroma`, where rev is the skin's palette revision (a finished sprite probe bumps it).
 */
export const lookKey = (l: Look | null | undefined): string => {
  if (!l) return '-|-';
  const coat = l.coat ?? '-';
  return `${isCardSkinId(l.coat) ? `${coat}@${skinRev(coat)}` : coat}|${l.chroma ?? '-'}${l.dye ? `|${l.dye}` : ''}`;
};

/** A card skin look (`cat.<id>`): never with a chroma (card skins never use the chroma path). */
export const cardLook = (skinId: string): Look => ({ coat: skinId, chroma: null });
export const wearsCardSkin = (l: Look | null | undefined): boolean => isCardSkinId(l?.coat);

/** Element colours for chromas, gems and kitten collars. */
export const ELEMENT_COLOR: Readonly<Record<Element, number>> = Object.freeze({
  ICE: 0x9fe8ff,
  ELECTRIC: 0xffe24d,
  FIRE: 0xff6a3d,
  WIND: 0xb6f0c8,
  DARK: 0x8a5cd6,
  WATER: 0x4da6ff,
  GRASS: 0x6fd36f,
  SAND: 0xe8c27a,
  FAIRY: 0xff9fd6,
  STELLAR: 0xfff1a8,
});

/** Breed coats (starter cats), worn by the cat heroes and by breed kittens. */
export const BREED_COAT: Readonly<Record<StarterBreed, Coat>> = Object.freeze({
  SCOUT: { base: 0xb07a4a, light: 0xf3dfc4, dark: 0x6b4426, accent: 0xff9fb1 },
  PINKIE: { base: 0xffc2cf, light: 0xfff4f6, dark: 0xe88aa0, accent: 0xff6f91 },
  SHADOW: { base: 0x3a3340, light: 0x6c6274, dark: 0x1e1a22, accent: 0xff8fb1 },
  MISTY: { base: 0xa9b4c8, light: 0xe9edf5, dark: 0x6c7891, accent: 0xffb3c8 },
  SUNNY: { base: 0xffc76b, light: 0xfff2d6, dark: 0xe0953a, accent: 0xff8fb1 },
});

export const BREED_NAME: Readonly<Record<StarterBreed, string>> = Object.freeze({
  SCOUT: 'Scout tabby',
  PINKIE: 'Pinkie',
  SHADOW: 'Shadow',
  MISTY: 'Misty',
  SUNNY: 'Sunny',
});

/** Preset kitten coats for cats with no breed (stable hash of the cat id). */
export const KITTEN_PRESETS: readonly Coat[] = Object.freeze([
  { base: 0xf29a52, light: 0xfff1dc, dark: 0xc96a2c, accent: 0xff8fb1 },
  { base: 0x2f2a33, light: 0xf4f0ea, dark: 0x16131a, accent: 0xff8fb1 },
  { base: 0x9fa9b8, light: 0xeef1f6, dark: 0x5f6878, accent: 0xffb3c8 },
  { base: 0xf6efe4, light: 0xffffff, dark: 0xd9c9b0, accent: 0xff9fb1 },
  { base: 0x8c6a4f, light: 0xe8d6c0, dark: 0x4f3826, accent: 0xff9fb1 },
  { base: 0xe8d2b0, light: 0xfff6e8, dark: 0x6b4a3a, accent: 0xffb3c8 },
  { base: 0xc9a27a, light: 0xf7e7d2, dark: 0x8a6446, accent: 0xff8fb1 },
  { base: 0x6f7480, light: 0xd8dbe2, dark: 0x3f434c, accent: 0xffb3c8 },
]);

/** Heroes that wear breed coats (the shelter champions wear their own card's coat, never a breed coat). */
export const CAT_HEROES: readonly HeroId[] = ['clem', 'sage', 'meatball', 'pixel', 'duchess', 'stilts'];

/** Sim v9 shelter champions (data/heroes/shelter.ts): their card's coat plus element chromas only. */
export const SHELTER_HEROES: readonly HeroId[] = ['lambo', 'aviete', 'bengas', 'gabe'];

export interface CoatOption {
  id: string | null;
  name: string;
  /** Where it comes from (shown as a small tag). */
  from: 'default' | 'free' | 'store' | 'cats' | 'pass';
}

export interface Owned {
  /** Purchased item ids (empty in app builds). */
  items: ReadonlySet<string>;
  /** Free unlock ids from the local profile. */
  unlocks: ReadonlySet<string>;
  roster: RosterCosmetics;
  /** gaps4 chromas: finished matches per coat id (meta/profile.ts `coatPlays`); absent: none earned. */
  coatPlays?: Readonly<Record<string, number>>;
}

export const FREE_BISCUIT = 'coat.brutus.biscuit';
const BISCUIT_COAT: Coat = Object.freeze({ base: 0xc98a4b, light: 0xfbe6c4, dark: 0x7a4a24, accent: 0x7a4a24 });

/** Loop palette colours (meta/treats.ts LOOP_PALETTES), the same on every original hero. */
const LOOP_COAT: Readonly<Record<string, Coat>> = Object.freeze({
  peach: { base: 0xf6b48f, light: 0xffeadc, dark: 0xc47a56, accent: 0xff8fb1 },
  plum: { base: 0x7a4a7e, light: 0xd2b0d6, dark: 0x40243f, accent: 0xffd34d },
  moss: { base: 0x6f7f45, light: 0xd6dcb0, dark: 0x3c4624, accent: 0xffb347 },
  slate: { base: 0x5f6e80, light: 0xc6d0dc, dark: 0x323b46, accent: 0x9be3c4 },
  honey: { base: 0xe8b84f, light: 0xfff0c8, dark: 0xa87a24, accent: 0xff7a3d },
  coral: { base: 0xf08070, light: 0xffdcd4, dark: 0xb44c40, accent: 0x8fc8ff },
  ink: { base: 0x2c3046, light: 0x8c92b0, dark: 0x14162a, accent: 0xff8fb1 },
  cocoa: { base: 0x8a5a3c, light: 0xe6c8b0, dark: 0x4a2c1a, accent: 0xffd34d },
});

/**
 * Treat Track coats (meta/treats.ts, fixed order, free by playing): an unlock id → hero, name and palette. Like the
 * Biscuit coat they live in the local profile's unlocks.
 */
export const FREE_COATS: Readonly<Record<string, { hero: HeroId; name: string; coat: Coat; loop?: true }>> = Object.freeze({
  'coat.clem.marmalade': { hero: 'clem', name: 'Marmalade coat', coat: { base: 0xf0a04b, light: 0xffe2b8, dark: 0xb5652a, accent: 0xff7a3d } },
  'coat.clem.snowpaw': { hero: 'clem', name: 'Snowpaw coat', coat: { base: 0xf4f1ec, light: 0xffffff, dark: 0xb9c3cf, accent: 0x8fc8ff } },
  'coat.sage.midnight': { hero: 'sage', name: 'Midnight coat', coat: { base: 0x3a3f5c, light: 0x8a90b8, dark: 0x1f2236, accent: 0x9be3c4 } },
  'coat.sage.sunrise': { hero: 'sage', name: 'Sunrise coat', coat: { base: 0xffc58a, light: 0xfff0dc, dark: 0xd98a4a, accent: 0xff8fb1 } },
  'coat.brutus.ember': { hero: 'brutus', name: 'Ember coat', coat: { base: 0x8a3b2a, light: 0xe8a07a, dark: 0x4a1d14, accent: 0xffb347 } },
  'coat.cacklejaw.spotted': { hero: 'cacklejaw', name: 'Spotted coat', coat: { base: 0xc9a26b, light: 0xf2dcb4, dark: 0x5a4028, accent: 0xb07cff } },
  'coat.cacklejaw.dusk': { hero: 'cacklejaw', name: 'Dusk coat', coat: { base: 0x6a5a8a, light: 0xc0b0e0, dark: 0x352a4a, accent: 0xffd34d } },
  // GAPS A1: one more coat per original hero, and palette variants of the earlier coats
  'coat.clem.lilac': { hero: 'clem', name: 'Lilac coat', coat: { base: 0xd8c4ee, light: 0xf6f0fc, dark: 0x9a82bc, accent: 0xff8fb1 } },
  'coat.sage.fern': { hero: 'sage', name: 'Fern coat', coat: { base: 0x7f9a6a, light: 0xdfe8cf, dark: 0x4a5e3c, accent: 0xffd34d } },
  'coat.brutus.storm': { hero: 'brutus', name: 'Storm coat', coat: { base: 0x7d8692, light: 0xd2d8e0, dark: 0x454c56, accent: 0x8fc8ff } },
  'coat.cacklejaw.frost': { hero: 'cacklejaw', name: 'Frost coat', coat: { base: 0xdfe8ef, light: 0xffffff, dark: 0x5a7a99, accent: 0x8fc8ff } },
  'coat.clem.marmalade.rose': { hero: 'clem', name: 'Rose Marmalade coat', coat: { base: 0xf0a08a, light: 0xffe2da, dark: 0xb5604f, accent: 0xff6f91 } },
  'coat.sage.midnight.teal': { hero: 'sage', name: 'Teal Midnight coat', coat: { base: 0x2f5a5c, light: 0x86b8b4, dark: 0x173436, accent: 0x9be3c4 } },
  'coat.brutus.ember.ash': { hero: 'brutus', name: 'Ash Ember coat', coat: { base: 0x5a4a46, light: 0xc8b2a8, dark: 0x2e2422, accent: 0xffb347 } },
  'coat.cacklejaw.spotted.mint': { hero: 'cacklejaw', name: 'Mint Spotted coat', coat: { base: 0xa9d6b8, light: 0xe6f6ea, dark: 0x3f6a52, accent: 0xb07cff } },
  'coat.clem.snowpaw.sky': { hero: 'clem', name: 'Sky Snowpaw coat', coat: { base: 0xe4eef8, light: 0xffffff, dark: 0x9cb6d2, accent: 0x8fc8ff } },
  // sim v11: three coats for each original cat
  'coat.meatball.butter': { hero: 'meatball', name: 'Butter coat', coat: { base: 0xf2cf7a, light: 0xfff4d6, dark: 0xc49a3e, accent: 0xff7a3d } },
  'coat.meatball.smoky': { hero: 'meatball', name: 'Smoky coat', coat: { base: 0x7a7470, light: 0xd8d0c8, dark: 0x43403c, accent: 0xffb347 } },
  'coat.meatball.ginger': { hero: 'meatball', name: 'Ginger coat', coat: { base: 0xc8552a, light: 0xf6b48a, dark: 0x7a2e14, accent: 0x9be3c4 } },
  'coat.pixel.arctic': { hero: 'pixel', name: 'Arctic coat', coat: { base: 0xdfe8ef, light: 0xffffff, dark: 0x6a8aa8, accent: 0x8fc8ff } },
  'coat.pixel.cocoa': { hero: 'pixel', name: 'Cocoa coat', coat: { base: 0x5a3c2c, light: 0xf0e2d0, dark: 0x2e1c12, accent: 0xffd34d } },
  'coat.pixel.moonbeam': { hero: 'pixel', name: 'Moonbeam coat', coat: { base: 0x3a3f5c, light: 0xe8ecff, dark: 0x1f2236, accent: 0xb07cff } },
  'coat.duchess.pearl': { hero: 'duchess', name: 'Pearl coat', coat: { base: 0xfaf6f0, light: 0xffffff, dark: 0xc8c0d0, accent: 0xff8fb1 } },
  'coat.duchess.rosewater': { hero: 'duchess', name: 'Rosewater coat', coat: { base: 0xf2c8cc, light: 0xfff0f2, dark: 0xc08a90, accent: 0x8fc8ff } },
  'coat.duchess.smoke': { hero: 'duchess', name: 'Smoke coat', coat: { base: 0x8a8a96, light: 0xdcdce4, dark: 0x4a4a54, accent: 0xb07cff } },
  'coat.stilts.desert': { hero: 'stilts', name: 'Desert coat', coat: { base: 0xe0b878, light: 0xfaecd0, dark: 0x8a5a2c, accent: 0xff7a3d } },
  'coat.stilts.silver': { hero: 'stilts', name: 'Silver coat', coat: { base: 0xc8ccd2, light: 0xf4f6f8, dark: 0x3a3e46, accent: 0x9be3c4 } },
  'coat.stilts.cinder': { hero: 'stilts', name: 'Cinder coat', coat: { base: 0x5a4a42, light: 0xc8b0a0, dark: 0x1e1612, accent: 0xff8fb1 } },
  // sim v14: three coats for each original dog (first palettes; the RENDER lane tunes them on the models)
  'coat.nugget.tricolour': { hero: 'nugget', name: 'Tricolour coat', coat: { base: 0x2a2426, light: 0xfbe9d2, dark: 0xa0521f, accent: 0xff8fb1 } },
  'coat.nugget.fluffy': { hero: 'nugget', name: 'Fluffy coat', coat: { base: 0xf2d9b0, light: 0xffffff, dark: 0xc4a070, accent: 0xff8fb1 } },
  'coat.nugget.bread': { hero: 'nugget', name: 'Bread Loaf coat', coat: { base: 0xb07a3c, light: 0xe8c890, dark: 0x6b4420, accent: 0xffd34d } },
  'coat.marshmallow.cream': { hero: 'marshmallow', name: 'Biscuit Cream coat', coat: { base: 0xf2dfb8, light: 0xfffaf0, dark: 0xc8b088, accent: 0xff8fb1 } },
  'coat.marshmallow.cocoa': { hero: 'marshmallow', name: 'Hot Cocoa coat', coat: { base: 0x7a5038, light: 0xe0c4ac, dark: 0x40281a, accent: 0xffffff } },
  'coat.marshmallow.snowcone': { hero: 'marshmallow', name: 'Snowcone coat', coat: { base: 0xf4f8ff, light: 0xffffff, dark: 0xa8c8f0, accent: 0xffb3c8 } },
  'coat.bravo.fawn': { hero: 'bravo', name: 'Fawn coat', coat: { base: 0xd9b07a, light: 0xf6e4c8, dark: 0x3a2a20, accent: 0xfff1d6 } },
  'coat.bravo.opera': { hero: 'bravo', name: 'Opera coat', coat: { base: 0xf2e6d0, light: 0xffffff, dark: 0x2a2628, accent: 0xb07cff } },
  'coat.bravo.understudy': { hero: 'bravo', name: 'Understudy coat', coat: { base: 0x6a5040, light: 0xb89878, dark: 0x2a1c14, accent: 0xffd34d } },
  'coat.chili.black-tan': { hero: 'chili', name: 'Black and Tan coat', coat: { base: 0x2a2426, light: 0xd9a46a, dark: 0x141214, accent: 0xff8fb1 } },
  'coat.chili.long-hair': { hero: 'chili', name: 'Long-Hair coat', coat: { base: 0xe8c08a, light: 0xfff0d8, dark: 0xb08050, accent: 0xff8fb1 } },
  'coat.chili.hot-sauce': { hero: 'chili', name: 'Hot Sauce coat', coat: { base: 0xc8402a, light: 0xffb08a, dark: 0x6a1a10, accent: 0xffd34d } },
  'coat.howler.red': { hero: 'howler', name: 'Copper coat', coat: { base: 0xb8683a, light: 0xf8ece0, dark: 0x6a3418, accent: 0x9fe8ff } },
  'coat.howler.agouti': { hero: 'howler', name: 'Agouti coat', coat: { base: 0x6a6a5a, light: 0xd8d4c8, dark: 0x2e2c24, accent: 0x9fe8ff } },
  'coat.howler.pied': { hero: 'howler', name: 'Pied coat', coat: { base: 0xf4f4f6, light: 0xffffff, dark: 0x5a5e68, accent: 0x9fe8ff } },
  // sim v15 dogs (first-pass palettes; RENDER may retune them)
  'coat.rocket.fawn': { hero: 'rocket', name: 'Fawn coat', coat: { base: 0xd2a874, light: 0xf4e2c8, dark: 0x2a2220, accent: 0x9be07a } },
  'coat.rocket.blue': { hero: 'rocket', name: 'Slate Blue coat', coat: { base: 0x6a7a8c, light: 0xd8e0ea, dark: 0x3a4250, accent: 0x9be07a } },
  'coat.rocket.retired': { hero: 'rocket', name: 'Retired Racer coat', coat: { base: 0x9a948e, light: 0xe8e4e0, dark: 0x5e5955, accent: 0xff8fb1 } },
  'coat.frankie.chili': { hero: 'frankie', name: 'Chili Dog coat', coat: { base: 0x9c4a1f, light: 0xd88a56, dark: 0x5a2410, accent: 0xff5a3a } },
  'coat.frankie.dapple': { hero: 'frankie', name: 'Silver Dapple coat', coat: { base: 0x8a8a90, light: 0xd8d8de, dark: 0x3a3a40, accent: 0xff7a5c } },
  'coat.frankie.corndog': { hero: 'frankie', name: 'Corn Dog coat', coat: { base: 0xc8843a, light: 0xf0c078, dark: 0x7a4818, accent: 0xff7a5c } },
  'coat.domino.liver': { hero: 'domino', name: 'Liver Spot coat', coat: { base: 0xf7f5f2, light: 0xffffff, dark: 0x6a3a24, accent: 0xd8c8ff } },
  'coat.domino.lemon': { hero: 'domino', name: 'Lemon Spot coat', coat: { base: 0xfaf6ec, light: 0xffffff, dark: 0xd8b860, accent: 0xd8c8ff } },
  'coat.domino.firehouse': { hero: 'domino', name: 'Firehouse coat', coat: { base: 0xf7f5f2, light: 0xffffff, dark: 0x1a1a1e, accent: 0xff4a3a } },
  ...loopCoats(),
});

/**
 * The loop after chest 30 (meta/treats.ts LOOP_REWARDS): each palette on every original hero. Never on a champion
 * (they wear their real card's coat).
 */
function loopCoats(): Record<string, { hero: HeroId; name: string; coat: Coat; loop: true }> {
  const out: Record<string, { hero: HeroId; name: string; coat: Coat; loop: true }> = {};
  for (const r of LOOP_REWARDS) {
    const key = r.id.slice(r.id.lastIndexOf('.') + 1);
    const pal = LOOP_COAT[key];
    const name = LOOP_PALETTES.find((p) => p.key === key)?.name ?? key;
    if (pal && r.hero) out[r.id] = { hero: r.hero, name: `${name} coat`, coat: pal, loop: true };
  }
  return out;
}

/** Bots dress from the first seven Treat Track coats only (gameView.dressBots: the same faces as before GAPS A1). */
export const BOT_COATS: readonly string[] = Object.freeze(['coat.clem.marmalade', 'coat.clem.snowpaw', 'coat.sage.midnight', 'coat.sage.sunrise', 'coat.brutus.ember', 'coat.cacklejaw.spotted', 'coat.cacklejaw.dusk']);

type Pal = [number, number, number, number, Coat['pattern'], number?];
const pal = ([base, light, dark, accent, pattern, patch]: Pal): Coat => ({ base, light, dark, accent, pattern, ...(patch !== undefined ? { patch } : {}) });

/**
 * Store Common coats (money/catalog.ts STORE_COATS): one per original hero, each with a fur pattern (the free Treat
 * Track coats are palette-only). Render only.
 */
const STORE_COAT_PAL: Readonly<Record<string, Pal>> = Object.freeze({
  'coat.clem.store_calico': [0xf6efe4, 0xffffff, 0x2f2a33, 0xff8fb1, 'calico', 0xf0a04b],
  'coat.sage.store_silver_tabby': [0xb8c0c8, 0xf0f2f4, 0x4a5058, 0x9be3c4, 'tabby'],
  'coat.meatball.store_siamese': [0xf2e6d2, 0xfffaf0, 0x5a3c2c, 0x8fc8ff, 'points'],
  'coat.pixel.store_leopard': [0xe8b860, 0xfff0c8, 0x3a2614, 0xff7a3d, 'spots'],
  'coat.duchess.store_blue_point': [0xf4f0ea, 0xffffff, 0x6a7a96, 0xb07cff, 'points'],
  'coat.stilts.store_bengal': [0xd89a4a, 0xf8e0b8, 0x4a2a14, 0x9be3c4, 'spots'],
  'coat.brutus.store_brindle': [0x8a6a4a, 0xd8c0a0, 0x3a2818, 0xffb347, 'tabby'],
  'coat.cacklejaw.store_starry': [0x2c3046, 0x8c92b0, 0xfff1a8, 0xffd34d, 'spots'],
  'coat.nugget.store_merle': [0x9aa6b8, 0xeef2f6, 0x2e3440, 0x8fc8ff, 'spots'],
  'coat.marshmallow.store_tuxedo': [0x2a2628, 0xffffff, 0x141214, 0xff8fb1, 'tuxedo'],
  'coat.bravo.store_harlequin': [0xf7f5f2, 0xffffff, 0x1e1a22, 0xff4a3a, 'spots'],
  'coat.chili.store_red_brindle': [0xb0502a, 0xf0b08a, 0x4a1a0e, 0xffd34d, 'tabby'],
  'coat.howler.store_sable': [0xc8904a, 0xfaf0e0, 0x2a2220, 0x9fe8ff, 'points'],
  'coat.rocket.store_tiger': [0xc89a5a, 0xf2dcb8, 0x3a2a1a, 0x9be07a, 'tabby'],
  'coat.frankie.store_patchwork': [0xf4ece0, 0xffffff, 0x3a2a20, 0xff7a5c, 'calico', 0xc8843a],
  'coat.domino.store_black_tie': [0x1e1a22, 0xf7f5f2, 0x0e0c10, 0xff4a3a, 'tuxedo'],
});

/** Legends Pass Season 1 coats (money/catalog.ts SEASONS): the free row palette-only, the premium row patterned. */
const PASS_COAT_PAL: Readonly<Record<string, Pal>> = Object.freeze({
  // free row
  'coat.clem.s1_honey_tabby': [0xe8b860, 0xfff0d0, 0xb07a30, 0xff8fb1, undefined],
  'coat.brutus.s1_mud': [0x7a5a3c, 0xc8a888, 0x3e2a1a, 0x9be3c4, undefined],
  'coat.sage.s1_meadow': [0x9ab86a, 0xeaf4d8, 0x52703a, 0xffb3c8, undefined],
  'coat.nugget.s1_toast': [0xd8a868, 0xfaecd0, 0x8a5a2a, 0xff8fb1, undefined],
  'coat.pixel.s1_mint': [0xbfe8d4, 0xf4fff8, 0x4a3026, 0xff8fb1, undefined],
  'coat.chili.s1_paprika': [0xd8603a, 0xffc8a8, 0x7a2a14, 0xffd34d, undefined],
  // premium row
  'coat.meatball.s1_caramel': [0xd8964a, 0xfff0d8, 0x8a4a1a, 0xffd34d, 'tabby'],
  'coat.cacklejaw.s1_embers': [0x5a2a1a, 0xf8a060, 0xff6a2a, 0xffd34d, 'spots'],
  'coat.duchess.s1_lavender': [0xf6f0fa, 0xffffff, 0x9a82bc, 0xff8fb1, 'points'],
  'coat.marshmallow.s1_strawberry': [0xffd0d8, 0xfff6f8, 0xe86a88, 0xffffff, 'calico', 0xffffff],
  'coat.stilts.s1_savanna': [0xe0c080, 0xfaf0d8, 0x6a4a1e, 0xff7a3d, 'spots'],
  'coat.bravo.s1_opening_night': [0x1e1a28, 0xf4eefa, 0x0c0a12, 0xffd34d, 'tuxedo'],
  'coat.clem.s1_tortie': [0x3a2a24, 0xc8783a, 0x1a1210, 0xff8fb1, 'calico', 0xe0903a],
  'coat.howler.s1_timber': [0x8a8478, 0xeae6de, 0x3a362e, 0x9fe8ff, 'tabby'],
  'coat.sage.s1_autumn': [0xc8783a, 0xfae0c0, 0x6a3014, 0x9be3c4, 'tabby'],
  'coat.rocket.s1_comet': [0xdfe8f6, 0xffffff, 0x3a4a7a, 0xffd34d, 'points'],
  'coat.pixel.s1_galaxy': [0x2a2450, 0xb8b0f0, 0xfff1a8, 0xb07cff, 'spots'],
  'coat.frankie.s1_mustard': [0xe0b030, 0xfff0b0, 0x8a5a10, 0xff5a3a, 'tabby'],
  'coat.meatball.s1_cinnamon': [0xb06a3a, 0xf6d8b8, 0x5a2a14, 0xffd34d, 'tabby'],
  'coat.domino.s1_ink': [0xf4f4f8, 0xffffff, 0x2a3060, 0xd8c8ff, 'spots'],
  'coat.duchess.s1_velvet': [0x5a2a4a, 0xd8a8c8, 0x2a0e22, 0xffd34d, 'points'],
  'coat.nugget.s1_waffle': [0xd8a050, 0xfff0c8, 0x7a4a1a, 0xff8fb1, 'tabby'],
  'coat.stilts.s1_snow_leopard': [0xe8ecf0, 0xffffff, 0x4a5058, 0x9fe8ff, 'spots'],
  'coat.brutus.s1_royal': [0x3a3a6a, 0xb8b8e0, 0x1a1a3a, 0xffd34d, 'tuxedo'],
  'coat.chili.s1_jalapeno': [0x4a8a3a, 0xc8e8a8, 0x1e4a14, 0xff4a3a, 'spots'],
  'coat.clem.s1_starlight': [0x3a3f6c, 0xe8ecff, 0xfff1a8, 0xffd34d, 'spots'],
  'coat.cacklejaw.s1_aurora': [0x2a6a6a, 0xa8f0d8, 0xb07cff, 0xfff1a8, 'tabby'],
  'coat.clem.s1_sunforged': [0xffd870, 0xffffff, 0xd8781a, 0xff5a3a, 'tabby'],
  // Legends Pass+ exclusive Epic coat
  [S1_PLUS_COAT]: [0x1a1420, 0x8a6ab8, 0xffd34d, 0xff8fb1, 'points'],
});

/**
 * Effect coats (money/catalog.ts EFFECT_COATS, docs/plans/moba/CARD-SKINS.md §6.3): original palettes on our own
 * heroes; the effect rung and element drive the shared skin-effect kit (render/skins/effectKit.ts).
 */
const EFFECT_COAT_PAL: Readonly<Record<string, Pal>> = Object.freeze({
  'coat.pixel.store_moonwhisker': [0x2c2c5e, 0xe6e2ff, 0xfff1a8, 0xb9a8ff, 'spots'],
  'coat.marshmallow.store_frostbell': [0xeef6ff, 0xffffff, 0x7ab8e8, 0x9fe8ff, 'calico', 0xc8e8ff],
  'coat.brutus.store_thunderpaw': [0x26262e, 0xfff6c8, 0x121218, 0xffe24d, 'tuxedo'],
  'coat.sage.store_bloomtail': [0x7fb069, 0xeaf6d8, 0x3e6a2e, 0xff9fd6, 'tabby'],
  // gaps4: toasted bread with crust shade and cheese patches; lettuce green accent
  'coat.clem.store_club_sandwich': [0xe2ac62, 0xfff2d2, 0x8a501e, 0x7ccf4a, 'calico', 0xffcf3a],
  // gaps4: grilled meat with char stripes and a pita-pale belly; a king's gold accent
  'coat.frankie.store_kebab_king': [0xa8522a, 0xffe2b4, 0x4a1e0e, 0xffd34d, 'tabby'],
});

/**
 * CARD-SKINS.md §5 coat rungs and elements: fixed by the price band (never by bond or play). Free-row and Treat Track
 * coats are Common; the store and premium pass coats Rare; Pass+ and the $7.99 coats Epic; pass tier 30 and the $14.99
 * coats Legendary. The element is explicit for the effect coats and otherwise the nearest element to the accent hue.
 */
const COAT_FX: Readonly<Record<string, { rung: CatTier; element: Element }>> = Object.freeze({
  [S1_PLUS_COAT]: { rung: 'EPIC', element: 'DARK' },
  'coat.clem.s1_sunforged': { rung: 'LEGENDARY', element: 'FIRE' },
  'coat.pixel.store_moonwhisker': { rung: 'EPIC', element: 'STELLAR' },
  'coat.marshmallow.store_frostbell': { rung: 'EPIC', element: 'ICE' },
  'coat.brutus.store_thunderpaw': { rung: 'LEGENDARY', element: 'ELECTRIC' },
  'coat.sage.store_bloomtail': { rung: 'LEGENDARY', element: 'GRASS' },
  'coat.clem.store_club_sandwich': { rung: 'EPIC', element: 'SAND' },
  'coat.frankie.store_kebab_king': { rung: 'EPIC', element: 'FIRE' },
});

/** The hue (degrees) and saturation of 0xRRGGBB (no import: classify.ts imports this file's neighbours). */
function hueSat(c: number): [number, number] {
  const r = ((c >> 16) & 255) / 255;
  const g = ((c >> 8) & 255) / 255;
  const b = (c & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return [0, 0];
  const l = (max + min) / 2;
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s];
}

/** The element whose colour is nearest in hue to `c` (a grey accent: STELLAR, the neutral sparkle). */
export function nearestElement(c: number): Element {
  const [h, s] = hueSat(c);
  if (s < 0.15) return 'STELLAR';
  let best: Element = 'STELLAR';
  let bd = 999;
  for (const el of ELEMENTS) {
    const [eh] = hueSat(ELEMENT_COLOR[el]);
    const d = Math.abs(((h - eh + 540) % 360) - 180);
    if (d < bd) {
      bd = d;
      best = el;
    }
  }
  return best;
}

type PaidRow = { hero: HeroId; name: string; coat: Coat; from: 'store' | 'pass'; rung: CatTier; element: Element };
const paidRow = (id: string, hero: string, name: string, coat: Coat, from: 'store' | 'pass', rung: CatTier): PaidRow => ({ hero: hero as HeroId, name, coat, from, rung: COAT_FX[id]?.rung ?? rung, element: COAT_FX[id]?.element ?? nearestElement(coat.accent) });
const FREE_ROW = new Set(SEASONS.flatMap((s) => s.free.map((r) => r.item)));

/** Store and pass coats by id: hero, name, palette, where they come from, and the effect rung and element. */
export const PAID_COATS: Readonly<Record<string, PaidRow>> = Object.freeze({
  ...Object.fromEntries(STORE_COATS.map((c) => [c.id, paidRow(c.id, c.hero, c.name, pal(STORE_COAT_PAL[c.id]), 'store', 'RARE')])),
  ...Object.fromEntries(EFFECT_COATS.map((c) => [c.id, paidRow(c.id, c.hero, c.name, pal(EFFECT_COAT_PAL[c.id]), 'store', c.rung)])),
  ...Object.fromEntries(
    SEASONS.flatMap((s) => [...s.free, ...s.premium])
      .filter((r) => r.hero && PASS_COAT_PAL[r.item])
      .map((r) => [r.item, paidRow(r.item, r.hero as string, r.name, pal(PASS_COAT_PAL[r.item]), 'pass', FREE_ROW.has(r.item) ? 'COMMON' : 'RARE')]),
  ),
  [S1_PLUS_COAT]: paidRow(S1_PLUS_COAT, 'duchess', 'Eclipse coat (Epic)', pal(PASS_COAT_PAL[S1_PLUS_COAT]), 'pass', 'EPIC'),
});

/** Store frames and titles, and pass frames and titles (STORE-PASS.md), by id. */
export const STORE_FRAME_NAME: Readonly<Record<string, string>> = Object.freeze({
  ...Object.fromEntries(STORE_FRAMES.map((f) => [f.id, f.name])),
  ...Object.fromEntries(Object.entries(SEASON_ITEM_NAMES).filter(([id]) => id.startsWith('frame.'))),
});
export const STORE_TITLE_NAME: Readonly<Record<string, string>> = Object.freeze({
  ...Object.fromEntries(STORE_FRAMES.map((f) => [f.title.id, f.title.name])),
  ...Object.fromEntries(Object.entries(SEASON_ITEM_NAMES).filter(([id]) => id.startsWith('title.'))),
});
export const isStoreFrame = (id: unknown): id is string => typeof id === 'string' && id in STORE_FRAME_NAME;
export const isStoreTitle = (id: unknown): id is string => typeof id === 'string' && id in STORE_TITLE_NAME;

/** Track frames (GAPS A1): one per shelter champion, in that champion's colour. Never a card perk. */
export const TRACK_FRAME_NAME: Readonly<Record<TrackFrame, string>> = Object.freeze({
  'frame.champ.lambo': `${SHELTER_NAME.lambo} frame`,
  'frame.champ.aviete': `${SHELTER_NAME.aviete} frame`,
  'frame.champ.bengas': `${SHELTER_NAME.bengas} frame`,
  'frame.champ.gabe': `${SHELTER_NAME.gabe} frame`,
});
export type TrackFrame = 'frame.champ.lambo' | 'frame.champ.aviete' | 'frame.champ.bengas' | 'frame.champ.gabe';
export const isTrackFrame = (id: unknown): id is TrackFrame => typeof id === 'string' && id in TRACK_FRAME_NAME;
export const breedCoatId = (b: StarterBreed): string => `coat.breed.${b}`;

/** The coats a hero can wear, default first. */
export function wardrobe(hero: HeroId, o: Owned): CoatOption[] {
  const out: CoatOption[] = [{ id: null, name: 'Classic', from: 'default' }];
  // A champion wears its card's coat: no breed, free or store coats (element chromas still apply).
  if (SHELTER_HEROES.includes(hero)) return out;
  if (hero === 'brutus' && o.unlocks.has(FREE_BISCUIT)) out.push({ id: FREE_BISCUIT, name: 'Biscuit coat', from: 'free' });
  for (const [id, f] of Object.entries(FREE_COATS)) if (f.hero === hero && o.unlocks.has(id)) out.push({ id, name: f.name, from: 'free' });
  if (hero === 'clem' && o.items.has('skin.clem.pink_bow')) out.push({ id: 'skin.clem.pink_bow', name: 'Pink Bow Clem', from: 'store' });
  if (o.items.has(`coat.founder.${hero}`)) out.push({ id: `coat.founder.${hero}`, name: 'Founder coat', from: 'store' });
  if (hero === 'clem' && o.items.has('skin.clem.dawnblade')) out.push({ id: 'skin.clem.dawnblade', name: 'Dawnblade Clem', from: 'store' });
  // STORE-PASS.md: store Common coats and Legends Pass coats the account owns
  for (const [id, c] of Object.entries(PAID_COATS)) if (c.hero === hero && o.items.has(id)) out.push({ id, name: c.name, from: c.from });
  if (CAT_HEROES.includes(hero)) for (const b of o.roster.breedCoats) out.push({ id: breedCoatId(b), name: `${BREED_NAME[b]} coat`, from: 'cats' });
  return out;
}

/** Chroma choices (null = none). */
export function chromaOptions(o: Owned): { id: Element | null; name: string }[] {
  return [{ id: null, name: 'None' }, ...o.roster.chromas.map((e) => ({ id: e, name: `${ELEMENT_NAME[e]} chroma` }))];
}

/**
 * The look to wear: the stored choice when it is still owned, else the best owned coat (store skin, then Founder,
 * then a free coat, then a breed coat) and the first owned chroma.
 */
export function resolveLook(hero: HeroId, o: Owned, chosen?: Partial<Look> | null): Look {
  // GDD §7.2: a card skin while its cat is still in the roster; a cat that left falls back to the Classic look
  if (chosen && isCardSkinId(chosen.coat)) return (o.roster.cardSkins ?? []).includes(chosen.coat) ? cardLook(chosen.coat) : { coat: null, chroma: null };
  const coats = wardrobe(hero, o);
  const ids = coats.map((c) => c.id);
  let coat: string | null;
  if (chosen && chosen.coat !== undefined && ids.includes(chosen.coat)) coat = chosen.coat;
  else {
    // a store or pass coat the player has not chosen yet is never put on automatically (the player equips it)
    const rank = (c: CoatOption): number => (c.id?.startsWith('skin.clem.dawnblade') ? 5 : c.id?.startsWith('skin.') ? 4 : c.id?.startsWith('coat.founder') ? 3 : c.from === 'free' ? 2 : c.from === 'cats' ? 1 : 0);
    coat = [...coats].sort((a, b) => rank(b) - rank(a))[0]?.id ?? null;
  }
  const chromas = o.roster.chromas;
  let chroma: Element | null;
  if (chosen && chosen.chroma !== undefined && (chosen.chroma === null || chromas.includes(chosen.chroma))) chroma = chosen.chroma;
  // round 0: the first squad mate's element (the newest adoption or the chosen squad), not the first in ELEMENTS order
  else chroma = o.roster.companions.find((c) => chromas.includes(c.element))?.element ?? chromas[0] ?? null;
  // gaps4: the coat's chroma while it is still earned on that coat (else the coat's own colours)
  const dye = chosen && chosen.coat === coat && chosen.dye && coat && coatDyes(coat, o).includes(chosen.dye) ? chosen.dye : null;
  return dye ? { coat, chroma, dye } : { coat, chroma };
}

/** gaps4: a coat's own palette by id, whoever wears it (null: no palette of its own, so no chromas). */
export function coatPalette(id: string | null | undefined): Coat | null {
  if (!id) return null;
  const c = FREE_COATS[id]?.coat ?? PAID_COATS[id]?.coat;
  if (c) return c;
  if (id === FREE_BISCUIT) return BISCUIT_COAT;
  return null;
}

/** gaps4: does the coat have chromas (every coat with a palette of its own: Treat Track, store, pass, effect coats)? */
export const hasChromas = (id: string | null | undefined): boolean => coatPalette(id) !== null;

/** gaps4: the chromas `o` has earned on coat `id` (keys, unlock order); none for a coat without chromas. */
export function coatDyes(id: string, o: Pick<Owned, 'coatPlays'>): string[] {
  return hasChromas(id) ? chromasEarned(o.coatPlays?.[id] ?? 0) : [];
}

export type FrameId = TierFrame | 'frame.founder' | 'frame.legend' | TrackFrame | `frame.store.${string}` | `frame.s1.${string}`;

export const FRAME_NAME: Readonly<Record<string, string>> = Object.freeze({
  ...TRACK_FRAME_NAME,
  ...STORE_FRAME_NAME,
  'frame.rare': 'Rare frame',
  'frame.epic': 'Epic frame',
  'frame.legendary': 'Legendary frame',
  'frame.buddy': 'Buddy frame',
  'frame.crew': 'Crew frame',
  'frame.clowder': 'Clowder frame',
  'frame.founder': 'Founder frame',
  'frame.legend': 'Legend frame',
});

/** Best frame owned: Legend > Founder > the best roster frame (meta/roster.ts FRAME_ORDER, pack cats excluded), or null. */
export function bestFrame(o: Owned, worn?: string | null): FrameId | null {
  // GAPS A1: a track frame the player chose to wear (and owns) comes first
  if (isTrackFrame(worn) && o.unlocks.has(worn)) return worn;
  // STORE-PASS.md: a store or pass frame the player chose to wear (and owns)
  if (isStoreFrame(worn) && o.items.has(worn)) return worn as FrameId;
  if (o.items.has('frame.legend')) return 'frame.legend';
  if (o.items.has('frame.founder')) return 'frame.founder';
  const f = o.roster.frames;
  return f.length ? f[f.length - 1] : null;
}

/** The title worn: a champion title from the track the player chose (and owns), else "Founder", or null. */
export function titleOf(o: Owned, worn?: string | null): string | null {
  if (worn && TRACK_TITLES[worn] && o.unlocks.has(worn)) return TRACK_TITLES[worn];
  if (isStoreTitle(worn) && o.items.has(worn)) return STORE_TITLE_NAME[worn];
  return o.items.has('title.founder') ? 'Founder' : null;
}

/** Store items the look shows (for `item_seen_in_match{sku}` analytics). */
export function lookItems(l: Look): string[] {
  return l.coat && (l.coat.startsWith('skin.') || l.coat.startsWith('coat.founder.') || l.coat in PAID_COATS) ? [l.coat] : [];
}

/** A kitten coat from a companion's breed or preset index. */
export function kittenCoat(c: StarterBreed | number): Coat {
  return typeof c === 'number' ? KITTEN_PRESETS[((c % KITTEN_PRESETS.length) + KITTEN_PRESETS.length) % KITTEN_PRESETS.length] : BREED_COAT[c];
}

/** Mix two 0xRRGGBB colours (t = 0: a, 1: b). */
export function mixColor(a: number, b: number, t: number): number {
  const ch = (sh: number): number => Math.round(((a >> sh) & 255) * (1 - t) + ((b >> sh) & 255) * t) << sh;
  return ch(16) | ch(8) | ch(0);
}

/**
 * Round 2 ("a Legendary Fire cat walks as a plain brown tabby"): a kitten without a breed coat takes its element as the
 * base colour (its preset coat's pattern, tinted halfway toward the element); breed coats stay the breed's own.
 */
export function companionCoat(c: StarterBreed | number, element: Element): Coat {
  const base = kittenCoat(c);
  if (typeof c !== 'number') return base;
  const el = ELEMENT_COLOR[element];
  return { base: mixColor(base.base, el, 0.55), light: mixColor(base.light, el, 0.2), dark: mixColor(base.dark, el, 0.35), accent: base.accent };
}

/** The coat palette for a hero's look (null = the hero's own default palette), in its chroma when it wears one. */
export function lookCoat(hero: HeroId, l: Look): Coat | null {
  const c = ownCoat(hero, l);
  return c && l.dye && isChromaKey(l.dye) && hasChromas(l.coat) ? chromaPalette(c, l.dye) : c;
}

function ownCoat(hero: HeroId, l: Look): Coat | null {
  const id = l.coat;
  if (!id) return null;
  if (id.startsWith('coat.breed.')) {
    const b = id.slice('coat.breed.'.length) as StarterBreed;
    return CAT_HEROES.includes(hero) && BREED_COAT[b] ? BREED_COAT[b] : null;
  }
  const free = FREE_COATS[id];
  if (free) return free.hero === hero ? free.coat : null;
  const paid = PAID_COATS[id];
  if (paid) return paid.hero === hero ? paid.coat : null;
  if (id === FREE_BISCUIT && hero === 'brutus') return BISCUIT_COAT;
  if (id === 'skin.clem.pink_bow' && hero === 'clem') return { base: 0xffb3c4, light: 0xfff4f6, dark: 0xe5788f, accent: 0xff6f91 };
  if (id === 'skin.clem.dawnblade' && hero === 'clem') return { base: 0xfff0d0, light: 0xffffff, dark: 0xf0b84a, accent: 0xffd34d };
  return null;
}
