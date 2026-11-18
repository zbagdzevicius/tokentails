/**
 * The Profile screen's data (founder, Nov 18: "full width tab like with store … immersive, everything profile related in
 * one place like in League of Legends"). Pure: the screen gives these functions what the device and the host already
 * know (the local profile, the mastery cache, the entitlements, the `name.get`, `social.get`, `ranked.me` and
 * `history.list` answers) and draws what they return. Nothing here calls the host or reads storage.
 */
import { HEROES, HERO_IDS, type HeroId } from '../../data/heroes';
import type { HeroRole } from '../../data/heroes/types';
import { levelInfo, type LevelInfo } from '../../meta/accountLevel';
import { MASTERY_MAX, masteryToNext, type MasteryMap } from '../../meta/mastery';
import { LEGEND_IDX, RANKED_TIERS, rankedLabel, type RankedCard } from '../../meta/ranked';

export type ProfileTab = 'overview' | 'matches' | 'champions' | 'stats' | 'collection' | 'account';
export const PROFILE_TABS: readonly ProfileTab[] = Object.freeze(['overview', 'matches', 'champions', 'stats', 'collection', 'account'] as ProfileTab[]);
/** Another player's profile: what their public answer carries (no collection, no account). */
export const OTHER_TABS: readonly ProfileTab[] = Object.freeze(['overview', 'matches', 'champions', 'stats'] as ProfileTab[]);
export const TAB_LABEL: Readonly<Record<ProfileTab, string>> = Object.freeze({
  overview: 'Overview',
  matches: 'Matches',
  champions: 'Champions',
  stats: 'Stats',
  collection: 'Collection',
  account: 'Account',
});

export const isProfileTab = (v: unknown): v is ProfileTab => typeof v === 'string' && (PROFILE_TABS as readonly string[]).includes(v);

/** Tabs shown for this view. Pure. */
export const tabsFor = (self: boolean): readonly ProfileTab[] => (self ? PROFILE_TABS : OTHER_TABS);

/** A finished match as the profile lists it (from the account's `history.list` or this device). */
export interface ProfileRow {
  id: string;
  at: number;
  hero: string;
  outcome: 'won' | 'lost' | 'draw';
  k: number;
  d: number;
  a: number;
  mode: string;
  grade: string | null;
  mvp: 'mvp' | 'svp' | null;
}

/** The season numbers (`history.list` stats, or counted from the rows here). */
export interface ProfileStats {
  matches: number;
  wins: number;
  winRate: number | null;
  kda: number;
  mvp: number;
  favourites: { hero: string; matches: number; wins: number; winRate: number }[];
  /** 'season': the server's season stats; 'device': counted from the rows on this device. */
  from: 'season' | 'device';
  season?: string;
}

/** Everything the screen draws. Built by the app from what it already holds, then filled in as answers arrive. */
export interface ProfileData {
  self: boolean;
  /** A registered account (self) is signed in; another player's profile is always "signed in". */
  signedIn: boolean;
  name: string;
  code: string | null;
  av: unknown;
  title: string | null;
  frame: string | null;
  cc: string | null;
  /** Finished matches the account level counts (self: the profile's count; others: their season matches). */
  matches: number;
  level: LevelInfo | null;
  pass: { tier: number; tiers: number; pct: number; xp: number; premium: boolean; name: string } | null;
  yarn: number | null;
  ranked: RankedCard | null;
  mastery: MasteryMap;
  champs: { owned: number; total: number } | null;
  items: readonly string[];
  stats: ProfileStats | null;
  rows: ProfileRow[];
  /** Good-teammate kudos received (CLUBS-KUDOS.md), when known. */
  kudos: number | null;
}

export const emptyData = (self: boolean, name: string): ProfileData => ({
  self,
  signedIn: !self,
  name,
  code: null,
  av: null,
  title: null,
  frame: null,
  cc: null,
  matches: 0,
  level: self ? levelInfo(0) : null,
  pass: null,
  yarn: null,
  ranked: null,
  mastery: {},
  champs: null,
  items: [],
  stats: null,
  rows: [],
  kudos: null,
});

const isHero = (h: unknown): h is HeroId => typeof h === 'string' && h in HEROES;

/** Champions by mastery, best first (level, then points), at most `n`. Pure. */
export function topMastery(m: MasteryMap, n = 3): { hero: HeroId; level: number; m: number; w: number; toNext: number | null }[] {
  return Object.entries(m)
    .filter(([h, r]) => isHero(h) && !!r && r.level > 0)
    .map(([h, r]) => ({ hero: h as HeroId, level: r!.level, m: r!.m, w: r!.w, toNext: masteryToNext(r!) }))
    .sort((a, b) => b.level - a.level || b.m + b.w - (a.m + a.w) || a.hero.localeCompare(b.hero))
    .slice(0, n);
}

/** The total mastery score (the sum of every champion's level, LoL's "mastery score"). Pure. */
export const masteryScore = (m: MasteryMap): number => Object.values(m).reduce((s, r) => s + (r?.level ?? 0), 0);

/** Champions at the top mastery level. Pure. */
export const maxedCount = (m: MasteryMap): number => Object.values(m).filter((r) => (r?.level ?? 0) >= MASTERY_MAX).length;

/**
 * The banner's champion: the most played this season, else the top mastery, else the avatar's hero, else Clem. Pure.
 */
export function bannerHero(d: Pick<ProfileData, 'stats' | 'mastery' | 'av' | 'rows'>): HeroId {
  const fav = d.stats?.favourites.find((f) => isHero(f.hero));
  if (fav) return fav.hero as HeroId;
  const top = topMastery(d.mastery, 1)[0];
  if (top) return top.hero;
  const counted = favouritesOf(d.rows)[0];
  if (counted && isHero(counted.hero)) return counted.hero as HeroId;
  const i = (d.av as { i?: unknown } | null)?.i;
  if (typeof i === 'string' && i.startsWith('h:') && isHero(i.slice(2))) return i.slice(2) as HeroId;
  return 'clem';
}

/** Champions by matches in these rows (ties: wins). Pure. */
export function favouritesOf(rows: readonly ProfileRow[]): ProfileStats['favourites'] {
  const by = new Map<string, { matches: number; wins: number }>();
  for (const r of rows) {
    const c = by.get(r.hero) ?? { matches: 0, wins: 0 };
    c.matches++;
    if (r.outcome === 'won') c.wins++;
    by.set(r.hero, c);
  }
  return [...by.entries()]
    .map(([hero, c]) => ({ hero, matches: c.matches, wins: c.wins, winRate: Math.round((c.wins / c.matches) * 100) }))
    .sort((a, b) => b.matches - a.matches || b.wins - a.wins || a.hero.localeCompare(b.hero));
}

/** Season numbers counted from rows (the device's own history when the account answered none). Pure. */
export function statsOfRows(rows: readonly ProfileRow[]): ProfileStats | null {
  if (!rows.length) return null;
  const wins = rows.filter((r) => r.outcome === 'won').length;
  const k = rows.reduce((s, r) => s + r.k, 0);
  const d = rows.reduce((s, r) => s + r.d, 0);
  const a = rows.reduce((s, r) => s + r.a, 0);
  return {
    matches: rows.length,
    wins,
    winRate: Math.round((wins / rows.length) * 100),
    kda: Math.round(((k + a) / Math.max(1, d)) * 10) / 10,
    mvp: rows.filter((r) => r.mvp === 'mvp').length,
    favourites: favouritesOf(rows),
    from: 'device',
  };
}

/** The server's `history.list` stats, checked, or null. Pure. */
export function parseStats(raw: unknown): ProfileStats | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const n = (v: unknown, max = 1e7): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.min(max, v) : 0);
  const matches = Math.floor(n(o.matches));
  const favs = Array.isArray(o.favourites) ? o.favourites : [];
  return {
    matches,
    wins: Math.floor(n(o.wins)),
    winRate: typeof o.winRate === 'number' && Number.isFinite(o.winRate) ? Math.max(0, Math.min(100, Math.round(o.winRate))) : null,
    kda: Math.round(n(o.kda, 999) * 10) / 10,
    mvp: Math.floor(n(o.mvp)),
    favourites: favs
      .filter((f): f is Record<string, unknown> => !!f && typeof f === 'object' && isHero((f as Record<string, unknown>).hero))
      .slice(0, 8)
      .map((f) => ({ hero: f.hero as string, matches: Math.floor(n(f.matches)), wins: Math.floor(n(f.wins)), winRate: Math.max(0, Math.min(100, Math.round(n(f.winRate, 100)))) })),
    from: 'season',
    ...(typeof o.name === 'string' && o.name.length < 40 ? { season: o.name } : {}),
  };
}

/** A `history.list` row or a device row as a profile row, or null. Pure. */
export function rowOf(raw: unknown, fallbackId = ''): ProfileRow | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.hero !== 'string' || !(o.outcome === 'won' || o.outcome === 'lost' || o.outcome === 'draw')) return null;
  const n = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.min(999, Math.floor(v)) : 0);
  return {
    id: typeof o.id === 'string' ? o.id : fallbackId,
    at: typeof o.at === 'number' && Number.isFinite(o.at) ? o.at : 0,
    hero: o.hero,
    outcome: o.outcome,
    k: n(o.k),
    d: n(o.d),
    a: n(o.a),
    mode: typeof o.mode === 'string' ? o.mode : 'skirmish',
    grade: typeof o.grade === 'string' && /^[SABCD][+-]?$/.test(o.grade) ? o.grade : null,
    mvp: o.mvp === 'mvp' || o.mvp === 'svp' ? o.mvp : null,
  };
}

/** The ranked crest: tier id, label and a short line; a placement or unranked state otherwise. Pure. */
export function rankView(r: RankedCard | null): { tier: string; label: string; line: string } {
  if (!r) return { tier: 'none', label: 'Unranked', line: 'Play Ranked to get a rank.' };
  if (r.tierIdx === undefined || r.placementsLeft > 0) {
    const done = Math.max(0, r.placementsOf - r.placementsLeft);
    return { tier: 'none', label: 'Placements', line: `${done} / ${r.placementsOf} placement matches played` };
  }
  const t = r.tierIdx >= LEGEND_IDX ? RANKED_TIERS[4] : RANKED_TIERS[Math.max(0, Math.min(3, Math.floor(r.tierIdx / 3)))];
  return { tier: t.id, label: rankedLabel(r.tierIdx), line: r.tierIdx >= LEGEND_IDX ? `${Math.max(0, r.points ?? 0)} pts` : `${Math.max(0, r.points ?? 0)} / 100 pts${r.peak ? ` · Best ${r.peak}` : ''}` };
}

/** Per role: matches, wins and win rate from the favourites (heroes mapped to their role), most played first. Pure. */
export function roleSplit(favs: ProfileStats['favourites']): { role: HeroRole; matches: number; wins: number; winRate: number }[] {
  const by = new Map<HeroRole, { matches: number; wins: number }>();
  for (const f of favs) {
    if (!isHero(f.hero)) continue;
    const role = HEROES[f.hero].role;
    const c = by.get(role) ?? { matches: 0, wins: 0 };
    c.matches += f.matches;
    c.wins += f.wins;
    by.set(role, c);
  }
  return [...by.entries()]
    .map(([role, c]) => ({ role, matches: c.matches, wins: c.wins, winRate: c.matches ? Math.round((c.wins / c.matches) * 100) : 0 }))
    .sort((a, b) => b.matches - a.matches || a.role.localeCompare(b.role));
}

/** Last results as W / L / D, newest first, at most `n`. Pure. */
export const formOf = (rows: readonly ProfileRow[], n = 10): ('W' | 'L' | 'D')[] =>
  [...rows]
    .sort((a, b) => b.at - a.at)
    .slice(0, n)
    .map((r) => (r.outcome === 'won' ? 'W' : r.outcome === 'lost' ? 'L' : 'D'));

/** Owned cosmetics by kind (coats, borders, titles, icons). Pure. */
export function collectionCounts(items: readonly string[]): { coats: number; frames: number; titles: number } {
  const set = new Set(items);
  let coats = 0;
  let frames = 0;
  let titles = 0;
  for (const i of set) {
    if (i.startsWith('coat.')) coats++;
    else if (i.startsWith('frame.')) frames++;
    else if (i.startsWith('title.')) titles++;
  }
  return { coats, frames, titles };
}

/** The borders this player may wear (owned store, season, legend and founder borders), 'none' first. Pure. */
export const wearableFrames = (items: readonly string[]): string[] => ['none', ...items.filter((i) => /^frame\.(store|s1|ranked)\.[a-z0-9._-]+$|^frame\.(legend|founder)$/.test(i))];
/** The titles this player may wear, 'none' first. Pure. */
export const wearableTitles = (items: readonly string[]): string[] => ['none', ...items.filter((x) => /^title\.[a-z0-9._-]{1,48}$/.test(x))];

/** Champions as the Champions tab lists them: every champion with its mastery (played first), then the rest. Pure. */
export function championRows(m: MasteryMap, favs: ProfileStats['favourites'], self: boolean): { hero: HeroId; level: number; matches: number; wins: number; toNext: number | null }[] {
  const fav = new Map(favs.map((f) => [f.hero, f]));
  const heroes = self ? HERO_IDS : HERO_IDS.filter((h) => fav.has(h) || m[h]);
  return heroes
    .map((h) => {
      const r = m[h];
      const f = fav.get(h);
      return { hero: h, level: r?.level ?? 0, matches: r?.m ?? f?.matches ?? 0, wins: r?.w ?? f?.wins ?? 0, toNext: r ? masteryToNext(r) : null };
    })
    .sort((a, b) => b.level - a.level || b.matches - a.matches || HERO_IDS.indexOf(a.hero) - HERO_IDS.indexOf(b.hero));
}

/** "1,234". */
export const num = (n: number): string => Math.max(0, Math.floor(n)).toLocaleString('en-US');
