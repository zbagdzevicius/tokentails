/**
 * Seams the modes lane offers other lanes (the integrator wires them; no lane imports another's internals):
 *
 * - `setUnlockProvider(p)`: what is locked and what unlocks it. The default implements the ITERATION-2 unlock table
 *   from what the modes lane can see (the shell's class unlocks and race count, its own trophies); the progression
 *   lane owns the real rules and can replace it.
 * - `setRivalPicker(fn)`: picks the Grand Prix rival (default: the highest-skill AI that was not the last rival).
 * - `registerMenuTile(tile)`: extra main-menu tiles (achievements, stats, …), sorted by `order`.
 */
import type { RacerInfo } from '../types';
import { BODY_PRICES, HAT_PRICES } from '../content/cosmetics';
import { HAT_IDS, type CupId } from '../content/ids';
import { t } from '../ui/i18n';
import { modesSlot, type ClassPick } from './store';

export type LockKind = 'class' | 'cup' | 'mode' | 'body' | 'hat';

export interface UnlockProvider {
  /** null = unlocked, else a short line saying what unlocks it */
  lock(kind: LockKind, id: string): string | null;
  /** Pink Paw roster ids the player can race as (shown with their status date) */
  shelterCats(): string[];
}

export interface ShellProgress {
  races: number;
  unlocked: number;
}

/** The default rules (ITERATION-2 section 2, progression's table) over the shell's progress and the modes save. */
export function defaultUnlocks(progress: () => ShellProgress): UnlockProvider {
  const trophy = (cup: CupId, cls: ClassPick) => modesSlot().get().trophies[`${cup}:${cls}`] ?? 0;
  const anyTrophy = (cup: CupId) => [0, 1, 2, 3].some((c) => trophy(cup, c as ClassPick) > 0);
  const cupDone = (cls: ClassPick) => {
    const done = modesSlot().get().cupsDone;
    return Object.keys(done).some((k) => k.endsWith(`:${cls}`) && done[k] > 0);
  };
  return {
    lock(kind, id) {
      const p = progress();
      if (kind === 'class') {
        if (id === '1') return p.unlocked >= 1 || cupDone(0) ? null : t('Finish a 50cc race');
        if (id === '2') return p.unlocked >= 2 || ['kibble', 'catnip'].some((c) => [1, 2, 3].includes(trophy(c as CupId, 1))) ? null : t('Podium at 100cc');
        if (id === '3') return trophy('kibble', 2) === 1 || trophy('catnip', 2) === 1 ? null : t('Gold in a 150cc cup');
        return null;
      }
      if (kind === 'cup') return id === 'catnip' && !anyTrophy('kibble') ? t('Win a Kibble Cup trophy') : null;
      if (kind === 'mode') {
        if (id === 'battle' && p.races < 3) return t('Finish 3 races ({n}/3)', { n: p.races });
        return null;
      }
      if (kind === 'body') {
        const price = BODY_PRICES[Number(id) as keyof typeof BODY_PRICES] ?? 0;
        return price > 0 ? t('{n} fish in the Garage', { n: price }) : null;
      }
      if (kind === 'hat') {
        const name = HAT_IDS[Number(id)] ?? 'none';
        const price = HAT_PRICES[name] ?? 0;
        return price > 0 ? t('{n} fish in the Garage', { n: price }) : null;
      }
      return null;
    },
    shelterCats: () => [],
  };
}

let unlocks: UnlockProvider | null = null;

export function setUnlockProvider(p: UnlockProvider): void {
  unlocks = p;
}

export function unlockProvider(): UnlockProvider {
  if (!unlocks) unlocks = defaultUnlocks(() => ({ races: 0, unlocked: 0 }));
  return unlocks;
}

export type RivalPicker = (field: readonly RacerInfo[], lastRival: string) => number;

/** Default: the highest-skill AI that was not the last rival (ties: the lower slot). */
export const defaultRival: RivalPicker = (field, lastRival) => {
  let best = -1;
  let bestSkill = -1;
  field.forEach((r, i) => {
    if (!r.ai || r.name === lastRival) return;
    if (r.ai.skill > bestSkill) {
      bestSkill = r.ai.skill;
      best = i;
    }
  });
  return best;
};

let rivalPicker: RivalPicker = defaultRival;

export function setRivalPicker(fn: RivalPicker): void {
  rivalPicker = fn;
}

export function pickRival(field: readonly RacerInfo[], lastRival: string): number {
  try {
    return rivalPicker(field, lastRival);
  } catch {
    return defaultRival(field, lastRival);
  }
}

export interface MenuTile {
  id: string;
  order: number;
  icon: string;
  label: () => string;
  sub?: () => string;
  /** null = open, else the lock line */
  lock?: () => string | null;
  run: () => void;
}

const tiles: MenuTile[] = [];

/** Add a main-menu tile (other lanes: achievements, stats). A tile with the same id replaces the old one. */
export function registerMenuTile(tile: MenuTile): void {
  const i = tiles.findIndex((x) => x.id === tile.id);
  if (i >= 0) tiles.splice(i, 1, tile);
  else tiles.push(tile);
  tiles.sort((a, b) => a.order - b.order);
}

export function menuTiles(): readonly MenuTile[] {
  return tiles;
}
