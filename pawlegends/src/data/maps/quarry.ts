/**
 * Sim v34 (docs/plans/moba/MAPS-3V3.md §5): Geode Quarry, after the genre idea of a central gem mine (no other game's
 * names or geometry). Two cliff lanes and a middle Gem Road into an open arena round the Geode, which pops Catnip Gems.
 * Heroes carry them and drop them all when they fall; a team carrying 8 for 12 s spends them on a Geode Surge: its
 * minions take less and hit structures harder, its heroes hit structures harder. No jungle camps.
 */
import { OBJ_BASE, poolMap } from './pool';

export const QUARRY = poolMap({
  id: 'quarry',
  name: 'Geode Quarry',
  blurb: 'Grab Catnip Gems from the Geode. Hold 7 for 12 s for a Geode Surge.',
  lanes: ['sunny', 'puddle'],
  laneNames: ['Cliff Path', 'Gravel Path'],
  waypoints: {
    sunny: [
      [10000, 30000],
      [15000, 45000],
      [25000, 51000],
      [50000, 51000],
    ],
    puddle: [
      [10000, 30000],
      [15000, 15000],
      [25000, 9000],
      [50000, 9000],
    ],
  },
  towers: [
    { lane: 'sunny', tier: 'outer', x: 37000, y: 51000, hp: 2000 },
    { lane: 'sunny', tier: 'inner', x: 22000, y: 49200, hp: 2400 },
    { lane: 'puddle', tier: 'outer', x: 37000, y: 9000, hp: 2000 },
    { lane: 'puddle', tier: 'inner', x: 22000, y: 10800, hp: 2400 },
  ],
  minions: 40,
  // a softer core (CORE_STATS 3,000) so a won late game ends on it, not at the safety end
  coreHp: 2500,
  camps: [],
  campMonsters: 0,
  bushes: [
    { x: 43000, y: 39500, w: 5000, h: 2500 },
    { x: 43000, y: 20500, w: 5000, h: 2500 },
    { x: 32000, y: 30000, w: 3000, h: 5000 },
    { x: 40000, y: 48000, w: 3000, h: 3000 },
    { x: 40000, y: 12000, w: 3000, h: 3000 },
  ],
  walls: [
    [39000, 29000, 40500, 31000],
    [43000, 35500, 46500, 37000],
    [43000, 23000, 46500, 24500],
    [45500, 28000, 46500, 32000],
  ],
  clearings: [[50000, 30000, 13000]],
  corridors: [
    [14000, 30000, 36000, 30000, 3500],
    [41000, 37000, 36000, 46500, 2500],
    [41000, 23000, 36000, 13500, 2500],
  ],
  pudding: { x: 50000, y: 30000 },
  objective: {
    ...OBJ_BASE,
    kind: 'gems',
    x: 50000,
    y: 30000,
    r: 1500,
    first: 1350,
    cooldown: 180,
    xp: 10,
    buffTicks: 1350,
    minionStructBp: 15000,
    heroStructBp: 12500,
    minionTakenBp: 7000,
    gemCap: 20,
    gemNeed: 7,
    countdown: 360,
  },
});
