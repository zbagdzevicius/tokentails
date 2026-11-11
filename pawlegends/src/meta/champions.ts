/**
 * Which champions this player may pick (docs/plans/moba/CHAMPION-STORE.md). Meta only: the sim, the replay record
 * and the hash never read it. The numbers are the catalogue's (money/catalog.ts, the backend's mirror).
 *
 * - The server's word comes from the host's `store` message (`GET /pawlegends/me` → `champions`): owned champions and
 *   how each was got, the Founders roster, the week's rotation, the Yarn balance and the Champion Picks.
 * - Without a host (or before it answers, or signed out) the game computes the same starters and rotation itself, so
 *   a new player always has 3 cats and 3 dogs plus the week's 6.
 * - App builds (GDD §8.1 #10, Apple 3.1.3(b)): a champion bought on the web is not offered (founder decision 1); a
 *   Yarn unlock, a Champion Pick, a pass reward and the Founders roster are.
 *
 * The relay and `/live` check the same rule on the server; this file only decides what the screens offer.
 */
import {
  CHAMP_PICK_TIERS,
  CHAMPION_IDS,
  STARTERS,
  TIER_PRICE,
  YARN,
  champTier,
  champYarnPrice,
  rotationEndsAt,
  rotationOf,
  rotationWeek,
} from '../money/catalog';

export type ChampSource = 'purchase' | 'pass' | 'legacy' | 'founders' | 'yarn' | 'milestone';
const SOURCES: readonly ChampSource[] = ['purchase', 'pass', 'legacy', 'founders', 'yarn', 'milestone'];

export interface ChampionsState {
  owned: { hero: string; source: ChampSource }[];
  founders: boolean;
  rotation: { week: number; heroes: string[]; endsAt: string };
  yarn: { balance: number; matches: number; picksLeft: number; nextPickAt: number | null };
  /** The champion bundles' prices for this account (null: every champion in it is owned). */
  bundles: { sku: string; cents: { usd: number; eur: number } | null }[];
  /** From the server (else computed here: starters and the rotation only). */
  server: boolean;
}

/** No server answer: the starters and this week's rotation. */
export function localChampions(now = Date.now()): ChampionsState {
  const week = rotationWeek(now);
  return {
    owned: [],
    founders: false,
    rotation: { week, heroes: rotationOf(week), endsAt: rotationEndsAt(week) },
    yarn: { balance: 0, matches: 0, picksLeft: 0, nextPickAt: null },
    bundles: [],
    server: false,
  };
}

/** No host at all (a standalone page: no account, nothing saved): every champion open, as Practice. */
export function openChampions(now = Date.now()): ChampionsState {
  return { ...localChampions(now), owned: CHAMPION_IDS.map((hero) => ({ hero, source: 'legacy' as const })) };
}

const int = (v: unknown, max: number): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.min(max, Math.floor(v)) : 0);
const heroOk = (h: unknown): h is string => typeof h === 'string' && CHAMPION_IDS.includes(h);
const centsOk = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v > 0 && v < 100_000 ? v : null);

/** The host's `store.champions` as a clean copy (known champions only), or null. Never throws. */
export function parseChampionsState(v: unknown, now = Date.now()): ChampionsState | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (!Array.isArray(o.owned)) return null;
  const seen = new Set<string>();
  const owned: ChampionsState['owned'] = [];
  for (const r of o.owned.slice(0, 64)) {
    const x = r && typeof r === 'object' ? (r as Record<string, unknown>) : null;
    if (!x || !heroOk(x.hero) || seen.has(x.hero)) continue;
    seen.add(x.hero);
    owned.push({ hero: x.hero, source: (SOURCES as readonly unknown[]).includes(x.source) ? (x.source as ChampSource) : 'purchase' });
  }
  // the rotation is computed here from the server's week (the heroes are the catalogue's, never the message's)
  const r = o.rotation && typeof o.rotation === 'object' ? (o.rotation as Record<string, unknown>) : null;
  const week = r && typeof r.week === 'number' && Number.isInteger(r.week) && Math.abs(r.week) < 100_000 ? r.week : rotationWeek(now);
  const y = o.yarn && typeof o.yarn === 'object' ? (o.yarn as Record<string, unknown>) : {};
  const next = typeof y.nextPickAt === 'number' && Number.isInteger(y.nextPickAt) && y.nextPickAt > 0 && y.nextPickAt < 10_000 ? y.nextPickAt : null;
  const bundles: ChampionsState['bundles'] = [];
  if (Array.isArray(o.bundles)) {
    for (const b of o.bundles.slice(0, 8)) {
      const x = b && typeof b === 'object' ? (b as Record<string, unknown>) : null;
      if (!x || typeof x.sku !== 'string' || !/^pl_champs_[a-z0-9_]{1,30}$/.test(x.sku)) continue;
      const c = x.cents && typeof x.cents === 'object' ? (x.cents as Record<string, unknown>) : null;
      const usd = c ? centsOk(c.usd) : null;
      const eur = c ? centsOk(c.eur) : null;
      bundles.push({ sku: x.sku, cents: usd !== null && eur !== null ? { usd, eur } : null });
    }
  }
  return {
    owned,
    founders: o.founders === true,
    rotation: { week, heroes: rotationOf(week), endsAt: rotationEndsAt(week) },
    yarn: { balance: int(y.balance, 100_000_000), matches: int(y.matches, 10_000_000), picksLeft: int(y.picksLeft, 100), nextPickAt: next },
    bundles,
    server: true,
  };
}

export type ChampStatus = 'starter' | 'free' | 'owned' | 'locked';

/**
 * A champion's state for this player: a starter, free this week, owned, or locked. A hero the catalogue does not
 * know (a newer sim's) is a starter. App builds: a champion bought on the web counts as locked (founder decision 1).
 */
export function champStatus(hero: string, s: ChampionsState, isApp = false): ChampStatus {
  if (!CHAMPION_IDS.includes(hero) || STARTERS.includes(hero)) return 'starter';
  const own = s.owned.find((o) => o.hero === hero);
  if (own && !(isApp && own.source === 'purchase')) return 'owned';
  if (s.rotation.heroes.includes(hero)) return 'free';
  return 'locked';
}

export const canPlay = (hero: string, s: ChampionsState, isApp = false): boolean => champStatus(hero, s, isApp) !== 'locked';

/** Owned champions shown in the collection ("Champions 9/20"): starters, owned (app: not web-bought). */
export function ownedCount(s: ChampionsState, isApp = false): number {
  return CHAMPION_IDS.filter((h) => {
    const st = champStatus(h, s, isApp);
    return st === 'starter' || st === 'owned';
  }).length;
}

/** About how many matches the Yarn still to earn takes (a loss with a few takedowns: about 70). */
export const matchesFor = (yarn: number): number => Math.max(1, Math.ceil(yarn / (YARN.loss + 5 * YARN.perTakedown)));

export interface UnlockInfo {
  /** The Yarn price, or null for a champion that is not sold (a starter). */
  yarn: number | null;
  /** Yarn still to earn (0 when the balance is enough). */
  toGo: number;
  /** A Champion Pick can unlock it (Tier 1 or 2, a pick left). */
  pick: boolean;
  /** The web price in cents for this tier (display only; the server price always wins). */
  cents: { usd: number; eur: number } | null;
}

export function unlockInfo(hero: string, s: ChampionsState): UnlockInfo {
  const yarn = champYarnPrice(hero);
  const t = champTier(hero);
  return {
    yarn,
    toGo: yarn === null ? 0 : Math.max(0, yarn - s.yarn.balance),
    pick: !!t && CHAMP_PICK_TIERS.includes(t) && s.yarn.picksLeft > 0,
    cents: t ? TIER_PRICE[t].cents : null,
  };
}

/** "3,500". */
export const yarnText = (n: number): string => n.toLocaleString('en-US');

/** The line a locked tile shows ("Unlock with Yarn"), or '' for a playable champion. */
export function lockReason(hero: string, s: ChampionsState, isApp = false): string {
  return canPlay(hero, s, isApp) ? '' : 'Unlock with Yarn';
}

/** "Free until Sun 22 Nov" (the last day of the rotation week, UTC). */
export function rotationEndText(s: ChampionsState): string {
  const d = new Date(Date.parse(s.rotation.endsAt) - 1);
  if (!Number.isFinite(d.getTime())) return 'Free this week';
  return `Free until ${d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}`;
}
