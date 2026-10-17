/**
 * Local profile (POC.md §3 meta/): match counts, first win, last picks and settings. Browser storage in try/catch;
 * a blocked or empty store just means a fresh profile. Never holds anything personal and never reaches the sim.
 */
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
}

/** The free coat earned by the first win (POC.md §12). */
export const BISCUIT_UNLOCK = 'coat.brutus.biscuit';

const KEY = 'tt.pawlegends.profile.v1';
const HEROES: readonly HeroId[] = ['clem', 'sage', 'brutus', 'cacklejaw'];
const TRICKS: readonly TrickId[] = ['pounce', 'snack', 'hiss'];

export function freshProfile(): Profile {
  return { v: 1, sessions: 0, matches: 0, wins: 0, firstWinDone: false, fastest: {}, hero: 'clem', trick: 'pounce', difficulty: 'easy', muted: false, unlocks: [], lastMatchAt: 0, looks: {}, offers: {}, tipsOff: false, tipsNext: false };
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
    p.difficulty = o.difficulty === 'normal' ? 'normal' : 'easy';
    p.muted = o.muted === true;
    p.unlocks = Array.isArray(o.unlocks)
      ? [...new Set(o.unlocks.filter((u): u is string => typeof u === 'string').map((u) => (u === 'coat:brutus-biscuit' ? BISCUIT_UNLOCK : u)))].slice(0, 64)
      : [];
    p.tipsOff = o.tipsOff === true;
    p.tipsNext = o.tipsNext === true;
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
      for (const d of ['easy', 'normal'] as const) {
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

/** Record a finished match. Returns what changed for the results screen. */
export function recordMatch(won: boolean, seconds: number, difficulty: Difficulty): { firstWin: boolean; best: boolean; second: boolean } {
  const p = loadProfile();
  const second = p.matches >= 1 && Date.now() - p.lastMatchAt < 24 * 3600 * 1000;
  p.matches++;
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
      best = true;
    }
  }
  saveProfile(p);
  return { firstWin, best, second };
}

/** Do the tips run in the next match? */
export function tipsDue(p: Profile): boolean {
  return !p.tipsOff && (p.matches === 0 || p.tipsNext);
}

/** Tests only. */
export function resetProfileCache(): void {
  cached = null;
}
