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
 */
import type { HeroId } from '../sim/api';
import { ELEMENT_NAME, type Element, type RosterCosmetics, type StarterBreed, type TierFrame } from '../meta/roster';

export interface Coat {
  base: number;
  light: number;
  dark: number;
  accent: number;
}

/** What one hero wears. `coat` is an item id from `wardrobe()` (null = default); `chroma` an owned element. */
export interface Look {
  coat: string | null;
  chroma: Element | null;
}

export const DEFAULT_LOOK: Look = Object.freeze({ coat: null, chroma: null }) as Look;

export const lookKey = (l: Look | null | undefined): string => (l ? `${l.coat ?? '-'}|${l.chroma ?? '-'}` : '-|-');

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

export const CAT_HEROES: readonly HeroId[] = ['clem', 'sage'];

export interface CoatOption {
  id: string | null;
  name: string;
  /** Where it comes from (shown as a small tag). */
  from: 'default' | 'free' | 'store' | 'cats';
}

export interface Owned {
  /** Purchased item ids (empty in app builds). */
  items: ReadonlySet<string>;
  /** Free unlock ids from the local profile. */
  unlocks: ReadonlySet<string>;
  roster: RosterCosmetics;
}

export const FREE_BISCUIT = 'coat.brutus.biscuit';

/**
 * Treat Track coats (meta/treats.ts, fixed order, free by playing): an unlock id → hero, name and palette. Like the
 * Biscuit coat they live in the local profile's unlocks.
 */
export const FREE_COATS: Readonly<Record<string, { hero: HeroId; name: string; coat: Coat }>> = Object.freeze({
  'coat.clem.marmalade': { hero: 'clem', name: 'Marmalade coat', coat: { base: 0xf0a04b, light: 0xffe2b8, dark: 0xb5652a, accent: 0xff7a3d } },
  'coat.clem.snowpaw': { hero: 'clem', name: 'Snowpaw coat', coat: { base: 0xf4f1ec, light: 0xffffff, dark: 0xb9c3cf, accent: 0x8fc8ff } },
  'coat.sage.midnight': { hero: 'sage', name: 'Midnight coat', coat: { base: 0x3a3f5c, light: 0x8a90b8, dark: 0x1f2236, accent: 0x9be3c4 } },
  'coat.sage.sunrise': { hero: 'sage', name: 'Sunrise coat', coat: { base: 0xffc58a, light: 0xfff0dc, dark: 0xd98a4a, accent: 0xff8fb1 } },
  'coat.brutus.ember': { hero: 'brutus', name: 'Ember coat', coat: { base: 0x8a3b2a, light: 0xe8a07a, dark: 0x4a1d14, accent: 0xffb347 } },
  'coat.cacklejaw.spotted': { hero: 'cacklejaw', name: 'Spotted coat', coat: { base: 0xc9a26b, light: 0xf2dcb4, dark: 0x5a4028, accent: 0xb07cff } },
  'coat.cacklejaw.dusk': { hero: 'cacklejaw', name: 'Dusk coat', coat: { base: 0x6a5a8a, light: 0xc0b0e0, dark: 0x352a4a, accent: 0xffd34d } },
});
export const breedCoatId = (b: StarterBreed): string => `coat.breed.${b}`;

/** The coats a hero can wear, default first. */
export function wardrobe(hero: HeroId, o: Owned): CoatOption[] {
  const out: CoatOption[] = [{ id: null, name: 'Classic', from: 'default' }];
  if (hero === 'brutus' && o.unlocks.has(FREE_BISCUIT)) out.push({ id: FREE_BISCUIT, name: 'Biscuit coat', from: 'free' });
  for (const [id, f] of Object.entries(FREE_COATS)) if (f.hero === hero && o.unlocks.has(id)) out.push({ id, name: f.name, from: 'free' });
  if (hero === 'clem' && o.items.has('skin.clem.pink_bow')) out.push({ id: 'skin.clem.pink_bow', name: 'Pink Bow Clem', from: 'store' });
  if (o.items.has(`coat.founder.${hero}`)) out.push({ id: `coat.founder.${hero}`, name: 'Founder coat', from: 'store' });
  if (hero === 'clem' && o.items.has('skin.clem.dawnblade')) out.push({ id: 'skin.clem.dawnblade', name: 'Dawnblade Clem', from: 'store' });
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
  const coats = wardrobe(hero, o);
  const ids = coats.map((c) => c.id);
  let coat: string | null;
  if (chosen && chosen.coat !== undefined && ids.includes(chosen.coat)) coat = chosen.coat;
  else {
    const rank = (c: CoatOption): number => (c.id?.startsWith('skin.clem.dawnblade') ? 5 : c.id?.startsWith('skin.') ? 4 : c.id?.startsWith('coat.founder') ? 3 : c.from === 'free' ? 2 : c.from === 'cats' ? 1 : 0);
    coat = [...coats].sort((a, b) => rank(b) - rank(a))[0]?.id ?? null;
  }
  const chromas = o.roster.chromas;
  let chroma: Element | null;
  if (chosen && chosen.chroma !== undefined && (chosen.chroma === null || chromas.includes(chosen.chroma))) chroma = chosen.chroma;
  // round 0: the first squad mate's element (the newest adoption or the chosen squad), not the first in ELEMENTS order
  else chroma = o.roster.companions.find((c) => chromas.includes(c.element))?.element ?? chromas[0] ?? null;
  return { coat, chroma };
}

export type FrameId = TierFrame | 'frame.founder' | 'frame.legend';

export const FRAME_NAME: Readonly<Record<FrameId, string>> = Object.freeze({
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
export function bestFrame(o: Owned): FrameId | null {
  if (o.items.has('frame.legend')) return 'frame.legend';
  if (o.items.has('frame.founder')) return 'frame.founder';
  const f = o.roster.frames;
  return f.length ? f[f.length - 1] : null;
}

/** "Founder" title, or null. */
export function titleOf(o: Owned): string | null {
  return o.items.has('title.founder') ? 'Founder' : null;
}

/** Store items the look shows (for `item_seen_in_match{sku}` analytics). */
export function lookItems(l: Look): string[] {
  return l.coat && (l.coat.startsWith('skin.') || l.coat.startsWith('coat.founder.')) ? [l.coat] : [];
}

/** A kitten coat from a companion's breed or preset index. */
export function kittenCoat(c: StarterBreed | number): Coat {
  return typeof c === 'number' ? KITTEN_PRESETS[((c % KITTEN_PRESETS.length) + KITTEN_PRESETS.length) % KITTEN_PRESETS.length] : BREED_COAT[c];
}

/** The coat palette for a hero's look (null = the hero's own default palette). */
export function lookCoat(hero: HeroId, l: Look): Coat | null {
  const id = l.coat;
  if (!id) return null;
  if (id.startsWith('coat.breed.')) {
    const b = id.slice('coat.breed.'.length) as StarterBreed;
    return CAT_HEROES.includes(hero) && BREED_COAT[b] ? BREED_COAT[b] : null;
  }
  const free = FREE_COATS[id];
  if (free) return free.hero === hero ? free.coat : null;
  if (id === FREE_BISCUIT && hero === 'brutus') return { base: 0xc98a4b, light: 0xfbe6c4, dark: 0x7a4a24, accent: 0x7a4a24 };
  if (id === 'skin.clem.pink_bow' && hero === 'clem') return { base: 0xffb3c4, light: 0xfff4f6, dark: 0xe5788f, accent: 0xff6f91 };
  if (id === 'skin.clem.dawnblade' && hero === 'clem') return { base: 0xfff0d0, light: 0xffffff, dark: 0xf0b84a, accent: 0xffd34d };
  return null;
}
