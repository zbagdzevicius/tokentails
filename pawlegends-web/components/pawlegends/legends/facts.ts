/**
 * Game facts the `/legends` landing states in words. Each one is read from the game's source by
 * `__test__/pawlegends/legends.test.tsx`, so a change in the game fails CI instead of leaving the page wrong.
 * Hero names and counts never live here: they come from the landing roster (`../landing/roster.ts`).
 */
export const LEGENDS_FACTS = Object.freeze({
  /** Heroes per team (`pawlegends/src/sim/api.ts` SLOTS_PER_TEAM, `data/map.ts` CAPS.heroesPerTeam). */
  teamSize: 3,
  /** Lanes on the map (`data/map.ts` C_LANES, the Classic map: sunny and puddle). */
  lanes: 2,
  /** Towers per team (`data/map.ts` C_TOWER_SPOTS: an outer and an inner tower on each lane). */
  towersPerTeam: 4,
  /** Humans in one party, all on the same team; bots fill the other seats (`net/proto.ts` COOP_HUMANS). */
  partyMax: 3,
  /** Characters in a party room code (`components/pawlegends/flags.ts` PARTY_CODE, MULTIPLAYER.md §5.3). */
  roomCodeLength: 6,
  /** The match clock's hard stop, in minutes (`data/timeline.ts` TIMELINE.safetyEnd at TICK_HZ). */
  matchCapMinutes: 11,
  /** Seconds before the gate barrier drops at the start of a match (`data/timeline.ts` TIMELINE.barrierDrop). */
  gateSeconds: 3,
});
