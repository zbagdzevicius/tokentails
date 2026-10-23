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
import { ELEMENT_NAME, type Element, type RosterCosmetics, type StarterBreed, type TierFrame } from '../meta/roster';
import { isCardSkinId, skinRev } from './skins/skinStore';
import { LOOP_PALETTES, LOOP_REWARDS, TRACK_TITLES } from '../meta/treats';
import { SHELTER_CHAMPIONS } from '../data/heroes/shelter';

const SHELTER_NAME = Object.fromEntries(SHELTER_CHAMPIONS.map((c) => [c.hero, c.cardName])) as Record<'lambo' | 'aviete' | 'bengas' | 'gabe', string>;

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

/**
 * The cache key of a look (geometry, portraits, the lobby): `coat|chroma`, and for a card skin (GDD §7.2)
 * `cat.<id>@<rev>|chroma`, where rev is the skin's palette revision (a finished sprite probe bumps it).
 */
export const lookKey = (l: Look | null | undefined): string => {
  if (!l) return '-|-';
  const coat = l.coat ?? '-';
  return `${isCardSkinId(l.coat) ? `${coat}@${skinRev(coat)}` : coat}|${l.chroma ?? '-'}`;
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
export const CAT_HEROES: readonly HeroId[] = ['clem', 'sage'];

/** Sim v9 shelter champions (data/heroes/shelter.ts): their card's coat plus element chromas only. */
export const SHELTER_HEROES: readonly HeroId[] = ['lambo', 'aviete', 'bengas', 'gabe'];

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

export type FrameId = TierFrame | 'frame.founder' | 'frame.legend' | TrackFrame;

export const FRAME_NAME: Readonly<Record<FrameId, string>> = Object.freeze({
  ...TRACK_FRAME_NAME,
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
  if (o.items.has('frame.legend')) return 'frame.legend';
  if (o.items.has('frame.founder')) return 'frame.founder';
  const f = o.roster.frames;
  return f.length ? f[f.length - 1] : null;
}

/** The title worn: a champion title from the track the player chose (and owns), else "Founder", or null. */
export function titleOf(o: Owned, worn?: string | null): string | null {
  if (worn && TRACK_TITLES[worn] && o.unlocks.has(worn)) return TRACK_TITLES[worn];
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
