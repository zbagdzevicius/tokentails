/**
 * Local profile (POC.md §3 meta/): match counts, first win, last picks and settings. Browser storage in try/catch;
 * a blocked or empty store just means a fresh profile. Never holds anything personal and never reaches the sim.
 */
import { TICK_HZ } from '../data/timeline';
import { PROGRESS_LEVELS, type Progress } from '../embed/bridge';
import type { OfferHistory } from '../money/offer';
import type { Difficulty, HeroId, TrickId } from '../sim/api';
import { HERO_IDS } from '../data/heroes';
import { CHAMPION_IDS } from '../data/heroes/shelter';

export interface Profile {
  v: 1;
  sessions: number;
  matches: number;
  wins: number;
  firstWinDone: boolean;
  /** Fastest win in seconds per difficulty (local display; the server keeps the real one). */
  fastest: Partial<Record<Difficulty, number>>;
  hero: HeroId;
  trick: TrickId;
  difficulty: Difficulty;
  muted: boolean;
  /** Free unlocks earned by playing (cosmetic ids). */
  unlocks: string[];
  lastMatchAt: number;
  /** Chosen look per hero (coat item id or null, chroma element or null); resolved against what is owned. */
  looks: Partial<Record<HeroId, { coat: string | null; chroma: string | null }>>;
  /** Offer card history (money/offer.ts). */
  offers: OfferHistory;
  /** First-match tips off (settings). */
  tipsOff: boolean;
  /** Show the tips again in the next match (settings). */
  tipsNext: boolean;
  /** The player has cast an ultimate (no more "ULTIMATE READY" prompts after its first match). */
  knowsUlt: boolean;
  /** Bot-ladder rating (local display): moves on each win or loss by the bots' level (meta/ladder.ts). */
  rating: number;
  /** Personal bests per hero: fastest win (s) and most takedowns in one match. */
  bests: Partial<Record<HeroId, { fastest: number; takedowns: number }>>;
  /** Squad mates the player chose on the pick screen (roster cat ids, at most 2; empty = the default pick). */
  squad: string[];
  /** The cat adopted last (catalog id): it walks first until the player picks a squad. */
  newCat: string | null;
  /** Show ability numbers (cooldown, damage, range) on the pick screen and in the match tooltips (round 1). */
  numbers: boolean;
  /** "I've played MOBAs before": the difficulty chips unlock now (round 1: veterans sat through 3 guided matches). */
  veteran: boolean;
  /** Ladder matches played (Easy and up): the first meta/ladder.ts PLACEMENT never lose points. */
  ladderGames: number;
  /**
   * Round 2: the page session (`sessions`) of the first finished match, 0 = never. The Meet offer counts sessions from
   * here (`playSession`), so a page load without play is not "session 2".
   */
  firstPlaySession: number;
  /** Round 2: the Meet card the player closed last (catalog id, page session, ms): it stays away for a while. */
  meetClosed: { id: string; session: number; at: number } | null;
  /**
   * Sim v9: finished matches per shelter champion. From the 3rd one (CHAMPION_OFFER_AT) a non-owner's champion card
   * is due: the host puts it first for its offer engine until the card has been shown. Local only, never in the sim.
   */
  championMatches: Partial<Record<HeroId, number>>;
  /** Sim v9: champions whose Meet card has been shown (`offer-seen`): no longer due. */
  championShown: HeroId[];
  /** Card skins (GDD §7.2): cosmetic effects on All heroes, Mine only, or Off (settings). */
  skinFx: SkinFx;
  /** Featured-skin previews seen in one page session (guests 1, signed in 3). */
  previewsSeen: { session: number; n: number };
  /** Bond per roster cat id: finished matches wearing its skin (at most BOND_MAX entries). */
  bond: Record<string, number>;
  /** The newest cat whose skin was put on automatically (once per cat; the chip offers Undo). */
  skinAuto: string | null;
  /** GAPS A6: finished matches per hero (the loading screen's "N matches as <hero>"). */
  heroMatches: Partial<Record<HeroId, number>>;
  /** GAPS A1: the Treat Track title and frame the player chose to wear (ids, checked against the unlocks). */
  wornTitle: string | null;
  wornFrame: string | null;
}

export type SkinFx = 'all' | 'mine' | 'off';
/** Most free unlocks kept (GAPS A1: 30 track rewards, the 32-coat loop and the first-win coat fit with room). */
export const UNLOCKS_MAX = 160;
/** Most bond entries kept (the lowest not in the roster are dropped first). */
export const BOND_MAX = 64;
/** Featured-skin previews a page session allows: a guest, a signed-in player. */
export const PREVIEW_CAP = Object.freeze({ guest: 1, signedIn: 3 });

/** Sim v9: the finished match on a champion from which its card may be offered (GDD §8.4), until it is shown. */
export const CHAMPION_OFFER_AT = 3;

/** The free coat earned by the first win (POC.md §12). */
export const BISCUIT_UNLOCK = 'coat.brutus.biscuit';

const KEY = 'tt.pawlegends.profile.v1';
/** A fresh bot-ladder rating. */
export const LADDER_START = 1000;
const HEROES: readonly HeroId[] = HERO_IDS;
const TRICKS: readonly TrickId[] = ['pounce', 'snack', 'hiss'];

export function freshProfile(): Profile {
  return { v: 1, sessions: 0, matches: 0, wins: 0, firstWinDone: false, fastest: {}, hero: 'clem', trick: 'pounce', difficulty: 'easy', muted: false, unlocks: [], lastMatchAt: 0, looks: {}, offers: {}, tipsOff: false, tipsNext: false, knowsUlt: false, rating: LADDER_START, bests: {}, squad: [], newCat: null, numbers: false, veteran: false, ladderGames: 0, firstPlaySession: 0, meetClosed: null, championMatches: {}, championShown: [], skinFx: 'all', previewsSeen: { session: 0, n: 0 }, bond: {}, skinAuto: null, heroMatches: {}, wornTitle: null, wornFrame: null };
}

/** Parse untrusted stored JSON into a valid profile (unknown fields dropped, bad ones defaulted). */
export function parseProfile(raw: string | null): Profile {
  const p = freshProfile();
  if (!raw) return p;
  try {
    const o = JSON.parse(raw) as Partial<Profile>;
    const n = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
    p.sessions = n(o.sessions);
    p.matches = n(o.matches);
    p.wins = n(o.wins);
    p.firstWinDone = o.firstWinDone === true;
    p.hero = HEROES.includes(o.hero as HeroId) ? (o.hero as HeroId) : 'clem';
    p.trick = TRICKS.includes(o.trick as TrickId) ? (o.trick as TrickId) : 'pounce';
    p.difficulty = o.difficulty === 'normal' || o.difficulty === 'hard' ? o.difficulty : 'easy';
    p.muted = o.muted === true;
    p.unlocks = Array.isArray(o.unlocks)
      ? [...new Set(o.unlocks.filter((u): u is string => typeof u === 'string').map((u) => (u === 'coat:brutus-biscuit' ? BISCUIT_UNLOCK : u)))].slice(0, UNLOCKS_MAX)
      : [];
    p.tipsOff = o.tipsOff === true;
    p.numbers = o.numbers === true;
    p.veteran = o.veteran === true;
    p.ladderGames = n(o.ladderGames);
    p.firstPlaySession = n(o.firstPlaySession);
    // older profiles: a player who already finished a match played in session 1 at the latest
    if (p.firstPlaySession === 0 && p.matches > 0) p.firstPlaySession = 1;
    const mc = o.meetClosed as Record<string, unknown> | null | undefined;
    p.meetClosed =
      mc && typeof mc === 'object' && typeof mc.id === 'string' && /^[A-Za-z0-9_.:-]{1,64}$/.test(mc.id) ? { id: mc.id, session: n(mc.session), at: n(mc.at) } : null;
    if (o.championMatches && typeof o.championMatches === 'object') {
      for (const h of CHAMPION_IDS) {
        const c = n((o.championMatches as Record<string, unknown>)[h]);
        if (c > 0) p.championMatches[h] = Math.min(c, 9999);
      }
    }
    if (o.heroMatches && typeof o.heroMatches === 'object') {
      for (const h of HEROES) {
        const c = n((o.heroMatches as Record<string, unknown>)[h]);
        if (c > 0) p.heroMatches[h] = Math.min(c, 99999);
      }
    }
    // older profiles: the champions' counts were already kept
    for (const h of CHAMPION_IDS) if (!p.heroMatches[h] && p.championMatches[h]) p.heroMatches[h] = p.championMatches[h];
    const wid = (v: unknown): string | null => (typeof v === 'string' && /^(title|frame)\.champ\.[a-z]{1,16}$/.test(v) ? v : null);
    p.wornTitle = wid(o.wornTitle);
    p.wornFrame = wid(o.wornFrame);
    p.championShown = Array.isArray(o.championShown) ? CHAMPION_IDS.filter((h) => (o.championShown as unknown[]).includes(h)) : [];
    p.tipsNext = o.tipsNext === true;
    p.knowsUlt = o.knowsUlt === true;
    p.rating = typeof o.rating === 'number' && Number.isFinite(o.rating) ? Math.max(0, Math.min(9999, Math.round(o.rating))) : LADDER_START;
    p.squad = Array.isArray(o.squad) ? o.squad.filter((x): x is string => typeof x === 'string' && /^[A-Za-z0-9_.:-]{1,64}$/.test(x)).slice(0, 2) : [];
    p.newCat = typeof o.newCat === 'string' && /^[A-Za-z0-9_.:-]{1,64}$/.test(o.newCat) ? o.newCat : null;
    if (o.bests && typeof o.bests === 'object') {
      for (const h of HEROES) {
        const b = (o.bests as Record<string, unknown>)[h] as Record<string, unknown> | undefined;
        if (b && typeof b === 'object') p.bests[h] = { fastest: n(b.fastest), takedowns: n(b.takedowns) };
      }
    }
    p.skinFx = o.skinFx === 'mine' || o.skinFx === 'off' ? o.skinFx : 'all';
    const ps = o.previewsSeen as Record<string, unknown> | undefined;
    p.previewsSeen = ps && typeof ps === 'object' ? { session: n(ps.session), n: Math.min(n(ps.n), 99) } : { session: 0, n: 0 };
    if (o.bond && typeof o.bond === 'object') {
      const entries = Object.entries(o.bond as Record<string, unknown>)
        .filter(([k, v]) => /^[A-Za-z0-9_-]{1,64}$/.test(k) && typeof v === 'number' && Number.isFinite(v) && v > 0)
        .map(([k, v]) => [k, Math.min(9999, Math.floor(v as number))] as const)
        .sort((a, b) => b[1] - a[1])
        .slice(0, BOND_MAX);
      for (const [k, v] of entries) p.bond[k] = v;
    }
    p.skinAuto = typeof o.skinAuto === 'string' && /^[A-Za-z0-9_.:-]{1,64}$/.test(o.skinAuto) ? o.skinAuto : null;
    // a profile from before card skins: its newCat was bought earlier, so it is never auto-equipped as a new arrival
    if (!('skinAuto' in o)) p.skinAuto = p.newCat;
    // card skin ids are `cat.<roster id>` (up to 64 characters after the prefix)
    const id = (v: unknown): string | null => (typeof v === 'string' && /^[A-Za-z0-9_.-]{1,80}$/.test(v) ? v : null);
    if (o.looks && typeof o.looks === 'object') {
      for (const h of HEROES) {
        const l = (o.looks as Record<string, unknown>)[h];
        if (l && typeof l === 'object') p.looks[h] = { coat: id((l as Record<string, unknown>).coat), chroma: id((l as Record<string, unknown>).chroma) };
      }
    }
    if (o.offers && typeof o.offers === 'object') {
      const of = o.offers as Record<string, unknown>;
      if (typeof of.starterFirstShown === 'number' && of.starterFirstShown > 0) p.offers.starterFirstShown = Math.floor(of.starterFirstShown);
      if (typeof of.founderLastShown === 'number' && of.founderLastShown > 0) p.offers.founderLastShown = Math.floor(of.founderLastShown);
    }
    p.lastMatchAt = n(o.lastMatchAt);
    if (o.fastest && typeof o.fastest === 'object') {
      for (const d of ['easy', 'normal', 'hard'] as const) {
        const v = (o.fastest as Record<string, unknown>)[d];
        if (typeof v === 'number' && v > 0) p.fastest[d] = Math.floor(v);
      }
    }
  } catch {
    /* corrupt: fresh */
  }
  return p;
}

let cached: Profile | null = null;

export function loadProfile(): Profile {
  if (cached) return cached;
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    raw = null;
  }
  cached = parseProfile(raw);
  return cached;
}

export function saveProfile(p: Profile): void {
  cached = p;
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage blocked: keep it in memory */
  }
}

/** Count a session once per page load. */
export function startSession(): Profile {
  const p = loadProfile();
  p.sessions++;
  saveProfile(p);
  return p;
}

/**
 * Round 2: the Meet offer's session number: 1 for the page session of the first finished match, 2 for the next page
 * session and so on; 0 before any finished match (a page load without play never counts).
 */
export function playSession(p: Pick<Profile, 'sessions' | 'firstPlaySession' | 'matches'>): number {
  const first = p.firstPlaySession > 0 ? p.firstPlaySession : p.matches > 0 ? 1 : 0;
  return first > 0 ? Math.max(1, p.sessions - first + 1) : 0;
}

/** Record a finished match. Returns what changed for the results screen. */
export function recordMatch(won: boolean, seconds: number, difficulty: Difficulty): { firstWin: boolean; best: boolean; second: boolean } {
  const p = loadProfile();
  const second = p.matches >= 1 && Date.now() - p.lastMatchAt < 24 * 3600 * 1000;
  p.matches++;
  if (p.firstPlaySession === 0) p.firstPlaySession = Math.max(1, p.sessions);
  p.lastMatchAt = Date.now();
  let firstWin = false;
  let best = false;
  if (won) {
    p.wins++;
    if (!p.firstWinDone) {
      p.firstWinDone = true;
      firstWin = true;
      if (!p.unlocks.includes(BISCUIT_UNLOCK)) p.unlocks.push(BISCUIT_UNLOCK);
    }
    const prev = p.fastest[difficulty];
    if (!prev || seconds < prev) {
      p.fastest[difficulty] = seconds;
      // "best!" only when this win beat a stored time for the same bots (fun plan F4), not on the first one
      best = prev !== undefined && prev > 0;
    }
  }
  saveProfile(p);
  return { firstWin, best, second };
}

/** GAPS A6: count a finished match on `hero` (any hero); returns the new count. */
export function noteHeroMatch(hero: HeroId): number {
  if (!HEROES.includes(hero)) return 0;
  const p = loadProfile();
  const c = Math.min((p.heroMatches[hero] ?? 0) + 1, 99999);
  p.heroMatches[hero] = c;
  saveProfile(p);
  return c;
}

/** Sim v9: count a finished match on `hero` when it is a shelter champion; returns the new count (0 otherwise). */
export function noteChampionMatch(hero: HeroId): number {
  if (!(CHAMPION_IDS as readonly HeroId[]).includes(hero)) return 0;
  const p = loadProfile();
  const c = Math.min((p.championMatches[hero] ?? 0) + 1, 9999);
  p.championMatches[hero] = c;
  saveProfile(p);
  return c;
}

/** Sim v9: has the player finished enough matches on champion `hero` for its card to be offered? */
export function championEarned(p: Profile, hero: HeroId): boolean {
  return (p.championMatches[hero] ?? 0) >= CHAMPION_OFFER_AT;
}

/** Sim v9: is champion `hero`'s card due (earned and never shown)? The caller still checks ownership and sale. */
export function championDue(p: Profile, hero: HeroId): boolean {
  return championEarned(p, hero) && !p.championShown.includes(hero);
}

/** Sim v9: champion `hero`'s Meet card was shown; it is no longer due. */
export function noteChampionShown(hero: HeroId): void {
  const p = loadProfile();
  if (p.championShown.includes(hero)) return;
  p.championShown.push(hero);
  saveProfile(p);
}

/**
 * Card skins: one more finished match wearing cat `catId`'s skin. Keeps at most BOND_MAX entries, dropping the lowest
 * ones whose cat is not in `roster` first. Returns the new count.
 */
export function noteBond(catId: string, roster: readonly string[] = []): number {
  const p = loadProfile();
  const c = Math.min((p.bond[catId] ?? 0) + 1, 9999);
  p.bond[catId] = c;
  p.bond = capBond(p.bond, roster);
  saveProfile(p);
  return p.bond[catId] ?? c;
}

/** Pure: at most BOND_MAX entries; drops the lowest cats missing from `roster` first, then the lowest. */
export function capBond(bond: Record<string, number>, roster: readonly string[]): Record<string, number> {
  const keys = Object.keys(bond);
  if (keys.length <= BOND_MAX) return bond;
  const inRoster = new Set(roster);
  const order = keys.sort((a, b) => Number(inRoster.has(a)) - Number(inRoster.has(b)) || bond[a] - bond[b]);
  const out = { ...bond };
  for (const k of order.slice(0, keys.length - BOND_MAX)) delete out[k];
  return out;
}

/** May the player preview one more featured skin this page session? */
export function previewAllowed(p: Pick<Profile, 'sessions' | 'previewsSeen'>, signedIn: boolean): boolean {
  const seen = p.previewsSeen.session === p.sessions ? p.previewsSeen.n : 0;
  return seen < (signedIn ? PREVIEW_CAP.signedIn : PREVIEW_CAP.guest);
}

export function notePreview(): void {
  const p = loadProfile();
  const seen = p.previewsSeen.session === p.sessions ? p.previewsSeen.n : 0;
  p.previewsSeen = { session: p.sessions, n: seen + 1 };
  saveProfile(p);
}

/** Do the tips run in the next match? */
export function tipsDue(p: Profile): boolean {
  return !p.tipsOff && (p.matches === 0 || p.tipsNext);
}

/**
 * Account progress from the host (`session.progress`) folded into the local profile, so unlocks and records follow
 * the account across devices. Per level, the better value wins: first win (any catnip paid or any verified win),
 * fastest win (the lower time), and the match count (the higher total). Never lowers anything local. Pure: returns
 * a new profile.
 */
export function mergeServerProgress(local: Profile, progress: Progress | null): Profile {
  if (!progress) return local;
  const p: Profile = { ...local, fastest: { ...local.fastest }, unlocks: [...local.unlocks] };
  let serverMatches = 0;
  let serverWins = 0;
  for (const l of PROGRESS_LEVELS) {
    serverMatches += progress.matches[l];
    const ticks = progress.fastestWin[l];
    if (ticks > 0 || progress.catnip[l] > 0) serverWins++;
    if (ticks > 0) {
      const s = Math.max(1, Math.ceil(ticks / TICK_HZ));
      const prev = p.fastest[l];
      if (!prev || s < prev) p.fastest[l] = s;
    }
  }
  p.matches = Math.max(p.matches, serverMatches);
  p.wins = Math.max(p.wins, serverWins);
  if (serverWins > 0 && !p.firstWinDone) p.firstWinDone = true;
  if (p.firstWinDone && !p.unlocks.includes(BISCUIT_UNLOCK)) p.unlocks.push(BISCUIT_UNLOCK);
  return p;
}

/** Whether the merge changed anything the player can see (so callers redraw only then). */
export function progressChanged(a: Profile, b: Profile): boolean {
  return a.matches !== b.matches || a.wins !== b.wins || a.firstWinDone !== b.firstWinDone || a.unlocks.length !== b.unlocks.length || JSON.stringify(a.fastest) !== JSON.stringify(b.fastest);
}

/** Signed-in state and the account progress, as the host last said (UI only; never stored). */
export interface AccountState {
  signedIn: boolean;
  progress: Progress | null;
}

let account: AccountState = { signedIn: false, progress: null };
export const accountState = (): AccountState => account;
export function setAccountState(a: AccountState): void {
  account = { signedIn: a.signedIn, progress: a.signedIn ? a.progress : null };
}

/** Tests only. */
export function resetProfileCache(): void {
  cached = null;
  account = { signedIn: false, progress: null };
}
