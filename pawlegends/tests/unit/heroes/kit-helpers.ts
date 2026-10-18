/** Helpers for hero kit tests: a match with chosen heroes, hand placement, casts by any slot, levels. */
import type { HeroId, TrickId } from '../../../src/sim/api';
import { NO_TARGET, Op } from '../../../src/sim/api';
import { createMatch, step, type MatchHandle } from '../../../src/sim/index';
import { applyOrder } from '../../../src/sim/units/hero';
import { grantXp } from '../../../src/sim/progression/levels';
import { XP } from '../../../src/data/xp';
import { HERO_VS_HERO_BP } from '../../../src/data/heroes';
import { COOLDOWN_SLOTS, G, RANGE } from '../../../src/sim/world';
import { refreshVision } from '../../../src/sim/map/brush';

/** Open map spot far from towers, fountains and bushes. */
export const MID = { x: 50000, y: 30000 } as const;

/**
 * Barrier down, tick 300. Bots off: the test drives every hero. Normal difficulty: no first-match help changes the
 * human's (slot 0) damage.
 */
export function heroMatch(picks: readonly HeroId[], tricks: readonly TrickId[] = ['pounce', 'pounce', 'pounce', 'pounce', 'pounce', 'pounce'], seed = 7): MatchHandle {
  const m = createMatch({ seed, picks, tricks, difficulty: 'normal' });
  m.world.globals[G.Tick] = 300;
  m.world.globals[G.BotsOff] = 1;
  // Kit numbers as POC.md §6 states them: no per-hero tuning (HeroData.pvp, Normal and Hard).
  m.world.globals[G.SideEdge] = 0;
  return m;
}

/** Put hero `id` at (x, y) facing `facing` (angle steps), standing still (no Zoomies). */
export function place(m: MatchHandle, id: number, x: number, y: number, facing = 0): void {
  const w = m.world;
  w.x[id] = x;
  w.y[id] = y;
  w.moveX[id] = x;
  w.moveY[id] = y;
  w.facing[id] = facing;
  w.pathLen[id] = 0;
  w.zoomT[id] = 0; // standing still: no Zoomies left over from the fountain (sim v4)
  refreshVision(w);
}

/** Order hero `id` to cast `slot` (0..3, or 4 for the trick) at (x, y), then step once. */
export function cast(m: MatchHandle, id: number, slot: number, x: number, y: number, target = NO_TARGET): void {
  if (slot === 4) applyOrder(m, id, { op: Op.Trick, x, y });
  else applyOrder(m, id, { op: Op.Cast, slot: slot as 0 | 1 | 2 | 3, x, y, id: target });
  step(m);
}

export function steps(m: MatchHandle, n: number): void {
  for (let i = 0; i < n; i++) step(m);
}

export function setLevel(m: MatchHandle, id: number, level: number): void {
  grantXp(m, id, XP.toLevel[level - 1] - m.world.xp[id], 'minion', true);
}

export const cd = (m: MatchHandle, id: number, slot: number): number => m.world.cooldowns[id * COOLDOWN_SLOTS + slot];

/** Armour formula (§6.1). */
export const afterArmour = (dmg: number, armour: number): number => Math.trunc((dmg * 100) / (100 + armour));

/** A hero's hit on an enemy hero (sim v4): kit damage × HERO_VS_HERO_BP, then armour. */
export const heroHit = (dmg: number, armour: number): number => afterArmour(Math.trunc((dmg * HERO_VS_HERO_BP) / 10000), armour);

/**
 * Make heroes tanky (max HP × 10, full) so a kit test measures the kit, not Nine Lives (data/xp.ts NINE_LIVES cuts
 * what a hero loses beyond a share of its max HP in one second).
 */
export function tanky(m: MatchHandle, ...ids: number[]): void {
  for (const id of ids) {
    m.world.maxHp[id] *= 10;
    m.world.hp[id] = m.world.maxHp[id];
  }
}

/** Freeze a hero: no auto-attacks (attack timer held high), so a test measures only the ability. */
export function hold(m: MatchHandle, ...ids: number[]): void {
  for (const id of ids) m.world.attackTimer[id] = 1 << 20;
}

export const HEROES_END = RANGE.minions;
