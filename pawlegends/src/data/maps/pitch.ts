/**
 * Sim v34 (docs/plans/moba/MAPS-3V3.md §6): Pawball Park, after the genre idea of a ball kicked into a goal (no other
 * game's names or geometry). A pitch between the two touchline lanes, a goal in front of each base behind breakable
 * crates, and the match yarn ball on the centre spot. A goal smashes the conceding team's weakest tower (12% of its
 * max HP), pays the scorers, and sends the ball back to the centre while every crate regrows. At Sunset the crates
 * crumble for good.
 */
import { OBJ_BASE, poolMap } from './pool';

export const PITCH = poolMap({
  id: 'pitch',
  name: 'Pawball Park',
  blurb: 'Kick the yarn ball into their goal. Every goal smashes a tower.',
  lanes: ['sunny', 'puddle'],
  laneNames: ['North Touchline', 'South Touchline'],
  waypoints: {
    sunny: [
      [10000, 30000],
      [13000, 44000],
      [22000, 52000],
      [50000, 53000],
    ],
    puddle: [
      [10000, 30000],
      [13000, 16000],
      [22000, 8000],
      [50000, 7000],
    ],
  },
  towers: [
    { lane: 'sunny', tier: 'outer', x: 35000, y: 52500 },
    { lane: 'sunny', tier: 'inner', x: 19000, y: 49300 },
    { lane: 'puddle', tier: 'outer', x: 35000, y: 7500 },
    { lane: 'puddle', tier: 'inner', x: 19000, y: 10700 },
  ],
  minions: 40,
  // a softer core (CORE_STATS 3,000) so a won late game ends on it, not at the safety end
  coreHp: 2500,
  camps: [],
  campMonsters: 0,
  bushes: [
    { x: 32000, y: 39000, w: 4000, h: 2500 },
    { x: 32000, y: 21000, w: 4000, h: 2500 },
    { x: 40000, y: 50000, w: 3000, h: 3000 },
    { x: 40000, y: 10000, w: 3000, h: 3000 },
  ],
  walls: [
    [15000, 26000, 16000, 34000],
    [16000, 25000, 19500, 26500],
    [16000, 33500, 19500, 35000],
    [36000, 23000, 38000, 25000],
    [36000, 35000, 38000, 37000],
  ],
  clearings: [],
  corridors: [
    [24000, 30000, 50000, 30000, 11000],
    [30000, 40000, 27000, 47500, 2500],
    [44000, 40000, 44000, 48000, 2500],
    [30000, 20000, 27000, 12500, 2500],
    [44000, 20000, 44000, 12000, 2500],
  ],
  pudding: { x: 50000, y: 30000 },
  goalMouth: [16000, 26500, 19000, 33500],
  crates: [
    [21500, 23500, 23000, 26500],
    [21500, 33500, 23000, 36500],
    [25000, 28500, 26500, 31500],
    [29000, 20000, 30500, 23000],
    [29000, 37000, 30500, 40000],
  ],
  heroPvp: {
    barkula: { dmgBp: 10150, takenBp: 9850 },
    bravo: { dmgBp: 9800, takenBp: 10200 },
    brutus: { dmgBp: 10150, takenBp: 9850 },
    cacklejaw: { dmgBp: 9850, takenBp: 10150 },
    gabe: { dmgBp: 9850, takenBp: 10150 },
    lambo: { dmgBp: 10150, takenBp: 9850 },
    nugget: { dmgBp: 10200, takenBp: 9800 },
    sage: { dmgBp: 9900, takenBp: 10100 },
    stilts: { dmgBp: 9850, takenBp: 10150 },
  },
  objective: {
    ...OBJ_BASE,
    kind: 'goal',
    x: 50000,
    y: 30000,
    fish: 40,
    xp: 50,
    // V34-MAPS.md §2b: one ball hit breaks a crate (was two), so a crate cannot shut the goal for a whole half
    capture: 1,
    siegeBp: 1200,
    reset: 150,
  },
});
