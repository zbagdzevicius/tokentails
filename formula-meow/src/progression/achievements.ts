/**
 * The 24 achievements (ids frozen in content/ids.ts). Each is a pure test over the race just run (its `RaceStats`
 * and a few facts read from the event log) and the progression save after that race was recorded, so every rule is
 * unit tested (achievements.test.ts). Earned once, kept forever, each pays ACHIEVEMENT_FISH.
 */
import { ACHIEVEMENT_IDS, TRACK_IDS, type AchievementId } from '../content/ids';
import type { RaceMode, RaceStats } from '../types';
import type { ProgSave } from './state';

/** The race an achievement looks at (absent for cup and medal checks). */
export interface RaceCheck {
  mode: RaceMode;
  trackId: string;
  place: number;
  finished: boolean;
  karts: number;
  stats: RaceStats;
  /** most coins held at once during the race */
  maxCoinsHeld: number;
  /** the player hit their rival with an item at least once */
  hitRival: boolean;
  /** the track was a Track Doodle (not an authored track) */
  ugc: boolean;
}

export interface CheckCtx {
  s: ProgSave;
  race?: RaceCheck;
  /** circuits that have an alternative route (Shortcut Scout needs every one of them) */
  branchTracks: readonly string[];
  /** circuits that count for Medal Hunter (every authored circuit) */
  circuits: readonly string[];
}

export interface AchievementDef {
  id: AchievementId;
  icon: string;
  /** `t()` keys */
  name: string;
  desc: string;
  test(c: CheckCtx): boolean;
  /** optional progress for the page: [have, need] */
  progress?(c: CheckCtx): [number, number];
}

/** Races that put you in a real field of rivals (not time trial, not battle). */
const racing = (r: RaceCheck | undefined): r is RaceCheck => !!r && r.mode !== 'tt' && r.mode !== 'battle';
const won = (r: RaceCheck | undefined): r is RaceCheck => racing(r) && r.finished && r.place === 1;
const trophy = (s: ProgSave, cup: string) => Object.entries(s.trophies).some(([k, p]) => k.startsWith(`${cup}:`) && p === 1);

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  { id: 'first-pounce', icon: '🐾', name: 'First Pounce', desc: 'Get a Pounce Start: press gas on MEOW!', test: ({ race }) => !!race?.stats.pounce },
  { id: 'pink-turbo', icon: '💗', name: 'Pink Turbo', desc: 'Hold a drift long enough for a pink mini-turbo', test: ({ race }) => (race?.stats.miniTurbos[2] ?? 0) > 0 },
  { id: 'untouchable', icon: '🛡️', name: 'Untouchable', desc: 'Finish a race without being hit', test: ({ race }) => racing(race) && race.finished && race.stats.hitsTaken === 0 },
  { id: 'comeback', icon: '🚀', name: 'Comeback Cat', desc: 'Win a race after falling to last place', test: ({ race }) => won(race) && race.karts > 1 && race.stats.worstPlace >= race.karts },
  { id: 'revenge', icon: '😼', name: 'Revenge', desc: 'Hit your rival with an item', test: ({ race }) => !!race?.hitRival },
  { id: 'collector', icon: '🐟', name: 'Collector', desc: 'Hold 10 fish coins at once', test: ({ race }) => (race?.maxCoinsHeld ?? 0) >= 10 },
  { id: 'ghostbuster', icon: '👻', name: 'Ghostbuster', desc: "Beat a friend's dare ghost", test: ({ s }) => s.ghostWins > 0 },
  {
    id: 'shortcut-scout',
    icon: '🗺️',
    name: 'Shortcut Scout',
    desc: 'Take the alternative route on every circuit that has one',
    test: ({ s, branchTracks }) => branchTracks.length > 0 && branchTracks.every((t) => s.shortcutTracks.includes(t)),
    progress: ({ s, branchTracks }) => [branchTracks.filter((t) => s.shortcutTracks.includes(t)).length, branchTracks.length],
  },
  { id: 'gold-kibble', icon: '🥇', name: 'Gold Kibble', desc: 'Win the Kibble Cup', test: ({ s }) => trophy(s, 'kibble') },
  { id: 'gold-catnip', icon: '🌿', name: 'Gold Catnip', desc: 'Win the Catnip Cup', test: ({ s }) => trophy(s, 'catnip') },
  {
    id: 'medal-hunter',
    icon: '⏱️',
    name: 'Medal Hunter',
    desc: 'Take a time trial gold on every circuit',
    test: ({ s, circuits }) => circuits.length > 0 && circuits.every((t) => Object.entries(s.medals).some(([k, m]) => k.startsWith(`${t}:`) && m === 1)),
    progress: ({ s, circuits }) => [circuits.filter((t) => Object.entries(s.medals).some(([k, m]) => k.startsWith(`${t}:`) && m === 1)).length, circuits.length],
  },
  { id: 'last-cat-standing', icon: '🎈', name: 'Battle Champ', desc: 'Win a balloon battle on points', test: ({ race, s }) => (race?.mode === 'battle' && race.place === 1) || s.stats.battleWins > 0 },
  { id: 'pacifist', icon: '🕊️', name: 'Pacifist', desc: 'Win a race without using an item', test: ({ race }) => won(race) && race.stats.itemsUsed === 0 },
  { id: 'air-cat', icon: '🤸', name: 'Air Cat', desc: 'Land 5 tricks in one race', test: ({ race }) => (race?.stats.tricks ?? 0) >= 5 },
  { id: 'slipstreamer', icon: '💨', name: 'Slipstreamer', desc: 'Catch 4 slipstreams in one race', test: ({ race }) => (race?.stats.slipstreams ?? 0) >= 4 },
  {
    id: 'daily-devotee',
    icon: '📅',
    name: 'Daily Devotee',
    desc: 'Finish a daily challenge 7 days in a row',
    test: ({ s }) => s.daily.bestStreak >= 7,
    progress: ({ s }) => [Math.min(7, Math.max(s.daily.streak, s.daily.bestStreak)), 7],
  },
  { id: 'first-win', icon: '🏁', name: 'First Win', desc: 'Win a race', test: ({ race, s }) => won(race) || s.stats.wins > 0 },
  { id: 'podium-ten', icon: '🏆', name: 'Podium Regular', desc: 'Finish on the podium 10 times', test: ({ s }) => s.stats.podiums >= 10, progress: ({ s }) => [Math.min(10, s.stats.podiums), 10] },
  {
    id: 'drift-master',
    icon: '🌀',
    name: 'Drift Master',
    desc: 'Fire 12 mini-turbos in one race',
    test: ({ race }) => !!race && race.stats.miniTurbos[0] + race.stats.miniTurbos[1] + race.stats.miniTurbos[2] >= 12,
  },
  { id: 'sharpshooter', icon: '🎯', name: 'Sharpshooter', desc: 'Hit rivals 5 times in one race', test: ({ race }) => (race?.stats.hitsDealt ?? 0) >= 5 },
  { id: 'big-air', icon: '🛫', name: 'Big Air', desc: 'Land 50 tricks in total', test: ({ s }) => s.stats.tricks >= 50, progress: ({ s }) => [Math.min(50, s.stats.tricks), 50] },
  { id: 'clean-lap', icon: '🧼', name: 'Clean Racer', desc: 'Finish a race without touching a wall', test: ({ race }) => racing(race) && race.finished && race.stats.wallHits === 0 && race.stats.respawns === 0 },
  {
    id: 'globetrotter',
    icon: '🌍',
    name: 'Globetrotter',
    desc: 'Race on all 6 circuits',
    test: ({ s }) => TRACK_IDS.every((t) => s.racedTracks.includes(t)),
    progress: ({ s }) => [TRACK_IDS.filter((t) => s.racedTracks.includes(t)).length, TRACK_IDS.length],
  },
  { id: 'track-maker', icon: '✏️', name: 'Track Maker', desc: 'Race a Track Doodle', test: ({ race }) => !!race?.ugc },
];

export function achievementById(id: string): AchievementDef | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id);
}

/** Ids newly earned in this check (not yet in the save), in definition order. */
export function newAchievements(c: CheckCtx): AchievementId[] {
  const out: AchievementId[] = [];
  for (const a of ACHIEVEMENTS) {
    if (c.s.achievements[a.id] != null) continue;
    try {
      if (a.test(c)) out.push(a.id);
    } catch {
      /* a broken rule never blocks the others */
    }
  }
  return out;
}

/** Every frozen id has exactly one definition (tested). */
export function coverage(): { missing: string[]; extra: string[] } {
  const ids = new Set<string>(ACHIEVEMENT_IDS);
  const defs = new Set<string>(ACHIEVEMENTS.map((a) => a.id));
  return { missing: [...ids].filter((i) => !defs.has(i)), extra: [...defs].filter((i) => !ids.has(i)) };
}
