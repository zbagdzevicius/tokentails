/**
 * The champion store's data side (Wild Rift style grid, docs/plans/moba/CHAMPION-STORE.md §10): which cards show for
 * the filters, in which order, and what each card says. Pure: no DOM, no network. The prices, the ownership and the
 * rotation are the catalogue's and meta/champions.ts's; nothing here decides what a player may buy or pick.
 */
import { HERO_IDS } from '../../data/heroes';
import type { HeroId, HeroRole, HeroSide } from '../../data/heroes/types';
import { CHAMPIONS, champTier, type ChampTier } from '../../money/catalog';
import { appHidden, champStatus, unlockInfo, type ChampStatus, type ChampionsState } from '../../meta/champions';
import { assetRev } from '../assetRev';

export type SideFilter = 'all' | HeroSide;
export type SortKey = 'default' | 'price' | 'name' | 'newest';
export const SORT_KEYS: readonly SortKey[] = Object.freeze(['default', 'price', 'name', 'newest'] as SortKey[]);
export const SORT_LABEL: Readonly<Record<SortKey, string>> = Object.freeze({ default: 'Default', price: 'Price', name: 'Name', newest: 'Newest' });

export interface ChampFilter {
  side: SideFilter;
  role: HeroRole | null;
  /** Only champions the player can still unlock (no starters, no owned ones). */
  unowned: boolean;
  sort: SortKey;
}

export const DEFAULT_FILTER: Readonly<ChampFilter> = Object.freeze({ side: 'all', role: null, unowned: false, sort: 'default' });

/** One card of the grid: what the champion costs and how it stands for this player. */
export interface ChampCard {
  hero: HeroId;
  name: string;
  side: HeroSide;
  role: HeroRole;
  status: ChampStatus;
  /** Price tier (null for a starter): the card frame's colour. */
  tier: ChampTier | null;
  /** The Yarn price (null for a starter). */
  yarn: number | null;
  /** Yarn still to earn (0 when the balance covers it). */
  toGo: number;
  /** The web price in cents (display only, the server's price wins). Null for a starter. */
  cents: { usd: number; eur: number } | null;
  /** A Champion Pick can unlock it now. */
  pick: boolean;
  /** App builds: owned on the web, not offered in the app (founder decision 1): "Locked", no unlock. */
  hidden: boolean;
  /** Ownable at all for this player now (locked, or free this week and not owned). */
  unlockable: boolean;
}

/** Release order (HERO_IDS is the order the heroes shipped in): newest last. */
const RELEASE: Readonly<Record<string, number>> = Object.freeze(Object.fromEntries(HERO_IDS.map((h, i) => [h, i])));

export function champCard(hero: HeroId, s: ChampionsState, isApp: boolean): ChampCard | null {
  const def = CHAMPIONS.find((c) => c.hero === hero);
  if (!def) return null;
  const status = champStatus(hero, s, isApp);
  const info = unlockInfo(hero, s);
  const hidden = appHidden(hero, s, isApp);
  return {
    hero,
    name: def.name,
    side: def.side as HeroSide,
    role: def.role as HeroRole,
    status,
    tier: champTier(hero),
    yarn: info.yarn,
    toGo: info.toGo,
    cents: info.cents,
    pick: info.pick,
    hidden,
    unlockable: !hidden && info.yarn !== null && (status === 'locked' || status === 'free'),
  };
}

/** Every catalogue champion the game has, as cards (catalogue order). */
export function allCards(s: ChampionsState, isApp: boolean): ChampCard[] {
  return CHAMPIONS.map((c) => champCard(c.hero as HeroId, s, isApp)).filter((c): c is ChampCard => !!c && (HERO_IDS as readonly string[]).includes(c.hero));
}

/** The cards the filters keep, in the chosen order (ties keep catalogue order: cats, then dogs, by role). */
export function visibleCards(cards: readonly ChampCard[], f: ChampFilter): ChampCard[] {
  const keep = cards.filter((c) => (f.side === 'all' || c.side === f.side) && (!f.role || c.role === f.role) && (!f.unowned || c.unlockable));
  const idx = new Map(cards.map((c, i) => [c.hero, i]));
  const by = (a: ChampCard, b: ChampCard): number => (idx.get(a.hero) ?? 0) - (idx.get(b.hero) ?? 0);
  if (f.sort === 'name') return keep.sort((a, b) => a.name.localeCompare(b.name, 'en') || by(a, b));
  if (f.sort === 'newest') return keep.sort((a, b) => (RELEASE[b.hero] ?? 0) - (RELEASE[a.hero] ?? 0) || by(a, b));
  // price: cheapest first; starters (no price) last
  if (f.sort === 'price') return keep.sort((a, b) => (a.yarn ?? Infinity) - (b.yarn ?? Infinity) || by(a, b));
  return keep.sort(by);
}

/** The newest champions (the last release's), newest first. */
export function newestHeroes(n = 3): HeroId[] {
  return [...HERO_IDS].reverse().slice(0, n);
}

const SORT_KEY = 'tt.pawlegends.store.sort.v1';
/** The remembered sort (per browser; storage can be missing or throw: then Default). */
export function loadSort(store: Pick<Storage, 'getItem'> | null = safeStorage()): SortKey {
  try {
    const v = store?.getItem(SORT_KEY);
    return (SORT_KEYS as readonly string[]).includes(v ?? '') ? (v as SortKey) : 'default';
  } catch {
    return 'default';
  }
}
export function saveSort(k: SortKey, store: Pick<Storage, 'setItem'> | null = safeStorage()): void {
  try {
    store?.setItem(SORT_KEY, k);
  } catch {
    /* private mode or blocked storage: the sort is only for this visit */
  }
}
function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Splash art (public/assets/splash): a 360 px card for the grid and Low quality, 720 px for the detail and wide cards. */
export function splashUrl(base: string, hero: string, w: 360 | 720): string {
  return `${base}assets/splash/${hero}-${w}.webp${assetRev()}`;
}
/** `<img>` source attributes: Low quality loads the 360 px file only; otherwise the browser picks by width. */
export function splashAttrs(base: string, hero: string, low: boolean, sizes: string): string {
  const s360 = splashUrl(base, hero, 360);
  return low ? `src="${s360}"` : `src="${s360}" srcset="${s360} 360w, ${splashUrl(base, hero, 720)} 720w" sizes="${sizes}"`;
}
