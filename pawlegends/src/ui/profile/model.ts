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
import { DIVISION_NUMERALS, LEGEND_IDX, RANKED_TIERS, parseRankedCard, rankedLabel, type RankedCard } from '../../meta/ranked';
import type { CrestTier } from './crest';

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
  /** The map id (absent on older rows). */
  map: string | null;
  /** Match length in seconds (0: unknown). */
  seconds: number;
  /** The match's mutator ('cannon', 'toybox'…): an Arcade match's own name. Null: none or not known. */
  mutator?: string | null;
  /**
   * The stats line (Nov 19, founder: "show more stats"; the account's rows only). Null: not stored for this match,
   * and the row hides it (never a zero).
   */
  lv?: number | null;
  cs?: number | null;
  fish?: number | null;
  /** Damage to champions, and the match's most (the bar). */
  dmg?: number | null;
  dmgTop?: number | null;
  /** Kill participation, 0..100. */
  kp?: number | null;
  /** Team kills: ours, theirs. */
  score?: [number, number] | null;
  /** Toy tiers owned at the end, 1..4. */
  toys?: number | null;
  /** Allies who are friends. */
  party?: number | null;
  /** The match key (`finalHash:ticks`): the account's own rows and this device's rows carry it (they are merged by it). */
  key?: string;
  /** A row of this device's history shown in the account's list (the account does not list it yet). */
  local?: boolean;
  /** A device row's account save (`saving`, `failed`, ...), when known. */
  save?: { st: string; code?: string; why?: string };
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
  /**
   * Another player's ranked answer said "never ranked this season" (`player.ranked.none`): the card reads Unranked
   * without advice. Self: unused.
   */
  rankedNone?: boolean;
  /** Another player: the server sent their public card (rank, level). Absent on older backends: the rank card hides. */
  hasCard?: boolean;
  /** Good-teammate kudos this month: the chest tiers (thumbs-up counts) and the club's name (`club.get`). */
  kudosTiers?: number[];
  club?: string | null;
  /** Replays kept on this device (yours only), newest first. */
  replays?: ProfileReplay[];
  /** The history page cursor (`history.list` → `next`); null: no more. */
  next?: string | null;
  /** The rows are this device's (no account answer): their ids are device ids. */
  rowsLocal?: boolean;
}

/** A replay kept on this device, as the Matches tab lists it. */
export interface ProfileReplay {
  id: string;
  at: number;
  hero: string;
  outcome: 'won' | 'lost' | 'draw';
  /** The best moment's title ("Triple Pounce"), or null. */
  best: string | null;
  /** Made with another game version: listed with the reason, no Watch (founder, Nov 19: say why before the tap). */
  older?: boolean;
}

/** Each source the screen loads, on its own: a failed one shows "Couldn't load" in its own card, never an empty state. */
export type SourceState = 'idle' | 'loading' | 'ok' | 'failed';
export interface Sources {
  name: SourceState;
  social: SourceState;
  ranked: SourceState;
  hist: SourceState;
  /** `club.get`: the club and this month's kudos (honor). */
  club: SourceState;
}
export const SOURCES_IDLE: Readonly<Sources> = Object.freeze({ name: 'idle', social: 'idle', ranked: 'idle', hist: 'idle', club: 'idle' });

/**
 * The name the banner shows. A guest is "Guest"; a signed-in player never is: their last known name, else a neutral
 * "Your profile" while it loads or when it failed. Pure.
 */
export function shownName(d: Pick<ProfileData, 'self' | 'signedIn' | 'name'>): string {
  const n = (d.name ?? '').trim();
  if (!d.self) return n || 'Player';
  if (!d.signedIn) return n || 'Guest';
  return n && n !== 'Guest' ? n : 'Your profile';
}

/** Another player's public card (`history.list` → `player`), checked, or null. Pure. */
/**
 * The Player Card's relation (PLAYER-CARD.md): `friend`, `sent` (my request is pending), `asked` (theirs is), `self`,
 * `none`. Absent on an older server: the card shows Add friend (and a friend opened from Friends stays a friend).
 */
export type PlayerRel = 'self' | 'friend' | 'sent' | 'asked' | 'none';
const RELS: readonly string[] = ['self', 'friend', 'sent', 'asked', 'none'];

export function parsePlayerCard(raw: unknown): { matches: number; ranked: RankedCard | null; none: boolean; av: unknown; cc: string | null; rel: PlayerRel | null; online: boolean | null } | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const matches = typeof o.matches === 'number' && Number.isFinite(o.matches) && o.matches >= 0 ? Math.min(1e6, Math.floor(o.matches)) : 0;
  const r = o.ranked && typeof o.ranked === 'object' ? (o.ranked as Record<string, unknown>) : null;
  const ranked = r ? parseRankedCard({ ranked: r }) : null;
  const av = o.av && typeof o.av === 'object' && typeof (o.av as { i?: unknown }).i === 'string' ? o.av : null;
  const cc = typeof o.cc === 'string' && /^[A-Z]{2}$/.test(o.cc) ? o.cc : null;
  const rel = typeof o.rel === 'string' && RELS.includes(o.rel) ? (o.rel as PlayerRel) : null;
  const online = typeof o.online === 'boolean' ? o.online : null;
  return { matches, ranked, none: r?.none === true, av, cc, rel, online };
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
    map: typeof o.map === 'string' && /^[a-z0-9_-]{1,24}$/.test(o.map) ? o.map : null,
    seconds: typeof o.seconds === 'number' && Number.isFinite(o.seconds) && o.seconds > 0 ? Math.min(36_000, Math.floor(o.seconds)) : 0,
    mutator: typeof o.mutator === 'string' && /^[a-z0-9_-]{1,16}$/.test(o.mutator) && o.mutator !== 'none' ? o.mutator : null,
    lv: pos(o.lv, 30),
    cs: pos(o.cs, 9_999),
    fish: pos(o.fish, 999_999),
    dmg: pos(o.dmg, 9_999_999),
    dmgTop: pos(o.dmgTop, 9_999_999),
    kp: pos(o.kp, 100),
    score: Array.isArray(o.score) && o.score.length === 2 && o.score.every((x) => typeof x === 'number' && Number.isFinite(x) && x >= 0) && (o.score[0] as number) + (o.score[1] as number) > 0 ? [Math.min(999, Math.floor(o.score[0] as number)), Math.min(999, Math.floor(o.score[1] as number))] : null,
    toys: pos(o.toys, 4),
    party: pos(o.party, 9),
    ...(typeof o.key === 'string' && /^[0-9a-f]{8}:\d{1,6}$/.test(o.key) ? { key: o.key } : {}),
    ...(saveOf(o.save) ? { save: saveOf(o.save)! } : {}),
  };
}

/** A whole number above 0 (capped), else null: a stat that was not stored. Pure. */
const pos = (v: unknown, max: number): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 1 ? Math.min(max, Math.floor(v)) : null);

/** Arcade modes by mutator (the history sheet's names). */
const ARCADE_NAME: Readonly<Record<string, string>> = Object.freeze({
  cannon: 'Cannon Chaos',
  toybox: 'Toy Box',
  rapid: 'Rapid Paws',
  bounty: 'Bounty Hunt',
  onelane: 'One Lane',
  duel: 'Duel',
  boss: 'Boss Weekend',
});

/**
 * The row's queue name: "Ranked 3v3", "PvP 3v3", "Co-op 3v3", "Skirmish 3v3", "Classic 5v5", "Blitz", "Practice", and
 * an Arcade match by its own mode ("Cannon Chaos", "Toy Box"); "Arcade" only when the server did not say which. Pure.
 */
export function modeText(r: Pick<ProfileRow, 'mode' | 'map' | 'mutator'>): string {
  const size = r.map === 'hearthwood' ? '5v5' : '3v3';
  // a device row of a solo Arcade match (mode 'skirmish' with its mutator) by its own mode too
  if ((r.mode === 'skirmish' || r.mode === 'classic') && r.mutator && ARCADE_NAME[r.mutator]) return ARCADE_NAME[r.mutator];
  switch (r.mode) {
    case 'ranked':
      return `Ranked ${size}`;
    case 'pvp':
      return `PvP ${size}`;
    case 'coop':
      return `Co-op ${size}`;
    case 'party':
      return `Party ${size}`;
    case 'classic':
      return 'Classic 5v5';
    case 'blitz':
      return 'Blitz';
    case 'practice':
      return 'Practice';
    case 'arcade':
      return ARCADE_NAME[r.mutator ?? ''] ?? 'Arcade';
    case 'skirmish':
      return `Skirmish ${size}`;
    default:
      return r.mode ? r.mode.charAt(0).toUpperCase() + r.mode.slice(1) : `Skirmish ${size}`;
  }
}

/** "4.5" ((K + A) / D, one decimal), "Perfect" with no deaths, null with no takedowns. Pure. */
export function kdaRatio(r: Pick<ProfileRow, 'k' | 'd' | 'a'>): string | null {
  if (r.k + r.a <= 0) return r.d > 0 ? '0.0' : null;
  if (r.d <= 0) return 'Perfect';
  return ((r.k + r.a) / r.d).toFixed(1);
}

/** "8.2k", "1.1M", "940". Pure. */
export const short = (n: number): string =>
  n >= 999_500 ? `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M` : n >= 10_000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k` : String(Math.max(0, Math.floor(n)));

/** The row's damage bar, 0..1 of the match's most (null: no damage stored). Pure. */
export const dmgShare = (r: Pick<ProfileRow, 'dmg' | 'dmgTop'>): number | null =>
  r.dmg ? Math.max(0.04, Math.min(1, r.dmg / Math.max(r.dmg, r.dmgTop ?? r.dmg))) : null;


const saveOf = (v: unknown): ProfileRow['save'] | null => {
  const x = v as { st?: unknown; code?: unknown; why?: unknown } | null;
  if (!x || typeof x !== 'object' || typeof x.st !== 'string') return null;
  return { st: x.st, ...(typeof x.code === 'string' ? { code: x.code } : {}), ...(typeof x.why === 'string' ? { why: x.why } : {}) };
};

/**
 * Founder, Nov 19 ("the match from 1 min ago is in Recordings but not in Matches"): the account's rows, then this
 * device's rows the account does not list (by match key) that are newer than the page's oldest row (or any, when the
 * page is the whole history), marked `local`. A device row without a key (saved before Nov 17) is left out. Newest
 * first. Practice rows never come here (the app leaves them out). Pure.
 */
export function mergeDeviceRows(server: readonly ProfileRow[], device: readonly ProfileRow[], complete: boolean): ProfileRow[] {
  const keys = new Set(server.map((r) => r.key).filter((k): k is string => !!k));
  const oldest = server.length ? Math.min(...server.map((r) => r.at)) : -Infinity;
  const extra = device.filter((r) => !!r.key && !keys.has(r.key) && (complete || r.at >= oldest)).map((r) => ({ ...r, local: true }));
  return [...server, ...extra].sort((a, b) => b.at - a.at);
}

/** "12:34" (match length). Pure. */
export const duration = (s: number): string => (s > 0 ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '');

/** The maps' short names (ui/mapPick.ts MAP_CARDS). */
const MAP_SHORT: Readonly<Record<string, string>> = Object.freeze({ crossing: 'Crossing', hearthwood: 'Hearthwood', ridge: 'Ridge', thicket: 'Thicket', quarry: 'Quarry', pitch: 'Park' });

/** "Hearthwood" from a map id ("Park" for the pitch). Pure. */
export const mapName = (id: string | null): string => (id ? (MAP_SHORT[id] ?? id.replace(/[_-]+/g, ' ').replace(/\b[a-z]/g, (c) => c.toUpperCase())) : '');

/** The ranked card as the Profile draws it: crest tier, label, a line, the points bar (0..1), division pips, peak. Pure. */
export interface RankShown {
  tier: CrestTier;
  label: string;
  line: string;
  /** Points toward the next division, 0..1; null when there is no bar (unranked, placements, Legend). */
  progress: number | null;
  /** Division 1..3 (III = 1 pip); 0 for none. */
  pips: number;
  peak: string | null;
  /** Placement matches done / of. */
  placements: { done: number; of: number } | null;
}

export function rankView(r: RankedCard | null, self = true, none = false): RankShown {
  if (!r || (none && (r.tierIdx === undefined || r.placementsLeft > 0)))
    return { tier: 'none', label: 'Unranked', line: self ? 'Play Ranked to get a rank.' : 'No ranked games this season.', progress: null, pips: 0, peak: null, placements: null };
  if (r.tierIdx === undefined || r.placementsLeft > 0) {
    const done = Math.max(0, Math.min(r.placementsOf, r.placementsOf - r.placementsLeft));
    return { tier: 'placements', label: 'Placements', line: `${done} of ${r.placementsOf} placement matches played`, progress: r.placementsOf ? done / r.placementsOf : 0, pips: 0, peak: r.peak ?? null, placements: { done, of: r.placementsOf } };
  }
  const pts = Math.max(0, Math.floor(r.points ?? 0));
  if (r.tierIdx >= LEGEND_IDX) return { tier: 'legend', label: 'Legend', line: `${pts} pts`, progress: null, pips: 0, peak: r.peak ?? null, placements: null };
  const t = RANKED_TIERS[Math.max(0, Math.min(3, Math.floor(r.tierIdx / 3)))];
  const div = Math.max(0, r.tierIdx) % 3;
  return {
    tier: t.id as CrestTier,
    label: `${t.name} ${DIVISION_NUMERALS[div]}`,
    line: `${Math.min(100, pts)} / 100 pts`,
    progress: Math.max(0, Math.min(1, pts / 100)),
    pips: div + 1,
    peak: r.peak && r.peak !== rankedLabel(r.tierIdx) ? r.peak : null,
    placements: null,
  };
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

/** The borders this player may wear (owned store, season, ranked, Treat Track, legend and founder borders), 'none' first. Pure. */
export const wearableFrames = (items: readonly string[]): string[] => ['none', ...new Set(items.filter((i) => /^frame\.(store|s\d+|ranked|champ)\.[a-z0-9._-]+$|^frame\.(legend|founder)$/.test(i)))];
/** The titles this player may wear, 'none' first. Pure. */
export const wearableTitles = (items: readonly string[]): string[] => ['none', ...new Set(items.filter((x) => /^title\.[a-z0-9._-]{1,48}$/.test(x)))];

/**
 * Champions as the Champions tab lists them: yours with every champion, the ones you own first (founder, Nov 19:
 * "show purchased champions"), each group by mastery then matches; another player's, the ones they played. Pure.
 */
export function championRows(m: MasteryMap, favs: ProfileStats['favourites'], self: boolean, owned?: (h: HeroId) => boolean): { hero: HeroId; level: number; matches: number; wins: number; toNext: number | null }[] {
  const fav = new Map(favs.map((f) => [f.hero, f]));
  const heroes = self ? HERO_IDS : HERO_IDS.filter((h) => fav.has(h) || m[h]);
  return heroes
    .map((h) => {
      const r = m[h];
      const f = fav.get(h);
      return { hero: h, level: r?.level ?? 0, matches: r?.m ?? f?.matches ?? 0, wins: r?.w ?? f?.wins ?? 0, toNext: r ? masteryToNext(r) : null };
    })
    .sort((a, b) => (owned ? Number(owned(b.hero)) - Number(owned(a.hero)) : 0) || b.level - a.level || b.matches - a.matches || HERO_IDS.indexOf(a.hero) - HERO_IDS.indexOf(b.hero));
}

/** "1,234". */
export const num = (n: number): string => Math.max(0, Math.floor(n)).toLocaleString('en-US');

/** One highlight on the Overview (LoL's highlights strip): a short label and its value. */
export interface Highlight {
  k: 'streak' | 'best' | 'mvp' | 'maxed' | 'kudos' | 'grade';
  value: string;
  label: string;
}

/**
 * The season's highlights from what is known: the longest win streak and the best match in the rows, MVPs, top-mastery
 * champions and this month's kudos. Only the ones earned (no zeros). Pure.
 */
export function highlightsOf(d: Pick<ProfileData, 'rows' | 'stats' | 'mastery' | 'kudos'>): Highlight[] {
  const out: Highlight[] = [];
  const rows = [...d.rows].sort((a, b) => a.at - b.at);
  let run = 0;
  let streak = 0;
  for (const r of rows) {
    run = r.outcome === 'won' ? run + 1 : 0;
    streak = Math.max(streak, run);
  }
  if (streak >= 2) out.push({ k: 'streak', value: String(streak), label: 'Win streak' });
  const best = rows.reduce<ProfileRow | null>((b, r) => (r.k + r.a > (b ? b.k + b.a : -1) ? r : b), null);
  if (best && best.k + best.a > 0) out.push({ k: 'best', value: `${best.k}/${best.d}/${best.a}`, label: 'Best match' });
  const mvp = d.stats?.mvp ?? 0;
  if (mvp > 0) out.push({ k: 'mvp', value: num(mvp), label: mvp === 1 ? 'MVP' : 'MVPs' });
  const maxed = maxedCount(d.mastery);
  if (maxed > 0) out.push({ k: 'maxed', value: String(maxed), label: `At M${MASTERY_MAX}` });
  if (d.kudos && d.kudos > 0) out.push({ k: 'kudos', value: num(d.kudos), label: 'Thumbs-up' });
  return out;
}

/** This month's kudos against the chest tiers: the next tier and how far to it (0..1). Pure. */
export function honorView(n: number, tiers: readonly number[]): { n: number; next: number | null; pct: number; opened: number } {
  const t = [...tiers].filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
  const next = t.find((x) => x > n) ?? null;
  const prev = [...t].reverse().find((x) => x <= n) ?? 0;
  const opened = t.filter((x) => x <= n).length;
  return { n, next, pct: next === null ? 1 : Math.max(0, Math.min(1, (n - prev) / Math.max(1, next - prev))), opened };
}

/** The ranked ladder for the crest strip, low to high. */
export const LADDER: readonly { tier: CrestTier; name: string }[] = Object.freeze([
  { tier: 'kitten', name: 'Kitten' },
  { tier: 'tabby', name: 'Tabby' },
  { tier: 'alley', name: 'Alley' },
  { tier: 'lion', name: 'Lion' },
  { tier: 'legend', name: 'Legend' },
] as { tier: CrestTier; name: string }[]);

/** The `history.list` page cursor, checked. Pure. */
export const nextOf = (b: unknown): string | null => {
  const n = (b as { next?: unknown } | null)?.next;
  return typeof n === 'string' && n.length > 0 && n.length < 200 ? n : null;
};
