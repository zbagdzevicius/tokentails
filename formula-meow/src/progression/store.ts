/**
 * The live progression state: the save slot read once, kept in memory, written on every change, with listeners for
 * the screens (the garage fish counter, the HUD chip). `world()` describes the game as it is right now (which
 * circuits, routes and modes exist), so challenges and achievements never ask for something this build lacks.
 */
import { coreSlot, save, type SaveSlot } from '../core/app/save';
import { hasScreen } from '../core/app/screens';
import { ALL_TRACKS, TRACKS } from '../core/track/tracks';
import { dayNoFor } from '../share/daily/daily';
import { ensureDay } from './challenges';
import type { Award, World } from './record';
import { defaultProg, migrateProg, type ProgSave } from './state';

let slot: SaveSlot<ProgSave> | null = null;
let cur: ProgSave | null = null;
const listeners = new Set<(s: ProgSave) => void>();

function theSlot(): SaveSlot<ProgSave> {
  if (!slot) {
    let core: ReturnType<ReturnType<typeof coreSlot>['get']> | null = null;
    try {
      core = coreSlot().get();
    } catch {
      core = null;
    }
    slot = save.slot<ProgSave>('progression', defaultProg(), (raw) => migrateProg(raw, core));
  }
  return slot;
}

export function prog(): ProgSave {
  if (!cur) {
    cur = theSlot().get();
    theSlot().set(cur); // a first load (v1 migration) is written once
  }
  return cur;
}

export function setProg(s: ProgSave): void {
  cur = s;
  theSlot().set(s);
  for (const fn of [...listeners]) {
    try {
      fn(s);
    } catch (err) {
      console.warn('[progression] listener failed', err);
    }
  }
}

export function onProg(fn: (s: ProgSave) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Tests and QA: forget the cached state. */
export function resetProgCache(): void {
  cur = null;
  slot = null;
}

export function today(now: Date = new Date()): number {
  return Math.max(1, dayNoFor(now));
}

export function world(): World {
  const circuits = ALL_TRACKS.filter((t) => t.kind !== 'arena');
  return {
    today: today(),
    challengeEnv: {
      tracks: TRACKS.map((t) => t.id),
      hasCoins: circuits.some((t) => (t.coins?.length ?? 0) > 0),
      hasBranches: circuits.some((t) => (t.branches?.length ?? 0) > 0),
      hasBattle: hasScreen('battle'),
      hasTimeTrial: hasScreen('tt'),
    },
    branchTracks: circuits.filter((t) => (t.branches?.length ?? 0) > 0).map((t) => t.id),
    circuits: TRACKS.map((t) => t.id),
  };
}

/** Today's challenges (rolled over if the day changed; saved). */
export function dailyToday(): ProgSave['daily'] {
  const s = prog();
  const w = world();
  const d = ensureDay(s.daily, w.today, w.challengeEnv);
  if (d !== s.daily) setProg({ ...s, daily: d });
  return d;
}

// ------------------------------------------------------------------------------------------------
// rewards waiting for the rewards screen (a cup's fish, trophies, unlocks): shown once, then cleared
// ------------------------------------------------------------------------------------------------

let pending: Award[] = [];

export function queueReward(a: Award): void {
  if (a.total || a.achievements.length || a.unlocks.length || a.trophy || a.medal) pending.push(a);
}

export function takeRewards(): Award[] {
  const p = pending;
  pending = [];
  return p;
}

export function peekRewards(): readonly Award[] {
  return pending;
}
