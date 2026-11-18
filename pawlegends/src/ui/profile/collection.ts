/**
 * The Profile screen's Collection (round 2 critique: "show owned coat and border art in a grid, with locked ones
 * dimmed and linked to the Store"): every store and Legends Pass coat, border and title the game knows, with whether
 * this player owns it. Owned comes from ONE place, `ownedSet` (the entitlements' items plus what the server says the
 * player wears: a worn title or border is owned by definition), so the Overview and the Collection always agree.
 */
import { HEROES, type HeroId } from '../../data/heroes';
import { PAID_COATS } from '../../render/cosmetics';
import { cssHex } from '../../render/skins/coatChromas';
import { SEASONS, STORE_FRAMES } from '../../money/catalog';
import { TRACK_TITLES } from '../../meta/treats';
import { frameRing, titleText } from '../avatar';

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

/** What this player owns: the entitlements' items plus the worn title and border. Pure. */
export function ownedSet(items: Iterable<string>, worn: { title?: string | null; frame?: string | null } = {}): Set<string> {
  const out = new Set<string>();
  for (const i of items) if (typeof i === 'string' && i) out.add(i);
  if (worn.title) out.add(worn.title);
  if (worn.frame) out.add(worn.frame);
  return out;
}

const PASS_ITEMS = SEASONS.flatMap((s) => [...s.free, ...s.premium]);
const PASS_NAME = new Map(PASS_ITEMS.map((r) => [r.item, r.name.replace(/ (title|frame)$/, '')]));

const byOwned = (a: CollectionEntry, b: CollectionEntry): number => Number(b.owned) - Number(a.owned);

/** Every coat, border and title, owned first (catalogue order within). Pure. */
export function collectionOf(owned: ReadonlySet<string>): Collection {
  const coats: CollectionEntry[] = Object.entries(PAID_COATS)
    .filter(([, r]) => r.hero in HEROES)
    .map(([id, r]) => ({ id, name: r.name.replace(/ coat$/, '').replace(/ \(Epic\)$/, ''), owned: owned.has(id), from: r.from, hero: r.hero, colors: [cssHex(r.coat.base), cssHex(r.coat.dark), cssHex(r.coat.accent)] }));
  const frameIds = [...STORE_FRAMES.map((f) => f.id), ...PASS_ITEMS.filter((r) => r.item.startsWith('frame.')).map((r) => r.item)];
  for (const i of owned) if (i.startsWith('frame.') && !frameIds.includes(i)) frameIds.push(i);
  const frames: CollectionEntry[] = frameIds.map((id) => {
    const store = STORE_FRAMES.find((f) => f.id === id);
    return { id, name: store ? store.name.replace(/ frame$/, '') : (PASS_NAME.get(id) ?? titleText(id)), owned: owned.has(id), from: store ? 'store' : id.startsWith('frame.s1.') ? 'pass' : 'earned', colors: [frameRing(id) ?? '#ffd166'] };
  });
  const titleIds = [...STORE_FRAMES.map((f) => f.title.id), ...PASS_ITEMS.filter((r) => r.item.startsWith('title.')).map((r) => r.item), ...Object.keys(TRACK_TITLES)];
  for (const i of owned) if (i.startsWith('title.') && !titleIds.includes(i)) titleIds.push(i);
  const titles: CollectionEntry[] = titleIds.map((id) => {
    const store = STORE_FRAMES.find((f) => f.title.id === id);
    return { id, name: store ? store.title.name : (TRACK_TITLES[id] ?? PASS_NAME.get(id) ?? titleText(id)), owned: owned.has(id), from: store ? 'store' : id.startsWith('title.s1.') ? 'pass' : 'earned' };
  });
  return { coats: coats.sort(byOwned), frames: frames.sort(byOwned), titles: titles.sort(byOwned) };
}

/** "3 / 56". */
export const ownedOf = (list: readonly CollectionEntry[]): { owned: number; total: number } => ({ owned: list.filter((e) => e.owned).length, total: list.length });
