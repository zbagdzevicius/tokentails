/**
 * The sim-only numbers the wait slides quote, copied. Their source modules (data/fish.ts, towers.ts, pickups.ts,
 * camps.ts, pudding.ts) ship inside the sim chunk (~90 KB gzip): importing them would load the whole sim with the first
 * queue card. tests/unit/wait-slides.test.ts checks every value here equals its source, so a tuning change fails the
 * test until this copy (and the slide) follows.
 */
export const PINNED = Object.freeze({
  // data/fish.ts FISH
  fish: Object.freeze({ lastHitBp: 8000, nearBp: 3000, minion: Object.freeze([36, 27, 75]), firstBlood: 50, pudding: 75, shutdownPerStreak: 60, shutdownMax: 400, snack: 40, tower: 100 }),
  // data/towers.ts TOWERS (fortifyUntil: Crossing and the pool maps share index 0's value)
  towers: Object.freeze({ lockOnTicks: 30, rampBp: 3000, rampCapBp: 9000, backdoorBp: 5000, backdoorRange: 8000, teamXp: 120, fortifyUntil: Object.freeze([7200]) }),
  // data/pickups.ts PICKUPS
  pickups: Object.freeze({
    frenzy: Object.freeze({ first: 1350, every: 900, dmgBp: 2500, speedBp: 2000, ticks: 240 }),
    snack: Object.freeze({ first: 900, every: 900, healBp: 3500 }),
  }),
  // data/camps.ts RAT_CAMP_STATS
  rats: Object.freeze({ packDmgBp: 1500, packTicks: 1350 }),
  // data/pudding.ts CROSSING_PUDDING
  pudding: Object.freeze({ hopEvery: 120, hopRadius: 4000 }),
});
