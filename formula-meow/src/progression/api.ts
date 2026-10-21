/**
 * The progression lane's public API (for the modes lane's menus and select screens, and the integrator). Everything
 * else in src/progression is internal.
 *
 * - `unlocked(key)` / `unlockHint(key)`: classes, Mirror, the Catnip Cup, Battle, Time Trial (locked tiles show the
 *   hint through `t()`).
 * - `fish()`, `loadout()`, `setLoadout(partial)`, `ownsBody(id)`, `ownsHat(id)`, `ownsTrail(id)`, `bodyPrice(id)`,
 *   `playableCats()`: the character / kart select reads and writes the same loadout as the garage.
 * - `kartLook()`: the player's KartLook (body, paint, number) for a race request.
 * - `recordMedal(trackId, cls, medal, mirror?)`: the time trial's medal (1 gold, 2 silver, 3 bronze); pays 15/10/5 fish.
 *   Mirror medals are kept apart from 150cc ones.
 *   Call it from the `raceEnd` listener (before the results draw) so the results show the fish.
 * - `dailyChallenges()`: today's three, with progress, for a menu tile.
 */
import type { BodyId, KartLook, RaceClass } from '../types';
import { BODY_PRICES } from '../content/cosmetics';
import { playableShelterCats } from '../share/pinkpaw/unlocks';
import type { PinkPawCat } from '../share/pinkpaw/pink-paw';
import { applyMedal, mergeAward } from './record';
import { challengeById } from './challenges';
import { kartFromLoadout } from './loadout';
import { isUnlocked, unlockState, type UnlockKey } from './unlocks';
import { prog, setProg, world, dailyToday } from './store';
import { lastAward, setLastAward } from './last';
import { trackById } from '../core/track/tracks';
import type { Loadout } from './state';

export type { UnlockKey };

export const unlocked = (key: UnlockKey): boolean => isUnlocked(prog(), key);
export const unlockHint = (key: UnlockKey): string => unlockState(prog(), key).hint;
export const fish = (): number => prog().fish;
export const loadout = (): Readonly<Loadout> => prog().equip;
export const kartLook = (): KartLook => kartFromLoadout(prog().equip);
export const ownsBody = (id: number): boolean => prog().owned.bodies.includes(id);
export const ownsHat = (id: number): boolean => prog().owned.hats.includes(id);
export const ownsTrail = (id: number): boolean => prog().owned.trails.includes(id);
export const bodyPrice = (id: BodyId): number => BODY_PRICES[id] ?? 0;
export const playableCats = (): PinkPawCat[] => playableShelterCats(prog().owned.cats);

/** Change the loadout; ids the player does not own are ignored. */
export function setLoadout(p: Partial<Loadout>): Loadout {
  const s = prog();
  const e = { ...s.equip };
  if (p.body != null && s.owned.bodies.includes(p.body)) e.body = p.body;
  if (p.hat != null && s.owned.hats.includes(p.hat)) e.hat = p.hat;
  if (p.trail != null && s.owned.trails.includes(p.trail)) e.trail = p.trail;
  if (p.paint != null && p.paint >= 0) e.paint = Math.floor(p.paint);
  if (p.number != null && p.number >= 0 && p.number <= 99) e.number = Math.floor(p.number);
  if (p.cat !== undefined && (p.cat === null || s.owned.cats.includes(p.cat))) e.cat = p.cat;
  setProg({ ...s, equip: e });
  return e;
}

export function recordMedal(trackId: string, cls: RaceClass, medal: number, mirror = false): void {
  const r = applyMedal(prog(), trackId, cls, medal, world(), mirror);
  setProg(r.save);
  const la = lastAward();
  if (la) setLastAward(mergeAward(la.award, r.award), la.token, la.seed, la.fishBefore);
}

export function dailyChallenges(): Array<{ text: string; vars: Record<string, string | number>; progress: number; target: number; done: boolean; fish: number }> {
  const d = dailyToday();
  return d.ids.flatMap((id, i) => {
    const c = challengeById(id, (t) => trackById(t).name);
    return c ? [{ text: c.text, vars: c.vars, progress: d.progress[i] ?? 0, target: c.target, done: !!d.done[i], fish: c.fish }] : [];
  });
}
