/**
 * Sim v34 (docs/plans/moba/MAPS-3V3.md §4): Twinbark Thicket, after the genre idea of a two-lane map with two capture
 * points and a den boss (reworked; no other game's names or geometry). Two lanes hug the edges; between them a
 * figure-eight wood with a Paw Shrine on each team's half and Pudding's Den at top centre, reached through one mouth a
 * side. Owning a shrine gives Swift Paws (+10% move speed); owning both, Twin Blessing (+15% damage to structures).
 */
import { CAMP_KIND } from '../camps';
import { OBJ_BASE, poolMap } from './pool';

export const THICKET = poolMap({
  id: 'thicket',
  name: 'Twinbark Thicket',
  blurb: 'Two Paw Shrines. Hold one to run faster, both to hit towers harder.',
  lanes: ['sunny', 'puddle'],
  laneNames: ['Bramble Lane', 'Brook Lane'],
  waypoints: {
    sunny: [
      [10000, 30000],
      [14000, 44000],
      [22000, 52000],
      [50000, 53000],
    ],
    puddle: [
      [10000, 30000],
      [14000, 16000],
      [22000, 8000],
      [50000, 7000],
    ],
  },
  towers: [
    { lane: 'sunny', tier: 'outer', x: 36000, y: 52500 },
    { lane: 'sunny', tier: 'inner', x: 21000, y: 51000 },
    { lane: 'puddle', tier: 'outer', x: 36000, y: 7500 },
    { lane: 'puddle', tier: 'inner', x: 21000, y: 9000 },
  ],
  minions: 40,
  camps: [
    [CAMP_KIND.beetle, 24000, 41000],
    [CAMP_KIND.toad, 24000, 19000],
  ],
  campMonsters: 4,
  bushes: [
    { x: 35500, y: 37000, w: 3000, h: 3000 },
    { x: 35500, y: 23000, w: 3000, h: 3000 },
    { x: 42000, y: 30000, w: 3000, h: 3000 },
    { x: 42000, y: 51000, w: 3000, h: 3000 },
    { x: 42000, y: 9000, w: 3000, h: 3000 },
  ],
  walls: [[31000, 28500, 32000, 31500]],
  clearings: [
    [34000, 30000, 5000],
    [24000, 41000, 4000],
    [24000, 19000, 4000],
    [50000, 30000, 5000],
    [50000, 40500, 4500],
  ],
  corridors: [
    [14000, 30000, 26000, 30000, 3000],
    [34000, 30000, 50000, 30000, 3000],
    [24000, 30000, 24000, 41000, 2500],
    [24000, 41000, 18000, 47000, 2500],
    [24000, 30000, 24000, 19000, 2500],
    [24000, 19000, 18000, 13000, 2500],
    [34000, 30000, 38000, 47000, 2500],
    [34000, 30000, 38000, 13000, 2500],
    [42000, 35000, 47000, 39500, 2500],
  ],
  pudding: { x: 50000, y: 40500 },
  objective: {
    ...OBJ_BASE,
    kind: 'shrines',
    x: 34000,
    y: 30000,
    r: 2500,
    capture: 90,
    first: 2700,
    cooldown: 1800,
    fish: 40,
    xp: 40,
    speedBp: 1000,
    minionStructBp: 11500,
    heroStructBp: 11500,
  },
});
