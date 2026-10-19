/**
 * Recording what happened (pure reducers over the progression save, all unit tested in record.test.ts):
 *
 * - `applyRace`: one finished (or abandoned at the results) race → lifetime stats, best laps, track sets, the fish
 *   it pays, the rival record, daily challenge progress, unlocks and achievements.
 * - `applyCup`: a Grand Prix result (modes lane, app bus `cupEnd`) → trophy, class / Mirror / Catnip Cup unlocks,
 *   a shelter cat, trophy fish.
 * - `applyMedal`: a time trial medal (modes lane, `recordMedal`) → medal fish, Medal Hunter.
 * - `applyGhostWins`: dare wins counted by the share lane's rivalry ledger → Ghostbuster.
 *
 * Every reducer returns the new save plus an `Award` (what the results and rewards screens show).
 */
import type { RaceClass, RaceMode, RaceResult, RaceStats } from '../types';
import { ACHIEVEMENT_FISH, TROPHY_FISH } from '../content/cosmetics';
import { CLASS_MULT, fishForRace, medalFish, raceFishInput, sumFish, type FishLine } from './economy';
import { newAchievements, type CheckCtx, type RaceCheck } from './achievements';
import { ensureDay, progressChallenges, type ChallengeEnv, type ChallengeEvent } from './challenges';
import { cupClassUnlocks, refreshUnlocks, type UnlockNews } from './unlocks';
import type { ProgSave } from './state';

/** Where the game is (circuits, routes, which modes exist). Supplied by the install file; tests make their own. */
export interface World {
  today: number;
  challengeEnv: ChallengeEnv;
  /** circuits with an alternative route */
  branchTracks: readonly string[];
  /** authored circuits (Medal Hunter) */
  circuits: readonly string[];
}

export interface Award {
  fish: FishLine[];
  total: number;
  achievements: string[];
  unlocks: UnlockNews[];
  /** challenge indices completed by this event (today's `daily.ids`) */
  challenges: number[];
  rival?: { name: string; won: boolean; w: number; l: number };
  newBestLap?: number;
  trophy?: { cupId: string; cls: RaceClass; place: number; mirror: boolean };
  medal?: { trackId: string; cls: RaceClass; medal: number };
}

export function emptyAward(): Award {
  return { fish: [], total: 0, achievements: [], unlocks: [], challenges: [] };
}

/** One race as the progression sees it (built by the install file from the result and the event log). */
export interface RaceRecord {
  result: RaceResult;
  /** the player's stats */
  stats: RaceStats;
  trackId: string;
  modifiers: number;
  /** a Track Doodle (not authored) */
  ugc: boolean;
  /** the track has an alternative route */
  hasBranches: boolean;
  body: number;
  /** metres the player drove (0 on arenas) */
  distance: number;
  maxCoinsHeld: number;
  /** the race's rival: kart index and name, and whether the player hit them */
  rival?: { kart: number; name: string; hit: boolean };
}

function clone(s: ProgSave): ProgSave {
  return JSON.parse(JSON.stringify(s)) as ProgSave;
}

const addTo = (list: string[], v: string): string[] => (list.includes(v) ? list : [...list, v]);

/** Achievements + their fish (shared by every reducer). */
function settle(before: ProgSave, s: ProgSave, w: World, award: Award, race?: RaceCheck): ProgSave {
  const u = refreshUnlocks(before, s);
  s = u.save;
  award.unlocks.push(...u.news);
  const ctx: CheckCtx = { s, race, branchTracks: w.branchTracks, circuits: w.circuits };
  for (const id of newAchievements(ctx)) {
    s.achievements[id] = w.today;
    award.achievements.push(id);
    award.fish.push({ key: 'Achievement', amount: ACHIEVEMENT_FISH });
  }
  award.total = sumFish(award.fish);
  s.fish += award.total;
  s.fishTotal += award.total;
  return s;
}

function challengeEvent(s: ProgSave, w: World, ev: ChallengeEvent, award: Award): void {
  s.daily = ensureDay(s.daily, w.today, w.challengeEnv);
  const c = progressChallenges(s.daily, ev, w.today);
  s.daily = c.daily;
  award.challenges.push(...c.completed);
  award.fish.push(...c.fish);
}

export function applyRace(before: ProgSave, r: RaceRecord, w: World): { save: ProgSave; award: Award } {
  const s = clone(before);
  const award = emptyAward();
  const res = r.result;
  const mode: RaceMode = res.mode ?? 'race';
  const me = res.player;
  const finished = me.time != null;
  const racing = mode !== 'tt' && mode !== 'battle';
  const st = s.stats;
  const x = r.stats;

  // lifetime stats
  st.races++;
  if (finished) st.finishes++;
  if (racing && finished && me.place === 1) st.wins++;
  if (racing && finished && me.place <= 3) st.podiums++;
  if (mode === 'battle' && me.place === 1) st.battleWins++;
  st.distance += Math.max(0, Math.round(r.distance));
  st.hitsDealt += x.hitsDealt;
  st.hitsTaken += x.hitsTaken;
  for (let i = 0; i < 3; i++) st.miniTurbos[i] += x.miniTurbos[i];
  st.tricks += x.tricks;
  st.coins += x.coinsPicked;
  st.itemsUsed += x.itemsUsed;
  st.overtakes += x.overtakes;
  if (x.pounce) st.pounces++;
  st.slipstreams += x.slipstreams;
  st.shortcuts += x.shortcuts;
  st.respawns += x.respawns;
  const b = Math.max(0, Math.min(5, Math.floor(r.body)));
  st.bodyRaces[b] = (st.bodyRaces[b] ?? 0) + 1;
  st.modeRaces[mode] = (st.modeRaces[mode] ?? 0) + 1;

  // tracks
  if (!r.ugc) {
    s.racedTracks = addTo(s.racedTracks, r.trackId);
    if (racing && finished && me.place <= 3) s.podiumTracks = addTo(s.podiumTracks, r.trackId);
    if (x.shortcuts > 0 && r.hasBranches) s.shortcutTracks = addTo(s.shortcutTracks, r.trackId);
    if (me.bestLap != null && mode !== 'battle') {
      const key = `${r.trackId}:${res.cls}:${r.modifiers}`;
      const prev = s.bestLaps[key];
      if (prev == null || me.bestLap < prev) {
        s.bestLaps[key] = me.bestLap;
        if (prev != null) award.newBestLap = me.bestLap;
      }
    }
  }

  // fish from the race itself
  award.fish.push(...fishForRace(raceFishInput(res, x)));
  const raceFish = sumFish(award.fish);

  // rival
  if (r.rival && racing) {
    const them = res.places.find((p) => p.kart === r.rival!.kart);
    if (them) {
      const won = finished && (them.time == null || me.place < them.place);
      const row = s.rivals[r.rival.name] ?? { w: 0, l: 0 };
      if (won) row.w++;
      else row.l++;
      s.rivals[r.rival.name] = row;
      award.rival = { name: r.rival.name, won, w: row.w, l: row.l };
    }
  }

  // daily challenges
  challengeEvent(s, w, { kind: 'race', race: { mode, trackId: r.trackId, place: me.place, finished, stats: x, fish: raceFish } }, award);

  const check: RaceCheck = {
    mode,
    trackId: r.trackId,
    place: me.place,
    finished,
    karts: res.places.length,
    stats: x,
    maxCoinsHeld: Math.max(r.maxCoinsHeld, res.coins ?? 0),
    hitRival: !!r.rival?.hit,
    ugc: r.ugc,
  };
  return { save: settle(before, s, w, award, check), award };
}

/** Cup trophy key: `kibble:2`, Mirror cups `kibble:2m`. */
export function trophyKey(cupId: string, cls: RaceClass, mirror: boolean): string {
  return `${cupId}:${cls}${mirror ? 'm' : ''}`;
}

export function applyCup(before: ProgSave, e: { cupId: string; cls: RaceClass; place: number; mirror?: boolean }, w: World): { save: ProgSave; award: Award } {
  const s = clone(before);
  const award = emptyAward();
  const mirror = !!e.mirror;
  const place = Math.floor(e.place);
  if (place >= 1 && place <= 3) {
    const key = trophyKey(e.cupId, e.cls, mirror);
    const prev = s.trophies[key];
    if (prev == null || place < prev) {
      s.trophies[key] = place;
      const mult = CLASS_MULT[mirror ? 2 : e.cls] ?? 1;
      award.fish.push({ key: 'Cup trophy', amount: Math.round((TROPHY_FISH[place - 1] ?? 0) * mult) });
    }
    award.trophy = { cupId: e.cupId, cls: e.cls, place, mirror };
  }
  const u = cupClassUnlocks(e.cupId, e.cls, place, mirror);
  if (u.cls != null && u.cls > s.classUnlocked) s.classUnlocked = u.cls;
  if (u.mirror) s.mirror = true;
  return { save: settle(before, s, w, award), award };
}

export function applyMedal(before: ProgSave, trackId: string, cls: RaceClass, medal: number, w: World): { save: ProgSave; award: Award } {
  const s = clone(before);
  const award = emptyAward();
  if (medal < 1 || medal > 3) return { save: s, award };
  const key = `${trackId}:${cls}`;
  const prev = s.medals[key];
  award.medal = { trackId, cls, medal };
  if (prev == null || medal < prev) {
    s.medals[key] = medal;
    // a better medal pays the difference, so gold after bronze is never worth less than gold first time
    award.fish.push({ key: 'Time trial medal', amount: medalFish(medal) - (prev ? medalFish(prev) : 0) });
  }
  challengeEvent(s, w, { kind: 'medal', medal }, award);
  return { save: settle(before, s, w, award), award };
}

/** The share lane's dare ledger counts `total` wins; anything above what we saw is a ghost beaten (Ghostbuster). */
export function applyGhostWins(before: ProgSave, total: number, w: World): { save: ProgSave; award: Award } {
  const s = clone(before);
  const award = emptyAward();
  if (s.ghostWins < 0) {
    // first look: wins from before progression existed count once, so earlier dare winners get the badge too
    s.ghostWins = total;
  } else if (total > s.ghostWins) s.ghostWins = total;
  else return { save: s, award };
  return { save: settle(before, s, w, award), award };
}

/** Class unlocks the shell granted on its own (v1 rule: finish 50cc, top 3 at 100cc). */
export function applyShellClass(before: ProgSave, cls: number, w: World): { save: ProgSave; award: Award } {
  const s = clone(before);
  const award = emptyAward();
  if (cls > s.classUnlocked) s.classUnlocked = Math.max(0, Math.min(2, cls)) as RaceClass;
  else return { save: s, award };
  return { save: settle(before, s, w, award), award };
}

/** Merge two awards (the results show everything one race caused). */
export function mergeAward(a: Award, b: Award): Award {
  return {
    fish: [...a.fish, ...b.fish],
    total: a.total + b.total,
    achievements: [...a.achievements, ...b.achievements],
    unlocks: [...a.unlocks, ...b.unlocks],
    challenges: [...new Set([...a.challenges, ...b.challenges])],
    rival: a.rival ?? b.rival,
    newBestLap: a.newBestLap ?? b.newBestLap,
    trophy: a.trophy ?? b.trophy,
    medal: a.medal ?? b.medal,
  };
}
