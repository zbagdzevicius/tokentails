/**
 * Sim v34 (docs/plans/moba/MAPS-3V3.md §3): Lanternfall Ridge, after the genre idea of a one-lane map with a big jungle
 * (no other game's names or geometry). One lane along the north ridge, the whole south a lantern-lit wood with three
 * camps a side, and the Fish Mill in the pit on the map's axis: it fills with Fish and pays the team that holds it,
 * with a Lantern Wave for its minions; at 4:30 the mill shuts and Pudding wakes in the pit.
 *
 * Deviation from the design (V34-MAPS.md §1): two towers a side (outer and a stronger Ridge Gate at the base mouth)
 * instead of three, so every two-tier rule (core exposure, bots' lane structures) holds unchanged.
 */
import { CAMP_KIND } from '../camps';
import { OBJ_BASE, poolMap } from './pool';

export const RIDGE = poolMap({
  id: 'ridge',
  name: 'Lanternfall Ridge',
  blurb: 'One lane on the ridge. Take the Fish Mill in the woods; at 4:30 Pudding wakes there.',
  lanes: ['sunny'],
  laneNames: ['Ridge Road'],
  waypoints: {
    sunny: [
      [10000, 30000],
      [13000, 42000],
      [20000, 49000],
      [34000, 51000],
      [50000, 50000],
    ],
  },
  towers: [
    { lane: 'sunny', tier: 'outer', x: 36000, y: 50800, hp: 2000 },
    { lane: 'sunny', tier: 'inner', x: 24000, y: 49600, hp: 2250 },
  ],
  minions: 24,
  // one lane: all six heroes defend one base, so its core is a little softer (CORE_STATS 3,000)
  coreHp: 2500,
  camps: [
    [CAMP_KIND.rat, 22000, 16000],
    [CAMP_KIND.beetle, 32000, 28000],
    [CAMP_KIND.toad, 36000, 11000],
  ],
  campMonsters: 8,
  bushes: [
    { x: 29000, y: 46000, w: 3000, h: 4000 },
    { x: 44000, y: 42500, w: 3000, h: 4000 },
    { x: 40000, y: 15000, w: 3000, h: 3000 },
    { x: 28000, y: 22000, w: 3000, h: 3000 },
  ],
  walls: [[45500, 24500, 47500, 26500]],
  clearings: [
    [22000, 16000, 4500],
    [32000, 28000, 4500],
    [36000, 11000, 4000],
    [50000, 22000, 8000],
  ],
  corridors: [
    [14000, 24000, 22000, 16000, 3000],
    [24000, 16000, 36000, 11000, 2500],
    [24000, 16000, 32000, 28000, 2500],
    [32000, 28000, 28000, 44000, 2500],
    [32000, 28000, 44000, 40000, 2500],
    [44000, 40000, 46000, 45500, 2500],
    [36000, 11000, 44000, 18000, 2500],
    [32000, 28000, 43000, 25000, 2500],
  ],
  pudding: { x: 50000, y: 22000 },
  heroPvp: {
    aviete: { dmgBp: 10300, takenBp: 9700 },
    barkula: { dmgBp: 10100, takenBp: 9900 },
    bengas: { dmgBp: 10300, takenBp: 9700 },
    biscuit: { dmgBp: 9750, takenBp: 10250 },
    bravo: { dmgBp: 9450, takenBp: 10550 },
    brutus: { dmgBp: 8650, takenBp: 11350 },
    cacklejaw: { dmgBp: 10400, takenBp: 9600 },
    champ: { dmgBp: 9750, takenBp: 10250 },
    chili: { dmgBp: 10550, takenBp: 9450 },
    clem: { dmgBp: 9700, takenBp: 10300 },
    domino: { dmgBp: 10350, takenBp: 9650 },
    duchess: { dmgBp: 9550, takenBp: 10450 },
    dusty: { dmgBp: 10550, takenBp: 9450 },
    frankie: { dmgBp: 10400, takenBp: 9600 },
    gabe: { dmgBp: 9500, takenBp: 10500 },
    howler: { dmgBp: 9700, takenBp: 10300 },
    lambo: { dmgBp: 9200, takenBp: 10800 },
    marshmallow: { dmgBp: 9500, takenBp: 10500 },
    meatball: { dmgBp: 9350, takenBp: 10650 },
    mochi: { dmgBp: 10550, takenBp: 9450 },
    nova: { dmgBp: 9700, takenBp: 10300 },
    nugget: { dmgBp: 9550, takenBp: 10450 },
    pixel: { dmgBp: 10200, takenBp: 9800 },
    ranger: { dmgBp: 10900, takenBp: 9100 },
    rocket: { dmgBp: 10650, takenBp: 9350 },
    sage: { dmgBp: 10150, takenBp: 9850 },
    stilts: { dmgBp: 10600, takenBp: 9400 },
    ziggy: { dmgBp: 10300, takenBp: 9700 },
  },
  objective: {
    ...OBJ_BASE,
    kind: 'mill',
    x: 50000,
    y: 22000,
    r: 3500,
    capture: 120,
    first: 1800,
    cooldown: 1350,
    endAt: 8100,
    potPerSecond: 4,
    potCap: 360,
    xp: 60,
    buffTicks: 1350,
    minionStructBp: 12500,
  },
});
