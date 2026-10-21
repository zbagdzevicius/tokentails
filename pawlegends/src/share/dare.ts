/**
 * Dare links (POC.md §3, §12): "Beat my 7:12 vs Easy bots". The link carries the seed, the picks and the difficulty,
 * so the friend plays the exact same match setup (bot picks come from the seed). Everything in the URL is
 * untrusted input and validated here; the time is display only.
 */
import type { Difficulty, HeroId, TrickId } from '../sim/api';
import { HERO_IDS } from '../data/heroes';

export interface Dare {
  seed: number;
  hero: HeroId;
  trick: TrickId;
  difficulty: Difficulty;
  /** Winner's time in seconds (display only). */
  seconds: number;
}

/** The dare link carries the HERO_IDS index (append only: the sim v9 champions are 4..7). */
const HEROES: readonly HeroId[] = HERO_IDS;
const TRICKS: readonly TrickId[] = ['pounce', 'snack', 'hiss', 'purrify'];

export function encodeDare(d: Dare): string {
  return [(d.seed >>> 0).toString(36), HEROES.indexOf(d.hero), TRICKS.indexOf(d.trick), d.difficulty === 'hard' ? 2 : d.difficulty === 'normal' ? 1 : 0, Math.max(0, Math.min(3600, Math.floor(d.seconds))).toString(36)].join('.');
}

export function decodeDare(s: string | null | undefined): Dare | null {
  if (!s || s.length > 40) return null;
  const parts = s.split('.');
  if (parts.length !== 5 || !/^[0-9a-z]{1,7}$/.test(parts[0]) || !/^[0-9a-z]{1,3}$/.test(parts[4])) return null;
  const seed = parseInt(parts[0], 36);
  const hero = HEROES[Number(parts[1])];
  const trick = TRICKS[Number(parts[2])];
  const diff = parts[3] === '2' ? 'hard' : parts[3] === '1' ? 'normal' : parts[3] === '0' ? 'easy' : null;
  const seconds = parseInt(parts[4], 36);
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff || !hero || !trick || !diff || !Number.isFinite(seconds)) return null;
  return { seed, hero, trick, difficulty: diff, seconds };
}

/** The dare in the current page URL (`?dare=`), or null. */
export function dareFromUrl(search: string = typeof location !== 'undefined' ? location.search : ''): Dare | null {
  try {
    return decodeDare(new URLSearchParams(search).get('dare'));
  } catch {
    return null;
  }
}

/** A shareable link. Inside the Token Tails host the link points at the host page, else at this page. */
export function dareUrl(d: Dare, base: string): string {
  const u = new URL(base);
  u.search = '';
  u.hash = '';
  u.searchParams.set('dare', encodeDare(d));
  return u.toString();
}

/**
 * "Beat my 7:12 vs Easy bots" when the match ended on a core kill before Sudden Death; a win that came after 10:00
 * was mostly set by the Sudden Death clock, so that dare (seconds 0) is just to win the same match.
 */
export function dareText(d: Dare): string {
  // Round 2: a Rookie (assisted) win says Rookie, not Easy.
  const bots = d.difficulty === 'hard' ? 'Hard' : d.difficulty === 'normal' ? 'Normal' : d.difficulty === 'rookie' ? 'Rookie' : 'Easy';
  if (d.seconds <= 0 || d.seconds >= 600) return `Win my match vs ${bots} bots in Pawlegends!`;
  const m = Math.floor(d.seconds / 60);
  const s = String(d.seconds % 60).padStart(2, '0');
  return `Beat my ${m}:${s} vs ${bots} bots in Pawlegends!`;
}
