/**
 * The Profile screen's Collection: every icon, border, title and coat the game knows, with whether this player owns
 * it. Owned comes from ONE place, `ownedSet`: the entitlements' items, the free unlocks the Treat Track and the Lucky
 * Treat paid (the profile's `unlocks`; founder, Nov 19: "Raspberry's Pal" showed in the Treat Track but locked here)
 * and what the server says the player wears (a worn title or border is owned by definition). The Overview, the
 * Collection and Edit profile all read it, so they always agree.
 */
import { HEROES, HERO_IDS, type HeroId } from '../../data/heroes';
import { PAID_COATS } from '../../render/cosmetics';
import { cssHex } from '../../render/skins/coatChromas';
import { SEASONS, STORE_FRAMES } from '../../money/catalog';
import { TRACK_CHAMPIONS, TRACK_TITLES } from '../../meta/treats';
import { frameName, frameRing, titleText } from '../avatar';

export interface CollectionEntry {
  id: string;
  name: string;
  owned: boolean;
  /** 'store': bought in the Store; 'pass': a Legends Pass tier; 'earned': the Treat Track or an account reward. */
  from: 'store' | 'pass' | 'earned';
  hero?: HeroId;
  /** Coat palette (base, dark, accent) as CSS colours; a border's ring colour. */
  colors?: string[];
}

export interface Collection {
  coats: CollectionEntry[];
  frames: CollectionEntry[];
  titles: CollectionEntry[];
}

/** The Collection's four kinds, in tab order. */
export type CollectionKind = 'icons' | 'frames' | 'titles' | 'coats';
export const COLLECTION_KINDS: readonly CollectionKind[] = Object.freeze(['icons', 'frames', 'titles', 'coats']);
export const KIND_LABEL: Readonly<Record<CollectionKind, string>> = Object.freeze({ icons: 'Icons', frames: 'Borders', titles: 'Titles', coats: 'Coats' });
export const isCollectionKind = (v: unknown): v is CollectionKind => typeof v === 'string' && (COLLECTION_KINDS as readonly string[]).includes(v);

/** What this player owns: the entitlements' items, the free unlocks, and the worn title and border. Pure. */
export function ownedSet(items: Iterable<string>, worn: { title?: string | null; frame?: string | null } = {}): Set<string> {
  const out = new Set<string>();
  for (const i of items) if (typeof i === 'string' && i) out.add(i);
  if (worn.title) out.add(worn.title);
  if (worn.frame) out.add(worn.frame);
  return out;
}

const PASS_ITEMS = SEASONS.flatMap((s) => [...s.free, ...s.premium]);
const TRACK_FRAMES = TRACK_CHAMPIONS.map((h) => `frame.champ.${h}`);

const byOwned = (a: CollectionEntry, b: CollectionEntry): number => Number(b.owned) - Number(a.owned);
const fromOf = (id: string, store: boolean): CollectionEntry['from'] => (store ? 'store' : /^(frame|title)\.s\d+\./.test(id) ? 'pass' : 'earned');

/** Every coat, border and title, owned first (catalogue order within). Pure. */
export function collectionOf(owned: ReadonlySet<string>): Collection {
  const coats: CollectionEntry[] = Object.entries(PAID_COATS)
    .filter(([, r]) => r.hero in HEROES)
    .map(([id, r]) => ({ id, name: r.name.replace(/ coat$/, '').replace(/ \(Epic\)$/, ''), owned: owned.has(id), from: r.from, hero: r.hero, colors: [cssHex(r.coat.base), cssHex(r.coat.dark), cssHex(r.coat.accent)] }));
  const frameIds = [...STORE_FRAMES.map((f) => f.id), ...PASS_ITEMS.filter((r) => r.item.startsWith('frame.')).map((r) => r.item), ...TRACK_FRAMES];
  for (const i of owned) if (i.startsWith('frame.') && !frameIds.includes(i)) frameIds.push(i);
  const frames: CollectionEntry[] = frameIds.map((id) => {
    const store = STORE_FRAMES.some((f) => f.id === id);
    return { id, name: frameName(id), owned: owned.has(id), from: fromOf(id, store), colors: [frameRing(id) ?? '#ffd166'] };
  });
  const titleIds = [...STORE_FRAMES.map((f) => f.title.id), ...PASS_ITEMS.filter((r) => r.item.startsWith('title.')).map((r) => r.item), ...Object.keys(TRACK_TITLES)];
  for (const i of owned) if (i.startsWith('title.') && !titleIds.includes(i)) titleIds.push(i);
  const titles: CollectionEntry[] = titleIds.map((id) => ({ id, name: titleText(id), owned: owned.has(id), from: fromOf(id, STORE_FRAMES.some((f) => f.title.id === id)) }));
  return { coats: coats.sort(byOwned), frames: frames.sort(byOwned), titles: titles.sort(byOwned) };
}

/** "3 / 56". */
export const ownedOf = (list: readonly { owned: boolean }[]): { owned: number; total: number } => ({ owned: list.filter((e) => e.owned).length, total: list.length });

/** Coats grouped by champion: champions with an owned coat first, then roster order; owned coats first in a group. Pure. */
export function coatGroups(coats: readonly CollectionEntry[]): { hero: HeroId; coats: CollectionEntry[]; owned: number }[] {
  const by = new Map<HeroId, CollectionEntry[]>();
  for (const c of coats) if (c.hero) by.set(c.hero, [...(by.get(c.hero) ?? []), c]);
  const order = (h: HeroId): number => HERO_IDS.indexOf(h);
  return [...by.entries()]
    .map(([hero, list]) => ({ hero, coats: [...list].sort(byOwned), owned: list.filter((c) => c.owned).length }))
    .sort((a, b) => Number(b.owned > 0) - Number(a.owned > 0) || order(a.hero) - order(b.hero));
}

/** Where a locked item comes from: the one place to get it, and the button that opens it. */
export function whereOf(e: Pick<CollectionEntry, 'from'>): { label: string; line: string; action: 'store' | 'pass' | 'track' } {
  if (e.from === 'store') return { label: 'Store', line: 'Get it in the Store.', action: 'store' };
  if (e.from === 'pass') return { label: 'Legends Pass', line: 'A Legends Pass reward.', action: 'pass' };
  return { label: 'Treat Track', line: 'Earn it on the Treat Track by playing matches.', action: 'track' };
}
