/**
 * Daily challenges (separate from the Daily Cup): three a UTC day, picked from a seeded pool so every player gets the
 * same three on the same day, 30–60 fish each, plus a bonus for doing all three. A day with at least one challenge
 * done keeps the streak going (Daily Devotee at 7). Pure: the install file supplies the day number and the race.
 *
 * Ids carry their numbers ("pink:4", "win-at:kitchen"), so a saved day reads back the same even if the pool changes.
 */
import type { RaceMode, RaceStats } from '../types';
import type { DailyState } from './state';
import { DAILY_SWEEP_FISH } from '../content/cosmetics';

/** What the pool may use on this build (a challenge never asks for something the game cannot do yet). */
export interface ChallengeEnv {
  /** circuits in the race rotation (win-at picks one) */
  tracks: readonly string[];
  hasCoins: boolean;
  hasBranches: boolean;
  hasBattle: boolean;
  hasTimeTrial: boolean;
  /** F12: circuits in the rotation with a loop (a loop goal names one of them; Yarn Canyon has none) */
  loopTracks?: readonly string[];
  /** F12: some circuit has a jump gap (clean landings) / any set piece (stunt combos) */
  hasJumps?: boolean;
  hasPieces?: boolean;
  /** F12: circuits whose alternative route has a name ("crumb cut"): the shortcut goal names one */
  cutTracks?: readonly string[];
}

/** One race as the challenges see it. */
export interface ChallengeRace {
  mode: RaceMode;
  trackId: string;
  place: number;
  finished: boolean;
  stats: RaceStats;
  /** fish the race itself paid (not challenge or achievement fish) */
  fish: number;
}

export type ChallengeEvent = { kind: 'race'; race: ChallengeRace } | { kind: 'medal'; medal: number };

interface Family {
  key: string;
  /** `t()` key with {n} / {track} */
  text: string;
  values: readonly number[];
  fish: readonly number[];
  needs?: (e: ChallengeEnv) => boolean;
  /** the goal names one of these tracks (its id ends in `:<track>`) */
  at?: (e: ChallengeEnv) => readonly string[];
  /** kept so saved days read back, never dealt again */
  retired?: boolean;
  /** {n} is a size, not a count: one race that reaches it completes the goal ("Hit a STUNT COMBO ×3") */
  once?: boolean;
  /** progress this event adds toward the challenge with number n (`track`: the named track, if any) */
  gain(ev: ChallengeEvent, n: number, arg: string, track: string): number;
}

const racing = (r: ChallengeRace) => r.mode !== 'tt' && r.mode !== 'battle';
const raceGain = (fn: (r: ChallengeRace) => number) => (ev: ChallengeEvent) => (ev.kind === 'race' ? fn(ev.race) : 0);
/** Progress on the goal's named track only. */
const trackGain = (fn: (r: ChallengeRace) => number) => (ev: ChallengeEvent, _n: number, _arg: string, track: string) => (ev.kind === 'race' && ev.race.trackId === track ? fn(ev.race) : 0);

const FAMILIES: readonly Family[] = [
  { key: 'races', text: 'Finish {n} races', values: [3, 5], fish: [30, 45], gain: raceGain((r) => (r.finished && r.mode !== 'battle' ? 1 : 0)) },
  { key: 'podium', text: 'Finish on the podium {n} times', values: [2, 3], fish: [40, 55], gain: raceGain((r) => (racing(r) && r.finished && r.place <= 3 ? 1 : 0)) },
  { key: 'win', text: 'Win {n} races', values: [1, 2], fish: [35, 60], gain: raceGain((r) => (racing(r) && r.finished && r.place === 1 ? 1 : 0)) },
  {
    key: 'win-at',
    text: 'Win at {track}',
    values: [1],
    fish: [50],
    needs: (e) => e.tracks.length > 0,
    gain: (ev, _n, arg) => (ev.kind === 'race' && racing(ev.race) && ev.race.finished && ev.race.place === 1 && ev.race.trackId === arg ? 1 : 0),
  },
  { key: 'pink', text: 'Fire {n} pink mini-turbos', values: [2, 4], fish: [40, 60], gain: raceGain((r) => r.stats.miniTurbos[2]) },
  { key: 'turbos', text: 'Fire {n} mini-turbos', values: [8, 15], fish: [30, 45], gain: raceGain((r) => r.stats.miniTurbos[0] + r.stats.miniTurbos[1] + r.stats.miniTurbos[2]) },
  { key: 'tricks', text: 'Land {n} tricks off ramps', values: [4, 8], fish: [35, 50], gain: raceGain((r) => r.stats.tricks) },
  { key: 'hits', text: 'Hit rivals with items {n} times', values: [4, 8], fish: [30, 50], gain: raceGain((r) => r.stats.hitsDealt) },
  { key: 'overtakes', text: 'Overtake {n} cats', values: [10, 20], fish: [30, 45], gain: raceGain((r) => r.stats.overtakes) },
  { key: 'pounce', text: 'Get {n} Pounce Starts', values: [2, 3], fish: [30, 40], gain: raceGain((r) => (r.stats.pounce ? 1 : 0)) },
  { key: 'fish', text: 'Earn {n} fish in races', values: [40, 80], fish: [30, 50], gain: raceGain((r) => r.fish) },
  { key: 'clean', text: 'Finish a race without touching a wall', values: [1], fish: [45], gain: raceGain((r) => (racing(r) && r.finished && r.stats.wallHits === 0 && r.stats.respawns === 0 ? 1 : 0)) },
  { key: 'nohit', text: 'Finish a race without being hit', values: [1], fish: [45], gain: raceGain((r) => (racing(r) && r.finished && r.stats.hitsTaken === 0 ? 1 : 0)) },
  { key: 'slip', text: 'Catch {n} slipstreams', values: [3, 6], fish: [35, 50], gain: raceGain((r) => r.stats.slipstreams) },
  { key: 'coins', text: 'Pick up {n} fish coins', values: [15, 30], fish: [35, 50], needs: (e) => e.hasCoins, gain: raceGain((r) => r.stats.coinsPicked) },
  // F12: retired for the named one below ("Take {n} shortcuts" stayed 0/2 for 10+ races in the playtest)
  { key: 'shortcut', text: 'Take {n} shortcuts', values: [2, 4], fish: [40, 55], retired: true, gain: raceGain((r) => r.stats.shortcuts) },
  { key: 'cut', text: 'Take the {cut} on {track} twice', values: [2], fish: [45], needs: (e) => !!e.cutTracks?.length, at: (e) => e.cutTracks ?? [], gain: trackGain((r) => r.stats.shortcuts) },
  // F12 stunt goals: a loop goal names a track with a loop; clean landings and combos count on any track
  { key: 'loops', text: 'Ride {n} loops on {track}', values: [3, 6], fish: [35, 50], needs: (e) => !!e.loopTracks?.length, at: (e) => e.loopTracks ?? [], gain: trackGain((r) => r.stats.loops) },
  { key: 'landings', text: 'Land {n} clean jumps', values: [2, 5], fish: [30, 45], needs: (e) => !!e.hasJumps, gain: raceGain((r) => r.stats.cleanLandings) },
  { key: 'combo', text: 'Hit a STUNT COMBO ×{n}', values: [3], fish: [55], once: true, needs: (e) => !!e.hasPieces, gain: (ev, n) => (ev.kind === 'race' && ev.race.stats.bestCombo >= n ? 1 : 0) },
  { key: 'battle', text: 'Win a balloon battle', values: [1], fish: [50], needs: (e) => e.hasBattle, gain: raceGain((r) => (r.mode === 'battle' && r.place === 1 ? 1 : 0)) },
  { key: 'medal', text: 'Earn a time trial medal', values: [1], fish: [50], needs: (e) => e.hasTimeTrial, gain: (ev) => (ev.kind === 'medal' && ev.medal >= 1 && ev.medal <= 3 ? 1 : 0) },
  { key: 'daily-cup', text: 'Race the Daily Cup', values: [1], fish: [40], gain: raceGain((r) => (r.mode === 'daily' && r.finished ? 1 : 0)) },
];

export interface Challenge {
  id: string;
  family: string;
  text: string;
  vars: Record<string, string | number>;
  target: number;
  fish: number;
}

/**
 * Parse a stored id ("pink:4", "win-at:kitchen", "loops:3:kitchen", "cut:2:rooftops"). Null for an id this build
 * does not know. `trackName` / `cutName` turn a track id into its name and its alternative route's name.
 */
export function challengeById(id: string, trackName: (t: string) => string = (t) => t, cutName: (t: string) => string = (t) => t): Challenge | null {
  const parts = id.split(':');
  const key = parts[0];
  const f = FAMILIES.find((x) => x.key === key);
  if (!f) return null;
  if (key === 'win-at') return { id, family: key, text: f.text, vars: { track: trackName(parts.slice(1).join(':')) }, target: 1, fish: f.fish[0] };
  const n = Number(parts[1]);
  const vi = f.values.indexOf(n);
  if (vi < 0) return null;
  if (f.at) {
    const track = parts[2];
    if (!track) return null;
    const vars: Record<string, string | number> = { n, track: trackName(track) };
    if (key === 'cut') vars.cut = cutName(track);
    return { id, family: key, text: f.text, vars, target: f.once ? 1 : n, fish: f.fish[vi] };
  }
  if (parts.length > 2) return null;
  return { id, family: key, text: f.text, vars: { n }, target: f.once ? 1 : n, fish: f.fish[vi] };
}

/** mulberry32 */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The three challenge ids of a UTC day (same for everyone on the same build). */
export function challengesFor(day: number, env: ChallengeEnv): string[] {
  const r = rng(0x9e3779b9 ^ Math.imul(day, 2654435761));
  const pool = FAMILIES.filter((f) => !f.retired && (!f.needs || f.needs(env)));
  // Fisher-Yates on the eligible families, then the first three
  const order = pool.slice();
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order.slice(0, 3).map((f) => {
    if (f.key === 'win-at') return `win-at:${env.tracks[Math.floor(r() * env.tracks.length)]}`;
    const n = f.values[Math.floor(r() * f.values.length)];
    if (!f.at) return `${f.key}:${n}`;
    const at = f.at(env);
    return `${f.key}:${n}:${at[Math.floor(r() * at.length)]}`;
  });
}

/** Roll the daily state over to `today` (new challenges, progress reset; the streak is kept). */
export function ensureDay(d: DailyState, today: number, env: ChallengeEnv): DailyState {
  if (d.day === today && d.ids.length === 3) return d;
  const ids = challengesFor(today, env);
  return { ...d, day: today, ids, progress: [0, 0, 0], done: [false, false, false], swept: false };
}

/** The streak as it stands today (a missed day breaks it). */
export function currentStreak(d: DailyState, today: number): number {
  return d.lastDone >= today - 1 ? d.streak : 0;
}

export interface ChallengeUpdate {
  daily: DailyState;
  /** indices newly completed by this event */
  completed: number[];
  /** fish paid: each completed challenge, plus the sweep bonus */
  fish: Array<{ key: string; vars?: Record<string, string | number>; amount: number }>;
}

/** Apply one event to today's challenges (pure). */
export function progressChallenges(d: DailyState, ev: ChallengeEvent, today: number): ChallengeUpdate {
  const out: DailyState = { ...d, progress: d.progress.slice(), done: d.done.slice() };
  const completed: number[] = [];
  const fish: ChallengeUpdate['fish'] = [];
  d.ids.forEach((id, i) => {
    if (out.done[i]) return;
    const c = challengeById(id);
    const f = c && FAMILIES.find((x) => x.key === c.family);
    if (!c || !f) return;
    const arg = id.slice(id.indexOf(':') + 1);
    const g = f.gain(ev, Number(c.vars.n ?? c.target), arg, f.at ? (id.split(':')[2] ?? '') : '');
    if (g <= 0) return;
    out.progress[i] = Math.min(c.target, (out.progress[i] ?? 0) + g);
    if (out.progress[i] >= c.target) {
      out.done[i] = true;
      completed.push(i);
      fish.push({ key: 'Daily challenge', amount: c.fish });
    }
  });
  if (completed.length) {
    if (out.lastDone !== today) {
      out.streak = out.lastDone === today - 1 ? out.streak + 1 : 1;
      out.lastDone = today;
    }
    out.bestStreak = Math.max(out.bestStreak, out.streak);
    if (!out.swept && out.done.length === 3 && out.done.every(Boolean)) {
      out.swept = true;
      fish.push({ key: 'All three dailies', amount: DAILY_SWEEP_FISH });
    }
  }
  return { daily: out, completed, fish };
}

/** Every family (tests). */
export function familyKeys(): string[] {
  return FAMILIES.filter((f) => !f.retired).map((f) => f.key);
}
