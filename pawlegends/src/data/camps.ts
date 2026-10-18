/** Rat camp (POC.md §5). One per side in the POC: the Purrhaven one at RAT_CAMP, the Woof one mirrored. */
export const RAT_CAMP_STATS = Object.freeze({
  rats: 2,
  hp: 450,
  dmg: 25,
  attackEvery: 30,
  /** Ticks from the swing to the bite (tuning, not in POC.md). */
  windup: 8,
  range: 1200,
  speed: 4000,
  armour: 0,
  /** A rat drops its target and runs home once it is this far from the camp (or its target is). */
  leash: 8000,
  /** 70 XP total for the camp (35 a rat), shared among the killer's team heroes within XP.shareRange. */
  xpTotal: 70,
  /** First at 0:30 (TIMELINE.campsUp), respawn 60 s after both rats fell. */
  respawn: 1800,
  /** Clearing the camp gives the killer's team +15% damage for 45 s (v4, a `buff` event 'pack'). */
  packDmgBp: 1500,
  packTicks: 1350,
  /** The two rats stand this far either side of the camp centre (y). */
  spread: 1200,
});
