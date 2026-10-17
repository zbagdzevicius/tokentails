/** Minions (POC.md §7.1). */
export type MinionKind = 'melee' | 'ranged' | 'siege';

export const MINIONS = Object.freeze({
  /** `windup`: ticks from the swing to the hit; `projectile`: mm/s (0 = melee, the hit lands at the end of the windup). */
  melee: Object.freeze({ hp: 300, dmg: 14, attackEvery: 36, range: 1200, speed: 3600, armour: 10, xp: 30, windup: 9, projectile: 0, towerBp: 10000 }),
  ranged: Object.freeze({ hp: 220, dmg: 20, attackEvery: 42, range: 5000, speed: 3600, armour: 5, xp: 25, windup: 9, projectile: 15000, towerBp: 10000 }),
  /** Yarn Catapult / Bone Cart: ×2 vs towers. */
  siege: Object.freeze({ hp: 700, dmg: 40, attackEvery: 60, range: 6000, speed: 3200, armour: 30, xp: 60, windup: 15, projectile: 12000, towerBp: 20000 }),
});

/** Minion order, by kind index in the sim (`sub`): 0 melee, 1 ranged, 2 siege. */
export const MINION_KINDS: readonly MinionKind[] = Object.freeze(['melee', 'ranged', 'siege'] as MinionKind[]);

/** Lane behaviour (not in POC.md; tuning numbers, change them here). */
export const MINION_AI = Object.freeze({
  /** Enemies within this distance (edge to edge) are acquired. */
  acquireRange: 7000,
  /** A target further than acquireRange + leash is dropped. */
  leash: 2000,
  /** Re-evaluate the target this often (ticks). */
  retargetEvery: 6,
  /** Advance to the next lane point within this distance (mm). */
  waypointReach: 1500,
  /** Same-team minions closer than this push apart (mm). */
  separation: 900,
  /** Spawn: the front minion stands this far from the core along the lane, the rest `spacing` behind each other. */
  spawnOffset: 4000,
  spacing: 1000,
});

export const WAVE = Object.freeze({
  /** Per lane: 2 melee + 1 ranged; every 3rd wave from 3:00 adds 1 siege. */
  melee: 2,
  ranged: 1,
  siege: 1,
  /** Minion HP grows 3% a minute (bp, applied at spawn). */
  hpGrowthBpPerMinute: 300,
  /** Minion XP is shared among heroes within 10 m. */
  xpRange: 10000,
});
