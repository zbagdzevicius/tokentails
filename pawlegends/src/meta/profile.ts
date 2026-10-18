/**
 * Local profile (POC.md §3 meta/): match counts, first win, last picks and settings. Browser storage in try/catch;
 * a blocked or empty store just means a fresh profile. Never holds anything personal and never reaches the sim.
 */
import { TICK_HZ } from '../data/timeline';
import { PROGRESS_LEVELS, type Progress } from '../embed/bridge';
import type { OfferHistory } from '../money/offer';
import type { Difficulty, HeroId, TrickId } from '../sim/api';

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
}

/** The free coat earned by the first win (POC.md §12). */
export const BISCUIT_UNLOCK = 'coat.brutus.biscuit';

const KEY = 'tt.pawlegends.profile.v1';
/** A fresh bot-ladder rating. */
export const LADDER_START = 1000;
const HEROES: readonly HeroId[] = ['clem', 'sage', 'brutus', 'cacklejaw'];
const TRICKS: readonly TrickId[] = ['pounce', 'snack', 'hiss'];

export function freshProfile(): Profile {
  return { v: 1, sessions: 0, matches: 0, wins: 0, firstWinDone: false, fastest: {}, hero: 'clem', trick: 'pounce', difficulty: 'easy', muted: false, unlocks: [], lastMatchAt: 0, looks: {}, offers: {}, tipsOff: false, tipsNext: false, knowsUlt: false, rating: LADDER_START, bests: {}, squad: [], newCat: null, numbers: false, veteran: false, ladderGames: 0, firstPlaySession: 0, meetClosed: null };
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
      ? [...new Set(o.unlocks.filter((u): u is string => typeof u === 'string').map((u) => (u === 'coat:brutus-biscuit' ? BISCUIT_UNLOCK : u)))].slice(0, 64)
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
    const id = (v: unknown): string | null => (typeof v === 'string' && /^[A-Za-z0-9_.-]{1,48}$/.test(v) ? v : null);
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
