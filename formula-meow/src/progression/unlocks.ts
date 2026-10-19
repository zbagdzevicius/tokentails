/**
 * Unlock rules (ITERATION-2 progression), pure over the save so each is unit tested:
 *
 * | Unlock | Rule |
 * |---|---|
 * | 100cc | finish any 50cc cup (or the shell's v1 rule: finish a 50cc race) |
 * | 150cc | podium in a 100cc cup (or the shell's v1 rule: top 3 in a 100cc race) |
 * | Mirror | gold in the Kibble Cup at 150cc |
 * | Catnip Cup | any Kibble Cup trophy |
 * | Battle | finish 3 races |
 * | Time Trial | from the start |
 * | Bodies, hats | bought with fish (economy.ts) |
 * | Trails | the first podium on the trail's track (content/cosmetics.ts TRAIL_RULES) |
 * | Pink Paw cats | one per cup trophy (share/pinkpaw/unlocks.ts) |
 */
import type { RaceClass } from '../types';
import { TRAIL_IDS } from '../content/ids';
import { TRAIL_RULES } from '../content/cosmetics';
import { shelterCatsEarned } from '../share/pinkpaw/unlocks';
import type { ProgSave } from './state';

export type UnlockKey = 'class:1' | 'class:2' | 'mirror' | 'cup:catnip' | 'mode:battle' | 'mode:tt';

/** Unlocked, or the `t()` key that says how to unlock it. */
export interface UnlockState {
  ok: boolean;
  hint: string;
}

export const BATTLE_FINISHES = 3;

export function trophyCount(s: ProgSave): number {
  return Object.values(s.trophies).filter((p) => p >= 1 && p <= 3).length;
}

export function unlockState(s: ProgSave, key: UnlockKey): UnlockState {
  switch (key) {
    case 'class:1':
      return { ok: s.classUnlocked >= 1, hint: 'Finish a 50cc cup' };
    case 'class:2':
      return { ok: s.classUnlocked >= 2, hint: 'Podium in a 100cc cup' };
    case 'mirror':
      return { ok: s.mirror, hint: 'Gold in the Kibble Cup at 150cc' };
    case 'cup:catnip':
      return { ok: Object.keys(s.trophies).some((k) => k.startsWith('kibble:')), hint: 'Any Kibble Cup trophy' };
    case 'mode:battle':
      return { ok: s.stats.finishes >= BATTLE_FINISHES, hint: 'Finish 3 races' };
    case 'mode:tt':
      return { ok: true, hint: '' };
  }
}

export function isUnlocked(s: ProgSave, key: UnlockKey): boolean {
  return unlockState(s, key).ok;
}

/** Trails earned by the podium tracks (index into TRAIL_IDS). */
export function trailsEarned(s: Pick<ProgSave, 'podiumTracks'>): number[] {
  const out = [0];
  TRAIL_IDS.forEach((id, i) => {
    if (i > 0 && s.podiumTracks.includes(TRAIL_RULES[id])) out.push(i);
  });
  return out;
}

/** What a cup result unlocks for a class (pure): the class unlocks and Mirror. */
export function cupClassUnlocks(cupId: string, cls: RaceClass, place: number, mirror: boolean): { cls: RaceClass | null; mirror: boolean } {
  let c: RaceClass | null = null;
  if (cls === 0 && !mirror) c = 1; // finishing any 50cc cup
  if (cls === 1 && !mirror && place <= 3) c = 2;
  return { cls: c, mirror: cupId === 'kibble' && cls === 2 && !mirror && place === 1 };
}

export interface UnlockNews {
  kind: 'class' | 'mirror' | 'cup' | 'mode' | 'trail' | 'cat';
  id: string;
}

/**
 * Bring the save's derived unlocks up to date (trails, shelter cats) and list what changed against `before`
 * (classes, Mirror, the Catnip Cup and Battle are reported too). Pure: returns a new save.
 */
export function refreshUnlocks(before: ProgSave, after: ProgSave): { save: ProgSave; news: UnlockNews[] } {
  const s: ProgSave = { ...after, owned: { ...after.owned } };
  const news: UnlockNews[] = [];
  const trails = trailsEarned(s);
  for (const t of trails) if (!s.owned.trails.includes(t)) news.push({ kind: 'trail', id: TRAIL_IDS[t] });
  s.owned.trails = [...new Set([...s.owned.trails, ...trails])].sort();
  const cats = shelterCatsEarned(trophyCount(s));
  for (const c of cats) if (!s.owned.cats.includes(c)) news.push({ kind: 'cat', id: c });
  s.owned.cats = [...new Set([...s.owned.cats, ...cats])];
  if (s.classUnlocked > before.classUnlocked) news.push({ kind: 'class', id: String(s.classUnlocked) });
  if (s.mirror && !before.mirror) news.push({ kind: 'mirror', id: 'mirror' });
  if (isUnlocked(s, 'cup:catnip') && !isUnlocked(before, 'cup:catnip')) news.push({ kind: 'cup', id: 'catnip' });
  if (isUnlocked(s, 'mode:battle') && !isUnlocked(before, 'mode:battle')) news.push({ kind: 'mode', id: 'battle' });
  if (news.length) s.fresh = [...new Set([...s.fresh, ...news.filter((n) => n.kind === 'trail' || n.kind === 'cat').map((n) => `${n.kind}:${n.id}`)])];
  return { save: s, news };
}
